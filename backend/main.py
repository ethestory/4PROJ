from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import feedparser

# Modèle pour la requête
class RSSRequest(BaseModel):
    url: str

#Modèle pour créer un flux 
class FeedCreate(BaseModel):
    title: str
    url: str
    description: str = ""
    owner_id: int

# Initialisation de l'application FastAPI
app = FastAPI(
    title="SUPRSS API",
    description="API pour la gestion de flux RSS",
    version="1.0.0"
)
#fonctionement pour CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Route de test de l'API
@app.get("/")
async def root():
    return {"message": "SUPRSS API is running!"}

# Route de santé
@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "SUPRSS Backend"}

# Test simple de parsing RSS
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

# Route pour parser n'importe quel flux RSS
@app.post("/parse-rss")
async def parse_rss(request: RSSRequest):
    """Parse un flux RSS à partir de son URL"""
    try:
        feed = feedparser.parse(request.url)
        
        if feed.bozo:
            raise HTTPException(status_code=400, detail="Flux RSS invalide ou inaccessible")
        
        # Informations du flux
        feed_info = {
            "title": feed.feed.get("title", "Flux sans titre"),
            "description": feed.feed.get("description", ""),
            "link": feed.feed.get("link", ""),
        }
        
        # Les 5 premiers articles
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


# Route de test pour la base de données

@app.get("/test-db")
async def test_database():
    try:
        from database import test_connection
        if test_connection():
            return {"status": "Database connected"}
        else:
            return{"status": "Database connection failed"}
    except Exception as e:
        return {"status": f"Database error: {str(e)}"}

#route pour créer les tables 

@app.post("/create-tables")
async def create_tables():
    try:
        from database import create_tables
        create_tables()
        return {"status" : "Tables created successfully!"}
    except Exception as e:
        return {"status": f"Error creating tables: {str(e)}"}

#creer un flux RSS
@app.post("/feeds")
async def create_feed(feed_data : FeedCreate):
    try:
        from database import SessionLocal
        from models import Feed 

        #création d'une session
        db = SessionLocal()

        #Création du flux 
        new_feed = Feed(
            title=feed_data.title,
            url=feed_data.url,
            description=feed_data.description,
            owner_id=feed_data.owner_id
        )
        #Ajout dans la BDD
        db.add(new_feed)
        db.commit()
        db.refresh(new_feed)
        db.close()

        #retour cli 
        return {
            "id": new_feed.id,
            "title": new_feed.title,
            "url": new_feed.url,
            "description": new_feed.description,
            "created_at": new_feed.created_at.isoformat()
        }
    except Exception as e:
        return{"error": f"Error creating feed: {str(e)}"}

#Lister tous les flux RSS
@app.get("/feeds")
async def get_feeds():
    try:
        from database import SessionLocal
        from models import Feed

        db= SessionLocal()
        feeds = db.query(Feed).all()    
        db.close()

        return {
            "feeds": [
                {
                    "id": feed.id,
                    "title": feed.title,
                    "url": feed.url,
                    "description": feed.description,
                    "is_active": feed.is_active,
                    "last_updated": feed.last_updated.isoformat() if hasattr(feed, 'last_updated') and feed.last_updated else None,
                    "created_at": feed.created_at.isoformat()
                }
                for feed in feeds
            ]
        }
    except Exception as e:
        return {"error": f"Error fetching feeds: {str(e)}"}

