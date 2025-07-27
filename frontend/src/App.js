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
  const [filters, setFilters] = useState({
    read: null,
    favorite: null,
    search: '',
    days: null
  });

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
    try {
      const result = await api.login(loginData.username, loginData.password);
      if (result.error) {
        setMessage('Erreur :' + result.error);
        return;
      }
      setMessage(result.message || 'Connexion réussie !');
      setIsLoggedIn(true);
      setCurrentUser(loginData.username);
      setLoginData({ username: '', password: '' });
    } catch (error) {
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

  const refreshFeed = async (feedId) => {
    try {
      console.log('Actualisation flux ID:', feedId);
      const response = await axios.post(`http://localhost:8000/feeds/${feedId}/refresh`);
      console.log('Réponse actualisation:', response.data);
      setMessage(response.data.message);
      loadFeeds(); // Recharger la liste des flux pour voir la nouvelle date
      if (selectedFeed === feedId) {
        viewArticles(feedId); // Recharger l'affichage des articles
      }
    } catch (error) {
      console.error('Erreur actualisation:', error);
      setMessage('Erreur lors de l\'actualisation');
    }
  };

  const filterArticles = async () => {
    if (!selectedFeed) return;

    console.log('=== DEBUG FILTRAGE ===');
    console.log('État filters:', filters);
    console.log('filters.read:', filters.read);
    console.log('filters.favorite:', filters.favorite);
    console.log('filters.search:', filters.search);
    console.log('filters.days:', filters.days);

    try {
      let url = `http://localhost:8000/feeds/${selectedFeed}/articles/filter`;
      let params = [];

      if (filters.read !== null) {
        console.log('Ajout filtre read:', filters.read);
        params.push(`read=${filters.read}`);
      }
      if (filters.favorite !== null) {
        console.log('Ajout filtre favorite:', filters.favorite);
        params.push(`favorite=${filters.favorite}`);
      }
      if (filters.search) {
        console.log('Ajout filtre search:', filters.search);
        params.push(`search=${encodeURIComponent(filters.search)}`);
      }
      if (filters.days !== null) {
        console.log('Ajout filtre days:', filters.days);
        params.push(`days=${filters.days}`);
      }
      
      console.log('Params array:', params);
      
      if (params.length > 0) {
        url += '?' + params.join('&');
      }

      console.log('URL finale:', url);
      
      const response = await axios.get(url);
      console.log('Réponse API:', response.data);
      setArticles(response.data.articles || []);
      setMessage(`Filtrage appliqué : ${response.data.count} articles trouvés`);
    } catch (error) {
      setMessage('Erreur lors du filtrage');
      console.error(error);
    }
  };

  const resetFilters = () => {
    setFilters({ read: null, favorite: null, search: '', days: null });
    if (selectedFeed) viewArticles(selectedFeed);
  };

  const toggleRead = async (articleId, isRead) => {
    try {
      await axios.patch(`http://localhost:8000/articles/${articleId}/read?read_status=${!isRead}`);
      if (filters.read !== null || filters.favorite !== null || filters.search || filters.days !== null) {
        filterArticles();
      } else {
        viewArticles(selectedFeed);
      }
    } catch (error) {
      setMessage('Erreur lors de la mise à jour');
    }
  };

  const toggleFavorite = async (articleId, isFavorite) => {
    try {
      const url = `http://localhost:8000/articles/${articleId}/favorite?favorite_status=${!isFavorite}`;
      await axios.patch(url);
      if (filters.read !== null || filters.favorite !== null || filters.search || filters.days !== null) {
        filterArticles();
      } else {
        viewArticles(selectedFeed);
      }
    } catch (error) {
      setMessage('Erreur lors de la mise à jour des favoris');
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
                
                {/* Affichage de la dernière synchronisation */}
                {feed.last_updated && (
                  <p style={{fontSize: '12px', color: '#666', marginBottom: '10px'}}>
                    Dernière synchro : {new Date(feed.last_updated).toLocaleString('fr-FR')}
                  </p>
                )}
                
                <button onClick={() => viewArticles(feed.id)}>Voir les articles</button>
                <button 
                  onClick={() => refreshFeed(feed.id)}
                  style={{marginLeft: '10px'}}
                >
                  🔄 Actualiser
                </button>
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
              
              {/* Debug des filtres */}
              <div style={{background: 'yellow', padding: '5px', marginBottom: '10px'}}>
                <strong>Debug filters:</strong> {JSON.stringify(filters)}
              </div>
              
              <div style={{padding: '10px', background: '#f9f9f9', margin: '10px 0'}}>
                <h3>Filtres</h3>
                
                <input
                  type="text"
                  placeholder="Recherche dans les articles"
                  value={filters.search}
                  onChange={(e) => setFilters({...filters, search: e.target.value})}
                  style={{marginRight: '10px'}}
                />

                <select
                  value={filters.read === null ? 'all' : filters.read.toString()}
                  onChange={(e) => setFilters({...filters, read: e.target.value === 'all' ? null : e.target.value === 'true'})}
                  style={{marginRight: '10px'}}
                >
                  <option value="all">Tous les articles</option>
                  <option value="false">Non lus</option>
                  <option value="true">Lus</option>
                </select>

                <select
                  value={filters.favorite === null ? 'all' : filters.favorite.toString()}
                  onChange={(e) => setFilters({...filters, favorite: e.target.value === 'all' ? null : e.target.value === 'true'})}
                  style={{marginRight: '10px'}}
                >
                  <option value="all">Tous</option>
                  <option value="true">Favoris</option>
                  <option value="false">Non favoris</option>
                </select>

                <select
                  value={filters.days === null ? 'all' : filters.days.toString()}
                  onChange={(e) => setFilters({...filters, days: e.target.value === 'all' ? null : parseInt(e.target.value)})}
                  style={{marginRight: '10px'}}
                >
                  <option value="all">Toutes les dates</option>
                  <option value="1">Aujourd'hui</option>
                  <option value="7">7 derniers jours</option>
                  <option value="30">30 derniers jours</option>
                  <option value="90">90 derniers jours</option>
                </select>
                
                <button onClick={filterArticles} style={{marginRight: '10px'}}>Filtrer</button>
                <button onClick={resetFilters}>Reset</button>
              </div>
              
              {articles.length === 0 ? (
                <p>Aucun article trouvé</p>
              ) : (
                articles.map(article => (
                  <div key={article.id} style={{border: '1px solid #ddd', padding: '10px', margin: '10px'}}>
                    <h4>{article.title}</h4>
                    
                    {/* Affichage de la date de publication */}
                    {article.published && (
                      <p style={{fontSize: '12px', color: '#888', marginBottom: '10px'}}>
                        Publié le : {new Date(article.published).toLocaleString('fr-FR')}
                      </p>
                    )}
                    
                    <p>{article.summary}</p>
                    <a href={article.link} target="_blank" rel="noopener noreferrer">Lire l'article</a>
                    <br />
                    <button 
                      onClick={() => toggleRead(article.id, article.is_read)}
                      style={{marginTop: '10px', marginRight: '10px'}}
                    >
                      {article.is_read ? 'Marquer non lu' : 'Marquer lu'}
                    </button>
                    <button
                      onClick={() => toggleFavorite(article.id, article.is_favorite)}
                      style={{marginTop: '10px'}}
                    >
                      {article.is_favorite ? '★ Retirer favori' : '☆ Ajouter favori'}
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