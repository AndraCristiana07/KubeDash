package main

import (
	"backend/config"
	"backend/controllers"
	"backend/models"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/util/yaml"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/discovery/cached/memory"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/restmapper"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/remotecommand"
)

// ref for Kubernetes client for routes
var clientset *kubernetes.Clientset

// var metricsClientset *metricsv.Clientset
var k8sConfig *rest.Config

var dynamicClient dynamic.Interface
var discoveryClient discovery.DiscoveryInterface

type ApplyManifestPayload struct {
	YamlString string `json:"yaml_string" binding:"required"`
	Namespace  string `json:"namespace"` // fallback target namespace scope
}
type EnvMapping struct {
	SourceKey string `json:"source_key"` // key inside ConfigMap/Secret
	EnvKey    string `json:"env_key"`    // name inside pod container
}

type DeployPodRequest struct {
	PodName    string       `json:"pod_name"`
	Image      string       `json:"image"`
	Namespace  string       `json:"namespace"`
	ConfigType string       `json:"config_type"`
	ConfigName string       `json:"config_name"`
	Mappings   []EnvMapping `json:"mappings"`
}

type PodTableEntry struct {
	Name          string   `json:"name"`
	Namespace     string   `json:"namespace"`
	Status        string   `json:"status"`
	Message       string   `json:"message"`
	Image         string   `json:"image"`
	Ageseconds    int      `json:"age_seconds"`
	LinkedConfigs []string `json:"linked_configs"`
	RestartCount  int32    `json:"restart_count"`
	LastTermState string   `json:"last_term_state"`
}

type PodResourceMetrics struct {
	PodName   string `json:"pod_name"`
	Namespace string `json:"namespace"`
	CPUUsage  int64  `json:"cpu_usage"`
	MemUsage  int64  `json:"mem_usage"`
	GPUUsage  int64  `json:"gpu_usage"`
	Type      string `json:"type"`
}

type RawK8sMetricsList struct {
	Items []struct {
		Metadata struct {
			Name      string `json:"name"`
			Namespace string `json:"namespace"`
		} `json:"metadata"`
		Containers []struct {
			Name  string `json:"name"`
			Usage struct {
				CPU    string `json:"cpu"`
				Memory string `json:"memory"`
			} `json:"usage"`
		} `json:"containers"`
	} `json:"items"`
}

type AddConfigToPodRequest struct {
	PodName    string       `json:"pod_name"`
	Namespace  string       `json:"namespace"`
	ConfigType string       `json:"config_type"`
	ConfigName string       `json:"config_name"`
	Mappings   []EnvMapping `json:"mappings"`
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
	BoundPods []string          `json:"bound_pods"`
}

type DeleteConfigRequest struct {
	ConfigName string `json:"config_name" binding:"required"`
	ConfigType string `json:"config_type" binding:"required"`
	Namespace  string `json:"namespace"`
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
	var err error
	k8sConfig, err = rest.InClusterConfig()
	if err != nil {
		fmt.Println("Not running inside cluster, looking for local kubeconfig...")
		kubeconfig := filepath.Join(homeDir(), ".kube", "config")
		k8sConfig, err = clientcmd.BuildConfigFromFlags("", kubeconfig)
		if err != nil {
			panic(fmt.Sprintf("Failed to load kubeconfig from home directory: %v", err))
		}
	} else {
		fmt.Println("Successfully loaded In-Cluster Kubernetes configuration!")
	}

	clientset, err = kubernetes.NewForConfig(k8sConfig)
	if err != nil {
		panic(fmt.Sprintf("Failed to create K8s client: %v", err))
	}

	config.K8sConfig = k8sConfig
	config.Clientset = clientset

	config.ConnectDatabase()

	dynamicClient, _ = dynamic.NewForConfig(k8sConfig)
	discoveryClient, _ = discovery.NewDiscoveryClientForConfig(k8sConfig)

	fmt.Println("Scanning Kubernetes for cluster pods...")
	watchPods()
	fmt.Println("Scanning Kubernetes...")
	go watchEventsInBackground()
	go broadcastMetricsInBackground()

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
		api.POST("/cluster/config/create", handleCreateConfiguration)
		api.POST("/cluster/pods/update-config", addConfigToExistingPod)
		api.DELETE("/cluster/config/delete", deleteConfigBlock)
		api.POST("/cluster/manifests/apply", applyClusterManifest)
	}

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

		// prevent nil pointer dereference on boot
		if config.DB == nil {
			fmt.Printf("[INITIALIZING] Cached K8s Event (DB connecting...): [%s] %s Namespace: %s\n", logEntry.Level, logEntry.Message, logEntry.Namespace)

			broadcastToWebSockets(logEntry)
			continue
		}

		// entry in PostgreSQL database
		if err := config.DB.Create(&logEntry).Error; err != nil {
			log.Printf("Failed to save event to DB: %v\n", err)
		} else {
			fmt.Printf("Saved K8s Event: [%s] %s Namespace: %s\n", logEntry.Level, logEntry.Message, logEntry.Namespace)

			// give cluster events across the WebSocket connections
			broadcastToWebSockets(logEntry)
		}
	}
}

