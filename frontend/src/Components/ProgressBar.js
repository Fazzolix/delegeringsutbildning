// frontend/src/Components/ProgressBar.js
import React, { useState, useEffect } from 'react';
import './ProgressBar.css';

const ProgressBar = ({ onComplete }) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Simulera en mer realistisk laddning med varierande hastighet
    const intervals = [
      { target: 35, speed: 80 },  // Snabb till 35%
      { target: 60, speed: 120 }, // Lite långsammare till 60%
      { target: 85, speed: 150 }, // Ännu långsammare till 85%
      { target: 100, speed: 100 } // Slutspurt till 100%
    ];
    
    let currentInterval = 0;
    let timer;
    
    const updateProgress = () => {
      setProgress(prev => {
        // Säkerställer att vi inte försöker komma åt en position som inte finns
        if (currentInterval >= intervals.length) {
          clearInterval(timer);
          if (prev >= 100) {
            setTimeout(onComplete, 500); // Liten fördröjning innan omdirigering
          }
          return 100;
        }
        
        const { target, speed } = intervals[currentInterval];
        
        if (prev >= target) {
          currentInterval++;
          
          // Dubbel kontroll för att förhindra att vi går utanför arrayen
          if (currentInterval >= intervals.length) {
            clearInterval(timer);
            if (prev >= 100) {
              setTimeout(onComplete, 500); // Liten fördröjning innan omdirigering
            }
            return 100;
          }
        }
        
        return prev + 1;
      });
    };
    
    timer = setInterval(updateProgress, intervals[0].speed);
    
    return () => {
      clearInterval(timer);
    };
  }, [onComplete]);

  return (
    <div className="progress-bar-container">
      <div className="progress-bar" style={{ width: `${progress}%` }}></div>
    </div>
  );
};

export default ProgressBar;