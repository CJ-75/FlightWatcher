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
    # Logs scan/inspire visibles immédiatement dans le terminal
    os.environ.setdefault("PYTHONUNBUFFERED", "1")
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    try:
        sys.stdout.reconfigure(line_buffering=True, encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
        sys.stderr.reconfigure(line_buffering=True, encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
    except Exception:
        pass

    # Enregistrer le gestionnaire de signaux (fonctionne sur Unix/Linux/Mac)
    if platform.system() != "Windows":
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
    
    # Démarrer le serveur
    try:
        # Windows + reload = process enfant dont les prints n'apparaissent souvent PAS
        # dans le terminal Cursor. Défaut: pas de reload. Opt-in: UVICORN_RELOAD=1
        default_reload = "0" if platform.system() == "Windows" else "1"
        use_reload = (os.getenv("UVICORN_RELOAD") or default_reload).strip() in (
            "1",
            "true",
            "yes",
            "on",
        )
        try:
            from scan_log import log_path

            scan_log = log_path()
        except Exception:
            scan_log = "backend/logs/scan.log"

        print("🚀 Démarrage du serveur FastAPI...", flush=True)
        print("📡 Serveur accessible sur http://localhost:8000", flush=True)
        print("📚 Documentation API: http://localhost:8000/docs", flush=True)
        print(f"📋 Scan/provider logs -> {scan_log}", flush=True)
        print(
            f"   reload={'ON' if use_reload else 'OFF'} "
            f"(UVICORN_RELOAD=1 pour auto-reload)",
            flush=True,
        )
        print("\n💡 Appuyez sur Ctrl+C pour arrêter le serveur\n", flush=True)

        uvicorn.run(
            "main:app",
            host="0.0.0.0",
            port=8000,
            reload=use_reload,
            log_level="info",
            access_log=True,
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

