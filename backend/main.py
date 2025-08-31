# main.py - PARTIE 1: IMPORTS ET CONFIGURATION
from fastapi import FastAPI, HTTPException, Depends, Query, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_, func
import feedparser
from datetime import datetime, timedelta
import dateutil.parser
import secrets
import string
import os
from contextlib import asynccontextmanager
import json
import xml.etree.ElementTree as ET
import csv
from io import StringIO
from fastapi.responses import Response

# Imports pour Google OAuth2
try:
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token
    GOOGLE_AUTH_AVAILABLE = True
except ImportError:
    GOOGLE_AUTH_AVAILABLE = False
    print("Google Auth libraries not available. OAuth2 will use basic verification.")

# Imports locaux
from database import SessionLocal, engine
from models import Base, User, Feed, Article, Collection, CollectionMember, CollectionFeed, CollectionMessage, FeedPermission

# main.py - PARTIE 2: FONCTIONS UTILITAIRES

def get_db():
    """Dépendance pour obtenir une session de base de données"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_french_time():
    """Retourne l'heure actuelle en heure française (UTC+1 ou UTC+2)"""
    utc_now = datetime.utcnow()
    
    # Calcul plus précis de l'heure d'été en France
    year = utc_now.year
    
    # Dernier dimanche de mars
    march_last_sunday = datetime(year, 3, 31)
    march_last_sunday = march_last_sunday - timedelta(days=march_last_sunday.weekday() + 1)
    if march_last_sunday.day > 31:
        march_last_sunday = march_last_sunday - timedelta(days=7)
    
    # Dernier dimanche d'octobre  
    october_last_sunday = datetime(year, 10, 31)
    october_last_sunday = october_last_sunday - timedelta(days=october_last_sunday.weekday() + 1)
    if october_last_sunday.day > 31:
        october_last_sunday = october_last_sunday - timedelta(days=7)
    
    # Vérifier si on est en période d'heure d'été
    if march_last_sunday <= utc_now < october_last_sunday:
        # Heure d'été : UTC+2
        offset_hours = 2
    else:
        # Heure d'hiver : UTC+1
        offset_hours = 1
    
    return utc_now + timedelta(hours=offset_hours)

def format_date_for_display(date_input):
    """Convertit une date en format DD/MM/YYYY HH:MM heure française"""
    if not date_input:
        return ""
    
    try:
        # Si c'est déjà une chaîne au format correct, la retourner
        if isinstance(date_input, str) and len(date_input) == 16 and '/' in date_input:
            if date_input.count('/') == 2 and ':' in date_input:
                return date_input
        
        # Si c'est un objet datetime
        if isinstance(date_input, datetime):
            return date_input.strftime("%d/%m/%Y %H:%M")
        
        # Si c'est une chaîne, essayer de la parser
        date_string = str(date_input)
        
        # Vérifier si c'est déjà au bon format DD/MM/YYYY HH:MM
        if date_string.count('/') == 2 and ':' in date_string:
            try:
                # Valider le format
                datetime.strptime(date_string, "%d/%m/%Y %H:%M")
                return date_string
            except:
                pass
        
        parsed_date = dateutil.parser.parse(date_string)
        
        # Ne pas modifier l'heure si elle semble déjà correcte
        # Vérifier si c'est une date UTC et la convertir en heure française
        is_utc = (
            date_string.endswith('Z') or 
            '+00:00' in date_string or 
            'GMT' in date_string or
            'UTC' in date_string
        )
        
        if is_utc:
            # Convertir en heure française seulement si c'est explicitement UTC
            now = datetime.now()
            offset_hours = 2 if (now.month >= 4 and now.month <= 9) else 1
            french_date = parsed_date.replace(tzinfo=None) + timedelta(hours=offset_hours)
        else:
            # Garder l'heure telle quelle si pas explicitement UTC
            french_date = parsed_date.replace(tzinfo=None)
        
        return french_date.strftime("%d/%m/%Y %H:%M")
        
    except Exception as e:
        print(f"Erreur format date: {e} pour {date_input}")
        return str(date_input)

def get_sort_key(article):
    """Génère une clé de tri chronologique pour un article"""
    try:
        if article.published:
            date_str = article.published.strip()
            
            if '/' in date_str and len(date_str.split('/')) == 3:
                try:
                    if ' ' in date_str:
                        date_part, time_part = date_str.split(' ', 1)
                    else:
                        date_part = date_str
                        time_part = "00:00"
                    
                    day, month, year = date_part.split('/')
                    if ':' in time_part:
                        hour, minute = time_part.split(':')
                    else:
                        hour, minute = "00", "00"
                    
                    return datetime(int(year), int(month), int(day), int(hour), int(minute))
                except:
                    pass
            
            try:
                parsed_date = dateutil.parser.parse(date_str)
                is_utc = (
                    date_str.endswith('Z') or 
                    '+00:00' in date_str or 
                    'GMT' in date_str or
                    'UTC' in date_str or
                    (parsed_date.tzinfo is not None and parsed_date.utcoffset().total_seconds() == 0)
                )
                
                if is_utc:
                    now = datetime.now()
                    offset_hours = 2 if (now.month >= 4 and now.month <= 9) else 1
                    return parsed_date.replace(tzinfo=None) + timedelta(hours=offset_hours)
                else:
                    return parsed_date.replace(tzinfo=None)
            except:
                pass
        
        return article.created_at
    except Exception:
        return article.created_at

def check_feed_permission(db: Session, collection_id: int, feed_id: int, user_id: int, permission_type: str) -> bool:
    """
    Vérifie si un utilisateur a une permission spécifique sur un flux
    permission_type: 'read', 'modify', 'delete'
    """
    # Vérifier le membership dans la collection
    membership = db.query(CollectionMember).filter(
        CollectionMember.collection_id == collection_id,
        CollectionMember.user_id == user_id
    ).first()
    
    if not membership:
        return False
    
    # Les admins ont toutes les permissions
    if membership.permissions == "admin":
        return True
    
    # Chercher les permissions spécifiques pour ce flux
    feed_permission = db.query(FeedPermission).filter(
        FeedPermission.collection_id == collection_id,
        FeedPermission.feed_id == feed_id,
        FeedPermission.user_id == user_id
    ).first()
    
    if feed_permission:
        # Permissions spécifiques définies
        if permission_type == "read":
            return feed_permission.can_read
        elif permission_type == "modify":
            return feed_permission.can_modify
        elif permission_type == "delete":
            return feed_permission.can_delete
    else:
        # Permissions par défaut basées sur le rôle
        if permission_type == "read":
            return True  # Tous les membres peuvent lire
        elif permission_type == "modify":
            return membership.permissions in ["write", "admin"]
        elif permission_type == "delete":
            return membership.permissions == "admin"
    
    return False

def can_manage_permissions(db: Session, collection_id: int, user_id: int) -> bool:
    """Vérifier si un utilisateur peut gérer les permissions dans une collection"""
    membership = db.query(CollectionMember).filter(
        CollectionMember.collection_id == collection_id,
        CollectionMember.user_id == user_id,
        CollectionMember.permissions == "admin"
    ).first()
    return membership is not None

# main.py - PARTIE 3: MODÈLES PYDANTIC

class FeedCreate(BaseModel):
    title: str
    url: str
    description: str = ""
    tags: str = ""
    update_frequency: int = 60
    owner_id: int

class UserCreate(BaseModel):
    username: str
    email: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class GoogleAuthRequest(BaseModel):
    google_token: str
    email: str
    name: str
    google_id: str

class CollectionCreate(BaseModel):
    name: str
    description: str = ""
    is_private: bool = False

class CollectionInvite(BaseModel):
    user_email: str
    permissions: str = "write"

class CollectionFeedAdd(BaseModel):
    feed_url: str
    feed_title: str = ""
    feed_description: str = ""
    tags: str = ""

class CollectionMessageCreate(BaseModel):
    message: str
    article_id: int = None

# Nouveaux modèles pour les permissions par flux
class FeedPermissionCreate(BaseModel):
    feed_id: int
    user_id: int
    can_read: bool = True
    can_modify: bool = False
    can_delete: bool = False

class FeedPermissionUpdate(BaseModel):
    can_read: bool
    can_modify: bool
    can_delete: bool

class FeedPermissionResponse(BaseModel):
    id: int
    collection_id: int
    feed_id: int
    user_id: int
    username: str
    feed_title: str
    can_read: bool
    can_modify: bool
    can_delete: bool
    granted_at: str

# main.py - PARTIE 4: INITIALISATION DE L'APPLICATION

# Gestionnaire de cycle de vie
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Démarrage : créer les tables
    Base.metadata.create_all(bind=engine)
    yield
    # Arrêt : rien à faire pour le moment
    pass

# Initialisation FastAPI
app = FastAPI(
    title="SUPRSS API",
    description="API pour la gestion de flux RSS avec collections partagées",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "SUPRSS API is running!"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "SUPRSS Backend"}

@app.post("/create-tables")
async def create_tables():
    """Endpoint pour créer les tables manuellement si nécessaire"""
    try:
        Base.metadata.create_all(bind=engine)
        return {"status": "Tables created successfully!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating tables: {str(e)}")
    
# main.py - PARTIE 5: ENDPOINTS D'AUTHENTIFICATION

