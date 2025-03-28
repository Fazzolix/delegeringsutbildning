// frontend/src/App.js
import React from 'react';
import './App.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Welcome from './Components/Welcome';
import ChatComponent from './Components/ChatComponent';
import PromptEditor from './Components/PromptEditor';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<Welcome />} />
          <Route path="/chat" element={<ChatComponent />} />
          <Route path="/prompt-editor" element={<PromptEditor />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
