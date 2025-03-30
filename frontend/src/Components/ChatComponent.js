// frontend/src/Components/ChatComponent.js
import API_ENDPOINTS from '../config/api';
import React, { useState, useEffect, useRef, useCallback } from 'react';
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

// --- Helper Components (med extra prop-validering) ---

// Multiple choice component
const MultipleChoiceQuestion = ({ question, onAnswer, isSubmitting, disabled = false }) => {
  const [selectedOptions, setSelectedOptions] = useState({});

   // Basic validation
   if (!question || typeof question.text !== 'string' || !Array.isArray(question.options)) {
    console.error("Invalid props for MultipleChoiceQuestion:", { question });
    return <Alert severity="error">Fel: Kunde inte ladda flervalsfråga.</Alert>;
  }


  const handleChange = (id) => {
    if (disabled) return;
    if (question.multiSelect) {
      setSelectedOptions(prev => ({ ...prev, [id]: !prev[id] }));
    } else {
      setSelectedOptions({ [id]: true });
    }
  };

  const handleSubmit = () => {
    if (disabled) return;
    const selected = Object.keys(selectedOptions).filter(id => selectedOptions[id]);
    const selectedLabels = selected
        .map(id => question.options.find(opt => opt.id === id)?.text)
        .filter(Boolean); // Filter out undefined if find fails
    onAnswer(selectedLabels.join(', '));
  };

  return (
    <div className={`question-container multiple-choice ${disabled ? 'disabled-question' : ''}`}>
      <Typography variant="h6" className="question-title">{question.text}</Typography>
      <FormGroup>
        {question.options.map((option) => (
            // Added validation for option structure
            option && typeof option.text === 'string' && option.id != null ? (
                <FormControlLabel
                    key={option.id}
                    control={
                    question.multiSelect ? (
                        <Checkbox checked={!!selectedOptions[option.id]} onChange={() => handleChange(option.id)} disabled={isSubmitting || disabled} />
                    ) : (
                        <Radio checked={!!selectedOptions[option.id]} onChange={() => handleChange(option.id)} disabled={isSubmitting || disabled} />
                    )
                    }
                    label={option.text}
                    sx={{ cursor: disabled ? 'default' : 'pointer' }}
                />
            ) : null // Render nothing for invalid options
        ))}
      </FormGroup>
      <Button
        variant="contained" color="primary" onClick={handleSubmit}
        disabled={isSubmitting || Object.keys(selectedOptions).filter(k => selectedOptions[k]).length === 0 || disabled}
        className="question-submit-btn" sx={{ opacity: disabled ? 0.6 : 1 }}
      >
        Svara
      </Button>
    </div>
  );
};

