from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import feedparser
from datetime import datetime, timedelta
import dateutil.parser

def format_date_for_display(date_string):
    """Convertit une date RSS en format DD/MM/YYYY HH:MM heure française"""
    if not date_string:
        return ""
    try:
        # Parser la date RSS
        parsed_date = dateutil.parser.parse(date_string)
        
        # Détecter si c'est UTC en regardant la string originale
        is_utc = (
            date_string.endswith('Z') or 
            '+00:00' in date_string or 
            'GMT' in date_string or
            'UTC' in date_string or
            (parsed_date.tzinfo is not None and parsed_date.utcoffset().total_seconds() == 0)
        )
        
        # Si c'est UTC, ajouter l'offset France
        if is_utc:
            now = datetime.now()
            # Été = +2h, Hiver = +1h
            offset_hours = 2 if (now.month >= 4 and now.month <= 9) else 1
            french_date = parsed_date.replace(tzinfo=None) + timedelta(hours=offset_hours)
        else:
            # Déjà en heure locale
            french_date = parsed_date.replace(tzinfo=None)
        
        return french_date.strftime("%d/%m/%Y %H:%M")
        
    except Exception:
        return date_string

def get_sort_key(article):
    """Génère une clé de tri chronologique pour un article"""
    try:
        if article.published:
            date_str = article.published.strip()
            
            # Format français DD/MM/YYYY HH:MM
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
            
            # Format RSS standard avec même logique que format_date_for_display
            try:
                parsed_date = dateutil.parser.parse(date_str)
                
                # Détecter UTC avec même logique
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
class RSSRequest(BaseModel):
    url: str

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

