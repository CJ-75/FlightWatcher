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
      <div className="flex items-center gap-2">
        <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-full bg-primary-50 border-2 border-line animate-pulse" />
        <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-full bg-primary-50 border-2 border-line animate-pulse" />
      </div>
    );
  }

  if (user) {
    const avatarUrl = user.user_metadata?.avatar_url || userProfile?.avatar_url;
    const displayName = user.user_metadata?.full_name || userProfile?.full_name || user.email?.split('@')[0] || 'User';
    const initials = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || user.email?.charAt(0).toUpperCase() || 'U';

    return (
      <div className="relative flex items-center gap-2">
        <LanguageSwitcher />

        <button
          ref={buttonRef}
          onClick={() => setIsOpen(!isOpen)}
          type="button"
          className="relative h-10 w-10 sm:h-11 sm:w-11 rounded-full border-2 border-line hover:border-primary-500 transition-all shadow-soft hover:shadow-lift active:scale-95 overflow-hidden bg-white flex items-center justify-center shrink-0"
          aria-label={t('auth.userMenu')}
          aria-expanded={isOpen}
        >
          {avatarUrl ? (
            <>
              <img
                src={avatarUrl}
                alt={displayName}
                className="w-full h-full rounded-full object-cover"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                  if (fallback) fallback.style.display = 'flex';
                }}
              />
              <div
                className="w-full h-full rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white font-bold text-sm absolute inset-0"
                style={{ display: 'none' }}
              >
                {initials}
              </div>
            </>
          ) : (
            <div className="w-full h-full rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white font-bold text-sm">
              {initials}
            </div>
          )}
        </button>

        <AnimatePresence>
          {isOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsOpen(false)}
                className="fixed inset-0 bg-ink/20 backdrop-blur-sm z-40 sm:bg-transparent sm:backdrop-blur-0"
              />

              <motion.div
                ref={menuRef}
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                transition={{ type: 'spring', damping: 26, stiffness: 320 }}
                className="absolute right-0 top-full mt-2 w-64 sm:w-72 z-50 overflow-hidden rounded-2xl border border-line bg-white/95 shadow-lift backdrop-blur-xl"
              >
                <div className="bg-primary-50 p-4 border-b border-line">
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0 w-12 h-12 rounded-full border-2 border-white shadow-soft overflow-hidden bg-white">
                      {avatarUrl ? (
                        <>
                          <img
                            src={avatarUrl}
                            alt={displayName}
                            className="w-full h-full rounded-full object-cover"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
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
                            className="w-full h-full rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white font-bold text-base absolute inset-0"
                            style={{ display: 'none' }}
                          >
                            {initials}
                          </div>
                        </>
                      ) : (
                        <div className="w-full h-full rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white font-bold text-base absolute inset-0">
                          {initials}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-bold text-ink truncate">{displayName}</h3>
                      <p className="text-xs text-muted truncate mt-0.5">{user.email}</p>
                    </div>
                  </div>
                  {migrationStatus && (
                    <div className="mt-3 px-2.5 py-1.5 text-xs bg-emerald-50 text-emerald-700 rounded-xl border border-line">
                      {migrationStatus}
                    </div>
                  )}
                </div>

                <div className="p-2">
                  <button
                    onClick={handleSignOut}
                    disabled={loading}
                    type="button"
                    className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 min-h-[44px] active:scale-[0.98]"
                  >
                    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

  return (
    <div className="flex items-center gap-2 shrink-0">
      <LanguageSwitcher />
      <button
        ref={buttonRef}
        onClick={handleSignIn}
        disabled={loading}
        type="button"
        className="h-10 sm:h-11 px-3.5 sm:px-4 bg-white border-2 border-line rounded-full hover:border-primary-500 hover:shadow-lift disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 font-semibold text-ink-soft text-sm active:scale-95 shadow-soft"
      >
        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        <span className="whitespace-nowrap">
          {loading ? t('auth.signInProgress') : t('auth.signIn')}
        </span>
      </button>
    </div>
  );
}

