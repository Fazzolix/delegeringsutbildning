// frontend/src/config/api.js
// Använd BACKEND_URL från .env om den finns, annars fallback till localhost:10000
// Säkerställ att porten matchar backend (vanligtvis 10000 för Gunicorn om inte annat anges)
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:10000';

console.log("API Base URL:", API_BASE_URL); // För felsökning

const API_ENDPOINTS = {
  // Chat endpoint
  CHAT: `${API_BASE_URL}/api/chat`,

  // User endpoint
  USER: `${API_BASE_URL}/api/user`,

  // TTS endpoint är borttagen
  // TTS_STREAM: `${API_BASE_URL}/api/tts-stream`,

  // Prompt editor endpoint är borttagen
  // PROMPT_EDITOR: `${API_BASE_URL}/api/admin/prompt`,
};

export default API_ENDPOINTS;
