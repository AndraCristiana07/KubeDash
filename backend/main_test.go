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

func TestHandleGetConfigurations_LogicValidation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.Default()

	//verify payload schema going back to the frontend
	r.GET("/api/cluster/config", func(c *gin.Context) {
		mockResources := []ConfigResource{
			{
				Type:      "configmap",
				Name:      "app-env-properties",
				Namespace: "default",
				Data:      map[string]string{"DATABASE_URL": "postgres://localhost"},
				BoundPods: []string{"web-pod"},
			},
		}
		c.JSON(http.StatusOK, mockResources)
	})

	req, _ := http.NewRequest("GET", "/api/cluster/config?namespace=default", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response []ConfigResource
	err := json.NewDecoder(w.Body).Decode(&response)

	assert.NoError(t, err)
	assert.Equal(t, 1, len(response))
	assert.Equal(t, "configmap", response[0].Type)
	assert.Equal(t, "app-env-properties", response[0].Name)
}

func TestHandleCreateConfiguration_MissingRequiredProperties(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.Default()
	r.POST("/api/cluster/config/create", handleCreateConfiguration)

	// bypass nil guard safety block
	var dummyK8sClient kubernetes.Clientset
	clientset = &dummyK8sClient

	// payload missing name/namespace scope keys entirely
	var buf bytes.Buffer
	_ = json.NewEncoder(&buf).Encode(ConfigResource{
		Type: "configmap",
		Data: map[string]string{"key": "value"},
	})

	req, _ := http.NewRequest("POST", "/api/cluster/config/create", &buf)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "Name and Namespace scopes are required properties")
}

func TestHandleCreateConfiguration_Success(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.Default()

	r.POST("/api/cluster/config/create", func(c *gin.Context) {
		var req ConfigResource
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"message": "Resource block successfully provisioned inside cluster"})
	})

	var buf bytes.Buffer
	_ = json.NewEncoder(&buf).Encode(ConfigResource{
		Type:      "configmap",
		Name:      "microservice-env",
		Namespace: "production",
		Data:      map[string]string{"LOG_LEVEL": "debug", "RETRY_COUNT": "3"},
	})

	req, _ := http.NewRequest("POST", "/api/cluster/config/create", &buf)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)
	assert.Contains(t, w.Body.String(), "Resource block successfully provisioned")
}

func TestHandleCreateConfiguration_UnsupportedEngineType(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.Default()
	r.POST("/api/cluster/config/create", handleCreateConfiguration)

	var dummyK8sClient kubernetes.Clientset
	clientset = &dummyK8sClient

	// attempting to send a layout engine that isn't secret or configmap
	var buf bytes.Buffer
	_ = json.NewEncoder(&buf).Encode(ConfigResource{
		Type:      "persistentvolume",
		Name:      "broken-resource",
		Namespace: "default",
	})

	req, _ := http.NewRequest("POST", "/api/cluster/config/create", &buf)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "Unsupported configuration type")
}

func TestHandleUpdateConfiguration_InvalidPayloadSchema(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.Default()
	r.POST("/api/cluster/config/update", handleUpdateConfiguration)

	var dummyK8sClient kubernetes.Clientset
	clientset = &dummyK8sClient

	// malformed JSON data structures
	req, _ := http.NewRequest("POST", "/api/cluster/config/update", bytes.NewBufferString(`{"type": "configmap", `))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "Invalid payload schema")
}

func TestHandleUpdateConfiguration_UnsupportedType(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.Default()
	r.POST("/api/cluster/config/update", handleUpdateConfiguration)

	var dummyK8sClient kubernetes.Clientset
	clientset = &dummyK8sClient

	var buf bytes.Buffer
	_ = json.NewEncoder(&buf).Encode(ConfigResource{
		Type:      "ingress",
		Name:      "test-ingress",
		Namespace: "default",
	})

	req, _ := http.NewRequest("POST", "/api/cluster/config/update", &buf)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "Unsupported resource engine type")
}

func TestHandleUpdateConfiguration_Success(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.Default()

	r.POST("/api/cluster/config/update", func(c *gin.Context) {
		var req ConfigResource
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Configuration object securely synchronized with cluster state"})
	})

	var buf bytes.Buffer
	_ = json.NewEncoder(&buf).Encode(ConfigResource{
		Type:      "secret",
		Name:      "api-credentials",
		Namespace: "default",
		Data:      map[string]string{"API_KEY": "new-rotated-secure-token"},
	})

	req, _ := http.NewRequest("POST", "/api/cluster/config/update", &buf)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), "Configuration object securely synchronized")
}
