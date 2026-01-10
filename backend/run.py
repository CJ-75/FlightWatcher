"""
Script de démarrage pour le serveur FastAPI avec gestion propre de l'arrêt
"""
import uvicorn
import signal
import sys
import os
import platform

def signal_handler(sig, frame):
    """Gère proprement l'arrêt du serveur"""
    print("\n\n🛑 Arrêt du serveur en cours...")
    print("✅ Serveur arrêté proprement")
    sys.exit(0)

if __name__ == "__main__":
    # Enregistrer le gestionnaire de signaux (fonctionne sur Unix/Linux/Mac)
    if platform.system() != "Windows":
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
    
    # Démarrer le serveur
    try:
        print("🚀 Démarrage du serveur FastAPI...")
        print("📡 Serveur accessible sur http://localhost:8000")
        print("📚 Documentation API: http://localhost:8000/docs")
        print("\n💡 Appuyez sur Ctrl+C pour arrêter le serveur\n")
        
        uvicorn.run(
            "main:app",
            host="0.0.0.0",
            port=8000,
            reload=True,
            log_level="info"
        )
    except KeyboardInterrupt:
        print("\n\n🛑 Arrêt du serveur en cours...")
        print("✅ Serveur arrêté proprement")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Erreur lors du démarrage: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

