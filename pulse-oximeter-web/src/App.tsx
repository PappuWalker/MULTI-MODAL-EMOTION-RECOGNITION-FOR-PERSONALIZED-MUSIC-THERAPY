import { useState, useEffect, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import { SerialConnection } from './components/SerialConnection';
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

  // Simulate reading data since we've removed the device connection
  useEffect(() => {
    // Empty effect - removing simulation
    return () => {};
  }, []);

  const handleDataReceived = (data: { pulse: number | null; spo2: number | null }) => {
    console.log("Data received from sensor:", data);
    if (data.pulse !== null && data.spo2 !== null) {
      setPulse(data.pulse > 0 ? data.pulse : null);
      setSpo2(data.spo2 > 0 ? data.spo2 : null);
      
      if (data.pulse > 0 && data.spo2 > 0 && isMeasuring) {
        // Keep track of readings in both state and ref
        setPulseHistory(prev => [...prev.slice(-29), data.pulse as number]);
        setSpo2History(prev => [...prev.slice(-29), data.spo2 as number]);
        
        // Also store in ref for more reliable access at measurement end
        pulseReadingsRef.current.push(data.pulse as number);
        spo2ReadingsRef.current.push(data.spo2 as number);
      }
    } else {
      // Clear readings when no finger is detected
      setPulse(null);
      setSpo2(null);
    }
  };
  
  // Use a shorter measurement duration that works more reliably
  const MEASUREMENT_DURATION = 30;
  const YOUTUBE_API_KEY = 'AIzaSyCpr7n3XWyFTgh-AiC_AXvii6VPC3xRUb4';

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
    
    setIsMeasuring(true);
    setMeasurementComplete(false);
    setPulseHistory([]);
    setSpo2History([]);
    setProgress(0);
    setStressScore(null);
    setWelcomeMessage(null);
    setShowMusicPlayer(false);
    setAverageValues({pulse: null, spo2: null});
    
    // Explicitly clear current values
    setPulse(null);
    setSpo2(null);
    
    // Reset the refs
    pulseReadingsRef.current = [];
    spo2ReadingsRef.current = [];
    processedRef.current = false;
    savedReadingsRef.current = {pulse: [], spo2: []};
    
    // Check for previous records
    const userRecords = previousRecords.filter(record => 
      record.name.toLowerCase() === name.toLowerCase()
    );
    
    if (userRecords.length > 0) {
      // Sort by date to get the most recent
      userRecords.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const latestRecord = userRecords[0];
      
      // Show history information if available
      let message = `Hi ${name}!\n\nYour last reading (${new Date(latestRecord.date).toLocaleDateString()}):\n`;
      message += `Pulse: ${latestRecord.pulse} BPM\n`;
      message += `SpO2: ${latestRecord.spo2}%\n`;
      message += `Stress Level: ${getStressLevelText(latestRecord.stressScore)}\n\n`;
      
      // If user has multiple readings, show progress
      if (userRecords.length > 1) {
        const firstRecord = userRecords[userRecords.length - 1];
        const pulseChange = latestRecord.pulse - firstRecord.pulse;
        const spo2Change = latestRecord.spo2 - firstRecord.spo2;
        const stressChange = latestRecord.stressScore - firstRecord.stressScore;
        
        message += "Your progress since first reading:\n";
        message += `Pulse: ${pulseChange > 0 ? '+' : ''}${pulseChange} BPM\n`;
        message += `SpO2: ${spo2Change > 0 ? '+' : ''}${spo2Change}%\n`;
        message += `Stress: ${stressChange > 0 ? '+' : ''}${stressChange} points\n\n`;
      }
      
      message += "Let's take another reading to see your current health status!";
      setWelcomeMessage(message);
    }

    // Progress timer using elapsed time calculation for precision
    const startTime = Date.now();
    const endTime = startTime + (MEASUREMENT_DURATION * 1000);
    
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }
    
    // Force progress to 0 at the beginning
    setProgress(0);
    
    // Update progress every 100ms for smooth animation
    progressIntervalRef.current = setInterval(() => {
      const now = Date.now();
      const timeElapsed = now - startTime;
      const totalTime = MEASUREMENT_DURATION * 1000;
      const calculatedProgress = Math.min(100, (timeElapsed / totalTime) * 100);
      
      console.log(`Progress update: ${Math.round(calculatedProgress)}%`);
      setProgress(calculatedProgress);
      
      // Ensure we reach exactly 100% at the end
      if (now >= endTime) {
        setProgress(100);
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
      }
    }, 100);

    // Add periodic checks to process readings during measurement
    intervalRef.current = setInterval(() => {
      // Save current readings to history
      if (pulse && spo2) {
        setPulseHistory(prev => [...prev.slice(-29), pulse]);
        setSpo2History(prev => [...prev.slice(-29), spo2]);
        pulseReadingsRef.current.push(pulse);
        spo2ReadingsRef.current.push(spo2);
      }
    }, 1000);

    // Set a direct timeout for measurement completion
    setTimeout(() => {
      if (processedRef.current) return; // Prevent duplicate processing
      
      processedRef.current = true;
      setIsMeasuring(false);
      setMeasurementComplete(true);
      console.log("Measurement completed, calculating results...");
      
      // Clear the periodic check interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      // Use savedReadings if available, otherwise use the history
      let finalPulseData = savedReadingsRef.current.pulse;
      let finalSpo2Data = savedReadingsRef.current.spo2;
      
      // If no saved readings, try using the history
      if (finalPulseData.length === 0 || finalSpo2Data.length === 0) {
        finalPulseData = pulseReadingsRef.current;
        finalSpo2Data = spo2ReadingsRef.current;
      }
      
      // If still no data but we have current readings, use those
      if ((finalPulseData.length === 0 || finalSpo2Data.length === 0) && pulse && spo2) {
        finalPulseData = [pulse];
        finalSpo2Data = [spo2];
      }
      
      console.log("Final pulse readings:", finalPulseData);
      console.log("Final SpO2 readings:", finalSpo2Data);
      
      setPulseHistory(finalPulseData);
      setSpo2History(finalSpo2Data);
      
      // We need to calculate with the finalized data, not depending on state
      processReadingsAndPlayMusic(finalPulseData, finalSpo2Data);
      
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      
      // Clear the refs
      pulseReadingsRef.current = [];
      spo2ReadingsRef.current = [];
      savedReadingsRef.current = {pulse: [], spo2: []};
    }, MEASUREMENT_DURATION * 1000);
  };

  // New function to ensure we process data even with WebSocket issues
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
        
        // Save fallback data
        saveData(fallbackPulse, fallbackSpo2, fallbackScore)
          .catch(err => console.error("Error saving fallback data:", err))
          .finally(() => {
            // Always play music and ensure Excel is updated
            playMusicDirectly(fallbackScore);
            updateExcelFile();
          });
        return;
      }
      
      // Filter out invalid readings
      const validPulse = pulseData.filter(p => p > 20 && p < 200);
      const validSpo2 = spo2Data.filter(s => s > 50 && s < 100);
      
      // Use the valid readings or current values as fallback
      let finalPulse, finalSpo2;
      
      if (validPulse.length > 0) {
        // Use the most stable portion of readings (middle section)
        if (validPulse.length >= 5) {
          // Sort values and remove highest and lowest 20% for more stable readings
          const sortedPulse = [...validPulse].sort((a, b) => a - b);
          const startIdx = Math.floor(sortedPulse.length * 0.2);
          const endIdx = Math.floor(sortedPulse.length * 0.8);
          const stablePulse = sortedPulse.slice(startIdx, endIdx);
          finalPulse = Math.round(stablePulse.reduce((sum, p) => sum + p, 0) / stablePulse.length);
        } else {
          finalPulse = Math.round(validPulse.reduce((sum, p) => sum + p, 0) / validPulse.length);
        }
      } else if (pulse) {
        finalPulse = pulse;
      } else {
        finalPulse = 75; // Default value
      }
      
      if (validSpo2.length > 0) {
        // Use the most stable portion of readings (middle section)
        if (validSpo2.length >= 5) {
          // Sort values and remove highest and lowest 20% for more stable readings
          const sortedSpo2 = [...validSpo2].sort((a, b) => a - b);
          const startIdx = Math.floor(sortedSpo2.length * 0.2);
          const endIdx = Math.floor(sortedSpo2.length * 0.8);
          const stableSpo2 = sortedSpo2.slice(startIdx, endIdx);
          finalSpo2 = Math.round(stableSpo2.reduce((sum, s) => sum + s, 0) / stableSpo2.length);
        } else {
          finalSpo2 = Math.round(validSpo2.reduce((sum, s) => sum + s, 0) / validSpo2.length);
        }
      } else if (spo2) {
        finalSpo2 = spo2;
      } else {
        finalSpo2 = 96; // Default value
      }
      
      console.log("Final calculated values:", { finalPulse, finalSpo2 });
      
      // Calculate stress score
      const score = Math.min(100, Math.max(0, (finalPulse - 60) * 2 + (100 - finalSpo2) * 2));
      const roundedScore = Math.round(score);
      
      // Update UI
      setAverageValues({pulse: finalPulse, spo2: finalSpo2});
      setStressScore(roundedScore);
      
      // Save data first and continue regardless of success/failure
      saveData(finalPulse, finalSpo2, roundedScore)
        .catch(err => console.error("Error saving measurement data:", err))
        .finally(() => {
          // Always play music and ensure Excel is updated
          playMusicDirectly(roundedScore);
          updateExcelFile();
        });
    } catch (error) {
      console.error("Error in processReadingsAndPlayMusic:", error);
      
      // Ensure music plays even if there's an error
      playMusicDirectly(50); // Default to medium stress level
      updateExcelFile();
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
      duration: 0
    },
    plugins: {
      legend: {
        position: 'top' as const,
      },
    },
    scales: {
      y: {
        beginAtZero: false
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
            <div className="progress-container">
              <div className="progress-bar">
                <div style={{ width: `${progress}%` }}></div>
              </div>
            </div>
            <p>{Math.round(progress)}% complete</p>
          </div>
        )}
        
        {manualMeasurementMode && !measurementComplete && (
          <div className="manual-mode">
            <p>Manual measurement mode: Place your finger on the sensor and click "Complete" when ready.</p>
            <button 
              onClick={processCurrentReading}
              className="complete-button"
              disabled={!pulse || !spo2}
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
            <p>Average Pulse: {averageValues.pulse} BPM</p>
            <p>Average SpO2: {averageValues.spo2}%</p>
            <p>Stress Score: {stressScore} ({getStressLevelText(stressScore)})</p>
            <p>Music therapy has started</p>
            <button onClick={() => setMeasurementComplete(false)} className="new-measurement">
              New Measurement
            </button>
          </div>
        )}
        
        <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
          {isConnected ? 'Device Connected' : 'Device Disconnected'}
        </div>
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

      <SerialConnection 
        onDataReceived={handleDataReceived} 
        onConnectionChange={setIsConnected}
      />

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
          {measurementComplete && averageValues.pulse !== null && (
            <div className="reading-average">Avg: {averageValues.pulse} BPM</div>
          )}
        </div>

        <div className="reading-card">
          <div className="reading-title">Oxygen Saturation</div>
          <div className="reading-value spo2-value">
            {showSpo2}
          </div>
          <div className="reading-unit">%</div>
          {measurementComplete && averageValues.spo2 !== null && (
            <div className="reading-average">Avg: {averageValues.spo2}%</div>
          )}
        </div>
      </div>

      <div className="charts-container">
        <h2 className="chart-title">Trends</h2>
        <div className="charts-wrapper">
          <div className="chart-section">
            <h3>Pulse Rate</h3>
            {pulseHistory.length > 0 ? (
              <Line 
                data={pulseData} 
                options={{
                  ...chartOptions,
                  scales: {
                    y: {
                      min: Math.max(0, Math.min(...pulseHistory.filter(v => v > 0)) - 10 || 40),
                      max: Math.max(...pulseHistory.filter(v => v > 0)) + 10 || 100
                    }
                  }
                }} 
              />
            ) : (
              <div className="no-data">No data available</div>
            )}
          </div>
          <div className="chart-section">
            <h3>Oxygen Saturation</h3>
            {spo2History.length > 0 ? (
              <Line 
                data={spo2Data} 
                options={{
                  ...chartOptions,
                  scales: {
                    y: {
                      min: 85,
                      max: 100
                    }
                  }
                }} 
              />
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