@app.post("/auth/google")
async def google_oauth(auth_data: GoogleAuthRequest, db: Session = Depends(get_db)):
    """Authentification via Google OAuth2"""
    try:
        from auth import hash_password

        if GOOGLE_AUTH_AVAILABLE:
            try:
                GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
                idinfo = id_token.verify_oauth2_token(
                    auth_data.google_token, 
                    google_requests.Request(), 
                    GOOGLE_CLIENT_ID
                )
                
                if idinfo['iss'] not in ['accounts.google.com', 'https://accounts.google.com']:
                    raise ValueError('Token Google invalide')
            except Exception as token_error:
                print(f"Avertissement vérification token: {token_error}")
        
        base_username = auth_data.email.split('@')[0] + '_google'
        username = base_username
        
        counter = 1
        while db.query(User).filter(User.username == username).first():
            username = f"{base_username}_{counter}"
            counter += 1
        
        existing_user = db.query(User).filter(User.email == auth_data.email).first()
        
        if existing_user:
            return {
                "success": True,
                "message": f"Connexion réussie via Google",
                "user": {
                    "id": existing_user.id,
                    "username": existing_user.username,
                    "email": existing_user.email
                },
                "is_new_user": False
            }
        else:
            secure_password = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(32))
            hashed_pwd = hash_password(secure_password)
            
            new_user = User(
                username=username,
                email=auth_data.email,
                hashed_password=hashed_pwd
            )
            
            db.add(new_user)
            db.commit()
            db.refresh(new_user)
            
            return {
                "success": True,
                "message": f"Compte Google créé avec succès pour {auth_data.name}",
                "user": {
                    "id": new_user.id,
                    "username": new_user.username,
                    "email": new_user.email
                },
                "is_new_user": True
            }
    except Exception as e:
        print(f"Erreur OAuth Google: {str(e)}")
        return {
            "success": False,
            "error": f"Erreur lors de l'authentification Google: {str(e)}",
            "user": None
        }

@app.post("/login")
async def login(user_data: UserLogin, db: Session = Depends(get_db)):
    try:
        from auth import verify_password

        user = db.query(User).filter(User.username == user_data.username).first()
        if not user:
            return {"error": "Invalid username"}
        
        if not verify_password(user_data.password, user.hashed_password):
            return {"error": "Invalid password"}
        
        return {"message": f"Welcome {user.username}!", "user_id": user.id}
    except Exception as e:
        return {"error": f"Login failed: {str(e)}"}

@app.post("/register")
async def register(user_data: UserCreate, db: Session = Depends(get_db)):
    try:
        from auth import hash_password

        existing = db.query(User).filter(User.username == user_data.username).first()
        if existing:
            return {"error": "Username already exists"}
        
        existing_email = db.query(User).filter(User.email == user_data.email).first()
        if existing_email:
            return {"error": "Email already exists"}
        
        hashed_pwd = hash_password(user_data.password)
        new_user = User(
            username=user_data.username,
            email=user_data.email,
            hashed_password=hashed_pwd
        )

        db.add(new_user)
        db.commit()
        db.refresh(new_user)

        return {"message": f"User {user_data.username} created successfully"}
    except Exception as e:
       return {"error": f"Registration failed: {str(e)}"}

# main.py - PARTIE 6: ENDPOINTS DE GESTION DES FLUX RSS

@app.post("/feeds")
async def create_feed(feed_data: FeedCreate, db: Session = Depends(get_db)):
    try:
        # Vérifier que l'utilisateur existe
        user = db.query(User).filter(User.id == feed_data.owner_id).first()
        if not user:
            return {"error": "User not found"}

        new_feed = Feed(
            title=feed_data.title,
            url=feed_data.url,
            description=feed_data.description,
            tags=feed_data.tags,
            update_frequency=feed_data.update_frequency,
            owner_id=feed_data.owner_id
        )
        
        db.add(new_feed)
        db.commit()
        db.refresh(new_feed)

        return {
            "id": new_feed.id,
            "title": new_feed.title,
            "url": new_feed.url,
            "description": new_feed.description,
            "tags": new_feed.tags,
            "update_frequency": new_feed.update_frequency,
            "created_at": new_feed.created_at.isoformat()
        }
    except Exception as e:
        return {"error": f"Error creating feed: {str(e)}"}

@app.get("/users/{user_id}/feeds")
async def get_user_feeds(user_id: int, db: Session = Depends(get_db)):
    try:
        # Vérifier que l'utilisateur existe
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return {"error": "User not found"}

        feeds = db.query(Feed).filter(Feed.owner_id == user_id).all()
        
        feeds_list = []
        for feed in feeds:
            feeds_list.append({
                "id": feed.id,
                "title": feed.title,
                "url": feed.url,
                "description": feed.description,
                "tags": getattr(feed, 'tags', "") or "",
                "update_frequency": getattr(feed, 'update_frequency', 60) or 60,
                "is_active": feed.is_active,
                "last_updated": format_date_for_display(feed.last_updated.isoformat()) if hasattr(feed, 'last_updated') and feed.last_updated else None,
                "created_at": format_date_for_display(feed.created_at.isoformat())
            })
        
        return {
            "user_id": user_id,
            "feeds_count": len(feeds),
            "feeds": feeds_list
        }
    except Exception as e:
        return {"error": f"Error fetching user feeds: {str(e)}"}