#Lister les flux d'un utilisateur spécifique
@app.get("/users/{user_id}/feeds")
async def get_user_feeds(user_id: int):
    try:
        from database import SessionLocal
        from models import Feed

        db = SessionLocal()

        try:
            feeds = db.query(Feed).filter(Feed.owner_id == user_id).all()
            
            # Construire la réponse avec détails
            feeds_list = []
            for feed in feeds:
                feeds_list.append({
                    "id": feed.id,
                    "title": feed.title,
                    "url": feed.url,
                    "description": feed.description,
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
        return{"error": f"Error fetching user feeds: {str(e)}"}


#Récupérer et stocker les articles du flux - récupère TOUS les articles
@app.post("/feeds/{feed_id}/fetch-articles")
async def fetch_articles(feed_id: int):
    try:
        from database import SessionLocal
        from models import Feed, Article
        import feedparser

        db = SessionLocal()

        try:
            feed = db.query(Feed).filter(Feed.id == feed_id).first()
            if not feed:
                return {"error": "Feed not found"}
            
            rss_feed = feedparser.parse(feed.url)
            articles_added = 0

            # Récupérer TOUS les articles du flux - en ordre inverse pour avoir les plus récents d'abord
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
                            summary=entry.get("summary", "")[:500] if entry.get("summary") else "",
                            feed_id=feed_id
                        )
                        db.add(new_article)
                        articles_added += 1
            db.commit()

            return {
                "message": f"{articles_added} articles added for feed '{feed.title}'",
                "feed_id" : feed_id,
                "articles_added": articles_added
            }
        finally:
            db.close()
    except Exception as e:
        return {"error": f"Error fetching articles: {str(e)}"}        

#Lister les articles d'un flux AVEC PAGINATION
@app.get("/feeds/{feed_id}/articles")
async def get_articles(feed_id: int, page: int = 1, per_page: int = 20):
    try:
        from database import SessionLocal
        from models import Feed, Article

        db = SessionLocal()

        try:
            #Vérif du flux qui existe
            feed = db.query(Feed).filter(Feed.id == feed_id).first()
            if not feed:
                return{"error": "Feed not found"}
            
            # Calcul de l'offset pour la pagination
            offset = (page - 1) * per_page
            
            # Récupérer TOUS les articles du flux sans ordre particulier
            all_articles = db.query(Article).filter(Article.feed_id == feed_id).all()
            
            # Trier en Python par date de publication (format string)
            all_articles.sort(key=lambda x: x.published if x.published else x.created_at.isoformat(), reverse=True)
            
            # Calculer la pagination manuellement
            total_articles = len(all_articles)
            total_pages = (total_articles + per_page - 1) // per_page
            
            # Découper pour la page demandée
            start_idx = (page - 1) * per_page
            end_idx = start_idx + per_page
            articles = all_articles[start_idx:end_idx]

            return {
                "feed": {
                    "id": feed.id,
                    "title": feed.title,
                    "url": feed.url
                },
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
                        "published": article.published if article.published else article.created_at.isoformat(),
                        "author": article.author,
                        "summary": article.summary[:200] + "..." if len(article.summary) > 200 else article.summary,
                        "is_read": article.is_read,
                        "is_favorite": article.is_favorite,
                        "created_at": article.created_at.isoformat()
                    }
                    for article in articles
                ]
            }
        finally:
            db.close()
    except Exception as e:
        return {"error": f"Error fetching articles: {str(e)}"}

#Modèle pour l'inscription utilisateur
class UserCreate(BaseModel):
    username: str
    email: str
    password: str

#Modèle pour la connexion 
class UserLogin(BaseModel):
    username: str
    password: str

#connexion utilisateur
@app.post("/login")
async def login(user_data: UserLogin):
    try:
        from database import SessionLocal
        from models import User
        from auth import verify_password

        db = SessionLocal()

        try:
            #trouver l'utilisateur
            user = db.query(User).filter(User.username == user_data.username).first()
            if not user:
                return{"error": "Invalid username"}
            
            # Vérifier le mot de passe
            if not verify_password(user_data.password, user.hashed_password):
                return{"error": "Invalid password"}
            
            return{"message": f"Welcome {user.username}!", "user_id": user.id}
        
        finally:
            db.close() 

    except Exception as e:
        return{"error": f"Login failed: {str(e)}"}

#Inscription utilisateur
@app.post("/register")
async def register(user_data: UserCreate):
    try:
        from database import SessionLocal
        from models import User
        from auth import hash_password

        db = SessionLocal()

        try:
            #Vérifier si l'utilisateur existe 
            existing = db.query(User).filter(User.username == user_data.username).first()
            if existing:
                return {"error": "Username already exists"}
            
            #enregistrement de l'utilisateur 
            hashed_pwd = hash_password(user_data.password)
            new_user = User(
                username=user_data.username,
                email = user_data.email,
                hashed_password=hashed_pwd
            )

            db.add(new_user)
            db.commit()

            return{"message": f"User {user_data.username} created sucessfully"}
        
        finally: 
            db.close()

    except Exception as e:
       return{"error": f"Registration failed: {str(e)}"}
    
