from fastapi import FastAPI, HTTPException, Depends, Query, Request
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
from models import Base, User, Feed, Article, Collection, CollectionMember, CollectionFeed, CollectionMessage

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
    
# Modèles Pydantic
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
    
@app.post("/auth/google")
async def google_oauth(auth_data: GoogleAuthRequest, db: Session = Depends(get_db)):
    """Authentification via Google OAuth2"""
    try:
        from auth import hash_password

        if GOOGLE_AUTH_AVAILABLE:
            try:
                GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "878235537833-s6enkhp3r37kjjmaqbiiepia0sv5gq1i.apps.googleusercontent.com")
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

        return {"message": "Article favorite status updated", "article_id": article_id, "is_favorite": favorite_status}
    except Exception as e: 
        return {"error": f"Error: {str(e)}"}
    
# COLLECTIONS PARTAGÉES

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

@app.post("/collections/{collection_id}/feeds")
async def add_feed_to_collection(collection_id: int, feed_data: CollectionFeedAdd, user_id: int = Query(...), db: Session = Depends(get_db)):
    """Ajouter un flux à une collection"""
    try:
        # Vérifier les permissions de l'utilisateur
        membership = db.query(CollectionMember).filter(
            CollectionMember.collection_id == collection_id,
            CollectionMember.user_id == user_id,
            CollectionMember.permissions.in_(["admin", "write"])
        ).first()
        
        if not membership:
            raise HTTPException(status_code=403, detail="Permissions insuffisantes")
        
        # Créer ou trouver le flux
        existing_feed = db.query(Feed).filter(Feed.url == feed_data.feed_url).first()
        
        if not existing_feed:
            # Créer un nouveau flux
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
        
        # Vérifier si le flux n'est pas déjà dans la collection
        existing_collection_feed = db.query(CollectionFeed).filter(
            CollectionFeed.collection_id == collection_id,
            CollectionFeed.feed_id == feed_to_add.id
        ).first()
        
        if existing_collection_feed:
            raise HTTPException(status_code=400, detail="Ce flux est déjà dans la collection")
        
        # Ajouter le flux à la collection
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
    """Récupérer les flux d'une collection"""
    try:
        # Vérifier l'accès à la collection
        membership = db.query(CollectionMember).filter(
            CollectionMember.collection_id == collection_id,
            CollectionMember.user_id == user_id
        ).first()
        
        if not membership:
            raise HTTPException(status_code=403, detail="Accès refusé à cette collection")
        
        # Récupérer les flux de la collection avec informations sur qui les a ajoutés
        feeds_query = db.query(CollectionFeed, Feed, User).join(
            Feed, CollectionFeed.feed_id == Feed.id
        ).join(
            User, CollectionFeed.added_by_user_id == User.id
        ).filter(
            CollectionFeed.collection_id == collection_id
        ).all()
        
        feeds_list = []
        for collection_feed, feed, added_by_user in feeds_query:
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
                "added_at": format_date_for_display(collection_feed.added_at.isoformat())
            })
        
        return {
            "collection_id": collection_id,
            "feeds": feeds_list
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur récupération flux: {str(e)}")
    
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

        collection_feeds_query = db.query(CollectionFeed, Feed).join(
            Feed, CollectionFeed.feed_id == Feed.id
        ).filter(
            CollectionFeed.collection_id == collection_id,
            Feed.is_active == True
        ).all()
        
        if not collection_feeds_query:
            return {
                "message": f"Aucun flux actif trouvé dans la collection {collection_id}",
                "collection_id": collection_id,
                "feeds_processed": 0,
                "total_articles_added": 0,
                "total_articles_updated": 0
            }
        
        total_articles_added = 0
        total_articles_updated = 0
        feeds_processed = 0
        
        for collection_feed, feed in collection_feeds_query:
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
        raise HTTPException(status_code=500, detail=f"Erreur synchronisation collection: {str(e)}")

@app.post("/collections/{collection_id}/clean-duplicates")
async def clean_collection_duplicates(collection_id: int, user_id: int = Query(...), db: Session = Depends(get_db)):
    """Nettoyer les articles dupliqués dans une collection"""
    try:
        membership = db.query(CollectionMember).filter(
            CollectionMember.collection_id == collection_id,
            CollectionMember.user_id == user_id,
            CollectionMember.permissions.in_(["admin", "write"])
        ).first()
        
        if not membership:
            raise HTTPException(status_code=403, detail="Permissions insuffisantes")

        collection_feed_ids = db.query(CollectionFeed.feed_id).filter(
            CollectionFeed.collection_id == collection_id
        ).all()
        
        feed_ids = [cf[0] for cf in collection_feed_ids]
        
        if not feed_ids:
            return {"message": "Aucun flux dans cette collection", "duplicates_removed": 0}
        
        duplicate_links = db.query(Article.link).filter(
            Article.feed_id.in_(feed_ids)
        ).group_by(Article.link).having(func.count(Article.id) > 1).all()
        
        duplicates_removed = 0
        
        for (link,) in duplicate_links:
            articles = db.query(Article).filter(
                Article.link == link,
                Article.feed_id.in_(feed_ids)
            ).order_by(Article.created_at.asc()).all()
            
            for article in articles[1:]:
                db.delete(article)
                duplicates_removed += 1
        
        db.commit()
        
        return {
            "message": f"Nettoyage terminé : {duplicates_removed} doublons supprimés",
            "duplicates_removed": duplicates_removed
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur nettoyage: {str(e)}")
    
@app.get("/collections/{collection_id}/articles")
async def get_collection_articles(
    collection_id: int, 
    user_id: int = Query(...), 
    page: int = Query(1, ge=1), 
    per_page: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """Récupérer les articles d'une collection"""
    try:
        membership = db.query(CollectionMember).filter(
            CollectionMember.collection_id == collection_id,
            CollectionMember.user_id == user_id
        ).first()
        
        if not membership:
            raise HTTPException(status_code=403, detail="Accès refusé à cette collection")
        
        collection_feed_ids = db.query(CollectionFeed.feed_id).filter(
            CollectionFeed.collection_id == collection_id
        ).all()
        
        feed_ids = [cf[0] for cf in collection_feed_ids]
        
        if not feed_ids:
            return {
                "collection_id": collection_id,
                "user_permissions": membership.permissions,
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
        
        all_articles = db.query(Article).filter(Article.feed_id.in_(feed_ids)).all()
        
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
            "collection_id": collection_id,
            "user_permissions": membership.permissions,
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
        raise HTTPException(status_code=500, detail=f"Erreur récupération articles collection: {str(e)}")

@app.get("/collections/{collection_id}/articles/filter")
async def filter_collection_articles(
    collection_id: int, 
    user_id: int = Query(...), 
    page: int = Query(1, ge=1), 
    per_page: int = Query(20, ge=1, le=100), 
    read: bool = Query(None), 
    favorite: bool = Query(None), 
    search: str = Query(None), 
    days: int = Query(None), 
    feed_id: int = Query(None), 
    tags: str = Query(None),
    db: Session = Depends(get_db)
):
    """Filtrer les articles d'une collection"""
    try:
        membership = db.query(CollectionMember).filter(
            CollectionMember.collection_id == collection_id,
            CollectionMember.user_id == user_id
        ).first()
        
        if not membership:
            raise HTTPException(status_code=403, detail="Accès refusé à cette collection")
        
        collection_feed_ids = db.query(CollectionFeed.feed_id).filter(
            CollectionFeed.collection_id == collection_id
        ).all()
        
        feed_ids = [cf[0] for cf in collection_feed_ids]
        
        if not feed_ids:
            return {
                "collection_id": collection_id,
                "filters": {"read": read, "favorite": favorite, "search": search, "days": days, "feed_id": feed_id, "tags": tags},
                "pagination": {"current_page": page, "per_page": per_page, "total_articles": 0, "total_pages": 0, "has_next": False, "has_previous": False},
                "articles": []
            }
        
        query = db.query(Article).filter(Article.feed_id.in_(feed_ids))
        
        if read is not None:
            query = query.filter(Article.is_read == read)
        if favorite is not None:
            query = query.filter(Article.is_favorite == favorite)
        if search:
            query = query.filter(
                (Article.title.ilike(f"%{search}%")) |
                (Article.summary.ilike(f"%{search}%"))
            )
        if days is not None:
            cutoff_date = get_french_time() - timedelta(days=days)
            query = query.filter(Article.created_at >= cutoff_date)
        if feed_id is not None and feed_id in feed_ids:
            query = query.filter(Article.feed_id == feed_id)
        if tags:
            feeds_with_tag = db.query(Feed.id).filter(
                Feed.id.in_(feed_ids),
                or_(
                    Feed.tags.ilike(f"%{tags}%"),
                    Feed.tags.ilike(f"{tags},%"),
                    Feed.tags.ilike(f"%, {tags},%"),
                    Feed.tags.ilike(f"%, {tags}"),
                    Feed.tags == tags
                )
            ).all()
            feed_ids_with_tag = [f[0] for f in feeds_with_tag]
            if feed_ids_with_tag:
                query = query.filter(Article.feed_id.in_(feed_ids_with_tag))
            else:
                return {
                    "collection_id": collection_id,
                    "filters": {"read": read, "favorite": favorite, "search": search, "days": days, "feed_id": feed_id, "tags": tags},
                    "pagination": {"current_page": page, "per_page": per_page, "total_articles": 0, "total_pages": 0, "has_next": False, "has_previous": False},
                    "articles": []
                }
        
        all_filtered_articles = query.all()
        
        for article in all_filtered_articles:
            if not hasattr(article, 'feed') or article.feed is None:
                article.feed = db.query(Feed).filter(Feed.id == article.feed_id).first()
        
        all_filtered_articles.sort(key=get_sort_key, reverse=True)
        
        total_articles = len(all_filtered_articles)
        total_pages = (total_articles + per_page - 1) // per_page
        start_idx = (page - 1) * per_page
        end_idx = start_idx + per_page
        articles = all_filtered_articles[start_idx:end_idx]
        
        return {
            "collection_id": collection_id,
            "user_permissions": membership.permissions,
            "filters": {"read": read, "favorite": favorite, "search": search, "days": days, "feed_id": feed_id, "tags": tags},
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
                    } if article.feed else None
                }
                for article in articles
            ]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur filtrage articles collection: {str(e)}")

@app.get("/collections/{collection_id}/members")
async def get_collection_members(collection_id: int, user_id: int = Query(...), db: Session = Depends(get_db)):
    """Récupérer les membres d'une collection"""
    try:
        user_membership = db.query(CollectionMember).filter(
            CollectionMember.collection_id == collection_id,
            CollectionMember.user_id == user_id
        ).first()
        
        if not user_membership:
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
            "members": members,
            "user_permissions": user_membership.permissions
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur récupération membres: {str(e)}")

# MESSAGERIE CORRIGÉE - CORRECTION PRINCIPALE POUR [object Object]
@app.post("/collections/{collection_id}/messages")
async def send_collection_message(collection_id: int, request: Request, user_id: int = Query(...), db: Session = Depends(get_db)):
    """Envoyer un message dans une collection - VERSION CORRIGÉE FINALE"""
    try:
        # Lire les données JSON manuellement comme dans l'endpoint debug
        body = await request.body()
        json_data = json.loads(body) if body else {}
        
        print(f"DEBUG: Tentative d'envoi message - Collection: {collection_id}, User: {user_id}")
        print(f"DEBUG: Données reçues: {json_data}")
        
        message_text = json_data.get('message', '').strip()
        article_id = json_data.get('article_id')
        
        # Vérifications de base
        if not message_text:
            return {"success": False, "error": "Le message ne peut pas être vide"}
        
        # Vérifier l'appartenance à la collection
        membership = db.query(CollectionMember).filter(
            CollectionMember.collection_id == collection_id,
            CollectionMember.user_id == user_id
        ).first()
        
        if not membership:
            return {"success": False, "error": "Vous n'êtes pas membre de cette collection"}
        
        # Créer le message
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
        print(f"DEBUG: Erreur: {str(e)}")
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)