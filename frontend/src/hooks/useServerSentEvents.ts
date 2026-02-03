import { useEffect, useState, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';

interface SSEMessage {
  type: string;
  data: unknown;
  timestamp?: string;
  error?: string;
}

interface UseSSEOptions {
  autoReconnect?: boolean;
  reconnectInterval?: number;
  onTaskAssigned?: (data: unknown) => void;
  onTaskCompleted?: (data: unknown) => void;
  onEmployeeStatus?: (data: unknown) => void;
  onSLABreach?: (data: unknown) => void;
  onError?: (error: string) => void;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export function useServerSentEvents(options: UseSSEOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<SSEMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();

  const {
    autoReconnect = true,
    reconnectInterval = 5000,
    onTaskAssigned,
    onTaskCompleted,
    onEmployeeStatus,
    onSLABreach,
    onError
  } = options;

  const connect = () => {
    try {
      // Close existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      console.log('[SSE] Connecting to event stream...');
      
      // Create EventSource with CORS support
      const eventSource = new EventSource('/api/v1/events/stream');
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('[SSE] Connected');
        setIsConnected(true);
        setError(null);
        
        // Clear any pending reconnect timeout
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      eventSource.onmessage = (event) => {
        try {
          const data: SSEMessage = JSON.parse(event.data);
          console.log('[SSE] Received:', data);
          setLastEvent(data);
          
          // Handle different event types
          switch (data.type) {
            case 'task_assigned':
              if (onTaskAssigned) onTaskAssigned(data);
              handleTaskAssigned(data);
              break;
            case 'task_completed':
              if (onTaskCompleted) onTaskCompleted(data);
              handleTaskCompleted(data);
              break;
            case 'employee_status':
              if (onEmployeeStatus) onEmployeeStatus(data);
              handleEmployeeStatus(data);
              break;
            case 'sla_breach':
              if (onSLABreach) onSLABreach(data);
              handleSLABreach(data);
              break;
            case 'error':
              if (onError) onError(data.error);
              handleSSEError(data.error);
              break;
          }
        } catch (err) {
          console.error('[SSE] Failed to parse message:', err);
        }
      };

      eventSource.onerror = (event) => {
        console.error('[SSE] Error:', event);
        setError('SSE connection error');
        
        // Auto-reconnect if enabled
        if (autoReconnect) {
          console.log(`[SSE] Reconnecting in ${reconnectInterval}ms...`);
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        }
      };

      // Listen for specific event types
      eventSource.addEventListener('task_assigned', (event: MessageEvent) => {
        const data = JSON.parse(String(event.data)) as unknown;
        console.log('[SSE] Task assigned event:', data);
        if (onTaskAssigned) onTaskAssigned(data);
        handleTaskAssigned(data);
      });

      eventSource.addEventListener('task_completed', (event: MessageEvent) => {
        const data = JSON.parse(String(event.data)) as unknown;
        console.log('[SSE] Task completed event:', data);
        if (onTaskCompleted) onTaskCompleted(data);
        handleTaskCompleted(data);
      });

      eventSource.addEventListener('employee_status', (event: MessageEvent) => {
        const data = JSON.parse(String(event.data)) as unknown;
        console.log('[SSE] Employee status event:', data);
        if (onEmployeeStatus) onEmployeeStatus(data);
        handleEmployeeStatus(data);
      });

      eventSource.addEventListener('sla_breach', (event: MessageEvent) => {
        const data = JSON.parse(String(event.data)) as unknown;
        console.log('[SSE] SLA breach event:', data);
        if (onSLABreach) onSLABreach(data);
        handleSLABreach(data);
      });

      eventSource.addEventListener('error', (event: Event) => {
        console.error('[SSE] Error event:', event);
        const eventData = (event as unknown as { data?: unknown }).data;
        const parsed = asRecord(eventData);
        const errorMsg = typeof parsed.error === 'string' ? parsed.error : 'Unknown SSE error';
        if (onError) onError(errorMsg);
        handleSSEError(errorMsg);
      });

    } catch (err) {
      console.error('[SSE] Connection failed:', err);
      setError('Failed to connect to SSE');
    }
  };

  const handleTaskAssigned = (data: unknown) => {
    const record = asRecord(data);
    const taskId = String(record.task_id ?? '');
    const assignedTo = String(record.assigned_to ?? '');
    toast({
      title: "New Task Assigned",
      description: `Task ${taskId} assigned to ${assignedTo}`,
      duration: 3000
    });
    // Trigger global event for components
    window.dispatchEvent(new CustomEvent('taskAssigned', { detail: data }));
  };

  const handleTaskCompleted = (data: unknown) => {
    const record = asRecord(data);
    const taskId = String(record.task_id ?? '');
    toast({
      title: "Task Completed",
      description: `Task ${taskId} completed`,
      duration: 3000
    });
    // Trigger global event for components
    window.dispatchEvent(new CustomEvent('taskCompleted', { detail: data }));
  };

  const handleEmployeeStatus = (data: unknown) => {
    // Trigger global event for components
    window.dispatchEvent(new CustomEvent('employeeStatusUpdate', { detail: data }));
  };

  const handleSLABreach = (data: unknown) => {
    const record = asRecord(data);
    const taskId = String(record.task_id ?? '');
    const hoursOverdue = String(record.hours_overdue ?? '');
    toast({
      title: "SLA Breach Alert",
      description: `Task ${taskId} is ${hoursOverdue} hours overdue`,
      variant: "destructive",
      duration: 5000
    });
    // Trigger global event for components
    window.dispatchEvent(new CustomEvent('slaBreach', { detail: data }));
  };

  const handleSSEError = (error: string) => {
    toast({
      title: "Connection Error",
      description: error,
      variant: "destructive",
      duration: 5000
    });
  };

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
  };

  // Initial connection
  useEffect(() => {
    connect();

    // Cleanup on unmount
    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- connect/disconnect should run only once on mount (preserve existing SSE lifecycle)
  }, []);

  return {
    isConnected,
    lastEvent,
    error,
    disconnect,
    connect
  };
}