func broadcastToWebSockets(logEntry models.ClusterLog) {
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
	// if empty -> default
	if req.Namespace == "" || req.Namespace == "all" {
		req.Namespace = "default"
	}

	// base structural container
	container := corev1.Container{
		Name:  "app-container",
		Image: req.Image,
	}

	if req.ConfigName != "" && len(req.Mappings) > 0 {
		for _, mapping := range req.Mappings {
			if mapping.SourceKey == "" || mapping.EnvKey == "" {
				continue
			}

			envVar := corev1.EnvVar{
				Name: mapping.EnvKey,
			}

			switch req.ConfigType {
			case "secret":
				envVar.ValueFrom = &corev1.EnvVarSource{
					SecretKeyRef: &corev1.SecretKeySelector{
						LocalObjectReference: corev1.LocalObjectReference{Name: req.ConfigName},
						Key:                  mapping.SourceKey, // target source key
					},
				}
			case "configmap":
				envVar.ValueFrom = &corev1.EnvVarSource{
					ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
						LocalObjectReference: corev1.LocalObjectReference{Name: req.ConfigName},
						Key:                  mapping.SourceKey,
					},
				}
			}

			container.Env = append(container.Env, envVar)
		}
	}
	// manifest engine definitions for client-go
	podManifest := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      req.PodName,
			Namespace: req.Namespace,
			Labels: map[string]string{
				"deployed-by": "kubedash-engine",
			},
		},
		Spec: corev1.PodSpec{
			Containers: []corev1.Container{container},
		},
	}

	// exec payload delivery to active cluster context
	_, err := clientset.CoreV1().Pods(req.Namespace).Create(context.TODO(), podManifest, metav1.CreateOptions{})
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
		var deepMessage string = ""
		var restartCount int32 = 0
		var lastTermState string = ""

		if len(pod.Status.ContainerStatuses) > 0 {
			containerStatus := pod.Status.ContainerStatuses[0]
			image = containerStatus.Image
			restartCount = containerStatus.RestartCount

			if containerStatus.LastTerminationState.Terminated != nil {
				reason := containerStatus.LastTerminationState.Terminated.Reason
				// only capture the termination reason if it's an actual bad state
				if reason != "Completed" && reason != "Terminated" && reason != "" {
					lastTermState = reason
				}
			}

			if containerStatus.State.Waiting != nil {
				deepMessage = containerStatus.State.Waiting.Reason
				if containerStatus.State.Waiting.Message != "" {
					deepMessage = containerStatus.State.Waiting.Reason + ": " + containerStatus.State.Waiting.Message
				}
			} else if containerStatus.State.Terminated != nil {
				deepMessage = containerStatus.State.Terminated.Reason
			}
		}

		var linkedConfigs []string
		seenConfigs := make(map[string]bool)

		// loop over containers
		for _, container := range pod.Spec.Containers {
			for _, env := range container.Env {
				if env.ValueFrom != nil {
					// check for Secret
					if env.ValueFrom.SecretKeyRef != nil {
						cfgName := "secret:" + env.ValueFrom.SecretKeyRef.Name
						if !seenConfigs[cfgName] {
							seenConfigs[cfgName] = true
							linkedConfigs = append(linkedConfigs, cfgName)
						}
					}
					// check for ConfigMap
					if env.ValueFrom.ConfigMapKeyRef != nil {
						cfgName := "cm:" + env.ValueFrom.ConfigMapKeyRef.Name
						if !seenConfigs[cfgName] {
							seenConfigs[cfgName] = true
							linkedConfigs = append(linkedConfigs, cfgName)
						}
					}
				}
			}
		}

		podList = append(podList,
			PodTableEntry{
				Name:          pod.Name,
				Namespace:     pod.Namespace,
				Status:        string(pod.Status.Phase),
				Message:       deepMessage,
				Image:         image,
				Ageseconds:    int(time.Since(pod.CreationTimestamp.Time).Seconds()),
				LinkedConfigs: linkedConfigs,
				RestartCount:  restartCount,
				LastTermState: lastTermState,
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
	// actively poll the cluster until the pod is dead
	maxRetries := 30
	podDeleted := false
	for i := 0; i < maxRetries; i++ {
		_, err := clientset.CoreV1().Pods(req.Namespace).Get(context.TODO(), req.PodName, metav1.GetOptions{})
		if err != nil {
			// if API server returns "NotFound" error -> the namespace completely dropped the pod
			if errors.IsNotFound(err) {
				podDeleted = true
				break
			}
			// other networking error should break out early to avoid infinite loops
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Error verifying state depletion: " + err.Error()})
			return
		}

		// wait 250ms before checking again
		time.Sleep(250 * time.Millisecond)
	}

	if !podDeleted {
		c.JSON(http.StatusConflict, gin.H{
			"error": fmt.Sprintf("Timeout waiting for old pod '%s' to clear its termination routine. Try again in a moment.", req.PodName),
		})
		return
	}

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
				BoundPods: getBoundPods(cm.Namespace, cm.Name, "configmap"),
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
				BoundPods: getBoundPods(sec.Namespace, sec.Name, "secret"),
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

// create new ConfigMaps and Secrets
func handleCreateConfiguration(c *gin.Context) {
	if clientset == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Kubernetes client uninitialized"})
		return
	}

	var req ConfigResource
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload: " + err.Error()})
		return
	}

	if req.Name == "" || req.Namespace == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Name and Namespace scopes are required properties"})
		return
	}

	// fallback context validation logic
	req.Namespace = strings.TrimSpace(strings.ToLower(req.Namespace))
	if req.Namespace == "" || req.Namespace == "all" {
		req.Namespace = "default"
	}
	switch req.Type {
	case "configmap":
		newCm := &corev1.ConfigMap{
			ObjectMeta: metav1.ObjectMeta{
				Name:      req.Name,
				Namespace: req.Namespace,
			},
			Data: req.Data,
		}
		if newCm.Data == nil {
			newCm.Data = make(map[string]string)
		}

		_, err := clientset.CoreV1().ConfigMaps(req.Namespace).Create(context.TODO(), newCm, metav1.CreateOptions{})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	case "secret":
		newSec := &corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{
				Name:      req.Name,
				Namespace: req.Namespace,
			},
			Type: corev1.SecretTypeOpaque, // key-value secret type
			Data: make(map[string][]byte),
		}

		// loop and convert plain-text fields into standard byte streams
		for k, v := range req.Data {
			newSec.Data[k] = []byte(v)
		}

		_, err := clientset.CoreV1().Secrets(req.Namespace).Create(context.TODO(), newSec, metav1.CreateOptions{})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Unsupported configuration type"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "Resource block successfully provisioned inside cluster"})
}

