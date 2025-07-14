import React, { useState } from 'react';
import axios from 'axios';
import { api } from './api';
import './App.css';

function App() {
  const [message, setMessage] = useState('');
  const [feeds, setFeeds] = useState([]);

  const handleRegister = async () => {
    try {
      const result = await api.register('testuser2', 'test2@example.com', 'password123');
      setMessage(result.message || 'Inscription réussie !');
    } catch (error) {
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

  const loadFeeds = async () => {
    try {
      const response = await axios.get('http://localhost:8000/feeds');
      setFeeds(response.data.feeds || []);
    } catch (error) {
      setMessage('Erreur lors du chargement des flux');
    }
  };
  const [newFeed, setNewFeed] = useState({title: '', url: '', description: ''});

  const createFeed = async () => {
    try  {
      const response = await axios.post('http://localhost:8000/feeds', {
        ...newFeed,
        owner_id: 1
      });
      setMessage('Flux créé avec succès !');
      setNewFeed({title: '', url: '', description: ''});
      loadFeeds();
    } catch (error) {
      setMessage('Erreur création de flux : ' + error.response?.data?.error);
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
      
      <div>
        <h2>Flux RSS</h2>
        <button onClick={loadFeeds}>Charger les flux</button>
        {feeds.map(feed => (
          <div key={feed.id}>
            <h3>{feed.title}</h3>
            <p>{feed.url}</p>
          </div>
        ))}
      </div>
      <div>
     <h2>Ajouter un flux</h2>
       <input 
        placeholder="Titre du flux" 
        value={newFeed.title}
        onChange={(e) => setNewFeed({...newFeed, title: e.target.value})}
      />
      <input 
       placeholder="URL RSS" 
        value={newFeed.url}
        onChange={(e) => setNewFeed({...newFeed, url: e.target.value})}
      />
      <input 
        placeholder="Description" 
        value={newFeed.description}
        onChange={(e) => setNewFeed({...newFeed, description: e.target.value})}
      />
      <button onClick={createFeed}>Créer flux</button>
      </div>
    </div>
  );
}

export default App;