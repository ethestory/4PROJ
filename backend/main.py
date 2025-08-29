from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import feedparser
from datetime import datetime, timedelta
import dateutil.parser
import json
import csv
from io import StringIO
import xml.etree.ElementTree as ET
import os
import secrets
import string

# Imports pour Google OAuth2
try:
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token
    GOOGLE_AUTH_AVAILABLE = True
except ImportError:
    GOOGLE_AUTH_AVAILABLE = False
    print("Google Auth libraries not available. OAuth2 will use basic verification.")

def format_date_for_display(date_string):
    """Convertit une date RSS en format DD/MM/YYYY HH:MM heure française"""
    if not date_string:
        return ""
    try:
        parsed_date = dateutil.parser.parse(date_string)
        is_utc = (
            date_string.endswith('Z') or 
            '+00:00' in date_string or 
            'GMT' in date_string or
            'UTC' in date_string or
            (parsed_date.tzinfo is not None and parsed_date.utcoffset().total_seconds() == 0)
        )
        
        if is_utc:
            now = datetime.now()
            offset_hours = 2 if (now.month >= 4 and now.month <= 9) else 1
            french_date = parsed_date.replace(tzinfo=None) + timedelta(hours=offset_hours)
        else:
            french_date = parsed_date.replace(tzinfo=None)
        
        return french_date.strftime("%d/%m/%Y %H:%M")
    except Exception:
        return date_string

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

# Initialisation FastAPI
app = FastAPI(
    title="SUPRSS API",
    description="API pour la gestion de flux RSS avec OAuth2",
    version="1.0.0"
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

@app.post("/auth/google")
async def google_oauth(auth_data: GoogleAuthRequest):
    """Authentification via Google OAuth2"""
    try:
        from database import SessionLocal
        from models import User
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
        
        db = SessionLocal()
        try:
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
        finally:
            db.close()
    except Exception as e:
        print(f"Erreur OAuth Google: {str(e)}")
        return {
            "success": False,
            "error": f"Erreur lors de l'authentification Google: {str(e)}",
            "user": None
        }

@app.post("/feeds")
async def create_feed(feed_data: FeedCreate):
    try:
        from database import SessionLocal
        from models import Feed 

        db = SessionLocal()
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
        db.close()

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
async def get_user_feeds(user_id: int):
    try:
        from database import SessionLocal
        from models import Feed

        db = SessionLocal()
        try:
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
                    "last_updated": feed.last_updated.isoformat() if hasattr(feed, 'last_updated') and feed.last_updated else None,
                    "created_at": feed.created_at.isoformat()
                })
            
            return {
                "user_id": user_id,
                "feeds_count": len(feeds),
                "feeds": feeds_list
            }
        finally:
            db.close()
    except Exception as e:
        return {"error": f"Error fetching user feeds: {str(e)}"}

@app.post("/users/{user_id}/fetch-all-articles")
async def fetch_all_user_articles(user_id: int):
    try:
        from database import SessionLocal
        from models import Feed, Article
        import feedparser
        from datetime import datetime

        db = SessionLocal()
        total_articles_added = 0
        total_articles_updated = 0
        feeds_processed = 0

        try:
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

                    feed.last_updated = datetime.utcnow()
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
        finally:
            db.close()
    except Exception as e:
        return {"error": f"Error fetching all user articles: {str(e)}"}

@app.get("/users/{user_id}/articles")
async def get_user_articles(user_id: int, page: int = 1, per_page: int = 20):
    try:
        from database import SessionLocal
        from models import Feed, Article

        db = SessionLocal()
        try:
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
        finally:
            db.close()
    except Exception as e:
        return {"error": f"Error fetching user articles: {str(e)}"}

@app.post("/login")
async def login(user_data: UserLogin):
    try:
        from database import SessionLocal
        from models import User
        from auth import verify_password

        db = SessionLocal()
        try:
            user = db.query(User).filter(User.username == user_data.username).first()
            if not user:
                return {"error": "Invalid username"}
            
            if not verify_password(user_data.password, user.hashed_password):
                return {"error": "Invalid password"}
            
            return {"message": f"Welcome {user.username}!", "user_id": user.id}
        finally:
            db.close() 
    except Exception as e:
        return {"error": f"Login failed: {str(e)}"}

@app.post("/register")
async def register(user_data: UserCreate):
    try:
        from database import SessionLocal
        from models import User
        from auth import hash_password

        db = SessionLocal()
        try:
            existing = db.query(User).filter(User.username == user_data.username).first()
            if existing:
                return {"error": "Username already exists"}
            
            hashed_pwd = hash_password(user_data.password)
            new_user = User(
                username=user_data.username,
                email=user_data.email,
                hashed_password=hashed_pwd
            )

            db.add(new_user)
            db.commit()

            return {"message": f"User {user_data.username} created successfully"}
        finally: 
            db.close()
    except Exception as e:
       return {"error": f"Registration failed: {str(e)}"}

@app.patch("/articles/{article_id}/read")
async def toggle_article_read(article_id: int, read_status: bool = True):
    try:
        from database import SessionLocal
        from models import Article

        db = SessionLocal()
        try:
            article = db.query(Article).filter(Article.id == article_id).first()
            if not article:
                return {"error": "Article not found"}
            
            article.is_read = read_status
            db.commit()

            return {"message": "Article status updated", "article_id": article_id, "is_read": read_status}
        finally:
            db.close()
    except Exception as e:
        return {"error": f"Error: {str(e)}"}
    
@app.patch("/articles/{article_id}/favorite")
async def toggle_article_favorite(article_id: int, favorite_status: bool = True):
    try:
        from database import SessionLocal
        from models import Article

        db = SessionLocal()
        try:
            article = db.query(Article).filter(Article.id == article_id).first()
            if not article: 
                return {"error": "Article not found"}
            
            article.is_favorite = favorite_status
            db.commit()

            return {"message": "Article favorite status updated", "article_id": article_id, "is_favorite": favorite_status}
        finally: 
            db.close()
    except Exception as e: 
        return {"error": f"Error: {str(e)}"}

@app.post("/create-tables")
async def create_tables():
    try:
        from database import create_tables
        create_tables()
        return {"status": "Tables created successfully!"}
    except Exception as e:
        return {"status": f"Error creating tables: {str(e)}"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)