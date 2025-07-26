import React, { useState } from 'react';
import axios from 'axios';
import { api } from './api';
import './App.css';

function App() {
  const [message, setMessage] = useState('');
  const [feeds, setFeeds] = useState([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [registerData, setRegisterData] = useState({ username: '', email: '', password: '' });
  const [newFeed, setNewFeed] = useState({ title: '', url: '', description: '' });
  const [selectedFeed, setSelectedFeed] = useState(null);
  const [articles, setArticles] = useState([]);

  const handleRegister = async () => {
    try {
      const result = await api.register(registerData.username, registerData.email, registerData.password);
      setMessage(result.message || 'Inscription réussie !');
      setRegisterData({ username: '', email: '', password: '' });
    } catch (error) {
      setMessage('Erreur inscription : ' + error.response?.data?.error);
    }
  };

  const handleLogin = async () => {
    console.log('Tentative de connexion avec', loginData);
    try {
      const result = await api.login(loginData.username, loginData.password);
      console.log('Reponse API:', result);
      if (result.error) {
        setMessage('Erreur :' + result.error);
        return;
      }
      setMessage(result.message || 'Connexion réussie !');
      setIsLoggedIn(true);
      setCurrentUser(loginData.username);
      setLoginData({ username: '', password: '' });
    } catch (error) {
      console.log('Erreur attrapée :', error);
      setMessage('Erreur connexion : ' + error.response?.data?.error);
    }
  };

  const logout = () => {
    setIsLoggedIn(false);
    setCurrentUser(null);
    setFeeds([]);
    setArticles([]);
    setSelectedFeed(null);
    setMessage('Déconnecté');
  };

  const loadFeeds = async () => {
    try {
      const response = await axios.get('http://localhost:8000/feeds');
      setFeeds(response.data.feeds || []);
    } catch (error) {
      setMessage('Erreur lors du chargement des flux');
    }
  };

  const createFeed = async () => {
    try {
      const response = await axios.post('http://localhost:8000/feeds', {
        ...newFeed,
        owner_id: 1
      });
      setMessage('Flux créé avec succès !');
      setNewFeed({ title: '', url: '', description: '' });
      loadFeeds();
    } catch (error) {
      setMessage('Erreur création de flux : ' + error.response?.data?.error);
    }
  };

  const viewArticles = async (feedId) => {
    try {
      await axios.post(`http://localhost:8000/feeds/${feedId}/fetch-articles`);
      const response = await axios.get(`http://localhost:8000/feeds/${feedId}/articles`);
      setArticles(response.data.articles || []);
      setSelectedFeed(feedId);
      setMessage('Articles chargés !');
    } catch (error) {
      setMessage('Erreur lors du chargement des articles');
      console.error(error);
    }
  };

  const toggleRead = async (articleId, isRead) => {
    try {
      await axios.patch(`http://localhost:8000/articles/${articleId}/read?read_status=${!isRead}`);
      if (selectedFeed) viewArticles(selectedFeed);
    } catch (error) {
      setMessage('Erreur lors de la mise à jour');
    }
  };

  return (
    <div className="App">
      <h1>SUPRSS - Lecteur de flux RSS</h1>
      {message && <div style={{padding: '10px', background: '#f0f0f0'}}>{message}</div>}
      
      {!isLoggedIn ? (
        <div>
          <div>
            <h2>Connexion</h2>
            <input
              placeholder="Nom d'utilisateur"
              value={loginData.username}
              onChange={(e) => setLoginData({...loginData, username: e.target.value})}
            />
            <input
              placeholder="Mot de passe"
              type="password"
              value={loginData.password}
              onChange={(e) => setLoginData({...loginData, password: e.target.value})}
            />
            <button onClick={handleLogin}>Se connecter</button>

            <h2>Inscription</h2>
            <input
              placeholder="Nom d'utilisateur"
              value={registerData.username}
              onChange={(e) => setRegisterData({...registerData, username: e.target.value})}
            />
            <input
              placeholder="Email"
              value={registerData.email}
              onChange={(e) => setRegisterData({...registerData, email: e.target.value})}
            />
            <input
              placeholder="Mot de passe"
              type="password"
              value={registerData.password}
              onChange={(e) => setRegisterData({...registerData, password: e.target.value})}
            />
            <button onClick={handleRegister}>S'inscrire</button>
          </div>
        </div>
      ) : (
        <div>
          <div style={{textAlign: 'right'}}>
            Connecté : {currentUser} <button onClick={logout}>Déconnexion</button>
          </div>
          
          <div>
            <h2>Flux RSS</h2>
            <button onClick={loadFeeds}>Charger les flux</button>
            {feeds.map(feed => (
              <div key={feed.id} style={{border: '1px solid #ccc', padding: '10px', margin: '10px'}}>
                <h3>{feed.title}</h3>
                <p>{feed.url}</p>
                <button onClick={() => viewArticles(feed.id)}>Voir les articles</button>
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

          {selectedFeed && (
            <div>
              <h2>Articles du flux</h2>
              {articles.length === 0 ? (
                <p>Aucun article trouvé</p>
              ) : (
                articles.map(article => (
                  <div key={article.id} style={{border: '1px solid #ddd', padding: '10px', margin: '10px'}}>
                    <h4>{article.title}</h4>
                    <p>{article.summary}</p>
                    <a href={article.link} target="_blank" rel="noopener noreferrer">Lire l'article</a>
                    <br />
                    <button 
                      onClick={() => toggleRead(article.id, article.is_read)}
                      style={{marginTop: '10px'}}
                    >
                      {article.is_read ? 'Marquer non lu' : 'Marquer lu'}
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;