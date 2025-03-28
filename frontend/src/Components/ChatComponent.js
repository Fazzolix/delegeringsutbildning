// frontend/src/Components/ChatComponent.js
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import axios from 'axios';
import { 
  Button, 
  TextField, 
  Box, 
  Typography, 
  FormControl, 
  FormControlLabel, 
  Radio, 
  Checkbox, 
  FormGroup,
  Paper,
  Grid,
  Alert,
  Card,
  CardContent,
  CardHeader,
  Avatar,
  Chip
} from '@mui/material';
import ReactMarkdown from 'react-markdown';
import { useNavigate } from 'react-router-dom';
import './ChatComponent.css';

// Hjälpfunktion: Tar bort markdown-syntax för TTS
const stripMarkdown = (text) => {
  if (!text) return '';
  return text
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/`{1,3}.*?`{1,3}/g, '')
    .replace(/#+\s*(.*)/g, '$1')
    .replace(/\n/g, ' ')
    .trim();
};

/**
 * Förbättrad funktion för att extrahera JSON från text
 * - Mer robust JSON-detektering med djupare validering
 * - Stöd för alla interaktiva JSON-format som definieras i ai.py
 * - Förbättrad felhantering och debug-loggning
 */
const tryExtractJSON = (text) => {
  if (!text || typeof text !== 'string') return null;
  
  // Lista över alla möjliga nyckelord i våra JSON-format enligt ai.py
  const validKeys = [
    'text', 'suggestions', 'scenario', 'roleplay', 'multipleChoice', 
    'matching', 'ordering', 'feedback', 'media', 'exercise',
    'title', 'description', 'options', 'dialogue', 'learningPoints',
    'correctOption', 'explanation', 'items', 'matches', 'points'
  ];
  
  // 1. Direkta försök att hitta ett giltigt JSON-objekt i texten
  try {
    // Steg 1: Leta efter alla potentiella JSON-objekt med korrekt struktur
    // Förbättrad regex som kan hantera nästlade objekt och arrayer
    const jsonRegex = /{(?:[^{}]|{(?:[^{}]|{[^{}]*})*})*}/g;
    const matches = text.match(jsonRegex);

    if (matches && matches.length > 0) {
      // Försök tolka varje matchning, från längst till kortast (vanligtvis bättre)
      matches.sort((a, b) => b.length - a.length);
      
      for (const match of matches) {
        try {
          const potentialJson = JSON.parse(match);
          
          // Validera att det är ett av våra interaktiva format
          if (potentialJson && 
              typeof potentialJson === 'object' && 
              !Array.isArray(potentialJson) &&
              Object.keys(potentialJson).some(key => validKeys.includes(key))) {
            
            // Ytterligare verifiering för specifika objekt
            if (hasSpecificStructure(potentialJson)) {
              const jsonStart = text.indexOf(match);
              const jsonEnd = jsonStart + match.length;
              
              return {
                preText: text.substring(0, jsonStart).trim(),
                json: potentialJson,
                postText: text.substring(jsonEnd).trim()
              };
            }
          }
        } catch (e) {
          // Denna matchning var inte giltig JSON - fortsätt till nästa
          continue;
        }
      }
    }
    
    // 2. Sök efter specifika JSON-strukturer om den första metoden misslyckas
    // Leta efter tydliga mönster för interaktiv JSON i texten (t.ex. "text" + "suggestions")
    if (text.includes('"text"') && text.includes('"suggestions"')) {
      const potentialStart = text.indexOf('{', text.indexOf('"text"'));
      if (potentialStart !== -1) {
        let bracketCount = 1;
        let potentialEnd = potentialStart + 1;
        
        // Manuell parsning av JSON baserat på balanserade klammerparenteser
        while (bracketCount > 0 && potentialEnd < text.length) {
          if (text[potentialEnd] === '{') bracketCount++;
          else if (text[potentialEnd] === '}') bracketCount--;
          potentialEnd++;
        }
        
        if (bracketCount === 0) {
          try {
            const jsonString = text.substring(potentialStart, potentialEnd);
            const potentialJson = JSON.parse(jsonString);
            
            if (hasSpecificStructure(potentialJson)) {
              return {
                preText: text.substring(0, potentialStart).trim(),
                json: potentialJson,
                postText: text.substring(potentialEnd).trim()
              };
            }
          } catch (e) {
            // Fortsätt till nästa metod
          }
        }
      }
    }
    
    // 3. Sök efter JSON i kodblock
    const jsonBlockMatches = text.match(/```(?:json)?\s*([\s\S]*?)```/g);
    if (jsonBlockMatches && jsonBlockMatches.length > 0) {
      for (const block of jsonBlockMatches) {
        try {
          // Rensa koden från markdown-syntax
          const jsonContent = block.replace(/```(?:json)?\s*|\s*```/g, '');
          const potentialJson = JSON.parse(jsonContent);
          
          if (hasSpecificStructure(potentialJson)) {
            const blockStart = text.indexOf(block);
            const blockEnd = blockStart + block.length;
            
            return {
              preText: text.substring(0, blockStart).trim(),
              json: potentialJson,
              postText: text.substring(blockEnd).trim()
            };
          }
        } catch (e) {
          continue;
        }
      }
    }
  } catch (error) {
    console.error("Fel i JSON-extraktionsprocessen:", error);
  }
  
  // Om alla metoder misslyckades, returnera null
  return null;
};

/**
 * Hjälpfunktion för att validera specifika JSON-strukturer enligt ai.py
 */
const hasSpecificStructure = (json) => {
  // Kontrollera för "text" + "suggestions" struktur
  if (json.text && json.suggestions && Array.isArray(json.suggestions)) {
    return true;
  }
  
  // Kontrollera för "scenario" struktur
  if (json.scenario && typeof json.scenario === 'object' && 
      (json.scenario.description || json.scenario.title)) {
    return true;
  }
  
  // Kontrollera för "roleplay" struktur
  if (json.roleplay && typeof json.roleplay === 'object' && 
      (json.roleplay.dialogue || json.roleplay.scenario)) {
    return true;
  }
  
  // Kontrollera för "multipleChoice" struktur
  if (json.multipleChoice && typeof json.multipleChoice === 'object' && 
      json.multipleChoice.text && json.multipleChoice.options) {
    return true;
  }
  
  // Kontrollera för "matching" struktur
  if (json.matching && typeof json.matching === 'object' && 
      json.matching.items && json.matching.matches) {
    return true;
  }
  
  // Kontrollera för "ordering" struktur
  if (json.ordering && typeof json.ordering === 'object' && 
      json.ordering.items) {
    return true;
  }
  
  // Kontrollera för "feedback" struktur
  if (json.feedback && typeof json.feedback === 'object' && 
      (json.feedback.message || json.feedback.type)) {
    return true;
  }
  
  // Kontrollera för andra interaktiva element
  if (json.media || json.exercise) {
    return true;
  }
  
  return false;
};