// Matching question component
const MatchingQuestion = ({ question, onAnswer, isSubmitting, disabled = false }) => {
  const [matches, setMatches] = useState({});

  // Basic validation
  if (!question || typeof question.text !== 'string' || !Array.isArray(question.items) || !Array.isArray(question.matches)) {
    console.error("Invalid props for MatchingQuestion:", { question });
    return <Alert severity="error">Fel: Kunde inte ladda matchningsfråga.</Alert>;
  }


  const handleMatch = (itemId, matchId) => {
    if (disabled) return;
    setMatches(prev => ({ ...prev, [itemId]: matchId }));
  };

  const handleSubmit = () => {
    if (disabled) return;
    const matchResponse = Object.entries(matches).map(([itemId, matchId]) => {
      const item = question.items.find(i => i.id === itemId);
      const match = question.matches.find(m => m.id === matchId);
      return `${item?.text || 'Okänt'} → ${match?.text || 'Okänt'}`; // Added fallback text
    }).join(' | ');
    onAnswer(matchResponse);
  };

  const itemsMatched = question.items.every(item => matches[item.id] != null && matches[item.id] !== ''); // Check if all items have a selected match

  return (
    <div className={`question-container matching-question ${disabled ? 'disabled-question' : ''}`}>
      <Typography variant="h6" className="question-title">{question.text}</Typography>
      <div className="matching-grid">
        <Grid container spacing={2}>
          {question.items.map((item) => (
             item && typeof item.text === 'string' && item.id != null ? ( // Validate item structure
              <Grid item xs={12} key={item.id}>
                <Paper elevation={disabled ? 0 : 2} className="matching-item">
                  <Typography variant="body1" className="item-text">{item.text}</Typography>
                  <FormControl fullWidth>
                    <select
                      value={matches[item.id] || ''}
                      onChange={(e) => handleMatch(item.id, e.target.value)}
                      disabled={isSubmitting || disabled}
                      className="matching-select" style={{ cursor: disabled ? 'default' : 'pointer' }}
                    >
                      <option value="">Välj matchande alternativ...</option>
                      {question.matches.map((match) => (
                         match && typeof match.text === 'string' && match.id != null ? ( // Validate match structure
                          <option key={match.id} value={match.id}
                            disabled={(Object.values(matches).includes(match.id) && matches[item.id] !== match.id) || disabled}
                          >
                            {match.text}
                          </option>
                         ) : null
                      ))}
                    </select>
                  </FormControl>
                </Paper>
              </Grid>
             ) : null
          ))}
        </Grid>
      </div>
      <Button
        variant="contained" color="primary" onClick={handleSubmit}
        disabled={isSubmitting || !itemsMatched || disabled}
        className="question-submit-btn" sx={{ opacity: disabled ? 0.6 : 1 }}
      >
        Svara
      </Button>
    </div>
  );
};

// Ordering question component
const OrderingQuestion = ({ question, onAnswer, isSubmitting, disabled = false }) => {
    // Basic validation
    if (!question || typeof question.text !== 'string' || !Array.isArray(question.items)) {
        console.error("Invalid props for OrderingQuestion:", { question });
        return <Alert severity="error">Fel: Kunde inte ladda ordningsfråga.</Alert>;
    }

  // Initialize state only with valid items
  const [orderedItems, setOrderedItems] = useState(() => question.items.filter(item => item && typeof item.text === 'string' && item.id != null));


  const moveItem = (index, direction) => {
    if (disabled) return;
    if ((direction < 0 && index === 0) || (direction > 0 && index === orderedItems.length - 1)) {
      return;
    }
    const newOrder = [...orderedItems];
    [newOrder[index], newOrder[index + direction]] = [newOrder[index + direction], newOrder[index]]; // Swap
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
          <Paper key={item.id} elevation={disabled ? 0 : 2} className="ordering-item">
            <Typography variant="body1">{item.text}</Typography>
            <div className="ordering-controls">
              <Button size="small" variant="outlined"
                disabled={index === 0 || isSubmitting || disabled}
                onClick={() => moveItem(index, -1)}
                sx={{ opacity: disabled ? 0.6 : 1, cursor: disabled ? 'default' : 'pointer' }}
              > ↑ </Button>
              <Button size="small" variant="outlined"
                disabled={index === orderedItems.length - 1 || isSubmitting || disabled}
                onClick={() => moveItem(index, 1)}
                sx={{ opacity: disabled ? 0.6 : 1, cursor: disabled ? 'default' : 'pointer' }}
              > ↓ </Button>
            </div>
          </Paper>
        ))}
      </div>
      <Button
        variant="contained" color="primary" onClick={handleSubmit}
        disabled={isSubmitting || disabled}
        className="question-submit-btn" sx={{ opacity: disabled ? 0.6 : 1 }}
      >
        Svara
      </Button>
    </div>
  );
};

