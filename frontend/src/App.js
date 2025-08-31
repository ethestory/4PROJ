import React, { useState } from 'react';
import axios from 'axios';
import { api } from './api';
import './App.css';

// Configuration sécurisée - NE JAMAIS mettre de clés en dur !
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || "";

function App() {
  // ========================================
  // ÉTATS DE L'APPLICATION
  // ========================================
  
  // Message d'information pour l'utilisateur
  const [message, setMessage] = useState('');
  
  // Données des flux RSS
  const [feeds, setFeeds] = useState([]);
  
  // Gestion de l'authentification
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);

  // Validation des emails - regex basique mais fonctionnelle
  const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };
  
  // Formulaires de connexion et inscription
  const [loginData, setLoginData] = useState({ 
    username: '', 
    password: '' 
  });
  const [registerData, setRegisterData] = useState({ 
    username: '', 
    email: '', 
    password: '' 
  });
  
  // Formulaire de création de flux
  const [newFeed, setNewFeed] = useState({ 
    title: '', 
    url: '', 
    description: '',
    tags: '',
    update_frequency: 60  // Par défaut 1 heure
  });
  
  // Gestion des articles avec pagination
  const [articles, setArticles] = useState([]);
  const [filters, setFilters] = useState({
    read: null,
    favorite: null,
    search: '',
    days: null,
    feed_id: null,
    tags: ''
  });
  
  // Système de pagination
  const [pagination, setPagination] = useState({
    current_page: 1,
    per_page: 20,
    total_articles: 0,
    total_pages: 0,
    has_next: false,
    has_previous: false
  });
  const [currentPage, setCurrentPage] = useState(1);

  // ========================================
  // GESTION DES COLLECTIONS PARTAGÉES
  // ========================================
  
  const [collections, setCollections] = useState([]);
  const [currentCollection, setCurrentCollection] = useState(null);
  const [collectionArticles, setCollectionArticles] = useState([]);
  const [collectionMembers, setCollectionMembers] = useState([]);
  const [collectionMessages, setCollectionMessages] = useState([]);
  const [collectionFeeds, setCollectionFeeds] = useState([]);
  
  // Formulaires pour les collections
  const [showCreateCollection, setShowCreateCollection] = useState(false);
  const [newCollection, setNewCollection] = useState({ 
    name: '', 
    description: '', 
    is_private: false 
  });
  
  // Gestion des invitations et messages
  const [inviteEmail, setInviteEmail] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [selectedArticleForComment, setSelectedArticleForComment] = useState(null);
  const [newCollectionFeed, setNewCollectionFeed] = useState({ url: '', title: '' });
  const [invitePermissions, setInvitePermissions] = useState('write');

  // ========================================
  // ÉDITION DE FLUX
  // ========================================
  
  const [editingFeed, setEditingFeed] = useState(null);
  const [editFeedData, setEditFeedData] = useState({
    title: '',
    url: '',
    description: '',
    tags: '',
    update_frequency: 60
  });

  // ========================================
  // IMPORT/EXPORT
  // ========================================
  
  const [showImportExport, setShowImportExport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importFormat, setImportFormat] = useState('opml');
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // ========================================
  // FONCTIONS D'EXPORT
  // ========================================

  const exportFeeds = async (format) => {
    // Vérification de sécurité
    if (!currentUserId) {
      setMessage('Erreur: Aucun utilisateur connecté');
      return;
    }

    setIsExporting(true);
    setMessage(`Export ${format.toUpperCase()} en cours...`);
    
    try {
      // Construction de l'URL d'export
      const response = await fetch(`http://localhost:8000/users/${currentUserId}/export/${format}`, {
        method: 'GET',
      });
      
      if (!response.ok) {
        throw new Error(`Erreur ${response.status}: ${response.statusText}`);
      }
      
      // Récupération du nom du fichier depuis les headers
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `suprss_feeds_export.${format}`;
      
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename=(.+)/);
        if (filenameMatch) {
          filename = filenameMatch[1].replace(/"/g, '');
        }
      }
      
      // Téléchargement automatique du fichier
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      
      // Nettoyage
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      setMessage(`Export ${format.toUpperCase()} terminé avec succès !`);
    } catch (error) {
      setMessage(`Erreur lors de l'export ${format}: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  // ========================================
  // FONCTIONS D'IMPORT
  // ========================================
  
  const importFeeds = async () => {
    if (!currentUserId || !importFile) {
      setMessage('Erreur: Fichier requis pour l\'import');
      return;
    }
    
    // Validation du format de fichier
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
      // Préparation des données
      const formData = new FormData();
      formData.append('file', importFile);
      
      // Envoi de la requête
      const response = await fetch(`http://localhost:8000/users/${currentUserId}/import/${importFormat}`, {
        method: 'POST',
        body: formData,
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.detail || `Erreur ${response.status}`);
      }
      
      setMessage(result.message || 'Import terminé avec succès !');
      
      // Affichage des éventuelles erreurs
      if (result.errors && result.errors.length > 0) {
        setMessage(prev => prev + `\n\nErreurs détectées:\n${result.errors.join('\n')}`);
      }
      
      // Rechargement des données
      await loadFeeds();
      
      // Nettoyage du formulaire
      setImportFile(null);
      document.getElementById('import-file-input').value = '';
      
    } catch (error) {
      setMessage(`Erreur lors de l'import ${importFormat}: ${error.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  // Gestion de sélection de fichier avec validation
  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      // Vérification de la taille (limite à 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setMessage('Erreur: Le fichier est trop volumineux (max 5MB)');
        return;
      }
      
      setImportFile(file);
      setMessage(`Fichier sélectionné: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
    }
  };

  // ========================================
  // FONCTIONS D'AUTHENTIFICATION
  // ========================================
  
  const handleRegister = async () => {
    try {
      // Validation côté client pour une meilleure UX
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
      
      // Sécurité minimum pour les mots de passe
      if (registerData.password.length < 6) {
        setMessage('Erreur: Le mot de passe doit contenir au moins 6 caractères');
        return;
      }

      const result = await api.register(registerData.username, registerData.email, registerData.password);
      setMessage(result.message || 'Inscription réussie !');
      
      // Nettoyage du formulaire
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
      
      // Mise à jour de l'état global
      setMessage(result.message || 'Connexion réussie !');
      setIsLoggedIn(true);
      setCurrentUser(loginData.username);
      setCurrentUserId(result.user_id);
      
      // Nettoyage du formulaire
      setLoginData({ username: '', password: '' });
      
      // Réinitialisation des données pour le nouvel utilisateur
      resetUserData();
      
    } catch (error) {
      setMessage('Erreur connexion : ' + (error.response?.data?.error || error.message));
    }
  };

  // Fonction utilitaire pour réinitialiser les données utilisateur
  const resetUserData = () => {
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
  };

  // ========================================
  // AUTHENTIFICATION GOOGLE
  // ========================================
  
  const handleGoogleResponse = async (response) => {
    try {
      // Décodage du JWT Google (partie payload)
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
        
        resetUserData();
        
      } else {
        setMessage('Erreur lors de la connexion Google: ' + authResult.data.error);
      }

    } catch (error) {
      setMessage('Erreur lors de la connexion Google : ' + (error.response?.data?.error || error.message));
    }
  };

  // Initialisation du bouton de connexion Google
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

  // Hook d'effet pour Google Auth - tentatives multiples car chargement asynchrone
  React.useEffect(() => {
    const googleButton = document.getElementById("google-signin-button");
    
    if (!isLoggedIn) {
      if (googleButton) {
        googleButton.innerHTML = '';
      }
      
      let attempts = 0;
      const maxAttempts = 50; // Limite pour éviter les boucles infinies
      
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
      // Nettoyage quand connecté
      if (googleButton) {
        googleButton.innerHTML = '';
        googleButton.style.display = 'none';
      }
    }
  }, [isLoggedIn]);

  // Déconnexion avec nettoyage complet
  const logout = () => {
    setIsLoggedIn(false);
    setCurrentUser(null);
    setCurrentUserId(null);
    setFeeds([]);
    setArticles([]);
    setCollections([]);
    setCurrentCollection(null);
    
    // Réinitialisation de la pagination
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
    
    // Nettoyage des formulaires d'édition
    setEditingFeed(null);
    setEditFeedData({
      title: '',
      url: '',
      description: '',
      tags: '',
      update_frequency: 60
    });
  };

  // ========================================
  // GESTION DES FLUX RSS
  // ========================================

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
      
      // Réinitialisation du formulaire
      setNewFeed({ 
        title: '', 
        url: '', 
        description: '', 
        tags: '', 
        update_frequency: 60 
      });
      
      // Rechargement des données
      loadFeeds();
    } catch (error) {
      setMessage('Erreur création de flux : ' + (error.response?.data?.error || error.message));
    }
  };

  // Synchronisation de tous les flux utilisateur
  const syncAllFeeds = async () => {
    if (!currentUserId) return;

    try {
      setMessage('Synchronisation en cours...');
      const response = await axios.post(`http://localhost:8000/users/${currentUserId}/fetch-all-articles`);
      setMessage(response.data.message);
      
      // Rechargement des données
      loadFeeds();
      loadAllArticles(1);
    } catch (error) {
      setMessage('Erreur lors de la synchronisation');
    }
  };

  // Suppression de flux avec gestion des collections
  const deleteFeed = async (feedId, feedTitle) => {
    if (!currentUserId) return;

    // Double confirmation pour éviter les suppressions accidentelles
    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer le flux "${feedTitle}" ?`)) {
      return;
    }

    try {
      setMessage('Suppression en cours...');
      const response = await axios.delete(`http://localhost:8000/feeds/${feedId}?user_id=${currentUserId}`);
      
      // Gestion du cas où le flux est utilisé dans des collections
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
      
      // Mise à jour des articles si nécessaire
      if (articles.length > 0) {
        await loadAllArticles(currentPage);
      }
      
    } catch (error) {
      const errorMsg = error.response?.data?.detail || error.response?.data?.message || error.message;
      setMessage('Erreur lors de la suppression: ' + errorMsg);
    }
  };

  // Activation/désactivation d'un flux
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

  // ========================================
  // ÉDITION DE FLUX
  // ========================================
  
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

    // Validation basique
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
      
      // Nettoyage du formulaire d'édition
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

  // Actualisation d'un flux spécifique
  const refreshSingleFeed = async (feedId, feedTitle) => {
    try {
      setMessage(`Actualisation de "${feedTitle}" en cours...`);
      const response = await axios.post(`http://localhost:8000/feeds/${feedId}/refresh`);
      setMessage(response.data.message || 'Flux actualisé');
      
      // Mise à jour des articles si affichés
      if (articles.length > 0) {
        await loadAllArticles(currentPage);
      }
    } catch (error) {
      const errorMsg = error.response?.data?.detail || error.response?.data?.message || error.message;
      setMessage('Erreur lors de l\'actualisation: ' + errorMsg);
    }
  };

  // ========================================
  // GESTION DES ARTICLES
  // ========================================

  const loadAllArticles = async (page = 1) => {
    if (!currentUserId) return;

    try {
      const response = await axios.get(`http://localhost:8000/users/${currentUserId}/articles?page=${page}&per_page=20`);
      
      setArticles(response.data.articles || []);
      setPagination(response.data.pagination || {});
      setCurrentPage(page);
      
      // Calcul des statistiques pour le message
      const articleCount = response.data.articles ? response.data.articles.length : 0;
      const totalCount = response.data.pagination ? response.data.pagination.total_articles : 0;
      
      setMessage(`Articles chargés - Page ${page} - ${totalCount} articles au total (${articleCount} affichés)`);
    } catch (error) {
      setMessage('Erreur lors du chargement des articles: ' + error.message);
    }
  };

  // Basculer le statut de lecture d'un article
  const toggleRead = async (articleId, isRead) => {
    try {
      const response = await axios.patch(`http://localhost:8000/articles/${articleId}/read?read_status=${!isRead}`);
      setMessage(`Article ${!isRead ? 'marqué comme lu' : 'marqué comme non lu'}`);
      
      // Rechargement contextuel
      if (currentCollection) {
        loadCollectionArticles(currentCollection.id);
      } else {
        loadAllArticles(currentPage);
      }
    } catch (error) {
      setMessage('Erreur lors de la mise à jour du statut de lecture');
    }
  };

  // Basculer le statut favori d'un article
  const toggleFavorite = async (articleId, isFavorite) => {
    try {
      const url = `http://localhost:8000/articles/${articleId}/favorite?favorite_status=${!isFavorite}`;
      const response = await axios.patch(url);
      setMessage(`Article ${!isFavorite ? 'ajouté aux favoris' : 'retiré des favoris'}`);
      
      // Rechargement contextuel
      if (currentCollection) {
        loadCollectionArticles(currentCollection.id);
      } else {
        loadAllArticles(currentPage);
      }
    } catch (error) {
      setMessage('Erreur lors de la mise à jour des favoris');
    }
  };

  // ========================================
  // FONCTIONS DES COLLECTIONS
  // ========================================

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
      
      // Nettoyage du formulaire
      setNewCollection({ name: '', description: '', is_private: false });
      setShowCreateCollection(false);
      loadCollections();
    } catch (error) {
      setMessage('Erreur lors de la création de la collection: ' + (error.response?.data?.detail || error.message));
    }
  };

  // Suppression d'une collection avec double confirmation
  const deleteCollection = async (collectionId, collectionName) => {
    if (!currentUserId) return;

    // Triple sécurité pour éviter les suppressions accidentelles
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
      
      // Fermeture de la collection si elle est actuellement ouverte
      if (currentCollection && currentCollection.id === collectionId) {
        closeCollection();
      }
      
      await loadCollections();
    } catch (error) {
      setMessage('Erreur lors de la suppression: ' + (error.response?.data?.detail || error.message));
    }
  };

  // Quitter une collection
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

  // Fonctions utilitaires pour les permissions
  const canDeleteCollection = (collection) => {
    return collection.is_owner && collection.owner_id === currentUserId;
  };

  const canLeaveCollection = (collection) => {
    return !collection.is_owner && collection.owner_id !== currentUserId;
  };

  // Ouverture d'une collection avec chargement de toutes les données
  const openCollection = async (collection) => {
    setCurrentCollection(collection);
    await loadCollectionArticles(collection.id);
    await loadCollectionMembers(collection.id);
    await loadCollectionMessages(collection.id);
    await loadCollectionFeeds(collection.id);
  };

  // Fermeture d'une collection avec nettoyage
  const closeCollection = () => {
    setCurrentCollection(null);
    setCollectionArticles([]);
    setCollectionMembers([]);
    setCollectionMessages([]);
    setCollectionFeeds([]);
    setSelectedArticleForComment(null);
  };

  // ========================================
  // GESTION DES FLUX DE COLLECTIONS
  // ========================================
  
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

  // ========================================
  // SYSTÈME DE MESSAGERIE
  // ========================================
  
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
      
      // Nettoyage du champ message
      setNewMessage('');
      
      // Rechargement des messages
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

  // ========================================
  // GESTION DES MEMBRES
  // ========================================
  
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

  // ========================================
  // GESTION DES FLUX DANS LES COLLECTIONS
  // ========================================
  
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

  // ========================================
  // SYSTÈME DE FILTRAGE AVANCÉ
  // ========================================
  
  const applyCollectionFilters = async (collectionId, customFilters = null, page = 1) => {
    if (!currentUserId) return;

    const activeFilters = customFilters || filters;
    
    try {
      // Vérification si des filtres sont actifs
      const isEmpty = activeFilters.read === null && activeFilters.favorite === null && 
                     !activeFilters.search && activeFilters.days === null && 
                     activeFilters.feed_id === null && !activeFilters.tags;

      if (isEmpty) {
        // Pas de filtres, chargement normal
        loadCollectionArticles(collectionId, page);
      } else {
        // Construction de l'URL avec les filtres
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

  // ========================================
  // UTILITAIRES DE FORMATAGE
  // ========================================
  
  const formatDate = (dateStr) => {
    try {
      // Si déjà au bon format, retourner tel quel
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

  // ========================================
  // INTERFACE UTILISATEUR - RENDU PRINCIPAL
  // ========================================
  
  return (
    <div className="App">
      <h1>SUPRSS - Lecteur de flux RSS</h1>
      
      {/* Zone d'affichage des messages système */}
      {message && (
        <div style={{padding: '10px', background: '#f0f0f0', margin: '10px 0', whiteSpace: 'pre-wrap'}}>
          {message}
        </div>
      )}
      
      {/* Interface de connexion/inscription */}
      {!isLoggedIn ? (
        <div style={{maxWidth: '400px', margin: '0 auto', padding: '20px'}}>
          {/* Formulaire de connexion */}
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
            
            {/* Connexion Google OAuth */}
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

          {/* Formulaire d'inscription */}
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
        // Interface principale pour utilisateurs connectés
        <div>
          {/* Barre de navigation utilisateur */}
          <div style={{textAlign: 'right', padding: '10px', borderBottom: '1px solid #ddd', marginBottom: '20px'}}>
            Connecté : <strong>{currentUser}</strong> 
            <button onClick={logout} style={{marginLeft: '10px', padding: '5px 10px'}}>
              Déconnexion
            </button>
          </div>

          {/* Navigation entre vue générale et collections */}
          {!currentCollection ? (
            <div>
              {/* ========================================
                  SECTION FLUX PERSONNELS
                  ======================================== */}
              <div style={{marginBottom: '30px'}}>
                <h2>Gestion des flux RSS personnels</h2>
                
                {/* Boutons d'action principaux */}
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

                {/* Formulaire de création de flux */}
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

                {/* ========================================
                    SECTION IMPORT/EXPORT
                    ======================================== */}
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

                {/* ========================================
                    LISTE DES FLUX EXISTANTS
                    ======================================== */}
                {feeds.length > 0 && (
                  <div>
                    <h3>Mes flux RSS ({feeds.length})</h3>
                    {feeds.map(feed => (
                      <div key={feed.id} style={{border: '1px solid #ddd', padding: '15px', margin: '10px 0', backgroundColor: '#f8f9fa'}}>
                        {editingFeed === feed.id ? (
                          // Mode édition d'un flux
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
                          // Mode affichage normal d'un flux
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
                                
                                {/* Informations techniques du flux */}
                                <div style={{fontSize: '12px', color: '#666', marginBottom: '10px'}}>
                                  Créé: {feed.created_at} | Fréquence: {feed.update_frequency || 60}min
                                  {feed.last_updated && (
                                    <span style={{color: '#28a745'}}> | Dernière sync: {feed.last_updated}</span>
                                  )}
                                </div>
                                
                                {/* Affichage des tags */}
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
                            
                            {/* Boutons d'action pour le flux */}
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

                {/* ========================================
                    SECTION COLLECTIONS PARTAGÉES
                    ======================================== */}
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

                  {/* Formulaire de création de collection */}
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

                            {/* Boutons d'action pour les collections */}
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

                {/* ========================================
                    SECTION ARTICLES PERSONNELS
                    ======================================== */}
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

                  {/* Pagination des articles */}
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

                  {/* Affichage des articles ou message d'absence */}
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
                          
                          {/* Résumé de l'article */}
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
                          
                          {/* Actions sur l'article */}
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
                      
                      {/* Pagination en bas de page */}
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
            // ========================================
            // INTERFACE COLLECTION OUVERTE - TODO: TERMINER
            // ========================================
            <div>Collection interface à compléter...</div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;