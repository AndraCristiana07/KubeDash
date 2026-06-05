package main

import (
	"backend/config"
	"backend/controllers"

	"github.com/gin-gonic/gin"
)

func main() {
	// initialize Database
	config.ConnectDatabase()

	// setup Gin Router
	r := gin.Default()

	// define Routes
	api := r.Group("/api")
	{
		api.POST("/logs", controllers.CreateLog)
		api.GET("/logs", controllers.GetLogs)
	}

	// start Server on port 8080
	r.Run(":8080")
}
