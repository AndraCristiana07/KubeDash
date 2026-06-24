package main

import (
	"context"
	"log"

	"github.com/redis/go-redis/v9"
)

var (
	redisClient *redis.Client
	ctx         = context.Background()
)

// initialize the connection to Redis
func InitRedis(addr string) {
	redisClient = redis.NewClient(&redis.Options{
		Addr:     addr, // "localhost:6379"
		Password: "",   // no password
		DB:       0,    // default DB
	})

	// ping server
	_, err := redisClient.Ping(ctx).Result()
	if err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}
	log.Println("Successfully connected to the Redis Caching Engine.")
}
