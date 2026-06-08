package main

import (
	"backend/config"
	"backend/controllers"
	"backend/models"
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/remotecommand"
)

// ref for Kubernetes client for routes
var clientset *kubernetes.Clientset
var k8sConfig *rest.Config

type DeployPodRequest struct {
	PodName string `json:"pod_name" binding:"required"`
	Image   string `json:"image" binding:"required"`
}

type PodTableEntry struct {
	Name       string `json:"name"`
	Namespace  string `json:"namespace"`
	Status     string `json:"status"`
	Image      string `json:"image"`
	Ageseconds int    `json:"age_seconds"`
}

type RestartRequest struct {
	Namespace string `json:"namespace" binding:"required"`
	PodName   string `json:"pod_name" binding:"required"`
}

type ConfigResource struct {
	Type      string            `json:"type"` // "configmap" or "secret"
	Name      string            `json:"name"`
	Namespace string            `json:"namespace"`
	Data      map[string]string `json:"data"`
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type wsStreamHandler struct {
	wsConn *websocket.Conn
}

var (
	notificationClients = make(map[*websocket.Conn]bool)
	notificationMutex   sync.Mutex
)

func (w *wsStreamHandler) Read(p []byte) (n int, err error) {
	_, msg, err := w.wsConn.ReadMessage()
	if err != nil {
		return 0, err
	}
	copy(p, msg)
	return len(msg), nil
}

func (w *wsStreamHandler) Write(p []byte) (n int, err error) {
	err = w.wsConn.WriteMessage(websocket.BinaryMessage, p)
	if err != nil {
		return 0, err
	}
	return len(p), nil
}

func main() {
	// initialize Database
	config.ConnectDatabase()

	var err error
	kubeconfig := filepath.Join(homeDir(), ".kube", "config")
	k8sConfig, err = clientcmd.BuildConfigFromFlags("", kubeconfig)
	if err != nil {
		panic(fmt.Sprintf("Failed to load kubeconfig: %v", err))
	}

	clientset, err = kubernetes.NewForConfig(k8sConfig)
	if err != nil {
		panic(fmt.Sprintf("Failed to create K8s client: %v", err))
	}

	fmt.Println("Scanning Kubernetes for cluster pods...")
	watchPods()
	fmt.Println("Scanning Kubernetes...")
	go watchEventsInBackground()

	// setup Gin Router
	r := gin.Default()

	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// define Routes
	api := r.Group("/api")
	{
		api.POST("/logs", controllers.CreateLog)
		api.GET("/logs", controllers.GetLogs)
		api.GET("/logs/overview", controllers.GetOverviewLogs)
		api.GET("/cluster/summary", getClusterSummary)
		api.POST("/cluster/deploy", deployNewPod)
		api.GET("/cluster/pods", getClusterPods)
		api.DELETE("/cluster/pods", deleteClusterPod)
		api.GET("/cluster/ssh", handlePodSSH)
		api.GET("/cluster/logs/stream", handlePodLogStream)
		api.GET("/cluster/notifications", handleNotificationStream)
		api.POST("/cluster/restart", handleRestartDeployment)
		api.GET("/cluster/config", handleGetConfigurations)
		api.POST("/cluster/config/update", handleUpdateConfiguration)
	}

	// start Server on port 8080
	r.Run(":8080")
}

func watchPods() {
	pods, err := clientset.CoreV1().Pods("").List(context.TODO(), metav1.ListOptions{})
	if err != nil {
		panic(err.Error())
	}

	fmt.Printf("Found %d pods:\n", len(pods.Items))
	for _, pod := range pods.Items {
		fmt.Printf("- [%s] %s\n", pod.Namespace, pod.Name)
	}
}

func watchEventsInBackground() {

	fmt.Println("Real-time Kubernetes event stream is now LIVE!")

	// continuous stream watching all events
	watcher, err := clientset.CoreV1().Events("").Watch(context.TODO(), metav1.ListOptions{})
	if err != nil {
		log.Printf("Failed to watch events: %v\n", err)
		return
	}
	defer watcher.Stop()

	// read events from the Kubernetes channel as they happen
	for item := range watcher.ResultChan() {
		event, ok := item.Object.(*corev1.Event)
		if !ok {
			continue
		}

		// map the raw Kubernetes event into GORM model
		logEntry := models.ClusterLog{
			PodName:   event.InvolvedObject.Name,
			Namespace: event.InvolvedObject.Namespace,
			Message:   event.Message,
			Level:     event.Type, // Normal or Warning
			CreatedAt: time.Now(),
		}

		// entry in PostgreSQL database
		if err := config.DB.Create(&logEntry).Error; err != nil {
			log.Printf("Failed to save event to DB: %v\n", err)
		} else {
			fmt.Printf("Saved K8s Event: [%s] %s Namespace: %s\n", logEntry.Level, logEntry.Message, logEntry.Namespace)

			// give cluster events across the WebSocket connections

			messageText := logEntry.Message
			isWarningType := logEntry.Level == "Warning"
			hasErrorKeyword := containsErrorKeyword(messageText)

			// Warning or Normal event signaling a clear failure
			if isWarningType || hasErrorKeyword {
				notificationMutex.Lock()

				log.Printf("Broadcasting event! Current active clients in connection pool: %d", len(notificationClients))

				for client := range notificationClients {
					if hasErrorKeyword {
						logEntry.Level = "Warning"
					}
					err := client.WriteJSON(logEntry)
					if err != nil {
						log.Printf("Client disconnected or broke during write: %v", err)
						client.Close()
						delete(notificationClients, client)
					} else {
						log.Printf("Successfully sent JSON packet payload over the socket pipe to browser!")
					}
				}
				notificationMutex.Unlock()
			}
		}
	}
}

func getClusterSummary(c *gin.Context) {
	if clientset == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Kubernetes client uninitialized"})
		return
	}

	//read namespace target
	nsFilter := c.Query("namespace")
	if nsFilter == "all" || nsFilter == "*" || nsFilter == "" {
		nsFilter = ""
	}

	// pod length count for filtered namespace
	pods, err := clientset.CoreV1().Pods(nsFilter).List(context.TODO(), metav1.ListOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// active nodes count
	nodes, err := clientset.CoreV1().Nodes().List(context.TODO(), metav1.ListOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	// cluster health based on pod States
	clusterStatus := "Healthy"
	for _, pod := range pods.Items {

		// skip completed pods
		if pod.Status.Phase == corev1.PodSucceeded {
			continue
		}

		// pod in failed phase -> degrade the cluster
		if pod.Status.Phase == corev1.PodFailed {
			clusterStatus = "Degraded"
			break
		}

		// check container statuses
		for _, containerStatus := range pod.Status.ContainerStatuses {
			if containerStatus.State.Waiting != nil {
				reason := containerStatus.State.Waiting.Reason
				if reason == "CrashLoopBackOff" || reason == "ImagePullBackOff" || reason == "ErrImagePull" {
					clusterStatus = "Degraded"
					break
				}
			}
		}

		if clusterStatus == "Degraded" {
			break
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"podsCount":     len(pods.Items),
		"nodesTotal":    len(nodes.Items),
		"clusterStatus": clusterStatus,
	})
}

func deployNewPod(c *gin.Context) {
	if clientset == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Kubernetes client uninitialized"})
		return
	}

	var req DeployPodRequest
	// parse incoming payload from frontend
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input variables"})
		return
	}

	// manifest engine definitions for client-go
	podManifest := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      req.PodName,
			Namespace: "default",
			Labels: map[string]string{
				"deployed-by": "kubedash-engine",
			},
		},
		Spec: corev1.PodSpec{
			Containers: []corev1.Container{
				{
					Name:            req.PodName + "-container",
					Image:           req.Image,
					ImagePullPolicy: corev1.PullIfNotPresent,
				},
			},
		},
	}

	// exec payload delivery to active cluster context
	_, err := clientset.CoreV1().Pods("default").Create(context.TODO(), podManifest, metav1.CreateOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Pod specification deployed successfully!",
	})
}

