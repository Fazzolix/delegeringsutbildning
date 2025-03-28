// frontend/src/Components/Welcome.js
import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import './Welcome.css';
import ProgressBar from './ProgressBar';

const Welcome = () => {
  const [name, setName] = useState('');
  const [underskoterska, setUnderskoterska] = useState('nej');
  const [delegering, setDelegering] = useState('nej');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Vänligen ange ditt namn');
      return;
    }
    
    setError('');
    // Skicka namn till backend
    axios.post('http://127.0.0.1:5000/api/user', { name })
      .then(response => {
         // Spara uppgifter i localStorage
         localStorage.setItem('userName', name);
         localStorage.setItem('underskoterska', underskoterska);
         localStorage.setItem('delegering', delegering);
         // Visa progressbaren
         setLoading(true);
      })
      .catch(err => {
         console.error('Fel vid sparande av namn:', err);
         setError('Något gick fel. Försök igen.');
      });
  };

  // Callback som anropas när progressbar når 100%
  const handleProgressComplete = () => {
    localStorage.setItem('hasStartedChat', 'true');
    navigate('/chat'); // Omdirigera till chatt-sidan
  };

  return (
    <div className="welcome-container">
      <div className="welcome-card">
        <h1 className="welcome-title">Välkommen till Delegeringsutbildningen</h1>
        
        <div className="welcome-info">
          Denna utbildning är AI-baserad och interaktiv. Här får du lära dig grunderna i delegering och läkemedelstilldelning genom en dynamisk chatt som anpassar sig efter dina svar.
        </div>
        
        {!loading ? (
          <form onSubmit={handleSubmit} className="welcome-form">
            <input
              type="text"
              placeholder="Ange ditt namn"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="welcome-input"
              required
            />
            
            <div className="question-group">
              <p>Är du utbildad undersköterska?</p>
              <div className="radio-option">
                <input
                  id="underskoterska-ja"
                  type="radio"
                  name="underskoterska"
                  value="ja"
                  checked={underskoterska === 'ja'}
                  onChange={(e) => setUnderskoterska(e.target.value)}
                />
                <label htmlFor="underskoterska-ja">Ja</label>
              </div>
              <div className="radio-option">
                <input
                  id="underskoterska-nej"
                  type="radio"
                  name="underskoterska"
                  value="nej"
                  checked={underskoterska === 'nej'}
                  onChange={(e) => setUnderskoterska(e.target.value)}
                />
                <label htmlFor="underskoterska-nej">Nej</label>
              </div>
            </div>
            
            <div className="question-group">
              <p>Har du haft delegering förut?</p>
              <div className="radio-option">
                <input
                  id="delegering-ja"
                  type="radio"
                  name="delegering"
                  value="ja"
                  checked={delegering === 'ja'}
                  onChange={(e) => setDelegering(e.target.value)}
                />
                <label htmlFor="delegering-ja">Ja</label>
              </div>
              <div className="radio-option">
                <input
                  id="delegering-nej"
                  type="radio"
                  name="delegering"
                  value="nej"
                  checked={delegering === 'nej'}
                  onChange={(e) => setDelegering(e.target.value)}
                />
                <label htmlFor="delegering-nej">Nej</label>
              </div>
            </div>
            
            <button type="submit" className="welcome-button">
              Starta utbildningen
            </button>
            
            {error && <p className="welcome-error">{error}</p>}
          </form>
        ) : (
          <>
            <p className="welcome-loading-text">Förbereder din personliga utbildning...</p>
            <ProgressBar onComplete={handleProgressComplete} />
          </>
        )}
      </div>
    </div>
  );
};

export default Welcome;