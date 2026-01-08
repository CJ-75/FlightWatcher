"""
Script pour vérifier et créer le fichier .env pour Supabase
"""
import os
from pathlib import Path

def check_env_file():
    """Vérifie si le fichier .env existe et contient les variables nécessaires"""
    env_path = Path(__file__).parent / '.env'
    
    print("=" * 60)
    print("Vérification de la configuration Supabase")
    print("=" * 60)
    
    # Vérifier si le fichier existe
    if not env_path.exists():
        print(f"\n❌ Le fichier .env n'existe pas dans {env_path.parent}")
        print("\n📝 Création d'un fichier .env exemple...")
        create_example_env(env_path)
        return False
    
    print(f"\n✅ Le fichier .env existe : {env_path}")
    
    # Charger les variables
    from dotenv import load_dotenv
    load_dotenv(env_path)
    
    # Vérifier les variables
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_anon_key = os.getenv("SUPABASE_ANON_KEY")
    supabase_service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    print("\n📋 Variables d'environnement :")
    print(f"  SUPABASE_URL: {'✅ Définie' if supabase_url else '❌ Manquante'}")
    print(f"  SUPABASE_ANON_KEY: {'✅ Définie' if supabase_anon_key else '❌ Manquante'}")
    print(f"  SUPABASE_SERVICE_ROLE_KEY: {'✅ Définie' if supabase_service_key else '⚠️  Optionnelle'}")
    
    if supabase_url:
        print(f"\n  URL: {supabase_url[:50]}...")
    if supabase_anon_key:
        print(f"  Anon Key: {supabase_anon_key[:30]}...")
    
    # Vérifier si les variables essentielles sont présentes
    if not supabase_url or not supabase_anon_key:
        print("\n❌ Variables essentielles manquantes !")
        print("\n💡 Pour configurer Supabase :")
        print("   1. Allez sur https://app.supabase.com")
        print("   2. Créez un projet ou sélectionnez un projet existant")
        print("   3. Allez dans Settings > API")
        print("   4. Copiez l'URL du projet et les clés API")
        print("   5. Modifiez le fichier .env avec vos valeurs")
        return False
    
    print("\n✅ Configuration Supabase complète !")
    return True

def create_example_env(env_path):
    """Crée un fichier .env exemple"""
    example_content = """# Configuration Supabase pour FlightWatcher
# Remplacez les valeurs ci-dessous par vos propres clés Supabase

# URL de votre projet Supabase (trouvable dans Settings > API)
SUPABASE_URL=https://votre-projet.supabase.co

# Clé anonyme (anon key) - peut être exposée au frontend
# Trouvable dans Settings > API > Project API keys > anon public
SUPABASE_ANON_KEY=votre-clé-anon-ici

# Clé service role - NE JAMAIS EXPOSER AU FRONTEND
# Utilisée uniquement pour les opérations backend (price_history, cache)
# Trouvable dans Settings > API > Project API keys > service_role
SUPABASE_SERVICE_ROLE_KEY=votre-clé-service-role-ici
"""
    
    try:
        with open(env_path, 'w', encoding='utf-8') as f:
            f.write(example_content)
        print(f"✅ Fichier .env créé : {env_path}")
        print("\n⚠️  IMPORTANT : Modifiez le fichier .env avec vos propres clés Supabase !")
    except Exception as e:
        print(f"❌ Erreur lors de la création du fichier .env : {e}")

if __name__ == "__main__":
    check_env_file()

