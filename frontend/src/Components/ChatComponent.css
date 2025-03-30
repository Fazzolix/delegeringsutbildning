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

// --- Helper Components (unchanged logic, just ensure they exist) ---

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

    // Send back the text of the selected option(s)
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
            // Make label itself non-interactive if disabled
            sx={{ cursor: disabled ? 'default' : 'pointer' }}
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
    setMatches(prev => ({ ...prev, [itemId]: matchId }));
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
              <Paper elevation={disabled ? 0 : 2} className="matching-item">
                <Typography variant="body1" className="item-text">{item.text}</Typography>
                <FormControl fullWidth>
                  <select
                    value={matches[item.id] || ''}
                    onChange={(e) => handleMatch(item.id, e.target.value)}
                    disabled={isSubmitting || disabled}
                    className="matching-select"
                    style={{ cursor: disabled ? 'default' : 'pointer' }}
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
  // Initialize state with items in their initial (likely random) order
  const [orderedItems, setOrderedItems] = useState([...question.items]);

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
    // Send back the ordered text items joined by an arrow
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
              <Button
                size="small"
                variant="outlined"
                disabled={index === 0 || isSubmitting || disabled}
                onClick={() => moveItem(index, -1)}
                sx={{ opacity: disabled ? 0.6 : 1, cursor: disabled ? 'default' : 'pointer' }}
              >
                ↑
              </Button>
              <Button
                size="small"
                variant="outlined"
                disabled={index === orderedItems.length - 1 || isSubmitting || disabled}
                onClick={() => moveItem(index, 1)}
                sx={{ opacity: disabled ? 0.6 : 1, cursor: disabled ? 'default' : 'pointer' }}
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
    if (!scenario || !scenario.options) {
        console.error("Scenario data is missing or invalid:", scenario);
        return <Alert severity="error">Kunde inte ladda scenariot.</Alert>;
    }
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
              key={option.value || index} // Use value if available, otherwise index
              variant="outlined"
              color="primary"
              fullWidth
              disabled={isSubmitting || disabled}
              onClick={() => !disabled && onAnswer(option.label)} // Send label as the answer
              className="scenario-option-btn"
              sx={{ opacity: disabled ? 0.7 : 1, cursor: disabled ? 'default' : 'pointer' }}
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
    if (!roleplay || !roleplay.dialogue) {
        console.error("Roleplay data is missing or invalid:", roleplay);
        return <Alert severity="error">Kunde inte ladda rollspelet.</Alert>;
    }
  const { title, scenario, dialogue, learningPoints } = roleplay;
  const roleStyles = {
    "Sjuksköterska": { bgcolor: "#4caf50", initials: "S" },
    "Sjuksköterska Sara": { bgcolor: "#4caf50", initials: "S" },
    "Läkare": { bgcolor: "#2196f3", initials: "L" },
    "Patient": { bgcolor: "#ff9800", initials: "P" },
    "Undersköterska": { bgcolor: "#9c27b0", initials: "U" },
    "Undersköterska (du)": { bgcolor: "#9c27b0", initials: "U" }
  };
  const getInitials = (role) => (roleStyles[role] ? roleStyles[role].initials : role.charAt(0));
  const getColor = (role) => (roleStyles[role] ? roleStyles[role].bgcolor : "#607d8b");

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
              <li key={index}><Typography variant="body2">{point}</Typography></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

// Feedback component
const FeedbackComponent = ({ feedback, disabled = false }) => {
    if (!feedback) {
        console.error("Feedback data is missing:", feedback);
        return <Alert severity="error">Kunde inte ladda feedback.</Alert>;
    }
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
        <Typography variant="subtitle1" className="feedback-title">{style.title}</Typography>
        <Typography variant="body1" className="feedback-message">{feedback.message}</Typography>
        {feedback.points && feedback.points.length > 0 && (
          <ul className="feedback-points">
            {feedback.points.map((point, idx) => (<li key={idx}>{point}</li>))}
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

// Simple Binary Question (Yes/No, True/False)
const SimpleBinaryQuestion = ({ text, options, onAnswer, isSubmitting, disabled = false }) => {
    if (!options || options.length !== 2) {
        console.error("Binary question data is missing or invalid:", options);
        return <Alert severity="error">Kunde inte ladda frågan.</Alert>;
    }
    return (
    <div className={`binary-question-container ${disabled ? 'disabled-binary-question' : ''}`}>
      {text && <Typography variant="body1" className="binary-question-text">{text}</Typography>}
      <div className="binary-options">
        {options.map((option, index) => (
          <Button
            key={index}
            variant="contained"
            // Determine color based on common patterns (Ja/Sant first, Nej/Falskt second)
            color={/(ja|sant|true)/i.test(option.label || option.value || "") ? "primary" : "secondary"}
            disabled={isSubmitting || disabled}
            onClick={() => !disabled && onAnswer(option.label || option.value)}
            className="binary-option-btn"
            sx={{ opacity: disabled ? 0.7 : 1, cursor: disabled ? 'default' : 'pointer' }}
          >
            {option.label || option.value}
          </Button>
        ))}
      </div>
    </div>
  );
};

// Quick Response Buttons
const QuickResponseButtons = ({ onSendQuickResponse, disabled }) => {
  const [activeIndex, setActiveIndex] = useState(null);
  const quickResponses = [
    { text: "Berätta mer om detta", icon: "🔍" },
    { text: "Jag förstår inte", icon: "❓" },
    { text: "Fortsätt", icon: "➡️" } // Changed to capital F for consistency if needed elsewhere
  ];

  const handleClick = (text, index) => {
    if (disabled) return;
    setActiveIndex(index);
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
          sx={{ cursor: disabled ? 'default' : 'pointer' }}
        />
      ))}
    </div>
  );
};

