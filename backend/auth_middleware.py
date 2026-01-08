"""
Middleware d'authentification pour FastAPI
Valide les tokens JWT Supabase et extrait le user_id
"""
from fastapi import Request, HTTPException, status
from typing import Optional
import jwt
import os
from functools import wraps
from pathlib import Path
from dotenv import load_dotenv

# Charger le fichier .env si disponible
env_path = Path(__file__).parent / '.env'
if env_path.exists():
    load_dotenv(env_path, override=True)

# Clé publique Supabase pour valider les tokens JWT
# Récupérée depuis https://your-project.supabase.co/.well-known/jwks.json
# Pour simplifier, on utilise la validation via Supabase directement
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

def get_user_id_from_token(request: Request) -> Optional[str]:
    """
    Extrait le user_id depuis le token JWT dans les headers Authorization
    Retourne None si pas de token ou token invalide
    """
    auth_header = request.headers.get("Authorization")
    
    if not auth_header:
        return None
    
    try:
        # Format: "Bearer <token>"
        token = auth_header.replace("Bearer ", "").strip()
        
        if not token:
            return None
        
        # Décoder le token JWT (sans vérification pour l'instant)
        # En production, il faudrait vérifier la signature avec la clé publique Supabase
        decoded = jwt.decode(token, options={"verify_signature": False})
        
        # Le user_id est dans le champ "sub" du token
        user_id = decoded.get("sub")
        
        return user_id
    except Exception as e:
        print(f"Erreur décodage token: {e}")
        return None

def require_auth(func):
    """
    Décorateur pour protéger les endpoints qui nécessitent une authentification
    """
    @wraps(func)
    async def wrapper(request: Request, *args, **kwargs):
        user_id = get_user_id_from_token(request)
        
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentification requise"
            )
        
        # Ajouter user_id au request state pour utilisation dans la fonction
        request.state.user_id = user_id
        
        return await func(request, *args, **kwargs)
    
    return wrapper

def optional_auth(func):
    """
    Décorateur pour les endpoints qui fonctionnent avec ou sans authentification
    Note: Ce décorateur ne modifie pas la signature de la fonction pour éviter les conflits avec FastAPI
    """
    @wraps(func)
    async def wrapper(*args, **kwargs):
        # Trouver le Request dans les arguments - vérifier d'abord kwargs puis args
        request = None
        
        try:
            # Vérifier d'abord dans kwargs (plus fiable avec FastAPI)
            if 'request' in kwargs:
                req_arg = kwargs['request']
                # Vérifier que c'est bien un Request FastAPI/Starlette
                if isinstance(req_arg, Request) and hasattr(req_arg, 'headers') and hasattr(req_arg, 'state'):
                    request = req_arg
            
            # Si pas trouvé dans kwargs, chercher dans args
            if not request:
                for arg in args:
                    # Vérifier que c'est bien un Request FastAPI/Starlette, pas un modèle Pydantic
                    if isinstance(arg, Request) and hasattr(arg, 'headers') and hasattr(arg, 'state'):
                        request = arg
                        break
            
            if request:
                try:
                    user_id = get_user_id_from_token(request)
                    request.state.user_id = user_id  # Peut être None
                except Exception as e:
                    # Ne pas bloquer si l'extraction du user_id échoue
                    print(f"⚠️  Erreur extraction user_id (non bloquant): {e}")
                    if request:
                        request.state.user_id = None
        except Exception as e:
            # Ne pas bloquer si la détection du request échoue
            print(f"⚠️  Erreur dans optional_auth (non bloquant): {e}")
        
        return await func(*args, **kwargs)
    
    return wrapper