# Initialisation FastAPI
app = FastAPI(
    title="SUPRSS API",
    description="API pour la gestion de flux RSS",
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

@app.get("/test-rss")
async def test_rss():
    """Test basique avec le flux du Monde"""
    try:
        feed_url = "https://www.lemonde.fr/rss/une.xml"
        feed = feedparser.parse(feed_url)
        
        return {
            "feed_title": feed.feed.get("title", "Flux sans titre"),
            "articles_count": len(feed.entries),
            "first_article": {
                "title": feed.entries[0].get("title", "Sans titre") if feed.entries else "Aucun article",
                "link": feed.entries[0].get("link", "") if feed.entries else ""
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur RSS: {str(e)}")

@app.post("/parse-rss")
async def parse_rss(request: RSSRequest):
    """Parse un flux RSS à partir de son URL"""
    try:
        feed = feedparser.parse(request.url)
        
        if feed.bozo:
            raise HTTPException(status_code=400, detail="Flux RSS invalide ou inaccessible")
        
        feed_info = {
            "title": feed.feed.get("title", "Flux sans titre"),
            "description": feed.feed.get("description", ""),
            "link": feed.feed.get("link", ""),
        }
        
        articles = []
        for entry in feed.entries[:5]:
            articles.append({
                "title": entry.get("title", "Sans titre"),
                "link": entry.get("link", ""),
                "published": entry.get("published", ""),
                "summary": entry.get("summary", "")[:200] + "..." if len(entry.get("summary", "")) > 200 else entry.get("summary", "")
            })
        
        return {
            "feed_info": feed_info,
            "total_articles": len(feed.entries),
            "articles": articles
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors du parsing: {str(e)}")

@app.get("/test-db")
async def test_database():
    try:
        from database import test_connection
        if test_connection():
            return {"status": "Database connected"}
        else:
            return {"status": "Database connection failed"}
    except Exception as e:
        return {"status": f"Database error: {str(e)}"}

@app.post("/create-tables")
async def create_tables():
    try:
        from database import create_tables
        create_tables()
        return {"status": "Tables created successfully!"}
    except Exception as e:
        return {"status": f"Error creating tables: {str(e)}"}

@app.post("/fix-existing-feeds")
async def fix_existing_feeds():
    try:
        from database import SessionLocal
        from models import Feed

        db = SessionLocal()
        try:
            feeds = db.query(Feed).all()
            updated_count = 0
            
            for feed in feeds:
                if not hasattr(feed, 'update_frequency') or feed.update_frequency is None:
                    feed.update_frequency = 60
                    updated_count += 1
                
                if not hasattr(feed, 'tags') or feed.tags is None:
                    feed.tags = ""
            
            db.commit()
            
            return {
                "message": f"Correction terminée ! {updated_count} flux mis à jour",
                "total_feeds": len(feeds)
            }
        finally:
            db.close()
    except Exception as e:
        return {"error": f"Erreur lors de la correction: {str(e)}"}

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

@app.get("/feeds")
async def get_feeds():
    try:
        from database import SessionLocal
        from models import Feed

        db = SessionLocal()
        feeds = db.query(Feed).all()    
        db.close()

        return {
            "feeds": [
                {
                    "id": feed.id,
                    "title": feed.title,
                    "url": feed.url,
                    "description": feed.description,
                    "tags": getattr(feed, 'tags', "") or "",
                    "update_frequency": getattr(feed, 'update_frequency', 60) or 60,
                    "is_active": feed.is_active,
                    "last_updated": feed.last_updated.isoformat() if hasattr(feed, 'last_updated') and feed.last_updated else None,
                    "created_at": feed.created_at.isoformat()
                }
                for feed in feeds
            ]
        }
    except Exception as e:
        return {"error": f"Error fetching feeds: {str(e)}"}

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
                user_feeds = db.query(Feed).filter(Feed.is_active == True).all()
            
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
                    
                except Exception:
                    continue

            db.commit()
            
            final_message = f"Synchronisation terminée ! {feeds_processed} flux traités, {total_articles_added} nouveaux articles, {total_articles_updated} mis à jour"

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
                all_articles = db.query(Article).all()
                
                if not all_articles:
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

@app.get("/users/{user_id}/articles/filter")
async def filter_user_articles(user_id: int, page: int = 1, per_page: int = 20, read: bool = None, favorite: bool = None, search: str = None, days: int = None, feed_id: int = None, tags: str = None):
    try:
        from database import SessionLocal
        from models import Feed, Article 
        from datetime import datetime, timedelta
        from sqlalchemy import or_

        db = SessionLocal()
        try:
            user_feed_ids = db.query(Feed.id).filter(Feed.owner_id == user_id).all()
            user_feed_ids = [feed_id_tuple[0] for feed_id_tuple in user_feed_ids]
            
            if not user_feed_ids:
                query = db.query(Article)
            else:
                query = db.query(Article).filter(Article.feed_id.in_(user_feed_ids))
            
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
                cutoff_date = datetime.utcnow() - timedelta(days=days)
                query = query.filter(Article.created_at >= cutoff_date)
            
            if feed_id is not None:
                query = query.filter(Article.feed_id == feed_id)

            # Filtrage par tags
            if tags:
                feeds_with_tag = db.query(Feed.id).filter(
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
                    if not user_feed_ids:
                        query = query.filter(Article.feed_id.in_(feed_ids_with_tag))
                    else:
                        intersection = list(set(user_feed_ids) & set(feed_ids_with_tag))
                        if intersection:
                            query = query.filter(Article.feed_id.in_(intersection))
                        else:
                            return {
                                "user_id": user_id,
                                "filters": {"read": read, "favorite": favorite, "search": search, "days": days, "feed_id": feed_id, "tags": tags},
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
                else:
                    return {
                        "user_id": user_id,
                        "filters": {"read": read, "favorite": favorite, "search": search, "days": days, "feed_id": feed_id, "tags": tags},
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
                "user_id": user_id,
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
        return {"error": f"Erreur dans le filtrage des articles utilisateur : {str(e)}"}

@app.post("/feeds/{feed_id}/refresh")
async def refresh_feed(feed_id: int):
    try:
        from database import SessionLocal
        from models import Feed, Article
        import feedparser
        from datetime import datetime

        db = SessionLocal()
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

            feed.last_updated = datetime.utcnow()
            db.commit()
            
            message = f"Flux '{feed.title}' actualisé: {articles_added} nouveaux articles, {articles_updated} mis à jour"
            
            return {
                "message": message,
                "feed_id": feed_id,
                "articles_added": articles_added,
                "articles_updated": articles_updated
            }
        finally:
            db.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de l'actualisation: {str(e)}")

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

# 🆕 ENDPOINT D'EXPORT
@app.get("/users/{user_id}/export/{format}")
async def export_user_feeds(user_id: int, format: str):
    """Export des flux utilisateur en JSON, CSV ou OPML"""
    try:
        from database import SessionLocal
        from models import Feed
        import json
        import csv
        from io import StringIO
        from datetime import datetime

        if format not in ['json', 'csv', 'opml']:
            raise HTTPException(status_code=400, detail="Format non supporté. Utilisez: json, csv, opml")

        db = SessionLocal()
        try:
            # Récupérer les flux de l'utilisateur
            user_feeds = db.query(Feed).filter(Feed.owner_id == user_id).all()
            
            if not user_feeds:
                raise HTTPException(status_code=404, detail="Aucun flux trouvé pour cet utilisateur")

            if format == 'json':
                # Export JSON
                feeds_data = []
                for feed in user_feeds:
                    feeds_data.append({
                        "title": feed.title,
                        "url": feed.url,
                        "description": feed.description or "",
                        "tags": feed.tags or "",
                        "update_frequency": feed.update_frequency or 60,
                        "is_active": feed.is_active,
                        "created_at": feed.created_at.isoformat(),
                        "last_updated": feed.last_updated.isoformat() if feed.last_updated else None
                    })
                
                export_data = {
                    "export_date": datetime.utcnow().isoformat(),
                    "user_id": user_id,
                    "total_feeds": len(feeds_data),
                    "feeds": feeds_data
                }
                
                return {
                    "format": "json",
                    "filename": f"suprss_export_{user_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json",
                    "data": json.dumps(export_data, indent=2, ensure_ascii=False)
                }

            elif format == 'csv':
                # Export CSV
                output = StringIO()
                writer = csv.writer(output)
                
                # En-têtes CSV
                writer.writerow(['Title', 'URL', 'Description', 'Tags', 'Update_Frequency', 'Is_Active', 'Created_At', 'Last_Updated'])
                
                # Données
                for feed in user_feeds:
                    writer.writerow([
                        feed.title,
                        feed.url,
                        feed.description or "",
                        feed.tags or "",
                        feed.update_frequency or 60,
                        feed.is_active,
                        feed.created_at.strftime('%Y-%m-%d %H:%M:%S'),
                        feed.last_updated.strftime('%Y-%m-%d %H:%M:%S') if feed.last_updated else ""
                    ])
                
                return {
                    "format": "csv",
                    "filename": f"suprss_export_{user_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv",
                    "data": output.getvalue()
                }

            elif format == 'opml':
                # Export OPML (format standard pour les flux RSS)
                opml_lines = [
                    '<?xml version="1.0" encoding="UTF-8"?>',
                    '<opml version="2.0">',
                    '  <head>',
                    f'    <title>SUPRSS Export - User {user_id}</title>',
                    f'    <dateCreated>{datetime.utcnow().strftime("%a, %d %b %Y %H:%M:%S GMT")}</dateCreated>',
                    f'    <docs>http://www.opml.org/spec2</docs>',
                    '  </head>',
                    '  <body>'
                ]
                
                for feed in user_feeds:
                    # Échapper les caractères XML
                    title = feed.title.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')
                    url = feed.url.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')
                    description = (feed.description or "").replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')
                    
                    opml_lines.append(f'    <outline type="rss" text="{title}" title="{title}" xmlUrl="{url}" description="{description}" />')
                
                opml_lines.extend([
                    '  </body>',
                    '</opml>'
                ])
                
                return {
                    "format": "opml",
                    "filename": f"suprss_export_{user_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.opml",
                    "data": '\n'.join(opml_lines)
                }

        finally:
            db.close()

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de l'export: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)