import { useEffect, useState } from 'react';
import { useWebSocket } from './useWebSocket';
import { useServerSentEvents } from './useServerSentEvents';

interface UseRealTimeUpdatesOptions {
  employeeCode?: string;
  token?: string;
  preferSSE?: boolean; // Use SSE for one-way updates
  onTaskAssigned?: (data: unknown) => void;
  onTaskCompleted?: (data: unknown) => void;
  onEmployeeStatus?: (data: unknown) => void;
  onSLABreach?: (data: unknown) => void;
  onConnectionChange?: (connected: boolean, method: 'websocket' | 'sse') => void;
}

export function useRealTimeUpdates(options: UseRealTimeUpdatesOptions = {}) {
  const [connectionMethod, setConnectionMethod] = useState<'websocket' | 'sse' | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const {
    employeeCode,
    token,
    preferSSE = true, // Default to SSE for reliability
    onTaskAssigned,
    onTaskCompleted,
    onEmployeeStatus,
    onSLABreach,
    onConnectionChange
  } = options;

  // WebSocket hook - for two-way communication
  const ws = useWebSocket({
    employeeCode: preferSSE ? undefined : employeeCode,
    token,
    autoReconnect: true
  });

  // SSE hook - for one-way updates
  const sse = useServerSentEvents({
    autoReconnect: true,
    onTaskAssigned,
    onTaskCompleted,
    onEmployeeStatus,
    onSLABreach
  });

  // Determine which connection to use
  useEffect(() => {
    if (preferSSE && employeeCode) {
      // Use SSE for one-way updates (more reliable)
      setConnectionMethod('sse');
      setIsConnected(sse.isConnected);
    } else if (!preferSSE && employeeCode) {
      // Use WebSocket for two-way communication
      setConnectionMethod('websocket');
      setIsConnected(ws.isConnected);
    }

    // Notify parent of connection changes
    if (onConnectionChange) {
      onConnectionChange(isConnected, connectionMethod!);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- preserve current behavior: only re-evaluate when specific props change
  }, [preferSSE, employeeCode, sse.isConnected, ws.isConnected]);

  // Send message function (only works with WebSocket)
  const sendMessage = (message: unknown) => {
    if (connectionMethod === 'websocket') {
      ws.sendMessage(message);
    } else {
      console.warn('[RealTime] Cannot send message via SSE - use WebSocket');
    }
  };

  // Combined connection status
  const effectivelyConnected = connectionMethod === 'sse' ? sse.isConnected : 
                         connectionMethod === 'websocket' ? ws.isConnected : false;

  return {
    isConnected: effectivelyConnected,
    connectionMethod,
    lastMessage: connectionMethod === 'websocket' ? ws.lastMessage : sse.lastEvent,
    error: connectionMethod === 'websocket' ? ws.error : sse.error,
    sendMessage, // Only available with WebSocket
    disconnect: connectionMethod === 'websocket' ? ws.disconnect : sse.disconnect,
    reconnect: connectionMethod === 'websocket' ? ws.connect : sse.connect,
    
    // Expose both for advanced usage
    websocket: ws,
    sse
  };
}