// Scenario component
const ScenarioQuestion = ({ scenario, onAnswer, isSubmitting, disabled = false }) => {
    // Added more robust validation
    if (!scenario || typeof scenario.description !== 'string' || !Array.isArray(scenario.options)) {
        console.error("Invalid props for ScenarioQuestion:", { scenario });
        return <Alert severity="error">Fel: Kunde inte ladda scenariot.</Alert>;
    }

  return (
    <Card className={`scenario-card ${disabled ? 'disabled-scenario' : ''}`}>
      <CardHeader title={scenario.title || "Patientsituation"} className="scenario-header" />
      <CardContent>
        <Typography variant="body1" className="scenario-description">
          {scenario.description}
        </Typography>
        <div className="scenario-options">
          {scenario.options.map((option, index) => (
             // Validate option structure
             option && typeof option.label === 'string' ? (
              <Button
                key={option.value || index}
                variant="outlined" color="primary" fullWidth
                disabled={isSubmitting || disabled}
                onClick={() => !disabled && onAnswer(option.label)}
                className="scenario-option-btn"
                sx={{ opacity: disabled ? 0.7 : 1, cursor: disabled ? 'default' : 'pointer' }}
              >
                {option.label}
              </Button>
             ) : null
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

// Roleplay component
const RoleplayDialog = ({ roleplay, disabled = false }) => {
    // Added validation
    if (!roleplay || typeof roleplay.title !== 'string' || typeof roleplay.scenario !== 'string' || !Array.isArray(roleplay.dialogue)) {
        console.error("Invalid props for RoleplayDialog:", { roleplay });
        return <Alert severity="error">Fel: Kunde inte ladda rollspelet.</Alert>;
    }
  const { title, scenario, dialogue, learningPoints } = roleplay;
  const roleStyles = { /* ... same styles ... */ };
  const getInitials = (role) => (roleStyles[role] ? roleStyles[role].initials : role?.charAt(0) ?? '?');
  const getColor = (role) => (roleStyles[role] ? roleStyles[role].bgcolor : "#607d8b");

  return (
    <div className={`roleplay-container ${disabled ? 'disabled-roleplay' : ''}`}>
      <div className="roleplay-header">
        <Typography variant="h6">{title}</Typography>
        <Typography variant="body2" className="roleplay-scenario">{scenario}</Typography>
      </div>
      <div className="dialogue-container">
        {dialogue.map((entry, index) => (
           // Validate entry structure
           entry && typeof entry.role === 'string' && typeof entry.message === 'string' ? (
            <div key={index} className={`dialogue-entry ${entry.role.includes('(du)') ? 'dialogue-user' : ''}`}>
              <Avatar className="dialogue-avatar" sx={{ bgcolor: getColor(entry.role), opacity: disabled ? 0.8 : 1 }}>
                {getInitials(entry.role)}
              </Avatar>
              <div className="dialogue-content">
                <Typography variant="subtitle2" className="dialogue-role">{entry.role}</Typography>
                <Typography variant="body1" className="dialogue-message">{entry.message}</Typography>
              </div>
            </div>
           ) : null
        ))}
      </div>
      {Array.isArray(learningPoints) && learningPoints.length > 0 && (
        <div className="learning-points">
          <Typography variant="subtitle1" className="learning-points-header">Viktiga lärdomar:</Typography>
          <ul className="learning-points-list">
            {learningPoints.map((point, index) => (
               typeof point === 'string' ? <li key={index}><Typography variant="body2">{point}</Typography></li> : null
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

// Feedback component
const FeedbackComponent = ({ feedback, disabled = false }) => {
    // Added validation
    if (!feedback || typeof feedback.message !== 'string' || typeof feedback.type !== 'string') {
        console.error("Invalid props for FeedbackComponent:", { feedback });
        return <Alert severity="error">Fel: Kunde inte ladda feedback.</Alert>;
    }
  const feedbackStyles = { /* ... same styles ... */ };
  const style = feedbackStyles[feedback.type] || feedbackStyles.knowledge;

  return (
    <Alert
      severity={feedback.type === "safety" ? "warning" : "info"}
      icon={<span style={{ fontSize: '1.2rem' }}>{style.icon}</span>}
      className={`feedback-alert ${disabled ? 'disabled-feedback' : ''}`} sx={{ opacity: disabled ? 0.85 : 1 }}
    >
      <div className="feedback-content">
        <Typography variant="subtitle1" className="feedback-title">{style.title}</Typography>
        <Typography variant="body1" className="feedback-message">{feedback.message}</Typography>
        {Array.isArray(feedback.points) && feedback.points.length > 0 && (
          <ul className="feedback-points">
            {feedback.points.map((point, idx) => ( typeof point === 'string' ? <li key={idx}>{point}</li> : null ))}
          </ul>
        )}
        {typeof feedback.correctAction === 'string' && (
          <Typography variant="body1" className="feedback-action" sx={{ fontWeight: 'bold', mt: 1 }}>
            Rekommendation: {feedback.correctAction}
          </Typography>
        )}
      </div>
    </Alert>
  );
};

// Simple Binary Question (Yes/No, True/False)
const SimpleBinaryQuestion = ({ text, options, onAnswer, isSubmitting, disabled = false }) => {
    // Added validation
    if (!Array.isArray(options) || options.length !== 2) {
        console.error("Invalid props for SimpleBinaryQuestion:", { text, options });
        return <Alert severity="error">Fel: Kunde inte ladda ja/nej-frågan.</Alert>;
    }
    return (
    <div className={`binary-question-container ${disabled ? 'disabled-binary-question' : ''}`}>
      {typeof text === 'string' && text && <Typography variant="body1" className="binary-question-text">{text}</Typography>}
      <div className="binary-options">
        {options.map((option, index) => (
           // Validate option structure
           option && (typeof option.label === 'string' || typeof option.value === 'string') ? (
            <Button
              key={index} variant="contained"
              color={/(ja|sant|true)/i.test(option.label || option.value || "") ? "primary" : "secondary"}
              disabled={isSubmitting || disabled}
              onClick={() => !disabled && onAnswer(option.label || option.value)}
              className="binary-option-btn"
              sx={{ opacity: disabled ? 0.7 : 1, cursor: disabled ? 'default' : 'pointer' }}
            >
              {option.label || option.value}
            </Button>
           ) : null
        ))}
      </div>
    </div>
  );
};

// Quick Response Buttons (remains the same)
const QuickResponseButtons = ({ onSendQuickResponse, disabled }) => {
  const [activeIndex, setActiveIndex] = useState(null);
  const quickResponses = [ /* ... same responses ... */ ];
  const handleClick = (text, index) => { /* ... same logic ... */ };
  return ( <div className="quick-response-container"> { /* ... same rendering ... */ } </div> );
};


// Text Animation Component (remains the same)
const SmoothTextDisplay = ({ text, onComplete, scrollToBottom, setTextCompletion }) => {
    // ... (samma kod som tidigare)
    const [paragraphs, setParagraphs] = useState([]);
    const [visibleParagraphs, setVisibleParagraphs] = useState(0);
    const timeoutRef = useRef(null);
    const prevTextRef = useRef('');
    const isMountedRef = useRef(true);

    useEffect(() => {
        isMountedRef.current = true;
        return () => { isMountedRef.current = false; };
    }, []);

    useEffect(() => {
        // Check if text is actually a string
        if (typeof text !== 'string' || text === prevTextRef.current) return;
        prevTextRef.current = text;

        // Defensivt rensa state vid ny text
        setParagraphs([]);
        setVisibleParagraphs(0);
        if (setTextCompletion) setTextCompletion(0);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);

        const rawText = text.replace(/\r\n/g, '\n');
        const majorBlocks = rawText.split(/\n\s*\n+/);
        const processedParagraphs = [];
        majorBlocks.forEach(block => {
        const trimmedBlock = block.trim();
        if (!trimmedBlock) return;
        if (/^[\s]*[-*+]\s+/.test(trimmedBlock) || /^[\s]*\d+\.\s+/.test(trimmedBlock) || trimmedBlock.length < 180) {
            processedParagraphs.push(trimmedBlock);
        } else {
            const sentences = trimmedBlock.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) || [trimmedBlock];
            let currentGroup = '';
            sentences.forEach((sentence, i) => {
            const trimmedSentence = sentence.trim();
            if (!trimmedSentence) return; // Skip empty sentences
            if ((currentGroup.length + trimmedSentence.length > 200) || (currentGroup.length > 0 && /^(however|nevertheless|therefore|thus|consequently|furthermore|moreover|in addition|besides|alternatively|meanwhile|conversely|on the other hand|in contrast|similarly|likewise|accordingly|as a result)/i.test(trimmedSentence))) {
                if (currentGroup) processedParagraphs.push(currentGroup);
                currentGroup = trimmedSentence;
            } else {
                currentGroup = currentGroup ? `${currentGroup} ${trimmedSentence}` : trimmedSentence;
            }
            if (i === sentences.length - 1 && currentGroup) {
                processedParagraphs.push(currentGroup);
            }
            });
        }
        });
        setParagraphs(processedParagraphs);
    }, [text, setTextCompletion]);

    useEffect(() => {
        if (!isMountedRef.current || paragraphs.length === 0) return;

        if (visibleParagraphs < paragraphs.length) {
        if (visibleParagraphs > 0) setTimeout(scrollToBottom, 50);
        const currentPara = paragraphs[visibleParagraphs] || '';
        let delay = 120;
        const wordCount = currentPara.split(/\s+/).length;
        if (/^[\s]*[-*+]\s+/.test(currentPara) || /^[\s]*\d+\.\s+/.test(currentPara)) delay = 180;
        else if (/\?$/.test(currentPara)) delay = 150;
        else if (currentPara.length < 40) delay = 80;
        else delay += Math.min(wordCount / 15, 2.5) * 70;

        const newProgress = (visibleParagraphs + 1) / paragraphs.length;
        if (setTextCompletion) setTextCompletion(newProgress);

        if (timeoutRef.current) clearTimeout(timeoutRef.current);

        timeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) {
            setVisibleParagraphs(prev => prev + 1);
            }
        }, Math.max(delay, 50)); // Ensure a minimum delay

        } else if (visibleParagraphs === paragraphs.length) {
        if (setTextCompletion) setTextCompletion(1);
        if (onComplete) onComplete();
        }

        return () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [visibleParagraphs, paragraphs, onComplete, scrollToBottom, setTextCompletion]);

    const handleClick = () => {
        if (visibleParagraphs < paragraphs.length) {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (isMountedRef.current) {
            setVisibleParagraphs(paragraphs.length);
            if (setTextCompletion) setTextCompletion(1);
            scrollToBottom();
            if (onComplete) onComplete();
        }
        }
    };

    // Safety check for rendering
    const paragraphsToRender = paragraphs.slice(0, visibleParagraphs);

    return (
        <div className="smooth-text" onClick={handleClick} style={{ cursor: visibleParagraphs < paragraphs.length ? 'pointer' : 'auto' }}>
        {paragraphsToRender.map((para, index) => (
            <div key={index} className="animate-in-paragraph">
             {/* Ensure para is a string before passing to ReactMarkdown */}
             {typeof para === 'string' ? (
                <ReactMarkdown className="markdown-content">{para}</ReactMarkdown>
             ) : (
                <p>...</p> // Fallback for non-string paragraph
             )}
            </div>
        ))}
        {visibleParagraphs < paragraphs.length && (
            <span className="typing-cursor"></span>
        )}
        </div>
    );
};

// Animated Interactive Item Component (remains the same)
const AnimatedInteractiveItem = ({ children, index = 0, isVisible, animationPhase, uniqueId, disabled = false }) => {
    // ... (samma kod som tidigare)
    const [show, setShow] = useState(false);
    const timerRef = useRef(null);
    const instanceIdRef = useRef(`item-${uniqueId || Math.random().toString(36).substring(2)}`);
    const isMountedRef = useRef(true);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

     useEffect(() => {
        if (!isMountedRef.current) return;

        let isActive = false;
        if (isVisible && animationPhase >= 0.5) { // Threshold to start showing
            isActive = true;
            setShow(false); // Reset for animation trigger
            const baseDelay = animationPhase >= 0.9 ? 100 : 150;
            const delay = baseDelay + index * (animationPhase >= 0.8 ? 100 : 150);

            if (timerRef.current) clearTimeout(timerRef.current);

            timerRef.current = setTimeout(() => {
                if(isMountedRef.current) setShow(true);
            }, delay);
        } else {
            // Hide if not visible or animation phase is too early
             if (show) setShow(false); // Only update state if it needs changing
             if (timerRef.current) {
                  clearTimeout(timerRef.current);
                  timerRef.current = null; // Clear ref as well
             }
        }

        return () => { // Cleanup timer on effect change or unmount
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [isVisible, index, animationPhase, show]); // Added show dependency

    // Render null if the parent `isVisible` is false, regardless of internal state
     if (!isVisible) return null;

    return (
        <div
        id={instanceIdRef.current}
        className={`interactive-item ${show ? 'animate-in' : ''} ${disabled ? 'inactive-interactive-item' : ''}`}
        style={{
            opacity: show ? 1 : 0,
            transform: show ? 'translateY(0)' : 'translateY(20px)',
            transition: 'opacity 0.5s ease-out, transform 0.5s ease-out',
            pointerEvents: show && !disabled ? 'auto' : 'none',
        }}
        >
        {children}
        </div>
    );
};


// --- Main Chat Component ---

const ChatComponent = () => {
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiIsThinking, setAiIsThinking] = useState(false);
  const [textCompletion, setTextCompletion] = useState(0);
  const [latestMessageId, setLatestMessageId] = useState(null);

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const navigate = useNavigate();
  const chatContainerRef = useRef(null);

  const userName = localStorage.getItem('userName') || 'Användare';
  const underskoterska = localStorage.getItem('underskoterska') || 'nej';
  const delegering = localStorage.getItem('delegering') || 'nej';

  useEffect(() => {
    if (localStorage.getItem('hasStartedChat') !== 'true') {
      navigate('/');
    }
  }, [navigate]);

  const scrollToBottom = useCallback(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(scrollToBottom, 100);
    return () => clearTimeout(timer);
  }, [messages, scrollToBottom]);

  useEffect(() => {
    const handleResize = () => scrollToBottom();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [scrollToBottom]);

  useEffect(() => {
    const updateHeight = () => { /* ... */ };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  const generateId = () => `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  const startChat = useCallback(async () => {
    console.log("Attempting to start chat...");
    setAiIsThinking(true);
    setTextCompletion(0);
    try {
      const response = await axios.post(API_ENDPOINTS.CHAT, {
        answers: { underskoterska, delegering }, message: "start", name: userName
      });
      // Ensure response.data and response.data.reply exist
        if (!response.data || !response.data.reply) {
            throw new Error("Invalid response structure from backend on start");
        }
      const { textContent, interactiveElement } = response.data.reply;
      const msgId = generateId();
      setLatestMessageId(msgId);
      setMessages([{ id: msgId, sender: 'assistant', textContent, interactiveElement }]);
    } catch (error) {
      console.error("Fel vid start av chatt:", error);
      const errorMsgId = generateId();
      setLatestMessageId(errorMsgId);
      setMessages([{ id: errorMsgId, sender: 'assistant', textContent: 'Det uppstod ett fel vid anslutning till servern...', interactiveElement: null }]);
      setTextCompletion(1);
    } finally {
      setAiIsThinking(false);
    }
  }, [underskoterska, delegering, userName]);

  useEffect(() => {
    if (messages.length === 0 && localStorage.getItem('hasStartedChat') === 'true') {
      startChat();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  const sendMessage = async (messageText) => {
    const trimmedText = messageText.trim();
    if (!trimmedText || isSubmitting || aiIsThinking) return;

    const newUserMessageId = generateId();
    const newUserMessage = { id: newUserMessageId, sender: 'user', textContent: trimmedText, interactiveElement: null };

    setMessages(prev => [...prev, newUserMessage]);
    setUserInput('');
    setIsSubmitting(true);
    setAiIsThinking(true);
    setTextCompletion(0);
    // setLatestMessageId(null); // Keep previous active until new AI response arrives? Or deactivate immediately? Deactivate seems safer.
    setLatestMessageId(newUserMessageId); // Set user message ID as latest temporarily? No, keep null.

    setTimeout(scrollToBottom, 50);

    try {
      const response = await axios.post(API_ENDPOINTS.CHAT, {
        answers: { underskoterska, delegering }, message: trimmedText, name: userName
      });
       // Ensure response.data and response.data.reply exist
        if (!response.data || !response.data.reply) {
            throw new Error("Invalid response structure from backend");
        }
      const { textContent, interactiveElement } = response.data.reply;
      const newMessageId = generateId();
      setLatestMessageId(newMessageId); // Activate the new AI message

      setMessages(prev => [...prev, { id: newMessageId, sender: 'assistant', textContent, interactiveElement }]);
    } catch (error) {
      console.error("Fel vid anrop till API:", error);
      const errorMsgId = generateId();
      setLatestMessageId(errorMsgId); // Activate the error message
      setMessages(prev => [...prev, { id: errorMsgId, sender: 'assistant', textContent: 'Det uppstod ett fel...', interactiveElement: null }]);
      setTextCompletion(1);
    } finally {
      setIsSubmitting(false);
      setAiIsThinking(false);
    }
  };

  const handleSendMessage = () => sendMessage(userInput);
  const handleSuggestionClick = (suggestionText) => { if (!isSubmitting && !aiIsThinking) sendMessage(suggestionText); };
  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } };
  const handleQuickResponse = (responseText) => { if (!isSubmitting && !aiIsThinking) sendMessage(responseText); };
  const handleDisplayComplete = useCallback(() => { setTextCompletion(1); scrollToBottom(); }, [scrollToBottom]);

  const renderAIMessage = (message) => {
    const isActive = message.id === latestMessageId;
    const { textContent, interactiveElement } = message;

    let InteractiveComponent = null;
    if (interactiveElement?.type && interactiveElement?.data) { // Optional chaining for safety
      const props = { key: `${message.id}-${interactiveElement.type}`, onAnswer: handleSuggestionClick, isSubmitting, disabled: !isActive };
      switch (interactiveElement.type) {
        case 'scenario': InteractiveComponent = <ScenarioQuestion scenario={interactiveElement.data.scenario} {...props} />; break;
        case 'multipleChoice': InteractiveComponent = <MultipleChoiceQuestion question={interactiveElement.data.multipleChoice} {...props} />; break;
        case 'matching': InteractiveComponent = <MatchingQuestion question={interactiveElement.data.matching} {...props} />; break;
        case 'ordering': InteractiveComponent = <OrderingQuestion question={interactiveElement.data.ordering} {...props} />; break;
        case 'roleplay': InteractiveComponent = <RoleplayDialog roleplay={interactiveElement.data.roleplay} disabled={!isActive} />; break; // Pass disabled only
        case 'feedback': InteractiveComponent = <FeedbackComponent feedback={interactiveElement.data.feedback} disabled={!isActive} />; break; // Pass disabled only
        case 'suggestions':
          const suggestions = interactiveElement.data.suggestions;
          const text = interactiveElement.data.text; // Text associated with suggestions
           // Check for binary question pattern robustly
           const isBinary = Array.isArray(suggestions) && suggestions.length === 2 &&
                            suggestions.some(s => /(ja|sant|true)/i.test(s?.label || s?.value || "")) &&
                            suggestions.some(s => /(nej|falskt|false)/i.test(s?.label || s?.value || ""));

          if (isBinary) {
            InteractiveComponent = <SimpleBinaryQuestion text={text} options={suggestions} {...props} />;
          } else if (Array.isArray(suggestions)) {
            InteractiveComponent = (
              <div className="suggestions-container">
                {suggestions.map((sugg, idx) => (
                    sugg && (typeof sugg.label === 'string' || typeof sugg.value === 'string') ? ( // Validate sugg
                    <Button key={idx} className="suggestion-button" variant="contained"
                      onClick={() => props.onAnswer(sugg.label || sugg.value)}
                      disabled={props.disabled || props.isSubmitting}
                      sx={{ opacity: props.disabled ? 0.7 : 1, cursor: props.disabled ? 'default' : 'pointer' }}
                    >
                      {sugg.label || sugg.value}
                    </Button>
                    ) : null
                ))}
              </div>
            );
          }
          break;
        default: console.warn(`Unknown interactive element type: ${interactiveElement.type}`);
      }
    }

    return (
      <Box key={message.id} className={`chat-message assistant ${isActive ? 'active-message' : ''}`}>
        {/* Render text content, animate if active */}
         {typeof textContent === 'string' && textContent.length > 0 && ( // Ensure textContent is a non-empty string
          isActive ? (
            <SmoothTextDisplay text={textContent} onComplete={handleDisplayComplete} scrollToBottom={scrollToBottom} setTextCompletion={setTextCompletion} />
          ) : (
            <ReactMarkdown className="markdown-content">{textContent}</ReactMarkdown>
          )
        )}

        {/* Render interactive component if it exists */}
        {InteractiveComponent && (
          <div className="interactive-content">
            <AnimatedInteractiveItem isVisible={true} animationPhase={isActive ? textCompletion : 1} index={0} uniqueId={`${message.id}-interactive`} disabled={!isActive}>
              {InteractiveComponent}
            </AnimatedInteractiveItem>
          </div>
        )}
      </Box>
    );
  };

  return (
    <div className="chat-container" ref={chatContainerRef}>
      <div className="chat-header">
        <h1>Delegeringsutbildning</h1>
        <div className="chat-header-description">Välkommen {userName}! ...</div>
      </div>

      <div className="chat-messages" ref={messagesContainerRef}>
        {messages.map((msg) => {
           if (msg.sender === 'assistant') {
               return renderAIMessage(msg);
           } else {
               // ** KORRIGERING HÄR **
               return (
                   <Box key={msg.id} className="chat-message user">
                      {/* Rendera användarens text direkt, inte via ReactMarkdown */}
                       <p>{typeof msg.textContent === 'string' ? msg.textContent : ''}</p>
                   </Box>
               );
           }
        })}

        {aiIsThinking && ( /* ... AI thinking indicator ... */ )}
        <div ref={messagesEndRef} style={{ height: 1 }} />
      </div>

      <div className="quick-responses-area">
        <QuickResponseButtons onSendQuickResponse={handleQuickResponse} disabled={isSubmitting || aiIsThinking} />
      </div>

      <div className="input-area">
        <TextField fullWidth variant="outlined" value={userInput}
          onChange={(e) => setUserInput(e.target.value)} placeholder="Skriv ditt meddelande här..."
          onKeyDown={handleKeyDown} disabled={isSubmitting || aiIsThinking} multiline maxRows={3}
        />
        <Button variant="contained" color="primary" onClick={handleSendMessage}
          disabled={isSubmitting || !userInput.trim() || aiIsThinking}
        >
          {isSubmitting || aiIsThinking ? "Väntar..." : "Skicka"}
        </Button>
      </div>
    </div>
  );
};

export default ChatComponent;
