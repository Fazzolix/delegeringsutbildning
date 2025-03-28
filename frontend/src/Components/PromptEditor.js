// frontend/src/Components/PromptEditor.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import './PromptEditor.css';
import API_ENDPOINTS from '../config/api';

const PromptEditor = () => {
  const [promptConfig, setPromptConfig] = useState([]);
  const [originalConfig, setOriginalConfig] = useState([]);
  const [notification, setNotification] = useState({ show: false, type: '', message: '' });
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Hämta den aktuella promptkonfigurationen
    const fetchPromptConfig = async () => {
      try {
        setIsLoading(true);
        const response = await axios.get(API_ENDPOINTS.PROMPT_EDITOR);
        setPromptConfig(response.data.prompt_config);
        setOriginalConfig(JSON.parse(JSON.stringify(response.data.prompt_config)));
        setIsLoading(false);
      } catch (error) {
        console.error('Fel vid hämtning av promptkonfiguration:', error);
        showNotification('error', 'Kunde inte hämta promptkonfigurationen');
        setIsLoading(false);
      }
    };

    fetchPromptConfig();
  }, []);

  const handleSectionTitleChange = (index, newTitle) => {
    const updatedConfig = [...promptConfig];
    updatedConfig[index].title = newTitle;
    setPromptConfig(updatedConfig);
  };

  const handleSectionContentChange = (index, newContent) => {
    const updatedConfig = [...promptConfig];
    updatedConfig[index].content = newContent;
    setPromptConfig(updatedConfig);
  };

  const handleAddSection = () => {
    const newSection = {
      title: 'Ny sektion',
      content: 'Sektionsinnehåll här...'
    };
    setPromptConfig([...promptConfig, newSection]);
  };

  const handleRemoveSection = (index) => {
    const updatedConfig = [...promptConfig];
    updatedConfig.splice(index, 1);
    setPromptConfig(updatedConfig);
  };

  const handleMoveSection = (index, direction) => {
    if (
      (direction === 'up' && index === 0) || 
      (direction === 'down' && index === promptConfig.length - 1)
    ) {
      return;
    }

    const updatedConfig = [...promptConfig];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    // Byt plats på sektionerna
    [updatedConfig[index], updatedConfig[targetIndex]] = 
    [updatedConfig[targetIndex], updatedConfig[index]];
    
    setPromptConfig(updatedConfig);
  };

  const showNotification = (type, message) => {
    setNotification({ show: true, type, message });
    setTimeout(() => {
      setNotification({ show: false, type: '', message: '' });
    }, 3000);
  };

  const handleSave = async () => {
    try {
      await axios.post(API_ENDPOINTS.PROMPT_EDITOR, {
        prompt_config: promptConfig
      });
      showNotification('success', 'Promptkonfigurationen har sparats');
      setOriginalConfig(JSON.parse(JSON.stringify(promptConfig)));
    } catch (error) {
      console.error('Fel vid sparande av promptkonfiguration:', error);
      showNotification('error', 'Kunde inte spara promptkonfigurationen');
    }
  };

  const handleRevert = () => {
    setPromptConfig(JSON.parse(JSON.stringify(originalConfig)));
    showNotification('success', 'Ändringar återställda');
  };

  const hasUnsavedChanges = () => {
    return JSON.stringify(promptConfig) !== JSON.stringify(originalConfig);
  };

  const goToChat = () => {
    if (hasUnsavedChanges()) {
      if (window.confirm('Du har osparade ändringar. Vill du fortsätta utan att spara?')) {
        navigate('/chat');
      }
    } else {
      navigate('/chat');
    }
  };

  if (isLoading) {
    return (
      <div className="prompt-editor-container">
        <div className="prompt-editor-header">
          <h1>Laddar promptkonfiguration...</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="prompt-editor-container">
      <div className="prompt-editor-header">
        <h1>Redigera Promptkonfiguration</h1>
        <div className="prompt-editor-actions">
          <button 
            className="cancel-button" 
            onClick={goToChat}
          >
            Tillbaka till chatten
          </button>
          <button 
            className="revert-button" 
            onClick={handleRevert} 
            disabled={!hasUnsavedChanges()}
          >
            Återställ ändringar
          </button>
          <button 
            className="save-button" 
            onClick={handleSave} 
            disabled={!hasUnsavedChanges()}
          >
            Spara ändringar
          </button>
        </div>
      </div>

      {/* Sektioner */}
      {promptConfig.map((section, index) => (
        <div key={index} className="prompt-section">
          <div className="prompt-section-header">
            <div className="prompt-section-title">
              <span className="section-icon">📝</span>
              <input
                type="text"
                value={section.title}
                onChange={(e) => handleSectionTitleChange(index, e.target.value)}
                placeholder="Sektionstitel"
              />
            </div>
            <div className="section-actions">
              <button 
                onClick={() => handleMoveSection(index, 'up')} 
                disabled={index === 0}
                title="Flytta upp"
              >
                ⬆️
              </button>
              <button 
                onClick={() => handleMoveSection(index, 'down')} 
                disabled={index === promptConfig.length - 1}
                title="Flytta ner"
              >
                ⬇️
              </button>
              <button 
                onClick={() => handleRemoveSection(index)}
                title="Ta bort sektion"
              >
                🗑️
              </button>
            </div>
          </div>
          <div className="section-content">
            <textarea
              value={section.content}
              onChange={(e) => handleSectionContentChange(index, e.target.value)}
              placeholder="Sektionsinnehåll"
            />
          </div>
        </div>
      ))}

      <button className="add-section-button" onClick={handleAddSection}>
        + Lägg till sektion
      </button>

      {notification.show && (
        <div className={`${notification.type}-notification`}>
          {notification.type === 'success' ? '✅' : '❌'} {notification.message}
        </div>
      )}

      <button className="navigation-button" onClick={goToChat}>
        ← Tillbaka till chatten
      </button>
    </div>
  );
};

export default PromptEditor;
