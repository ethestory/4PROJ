import React, { useState } from 'react';
import axios from 'axios';
import { api } from './api';
import './App.css';

function App() {
  const [message, setMessage] = useState('');
  const [feeds, setFeeds] = useState([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [registerData, setRegisterData] = useState({ username: '', email: '', password: '' });
  const [newFeed, setNewFeed] = useState({ title: '', url: '', description: '' });
  const [articles, setArticles] = useState([]);
  const [filters, setFilters] = useState({
    read: null,
    favorite: null,
    search: '',
    days: null,
    feed_id: null
  });
  const [pagination, setPagination] = useState({
    current_page: 1,
    per_page: 20,
    total_articles: 0,
    total_pages: 0,
    has_next: false,
    has_previous: false
  });
  const [currentPage, setCurrentPage] = useState(1);

  const handleRegister = async () => {
    try {
      const result = await api.register(registerData.username, registerData.email, registerData.password);
      setMessage(result.message || 'Inscription réussie !');
      setRegisterData({ username: '', email: '', password: '' });
    } catch (error) {
      setMessage('Erreur inscription : ' + (error.response?.data?.error || error.message));
    }
  };

  const handleLogin = async () => {
    try {
      const result = await api.login(loginData.username, loginData.password);
      if (result.error) {
        setMessage('Erreur : ' + result.error);
        return;
      }
      
      setMessage(result.message || 'Connexion réussie !');
      setIsLoggedIn(true);
      setCurrentUser(loginData.username);
      setCurrentUserId(result.user_id);
      setLoginData({ username: '', password: '' });
      
    } catch (error) {
      setMessage('Erreur connexion : ' + (error.response?.data?.error || error.message));
    }
  };

  const logout = () => {
    setIsLoggedIn(false);
    setCurrentUser(null);
    setCurrentUserId(null);
    setFeeds([]);
    setArticles([]);
    setPagination({
      current_page: 1,
      per_page: 20,
      total_articles: 0,
      total_pages: 0,
      has_next: false,
      has_previous: false
    });
    setCurrentPage(1);
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
    if (!currentUserId) {
      setMessage('Erreur: Aucun utilisateur connecté');
      return;
    }

    try {
      const response = await axios.post('http://localhost:8000/feeds', {
        ...newFeed,
        owner_id: currentUserId
      });
      setMessage('Flux créé avec succès !');
      setNewFeed({ title: '', url: '', description: '' });
      loadFeeds();
    } catch (error) {
      setMessage('Erreur création de flux : ' + (error.response?.data?.error || error.message));
    }
  };

  const loadAllArticles = async (page = 1) => {
    if (!currentUserId) {
      setMessage('Erreur: Aucun utilisateur connecté');
      return;
    }

    try {
      const response = await axios.get(`http://localhost:8000/users/${currentUserId}/articles?page=${page}&per_page=20`);
      
      setArticles(response.data.articles || []);
      setPagination(response.data.pagination || {});
      setCurrentPage(page);
      
      const articleCount = response.data.articles ? response.data.articles.length : 0;
      const totalCount = response.data.pagination ? response.data.pagination.total_articles : 0;
      
      setMessage(`Articles chargés - Page ${page} - ${totalCount} articles au total (${articleCount} affichés)`);
      
    } catch (error) {
      setMessage('Erreur lors du chargement des articles: ' + error.message);
    }
  };

  const syncAllFeeds = async () => {
    if (!currentUserId) {
      setMessage('Erreur: Aucun utilisateur connecté');
      return;
    }

    try {
      setMessage('Synchronisation en cours...');
      const response = await axios.post(`http://localhost:8000/users/${currentUserId}/fetch-all-articles`);
      setMessage(response.data.message);
      loadFeeds();
      loadAllArticles(1);
    } catch (error) {
      setMessage('Erreur lors de la synchronisation');
    }
  };

  const refreshFeed = async (feedId) => {
    try {
      const response = await axios.post(`http://localhost:8000/feeds/${feedId}/refresh`);
      setMessage(response.data.message);
      loadFeeds();
      refreshCurrentView();
    } catch (error) {
      setMessage('Erreur lors de l\'actualisation');
    }
  };

  const filterArticles = async (page = 1) => {
    if (!currentUserId) {
      setMessage('Erreur: Aucun utilisateur connecté');
      return;
    }

    try {
      let url = `http://localhost:8000/users/${currentUserId}/articles/filter`;
      let params = [`page=${page}`, 'per_page=20'];

      if (filters.read !== null) {
        params.push(`read=${filters.read}`);
      }
      if (filters.favorite !== null) {
        params.push(`favorite=${filters.favorite}`);
      }
      if (filters.search) {
        params.push(`search=${encodeURIComponent(filters.search)}`);
      }
      if (filters.days !== null) {
        params.push(`days=${filters.days}`);
      }
      if (filters.feed_id !== null) {
        params.push(`feed_id=${filters.feed_id}`);
      }
      
      url += '?' + params.join('&');
      
      const response = await axios.get(url);
      setArticles(response.data.articles || []);
      setPagination(response.data.pagination || {});
      setCurrentPage(page);
      setMessage(`Filtrage appliqué - Page ${page} - ${response.data.pagination?.total_articles || 0} articles trouvés`);
    } catch (error) {
      setMessage('Erreur lors du filtrage');
    }
  };

  const applyFilters = () => {
    setCurrentPage(1);
    filterArticles(1);
  };

  const resetFilters = () => {
    setFilters({ read: null, favorite: null, search: '', days: null, feed_id: null });
    setCurrentPage(1);
    loadAllArticles(1);
  };

  const refreshCurrentView = () => {
    if (filters.read !== null || filters.favorite !== null || filters.search || filters.days !== null || filters.feed_id !== null) {
      filterArticles(currentPage);
    } else {
      loadAllArticles(currentPage);
    }
  };

  const goToPage = (page) => {
    if (filters.read !== null || filters.favorite !== null || filters.search || filters.days !== null || filters.feed_id !== null) {
      filterArticles(page);
    } else {
      loadAllArticles(page);
    }
  };

  const goToNextPage = () => {
    if (pagination.has_next) {
      goToPage(currentPage + 1);
    }
  };

  const goToPreviousPage = () => {
    if (pagination.has_previous) {
      goToPage(currentPage - 1);
    }
  };

  const toggleRead = async (articleId, isRead) => {
    try {
      const response = await axios.patch(`http://localhost:8000/articles/${articleId}/read?read_status=${!isRead}`);
      setMessage(`Article ${!isRead ? 'marqué comme lu' : 'marqué comme non lu'}`);
      refreshCurrentView();
    } catch (error) {
      setMessage('Erreur lors de la mise à jour du statut de lecture');
    }
  };

  const toggleFavorite = async (articleId, isFavorite) => {
    try {
      const url = `http://localhost:8000/articles/${articleId}/favorite?favorite_status=${!isFavorite}`;
      const response = await axios.patch(url);
      setMessage(`Article ${!isFavorite ? 'ajouté aux favoris' : 'retiré des favoris'}`);
      refreshCurrentView();
    } catch (error) {
      setMessage('Erreur lors de la mise à jour des favoris');
    }
  };

  const formatDate = (dateStr) => {
    try {
      let date;
      
      if (dateStr.match(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)) {
        return dateStr;
      }
      
      if (dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        return dateStr + ' 00:00';
      }
      
      if (dateStr.includes('T') || dateStr.includes('+') || dateStr.includes('Z') || dateStr.includes(',')) {
        date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          const day = String(date.getDate()).padStart(2, '0');
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const year = date.getFullYear();
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          return `${day}/${month}/${year} ${hours}:${minutes}`;
        }
      }
      
      date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${day}/${month}/${year} ${hours}:${minutes}`;
      }
      
      return dateStr;
      
    } catch (e) {
      return dateStr;
    }
  };

  // NOUVELLE FONCTION pour formatter les dates de synchronisation
  const formatSyncDate = (dateStr) => {
    if (!dateStr) return '';
    
    try {
      // Si la date contient T, c'est un format ISO (UTC)
      if (dateStr.includes('T')) {
        const date = new Date(dateStr);
        // Ajouter 2h pour l'heure française d'été (ou 1h en hiver)
        const now = new Date();
        const offsetHours = (now.getMonth() >= 3 && now.getMonth() <= 9) ? 2 : 1; // Été/Hiver
        date.setHours(date.getHours() + offsetHours);
        
        return date.toLocaleString('fr-FR', {
          day: '2-digit',
          month: '2-digit', 
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
      
      // Sinon, retourner tel quel
      return dateStr;
      
    } catch (e) {
      return dateStr;
    }
  };

  const PaginationComponent = () => {
    if (pagination.total_pages <= 1) return null;

    const pages = [];
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(pagination.total_pages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return (
      <div style={{ padding: '20px', textAlign: 'center', borderTop: '1px solid #ddd' }}>
        <div style={{ marginBottom: '10px', fontSize: '14px', color: '#666' }}>
          Page {currentPage} sur {pagination.total_pages} - 
          {pagination.total_articles} articles au total
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '5px' }}>
          <button 
            onClick={goToPreviousPage} 
            disabled={!pagination.has_previous}
            style={{ 
              padding: '8px 12px', 
              border: '1px solid #ddd',
              backgroundColor: pagination.has_previous ? '#f8f9fa' : '#e9ecef',
              cursor: pagination.has_previous ? 'pointer' : 'not-allowed'
            }}
          >
            ← Précédent
          </button>
          
          {startPage > 1 && (
            <>
              <button onClick={() => goToPage(1)} style={{ padding: '8px 12px', border: '1px solid #ddd' }}>
                1
              </button>
              {startPage > 2 && <span style={{ padding: '8px' }}>...</span>}
            </>
          )}
          
          {pages.map(page => (
            <button
              key={page}
              onClick={() => goToPage(page)}
              style={{
                padding: '8px 12px',
                border: '1px solid #ddd',
                backgroundColor: page === currentPage ? '#007bff' : '#f8f9fa',
                color: page === currentPage ? 'white' : 'black',
                cursor: 'pointer'
              }}
            >
              {page}
            </button>
          ))}
          
          {endPage < pagination.total_pages && (
            <>
              {endPage < pagination.total_pages - 1 && <span style={{ padding: '8px' }}>...</span>}
              <button 
                onClick={() => goToPage(pagination.total_pages)} 
                style={{ padding: '8px 12px', border: '1px solid #ddd' }}
              >
                {pagination.total_pages}
              </button>
            </>
          )}
          
          <button 
            onClick={goToNextPage} 
            disabled={!pagination.has_next}
            style={{ 
              padding: '8px 12px', 
              border: '1px solid #ddd',
              backgroundColor: pagination.has_next ? '#f8f9fa' : '#e9ecef',
              cursor: pagination.has_next ? 'pointer' : 'not-allowed'
            }}
          >
            Suivant →
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="App">
      <h1>SUPRSS - Lecteur de flux RSS</h1>
      {message && <div style={{padding: '10px', background: '#f0f0f0', margin: '10px 0'}}>{message}</div>}
      
      {!isLoggedIn ? (
        <div style={{maxWidth: '400px', margin: '0 auto', padding: '20px'}}>
          <div style={{marginBottom: '30px'}}>
            <h2>Connexion</h2>
            <div style={{marginBottom: '10px'}}>
              <input
                placeholder="Nom d'utilisateur"
                value={loginData.username}
                onChange={(e) => setLoginData({...loginData, username: e.target.value})}
                style={{width: '100%', padding: '10px', marginBottom: '10px'}}
              />
              <input
                placeholder="Mot de passe"
                type="password"
                value={loginData.password}
                onChange={(e) => setLoginData({...loginData, password: e.target.value})}
                style={{width: '100%', padding: '10px', marginBottom: '10px'}}
              />
              <button onClick={handleLogin} style={{width: '100%', padding: '10px', backgroundColor: '#007bff', color: 'white', border: 'none'}}>
                Se connecter
              </button>
            </div>
          </div>

          <div>
            <h2>Inscription</h2>
            <div>
              <input
                placeholder="Nom d'utilisateur"
                value={registerData.username}
                onChange={(e) => setRegisterData({...registerData, username: e.target.value})}
                style={{width: '100%', padding: '10px', marginBottom: '10px'}}
              />
              <input
                placeholder="Email"
                value={registerData.email}
                onChange={(e) => setRegisterData({...registerData, email: e.target.value})}
                style={{width: '100%', padding: '10px', marginBottom: '10px'}}
              />
              <input
                placeholder="Mot de passe"
                type="password"
                value={registerData.password}
                onChange={(e) => setRegisterData({...registerData, password: e.target.value})}
                style={{width: '100%', padding: '10px', marginBottom: '10px'}}
              />
              <button onClick={handleRegister} style={{width: '100%', padding: '10px', backgroundColor: '#28a745', color: 'white', border: 'none'}}>
                S'inscrire
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <div style={{textAlign: 'right', padding: '10px', borderBottom: '1px solid #ddd', marginBottom: '20px'}}>
            Connecté : <strong>{currentUser}</strong> 
            <button onClick={logout} style={{marginLeft: '10px', padding: '5px 10px'}}>Déconnexion</button>
          </div>
          
          <div style={{marginBottom: '30px'}}>
            <h2>Gestion des flux RSS</h2>
            <div style={{marginBottom: '20px'}}>
              <button onClick={loadFeeds} style={{padding: '10px', marginRight: '10px'}}>Charger les flux</button>
              <button 
                onClick={syncAllFeeds}
                style={{padding: '10px', backgroundColor: '#28a745', color: 'white', border: 'none'}}
              >
                🔄 Synchroniser tous les flux
              </button>
            </div>
            
            {feeds.length > 0 && (
              <div>
                <h3>Mes flux RSS</h3>
                {feeds.map(feed => (
                  <div key={feed.id} style={{border: '1px solid #ddd', padding: '15px', margin: '10px 0', backgroundColor: '#f8f9fa'}}>
                    <h4 style={{marginTop: '0', marginBottom: '10px'}}>{feed.title}</h4>
                    <p style={{fontSize: '14px', color: '#666', marginBottom: '5px'}}>{feed.url}</p>
                    {feed.description && <p style={{fontSize: '14px', marginBottom: '10px'}}>{feed.description}</p>}
                    
                    {feed.last_updated && (
                      <p style={{fontSize: '12px', color: '#666', marginBottom: '15px'}}>
                        Dernière synchro : {formatSyncDate(feed.last_updated)}
                      </p>
                    )}
                    
                    <button 
                      onClick={() => refreshFeed(feed.id)}
                      style={{padding: '8px 12px', backgroundColor: '#17a2b8', color: 'white', border: 'none'}}
                    >
                      🔄 Actualiser ce flux
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{marginBottom: '30px', padding: '20px', border: '1px solid #ddd', backgroundColor: '#f8f9fa'}}>
            <h3>Ajouter un nouveau flux RSS</h3>
            <div style={{display: 'grid', gap: '10px'}}>
              <input 
                placeholder="Titre du flux" 
                value={newFeed.title}
                onChange={(e) => setNewFeed({...newFeed, title: e.target.value})}
                style={{padding: '10px'}}
              />
              <input 
                placeholder="URL RSS" 
                value={newFeed.url}
                onChange={(e) => setNewFeed({...newFeed, url: e.target.value})}
                style={{padding: '10px'}}
              />
              <input 
                placeholder="Description (optionnel)" 
                value={newFeed.description}
                onChange={(e) => setNewFeed({...newFeed, description: e.target.value})}
                style={{padding: '10px'}}
              />
              <button 
                onClick={createFeed}
                style={{padding: '10px', backgroundColor: '#007bff', color: 'white', border: 'none'}}
              >
                Créer le flux
              </button>
            </div>
          </div>

          <div style={{borderTop: '3px solid #007bff', paddingTop: '20px'}}>
            <h2 style={{color: '#007bff'}}>📰 Mes articles</h2>
            
            <div style={{marginBottom: '20px'}}>
              <button 
                onClick={() => loadAllArticles(1)} 
                style={{backgroundColor: '#007bff', color: 'white', padding: '15px', fontSize: '16px', border: 'none'}}
              >
                📰 Charger tous les articles
              </button>
            </div>
            
            <div style={{padding: '15px', background: '#f9f9f9', margin: '15px 0', border: '1px solid #ddd'}}>
              <h3>🔍 Filtres</h3>
              
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '15px'}}>
                <input
                  type="text"
                  placeholder="Recherche dans les articles"
                  value={filters.search}
                  onChange={(e) => setFilters({...filters, search: e.target.value})}
                  style={{padding: '8px'}}
                />

                <select
                  value={filters.read === null ? 'all' : filters.read.toString()}
                  onChange={(e) => setFilters({...filters, read: e.target.value === 'all' ? null : e.target.value === 'true'})}
                  style={{padding: '8px'}}
                >
                  <option value="all">Tous les articles</option>
                  <option value="false">Non lus</option>
                  <option value="true">Lus</option>
                </select>

                <select
                  value={filters.favorite === null ? 'all' : filters.favorite.toString()}
                  onChange={(e) => setFilters({...filters, favorite: e.target.value === 'all' ? null : e.target.value === 'true'})}
                  style={{padding: '8px'}}
                >
                  <option value="all">Tous</option>
                  <option value="true">Favoris</option>
                  <option value="false">Non favoris</option>
                </select>

                <select
                  value={filters.days === null ? 'all' : filters.days.toString()}
                  onChange={(e) => setFilters({...filters, days: e.target.value === 'all' ? null : parseInt(e.target.value)})}
                  style={{padding: '8px'}}
                >
                  <option value="all">Toutes les dates</option>
                  <option value="1">Aujourd'hui</option>
                  <option value="7">7 derniers jours</option>
                  <option value="30">30 derniers jours</option>
                  <option value="90">90 derniers jours</option>
                </select>

                <select
                  value={filters.feed_id === null ? 'all' : filters.feed_id.toString()}
                  onChange={(e) => setFilters({...filters, feed_id: e.target.value === 'all' ? null : parseInt(e.target.value)})}
                  style={{padding: '8px'}}
                >
                  <option value="all">Tous les flux</option>
                  {feeds.map(feed => (
                    <option key={feed.id} value={feed.id}>{feed.title}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <button onClick={applyFilters} style={{padding: '10px 20px', marginRight: '10px', backgroundColor: '#28a745', color: 'white', border: 'none'}}>
                  Appliquer les filtres
                </button>
                <button onClick={resetFilters} style={{padding: '10px 20px', backgroundColor: '#6c757d', color: 'white', border: 'none'}}>
                  Réinitialiser
                </button>
              </div>
            </div>

            <PaginationComponent />
            
            {articles.length === 0 ? (
              <div style={{padding: '40px', textAlign: 'center', backgroundColor: '#f8f9fa', border: '2px dashed #ccc', margin: '20px 0'}}>
                <h3>🔍 Aucun article trouvé</h3>
                <p>Synchronisez vos flux ou ajustez vos filtres pour voir des articles.</p>
              </div>
            ) : (
              <div>
                <h3 style={{color: '#28a745', marginBottom: '20px'}}>✅ {articles.length} articles affichés</h3>
                {articles.map(article => (
                  <div key={article.id} style={{border: '1px solid #ddd', padding: '20px', margin: '15px 0', backgroundColor: 'white', borderRadius: '5px'}}>
                    <div style={{fontSize: '14px', color: '#007bff', marginBottom: '10px', fontWeight: 'bold'}}>
                      📰 {article.feed ? article.feed.title : 'Source inconnue'}
                    </div>
                    
                    <h4 style={{marginBottom: '10px', lineHeight: '1.4'}}>{article.title}</h4>
                    
                    {article.published && (
                      <p style={{fontSize: '12px', color: '#888', marginBottom: '10px'}}>
                        📅 Publié le : {formatDate(article.published)}
                      </p>
                    )}
                    
                    <p style={{marginBottom: '15px', lineHeight: '1.5'}}>{article.summary}</p>
                    
                    <a 
                      href={article.link} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      style={{color: '#007bff', textDecoration: 'none', display: 'inline-block', marginBottom: '15px'}}
                    >
                      🔗 Lire l'article complet
                    </a>
                    
                    <div style={{display: 'flex', justifyContent: 'center', gap: '15px'}}>
                      <button 
                        onClick={() => toggleRead(article.id, article.is_read)}
                        style={{
                          padding: '10px 20px',
                          backgroundColor: article.is_read ? '#dc3545' : '#28a745',
                          color: 'white',
                          border: 'none',
                          borderRadius: '5px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: 'bold'
                        }}
                      >
                        {article.is_read ? '✓ Marquer non lu' : '📖 Marquer lu'}
                      </button>
                      <button
                        onClick={() => toggleFavorite(article.id, article.is_favorite)}
                        style={{
                          padding: '10px 20px',
                          backgroundColor: article.is_favorite ? '#ffc107' : '#6c757d',
                          color: 'white',
                          border: 'none',
                          borderRadius: '5px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: 'bold'
                        }}
                      >
                        {article.is_favorite ? '★ Retirer favori' : '☆ Ajouter favori'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <PaginationComponent />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;