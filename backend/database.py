from sqlalchemy import create_engine 
import os
#Definition de valeurs 
DATABASE_URL = "postgresql://suprss_user:suprss_password@database:5432/suprss_db"
engine = create_engine(DATABASE_URL)

#test de connection
def test_connection():
    try:
        connection = engine.connect ()
        connection.close()
        return True
    except:
        return False