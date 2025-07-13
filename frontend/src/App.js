import React, { useState } from 'react';
import { api } from './api';
import './App.css';

function App() {
  const [message, setMessage] = useState('');

  const handleRegister = async () => {
    try {
      const result = await api.register('testuser2', 'test2@example.com', 'password123');
      setMessage(result.message || 'Inscription réussie !');
    } catch (error){
      setMessage('Erreur inscription :' + error.response?.data?.error);
    }
  };
  const handleLogin = async () => {
    try {
      const result = await api.login('testuser', 'motdepasse123');
      setMessage(result.message || 'Connexion réussie !');
    } catch (error) {
      setMessage('Erreur connexion : ' + error.response?.data?.error);
    }
  };
  return (
    <div className="App">
      <h1>SUPRSS - Lecteur de flux RSS</h1>

      {message && <div style={{padding: '10px', background: '#f0f0f0'}}>{message}</div>}

      <div>
        <h2>Test rapide</h2>
        <button onClick={handleLogin}>Tester connexion</button>
        <button onClick={handleRegister}>Tester inscription</button>
      </div>
    </div>
  );
}

export default App;
