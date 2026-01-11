import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, signOut, signInWithGoogle, onAuthStateChange } from '../lib/supabase';
import { migrateLocalStorageToSupabase } from '../utils/migration';
import { useI18n } from '../contexts/I18nContext';
import { LanguageSwitcher } from './LanguageSwitcher';
import type { User } from '@supabase/supabase-js';

interface UserProfile {
  avatar_url?: string;
  full_name?: string;
}

export function UserMenu() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    checkUser();
    
    // Écouter les changements d'authentification
    const unsubscribe = onAuthStateChange(async (event, session) => {
      console.log('Auth event:', event, session?.user?.email);
      
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user);
        await loadUserProfile(session.user.id);
        await handleMigration(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setUserProfile(null);
        setMigrationStatus(null);
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        setUser(session.user);
        await loadUserProfile(session.user.id);
      }
    });
    
    // Fermer le menu si on clique en dehors
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        buttonRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      if (unsubscribe) unsubscribe();
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Précharger l'image de l'avatar pour le menu
  useEffect(() => {
    if (user) {
      const avatarUrl = user.user_metadata?.avatar_url || userProfile?.avatar_url;
      if (avatarUrl) {
        const img = new Image();
        img.referrerPolicy = 'no-referrer';
        img.src = avatarUrl;
      }
    }
  }, [user, userProfile]);

  const checkUser = async () => {
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
      
      if (currentUser) {
        await loadUserProfile(currentUser.id);
        await handleMigration(currentUser.id);
      }
    } catch (error) {
      console.error('Erreur vérification utilisateur:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUserProfile = async (userId: string) => {
    try {
      const { getSupabaseClient } = await import('../lib/supabase');
      const supabase = await getSupabaseClient();
      if (!supabase) return;
      
      const { data } = await supabase
        .from('user_profiles')
        .select('avatar_url, full_name, email')
        .eq('id', userId)
        .single();
      
      if (data) {
        setUserProfile(data);
      }
    } catch (error) {
      console.error('Erreur chargement profil:', error);
    }
  };

  const handleMigration = async (userId: string) => {
    try {
      const result = await migrateLocalStorageToSupabase(userId);
      
      if (result.success && (result.searchesMigrated > 0 || result.favoritesMigrated > 0)) {
        setMigrationStatus(
          t('auth.migration.success', { 
            searches: result.searchesMigrated, 
            favorites: result.favoritesMigrated 
          })
        );
        setTimeout(() => setMigrationStatus(null), 5000);
      }
    } catch (error) {
      console.error('Erreur migration:', error);
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    const { error } = await signOut();
    
    if (error) {
      console.error('Erreur déconnexion:', error);
      alert(`${t('auth.error.disconnection')}: ${error.message}`);
    } else {
      setUser(null);
      setIsOpen(false);
      navigate('/login');
    }
    setLoading(false);
  };

  const handleSignIn = async () => {
    setLoading(true);
    const { error } = await signInWithGoogle();
    
    if (error) {
      console.error('Erreur connexion:', error);
      alert(`${t('auth.error.connection')}: ${error.message}`);
    }
    setLoading(false);
  };


  // Précharger l'image de l'avatar pour le menu
  useEffect(() => {
    if (user) {
      const avatarUrl = user.user_metadata?.avatar_url || userProfile?.avatar_url;
      if (avatarUrl) {
        const img = new Image();
        img.referrerPolicy = 'no-referrer';
        img.src = avatarUrl;
      }
    }
  }, [user, userProfile]);

  if (loading && !user) {
    return (
      <button
        ref={buttonRef}
        disabled
        className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gray-200 animate-pulse border-2 border-gray-300"
        aria-label={t('auth.loading')}
      />
    );
  }

  if (user) {
    const avatarUrl = user.user_metadata?.avatar_url || userProfile?.avatar_url;
    const displayName = user.user_metadata?.full_name || userProfile?.full_name || user.email?.split('@')[0] || 'User';
    const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || user.email?.charAt(0).toUpperCase() || 'U';

    return (
      <div className="relative flex items-center gap-2 sm:gap-3">
        {/* Language Switcher - Visible quand connecté */}
        <LanguageSwitcher />
        
        {/* Bouton Avatar - Toujours visible */}
        <button
          ref={buttonRef}
          onClick={() => setIsOpen(!isOpen)}
          className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 border-gray-200 hover:border-primary-500 transition-all shadow-md hover:shadow-lg active:scale-95 overflow-hidden bg-white flex items-center justify-center"
          aria-label={t('auth.userMenu')}
          style={{
            minWidth: '40px',
            minHeight: '40px',
          }}
        >
          {avatarUrl ? (
            <>
              <img 
                src={avatarUrl} 
                alt={displayName} 
                className="w-full h-full rounded-full object-cover"
                style={{ 
                  display: 'block',
                  width: '100%',
                  height: '100%',
                }}
                onLoad={() => {
                  console.log('✅ Avatar image loaded successfully');
                }}
                onError={(e) => {
                  console.error('❌ Avatar image failed to load');
                  e.currentTarget.style.display = 'none';
                  const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                  if (fallback) fallback.style.display = 'flex';
                }}
              />
              <div 
                className="w-full h-full rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold text-sm sm:text-base absolute inset-0"
                style={{ display: 'none' }}
              >
                {initials}
              </div>
            </>
          ) : (
            <div className="w-full h-full rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold text-sm sm:text-base">
              {initials}
            </div>
          )}
        </button>

        {/* Menu Dropdown Moderne */}
        <AnimatePresence>
          {isOpen && (
            <>
              {/* Overlay léger */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsOpen(false)}
                className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 sm:bg-transparent sm:backdrop-blur-0"
              />
              
              {/* Menu dropdown moderne et compact */}
              <motion.div
                ref={menuRef}
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="absolute right-0 mt-2 w-64 sm:w-72 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden backdrop-blur-xl bg-white/95"
                style={{ top: 'calc(100% + 8px)' }}
              >
                {/* Header du menu avec avatar */}
                <div className="bg-gradient-to-br from-primary-50 via-rose-50 to-pink-50 p-4 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className="relative flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 border-white shadow-md overflow-hidden bg-white">
                      {avatarUrl ? (
                        <>
                          <img 
                            src={avatarUrl} 
                            alt={displayName} 
                            className="w-full h-full rounded-full object-cover"
                            referrerPolicy="no-referrer"
                            style={{ 
                              display: 'block',
                              width: '100%',
                              height: '100%',
                            }}
                            onLoad={() => {
                              console.log('✅ Avatar image loaded in menu:', avatarUrl);
                            }}
                            onError={(e) => {
                              console.error('❌ Avatar image failed to load in menu:', avatarUrl);
                              // Essayer de recharger l'image sans le paramètre de taille
                              const imgElement = e.currentTarget as HTMLImageElement;
                              const originalUrl = imgElement.src;
                              const urlWithoutSize = originalUrl.replace(/=s\d+-c$/, '');
                              if (urlWithoutSize !== originalUrl && !imgElement.dataset.retried) {
                                imgElement.dataset.retried = 'true';
                                imgElement.src = urlWithoutSize;
                              } else {
                                imgElement.style.display = 'none';
                                const fallback = imgElement.nextElementSibling as HTMLElement;
                                if (fallback) fallback.style.display = 'flex';
                              }
                            }}
                          />
                          <div 
                            className="w-full h-full rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold text-base sm:text-lg absolute inset-0"
                            style={{ display: 'none' }}
                          >
                            {initials}
                          </div>
                        </>
                      ) : (
                        <div className="w-full h-full rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold text-base sm:text-lg absolute inset-0">
                          {initials}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm sm:text-base font-bold text-gray-900 truncate">
                        {displayName}
                      </h3>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {user.email}
                      </p>
                    </div>
                  </div>
                  {migrationStatus && (
                    <div className="mt-3 px-2.5 py-1.5 text-xs bg-green-100 text-green-700 rounded-lg border border-green-200 animate-pulse">
                      {migrationStatus}
                    </div>
                  )}
                </div>

                {/* Actions du menu */}
                <div className="p-2">
                  <button
                    onClick={handleSignOut}
                    disabled={loading}
                    className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 min-h-[44px] active:scale-95"
                  >
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    <span>{loading ? t('auth.signOutProgress') : t('auth.signOut')}</span>
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Non connecté - Bouton de connexion moderne avec Language Switcher
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
      <button
        ref={buttonRef}
        onClick={handleSignIn}
        disabled={loading}
        type="button"
        className="google-signin-btn-modern relative w-full sm:w-auto px-4 py-2.5 sm:px-5 sm:py-3 bg-white border-2 border-gray-200 rounded-xl hover:border-gray-300 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2 sm:gap-3 font-medium text-gray-700 hover:text-gray-900 min-h-[44px] sm:min-h-[48px] text-sm sm:text-base active:scale-95"
        style={{
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          WebkitTapHighlightColor: 'transparent',
          touchAction: 'manipulation',
        }}
      >
        <div className="flex items-center justify-center w-5 h-5 sm:w-5 sm:h-5 flex-shrink-0">
          <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
        </div>
        <span className="google-signin-text-modern">
          {loading ? t('auth.signInProgress') : t('auth.signIn')}
        </span>
        {loading && (
          <svg className="animate-spin h-4 w-4 text-gray-400 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        )}
      </button>
      <div className="w-full sm:w-auto flex justify-center sm:justify-start">
        <LanguageSwitcher />
      </div>
    </div>
  );
}

