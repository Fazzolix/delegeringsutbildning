// frontend/src/Components/ChatComponent.js
import API_ENDPOINTS from '../config/api';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import {
  Button, TextField, Box, Typography, FormControl, FormControlLabel, Radio,
  RadioGroup, Checkbox, FormGroup, Grid, Alert, Avatar, Chip, CircularProgress
} from '@mui/material'; // Removed Paper, Card, CardHeader, CardContent where possible
import ReactMarkdown from 'react-markdown';
import { useNavigate } from 'react-router-dom';
import './ChatComponent.css'; // Keep your CSS file for styling

// --- Helper Components (Simplified Wrappers, more robust checks) ---

const MultipleChoiceQuestion = ({ question, onAnswer, isSubmitting, disabled = false }) => {
    const [selectedOptions, setSelectedOptions] = useState({});
    const [submitted, setSubmitted] = useState(false);

    useEffect(() => {
        setSelectedOptions({});
        setSubmitted(false);
    }, [question]); // Reset local state if the question object itself changes

    // Defensive check for data structure
    if (!question || !Array.isArray(question.options)) {
        console.error("MultipleChoiceQuestion received invalid data:", question);
        return <Alert severity="warning">Frågedata saknas eller är ogiltig.</Alert>;
    }

    const handleChange = (id) => {
        if (disabled || submitted) return;
        if (question.multiSelect) {
            setSelectedOptions(prev => ({ ...prev, [id]: !prev[id] }));
        } else {
            setSelectedOptions({ [id]: true }); // Select only this one
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
        // Removed Paper wrapper
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
                            />
                        }
                        label={option.text}
                        disabled={isSubmitting || disabled || submitted} // Disable label interaction too
                    />
                ))}
            </GroupComponent>
            <Button
                variant="contained"
                color="primary"
                onClick={handleSubmit}
                disabled={isSubmitting || Object.keys(selectedOptions).filter(k => selectedOptions[k]).length === 0 || disabled || submitted}
                className="question-submit-btn"
                size="small" // Smaller button
                sx={{ mt: 1.5 }} // Adjusted margin
            >
                {isSubmitting ? <CircularProgress size={20} color="inherit" /> : 'Svara'}
            </Button>
        </div>
    );
};

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
        // Removed Paper wrapper
        <div className={`question-container matching-question ${disabled ? 'disabled-interactive' : ''}`}>
            <Typography variant="body1" className="question-title">{question.text}</Typography>
            <Grid container spacing={1.5} sx={{ mt: 1 }}> {/* Added margin-top */}
                {question.items.map((item) => (
                    <Grid item xs={12} sm={6} key={item.id}> {/* Responsive grid */}
                        <div className="matching-item"> {/* Use div instead of Paper */}
                            <Typography variant="body2" className="item-text">{item.text}</Typography>
                            <FormControl fullWidth variant="outlined" size="small"> {/* Styled select */}
                                <select
                                    value={matches[item.id] || ''}
                                    onChange={(e) => handleMatch(item.id, e.target.value)}
                                    disabled={isSubmitting || disabled || submitted}
                                    className="matching-select" // Add CSS for this class
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

const OrderingQuestion = ({ question, onAnswer, isSubmitting, disabled = false }) => {
    const [orderedItems, setOrderedItems] = useState(() => [...(question?.items || [])]);
    const [submitted, setSubmitted] = useState(false);

     useEffect(() => {
        // Ensure items is an array before spreading
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
        // Removed Paper wrapper
        <div className={`question-container ordering-question ${disabled ? 'disabled-interactive' : ''}`}>
            <Typography variant="body1" className="question-title">{question.text}</Typography>
            <div className="ordering-list">
                {orderedItems.map((item, index) => (
                    // Use div instead of Paper
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

const ScenarioQuestion = ({ scenario, onAnswer, isSubmitting, disabled = false }) => {
    const [submitted, setSubmitted] = useState(false);

     useEffect(() => {
        setSubmitted(false);
    }, [scenario]);

    // Improved data validation
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
        // Removed Card structure, using simple divs
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
                        size="medium" // Slightly larger buttons for scenarios
                        sx={{ mb: 1 }} // Margin bottom for spacing
                    >
                        {option.label}
                    </Button>
                ))}
            </div>
        </div>
    );
};

const RoleplayDialog = ({ roleplay, disabled = false }) => {
    // Improved data validation
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
                    if (!entry || typeof entry.role !== 'string' || typeof entry.message !== 'string') return null; // Skip invalid entries
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

const FeedbackComponent = ({ feedback, disabled = false }) => {
     // Improved data validation
     if (!feedback || typeof feedback.message !== 'string') {
        console.error("FeedbackComponent received invalid data:", feedback);
        return <Alert severity="warning">Feedbackdata saknas eller är ogiltig.</Alert>;
    }
    const feedbackStyles = {
        "knowledge": { severity: "info", icon: "💡", title: "Kunskapstips" }, // Changed icon
        "procedure": { severity: "info", icon: "📋", title: "Procedurinfo" },
        "priority": { severity: "warning", icon: "⚖️", title: "Prioritering" },
        "safety": { severity: "error", icon: "⚠️", title: "Säkerhetsinfo" },
        // Add a default/fallback style
        "default": { severity: "info", icon: "ℹ️", title: "Feedback" }
    };
    const style = feedbackStyles[feedback.type] || feedbackStyles.default;

    // Using a simple div structure instead of Alert for cleaner look
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

// Suggestions/Binary Questions - Can be simplified or kept depending on preference
// Using the previous structure but ensuring it's wrapped correctly
const SuggestionsComponent = ({ suggestionsData, onAnswer, isSubmitting, disabled = false }) => {
     if (!suggestionsData || !Array.isArray(suggestionsData.options)) {
        console.error("SuggestionsComponent received invalid data:", suggestionsData);
        return <Alert severity="warning">Förslagsdata saknas eller är ogiltig.</Alert>;
    }
    const { text, options } = suggestionsData;

    // Check for binary pattern (optional, could just always render buttons)
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
                        color={isBinary && idx === 0 ? "primary" : "secondary"}
                        onClick={() => onAnswer(sugg.value || sugg.label)} // Send value if available, else label
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


// --- Main Chat Component ---

const ChatComponent = () => {
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false); // Tracks user submission -> AI response cycle
  const [aiIsThinking, setAiIsThinking] = useState(false); // Tracks if AI is currently generating response
  const [latestMessageId, setLatestMessageId] = useState(null); // ID of the latest AI message to enable interaction
  const [isLatestTextComplete, setIsLatestTextComplete] = useState(true); // Tracks if the latest AI text animation is done

  const messagesEndRef = useRef(null); // Ref to scroll to
  const latestMessageRef = useRef(null); // Ref to the latest AI message element
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

  // Unique ID generation
  const generateId = () => `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  // *** Revised Scrolling Logic ***
  useEffect(() => {
    // Scroll to the START of the latest AI message when it's added
    if (latestMessageRef.current) {
      latestMessageRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (messagesEndRef.current) {
        // Fallback: scroll to the very bottom if no specific message ref (e.g., after user message)
         messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [latestMessageId]); // Trigger scroll when the latest AI message ID changes

  // Callback for SmoothTextDisplay completion
   const handleTextAnimationComplete = useCallback(() => {
    setIsLatestTextComplete(true);
    // No automatic scroll here anymore
  }, []);

  // Start chat function
  const startChat = useCallback(async () => {
    if (startChatCalledRef.current || messages.length > 0) return;
    startChatCalledRef.current = true;

    console.log("Starting chat...");
    setAiIsThinking(true);
    setIsLatestTextComplete(false); // Expecting new text

    try {
      const response = await axios.post(API_ENDPOINTS.CHAT, {
        answers: { underskoterska, delegering },
        message: "start",
        name: userName
      });

      const { textContent, interactiveElement } = response.data.reply;
      const msgId = generateId();
      setLatestMessageId(msgId); // Set this as the latest message

      setMessages([{
        id: msgId,
        sender: 'assistant',
        textContent: textContent || "",
        interactiveElement: interactiveElement
      }]);
    } catch (error) {
      console.error("Fel vid start av chatt:", error);
      const errorMsgId = generateId();
      setMessages([{
        id: errorMsgId,
        sender: 'assistant',
        textContent: 'Kunde inte starta chatten. Ladda om sidan.',
        interactiveElement: null
      }]);
      setIsLatestTextComplete(true); // Error message is instantly complete
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
    const newUserMessage = {
      id: newUserMessageId, sender: 'user', textContent: trimmedText, interactiveElement: null
    };

    // Add user message, clear input, set loading states
    setMessages(prev => [...prev, newUserMessage]);
    setUserInput('');
    setIsSubmitting(true); // Block input field
    setAiIsThinking(true); // Show thinking indicator
    setIsLatestTextComplete(false); // New AI message incoming, text not complete yet
    const previousLatestId = latestMessageId; // Get the ID of the message that *was* latest
    setLatestMessageId(null); // Deactivate interactions on the previous message *immediately*

    // Scroll to bottom after user message is added
    requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }));

    try {
      const response = await axios.post(API_ENDPOINTS.CHAT, {
        // No need to send answers every time, backend gets it from session
        message: trimmedText,
        name: userName // Keep name for potential personalization in response
      });

      if (response?.data?.reply) {
        const { textContent, interactiveElement } = response.data.reply;
        const newMessageId = generateId();

        setMessages(prev => {
           // Disable interaction on the previous message explicitly if needed (optional)
           // const updatedPrev = prev.map(msg => msg.id === previousLatestId ? { ...msg, active: false } : msg);
           return [...prev, { // Use prev instead of updatedPrev if not modifying old messages
             id: newMessageId,
             sender: 'assistant',
             textContent: textContent || "",
             interactiveElement: interactiveElement
           }];
        });
        setLatestMessageId(newMessageId); // Set the *new* message as the latest/active one
        // isLatestTextComplete is still false, will be set by SmoothTextDisplay via callback
      } else {
        throw new Error("Invalid API response structure");
      }
    } catch (error) {
      console.error("Fel vid API-anrop:", error);
      const errorMsgId = generateId();
      setMessages(prev => [...prev, {
        id: errorMsgId, sender: 'assistant',
        textContent: 'Ett fel uppstod. Försök igen.', interactiveElement: null
      }]);
      setIsLatestTextComplete(true); // Error message is instantly complete
      setLatestMessageId(errorMsgId); // Make the error message the 'latest'
    } finally {
      // Only allow new input *after* AI is done thinking
      setAiIsThinking(false);
       // Keep isSubmitting true until text animation is ALSO complete? Optional.
       // For now, allow input as soon as AI is done thinking:
       setIsSubmitting(false);
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
  const renderAIMessage = (message, index) => {
    const isLatest = message.id === latestMessageId;
    const { textContent, interactiveElement } = message;

    // Assign ref to the latest message element for scrolling
    const messageRef = isLatest ? latestMessageRef : null;

    let interactiveComponent = null;
    let interactiveType = null;
    if (interactiveElement?.type && interactiveElement?.data) {
        interactiveType = interactiveElement.type;
        const data = interactiveElement.data[interactiveType] || interactiveElement.data; // Handle nested or direct data
        const commonProps = {
            key: `${message.id}-${interactiveType}`,
            onAnswer: handleSuggestionClick,
            isSubmitting: isSubmitting || aiIsThinking, // Disable if submitting OR thinking
            disabled: !isLatest, // Disable if not the absolutely latest message
        };

      try {
          switch (interactiveType) {
              case 'scenario':
                  if (data && data.options) { // Check essential props
                    interactiveComponent = <ScenarioQuestion scenario={data} {...commonProps} />;
                  } else { console.error("Invalid Scenario data:", data); }
                  break;
              case 'multipleChoice':
                   if (data && data.options) {
                    interactiveComponent = <MultipleChoiceQuestion question={data} {...commonProps} />;
                   } else { console.error("Invalid MultipleChoice data:", data); }
                  break;
              case 'matching':
                   if (data && data.items && data.matches) {
                    interactiveComponent = <MatchingQuestion question={data} {...commonProps} />;
                   } else { console.error("Invalid Matching data:", data); }
                  break;
              case 'ordering':
                  if (data && data.items) {
                    interactiveComponent = <OrderingQuestion question={data} {...commonProps} />;
                  } else { console.error("Invalid Ordering data:", data); }
                  break;
              case 'roleplay':
                   if (data && data.dialogue) {
                    interactiveComponent = <RoleplayDialog roleplay={data} disabled={!isLatest} />;
                   } else { console.error("Invalid Roleplay data:", data); }
                  break;
              case 'feedback':
                   if (data && data.message) {
                    interactiveComponent = <FeedbackComponent feedback={data} disabled={!isLatest} />;
                   } else { console.error("Invalid Feedback data:", data); }
                  break;
              case 'suggestions':
                  if (data && data.options) {
                    interactiveComponent = <SuggestionsComponent suggestionsData={data} {...commonProps} />;
                  } else { console.error("Invalid Suggestions data:", data); }
                  break;
              default:
                  console.warn(`Unknown interactive element type: ${interactiveType}`);
          }
        } catch (renderError) {
             console.error(`Error rendering interactive component type ${interactiveType}:`, renderError, "Data:", data);
              interactiveComponent = <Alert severity="error">Kunde inte visa interaktivt element.</Alert>;
        }
    }

    // Determine visibility of interactive part
    const showInteractive = isLatest ? isLatestTextComplete : true; // Show immediately if not latest, else wait for text

    return (
      <Box ref={messageRef} key={message.id} className={`chat-message assistant ${isLatest ? 'active-message' : ''}`}>
         {/* Text Content */}
         {typeof textContent === 'string' && textContent.length > 0 && (
           isLatest ? (
             <SmoothTextDisplay
               text={textContent}
               onComplete={handleTextAnimationComplete} // Use the new callback
               // Pass a dummy scrollToBottom or remove if not needed by SmoothTextDisplay internally
               scrollToBottom={() => {}}
               // Pass completion state setter if SmoothTextDisplay uses it directly (optional)
               // setTextCompletion={isLatest ? setIsLatestTextComplete : undefined} // Or manage completion purely via callback
             />
           ) : (
             // Render previously completed messages directly
             <ReactMarkdown className="markdown-content">{textContent}</ReactMarkdown>
           )
         )}

         {/* Interactive Content Wrapper (Rendered but visibility controlled by CSS) */}
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
      {/* Header */}
      <div className="chat-header">
        <h1>Delegeringsutbildning</h1>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Välkommen {userName}! Personlig utbildning pågår.
        </Typography>
      </div>

      {/* Messages Area */}
      <div className="chat-messages"> {/* Removed ref here, use messagesEndRef */}
        {messages.map((msg, index) => {
          if (msg.sender === 'assistant') {
             if (typeof msg.textContent !== 'string') return null; // Skip invalid
            return renderAIMessage(msg, index);
          } else if (msg.sender === 'user') {
             if (typeof msg.textContent !== 'string') return null; // Skip invalid
            return (
              <Box key={msg.id} className="chat-message user">
                <ReactMarkdown className="markdown-content">{msg.textContent}</ReactMarkdown>
              </Box>
            );
          }
          return null;
        })}

        {/* AI Thinking Indicator */}
        {aiIsThinking && (
          <div className="ai-thinking">
            <div className="ai-thinking-dots"><span></span><span></span><span></span></div>
             <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5 }}>Lexi tänker...</Typography>
          </div>
        )}
        {/* Invisible element at the end for fallback scrolling */}
         <div ref={messagesEndRef} />
      </div>

      {/* Quick Response Buttons Area - positioned above input */}
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
          placeholder="Skriv ditt meddelande eller välj ett alternativ..."
          onKeyDown={handleKeyDown}
          disabled={isSubmitting || aiIsThinking}
          multiline
          minRows={1} // Start smaller
          maxRows={4}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: '20px', backgroundColor: '#fff' } }} // Rounded input
        />
        <Button
          variant="contained"
          color="primary"
          onClick={() => sendMessage(userInput)} // Ensure it calls sendMessage
          disabled={isSubmitting || !userInput.trim() || aiIsThinking}
          sx={{ borderRadius: '50%', minWidth: '50px', height: '50px', ml: 1 }} // Round button
        >
          {isSubmitting || aiIsThinking ? <CircularProgress size={24} color="inherit" /> : "➤"} {/* Send icon */}
        </Button>
      </div>
    </div>
  );
};

export default ChatComponent;
