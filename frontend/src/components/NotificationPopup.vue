<!-- Notification Popup Component -->
<template>
  <div class="notification-container">
    <!-- Notification Popups -->
    <transition-group name="notification" tag="div">
      <div
        v-for="notification in notifications"
        :key="notification.id"
        :class="['notification-popup', notification.type]"
      >
        <div class="notification-header">
          <span class="notification-title">{{ notification.title }}</span>
          <button @click="removeNotification(notification.id)" class="close-btn">&times;</button>
        </div>
        <div class="notification-body">
          <p>{{ notification.message }}</p>
          <div v-if="notification.data" class="notification-details">
            <small v-if="notification.data.employee_name">
              Employee: {{ notification.data.employee_name }} ({{ notification.data.employee_code }})
            </small>
            <small v-if="notification.data.stage">
              Stage: {{ notification.data.stage }}
            </small>
            <small v-if="notification.data.file_id">
              File ID: {{ notification.data.file_id }}
            </small>
          </div>
        </div>
      </div>
    </transition-group>
  </div>
</template>

<script>
export default {
  name: 'NotificationPopup',
  data() {
    return {
      notifications: [],
      ws: null,
      reconnectAttempts: 0,
      maxReconnectAttempts: 5
    }
  },
  mounted() {
    this.connectWebSocket()
  },
  beforeUnmount() {
    if (this.ws) {
      this.ws.close()
    }
  },
  methods: {
    connectWebSocket() {
      try {
        // Connect to WebSocket
        const token = localStorage.getItem('token') || 'dummy-token'
        const userId = localStorage.getItem('userId') || 'user_123'
        
        this.ws = new WebSocket(`ws://localhost:8000/api/v1/ws/notifications?token=${token}&user_id=${userId}`)
        
        this.ws.onopen = () => {
          console.log('WebSocket connected')
          this.reconnectAttempts = 0
          
          // Send ping every 30 seconds to keep connection alive
          this.pingInterval = setInterval(() => {
            if (this.ws.readyState === WebSocket.OPEN) {
              this.ws.send(JSON.stringify({
                type: 'ping',
                timestamp: new Date().toISOString()
              }))
            }
          }, 30000)
        }
        
        this.ws.onmessage = (event) => {
          const notification = JSON.parse(event.data)
          
          if (notification.type === 'connection') {
            console.log(notification.message)
            return
          }
          
          // Show popup for important notifications
          if (notification.popup) {
            this.showNotification(notification)
          }
        }
        
        this.ws.onclose = () => {
          console.log('WebSocket disconnected')
          clearInterval(this.pingInterval)
          
          // Attempt to reconnect
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++
            console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
            setTimeout(() => {
              this.connectWebSocket()
            }, 5000 * this.reconnectAttempts)
          }
        }
        
        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error)
        }
        
      } catch (error) {
        console.error('Failed to connect WebSocket:', error)
      }
    },
    
    showNotification(notification) {
      // Add unique ID and timestamp
      const notificationWithId = {
        ...notification,
        id: Date.now() + Math.random(),
        receivedAt: new Date()
      }
      
      // Add to notifications list
      this.notifications.unshift(notificationWithId)
      
      // Limit to 5 notifications
      if (this.notifications.length > 5) {
        this.notifications = this.notifications.slice(0, 5)
      }
      
      // Auto-remove after 5 seconds
      setTimeout(() => {
        this.removeNotification(notificationWithId.id)
      }, 5000)
      
      // Play notification sound (optional)
      this.playNotificationSound()
    },
    
    removeNotification(id) {
      const index = this.notifications.findIndex(n => n.id === id)
      if (index > -1) {
        this.notifications.splice(index, 1)
      }
    },
    
    playNotificationSound() {
      try {
        // Create a simple beep sound
        const audioContext = new (window.AudioContext || window.webkitAudioContext)()
        const oscillator = audioContext.createOscillator()
        const gainNode = audioContext.createGain()
        
        oscillator.connect(gainNode)
        gainNode.connect(audioContext.destination)
        
        oscillator.frequency.value = 800
        oscillator.type = 'sine'
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5)
        
        oscillator.start(audioContext.currentTime)
        oscillator.stop(audioContext.currentTime + 0.5)
      } catch (error) {
        console.log('Could not play notification sound:', error)
      }
    }
  }
}
</script>

<style scoped>
.notification-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 9999;
  max-width: 400px;
}

.notification-popup {
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  margin-bottom: 10px;
  overflow: hidden;
  border-left: 4px solid #ddd;
}

.notification-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #f8f9fa;
  border-bottom: 1px solid #eee;
}

.notification-title {
  font-weight: 600;
  font-size: 14px;
}

.close-btn {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: #999;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  color: #666;
}

.notification-body {
  padding: 12px 16px;
}

.notification-body p {
  margin: 0 0 8px 0;
  font-size: 14px;
  color: #333;
}

.notification-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.notification-details small {
  color: #666;
  font-size: 12px;
}

/* Notification type styles */
.notification-popup.task_assigned {
  border-left-color: #28a745;
}

.notification-popup.task_assigned .notification-title {
  color: #28a745;
}

.notification-popup.stage_completed {
  border-left-color: #007bff;
}

.notification-popup.stage_completed .notification-title {
  color: #007bff;
}

.notification-popup.sla_breached {
  border-left-color: #dc3545;
}

.notification-popup.sla_breached .notification-title {
  color: #dc3545;
}

/* Animation */
.notification-enter-active {
  transition: all 0.3s ease;
}

.notification-leave-active {
  transition: all 0.3s ease;
}

.notification-enter-from {
  transform: translateX(100%);
  opacity: 0;
}

.notification-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

.notification-move {
  transition: transform 0.3s ease;
}
</style>
