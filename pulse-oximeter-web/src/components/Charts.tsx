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
import { useEffect, useState } from 'react';

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
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          boxWidth: windowWidth < 768 ? 10 : 40,
          font: {
            size: windowWidth < 768 ? 10 : 12
          }
        }
      },
      tooltip: {
        bodyFont: {
          size: windowWidth < 768 ? 10 : 12
        },
        titleFont: {
          size: windowWidth < 768 ? 12 : 14
        }
      }
    },
    scales: {
      y: {
        beginAtZero: false,
        ticks: {
          font: {
            size: windowWidth < 768 ? 10 : 12
          }
        }
      },
      x: {
        ticks: {
          font: {
            size: windowWidth < 768 ? 10 : 12
          },
          maxRotation: 45,
          minRotation: 45
        }
      }
    }
  };

  const pulseData = {
    labels: pulseHistory.map((_, i) => i + 1),
    datasets: [
      {
        label: 'Pulse Rate (BPM)',
        data: pulseHistory,
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.5)',
        tension: 0.1,
        pointRadius: windowWidth < 768 ? 2 : 3,
        borderWidth: windowWidth < 768 ? 1.5 : 2
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
        tension: 0.1,
        pointRadius: windowWidth < 768 ? 2 : 3,
        borderWidth: windowWidth < 768 ? 1.5 : 2
      }
    ]
  };

  return (
    <div className="charts">
      <h2>Trends</h2>
      <div className="chart-container">
        <div className="chart">
          <h3>Pulse Rate</h3>
          <div style={{ height: windowWidth < 768 ? '180px' : '250px' }}>
            <Line data={pulseData} options={chartOptions} />
          </div>
        </div>
        <div className="chart">
          <h3>Oxygen Saturation</h3>
          <div style={{ height: windowWidth < 768 ? '180px' : '250px' }}>
            <Line data={spo2Data} options={chartOptions} />
          </div>
        </div>
      </div>
    </div>
  );
};