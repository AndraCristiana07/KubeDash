package main

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type TopologyNode struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Type      string `json:"type"` // "ingress", "service", "deployment"
	Namespace string `json:"namespace"`
}

type TopologyLink struct {
	Source string `json:"source"`
	Target string `json:"target"`
}

type TopologyData struct {
	Nodes []TopologyNode `json:"nodes"`
	Links []TopologyLink `json:"links"`
}

func getClusterTopology(c *gin.Context) {
	nsFilter := c.Query("namespace")
	if nsFilter == "all" {
		nsFilter = ""
	}

	ctx := context.Background()
	data := TopologyData{
		Nodes: []TopologyNode{},
		Links: []TopologyLink{},
	}

	// get all raw resources from K8s
	ingresses, err := clientset.NetworkingV1().Ingresses(nsFilter).List(ctx, metav1.ListOptions{})
	if err != nil {
		ingresses = nil
	}

	services, err := clientset.CoreV1().Services(nsFilter).List(ctx, metav1.ListOptions{})
	if err != nil {
		services = nil
	}

	deployments, err := clientset.AppsV1().Deployments(nsFilter).List(ctx, metav1.ListOptions{})
	if err != nil {
		deployments = nil
	}

	// build Ingress nodes and map them to Services
	if ingresses != nil {
		for _, ing := range ingresses.Items {
			ingID := "ing-" + ing.Name
			data.Nodes = append(data.Nodes, TopologyNode{ID: ingID, Name: ing.Name, Type: "ingress", Namespace: ing.Namespace})

			// look at backend rules to build paths out to target services
			for _, rule := range ing.Spec.Rules {
				if rule.HTTP == nil {
					continue
				}
				for _, path := range rule.HTTP.Paths {
					if path.Backend.Service != nil {
						data.Links = append(data.Links, TopologyLink{
							Source: ingID,
							Target: "svc-" + path.Backend.Service.Name,
						})
					}
				}
			}
		}
	}

	// build Service nodes
	if services != nil {
		for _, svc := range services.Items {
			svcID := "svc-" + svc.Name
			data.Nodes = append(data.Nodes, TopologyNode{ID: svcID, Name: svc.Name, Type: "service", Namespace: svc.Namespace})

			// match Service selectors against Deployments to link them automatically
			if deployments != nil && len(svc.Spec.Selector) > 0 {
				for _, dep := range deployments.Items {
					if dep.Namespace != svc.Namespace {
						continue
					}

					// match checking
					isMatch := true
					for k, v := range svc.Spec.Selector {
						if dep.Spec.Selector.MatchLabels[k] != v {
							isMatch = false
							break
						}
					}
					if isMatch {
						data.Links = append(data.Links, TopologyLink{
							Source: svcID,
							Target: "dep-" + dep.Name,
						})
					}
				}
			}
		}
	}

	// build deployment nodes
	if deployments != nil {
		for _, dep := range deployments.Items {
			data.Nodes = append(data.Nodes, TopologyNode{
				ID:        "dep-" + dep.Name,
				Name:      dep.Name,
				Type:      "deployment",
				Namespace: dep.Namespace,
			})
		}
	}

	c.JSON(http.StatusOK, data)
}
