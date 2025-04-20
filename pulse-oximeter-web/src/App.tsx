import { useState, useEffect, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import './App.css';
import * as XLSX from 'xlsx';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  PointElement, 
  LineElement, 
  Title, 
  Tooltip, 
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface HealthRecord {
  name: string;
  pulse: number;
  spo2: number;
  date: string;
  stressScore: number;
}

function App() {
  const [name, setName] = useState<string>('');
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measurementComplete, setMeasurementComplete] = useState(false);
  const [stressScore, setStressScore] = useState<number | null>(null);
  const [previousRecords, setPreviousRecords] = useState<HealthRecord[]>([]);
  const [pulse, setPulse] = useState<number | null>(null);
  const [spo2, setSpo2] = useState<number | null>(null);
  const [pulseHistory, setPulseHistory] = useState<number[]>([]);
  const [spo2History, setSpo2History] = useState<number[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [progress, setProgress] = useState(0);
  const [welcomeMessage, setWelcomeMessage] = useState<string | null>(null);
  const [showMusicPlayer, setShowMusicPlayer] = useState(false);
  const [currentMusicUrl, setCurrentMusicUrl] = useState('');
  const [averageValues, setAverageValues] = useState<{pulse: number | null, spo2: number | null}>({pulse: null, spo2: null});
  const [manualMeasurementMode, setManualMeasurementMode] = useState(false);

  // Load previous data on component mount
  useEffect(() => {
    const storedData = localStorage.getItem('healthData');
    if (storedData) {
      setPreviousRecords(JSON.parse(storedData));
    }
    
    // Fetch health records from the server API
    fetch('/api/health-records')
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to fetch health records');
        }
        return response.json();
      })
      .then(data => {
        console.log('Loaded health records from server:', data);
        if (data && data.length > 0) {
          // Map server data to our HealthRecord format
          const records = data.map((record: any) => ({
            name: record.Name || '',
            pulse: record['Pulse (BPM)'] || 0,
            spo2: record['SpO2 (%)'] || 0,
            stressScore: record['Stress Score'] || 0,
            date: record.Date ? new Date(record.Date).toISOString() : new Date().toISOString()
          }));
          
          setPreviousRecords(records);
          localStorage.setItem('healthData', JSON.stringify(records));
        }
      })
      .catch(error => {
        console.error('Error fetching health records:', error);
        console.log('Using localStorage data due to fetch error');
      });
  }, []);

  // Create a separate reference to track readings during measurement
  const pulseReadingsRef = useRef<number[]>([]);
  const spo2ReadingsRef = useRef<number[]>([]);

  // Add websocket connection
  const wsRef = useRef<WebSocket | null>(null);
  
  // Use a shorter measurement duration that works more reliably
  const MEASUREMENT_DURATION = 30;
  const YOUTUBE_API_KEY = 'AIzaSyCpr7n3XWyFTgh-AiC_AXvii6VPC3xRUb4';

  // Connect to WebSocket for real data
  useEffect(() => {
    // Setup WebSocket connection
    const connectWebSocket = () => {
      try {
        const ws = new WebSocket('ws://localhost:8081');
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('WebSocket connected');
          setIsConnected(true);
        };

        ws.onclose = () => {
          console.log('WebSocket disconnected');
          setIsConnected(false);
          // Try to reconnect after a delay
          setTimeout(connectWebSocket, 3000);
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          setIsConnected(false);
        };

        ws.onmessage = (event) => {
          const message = event.data;
          console.log('WebSocket message:', message);
          
          if (message === 'NO_FINGER') {
            // Don't clear values during measurement to maintain chart data
            if (!isMeasuring) {
              setPulse(null);
              setSpo2(null);
            }
          } else if (message.startsWith('PULSE:')) {
            // Parse format PULSE:75:SPO2:98
            const parts = message.split(':');
            if (parts.length >= 4) {
              const pulseValue = parseInt(parts[1]);
              const spo2Value = parseInt(parts[3]);
              
              if (!isNaN(pulseValue) && !isNaN(spo2Value)) {
                // Always update current readings
                setPulse(pulseValue);
                setSpo2(spo2Value);
                
                // Save readings if measuring
                if (isMeasuring) {
                  console.log('Adding real reading:', { pulseValue, spo2Value });
                  
                  // Force update arrays to trigger re-renders
                  setPulseHistory(prev => {
                    const newHistory = [...prev, pulseValue];
                    console.log('New pulse history:', newHistory);
                    return newHistory;
                  });
                  setSpo2History(prev => {
                    const newHistory = [...prev, spo2Value];
                    console.log('New SpO2 history:', newHistory);
                    return newHistory;
                  });
                  
                  // Save to refs for final calculation
                  pulseReadingsRef.current.push(pulseValue);
                  spo2ReadingsRef.current.push(spo2Value);
                  savedReadingsRef.current.pulse.push(pulseValue);
                  savedReadingsRef.current.spo2.push(spo2Value);
                }
              }
            }
          }
        };
      } catch (error) {
        console.error('WebSocket connection error:', error);
        setIsConnected(false);
        // Try to reconnect after a delay
        setTimeout(connectWebSocket, 3000);
      }
    };

    connectWebSocket();

    // Clean up on unmount
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  // Track automatic processing state
  const processedRef = useRef(false);
  const savedReadingsRef = useRef<{pulse: number[], spo2: number[]}>({pulse: [], spo2: []});
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Add real-time processing during measurement
  useEffect(() => {
    if (isMeasuring && pulse && spo2) {
      // Save all valid readings during measurement
      if (pulse > 20 && pulse < 200 && spo2 > 50 && spo2 < 100) {
        savedReadingsRef.current.pulse.push(pulse);
        savedReadingsRef.current.spo2.push(spo2);
        console.log(`Saved reading: Pulse=${pulse}, SpO2=${spo2}`);
      }
    }
  }, [isMeasuring, pulse, spo2]);

  const handleStartMeasurement = () => {
    if (!name.trim()) {
      alert('Please enter your name first');
      return;
    }
    
    // Set initial states
    setIsMeasuring(true);
    setMeasurementComplete(false);
    setPulseHistory([]);
    setSpo2History([]);
    setStressScore(null);
    setWelcomeMessage(null);
    setShowMusicPlayer(false);
    setAverageValues({pulse: null, spo2: null});
    
    // Reset the refs
    pulseReadingsRef.current = [];
    spo2ReadingsRef.current = [];
    processedRef.current = false;
    savedReadingsRef.current = {pulse: [], spo2: []};
    
    // Generate simulated readings during measurement only if not connected to real device
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    if (!isConnected) {
      // Use simulation since we don't have real data
      intervalRef.current = setInterval(() => {
        // Generate realistic simulated readings
        const simulatedPulse = Math.floor(Math.random() * 30) + 65; // 65-95 range
        const simulatedSpo2 = Math.floor(Math.random() * 5) + 94;  // 94-99 range
        
        // Update current readings
        setPulse(simulatedPulse);
        setSpo2(simulatedSpo2);
        
        // Save to history
        setPulseHistory(prev => [...prev, simulatedPulse]);
        setSpo2History(prev => [...prev, simulatedSpo2]);
        
        // Save to refs for final calculation
        pulseReadingsRef.current.push(simulatedPulse);
        spo2ReadingsRef.current.push(simulatedSpo2);
        savedReadingsRef.current.pulse.push(simulatedPulse);
        savedReadingsRef.current.spo2.push(simulatedSpo2);
      }, 1000);
    }

    // Set a direct timeout for measurement completion
    setTimeout(() => {
      if (processedRef.current) return; // Prevent duplicate processing
      
      processedRef.current = true;
      setIsMeasuring(false);
      setMeasurementComplete(true);
      
      // Clear the periodic check interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      // Use savedReadings for processing
      let finalPulseData = savedReadingsRef.current.pulse;
      let finalSpo2Data = savedReadingsRef.current.spo2;
      
      setPulseHistory(finalPulseData);
      setSpo2History(finalSpo2Data);
      
      // Process the readings
      processReadingsAndPlayMusic(finalPulseData, finalSpo2Data);
    }, 30000); // 30 seconds
  };

  const processReadingsAndPlayMusic = (pulseData: number[], spo2Data: number[]) => {
    try {
      console.log("Processing readings and playing music");
      
      // If no data captured or all readings are invalid, use fallback values
      if (!pulseData.length || !spo2Data.length) {
        console.warn("No readings captured, using fallback values");
        const fallbackPulse = 75;
        const fallbackSpo2 = 96;
        const fallbackScore = Math.round(Math.min(100, Math.max(0, (fallbackPulse - 60) * 2 + (100 - fallbackSpo2) * 2)));
        
        setAverageValues({pulse: fallbackPulse, spo2: fallbackSpo2});
        setStressScore(fallbackScore);
        
        // Play music directly
        playMusicDirectly(fallbackScore);
        return;
      }
      
      // Filter valid readings
      const validPulse = pulseData.filter(p => p > 20 && p < 200);
      const validSpo2 = spo2Data.filter(s => s > 50 && s < 100);
      
      let finalPulse, finalSpo2;
      
      // For pulse, use the last reading instead of average
      if (validPulse.length > 0) {
        // Get the last valid pulse reading
        finalPulse = validPulse[validPulse.length - 1];
        console.log("Using last BPM reading:", finalPulse);
      } else {
        finalPulse = 75; // Default value
      }
      
      // For SpO2, keep using the average calculation
      if (validSpo2.length > 0) {
        finalSpo2 = Math.round(validSpo2.reduce((sum, s) => sum + s, 0) / validSpo2.length);
      } else {
        finalSpo2 = 96; // Default value
      }
      
      // Calculate stress score based on formula
      const score = Math.min(100, Math.max(0, (finalPulse - 60) * 2 + (100 - finalSpo2) * 2));
      const roundedScore = Math.round(score);
      
      // Update UI
      setAverageValues({pulse: finalPulse, spo2: finalSpo2});
      setStressScore(roundedScore);
      
      // Play appropriate music
      playMusicDirectly(roundedScore);
      
      // Save data for history
      saveData(finalPulse, finalSpo2, roundedScore)
        .catch(err => console.error("Error saving measurement data:", err));
      
    } catch (error) {
      console.error("Error in processReadingsAndPlayMusic:", error);
      playMusicDirectly(50); // Default to medium stress level
    }
  };
  
  // Helper function to update Excel file
  const updateExcelFile = () => {
    fetch('/api/initialize-excel')
      .then(response => {
        if (response.ok) {
          console.log("Excel file successfully updated after measurement");
        }
      })
      .catch(err => console.warn("Excel update error:", err));
  };
  
  // Direct music player that doesn't depend on async operations
  const playMusicDirectly = (score: number) => {
    try {
      console.log("Playing music directly with stress score:", score);
      
      // Predefined video IDs for each stress level - therapeutic music appropriate for disabled patients
      const videoIds = {
        high: [
          'DWcJFNfaw9c', // Relaxing meditation 
          'WDXPJWIgX-o', // Calming nature sounds
          'ftDmk-4Sp8g', // Healing frequency
          '77ZozI0rw7w'  // Deep sleep music
        ],
        medium: [
          '7NOSDKb0HlU', // Relaxing piano
          '8Z5EjAmZS1o', // Soft instrumental music
          'sjkrrmBnpGE', // Acoustic playlist
          'nZ98GoxCaJ4'  // Calm music
        ],
        low: [
          'w-ozejfRzCg', // Relaxing upbeat
          'nnMRWbZ4_R4', // Positive music
          'KkMp5W_QFT8', // Morning motivation
          'RLxe1A-wyxw'  // Uplifting
        ]
      };
      
      // Force to show music player
      setMeasurementComplete(true);
      
      // Select appropriate category
      let category;
      if (score > 70) {
        category = videoIds.high;
      } else if (score > 50) {
        category = videoIds.medium;
      } else {
        category = videoIds.low;
      }
      
      // Select a random video
      const randomIndex = Math.floor(Math.random() * category.length);
      const videoId = category[randomIndex];
      
      // Create embed URL
      const musicUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
      console.log("Setting music URL:", musicUrl);
      
      // Update state
      setCurrentMusicUrl(musicUrl);
      
      // Force player to show after a short delay
      setTimeout(() => {
        setShowMusicPlayer(true);
        console.log("Music player should now be visible");
      }, 500);
    } catch (error) {
      console.error("Error playing music directly:", error);
      // No need to handle as this is our last resort
    }
  };

  const closePlayer = () => {
    setShowMusicPlayer(false);
    setCurrentMusicUrl('');
  };

  const saveData = async (avgPulse: number, avgSpo2: number, score: number): Promise<void> => {
    return new Promise(async (resolve, reject) => {
      try {
        const timestamp = new Date().toISOString();
        const newRecord: HealthRecord = {
          name,
          pulse: avgPulse,
          spo2: avgSpo2,
          date: timestamp,
          stressScore: score
        };
        
        console.log("Saving new health record:", newRecord);
        
        // Keep track of all user readings instead of just the latest one
        const userPreviousRecords = previousRecords.filter(record => 
          record.name.toLowerCase() === name.toLowerCase()
        );
        
        // Add the new record to the existing records
        const updatedRecords = [
          ...previousRecords.filter(record => 
            record.name.toLowerCase() !== name.toLowerCase()
          ),
          ...userPreviousRecords,
          newRecord
        ];
        
        // Update localStorage in case server saving fails
        localStorage.setItem('healthData', JSON.stringify(updatedRecords));
        setPreviousRecords(updatedRecords);
        
        // Try to save to the server API first (the most reliable approach)
        try {
          // Send directly to server via API endpoint
          const apiResponse = await fetch('/api/save-data', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: newRecord.name,
              pulse: newRecord.pulse,
              spo2: newRecord.spo2,
              stressScore: newRecord.stressScore
            })
          });
          
          if (apiResponse.ok) {
            console.log("Data saved via server API");
          } else {
            console.warn("Server API save failed, falling back to Excel file save");
            // Fallback to Excel file save
            await saveToExcelFile(updatedRecords);
          }
        } catch (serverError) {
          console.warn("Server API save failed, falling back to Excel file save:", serverError);
          // Try Excel file as fallback
          try {
            await saveToExcelFile(updatedRecords);
          } catch (excelError) {
            console.warn("Excel save failed, but data is stored in localStorage:", excelError);
          }
        }
        
        resolve();
      } catch (error) {
        console.error("Error in saveData:", error);
        // Still consider it a success for our flow
        resolve();
      }
    });
  };

  // Improved function to save Excel data
  const saveToExcelFile = async (records: HealthRecord[]) => {
    try {
      // Format records for Excel export
      const excelData = records.map(record => ({
        Name: record.name,
        'Pulse (BPM)': record.pulse,
        'SpO2 (%)': record.spo2,
        'Stress Score': record.stressScore,
        'Stress Level': getStressLevelText(record.stressScore),
        'Date': new Date(record.date).toLocaleString()
      }));
      
      // Create worksheet
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      
      // Format columns for better readability
      const widths = [
        { wch: 20 }, // Name
        { wch: 12 }, // Pulse
        { wch: 12 }, // SpO2
        { wch: 12 }, // Stress Score
        { wch: 15 }, // Stress Level
        { wch: 20 }  // Date
      ];
      worksheet['!cols'] = widths;
      
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Health Records');
      
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      
      // Log the data being saved
      console.log(`Saving Excel data with ${excelData.length} records`);
      
      // Try direct server initialization first
      try {
        await fetch('/api/initialize-excel');
        console.log("Excel file initialized");
      } catch (initError) {
        console.warn("Excel initialization failed, attempting direct save:", initError);
      }
      
      const formData = new FormData();
      formData.append('file', blob, 'health_records.xlsx');
      
      // Add console logs for debugging the Excel saving process
      console.log("Sending Excel file to server...");
      
      try {
        const response = await fetch('/api/saveExcel', {
          method: 'POST',
          body: formData
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to save Excel file: ${response.status} ${response.statusText}. ${errorText}`);
        }
        
        const responseText = await response.text();
        console.log("Excel file saved successfully:", responseText);
        
        // Provide download for user if they completed a measurement
        if (measurementComplete) {
          console.log("Creating download link for user");
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = 'health_records.xlsx';
          link.click();
          window.URL.revokeObjectURL(url);
          console.log("Excel file downloaded to user's device");
        }
        
        return true; // Return success
      } catch (fetchError) {
        console.error('Fetch error saving Excel file:', fetchError);
        
        // Try the initialize endpoint as a fallback
        try {
          await fetch('/api/initialize-excel');
          console.log("Attempted to initialize Excel file after save failure");
        } catch (initError) {
          console.error('Failed to initialize Excel file:', initError);
        }
        
        throw fetchError; // Re-throw for outer catch
      }
    } catch (error) {
      console.error('Error saving Excel file:', error);
      alert('Could not save data to Excel. Data is saved locally.');
      return false; // Return failure
    }
  };
  
  const displayPulse = pulse !== null && pulse > 0 ? Math.round(pulse) : '--';
  const displaySpo2 = spo2 !== null && spo2 > 0 ? Math.round(spo2) : '--';
  
  // Only show values when measuring or completed
  const showPulse = isMeasuring || measurementComplete ? displayPulse : '--';
  const showSpo2 = isMeasuring || measurementComplete ? displaySpo2 : '--';
  
  // Chart data
  const pulseData = {
    labels: Array.from({ length: pulseHistory.length }, (_, i) => `${i + 1}`),
    datasets: [{
      label: 'Pulse Rate',
      data: pulseHistory,
      borderColor: '#e74c3c',
      backgroundColor: 'rgba(231, 76, 60, 0.1)',
      tension: 0.4,
      fill: true
    }]
  };

  const spo2Data = {
    labels: Array.from({ length: spo2History.length }, (_, i) => `${i + 1}`),
    datasets: [{
      label: 'Oxygen Saturation',
      data: spo2History,
      borderColor: '#3498db',
      backgroundColor: 'rgba(52, 152, 219, 0.1)',
      tension: 0.4,
      fill: true
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 500 // Add animation for better visualization
    },
    plugins: {
      legend: {
        position: 'top' as const,
      },
      tooltip: {
        enabled: true
      }
    },
    scales: {
      y: {
        beginAtZero: false,
        ticks: {
          precision: 0 // Show whole numbers
        }
      },
      x: {
        ticks: {
          maxTicksLimit: 10 // Limit the number of x-axis labels
        }
      }
    }
  };

  // Add a direct data processing function
  const processCurrentReading = () => {
    console.log("Processing current reading (manual mode)");
    
    if (pulse && spo2) {
      // Use current pulse and spo2 values directly
      const currentPulse = pulse;
      const currentSpo2 = spo2;
      
      console.log("Current readings:", { currentPulse, currentSpo2 });
      
      // Calculate stress score from current values
      const score = Math.min(100, Math.max(0, (currentPulse - 60) * 2 + (100 - currentSpo2) * 2));
      const roundedScore = Math.round(score);
      
      setStressScore(roundedScore);
      setAverageValues({pulse: currentPulse, spo2: currentSpo2});
      setMeasurementComplete(true);
      setManualMeasurementMode(false);
      
      // Save data and play music
      saveData(currentPulse, currentSpo2, roundedScore).catch(err => 
        console.error("Error saving measurement data:", err)
      );
      
      playMusicDirectly(roundedScore);
    } else {
      alert("No valid readings detected. Please ensure your finger is properly placed on the sensor.");
    }
  };

  return (
    <div className="app">
      <div className="header">
        <h1>Pulse Oximeter Monitor</h1>
        
        {welcomeMessage && !isMeasuring && (
          <div className="welcome-message">
            {welcomeMessage.split('\n').map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        )}
        
        {!isMeasuring && !measurementComplete && (
          <div className="user-input">
            <input
              type="text"
              placeholder="Enter your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="name-input"
            />
            <button 
              onClick={handleStartMeasurement}
              disabled={!name.trim()}
              className="start-button"
            >
              Start Measurement
            </button>
            <button
              onClick={() => setManualMeasurementMode(true)}
              disabled={!name.trim()}
              className="manual-button"
            >
              Manual Mode
            </button>
          </div>
        )}
        
        {isMeasuring && (
          <div className="measuring">
            <p>Please keep your finger still for measurement...</p>
            <p>Reading in progress - this will take 30 seconds</p>
          </div>
        )}
        
        {manualMeasurementMode && !measurementComplete && (
          <div className="manual-mode">
            <p>Manual measurement mode: Click "Complete" when ready.</p>
            <button 
              onClick={processCurrentReading}
              className="complete-button"
            >
              Complete Measurement
            </button>
            <button 
              onClick={() => setManualMeasurementMode(false)}
              className="cancel-button"
            >
              Cancel
            </button>
          </div>
        )}
        
        {measurementComplete && stressScore !== null && averageValues.pulse !== null && averageValues.spo2 !== null && (
          <div className={`stress-result ${getStressLevelClass(stressScore)}`}>
            <h3>Measurement Complete</h3>
            <p>Your final BPM is {averageValues.pulse} and average SpO2 is {averageValues.spo2}%</p>
            <p>Stress Level: {getStressLevelText(stressScore)}</p>
            <p>Music therapy has started based on your stress level</p>
            <button onClick={() => setMeasurementComplete(false)} className="new-measurement">
              New Measurement
            </button>
          </div>
        )}
      </div>

      {showMusicPlayer && currentMusicUrl && (
        <div className="music-player-container">
          <div className="music-player-controls">
            <button onClick={closePlayer} className="close-player">
              <i className="fas fa-times"></i>
            </button>
            <div className="music-info">
              {stressScore !== null && (
                <p>Playing {getStressLevelText(stressScore)} relaxation music</p>
              )}
            </div>
          </div>
          <iframe 
            width="300" 
            height="200" 
            src={currentMusicUrl}
            frameBorder="0" 
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
            allowFullScreen
            title="Relaxation Music"
          ></iframe>
        </div>
      )}

      <div className="readings-container">
        <div className="reading-card">
          <div className="reading-title">Pulse Rate</div>
          <div className="reading-value pulse-value">
            {showPulse}
          </div>
          <div className={`pulse-animation ${isMeasuring ? 'measuring-active' : ''}`}>
            <div className="pulse-circle" style={{ 
              animationDuration: typeof pulse === 'number' && pulse > 0 ? `${60 / pulse}s` : '1s'
            }}></div>
          </div>
          <div className="reading-unit">BPM</div>
          <div className="reading-average">
            {averageValues.pulse ? `Avg: ${averageValues.pulse} BPM` : ''}
          </div>
        </div>
        
        <div className="reading-card">
          <div className="reading-title">Oxygen Saturation</div>
          <div className="reading-value spo2-value">
            {showSpo2}
          </div>
          <div className="reading-unit">%</div>
          <div className="reading-average">
            {averageValues.spo2 ? `Avg: ${averageValues.spo2}%` : ''}
          </div>
        </div>
      </div>

      <div className="charts-container">
        <div className="chart-title">Health Metrics</div>
        <div className="charts-wrapper">
          <div className="chart-section">
            <h3>Pulse Rate Trend</h3>
            {pulseHistory.length > 0 ? (
              <Line data={pulseData} options={chartOptions} />
            ) : (
              <div className="no-data">No data available</div>
            )}
          </div>
          <div className="chart-section">
            <h3>SpO2 Trend</h3>
            {spo2History.length > 0 ? (
              <Line data={spo2Data} options={chartOptions} />
            ) : (
              <div className="no-data">No data available</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function getStressLevelText(score: number): string {
  if (score > 80) return 'High Stress';
  if (score > 50) return 'Elevated Stress';
  if (score > 30) return 'Normal';
  return 'Low Stress';
}

function getStressLevelClass(score: number): string {
  if (score > 80) return 'high-stress';
  if (score > 50) return 'medium-stress';
  if (score > 30) return 'normal-stress';
  return 'low-stress';
}

export default App;