#permet de marquer un article lu ou non lu    
@app.patch("/articles/{article_id}/read")
async def toggle_article_read(article_id: int, read_status: bool = True):
    try:
        from database import SessionLocal
        from models import Article

        db = SessionLocal()

        try:
            article =  db.query(Article).filter(Article.id == article_id).first()
            if not article :
                return {"error" : "Article not found"}
            article.is_read = read_status
            db.commit()

            return {"message": "Article status updated", "article_id": article_id, "is_read": read_status}
        
        finally:
            db.close()

    except Exception as e:
        return {"error": f"Error : {str(e)}"}
    
#marqué un article en favori
@app.patch("/articles/{article_id}/favorite")
async def toggle_article_favorite(article_id: int, favorite_status: bool = True):
    try:
        from database import SessionLocal
        from models import Article

        db = SessionLocal()

        try:
            article = db.query(Article).filter(Article.id == article_id).first()
            if not article: 
                return {"error" : "Article not found"}
            
            article.is_favorite = favorite_status
            db.commit()

            return {"message": "Artcile favorite status updated", "article_id": article_id, "is_favorite": favorite_status}
        
        finally: 
            db.close()

    except Exception as e: 
        return {"error": f"Error: {str(e)}"}

# Route de filtrage AVEC PAGINATION
@app.get("/feeds/{feed_id}/articles/filter")
async def filter_articles(feed_id: int, page: int = 1, per_page: int = 20, read: bool = None, favorite: bool = None, search: str = None, days: int = None):
    try:
        from database import SessionLocal
        from models import Article 
        from datetime import datetime, timedelta

        db = SessionLocal()

        try:
            query = db.query(Article).filter(Article.feed_id == feed_id)
            
            # Application des filtres
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

            # Récupérer tous les articles et les trier en Python
            all_filtered_articles = query.all()
            
            # Trier par date de publication (string) en ordre décroissant
            all_filtered_articles.sort(key=lambda x: x.published if x.published else x.created_at.isoformat(), reverse=True)
            
            # Calculer la pagination manuellement
            total_articles = len(all_filtered_articles)
            total_pages = (total_articles + per_page - 1) // per_page
            
            # Découper pour la page demandée
            start_idx = (page - 1) * per_page
            end_idx = start_idx + per_page
            articles = all_filtered_articles[start_idx:end_idx]

            return {
                "feed_id": feed_id,
                "filters": {"read": read, "favorite": favorite, "search": search, "days": days},
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
                        "published": article.published if article.published else article.created_at.isoformat(),
                        "summary": article.summary[:200] + "..." if len(article.summary) > 200 else article.summary,
                        "is_read": article.is_read,
                        "is_favorite": article.is_favorite,
                        "created_at": article.created_at.isoformat()
                    }
                    for article in articles
                ]
            }
        finally: 
            db.close()

    except Exception as e:
        return {"error": f"Erreur dans le filtrage des articles : {str(e)}"}

# Route de refresh pour récupérer TOUS les nouveaux articles
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
                return {"error": "Feed not found"}
            
            rss_feed = feedparser.parse(feed.url)

            articles_added = 0
            articles_updated = 0

            # Traiter TOUS les articles du flux - en ordre inverse
            for entry in reversed(rss_feed.entries):
                link = entry.get("link", "")
                if link:
                    existing = db.query(Article).filter(Article.link == link).first()
                    if not existing:
                        new_article = Article (
                            title=entry.get("title", "Sans titre"),
                            link=link,
                            published=entry.get("published", ""),
                            author=entry.get("author", ""),
                            summary=entry.get("summary", "")[:500] if entry.get("summary") else "",
                            feed_id=feed_id
                        )
                        db.add(new_article)
                        articles_added += 1
                    else:
                        existing.title = entry.get("title", existing.title)
                        existing.published = entry.get("published", existing.published)
                        existing.summary = entry.get("summary", existing.summary)[:500] if entry.get("summary") else existing.summary
                        articles_updated += 1

            feed.last_updated = datetime.utcnow()
            db.commit()

            return {
                    "message": f"Flux actualisé ! {articles_added} nouveaux articles, {articles_updated} mis à jour",
                    "articles_added": articles_added,
                    "articles_updated": articles_updated,
                    "last_updated": feed.last_updated.isoformat()
                    }
                
        finally:
            db.close()
            
    except Exception as e:
        return{"error": f"Erreur de rafraichissement du flux: {str(e)}"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)