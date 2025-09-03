# SUPRSS — Lecteur de flux RSS collaboratif

SUPRSS est une application web moderne permettant de :
- S’abonner à des flux RSS (sites d’actu, blogs, YouTube, podcasts…)
- Lire et filtrer les articles (par tags, favoris, statut lu/non lu…)
- Organiser ses flux dans des **collections personnelles** ou **partagées**
- Collaborer via une messagerie et des commentaires sur articles
- Importer/Exporter ses flux en **OPML, JSON ou CSV**

Projet réalisé dans le cadre pédagogique pour l’entreprise **InfoFlux Pro** par Erika Bonneau

---

## Architecture

L’application est découpée en trois services (conteneurisés via Docker) :
- **Frontend** : React (interface web)
- **Backend** : FastAPI (API REST)
- **Database** : PostgreSQL (stockage persistant)

---

## Prérequis

- [Docker](https://docs.docker.com/get-docker/) ≥ 20.x  
- [Docker Compose](https://docs.docker.com/compose/) v2  
- Compte Google Cloud (si utilisation de Google OAuth2)

---

## Installation & déploiement

1. **Cloner le dépôt**
   ```bash
   git clone https://github.com/ethestory/4PROJ.git
   cd SUPRSS
   ```

2. **Configurer les variables d'environement**
- Copier le fichier .env.example -> .env à la racine du projet
- Remplir avec vos identifiants 

Example minimal : 

    ```bash 
    POSTGRES_DB=nom_base_de_donnée
    POSTGRES_USER=nom_utilisateur
    POSTGRES_PASSWORD=mot_de_passe

    GOOGLE_CLIENT_ID=<google_client_id>
    CORS_ALLOWED_ORIGINS=http://localhost:3000
    DATABASE_URL=postgresql://nom_utilisateur:mot_de_passe@database:5432/base_de_données
    ```


3. **Lancer les conteurs**

    ```bash
    docker compose up --build 
    ```

4. **Accès à l'application**
    - Fontend : http://localhost:3000
    - Backend : http://localhost:8000
    - Swagger API Docs : http://localhost:8000/docs

Vérification de la santé de l'API : http://localhost:8000/health

---

Documentation technique et utilisateurs disponible dans le dossier docs 

---

