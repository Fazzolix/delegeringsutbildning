// frontend/src/Components/ChatComponent.js
import API_ENDPOINTS from '../config/api';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import {
  Button, TextField, Box, Typography, FormControl, FormControlLabel, Radio,
  RadioGroup, Checkbox, FormGroup, Grid, Alert, Avatar, Chip, CircularProgress
} from '@mui/material';
import ReactMarkdown from 'react-markdown';
import { useNavigate } from 'react-router-dom';
import './ChatComponent.css'; // Keep your CSS file for styling

// ========================================================================== //
// ======================= HELPER COMPONENTS START ======================== //
// ========================================================================== //

// --- Multiple Choice / Radio Component ---
const MultipleChoiceQuestion = ({ question, onAnswer, isSubmitting, disabled = false }) => {
    const [selectedOptions, setSelectedOptions] = useState({});
    const [submitted, setSubmitted] = useState(false);

    useEffect(() => {
        setSelectedOptions({});
        setSubmitted(false);
    }, [question]);

    if (!question || !Array.isArray(question.options)) {
        console.error("MultipleChoiceQuestion received invalid data:", question);
        return <Alert severity="warning">Frågedata saknas eller är ogiltig.</Alert>;
    }

    const handleChange = (id) => {
        if (disabled || submitted) return;
        if (question.multiSelect) {
            setSelectedOptions(prev => ({ ...prev, [id]: !prev[id] }));
        } else {
            setSelectedOptions({ [id]: true });
        }
    };

    const handleSubmit = () => {
        if (disabled || submitted || isSubmitting) return;
        const selectedIds = Object.keys(selectedOptions).filter(id => selectedOptions[id]);
        if (selectedIds.length === 0) return;
        setSubmitted(true);
        const selectedLabels = selectedIds.map(id => question.options.find(opt => opt.id === id)?.text || '');
        onAnswer(selectedLabels.join(', '));
    };

    const ControlComponent = question.multiSelect ? Checkbox : Radio;
    const GroupComponent = question.multiSelect ? FormGroup : RadioGroup;

    return (
        <div className={`question-container multiple-choice ${disabled ? 'disabled-interactive' : ''}`}>
            <Typography variant="body1" className="question-title">{question.text}</Typography>
            <GroupComponent>
                {question.options.map((option) => (
                    <FormControlLabel
                        key={option.id}
                        control={
                            <ControlComponent
                                checked={!!selectedOptions[option.id]}
                                onChange={() => handleChange(option.id)}
                                disabled={isSubmitting || disabled || submitted}
                                size="small" // Smaller controls
                            />
                        }
                        label={<Typography variant="body2">{option.text}</Typography>} // Ensure label text size is consistent
                        disabled={isSubmitting || disabled || submitted}
                    />
                ))}
            </GroupComponent>
            <Button
                variant="contained"
                color="primary"
                onClick={handleSubmit}
                disabled={isSubmitting || Object.keys(selectedOptions).filter(k => selectedOptions[k]).length === 0 || disabled || submitted}
                className="question-submit-btn"
                size="small"
                sx={{ mt: 1.5 }}
            >
                {isSubmitting ? <CircularProgress size={20} color="inherit" /> : 'Svara'}
            </Button>
        </div>
    );
};

