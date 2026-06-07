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
	"time"

	"github.com/gin-gonic/gin"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd"
)

// ref for Kubernetes client for routes
var clientset *kubernetes.Clientset

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

func main() {
	// initialize Database
	config.ConnectDatabase()

	kubeconfig := filepath.Join(homeDir(), ".kube", "config")
	k8sConfig, err := clientcmd.BuildConfigFromFlags("", kubeconfig)
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
		api.GET("/cluster/summary", getClusterSummary)
		api.POST("/cluster/deploy", deployNewPod)
		api.GET("/cluster/pods", getClusterPods)
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

func homeDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		panic("could not determine home directory")
	}
	return home
}
