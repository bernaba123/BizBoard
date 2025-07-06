import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, ChevronDown } from 'lucide-react';

const LanguageSwitcher = () => {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const languages = [
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'am', name: 'አማርኛ', flag: '🇪🇹' },
    { code: 'or', name: 'Afaan Oromoo', flag: '🇪🇹' }
  ];

  const currentLanguage = languages.find(lang => lang.code === i18n.language) || languages[0];

  const changeLanguage = async (langCode) => {
    try {
      await i18n.changeLanguage(langCode);
      setIsOpen(false);
      
      // Trigger a page refresh to reload data with new language
      // This ensures backend data is fetched with the new Accept-Language header
      window.location.reload();
    } catch (error) {
      console.error('Error changing language:', error);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
      >
        <Globe className="h-5 w-5" />
        <span className="hidden sm:block text-sm font-medium">
          {currentLanguage.flag} {currentLanguage.name}
        </span>
        <ChevronDown className="h-4 w-4" />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown */}
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-50">
            <div className="py-1">
              {languages.map((language) => (
                <button
                  key={language.code}
                  onClick={() => changeLanguage(language.code)}
                  className={`flex items-center w-full px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${
                    i18n.language === language.code
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-gray-700'
                  }`}
                >
                  <span className="mr-3 text-lg">{language.flag}</span>
                  <span className="font-medium">{language.name}</span>
                  {i18n.language === language.code && (
                    <span className="ml-auto text-blue-600">✓</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default LanguageSwitcher;