// --- Matching Component ---
const MatchingQuestion = ({ question, onAnswer, isSubmitting, disabled = false }) => {
    const [matches, setMatches] = useState({});
    const [submitted, setSubmitted] = useState(false);

    useEffect(() => {
        setMatches({});
        setSubmitted(false);
    }, [question]);

    if (!question || !Array.isArray(question.items) || !Array.isArray(question.matches)) {
        console.error("MatchingQuestion received invalid data:", question);
        return <Alert severity="warning">Matchningsfråga saknas eller är ogiltig.</Alert>;
    }

    const handleMatch = (itemId, matchId) => {
        if (disabled || submitted) return;
        setMatches(prev => ({ ...prev, [itemId]: matchId }));
    };

    const handleSubmit = () => {
        if (disabled || submitted || isSubmitting) return;
        setSubmitted(true);
        const matchResponse = Object.entries(matches).map(([itemId, matchId]) => {
            const itemText = question.items.find(i => i.id === itemId)?.text || `Item ${itemId}`;
            const matchText = question.matches.find(m => m.id === matchId)?.text || `Match ${matchId}`;
            return `${itemText} → ${matchText}`;
        }).join(' | ');
        onAnswer(matchResponse);
    };

    const allItemsMatched = question.items.length > 0 && Object.keys(matches).length === question.items.length;

    return (
        <div className={`question-container matching-question ${disabled ? 'disabled-interactive' : ''}`}>
            <Typography variant="body1" className="question-title">{question.text}</Typography>
            <Grid container spacing={1.5} sx={{ mt: 1 }}>
                {question.items.map((item) => (
                    <Grid item xs={12} sm={6} key={item.id}>
                        <div className="matching-item">
                            <Typography variant="body2" className="item-text">{item.text}</Typography>
                            <FormControl fullWidth variant="outlined" size="small">
                                <select
                                    value={matches[item.id] || ''}
                                    onChange={(e) => handleMatch(item.id, e.target.value)}
                                    disabled={isSubmitting || disabled || submitted}
                                    className="matching-select"
                                >
                                    <option value="" disabled>Välj matchning...</option>
                                    {question.matches.map((match) => (
                                        <option key={match.id} value={match.id}>
                                            {match.text}
                                        </option>
                                    ))}
                                </select>
                            </FormControl>
                        </div>
                    </Grid>
                ))}
            </Grid>
            <Button
                variant="contained"
                color="primary"
                onClick={handleSubmit}
                disabled={isSubmitting || !allItemsMatched || disabled || submitted}
                className="question-submit-btn"
                size="small"
                sx={{ mt: 2 }}
            >
                {isSubmitting ? <CircularProgress size={20} color="inherit" /> : 'Svara'}
            </Button>
        </div>
    );
};

// --- Ordering Component ---
const OrderingQuestion = ({ question, onAnswer, isSubmitting, disabled = false }) => {
    const [orderedItems, setOrderedItems] = useState(() => [...(question?.items || [])]);
    const [submitted, setSubmitted] = useState(false);

     useEffect(() => {
        setOrderedItems([...(Array.isArray(question?.items) ? question.items : [])]);
        setSubmitted(false);
    }, [question]);

    if (!question || !Array.isArray(question.items)) {
        console.error("OrderingQuestion received invalid data:", question);
        return <Alert severity="warning">Ordningsfråga saknas eller är ogiltig.</Alert>;
    }

    const moveItem = (index, direction) => {
        if (disabled || submitted || index + direction < 0 || index + direction >= orderedItems.length) return;
        const newOrder = [...orderedItems];
        [newOrder[index], newOrder[index + direction]] = [newOrder[index + direction], newOrder[index]];
        setOrderedItems(newOrder);
    };

    const handleSubmit = () => {
        if (disabled || submitted || isSubmitting) return;
        setSubmitted(true);
        const orderedResponse = orderedItems.map(item => item.text).join(' → ');
        onAnswer(orderedResponse);
    };

    return (
        <div className={`question-container ordering-question ${disabled ? 'disabled-interactive' : ''}`}>
            <Typography variant="body1" className="question-title">{question.text}</Typography>
            <div className="ordering-list">
                {orderedItems.map((item, index) => (
                    <div key={item.id} className="ordering-item">
                        <Typography variant="body2" sx={{ flexGrow: 1, mr: 1 }}>{index + 1}. {item.text}</Typography>
                        <div className="ordering-controls">
                            <Button size="small" variant="outlined" disabled={index === 0 || isSubmitting || disabled || submitted} onClick={() => moveItem(index, -1)} aria-label={`Flytta upp ${item.text}`}> ↑ </Button>
                            <Button size="small" variant="outlined" disabled={index === orderedItems.length - 1 || isSubmitting || disabled || submitted} onClick={() => moveItem(index, 1)} aria-label={`Flytta ner ${item.text}`}> ↓ </Button>
                        </div>
                    </div>
                ))}
            </div>
            <Button
                variant="contained"
                color="primary"
                onClick={handleSubmit}
                disabled={isSubmitting || disabled || submitted}
                className="question-submit-btn"
                size="small"
                sx={{ mt: 2 }}
            >
                {isSubmitting ? <CircularProgress size={20} color="inherit" /> : 'Svara'}
            </Button>
        </div>
    );
};