func addConfigToExistingPod(c *gin.Context) {
	if clientset == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Kubernetes client uninitialized"})
		return
	}

	var req AddConfigToPodRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload format"})
		return
	}

	if req.Namespace == "" {
		req.Namespace = "default"
	}

	// fetch the live pod from the cluster
	livePod, err := clientset.CoreV1().Pods(req.Namespace).Get(context.TODO(), req.PodName, metav1.GetOptions{})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Target pod not found: " + err.Error()})
		return
	}

	if len(livePod.Spec.Containers) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Target pod has no containers"})
		return
	}

	incomingKeys := make(map[string]bool)
	for _, mapping := range req.Mappings {
		if mapping.EnvKey != "" {
			incomingKeys[mapping.EnvKey] = true
		}
	}

	// build slice for Env vars, filtering out old matching keys
	var cleanEnv []corev1.EnvVar
	for _, existingVar := range livePod.Spec.Containers[0].Env {
		// if the existing variable name matches a new one coming in, skip it
		if !incomingKeys[existingVar.Name] {
			cleanEnv = append(cleanEnv, existingVar)
		}
	}

	// loop through new mappings and build EnvVar structs
	for _, mapping := range req.Mappings {
		if mapping.SourceKey == "" || mapping.EnvKey == "" {
			continue
		}

		envVar := corev1.EnvVar{Name: mapping.EnvKey}

		if req.ConfigType == "secret" {
			envVar.ValueFrom = &corev1.EnvVarSource{
				SecretKeyRef: &corev1.SecretKeySelector{
					LocalObjectReference: corev1.LocalObjectReference{Name: req.ConfigName},
					Key:                  mapping.SourceKey,
				},
			}
		} else {
			envVar.ValueFrom = &corev1.EnvVarSource{
				ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
					LocalObjectReference: corev1.LocalObjectReference{Name: req.ConfigName},
					Key:                  mapping.SourceKey,
				},
			}
		}
		// append the fresh configuration to our clean base slice
		cleanEnv = append(cleanEnv, envVar)
	}

	// rassign the completely clean, deduplicated array back to the container spec
	livePod.Spec.Containers[0].Env = cleanEnv

	newPodSpec := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      livePod.Name,
			Namespace: livePod.Namespace,
			Labels:    livePod.Labels,
		},
		Spec: livePod.Spec,
	}

	// remove the old pod instance
	gracePeriod := int64(0)
	err = clientset.CoreV1().Pods(req.Namespace).Delete(context.TODO(), req.PodName, metav1.DeleteOptions{GracePeriodSeconds: &gracePeriod})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed clearing original pod: " + err.Error()})
		return
	}
	// wait until pod deleted (6 seconds max)
	maxWaitAttempts := 30
	for i := 0; i < maxWaitAttempts; i++ {
		_, err := clientset.CoreV1().Pods(req.Namespace).Get(context.TODO(), req.PodName, metav1.GetOptions{})
		if err != nil {
			if errors.IsNotFound(err) {
				break
			}
		}
		time.Sleep(200 * time.Millisecond)
	}
	// new instance
	_, err = clientset.CoreV1().Pods(req.Namespace).Create(context.TODO(), newPodSpec, metav1.CreateOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed executing patched spec deploy: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Variables injected successfully, unique container iteration deployed."})
}

