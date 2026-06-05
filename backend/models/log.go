package models

import "time"

type ClusterLog struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	PodName   string    `gorm:"not null" json:"pod_name"`
	Namespace string    `gorm:"not null" json:"namespace"`
	Message   string    `gorm:"type:text;not null" json:"message"`
	Level     string    `gorm:"size:50" json:"level"` // INFO, ERROR, WARN
	CreatedAt time.Time `json:"created_at"`
}
