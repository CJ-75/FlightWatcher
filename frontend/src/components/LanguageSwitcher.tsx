import { useI18n } from '../contexts/I18nContext';

export function LanguageSwitcher() {
  const { language, setLanguage } = useI18n();

  const toggleLanguage = () => {
    setLanguage(language === 'fr' ? 'en' : 'fr');
  };

  return (
    <button
      onClick={toggleLanguage}
      type="button"
      className="app-icon-btn h-10 w-10 sm:h-11 sm:w-11 shrink-0 rounded-full bg-white border-2 border-line text-[11px] sm:text-xs font-bold text-ink-soft uppercase tracking-wide shadow-soft flex items-center justify-center hover:text-primary-700 hover:bg-primary-50"
      title={language === 'fr' ? 'Switch to English' : 'Passer en français'}
      aria-label={language === 'fr' ? 'Switch to English' : 'Passer en français'}
    >
      {language === 'fr' ? 'FR' : 'EN'}
    </button>
  );
}
