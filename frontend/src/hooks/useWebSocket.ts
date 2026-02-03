import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';

interface WebSocketMessage {
  type: string;
  data?: unknown;
  employee_code?: string;
  status?: string;
  timestamp?: number;
}

interface UseWebSocketOptions {
  employeeCode?: string;
  token?: string;
  autoReconnect?: boolean;
  reconnectInterval?: number;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  const {
    employeeCode,
    token = localStorage.getItem('token') || '',
    autoReconnect = true,
    reconnectInterval = 3000
  } = options;

  const connect = () => {
    try {
      // Determine WebSocket URL based on protocol
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.hostname}:8000/ws/${employeeCode || 'anonymous'}?token=${token}`;
      
      console.log(`[WebSocket] Connecting to: ${wsUrl}`);
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WebSocket] Connected');
        setIsConnected(true);
        setError(null);
        
        // Clear any pending reconnect timeout
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          console.log('[WebSocket] Received:', message);
          setLastMessage(message);
          
          // Handle different message types
          switch (message.type) {
            case 'task_update':
              handleTaskUpdate(message.data);
              break;
            case 'employee_status_update':
              handleEmployeeStatusUpdate(message);
              break;
            case 'sla_breach':
              handleSLABreach(message.data);
              break;
            case 'employee_connected':
              console.log(`[WebSocket] Employee ${message.employee_code} connected`);
              break;
            case 'employee_disconnected':
              console.log(`[WebSocket] Employee ${message.employee_code} disconnected`);
              break;
            case 'pong':
              // Ping-pong response
              break;
          }
        } catch (err) {
          console.error('[WebSocket] Failed to parse message:', err);
        }
      };

      ws.onclose = (event) => {
        console.log(`[WebSocket] Disconnected: ${event.code} - ${event.reason}`);
        setIsConnected(false);
        
        // Auto-reconnect if enabled
        if (autoReconnect && event.code !== 1000) {
          console.log(`[WebSocket] Reconnecting in ${reconnectInterval}ms...`);
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        }
      };

      ws.onerror = (event) => {
        console.error('[WebSocket] Error:', event);
        setError('WebSocket connection error');
        
        // Try to reconnect
        if (autoReconnect) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        }
      };

    } catch (err) {
      console.error('[WebSocket] Connection failed:', err);
      setError('Failed to connect to WebSocket');
    }
  };

  const handleTaskUpdate = (data: unknown) => {
    const taskData = data as { action?: string; task_id?: string; assigned_to_name?: string; assigned_to?: string; auto_moved?: boolean };
    switch (taskData.action) {
      case 'assigned':
        toast({
          title: "New Task Assigned",
          description: `Task ${taskData.task_id} assigned to ${taskData.assigned_to_name}`,
          duration: 3000
        });
        // Trigger refresh of task list
        window.dispatchEvent(new CustomEvent('taskAssigned', { detail: taskData }));
        break;
      case 'completed':
        toast({
          title: "Task Completed",
          description: `Task ${taskData.task_id} completed by ${taskData.assigned_to}`,
          duration: 3000
        });
        // Trigger refresh of task list
        window.dispatchEvent(new CustomEvent('taskCompleted', { detail: taskData }));
        if (taskData.auto_moved) {
          toast({
            title: "File Auto-Moved",
            description: "File automatically moved to COMPLETED stage",
            duration: 3000
          });
        }
        break;
    }
  };

  const handleEmployeeStatusUpdate = (message: unknown) => {
    // Trigger employee list refresh
    window.dispatchEvent(new CustomEvent('employeeStatusUpdate', { detail: message }));
  };

  const handleSLABreach = (data: unknown) => {
    const slaData = data as { task_id?: string; hours_overdue?: number };
    toast({
      title: "SLA Breach Alert",
      description: `Task ${slaData.task_id} is ${slaData.hours_overdue} hours overdue`,
      variant: "destructive",
      duration: 5000
    });
  };

  const sendMessage = (message: unknown) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  };

  const sendPing = () => {
    sendMessage({ type: 'ping' });
  };

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnected');
      wsRef.current = null;
    }
    setIsConnected(false);
  };

  // Initial connection
  useEffect(() => {
    if (employeeCode) {
      connect();
    }

    // Cleanup on unmount
    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- preserve current behavior: only reconnect when employeeCode changes
  }, [employeeCode]);

  // Ping every 30 seconds to keep connection alive
  useEffect(() => {
    if (isConnected) {
      const pingInterval = setInterval(sendPing, 30000);
      return () => clearInterval(pingInterval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- preserve current behavior: only restart ping interval when connection changes
  }, [isConnected]);

  return {
    isConnected,
    lastMessage,
    error,
    sendMessage,
    sendPing,
    disconnect,
    connect
  };
}
