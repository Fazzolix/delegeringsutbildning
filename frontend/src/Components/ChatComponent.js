// frontend/src/Components/ChatComponent.js
import API_ENDPOINTS from '../config/api';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import {
  Button, TextField, Box, Typography, FormControl, FormControlLabel, Radio,
  Checkbox, FormGroup, Paper, Grid, Alert, Card, CardContent, CardHeader,
  Avatar, Chip
} from '@mui/material';
import ReactMarkdown from 'react-markdown';
import { useNavigate } from 'react-router-dom';
import './ChatComponent.css';

// --- Helper Components (med extra prop-validering) ---

// Multiple choice component
const MultipleChoiceQuestion = ({ question, onAnswer, isSubmitting, disabled = false }) => {
  const [selectedOptions, setSelectedOptions] = useState({});
   // *** VIKTIG VALDIERING ***
   if (!question || typeof question.text !== 'string' || !Array.isArray(question.options)) {
    console.error("Invalid props for MultipleChoiceQuestion:", { question });
    return <Alert severity="error">Fel: Kunde inte ladda flervalsfråga.</Alert>;
  }
  const handleChange = (id) => { if (disabled) return; if (question.multiSelect) { setSelectedOptions(prev => ({ ...prev, [id]: !prev[id] })); } else { setSelectedOptions({ [id]: true }); } };
  const handleSubmit = () => { if (disabled) return; const selected = Object.keys(selectedOptions).filter(id => selectedOptions[id]); const selectedLabels = selected.map(id => question.options.find(opt => opt.id === id)?.text).filter(Boolean); onAnswer(selectedLabels.join(', ')); };
  return (<div className={`question-container multiple-choice ${disabled ? 'disabled-question' : ''}`}> <Typography variant="h6" className="question-title">{question.text}</Typography> <FormGroup> {question.options.map((option) => (option && typeof option.text === 'string' && option.id != null ? (<FormControlLabel key={option.id} control={question.multiSelect ? (<Checkbox checked={!!selectedOptions[option.id]} onChange={() => handleChange(option.id)} disabled={isSubmitting || disabled} />) : (<Radio checked={!!selectedOptions[option.id]} onChange={() => handleChange(option.id)} disabled={isSubmitting || disabled} />)} label={option.text} sx={{ cursor: disabled ? 'default' : 'pointer' }} />) : null))} </FormGroup> <Button variant="contained" color="primary" onClick={handleSubmit} disabled={isSubmitting || Object.keys(selectedOptions).filter(k => selectedOptions[k]).length === 0 || disabled} className="question-submit-btn" sx={{ opacity: disabled ? 0.6 : 1 }}> Svara </Button> </div>);
};
// Matching question component
const MatchingQuestion = ({ question, onAnswer, isSubmitting, disabled = false }) => {
  const [matches, setMatches] = useState({});
  // *** VIKTIG VALDIERING ***
  if (!question || typeof question.text !== 'string' || !Array.isArray(question.items) || !Array.isArray(question.matches)) {
    console.error("Invalid props for MatchingQuestion:", { question });
    return <Alert severity="error">Fel: Kunde inte ladda matchningsfråga.</Alert>;
  }
  const handleMatch = (itemId, matchId) => { if (disabled) return; setMatches(prev => ({ ...prev, [itemId]: matchId })); };
  const handleSubmit = () => { if (disabled) return; const matchResponse = Object.entries(matches).map(([itemId, matchId]) => { const item = question.items.find(i => i.id === itemId); const match = question.matches.find(m => m.id === matchId); return `${item?.text || 'Okänt'} → ${match?.text || 'Okänt'}`; }).join(' | '); onAnswer(matchResponse); };
  const itemsMatched = question.items.every(item => item && typeof item.id !== 'undefined' && matches[item.id] != null && matches[item.id] !== ''); // Added check for item validity
  return (<div className={`question-container matching-question ${disabled ? 'disabled-question' : ''}`}> <Typography variant="h6" className="question-title">{question.text}</Typography> <div className="matching-grid"> <Grid container spacing={2}> {question.items.map((item) => (item && typeof item.text === 'string' && item.id != null ? (<Grid item xs={12} key={item.id}> <Paper elevation={disabled ? 0 : 2} className="matching-item"> <Typography variant="body1" className="item-text">{item.text}</Typography> <FormControl fullWidth> <select value={matches[item.id] || ''} onChange={(e) => handleMatch(item.id, e.target.value)} disabled={isSubmitting || disabled} className="matching-select" style={{ cursor: disabled ? 'default' : 'pointer' }}> <option value="">Välj matchande alternativ...</option> {question.matches.map((match) => (match && typeof match.text === 'string' && match.id != null ? (<option key={match.id} value={match.id} disabled={(Object.values(matches).includes(match.id) && matches[item.id] !== match.id) || disabled}> {match.text} </option>) : null))} </select> </FormControl> </Paper> </Grid>) : null))} </Grid> </div> <Button variant="contained" color="primary" onClick={handleSubmit} disabled={isSubmitting || !itemsMatched || disabled} className="question-submit-btn" sx={{ opacity: disabled ? 0.6 : 1 }}> Svara </Button> </div>);
};
// Ordering question component
const OrderingQuestion = ({ question, onAnswer, isSubmitting, disabled = false }) => {
    // *** VIKTIG VALDIERING ***
    if (!question || typeof question.text !== 'string' || !Array.isArray(question.items)) {
        console.error("Invalid props for OrderingQuestion:", { question });
        return <Alert severity="error">Fel: Kunde inte ladda ordningsfråga.</Alert>;
    }
    const [orderedItems, setOrderedItems] = useState(() => question.items.filter(item => item && typeof item.text === 'string' && item.id != null));
    const moveItem = (index, direction) => { if (disabled) return; if ((direction < 0 && index === 0) || (direction > 0 && index === orderedItems.length - 1)) return; const newOrder = [...orderedItems]; [newOrder[index], newOrder[index + direction]] = [newOrder[index + direction], newOrder[index]]; setOrderedItems(newOrder); };
    const handleSubmit = () => { if (disabled) return; const orderedResponse = orderedItems.map(item => item.text).join(' → '); onAnswer(orderedResponse); };
    return (<div className={`question-container ordering-question ${disabled ? 'disabled-question' : ''}`}> <Typography variant="h6" className="question-title">{question.text}</Typography> <div className="ordering-list"> {orderedItems.map((item, index) => (<Paper key={item.id} elevation={disabled ? 0 : 2} className="ordering-item"> <Typography variant="body1">{item.text}</Typography> <div className="ordering-controls"> <Button size="small" variant="outlined" disabled={index === 0 || isSubmitting || disabled} onClick={() => moveItem(index, -1)} sx={{ opacity: disabled ? 0.6 : 1, cursor: disabled ? 'default' : 'pointer' }}> ↑ </Button> <Button size="small" variant="outlined" disabled={index === orderedItems.length - 1 || isSubmitting || disabled} onClick={() => moveItem(index, 1)} sx={{ opacity: disabled ? 0.6 : 1, cursor: disabled ? 'default' : 'pointer' }}> ↓ </Button> </div> </Paper>))} </div> <Button variant="contained" color="primary" onClick={handleSubmit} disabled={isSubmitting || disabled} className="question-submit-btn" sx={{ opacity: disabled ? 0.6 : 1 }}> Svara </Button> </div>);
};
// Scenario component
const ScenarioQuestion = ({ scenario, onAnswer, isSubmitting, disabled = false }) => {
    // *** VIKTIG VALDIERING ***
    if (!scenario || typeof scenario.description !== 'string' || !Array.isArray(scenario.options)) {
        console.error("Invalid props for ScenarioQuestion:", { scenario });
        return <Alert severity="error">Fel: Kunde inte ladda scenariot.</Alert>;
    }
    return (<Card className={`scenario-card ${disabled ? 'disabled-scenario' : ''}`}> <CardHeader title={scenario.title || "Patientsituation"} className="scenario-header" /> <CardContent> <Typography variant="body1" className="scenario-description">{scenario.description}</Typography> <div className="scenario-options"> {scenario.options.map((option, index) => (option && typeof option.label === 'string' ? (<Button key={option.value || index} variant="outlined" color="primary" fullWidth disabled={isSubmitting || disabled} onClick={() => !disabled && onAnswer(option.label)} className="scenario-option-btn" sx={{ opacity: disabled ? 0.7 : 1, cursor: disabled ? 'default' : 'pointer' }}> {option.label} </Button>) : null))} </div> </CardContent> </Card>);
};
// Roleplay component
const RoleplayDialog = ({ roleplay, disabled = false }) => {
    // *** VIKTIG VALDIERING ***
    if (!roleplay || typeof roleplay.title !== 'string' || typeof roleplay.scenario !== 'string' || !Array.isArray(roleplay.dialogue)) {
        console.error("Invalid props for RoleplayDialog:", { roleplay });
        return <Alert severity="error">Fel: Kunde inte ladda rollspelet.</Alert>;
    }
    const { title, scenario, dialogue, learningPoints } = roleplay; const roleStyles = { "Sjuksköterska": { bgcolor: "#4caf50", initials: "S" }, "Sjuksköterska Sara": { bgcolor: "#4caf50", initials: "S" }, "Läkare": { bgcolor: "#2196f3", initials: "L" }, "Patient": { bgcolor: "#ff9800", initials: "P" }, "Undersköterska": { bgcolor: "#9c27b0", initials: "U" }, "Undersköterska (du)": { bgcolor: "#9c27b0", initials: "U" } }; const getInitials = (role) => (roleStyles[role] ? roleStyles[role].initials : role?.charAt(0) ?? '?'); const getColor = (role) => (roleStyles[role] ? roleStyles[role].bgcolor : "#607d8b");
    return (<div className={`roleplay-container ${disabled ? 'disabled-roleplay' : ''}`}> <div className="roleplay-header"> <Typography variant="h6">{title}</Typography> <Typography variant="body2" className="roleplay-scenario">{scenario}</Typography> </div> <div className="dialogue-container"> {dialogue.map((entry, index) => (entry && typeof entry.role === 'string' && typeof entry.message === 'string' ? (<div key={index} className={`dialogue-entry ${entry.role.includes('(du)') ? 'dialogue-user' : ''}`}> <Avatar className="dialogue-avatar" sx={{ bgcolor: getColor(entry.role), opacity: disabled ? 0.8 : 1 }}> {getInitials(entry.role)} </Avatar> <div className="dialogue-content"> <Typography variant="subtitle2" className="dialogue-role">{entry.role}</Typography> <Typography variant="body1" className="dialogue-message">{entry.message}</Typography> </div> </div>) : null))} </div> {Array.isArray(learningPoints) && learningPoints.length > 0 && (<div className="learning-points"> <Typography variant="subtitle1" className="learning-points-header">Viktiga lärdomar:</Typography> <ul className="learning-points-list"> {learningPoints.map((point, index) => (typeof point === 'string' ? <li key={index}><Typography variant="body2">{point}</Typography></li> : null))} </ul> </div>)} </div>);
};
// Feedback component
const FeedbackComponent = ({ feedback, disabled = false }) => {
    // *** VIKTIG VALDIERING ***
    if (!feedback || typeof feedback.message !== 'string' || typeof feedback.type !== 'string') {
        console.error("Invalid props for FeedbackComponent:", { feedback });
        return <Alert severity="error">Fel: Kunde inte ladda feedback.</Alert>;
    }
    const feedbackStyles = { "knowledge": { color: "#2196f3", icon: "📚", title: "Kunskapstips" }, "procedure": { color: "#4caf50", icon: "📋", title: "Procedurinformation" }, "priority": { color: "#ff9800", icon: "⚖️", title: "Prioriteringsråd" }, "safety": { color: "#f44336", icon: "⚠️", title: "Viktigt säkerhetsråd" } }; const style = feedbackStyles[feedback.type] || feedbackStyles.knowledge;
    return (<Alert severity={feedback.type === "safety" ? "warning" : "info"} icon={<span style={{ fontSize: '1.2rem' }}>{style.icon}</span>} className={`feedback-alert ${disabled ? 'disabled-feedback' : ''}`} sx={{ opacity: disabled ? 0.85 : 1 }}> <div className="feedback-content"> <Typography variant="subtitle1" className="feedback-title">{style.title}</Typography> <Typography variant="body1" className="feedback-message">{feedback.message}</Typography> {Array.isArray(feedback.points) && feedback.points.length > 0 && (<ul className="feedback-points"> {feedback.points.map((point, idx) => (typeof point === 'string' ? <li key={idx}>{point}</li> : null))} </ul>)} {typeof feedback.correctAction === 'string' && (<Typography variant="body1" className="feedback-action" sx={{ fontWeight: 'bold', mt: 1 }}> Rekommendation: {feedback.correctAction} </Typography>)} </div> </Alert>);
};
// Simple Binary Question
const SimpleBinaryQuestion = ({ text, options, onAnswer, isSubmitting, disabled = false }) => {
    // *** VIKTIG VALDIERING ***
    if (!Array.isArray(options) || options.length !== 2) {
        console.error("Invalid props for SimpleBinaryQuestion:", { text, options });
        return <Alert severity="error">Fel: Kunde inte ladda ja/nej-frågan.</Alert>;
    }
    return (<div className={`binary-question-container ${disabled ? 'disabled-binary-question' : ''}`}> {typeof text === 'string' && text && <Typography variant="body1" className="binary-question-text">{text}</Typography>} <div className="binary-options"> {options.map((option, index) => (option && (typeof option.label === 'string' || typeof option.value === 'string') ? (<Button key={index} variant="contained" color={/(ja|sant|true)/i.test(option.label || option.value || "") ? "primary" : "secondary"} disabled={isSubmitting || disabled} onClick={() => !disabled && onAnswer(option.label || option.value)} className="binary-option-btn" sx={{ opacity: disabled ? 0.7 : 1, cursor: disabled ? 'default' : 'pointer' }}> {option.label || option.value} </Button>) : null))} </div> </div>);
};
// Quick Response Buttons
const QuickResponseButtons = ({ onSendQuickResponse, disabled }) => {
    const [activeIndex, setActiveIndex] = useState(null); const quickResponses = [{ text: "Berätta mer om detta", icon: "🔍" }, { text: "Jag förstår inte", icon: "❓" }, { text: "Fortsätt", icon: "➡️" }]; const handleClick = (text, index) => { if (disabled) return; setActiveIndex(index); setTimeout(() => { setActiveIndex(null); onSendQuickResponse(text); }, 150); };
    return (<div className="quick-response-container"> {quickResponses.map((response, index) => (<Chip key={index} label={response.text} icon={<span className="quick-response-icon">{response.icon}</span>} onClick={() => handleClick(response.text, index)} disabled={disabled} className={`quick-response-chip ${activeIndex === index ? 'quick-response-active' : ''}`} variant="outlined" color="primary" sx={{ cursor: disabled ? 'default' : 'pointer' }} />))} </div>);
};
// Text Animation Component
const SmoothTextDisplay = ({ text, onComplete, scrollToBottom, setTextCompletion }) => {
    const [paragraphs, setParagraphs] = useState([]); const [visibleParagraphs, setVisibleParagraphs] = useState(0); const timeoutRef = useRef(null); const prevTextRef = useRef(''); const isMountedRef = useRef(true);
    useEffect(() => { isMountedRef.current = true; return () => { isMountedRef.current = false; }; }, []);
    useEffect(() => { if (typeof text !== 'string' || text === prevTextRef.current) return; prevTextRef.current = text; setParagraphs([]); setVisibleParagraphs(0); if (setTextCompletion) setTextCompletion(0); if (timeoutRef.current) clearTimeout(timeoutRef.current); const rawText = text.replace(/\r\n/g, '\n'); const majorBlocks = rawText.split(/\n\s*\n+/); const processedParagraphs = []; majorBlocks.forEach(block => { const trimmedBlock = block.trim(); if (!trimmedBlock) return; if (/^[\s]*[-*+]\s+/.test(trimmedBlock) || /^[\s]*\d+\.\s+/.test(trimmedBlock) || trimmedBlock.length < 180) { processedParagraphs.push(trimmedBlock); } else { const sentences = trimmedBlock.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) || [trimmedBlock]; let currentGroup = ''; sentences.forEach((sentence, i) => { const trimmedSentence = sentence.trim(); if (!trimmedSentence) return; if ((currentGroup.length + trimmedSentence.length > 200) || (currentGroup.length > 0 && /^(however|nevertheless|therefore|thus|consequently|furthermore|moreover|in addition|besides|alternatively|meanwhile|conversely|on the other hand|in contrast|similarly|likewise|accordingly|as a result)/i.test(trimmedSentence))) { if (currentGroup) processedParagraphs.push(currentGroup); currentGroup = trimmedSentence; } else { currentGroup = currentGroup ? `${currentGroup} ${trimmedSentence}` : trimmedSentence; } if (i === sentences.length - 1 && currentGroup) { processedParagraphs.push(currentGroup); } }); } }); setParagraphs(processedParagraphs); }, [text, setTextCompletion]);
    useEffect(() => { if (!isMountedRef.current || paragraphs.length === 0) return; if (visibleParagraphs < paragraphs.length) { if (visibleParagraphs > 0) setTimeout(scrollToBottom, 50); const currentPara = paragraphs[visibleParagraphs] || ''; let delay = 120; const wordCount = currentPara.split(/\s+/).length; if (/^[\s]*[-*+]\s+/.test(currentPara) || /^[\s]*\d+\.\s+/.test(currentPara)) delay = 180; else if (/\?$/.test(currentPara)) delay = 150; else if (currentPara.length < 40) delay = 80; else delay += Math.min(wordCount / 15, 2.5) * 70; const newProgress = (visibleParagraphs + 1) / paragraphs.length; if (setTextCompletion) setTextCompletion(newProgress); if (timeoutRef.current) clearTimeout(timeoutRef.current); timeoutRef.current = setTimeout(() => { if (isMountedRef.current) { setVisibleParagraphs(prev => prev + 1); } }, Math.max(delay, 50)); } else if (visibleParagraphs === paragraphs.length) { if (setTextCompletion) setTextCompletion(1); if (onComplete) onComplete(); } return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }; }, [visibleParagraphs, paragraphs, onComplete, scrollToBottom, setTextCompletion]);
    const handleClick = () => { if (visibleParagraphs < paragraphs.length) { if (timeoutRef.current) clearTimeout(timeoutRef.current); if (isMountedRef.current) { setVisibleParagraphs(paragraphs.length); if (setTextCompletion) setTextCompletion(1); scrollToBottom(); if (onComplete) onComplete(); } } }; const paragraphsToRender = paragraphs.slice(0, visibleParagraphs);
    return (<div className="smooth-text" onClick={handleClick} style={{ cursor: visibleParagraphs < paragraphs.length ? 'pointer' : 'auto' }}> {paragraphsToRender.map((para, index) => (<div key={index} className="animate-in-paragraph"> {typeof para === 'string' ? (<ReactMarkdown className="markdown-content">{para}</ReactMarkdown>) : (<p>...</p>)} </div>))} {visibleParagraphs < paragraphs.length && (<span className="typing-cursor"></span>)} </div>);
};
// Animated Interactive Item Component
const AnimatedInteractiveItem = ({ children, index = 0, isVisible, animationPhase, uniqueId, disabled = false }) => {
    const [show, setShow] = useState(false); const timerRef = useRef(null); const instanceIdRef = useRef(`item-${uniqueId || Math.random().toString(36).substring(2)}`); const isMountedRef = useRef(true);
    useEffect(() => { isMountedRef.current = true; return () => { isMountedRef.current = false; if (timerRef.current) clearTimeout(timerRef.current); }; }, []);
    useEffect(() => { if (!isMountedRef.current) return; let isActive = false; if (isVisible && animationPhase >= 0.5) { isActive = true; if (!show) setShow(false); const baseDelay = animationPhase >= 0.9 ? 100 : 150; const delay = baseDelay + index * (animationPhase >= 0.8 ? 100 : 150); if (timerRef.current) clearTimeout(timerRef.current); timerRef.current = setTimeout(() => { if (isMountedRef.current) setShow(true); }, delay); } else { if (show) setShow(false); if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } } return () => { if (timerRef.current) clearTimeout(timerRef.current); }; }, [isVisible, index, animationPhase, show]);
    if (!isVisible) return null;
    return (<div id={instanceIdRef.current} className={`interactive-item ${show ? 'animate-in' : ''} ${disabled ? 'inactive-interactive-item' : ''}`} style={{ opacity: show ? 1 : 0, transform: show ? 'translateY(0)' : 'translateY(20px)', transition: 'opacity 0.5s ease-out, transform 0.5s ease-out', pointerEvents: show && !disabled ? 'auto' : 'none', }}> {children} </div>);
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
    const updateHeight = () => {
      if (chatContainerRef.current) {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
        chatContainerRef.current.style.height = `${window.innerHeight}px`;
      }
    };
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
      // *** VIKTIG LOGGNING ***
      console.log("Initial response received:", JSON.stringify(response.data, null, 2));

      if (!response.data || !response.data.reply) {
          throw new Error("Invalid response structure from backend on start");
      }
      const { textContent, interactiveElement } = response.data.reply;

      // *** VIKTIG LOGGNING ***
      console.log("First message content state:", { textContent, interactiveElement });

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
  }, []);

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
    setLatestMessageId(null);

    setTimeout(scrollToBottom, 50);

    try {
      const response = await axios.post(API_ENDPOINTS.CHAT, {
        answers: { underskoterska, delegering }, message: trimmedText, name: userName
      });
      // *** VIKTIG LOGGNING ***
      console.log("API response:", JSON.stringify(response.data, null, 2));

        if (!response.data || !response.data.reply) {
            throw new Error("Invalid response structure from backend");
        }
      const { textContent, interactiveElement } = response.data.reply;

      // *** VIKTIG LOGGNING ***
      console.log("New AI message content state:", { textContent, interactiveElement });

      const newMessageId = generateId();
      setLatestMessageId(newMessageId);

      setMessages(prev => [...prev, { id: newMessageId, sender: 'assistant', textContent, interactiveElement }]);
    } catch (error) {
      console.error("Fel vid anrop till API:", error);
      const errorMsgId = generateId();
      setLatestMessageId(errorMsgId);
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

    // *** VIKTIG KONTROLL ***
    if (typeof textContent !== 'string') {
        console.error("renderAIMessage received non-string textContent:", textContent, "for message:", message.id);
        return <Box key={message.id} className="chat-message assistant error"><Alert severity="error">Internt fel: Ogiltigt textinnehåll.</Alert></Box>;
    }

    let InteractiveComponent = null;
    if (interactiveElement?.type && interactiveElement?.data) {
        const props = { key: `${message.id}-${interactiveElement.type}`, onAnswer: handleSuggestionClick, isSubmitting, disabled: !isActive };
        try { // *** TRY-CATCH RUNT KOMPONENTSKAPANDE ***
            switch (interactiveElement.type) {
                case 'scenario': InteractiveComponent = <ScenarioQuestion scenario={interactiveElement.data.scenario} {...props} />; break;
                case 'multipleChoice': InteractiveComponent = <MultipleChoiceQuestion question={interactiveElement.data.multipleChoice} {...props} />; break;
                case 'matching': InteractiveComponent = <MatchingQuestion question={interactiveElement.data.matching} {...props} />; break;
                case 'ordering': InteractiveComponent = <OrderingQuestion question={interactiveElement.data.ordering} {...props} />; break;
                case 'roleplay': InteractiveComponent = <RoleplayDialog roleplay={interactiveElement.data.roleplay} disabled={!isActive} />; break;
                case 'feedback': InteractiveComponent = <FeedbackComponent feedback={interactiveElement.data.feedback} disabled={!isActive} />; break;
                case 'suggestions':
                    const suggestions = interactiveElement.data.suggestions;
                    const text = interactiveElement.data.text;
                    const isBinary = Array.isArray(suggestions) && suggestions.length === 2 && suggestions.some(s => /(ja|sant|true)/i.test(s?.label || s?.value || "")) && suggestions.some(s => /(nej|falskt|false)/i.test(s?.label || s?.value || ""));
                    if (isBinary) { InteractiveComponent = <SimpleBinaryQuestion text={text} options={suggestions} {...props} />; }
                    else if (Array.isArray(suggestions)) {
                        InteractiveComponent = (<div className="suggestions-container">{suggestions.map((sugg, idx) => (sugg && (typeof sugg.label === 'string' || typeof sugg.value === 'string') ? (<Button key={idx} className="suggestion-button" variant="contained" onClick={() => props.onAnswer(sugg.label || sugg.value)} disabled={props.disabled || props.isSubmitting} sx={{ opacity: props.disabled ? 0.7 : 1, cursor: props.disabled ? 'default' : 'pointer' }}>{sugg.label || sugg.value}</Button>) : null))}</div>);
                    } break;
                default: console.warn(`Unknown interactive element type: ${interactiveElement.type}`);
            }
        } catch (compError) {
             console.error(`Error creating interactive component of type ${interactiveElement.type}:`, compError);
             InteractiveComponent = <Alert severity="error">Fel vid rendering av interaktivt element ({interactiveElement.type}).</Alert>; // Visa typ
        }
    }

    return (
      <Box key={message.id} className={`chat-message assistant ${isActive ? 'active-message' : ''}`}>
        {textContent.length > 0 && (
          isActive ? (
            <SmoothTextDisplay text={textContent} onComplete={handleDisplayComplete} scrollToBottom={scrollToBottom} setTextCompletion={setTextCompletion} />
          ) : (
            <ReactMarkdown className="markdown-content">{textContent}</ReactMarkdown>
          )
        )}
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
            // *** TRY-CATCH RUNT HELA MESSAGE RENDERING ***
            try {
               if (msg.sender === 'assistant') {
                   return renderAIMessage(msg);
               } else {
                   // Användar-meddelande rendering (mer robust)
                   const userText = typeof msg.textContent === 'string' ? msg.textContent : '';
                   // Kontrollera om texten är tom efter trimning
                   if (!userText.trim()) {
                        // Rendera inget eller en platshållare för tomma användarmeddelanden
                        return null; // Eller <Box key={msg.id} style={{ display: 'none' }} />;
                   }
                   return (
                       <Box key={msg.id} className="chat-message user">
                           {userText.split('\n').map((line, index) => (
                               <p key={index} style={{ margin: 0, minHeight: '1em' }}>{line || '\u00A0'}</p>
                           ))}
                       </Box>
                   );
               }
           } catch (renderError) {
               console.error("Critical rendering error for message:", msg?.id, renderError); // Optional chaining på msg.id
               return <Box key={(msg?.id || `error-${generateId()}`) + '-error'} className="chat-message assistant error"><Alert severity="error">Ett kritiskt fel inträffade vid visning av meddelande.</Alert></Box>;
           }
        })}
        {aiIsThinking && (<div className="ai-thinking"> <div className="ai-thinking-dots"> <span></span><span></span><span></span> </div> </div>)}
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
