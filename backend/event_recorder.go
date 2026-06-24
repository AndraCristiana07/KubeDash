package main

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type ClusterIncident struct {
	Namespace string `json:"namespace"`
	PodName   string `json:"pod_name"`
	Reason    string `json:"reason"` // OOMKilled, FailedScheduling, CrashLoopBackOff
	Message   string `json:"message"`
	Type      string `json:"type"`
	Timestamp int64  `json:"timestamp"`
}

func StartClusterBlackBox(ctx context.Context) {
	if clientset == nil {
		log.Println("K8s clientset is uninitialized. Black Box cannot start.")
		return
	}

	go func() {
		log.Println("Activating Cluster Incident 'Black Box' Flight Recorder...")

		// open a persistent stream channel for cluster Events
		watcher, err := clientset.CoreV1().Events("").Watch(ctx, metav1.ListOptions{})
		if err != nil {
			log.Printf("Failed to open K8s event watch channel: %v\n", err)
			return
		}
		defer watcher.Stop()

		streamKey := "k8s:incidents:stream"

		// loop waiting Kubernetes to push new events
		for event := range watcher.ResultChan() {
			k8sEvent, ok := event.Object.(*corev1.Event)
			if !ok {
				continue
			}

			// filter out regular events
			if k8sEvent.Type != "Warning" {
				continue
			}

			incident := ClusterIncident{
				Namespace: k8sEvent.Namespace,
				PodName:   k8sEvent.InvolvedObject.Name,
				Reason:    k8sEvent.Reason,
				Message:   k8sEvent.Message,
				Type:      k8sEvent.Type,
				Timestamp: k8sEvent.LastTimestamp.Unix(),
			}

			// fallback if Kubernetes hasn't populated the timestamp field yet
			if incident.Timestamp == 0 {
				incident.Timestamp = time.Now().Unix()
			}

			jsonBytes, err := json.Marshal(incident)
			if err != nil {
				continue
			}

			// oush to the Redis
			err = redisClient.XAdd(ctx, &redis.XAddArgs{
				Stream: streamKey,
				MaxLen: 1000,
				Approx: true,
				ID:     "*", // generates automatic time-based message ID
				Values: map[string]interface{}{"payload": string(jsonBytes)},
			}).Err()

			if err != nil {
				log.Printf("Redis Stream insertion failure: %v\n", err)
			} else {
				log.Printf("Incident Recorded ➔ [%s] %s: %s\n", incident.Reason, incident.PodName, incident.Message)
			}
		}
	}()
}
