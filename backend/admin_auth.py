"""
Middleware d'authentification admin pour FastAPI
Vérifie que l'utilisateur est un administrateur via liste d'emails hardcodés + mot de passe
"""
from fastapi import Request, HTTPException, status
from typing import Optional
import jwt
import bcrypt
from auth_middleware import get_user_id_from_token
from supabase_client import get_supabase_client, get_supabase_service_client
import os

# Liste des emails administrateurs (hardcodés)
# Modifier cette liste pour ajouter/retirer des admins
ADMIN_EMAILS = [
    # Ajoutez ici les emails des administrateurs
    "crisdu28@gmail.com",
    # Exemple: "your-email@gmail.com",
]

# Charger depuis variable d'environnement si disponible (séparés par des virgules)
env_admin_emails = os.getenv("ADMIN_EMAILS")
if env_admin_emails:
    ADMIN_EMAILS.extend([email.strip() for email in env_admin_emails.split(",") if email.strip()])

# Hash bcrypt du mot de passe admin (chargé depuis .env pour la sécurité)
# Pour générer un nouveau hash : bcrypt.hashpw(b"votre_mot_de_passe", bcrypt.gensalt(rounds=12)).decode()
# Valeur par défaut (à remplacer par la variable d'environnement ADMIN_PASSWORD_HASH)
ADMIN_PASSWORD_HASH = os.getenv(
    "ADMIN_PASSWORD_HASH",
    "$2a$12$RxGnFWsPFJsrspELGy5X1.pIVbSxqBf2Z86v43bFbjFyCh4AI8dg."  # Fallback pour compatibilité
)

if not ADMIN_PASSWORD_HASH or ADMIN_PASSWORD_HASH == "":
    print("⚠️  ADMIN_PASSWORD_HASH non configuré dans .env. Utilisation du hash par défaut.")
    ADMIN_PASSWORD_HASH = "$2a$12$RxGnFWsPFJsrspELGy5X1.pIVbSxqBf2Z86v43bFbjFyCh4AI8dg."
else:
    print("✅ Hash du mot de passe admin chargé depuis .env")

def verify_admin_password(password: str) -> bool:
    """
    Vérifie si le mot de passe fourni correspond au hash admin hardcodé
    """
    try:
        # Encoder le mot de passe en bytes
        password_bytes = password.encode('utf-8')
        hash_bytes = ADMIN_PASSWORD_HASH.encode('utf-8')
        
        # Vérifier le mot de passe avec bcrypt
        return bcrypt.checkpw(password_bytes, hash_bytes)
    except Exception as e:
        print(f"Erreur vérification mot de passe admin: {e}")
        return False

def get_user_email_from_token(request: Request) -> Optional[str]:
    """
    Extrait l'email de l'utilisateur depuis le token JWT
    """
    auth_header = request.headers.get("Authorization")
    
    if not auth_header:
        return None
    
    try:
        token = auth_header.replace("Bearer ", "").strip()
        if not token:
            return None
        
        # Décoder le token JWT pour obtenir l'email
        decoded = jwt.decode(token, options={"verify_signature": False})
        
        # Essayer plusieurs clés possibles pour l'email
        email = decoded.get("email")
        
        # Si pas d'email direct, essayer dans user_metadata (Supabase stocke souvent l'email là)
        if not email and "user_metadata" in decoded:
            user_metadata = decoded["user_metadata"]
            if isinstance(user_metadata, dict):
                email = user_metadata.get("email") or user_metadata.get("email_address")
        
        # Si toujours pas d'email, essayer app_metadata
        if not email and "app_metadata" in decoded:
            app_metadata = decoded["app_metadata"]
            if isinstance(app_metadata, dict):
                email = app_metadata.get("email")
        
        # Essayer aussi avec "sub" qui peut contenir l'email pour certains providers
        if not email:
            sub = decoded.get("sub")
            if sub and "@" in str(sub):
                email = sub
        
        return email
    except Exception as e:
        print(f"❌ Erreur décodage token pour email: {e}")
        return None