func deleteConfigBlock(c *gin.Context) {
	var req DeleteConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid deletion payload properties"})
		return
	}

	if req.Namespace == "" {
		req.Namespace = "default"
	}

	// ensure no running pods are currently depending on the config
	pods, err := clientset.CoreV1().Pods(req.Namespace).List(context.TODO(), metav1.ListOptions{})
	if err == nil {
		for _, pod := range pods.Items {
			for _, container := range pod.Spec.Containers {
				for _, env := range container.Env {
					if env.ValueFrom != nil {
						if req.ConfigType == "secret" && env.ValueFrom.SecretKeyRef != nil && env.ValueFrom.SecretKeyRef.Name == req.ConfigName {
							c.JSON(http.StatusConflict, gin.H{"error": fmt.Sprintf("Safety Block: Cannot drop! Resource currently map-mounted to live container inside pod: %s", pod.Name)})
							return
						}
						if req.ConfigType == "configmap" && env.ValueFrom.ConfigMapKeyRef != nil && env.ValueFrom.ConfigMapKeyRef.Name == req.ConfigName {
							c.JSON(http.StatusConflict, gin.H{"error": fmt.Sprintf("Safety Block: Cannot drop! Resource currently map-mounted to live container inside pod: %s", pod.Name)})
							return
						}
					}
				}
			}
		}
	}

	// safe to delete
	if req.ConfigType == "secret" {
		err = clientset.CoreV1().Secrets(req.Namespace).Delete(context.TODO(), req.ConfigName, metav1.DeleteOptions{})
	} else {
		err = clientset.CoreV1().ConfigMaps(req.Namespace).Delete(context.TODO(), req.ConfigName, metav1.DeleteOptions{})
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed deleting cluster asset: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": fmt.Sprintf("Resource block '%s' cleared out cleanly from cluster topology.", req.ConfigName)})
}