func getClusterPods(c *gin.Context) {
	if clientset == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Kubernetes client uninitialized"})
		return
	}

	//read namespace target
	nsFilter := c.Query("namespace")
	if nsFilter == "all" || nsFilter == "*" || nsFilter == "" {
		nsFilter = ""
	}

	// get pod
	pods, err := clientset.CoreV1().Pods(nsFilter).List(context.TODO(), metav1.ListOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	var podList []PodTableEntry
	for _, pod := range pods.Items {
		var image string = "unknown"
		if len(pod.Status.ContainerStatuses) > 0 {
			image = pod.Status.ContainerStatuses[0].Image
		}
		podList = append(podList,
			PodTableEntry{
				Name:       pod.Name,
				Namespace:  pod.Namespace,
				Status:     string(pod.Status.Phase),
				Image:      image,
				Ageseconds: int(time.Since(pod.CreationTimestamp.Time).Seconds()),
			})
	}
	c.JSON(http.StatusOK, gin.H{
		"pods": podList,
	})
}

func deleteClusterPod(c *gin.Context) {
	if clientset == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Kubernetes client uninitialized"})
		return
	}

	namespace := c.Query("namespace")
	podName := c.Query("name")

	if namespace == "" || podName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing namespace or name parameters"})
		return
	}

	// trigger cluster termination command
	gracePeriod := int64(10)
	err := clientset.CoreV1().Pods(namespace).Delete(context.TODO(), podName, metav1.DeleteOptions{
		GracePeriodSeconds: &gracePeriod,
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Pod termination sequence executed cleanly"})
}

func handlePodSSH(c *gin.Context) {
	namespace := c.Query("namespace")
	podName := c.Query("name")

	if namespace == "" || podName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing namespace or name details"})
		return
	}

	// upgrade HTTP request context to WebSocket connection
	ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("Failed to upgrade socket connection: %v", err)
		return
	}
	defer ws.Close()

	// native remote execution pipeline command (default to /bin/sh shell)
	req := clientset.CoreV1().RESTClient().Post().
		Resource("pods").
		Name(podName).
		Namespace(namespace).
		SubResource("exec").
		Param("stdin", "true").
		Param("stdout", "true").
		Param("stderr", "true").
		Param("tty", "true").
		Param("command", "/bin/sh")

	executor, err := remotecommand.NewSPDYExecutor(k8sConfig, "POST", req.URL())
	if err != nil {
		ws.WriteMessage(websocket.TextMessage, []byte("\r\nExecution system failure: "+err.Error()))
		return
	}

	// map WebSocket streams directly to the interactive container session
	handler := &wsStreamHandler{wsConn: ws}

	err = executor.StreamWithContext(c.Request.Context(), remotecommand.StreamOptions{
		Stdin:  handler,
		Stdout: handler,
		Stderr: handler,
		Tty:    true,
	})

	if err != nil {
		ws.WriteMessage(websocket.TextMessage, []byte("\r\nSession closed or terminated: "+err.Error()))
	}
}