async def get_user_email(user_id: str) -> Optional[str]:
    """
    Récupère l'email d'un utilisateur depuis la base de données
    """
    try:
        # D'abord essayer user_profiles
        supabase = get_supabase_client()
        result = supabase.table("user_profiles")\
            .select("email")\
            .eq("id", user_id)\
            .execute()
        
        if result.data and len(result.data) > 0:
            email = result.data[0].get("email")
            if email:
                return email
        
        # Si pas dans user_profiles, essayer avec le service client pour accéder à auth.users
        service_client = get_supabase_service_client()
        if service_client:
            try:
                # Utiliser l'admin API de Supabase pour récupérer l'email depuis auth.users
                auth_user = service_client.auth.admin.get_user_by_id(user_id)
                if auth_user and auth_user.user:
                    email = auth_user.user.email
                    if email:
                        return email
            except Exception as e:
                pass  # Erreur silencieuse
        
        return None
    except Exception as e:
        print(f"❌ Erreur récupération email: {e}")
        return None

async def verify_admin(user_id: str, request: Optional[Request] = None, password: Optional[str] = None) -> bool:
    """
    Vérifie si un utilisateur est administrateur en vérifiant :
    1. Son email contre la liste hardcodée
    2. Le mot de passe admin (si fourni)
    """
    if not ADMIN_EMAILS:
        print("⚠️  Aucun email admin configuré. Configurez ADMIN_EMAILS dans .env ou dans admin_auth.py")
        return False
    
    # Essayer d'obtenir l'email depuis le token d'abord
    email = None
    if request:
        email = get_user_email_from_token(request)
    
    # Si pas d'email dans le token, récupérer depuis la base de données
    if not email:
        email = await get_user_email(user_id)
    
    if not email:
        return False
    
    # Vérifier si l'email est dans la liste des admins
    email_lower = email.lower().strip()
    admin_emails_lower = [admin_email.lower().strip() for admin_email in ADMIN_EMAILS]
    is_admin_email = email_lower in admin_emails_lower
    
    if not is_admin_email:
        print(f"❌ Accès admin refusé pour: '{email}' (email non autorisé)")
        return False
    
    # Si password est explicitement None, retourner True (vérification email uniquement)
    # C'est utilisé par l'endpoint /verify pour vérifier si l'email est admin
    if password is None:
        return True
    
    # Si un mot de passe non vide est fourni, le vérifier
    if password and password.strip():
        if not verify_admin_password(password):
            print(f"❌ Accès admin refusé pour: {email} (mot de passe incorrect)")
            return False
        return True
    
    # Si pas de mot de passe fourni ou mot de passe vide, vérifier le cookie
    if request:
        admin_password_cookie = request.cookies.get("admin_password_verified")
        if admin_password_cookie == "true":
            return True
    
    # Si pas de mot de passe et pas de cookie, refuser
    print(f"❌ Accès admin refusé pour: {email} (cookie de mot de passe non vérifié)")
    return False

def require_admin(func):
    """
    Décorateur pour protéger les endpoints qui nécessitent des droits administrateur
    """
    from functools import wraps
    
    @wraps(func)
    async def wrapper(*args, **kwargs):
        # Trouver le Request dans les arguments
        request = None
        
        # Vérifier d'abord dans kwargs
        if 'request' in kwargs:
            req_arg = kwargs['request']
            if isinstance(req_arg, Request) and hasattr(req_arg, 'headers'):
                request = req_arg
        
        # Si pas trouvé dans kwargs, chercher dans args
        if not request:
            for arg in args:
                if isinstance(arg, Request) and hasattr(arg, 'headers'):
                    request = arg
                    break
        
        if not request:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Request non trouvé dans les arguments"
            )
        
        # Extraire le user_id depuis le token
        user_id = get_user_id_from_token(request)
        
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentification requise"
            )
        
        # Vérifier que l'utilisateur est admin (email + mot de passe via cookie)
        # On passe password="" pour forcer la vérification du cookie
        is_admin = await verify_admin(user_id, request, password="")
        
        if not is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Accès refusé : droits administrateur requis. Veuillez vérifier votre mot de passe."
            )
        
        # Ajouter user_id et is_admin au request state
        request.state.user_id = user_id
        request.state.is_admin = True
        
        return await func(*args, **kwargs)
    
    return wrapper

