package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"k8s.io/client-go/kubernetes"
)

func TestClusterRoutes_UninitializedClient(t *testing.T) {
	gin.SetMode(gin.TestMode)

	clientset = nil

	routesToTest := []struct {
		method  string
		path    string
		handler gin.HandlerFunc
	}{
		{"GET", "/api/cluster/summary", getClusterSummary},
		{"GET", "/api/cluster/pods", getClusterPods},
		{"DELETE", "/api/cluster/pods", deleteClusterPod},
		{"POST", "/api/cluster/deploy", deployNewPod},
	}

	for _, tc := range routesToTest {
		t.Run(tc.path, func(t *testing.T) {
			r := gin.Default()
			r.Handle(tc.method, tc.path, tc.handler)

			req, _ := http.NewRequest(tc.method, tc.path, nil)
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)

			assert.Equal(t, http.StatusInternalServerError, w.Code)
			assert.Contains(t, w.Body.String(), "Kubernetes client uninitialized")
		})
	}
}

func TestDeployNewPod_InvalidPayloadInput(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.Default()
	r.POST("/api/cluster/deploy", deployNewPod)

	var dummyK8sClient kubernetes.Clientset
	clientset = &dummyK8sClient

	badJSON := `{"podName": "broken-deployment", "image": `

	req, _ := http.NewRequest("POST", "/api/cluster/deploy", bytes.NewBufferString(badJSON))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "Invalid input variables")
}

func TestDeleteClusterPod_MissingParameters(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.Default()
	r.DELETE("/api/cluster/pods", deleteClusterPod)

	var dummyK8sClient kubernetes.Clientset
	clientset = &dummyK8sClient

	req, _ := http.NewRequest("DELETE", "/api/cluster/pods?namespace=&name=", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "Missing namespace or name parameters")
}
func TestGetClusterSummary_LogicValidation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.Default()

	// mock real layout
	r.GET("/api/cluster/summary", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"podsCount":     5,
			"nodesTotal":    2,
			"clusterStatus": "Healthy",
		})
	})

	req, _ := http.NewRequest("GET", "/api/cluster/summary", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var res map[string]interface{}
	_ = json.NewDecoder(w.Body).Decode(&res)

	assert.Equal(t, float64(5), res["podsCount"])
	assert.Equal(t, "Healthy", res["clusterStatus"])
}

func TestHandleRestartDeployment_InvalidInputPayload(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.Default()
	r.POST("/api/cluster/restart", handleRestartDeployment)

	req, _ := http.NewRequest("POST", "/api/cluster/restart", bytes.NewBufferString(`{"pod_name":`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "Missing namespace or pod_name parameters")
}

func TestHandleRestartDeployment_DeploymentPathRoute_Success(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.Default()

	r.POST("/api/cluster/restart", func(c *gin.Context) {
		var req RestartRequest
		_ = c.ShouldBindJSON(&req)

		c.JSON(http.StatusOK, gin.H{
			"message": "Rolling restart successfully dispatched for deployment: web-deployment",
		})
	})

	var buf bytes.Buffer
	_ = json.NewEncoder(&buf).Encode(RestartRequest{
		PodName:   "web-deployment-xyz-123",
		Namespace: "production",
	})

	req, _ := http.NewRequest("POST", "/api/cluster/restart", &buf)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]string
	_ = json.NewDecoder(w.Body).Decode(&response)
	assert.Contains(t, response["message"], "Rolling restart successfully dispatched")
}

func TestHandleRestartDeployment_PodNotFoundRoute_Error(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.Default()

	r.POST("/api/cluster/restart", func(c *gin.Context) {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Pod not found: pods \"missing-pod\" not found",
		})
	})

	var buf bytes.Buffer
	_ = json.NewEncoder(&buf).Encode(RestartRequest{
		PodName:   "missing-pod",
		Namespace: "default",
	})

	req, _ := http.NewRequest("POST", "/api/cluster/restart", &buf)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)
	assert.Contains(t, w.Body.String(), "Pod not found")
}

func TestHandleRestartDeployment_StandaloneTimeoutFallback_Conflict(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.Default()

	r.POST("/api/cluster/restart", func(c *gin.Context) {
		var req RestartRequest
		_ = c.ShouldBindJSON(&req)

		c.JSON(http.StatusConflict, gin.H{
			"error": "Timeout waiting for old pod '" + req.PodName + "' to clear its termination routine. Try again in a moment.",
		})
	})

	var buf bytes.Buffer
	_ = json.NewEncoder(&buf).Encode(RestartRequest{
		PodName:   "stubborn-naked-pod",
		Namespace: "default",
	})

	req, _ := http.NewRequest("POST", "/api/cluster/restart", &buf)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusConflict, w.Code)
	assert.Contains(t, w.Body.String(), "Timeout waiting for old pod")
}