// --- Scenario Component ---
const ScenarioQuestion = ({ scenario, onAnswer, isSubmitting, disabled = false }) => {
    const [submitted, setSubmitted] = useState(false);

     useEffect(() => {
        setSubmitted(false);
    }, [scenario]);

    if (!scenario || typeof scenario.description !== 'string' || !Array.isArray(scenario.options)) {
        console.error("ScenarioQuestion received invalid data:", scenario);
        return <Alert severity="warning">Scenariodata saknas eller är ogiltig.</Alert>;
    }

    const handleAnswerClick = (answerLabel) => {
        if (disabled || submitted || isSubmitting) return;
        setSubmitted(true);
        onAnswer(answerLabel);
    }

    return (
        <div className={`scenario-container ${disabled ? 'disabled-interactive' : ''}`}>
            {scenario.title && <Typography variant="h6" className="scenario-title">{scenario.title}</Typography>}
            <Typography variant="body1" className="scenario-description" sx={{ my: 1.5 }}>
                {scenario.description}
            </Typography>
            <div className="scenario-options">
                {scenario.options.map((option, index) => (
                    <Button
                        key={option.value || index}
                        variant="outlined"
                        color="primary"
                        fullWidth
                        disabled={isSubmitting || disabled || submitted}
                        onClick={() => handleAnswerClick(option.label)}
                        className="scenario-option-btn"
                        size="medium"
                        sx={{ mb: 1 }}
                    >
                        {option.label}
                    </Button>
                ))}
            </div>
        </div>
    );
};

