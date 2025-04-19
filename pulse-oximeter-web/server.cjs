const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const { promisify } = require('util');
const ExcelJS = require('exceljs');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 8080;

// Add promisified functions for better error handling
const fsExists = promisify(fs.exists);
const fsMkdir = promisify(fs.mkdir);
const fsReadFile = promisify(fs.readFile);
const fsWriteFile = promisify(fs.writeFile);
const fsRename = promisify(fs.rename);
const fsCopyFile = promisify(fs.copyFile);

// Sleep function for retry mechanisms
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Create public directory if it doesn't exist
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir);
}

// More reliable Excel file initialization
function initializeExcelFile() {
  try {
    const excelFilePath = path.join(publicDir, 'health_records.xlsx');
    
    // Create a basic template
    const workbook = XLSX.utils.book_new();
    let existingData = [];
    
    // Try to read existing data first
    if (fs.existsSync(excelFilePath)) {
      try {
        const existingWorkbook = XLSX.readFile(excelFilePath);
        const firstSheetName = existingWorkbook.SheetNames[0];
        if (firstSheetName) {
          const worksheet = existingWorkbook.Sheets[firstSheetName];
          existingData = XLSX.utils.sheet_to_json(worksheet) || [];
          console.log(`Read ${existingData.length} existing records from Excel file`);
        }
      } catch (readError) {
        console.error('Error reading existing Excel file:', readError);
        // Continue with an empty workbook if we can't read the existing one
      }
    }
    
    // If no existing data, create a sample record
    if (existingData.length === 0) {
      existingData.push({
        'Name': 'Example User',
        'Pulse (BPM)': 75,
        'SpO2 (%)': 98,
        'Stress Score': 30,
        'Stress Level': 'Normal',
        'Date': new Date().toLocaleString()
      });
    }
    
    // Create the worksheet
    const worksheet = XLSX.utils.json_to_sheet(existingData);
    
    // Set column widths for better readability
    const widths = [
      { wch: 20 }, // Name
      { wch: 12 }, // Pulse
      { wch: 12 }, // SpO2
      { wch: 12 }, // Stress Score
      { wch: 15 }, // Stress Level
      { wch: 20 }  // Date
    ];
    worksheet['!cols'] = widths;
    
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Health Records');
    
    // Write to file with retry mechanism
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        XLSX.writeFile(workbook, excelFilePath);
        console.log('Excel file initialized successfully');
        return true;
      } catch (writeError) {
        attempts++;
        console.error(`Failed to write Excel file (attempt ${attempts}/${maxAttempts}):`, writeError);
        // Wait a bit before retrying
        if (attempts < maxAttempts) {
          require('child_process').execSync('sleep 1');
        }
      }
    }
    
    console.error('Excel file initialization failed after multiple attempts');
    return false;
  } catch (error) {
    console.error('Error initializing Excel file:', error);
    return false;
  }
}

// Initialize the Excel file at startup
initializeExcelFile();

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, publicDir);
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  }
});
const upload = multer({ storage: storage });

// Middleware
app.use(express.static(publicDir));
app.use(express.json());
app.use(cors());

// API endpoint to save Excel file
app.post('/api/saveExcel', upload.single('file'), (req, res) => {
  try {
    console.log("Received Excel file upload request");
    
    if (!req.file) {
      console.error("No file uploaded");
      return res.status(400).send('No file uploaded');
    }
    
    console.log("File details:", {
      filename: req.file.filename,
      path: req.file.path,
      mimetype: req.file.mimetype,
      size: req.file.size
    });
    
    // Verify the file is an Excel file
    if (req.file.mimetype !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      console.error("Invalid file type:", req.file.mimetype);
      fs.unlinkSync(req.file.path); // Delete invalid file
      return res.status(400).send('Invalid file type');
    }
    
    // Ensure the file is moved to the correct location
    const targetPath = path.join(publicDir, 'health_records.xlsx');
    
    // If the uploaded file isn't already at the target path, move it
    if (req.file.path !== targetPath) {
      // Make a backup of the existing file if it exists
      if (fs.existsSync(targetPath)) {
        const backupPath = path.join(publicDir, 'health_records.backup.xlsx');
        try {
          fs.copyFileSync(targetPath, backupPath);
          console.log(`Backup created at ${backupPath}`);
        } catch (backupError) {
          console.warn("Could not create backup:", backupError);
        }
      }
      
      // Safer file move with retries
      let moved = false;
      let attempts = 0;
      const maxAttempts = 3;
      
      while (!moved && attempts < maxAttempts) {
        try {
          fs.renameSync(req.file.path, targetPath);
          moved = true;
          console.log(`File moved to ${targetPath}`);
        } catch (moveError) {
          attempts++;
          console.error(`Move attempt ${attempts} failed:`, moveError);
          
          // Try copy + delete as fallback
          if (attempts === maxAttempts - 1) {
            try {
              fs.copyFileSync(req.file.path, targetPath);
              fs.unlinkSync(req.file.path);
              moved = true;
              console.log(`File copied to ${targetPath} as fallback`);
            } catch (copyError) {
              console.error("Copy fallback failed:", copyError);
            }
          }
          
          // Wait a bit before retrying
          require('child_process').execSync('sleep 1');
        }
      }
      
      if (!moved) {
        return res.status(500).send('Failed to move the Excel file after multiple attempts');
      }
    }
    
    console.log("Excel file saved successfully");
    res.status(200).send('File saved successfully');
  } catch (error) {
    console.error('Error saving file:', error);
    res.status(500).send('Error saving file: ' + error.message);
  }
});

