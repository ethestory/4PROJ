from sqlalchemy import create_engine 
from sqlalchemy.orm import sessionmaker
import os
#Definition de valeurs 
DATABASE_URL = "postgresql://suprss_user:suprss_password@database:5432/suprss_db"
engine = create_engine(DATABASE_URL)

#Session maker
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

#test de connection
def test_connection():
    try:
        connection = engine.connect ()
        connection.close()
        return True
    except:
        return False

#importation des tables dans la base sql
def create_tables():
    from models import Base
    Base.metadata.create_all(bind=engine)