@app.delete("/feeds/{feed_id}")
async def delete_feed(feed_id: int, user_id: int = Query(...), db: Session = Depends(get_db)):
    """Supprimer un flux RSS personnel (seul le propriétaire peut supprimer)"""
    try:
        # Récupérer le flux
        feed = db.query(Feed).filter(Feed.id == feed_id).first()
        
        if not feed:
            raise HTTPException(status_code=404, detail="Flux non trouvé")
        
        # Vérifier que l'utilisateur est le propriétaire du flux
        if feed.owner_id != user_id:
            raise HTTPException(status_code=403, detail="Seul le propriétaire peut supprimer ce flux")
        
        # Vérifier si le flux est utilisé dans des collections
        collection_feeds = db.query(CollectionFeed).filter(
            CollectionFeed.feed_id == feed_id
        ).all()
        
        if collection_feeds:
            # Le flux est utilisé dans des collections - demander confirmation ou proposer de le désactiver
            collections_names = []
            for cf in collection_feeds:
                collection = db.query(Collection).filter(Collection.id == cf.collection_id).first()
                if collection:
                    collections_names.append(collection.name)
            
            return {
                "error": "Flux utilisé dans des collections",
                "message": f"Ce flux est utilisé dans les collections: {', '.join(collections_names)}. Supprimez-le d'abord de ces collections ou désactivez-le.",
                "collections_count": len(collection_feeds),
                "collections": collections_names,
                "can_deactivate": True
            }
        
        try:
            # Supprimer d'abord tous les articles associés
            articles_deleted = db.query(Article).filter(Article.feed_id == feed_id).count()
            db.query(Article).filter(Article.feed_id == feed_id).delete()
            
            # Supprimer toutes les permissions spécifiques liées à ce flux
            db.query(FeedPermission).filter(FeedPermission.feed_id == feed_id).delete()
            
            # Supprimer le flux lui-même
            db.delete(feed)
            
            db.commit()
            
            return {
                "message": f"Flux '{feed.title}' supprimé avec succès",
                "deleted_feed_id": feed_id,
                "deleted_articles_count": articles_deleted
            }
            
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=f"Erreur lors de la suppression: {str(e)}")
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@app.patch("/feeds/{feed_id}/toggle-active")
async def toggle_feed_active(feed_id: int, user_id: int = Query(...), db: Session = Depends(get_db)):
    """Activer/désactiver un flux RSS (alternative à la suppression)"""
    try:
        # Récupérer le flux
        feed = db.query(Feed).filter(Feed.id == feed_id).first()
        
        if not feed:
            raise HTTPException(status_code=404, detail="Flux non trouvé")
        
        # Vérifier que l'utilisateur est le propriétaire du flux
        if feed.owner_id != user_id:
            raise HTTPException(status_code=403, detail="Seul le propriétaire peut modifier ce flux")
        
        # Basculer le statut actif
        feed.is_active = not feed.is_active
        db.commit()
        
        status = "activé" if feed.is_active else "désactivé"
        
        return {
            "message": f"Flux '{feed.title}' {status} avec succès",
            "feed_id": feed_id,
            "is_active": feed.is_active
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@app.put("/feeds/{feed_id}")
async def update_feed(feed_id: int, feed_data: FeedCreate, db: Session = Depends(get_db)):
    """Modifier un flux RSS personnel"""
    try:
        # Récupérer le flux
        feed = db.query(Feed).filter(Feed.id == feed_id).first()
        
        if not feed:
            raise HTTPException(status_code=404, detail="Flux non trouvé")
        
        # Vérifier que l'utilisateur est le propriétaire du flux
        if feed.owner_id != feed_data.owner_id:
            raise HTTPException(status_code=403, detail="Seul le propriétaire peut modifier ce flux")
        
        # Mettre à jour les champs
        feed.title = feed_data.title
        feed.url = feed_data.url
        feed.description = feed_data.description
        feed.tags = feed_data.tags
        feed.update_frequency = feed_data.update_frequency
        
        db.commit()
        db.refresh(feed)
        
        return {
            "message": f"Flux '{feed.title}' modifié avec succès",
            "feed": {
                "id": feed.id,
                "title": feed.title,
                "url": feed.url,
                "description": feed.description,
                "tags": feed.tags,
                "update_frequency": feed.update_frequency,
                "is_active": feed.is_active,
                "last_updated": format_date_for_display(feed.last_updated.isoformat()) if feed.last_updated else None,
                "created_at": format_date_for_display(feed.created_at.isoformat())
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur modification: {str(e)}")

@app.post("/users/{user_id}/fetch-all-articles")
async def fetch_all_user_articles(user_id: int, db: Session = Depends(get_db)):
    try:
        # Vérifier que l'utilisateur existe
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return {"error": "User not found"}

        total_articles_added = 0
        total_articles_updated = 0
        feeds_processed = 0

        user_feeds = db.query(Feed).filter(Feed.owner_id == user_id, Feed.is_active == True).all()
        
        if not user_feeds:
            return {
                "message": f"Aucun flux actif trouvé pour l'utilisateur {user_id}",
                "user_id": user_id,
                "feeds_processed": 0,
                "total_articles_added": 0,
                "total_articles_updated": 0
            }
        
        for feed in user_feeds:
            try:
                rss_feed = feedparser.parse(feed.url)
                articles_added = 0
                articles_updated = 0

                for entry in reversed(rss_feed.entries):
                    link = entry.get("link", "")
                    if link:
                        existing = db.query(Article).filter(Article.link == link).first()
                        if not existing:
                            new_article = Article(
                                title=entry.get("title", "Sans Titre"),
                                link=link,
                                published=entry.get("published", ""),
                                author=entry.get("author", ""),
                                summary=entry.get("summary", "")[:800] if entry.get("summary") else "",
                                feed_id=feed.id
                            )
                            db.add(new_article)
                            articles_added += 1
                        else:
                            existing.title = entry.get("title", existing.title)
                            existing.published = entry.get("published", existing.published)
                            existing.summary = entry.get("summary", existing.summary)[:800] if entry.get("summary") else existing.summary
                            articles_updated += 1

                feed.last_updated = get_french_time()
                total_articles_added += articles_added
                total_articles_updated += articles_updated
                feeds_processed += 1
                
            except Exception as e:
                print(f"Erreur lors du traitement du flux {feed.id}: {e}")
                continue

        db.commit()
        
        final_message = f"Synchronisation terminée pour l'utilisateur {user_id} ! {feeds_processed} flux traités, {total_articles_added} nouveaux articles, {total_articles_updated} mis à jour"

        return {
            "message": final_message,
            "user_id": user_id,
            "feeds_processed": feeds_processed,
            "total_articles_added": total_articles_added,
            "total_articles_updated": total_articles_updated
        }
    except Exception as e:
        return {"error": f"Error fetching all user articles: {str(e)}"}

@app.post("/feeds/{feed_id}/refresh")
async def refresh_feed(feed_id: int, db: Session = Depends(get_db)):
    try:
        feed = db.query(Feed).filter(Feed.id == feed_id).first()
        if not feed:
            raise HTTPException(status_code=404, detail="Feed not found")
        
        rss_feed = feedparser.parse(feed.url)
        articles_added = 0
        articles_updated = 0

        for entry in rss_feed.entries:
            link = entry.get("link", "")
            if link:
                existing = db.query(Article).filter(Article.link == link).first()
                if not existing:
                    new_article = Article (
                        title=entry.get("title", "Sans Titre"), 
                        link=link, 
                        published=entry.get("published", ""), 
                        author=entry.get("author", ""), 
                        summary=entry.get("summary", "")[:800] if entry.get("summary") else "", 
                        feed_id=feed.id
                    )
                    db.add(new_article)
                    articles_added += 1
                else:
                    existing.title = entry.get("title", existing.title)
                    existing.published = entry.get("published", existing.published)
                    existing.summary = entry.get("summary", existing.summary)[:800] if entry.get("summary") else existing.summary
                    articles_updated += 1

        feed.last_updated = get_french_time()
        db.commit()
        
        message = f"Flux '{feed.title}' actualisé: {articles_added} nouveaux articles, {articles_updated} mis à jour"
        return {
            "message": message, 
            "feed_id": feed_id, 
            "articles_added": articles_added, 
            "articles_updated": articles_updated
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de l'actualisation: {str(e)}")

# main.py - PARTIE 7: ENDPOINTS DE GESTION DES ARTICLES

@app.get("/users/{user_id}/articles")
async def get_user_articles(
    user_id: int, 
    page: int = Query(1, ge=1), 
    per_page: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    try:
        # Vérifier que l'utilisateur existe
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return {"error": "User not found"}

        user_feed_ids = db.query(Feed.id).filter(Feed.owner_id == user_id).all()
        user_feed_ids = [feed_id[0] for feed_id in user_feed_ids]
        
        if not user_feed_ids:
            return {
                "user_id": user_id,
                "pagination": {
                    "current_page": page,
                    "per_page": per_page,
                    "total_articles": 0,
                    "total_pages": 0,
                    "has_next": False,
                    "has_previous": False
                },
                "articles": []
            }
        
        all_articles = db.query(Article).filter(Article.feed_id.in_(user_feed_ids)).all()
        
        for article in all_articles:
            if not hasattr(article, 'feed') or article.feed is None:
                article.feed = db.query(Feed).filter(Feed.id == article.feed_id).first()
        
        all_articles.sort(key=get_sort_key, reverse=True)
        
        total_articles = len(all_articles)
        total_pages = (total_articles + per_page - 1) // per_page
        start_idx = (page - 1) * per_page
        end_idx = start_idx + per_page
        articles = all_articles[start_idx:end_idx]

        return {
            "user_id": user_id,
            "pagination": {
                "current_page": page,
                "per_page": per_page,
                "total_articles": total_articles,
                "total_pages": total_pages,
                "has_next": page < total_pages,
                "has_previous": page > 1
            },
            "articles": [
                {
                    "id": article.id,
                    "title": article.title,
                    "link": article.link,
                    "published": format_date_for_display(article.published) if article.published else article.created_at.strftime("%d/%m/%Y %H:%M"),
                    "author": article.author,
                    "summary": article.summary[:400] + "..." if len(article.summary) > 400 else article.summary,
                    "is_read": article.is_read,
                    "is_favorite": article.is_favorite,
                    "created_at": article.created_at.isoformat(),
                    "feed": {
                        "id": article.feed.id,
                        "title": article.feed.title,
                        "url": article.feed.url,
                        "tags": getattr(article.feed, 'tags', "") or ""
                    } if article.feed else {
                        "id": article.feed_id,
                        "title": "Flux inconnu",
                        "url": "",
                        "tags": ""
                    }
                }
                for article in articles
            ]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur récupération articles: {str(e)}")

@app.patch("/articles/{article_id}/read")
async def toggle_article_read(
    article_id: int, 
    read_status: bool = Query(...), 
    db: Session = Depends(get_db)
):
    try:
        article = db.query(Article).filter(Article.id == article_id).first()
        if not article:
            return {"error": "Article not found"}
        
        article.is_read = read_status
        db.commit()

        return {"message": "Article status updated", "article_id": article_id, "is_read": read_status}
    except Exception as e:
        return {"error": f"Error: {str(e)}"}

@app.patch("/articles/{article_id}/favorite")
async def toggle_article_favorite(
    article_id: int, 
    favorite_status: bool = Query(...), 
    db: Session = Depends(get_db)
):
    try:
        article = db.query(Article).filter(Article.id == article_id).first()
        if not article: 
            return {"error": "Article not found"}
        
        article.is_favorite = favorite_status
        db.commit()

        return {
            "message": "Article favorite status updated", 
            "article_id": article_id, 
            "is_favorite": favorite_status
        }
    except Exception as e: 
        return {"error": f"Error: {str(e)}"}

# main.py - PARTIE 8: ENDPOINTS DE GESTION DES COLLECTIONS (AVEC SUPPRESSION)

@app.post("/collections")
async def create_collection(collection_data: CollectionCreate, owner_id: int = Query(...), db: Session = Depends(get_db)):
    """Créer une nouvelle collection"""
    try:
        # Vérifier que l'utilisateur existe
        user = db.query(User).filter(User.id == owner_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        new_collection = Collection(
            name=collection_data.name,
            description=collection_data.description,
            is_private=collection_data.is_private,
            owner_id=owner_id
        )
        
        db.add(new_collection)
        db.commit()
        db.refresh(new_collection)
        
        owner_member = CollectionMember(
            collection_id=new_collection.id,
            user_id=owner_id,
            permissions="admin"
        )
        
        db.add(owner_member)
        db.commit()
        
        return {
            "id": new_collection.id,
            "name": new_collection.name,
            "description": new_collection.description,
            "is_private": new_collection.is_private,
            "owner_id": new_collection.owner_id,
            "created_at": new_collection.created_at.isoformat(),
            "members_count": 1
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur création collection: {str(e)}")

@app.delete("/collections/{collection_id}")
async def delete_collection(collection_id: int, user_id: int = Query(...), db: Session = Depends(get_db)):
    """Supprimer une collection (seuls les propriétaires peuvent supprimer)"""
    try:
        # Récupérer la collection
        collection = db.query(Collection).filter(Collection.id == collection_id).first()
        
        if not collection:
            raise HTTPException(status_code=404, detail="Collection non trouvée")
        
        # Vérifier que l'utilisateur est le propriétaire de la collection
        if collection.owner_id != user_id:
            raise HTTPException(status_code=403, detail="Seul le propriétaire peut supprimer la collection")
        
        # Supprimer en cascade toutes les données liées à la collection
        try:
            # 1. Supprimer toutes les permissions spécifiques aux flux de cette collection
            db.query(FeedPermission).filter(
                FeedPermission.collection_id == collection_id
            ).delete()
            
            # 2. Supprimer tous les messages de la collection
            db.query(CollectionMessage).filter(
                CollectionMessage.collection_id == collection_id
            ).delete()
            
            # 3. Supprimer les associations flux-collection (mais pas les flux eux-mêmes)
            db.query(CollectionFeed).filter(
                CollectionFeed.collection_id == collection_id
            ).delete()
            
            # 4. Supprimer tous les membres de la collection
            db.query(CollectionMember).filter(
                CollectionMember.collection_id == collection_id
            ).delete()
            
            # 5. Supprimer la collection elle-même
            db.delete(collection)
            
            db.commit()
            
            return {
                "message": f"Collection '{collection.name}' supprimée avec succès",
                "deleted_collection_id": collection_id
            }
            
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=f"Erreur lors de la suppression en cascade: {str(e)}")
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la suppression de la collection: {str(e)}")

@app.delete("/collections/{collection_id}/leave")
async def leave_collection(collection_id: int, user_id: int = Query(...), db: Session = Depends(get_db)):
    """Quitter une collection (pour les membres non-propriétaires)"""
    try:
        # Récupérer la collection
        collection = db.query(Collection).filter(Collection.id == collection_id).first()
        
        if not collection:
            raise HTTPException(status_code=404, detail="Collection non trouvée")
        
        # Vérifier que l'utilisateur n'est pas le propriétaire
        if collection.owner_id == user_id:
            raise HTTPException(status_code=400, detail="Le propriétaire ne peut pas quitter sa propre collection. Utilisez la suppression.")
        
        # Vérifier que l'utilisateur est membre de la collection
        membership = db.query(CollectionMember).filter(
            CollectionMember.collection_id == collection_id,
            CollectionMember.user_id == user_id
        ).first()
        
        if not membership:
            raise HTTPException(status_code=404, detail="Vous n'êtes pas membre de cette collection")
        
        # Supprimer le membership et les permissions associées
        try:
            # Supprimer les permissions spécifiques de cet utilisateur pour cette collection
            db.query(FeedPermission).filter(
                FeedPermission.collection_id == collection_id,
                FeedPermission.user_id == user_id
            ).delete()
            
            # Supprimer le membership
            db.delete(membership)
            
            db.commit()
            
            return {
                "message": f"Vous avez quitté la collection '{collection.name}'",
                "collection_id": collection_id
            }
            
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=f"Erreur lors de la sortie de la collection: {str(e)}")
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@app.get("/users/{user_id}/collections")
async def get_user_collections(user_id: int, db: Session = Depends(get_db)):
    """Récupérer toutes les collections d'un utilisateur"""
    try:
        # Vérifier que l'utilisateur existe
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return {"error": "User not found"}

        collections_query = db.query(Collection).join(CollectionMember).filter(
            CollectionMember.user_id == user_id
        ).all()
        
        collections_list = []
        for collection in collections_query:
            members_count = db.query(CollectionMember).filter(
                CollectionMember.collection_id == collection.id
            ).count()
            
            user_membership = db.query(CollectionMember).filter(
                CollectionMember.collection_id == collection.id,
                CollectionMember.user_id == user_id
            ).first()
            
            owner = db.query(User).filter(User.id == collection.owner_id).first()
            
            collections_list.append({
                "id": collection.id,
                "name": collection.name,
                "description": collection.description,
                "is_private": collection.is_private,
                "owner_id": collection.owner_id,
                "owner_username": owner.username if owner else "Inconnu",
                "created_at": format_date_for_display(collection.created_at.isoformat()),
                "members_count": members_count,
                "user_permissions": user_membership.permissions if user_membership else "none",
                "is_owner": collection.owner_id == user_id
            })
        
        return {
            "user_id": user_id,
            "collections": collections_list
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur récupération collections: {str(e)}")

@app.post("/collections/{collection_id}/invite")
async def invite_to_collection(collection_id: int, invite_data: CollectionInvite, inviter_id: int = Query(...), db: Session = Depends(get_db)):
    """Inviter un utilisateur à une collection"""
    try:
        inviter_membership = db.query(CollectionMember).filter(
            CollectionMember.collection_id == collection_id,
            CollectionMember.user_id == inviter_id,
            CollectionMember.permissions.in_(["admin"])
        ).first()
        
        if not inviter_membership:
            raise HTTPException(status_code=403, detail="Permissions insuffisantes pour inviter")
        
        user_to_invite = db.query(User).filter(User.email == invite_data.user_email).first()
        if not user_to_invite:
            raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
        
        existing_membership = db.query(CollectionMember).filter(
            CollectionMember.collection_id == collection_id,
            CollectionMember.user_id == user_to_invite.id
        ).first()
        
        if existing_membership:
            raise HTTPException(status_code=400, detail="Utilisateur déjà membre de la collection")
        
        new_member = CollectionMember(
            collection_id=collection_id,
            user_id=user_to_invite.id,
            permissions=invite_data.permissions,
            invited_by=inviter_id
        )
        
        db.add(new_member)
        db.commit()
        
        return {
            "message": f"Utilisateur {user_to_invite.username} ajouté à la collection",
            "user_id": user_to_invite.id,
            "username": user_to_invite.username,
            "permissions": invite_data.permissions
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur invitation: {str(e)}")

# main.py - PARTIE 9: ENDPOINTS DE GESTION DES PERMISSIONS

@app.post("/collections/{collection_id}/feeds/{feed_id}/permissions")
async def set_feed_permissions(
    collection_id: int, 
    feed_id: int, 
    permission_data: FeedPermissionCreate, 
    granter_id: int = Query(...), 
    db: Session = Depends(get_db)
):
    """Définir les permissions d'un utilisateur sur un flux spécifique"""
    try:
        # Vérifier que le granter est admin de la collection
        granter_membership = db.query(CollectionMember).filter(
            CollectionMember.collection_id == collection_id,
            CollectionMember.user_id == granter_id,
            CollectionMember.permissions == "admin"
        ).first()
        
        if not granter_membership:
            return {"error": "Seuls les administrateurs peuvent gérer les permissions"}
        
        # Vérifier que l'utilisateur cible est membre de la collection
        target_membership = db.query(CollectionMember).filter(
            CollectionMember.collection_id == collection_id,
            CollectionMember.user_id == permission_data.user_id
        ).first()
        
        if not target_membership:
            return {"error": "L'utilisateur doit être membre de la collection"}
        
        # Vérifier que le flux existe dans la collection
        collection_feed = db.query(CollectionFeed).filter(
            CollectionFeed.collection_id == collection_id,
            CollectionFeed.feed_id == feed_id
        ).first()
        
        if not collection_feed:
            return {"error": "Ce flux n'existe pas dans cette collection"}
        
        # Créer ou mettre à jour la permission
        existing_permission = db.query(FeedPermission).filter(
            FeedPermission.collection_id == collection_id,
            FeedPermission.feed_id == feed_id,
            FeedPermission.user_id == permission_data.user_id
        ).first()
        
        if existing_permission:
            # Mettre à jour
            existing_permission.can_read = permission_data.can_read
            existing_permission.can_modify = permission_data.can_modify
            existing_permission.can_delete = permission_data.can_delete
            existing_permission.granted_by = granter_id
            existing_permission.granted_at = datetime.utcnow()
            permission = existing_permission
        else:
            # Créer nouveau
            permission = FeedPermission(
                collection_id=collection_id,
                feed_id=feed_id,
                user_id=permission_data.user_id,
                can_read=permission_data.can_read,
                can_modify=permission_data.can_modify,
                can_delete=permission_data.can_delete,
                granted_by=granter_id
            )
            db.add(permission)
        
        db.commit()
        db.refresh(permission)
        
        return {
            "success": True,
            "message": "Permissions mises à jour",
            "permission_id": permission.id
        }
        
    except Exception as e:
        return {"error": f"Erreur lors de la définition des permissions: {str(e)}"}

@app.get("/collections/{collection_id}/feeds/{feed_id}/permissions")
async def get_feed_permissions(
    collection_id: int, 
    feed_id: int, 
    requester_id: int = Query(...), 
    db: Session = Depends(get_db)
):
    """Récupérer toutes les permissions d'un flux"""
    try:
        # Vérifier l'accès à la collection
        membership = db.query(CollectionMember).filter(
            CollectionMember.collection_id == collection_id,
            CollectionMember.user_id == requester_id
        ).first()
        
        if not membership:
            return {"error": "Accès refusé à cette collection"}
        
        # Récupérer toutes les permissions pour ce flux
        permissions_query = db.query(FeedPermission, User, Feed).join(
            User, FeedPermission.user_id == User.id
        ).join(
            Feed, FeedPermission.feed_id == Feed.id
        ).filter(
            FeedPermission.collection_id == collection_id,
            FeedPermission.feed_id == feed_id
        ).all()
        
        permissions = []
        for permission, user, feed in permissions_query:
            permissions.append({
                "id": permission.id,
                "collection_id": collection_id,
                "feed_id": feed_id,
                "user_id": user.id,
                "username": user.username,
                "feed_title": feed.title,
                "can_read": permission.can_read,
                "can_modify": permission.can_modify,
                "can_delete": permission.can_delete,
                "granted_at": format_date_for_display(permission.granted_at.isoformat())
            })
        
        return {
            "collection_id": collection_id,
            "feed_id": feed_id,
            "permissions": permissions
        }
        
    except Exception as e:
        return {"error": f"Erreur lors de la récupération des permissions: {str(e)}"}

@app.get("/collections/{collection_id}/my-permissions")
async def get_my_feed_permissions(collection_id: int, user_id: int = Query(...), db: Session = Depends(get_db)):
    """Récupérer les permissions de l'utilisateur actuel sur tous les flux de la collection"""
    try:
        # Vérifier l'accès à la collection
        membership = db.query(CollectionMember).filter(
            CollectionMember.collection_id == collection_id,
            CollectionMember.user_id == user_id
        ).first()
        
        if not membership:
            return {"error": "Accès refusé à cette collection"}
        
        # Récupérer tous les flux de la collection
        collection_feeds = db.query(CollectionFeed, Feed).join(
            Feed, CollectionFeed.feed_id == Feed.id
        ).filter(CollectionFeed.collection_id == collection_id).all()
        
        user_permissions = []
        
        for collection_feed, feed in collection_feeds:
            # Chercher les permissions spécifiques pour ce flux
            feed_permission = db.query(FeedPermission).filter(
                FeedPermission.collection_id == collection_id,
                FeedPermission.feed_id == feed.id,
                FeedPermission.user_id == user_id
            ).first()
            
            if feed_permission:
                # Permissions spécifiques définies
                permissions = {
                    "can_read": feed_permission.can_read,
                    "can_modify": feed_permission.can_modify,
                    "can_delete": feed_permission.can_delete
                }
            else:
                # Permissions par défaut basées sur le rôle dans la collection
                if membership.permissions == "admin":
                    permissions = {"can_read": True, "can_modify": True, "can_delete": True}
                elif membership.permissions == "write":
                    permissions = {"can_read": True, "can_modify": True, "can_delete": False}
                else:  # read
                    permissions = {"can_read": True, "can_modify": False, "can_delete": False}
            
            user_permissions.append({
                "feed_id": feed.id,
                "feed_title": feed.title,
                "feed_url": feed.url,
                **permissions
            })
        
        return {
            "collection_id": collection_id,
            "user_permissions": user_permissions,
            "collection_role": membership.permissions
        }
        
    except Exception as e:
        return {"error": f"Erreur lors de la récupération des permissions: {str(e)}"}

# main.py - PARTIE 10: GESTION DES FLUX DE COLLECTIONS

@app.post("/collections/{collection_id}/feeds")
async def add_feed_to_collection(collection_id: int, feed_data: CollectionFeedAdd, user_id: int = Query(...), db: Session = Depends(get_db)):
    """Ajouter un flux à une collection"""
    try:
        membership = db.query(CollectionMember).filter(
            CollectionMember.collection_id == collection_id,
            CollectionMember.user_id == user_id,
            CollectionMember.permissions.in_(["admin", "write"])
        ).first()
        
        if not membership:
            raise HTTPException(status_code=403, detail="Permissions insuffisantes")
        
        existing_feed = db.query(Feed).filter(Feed.url == feed_data.feed_url).first()
        
        if not existing_feed:
            new_feed = Feed(
                title=feed_data.feed_title or "Flux sans titre",
                url=feed_data.feed_url,
                description=feed_data.feed_description,
                tags=feed_data.tags,
                owner_id=user_id
            )
            db.add(new_feed)
            db.commit()
            db.refresh(new_feed)
            feed_to_add = new_feed
        else:
            feed_to_add = existing_feed
        
        existing_collection_feed = db.query(CollectionFeed).filter(
            CollectionFeed.collection_id == collection_id,
            CollectionFeed.feed_id == feed_to_add.id
        ).first()
        
        if existing_collection_feed:
            raise HTTPException(status_code=400, detail="Ce flux est déjà dans la collection")
        
        collection_feed = CollectionFeed(
            collection_id=collection_id,
            feed_id=feed_to_add.id,
            added_by_user_id=user_id
        )
        
        db.add(collection_feed)
        db.commit()
        
        return {
            "message": "Flux ajouté à la collection",
            "feed_id": feed_to_add.id,
            "feed_title": feed_to_add.title
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur ajout flux: {str(e)}")

@app.get("/collections/{collection_id}/feeds")
async def get_collection_feeds(collection_id: int, user_id: int = Query(...), db: Session = Depends(get_db)):
    """Récupérer les flux d'une collection avec permissions utilisateur"""
    try:
        membership = db.query(CollectionMember).filter(
            CollectionMember.collection_id == collection_id,
            CollectionMember.user_id == user_id
        ).first()
        
        if not membership:
            raise HTTPException(status_code=403, detail="Accès refusé à cette collection")
        
        feeds_query = db.query(CollectionFeed, Feed, User).join(
            Feed, CollectionFeed.feed_id == Feed.id
        ).join(
            User, CollectionFeed.added_by_user_id == User.id
        ).filter(
            CollectionFeed.collection_id == collection_id
        ).all()
        
        feeds_list = []
        for collection_feed, feed, added_by_user in feeds_query:
            feed_permission = db.query(FeedPermission).filter(
                FeedPermission.collection_id == collection_id,
                FeedPermission.feed_id == feed.id,
                FeedPermission.user_id == user_id
            ).first()
            
            if feed_permission:
                permissions = {
                    "can_read": feed_permission.can_read,
                    "can_modify": feed_permission.can_modify,
                    "can_delete": feed_permission.can_delete
                }
            else:
                if membership.permissions == "admin":
                    permissions = {"can_read": True, "can_modify": True, "can_delete": True}
                elif membership.permissions == "write":
                    permissions = {"can_read": True, "can_modify": True, "can_delete": False}
                else:
                    permissions = {"can_read": True, "can_modify": False, "can_delete": False}
            
            feeds_list.append({
                "id": feed.id,
                "title": feed.title,
                "url": feed.url,
                "description": feed.description,
                "tags": getattr(feed, 'tags', "") or "",
                "is_active": feed.is_active,
                "last_updated": format_date_for_display(feed.last_updated.isoformat()) if feed.last_updated else None,
                "created_at": format_date_for_display(feed.created_at.isoformat()),
                "added_by": added_by_user.username,
                "added_at": format_date_for_display(collection_feed.added_at.isoformat()),
                "permissions": permissions
            })
        
        return {
            "collection_id": collection_id,
            "feeds": feeds_list
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur récupération flux: {str(e)}")

@app.delete("/collections/{collection_id}/feeds/{feed_id}")
async def remove_feed_from_collection(
    collection_id: int, 
    feed_id: int, 
    user_id: int = Query(...), 
    db: Session = Depends(get_db)
):
    """Supprimer un flux d'une collection avec vérification des permissions"""
    try:
        if not check_feed_permission(db, collection_id, feed_id, user_id, "delete"):
            raise HTTPException(status_code=403, detail="Permissions insuffisantes pour supprimer ce flux")
        
        collection_feed = db.query(CollectionFeed).filter(
            CollectionFeed.collection_id == collection_id,
            CollectionFeed.feed_id == feed_id
        ).first()
        
        if not collection_feed:
            raise HTTPException(status_code=404, detail="Flux non trouvé dans cette collection")
        
        db.delete(collection_feed)
        
        db.query(FeedPermission).filter(
            FeedPermission.collection_id == collection_id,
            FeedPermission.feed_id == feed_id
        ).delete()
        
        db.commit()
        
        return {"message": "Flux supprimé de la collection"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la suppression: {str(e)}")

# main.py - PARTIE 11: ARTICLES DES COLLECTIONS

@app.get("/collections/{collection_id}/articles")
async def get_collection_articles_with_permissions(
    collection_id: int, 
    user_id: int = Query(...), 
    page: int = Query(1, ge=1), 
    per_page: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """Récupérer les articles d'une collection en filtrant selon les permissions de lecture"""
    try:
        membership = db.query(CollectionMember).filter(
            CollectionMember.collection_id == collection_id,
            CollectionMember.user_id == user_id
        ).first()
        
        if not membership:
            raise HTTPException(status_code=403, detail="Accès refusé à cette collection")
        
        collection_feeds = db.query(CollectionFeed).filter(
            CollectionFeed.collection_id == collection_id
        ).all()
        
        allowed_feed_ids = []
        for cf in collection_feeds:
            if check_feed_permission(db, collection_id, cf.feed_id, user_id, "read"):
                allowed_feed_ids.append(cf.feed_id)
        
        if not allowed_feed_ids:
            return {
                "collection_id": collection_id,
                "pagination": {
                    "current_page": page,
                    "per_page": per_page,
                    "total_articles": 0,
                    "total_pages": 0,
                    "has_next": False,
                    "has_previous": False
                },
                "articles": []
            }
        
        all_articles_query = db.query(Article, Feed).join(
            Feed, Article.feed_id == Feed.id
        ).filter(
            Article.feed_id.in_(allowed_feed_ids)
        )
        
        all_articles = all_articles_query.all()
        
        articles_list = []
        for article, feed in all_articles:
            article.feed = feed
            articles_list.append(article)
        
        articles_list.sort(key=get_sort_key, reverse=True)
        
        total_articles = len(articles_list)
        total_pages = (total_articles + per_page - 1) // per_page
        start_idx = (page - 1) * per_page
        end_idx = start_idx + per_page
        paginated_articles = articles_list[start_idx:end_idx]
        
        return {
            "collection_id": collection_id,
            "pagination": {
                "current_page": page,
                "per_page": per_page,
                "total_articles": total_articles,
                "total_pages": total_pages,
                "has_next": page < total_pages,
                "has_previous": page > 1
            },
            "articles": [
                {
                    "id": article.id,
                    "title": article.title,
                    "link": article.link,
                    "published": format_date_for_display(article.published) if article.published else article.created_at.strftime("%d/%m/%Y %H:%M"),
                    "author": article.author,
                    "summary": article.summary[:400] + "..." if len(article.summary) > 400 else article.summary,
                    "is_read": article.is_read,
                    "is_favorite": article.is_favorite,
                    "created_at": article.created_at.isoformat(),
                    "feed": {
                        "id": article.feed.id,
                        "title": article.feed.title,
                        "url": article.feed.url,
                        "tags": getattr(article.feed, 'tags', "") or ""
                    },
                    "user_permissions": {
                        "can_read": check_feed_permission(db, collection_id, article.feed_id, user_id, "read"),
                        "can_modify": check_feed_permission(db, collection_id, article.feed_id, user_id, "modify"),
                        "can_delete": check_feed_permission(db, collection_id, article.feed_id, user_id, "delete")
                    }
                }
                for article in paginated_articles
            ]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur récupération articles: {str(e)}")

@app.patch("/collections/{collection_id}/articles/{article_id}/read")
async def toggle_collection_article_read(
    collection_id: int,
    article_id: int, 
    read_status: bool = Query(...), 
    user_id: int = Query(...),
    db: Session = Depends(get_db)
):
    """Modifier le statut de lecture d'un article avec vérification des permissions"""
    try:
        article = db.query(Article).filter(Article.id == article_id).first()
        if not article:
            raise HTTPException(status_code=404, detail="Article non trouvé")
        
        collection_feed = db.query(CollectionFeed).filter(
            CollectionFeed.collection_id == collection_id,
            CollectionFeed.feed_id == article.feed_id
        ).first()
        
        if not collection_feed:
            raise HTTPException(status_code=404, detail="Article non trouvé dans cette collection")
        
        if not check_feed_permission(db, collection_id, article.feed_id, user_id, "modify"):
            raise HTTPException(status_code=403, detail="Permissions insuffisantes pour modifier ce flux")
        
        article.is_read = read_status
        db.commit()

        return {"message": "Statut de lecture mis à jour", "article_id": article_id, "is_read": read_status}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@app.patch("/collections/{collection_id}/articles/{article_id}/favorite")
async def toggle_collection_article_favorite(
    collection_id: int,
    article_id: int, 
    favorite_status: bool = Query(...), 
    user_id: int = Query(...),
    db: Session = Depends(get_db)
):
    """Modifier le statut de favori d'un article avec vérification des permissions"""
    try:
        article = db.query(Article).filter(Article.id == article_id).first()
        if not article:
            raise HTTPException(status_code=404, detail="Article non trouvé")
        
        collection_feed = db.query(CollectionFeed).filter(
            CollectionFeed.collection_id == collection_id,
            CollectionFeed.feed_id == article.feed_id
        ).first()
        
        if not collection_feed:
            raise HTTPException(status_code=404, detail="Article non trouvé dans cette collection")
        
        if not check_feed_permission(db, collection_id, article.feed_id, user_id, "modify"):
            raise HTTPException(status_code=403, detail="Permissions insuffisantes pour modifier ce flux")
        
        article.is_favorite = favorite_status
        db.commit()

        return {"message": "Statut de favori mis à jour", "article_id": article_id, "is_favorite": favorite_status}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@app.post("/collections/{collection_id}/fetch-all-articles")
async def fetch_collection_articles(collection_id: int, user_id: int = Query(...), db: Session = Depends(get_db)):
    """Synchroniser tous les flux d'une collection"""
    try:
        membership = db.query(CollectionMember).filter(
            CollectionMember.collection_id == collection_id,
            CollectionMember.user_id == user_id
        ).first()
        
        if not membership:
            raise HTTPException(status_code=403, detail="Accès refusé à cette collection")
        
        collection_feeds = db.query(CollectionFeed, Feed).join(
            Feed, CollectionFeed.feed_id == Feed.id
        ).filter(
            CollectionFeed.collection_id == collection_id,
            Feed.is_active == True
        ).all()
        
        total_articles_added = 0
        total_articles_updated = 0
        feeds_processed = 0
        
        for collection_feed, feed in collection_feeds:
            try:
                rss_feed = feedparser.parse(feed.url)
                articles_added = 0
                articles_updated = 0

                for entry in reversed(rss_feed.entries):
                    link = entry.get("link", "")
                    if link:
                        existing = db.query(Article).filter(Article.link == link).first()
                        if not existing:
                            new_article = Article(
                                title=entry.get("title", "Sans Titre"),
                                link=link,
                                published=entry.get("published", ""),
                                author=entry.get("author", ""),
                                summary=entry.get("summary", "")[:800] if entry.get("summary") else "",
                                feed_id=feed.id
                            )
                            db.add(new_article)
                            articles_added += 1
                        else:
                            existing.title = entry.get("title", existing.title)
                            existing.published = entry.get("published", existing.published)
                            existing.summary = entry.get("summary", existing.summary)[:800] if entry.get("summary") else existing.summary
                            articles_updated += 1

                feed.last_updated = get_french_time()
                total_articles_added += articles_added
                total_articles_updated += articles_updated
                feeds_processed += 1
                
            except Exception as e:
                print(f"Erreur lors du traitement du flux {feed.id}: {e}")
                continue

        db.commit()
        
        final_message = f"Synchronisation collection terminée ! {feeds_processed} flux traités, {total_articles_added} nouveaux articles, {total_articles_updated} mis à jour"

        return {
            "message": final_message,
            "collection_id": collection_id,
            "feeds_processed": feeds_processed,
            "total_articles_added": total_articles_added,
            "total_articles_updated": total_articles_updated
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur synchronisation: {str(e)}")

# main.py - PARTIE 12: MESSAGERIE ET OUTILS

@app.post("/collections/{collection_id}/messages")
async def send_collection_message(collection_id: int, request: Request, user_id: int = Query(...), db: Session = Depends(get_db)):
    """Envoyer un message dans une collection"""
    try:
        body = await request.body()
        json_data = json.loads(body) if body else {}
        
        message_text = json_data.get('message', '').strip()
        article_id = json_data.get('article_id')
        
        if not message_text:
            return {"success": False, "error": "Le message ne peut pas être vide"}
        
        membership = db.query(CollectionMember).filter(
            CollectionMember.collection_id == collection_id,
            CollectionMember.user_id == user_id
        ).first()
        
        if not membership:
            return {"success": False, "error": "Vous n'êtes pas membre de cette collection"}
        
        new_message = CollectionMessage(
            collection_id=collection_id,
            user_id=user_id,
            message=message_text,
            article_id=article_id if article_id else None
        )
        
        db.add(new_message)
        db.commit()
        db.refresh(new_message)
        
        return {
            "success": True,
            "message": "Message envoyé avec succès",
            "data": {
                "id": new_message.id,
                "collection_id": collection_id,
                "user_id": user_id,
                "message": new_message.message,
                "article_id": new_message.article_id,
                "created_at": new_message.created_at.isoformat()
            }
        }
    
    except Exception as e:
        return {"success": False, "error": f"Erreur serveur: {str(e)}"}

@app.get("/collections/{collection_id}/messages")
async def get_collection_messages(collection_id: int, user_id: int = Query(...), article_id: int = Query(None), db: Session = Depends(get_db)):
    """Récupérer les messages d'une collection"""
    try:
        membership = db.query(CollectionMember).filter(
            CollectionMember.collection_id == collection_id,
            CollectionMember.user_id == user_id
        ).first()
        
        if not membership:
            raise HTTPException(status_code=403, detail="Accès refusé à cette collection")
        
        query = db.query(CollectionMessage, User).join(
            User, CollectionMessage.user_id == User.id
        ).filter(CollectionMessage.collection_id == collection_id)
        
        if article_id:
            query = query.filter(CollectionMessage.article_id == article_id)
        else:
            query = query.filter(CollectionMessage.article_id.is_(None))
        
        messages_query = query.order_by(CollectionMessage.created_at.desc()).all()
        
        messages = []
        for message, user in messages_query:
            messages.append({
                "id": message.id,
                "user_id": user.id,
                "username": user.username,
                "message": message.message,
                "article_id": message.article_id,
                "created_at": format_date_for_display(message.created_at.isoformat())
            })
        
        return {
            "collection_id": collection_id,
            "article_id": article_id,
            "messages": messages
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur récupération messages: {str(e)}")

@app.get("/collections/{collection_id}/members")
async def get_collection_members(collection_id: int, user_id: int = Query(...), db: Session = Depends(get_db)):
    """Récupérer les membres d'une collection"""
    try:
        membership = db.query(CollectionMember).filter(
            CollectionMember.collection_id == collection_id,
            CollectionMember.user_id == user_id
        ).first()
        
        if not membership:
            raise HTTPException(status_code=403, detail="Accès refusé à cette collection")
        
        members_query = db.query(CollectionMember, User).join(
            User, CollectionMember.user_id == User.id
        ).filter(CollectionMember.collection_id == collection_id).all()
        
        members = []
        for member, user in members_query:
            members.append({
                "user_id": user.id,
                "username": user.username,
                "email": user.email,
                "permissions": member.permissions,
                "joined_at": format_date_for_display(member.joined_at.isoformat())
            })
        
        return {
            "collection_id": collection_id,
            "members": members
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur récupération membres: {str(e)}")

@app.post("/collections/{collection_id}/clean-duplicates")
async def clean_collection_duplicates(collection_id: int, user_id: int = Query(...), db: Session = Depends(get_db)):
    """Nettoyer les articles en double dans une collection"""
    try:
        membership = db.query(CollectionMember).filter(
            CollectionMember.collection_id == collection_id,
            CollectionMember.user_id == user_id,
            CollectionMember.permissions.in_(["admin", "write"])
        ).first()
        
        if not membership:
            raise HTTPException(status_code=403, detail="Permissions insuffisantes")
        
        collection_feeds = db.query(CollectionFeed).filter(
            CollectionFeed.collection_id == collection_id
        ).all()
        
        feed_ids = [cf.feed_id for cf in collection_feeds]
        
        if not feed_ids:
            return {"message": "Aucun flux dans cette collection"}
        
        duplicates_removed = 0
        articles = db.query(Article).filter(Article.feed_id.in_(feed_ids)).all()
        
        url_groups = {}
        for article in articles:
            if article.link in url_groups:
                url_groups[article.link].append(article)
            else:
                url_groups[article.link] = [article]
        
        for url, article_group in url_groups.items():
            if len(article_group) > 1:
                article_group.sort(key=lambda x: x.created_at, reverse=True)
                
                for article_to_delete in article_group[1:]:
                    db.delete(article_to_delete)
                    duplicates_removed += 1
        
        db.commit()
        
        return {
            "message": f"Nettoyage terminé: {duplicates_removed} doublons supprimés",
            "duplicates_removed": duplicates_removed
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur nettoyage: {str(e)}")

# main.py - PARTIE 13: FILTRAGE ET POINT D'ENTRÉE

@app.get("/collections/{collection_id}/articles/filter")
async def filter_collection_articles(
    collection_id: int,
    user_id: int = Query(...),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    read: bool = Query(None),
    favorite: bool = Query(None),
    search: str = Query(""),
    days: int = Query(None),
    feed_id: int = Query(None),
    tags: str = Query(""),
    db: Session = Depends(get_db)
):
    """Filtrer les articles d'une collection selon différents critères"""
    try:
        membership = db.query(CollectionMember).filter(
            CollectionMember.collection_id == collection_id,
            CollectionMember.user_id == user_id
        ).first()
        
        if not membership:
            raise HTTPException(status_code=403, detail="Accès refusé à cette collection")
        
        collection_feeds = db.query(CollectionFeed).filter(
            CollectionFeed.collection_id == collection_id
        ).all()
        
        allowed_feed_ids = []
        for cf in collection_feeds:
            if check_feed_permission(db, collection_id, cf.feed_id, user_id, "read"):
                allowed_feed_ids.append(cf.feed_id)
        
        if not allowed_feed_ids:
            return {
                "collection_id": collection_id,
                "pagination": {"current_page": page, "per_page": per_page, "total_articles": 0, "total_pages": 0, "has_next": False, "has_previous": False},
                "articles": []
            }
        
        query = db.query(Article, Feed).join(
            Feed, Article.feed_id == Feed.id
        ).filter(Article.feed_id.in_(allowed_feed_ids))
        
        if read is not None:
            query = query.filter(Article.is_read == read)
        if favorite is not None:
            query = query.filter(Article.is_favorite == favorite)
        if search:
            search_term = f"%{search}%"
            query = query.filter(or_(
                Article.title.ilike(search_term),
                Article.summary.ilike(search_term),
                Article.author.ilike(search_term),
                Feed.title.ilike(search_term)
            ))
        if feed_id:
            query = query.filter(Article.feed_id == feed_id)
        if tags:
            tags_term = f"%{tags}%"
            query = query.filter(Feed.tags.ilike(tags_term))
        if days:
            cutoff_date = datetime.utcnow() - timedelta(days=days)
            query = query.filter(Article.created_at >= cutoff_date)
        
        all_results = query.all()
        
        articles_list = []
        for article, feed in all_results:
            article.feed = feed
            articles_list.append(article)
        
        articles_list.sort(key=get_sort_key, reverse=True)
        
        total_articles = len(articles_list)
        total_pages = (total_articles + per_page - 1) // per_page
        start_idx = (page - 1) * per_page
        end_idx = start_idx + per_page
        paginated_articles = articles_list[start_idx:end_idx]
        
        return {
            "collection_id": collection_id,
            "pagination": {
                "current_page": page,
                "per_page": per_page,
                "total_articles": total_articles,
                "total_pages": total_pages,
                "has_next": page < total_pages,
                "has_previous": page > 1
            },
            "articles": [
                {
                    "id": article.id,
                    "title": article.title,
                    "link": article.link,
                    "published": format_date_for_display(article.published) if article.published else article.created_at.strftime("%d/%m/%Y %H:%M"),
                    "author": article.author,
                    "summary": article.summary[:400] + "..." if len(article.summary) > 400 else article.summary,
                    "is_read": article.is_read,
                    "is_favorite": article.is_favorite,
                    "created_at": article.created_at.isoformat(),
                    "feed": {
                        "id": article.feed.id,
                        "title": article.feed.title,
                        "url": article.feed.url,
                        "tags": getattr(article.feed, 'tags', "") or ""
                    },
                    "user_permissions": {
                        "can_read": check_feed_permission(db, collection_id, article.feed_id, user_id, "read"),
                        "can_modify": check_feed_permission(db, collection_id, article.feed_id, user_id, "modify"),
                        "can_delete": check_feed_permission(db, collection_id, article.feed_id, user_id, "delete")
                    }
                }
                for article in paginated_articles
            ]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur filtrage articles: {str(e)}")

@app.delete("/collections/{collection_id}/members/{user_id}")
async def remove_member_from_collection(
    collection_id: int, 
    user_id: int, 
    requester_id: int = Query(...), 
    db: Session = Depends(get_db)
):
    """Retirer un membre d'une collection (seuls les propriétaires peuvent retirer)"""
    try:
        # Vérifier que le requérant est propriétaire de la collection
        collection = db.query(Collection).filter(Collection.id == collection_id).first()
        if not collection or collection.owner_id != requester_id:
            raise HTTPException(status_code=403, detail="Seul le propriétaire peut retirer des membres")
        
        # Vérifier que le membre à retirer n'est pas le propriétaire
        if user_id == collection.owner_id:
            raise HTTPException(status_code=400, detail="Impossible de retirer le propriétaire")
        
        # Supprimer le membre
        membership = db.query(CollectionMember).filter(
            CollectionMember.collection_id == collection_id,
            CollectionMember.user_id == user_id
        ).first()
        
        if not membership:
            raise HTTPException(status_code=404, detail="Membre non trouvé")
        
        db.delete(membership)
        db.commit()
        
        return {"message": "Membre retiré avec succès"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")
    
@app.patch("/collections/{collection_id}/members/{user_id}/permissions")
async def update_member_permissions(
    collection_id: int, 
    user_id: int, 
    permission_data: dict,
    requester_id: int = Query(...), 
    db: Session = Depends(get_db)
):
    """Modifier les permissions d'un membre (seuls les propriétaires peuvent modifier)"""
    try:
        # Vérifier que le requérant est propriétaire
        collection = db.query(Collection).filter(Collection.id == collection_id).first()
        if not collection or collection.owner_id != requester_id:
            raise HTTPException(status_code=403, detail="Seul le propriétaire peut modifier les permissions")
        
        # Trouver le membership à modifier
        membership = db.query(CollectionMember).filter(
            CollectionMember.collection_id == collection_id,
            CollectionMember.user_id == user_id
        ).first()
        
        if not membership:
            raise HTTPException(status_code=404, detail="Membre non trouvé")
        
        # Ne pas modifier les permissions du propriétaire
        if user_id == collection.owner_id:
            raise HTTPException(status_code=400, detail="Impossible de modifier les droits du propriétaire")
        
        # Mettre à jour les permissions
        membership.permissions = permission_data.get('permissions', 'read')
        db.commit()
        
        return {"message": "Permissions mises à jour"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@app.delete("/collections/{collection_id}/members/{user_id}")
async def remove_member_from_collection(
    collection_id: int, 
    user_id: int, 
    requester_id: int = Query(...), 
    db: Session = Depends(get_db)
):
    """Retirer un membre d'une collection (seuls les propriétaires peuvent retirer)"""
    try:
        # Vérifier que le requérant est propriétaire
        collection = db.query(Collection).filter(Collection.id == collection_id).first()
        if not collection or collection.owner_id != requester_id:
            raise HTTPException(status_code=403, detail="Seul le propriétaire peut retirer des membres")
        
        # Ne pas retirer le propriétaire
        if user_id == collection.owner_id:
            raise HTTPException(status_code=400, detail="Impossible de retirer le propriétaire")
        
        # Supprimer le membre
        membership = db.query(CollectionMember).filter(
            CollectionMember.collection_id == collection_id,
            CollectionMember.user_id == user_id
        ).first()
        
        if not membership:
            raise HTTPException(status_code=404, detail="Membre non trouvé")
        
        db.delete(membership)
        db.commit()
        
        return {"message": "Membre retiré avec succès"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


@app.get("/users/{user_id}/export/opml")
async def export_feeds_opml(user_id: int, db: Session = Depends(get_db)):
    """Exporter les flux d'un utilisateur au format OPML"""
    try:
        # Vérifier que l'utilisateur existe
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

        # Récupérer les flux de l'utilisateur
        feeds = db.query(Feed).filter(Feed.owner_id == user_id).all()
        
        # Créer le document OPML
        root = ET.Element("opml", version="1.0")
        head = ET.SubElement(root, "head")
        title = ET.SubElement(head, "title")
        title.text = f"Flux RSS de {user.username} - SUPRSS Export"
        
        body = ET.SubElement(root, "body")
        
        for feed in feeds:
            outline = ET.SubElement(body, "outline", 
                                  text=feed.title,
                                  title=feed.title,
                                  type="rss",
                                  xmlUrl=feed.url,
                                  htmlUrl=feed.url)
            
            if feed.description:
                outline.set("description", feed.description)
            if feed.tags:
                outline.set("category", feed.tags)
        
        # Convertir en string
        xml_str = ET.tostring(root, encoding='unicode', xml_declaration=True)
        
        return Response(
            content=xml_str,
            media_type="application/xml",
            headers={"Content-Disposition": f"attachment; filename=suprss_feeds_{user.username}.opml"}
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de l'export OPML: {str(e)}")

@app.get("/users/{user_id}/export/json")
async def export_feeds_json(user_id: int, db: Session = Depends(get_db)):
    """Exporter les flux d'un utilisateur au format JSON"""
    try:
        # Vérifier que l'utilisateur existe
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

        # Récupérer les flux de l'utilisateur
        feeds = db.query(Feed).filter(Feed.owner_id == user_id).all()
        
        export_data = {
            "export_info": {
                "user": user.username,
                "export_date": get_french_time().isoformat(),
                "source": "SUPRSS",
                "feeds_count": len(feeds)
            },
            "feeds": []
        }
        
        for feed in feeds:
            export_data["feeds"].append({
                "title": feed.title,
                "url": feed.url,
                "description": feed.description or "",
                "tags": feed.tags or "",
                "update_frequency": feed.update_frequency,
                "is_active": feed.is_active,
                "created_at": feed.created_at.isoformat(),
                "last_updated": feed.last_updated.isoformat() if feed.last_updated else None
            })
        
        json_str = json.dumps(export_data, indent=2, ensure_ascii=False)
        
        return Response(
            content=json_str,
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename=suprss_feeds_{user.username}.json"}
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de l'export JSON: {str(e)}")

@app.get("/users/{user_id}/export/csv")
async def export_feeds_csv(user_id: int, db: Session = Depends(get_db)):
    """Exporter les flux d'un utilisateur au format CSV"""
    try:
        # Vérifier que l'utilisateur existe
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

        # Récupérer les flux de l'utilisateur
        feeds = db.query(Feed).filter(Feed.owner_id == user_id).all()
        
        # Créer le CSV
        output = StringIO()
        writer = csv.writer(output)
        
        # En-têtes
        writer.writerow([
            "Titre", "URL", "Description", "Tags", 
            "Fréquence_MAJ", "Actif", "Date_Création", "Dernière_MAJ"
        ])
        
        # Données
        for feed in feeds:
            writer.writerow([
                feed.title,
                feed.url,
                feed.description or "",
                feed.tags or "",
                feed.update_frequency,
                "Oui" if feed.is_active else "Non",
                feed.created_at.strftime("%d/%m/%Y %H:%M"),
                feed.last_updated.strftime("%d/%m/%Y %H:%M") if feed.last_updated else ""
            ])
        
        csv_content = output.getvalue()
        output.close()
        
        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=suprss_feeds_{user.username}.csv"}
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de l'export CSV: {str(e)}")

# ENDPOINTS D'IMPORT

@app.post("/users/{user_id}/import/opml")
async def import_feeds_opml(user_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Importer des flux depuis un fichier OPML"""
    try:
        # Vérifier que l'utilisateur existe
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

        # Lire le fichier
        content = await file.read()
        
        try:
            root = ET.fromstring(content.decode('utf-8'))
        except Exception as e:
            raise HTTPException(status_code=400, detail="Fichier OPML invalide")
        
        imported_count = 0
        skipped_count = 0
        errors = []
        
        # Parser les flux
        for outline in root.findall(".//outline[@type='rss']") + root.findall(".//outline[@xmlUrl]"):
            try:
                title = outline.get('text') or outline.get('title', 'Flux sans titre')
                xml_url = outline.get('xmlUrl')
                
                if not xml_url:
                    continue
                
                # Vérifier si le flux existe déjà
                existing = db.query(Feed).filter(
                    Feed.url == xml_url, 
                    Feed.owner_id == user_id
                ).first()
                
                if existing:
                    skipped_count += 1
                    continue
                
                new_feed = Feed(
                    title=title,
                    url=xml_url,
                    description=outline.get('description', ''),
                    tags=outline.get('category', ''),
                    owner_id=user_id,
                    update_frequency=60
                )
                
                db.add(new_feed)
                imported_count += 1
                
            except Exception as e:
                errors.append(f"Erreur sur flux '{title}': {str(e)}")
        
        db.commit()
        
        return {
            "message": f"Import terminé: {imported_count} flux importés, {skipped_count} ignorés",
            "imported": imported_count,
            "skipped": skipped_count,
            "errors": errors[:5]  # Limiter les erreurs affichées
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de l'import OPML: {str(e)}")

@app.post("/users/{user_id}/import/json")
async def import_feeds_json(user_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Importer des flux depuis un fichier JSON"""
    try:
        # Vérifier que l'utilisateur existe
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

        # Lire le fichier
        content = await file.read()
        
        try:
            data = json.loads(content.decode('utf-8'))
        except Exception as e:
            raise HTTPException(status_code=400, detail="Fichier JSON invalide")
        
        if 'feeds' not in data:
            raise HTTPException(status_code=400, detail="Format JSON invalide: clé 'feeds' manquante")
        
        imported_count = 0
        skipped_count = 0
        errors = []
        
        for feed_data in data['feeds']:
            try:
                title = feed_data.get('title', 'Flux sans titre')
                url = feed_data.get('url')
                
                if not url:
                    continue
                
                # Vérifier si le flux existe déjà
                existing = db.query(Feed).filter(
                    Feed.url == url, 
                    Feed.owner_id == user_id
                ).first()
                
                if existing:
                    skipped_count += 1
                    continue
                
                new_feed = Feed(
                    title=title,
                    url=url,
                    description=feed_data.get('description', ''),
                    tags=feed_data.get('tags', ''),
                    update_frequency=feed_data.get('update_frequency', 60),
                    owner_id=user_id
                )
                
                db.add(new_feed)
                imported_count += 1
                
            except Exception as e:
                errors.append(f"Erreur sur flux '{title}': {str(e)}")
        
        db.commit()
        
        return {
            "message": f"Import terminé: {imported_count} flux importés, {skipped_count} ignorés",
            "imported": imported_count,
            "skipped": skipped_count,
            "errors": errors[:5]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de l'import JSON: {str(e)}")

@app.post("/users/{user_id}/import/csv")
async def import_feeds_csv(user_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Importer des flux depuis un fichier CSV"""
    try:
        # Vérifier que l'utilisateur existe
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

        # Lire le fichier
        content = await file.read()
        
        try:
            csv_content = content.decode('utf-8')
            csv_reader = csv.DictReader(StringIO(csv_content))
        except Exception as e:
            raise HTTPException(status_code=400, detail="Fichier CSV invalide")
        
        imported_count = 0
        skipped_count = 0
        errors = []
        
        for row in csv_reader:
            try:
                title = row.get('Titre', 'Flux sans titre')
                url = row.get('URL')
                
                if not url:
                    continue
                
                # Vérifier si le flux existe déjà
                existing = db.query(Feed).filter(
                    Feed.url == url, 
                    Feed.owner_id == user_id
                ).first()
                
                if existing:
                    skipped_count += 1
                    continue
                
                # Convertir la fréquence
                try:
                    frequency = int(row.get('Fréquence_MAJ', 60))
                except:
                    frequency = 60
                
                new_feed = Feed(
                    title=title,
                    url=url,
                    description=row.get('Description', ''),
                    tags=row.get('Tags', ''),
                    update_frequency=frequency,
                    owner_id=user_id
                )
                
                db.add(new_feed)
                imported_count += 1
                
            except Exception as e:
                errors.append(f"Erreur sur flux '{title}': {str(e)}")
        
        db.commit()
        
        return {
            "message": f"Import terminé: {imported_count} flux importés, {skipped_count} ignorés",
            "imported": imported_count,
            "skipped": skipped_count,
            "errors": errors[:5]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de l'import CSV: {str(e)}")

# POINT D'ENTRÉE
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)