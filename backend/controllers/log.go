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

// GET /api/logs - fetch all logs
func GetLogs(c *gin.Context) {
	var logs []models.ClusterLog

	// query database for all entries
	config.DB.Find(&logs)

	c.JSON(http.StatusOK, gin.H{"data": logs})
}
