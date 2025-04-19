import { useState, useEffect } from 'react';

interface DataDisplayProps {
  pulse: number | null;
  spo2: number | null;
}

export const DataDisplay = ({ pulse, spo2 }: DataDisplayProps) => {
  const [pulseHistory, setPulseHistory] = useState<number[]>([]);
  const [spo2History, setSpo2History] = useState<number[]>([]);

  useEffect(() => {
    if (pulse !== null) {
      setPulseHistory(prev => [...prev.slice(-9), pulse]);
    }
    if (spo2 !== null) {
      setSpo2History(prev => [...prev.slice(-9), spo2]);
    }
  }, [pulse, spo2]);

  const calculateAverage = (values: number[]) => {
    if (values.length === 0) return null;
    const sum = values.reduce((a, b) => a + b, 0);
    return Math.round(sum / values.length);
  };

  const avgPulse = calculateAverage(pulseHistory);
  const avgSpo2 = calculateAverage(spo2History);

  return (
    <div className="data-display">
      <h2>Current Readings</h2>
      <div className="readings">
        <div className="reading">
          <h3>Pulse Rate</h3>
          <p className="value">{pulse !== null ? pulse : '--'}</p>
          <p className="unit">BPM</p>
          <p className="average">Avg: {avgPulse !== null ? avgPulse : '--'} BPM</p>
        </div>
        <div className="reading">
          <h3>Oxygen Saturation</h3>
          <p className="value">{spo2 !== null ? spo2 : '--'}</p>
          <p className="unit">%</p>
          <p className="average">Avg: {avgSpo2 !== null ? avgSpo2 : '--'}%</p>
        </div>
      </div>
    </div>
  );
};