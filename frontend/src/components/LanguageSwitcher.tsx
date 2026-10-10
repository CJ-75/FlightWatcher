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
      className="h-10 w-10 sm:h-11 sm:w-11 shrink-0 rounded-full bg-white border-2 border-line hover:border-primary-500 text-[11px] sm:text-xs font-bold text-ink-soft uppercase tracking-wide shadow-soft hover:shadow-lift active:scale-95 transition-all flex items-center justify-center"
      title={language === 'fr' ? 'Switch to English' : 'Passer en français'}
      aria-label={language === 'fr' ? 'Switch to English' : 'Passer en français'}
    >
      {language === 'fr' ? 'FR' : 'EN'}
    </button>
  );
}
