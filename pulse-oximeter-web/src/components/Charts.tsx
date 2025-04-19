import { Line } from 'react-chartjs-2';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  PointElement, 
  LineElement, 
  Title, 
  Tooltip, 
  Legend 
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface ChartsProps {
  pulseHistory: number[];
  spo2History: number[];
}

export const Charts = ({ pulseHistory, spo2History }: ChartsProps) => {
  const pulseData = {
    labels: pulseHistory.map((_, i) => i + 1),
    datasets: [
      {
        label: 'Pulse Rate (BPM)',
        data: pulseHistory,
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.5)',
        tension: 0.1
      }
    ]
  };

  const spo2Data = {
    labels: spo2History.map((_, i) => i + 1),
    datasets: [
      {
        label: 'Oxygen Saturation (%)',
        data: spo2History,
        borderColor: 'rgb(54, 162, 235)',
        backgroundColor: 'rgba(54, 162, 235, 0.5)',
        tension: 0.1
      }
    ]
  };

  return (
    <div className="charts">
      <h2>Trends</h2>
      <div className="chart-container">
        <div className="chart">
          <h3>Pulse Rate</h3>
          <Line data={pulseData} />
        </div>
        <div className="chart">
          <h3>Oxygen Saturation</h3>
          <Line data={spo2Data} />
        </div>
      </div>
    </div>
  );
};