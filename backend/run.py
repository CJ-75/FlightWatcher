"""
Script de démarrage pour l'API FlightWatcher
Lance uvicorn programmatiquement pour éviter les problèmes d'import de module ASGI
"""
import uvicorn
import os
import sys

# S'assurer que le répertoire backend est dans le PYTHONPATH
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Charger les variables d'environnement depuis .env si disponible
try:
    from dotenv import load_dotenv
    env_path = os.path.join(backend_dir, '.env')
    if os.path.exists(env_path):
        load_dotenv(env_path)
except ImportError:
    pass

if __name__ == "__main__":
    # Lancer uvicorn avec le module main
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        reload_dirs=[backend_dir]
    )

