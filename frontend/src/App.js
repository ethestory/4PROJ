import React, { useState } from 'react';
import axios from 'axios';
import { api } from './api';
import './App.css';

const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || "878235537833-s6enkhp3r37kjjmaqbiiepia0sv5gq1i.apps.googleusercontent.com";

function App() {
  const [message, setMessage] = useState('');
  const [feeds, setFeeds] = useState([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [registerData, setRegisterData] = useState({ username: '', email: '', password: '' });
  const [newFeed, setNewFeed] = useState({ 
    title: '', 
    url: '', 
    description: '',
    tags: '',
    update_frequency: 60
  });
  const [articles, setArticles] = useState([]);
  const [filters, setFilters] = useState({
    read: null,
    favorite: null,
    search: '',
    days: null,
    feed_id: null,
    tags: ''
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
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importFormat, setImportFormat] = useState('opml');
  const [importValidation, setImportValidation] = useState(null);
  const [isImporting, setIsImporting] = useState(false);

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

  // Fonction OAuth2 Google corrigée
  const handleGoogleResponse = async (response) => {
    try {
      console.log("Réponse Google reçue:", response);
      
      // Décoder le JWT token Google (partie payload)
      const payload = JSON.parse(atob(response.credential.split('.')[1]));
      console.log("Payload Google:", payload);
      
      // Préparer les données pour le backend
      const googleAuthData = {
        google_token: response.credential,
        email: payload.email,
        name: payload.name,
        google_id: payload.sub
      };

      // Envoyer au backend pour traitement
      const authResult = await axios.post('http://localhost:8000/auth/google', googleAuthData);
      
      if (authResult.data.success) {
        setMessage(`Connexion Google réussie ! Bienvenue ${authResult.data.user.username}`);
        setIsLoggedIn(true);
        setCurrentUser(authResult.data.user.username);
        setCurrentUserId(authResult.data.user.id);
        
        // Vider immédiatement les données affichées
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
        
      } else {
        setMessage('Erreur lors de la connexion Google: ' + authResult.data.error);
      }

    } catch (error) {
      console.error("Erreur Google OAuth:", error);
      setMessage('Erreur lors de la connexion Google : ' + (error.response?.data?.error || error.message));
    }
  };

  // Fonction d'initialisation Google corrigée
  const initializeGoogleSignIn = () => {
    if (window.google && window.google.accounts) {
      try {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleResponse,
          auto_select: false,
          cancel_on_tap_outside: true
        });

        // Vérifier que l'élément existe avant de render
        const buttonElement = document.getElementById("google-signin-button");
        if (buttonElement) {
          window.google.accounts.id.renderButton(
            buttonElement,
            { 
              theme: "outline", 
              size: "large",
              width: "100%",
              text: "continue_with",
              locale: "fr"
            }
          );
        }
      } catch (error) {
        console.error("Erreur initialisation Google:", error);
        setMessage("Erreur lors de l'initialisation de Google Sign-In");
      }
    }
  };

  // UseEffect amélioré pour Google OAuth - nettoyage plus agressif
  React.useEffect(() => {
    const googleButton = document.getElementById("google-signin-button");
    
    if (!isLoggedIn) {
      // Vider d'abord le bouton
      if (googleButton) {
        googleButton.innerHTML = '';
      }
      
      // Attendre que le script Google soit chargé avec timeout
      let attempts = 0;
      const maxAttempts = 50;
      
      const checkGoogleLoaded = () => {
        attempts++;
        if (window.google && window.google.accounts) {
          initializeGoogleSignIn();
        } else if (attempts < maxAttempts) {
          setTimeout(checkGoogleLoaded, 100);
        } else {
          console.warn("Google Sign-In n'a pas pu être initialisé");
        }
      };
      
      checkGoogleLoaded();
    } else {
      // Si connecté, supprimer complètement le contenu du bouton
      if (googleButton) {
        googleButton.innerHTML = '';
        googleButton.style.display = 'none';
      }
    }
  }, [isLoggedIn]);

  const logout = () => {
    // Nettoyage complet de l'état
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
    
    // Forcer le re-rendu en vidant le bouton Google existant
    setTimeout(() => {
      const googleButton = document.getElementById("google-signin-button");
      if (googleButton) {
        googleButton.innerHTML = '';
      }
    }, 100);
  };

  const loadFeeds = async () => {
    if (!currentUserId) {
      setMessage('Erreur: Aucun utilisateur connecté');
      return;
    }

    try {
      const response = await axios.get(`http://localhost:8000/users/${currentUserId}/feeds`);
      setFeeds(response.data.feeds || []);
    } catch (error) {
      setMessage('Erreur lors du chargement des flux');
    }
  };

  const fixExistingFeeds = async () => {
    try {
      const response = await axios.post('http://localhost:8000/fix-existing-feeds');
      setMessage(response.data.message || 'Flux corrigés !');
      loadFeeds();
    } catch (error) {
      setMessage('Erreur lors de la correction des flux');
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
      setNewFeed({ title: '', url: '', description: '', tags: '', update_frequency: 60 });
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

  // Fonction unique pour appliquer les filtres
  const applyFilters = async (customFilters = null, page = 1) => {
    if (!currentUserId) {
      setMessage('Erreur: Aucun utilisateur connecté');
      return;
    }

    // Utiliser les filtres personnalisés ou les filtres actuels
    const activeFilters = customFilters || filters;
    
    console.log('🔍 Application des filtres:', activeFilters);
    
    // Vérifier si tous les filtres sont vides
    const isEmpty = activeFilters.read === null && activeFilters.favorite === null && 
                   !activeFilters.search && activeFilters.days === null && 
                   activeFilters.feed_id === null && !activeFilters.tags;

    try {
      if (isEmpty) {
        // Charger tous les articles si aucun filtre
        const response = await axios.get(`http://localhost:8000/users/${currentUserId}/articles?page=${page}&per_page=20`);
        setArticles(response.data.articles || []);
        setPagination(response.data.pagination || {});
        setCurrentPage(page);
        setMessage(`Articles chargés - Page ${page} - ${response.data.pagination?.total_articles || 0} articles au total`);
      } else {
        // Appliquer les filtres
        let url = `http://localhost:8000/users/${currentUserId}/articles/filter`;
        let params = [`page=${page}`, 'per_page=20'];

        if (activeFilters.read !== null) {
          params.push(`read=${activeFilters.read}`);
        }
        if (activeFilters.favorite !== null) {
          params.push(`favorite=${activeFilters.favorite}`);
        }
        if (activeFilters.search) {
          params.push(`search=${encodeURIComponent(activeFilters.search)}`);
        }
        if (activeFilters.days !== null) {
          params.push(`days=${activeFilters.days}`);
        }
        if (activeFilters.feed_id !== null) {
          params.push(`feed_id=${activeFilters.feed_id}`);
        }
        if (activeFilters.tags) {
          params.push(`tags=${encodeURIComponent(activeFilters.tags)}`);
        }
        
        url += '?' + params.join('&');
        
        const response = await axios.get(url);
        setArticles(response.data.articles || []);
        setPagination(response.data.pagination || {});
        setCurrentPage(page);
        setMessage(`Filtrage appliqué - Page ${page} - ${response.data.pagination?.total_articles || 0} articles trouvés`);
      }
    } catch (error) {
      console.error('Erreur filtrage:', error);
      setMessage('Erreur lors du filtrage: ' + (error.response?.data?.error || error.message));
    }
  };

  // Fonction pour supprimer un filtre spécifique
  const removeFilter = (filterType) => {
    const newFilters = { ...filters };
    
    switch (filterType) {
      case 'read':
        newFilters.read = null;
        break;
      case 'favorite':
        newFilters.favorite = null;
        break;
      case 'search':
        newFilters.search = '';
        break;
      case 'days':
        newFilters.days = null;
        break;
      case 'feed_id':
        newFilters.feed_id = null;
        break;
      case 'tags':
        newFilters.tags = '';
        break;
      default:
        break;
    }
    
    console.log('🗑️ Suppression du filtre:', filterType, 'Nouveaux filtres:', newFilters);
    
    // Mettre à jour les filtres et appliquer immédiatement
    setFilters(newFilters);
    applyFilters(newFilters, 1);
  };

  // Fonction pour supprimer tous les filtres
  const resetAllFilters = () => {
    const emptyFilters = { read: null, favorite: null, search: '', days: null, feed_id: null, tags: '' };
    setFilters(emptyFilters);
    applyFilters(emptyFilters, 1);
  };

  const refreshCurrentView = () => {
    applyFilters(null, currentPage);
  };

  const goToPage = (page) => {
    applyFilters(null, page);
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

  // Fonction d'export des flux
  const exportFeeds = async (format) => {
    if (!currentUserId) {
      setMessage('Erreur: Aucun utilisateur connecté');
      return;
    }

    try {
      setMessage(`Export ${format.toUpperCase()} en cours...`);
      
      const response = await axios.get(`http://localhost:8000/users/${currentUserId}/export/${format}`);
      
      // Créer et télécharger le fichier
      const blob = new Blob([response.data.data], { 
        type: format === 'json' ? 'application/json' : 
              format === 'csv' ? 'text/csv' : 
              'application/xml'
      });
      
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = response.data.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      setMessage(`✅ Export ${format.toUpperCase()} téléchargé : ${response.data.filename}`);
      
    } catch (error) {
      setMessage(`❌ Erreur lors de l'export ${format.toUpperCase()} : ` + (error.response?.data?.detail || error.message));
    }
  };

  const validateImportFile = async (file, format) => {
    if (!file) return;
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await axios.post(`http://localhost:8000/validate-import/${format}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      setImportValidation(response.data);
      
      if (response.data.valid) {
        setMessage(`✅ Fichier valide! ${response.data.feeds_found} flux détectés`);
      } else {
        setMessage(`❌ Fichier invalide: ${response.data.errors.join(', ')}`);
      }
      
    } catch (error) {
      setMessage('Erreur lors de la validation: ' + error.message);
      setImportValidation(null);
    }
  };

  // Fonction d'import des flux
  const importFeeds = async () => {
    if (!currentUserId || !importFile) {
      setMessage('Erreur: Aucun utilisateur connecté ou fichier sélectionné');
      return;
    }

    setIsImporting(true);
    
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      
      setMessage(`📥 Import ${importFormat.toUpperCase()} en cours...`);
      
      const response = await axios.post(
        `http://localhost:8000/users/${currentUserId}/import/${importFormat}`, 
        formData, 
        {
          headers: { 'Content-Type': 'multipart/form-data' }
        }
      );
      
      const stats = response.data.stats;
      let message = `✅ Import terminé!\n`;
      message += `📊 ${stats.imported_feeds}/${stats.total_feeds} flux importés\n`;
      
      if (stats.skipped_feeds > 0) {
        message += `⭐️ ${stats.skipped_feeds} flux ignorés (déjà existants)\n`;
      }
      
      if (stats.errors.length > 0) {
        message += `⚠️ ${stats.errors.length} erreurs:\n`;
        message += stats.errors.slice(0, 3).join('\n');
        if (stats.errors.length > 3) {
          message += `\n... et ${stats.errors.length - 3} autres erreurs`;
        }
      }
      
      setMessage(message);
      
      // Réinitialiser et recharger
      setImportFile(null);
      setImportValidation(null);
      loadFeeds();
      
      // Actualiser les articles si des flux ont été importés
      if (stats.imported_feeds > 0) {
        setTimeout(() => syncAllFeeds(), 1000);
      }
      
    } catch (error) {
      setMessage(`❌ Erreur lors de l'import: ` + (error.response?.data?.detail || error.message));
    } finally {
      setIsImporting(false);
    }
  };

  // Gestionnaire de changement de fichier
  const handleFileChange = (event) => {
    const file = event.target.files[0];
    setImportFile(file);
    setImportValidation(null);
    
    if (file) {
      // Auto-détecter le format basé sur l'extension
      const fileName = file.name.toLowerCase();
      if (fileName.endsWith('.json')) {
        setImportFormat('json');
      } else if (fileName.endsWith('.csv')) {
        setImportFormat('csv');
      } else if (fileName.endsWith('.opml') || fileName.endsWith('.xml')) {
        setImportFormat('opml');
      }
      
      // Valider automatiquement
      setTimeout(() => validateImportFile(file, importFormat), 100);
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

  const formatSyncDate = (dateStr) => {
    if (!dateStr) return '';
    
    try {
      if (dateStr.includes('T')) {
        const date = new Date(dateStr);
        const now = new Date();
        const offsetHours = (now.getMonth() >= 3 && now.getMonth() <= 9) ? 2 : 1;
        date.setHours(date.getHours() + offsetHours);
        
        return date.toLocaleString('fr-FR', {
          day: '2-digit',
          month: '2-digit', 
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
      
      return dateStr;
      
    } catch (e) {
      return dateStr;
    }
  };

  const formatFrequency = (frequency) => {
    if (!frequency || frequency === undefined || frequency === null) {
      return 'Non définie';
    }
    
    switch (frequency) {
      case 15: return 'Toutes les 15 min';
      case 30: return 'Toutes les 30 min';
      case 60: return 'Toutes les heures';
      case 360: return 'Toutes les 6h';
      case 720: return 'Toutes les 12h';
      case 1440: return 'Une fois par jour';
      default: return `Toutes les ${frequency} min`;
    }
  };

  const getAllTags = () => {
    const allTags = new Set();
    feeds.forEach(feed => {
      if (feed.tags && feed.tags.length > 0) {
        feed.tags.split(',').forEach(tag => {
          const trimmedTag = tag.trim();
          if (trimmedTag) {
            allTags.add(trimmedTag);
          }
        });
      }
    });
    return Array.from(allTags).sort();
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
          
          {startPage > 1 ? (
            <React.Fragment>
              <button onClick={() => goToPage(1)} style={{ padding: '8px 12px', border: '1px solid #ddd' }}>
                1
              </button>
              {startPage > 2 ? <span style={{ padding: '8px' }}>...</span> : null}
            </React.Fragment>
          ) : null}
          
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
          
          {endPage < pagination.total_pages ? (
            <React.Fragment>
              {endPage < pagination.total_pages - 1 ? <span style={{ padding: '8px' }}>...</span> : null}
              <button 
                onClick={() => goToPage(pagination.total_pages)} 
                style={{ padding: '8px 12px', border: '1px solid #ddd' }}
              >
                {pagination.total_pages}
              </button>
            </React.Fragment>
          ) : null}
          
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
      {message ? <div style={{padding: '10px', background: '#f0f0f0', margin: '10px 0'}}>{message}</div> : null}
      
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
            
            {/* Section Google OAuth - seulement si pas connecté */}
            <div style={{marginTop: '15px', textAlign: 'center'}}>
              <div style={{marginBottom: '10px', color: '#666', fontSize: '14px'}}>ou</div>
              <div 
                id="google-signin-button" 
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  minHeight: '44px'
                }}
              ></div>
              <div style={{fontSize: '12px', color: '#666', marginTop: '5px'}}>
                Connexion sécurisée avec Google
              </div>
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
                style={{padding: '10px', backgroundColor: '#28a745', color: 'white', border: 'none', marginRight: '10px'}}
              >
                🔄 Synchroniser tous les flux
              </button>
              <button 
                onClick={fixExistingFeeds}
                style={{padding: '10px', backgroundColor: '#ffc107', color: 'black', border: 'none', marginRight: '10px'}}
              >
                🔧 Corriger les flux existants
              </button>
              
              {/* Boutons d'export */}
              <div style={{display: 'inline-block', marginLeft: '20px'}}>
                <span style={{marginRight: '10px', fontWeight: 'bold', color: '#666'}}>📤 Export:</span>
                <button 
                  onClick={() => exportFeeds('json')}
                  style={{padding: '8px 12px', backgroundColor: '#17a2b8', color: 'white', border: 'none', marginRight: '5px', borderRadius: '4px'}}
                  title="Exporter au format JSON"
                >
                  JSON
                </button>
                <button 
                  onClick={() => exportFeeds('csv')}
                  style={{padding: '8px 12px', backgroundColor: '#28a745', color: 'white', border: 'none', marginRight: '5px', borderRadius: '4px'}}
                  title="Exporter au format CSV"
                >
                  CSV
                </button>
                <button 
                  onClick={() => exportFeeds('opml')}
                  style={{padding: '8px 12px', backgroundColor: '#6f42c1', color: 'white', border: 'none', borderRadius: '4px'}}
                  title="Exporter au format OPML (standard RSS)"
                >
                  OPML
                </button>
              </div>
              
              {/* Section d'import */}
              <div style={{display: 'inline-block', marginLeft: '20px', borderLeft: '2px solid #ddd', paddingLeft: '20px'}}>
                <span style={{marginRight: '10px', fontWeight: 'bold', color: '#666'}}>📥 Import:</span>
                
                <div style={{display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '300px'}}>
                  {/* Sélection du format */}
                  <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                    <select 
                      value={importFormat}
                      onChange={(e) => {
                        setImportFormat(e.target.value);
                        if (importFile) {
                          validateImportFile(importFile, e.target.value);
                        }
                      }}
                      style={{padding: '6px 10px', borderRadius: '4px', border: '1px solid #ddd'}}
                    >
                      <option value="opml">OPML (standard RSS)</option>
                      <option value="json">JSON</option>
                      <option value="csv">CSV</option>
                    </select>
                    
                    {/* Sélection de fichier */}
                    <input
                      type="file"
                      accept={
                        importFormat === 'json' ? '.json' :
                        importFormat === 'csv' ? '.csv' :
                        '.opml,.xml'
                      }
                      onChange={handleFileChange}
                      style={{fontSize: '12px'}}
                    />
                  </div>
                  
                  {/* Validation du fichier */}
                  {importValidation && (
                    <div style={{
                      padding: '8px 12px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      backgroundColor: importValidation.valid ? '#d4edda' : '#f8d7da',
                      color: importValidation.valid ? '#155724' : '#721c24',
                      border: `1px solid ${importValidation.valid ? '#c3e6cb' : '#f5c6cb'}`
                    }}>
                      {importValidation.valid ? (
                        <span>✅ {importValidation.feeds_found} flux détectés dans {importValidation.filename}</span>
                      ) : (
                        <span>❌ Erreurs: {importValidation.errors.join(', ')}</span>
                      )}
                    </div>
                  )}
                  
                  {/* Bouton d'import */}
                  <button
                    onClick={importFeeds}
                    disabled={!importFile || !importValidation?.valid || isImporting}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: (!importFile || !importValidation?.valid || isImporting) ? '#6c757d' : '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: (!importFile || !importValidation?.valid || isImporting) ? 'not-allowed' : 'pointer',
                      fontSize: '12px',
                      fontWeight: 'bold'
                    }}
                    title={
                      !importFile ? 'Sélectionnez un fichier' :
                      !importValidation?.valid ? 'Fichier invalide' :
                      isImporting ? 'Import en cours...' :
                      'Importer les flux'
                    }
                  >
                    {isImporting ? '⏳ Import...' : '📥 Importer'}
                  </button>
                </div>
              </div>

            </div>
            
            {feeds.length > 0 ? (
              <div>
                <h3>Mes flux RSS</h3>
                {feeds.map(feed => (
                  <div key={feed.id} style={{border: '1px solid #ddd', padding: '15px', margin: '10px 0', backgroundColor: '#f8f9fa'}}>
                    <h4 style={{marginTop: '0', marginBottom: '10px'}}>{feed.title}</h4>
                    <p style={{fontSize: '14px', color: '#666', marginBottom: '5px'}}>{feed.url}</p>
                    {feed.description ? <p style={{fontSize: '14px', marginBottom: '10px'}}>{feed.description}</p> : null}
                    
                    {feed.tags && feed.tags.length > 0 ? (
                      <div style={{marginBottom: '10px'}}>
                        <span style={{fontSize: '12px', color: '#666', marginRight: '5px'}}>Tags:</span>
                        {feed.tags.split(',').map((tag, index) => (
                          <span key={index} style={{
                            display: 'inline-block',
                            backgroundColor: '#007bff',
                            color: 'white',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            marginRight: '6px',
                            marginBottom: '5px'
                          }}>
                            {tag.trim()}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    
                    <p style={{fontSize: '12px', color: '#666', marginBottom: '10px'}}>
                      Fréquence: {formatFrequency(feed.update_frequency)}
                    </p>
                    
                    {feed.last_updated ? (
                      <p style={{fontSize: '12px', color: '#666', marginBottom: '15px'}}>
                        Dernière synchro : {formatSyncDate(feed.last_updated)}
                      </p>
                    ) : null}
                    
                    <button 
                      onClick={() => refreshFeed(feed.id)}
                      style={{padding: '8px 12px', backgroundColor: '#17a2b8', color: 'white', border: 'none'}}
                    >
                      🔄 Actualiser ce flux
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
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
              <input 
                placeholder="Tags (séparés par des virgules, ex: technologie, actualité)" 
                value={newFeed.tags}
                onChange={(e) => setNewFeed({...newFeed, tags: e.target.value})}
                style={{padding: '10px'}}
              />
              <select 
                value={newFeed.update_frequency}
                onChange={(e) => setNewFeed({...newFeed, update_frequency: parseInt(e.target.value)})}
                style={{padding: '10px'}}
              >
                <option value={15}>Toutes les 15 minutes</option>
                <option value={30}>Toutes les 30 minutes</option>
                <option value={60}>Toutes les heures (défaut)</option>
                <option value={360}>Toutes les 6 heures</option>
                <option value={720}>Toutes les 12 heures</option>
                <option value={1440}>Une fois par jour</option>
              </select>
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
            
            {/* Section filtres */}
            <div style={{padding: '20px', background: '#f9f9f9', margin: '15px 0', border: '1px solid #ddd', borderRadius: '8px'}}>
              <h3>🔍 Filtres</h3>
              
              <div style={{
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
                gap: '15px', 
                marginBottom: '20px'
              }}>
                {/* Recherche */}
                <input
                  type="text"
                  placeholder="Recherche dans les articles"
                  value={filters.search}
                  onChange={(e) => {
                    const newFilters = {...filters, search: e.target.value};
                    setFilters(newFilters);
                    // Application automatique après un délai pour la recherche
                    setTimeout(() => applyFilters(newFilters, 1), 500);
                  }}
                  style={{padding: '10px', borderRadius: '4px', border: '1px solid #ddd'}}
                />

                {/* Dropdown tags */}
                <div style={{position: 'relative'}}>
                  <input
                    type="text"
                    placeholder="Filtrer par tags..."
                    value={filters.tags}
                    onChange={(e) => {
                      const newFilters = {...filters, tags: e.target.value};
                      setFilters(newFilters);
                      setShowTagDropdown(true);
                    }}
                    onFocus={() => setShowTagDropdown(true)}
                    style={{padding: '10px', width: '100%', borderRadius: '4px', border: '1px solid #ddd'}}
                  />
                  
                  {showTagDropdown && getAllTags().length > 0 ? (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      backgroundColor: 'white',
                      border: '1px solid #ddd',
                      borderTop: 'none',
                      borderRadius: '0 0 4px 4px',
                      maxHeight: '200px',
                      overflowY: 'auto',
                      zIndex: 1000,
                      boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                    }}>
                      {getAllTags()
                        .filter(tag => tag.toLowerCase().includes(filters.tags.toLowerCase()))
                        .map(tag => (
                        <div
                          key={tag}
                          onClick={() => {
                            const newFilters = {...filters, tags: tag};
                            setFilters(newFilters);
                            setShowTagDropdown(false);
                            setTimeout(() => applyFilters(newFilters, 1), 100);
                          }}
                          style={{
                            padding: '12px 15px',
                            cursor: 'pointer',
                            borderBottom: '1px solid #f0f0f0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            transition: 'background-color 0.2s ease'
                          }}
                          onMouseOver={(e) => e.target.style.backgroundColor = '#f8f9fa'}
                          onMouseOut={(e) => e.target.style.backgroundColor = 'white'}
                        >
                          <span style={{fontWeight: '500'}}>{tag}</span>
                          <span style={{
                            fontSize: '12px', 
                            color: '#666',
                            backgroundColor: '#e9ecef',
                            padding: '2px 6px',
                            borderRadius: '10px'
                          }}>
                            {feeds.filter(f => f.tags && f.tags.includes(tag)).length} flux
                          </span>
                        </div>
                      ))}
                      {getAllTags().filter(tag => tag.toLowerCase().includes(filters.tags.toLowerCase())).length === 0 ? (
                        <div style={{padding: '12px 15px', color: '#666', fontStyle: 'italic', textAlign: 'center'}}>
                          Aucun tag trouvé
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  
                  {/* Overlay pour fermer le dropdown */}
                  {showTagDropdown ? (
                    <div 
                      style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999}}
                      onClick={() => setShowTagDropdown(false)}
                    />
                  ) : null}
                </div>

                {/* Autres filtres */}
                <select
                  value={filters.read === null ? 'all' : filters.read.toString()}
                  onChange={(e) => {
                    const newValue = e.target.value === 'all' ? null : e.target.value === 'true';
                    const newFilters = {...filters, read: newValue};
                    setFilters(newFilters);
                    setTimeout(() => applyFilters(newFilters, 1), 100);
                  }}
                  style={{padding: '10px', borderRadius: '4px', border: '1px solid #ddd'}}
                >
                  <option value="all">Tous les articles</option>
                  <option value="false">Non lus</option>
                  <option value="true">Lus</option>
                </select>

                <select
                  value={filters.favorite === null ? 'all' : filters.favorite.toString()}
                  onChange={(e) => {
                    const newValue = e.target.value === 'all' ? null : e.target.value === 'true';
                    const newFilters = {...filters, favorite: newValue};
                    setFilters(newFilters);
                    setTimeout(() => applyFilters(newFilters, 1), 100);
                  }}
                  style={{padding: '10px', borderRadius: '4px', border: '1px solid #ddd'}}
                >
                  <option value="all">Tous</option>
                  <option value="true">Favoris</option>
                  <option value="false">Non favoris</option>
                </select>

                <select
                  value={filters.days === null ? 'all' : filters.days.toString()}
                  onChange={(e) => {
                    const newValue = e.target.value === 'all' ? null : parseInt(e.target.value);
                    const newFilters = {...filters, days: newValue};
                    setFilters(newFilters);
                    setTimeout(() => applyFilters(newFilters, 1), 100);
                  }}
                  style={{padding: '10px', borderRadius: '4px', border: '1px solid #ddd'}}
                >
                  <option value="all">Toutes les dates</option>
                  <option value="1">Aujourd'hui</option>
                  <option value="7">7 derniers jours</option>
                  <option value="30">30 derniers jours</option>
                  <option value="90">90 derniers jours</option>
                </select>

                <select
                  value={filters.feed_id === null ? 'all' : filters.feed_id.toString()}
                  onChange={(e) => {
                    const newValue = e.target.value === 'all' ? null : parseInt(e.target.value);
                    const newFilters = {...filters, feed_id: newValue};
                    setFilters(newFilters);
                    setTimeout(() => applyFilters(newFilters, 1), 100);
                  }}
                  style={{padding: '10px', borderRadius: '4px', border: '1px solid #ddd'}}
                >
                  <option value="all">Tous mes flux</option>
                  {feeds.map(feed => (
                    <option key={feed.id} value={feed.id}>{feed.title}</option>
                  ))}
                </select>
              </div>

              {/* Tags rapides */}
              {getAllTags().length > 0 ? (
                <div style={{marginBottom: '20px'}}>
                  <div style={{
                    display: 'flex', 
                    flexWrap: 'wrap', 
                    gap: '10px', 
                    alignItems: 'center',
                    padding: '15px',
                    backgroundColor: 'white',
                    borderRadius: '6px',
                    border: '1px solid #e0e0e0'
                  }}>
                    <span style={{
                      fontSize: '13px', 
                      color: '#666', 
                      fontWeight: 'bold',
                      marginRight: '10px',
                      minWidth: 'fit-content'
                    }}>
                      Tags rapides:
                    </span>
                    {getAllTags().slice(0, 4).map(tag => (
                      <button
                        key={tag}
                        onClick={() => {
                          const newFilters = {...filters, tags: tag};
                          setFilters(newFilters);
                          setTimeout(() => applyFilters(newFilters, 1), 100);
                        }}
                        style={{
                          padding: '6px 12px',
                          fontSize: '12px',
                          border: filters.tags === tag ? '2px solid #007bff' : '1px solid #ccc',
                          borderRadius: '18px',
                          backgroundColor: filters.tags === tag ? '#e3f2fd' : 'white',
                          cursor: 'pointer',
                          color: filters.tags === tag ? '#007bff' : '#666',
                          whiteSpace: 'nowrap',
                          transition: 'all 0.2s ease',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                        onMouseOver={(e) => {
                          if (filters.tags !== tag) {
                            e.target.style.backgroundColor = '#f8f9fa';
                            e.target.style.borderColor = '#007bff';
                          }
                        }}
                        onMouseOut={(e) => {
                          if (filters.tags !== tag) {
                            e.target.style.backgroundColor = 'white';
                            e.target.style.borderColor = '#ccc';
                          }
                        }}
                      >
                        <span>{tag}</span>
                        <span style={{
                          fontSize: '10px',
                          backgroundColor: filters.tags === tag ? '#007bff' : '#e9ecef',
                          color: filters.tags === tag ? 'white' : '#666',
                          padding: '1px 4px',
                          borderRadius: '8px',
                          marginLeft: '2px'
                        }}>
                          {feeds.filter(f => f.tags && f.tags.includes(tag)).length}
                        </span>
                      </button>
                    ))}
                    {getAllTags().length > 4 ? (
                      <span style={{fontSize: '11px', color: '#999', fontStyle: 'italic'}}>
                        +{getAllTags().length - 4} autres tags
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}
              
              {/* Affichage des filtres actifs avec suppression individuelle */}
              {(filters.tags || filters.search || filters.read !== null || filters.favorite !== null || filters.days !== null || filters.feed_id !== null) ? (
                <div style={{
                  marginBottom: '20px', 
                  padding: '12px', 
                  backgroundColor: '#e3f2fd', 
                  borderRadius: '6px',
                  border: '1px solid #bbdefb'
                }}>
                  <div style={{display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px'}}>
                    <strong style={{color: '#1976d2', marginRight: '10px'}}>Filtres actifs :</strong>
                    
                    {filters.tags ? (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '4px 8px',
                        backgroundColor: '#007bff',
                        color: 'white',
                        borderRadius: '12px',
                        fontSize: '12px',
                        gap: '6px'
                      }}>
                        Tag: {filters.tags}
                        <button
                          onClick={() => removeFilter('tags')}
                          style={{
                            background: 'rgba(255,255,255,0.3)',
                            border: 'none',
                            borderRadius: '50%',
                            width: '16px',
                            height: '16px',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          title="Supprimer ce filtre"
                        >
                          ✕
                        </button>
                      </span>
                    ) : null}
                    
                    {filters.search ? (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '4px 8px',
                        backgroundColor: '#28a745',
                        color: 'white',
                        borderRadius: '12px',
                        fontSize: '12px',
                        gap: '6px'
                      }}>
                        Recherche: {filters.search}
                        <button
                          onClick={() => removeFilter('search')}
                          style={{
                            background: 'rgba(255,255,255,0.3)',
                            border: 'none',
                            borderRadius: '50%',
                            width: '16px',
                            height: '16px',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          title="Supprimer ce filtre"
                        >
                          ✕
                        </button>
                      </span>
                    ) : null}
                    
                    {filters.read !== null ? (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '4px 8px',
                        backgroundColor: '#17a2b8',
                        color: 'white',
                        borderRadius: '12px',
                        fontSize: '12px',
                        gap: '6px'
                      }}>
                        {filters.read ? 'Lus' : 'Non lus'}
                        <button
                          onClick={() => removeFilter('read')}
                          style={{
                            background: 'rgba(255,255,255,0.3)',
                            border: 'none',
                            borderRadius: '50%',
                            width: '16px',
                            height: '16px',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          title="Supprimer ce filtre"
                        >
                          ✕
                        </button>
                      </span>
                    ) : null}
                    
                    {filters.favorite !== null ? (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '4px 8px',
                        backgroundColor: '#ffc107',
                        color: 'black',
                        borderRadius: '12px',
                        fontSize: '12px',
                        gap: '6px'
                      }}>
                        {filters.favorite ? 'Favoris' : 'Non favoris'}
                        <button
                          onClick={() => removeFilter('favorite')}
                          style={{
                            background: 'rgba(0,0,0,0.2)',
                            border: 'none',
                            borderRadius: '50%',
                            width: '16px',
                            height: '16px',
                            color: 'black',
                            cursor: 'pointer',
                            fontSize: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          title="Supprimer ce filtre"
                        >
                          ✕
                        </button>
                      </span>
                    ) : null}
                    
                    {filters.days !== null ? (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '4px 8px',
                        backgroundColor: '#6f42c1',
                        color: 'white',
                        borderRadius: '12px',
                        fontSize: '12px',
                        gap: '6px'
                      }}>
                        {filters.days} jour{filters.days > 1 ? 's' : ''}
                        <button
                          onClick={() => removeFilter('days')}
                          style={{
                            background: 'rgba(255,255,255,0.3)',
                            border: 'none',
                            borderRadius: '50%',
                            width: '16px',
                            height: '16px',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          title="Supprimer ce filtre"
                        >
                          ✕
                        </button>
                      </span>
                    ) : null}
                    
                    {filters.feed_id !== null ? (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '4px 8px',
                        backgroundColor: '#fd7e14',
                        color: 'white',
                        borderRadius: '12px',
                        fontSize: '12px',
                        gap: '6px'
                      }}>
                        Flux: {feeds.find(f => f.id === filters.feed_id)?.title || 'Inconnu'}
                        <button
                          onClick={() => removeFilter('feed_id')}
                          style={{
                            background: 'rgba(255,255,255,0.3)',
                            border: 'none',
                            borderRadius: '50%',
                            width: '16px',
                            height: '16px',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          title="Supprimer ce filtre"
                        >
                          ✕
                        </button>
                      </span>
                    ) : null}
                    
                    {/* Bouton pour tout effacer */}
                    <button 
                      onClick={resetAllFilters}
                      style={{
                        marginLeft: '15px', 
                        padding: '6px 12px', 
                        backgroundColor: '#dc3545', 
                        color: 'white', 
                        border: 'none', 
                        borderRadius: '12px', 
                        fontSize: '12px', 
                        cursor: 'pointer',
                        fontWeight: 'bold'
                      }}
                      title="Supprimer tous les filtres"
                    >
                      🗑️ Tout effacer
                    </button>
                  </div>
                </div>
              ) : null}
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
                      
                      {/* Tags cliquables avec meilleur espacement */}
                      {article.feed && article.feed.tags && article.feed.tags.length > 0 ? (
                        <div style={{marginTop: '8px', marginBottom: '8px', lineHeight: '1.6'}}>
                          {article.feed.tags.split(',').map((tag, index) => (
                            <span 
                              key={index} 
                              onClick={() => {
                                const newFilters = {...filters, tags: tag.trim()};
                                setFilters(newFilters);
                                setTimeout(() => applyFilters(newFilters, 1), 100);
                              }}
                              style={{
                                display: 'inline-block',
                                backgroundColor: '#e9ecef',
                                color: '#495057',
                                padding: '3px 8px',
                                borderRadius: '12px',
                                fontSize: '11px',
                                marginRight: '6px',
                                marginBottom: '4px',
                                cursor: 'pointer',
                                border: '1px solid #dee2e6',
                                transition: 'all 0.2s ease'
                              }}
                              onMouseOver={(e) => {
                                e.target.style.backgroundColor = '#007bff';
                                e.target.style.color = 'white';
                                e.target.style.borderColor = '#0056b3';
                              }}
                              onMouseOut={(e) => {
                                e.target.style.backgroundColor = '#e9ecef';
                                e.target.style.color = '#495057';
                                e.target.style.borderColor = '#dee2e6';
                              }}
                              title={`Cliquer pour filtrer par "${tag.trim()}"`}
                            >
                              {tag.trim()}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    
                    <h4 style={{marginBottom: '10px', lineHeight: '1.4', marginTop: '5px', fontSize: '18px', color: '#333'}}>{article.title}</h4>
                    
                    {article.published ? (
                      <p style={{fontSize: '12px', color: '#888', marginBottom: '12px'}}>
                        📅 Publié le : {formatDate(article.published)}
                      </p>
                    ) : null}
                    
                    {/* Résumé avec protection */}
                    {article.summary && article.summary.trim() ? (
                      <p style={{
                        marginBottom: '15px', 
                        lineHeight: '1.6', 
                        color: '#333', 
                        fontSize: '14px',
                        padding: '10px',
                        backgroundColor: '#f8f9fa',
                        borderLeft: '3px solid #007bff',
                        borderRadius: '0 4px 4px 0'
                      }}>
                        {article.summary}
                      </p>
                    ) : (
                      <p style={{
                        marginBottom: '15px', 
                        lineHeight: '1.5', 
                        color: '#6c757d', 
                        fontSize: '14px', 
                        fontStyle: 'italic',
                        padding: '10px',
                        backgroundColor: '#f8f9fa',
                        borderLeft: '3px solid #6c757d',
                        borderRadius: '0 4px 4px 0'
                      }}>
                        🔍 Aucun résumé disponible pour cet article.
                      </p>
                    )}
                    
                    <a 
                      href={article.link} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      style={{
                        color: '#007bff', 
                        textDecoration: 'none', 
                        display: 'inline-block', 
                        marginBottom: '15px',
                        padding: '8px 12px',
                        border: '1px solid #007bff',
                        borderRadius: '4px',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseOver={(e) => {
                        e.target.style.backgroundColor = '#007bff';
                        e.target.style.color = 'white';
                      }}
                      onMouseOut={(e) => {
                        e.target.style.backgroundColor = 'transparent';
                        e.target.style.color = '#007bff';
                      }}
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