import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SaveSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
  defaultName?: string;
  isLoading?: boolean;
}

export function SaveSearchModal({
  isOpen,
  onClose,
  onSave,
  defaultName = '',
  isLoading = false
}: SaveSearchModalProps) {
  const [searchName, setSearchName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSearchName(defaultName || `Recherche ${new Date().toLocaleDateString('fr-FR')}`);
      setError(null);
    }
  }, [isOpen, defaultName]);

  const handleSave = async () => {
    if (!searchName.trim()) {
      setError('Veuillez entrer un nom pour la recherche');
      return;
    }

    try {
      await onSave(searchName.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading) {
      handleSave();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="app-dialog-root"
        >
          <button type="button" aria-label="Fermer" className="app-dialog-backdrop" onClick={onClose} />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="app-dialog-panel app-dialog-md p-5 sm:p-7"
            onClick={(e) => e.stopPropagation()}
          >
              <div className="flex items-center justify-between mb-5 sm:mb-6">
                <h2 className="text-xl sm:text-2xl font-extrabold text-ink tracking-tight">
                  Sauvegarder la recherche
                </h2>
                <button
                  onClick={onClose}
                  disabled={isLoading}
                  className="w-9 h-9 rounded-full bg-canvas text-ink-soft hover:bg-primary-50 transition-colors disabled:opacity-50"
                  aria-label="Fermer"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mb-6">
                <label htmlFor="search-name" className="block text-sm font-semibold text-ink mb-2">
                  Nom de la recherche
                </label>
                <input
                  id="search-name"
                  type="text"
                  value={searchName}
                  onChange={(e) => {
                    setSearchName(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={handleKeyPress}
                  placeholder="Ex: Weekends pas chers"
                  disabled={isLoading}
                  className="w-full px-4 py-3 border border-line rounded-2xl focus:ring-2 focus:ring-primary-200 focus:border-primary-500 outline-none transition-all disabled:opacity-50"
                  autoFocus
                />
                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-2 text-sm text-red-600"
                  >
                    {error}
                  </motion.p>
                )}
                <p className="mt-2 text-xs text-muted">
                  Ce nom vous aidera à retrouver facilement cette recherche plus tard.
                </p>
              </div>

              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isLoading}
                  className="w-full sm:w-auto px-5 py-2.5 text-ink-soft bg-canvas rounded-2xl hover:bg-primary-50 transition-colors disabled:opacity-50 min-h-[44px] text-sm font-semibold"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isLoading || !searchName.trim()}
                  className="w-full sm:w-auto px-6 py-2.5 app-btn-primary rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px] text-sm"
                >
                  {isLoading ? 'Sauvegarde…' : 'Sauvegarder'}
                </button>
              </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

