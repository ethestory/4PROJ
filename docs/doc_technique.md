# SUPRSS — Documentation technique

> **Produit** : SUPRSS — Lecteur/Gestionnaire de flux RSS avec collections partagées  
> **Client** : InfoFlux Pro  
> **Version backend** : 1.0.0  
> **Périmètre** : API FastAPI + Front web + PostgreSQL, déployés via Docker Compose  

---

## 1) Vue d’ensemble
SUPRSS est un projet de lecteur et gestionnaire de flux RSS, conçu pour offrir une alternative libre et performante à des solutions comme Feedly, Inoreader ou NewsBlur.  
L’objectif est de permettre aux employés et clients de l’entreprise InfoFlux Pro de :  
- S’abonner à des flux RSS variés (actualité, blogs, podcasts, etc.).  
- Lire, trier et marquer les articles.  
- Organiser leurs flux en collections personnelles.  
- Créer des collections partagées avec permissions.  
- Échanger via messagerie intégrée et commentaires.  

---

## 2) Architecture & Déploiement

### 2.1 Architecture logique
- **Frontend** : Application React (SPA), uniquement interface utilisateur.  
- **Backend** : API REST développée avec **FastAPI** (Python).  
- **Base de données** : **PostgreSQL 15**.  

### 2.2 Architecture technique

+-------------+ +-------------------+ +---------------+
| Frontend | <----> | Backend API | <----> | PostgreSQL |
| React | | FastAPI (REST) | | Database |
+-------------+ +-------------------+ +---------------+


### 2.3 Déploiement avec Docker Compose
Le projet inclut un fichier `docker-compose.yml` orchestrant trois services :
- **database** : PostgreSQL (15-alpine), persistance via volume `postgres_data`.  
- **backend** : API FastAPI, exposée sur le port 8000.  
- **frontend** : client web React, exposé sur le port 3000.  

#### Pré-requis
- Docker Engine ≥ 20  
- Docker Compose v2  

#### Étapes de déploiement
```bash
# Cloner le dépôt
git clone https://github.com/ethestory/4PROJ
cd SUPRSS

# Configurer l'environnement
cp .env.example .env
# → compléter avec vos secrets (BD, OAuth, etc.)

# Lancer le projet
docker compose up --build -d

# (optionnel) Créer les tables si besoin
curl -X POST http://localhost:8000/create-tables
```
---
## 3) Variables d’environnement (.env)

Exemple minimal :

# Base de données
POSTGRES_DB=suprss_db
POSTGRES_USER=suprss_user
POSTGRES_PASSWORD=suprss_password

# OAuth Google
GOOGLE_CLIENT_ID=<client_id_google>

# CORS
CORS_ALLOWED_ORIGINS=http://localhost:3000

    Tous les secrets sont stockés dans .env

---

## 4) Choix techniques

    FastAPI : framework léger et rapide, documentation auto (OpenAPI/Swagger).

    SQLAlchemy : ORM robuste et maintenable.

    PostgreSQL : moteur SQL fiable, support JSONB et full-text search.

    feedparser : parsing RSS/Atom.

    passlib[bcrypt] : hachage sécurisé des mots de passe.

    OAuth2 (Google) : connexion simplifiée.

    Docker Compose : orchestration reproductible.

---

## 5) Modèle de données
### 5.1 Tables principales

    users : comptes (local + Google).

    feeds : métadonnées des flux RSS.

    articles : articles persistés (titre, lien, résumé, auteur, état lu/favori).

    collections : groupes personnels ou partagés.

    collection_members : rôle et permissions par utilisateur.

    collection_feeds : association flux ↔ collection.

    collection_messages : messagerie + commentaires.

    feed_permissions : ACL par flux dans une collection.

## 5.2 Schéma BDD
Schéma disponible dans le fichier schema_bdd.png

---

## 6) Fonctionnalités majeures
### 6.1 Authentification

    Compte local (username + mot de passe).

    Connexion via OAuth Google.

    Mots de passe hashés avec bcrypt.

### 6.2 Gestion des flux RSS

    Ajout/suppression de flux RSS (titre, URL, tags, description, statut actif).

    Récupération et stockage permanent des articles.

    Marquage « lu/non lu » et « favori ».

### 6.3 Collections

    Création de collections personnelles ou partagées.

    Invitation de membres avec rôles (read, write, admin).

    Permissions fines par flux (lecture, modif, suppression).

    Recherche plein texte + filtres (tags, source, favoris, statut).

### 6.4 Communication

    Messagerie instantanée interne à une collection.

    Commentaires spécifiques aux articles.

### 6.5 Import/Export

    Export en OPML, JSON, CSV.

    Import via fichiers OPML, JSON, CSV.

---

## 7) API REST — aperçu

Base : http://localhost:8000
### Auth

    POST /register — inscription locale.

    POST /login — connexion locale.

    POST /auth/google — connexion OAuth2 Google.

### Flux

    POST /feeds — créer un flux.

    GET /users/{id}/feeds — lister flux d’un utilisateur.

    POST /feeds/{id}/refresh — mise à jour articles.

### Articles

    GET /users/{id}/articles — articles d’un utilisateur.

    PATCH /articles/{id}/read — marquer lu/non lu.

    PATCH /articles/{id}/favorite — favoris.

### Collections

    POST /collections — créer collection.

    GET /users/{id}/collections — lister collections.

    POST /collections/{id}/invite — inviter un membre.

    POST /collections/{id}/messages — envoyer message/commentaire.

### Import/Export

    GET /users/{id}/export/opml|json|csv

    POST /users/{id}/import/opml|json|csv

---

## 8) Sécurité

    Hashage des mots de passe via bcrypt.

    Vérification des tokens Google côté backend.

    Permissions ACL au niveau collections + flux.

    CORS configuré pour le frontend.

    Secrets isolés dans .env.

### Recommandations production :

    Reverse proxy (Nginx/Caddy) avec TLS.

    Gestionnaire de secrets.

---

## 9) Guide de déploiement résumé

    Copier .env.example vers .env et compléter.

    docker compose up --build

    API → http://localhost:8000 ; Frontend → http://localhost:3000

    Vérifier la santé via GET /health.

---

## 10) Conclusion

Cette documentation fournit tous les éléments nécessaires à la compréhension, au déploiement et à la maintenance de SUPRSS. Elle justifie les choix techniques, décrit le modèle de données et l’API, et assure que le projet est reproductible et sécurisable en environnement pro.