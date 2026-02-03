import React, { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';

interface NotificationData {
  file_id?: string;
  task_id?: string;
  stage?: string;
  employee_name?: string;
  employee_code?: string;
  quality_score?: number;
}

interface Notification {
  id: number;
  type: 'task_assigned' | 'stage_completed' | 'sla_breached' | 'connection';
  title: string;
  message: string;
  data?: NotificationData;
  timestamp: string;
  popup?: boolean;
}

const NotificationPopup: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const maxReconnectAttempts = 5;
  const preferSSE = false;
  const autoConnect = false;

  const connectWebSocket = useCallback(() => {
    try {
      const token = localStorage.getItem('token') || 'dummy-token';
      const userId = localStorage.getItem('userId') || 'user_123';
      
      const websocket = new WebSocket(
        `ws://localhost:8000/api/v1/ws/notifications?token=${token}&user_id=${userId}`
      );
      
      websocket.onopen = () => {
        console.log('WebSocket connected');
        setReconnectAttempts(0);
        setWs(websocket);
        
        // Send ping every 30 seconds
        const pingInterval = setInterval(() => {
          if (websocket.readyState === WebSocket.OPEN) {
            websocket.send(JSON.stringify({
              type: 'ping',
              timestamp: new Date().toISOString()
            }));
          }
        }, 30000);
        
        (websocket as WebSocket & { pingInterval?: NodeJS.Timeout }).pingInterval = pingInterval;
      };
      
      websocket.onmessage = (event) => {
        const notification: Notification = JSON.parse(event.data);
        
        if (notification.type === 'connection') {
          console.log(notification.message);
          return;
        }

        if (notification.type === 'task_assigned') {
          const taskId = notification.data?.task_id;
          const employeeName = notification.data?.employee_name;
          const employeeCode = notification.data?.employee_code;

          console.log(
            `✅ Auto-assigned task: ${taskId} -> ${employeeName} (${employeeCode})`
          );

          window.dispatchEvent(
            new CustomEvent('task_assigned', {
              detail: {
                task_id: taskId,
                employee_name: employeeName,
                employee_code: employeeCode,
                file_id: notification.data?.file_id,
                stage: notification.data?.stage,
              },
            })
          );
        }
        
        // Show popup for important notifications
        if (notification.popup) {
          showNotification(notification);
        }
      };
      
      websocket.onclose = () => {
        console.log('WebSocket disconnected');
        clearInterval((websocket as WebSocket & { pingInterval?: NodeJS.Timeout }).pingInterval);
        setWs(null);
        
        // Attempt to reconnect with exponential backoff
        setReconnectAttempts(prev => {
          if (prev < maxReconnectAttempts) {
            const newAttempts = prev + 1;
            console.log(`Attempting to reconnect... (${newAttempts}/${maxReconnectAttempts})`);
            setTimeout(() => {
              connectWebSocket();
            }, Math.min(5000 * newAttempts, 30000)); // Cap at 30 seconds
            return newAttempts;
          }
          return prev;
        });
      };
      
      websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
      
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
    }
  }, []); // Remove reconnectAttempts from dependencies to prevent recreation loops

  useEffect(() => {
    // Auto-connect disabled to prevent notification spam on page load
    // connectWebSocket();
    
    return () => {
      if (ws) {
        clearInterval((ws as WebSocket & { pingInterval?: NodeJS.Timeout }).pingInterval);
        ws.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- preserve current behavior: only connect on mount
  }, []);

  const showNotification = useCallback((notification: Notification) => {
    const notificationWithId = {
      ...notification,
      id: Date.now() + Math.random()
    };
    
    setNotifications(prev => {
      const updated = [notificationWithId, ...prev];
      return updated.slice(0, 5); // Keep only 5 most recent
    });
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      removeNotification(notificationWithId.id);
    }, 5000);
    
    // Play notification sound
    playNotificationSound();
  }, []); // eslint-disable-next-line react-hooks/exhaustive-deps -- preserve current behavior: stable callback

  const removeNotification = useCallback((id: number) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []); // eslint-disable-next-line react-hooks/exhaustive-deps -- preserve current behavior: stable callback

  const playNotificationSound = () => {
    try {
      const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
      console.log('Could not play notification sound:', error);
    }
  };

  const getNotificationStyles = (type: string) => {
    switch (type) {
      case 'task_assigned':
        return 'border-l-green-500';
      case 'stage_completed':
        return 'border-l-blue-500';
      case 'sla_breached':
        return 'border-l-red-500';
      default:
        return 'border-l-gray-500';
    }
  };

  const getTitleColor = (type: string) => {
    switch (type) {
      case 'task_assigned':
        return 'text-green-600';
      case 'stage_completed':
        return 'text-blue-600';
      case 'sla_breached':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm w-full space-y-2">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`bg-white rounded-lg shadow-lg border-l-4 overflow-hidden transform transition-all duration-300 ${getNotificationStyles(
            notification.type
          )}`}
        >
          <div className="flex items-center justify-between p-3 bg-gray-50 border-b">
            <span className={`font-semibold text-sm ${getTitleColor(notification.type)}`}>
              {notification.title}
            </span>
            <button
              onClick={() => removeNotification(notification.id)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <div className="p-3">
            <p className="text-sm text-gray-700 mb-2">{notification.message}</p>
            
            {notification.data && (
              <div className="space-y-1">
                {notification.data.employee_name && (
                  <p className="text-xs text-gray-500">
                    Employee: {notification.data.employee_name} ({notification.data.employee_code})
                  </p>
                )}
                {notification.data.stage && (
                  <p className="text-xs text-gray-500">Stage: {notification.data.stage}</p>
                )}
                {notification.data.file_id && (
                  <p className="text-xs text-gray-500">File ID: {notification.data.file_id}</p>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default NotificationPopup;