// Add an endpoint to get the saved health records
app.get('/api/health-records', (req, res) => {
  try {
    const filePath = path.join(publicDir, 'health_records.xlsx');
    
    if (!fs.existsSync(filePath)) {
      // Try to initialize the file if it doesn't exist
      if (initializeExcelFile()) {
        console.log("Created Excel file for health records request");
      } else {
        return res.status(404).json({ error: 'Health records file not found and could not be created' });
      }
    }
    
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    
    res.json(data);
  } catch (error) {
    console.error('Error reading health records:', error);
    res.status(500).json({ error: 'Error reading health records' });
  }
});

// Add an API endpoint to initialize/reset the Excel file
app.get('/api/initialize-excel', (req, res) => {
  try {
    console.log("Initializing Excel file...");
    
    if (initializeExcelFile()) {
      res.status(200).send('Excel file initialized successfully');
    } else {
      res.status(500).send('Failed to initialize Excel file');
    }
  } catch (error) {
    console.error('Error initializing Excel file:', error);
    res.status(500).send('Error initializing Excel file: ' + error.message);
  }
});

// New endpoint to save health data directly
app.post('/api/save-data', async (req, res) => {
  try {
    const { name, pulse, spo2, stressScore } = req.body;
    
    // Validate inputs
    if (!name || !pulse || !spo2 || stressScore === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    console.log('Received health data save request:', { name, pulse, spo2, stressScore });
    
    const dataFilePath = path.join(publicDir, 'health_data.json');
    let existingData = [];
    
    // Read existing data if file exists
    if (await fsExists(dataFilePath)) {
      try {
        const fileContent = await fsReadFile(dataFilePath, 'utf8');
        existingData = JSON.parse(fileContent);
        
        if (!Array.isArray(existingData)) {
          existingData = [];
        }
      } catch (readError) {
        console.error('Error reading health data file:', readError);
        // Continue with empty array if file can't be read
      }
    }
    
    // Add new record
    const newRecord = {
      name,
      pulse,
      spo2,
      stressScore,
      date: new Date().toISOString()
    };
    
    existingData.push(newRecord);
    
    // Write data with retry mechanism
    let success = false;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (!success && attempts < maxAttempts) {
      try {
        await fsWriteFile(dataFilePath, JSON.stringify(existingData, null, 2), 'utf8');
        success = true;
        console.log('Health data saved to JSON file successfully');
      } catch (writeError) {
        attempts++;
        console.error(`Failed to write health data (attempt ${attempts}/${maxAttempts}):`, writeError);
        
        // Wait before retrying
        if (attempts < maxAttempts) {
          await sleep(1000);
        }
      }
    }
    
    if (success) {
      // Try to update Excel file as well for consistency
      try {
        // This doesn't need to block the response
        initializeExcelFile();
      } catch (excelError) {
        console.warn('Could not update Excel file after JSON save:', excelError);
      }
      
      res.status(200).json({ message: 'Health data saved successfully' });
    } else {
      res.status(500).json({ error: 'Failed to save health data after multiple attempts' });
    }
  } catch (error) {
    console.error('Error saving health data:', error);
    res.status(500).json({ error: 'Error saving health data: ' + error.message });
  }
});

// WebSocket server for real-time data
const wss = new WebSocketServer({ noServer: true });

// Create HTTP server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Attach WebSocket to the same server
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('New WebSocket connection');
  
  ws.on('message', (message) => {
    try {
      const msgText = message.toString();
      if (msgText === 'PING') {
        ws.send('PONG');
      } else {
        console.log('Received message:', msgText);
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('WebSocket connection closed');
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});