func handlePodLogStream(c *gin.Context) {
	namespace := c.Query("namespace")
	podName := c.Query("name")

	if namespace == "" || podName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing namespace or name details"})
		return
	}

	// upgrade HTTP request context to WebSocket connection
	ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("Failed to upgrade log socket connection: %v", err)
		return
	}
	defer ws.Close()

	// tail -f log optioms
	lineLimit := int64(100) // last 100 from history
	logOptions := &corev1.PodLogOptions{
		Follow:     true, // keep it open
		TailLines:  &lineLimit,
		Timestamps: false,
	}

	// request the stream
	req := clientset.CoreV1().Pods(namespace).GetLogs(podName, logOptions)
	stream, err := req.Stream(c.Request.Context())
	if err != nil {
		ws.WriteMessage(websocket.TextMessage, []byte("Failed to open log stream: "+err.Error()))
		return
	}
	defer stream.Close()

	// read chunks from stream and push to WebSocker
	buf := make([]byte, 4096)
	for {
		numBytes, err := stream.Read(buf)
		if numBytes > 0 {
			err = ws.WriteMessage(websocket.TextMessage, buf[:numBytes])
			if err != nil {
				// client closed the tab or disconnected
				break
			}
		}
		if err != nil {
			break
		}
	}

}

func handleNotificationStream(c *gin.Context) {
	ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("Notification socket upgrade failed: %v", err)
		return
	}

	// add client session with Mutex protections
	notificationMutex.Lock()
	notificationClients[ws] = true
	notificationMutex.Unlock()

	// clean mapping context if connection faisl
	defer func() {
		notificationMutex.Lock()
		delete(notificationClients, ws)
		notificationMutex.Unlock()
		ws.Close()
		log.Println("Notification client connection cleaned up cleanly.")
	}()

	// infinite reading loop to detect disconnect events
	for {
		if _, _, err := ws.ReadMessage(); err != nil {
			break
		}
	}
}

