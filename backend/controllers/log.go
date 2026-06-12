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
	if config.DB == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Database stream proxy is initializing. Please retry in a moment."})
		return
	}

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
	if config.DB == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Database stream proxy is initializing. Please retry in a moment."})
		return
	}
	var logs []models.ClusterLog

	// filter parameters from the URL query string
	namespace := c.Query("namespace")
	level := c.Query("level")
	search := c.Query("search")
	limitStr := c.DefaultQuery("limit", "50")
	pageStr := c.DefaultQuery("page", "1") // default to page 1

	// pagination constraints safely
	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit <= 0 {
		limit = 50
	}

	page, err := strconv.Atoi(pageStr)
	if err != nil || page <= 0 {
		page = 1
	}

	// GORM query engine instance
	baseQuery := config.DB.Model(&models.ClusterLog{})

	// namespace filter
	if namespace != "" && namespace != "all" && namespace != "*" {
		baseQuery = baseQuery.Where("namespace = ?", namespace)
	}

	// severity level filter (Normal or Warning)
	if level != "" && level != "all" {
		baseQuery = baseQuery.Where("level = ?", level)
	}

	// string search matching
	if search != "" {
		baseQuery = baseQuery.Where("message ILIKE ? OR pod_name ILIKE ?", "%"+search+"%", "%"+search+"%")
	}

	// total record count matching filters
	var totalRows int64
	if err := baseQuery.Count(&totalRows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to count rows: " + err.Error()})
		return
	}

	// fetchpaginated chunk
	offset := (page - 1) * limit
	err = baseQuery.Order("created_at DESC").Limit(limit).Offset(offset).Find(&logs).Error
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to query chunk logs: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"logs":         logs,
		"total_items":  totalRows,
		"current_page": page,
		"limit":        limit,
	})
}

// GET /api/logs/overview
func GetOverviewLogs(c *gin.Context) {

	if config.DB == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Database stream proxy is initializing. Please retry in a moment."})
		return
	}
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

	c.JSON(http.StatusOK, gin.H{
		"count": len(logs),
		"data":  logs,
	})
}
