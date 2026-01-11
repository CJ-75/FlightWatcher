import { useI18n } from '../contexts/I18nContext';

export function LanguageSwitcher() {
  const { language, setLanguage } = useI18n();

  const toggleLanguage = () => {
    setLanguage(language === 'fr' ? 'en' : 'fr');
  };

  return (
    <button
      onClick={toggleLanguage}
      className="px-3 py-2 sm:px-4 sm:py-2.5 bg-gray-100 rounded-xl hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center font-semibold text-gray-700 hover:text-gray-900 min-h-[44px] sm:min-h-[48px] text-sm sm:text-base active:scale-95 shadow-sm hover:shadow-md uppercase"
      title={language === 'fr' ? 'Switch to English' : 'Passer en français'}
      aria-label={language === 'fr' ? 'Switch to English' : 'Passer en français'}
    >
      {language === 'fr' ? 'FR' : 'EN'}
    </button>
  );
}

