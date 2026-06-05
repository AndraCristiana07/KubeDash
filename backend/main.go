package main

import (
	"backend/config"
	"backend/controllers"
	"backend/models"
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/gin-gonic/gin"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd"
)

func main() {
	// initialize Database
	config.ConnectDatabase()

	fmt.Println("Scanning Kubernetes for cluster pods...")
	watchPods()
	fmt.Println("Scanning Kubernetes...")
	go watchEventsInBackground()

	// setup Gin Router
	r := gin.Default()

	// define Routes
	api := r.Group("/api")
	{
		api.POST("/logs", controllers.CreateLog)
		api.GET("/logs", controllers.GetLogs)
	}

	// start Server on port 8080
	r.Run(":8080")
}

func watchPods() {
	kubeconfig := filepath.Join(homeDir(), ".kube", "config")
	config, err := clientcmd.BuildConfigFromFlags("", kubeconfig)
	if err != nil {
		panic(err.Error())
	}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		panic(err.Error())
	}

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
	kubeconfig := filepath.Join(homeDir(), ".kube", "config")
	k8sConfig, err := clientcmd.BuildConfigFromFlags("", kubeconfig)
	if err != nil {
		log.Printf("Failed to load kubeconfig: %v\n", err)
		return
	}

	clientset, err := kubernetes.NewForConfig(k8sConfig)
	if err != nil {
		log.Printf("Failed to create K8s client: %v\n", err)
		return
	}

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

func homeDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		panic("could not determine home directory")
	}
	return home
}
