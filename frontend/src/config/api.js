// frontend/src/config/api.js
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const API_ENDPOINTS = {
  // Chat endpoint
  CHAT: `${API_BASE_URL}/api/chat`,
  
  // User endpoint
  USER: `${API_BASE_URL}/api/user`,
  
  // TTS endpoint
  TTS_STREAM: `${API_BASE_URL}/api/tts-stream`,
  
  // Prompt editor endpoint
  PROMPT_EDITOR: `${API_BASE_URL}/api/admin/prompt`,
};

export default API_ENDPOINTS;
