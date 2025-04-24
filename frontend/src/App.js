// frontend/src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios'; // <-- Importera axios
import Welcome from './Components/Welcome';
import ChatComponent from './Components/ChatComponent';
import './App.css';

// --- Konfigurera Axios att alltid skicka med cookies ---
axios.defaults.withCredentials = true;
// ------------------------------------------------------

function App() {
  // Helper component to protect the chat route
  const ProtectedChatRoute = ({ children }) => {
    const hasStarted = localStorage.getItem('hasStartedChat') === 'true';
    // Om localStorage inte har 'true', navigera till Welcome, annars rendera chatten.
    return hasStarted ? children : <Navigate to="/" replace />;
  };

  return (
    <Router>
      <div className="App">
        <Routes>
          {/* Welcome-komponenten visas på root-pathen "/" */}
          <Route path="/" element={<Welcome />} />
          {/* Chat-komponenten skyddas av ProtectedChatRoute */}
          <Route
            path="/chat"
            element={
              <ProtectedChatRoute>
                <ChatComponent />
              </ProtectedChatRoute>
            }
          />
          {/* Fallback för alla andra paths - navigera till Welcome */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