// --- Roleplay Component ---
const RoleplayDialog = ({ roleplay, disabled = false }) => {
    if (!roleplay || !Array.isArray(roleplay.dialogue)) {
        console.error("RoleplayDialog received invalid data:", roleplay);
        return <Alert severity="warning">Rolllspelsdata saknas eller är ogiltig.</Alert>;
    }
    const { title, scenario, dialogue, learningPoints } = roleplay;

    const getAvatarStyle = (role) => {
        const r = typeof role === 'string' ? role.toLowerCase() : '';
        if (r.includes('sjuksköterska')) return { bgcolor: "#4caf50", initials: "S" };
        if (r.includes('läkare')) return { bgcolor: "#2196f3", initials: "L" };
        if (r.includes('patient')) return { bgcolor: "#ff9800", initials: "P" };
        if (r.includes('undersköterska')) return { bgcolor: "#9c27b0", initials: "U" };
        return { bgcolor: "#607d8b", initials: (role || '?').charAt(0) };
    };

    return (
        <div className={`roleplay-container ${disabled ? 'disabled-interactive' : ''}`}>
            <div className="roleplay-header">
                <Typography variant="h6">{title || "Rollspel"}</Typography>
                {scenario && <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>{scenario}</Typography>}
            </div>
            <div className="dialogue-container">
                {dialogue.map((entry, index) => {
                    if (!entry || typeof entry.role !== 'string' || typeof entry.message !== 'string') return null;
                    const { bgcolor, initials } = getAvatarStyle(entry.role);
                    const isUser = entry.role.toLowerCase().includes('(du)');
                    return (
                        <div key={index} className={`dialogue-entry ${isUser ? 'dialogue-user' : ''}`}>
                            {!isUser && <Avatar className="dialogue-avatar" sx={{ bgcolor: bgcolor, width: 32, height: 32, fontSize: '0.9rem' }}>{initials}</Avatar>}
                            <div className="dialogue-content">
                                {!isUser && <Typography variant="caption" className="dialogue-role" sx={{ color: 'text.secondary' }}>{entry.role.replace('(du)', '').trim()}</Typography>}
                                <Typography variant="body2" className="dialogue-message">{entry.message}</Typography>
                            </div>
                             {isUser && <Avatar className="dialogue-avatar" sx={{ bgcolor: '#bdbdbd', width: 32, height: 32, fontSize: '0.9rem' }}>Du</Avatar>}
                        </div>
                    );
                })}
            </div>
            {Array.isArray(learningPoints) && learningPoints.length > 0 && (
                <div className="learning-points">
                    <Typography variant="subtitle2" className="learning-points-header">Viktiga lärdomar:</Typography>
                    <ul className="learning-points-list">
                        {learningPoints.map((point, index) => (
                            typeof point === 'string' && <li key={index}><Typography variant="caption">{point}</Typography></li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

// --- Feedback Component ---
const FeedbackComponent = ({ feedback, disabled = false }) => {
     if (!feedback || typeof feedback.message !== 'string') {
        console.error("FeedbackComponent received invalid data:", feedback);
        return <Alert severity="warning">Feedbackdata saknas eller är ogiltig.</Alert>;
    }
    const feedbackStyles = {
        "knowledge": { severity: "info", icon: "💡", title: "Kunskapstips" },
        "procedure": { severity: "info", icon: "📋", title: "Procedurinfo" },
        "priority": { severity: "warning", icon: "⚖️", title: "Prioritering" },
        "safety": { severity: "error", icon: "⚠️", title: "Säkerhetsinfo" },
        "default": { severity: "info", icon: "ℹ️", title: "Feedback" }
    };
    const style = feedbackStyles[feedback.type] || feedbackStyles.default;

    return (
         <div className={`feedback-container feedback-${style.severity} ${disabled ? 'disabled-interactive' : ''}`}>
             <div className="feedback-icon">{style.icon}</div>
             <div className="feedback-content">
                <Typography variant="subtitle2" className="feedback-title">{style.title}</Typography>
                {feedback.userAnswer && <Typography variant="caption" sx={{ display: 'block', mb: 0.5, fontStyle: 'italic', color: 'text.secondary' }}>Ditt svar: "{feedback.userAnswer}"</Typography>}
                <Typography variant="body2" className="feedback-message">{feedback.message}</Typography>
                {Array.isArray(feedback.points) && feedback.points.length > 0 && (
                <ul className="feedback-points">
                    {feedback.points.map((point, idx) => (typeof point === 'string' && <li key={idx}>{point}</li>))}
                </ul>
                )}
                {feedback.correctAction && (
                <Typography variant="body2" className="feedback-action" sx={{ fontWeight: 'medium', mt: 1 }}>
                    Rekommendation: {feedback.correctAction}
                </Typography>
                )}
            </div>
        </div>
    );
};

// --- Suggestions Component ---
const SuggestionsComponent = ({ suggestionsData, onAnswer, isSubmitting, disabled = false }) => {
     if (!suggestionsData || !Array.isArray(suggestionsData.options)) {
        console.error("SuggestionsComponent received invalid data:", suggestionsData);
        return <Alert severity="warning">Förslagsdata saknas eller är ogiltig.</Alert>;
    }
    const { text, options } = suggestionsData;

    const isBinary = options.length === 2 && options.every(s => typeof (s.label || s.value) === 'string' && /(ja|nej|sant|falskt|true|false|fortsätt|förklara)/i.test(s.label || s.value));

    return (
        <div className={`suggestions-container ${disabled ? 'disabled-interactive' : ''}`}>
            {text && <Typography variant="body1" className="suggestions-text" sx={{ mb: 1.5 }}>{text}</Typography>}
            <div className={`suggestions-options ${isBinary ? 'binary-options' : ''}`}>
                {options.map((sugg, idx) => (
                    <Button
                        key={sugg.value || idx}
                        className="suggestion-button"
                        variant="contained"
                        // Slightly different styling for binary options if desired
                        color={isBinary ? (idx === 0 ? "primary" : "secondary") : "primary"}
                        onClick={() => onAnswer(sugg.value || sugg.label)}
                        disabled={isSubmitting || disabled}
                        size="small"
                    >
                        {sugg.label || sugg.value}
                    </Button>
                ))}
            </div>
        </div>
    );
};

// --- Smooth Text Display (Needed Component!) ---
const SmoothTextDisplay = ({ text, onComplete, scrollToBottom, setTextCompletion }) => {
  const [paragraphs, setParagraphs] = useState([]);
  const [visibleParagraphs, setVisibleParagraphs] = useState(0);
  const timeoutRef = useRef(null);
  const prevTextRef = useRef('');
  const isMountedRef = useRef(true);

  useEffect(() => {
      isMountedRef.current = true;
      return () => {
        isMountedRef.current = false;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      };
  }, []);

  useEffect(() => {
    if (!text || typeof text !== 'string' || text === prevTextRef.current) return;
    prevTextRef.current = text;

    const rawText = text.replace(/\r\n/g, '\n');
    const majorBlocks = rawText.split(/\n{2,}/);
    const processedParagraphs = [];

    majorBlocks.forEach(block => {
      const trimmedBlock = block.trim();
      if (!trimmedBlock) return;
      if (trimmedBlock.includes('\n')) {
        const lines = trimmedBlock.split('\n');
        let currentItem = '';
        lines.forEach((line, index) => {
          const trimmedLine = line.trim();
          if (/^[\s]*[-*+]\s+/.test(trimmedLine) || /^[\s]*\d+\.\s+/.test(trimmedLine)) {
            if (currentItem) processedParagraphs.push(currentItem);
            currentItem = trimmedLine;
          } else if (currentItem) {
             currentItem += '\n' + trimmedLine;
          } else {
              if(trimmedLine) processedParagraphs.push(trimmedLine);
              currentItem = '';
          }
           if (index === lines.length - 1 && currentItem) {
               processedParagraphs.push(currentItem);
           }
        });
      } else {
          processedParagraphs.push(trimmedBlock);
      }
    });

    setParagraphs(processedParagraphs);
    setVisibleParagraphs(0);
    // Initialize completion state if setter is provided
    // if (setTextCompletion) setTextCompletion(0); // We now set this via the callback in main component

  }, [text]); // Removed setTextCompletion from dependencies here

  useEffect(() => {
    if (!isMountedRef.current) return;

    if (visibleParagraphs < paragraphs.length) {
      // No automatic scroll here anymore
      const currentPara = paragraphs[visibleParagraphs] || '';
      let delay = 150; // Base delay
      const wordCount = currentPara.split(/\s+/).length;
      if (/^[\s]*[-*+]\s+/.test(currentPara) || /^[\s]*\d+\.\s+/.test(currentPara)) delay = 200;
      else if (/\?$/.test(currentPara)) delay = 180;
      else if (currentPara.length < 40) delay = 100;
      else delay += Math.min(wordCount / 15, 3) * 80;
      delay = Math.max(50, delay);

      // Don't update external completion state here directly
      // const newProgress = (visibleParagraphs + 1) / paragraphs.length;
      // if (setTextCompletion) setTextCompletion(newProgress);

      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      timeoutRef.current = setTimeout(() => {
         if (isMountedRef.current) {
            setVisibleParagraphs(prev => prev + 1);
         }
      }, delay);

    } else if (paragraphs.length > 0 && visibleParagraphs === paragraphs.length) {
        // Completion logic moved to the callback in the main component
        // if (setTextCompletion) setTextCompletion(1);
        if (onComplete) onComplete(); // Call completion callback when done
    }

    // Cleanup timer on unmount or when dependencies change
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };

    // Trigger completion callback only when paragraphs/visibleParagraphs change
  }, [visibleParagraphs, paragraphs, onComplete]);

   const skipAnimation = useCallback(() => {
    if (!isMountedRef.current) return;
    if (visibleParagraphs < paragraphs.length) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setVisibleParagraphs(paragraphs.length); // Show all immediately
      // Trigger completion callback *after* state updates have likely rendered
      requestAnimationFrame(() => {
          if (onComplete) onComplete();
      });
    }
  }, [visibleParagraphs, paragraphs, onComplete]);

  return (
    <div className="smooth-text" onClick={skipAnimation} style={{ cursor: visibleParagraphs < paragraphs.length ? 'pointer' : 'auto' }}>
      {paragraphs.slice(0, visibleParagraphs).map((para, index) => (
        <div key={index} className="animate-in-paragraph">
          {typeof para === 'string' ? <ReactMarkdown className="markdown-content">{para}</ReactMarkdown> : null}
        </div>
      ))}
      {visibleParagraphs < paragraphs.length && (
        <span className="typing-cursor"></span>
      )}
    </div>
  );
};

// --- Quick Response Buttons (Needed Component!) ---
const QuickResponseButtons = ({ onSendQuickResponse, disabled }) => {
  const [activeIndex, setActiveIndex] = useState(null);
  const quickResponses = [
    { text: "Berätta mer om detta", icon: "🔍" },
    { text: "Jag förstår inte", icon: "❓" },
    { text: "Fortsätt", icon: "➡️" }
  ];

  const handleClick = (text, index) => {
    if (disabled) return;
    setActiveIndex(index);
    // Short delay for visual feedback before sending
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
          color="primary" // Or default? Adjust styling in CSS
          sx={{ cursor: disabled ? 'default' : 'pointer' }}
        />
      ))}
    </div>
  );
};

// ========================================================================== //
// ======================== HELPER COMPONENTS END ========================= //
// ========================================================================== //


// --- Main Chat Component ---

const ChatComponent = () => {
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiIsThinking, setAiIsThinking] = useState(false);
  const [latestMessageId, setLatestMessageId] = useState(null);
  const [isLatestTextComplete, setIsLatestTextComplete] = useState(true); // Start as true (no animation initially)

  const messagesEndRef = useRef(null);
  const latestMessageRef = useRef(null);
  const navigate = useNavigate();
  const chatContainerRef = useRef(null);
  const startChatCalledRef = useRef(false);

  const userName = localStorage.getItem('userName') || 'Användare';
  const underskoterska = localStorage.getItem('underskoterska') || 'nej';
  const delegering = localStorage.getItem('delegering') || 'nej';

  useEffect(() => {
    if (localStorage.getItem('hasStartedChat') !== 'true') {
      navigate('/');
    }
  }, [navigate]);

  // Mobile viewport height fix
  useEffect(() => {
    const setVhProperty = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
      if (chatContainerRef.current) {
          chatContainerRef.current.style.height = `calc(var(--vh, 1vh) * 100)`;
      }
    };
    setVhProperty();
    window.addEventListener('resize', setVhProperty);
    return () => window.removeEventListener('resize', setVhProperty);
  }, []);

  const generateId = () => `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  // Scroll to start of the latest AI message
  useEffect(() => {
    if (latestMessageRef.current) {
      // Delay slightly to allow DOM update after message state change
      requestAnimationFrame(() => {
          setTimeout(() => {
              latestMessageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 50); // Short delay might be needed
      });
    }
  }, [latestMessageId]); // Trigger only when the *ID* of the latest message changes

   // Scroll to bottom after user message
   useEffect(() => {
    // This effect targets the absolute bottom, useful after sending a user message
    if (messages.length > 0 && messages[messages.length - 1].sender === 'user') {
        requestAnimationFrame(() => {
            setTimeout(() => {
                 messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 50);
        });
    }
  }, [messages]); // Trigger whenever messages array changes


  // Callback for SmoothTextDisplay completion
  const handleTextAnimationComplete = useCallback(() => {
    console.log("Text animation complete for message:", latestMessageId);
    setIsLatestTextComplete(true);
  }, [latestMessageId]); // Dependency ensures it refers to the correct message ID context

  // Start chat function
  const startChat = useCallback(async () => {
    if (startChatCalledRef.current || messages.length > 0) return;
    startChatCalledRef.current = true;

    setAiIsThinking(true);
    setIsLatestTextComplete(false); // New message is coming

    try {
      const response = await axios.post(API_ENDPOINTS.CHAT, {
        answers: { underskoterska, delegering }, message: "start", name: userName
      });

      const { textContent, interactiveElement } = response.data.reply;
      const msgId = generateId();

      setMessages([{ id: msgId, sender: 'assistant', textContent: textContent || "", interactiveElement: interactiveElement }]);
      setLatestMessageId(msgId); // Set ID *after* adding the message
       // setIsLatestTextComplete remains false until animation finishes
    } catch (error) {
      console.error("Fel vid start av chatt:", error);
      const errorMsgId = generateId();
      setMessages([{ id: errorMsgId, sender: 'assistant', textContent: 'Kunde inte starta chatten.', interactiveElement: null }]);
      setIsLatestTextComplete(true); // Error shown instantly
      setLatestMessageId(errorMsgId);
    } finally {
      setAiIsThinking(false);
    }
  }, [underskoterska, delegering, userName, messages.length]);

  useEffect(() => {
    if (messages.length === 0 && localStorage.getItem('hasStartedChat') === 'true') {
         startChat();
    }
  }, [startChat, messages.length]);

  // Send message function
  const sendMessage = async (messageText) => {
    const trimmedText = messageText.trim();
    if (!trimmedText || isSubmitting || aiIsThinking) return;

    const newUserMessageId = generateId();
    const newUserMessage = { id: newUserMessageId, sender: 'user', textContent: trimmedText, interactiveElement: null };

    setMessages(prev => [...prev, newUserMessage]);
    setUserInput('');
    setIsSubmitting(true);
    setAiIsThinking(true);
    setIsLatestTextComplete(false); // Expecting new AI text
    // Deactivate previous message's interactions *before* making the request
    const previousLatestId = latestMessageId;
    setLatestMessageId(null);

    // No automatic scroll here, handled by useEffect reacting to messages change

    try {
      const response = await axios.post(API_ENDPOINTS.CHAT, { message: trimmedText, name: userName });

      if (response?.data?.reply) {
        const { textContent, interactiveElement } = response.data.reply;
        const newMessageId = generateId();

        setMessages(prev => [...prev, {
            id: newMessageId, sender: 'assistant',
            textContent: textContent || "", interactiveElement: interactiveElement
        }]);
        // Set the new latest ID *after* the message is added to the state
        setLatestMessageId(newMessageId);
        // isLatestTextComplete remains false until animation callback
      } else { throw new Error("Invalid API response"); }
    } catch (error) {
      console.error("Fel vid API-anrop:", error);
      const errorMsgId = generateId();
      setMessages(prev => [...prev, { id: errorMsgId, sender: 'assistant', textContent: 'Ett fel uppstod.', interactiveElement: null }]);
      setIsLatestTextComplete(true); // Error message is instant
      setLatestMessageId(errorMsgId);
    } finally {
      setAiIsThinking(false);
      setIsSubmitting(false); // Allow input again
    }
  };

  const handleSuggestionClick = (suggestionValue) => {
     if (isSubmitting || aiIsThinking) return;
     sendMessage(suggestionValue);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isSubmitting && !aiIsThinking && userInput.trim()) {
      e.preventDefault();
      sendMessage(userInput);
    }
  };

   const handleQuickResponse = (responseText) => {
     if (isSubmitting || aiIsThinking) return;
     sendMessage(responseText);
  };

  // --- Rendering Logic ---
  const renderAIMessage = (message) => {
    const isLatest = message.id === latestMessageId;
    const { textContent, interactiveElement } = message;
    const messageRef = isLatest ? latestMessageRef : null; // Assign ref if it's the latest

    let interactiveComponent = null;
    if (interactiveElement?.type && interactiveElement?.data) {
        const interactiveType = interactiveElement.type;
        // Get data, handling potential nesting (e.g., data.suggestions vs data)
        const data = interactiveElement.data[interactiveType] || interactiveElement.data;
        const commonProps = {
            key: `${message.id}-${interactiveType}`,
            onAnswer: handleSuggestionClick, // Pass handler
            isSubmitting: isSubmitting || aiIsThinking,
            disabled: !isLatest, // Only latest is enabled
        };

      try {
          switch (interactiveType) {
               case 'scenario':       interactiveComponent = data?.options ? <ScenarioQuestion scenario={data} {...commonProps} /> : null; break;
               case 'multipleChoice': interactiveComponent = data?.options ? <MultipleChoiceQuestion question={data} {...commonProps} /> : null; break;
               case 'matching':       interactiveComponent = data?.items && data.matches ? <MatchingQuestion question={data} {...commonProps} /> : null; break;
               case 'ordering':       interactiveComponent = data?.items ? <OrderingQuestion question={data} {...commonProps} /> : null; break;
               case 'roleplay':       interactiveComponent = data?.dialogue ? <RoleplayDialog roleplay={data} disabled={!isLatest} /> : null; break;
               case 'feedback':       interactiveComponent = data?.message ? <FeedbackComponent feedback={data} disabled={!isLatest} /> : null; break;
               case 'suggestions':    interactiveComponent = data?.options ? <SuggestionsComponent suggestionsData={data} {...commonProps} /> : null; break;
              default: console.warn(`Unknown type: ${interactiveType}`);
          }
          if (!interactiveComponent && interactiveElement?.type) { // Log if component is null after switch
              console.error(`Failed to render interactive component for type ${interactiveType}. Data:`, data);
              interactiveComponent = <Alert severity="warning">Kunde inte visa interaktivt innehåll.</Alert>;
          }
        } catch (renderError) {
            console.error(`Error rendering component ${interactiveType}:`, renderError, "Data:", data);
            interactiveComponent = <Alert severity="error">Internt fel vid rendering.</Alert>;
        }
    }

    // Show interactive part only for the latest message AND after its text is complete
    const showInteractive = isLatest ? isLatestTextComplete : true; // Old messages always show their (disabled) interactive part

    return (
      <Box ref={messageRef} key={message.id} className={`chat-message assistant ${isLatest ? 'active-message' : ''}`}>
         {/* Text Content - Animate only if latest */}
         {typeof textContent === 'string' && textContent.length > 0 && (
           isLatest ? (
             <SmoothTextDisplay
               text={textContent}
               onComplete={handleTextAnimationComplete}
               // Dummy scroll function, actual scroll handled by useEffect
               scrollToBottom={() => {}}
             />
           ) : (
             <ReactMarkdown className="markdown-content">{textContent}</ReactMarkdown>
           )
         )}

         {/* Interactive Content Wrapper */}
         {interactiveComponent && (
           <div className={`interactive-content-wrapper ${showInteractive ? 'visible' : 'hidden'} ${!isLatest ? 'disabled-interactive' : ''}`}>
             {interactiveComponent}
           </div>
         )}
      </Box>
    );
  };


  return (
    <div className="chat-container" ref={chatContainerRef}>
      <div className="chat-header">
        <h1>Delegeringsutbildning</h1>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Välkommen {userName}! Personlig utbildning pågår.
        </Typography>
      </div>

      <div className="chat-messages">
        {messages.map((msg) => {
          if (msg.sender === 'assistant') {
             if (typeof msg.textContent !== 'string') return null;
            return renderAIMessage(msg);
          } else if (msg.sender === 'user') {
             if (typeof msg.textContent !== 'string') return null;
            return (
              <Box key={msg.id} className="chat-message user">
                <ReactMarkdown className="markdown-content">{msg.textContent}</ReactMarkdown>
              </Box>
            );
          }
          return null;
        })}
        {aiIsThinking && (
          <div className="ai-thinking">
            <div className="ai-thinking-dots"><span></span><span></span><span></span></div>
          </div>
        )}
         <div ref={messagesEndRef} style={{ height: '1px' }} /> {/* Scroll target */}
      </div>

      <div className="quick-responses-area">
        <QuickResponseButtons
          onSendQuickResponse={handleQuickResponse}
          disabled={isSubmitting || aiIsThinking}
        />
      </div>

      <div className="input-area">
        <TextField
          fullWidth
          variant="outlined"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          placeholder="Skriv ditt meddelande..."
          onKeyDown={handleKeyDown}
          disabled={isSubmitting || aiIsThinking}
          multiline
          minRows={1}
          maxRows={4}
           sx={{ '& .MuiOutlinedInput-root': { borderRadius: '20px', backgroundColor: '#fff', paddingRight: '50px' } }} // Padding for button overlap
        />
        <Button
          variant="contained"
          color="primary"
          onClick={() => sendMessage(userInput)}
          disabled={isSubmitting || !userInput.trim() || aiIsThinking}
           sx={{ borderRadius: '50%', minWidth: '46px', height: '46px', padding: 0, position: 'absolute', right: '18px', bottom: '18px' }} // Position button inside textfield
        >
          {isSubmitting || aiIsThinking ? <CircularProgress size={24} color="inherit" /> : <span style={{fontSize: '1.5rem'}}>➤</span>}
        </Button>
      </div>
    </div>
  );
};

export default ChatComponent;