// Improved animated display component with smoother transitions
const SmoothTextDisplay = ({ text, onComplete, scrollToBottom, setTextCompletion }) => {
  const [paragraphs, setParagraphs] = useState([]);
  const [visibleParagraphs, setVisibleParagraphs] = useState(0);
  const [progressPercentage, setProgressPercentage] = useState(0);
  const timeoutRef = useRef(null);
  const prevTextRef = useRef('');
  
  // Dela upp texten i logiska stycken när texten ändras
  useEffect(() => {
    if (!text || text === prevTextRef.current) return;
    
    prevTextRef.current = text;
    
    // Improved text splitting with better handling of lists and paragraphs
    const rawText = text.replace(/\r\n/g, '\n');
    
    // First, split by double line breaks to get major paragraphs
    const majorBlocks = rawText.split(/\n\s*\n+/);
    const processedParagraphs = [];
    
    majorBlocks.forEach(block => {
      const trimmedBlock = block.trim();
      if (!trimmedBlock) return;
      
      // Check if this is a list block
      if (/^[\s]*[-*+]\s+/.test(trimmedBlock) || /^[\s]*\d+\.\s+/.test(trimmedBlock)) {
        // This is a list - keep it together as one block
        processedParagraphs.push(trimmedBlock);
      } else if (trimmedBlock.length < 180) {
        // Short paragraph - keep as is
        processedParagraphs.push(trimmedBlock);
      } else {
        // Long paragraph - split into logical chunks by sentences
        const sentences = trimmedBlock.match(/[^.!?]+[.!?]+/g) || [trimmedBlock];
        
        let currentGroup = '';
        sentences.forEach((sentence, i) => {
          const trimmedSentence = sentence.trim();
          
          // Check for transition words that might indicate a new thought
          const isTransition = /^(however|nevertheless|therefore|thus|consequently|furthermore|moreover|in addition|besides|alternatively|meanwhile|conversely|on the other hand|in contrast|similarly|likewise|accordingly|as a result)/i.test(trimmedSentence);
          
          if ((currentGroup.length + trimmedSentence.length > 200) || 
              (currentGroup.length > 0 && isTransition)) {
            processedParagraphs.push(currentGroup.trim());
            currentGroup = trimmedSentence;
          } else {
            currentGroup = currentGroup ? `${currentGroup} ${trimmedSentence}` : trimmedSentence;
          }
          
          if (i === sentences.length - 1 && currentGroup) {
            processedParagraphs.push(currentGroup.trim());
          }
        });
      }
    });
    
    setParagraphs(processedParagraphs);
    setVisibleParagraphs(0);
    setProgressPercentage(0);
  }, [text]);
  
  // Smoother animation with dynamic timing and progress tracking
  useEffect(() => {
    if (visibleParagraphs < paragraphs.length) {
      // Scroll to show new content
      if (visibleParagraphs > 0) {
        setTimeout(scrollToBottom, 50);
      }
      
      // Calculate delay based on paragraph content
      const currentPara = paragraphs[visibleParagraphs] || '';
      
      // Adjust speed based on paragraph type and length for smoother appearance
      let delay = 120; // Faster base delay for smoother animation
      
      // Calculate a more natural reading speed based on content complexity
      const wordCount = currentPara.split(/\s+/).length;
      const hasComplexStructure = /[;:()\[\]{}]/.test(currentPara);
      
      // Lists should appear with a rhythm that feels natural
      if (/^[\s]*[-*+]\s+/.test(currentPara) || /^[\s]*\d+\.\s+/.test(currentPara)) {
        delay = 180;
      } 
      // Questions should appear with emphasis but smoothly
      else if (/\?$/.test(currentPara)) {
        delay = 150;
      }
      // Very short segments should appear quickly but still visibly
      else if (currentPara.length < 40) {
        delay = 80;
      }
      // Longer segments need more time but still flow smoothly
      else {
        // Scale delay based on complexity but keep it reasonable for flow
        const complexity = Math.min(wordCount / 15, 2.5) * (hasComplexStructure ? 1.2 : 1);
        delay += (complexity * 70);
      }
      
      // Calculate and update progress percentage
      const newProgress = Math.round((visibleParagraphs / paragraphs.length) * 100);
      setProgressPercentage(newProgress);
      
      // Update text completion state for early JSON rendering
      if (setTextCompletion && newProgress >= 50) {
        setTextCompletion(0.5); // Signal that text is 50% complete
      }
      
      if (setTextCompletion && newProgress >= 90) {
        setTextCompletion(0.9); // Signal that text is 90% complete
      }
      
      timeoutRef.current = setTimeout(() => {
        setVisibleParagraphs(prev => prev + 1);
      }, delay);
    } else if (paragraphs.length > 0 && visibleParagraphs === paragraphs.length) {
      // Animation complete
      setProgressPercentage(100);
      if (setTextCompletion) setTextCompletion(1); // Signal text is 100% complete
      if (onComplete) {
        onComplete();
      }
    }
    
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [visibleParagraphs, paragraphs, onComplete, scrollToBottom, setTextCompletion]);
  
  // Klicka för att visa hela texten direkt
  const handleClick = () => {
    if (visibleParagraphs < paragraphs.length) {
      clearTimeout(timeoutRef.current);
      setVisibleParagraphs(paragraphs.length);
      setProgressPercentage(100);
      if (setTextCompletion) setTextCompletion(1);
      scrollToBottom();
      if (onComplete) {
        onComplete();
      }
    }
  };
  
  // Bygg upp texten med CSS-animationer för varje stycke
  return (
    <div className="smooth-text" onClick={handleClick} style={{ cursor: visibleParagraphs < paragraphs.length ? 'pointer' : 'auto' }}>
      {paragraphs.slice(0, visibleParagraphs).map((para, index) => (
        <div key={index} className="animate-in-paragraph">
          <ReactMarkdown className="markdown-content">{para}</ReactMarkdown>
        </div>
      ))}
      {visibleParagraphs < paragraphs.length && (
        <span className="typing-cursor"></span>
      )}
    </div>
  );
};

// Enhanced component for animated interactive content with guaranteed animations
const AnimatedInteractiveItem = ({ children, index = 0, isVisible, animationPhase, uniqueId, disabled = false }) => {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const timerRef = useRef(null);
  const instanceIdRef = useRef(`item-${uniqueId || Math.random().toString(36).substring(2)}`);
  
  // Handle initial mounting
  useEffect(() => {
    setMounted(true);
    return () => {
      setMounted(false);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);
  
  // Handle visibility changes with guaranteed animation
  useEffect(() => {
    if (!mounted) return;
    
    if (isVisible) {
      // Reset state first to ensure animation runs
      setVisible(false);
      
      // Use staggered delay based on index and current animation phase
      // Faster appearance when textCompletion is high
      const baseDelay = animationPhase >= 0.9 ? 120 : 180;
      const delay = baseDelay + (index * (animationPhase >= 0.5 ? 120 : 180)); 
      
      // Clear any existing timer
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      
      // Set new timer
      timerRef.current = setTimeout(() => {
        setVisible(true);
      }, delay);
      
      return () => {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }
      };
    } else {
      setVisible(false);
    }
  }, [isVisible, index, mounted, animationPhase]);
  
  if (!isVisible) return null;
  
  return (
    <div 
      id={instanceIdRef.current}
      className={`interactive-item ${visible ? 'animate-in' : ''} ${disabled ? 'inactive-interactive-item' : ''}`} 
      style={{ 
        opacity: visible ? (disabled ? 0.8 : 1) : 0, 
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        transition: 'opacity 0.5s ease-out, transform 0.5s ease-out',
        pointerEvents: visible ? (disabled ? 'none' : 'auto') : 'none', // Prevent interaction when disabled or not visible
      }}
    >
      {children}
    </div>
  );
};

// Multiple choice component
const MultipleChoiceQuestion = ({ question, onAnswer, isSubmitting, disabled = false }) => {
  const [selectedOptions, setSelectedOptions] = useState({});
  
  const handleChange = (id) => {
    if (disabled) return;
    
    if (question.multiSelect) {
      setSelectedOptions(prev => ({
        ...prev,
        [id]: !prev[id]
      }));
    } else {
      // For single select, only allow one selection
      const newSelection = {};
      newSelection[id] = true;
      setSelectedOptions(newSelection);
    }
  };
  
  const handleSubmit = () => {
    if (disabled) return;
    
    const selected = Object.keys(selectedOptions).filter(id => selectedOptions[id]);
    const selectedLabels = selected.map(id => {
      const option = question.options.find(opt => opt.id === id);
      return option ? option.text : '';
    });
    
    onAnswer(selectedLabels.join(', '));
  };
  
  return (
    <div className={`question-container multiple-choice ${disabled ? 'disabled-question' : ''}`}>
      <Typography variant="h6" className="question-title">{question.text}</Typography>
      <FormGroup>
        {question.options.map((option) => (
          <FormControlLabel
            key={option.id}
            control={
              question.multiSelect ? (
                <Checkbox 
                  checked={!!selectedOptions[option.id]}
                  onChange={() => handleChange(option.id)}
                  disabled={isSubmitting || disabled}
                />
              ) : (
                <Radio 
                  checked={!!selectedOptions[option.id]}
                  onChange={() => handleChange(option.id)}
                  disabled={isSubmitting || disabled}
                />
              )
            }
            label={option.text}
          />
        ))}
      </FormGroup>
      <Button 
        variant="contained" 
        color="primary" 
        onClick={handleSubmit}
        disabled={isSubmitting || Object.keys(selectedOptions).filter(k => selectedOptions[k]).length === 0 || disabled}
        className="question-submit-btn"
        sx={{ opacity: disabled ? 0.6 : 1 }}
      >
        Svara
      </Button>
    </div>
  );
};

// Matching question component
const MatchingQuestion = ({ question, onAnswer, isSubmitting, disabled = false }) => {
  const [matches, setMatches] = useState({});
  
  const handleMatch = (itemId, matchId) => {
    if (disabled) return;
    
    setMatches(prev => ({
      ...prev,
      [itemId]: matchId
    }));
  };
  
  const handleSubmit = () => {
    if (disabled) return;
    
    const matchResponse = Object.entries(matches).map(([itemId, matchId]) => {
      const item = question.items.find(i => i.id === itemId);
      const match = question.matches.find(m => m.id === matchId);
      return `${item?.text || ''} → ${match?.text || ''}`;
    }).join(' | ');
    
    onAnswer(matchResponse);
  };
  
  const itemsMatched = Object.keys(matches).length === question.items.length;
  
  return (
    <div className={`question-container matching-question ${disabled ? 'disabled-question' : ''}`}>
      <Typography variant="h6" className="question-title">{question.text}</Typography>
      
      <div className="matching-grid">
        <Grid container spacing={2}>
          {question.items.map((item) => (
            <Grid item xs={12} key={item.id}>
              <Paper elevation={2} className="matching-item">
                <Typography variant="body1" className="item-text">{item.text}</Typography>
                <FormControl fullWidth>
                  <select
                    value={matches[item.id] || ''}
                    onChange={(e) => handleMatch(item.id, e.target.value)}
                    disabled={isSubmitting || disabled}
                    className="matching-select"
                  >
                    <option value="">Välj matchande alternativ...</option>
                    {question.matches.map((match) => (
                      <option 
                        key={match.id} 
                        value={match.id}
                        disabled={(Object.values(matches).includes(match.id) && matches[item.id] !== match.id) || disabled}
                      >
                        {match.text}
                      </option>
                    ))}
                  </select>
                </FormControl>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </div>
      
      <Button 
        variant="contained" 
        color="primary" 
        onClick={handleSubmit}
        disabled={isSubmitting || !itemsMatched || disabled}
        className="question-submit-btn"
        sx={{ opacity: disabled ? 0.6 : 1 }}
      >
        Svara
      </Button>
    </div>
  );
};

// Ordering question component
const OrderingQuestion = ({ question, onAnswer, isSubmitting, disabled = false }) => {
  const [orderedItems, setOrderedItems] = useState([...question.items]);
  
  const moveItem = (index, direction) => {
    if (disabled) return;
    
    if ((direction < 0 && index === 0) || (direction > 0 && index === orderedItems.length - 1)) {
      return;
    }
    
    const newOrder = [...orderedItems];
    const temp = newOrder[index];
    newOrder[index] = newOrder[index + direction];
    newOrder[index + direction] = temp;
    setOrderedItems(newOrder);
  };
  
  const handleSubmit = () => {
    if (disabled) return;
    
    const orderedResponse = orderedItems.map(item => item.text).join(' → ');
    onAnswer(orderedResponse);
  };
  
  return (
    <div className={`question-container ordering-question ${disabled ? 'disabled-question' : ''}`}>
      <Typography variant="h6" className="question-title">{question.text}</Typography>
      
      <div className="ordering-list">
        {orderedItems.map((item, index) => (
          <Paper key={item.id} elevation={2} className="ordering-item">
            <Typography variant="body1">{item.text}</Typography>
            <div className="ordering-controls">
              <Button 
                size="small" 
                variant="outlined" 
                disabled={index === 0 || isSubmitting || disabled}
                onClick={() => moveItem(index, -1)}
                sx={{ opacity: disabled ? 0.6 : 1 }}
              >
                ↑
              </Button>
              <Button 
                size="small" 
                variant="outlined" 
                disabled={index === orderedItems.length - 1 || isSubmitting || disabled}
                onClick={() => moveItem(index, 1)}
                sx={{ opacity: disabled ? 0.6 : 1 }}
              >
                ↓
              </Button>
            </div>
          </Paper>
        ))}
      </div>
      
      <Button 
        variant="contained" 
        color="primary" 
        onClick={handleSubmit}
        disabled={isSubmitting || disabled}
        className="question-submit-btn"
        sx={{ opacity: disabled ? 0.6 : 1 }}
      >
        Svara
      </Button>
    </div>
  );
};

// Scenario component
const ScenarioQuestion = ({ scenario, onAnswer, isSubmitting, disabled = false }) => {
  return (
    <Card className={`scenario-card ${disabled ? 'disabled-scenario' : ''}`}>
      <CardHeader 
        title={scenario.title || "Patientsituation"} 
        className="scenario-header"
      />
      <CardContent>
        <Typography variant="body1" className="scenario-description">
          {scenario.description}
        </Typography>
        
        <div className="scenario-options">
          {scenario.options.map((option, index) => (
            <Button
              key={option.value || index}
              variant="outlined"
              color="primary"
              fullWidth
              disabled={isSubmitting || disabled}
              onClick={() => !disabled && onAnswer(option.label)}
              className="scenario-option-btn"
              sx={{ opacity: disabled ? 0.7 : 1 }}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

// Roleplay component
const RoleplayDialog = ({ roleplay, disabled = false }) => {
  const { title, scenario, dialogue, learningPoints } = roleplay;
  
  // Define role colors and avatars
  const roleStyles = {
    "Sjuksköterska": { bgcolor: "#4caf50", initials: "S" },
    "Sjuksköterska Sara": { bgcolor: "#4caf50", initials: "S" },
    "Läkare": { bgcolor: "#2196f3", initials: "L" },
    "Patient": { bgcolor: "#ff9800", initials: "P" },
    "Undersköterska": { bgcolor: "#9c27b0", initials: "U" },
    "Undersköterska (du)": { bgcolor: "#9c27b0", initials: "U" }
  };
  
  const getInitials = (role) => {
    if (roleStyles[role]) return roleStyles[role].initials;
    return role.charAt(0);
  };
  
  const getColor = (role) => {
    if (roleStyles[role]) return roleStyles[role].bgcolor;
    return "#607d8b"; // Default gray
  };
  
  return (
    <div className={`roleplay-container ${disabled ? 'disabled-roleplay' : ''}`}>
      <div className="roleplay-header">
        <Typography variant="h6">{title}</Typography>
        <Typography variant="body2" className="roleplay-scenario">{scenario}</Typography>
      </div>
      
      <div className="dialogue-container">
        {dialogue.map((entry, index) => (
          <div key={index} className={`dialogue-entry ${entry.role.includes('(du)') ? 'dialogue-user' : ''}`}>
            <Avatar 
              className="dialogue-avatar" 
              sx={{ bgcolor: getColor(entry.role), opacity: disabled ? 0.8 : 1 }}
            >
              {getInitials(entry.role)}
            </Avatar>
            <div className="dialogue-content">
              <Typography variant="subtitle2" className="dialogue-role">{entry.role}</Typography>
              <Typography variant="body1" className="dialogue-message">{entry.message}</Typography>
            </div>
          </div>
        ))}
      </div>
      
      {learningPoints && learningPoints.length > 0 && (
        <div className="learning-points">
          <Typography variant="subtitle1" className="learning-points-header">Viktiga lärdomar:</Typography>
          <ul className="learning-points-list">
            {learningPoints.map((point, index) => (
              <li key={index}>
                <Typography variant="body2">{point}</Typography>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

// Feedback component
const FeedbackComponent = ({ feedback, disabled = false }) => {
  // Define colors for different feedback types
  const feedbackStyles = {
    "knowledge": { color: "#2196f3", icon: "📚", title: "Kunskapstips" },
    "procedure": { color: "#4caf50", icon: "📋", title: "Procedurinformation" },
    "priority": { color: "#ff9800", icon: "⚖️", title: "Prioriteringsråd" },
    "safety": { color: "#f44336", icon: "⚠️", title: "Viktigt säkerhetsråd" }
  };
  
  const style = feedbackStyles[feedback.type] || feedbackStyles.knowledge;
  
  return (
    <Alert 
      severity={feedback.type === "safety" ? "warning" : "info"}
      icon={<span style={{ fontSize: '1.2rem' }}>{style.icon}</span>}
      className={`feedback-alert ${disabled ? 'disabled-feedback' : ''}`}
      sx={{ opacity: disabled ? 0.85 : 1 }}
    >
      <div className="feedback-content">
        <Typography variant="subtitle1" className="feedback-title">
          {style.title}
        </Typography>
        <Typography variant="body1" className="feedback-message">
          {feedback.message}
        </Typography>
        
        {feedback.points && feedback.points.length > 0 && (
          <ul className="feedback-points">
            {feedback.points.map((point, idx) => (
              <li key={idx}>{point}</li>
            ))}
          </ul>
        )}
        
        {feedback.correctAction && (
          <Typography variant="body1" className="feedback-action" sx={{ fontWeight: 'bold', mt: 1 }}>
            Rekommendation: {feedback.correctAction}
          </Typography>
        )}
      </div>
    </Alert>
  );
};

// Förbättrad komponent för Yes/No och True/False frågor
const SimpleBinaryQuestion = ({ text, options, onAnswer, isSubmitting, disabled = false }) => {
  return (
    <div className={`binary-question-container ${disabled ? 'disabled-binary-question' : ''}`}>
      {text && <Typography variant="body1" className="binary-question-text">{text}</Typography>}
      <div className="binary-options">
        {options.map((option, index) => (
          <Button
            key={index}
            variant="contained"
            color={index === 0 ? "primary" : "secondary"}
            disabled={isSubmitting || disabled}
            onClick={() => !disabled && onAnswer(option.label || option.value)}
            className="binary-option-btn"
            sx={{ opacity: disabled ? 0.7 : 1 }}
          >
            {option.label || option.value}
          </Button>
        ))}
      </div>
    </div>
  );
};

// Enhanced Quick Response Buttons with better visual feedback
const QuickResponseButtons = ({ onSendQuickResponse, disabled }) => {
  const [activeIndex, setActiveIndex] = useState(null);
  
  const quickResponses = [
    { text: "Berätta mer om detta", icon: "🔍" },
    { text: "Jag förstår inte", icon: "❓" },
    { text: "fortsätt", icon: "➡️" }
  ];
  
  const handleClick = (text, index) => {
    if (disabled) return;
    
    // Visual feedback on click
    setActiveIndex(index);
    
    // Reset active state after a short delay
    setTimeout(() => {
      setActiveIndex(null);
      onSendQuickResponse(text);
    }, 150);
  };
  
  return (
    <div className="quick-response-container">
      {quickResponses.map((response, index) => (
        <Chip
          key={index}
          label={response.text}
          icon={<span className="quick-response-icon">{response.icon}</span>}
          onClick={() => handleClick(response.text, index)}
          disabled={disabled}
          className={`quick-response-chip ${activeIndex === index ? 'quick-response-active' : ''}`}
          variant="outlined"
          color="primary"
        />
      ))}
    </div>
  );
};

const ChatComponent = () => {
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiIsThinking, setAiIsThinking] = useState(false);
  const [displayComplete, setDisplayComplete] = useState(true);
  const [interactiveVisible, setInteractiveVisible] = useState(false);
  // Ny state för att spåra textanimationsförlopp (0-1)
  const [textCompletion, setTextCompletion] = useState(0);
  // Unikt id för varje meddelande för att förhindra återanvändning av komponenter
  const [latestMessageId, setLatestMessageId] = useState(null);
  
  // För att hålla parsad data
  const [parsedMessages, setParsedMessages] = useState({});
  
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const navigate = useNavigate();
  const chatContainerRef = useRef(null);

  // TTS States
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentAudioUrl, setCurrentAudioUrl] = useState(null);
  const audioRef = useRef(null);
  const [lastTTSText, setLastTTSText] = useState('');

  // State för att hålla reda på interaktiva element
  const interactiveElementsRef = useRef({});
  
  // State för att visa visuella element för alla, men bara aktivera dem för det senaste meddelandet
  const processedMessagesRef = useRef(new Set());

  // Hämta användarens sparade inställningar
  const userName = localStorage.getItem('userName') || 'Användare';
  const underskoterska = localStorage.getItem('underskoterska') || 'nej';
  const delegering = localStorage.getItem('delegering') || 'nej';

  // Omdirigera om chatten inte startats
  useEffect(() => {
    if (localStorage.getItem('hasStartedChat') !== 'true') {
      navigate('/');
    }
  }, [navigate]);

  // Funktion för att scrolla ner till senaste meddelande med smooth animation
  const scrollToBottom = useCallback(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, []);

  // Autoscroll när meddelanden uppdateras
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);
  
  // Improved handling of interactive content display based on text completion
  useEffect(() => {
    // Early display of interactive elements based on text completion
    if (textCompletion >= 0.5) {
      // Start showing interactive content when text is 50% complete
      setInteractiveVisible(true);
      
      // Force scroll to ensure content is visible as it appears
      if (textCompletion >= 0.9) {
        setTimeout(scrollToBottom, 100);
      }
    }
    
    // Final completion handler
    if (displayComplete) {
      scrollToBottom();
      setInteractiveVisible(true);
    } else if (textCompletion < 0.5) {
      setInteractiveVisible(false);
    }
  }, [displayComplete, scrollToBottom, textCompletion]);

  // Autoscroll vid ändring av fönsterstorlek
  useEffect(() => {
    const handleResize = () => {
      scrollToBottom();
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [scrollToBottom]);

  // Fixa overflow för mobila enheter genom att justera höjden baserat på viewport
  useEffect(() => {
    const updateHeight = () => {
      if (chatContainerRef.current) {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
        chatContainerRef.current.style.height = `calc(var(--vh, 1vh) * 100)`;
      }
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  // Funktion för att parsa och spara meddelandets JSON-innehåll
  const parseMessageContent = useCallback((messageId, content) => {
    if (!content || typeof content !== 'string') return null;
    
    try {
      const extractedJson = tryExtractJSON(content);
      if (extractedJson) {
        const { preText, json, postText } = extractedJson;
        
        // Uppdatera parsedMessages state
        setParsedMessages(prev => ({
          ...prev,
          [messageId]: {
            json,
            textContent: preText + (postText ? "\n\n" + postText : ""),
            fullContent: content,
            timestamp: Date.now()
          }
        }));
        
        return {
          json,
          textContent: preText + (postText ? "\n\n" + postText : "")
        };
      }
    } catch (error) {
      console.error("Error parsing message content:", error);
    }
    
    return null;
  }, []);

  // TTS-funktioner
  const getTTSUrl = (text) => {
    const encodedText = encodeURIComponent(text);
    return `http://localhost:5000/api/tts-stream?text=${encodedText}`;
  };

  const playTTS = useCallback((text) => {
    if (isMuted) return;
    
    // Begränsa texten till 300 tecken för bättre prestanda
    let trimmedText = text;
    if (text.length > 300) {
      trimmedText = text.substring(0, 297) + '...';
    }
    
    const url = getTTSUrl(trimmedText);
    setCurrentAudioUrl(url);
    setIsPlaying(true);
  }, [isMuted]);

  // Spela upp det senaste AI-meddelandet omedelbart när det läggs till
  useEffect(() => {
    if (messages.length === 0) return;
    
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.sender === 'assistant' && lastMessage.text && lastMessage.text !== lastTTSText) {
      // Parse new message and store its interactive content
      parseMessageContent(lastMessage.id, lastMessage.text);
      
      // Extrahera text från meddelandeinnehållet för TTS
      let textToRead = lastMessage.text;
      try {
        const extracted = tryExtractJSON(textToRead);
        if (extracted && extracted.json) {
          if (extracted.json.text) {
            textToRead = extracted.json.text;
          } else if (extracted.json.scenario && extracted.json.scenario.description) {
            textToRead = `Scenario: ${extracted.json.scenario.title || 'Patientsituation'}. ${extracted.json.scenario.description}`;
          } else if (extracted.json.roleplay && extracted.json.roleplay.scenario) {
            textToRead = `Rollspel: ${extracted.json.roleplay.title || 'Dialog'}. ${extracted.json.roleplay.scenario}`;
          } else if (extracted.json.multipleChoice && extracted.json.multipleChoice.text) {
            textToRead = extracted.json.multipleChoice.text;
          }
        }
      } catch (e) {
        console.error("Error extracting text for TTS:", e);
      }
      
      const plainText = stripMarkdown(textToRead);
      playTTS(plainText);
      setLastTTSText(lastMessage.text);
    }
  }, [messages, playTTS, lastTTSText, parseMessageContent]);

  // Hantera audio-element
  useEffect(() => {
    if (audioRef.current && currentAudioUrl) {
      audioRef.current.src = currentAudioUrl;
      audioRef.current.play().catch(error => {
        console.error("Fel vid uppspelning av TTS-ljud:", error);
        setIsPlaying(false);
      });
      
      audioRef.current.onended = () => {
        setIsPlaying(false);
      };
    }
  }, [currentAudioUrl]);

  useEffect(() => {
    if (isMuted && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      setCurrentAudioUrl(null);
      setIsPlaying(false);
    }
  }, [isMuted]);

  const toggleMute = () => {
    setIsMuted(prev => !prev);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    setCurrentAudioUrl(null);
    setIsPlaying(false);
  };

  // Generera unika ID för meddelanden
  const generateId = () => Date.now().toString() + Math.random().toString(36).substring(2);

  // Starta chatten
  const startChat = useCallback(async () => {
    setAiIsThinking(true);
    try {
      const response = await axios.post('http://localhost:5000/api/chat', {
        answers: { underskoterska, delegering },
        message: "start",
        name: userName
      });
      const reply = response.data.reply;
      const msgId = generateId();
      setLatestMessageId(msgId);
      
      // Parse the first message immediately
      parseMessageContent(msgId, reply);
      
      setMessages([{ id: msgId, sender: 'assistant', text: reply }]);
      setDisplayComplete(false);
      setTextCompletion(0);
    } catch (error) {
      console.error("Fel vid anrop till API:", error);
      const msgId = generateId();
      setLatestMessageId(msgId);
      setMessages([{ 
        id: msgId, 
        sender: 'assistant', 
        text: 'Det uppstod ett fel vid anslutning till servern. Vänligen ladda om sidan och försök igen.' 
      }]);
      setDisplayComplete(true);
      setTextCompletion(1);
    } finally {
      setAiIsThinking(false);
    }
  }, [underskoterska, delegering, userName, parseMessageContent]);

  // Initiera chatten när komponenten laddas
  useEffect(() => {
    if (messages.length === 0) {
      startChat();
    }
  }, [messages.length, startChat]);

  // Skicka ett meddelande med förbättrad hantering av data persistence
  const sendMessage = async (messageText) => {
    if (!messageText.trim() || isSubmitting || !displayComplete) return;
    
    const newUserMessageId = generateId();
    const newUserMessage = { id: newUserMessageId, sender: 'user', text: messageText };
    
    setMessages(prev => [...prev, newUserMessage]);
    setUserInput('');
    setIsSubmitting(true);
    setAiIsThinking(true);
    
    // Skrolla omedelbart när användaren skickar ett meddelande
    setTimeout(scrollToBottom, 50);
    
    try {
      const response = await axios.post('http://localhost:5000/api/chat', {
        answers: { underskoterska, delegering },
        message: messageText,
        name: userName
      });
      
      const reply = response.data.reply;
      const newMessageId = generateId();
      
      // Uppdatera senaste meddelande-ID för att aktivera bara det senaste
      setLatestMessageId(newMessageId);
      
      // Återställ textCompletion och displayComplete för nytt meddelande
      setTextCompletion(0);
      setDisplayComplete(false);
      
      // Uppdatera meddelanden
      setMessages(prev => [...prev, { id: newMessageId, sender: 'assistant', text: reply }]);
    } catch (error) {
      console.error("Fel vid anrop till API:", error);
      const errorMsgId = generateId();
      setLatestMessageId(errorMsgId);
      setMessages(prev => [...prev, { 
        id: errorMsgId, 
        sender: 'assistant', 
        text: 'Det uppstod ett fel. Vänligen försök igen.' 
      }]);
      setDisplayComplete(true);
      setTextCompletion(1);
    } finally {
      setIsSubmitting(false);
      setAiIsThinking(false);
    }
  };
  
  // UI Hantering
  const handleSendMessage = () => {
    if (!userInput.trim() || isSubmitting || !displayComplete) return;
    const messageToSend = userInput.trim();
    setUserInput('');
    sendMessage(messageToSend);
  };

  const handleSuggestionClick = (suggestionText) => {
    if (isSubmitting || !displayComplete) return;
    sendMessage(suggestionText);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Handle quick response button clicks
  const handleQuickResponse = (responseText) => {
    if (isSubmitting || !displayComplete) return;
    sendMessage(responseText);
  };

  // Avgör om ett meddelande innehåller en binär fråga (Ja/Nej, Sant/Falskt)
  const isBinaryQuestion = (suggestions) => {
    if (!suggestions || !Array.isArray(suggestions) || suggestions.length !== 2) return false;
    
    const labels = suggestions.map(s => (s.label || s.value || "").toLowerCase());
    
    const yesNoPattern = labels.includes('ja') && labels.includes('nej');
    const trueFalsePattern = (labels.includes('sant') && labels.includes('falskt')) || 
                            (labels.includes('true') && labels.includes('false'));
    
    return yesNoPattern || trueFalsePattern;
  };

  // Hantera när textanimering är klar
  const handleDisplayComplete = () => {
    setDisplayComplete(true);
    setTextCompletion(1);
  };

  // Rendera AI-meddelande med korrekt formatering och interaktiva element som bevaras
  const renderAIMessage = (message) => {
    const isActive = message.id === latestMessageId;
    const parsedData = parsedMessages[message.id];
    
    // Om inget ID eller ingen parsad data, visa bara vanlig text
    if (!message.id || (!parsedData && !isActive)) {
      return (
        <Box key={message.id} className="chat-message assistant">
          <ReactMarkdown className="markdown-content">
            {message.text}
          </ReactMarkdown>
        </Box>
      );
    }
    
    // Försök parsera innehållet om vi inte gjort det än eller detta är aktivt meddelande
    const jsonData = parsedData ? parsedData.json : null;
    const textContent = parsedData ? parsedData.textContent : message.text;
    
    // Parse content on-the-fly for active message if needed
    let activeJsonData = null;
    let activeTextContent = null;
    
    if (isActive && !jsonData) {
      try {
        const freshExtracted = tryExtractJSON(message.text);
        if (freshExtracted) {
          activeJsonData = freshExtracted.json;
          activeTextContent = freshExtracted.preText + (freshExtracted.postText ? "\n\n" + freshExtracted.postText : "");
        }
      } catch (error) {
        console.error("Error parsing active message:", error);
      }
    }
    
    // Use either cached or fresh data
    const finalJsonData = isActive ? (activeJsonData || jsonData) : jsonData;
    const finalTextContent = isActive ? (activeTextContent || textContent) : textContent;
    
    // Extract components based on the JSON
    let suggestions = null;
    let scenarioData = null;
    let roleplayData = null;
    let multipleChoiceData = null;
    let matchingData = null;
    let orderingData = null;
    let feedbackData = null;
    let exerciseContent = null;
    let exerciseOptions = null;
    let exerciseDescription = null;
    let mediaElements = null;

    if (finalJsonData) {
      if (finalJsonData.text && !finalTextContent) {
        activeTextContent = finalJsonData.text;
      }
      
      suggestions = finalJsonData.suggestions;
      mediaElements = finalJsonData.media;
      
      if (finalJsonData.exercise) {
        exerciseContent = finalJsonData.exercise.instruction;
        exerciseOptions = finalJsonData.exercise.options;
        exerciseDescription = finalJsonData.exercise.description;
      }
      
      scenarioData = finalJsonData.scenario;
      roleplayData = finalJsonData.roleplay;
      multipleChoiceData = finalJsonData.multipleChoice;
      matchingData = finalJsonData.matching;
      orderingData = finalJsonData.ordering;
      feedbackData = finalJsonData.feedback;
    }

    // Kontrollera om detta är en binär (Ja/Nej, Sant/Falskt) fråga
    const isBinary = suggestions && isBinaryQuestion(suggestions);
    
    return (
      <Box key={message.id} className="chat-message assistant animate-in">
        {/* Visa textinnehåll med flytande animation om aktivt, annars statiskt */}
        {finalTextContent && (
          isActive ? (
            <SmoothTextDisplay 
              text={finalTextContent} 
              onComplete={handleDisplayComplete}
              scrollToBottom={scrollToBottom}
              setTextCompletion={setTextCompletion}
            />
          ) : (
            <ReactMarkdown className="markdown-content">
              {finalTextContent}
            </ReactMarkdown>
          )
        )}
        
        {/* Interaktiva element - visas alltid men är inaktiva om inte aktivt meddelande */}
        <div className="interactive-content">
          {/* Visa scenario om det finns */}
          {scenarioData && (
            <AnimatedInteractiveItem 
              isVisible={isActive ? interactiveVisible : true} 
              index={0} 
              animationPhase={isActive ? textCompletion : 1}
              uniqueId={`${message.id}-scenario`}
              disabled={!isActive}
            >
              <ScenarioQuestion 
                scenario={scenarioData} 
                onAnswer={handleSuggestionClick}
                isSubmitting={isSubmitting}
                disabled={!isActive}
              />
            </AnimatedInteractiveItem>
          )}
          
          {/* Visa rollspelsdialog om det finns */}
          {roleplayData && (
            <AnimatedInteractiveItem 
              isVisible={isActive ? interactiveVisible : true} 
              index={1} 
              animationPhase={isActive ? textCompletion : 1}
              uniqueId={`${message.id}-roleplay`}
              disabled={!isActive}
            >
              <RoleplayDialog 
                roleplay={roleplayData} 
                disabled={!isActive}
              />
            </AnimatedInteractiveItem>
          )}
          
          {/* Visa flervalsfråga om det finns */}
          {multipleChoiceData && (
            <AnimatedInteractiveItem 
              isVisible={isActive ? interactiveVisible : true} 
              index={2} 
              animationPhase={isActive ? textCompletion : 1}
              uniqueId={`${message.id}-multiplechoice`}
              disabled={!isActive}
            >
              <MultipleChoiceQuestion 
                question={multipleChoiceData} 
                onAnswer={handleSuggestionClick}
                isSubmitting={isSubmitting}
                disabled={!isActive}
              />
            </AnimatedInteractiveItem>
          )}
          
          {/* Visa matchningsfråga om det finns */}
          {matchingData && (
            <AnimatedInteractiveItem 
              isVisible={isActive ? interactiveVisible : true} 
              index={3} 
              animationPhase={isActive ? textCompletion : 1}
              uniqueId={`${message.id}-matching`}
              disabled={!isActive}
            >
              <MatchingQuestion 
                question={matchingData} 
                onAnswer={handleSuggestionClick}
                isSubmitting={isSubmitting}
                disabled={!isActive}
              />
            </AnimatedInteractiveItem>
          )}
          
          {/* Visa ordningsfråga om det finns */}
          {orderingData && (
            <AnimatedInteractiveItem 
              isVisible={isActive ? interactiveVisible : true} 
              index={4} 
              animationPhase={isActive ? textCompletion : 1}
              uniqueId={`${message.id}-ordering`}
              disabled={!isActive}
            >
              <OrderingQuestion 
                question={orderingData} 
                onAnswer={handleSuggestionClick}
                isSubmitting={isSubmitting}
                disabled={!isActive}
              />
            </AnimatedInteractiveItem>
          )}
          
          {/* Visa feedback om det finns */}
          {feedbackData && (
            <AnimatedInteractiveItem 
              isVisible={isActive ? interactiveVisible : true} 
              index={5} 
              animationPhase={isActive ? textCompletion : 1}
              uniqueId={`${message.id}-feedback`}
              disabled={!isActive}
            >
              <FeedbackComponent 
                feedback={feedbackData}
                disabled={!isActive}
              />
            </AnimatedInteractiveItem>
          )}
          
          {/* Visa eventuella mediaelement (bilder, etc.) */}
          {mediaElements && Array.isArray(mediaElements) && (
            <AnimatedInteractiveItem 
              isVisible={isActive ? interactiveVisible : true} 
              index={6} 
              animationPhase={isActive ? textCompletion : 1}
              uniqueId={`${message.id}-media`}
              disabled={!isActive}
            >
              <div className="media-container">
                {mediaElements.map((media, idx) => {
                  if (media.type === 'image' && media.src) {
                    return <img key={idx} src={media.src} alt={media.alt || "Illustration"} className="chat-image" />;
                  }
                  return null;
                })}
              </div>
            </AnimatedInteractiveItem>
          )}
          
          {/* Visa övningsinnehåll om det finns */}
          {exerciseContent && (
            <AnimatedInteractiveItem 
              isVisible={isActive ? interactiveVisible : true} 
              index={7} 
              animationPhase={isActive ? textCompletion : 1}
              uniqueId={`${message.id}-exercise`}
              disabled={!isActive}
            >
              <div className={`exercise-container ${!isActive ? 'disabled-exercise' : ''}`}>
                <p className="exercise-instruction">{exerciseContent}</p>
                {exerciseDescription && (
                  <p className="exercise-description">{exerciseDescription}</p>
                )}
                {exerciseOptions && Array.isArray(exerciseOptions) && (
                  <div className="exercise-options">
                    {exerciseOptions.map((option, idx) => (
                      <Button 
                        key={idx} 
                        variant="outlined" 
                        color="primary" 
                        onClick={() => !isActive ? null : handleSuggestionClick(option.label || option.text)}
                        disabled={isSubmitting || !isActive}
                        sx={{ opacity: isActive ? 1 : 0.7 }}
                      >
                        {option.label || option.text}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </AnimatedInteractiveItem>
          )}
          
          {/* Visa binära frågor i ett speciellt format */}
          {isBinary && suggestions && (
            <AnimatedInteractiveItem 
              isVisible={isActive ? interactiveVisible : true} 
              index={8} 
              animationPhase={isActive ? textCompletion : 1}
              uniqueId={`${message.id}-binary`}
              disabled={!isActive}
            >
              <SimpleBinaryQuestion 
                text={null} // Vi har redan visat texten ovanför
                options={suggestions}
                onAnswer={handleSuggestionClick}
                isSubmitting={isSubmitting}
                disabled={!isActive}
              />
            </AnimatedInteractiveItem>
          )}
          
          {/* Visa svarsförslag för icke-binära frågor */}
          {!isBinary && suggestions && Array.isArray(suggestions) && (
            <AnimatedInteractiveItem 
              isVisible={isActive ? interactiveVisible : true} 
              index={9} 
              animationPhase={isActive ? textCompletion : 1}
              uniqueId={`${message.id}-suggestions`}
              disabled={!isActive}
            >
              <div className="suggestions-container">
                {suggestions.map((sugg, idx) => (
                  <Button 
                    key={idx} 
                    className="suggestion-button"
                    variant="contained" 
                    onClick={() => !isActive ? null : handleSuggestionClick(sugg.label || sugg.value)}
                    disabled={isSubmitting || !isActive}
                    sx={{ opacity: isActive ? 1 : 0.7 }}
                  >
                    {sugg.label || sugg.value}
                  </Button>
                ))}
              </div>
            </AnimatedInteractiveItem>
          )}
        </div>
      </Box>
    );
  };

  // Rendera hela komponenten
  return (
    <div className="chat-container" ref={chatContainerRef}>
      {/* Header */}
      <div className="chat-header">
        <h1>Delegeringsutbildning</h1>
        <div className="chat-header-description">
          Välkommen {userName}! Du genomgår nu din personliga delegeringsutbildning.
        </div>
      </div>
      
      {/* Meddelandeområde */}
      <div className="chat-messages" ref={messagesContainerRef}>
        {messages.map((msg) => {
          if (msg.sender === 'assistant') {
            return renderAIMessage(msg);
          } else {
            // Visa användarmeddelanden
            return (
              <Box key={msg.id} className="chat-message user">
                <p>{msg.text}</p>
              </Box>
            );
          }
        })}

        {/* Visa AIns "tänkande" med en snyggare animation */}
        {aiIsThinking && (
          <div className="ai-thinking">
            <div className="ai-thinking-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
        
        {/* Referenspunkt för automatisk scroll */}
        <div ref={messagesEndRef} style={{ height: 1, width: 1 }} />
      </div>

      {/* Ljuduppspelning (osynlig) */}
      <audio 
        ref={audioRef} 
        style={{ display: 'none' }}
        onEnded={() => setIsPlaying(false)}
      />

      {/* Förbättrad TTS-widget */}
      <div 
        className={`tts-widget ${!isMuted && isPlaying ? 'active' : ''} ${isMuted ? 'muted' : ''}`} 
        onClick={toggleMute}
        title={isMuted ? "Ljudet är avstängt – klicka för att slå på" : "Ljudet är på – klicka för att stänga av"}
      >
        {!isMuted && isPlaying && (
          <>
            <div className="wave"></div>
            <div className="wave"></div>
            <div className="wave"></div>
          </>
        )}
        <div className="tts-widget-icon">
          {isMuted ? (
            <span aria-label="Ljud av">🔇</span>
          ) : isPlaying ? (
            <span aria-label="Spelar upp">🔊</span>
          ) : (
            <span aria-label="Ljud på">🔉</span>
          )}
        </div>
      </div>

      {/* Enhanced Quick Response Buttons - Always visible when appropriate */}
      <div className="quick-responses-area">
        <QuickResponseButtons 
          onSendQuickResponse={handleQuickResponse} 
          disabled={isSubmitting || !displayComplete || aiIsThinking}
        />
      </div>

      {/* Inmatningsområde för användarens meddelanden */}
      <div className="input-area">
        <TextField 
          fullWidth 
          variant="outlined"
          value={userInput} 
          onChange={(e) => setUserInput(e.target.value)} 
          placeholder="Skriv ditt meddelande här..."
          onKeyDown={handleKeyDown}
          disabled={isSubmitting || !displayComplete || aiIsThinking}
          multiline
          maxRows={3}
        />
        <Button 
          variant="contained" 
          color="primary" 
          onClick={handleSendMessage}
          disabled={isSubmitting || !userInput.trim() || !displayComplete || aiIsThinking}
        >
          {isSubmitting || aiIsThinking ? "Väntar..." : "Skicka"}
        </Button>
      </div>
    </div>
  );
};

export default ChatComponent;