func broadcastMetricsInBackground() {
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()

	transport, err := rest.TransportFor(k8sConfig)
	if err != nil {
		log.Printf("⚠️ Failed to create metrics transport: %v\n", err)
		return
	}

	httpClient := &http.Client{
		Transport: transport,
		Timeout:   5 * time.Second,
	}

	// make target metrics URL string
	metricsURL := fmt.Sprintf("%s/apis/metrics.k8s.io/v1beta1/pods", strings.TrimSuffix(k8sConfig.Host, "/"))

	fmt.Println("Real-time infrastructure metrics engine is now LIVE!")

	for range ticker.C {
		notificationMutex.Lock()
		activeClients := len(notificationClients)
		notificationMutex.Unlock()

		if activeClients == 0 {
			continue
		}

		// query the metrics endpoint using http client
		resp, err := httpClient.Get(metricsURL)
		if err != nil {
			log.Printf("⚠️ Metrics Server Connection Failure: %v\n", err)
			continue
		}

		rawBytes, err := io.ReadAll(resp.Body)
		resp.Body.Close()

		if err != nil {
			log.Printf("⚠️ Failed to read metrics response body: %v\n", err)
			continue
		}

		if resp.StatusCode != http.StatusOK {
			log.Printf("⚠️ Metrics Server returned HTTP %d: %s\n", resp.StatusCode, string(rawBytes))
			continue
		}

		var metricsList RawK8sMetricsList
		if err := json.Unmarshal(rawBytes, &metricsList); err != nil {
			log.Printf("⚠️ JSON Parsing Failure: %v\n", err)
			continue
		}

		log.Printf("Processing telemetry fields for %d target cluster pods...\n", len(metricsList.Items))

		for _, item := range metricsList.Items {
			var totalCPU int64
			var totalMem int64

			for _, c := range item.Containers {
				cpuStr := c.Usage.CPU
				if len(cpuStr) > 0 {
					if strings.HasSuffix(cpuStr, "m") {
						var millicores int64
						fmt.Sscanf(cpuStr, "%dm", &millicores)
						totalCPU += millicores
					} else if strings.HasSuffix(cpuStr, "n") {
						var nanocores int64
						fmt.Sscanf(cpuStr, "%dn", &nanocores)
						if nanocores > 0 && nanocores < 1000000 {
							totalCPU += 1 // round up to 1
						} else {
							totalCPU += nanocores / 1000000
						}
					}
				}

				memStr := c.Usage.Memory
				if len(memStr) > 0 {
					var rawAmount int64
					fmt.Sscanf(memStr, "%d", &rawAmount)
					if strings.HasSuffix(memStr, "Ki") {
						totalMem += rawAmount / 1024
					} else if strings.HasSuffix(memStr, "Mi") {
						totalMem += rawAmount
					} else if strings.HasSuffix(memStr, "Gi") {
						totalMem += rawAmount * 1024
					} else {
						var rawCores int64
						if _, err := fmt.Sscanf(cpuStr, "%d", &rawCores); err == nil {
							totalCPU += rawCores * 1000 // cnvert full cores to millicores
						}
					}
				}
			}

			payload := PodResourceMetrics{
				PodName:   item.Metadata.Name,
				Namespace: item.Metadata.Namespace,
				CPUUsage:  totalCPU,
				MemUsage:  totalMem,
				GPUUsage:  0,
				Type:      "metrics_telemetry",
			}

			log.Printf("Streaming: Pod=%s CPU=%dm Mem=%dMB\n", payload.PodName, payload.CPUUsage, payload.MemUsage)

			envelope := map[string]interface{}{
				"type": "metrics_telemetry",
				"data": payload,
			}

			notificationMutex.Lock()
			for client := range notificationClients {
				err := client.WriteJSON(envelope)
				if err != nil {
					client.Close()
					delete(notificationClients, client)
				}
			}
			notificationMutex.Unlock()
		}
	}
}

