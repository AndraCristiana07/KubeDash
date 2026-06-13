package controllers

import (
	"backend/config"
	"backend/models"
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// initialize sandboxed router and an isolated DB
func setupTestEnv() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.Default()

	// prevents records from leaking between TestGetLogs and TestCreateLog!
	db, err := gorm.Open(sqlite.Open("file::memory:?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		panic("Failed to initialize test runtime memory space: " + err.Error())
	}

	// sync structures
	_ = db.AutoMigrate(&models.ClusterLog{})
	config.DB = db

	return r
}

func TestGetLogs_Success(t *testing.T) {
	router := setupTestEnv()
	router.GET("/api/logs", GetLogs)

	config.DB.Create(&models.ClusterLog{
		PodName:   "test-nginx-pod",
		Namespace: "default",
		Message:   "Container started gracefully",
		Level:     "Normal",
		CreatedAt: time.Now(),
	})

	req, _ := http.NewRequest("GET", "/api/logs?namespace=default&level=Normal", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response struct {
		Logs       []models.ClusterLog `json:"logs"`
		TotalItems int64               `json:"total_items"`
	}
	err := json.NewDecoder(w.Body).Decode(&response)
	assert.NoError(t, err)

	assert.NotEmpty(t, response.Logs)
	assert.Equal(t, int64(1), response.TotalItems)
	assert.Equal(t, "test-nginx-pod", response.Logs[0].PodName)
}

func TestGetLogs_DatabaseInitializing_SafetyGuard(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.Default()
	r.GET("/api/logs", GetLogs)

	config.DB = nil

	req, _ := http.NewRequest("GET", "/api/logs", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusServiceUnavailable, w.Code)
	assert.Contains(t, w.Body.String(), "Database stream proxy is initializing")
}

func TestCreateLog_Success(t *testing.T) {
	router := setupTestEnv()
	router.POST("/api/logs", CreateLog)

	// dynamic network byte buffer
	var buf bytes.Buffer

	err := json.NewEncoder(&buf).Encode(models.ClusterLog{
		PodName:   "redis-cache",
		Namespace: "production",
		Message:   "OOMKilled event triggered",
		Level:     "Warning",
	})
	assert.NoError(t, err)

	// dispatch request
	req, _ := http.NewRequest("POST", "/api/logs", &buf)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)

	// verify the mock database to confirm GORM saved the entry
	var savedLog models.ClusterLog
	err = config.DB.First(&savedLog).Error
	assert.NoError(t, err)
	assert.Equal(t, "redis-cache", savedLog.PodName)
}

func TestCreateLog_ValidationFailure(t *testing.T) {
	router := setupTestEnv()
	router.POST("/api/logs", CreateLog)

	malformedJSON := `{"pod_name": "faulty-pod", "namespace": "default"`

	req, _ := http.NewRequest("POST", "/api/logs", bytes.NewBufferString(malformedJSON))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestGetLogs_Pagination(t *testing.T) {
	router := setupTestEnv()
	router.GET("/api/logs", GetLogs)

	for i := 1; i <= 3; i++ {
		config.DB.Create(&models.ClusterLog{
			PodName:   "worker-node",
			Namespace: "default",
			Message:   "Processing job batch chunk",
			Level:     "Normal",
		})
	}

	req, _ := http.NewRequest("GET", "/api/logs?page=1&limit=2", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response struct {
		Logs       []models.ClusterLog `json:"logs"`
		TotalItems int64               `json:"total_items"`
	}
	_ = json.NewDecoder(w.Body).Decode(&response)

	assert.Equal(t, int64(3), response.TotalItems)
	assert.Equal(t, 2, len(response.Logs))
}
