# Déclaration des tables SQLAlchemy
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Index
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
    tags = Column(String(500), nullable=True)  # Tags séparés par des virgules
    update_frequency = Column(Integer, default=60)  # Fréquence en minutes (défaut: 1h)
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

class Collection(Base):
    """Modèle pour les collections de flux partagées"""
    __tablename__ = "collections"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    is_private = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class CollectionMember(Base):
    """Modèle pour les membres d'une collection"""
    __tablename__ = "collection_members"

    id = Column(Integer, primary_key=True, index=True)
    collection_id = Column(Integer, ForeignKey("collections.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    permissions = Column(String(50), default="read")  # read, write, admin
    joined_at = Column(DateTime, default=datetime.utcnow)
    invited_by = Column(Integer, ForeignKey("users.id"), nullable=True)

class CollectionFeed(Base):
    """Modèle pour associer des flux à une collection"""
    __tablename__ = "collection_feeds"

    id = Column(Integer, primary_key=True, index=True)
    collection_id = Column(Integer, ForeignKey("collections.id"), nullable=False)
    feed_id = Column(Integer, ForeignKey("feeds.id"), nullable=False)
    added_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    added_at = Column(DateTime, default=datetime.utcnow)

class CollectionMessage(Base):
    """Modèle pour la messagerie dans les collections"""
    __tablename__ = "collection_messages"

    id = Column(Integer, primary_key=True, index=True)
    collection_id = Column(Integer, ForeignKey("collections.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    message = Column(Text, nullable=False)
    article_id = Column(Integer, ForeignKey("articles.id"), nullable=True)  # Si commentaire sur article
    created_at = Column(DateTime, default=datetime.utcnow)

class FeedPermission(Base):
    """Modèle pour les permissions spécifiques par flux et par membre"""
    __tablename__ = "feed_permissions"

    id = Column(Integer, primary_key=True, index=True)
    collection_id = Column(Integer, ForeignKey("collections.id"), nullable=False)
    feed_id = Column(Integer, ForeignKey("feeds.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    can_read = Column(Boolean, default=True)
    can_modify = Column(Boolean, default=False)  # Modifier les articles (marquer lu/favori)
    can_delete = Column(Boolean, default=False)  # Supprimer le flux de la collection
    granted_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    granted_at = Column(DateTime, default=datetime.utcnow)

    # Index unique pour éviter les doublons
    __table_args__ = (
        Index('idx_feed_permissions_unique', 'collection_id', 'feed_id', 'user_id', unique=True),
    )