func handleRestartDeployment(c *gin.Context) {
	if clientset == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Kubernetes client uninitialized"})
		return
	}

	var req RestartRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing namespace or pod_name parameters"})
		return
	}

	// fetch the target live Pod
	pod, err := clientset.CoreV1().Pods(req.Namespace).Get(context.TODO(), req.PodName, metav1.GetOptions{})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Pod not found: " + err.Error()})
		return
	}

	// check for a managing ReplicaSet
	var replicaSetName string
	for _, ref := range pod.OwnerReferences {
		if ref.Kind == "ReplicaSet" {
			replicaSetName = ref.Name
			break
		}
	}

	// deployment managed struct
	if replicaSetName != "" {
		replicaSet, err := clientset.AppsV1().ReplicaSets(req.Namespace).Get(context.TODO(), replicaSetName, metav1.GetOptions{})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to map pod ancestry: " + err.Error()})
			return
		}

		var deploymentName string
		for _, ref := range replicaSet.OwnerReferences {
			if ref.Kind == "Deployment" {
				deploymentName = ref.Name
				break
			}
		}

		if deploymentName != "" {
			// rolling update annotation patch
			timestamp := time.Now().Format(time.RFC3339)
			patchData := fmt.Sprintf(
				`{"spec":{"template":{"metadata":{"annotations":{"kubectl.kubernetes.io/restartedAt":"%s"}}}}}`,
				timestamp,
			)

			_, err = clientset.AppsV1().Deployments(req.Namespace).Patch(
				context.TODO(),
				deploymentName,
				"application/strategic-merge-patch+json",
				[]byte(patchData),
				metav1.PatchOptions{},
			)

			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Deployment rollout patch failed: " + err.Error()})
				return
			}

			c.JSON(http.StatusOK, gin.H{
				"message": fmt.Sprintf("Rolling restart successfully dispatched for deployment: %s", deploymentName),
			})
			return
		}
	}

	log.Printf("[RESTART FALLBACK] Raw naked pod detected: %s. Re-spinning container instance...", req.PodName)

	// if it's a standalone pod lifecycle
	// make an isolated clean manifest from the old pod spec config
	nakedPodManifest := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:        pod.Name,
			Namespace:   pod.Namespace,
			Labels:      pod.Labels,
			Annotations: pod.Annotations,
		},
		Spec: pod.Spec,
	}
	// clear dynamic cluster runtime state specifications
	nakedPodManifest.ResourceVersion = ""
	nakedPodManifest.UID = ""
	nakedPodManifest.CreationTimestamp = metav1.Time{}

	// delete transaction with a short grace duration
	gracePeriod := int64(2)
	err = clientset.CoreV1().Pods(req.Namespace).Delete(context.TODO(), req.PodName, metav1.DeleteOptions{
		GracePeriodSeconds: &gracePeriod,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed terminating old standalone instance: " + err.Error()})
		return
	}

	// wait a moment for the namespace thread lock to drop old instance configurations
	time.Sleep(1200 * time.Millisecond)

	// identical copy
	_, err = clientset.CoreV1().Pods(req.Namespace).Create(context.TODO(), nakedPodManifest, metav1.CreateOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed re-bootstrapping standalone clone pod: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": fmt.Sprintf("Standalone pod instance '%s' cycled and recreated successfully.", req.PodName),
	})
}