func applyClusterManifest(c *gin.Context) {
	if dynamicClient == nil || discoveryClient == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Dynamic Kubernetes controller layer uninitialized"})
		return
	}

	var payload ApplyManifestPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body payload context string"})
		return
	}

	// multi-document decoder to loop over split segments if user drops an aggregated file containing "---"
	decoder := yaml.NewYAMLOrJSONDecoder(bytes.NewReader([]byte(payload.YamlString)), 4096)
	var processedObjects []string

	// memory-cached mapper layer to decode the GroupVersionKind strings (e.g. apps/v1, v1)
	mapper := restmapper.NewDeferredDiscoveryRESTMapper(memory.NewMemCacheClient(discoveryClient))

	for {
		var rawObj unstructured.Unstructured
		err := decoder.Decode(&rawObj)
		if err == io.EOF {
			break // all sub-documents fully read
		}
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Failed parsing structural integrity layout configuration formatting: " + err.Error()})
			return
		}

		// skip completely empty blocks
		if rawObj.Object == nil {
			continue
		}

		// map resource signature to find the target REST Endpoint mappings
		gvk := rawObj.GroupVersionKind()
		mapping, err := mapper.RESTMapping(gvk.GroupKind(), gvk.Version)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Unable to discover matching API route resource: " + err.Error()})
			return
		}

		// destination namespace bounds parameters
		var ns string
		if mapping.Scope.Name() == meta.RESTScopeNameNamespace {
			if rawObj.GetNamespace() != "" {
				ns = rawObj.GetNamespace()
			} else if payload.Namespace != "" {
				ns = payload.Namespace
			} else {
				ns = "default" // default safe boundary fallback
			}
		}

		// create a Resource Interface controller anchor
		var dr dynamic.ResourceInterface
		if ns != "" {
			dr = dynamicClient.Resource(mapping.Resource).Namespace(ns)
		} else {
			dr = dynamicClient.Resource(mapping.Resource)
		}

		// 'kubectl apply'
		_, err = dr.Create(c.Request.Context(), &rawObj, metav1.CreateOptions{})
		if err != nil {
			_, err = dr.Update(c.Request.Context(), &rawObj, metav1.UpdateOptions{})
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed applying cluster state change configuration modification parameters: " + err.Error()})
				return
			}
		}

		processedObjects = append(processedObjects, rawObj.GetKind()+": "+rawObj.GetName())
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"applied": processedObjects,
	})
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

// trace which pods are currently pointing to a specific resource block
func getBoundPods(namespace string, resName string, resType string) []string {
	var boundPods []string

	// all pods in the target namespace
	podList, err := clientset.CoreV1().Pods(namespace).List(context.TODO(), metav1.ListOptions{})
	if err != nil {
		return []string{} // return empty if lookup fails
	}

	for _, pod := range podList.Items {
		isBound := false
		for _, container := range pod.Spec.Containers {
			for _, env := range container.Env {
				if env.ValueFrom != nil {
					// check Secret bindings
					if resType == "secret" && env.ValueFrom.SecretKeyRef != nil && env.ValueFrom.SecretKeyRef.Name == resName {
						isBound = true
					}
					// check ConfigMap bindings
					if resType == "configmap" && env.ValueFrom.ConfigMapKeyRef != nil && env.ValueFrom.ConfigMapKeyRef.Name == resName {
						isBound = true
					}
				}
			}
		}
		if isBound {
			boundPods = append(boundPods, pod.Name)
		}
	}

	if boundPods == nil {
		return []string{}
	}
	return boundPods
}

func parseDCGMMetrics(nodeIP string) (int64, int64) {
	resp, err := http.Get(fmt.Sprintf("http://%s:9400/metrics", nodeIP))
	if err != nil {
		return 0, 0
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0, 0
	}

	var gpuUtil int64
	var fbUsed int64

	lines := strings.Split(string(body), "\n")
	for _, line := range lines {
		if strings.HasPrefix(line, "DCGM_FI_DEV_GPU_UTIL") {
			fields := strings.Fields(line)
			if len(fields) == 2 {
				if val, err := strconv.ParseFloat(fields[1], 64); err == nil {
					gpuUtil = int64(val)
				}
			}
		}
		if strings.HasPrefix(line, "DCGM_FI_DEV_FB_USED") {
			fields := strings.Fields(line)
			if len(fields) == 2 {
				if val, err := strconv.ParseFloat(fields[1], 64); err == nil {
					fbUsed = int64(val)
				}
			}
		}
	}
	return gpuUtil, fbUsed
}
