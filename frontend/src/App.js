import React, { useState } from 'react';
import axios from 'axios';
import { api } from './api';
import './App.css';

const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || "878235537833-s6enkhp3r37kjjmaqbiiepia0sv5gq1i.apps.googleusercontent.com";

function App() {
  // États principaux
  const [message, setMessage] = useState('');
  const [feeds, setFeeds] = useState([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};
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
  const [invitePermissions, setInvitePermissions] = useState('write');

  // États pour l'édition de flux
  const [editingFeed, setEditingFeed] = useState(null);
  const [editFeedData, setEditFeedData] = useState({
    title: '',
    url: '',
    description: '',
    tags: '',
    update_frequency: 60
  });

  // États pour import/export
  const [showImportExport, setShowImportExport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importFormat, setImportFormat] = useState('opml');
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

// Fonctions d'export
  const exportFeeds = async (format) => {
    if (!currentUserId) {
      setMessage('Erreur: Aucun utilisateur connecté');
      return;
    }

    setIsExporting(true);
    setMessage(`Export ${format.toUpperCase()} en cours...`);
    
    try {
      const response = await fetch(`http://localhost:8000/users/${currentUserId}/export/${format}`, {
        method: 'GET',
      });
      
      if (!response.ok) {
        throw new Error(`Erreur ${response.status}: ${response.statusText}`);
      }
      
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `suprss_feeds_export.${format}`;
      
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename=(.+)/);
        if (filenameMatch) {
          filename = filenameMatch[1].replace(/"/g, '');
        }
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      setMessage(`Export ${format.toUpperCase()} terminé avec succès !`);
    } catch (error) {
      setMessage(`Erreur lors de l'export ${format}: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Fonction d'import
  const importFeeds = async () => {
    if (!currentUserId || !importFile) {
      setMessage('Erreur: Fichier requis pour l\'import');
      return;
    }
    
    const fileExtension = importFile.name.split('.').pop().toLowerCase();
    const validExtensions = {
      'opml': ['opml', 'xml'],
      'json': ['json'],
      'csv': ['csv']
    };
    
    if (!validExtensions[importFormat].includes(fileExtension)) {
      setMessage(`Erreur: Le fichier doit être au format ${validExtensions[importFormat].join(' ou ')} pour l'import ${importFormat.toUpperCase()}`);
      return;
    }

    setIsImporting(true);
    setMessage(`Import ${importFormat.toUpperCase()} en cours...`);
    
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      
      const response = await fetch(`http://localhost:8000/users/${currentUserId}/import/${importFormat}`, {
        method: 'POST',
        body: formData,
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.detail || `Erreur ${response.status}`);
      }
      
      setMessage(result.message || 'Import terminé avec succès !');
      
      if (result.errors && result.errors.length > 0) {
        setMessage(prev => prev + `\n\nErreurs détectées:\n${result.errors.join('\n')}`);
      }
      
      await loadFeeds();
      setImportFile(null);
      document.getElementById('import-file-input').value = '';
      
    } catch (error) {
      setMessage(`Erreur lors de l'import ${importFormat}: ${error.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setMessage('Erreur: Le fichier est trop volumineux (max 5MB)');
        return;
      }
      
      setImportFile(file);
      setMessage(`Fichier sélectionné: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
    }
  };

  // Fonctions d'authentification
 const handleRegister = async () => {
  try {
    // Validation côté client
    if (!registerData.username.trim()) {
      setMessage('Erreur: Le nom d\'utilisateur est requis');
      return;
    }
    
    if (!registerData.email.trim()) {
      setMessage('Erreur: L\'email est requis');
      return;
    }
    
    if (!isValidEmail(registerData.email)) {
      setMessage('Erreur: Veuillez saisir une adresse email valide');
      return;
    }
    
    if (!registerData.password.trim()) {
      setMessage('Erreur: Le mot de passe est requis');
      return;
    }
    
    if (registerData.password.length < 6) {
      setMessage('Erreur: Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

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

  const handleGoogleResponse = async (response) => {
    try {
      const payload = JSON.parse(atob(response.credential.split('.')[1]));
      
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
    setEditingFeed(null);
    setEditFeedData({
      title: '',
      url: '',
      description: '',
      tags: '',
      update_frequency: 60
    });
  };

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
    if (!currentUserId) return;

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

  const deleteFeed = async (feedId, feedTitle) => {
    if (!currentUserId) return;

    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer le flux "${feedTitle}" ?`)) {
      return;
    }

    try {
      setMessage('Suppression en cours...');
      const response = await axios.delete(`http://localhost:8000/feeds/${feedId}?user_id=${currentUserId}`);
      
      if (response.data.error && response.data.error.includes('utilisé dans des collections')) {
        const collectionsMessage = `Ce flux est utilisé dans les collections suivantes :\n${response.data.collections.join(', ')}\n\nVoulez-vous le désactiver à la place ?`;
        
        if (window.confirm(collectionsMessage)) {
          await toggleFeedActiveStatus(feedId, feedTitle);
        } else {
          setMessage('Suppression annulée - Flux utilisé dans des collections');
        }
        return;
      }
      
      setMessage(response.data.message || 'Flux supprimé avec succès');
      await loadFeeds();
      
      if (articles.length > 0) {
        await loadAllArticles(currentPage);
      }
      
    } catch (error) {
      const errorMsg = error.response?.data?.detail || error.response?.data?.message || error.message;
      setMessage('Erreur lors de la suppression: ' + errorMsg);
    }
  };

  const toggleFeedActiveStatus = async (feedId, feedTitle) => {
    if (!currentUserId) return;

    try {
      const response = await axios.patch(`http://localhost:8000/feeds/${feedId}/toggle-active?user_id=${currentUserId}`);
      setMessage(response.data.message || 'Statut du flux modifié');
      await loadFeeds();
    } catch (error) {
      const errorMsg = error.response?.data?.detail || error.response?.data?.message || error.message;
      setMessage('Erreur lors de la modification: ' + errorMsg);
    }
  };

  const startEditFeed = (feed) => {
    setEditingFeed(feed.id);
    setEditFeedData({
      title: feed.title,
      url: feed.url,
      description: feed.description || '',
      tags: feed.tags || '',
      update_frequency: feed.update_frequency || 60
    });
  };

  const cancelEditFeed = () => {
    setEditingFeed(null);
    setEditFeedData({
      title: '',
      url: '',
      description: '',
      tags: '',
      update_frequency: 60
    });
  };

  const saveFeedEdit = async (feedId) => {
    if (!currentUserId) return;

    if (!editFeedData.title.trim() || !editFeedData.url.trim()) {
      setMessage('Erreur: Titre et URL requis');
      return;
    }

    try {
      setMessage('Modification en cours...');
      const response = await axios.put(`http://localhost:8000/feeds/${feedId}`, {
        ...editFeedData,
        owner_id: currentUserId
      });
      
      setMessage(response.data.message || 'Flux modifié avec succès');
      setEditingFeed(null);
      setEditFeedData({
        title: '',
        url: '',
        description: '',
        tags: '',
        update_frequency: 60
      });
      
      await loadFeeds();
    } catch (error) {
      const errorMsg = error.response?.data?.detail || error.response?.data?.message || error.message;
      setMessage('Erreur lors de la modification: ' + errorMsg);
    }
  };

  const refreshSingleFeed = async (feedId, feedTitle) => {
    try {
      setMessage(`Actualisation de "${feedTitle}" en cours...`);
      const response = await axios.post(`http://localhost:8000/feeds/${feedId}/refresh`);
      setMessage(response.data.message || 'Flux actualisé');
      
      if (articles.length > 0) {
        await loadAllArticles(currentPage);
      }
    } catch (error) {
      const errorMsg = error.response?.data?.detail || error.response?.data?.message || error.message;
      setMessage('Erreur lors de l\'actualisation: ' + errorMsg);
    }
  };

// Gestion des articles
  const loadAllArticles = async (page = 1) => {
    if (!currentUserId) return;

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

  // Fonctions pour les collections
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

  const deleteCollection = async (collectionId, collectionName) => {
    if (!currentUserId) return;

    const confirmMessage = `ATTENTION: Cette action est irréversible.\n\nÊtes-vous sûr de vouloir supprimer définitivement la collection "${collectionName}" ?\n\nTapez "SUPPRIMER" pour confirmer:`;
    
    const userConfirmation = window.prompt(confirmMessage);
    
    if (userConfirmation !== "SUPPRIMER") {
      setMessage('Suppression annulée');
      return;
    }

    if (!window.confirm(`Dernière confirmation: supprimer définitivement "${collectionName}" ?`)) {
      setMessage('Suppression annulée');
      return;
    }

    try {
      setMessage('Suppression en cours...');
      const response = await axios.delete(`http://localhost:8000/collections/${collectionId}?user_id=${currentUserId}`);
      
      setMessage(response.data.message || 'Collection supprimée avec succès');
      
      if (currentCollection && currentCollection.id === collectionId) {
        closeCollection();
      }
      
      await loadCollections();
    } catch (error) {
      setMessage('Erreur lors de la suppression: ' + (error.response?.data?.detail || error.message));
    }
  };

  const leaveCollection = async (collectionId, collectionName) => {
    if (!currentUserId) return;

    if (!window.confirm(`Êtes-vous sûr de vouloir quitter la collection "${collectionName}" ?`)) {
      return;
    }

    try {
      setMessage('Sortie de la collection en cours...');
      const response = await axios.delete(`http://localhost:8000/collections/${collectionId}/leave?user_id=${currentUserId}`);
      
      setMessage(response.data.message || 'Vous avez quitté la collection');
      
      if (currentCollection && currentCollection.id === collectionId) {
        closeCollection();
      }
      
      await loadCollections();
    } catch (error) {
      setMessage('Erreur lors de la sortie: ' + (error.response?.data?.detail || error.message));
    }
  };

  const canDeleteCollection = (collection) => {
    return collection.is_owner && collection.owner_id === currentUserId;
  };

  const canLeaveCollection = (collection) => {
    return !collection.is_owner && collection.owner_id !== currentUserId;
  };

  const openCollection = async (collection) => {
    setCurrentCollection(collection);
    await loadCollectionArticles(collection.id);
    await loadCollectionMembers(collection.id);
    await loadCollectionMessages(collection.id);
    await loadCollectionFeeds(collection.id);
  };

  const closeCollection = () => {
    setCurrentCollection(null);
    setCollectionArticles([]);
    setCollectionMembers([]);
    setCollectionMessages([]);
    setCollectionFeeds([]);
    setSelectedArticleForComment(null);
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

  const loadCollectionMessages = async (collectionId, articleId = null) => {
    if (!currentUserId) return;

    try {
      let url = `http://localhost:8000/collections/${collectionId}/messages?user_id=${currentUserId}`;
      if (articleId) {
        url += `&article_id=${articleId}`;
      }
      
      const response = await axios.get(url);
      setCollectionMessages(response.data.messages || []);
    } catch (error) {
      setMessage('Erreur lors du chargement des messages');
    }
  };

  const sendMessage = async (collectionId, articleId = null) => {
    if (!newMessage.trim() || !currentUserId) {
      setMessage('Veuillez saisir un message');
      return;
    }

    try {
      const requestData = {
        message: newMessage.trim(),
        article_id: articleId
      };

      const response = await axios.post(
        `http://localhost:8000/collections/${collectionId}/messages?user_id=${currentUserId}`, 
        requestData,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      
      setNewMessage('');
      await loadCollectionMessages(collectionId, articleId);
      
      if (articleId) {
        setMessage('Commentaire ajouté');
      } else {
        setMessage('Message envoyé');
      }
    } catch (error) {
      setMessage('Erreur lors de l\'envoi du message: ' + (error.response?.data?.detail || error.message));
    }
  };

  const updateMemberPermissions = async (collectionId, userId, newPermissions) => {
    if (!currentUserId) return;

    try {
      await axios.patch(`http://localhost:8000/collections/${collectionId}/members/${userId}/permissions?requester_id=${currentUserId}`, {
        permissions: newPermissions
      });
      setMessage(`Permissions mises à jour pour ce membre`);
      await loadCollectionMembers(collectionId);
    } catch (error) {
      setMessage('Erreur lors de la modification des permissions: ' + (error.response?.data?.detail || error.message));
    }
  };

  const removeMemberFromCollection = async (collectionId, userId, username) => {
    if (!currentUserId) return;
    
    if (!window.confirm(`Êtes-vous sûr de vouloir retirer ${username} de cette collection ?`)) {
      return;
    }

    try {
      await axios.delete(`http://localhost:8000/collections/${collectionId}/members/${userId}?requester_id=${currentUserId}`);
      setMessage(`${username} retiré de la collection`);
    } catch (error) {
      if (error.response?.status === 404) {
        setMessage(`${username} retiré de la collection`);
      } else {
        setMessage('Erreur lors du retrait du membre: ' + (error.response?.data?.detail || error.message));
      }
    } finally {
      await loadCollectionMembers(collectionId);
    }
  };

  const inviteToCollection = async (collectionId, permissions = 'write') => {
    if (!inviteEmail.trim()) {
      setMessage('Email requis pour l\'invitation');
      return;
    }

    try {
      await axios.post(`http://localhost:8000/collections/${collectionId}/invite?inviter_id=${currentUserId}`, {
        user_email: inviteEmail,
        permissions: permissions
      });
      setMessage(`Invitation envoyée à ${inviteEmail} avec droits: ${permissions}`);
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

  const formatDate = (dateStr) => {
    try {
      if (dateStr.match(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)) {
        return dateStr;
      }
      
      const date = new Date(dateStr);
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

return (
    <div className="App">
      <h1>SUPRSS - Lecteur de flux RSS</h1>
      {message && (
        <div style={{padding: '10px', background: '#f0f0f0', margin: '10px 0', whiteSpace: 'pre-wrap'}}>
          {message}
        </div>
      )}
      
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
              <button 
                onClick={handleLogin} 
                style={{width: '100%', padding: '10px', backgroundColor: '#007bff', color: 'white', border: 'none'}}
              >
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
              <button 
                onClick={handleRegister} 
                style={{width: '100%', padding: '10px', backgroundColor: '#28a745', color: 'white', border: 'none'}}
              >
                S'inscrire
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <div style={{textAlign: 'right', padding: '10px', borderBottom: '1px solid #ddd', marginBottom: '20px'}}>
            Connecté : <strong>{currentUser}</strong> 
            <button onClick={logout} style={{marginLeft: '10px', padding: '5px 10px'}}>
              Déconnexion
            </button>
          </div>

          {!currentCollection ? (
            <div>
              {/* Section Flux individuels */}
              <div style={{marginBottom: '30px'}}>
                <h2>Gestion des flux RSS personnels</h2>
                <div style={{marginBottom: '20px'}}>
                  <button onClick={loadFeeds} style={{padding: '10px', marginRight: '10px'}}>
                    Charger mes flux
                  </button>
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
                    <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
                      <label>Fréquence de mise à jour (minutes):</label>
                      <input 
                        type="number"
                        min="15"
                        max="1440"
                        value={newFeed.update_frequency}
                        onChange={(e) => setNewFeed({...newFeed, update_frequency: parseInt(e.target.value)})}
                        style={{padding: '8px', width: '100px'}}
                      />
                    </div>
                    <button 
                      onClick={createFeed}
                      style={{padding: '10px', backgroundColor: '#007bff', color: 'white', border: 'none'}}
                    >
                      Créer le flux
                    </button>
                  </div>
                </div>

{/* Section Import/Export */}
                <div style={{marginBottom: '30px', padding: '20px', border: '1px solid #17a2b8', backgroundColor: '#e8f4f8', borderRadius: '8px'}}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px'}}>
                    <h3 style={{color: '#17a2b8', margin: 0}}>Import / Export de flux</h3>
                    <button 
                      onClick={() => setShowImportExport(!showImportExport)}
                      style={{
                        padding: '8px 12px', 
                        backgroundColor: '#17a2b8', 
                        color: 'white', 
                        border: 'none',
                        borderRadius: '4px'
                      }}
                    >
                      {showImportExport ? 'Masquer' : 'Afficher'}
                    </button>
                  </div>
                  
                  {showImportExport && (
                    <div>
                      {/* Section Export */}
                      <div style={{marginBottom: '25px', padding: '15px', backgroundColor: 'white', borderRadius: '6px', border: '1px solid #ddd'}}>
                        <h4 style={{color: '#28a745', marginBottom: '15px'}}>📤 Exporter mes flux</h4>
                        <p style={{fontSize: '14px', color: '#666', marginBottom: '15px'}}>
                          Téléchargez vos flux RSS dans différents formats pour les sauvegarder ou les importer dans d'autres applications.
                        </p>
                        
                        <div style={{display: 'flex', gap: '10px', flexWrap: 'wrap'}}>
                          <button 
                            onClick={() => exportFeeds('opml')}
                            disabled={isExporting}
                            style={{
                              padding: '10px 15px',
                              backgroundColor: isExporting ? '#6c757d' : '#28a745',
                              color: 'white',
                              border: 'none',
                              borderRadius: '5px',
                              cursor: isExporting ? 'not-allowed' : 'pointer'
                            }}
                          >
                            {isExporting ? 'Export...' : 'Export OPML'}
                          </button>
                          
                          <button 
                            onClick={() => exportFeeds('json')}
                            disabled={isExporting}
                            style={{
                              padding: '10px 15px',
                              backgroundColor: isExporting ? '#6c757d' : '#007bff',
                              color: 'white',
                              border: 'none',
                              borderRadius: '5px',
                              cursor: isExporting ? 'not-allowed' : 'pointer'
                            }}
                          >
                            {isExporting ? 'Export...' : 'Export JSON'}
                          </button>
                          
                          <button 
                            onClick={() => exportFeeds('csv')}
                            disabled={isExporting}
                            style={{
                              padding: '10px 15px',
                              backgroundColor: isExporting ? '#6c757d' : '#ffc107',
                              color: 'black',
                              border: 'none',
                              borderRadius: '5px',
                              cursor: isExporting ? 'not-allowed' : 'pointer'
                            }}
                          >
                            {isExporting ? 'Export...' : 'Export CSV'}
                          </button>
                        </div>
                        
                        <div style={{fontSize: '12px', color: '#666', marginTop: '10px'}}>
                          <strong>OPML:</strong> Format standard pour les lecteurs RSS | 
                          <strong> JSON:</strong> Format universel avec métadonnées | 
                          <strong> CSV:</strong> Format tableur
                        </div>
                      </div>

                      {/* Section Import */}
                      <div style={{padding: '15px', backgroundColor: 'white', borderRadius: '6px', border: '1px solid #ddd'}}>
                        <h4 style={{color: '#dc3545', marginBottom: '15px'}}>📥 Importer des flux</h4>
                        
                        <div style={{
                          padding: '10px', 
                          backgroundColor: '#fff3cd', 
                          border: '1px solid #ffeaa7', 
                          borderRadius: '4px', 
                          marginBottom: '15px',
                          fontSize: '13px'
                        }}>
                          ⚠️ <strong>Attention:</strong> L'import ajoutera les nouveaux flux à votre collection. 
                          Les flux existants (même URL) seront ignorés pour éviter les doublons.
                        </div>
                        
                        <div style={{display: 'grid', gap: '15px'}}>
                          <div>
                            <label style={{display: 'block', marginBottom: '5px', fontWeight: 'bold'}}>
                              Format d'import:
                            </label>
                            <select
                              value={importFormat}
                              onChange={(e) => setImportFormat(e.target.value)}
                              style={{
                                padding: '8px',
                                borderRadius: '4px',
                                border: '1px solid #ddd',
                                width: '200px'
                              }}
                            >
                              <option value="opml">OPML (.opml, .xml)</option>
                              <option value="json">JSON (.json)</option>
                              <option value="csv">CSV (.csv)</option>
                            </select>
                          </div>
                          
                          <div>
                            <label style={{display: 'block', marginBottom: '5px', fontWeight: 'bold'}}>
                              Fichier à importer:
                            </label>
                            <input 
                              id="import-file-input"
                              type="file"
                              accept={importFormat === 'opml' ? '.opml,.xml' : importFormat === 'json' ? '.json' : '.csv'}
                              onChange={handleFileChange}
                              style={{
                                padding: '8px',
                                borderRadius: '4px',
                                border: '1px solid #ddd',
                                width: '100%',
                                maxWidth: '400px'
                              }}
                            />
                          </div>
                          
                          {importFile && (
                            <div style={{
                              padding: '8px 12px',
                              backgroundColor: '#d4edda',
                              border: '1px solid #c3e6cb',
                              borderRadius: '4px',
                              fontSize: '13px'
                            }}>
                              ✅ Fichier prêt: <strong>{importFile.name}</strong> 
                              ({(importFile.size / 1024).toFixed(1)} KB)
                            </div>
                          )}
                          
                          <button 
                            onClick={importFeeds}
                            disabled={!importFile || isImporting}
                            style={{
                              padding: '12px 20px',
                              backgroundColor: (!importFile || isImporting) ? '#6c757d' : '#dc3545',
                              color: 'white',
                              border: 'none',
                              borderRadius: '5px',
                              cursor: (!importFile || isImporting) ? 'not-allowed' : 'pointer',
                              fontWeight: 'bold'
                            }}
                          >
                            {isImporting ? `Import ${importFormat.toUpperCase()} en cours...` : `Importer le fichier ${importFormat.toUpperCase()}`}
                          </button>
                        </div>
                        
                        <div style={{marginTop: '15px', fontSize: '12px', color: '#666'}}>
                          <details>
                            <summary style={{cursor: 'pointer', fontWeight: 'bold'}}>
                              Formats supportés et exemples
                            </summary>
                            <div style={{marginTop: '10px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px'}}>
                              <p><strong>OPML:</strong> Format standard des lecteurs RSS (Feedly, Inoreader, etc.)</p>
                              <p><strong>JSON:</strong> Format SUPRSS avec métadonnées complètes</p>
                              <p><strong>CSV:</strong> Format tableur avec colonnes: Titre, URL, Description, Tags, Fréquence_MAJ, Actif, Date_Création, Dernière_MAJ</p>
                            </div>
                          </details>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {feeds.length > 0 && (
                  <div>
                    <h3>Mes flux RSS ({feeds.length})</h3>
                    {feeds.map(feed => (
                      <div key={feed.id} style={{border: '1px solid #ddd', padding: '15px', margin: '10px 0', backgroundColor: '#f8f9fa'}}>
                        {editingFeed === feed.id ? (
                          <div>
                            <div style={{display: 'grid', gap: '10px', marginBottom: '15px'}}>
                              <input 
                                value={editFeedData.title}
                                onChange={(e) => setEditFeedData({...editFeedData, title: e.target.value})}
                                style={{padding: '10px', borderRadius: '4px', border: '1px solid #ddd'}}
                              />
                              <input 
                                value={editFeedData.url}
                                onChange={(e) => setEditFeedData({...editFeedData, url: e.target.value})}
                                style={{padding: '10px', borderRadius: '4px', border: '1px solid #ddd'}}
                              />
                              <input 
                                placeholder="Description"
                                value={editFeedData.description}
                                onChange={(e) => setEditFeedData({...editFeedData, description: e.target.value})}
                                style={{padding: '10px', borderRadius: '4px', border: '1px solid #ddd'}}
                              />
                              <input 
                                placeholder="Tags"
                                value={editFeedData.tags}
                                onChange={(e) => setEditFeedData({...editFeedData, tags: e.target.value})}
                                style={{padding: '10px', borderRadius: '4px', border: '1px solid #ddd'}}
                              />
                              <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
                                <label>Fréquence (min):</label>
                                <input 
                                  type="number"
                                  min="15"
                                  max="1440"
                                  value={editFeedData.update_frequency}
                                  onChange={(e) => setEditFeedData({...editFeedData, update_frequency: parseInt(e.target.value)})}
                                  style={{padding: '8px', width: '100px', borderRadius: '4px', border: '1px solid #ddd'}}
                                />
                              </div>
                            </div>
                            
                            <div style={{display: 'flex', gap: '10px'}}>
                              <button 
                                onClick={() => saveFeedEdit(feed.id)}
                                style={{padding: '10px 15px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '5px'}}
                              >
                                Sauvegarder
                              </button>
                              <button 
                                onClick={cancelEditFeed}
                                style={{padding: '10px 15px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '5px'}}
                              >
                                Annuler
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '15px'}}>
                              <div style={{flex: 1}}>
                                <h4 style={{marginTop: '0', marginBottom: '10px'}}>
                                  {feed.title}
                                  {!feed.is_active && (
                                    <span style={{
                                      marginLeft: '10px',
                                      padding: '2px 8px',
                                      backgroundColor: '#dc3545',
                                      color: 'white',
                                      borderRadius: '12px',
                                      fontSize: '11px'
                                    }}>
                                      INACTIF
                                    </span>
                                  )}
                                </h4>
                                <p style={{fontSize: '14px', color: '#666', marginBottom: '5px'}}>{feed.url}</p>
                                {feed.description && <p style={{fontSize: '14px', marginBottom: '10px'}}>{feed.description}</p>}
                                
                                <div style={{fontSize: '12px', color: '#666', marginBottom: '10px'}}>
                                  Créé: {feed.created_at} | Fréquence: {feed.update_frequency || 60}min
                                  {feed.last_updated && (
                                    <span style={{color: '#28a745'}}> | Dernière sync: {feed.last_updated}</span>
                                  )}
                                </div>
                                
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
                            </div>
                            
                            <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap'}}>
                              <button 
                                onClick={() => refreshSingleFeed(feed.id, feed.title)}
                                style={{
                                  padding: '6px 10px', 
                                  backgroundColor: '#17a2b8', 
                                  color: 'white', 
                                  border: 'none',
                                  borderRadius: '4px',
                                  fontSize: '12px'
                                }}
                              >
                                Actualiser
                              </button>
                              
                              <button 
                                onClick={() => startEditFeed(feed)}
                                style={{
                                  padding: '6px 10px', 
                                  backgroundColor: '#ffc107', 
                                  color: 'black', 
                                  border: 'none',
                                  borderRadius: '4px',
                                  fontSize: '12px'
                                }}
                              >
                                Modifier
                              </button>
                              
                              <button 
                                onClick={() => toggleFeedActiveStatus(feed.id, feed.title)}
                                style={{
                                  padding: '6px 10px', 
                                  backgroundColor: feed.is_active ? '#fd7e14' : '#28a745', 
                                  color: 'white', 
                                  border: 'none',
                                  borderRadius: '4px',
                                  fontSize: '12px'
                                }}
                              >
                                {feed.is_active ? 'Désactiver' : 'Activer'}
                              </button>
                              
                              <button 
                                onClick={() => deleteFeed(feed.id, feed.title)}
                                style={{
                                  padding: '6px 10px', 
                                  backgroundColor: '#dc3545', 
                                  color: 'white', 
                                  border: 'none',
                                  borderRadius: '4px',
                                  fontSize: '12px'
                                }}
                              >
                                Supprimer
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

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

                  {collections.length > 0 ? (
                    <div>
                      <h3>Mes Collections ({collections.length})</h3>
                      <div style={{display: 'grid', gap: '15px'}}>
                        {collections.map(collection => (
                          <div key={collection.id} style={{
                            border: '1px solid #28a745', 
                            padding: '20px', 
                            borderRadius: '8px', 
                            backgroundColor: '#f8fff8'
                          }}>
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
                            
                            <div style={{fontSize: '12px', color: '#666', marginBottom: '15px'}}>
                              Créée par {collection.owner_username} le {formatDate(collection.created_at)}
                              {collection.is_private && (
                                <span style={{marginLeft: '10px', color: '#dc3545', fontWeight: 'bold'}}>Privée</span>
                              )}
                            </div>

                            <div style={{display: 'flex', gap: '10px', justifyContent: 'space-between', alignItems: 'center'}}>
                              <button 
                                onClick={() => openCollection(collection)}
                                style={{
                                  padding: '10px 20px', 
                                  backgroundColor: '#28a745', 
                                  color: 'white', 
                                  border: 'none',
                                  borderRadius: '5px',
                                  cursor: 'pointer',
                                  flex: 1
                                }}
                              >
                                Ouvrir la collection
                              </button>
                              
                              {canDeleteCollection(collection) && (
                                <button 
                                  onClick={() => deleteCollection(collection.id, collection.name)}
                                  style={{
                                    padding: '10px 15px', 
                                    backgroundColor: '#dc3545', 
                                    color: 'white', 
                                    border: 'none',
                                    borderRadius: '5px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Supprimer
                                </button>
                              )}
                              
                              {canLeaveCollection(collection) && (
                                <button 
                                  onClick={() => leaveCollection(collection.id, collection.name)}
                                  style={{
                                    padding: '10px 15px', 
                                    backgroundColor: '#ffc107', 
                                    color: 'black', 
                                    border: 'none',
                                    borderRadius: '5px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Quitter
                                </button>
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

                  {articles.length > 0 && (
                    <div style={{marginBottom: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px'}}>
                      <button
                        onClick={() => loadAllArticles(currentPage - 1)}
                        disabled={!pagination.has_previous}
                        style={{
                          padding: '8px 12px',
                          backgroundColor: pagination.has_previous ? '#007bff' : '#6c757d',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: pagination.has_previous ? 'pointer' : 'not-allowed'
                        }}
                      >
                        Précédent
                      </button>
                      
                      <span style={{padding: '8px 15px', backgroundColor: '#f8f9fa', borderRadius: '4px'}}>
                        Page {pagination.current_page} sur {pagination.total_pages} 
                        ({pagination.total_articles} articles)
                      </span>
                      
                      <button
                        onClick={() => loadAllArticles(currentPage + 1)}
                        disabled={!pagination.has_next}
                        style={{
                          padding: '8px 12px',
                          backgroundColor: pagination.has_next ? '#007bff' : '#6c757d',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: pagination.has_next ? 'pointer' : 'not-allowed'
                        }}
                      >
                        Suivant
                      </button>
                    </div>
                  )}

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
                          
                          {article.published && (
                            <p style={{fontSize: '12px', color: '#888', marginBottom: '12px'}}>
                              Publié le : {formatDate(article.published)}
                            </p>
                          )}
                          
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
                      
                      {pagination.total_pages > 1 && (
                        <div style={{marginTop: '30px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px'}}>
                          <button
                            onClick={() => loadAllArticles(currentPage - 1)}
                            disabled={!pagination.has_previous}
                            style={{
                              padding: '8px 12px',
                              backgroundColor: pagination.has_previous ? '#007bff' : '#6c757d',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: pagination.has_previous ? 'pointer' : 'not-allowed'
                            }}
                          >
                            Précédent
                          </button>
                          
                          <span style={{padding: '8px 15px', backgroundColor: '#f8f9fa', borderRadius: '4px'}}>
                            Page {pagination.current_page} sur {pagination.total_pages}
                          </span>
                          
                          <button
                            onClick={() => loadAllArticles(currentPage + 1)}
                            disabled={!pagination.has_next}
                            style={{
                              padding: '8px 12px',
                              backgroundColor: pagination.has_next ? '#007bff' : '#6c757d',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: pagination.has_next ? 'pointer' : 'not-allowed'
                            }}
                          >
                            Suivant
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (

            <div style={{padding: '20px', border: '2px solid #28a745', borderRadius: '10px'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
                <h2 style={{color: '#28a745'}}>Collection: {currentCollection.name}</h2>
                <div style={{display: 'flex', gap: '10px'}}>
                  {canDeleteCollection(currentCollection) && (
                    <button 
                      onClick={() => deleteCollection(currentCollection.id, currentCollection.name)}
                      style={{
                        padding: '10px 15px', 
                        backgroundColor: '#dc3545', 
                        color: 'white', 
                        border: 'none',
                        borderRadius: '5px'
                      }}
                    >
                      Supprimer la collection
                    </button>
                  )}
                  
                  {canLeaveCollection(currentCollection) && (
                    <button 
                      onClick={() => leaveCollection(currentCollection.id, currentCollection.name)}
                      style={{
                        padding: '10px 15px', 
                        backgroundColor: '#ffc107', 
                        color: 'black', 
                        border: 'none',
                        borderRadius: '5px'
                      }}
                    >
                      Quitter la collection
                    </button>
                  )}
                  
                  <button 
                    onClick={closeCollection} 
                    style={{
                      padding: '10px 15px', 
                      backgroundColor: '#6c757d', 
                      color: 'white', 
                      border: 'none',
                      borderRadius: '5px'
                    }}
                  >
                    Fermer
                  </button>
                </div>
              </div>

              <p>{currentCollection.description}</p>
              
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
              </div>

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
                        
                        <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
                          {feed.permissions && feed.permissions.can_delete && (
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
                              title="Supprimer ce flux de la collection"
                            >
                              Supprimer
                            </button>
                          )}

                          <button 
                            onClick={() => refreshSingleFeed(feed.id, feed.title)}
                            style={{
                              padding: '8px 12px', 
                              backgroundColor: '#17a2b8', 
                              color: 'white', 
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '12px'
                            }}
                            title="Actualiser ce flux"
                          >
                            Actualiser
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
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

              <div style={{marginBottom: '20px', padding: '15px', backgroundColor: '#e3f2fd', border: '1px solid #bbdefb'}}>
                <h4>Inviter un membre</h4>
                <div style={{display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px'}}>
                  <input 
                    placeholder="Email de l'utilisateur" 
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    style={{flex: 1, padding: '8px'}}
                  />
                  <select
                    value={invitePermissions}
                    onChange={(e) => setInvitePermissions(e.target.value)}
                    style={{padding: '8px', borderRadius: '4px', border: '1px solid #ddd', minWidth: '120px'}}
                  >
                    <option value="read">Lecture seule</option>
                    <option value="write">Lecture + Écriture</option>
                    <option value="admin">Administrateur</option>
                  </select>
                  <button 
                    onClick={() => inviteToCollection(currentCollection.id, invitePermissions)}
                    style={{padding: '8px 15px', backgroundColor: '#17a2b8', color: 'white', border: 'none'}}
                  >
                    Inviter
                  </button>
                </div>
                <div style={{fontSize: '12px', color: '#666'}}>
                  <strong>Lecture seule:</strong> Consulter les articles uniquement<br/>
                  <strong>Lecture + Écriture:</strong> Consulter + marquer lu/favori + ajouter flux<br/>
                  <strong>Administrateur:</strong> Tous les droits + gestion des membres
                </div>
              </div>

<div style={{marginBottom: '20px'}}>
                <h4>Membres ({collectionMembers.length})</h4>
                <div style={{display: 'grid', gap: '10px'}}>
                  {collectionMembers.map(member => {
                    const isCurrentUser = member.user_id === currentUserId;
                    const isOwner = currentCollection.owner_id === member.user_id;
                    const currentUserIsOwner = currentCollection.owner_id === currentUserId;
                    const canModifyRights = currentUserIsOwner && !isOwner;
                    
                    return (
                      <div key={member.user_id} style={{
                        padding: '15px', 
                        backgroundColor: '#f8f9fa', 
                        borderRadius: '8px',
                        border: '1px solid #ddd'
                      }}>
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                          <div>
                            <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                              <strong>{member.username}</strong>
                              {isCurrentUser && (
                                <span style={{
                                  padding: '2px 6px',
                                  backgroundColor: '#17a2b8',
                                  color: 'white',
                                  borderRadius: '10px',
                                  fontSize: '10px'
                                }}>
                                  VOUS
                                </span>
                              )}
                              {isOwner && (
                                <span style={{
                                  padding: '2px 6px',
                                  backgroundColor: '#ffc107',
                                  color: 'black',
                                  borderRadius: '10px',
                                  fontSize: '10px'
                                }}>
                                  PROPRIÉTAIRE
                                </span>
                              )}
                            </div>
                            <div style={{fontSize: '12px', color: '#666'}}>{member.email}</div>
                            <div style={{fontSize: '11px', color: '#888'}}>
                              Membre depuis: {formatDate(member.joined_at)}
                            </div>
                          </div>
                          
                          <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                            {canModifyRights ? (
                              <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                                <select
                                  value={member.permissions}
                                  onChange={(e) => updateMemberPermissions(currentCollection.id, member.user_id, e.target.value)}
                                  style={{
                                    padding: '6px 10px',
                                    fontSize: '12px',
                                    borderRadius: '4px',
                                    border: '1px solid #ddd',
                                    minWidth: '130px'
                                  }}
                                >
                                  <option value="read">Lecture seule</option>
                                  <option value="write">Lecture + Écriture</option>
                                  <option value="admin">Administrateur</option>
                                </select>
                                
                                <button
                                  onClick={() => removeMemberFromCollection(currentCollection.id, member.user_id, member.username)}
                                  style={{
                                    padding: '6px 10px',
                                    backgroundColor: '#dc3545',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    fontSize: '11px'
                                  }}
                                  title="Retirer ce membre de la collection"
                                >
                                  Retirer
                                </button>
                              </div>
                            ) : (
                              <span style={{
                                padding: '6px 12px', 
                                backgroundColor: member.permissions === 'admin' ? '#dc3545' : member.permissions === 'write' ? '#28a745' : '#6c757d',
                                color: 'white', 
                                borderRadius: '15px', 
                                fontSize: '12px'
                              }}>
                                {member.permissions === 'admin' ? 'Administrateur' : 
                                 member.permissions === 'write' ? 'Lecture + Écriture' : 'Lecture seule'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{marginBottom: '20px', padding: '15px', backgroundColor: '#f9f9f9', border: '1px solid #ddd', borderRadius: '8px'}}>
                <h5>Filtres des articles</h5>
                
                <div style={{
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                  gap: '10px', 
                  marginBottom: '15px'
                }}>
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

              <div style={{marginBottom: '20px'}}>
                <h4>Articles de la collection ({collectionArticles.length})</h4>
                
                {collectionArticles.length > 0 && pagination.total_pages > 1 && (
                  <div style={{marginBottom: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px'}}>
                    <button
                      onClick={() => applyCollectionFilters(currentCollection.id, filters, pagination.current_page - 1)}
                      disabled={!pagination.has_previous}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: pagination.has_previous ? '#007bff' : '#6c757d',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: pagination.has_previous ? 'pointer' : 'not-allowed'
                      }}
                    >
                      Précédent
                    </button>
                    
                    <span style={{padding: '8px 15px', backgroundColor: '#f8f9fa', borderRadius: '4px'}}>
                      Page {pagination.current_page} sur {pagination.total_pages} 
                      ({pagination.total_articles} articles)
                    </span>
                    
                    <button
                      onClick={() => applyCollectionFilters(currentCollection.id, filters, pagination.current_page + 1)}
                      disabled={!pagination.has_next}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: pagination.has_next ? '#007bff' : '#6c757d',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: pagination.has_next ? 'pointer' : 'not-allowed'
                      }}
                    >
                      Suivant
                    </button>
                  </div>
                )}

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

                      {selectedArticleForComment === article.id && (
                        <div style={{marginTop: '15px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '5px'}}>
                          <h6>Commentaires sur cet article</h6>
                          
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
                
                {collectionArticles.length > 0 && pagination.total_pages > 1 && (
                  <div style={{marginTop: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px'}}>
                    <button
                      onClick={() => applyCollectionFilters(currentCollection.id, filters, pagination.current_page - 1)}
                      disabled={!pagination.has_previous}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: pagination.has_previous ? '#007bff' : '#6c757d',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: pagination.has_previous ? 'pointer' : 'not-allowed'
                      }}
                    >
                      Précédent
                    </button>
                    
                    <span style={{padding: '8px 15px', backgroundColor: '#f8f9fa', borderRadius: '4px'}}>
                      Page {pagination.current_page} sur {pagination.total_pages}
                    </span>
                    
                    <button
                      onClick={() => applyCollectionFilters(currentCollection.id, filters, pagination.current_page + 1)}
                      disabled={!pagination.has_next}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: pagination.has_next ? '#007bff' : '#6c757d',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: pagination.has_next ? 'pointer' : 'not-allowed'
                      }}
                    >
                      Suivant
                    </button>
                  </div>
                )}
              </div>

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
          )}
        </div>
      )}
    </div>
  );
}

export default App;