// Text Animation Component (remains largely the same, ensures smooth text display)
const SmoothTextDisplay = ({ text, onComplete, scrollToBottom, setTextCompletion }) => {
  const [paragraphs, setParagraphs] = useState([]);
  const [visibleParagraphs, setVisibleParagraphs] = useState(0);
  const timeoutRef = useRef(null);
  const prevTextRef = useRef('');
  const isMountedRef = useRef(true); // Track mount status

  useEffect(() => {
      isMountedRef.current = true;
      return () => { isMountedRef.current = false; }; // Cleanup on unmount
  }, []);

  useEffect(() => {
    if (!text || text === prevTextRef.current) return;
    prevTextRef.current = text;
    const rawText = text.replace(/\r\n/g, '\n');
    const majorBlocks = rawText.split(/\n\s*\n+/);
    const processedParagraphs = [];
    majorBlocks.forEach(block => {
      const trimmedBlock = block.trim();
      if (!trimmedBlock) return;
      // Keep lists together, split long paragraphs logically
      if (/^[\s]*[-*+]\s+/.test(trimmedBlock) || /^[\s]*\d+\.\s+/.test(trimmedBlock) || trimmedBlock.length < 180) {
        processedParagraphs.push(trimmedBlock);
      } else {
        const sentences = trimmedBlock.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) || [trimmedBlock];
        let currentGroup = '';
        sentences.forEach((sentence, i) => {
          const trimmedSentence = sentence.trim();
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
    setVisibleParagraphs(0); // Reset visibility
    if (setTextCompletion) setTextCompletion(0); // Reset completion state
  }, [text, setTextCompletion]); // Added setTextCompletion dependency

  useEffect(() => {
    if (!isMountedRef.current) return; // Prevent updates if unmounted

    if (visibleParagraphs < paragraphs.length) {
      if (visibleParagraphs > 0) setTimeout(scrollToBottom, 50);
      const currentPara = paragraphs[visibleParagraphs] || '';
      let delay = 120;
      const wordCount = currentPara.split(/\s+/).length;
      if (/^[\s]*[-*+]\s+/.test(currentPara) || /^[\s]*\d+\.\s+/.test(currentPara)) delay = 180;
      else if (/\?$/.test(currentPara)) delay = 150;
      else if (currentPara.length < 40) delay = 80;
      else delay += Math.min(wordCount / 15, 2.5) * 70;

      const newProgress = (visibleParagraphs + 1) / paragraphs.length; // Calculate progress based on next paragraph
      if (setTextCompletion) setTextCompletion(newProgress);

      if (timeoutRef.current) clearTimeout(timeoutRef.current); // Clear previous timer

      timeoutRef.current = setTimeout(() => {
         if (isMountedRef.current) { // Check mount status before setting state
            setVisibleParagraphs(prev => prev + 1);
         }
      }, delay);

    } else if (paragraphs.length > 0 && visibleParagraphs === paragraphs.length) {
      if (setTextCompletion) setTextCompletion(1);
      if (onComplete) onComplete();
    }

    return () => { // Cleanup timer on effect change or unmount
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

// Animated Interactive Item Component (logic remains similar, driven by textCompletion)
const AnimatedInteractiveItem = ({ children, index = 0, isVisible, animationPhase, uniqueId, disabled = false }) => {
  const [show, setShow] = useState(false);
  const timerRef = useRef(null);
  const instanceIdRef = useRef(`item-${uniqueId || Math.random().toString(36).substring(2)}`);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
        isMountedRef.current = false;
        if (timerRef.current) clearTimeout(timerRef.current); // Clear timer on unmount
    };
  }, []);

  useEffect(() => {
    if (!isMountedRef.current) return;

    if (isVisible && animationPhase >= 0.5) { // Start animating when text is 50% done
      setShow(false); // Reset for animation
      const baseDelay = animationPhase >= 0.9 ? 100 : 150; // Faster if text is almost done
      const delay = baseDelay + (index * (animationPhase >= 0.8 ? 100 : 150)); // Staggering

      if (timerRef.current) clearTimeout(timerRef.current); // Clear existing timer

      timerRef.current = setTimeout(() => {
          if(isMountedRef.current) setShow(true); // Show after delay if still mounted
      }, delay);

    } else {
      setShow(false); // Hide if not visible or animation phase is too early
      if (timerRef.current) clearTimeout(timerRef.current); // Clear timer if visibility changes
    }

     // Cleanup function for this effect
     return () => {
         if (timerRef.current) clearTimeout(timerRef.current);
     };
  }, [isVisible, index, animationPhase]); // Rerun when these change

  if (!isVisible) return null; // Don't render if parent isn't visible

  return (
    <div
      id={instanceIdRef.current}
      className={`interactive-item ${show ? 'animate-in' : ''} ${disabled ? 'inactive-interactive-item' : ''}`}
      style={{
        opacity: show ? 1 : 0, // Control opacity based on 'show' state
        transform: show ? 'translateY(0)' : 'translateY(20px)',
        transition: 'opacity 0.5s ease-out, transform 0.5s ease-out',
        pointerEvents: show && !disabled ? 'auto' : 'none', // Enable interaction only when shown and not disabled
        ...(disabled && { // Add specific styles when disabled
            // opacity: 0.8, // Already handled by className potentially
            // filter: 'grayscale(50%)', // Example visual cue
        }),
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
  const [textCompletion, setTextCompletion] = useState(0); // Tracks text animation progress (0 to 1)
  const [latestMessageId, setLatestMessageId] = useState(null); // ID of the latest AI message

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const navigate = useNavigate();
  const chatContainerRef = useRef(null);

  // Retrieve user info from localStorage
  const userName = localStorage.getItem('userName') || 'Användare';
  const underskoterska = localStorage.getItem('underskoterska') || 'nej';
  const delegering = localStorage.getItem('delegering') || 'nej';

  // Redirect if chat hasn't been started via Welcome page
  useEffect(() => {
    if (localStorage.getItem('hasStartedChat') !== 'true') {
      navigate('/');
    }
  }, [navigate]);

  // Scroll to bottom function
  const scrollToBottom = useCallback(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, []);

  // Auto-scroll when messages update
  useEffect(() => {
    // Delay scroll slightly to allow rendering and animation to start
    const timer = setTimeout(() => {
        scrollToBottom();
    }, 100); // Adjust delay as needed
    return () => clearTimeout(timer);
}, [messages, scrollToBottom]); // Run when messages change


  // Auto-scroll on window resize
  useEffect(() => {
    const handleResize = () => scrollToBottom();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [scrollToBottom]);

  // Fix mobile viewport height issues
  useEffect(() => {
    const updateHeight = () => {
      if (chatContainerRef.current) {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
        // Use the --vh variable in CSS potentially, or set height directly
        // chatContainerRef.current.style.height = `calc(var(--vh, 1vh) * 100)`; // Example if using CSS var
        chatContainerRef.current.style.height = `${window.innerHeight}px`; // Direct height setting
      }
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  // Generate unique ID for messages
  const generateId = () => `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  // Start chat function (called on mount if no messages)
  const startChat = useCallback(async () => {
    console.log("Attempting to start chat...");
    setAiIsThinking(true);
    setTextCompletion(0); // Reset completion for the first message
    try {
      const response = await axios.post(API_ENDPOINTS.CHAT, {
        answers: { underskoterska, delegering },
        message: "start", // Special message to initiate
        name: userName
      });

      const { textContent, interactiveElement } = response.data.reply;
      const msgId = generateId();
      setLatestMessageId(msgId);

      setMessages([{
        id: msgId,
        sender: 'assistant',
        textContent: textContent,
        interactiveElement: interactiveElement // Store parsed element directly
      }]);
      // Text animation will start via SmoothTextDisplay
    } catch (error) {
      console.error("Fel vid start av chatt:", error);
      const errorMsgId = generateId();
      setLatestMessageId(errorMsgId);
      setMessages([{
        id: errorMsgId,
        sender: 'assistant',
        textContent: 'Det uppstod ett fel vid anslutning till servern. Vänligen ladda om sidan och försök igen.',
        interactiveElement: null
      }]);
      setTextCompletion(1); // Mark as complete since it's an error message
    } finally {
      setAiIsThinking(false);
    }
  }, [underskoterska, delegering, userName]); // Dependencies for startChat

  // Initialize chat on component mount if messages are empty
  useEffect(() => {
    if (messages.length === 0) {
      startChat();
    }
  }, [messages.length, startChat]); // Run only once on mount or if messages get cleared


  // Send message function
  const sendMessage = async (messageText) => {
    // Check if submission is allowed
    const trimmedText = messageText.trim();
    if (!trimmedText || isSubmitting || aiIsThinking) return; // Prevent sending empty or during AI thinking

    const newUserMessageId = generateId();
    const newUserMessage = {
      id: newUserMessageId,
      sender: 'user',
      textContent: trimmedText, // Store user text directly
      interactiveElement: null // Users don't send interactive elements
    };

    // Add user message and clear input immediately
    setMessages(prev => [...prev, newUserMessage]);
    setUserInput('');
    setIsSubmitting(true);
    setAiIsThinking(true);
    setTextCompletion(0); // Reset for the upcoming AI response
    setLatestMessageId(null); // Deactivate previous interactive elements

    // Scroll after adding user message
    setTimeout(scrollToBottom, 50);

    try {
      const response = await axios.post(API_ENDPOINTS.CHAT, {
        answers: { underskoterska, delegering },
        message: trimmedText,
        name: userName
      });

      const { textContent, interactiveElement } = response.data.reply;
      const newMessageId = generateId();
      setLatestMessageId(newMessageId); // Set the new latest ID

      setMessages(prev => [...prev, {
        id: newMessageId,
        sender: 'assistant',
        textContent: textContent,
        interactiveElement: interactiveElement
      }]);
      // Text animation will start via SmoothTextDisplay

    } catch (error) {
      console.error("Fel vid anrop till API:", error);
      const errorMsgId = generateId();
      setLatestMessageId(errorMsgId); // Update latest ID even for error message
      setMessages(prev => [...prev, {
        id: errorMsgId,
        sender: 'assistant',
        textContent: 'Det uppstod ett fel. Vänligen försök igen.',
        interactiveElement: null
      }]);
      setTextCompletion(1); // Mark error message as complete
    } finally {
      setIsSubmitting(false);
      setAiIsThinking(false);
    }
  };

  // --- UI Handlers ---
  const handleSendMessage = () => {
    sendMessage(userInput);
  };

  const handleSuggestionClick = (suggestionText) => {
    // Allow suggestion click even if AI is thinking? Maybe not.
     if (isSubmitting || aiIsThinking) return;
     sendMessage(suggestionText);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleQuickResponse = (responseText) => {
     if (isSubmitting || aiIsThinking) return;
     sendMessage(responseText);
  };

  // Callback when text animation completes
  const handleDisplayComplete = useCallback(() => {
    setTextCompletion(1); // Ensure completion state is 1
    scrollToBottom(); // Ensure scrolled to bottom after animation
  }, [scrollToBottom]);

  // --- Rendering Logic ---
  const renderAIMessage = (message) => {
    const isActive = message.id === latestMessageId;
    const { textContent, interactiveElement } = message;

    // Determine the specific interactive component to render
    let InteractiveComponent = null;
    if (interactiveElement && interactiveElement.type && interactiveElement.data) {
      const props = {
        key: `${message.id}-${interactiveElement.type}`, // Unique key for the component
        onAnswer: handleSuggestionClick, // Pass handler for buttons/actions
        isSubmitting: isSubmitting,
        disabled: !isActive, // Disable if not the latest message
      };

      switch (interactiveElement.type) {
        case 'scenario':
          InteractiveComponent = <ScenarioQuestion scenario={interactiveElement.data.scenario} {...props} />;
          break;
        case 'multipleChoice':
          InteractiveComponent = <MultipleChoiceQuestion question={interactiveElement.data.multipleChoice} {...props} />;
          break;
        case 'matching':
           InteractiveComponent = <MatchingQuestion question={interactiveElement.data.matching} {...props} />;
           break;
        case 'ordering':
            InteractiveComponent = <OrderingQuestion question={interactiveElement.data.ordering} {...props} />;
            break;
        case 'roleplay':
            // Roleplay doesn't usually have an "answer", it's display-only
            InteractiveComponent = <RoleplayDialog roleplay={interactiveElement.data.roleplay} disabled={!isActive} />;
            break;
        case 'feedback':
            // Feedback is also display-only
            InteractiveComponent = <FeedbackComponent feedback={interactiveElement.data.feedback} disabled={!isActive} />;
            break;
        case 'suggestions':
            // Handle simple suggestions (buttons) and binary questions
            const suggestions = interactiveElement.data.suggestions;
            const text = interactiveElement.data.text; // Get text associated with suggestions
            if (suggestions && suggestions.length === 2 && /(ja|nej|sant|falskt|true|false)/i.test(suggestions[0].label || suggestions[0].value)) {
                InteractiveComponent = <SimpleBinaryQuestion text={text} options={suggestions} {...props} />;
            } else if (suggestions) {
                InteractiveComponent = (
                    <div className="suggestions-container">
                        {suggestions.map((sugg, idx) => (
                        <Button
                            key={idx}
                            className="suggestion-button"
                            variant="contained"
                            onClick={() => props.onAnswer(sugg.label || sugg.value)}
                            disabled={props.disabled || props.isSubmitting}
                            sx={{ opacity: props.disabled ? 0.7 : 1, cursor: props.disabled ? 'default' : 'pointer' }}
                        >
                            {sugg.label || sugg.value}
                        </Button>
                        ))}
                    </div>
                );
            }
            break;
        // Add cases for 'media', 'exercise' if they become interactive
        default:
          console.warn(`Unknown interactive element type: ${interactiveElement.type}`);
      }
    }

    return (
      <Box key={message.id} className={`chat-message assistant ${isActive ? 'active-message' : ''}`}>
        {/* Display text content - animate if it's the active message */}
        {textContent && (
          isActive ? (
            <SmoothTextDisplay
              text={textContent}
              onComplete={handleDisplayComplete}
              scrollToBottom={scrollToBottom}
              setTextCompletion={setTextCompletion} // Pass setter to update progress
            />
          ) : (
            <ReactMarkdown className="markdown-content">{textContent}</ReactMarkdown>
          )
        )}

        {/* Display the interactive component within an animated wrapper */}
        {InteractiveComponent && (
          <div className="interactive-content">
            <AnimatedInteractiveItem
              isVisible={true} // Always attempt to render if component exists
              animationPhase={isActive ? textCompletion : 1} // Control animation timing
              index={0} // Only one main interactive element per message now
              uniqueId={`${message.id}-interactive`}
              disabled={!isActive} // Pass disabled state based on activity
            >
              {InteractiveComponent}
            </AnimatedInteractiveItem>
          </div>
        )}
      </Box>
    );
  };


  return (
    <div className="chat-container" ref={chatContainerRef}>
      {/* Header */}
      <div className="chat-header">
        <h1>Delegeringsutbildning</h1>
        <div className="chat-header-description">
          Välkommen {userName}! Du genomgår nu din personliga delegeringsutbildning.
        </div>
      </div>

      {/* Messages Area */}
      <div className="chat-messages" ref={messagesContainerRef}>
        {messages.map((msg) =>
          msg.sender === 'assistant'
            ? renderAIMessage(msg)
            : (
              <Box key={msg.id} className="chat-message user">
                {/* User messages are simple paragraphs */}
                <ReactMarkdown className="markdown-content">{msg.textContent}</ReactMarkdown>
              </Box>
            )
        )}

        {/* AI Thinking Indicator */}
        {aiIsThinking && (
          <div className="ai-thinking">
            <div className="ai-thinking-dots">
              <span></span><span></span><span></span>
            </div>
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} style={{ height: 1 }} />
      </div>

      {/* Quick Response Buttons Area */}
      {/* Show quick responses only when user can interact */}
      <div className="quick-responses-area">
        <QuickResponseButtons
          onSendQuickResponse={handleQuickResponse}
          disabled={isSubmitting || aiIsThinking}
        />
      </div>

      {/* Input Area */}
      <div className="input-area">
        <TextField
          fullWidth
          variant="outlined"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          placeholder="Skriv ditt meddelande här..."
          onKeyDown={handleKeyDown}
          disabled={isSubmitting || aiIsThinking} // Disable input while waiting
          multiline
          maxRows={3}
        />
        <Button
          variant="contained"
          color="primary"
          onClick={handleSendMessage}
          disabled={isSubmitting || !userInput.trim() || aiIsThinking} // Disable button appropriately
        >
          {isSubmitting || aiIsThinking ? "Väntar..." : "Skicka"}
        </Button>
      </div>

      {/* Removed TTS Widget and audio element */}

    </div>
  );
};

export default ChatComponent;
