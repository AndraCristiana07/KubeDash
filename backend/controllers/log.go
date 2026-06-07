package controllers

import (
	"backend/config"
	"backend/models"
	"net/http"

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
	nsFilter := c.Query("namespace")

	var err error
	// namespace is empty, "all", or "*" -> fetch everything
	if nsFilter == "" || nsFilter == "all" || nsFilter == "*" {
		err = config.DB.Order("created_at desc").Limit(100).Find(&logs).Error
	} else {
		// filter specifically for what the user typed
		err = config.DB.Where("namespace = ?", nsFilter).Order("created_at desc").Limit(100).Find(&logs).Error
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": logs})
}
