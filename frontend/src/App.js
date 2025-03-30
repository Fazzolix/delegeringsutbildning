// frontend/src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Welcome from './Components/Welcome';
import ChatComponent from './Components/ChatComponent';
// PromptEditor import removed
import './App.css';

function App() {
  // Helper component to protect the chat route
  const ProtectedChatRoute = ({ children }) => {
    const hasStarted = localStorage.getItem('hasStartedChat') === 'true';
    return hasStarted ? children : <Navigate to="/" replace />;
  };

  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<Welcome />} />
          <Route
            path="/chat"
            element={
              <ProtectedChatRoute>
                <ChatComponent />
              </ProtectedChatRoute>
            }
          />
          {/* PromptEditor route removed */}
          {/* Fallback route or redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
