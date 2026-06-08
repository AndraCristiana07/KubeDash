package controllers

import (
	"backend/config"
	"backend/models"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// POST /api/logs - create new log entry
func CreateLog(c *gin.Context) {
	var input models.ClusterLog

	// bind incoming JSON request to our struct
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// save to PostgreSQL via GORM
	config.DB.Create(&input)

	c.JSON(http.StatusCreated, gin.H{"data": input})
}

// GET /api/logs - fetch logs
func GetLogs(c *gin.Context) {
	var logs []models.ClusterLog

	// filter parameters from the URL query string
	namespace := c.Query("namespace")
	level := c.Query("level")
	search := c.Query("search")
	limitStr := c.DefaultQuery("limit", "50")

	// GORM query engine instance
	query := config.DB.Order("created_at DESC")

	// namespace filter
	if namespace != "" && namespace != "all" && namespace != "*" {
		query = query.Where("namespace = ?", namespace)
	}

	// severity level filter (Normal or Warning)
	if level != "" && level != "all" {
		query = query.Where("level = ?", level)
	}

	// string search matching
	if search != "" {
		query = query.Where("message ILIKE ? OR pod_name ILIKE ?", "%"+search+"%", "%"+search+"%")
	}

	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit <= 0 {
		limit = 50 // safe fallback barrier
	}
	query = query.Limit(limit)

	if err := query.Find(&logs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to query audit repository: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"count": len(logs),
		"logs":  logs,
	})
}

// GET /api/logs/overview
func GetOverviewLogs(c *gin.Context) {
	var logs []models.ClusterLog
	nsFilter := c.Query("namespace")

	var err error
	// namespace is empty, "all", or "*" -> fetch everything
	if nsFilter == "" || nsFilter == "all" || nsFilter == "*" {
		err = config.DB.Order("created_at desc").Limit(10).Find(&logs).Error
	} else {
		// filter specifically for what the user typed
		err = config.DB.Where("namespace = ?", nsFilter).Order("created_at desc").Limit(10).Find(&logs).Error
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": logs})
}
