const { SerialPort } = require('serialport');
const { WebSocketServer } = require('ws');

// Configure serial port with a more generous timeout and auto-reopen
const port = new SerialPort({
  path: 'COM6', // Update with your correct port
  baudRate: 9600,
  autoOpen: true,
  rtscts: false, // Hardware flow control off
  hupcl: false, // Don't drop DTR on close
});

// Set up WebSocket server with more robust configuration
const wss = new WebSocketServer({ 
  port: 8081,
  clientTracking: true,
  perMessageDeflate: false // Disable compression for better stability
});

console.log("WebSocket Server running on ws://localhost:8081");

// Track serial port states
let isPortConnected = false;

// Handle serial port errors and reconnection
port.on('error', (err) => {
  console.error('Serial port error:', err.message);
  isPortConnected = false;
  
  // Try to reopen if closed due to error
  setTimeout(() => {
    if (!isPortConnected && !port.isOpen) {
      console.log('Attempting to reopen serial port...');
      port.open((err) => {
        if (err) {
          console.error('Failed to reopen serial port:', err.message);
        } else {
          console.log('Serial port reopened successfully');
          isPortConnected = true;
        }
      });
    }
  }, 2000);
});

// Handle serial port open
port.on('open', () => {
  console.log('Serial port opened successfully');
  isPortConnected = true;
});

// Handle serial port close
port.on('close', () => {
  console.log('Serial port closed');
  isPortConnected = false;
});

// Process data from serial port
port.on('data', (data) => {
  try {
    const text = data.toString().trim();
    console.log("Serial received:", text);
    
    // Match both formats: PULSE:XX,SPO2:XX and PULSE:XX:SPO2:XX
    const pulseMatch = text.match(/PULSE[:=](\d+)/i);
    const spo2Match = text.match(/SPO2[:=](\d+)/i);

    if (pulseMatch && spo2Match) {
      const pulse = parseInt(pulseMatch[1]);
      const spo2 = parseInt(spo2Match[1]);
      
      console.log(`Parsed values: pulse=${pulse}, spo2=${spo2}`);
      
      // More lenient validation - only filter out clearly impossible values
      if (pulse > 10 && spo2 > 10) { // Changed from 30/70 thresholds
        const message = `PULSE:${pulse}:SPO2:${spo2}`;
        console.log("Sending to clients:", message);
        
        // Broadcast to all connected WebSocket clients
        broadcastToClients(message);
        return;
      }
    }
    
    // If we get here, send no-finger signal
    console.log("No valid data found, sending NO_FINGER");
    broadcastToClients('NO_FINGER');
  } catch (err) {
    console.error('Error processing serial data:', err);
  }
});

// WebSocket server error handling
wss.on('error', (error) => {
  console.error('WebSocket server error:', error);
});

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`New WebSocket connection from ${clientIp}`);
  
  // Send initial connection success message
  try {
    ws.send('CONNECTED');
  } catch (err) {
    console.error('Error sending initial connection message:', err);
  }
  
  // Handle WebSocket messages
  ws.on('message', (message) => {
    try {
      const msgText = message.toString();
      if (msgText === 'PING') {
        ws.send('PONG');
      } else {
        console.log('Received message from client:', msgText);
      }
    } catch (err) {
      console.error('Error processing WebSocket message:', err);
    }
  });
  
  // Handle WebSocket errors
  ws.on('error', (err) => {
    console.error('WebSocket client error:', err);
  });
  
  // Handle WebSocket close
  ws.on('close', (code, reason) => {
    console.log(`WebSocket connection closed: ${code} - ${reason || 'No reason specified'}`);
  });
});

// Function to safely broadcast to all connected clients
function broadcastToClients(message) {
  wss.clients.forEach(client => {
    try {
      if (client.readyState === client.OPEN) {
        client.send(message);
      }
    } catch (err) {
      console.error('Error sending to client:', err);
    }
  });
}

// Keep the process running even with errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  // Keep process running
});

console.log('Bridge service running! Press Ctrl+C to exit.');