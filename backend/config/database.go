package config

import (
	"backend/models"
	"context"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/portforward"
	"k8s.io/client-go/transport/spdy"
)

var DB *gorm.DB

var K8sConfig *rest.Config
var Clientset *kubernetes.Clientset

func ConnectDatabase() {
	log.Println("[DATABASE INITIALIZER] Setting up automated background port-forwarding tunnels...")

	dbUser := os.Getenv("DB_USER")
	if dbUser == "" {
		dbUser = "postgres"
	}
	dbPassword := os.Getenv("DB_PASSWORD")
	if dbPassword == "" {
		dbPassword = "secret"
	}
	dbName := os.Getenv("DB_NAME")
	if dbName == "" {
		dbName = "kubedash"
	}

	// find an available local port on your machine
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		log.Fatalf("[DATABASE CRITICAL] Failed to allocate dynamic local port: %v", err)
	}
	localPort := listener.Addr().(*net.TCPAddr).Port
	_ = listener.Close() // release it immediately so the portforwarder can bind to it

	log.Printf("[TUNNEL SETUP] Dynamic loopback selected: 127.0.0.1:%d\n", localPort)

	// configure GORM
	dsn := fmt.Sprintf("host=127.0.0.1 port=%d user=%s password=%s dbname=%s sslmode=disable", localPort, dbUser, dbPassword, dbName)

	go func() {
		var stopChan chan struct{}
		var readyChan chan struct{}

		for {
			if Clientset == nil || K8sConfig == nil {
				time.Sleep(1 * time.Second)
				continue
			}

			if DB == nil {
				log.Println("[DATABASE STATUS] Discovering healthy database pod targets...")

				svc, err := Clientset.CoreV1().Services("default").Get(context.TODO(), "postgres-service", metav1.GetOptions{})
				if err != nil {
					log.Printf("[TUNNEL ERROR] Service lookup failed: %v. Retrying...\n", err)
					time.Sleep(4 * time.Second)
					continue
				}

				var selectorStr string
				for k, v := range svc.Spec.Selector {
					if selectorStr != "" {
						selectorStr += ","
					}
					selectorStr += fmt.Sprintf("%s=%s", k, v)
				}

				pods, err := Clientset.CoreV1().Pods("default").List(context.TODO(), metav1.ListOptions{LabelSelector: selectorStr})
				if err != nil || len(pods.Items) == 0 {
					log.Println("[TUNNEL ERROR] Zero postgres pods discovered. Retrying...")
					time.Sleep(4 * time.Second)
					continue
				}

				var targetPod *corev1.Pod
				for _, p := range pods.Items {
					if p.Status.Phase == corev1.PodRunning && p.DeletionTimestamp == nil {
						targetPod = &p
						break
					}
				}
				if targetPod == nil {
					targetPod = &pods.Items[0]
				}

				log.Printf("[TUNNEL ROUTER] Starting native client-go port-forwarder to [%s/%s]\n", targetPod.Namespace, targetPod.Name)

				// construct the connection URL
				reqURL := Clientset.CoreV1().RESTClient().Post().
					Resource("pods").
					Namespace(targetPod.Namespace).
					Name(targetPod.Name).
					SubResource("portforward").URL()

				transport, upgrader, err := spdy.RoundTripperFor(K8sConfig)
				if err != nil {
					log.Printf("[TUNNEL ERROR] Transport setup failed: %v\n", err)
					time.Sleep(4 * time.Second)
					continue
				}

				dialer := spdy.NewDialer(upgrader, &http.Client{Transport: transport}, "POST", reqURL)

				// re-instantiate internal signal wrappers
				stopChan = make(chan struct{}, 1)
				readyChan = make(chan struct{}, 1)

				// create native portforward manager with correct dual-channel multiplexing
				pf, err := portforward.New(
					dialer,
					[]string{fmt.Sprintf("%d:5432", localPort)},
					stopChan,
					readyChan,
					io.Discard, // discard noisy network connection messages
					os.Stderr,  // route errors directly to standard error output
				)
				if err != nil {
					log.Printf("[TUNNEL ERROR] Failed creating forwarder instance: %v\n", err)
					time.Sleep(4 * time.Second)
					continue
				}

				// run the port-forwarder in its own thread
				go func() {
					if err := pf.ForwardPorts(); err != nil {
						log.Printf("[TUNNEL NOTICE] Port-forward stream closed: %v\n", err)
						pf.Close()
						DB = nil
					}
				}()

				// wait until the tunnel confirms it is bound and active
				select {
				case <-readyChan:
					log.Println("[TUNNEL SUCCESS] Dual-channel stream established. Initializing GORM handshake...")
				case <-time.After(5 * time.Second):
					log.Println("[TUNNEL TIMEOUT] Handshake took too long. Retrying pod loop...")
					close(stopChan)
					time.Sleep(2 * time.Second)
					continue
				}

				// open connection with standard postgres driver setup
				database, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
				if err == nil && database != nil {
					if sqlDB, err := database.DB(); err == nil && sqlDB.Ping() == nil {
						log.Println("[DATABASE STATUS] Running schema synchronization...")
						_ = database.AutoMigrate(&models.ClusterLog{})

						DB = database
						log.Println("[DATABASE SUCCESS] Secure data tunnel mounted successfully via API streaming interface!")
					} else {
						log.Println("[DATABASE WARNING] GORM connection ping failed. Dismounting...")
						close(stopChan)
					}
				} else {
					log.Printf("[DATABASE WARNING] GORM mount failed: %v\n", err)
					close(stopChan)
				}
			} else {
				// health check loop
				sqlDB, err := DB.DB()
				if err != nil || sqlDB.Ping() != nil {
					log.Println("[DATABASE WARNING] Connection dropped. Cleaning and reconnecting...")
					close(stopChan)
					DB = nil
				}
			}
			time.Sleep(4 * time.Second)
		}
	}()
}
