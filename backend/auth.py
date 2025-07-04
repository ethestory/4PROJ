#fichier permettant de vérifier le hachage des mots de passes
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password : str) -> str:
    ""Hacher un mot de passe ""
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    ""Vérifier un mot de passe""
    return pwd_context.verify(plain_password, hashed_password)
