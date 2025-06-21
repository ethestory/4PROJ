from fastapi import FastAPI, HTTPException
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

# Initialisation de l'application FastAPI
app = FastAPI(
    title="SUPRSS API",
    description="API pour la gestion de flux RSS",
    version="1.0.0"
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
            description=feed_data.description
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
    
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)