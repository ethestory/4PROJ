// App.js - PARTIE 1: IMPORTS ET CONSTANTES

import React, { useState } from 'react';
import axios from 'axios';
import { api } from './api';
import './App.css';

const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || "878235537833-s6enkhp3r37kjjmaqbiiepia0sv5gq1i.apps.googleusercontent.com";

// App.js - PARTIE 2: VARIABLES D'ÉTAT

function App() {
  // États principaux
  const [message, setMessage] = useState('');
  const [feeds, setFeeds] = useState([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  
  // États d'authentification
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [registerData, setRegisterData] = useState({ username: '', email: '', password: '' });
  
  // États pour les flux
  const [newFeed, setNewFeed] = useState({ 
    title: '', 
    url: '', 
    description: '',
    tags: '',
    update_frequency: 60
  });
  
  // États pour les articles
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

  // États pour les collections partagées
  const [collections, setCollections] = useState([]);
  const [currentCollection, setCurrentCollection] = useState(null);
  const [collectionArticles, setCollectionArticles] = useState([]);
  const [collectionMembers, setCollectionMembers] = useState([]);
  const [collectionMessages, setCollectionMessages] = useState([]);
  const [collectionFeeds, setCollectionFeeds] = useState([]);
  const [showCreateCollection, setShowCreateCollection] = useState(false);
  const [newCollection, setNewCollection] = useState({ name: '', description: '', is_private: false });
  const [inviteEmail, setInviteEmail] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [selectedArticleForComment, setSelectedArticleForComment] = useState(null);
  const [newCollectionFeed, setNewCollectionFeed] = useState({ url: '', title: '' });

  // États pour les permissions (NOUVEAU)
  const [showPermissionsManager, setShowPermissionsManager] = useState(false);
  const [selectedFeedForPermissions, setSelectedFeedForPermissions] = useState(null);
  const [feedPermissions, setFeedPermissions] = useState([]);
  const [allCollectionMembers, setAllCollectionMembers] = useState([]);

// App.js - PARTIE 3: FONCTIONS D'AUTHENTIFICATION

// Fonctions d'authentification
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
    
  } catch (error) {
    setMessage('Erreur connexion : ' + (error.response?.data?.error || error.message));
  }
};

// Fonction OAuth2 Google corrigée
const handleGoogleResponse = async (response) => {
  try {
    console.log("Réponse Google reçue:", response);
    
    const payload = JSON.parse(atob(response.credential.split('.')[1]));
    console.log("Payload Google:", payload);
    
    const googleAuthData = {
      google_token: response.credential,
      email: payload.email,
      name: payload.name,
      google_id: payload.sub
    };

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

const initializeGoogleSignIn = () => {
  if (window.google && window.google.accounts) {
    try {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleResponse,
        auto_select: false,
        cancel_on_tap_outside: true
      });

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

React.useEffect(() => {
  const googleButton = document.getElementById("google-signin-button");
  
  if (!isLoggedIn) {
    if (googleButton) {
      googleButton.innerHTML = '';
    }
    
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
    if (googleButton) {
      googleButton.innerHTML = '';
      googleButton.style.display = 'none';
    }
  }
}, [isLoggedIn]);

const logout = () => {
  setIsLoggedIn(false);
  setCurrentUser(null);
  setCurrentUserId(null);
  setFeeds([]);
  setArticles([]);
  setCollections([]);
  setCurrentCollection(null);
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
  
  setTimeout(() => {
    const googleButton = document.getElementById("google-signin-button");
    if (googleButton) {
      googleButton.innerHTML = '';
    }
  }, 100);
};

// App.js - PARTIE 4: FONCTIONS DE GESTION DES FLUX RSS

// Gestion des flux RSS
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

// App.js - PARTIE 5: FONCTIONS DE GESTION DES ARTICLES

// Gestion des articles
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

const toggleRead = async (articleId, isRead) => {
  try {
    const response = await axios.patch(`http://localhost:8000/articles/${articleId}/read?read_status=${!isRead}`);
    setMessage(`Article ${!isRead ? 'marqué comme lu' : 'marqué comme non lu'}`);
    if (currentCollection) {
      loadCollectionArticles(currentCollection.id);
    } else {
      loadAllArticles(currentPage);
    }
  } catch (error) {
    setMessage('Erreur lors de la mise à jour du statut de lecture');
  }
};

const toggleFavorite = async (articleId, isFavorite) => {
  try {
    const url = `http://localhost:8000/articles/${articleId}/favorite?favorite_status=${!isFavorite}`;
    const response = await axios.patch(url);
    setMessage(`Article ${!isFavorite ? 'ajouté aux favoris' : 'retiré des favoris'}`);
    if (currentCollection) {
      loadCollectionArticles(currentCollection.id);
    } else {
      loadAllArticles(currentPage);
    }
  } catch (error) {
    setMessage('Erreur lors de la mise à jour des favoris');
  }
};

// App.js - PARTIE 6: FONCTIONS DE GESTION DES COLLECTIONS

// Fonctions pour les collections partagées
const loadCollections = async () => {
  if (!currentUserId) return;

  try {
    const response = await axios.get(`http://localhost:8000/users/${currentUserId}/collections`);
    setCollections(response.data.collections || []);
    setMessage(`${response.data.collections?.length || 0} collections trouvées`);
  } catch (error) {
    setMessage('Erreur lors du chargement des collections');
  }
};

const createCollection = async () => {
  if (!currentUserId || !newCollection.name.trim()) {
    setMessage('Erreur: Nom de collection requis');
    return;
  }

  try {
    const response = await axios.post(`http://localhost:8000/collections?owner_id=${currentUserId}`, newCollection);
    setMessage(`Collection "${newCollection.name}" créée avec succès !`);
    setNewCollection({ name: '', description: '', is_private: false });
    setShowCreateCollection(false);
    loadCollections();
  } catch (error) {
    setMessage('Erreur lors de la création de la collection: ' + (error.response?.data?.detail || error.message));
  }
};

const openCollection = async (collection) => {
  setCurrentCollection(collection);
  await loadCollectionArticles(collection.id);
  await loadCollectionMembers(collection.id);
  await loadCollectionMessages(collection.id);
  await loadCollectionFeeds(collection.id);
};

const loadCollectionFeeds = async (collectionId) => {
  if (!currentUserId) return;

  try {
    const response = await axios.get(`http://localhost:8000/collections/${collectionId}/feeds?user_id=${currentUserId}`);
    setCollectionFeeds(response.data.feeds || []);
  } catch (error) {
    setMessage('Erreur lors du chargement des flux de la collection');
  }
};

const syncCollectionFeeds = async (collectionId) => {
  if (!currentUserId) return;

  try {
    setMessage('Synchronisation de la collection en cours...');
    const response = await axios.post(`http://localhost:8000/collections/${collectionId}/fetch-all-articles?user_id=${currentUserId}`);
    setMessage(response.data.message);
    await loadCollectionArticles(collectionId);
  } catch (error) {
    setMessage('Erreur lors de la synchronisation de la collection: ' + (error.response?.data?.detail || error.message));
  }
};

const loadCollectionArticles = async (collectionId, page = 1) => {
  if (!currentUserId) return;

  try {
    const response = await axios.get(`http://localhost:8000/collections/${collectionId}/articles?user_id=${currentUserId}&page=${page}&per_page=20`);
    setCollectionArticles(response.data.articles || []);
    setPagination(response.data.pagination || {});
  } catch (error) {
    setMessage('Erreur lors du chargement des articles de la collection');
  }
};

const loadCollectionMembers = async (collectionId) => {
  if (!currentUserId) return;

  try {
    const response = await axios.get(`http://localhost:8000/collections/${collectionId}/members?user_id=${currentUserId}`);
    setCollectionMembers(response.data.members || []);
  } catch (error) {
    setMessage('Erreur lors du chargement des membres');
  }
};

const inviteToCollection = async (collectionId) => {
  if (!inviteEmail.trim()) {
    setMessage('Email requis pour l\'invitation');
    return;
  }

  try {
    await axios.post(`http://localhost:8000/collections/${collectionId}/invite?inviter_id=${currentUserId}`, {
      user_email: inviteEmail,
      permissions: 'write'
    });
    setMessage(`Invitation envoyée à ${inviteEmail}`);
    setInviteEmail('');
    loadCollectionMembers(collectionId);
  } catch (error) {
    setMessage('Erreur lors de l\'invitation: ' + (error.response?.data?.detail || error.message));
  }
};

const addFeedToCollection = async (collectionId) => {
  if (!newCollectionFeed.url.trim()) {
    setMessage('URL du flux requise');
    return;
  }

  try {
    await axios.post(`http://localhost:8000/collections/${collectionId}/feeds?user_id=${currentUserId}`, {
      feed_url: newCollectionFeed.url,
      feed_title: newCollectionFeed.title,
      feed_description: '',
      tags: ''
    });
    setMessage('Flux ajouté à la collection');
    setNewCollectionFeed({ url: '', title: '' });
    loadCollectionArticles(collectionId);
    loadCollectionFeeds(collectionId);
  } catch (error) {
    setMessage('Erreur lors de l\'ajout du flux: ' + (error.response?.data?.detail || error.message));
  }
};

const cleanCollectionDuplicates = async (collectionId) => {
  if (!currentUserId) return;

  try {
    setMessage('Nettoyage des doublons en cours...');
    const response = await axios.post(`http://localhost:8000/collections/${collectionId}/clean-duplicates?user_id=${currentUserId}`);
    setMessage(response.data.message);
    await loadCollectionArticles(collectionId);
  } catch (error) {
    setMessage('Erreur lors du nettoyage: ' + (error.response?.data?.detail || error.message));
  }
};

const closeCollection = () => {
  setCurrentCollection(null);
  setCollectionArticles([]);
  setCollectionMembers([]);
  setCollectionMessages([]);
  setCollectionFeeds([]);
  setSelectedArticleForComment(null);
};

// App.js - PARTIE 7: FONCTIONS DE GESTION DES PERMISSIONS

// Fonction pour charger les permissions d'un flux spécifique
const loadFeedPermissions = async (collectionId, feedId) => {
  if (!currentUserId) return;
  
  try {
    const response = await axios.get(
      `http://localhost:8000/collections/${collectionId}/feeds/${feedId}/permissions?requester_id=${currentUserId}`
    );
    setFeedPermissions(response.data.permissions || []);
  } catch (error) {
    setMessage('Erreur lors du chargement des permissions: ' + (error.response?.data?.detail || error.message));
  }
};

// Fonction pour modifier les permissions d'un utilisateur sur un flux
const updateFeedPermission = async (collectionId, feedId, userId, permissions) => {
  if (!currentUserId) return;
  
  try {
    await axios.post(
      `http://localhost:8000/collections/${collectionId}/feeds/${feedId}/permissions?granter_id=${currentUserId}`,
      {
        user_id: userId,
        can_read: permissions.can_read,
        can_modify: permissions.can_modify,
        can_delete: permissions.can_delete
      }
    );
    setMessage('Permissions mises à jour');
    loadFeedPermissions(collectionId, feedId);
  } catch (error) {
    setMessage('Erreur lors de la mise à jour: ' + (error.response?.data?.error || error.message));
  }
};

// Fonction pour supprimer un flux de la collection (avec vérification des permissions)
const removeFeedFromCollection = async (collectionId, feedId) => {
  if (!currentUserId) return;
  
  if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce flux de la collection ?')) {
    return;
  }

  try {
    await axios.delete(`http://localhost:8000/collections/${collectionId}/feeds/${feedId}?user_id=${currentUserId}`);
    setMessage('Flux supprimé de la collection');
    await loadCollectionFeeds(collectionId);
    await loadCollectionArticles(collectionId);
  } catch (error) {
    setMessage('Erreur lors de la suppression: ' + (error.response?.data?.detail || error.message));
  }
};

// App.js - PARTIE 8: FONCTIONS DE FILTRAGE

const applyCollectionFilters = async (collectionId, customFilters = null, page = 1) => {
  if (!currentUserId) return;

  const activeFilters = customFilters || filters;
  
  try {
    const isEmpty = activeFilters.read === null && activeFilters.favorite === null && 
                   !activeFilters.search && activeFilters.days === null && 
                   activeFilters.feed_id === null && !activeFilters.tags;

    if (isEmpty) {
      loadCollectionArticles(collectionId, page);
    } else {
      let url = `http://localhost:8000/collections/${collectionId}/articles/filter?user_id=${currentUserId}&page=${page}&per_page=20`;
      
      if (activeFilters.read !== null) {
        url += `&read=${activeFilters.read}`;
      }
      if (activeFilters.favorite !== null) {
        url += `&favorite=${activeFilters.favorite}`;
      }
      if (activeFilters.search) {
        url += `&search=${encodeURIComponent(activeFilters.search)}`;
      }
      if (activeFilters.days !== null) {
        url += `&days=${activeFilters.days}`;
      }
      if (activeFilters.feed_id !== null) {
        url += `&feed_id=${activeFilters.feed_id}`;
      }
      if (activeFilters.tags) {
        url += `&tags=${encodeURIComponent(activeFilters.tags)}`;
      }
      
      const response = await axios.get(url);
      setCollectionArticles(response.data.articles || []);
      setPagination(response.data.pagination || {});
      setMessage(`Filtrage appliqué - ${response.data.pagination?.total_articles || 0} articles trouvés`);
    }
  } catch (error) {
    setMessage('Erreur lors du filtrage: ' + (error.response?.data?.detail || error.message));
  }
};

// App.js - PARTIE 9: FONCTIONS DE MESSAGERIE

// MESSAGERIE CORRIGÉE - CORRECTION PRINCIPALE
const loadCollectionMessages = async (collectionId, articleId = null) => {
  if (!currentUserId) return;

  try {
    let url = `http://localhost:8000/collections/${collectionId}/messages?user_id=${currentUserId}`;
    if (articleId) {
      url += `&article_id=${articleId}`;
    }
    
    console.log('DEBUG Frontend: Chargement messages depuis:', url);
    
    const response = await axios.get(url);
    setCollectionMessages(response.data.messages || []);
    
    console.log('DEBUG Frontend: Messages chargés:', response.data.messages?.length || 0);
  } catch (error) {
    console.error('DEBUG Frontend: Erreur chargement messages:', error);
    
    let errorMessage = 'Erreur lors du chargement des messages';
    if (error.response && error.response.data && error.response.data.detail) {
      errorMessage += ': ' + error.response.data.detail;
    }
    
    setMessage(errorMessage);
  }
};

const sendMessage = async (collectionId, articleId = null) => {
  if (!newMessage.trim()) {
    setMessage('Veuillez saisir un message');
    return;
  }

  if (!currentUserId) {
    setMessage('Erreur: Utilisateur non connecté');
    return;
  }

  try {
    const requestData = {
      message: newMessage.trim(),
      article_id: articleId
    };

    console.log('DEBUG Frontend: Envoi message:', requestData);

    const response = await axios.post(
      `http://localhost:8000/collections/${collectionId}/messages?user_id=${currentUserId}`, 
      requestData,
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('DEBUG Frontend: Réponse reçue:', response.data);
    
    setNewMessage('');
    await loadCollectionMessages(collectionId, articleId);
    
    if (articleId) {
      setMessage('Commentaire ajouté');
    } else {
      setMessage('Message envoyé');
    }
  } catch (error) {
    console.error('DEBUG Frontend: Erreur complète:', error);
    console.error('DEBUG Frontend: Réponse serveur:', error.response);
    
    let errorMessage = 'Erreur lors de l\'envoi du message';
    
    if (error.response) {
      // Vérifier d'abord le status code
      if (error.response.status) {
        errorMessage += ` (${error.response.status})`;
      }
      
      // Puis essayer de récupérer le message d'erreur
      if (error.response.data) {
        if (typeof error.response.data === 'string') {
          errorMessage += ': ' + error.response.data;
        } else if (error.response.data.detail) {
          errorMessage += ': ' + error.response.data.detail;
        } else if (error.response.data.message) {
          errorMessage += ': ' + error.response.data.message;
        } else if (error.response.data.error) {
          errorMessage += ': ' + error.response.data.error;
        } else {
          // Si c'est un objet complexe, le sérialiser proprement
          try {
            errorMessage += ': ' + JSON.stringify(error.response.data);
          } catch (jsonError) {
            errorMessage += ': Erreur de sérialisation de la réponse';
          }
        }
      }
    } else if (error.request) {
      errorMessage += ': Pas de réponse du serveur';
    } else {
      errorMessage += ': ' + (error.message || 'Erreur inconnue');
    }
    
    setMessage(errorMessage);
  }
};

// App.js - PARTIE 10: FONCTIONS UTILITAIRES

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

// App.js - PARTIE 11: INTERFACE D'AUTHENTIFICATION

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

// App.js - PARTIE 12: INTERFACE DE GESTION DES PERMISSIONS

      <div>
        <div style={{textAlign: 'right', padding: '10px', borderBottom: '1px solid #ddd', marginBottom: '20px'}}>
          Connecté : <strong>{currentUser}</strong> 
          <button onClick={logout} style={{marginLeft: '10px', padding: '5px 10px'}}>Déconnexion</button>
        </div>

        {/* Gestionnaire de permissions par flux */}
        {showPermissionsManager && selectedFeedForPermissions && (
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'white',
            padding: '30px',
            border: '2px solid #007bff',
            borderRadius: '10px',
            maxWidth: '800px',
            maxHeight: '80vh',
            overflowY: 'auto',
            zIndex: 1000,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
          }}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
              <h3>Permissions pour: {selectedFeedForPermissions.title}</h3>
              <button 
                onClick={() => {
                  setShowPermissionsManager(false);
                  setSelectedFeedForPermissions(null);
                  setFeedPermissions([]);
                }}
                style={{
                  padding: '5px 10px',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px'
                }}
              >
                Fermer
              </button>
            </div>

            {/* Liste des membres avec leurs permissions */}
            <div>
              <h4>Permissions des membres</h4>
              {collectionMembers.map(member => {
                const userPermission = feedPermissions.find(p => p.user_id === member.user_id);
                const defaultPermissions = member.permissions === 'admin' 
                  ? { can_read: true, can_modify: true, can_delete: true }
                  : member.permissions === 'write'
                  ? { can_read: true, can_modify: true, can_delete: false }
                  : { can_read: true, can_modify: false, can_delete: false };
                
                const currentPermissions = userPermission || defaultPermissions;
                
                return (
                  <div key={member.user_id} style={{
                    border: '1px solid #ddd',
                    padding: '15px',
                    margin: '10px 0',
                    borderRadius: '5px',
                    backgroundColor: '#f8f9fa'
                  }}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px'}}>
                      <div>
                        <strong>{member.username}</strong>
                        <span style={{
                          marginLeft: '10px',
                          padding: '2px 8px',
                          backgroundColor: member.permissions === 'admin' ? '#dc3545' : '#007bff',
                          color: 'white',
                          borderRadius: '12px',
                          fontSize: '12px'
                        }}>
                          {member.permissions}
                        </span>
                      </div>
                      {userPermission && (
                        <span style={{fontSize: '12px', color: '#666'}}>
                          Permissions personnalisées
                        </span>
                      )}
                    </div>

                    <div style={{display: 'flex', gap: '20px', alignItems: 'center'}}>
                      <label style={{display: 'flex', alignItems: 'center'}}>
                        <input
                          type="checkbox"
                          checked={currentPermissions.can_read}
                          onChange={(e) => updateFeedPermission(
                            currentCollection.id,
                            selectedFeedForPermissions.id,
                            member.user_id,
                            { ...currentPermissions, can_read: e.target.checked }
                          )}
                          disabled={member.permissions === 'admin'} // Les admins gardent toutes les permissions
                        />
                        <span style={{marginLeft: '5px'}}>Lecture</span>
                      </label>

                      <label style={{display: 'flex', alignItems: 'center'}}>
                        <input
                          type="checkbox"
                          checked={currentPermissions.can_modify}
                          onChange={(e) => updateFeedPermission(
                            currentCollection.id,
                            selectedFeedForPermissions.id,
                            member.user_id,
                            { ...currentPermissions, can_modify: e.target.checked }
                          )}
                          disabled={member.permissions === 'admin'}
                        />
                        <span style={{marginLeft: '5px'}}>Modification</span>
                      </label>

                      <label style={{display: 'flex', alignItems: 'center'}}>
                        <input
                          type="checkbox"
                          checked={currentPermissions.can_delete}
                          onChange={(e) => updateFeedPermission(
                            currentCollection.id,
                            selectedFeedForPermissions.id,
                            member.user_id,
                            { ...currentPermissions, can_delete: e.target.checked }
                          )}
                          disabled={member.permissions === 'admin'}
                        />
                        <span style={{marginLeft: '5px'}}>Suppression</span>
                      </label>
                    </div>

                    {member.permissions === 'admin' && (
                      <div style={{fontSize: '12px', color: '#666', marginTop: '5px'}}>
                        Les administrateurs ont automatiquement toutes les permissions
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{marginTop: '20px', padding: '15px', backgroundColor: '#e3f2fd', borderRadius: '5px'}}>
              <h5>Légende des permissions:</h5>
              <ul style={{fontSize: '14px', marginBottom: '0'}}>
                <li><strong>Lecture:</strong> Voir les articles de ce flux</li>
                <li><strong>Modification:</strong> Marquer les articles comme lus/favoris</li>
                <li><strong>Suppression:</strong> Supprimer ce flux de la collection</li>
              </ul>
            </div>
          </div>
        )}

        {/* Overlay pour fermer la modal */}
        {showPermissionsManager && (
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              zIndex: 999
            }}
            onClick={() => {
              setShowPermissionsManager(false);
              setSelectedFeedForPermissions(null);
              setFeedPermissions([]);
            }}
          />
        )}

// App.js - PARTIE 13: INTERFACE DES COLLECTIONS

        {/* Vue Collection */}
        {currentCollection ? (
          <div style={{padding: '20px', border: '2px solid #28a745', borderRadius: '10px'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
              <h2 style={{color: '#28a745'}}>Collection: {currentCollection.name}</h2>
              <button onClick={closeCollection} style={{padding: '10px', backgroundColor: '#dc3545', color: 'white', border: 'none'}}>
                Fermer la collection
              </button>
            </div>

            <p>{currentCollection.description}</p>
            
            {/* Boutons de gestion */}
            <div style={{marginBottom: '20px', display: 'flex', gap: '10px'}}>
              <button 
                onClick={() => loadCollectionFeeds(currentCollection.id)}
                style={{padding: '10px', backgroundColor: '#007bff', color: 'white', border: 'none'}}
              >
                Voir les flux ({collectionFeeds.length})
              </button>
              <button 
                onClick={() => syncCollectionFeeds(currentCollection.id)}
                style={{padding: '10px', backgroundColor: '#28a745', color: 'white', border: 'none'}}
              >
                Synchroniser tous les flux
              </button>
              <button 
                onClick={() => loadCollectionArticles(currentCollection.id)}
                style={{padding: '10px', backgroundColor: '#17a2b8', color: 'white', border: 'none'}}
              >
                Charger les articles
              </button>
              <button 
                onClick={() => cleanCollectionDuplicates(currentCollection.id)}
                style={{padding: '10px', backgroundColor: '#ffc107', color: 'black', border: 'none'}}
              >
                Nettoyer les doublons
              </button>
            </div>

            {/* Liste des flux de la collection AVEC GESTION DES PERMISSIONS */}
            {collectionFeeds.length > 0 && (
              <div style={{marginBottom: '20px', padding: '15px', backgroundColor: '#f8f9fa', border: '1px solid #ddd'}}>
                <h4>Flux de la collection ({collectionFeeds.length})</h4>
                {collectionFeeds.map(feed => (
                  <div key={feed.id} style={{border: '1px solid #ddd', padding: '15px', margin: '5px 0', backgroundColor: 'white'}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'start'}}>
                      <div style={{flex: 1}}>
                        <h5 style={{marginTop: '0', marginBottom: '10px'}}>{feed.title}</h5>
                        <p style={{fontSize: '12px', color: '#666', marginBottom: '5px'}}>{feed.url}</p>
                        <p style={{fontSize: '12px'}}>Ajouté par: {feed.added_by} le {formatDate(feed.added_at)}</p>
                        {feed.last_updated && (
                          <p style={{fontSize: '12px', color: '#28a745', marginBottom: '0'}}>
                            Dernière sync: {formatDate(feed.last_updated)}
                          </p>
                        )}
                      </div>
                      
                      {/* Boutons de gestion avec permissions */}
                      <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
                        {/* Affichage des permissions utilisateur */}
                        <div style={{fontSize: '11px', color: '#666', textAlign: 'right'}}>
                          {feed.permissions.can_read && <span style={{color: '#28a745'}}>✓ Lecture</span>}<br/>
                          {feed.permissions.can_modify && <span style={{color: '#007bff'}}>✓ Modif</span>}<br/>
                          {feed.permissions.can_delete && <span style={{color: '#dc3545'}}>✓ Suppression</span>}
                        </div>
                        
                        {/* Bouton gérer permissions (seulement pour les admins) */}
                        {currentCollection && collectionMembers.find(m => m.user_id === currentUserId && m.permissions === 'admin') && (
                          <button
                            onClick={async () => {
                              setSelectedFeedForPermissions(feed);
                              setShowPermissionsManager(true);
                              await loadFeedPermissions(currentCollection.id, feed.id);
                            }}
                            style={{
                              padding: '8px 12px',
                              backgroundColor: '#6c757d',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '12px'
                            }}
                          >
                            Gérer permissions
                          </button>
                        )}

                        {/* Bouton supprimer flux (si autorisé) */}
                        {feed.permissions.can_delete && (
                          <button
                            onClick={() => removeFeedFromCollection(currentCollection.id, feed.id)}
                            style={{
                              padding: '8px 12px',
                              backgroundColor: '#dc3545',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '12px'
                            }}
                          >
                            Supprimer
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {/* Ajouter un flux à la collection */}
            <div style={{marginBottom: '20px', padding: '15px', backgroundColor: '#f8f9fa', border: '1px solid #ddd'}}>
              <h4>Ajouter un flux à la collection</h4>
              <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
                <input 
                  placeholder="URL du flux RSS" 
                  value={newCollectionFeed.url}
                  onChange={(e) => setNewCollectionFeed({...newCollectionFeed, url: e.target.value})}
                  style={{flex: 1, padding: '8px'}}
                />
                <input 
                  placeholder="Titre (optionnel)" 
                  value={newCollectionFeed.title}
                  onChange={(e) => setNewCollectionFeed({...newCollectionFeed, title: e.target.value})}
                  style={{flex: 1, padding: '8px'}}
                />
                <button 
                  onClick={() => addFeedToCollection(currentCollection.id)}
                  style={{padding: '8px 15px', backgroundColor: '#28a745', color: 'white', border: 'none'}}
                >
                  Ajouter
                </button>
              </div>
            </div>

            {/* Inviter des membres */}
            <div style={{marginBottom: '20px', padding: '15px', backgroundColor: '#e3f2fd', border: '1px solid #bbdefb'}}>
              <h4>Inviter un membre</h4>
              <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
                <input 
                  placeholder="Email de l'utilisateur" 
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  style={{flex: 1, padding: '8px'}}
                />
                <button 
                  onClick={() => inviteToCollection(currentCollection.id)}
                  style={{padding: '8px 15px', backgroundColor: '#17a2b8', color: 'white', border: 'none'}}
                >
                  Inviter
                </button>
              </div>
            </div>

            {/* Membres de la collection */}
            <div style={{marginBottom: '20px'}}>
              <h4>Membres ({collectionMembers.length})</h4>
              <div style={{display: 'grid', gap: '5px'}}>
                {collectionMembers.map(member => (
                  <div key={member.user_id} style={{
                    padding: '10px', 
                    backgroundColor: '#f8f9fa', 
                    borderRadius: '5px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span>{member.username} ({member.email})</span>
                    <span style={{
                      padding: '2px 8px', 
                      backgroundColor: member.permissions === 'admin' ? '#dc3545' : member.permissions === 'write' ? '#28a745' : '#6c757d',
                      color: 'white', 
                      borderRadius: '12px', 
                      fontSize: '12px'
                    }}>
                      {member.permissions}
                    </span>
                  </div>
                ))}
              </div>
            </div>

// App.js - PARTIE 14: INTERFACE DES ARTICLES DES COLLECTIONS

            {/* Filtres pour les articles de collection - AVEC FILTRE PAR FLUX */}
            <div style={{marginBottom: '20px', padding: '15px', backgroundColor: '#f9f9f9', border: '1px solid #ddd', borderRadius: '8px'}}>
              <h5>Filtres des articles</h5>
              
              <div style={{
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                gap: '10px', 
                marginBottom: '15px'
              }}>
                {/* Recherche */}
                <input
                  type="text"
                  placeholder="Rechercher..."
                  value={filters.search}
                  onChange={(e) => {
                    const newFilters = {...filters, search: e.target.value};
                    setFilters(newFilters);
                    setTimeout(() => applyCollectionFilters(currentCollection.id, newFilters, 1), 500);
                  }}
                  style={{padding: '8px', borderRadius: '4px', border: '1px solid #ddd'}}
                />

                {/* Statut de lecture */}
                <select
                  value={filters.read === null ? 'all' : filters.read.toString()}
                  onChange={(e) => {
                    const newValue = e.target.value === 'all' ? null : e.target.value === 'true';
                    const newFilters = {...filters, read: newValue};
                    setFilters(newFilters);
                    applyCollectionFilters(currentCollection.id, newFilters, 1);
                  }}
                  style={{padding: '8px', borderRadius: '4px', border: '1px solid #ddd'}}
                >
                  <option value="all">Tous les articles</option>
                  <option value="false">Non lus</option>
                  <option value="true">Lus</option>
                </select>

                {/* Favoris */}
                <select
                  value={filters.favorite === null ? 'all' : filters.favorite.toString()}
                  onChange={(e) => {
                    const newValue = e.target.value === 'all' ? null : e.target.value === 'true';
                    const newFilters = {...filters, favorite: newValue};
                    setFilters(newFilters);
                    applyCollectionFilters(currentCollection.id, newFilters, 1);
                  }}
                  style={{padding: '8px', borderRadius: '4px', border: '1px solid #ddd'}}
                >
                  <option value="all">Tous</option>
                  <option value="true">Favoris</option>
                  <option value="false">Non favoris</option>
                </select>

                {/* FILTRE PAR FLUX */}
                <select
                  value={filters.feed_id === null ? 'all' : filters.feed_id.toString()}
                  onChange={(e) => {
                    const newValue = e.target.value === 'all' ? null : parseInt(e.target.value);
                    const newFilters = {...filters, feed_id: newValue};
                    setFilters(newFilters);
                    applyCollectionFilters(currentCollection.id, newFilters, 1);
                  }}
                  style={{padding: '8px', borderRadius: '4px', border: '1px solid #ddd'}}
                >
                  <option value="all">Tous les flux</option>
                  {collectionFeeds.map(feed => (
                    <option key={feed.id} value={feed.id}>{feed.title}</option>
                  ))}
                </select>

                {/* FILTRE PAR TAGS */}
                <input
                  type="text"
                  placeholder="Filtrer par tags..."
                  value={filters.tags}
                  onChange={(e) => {
                    const newFilters = {...filters, tags: e.target.value};
                    setFilters(newFilters);
                    setTimeout(() => applyCollectionFilters(currentCollection.id, newFilters, 1), 500);
                  }}
                  style={{padding: '8px', borderRadius: '4px', border: '1px solid #ddd'}}
                />

                {/* Période */}
                <select
                  value={filters.days === null ? 'all' : filters.days.toString()}
                  onChange={(e) => {
                    const newValue = e.target.value === 'all' ? null : parseInt(e.target.value);
                    const newFilters = {...filters, days: newValue};
                    setFilters(newFilters);
                    applyCollectionFilters(currentCollection.id, newFilters, 1);
                  }}
                  style={{padding: '8px', borderRadius: '4px', border: '1px solid #ddd'}}
                >
                  <option value="all">Toutes les dates</option>
                  <option value="1">Aujourd'hui</option>
                  <option value="7">7 derniers jours</option>
                  <option value="30">30 derniers jours</option>
                </select>

                {/* Bouton reset filtres */}
                <button 
                  onClick={() => {
                    const emptyFilters = { read: null, favorite: null, search: '', days: null, feed_id: null, tags: '' };
                    setFilters(emptyFilters);
                    applyCollectionFilters(currentCollection.id, emptyFilters, 1);
                  }}
                  style={{
                    padding: '8px 12px', 
                    backgroundColor: '#dc3545', 
                    color: 'white', 
                    border: 'none', 
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Effacer filtres
                </button>
              </div>
            </div>

            {/* Articles de la collection */}
            <div>
              <h4>Articles de la collection ({collectionArticles.length})</h4>
              {collectionArticles.length === 0 ? (
                <div style={{padding: '20px', textAlign: 'center', backgroundColor: '#f8f9fa', border: '2px dashed #ccc'}}>
                  <p>Aucun article dans cette collection. Ajoutez des flux RSS pour voir des articles.</p>
                </div>
              ) : (

                collectionArticles.map(article => (
                  <div key={article.id} style={{border: '1px solid #ddd', padding: '15px', margin: '10px 0', backgroundColor: 'white', borderRadius: '5px'}}>
                    <div style={{fontSize: '14px', color: '#007bff', marginBottom: '10px', fontWeight: 'bold'}}>
                      {article.feed ? article.feed.title : 'Source inconnue'}
                    </div>
                    
                    <h5 style={{marginBottom: '10px', lineHeight: '1.4'}}>{article.title}</h5>
                    
                    {article.published && (
                      <p style={{fontSize: '12px', color: '#888', marginBottom: '12px'}}>
                        Publié le : {formatDate(article.published)}
                      </p>
                    )}
                    
                    {article.summary && (
                      <p style={{marginBottom: '15px', lineHeight: '1.6', color: '#333', fontSize: '14px'}}>
                        {article.summary}
                      </p>
                    )}
                    
                    <a 
                      href={article.link} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      style={{color: '#007bff', textDecoration: 'none', display: 'inline-block', marginBottom: '15px'}}
                    >
                      Lire l'article complet
                    </a>
                    
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                      <div style={{display: 'flex', gap: '10px'}}>
                        {/* Boutons seulement si l'utilisateur a les permissions de modification */}
                        {article.user_permissions?.can_modify && (
                          <>
                            <button 
                              onClick={() => toggleRead(article.id, article.is_read)}
                              style={{
                                padding: '8px 15px',
                                backgroundColor: article.is_read ? '#dc3545' : '#28a745',
                                color: 'white',
                                border: 'none',
                                borderRadius: '5px'
                              }}
                            >
                              {article.is_read ? 'Marquer non lu' : 'Marquer lu'}
                            </button>
                            <button
                              onClick={() => toggleFavorite(article.id, article.is_favorite)}
                              style={{
                                padding: '8px 15px',
                                backgroundColor: article.is_favorite ? '#ffc107' : '#6c757d',
                                color: 'white',
                                border: 'none',
                                borderRadius: '5px'
                              }}
                            >
                              {article.is_favorite ? 'Retirer favori' : 'Ajouter favori'}
                            </button>
                          </>
                        )}
                        
                        {/* Affichage du statut si pas de permissions de modification */}
                        {!article.user_permissions?.can_modify && (
                          <div style={{fontSize: '12px', color: '#666', padding: '8px'}}>
                            {article.is_read ? '✓ Lu' : '○ Non lu'} | 
                            {article.is_favorite ? ' ⭐ Favori' : ' ☆ Non favori'}
                          </div>
                        )}
                      </div>
                      
                      <button
                        onClick={() => {
                          setSelectedArticleForComment(selectedArticleForComment === article.id ? null : article.id);
                          if (selectedArticleForComment !== article.id) {
                            loadCollectionMessages(currentCollection.id, article.id);
                          }
                        }}
                        style={{
                          padding: '8px 15px',
                          backgroundColor: '#17a2b8',
                          color: 'white',
                          border: 'none',
                          borderRadius: '5px'
                        }}
                      >
                        {selectedArticleForComment === article.id ? 'Masquer commentaires' : 'Commentaires'}
                      </button>
                    </div>

                    {/* Section commentaires pour cet article */}
                    {selectedArticleForComment === article.id && (
                      <div style={{marginTop: '15px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '5px'}}>
                        <h6>Commentaires sur cet article</h6>
                        
                        {/* Messages existants */}
                        <div style={{maxHeight: '200px', overflowY: 'auto', marginBottom: '10px'}}>
                          {collectionMessages.filter(msg => msg.article_id === article.id).map(msg => (
                            <div key={msg.id} style={{
                              padding: '8px', 
                              marginBottom: '8px', 
                              backgroundColor: 'white', 
                              borderRadius: '5px',
                              borderLeft: '3px solid #007bff'
                            }}>
                              <strong>{msg.username}:</strong> {msg.message}
                              <div style={{fontSize: '11px', color: '#666', marginTop: '5px'}}>
                                {formatDate(msg.created_at)}
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        {/* Nouveau commentaire */}
                        <div style={{display: 'flex', gap: '10px'}}>
                          <input 
                            placeholder="Ajouter un commentaire..." 
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            style={{flex: 1, padding: '8px'}}
                            onKeyPress={(e) => {
                              if (e.key === 'Enter') {
                                sendMessage(currentCollection.id, article.id);
                              }
                            }}
                          />
                          <button 
                            onClick={() => sendMessage(currentCollection.id, article.id)}
                            style={{padding: '8px 15px', backgroundColor: '#007bff', color: 'white', border: 'none'}}
                          >
                            Envoyer
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

// App.js - PARTIE 15: INTERFACE DE MESSAGERIE ET COLLECTIONS

            {/* Messagerie générale de la collection */}
            <div style={{marginTop: '30px', borderTop: '2px solid #28a745', paddingTop: '20px'}}>
              <h4>Discussion générale</h4>
              
              <div style={{
                maxHeight: '300px', 
                overflowY: 'auto', 
                padding: '10px', 
                backgroundColor: '#f8f9fa', 
                border: '1px solid #ddd', 
                marginBottom: '10px'
              }}>
                {collectionMessages.filter(msg => !msg.article_id).map(msg => (
                  <div key={msg.id} style={{
                    padding: '10px', 
                    marginBottom: '10px', 
                    backgroundColor: 'white', 
                    borderRadius: '5px'
                  }}>
                    <strong>{msg.username}:</strong> {msg.message}
                    <div style={{fontSize: '11px', color: '#666', marginTop: '5px'}}>
                      {formatDate(msg.created_at)}
                    </div>
                  </div>
                ))}
              </div>
              
              <div style={{display: 'flex', gap: '10px'}}>
                <input 
                  placeholder="Message pour la collection..." 
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  style={{flex: 1, padding: '10px'}}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      sendMessage(currentCollection.id);
                    }
                  }}
                />
                <button 
                  onClick={() => sendMessage(currentCollection.id)}
                  style={{padding: '10px 20px', backgroundColor: '#28a745', color: 'white', border: 'none'}}
                >
                  Envoyer
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Section Flux individuels */}
            <div style={{marginBottom: '30px'}}>
              <h2>Gestion des flux RSS personnels</h2>
              <div style={{marginBottom: '20px'}}>
                <button onClick={loadFeeds} style={{padding: '10px', marginRight: '10px'}}>Charger mes flux</button>
                <button 
                  onClick={syncAllFeeds}
                  style={{padding: '10px', backgroundColor: '#28a745', color: 'white', border: 'none', marginRight: '10px'}}
                >
                  Synchroniser mes flux
                </button>
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
                    placeholder="Tags (séparés par des virgules)" 
                    value={newFeed.tags}
                    onChange={(e) => setNewFeed({...newFeed, tags: e.target.value})}
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

              {feeds.length > 0 && (
                <div>
                  <h3>Mes flux RSS ({feeds.length})</h3>
                  {feeds.map(feed => (
                    <div key={feed.id} style={{border: '1px solid #ddd', padding: '15px', margin: '10px 0', backgroundColor: '#f8f9fa'}}>
                      <h4 style={{marginTop: '0', marginBottom: '10px'}}>{feed.title}</h4>
                      <p style={{fontSize: '14px', color: '#666', marginBottom: '5px'}}>{feed.url}</p>
                      {feed.description && <p style={{fontSize: '14px', marginBottom: '10px'}}>{feed.description}</p>}
                      {feed.tags && (
                        <div style={{marginBottom: '10px'}}>
                          {feed.tags.split(',').map((tag, index) => (
                            <span key={index} style={{
                              display: 'inline-block',
                              backgroundColor: '#007bff',
                              color: 'white',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              marginRight: '6px'
                            }}>
                              {tag.trim()}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

// App.js - PARTIE 16: INTERFACE PRINCIPALE ET COLLECTIONS

            {/* Section Collections Partagées */}
            <div style={{borderTop: '3px solid #28a745', paddingTop: '20px', marginTop: '30px'}}>
              <h2 style={{color: '#28a745'}}>Collections Partagées</h2>
              
              <div style={{marginBottom: '20px'}}>
                <button 
                  onClick={loadCollections} 
                  style={{backgroundColor: '#28a745', color: 'white', padding: '10px 15px', border: 'none', marginRight: '10px'}}
                >
                  Mes Collections
                </button>
                <button 
                  onClick={() => setShowCreateCollection(!showCreateCollection)}
                  style={{backgroundColor: '#17a2b8', color: 'white', padding: '10px 15px', border: 'none'}}
                >
                  Nouvelle Collection
                </button>
              </div>

              {/* Formulaire création collection */}
              {showCreateCollection && (
                <div style={{padding: '20px', backgroundColor: '#f8f9fa', border: '1px solid #ddd', marginBottom: '20px'}}>
                  <h3>Créer une nouvelle collection</h3>
                  <div style={{display: 'grid', gap: '10px'}}>
                    <input 
                      placeholder="Nom de la collection" 
                      value={newCollection.name}
                      onChange={(e) => setNewCollection({...newCollection, name: e.target.value})}
                      style={{padding: '10px'}}
                    />
                    <textarea 
                      placeholder="Description (optionnel)" 
                      value={newCollection.description}
                      onChange={(e) => setNewCollection({...newCollection, description: e.target.value})}
                      style={{padding: '10px', resize: 'vertical'}}
                    />
                    <label style={{display: 'flex', alignItems: 'center'}}>
                      <input 
                        type="checkbox"
                        checked={newCollection.is_private}
                        onChange={(e) => setNewCollection({...newCollection, is_private: e.target.checked})}
                        style={{marginRight: '8px'}}
                      />
                      Collection privée
                    </label>
                    <div style={{display: 'flex', gap: '10px'}}>
                      <button 
                        onClick={createCollection}
                        style={{padding: '10px', backgroundColor: '#28a745', color: 'white', border: 'none', flex: 1}}
                      >
                        Créer la Collection
                      </button>
                      <button 
                        onClick={() => setShowCreateCollection(false)}
                        style={{padding: '10px', backgroundColor: '#6c757d', color: 'white', border: 'none'}}
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Liste des collections */}
              {collections.length > 0 ? (
                <div>
                  <h3>Mes Collections ({collections.length})</h3>
                  <div style={{display: 'grid', gap: '15px'}}>
                    {collections.map(collection => (
                      <div key={collection.id} style={{
                        border: '1px solid #28a745', 
                        padding: '20px', 
                        borderRadius: '8px', 
                        backgroundColor: '#f8fff8',
                        cursor: 'pointer',
                        transition: 'transform 0.2s ease'
                      }}
                      onMouseOver={(e) => e.target.style.transform = 'scale(1.02)'}
                      onMouseOut={(e) => e.target.style.transform = 'scale(1)'}
                      onClick={() => openCollection(collection)}
                      >
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                          <h4 style={{color: '#28a745', marginBottom: '10px'}}>{collection.name}</h4>
                          <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
                            <span style={{
                              padding: '4px 8px', 
                              backgroundColor: collection.is_owner ? '#dc3545' : '#007bff',
                              color: 'white', 
                              borderRadius: '12px', 
                              fontSize: '12px'
                            }}>
                              {collection.is_owner ? 'Propriétaire' : collection.user_permissions}
                            </span>
                            <span style={{fontSize: '14px', color: '#666'}}>
                              {collection.members_count} membre{collection.members_count > 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                        
                        {collection.description && (
                          <p style={{color: '#666', marginBottom: '10px'}}>{collection.description}</p>
                        )}
                        
                        <div style={{fontSize: '12px', color: '#666'}}>
                          Créée par {collection.owner_username} le {formatDate(collection.created_at)}
                          {collection.is_private && (
                            <span style={{marginLeft: '10px', color: '#dc3545', fontWeight: 'bold'}}>🔒 Privée</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{padding: '40px', textAlign: 'center', backgroundColor: '#f8f9fa', border: '2px dashed #ccc'}}>
                  <h4>Aucune collection trouvée</h4>
                  <p>Créez votre première collection ou demandez à quelqu'un de vous inviter.</p>
                </div>
              )}
            </div>

// App.js - PARTIE 17: INTERFACE DES ARTICLES PERSONNELS ET FERMETURE

            {/* Section Articles personnels */}
            <div style={{borderTop: '3px solid #007bff', paddingTop: '20px', marginTop: '30px'}}>
              <h2 style={{color: '#007bff'}}>Mes Articles</h2>
              
              <div style={{marginBottom: '20px'}}>
                <button 
                  onClick={() => loadAllArticles(1)} 
                  style={{backgroundColor: '#007bff', color: 'white', padding: '15px', fontSize: '16px', border: 'none'}}
                >
                  Charger mes articles
                </button>
              </div>

              {articles.length === 0 ? (
                <div style={{padding: '40px', textAlign: 'center', backgroundColor: '#f8f9fa', border: '2px dashed #ccc'}}>
                  <h3>Aucun article trouvé</h3>
                  <p>Ajoutez des flux RSS et synchronisez-les pour voir vos articles.</p>
                </div>
              ) : (
                <div>
                  <h3 style={{color: '#28a745', marginBottom: '20px'}}>✓ {articles.length} articles affichés</h3>
                  {articles.map(article => (
                    <div key={article.id} style={{border: '1px solid #ddd', padding: '20px', margin: '15px 0', backgroundColor: 'white', borderRadius: '5px'}}>
                      <div style={{fontSize: '14px', color: '#007bff', marginBottom: '10px', fontWeight: 'bold'}}>
                        {article.feed ? article.feed.title : 'Source inconnue'}
                      </div>
                      
                      <h4 style={{marginBottom: '10px', lineHeight: '1.4', marginTop: '5px', fontSize: '18px', color: '#333'}}>{article.title}</h4>
                      
                      {article.published ? (
                        <p style={{fontSize: '12px', color: '#888', marginBottom: '12px'}}>
                          Publié le : {formatDate(article.published)}
                        </p>
                      ) : null}
                      
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
                          Aucun résumé disponible pour cet article.
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
                          borderRadius: '4px'
                        }}
                      >
                        Lire l'article complet
                      </a>
                      
                      <div style={{display: 'flex', justifyContent: 'center', gap: '15px'}}>
                        <button 
                          onClick={() => toggleRead(article.id, article.is_read)}
                          style={{
                            padding: '10px 20px',
                            backgroundColor: article.is_read ? '#dc3545' : '#28a745',
                            color: 'white',
                            border: 'none',
                            borderRadius: '5px'
                          }}
                        >
                          {article.is_read ? 'Marquer non lu' : 'Marquer lu'}
                        </button>
                        <button
                          onClick={() => toggleFavorite(article.id, article.is_favorite)}
                          style={{
                            padding: '10px 20px',
                            backgroundColor: article.is_favorite ? '#ffc107' : '#6c757d',
                            color: 'white',
                            border: 'none',
                            borderRadius: '5px'
                          }}
                        >
                          {article.is_favorite ? 'Retirer favori' : 'Ajouter favori'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    )}
  </div>
);

}

export default App;