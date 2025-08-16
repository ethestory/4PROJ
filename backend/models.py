# Déclaration des tables SQLAlchemy
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

Base = declarative_base()

class User(Base):
    """Modèle utilisateur pour l'authentification"""
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class Feed(Base):
    """Modèle flux RSS"""
    __tablename__ = "feeds"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    url = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    tags = Column(String(500), nullable=True)  # 🆕 NOUVEAU : Tags séparés par des virgules
    update_frequency = Column(Integer, default=60)  # 🆕 NOUVEAU : Fréquence en minutes (défaut: 1h)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_updated = Column(DateTime, nullable=True)
    owner_id = Column(Integer, ForeignKey("users.id"))

class Article(Base):
    """Modèle article RSS"""
    __tablename__ = "articles"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(500), nullable=False)
    link = Column(String(1000), nullable=False)
    published = Column(String(100), nullable=True)
    author = Column(String(200), nullable=True)
    summary = Column(Text, nullable=True)
    is_read = Column(Boolean, default=False)
    is_favorite = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    feed_id = Column(Integer, ForeignKey("feeds.id"))