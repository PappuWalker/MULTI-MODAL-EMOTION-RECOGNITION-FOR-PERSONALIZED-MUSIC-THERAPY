import { useEffect, useState } from 'react';

interface SerialConnectionProps {
  onDataReceived: (data: { pulse: number | null; spo2: number | null }) => void;
  onConnectionChange: (connected: boolean) => void;
}

export const SerialConnection = ({ 
  onDataReceived, 
  onConnectionChange
}: SerialConnectionProps) => {
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const MAX_RECONNECT_ATTEMPTS = 20; // Increase maximum attempts

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout;
    let heartbeatInterval: NodeJS.Timeout;
    let connectionCheckInterval: NodeJS.Timeout;

    const connectWebSocket = () => {
      try {
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          console.log("Maximum reconnection attempts reached, but will continue trying periodically");
          // Instead of giving up, we'll try again periodically
          setTimeout(() => {
            setReconnectAttempts(0);
            connectWebSocket();
          }, 10000);
          return;
        }

        // Clear any existing connection
        if (ws) {
          try {
            ws.close();
          } catch (e) {
            console.error("Error closing existing connection:", e);
          }
        }

        const host = window.location.hostname || 'localhost';
        const wsUrl = `ws://${host}:8081`;
        console.log(`Attempting to connect to WebSocket at ${wsUrl}`);
        
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log("WebSocket connected");
          onConnectionChange(true);
          setReconnectAttempts(0);
          
          // Start heartbeat to keep connection alive
          heartbeatInterval = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
              try {
                ws.send('PING');
              } catch (error) {
                console.error("Error sending heartbeat:", error);
              }
            }
          }, 5000); // Shorter heartbeat interval
        };

        ws.onmessage = (event) => {
          try {
            const message = event.data.toString();
            console.log("WebSocket received:", message);
            
            if (message === 'PONG' || message === 'PING' || message === 'CONNECTED') {
              return; // Ignore control messages
            }
            
            if (message === 'NO_FINGER') {
              onDataReceived({ pulse: null, spo2: null });
              return;
            }
          
            // Handle both formats for backward compatibility
            const parts = message.split(':');
            let pulse, spo2;
            
            if (parts.length === 4) { // PULSE:XX:SPO2:XX format
              pulse = parseInt(parts[1]);
              spo2 = parseInt(parts[3]);
              console.log(`Parsed data: pulse=${pulse}, spo2=${spo2}`);
            } else {
              // Fallback to old parsing logic
              const pulseMatch = message.match(/PULSE[:=](\d+)/i);
              const spo2Match = message.match(/SPO2[:=](\d+)/i);
              
              if (pulseMatch) pulse = parseInt(pulseMatch[1]);
              if (spo2Match) spo2 = parseInt(spo2Match[1]);
              console.log(`Fallback parsed: pulse=${pulse}, spo2=${spo2}`);
            }
          
            if (pulse !== undefined && spo2 !== undefined) {
              onDataReceived({ 
                pulse: isNaN(pulse) ? null : pulse, 
                spo2: isNaN(spo2) ? null : spo2 
              });
            }
          } catch (error) {
            console.error("Error processing WebSocket message:", error);
          }
        };

        ws.onclose = (event) => {
          console.log(`WebSocket disconnected (${event.code}): ${event.reason || 'No reason provided'}`);
          onConnectionChange(false);
          clearInterval(heartbeatInterval);
          
          // Attempt reconnection with exponential backoff
          setReconnectAttempts(prev => prev + 1);
          const backoffTime = Math.min(1000 * Math.pow(1.5, Math.min(reconnectAttempts, 10)), 10000);
          
          reconnectTimeout = setTimeout(() => {
            connectWebSocket();
          }, backoffTime);
        };

        ws.onerror = (error) => {
          console.error("WebSocket error:", error);
          // Let onclose handle the reconnection
        };
      } catch (error) {
        console.error("Error connecting to WebSocket:", error);
        onConnectionChange(false);
        
        // Attempt reconnection
        setTimeout(() => {
          connectWebSocket();
        }, 2000);
      }
    };

    connectWebSocket();

    // Set up an interval to check connection status and force reconnect if needed
    connectionCheckInterval = setInterval(() => {
      if (ws && (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING)) {
        console.log("Connection check detected closed WebSocket, attempting to reconnect");
        connectWebSocket();
      }
    }, 10000);

    return () => {
      // Clean up on unmount
      if (ws) {
        try {
          ws.close();
        } catch (e) {
          console.error("Error closing websocket on cleanup:", e);
        }
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
      if (connectionCheckInterval) {
        clearInterval(connectionCheckInterval);
      }
    };
  }, [onConnectionChange, onDataReceived, reconnectAttempts]);

  return null;
};