// list all ConfigMaps and Secrets inside a namespace
func handleGetConfigurations(c *gin.Context) {
	if clientset == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Kubernetes client uninitialized"})
		return
	}

	namespace := c.DefaultQuery("namespace", "default")
	if namespace == "all" || namespace == "*" || namespace == "" {
		namespace = ""
	}
	var resources []ConfigResource

	// fetch ConfigMaps
	cms, err := clientset.CoreV1().ConfigMaps(namespace).List(context.TODO(), metav1.ListOptions{})
	if err == nil {
		for _, cm := range cms.Items {
			// ignore system generated internal configuration resources
			if cm.Name == "kube-root-ca.crt" {
				continue
			}

			resources = append(resources, ConfigResource{
				Type:      "configmap",
				Name:      cm.Name,
				Namespace: cm.Namespace,
				Data:      cm.Data,
			})
		}
	}

	// fetch secrets
	secs, err := clientset.CoreV1().Secrets(namespace).List(context.TODO(), metav1.ListOptions{})
	if err == nil {
		for _, sec := range secs.Items {
			if sec.Type == corev1.SecretTypeServiceAccountToken || sec.Type == corev1.SecretTypeBootstrapToken {
				continue
			}

			// translate byte arrays in text strings
			decodedData := make(map[string]string)
			for k, v := range sec.Data {
				decodedData[k] = string(v)
			}

			resources = append(resources, ConfigResource{
				Type:      "secret",
				Name:      sec.Name,
				Namespace: sec.Namespace,
				Data:      decodedData,
			})
		}
	}

	c.JSON(http.StatusOK, resources)
}

// save modified configuration to the cluster context
func handleUpdateConfiguration(c *gin.Context) {
	if clientset == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Kubernetes client uninitialized"})
		return
	}

	var req ConfigResource
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload schema: " + err.Error()})
		return
	}

	switch req.Type {
	case "configmap":
		// fetch original item
		cm, err := clientset.CoreV1().ConfigMaps(req.Namespace).Get(context.TODO(), req.Name, metav1.GetOptions{})
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "ConfigMap not found: " + err.Error()})
			return
		}
		cm.Data = req.Data
		_, err = clientset.CoreV1().ConfigMaps(req.Namespace).Update(context.TODO(), cm, metav1.UpdateOptions{})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	case "secret":
		sec, err := clientset.CoreV1().Secrets(req.Namespace).Get(context.TODO(), req.Name, metav1.GetOptions{})
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Secret not found: " + err.Error()})
			return
		}

		// eeencode plain text back into binary
		encodedData := make(map[string][]byte)
		for k, v := range req.Data {
			encodedData[k] = []byte(v)
		}
		sec.Data = encodedData

		_, err = clientset.CoreV1().Secrets(req.Namespace).Update(context.TODO(), sec, metav1.UpdateOptions{})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Unsupported resource engine type"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Configuration object securely synchronized with cluster state"})
}

func homeDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		panic("could not determine home directory")
	}
	return home
}

func containsErrorKeyword(msg string) bool {
	base := []string{"fail", "backoff", "error", "failed", "err"}
	for _, word := range base {
		if byteContainsIgnoreCase(msg, word) {
			return true
		}
	}
	return false
}

func byteContainsIgnoreCase(s, substr string) bool {
	// lowercase evaluation
	lenSub := len(substr)
	if lenSub == 0 {
		return true
	}
	if len(s) < lenSub {
		return false
	}
	// text search fallback loop
	for i := 0; i <= len(s)-lenSub; i++ {
		match := true
		for j := 0; j < lenSub; j++ {
			c1 := s[i+j]
			c2 := substr[j]
			if c1 >= 'A' && c1 <= 'Z' {
				c1 += 32
			}
			if c2 >= 'A' && c2 <= 'Z' {
				c2 += 32
			}
			if c1 != c2 {
				match = false
				break
			}
		}
		if match {
			return true
		}
	}
	return false
}
