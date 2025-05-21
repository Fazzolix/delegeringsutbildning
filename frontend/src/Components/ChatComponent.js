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
  RadioGroup, // Added for single-choice radio buttons
  Checkbox,
  FormGroup,
  Paper,
  Grid,
  Alert,
  Card,
  CardContent,
  CardHeader,
  Avatar,
  Chip,
  CircularProgress // Added for button loading state
} from '@mui/material';
import ReactMarkdown from 'react-markdown';
import { useNavigate } from 'react-router-dom';
import './ChatComponent.css';

// --- Helper Components (Updated props and added null checks) ---

const MultipleChoiceQuestion = ({ question, onAnswer, isSubmitting, disabled = false }) => {
    const [selectedOptions, setSelectedOptions] = useState({});
    const [submitted, setSubmitted] = useState(false);

    // Reset local state if the question changes (important if the same component instance is reused)
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
        setSelectedOptions(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
        } else {
        const newSelection = {};
        newSelection[id] = true; // Only one can be selected
        setSelectedOptions(newSelection);
        }
    };

    const handleSubmit = () => {
        if (disabled || submitted || isSubmitting) return;

        const selectedIds = Object.keys(selectedOptions).filter(id => selectedOptions[id]);
        if (selectedIds.length === 0) return; // Don't submit if nothing is selected

        setSubmitted(true); // Mark as submitted locally

        const selectedLabels = selectedIds.map(id => {
        const option = question.options.find(opt => opt.id === id);
        return option ? option.text : '';
        });

        // Send back the text of the selected option(s)
        onAnswer(selectedLabels.join(', '));
    };

    const ControlComponent = question.multiSelect ? Checkbox : Radio;
    const GroupComponent = question.multiSelect ? FormGroup : RadioGroup;

    return (
        <div className={`question-container multiple-choice ${disabled || submitted ? 'disabled-question' : ''}`}>
        <Typography variant="h6" className="question-title">{question.text}</Typography>
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
                sx={{ cursor: (disabled || submitted) ? 'default' : 'pointer' }}
            />
            ))}
        </GroupComponent>
        <Button
            variant="contained"
            color="primary"
            onClick={handleSubmit}
            disabled={isSubmitting || Object.keys(selectedOptions).filter(k => selectedOptions[k]).length === 0 || disabled || submitted}
            className="question-submit-btn"
            sx={{ mt: 2, opacity: (disabled || submitted) ? 0.6 : 1 }} // Added margin-top
        >
            {isSubmitting ? <CircularProgress size={24} color="inherit" /> : 'Svara'}
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
        return <Alert severity="warning">Frågedata saknas eller är ogiltig.</Alert>;
    }

    const handleMatch = (itemId, matchId) => {
        if (disabled || submitted) return;
        setMatches(prev => ({ ...prev, [itemId]: matchId }));
    };

    const handleSubmit = () => {
        if (disabled || submitted || isSubmitting) return;
        setSubmitted(true);
        const matchResponse = Object.entries(matches).map(([itemId, matchId]) => {
            const item = question.items.find(i => i.id === itemId);
            const match = question.matches.find(m => m.id === matchId);
            return `${item?.text || `Item ${itemId}`} → ${match?.text || `Match ${matchId}`}`;
        }).join(' | ');
        onAnswer(matchResponse);
    };

    const allItemsMatched = question.items.length > 0 && Object.keys(matches).length === question.items.length;

    return (
        <div className={`question-container matching-question ${disabled || submitted ? 'disabled-question' : ''}`}>
        <Typography variant="h6" className="question-title">{question.text}</Typography>
        <div className="matching-grid">
            <Grid container spacing={2}>
            {question.items.map((item) => (
                <Grid item xs={12} key={item.id}>
                <Paper elevation={disabled || submitted ? 0 : 1} className="matching-item">
                    <Typography variant="body1" className="item-text">{item.text}</Typography>
                    <FormControl fullWidth>
                    <select
                        value={matches[item.id] || ''}
                        onChange={(e) => handleMatch(item.id, e.target.value)}
                        disabled={isSubmitting || disabled || submitted}
                        className="matching-select"
                        style={{ cursor: disabled || submitted ? 'default' : 'pointer' }}
                    >
                        <option value="">Välj...</option>
                        {question.matches.map((match) => (
                        <option key={match.id} value={match.id}>
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
            disabled={isSubmitting || !allItemsMatched || disabled || submitted}
            className="question-submit-btn"
            sx={{ mt: 2, opacity: (disabled || submitted) ? 0.6 : 1 }}
        >
            {isSubmitting ? <CircularProgress size={24} color="inherit" /> : 'Svara'}
        </Button>
        </div>
    );
};

const OrderingQuestion = ({ question, onAnswer, isSubmitting, disabled = false }) => {
    const [orderedItems, setOrderedItems] = useState(() => [...(question?.items || [])]);
    const [submitted, setSubmitted] = useState(false);

     useEffect(() => {
        setOrderedItems([...(question?.items || [])]);
        setSubmitted(false);
    }, [question]);

    if (!question || !Array.isArray(question.items)) {
        console.error("OrderingQuestion received invalid data:", question);
        return <Alert severity="warning">Frågedata saknas eller är ogiltig.</Alert>;
    }

    const moveItem = (index, direction) => {
        if (disabled || submitted) return;
        if ((direction < 0 && index === 0) || (direction > 0 && index === orderedItems.length - 1)) {
        return;
        }
        const newOrder = [...orderedItems];
        [newOrder[index], newOrder[index + direction]] = [newOrder[index + direction], newOrder[index]]; // Swap
        setOrderedItems(newOrder);
    };

    const handleSubmit = () => {
        if (disabled || submitted || isSubmitting) return;
        setSubmitted(true);
        const orderedResponse = orderedItems.map(item => item.text).join(' → ');
        onAnswer(orderedResponse);
    };

    return (
        <div className={`question-container ordering-question ${disabled || submitted ? 'disabled-question' : ''}`}>
        <Typography variant="h6" className="question-title">{question.text}</Typography>
        <div className="ordering-list">
            {orderedItems.map((item, index) => (
            <Paper key={item.id} elevation={disabled || submitted ? 0 : 1} className="ordering-item">
                <Typography variant="body1">{item.text}</Typography>
                <div className="ordering-controls">
                <Button
                    size="small"
                    variant="outlined"
                    disabled={index === 0 || isSubmitting || disabled || submitted}
                    onClick={() => moveItem(index, -1)}
                    sx={{ opacity: (disabled || submitted) ? 0.6 : 1, cursor: (disabled || submitted) ? 'default' : 'pointer' }}
                    aria-label={`Flytta upp ${item.text}`}
                >
                    ↑
                </Button>
                <Button
                    size="small"
                    variant="outlined"
                    disabled={index === orderedItems.length - 1 || isSubmitting || disabled || submitted}
                    onClick={() => moveItem(index, 1)}
                    sx={{ opacity: (disabled || submitted) ? 0.6 : 1, cursor: (disabled || submitted) ? 'default' : 'pointer' }}
                    aria-label={`Flytta ner ${item.text}`}
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
            disabled={isSubmitting || disabled || submitted}
            className="question-submit-btn"
            sx={{ mt: 2, opacity: (disabled || submitted) ? 0.6 : 1 }}
        >
            {isSubmitting ? <CircularProgress size={24} color="inherit" /> : 'Svara'}
        </Button>
        </div>
    );
};

const ScenarioQuestion = ({ scenario, onAnswer, isSubmitting, disabled = false }) => {
    const [submitted, setSubmitted] = useState(false);

     useEffect(() => {
        setSubmitted(false);
    }, [scenario]);

    if (!scenario || !Array.isArray(scenario.options)) {
        console.error("ScenarioQuestion received invalid data:", scenario);
        return <Alert severity="warning">Scenariodata saknas eller är ogiltig.</Alert>;
    }

    const handleAnswerClick = (answerLabel) => {
        if (disabled || submitted || isSubmitting) return;
        setSubmitted(true);
        onAnswer(answerLabel);
    }

    return (
        <Card className={`scenario-card ${disabled || submitted ? 'disabled-scenario' : ''}`}>
        <CardHeader
            title={scenario.title || "Patientsituation"}
            className="scenario-header"
            sx={{ bgcolor: (disabled || submitted) ? '#ffcc80' : undefined }} // Adjust color when disabled
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
                disabled={isSubmitting || disabled || submitted}
                onClick={() => handleAnswerClick(option.label)}
                className="scenario-option-btn"
                sx={{ opacity: (disabled || submitted) ? 0.7 : 1, cursor: (disabled || submitted) ? 'default' : 'pointer' }}
                >
                {option.label}
                </Button>
            ))}
            </div>
        </CardContent>
        </Card>
    );
};

const RoleplayDialog = ({ roleplay, disabled = false }) => {
    if (!roleplay || !Array.isArray(roleplay.dialogue)) {
        console.error("RoleplayDialog received invalid data:", roleplay);
        return <Alert severity="warning">Rolllspelsdata saknas eller är ogiltig.</Alert>;
    }
    const { title, scenario, dialogue, learningPoints } = roleplay;
    // Simplified styling logic
    const getAvatarStyle = (role) => {
        if (role.includes('Sjuksköterska')) return { bgcolor: "#4caf50", initials: "S" };
        if (role.includes('Läkare')) return { bgcolor: "#2196f3", initials: "L" };
        if (role.includes('Patient')) return { bgcolor: "#ff9800", initials: "P" };
        if (role.includes('Undersköterska')) return { bgcolor: "#9c27b0", initials: "U" };
        return { bgcolor: "#607d8b", initials: role.charAt(0) || '?' };
    };

    return (
        <div className={`roleplay-container ${disabled ? 'disabled-roleplay' : ''}`}>
        <div className="roleplay-header" sx={{ opacity: disabled ? 0.8 : 1 }}>
            <Typography variant="h6">{title || "Rollspel"}</Typography>
            {scenario && <Typography variant="body2" className="roleplay-scenario">{scenario}</Typography>}
        </div>
        <div className="dialogue-container">
            {dialogue.map((entry, index) => {
            const { bgcolor, initials } = getAvatarStyle(entry.role);
            return (
                <div key={index} className={`dialogue-entry ${entry.role.includes('(du)') ? 'dialogue-user' : ''}`}>
                <Avatar
                    className="dialogue-avatar"
                    sx={{ bgcolor: bgcolor, opacity: disabled ? 0.8 : 1, filter: disabled ? 'grayscale(30%)' : 'none' }}
                >
                    {initials}
                </Avatar>
                <div className="dialogue-content">
                    <Typography variant="subtitle2" className="dialogue-role">{entry.role}</Typography>
                    <Typography variant="body1" className="dialogue-message" sx={{ color: disabled ? '#555' : undefined }}>{entry.message}</Typography>
                </div>
                </div>
            );
            })}
        </div>
        {learningPoints && learningPoints.length > 0 && (
            <div className="learning-points">
            <Typography variant="subtitle1" className="learning-points-header">Viktiga lärdomar:</Typography>
            <ul className="learning-points-list">
                {learningPoints.map((point, index) => (
                <li key={index}><Typography variant="body2" sx={{ color: disabled ? '#555' : undefined }}>{point}</Typography></li>
                ))}
            </ul>
            </div>
        )}
        </div>
    );
};

const FeedbackComponent = ({ feedback, disabled = false }) => {
    if (!feedback) {
        console.error("FeedbackComponent received invalid data:", feedback);
        return <Alert severity="warning">Feedbackdata saknas eller är ogiltig.</Alert>;
    }
    const feedbackStyles = {
        "knowledge": { severity: "info", icon: "📚", title: "Kunskapstips" },
        "procedure": { severity: "info", icon: "📋", title: "Procedurinformation" },
        "priority": { severity: "warning", icon: "⚖️", title: "Prioriteringsråd" },
        "safety": { severity: "error", icon: "⚠️", title: "Viktigt säkerhetsråd" }
    };
    const style = feedbackStyles[feedback.type] || feedbackStyles.knowledge;

    return (
        <Alert
        severity={style.severity}
        icon={<span style={{ fontSize: '1.2rem' }}>{style.icon}</span>}
        className={`feedback-alert ${disabled ? 'disabled-feedback' : ''}`}
        sx={{ opacity: disabled ? 0.85 : 1 }}
        >
        <div className="feedback-content">
            <Typography variant="subtitle1" className="feedback-title">{style.title}</Typography>
            {feedback.userAnswer && <Typography variant="body2" sx={{ mb: 1, fontStyle: 'italic' }}>Ditt svar: "{feedback.userAnswer}"</Typography>}
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

const SimpleBinaryQuestion = ({ text, options, onAnswer, isSubmitting, disabled = false }) => {
    const [submitted, setSubmitted] = useState(false);

     useEffect(() => {
        setSubmitted(false);
    }, [text, options]); // Reset if question changes

    if (!options || options.length !== 2) {
        console.error("SimpleBinaryQuestion received invalid data:", options);
        return <Alert severity="warning">Frågedata saknas eller är ogiltig.</Alert>;
    }

    const handleAnswerClick = (answerLabel) => {
         if (disabled || submitted || isSubmitting) return;
         setSubmitted(true);
         onAnswer(answerLabel);
    }

    return (
        <div className={`binary-question-container ${disabled || submitted ? 'disabled-binary-question' : ''}`}>
        {text && <Typography variant="body1" className="binary-question-text">{text}</Typography>}
        <div className="binary-options">
            {options.map((option, index) => (
            <Button
                key={index}
                variant="contained"
                color={index === 0 ? "primary" : "secondary"} // Assuming first is often 'Yes/True'
                disabled={isSubmitting || disabled || submitted}
                onClick={() => handleAnswerClick(option.label || option.value)}
                className="binary-option-btn"
                sx={{ opacity: (disabled || submitted) ? 0.7 : 1, cursor: (disabled || submitted) ? 'default' : 'pointer' }}
            >
                {option.label || option.value}
            </Button>
            ))}
        </div>
        </div>
    );
};

const QuickResponseButtons = ({ onSendQuickResponse, disabled }) => {
  const [activeIndex, setActiveIndex] = useState(null);
  const quickResponses = [
    { text: "Berätta mer om detta", icon: "🔍" },
    { text: "Jag förstår inte", icon: "❓" }
    // { text: "Fortsätt", icon: "➡️" } // Removed as per instructions
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
    // Split by one or more newlines, keeping empty lines between major blocks if desired
    const majorBlocks = rawText.split(/\n{2,}/);
    const processedParagraphs = [];

    majorBlocks.forEach(block => {
      const trimmedBlock = block.trim();
      if (!trimmedBlock) return;

      // Treat list items individually if they are separated by single newlines within a block
      if (trimmedBlock.includes('\n')) {
        const lines = trimmedBlock.split('\n');
        let currentItem = '';
        lines.forEach((line, index) => {
          const trimmedLine = line.trim();
          if (/^[\s]*[-*+]\s+/.test(trimmedLine) || /^[\s]*\d+\.\s+/.test(trimmedLine)) {
            if (currentItem) processedParagraphs.push(currentItem); // Push previous item/paragraph
            currentItem = trimmedLine; // Start new list item
          } else if (currentItem) {
             // Append to current item if it looks like a continuation (simple heuristic)
             currentItem += '\n' + trimmedLine;
          } else {
              // Treat as a normal paragraph if it doesn't start like a list item
              if(trimmedLine) processedParagraphs.push(trimmedLine);
              currentItem = '';
          }
           // Push the last item/paragraph in the block
           if (index === lines.length - 1 && currentItem) {
               processedParagraphs.push(currentItem);
           }
        });

      } else {
          // Process blocks without internal newlines (likely single paragraphs or headers)
          processedParagraphs.push(trimmedBlock);
      }
    });

    setParagraphs(processedParagraphs);
    setVisibleParagraphs(0);
    if (setTextCompletion) setTextCompletion(0);

  }, [text, setTextCompletion]);

  useEffect(() => {
    if (!isMountedRef.current) return;

    if (visibleParagraphs < paragraphs.length) {
      if (visibleParagraphs > 0) {
        // Schedule scroll after a short delay to allow rendering
        requestAnimationFrame(() => setTimeout(scrollToBottom, 50));
      }
      const currentPara = paragraphs[visibleParagraphs] || '';
      let delay = 150; // Base delay
      const wordCount = currentPara.split(/\s+/).length;
      // Adjust delay based on content type or length
      if (/^[\s]*[-*+]\s+/.test(currentPara) || /^[\s]*\d+\.\s+/.test(currentPara)) delay = 200; // Slower for list items
      else if (/\?$/.test(currentPara)) delay = 180; // Slightly slower for questions
      else if (currentPara.length < 40) delay = 100; // Faster for short lines
      else delay += Math.min(wordCount / 15, 3) * 80; // Add delay based on word count, capped

      delay = Math.max(50, delay); // Ensure minimum delay

      const newProgress = (visibleParagraphs + 1) / paragraphs.length;
      if (setTextCompletion) setTextCompletion(newProgress);

      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      timeoutRef.current = setTimeout(() => {
         if (isMountedRef.current) {
            setVisibleParagraphs(prev => prev + 1);
         }
      }, delay);

    } else if (paragraphs.length > 0 && visibleParagraphs === paragraphs.length) {
        // Ensure completion is set to 1 and callback is called only once
      if (setTextCompletion) setTextCompletion(1);
      if (onComplete) onComplete();
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [visibleParagraphs, paragraphs, onComplete, scrollToBottom, setTextCompletion]);

   const skipAnimation = () => {
    if (!isMountedRef.current) return;
    if (visibleParagraphs < paragraphs.length) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setVisibleParagraphs(paragraphs.length); // Show all paragraphs
       if (setTextCompletion) setTextCompletion(1); // Mark as complete
       requestAnimationFrame(() => setTimeout(scrollToBottom, 50)); // Scroll after update
      if (onComplete) onComplete(); // Trigger completion callback
    }
  };

  return (
    <div className="smooth-text" onClick={skipAnimation} style={{ cursor: visibleParagraphs < paragraphs.length ? 'pointer' : 'auto' }}>
      {paragraphs.slice(0, visibleParagraphs).map((para, index) => (
        <div key={index} className="animate-in-paragraph">
          {/* Render using ReactMarkdown */}
          {typeof para === 'string' ? <ReactMarkdown className="markdown-content">{para}</ReactMarkdown> : null}
        </div>
      ))}
      {visibleParagraphs < paragraphs.length && (
        <span className="typing-cursor"></span>
      )}
    </div>
  );
};

const AnimatedInteractiveItem = ({ children, index = 0, isVisible, animationPhase, uniqueId, disabled = false }) => {
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
    if (!isMountedRef.current || !isVisible) {
        // If not visible or unmounted, ensure it's hidden and clear timer
        setShow(false);
        if (timerRef.current) clearTimeout(timerRef.current);
        return;
    }

    // Determine if animation should start based on phase
    const shouldAnimate = animationPhase >= 0.5; // Adjust threshold if needed

    if (shouldAnimate && !show) { // Only trigger animation if it should start and isn't already shown
      const baseDelay = animationPhase >= 0.9 ? 50 : 100; // Faster delay if text almost done
      const staggerDelay = index * (animationPhase >= 0.8 ? 80 : 120); // Staggering
      const totalDelay = baseDelay + staggerDelay;

      if (timerRef.current) clearTimeout(timerRef.current); // Clear previous timer

      timerRef.current = setTimeout(() => {
          if(isMountedRef.current) setShow(true); // Show after delay if still mounted
      }, totalDelay);

    } else if (!shouldAnimate && show) {
        // If phase drops below threshold and it's shown, hide it (optional, depends on desired behavior)
        // setShow(false);
        // if (timerRef.current) clearTimeout(timerRef.current);
    }

     // Cleanup function for this effect
     return () => {if (timerRef.current) clearTimeout(timerRef.current);
     };
  }, [isVisible, index, animationPhase, show]); // Re-run when visibility, index, phase, or show state changes

  if (!isVisible) return null;

  return (
    <div
      id={instanceIdRef.current}
      className={`interactive-item ${show ? 'animate-in' : ''} ${disabled ? 'inactive-interactive-item' : ''}`}
      style={{
        opacity: show ? 1 : 0,
        transform: show ? 'translateY(0)' : 'translateY(15px)', // Slightly smaller initial offset
        transition: 'opacity 0.4s ease-out, transform 0.4s ease-out',
        pointerEvents: show && !disabled ? 'auto' : 'none',
      }}
    >
      {/* Render children only when 'show' is true to avoid premature rendering/interaction issues */}
      {show ? children : null}
    </div>
  );
};


// --- Main Chat Component ---

const ChatComponent = () => {
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiIsThinking, setAiIsThinking] = useState(false);
  const [textCompletion, setTextCompletion] = useState(0); // Tracks text animation progress (0 to 1) for the latest message
  const [latestMessageId, setLatestMessageId] = useState(null); // ID of the latest AI message

  const messagesContainerRef = useRef(null);
  const navigate = useNavigate();
  const chatContainerRef = useRef(null);
  const startChatCalledRef = useRef(false); // To prevent multiple start calls

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

  // Scroll to bottom function using requestAnimationFrame for smoothness
  const scrollToBottom = useCallback(() => {
    if (messagesContainerRef.current) {
        requestAnimationFrame(() => {
            if (messagesContainerRef.current) {
                 messagesContainerRef.current.scrollTo({
                    top: messagesContainerRef.current.scrollHeight,
                    behavior: 'smooth'
                });
            }
       });
    }
  }, []);

  // Auto-scroll when messages update
  useEffect(() => {
    // Scroll slightly delayed to allow elements to render
    const timer = setTimeout(() => {
        scrollToBottom();
    }, 150);
    return () => clearTimeout(timer);
  }, [messages, scrollToBottom]);


  // Fix mobile viewport height issues
  useEffect(() => {
    const setVhProperty = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
      if (chatContainerRef.current) {
          // Use 100vh fallback for desktop, --vh for mobile adjustments
          chatContainerRef.current.style.height = `calc(var(--vh, 1vh) * 100)`;
      }
    };
    setVhProperty();
    window.addEventListener('resize', setVhProperty);
    return () => window.removeEventListener('resize', setVhProperty);
  }, []);

  // Generate unique ID for messages
  const generateId = () => `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  // Start chat function (called on mount if no messages)
  const startChat = useCallback(async () => {
    if (startChatCalledRef.current || messages.length > 0) return; // Prevent multiple calls
    startChatCalledRef.current = true; // Mark as called

    console.log("Attempting to start chat...");
    setAiIsThinking(true);
    setTextCompletion(0);
    setLatestMessageId(null); // Reset latest ID

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
        textContent: textContent || "", // Ensure textContent is always a string
        interactiveElement: interactiveElement // Store parsed element directly
      }]);
      // setTextCompletion will be set by SmoothTextDisplay
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
      setTextCompletion(1); // Mark error message as complete
    } finally {
      setAiIsThinking(false);
    }
  }, [underskoterska, delegering, userName, messages.length]); // Include messages.length

  // Initialize chat on component mount
  useEffect(() => {
    // Only call startChat if messages are empty and it hasn't been called before
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
      id: newUserMessageId,
      sender: 'user',
      textContent: trimmedText,
      interactiveElement: null
    };

    // Add user message and start thinking state
    setMessages(prev => [...prev, newUserMessage]);
    setUserInput('');
    setIsSubmitting(true); // Prevent further user input immediately
    setAiIsThinking(true);
    setTextCompletion(0); // Reset for the new AI response
    const previousLatestId = latestMessageId; // Store previous latest ID
    setLatestMessageId(null); // Deactivate previous interactive elements *before* sending request


    // Scroll after adding user message
    requestAnimationFrame(() => setTimeout(scrollToBottom, 50));

    try {
      const response = await axios.post(API_ENDPOINTS.CHAT, {
        answers: { underskoterska, delegering },
        message: trimmedText,
        name: userName
      });

       if (response?.data?.reply) {
           const { textContent, interactiveElement } = response.data.reply;
           const newMessageId = generateId();
           setLatestMessageId(newMessageId); // Set the new latest ID

           setMessages(prev => [...prev, {
             id: newMessageId,
             sender: 'assistant',
             textContent: textContent || "", // Ensure string
             interactiveElement: interactiveElement
           }]);
        } else {
            throw new Error("Invalid API response structure");
        }

    } catch (error) {
      console.error("Fel vid anrop till API:", error);
      const errorMsgId = generateId();
      setLatestMessageId(errorMsgId);
      setMessages(prev => [...prev, {
        id: errorMsgId,
        sender: 'assistant',
        textContent: 'Det uppstod ett fel när jag försökte svara. Vänligen försök igen.',
        interactiveElement: null
      }]);
      setTextCompletion(1); // Mark error message as complete
    } finally {
      setIsSubmitting(false); // Allow user input again *after* response or error
      setAiIsThinking(false);
    }
  };

  // --- UI Handlers ---
  const handleSendMessage = () => {
    sendMessage(userInput);
  };

  const handleSuggestionClick = (suggestionText) => {
     if (isSubmitting || aiIsThinking) return; // Double check interaction isn't allowed
     sendMessage(suggestionText);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isSubmitting && !aiIsThinking) {
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
    setTextCompletion(1); // Set completion state to 1
    requestAnimationFrame(() => setTimeout(scrollToBottom, 100)); // Ensure scroll after animation completes
  }, [scrollToBottom]);

  // --- Rendering Logic ---
  const renderAIMessage = (message) => {
    const isActive = message.id === latestMessageId;
    const { textContent, interactiveElement } = message;

    let InteractiveComponent = null;
    if (interactiveElement && interactiveElement.type && interactiveElement.data) {
      // Pass specific data based on type, and add disabled prop
      const commonProps = {
        key: `${message.id}-${interactiveElement.type}`, // Unique key
        onAnswer: handleSuggestionClick,
        isSubmitting: isSubmitting,
        disabled: !isActive, // Disable if not the latest active message
      };

      try {
          switch (interactiveElement.type) {
            case 'scenario':
                // Ensure the data structure is correct before accessing .scenario
                if (interactiveElement.data.scenario) {
                    InteractiveComponent = <ScenarioQuestion scenario={interactiveElement.data.scenario} {...commonProps} />;
                } else { console.error("Missing 'scenario' key in data for scenario type"); }
              break;
            case 'multipleChoice':
                if (interactiveElement.data.multipleChoice) {
                    InteractiveComponent = <MultipleChoiceQuestion question={interactiveElement.data.multipleChoice} {...commonProps} />;
                } else { console.error("Missing 'multipleChoice' key in data for multipleChoice type"); }
              break;
            case 'matching':
                if (interactiveElement.data.matching) {
                    InteractiveComponent = <MatchingQuestion question={interactiveElement.data.matching} {...commonProps} />;
                } else { console.error("Missing 'matching' key in data for matching type"); }
               break;
            case 'ordering':
                 if (interactiveElement.data.ordering) {
                    InteractiveComponent = <OrderingQuestion question={interactiveElement.data.ordering} {...commonProps} />;
                 } else { console.error("Missing 'ordering' key in data for ordering type"); }
                break;
            case 'roleplay':
                // Roleplay doesn't have onAnswer prop usually
                if (interactiveElement.data.roleplay) {
                    InteractiveComponent = <RoleplayDialog roleplay={interactiveElement.data.roleplay} disabled={!isActive} />;
                } else { console.error("Missing 'roleplay' key in data for roleplay type"); }
                break;
            case 'feedback':
                 // Feedback doesn't have onAnswer prop
                 if (interactiveElement.data.feedback) {
                    InteractiveComponent = <FeedbackComponent feedback={interactiveElement.data.feedback} disabled={!isActive} />;
                 } else { console.error("Missing 'feedback' key in data for feedback type"); }
                break;
            case 'suggestions':
                const suggestionsData = interactiveElement.data.suggestions || interactiveElement.data; // Handle both structures potentially
                const suggestions = suggestionsData?.options || suggestionsData?.suggestions; // Adapt to potential key names
                const text = suggestionsData?.text;

                if (suggestions && Array.isArray(suggestions)) {
                    // Check for binary question pattern (e.g., Ja/Nej)
                    const isBinary = suggestions.length === 2 && suggestions.every(s => typeof (s.label || s.value) === 'string' && /(ja|nej|sant|falskt|true|false)/i.test(s.label || s.value));

                    if (isBinary) {
                        InteractiveComponent = <SimpleBinaryQuestion text={text} options={suggestions} {...commonProps} />;
                    } else {
                        // Render standard suggestion buttons
                        InteractiveComponent = (
                        <div className="suggestions-container">
                            {text && <Typography variant="body2" sx={{ width: '100%', mb: 1 }}>{text}</Typography>}
                            {suggestions.map((sugg, idx) => (
                            <Button
                                key={sugg.value || idx} // Use value or index as key
                                className="suggestion-button"
                                variant="contained"
                                onClick={() => commonProps.onAnswer(sugg.label || sugg.value)}
                                disabled={commonProps.disabled || commonProps.isSubmitting}
                                sx={{ opacity: commonProps.disabled ? 0.7 : 1, cursor: commonProps.disabled ? 'default' : 'pointer' }}
                            >
                                {sugg.label || sugg.value}
                            </Button>
                            ))}
                        </div>
                        );
                    }
                 } else { console.error("Missing or invalid 'suggestions' array in data for suggestions type"); }
                break;
            default:
              console.warn(`Unknown interactive element type: ${interactiveElement.type}`);
          }
      } catch (renderError) {
           console.error(`Error rendering interactive component type ${interactiveElement.type}:`, renderError, "Data:", interactiveElement.data);
            InteractiveComponent = <Alert severity="error">Kunde inte rendera interaktivt element.</Alert>;
      }
    }

    return (
      <Box key={message.id} className={`chat-message assistant ${isActive ? 'active-message' : ''}`}>
        {/* Display text content - animate if it's the active message */}
        {typeof textContent === 'string' && textContent.length > 0 && (
          isActive ? (
            <SmoothTextDisplay
              text={textContent}
              onComplete={handleDisplayComplete}
              scrollToBottom={scrollToBottom}
              setTextCompletion={setTextCompletion}
            />
          ) : (
            <ReactMarkdown className="markdown-content">{textContent}</ReactMarkdown>
          )
        )}

        {/* Display the interactive component within an animated wrapper */}
        {InteractiveComponent && (
          <div className="interactive-content">
            <AnimatedInteractiveItem
              isVisible={true} // Always try to render if component exists
              animationPhase={isActive ? textCompletion : 1} // Use completion status for timing
              index={0} // Assume one main interactive element
              uniqueId={`${message.id}-interactive`}
              disabled={!isActive} // Pass disabled state
            >
              {InteractiveComponent}
            </AnimatedInteractiveItem>
          </div>
        )}
      </Box>
    );
  };


  return (
    // Use ref here for height adjustment
    <div className="chat-container" ref={chatContainerRef} style={{ height: '100vh' }}>
      {/* Header */}
      <div className="chat-header">
        <h1>Delegeringsutbildning</h1>
        <div className="chat-header-description">
          Välkommen {userName}! Du genomgår nu din personliga delegeringsutbildning.
        </div>
      </div>

      {/* Messages Area */}
      <div className="chat-messages" ref={messagesContainerRef}>
        {messages.map((msg) => {
          if (msg.sender === 'assistant') {
             // Ensure textContent is a string before rendering
             if (typeof msg.textContent !== 'string') {
                console.warn(`Message ${msg.id} has non-string textContent:`, msg.textContent);
                return null; // Or render a placeholder/error
             }
            return renderAIMessage(msg);
          } else if (msg.sender === 'user') {
             if (typeof msg.textContent !== 'string') {
                 console.warn(`User message ${msg.id} has non-string textContent:`, msg.textContent);
                 return null;
             }
            return (
              <Box key={msg.id} className="chat-message user">
                <ReactMarkdown className="markdown-content">{msg.textContent}</ReactMarkdown>
              </Box>
            );
          }
          return null; // Should not happen
        })}

        {/* AI Thinking Indicator */}
        {aiIsThinking && (
          <div className="ai-thinking">
            <div className="ai-thinking-dots">
              <span></span><span></span><span></span>
            </div>
          </div>
        )}
      </div>

      {/* Quick Response Buttons Area */}
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
          {isSubmitting || aiIsThinking ? <CircularProgress size={24} color="inherit" /> : "Skicka"}
        </Button>
      </div>

      {/* Removed TTS Widget and audio element */}

    </div>
  );
};

export default ChatComponent;
