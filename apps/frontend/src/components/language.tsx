import { createContext, useContext } from 'react';

export type AppLanguage = 'en' | 'es';

/**
 * UI language for the whole app. English is the default (hackathon
 * audience); visitors can switch every screen to Spanish. Domain data
 * (hazard presets, generated reports) keeps its own wording — this only
 * controls interface chrome.
 */
export const LanguageContext = createContext<AppLanguage>('en');

export function useLanguage(): AppLanguage {
  return useContext(LanguageContext);
}

/** Pick one of two UI strings by the active language. */
export function pick<T>(language: AppLanguage, en: T, es: T): T {
  return language === 'en' ? en : es;
}

export function LanguageToggle(props: {
  language: AppLanguage;
  onChange(language: AppLanguage): void;
}) {
  const base = {
    border: 0,
    padding: '7px 10px',
    cursor: 'pointer',
    font: '700 11px/1 system-ui, sans-serif',
    letterSpacing: '0.08em',
  } as const;
  return (
    <span
      role="group"
      aria-label={props.language === 'en' ? 'Language' : 'Idioma'}
      style={{
        display: 'inline-flex',
        border: '1px solid rgba(233,242,240,0.22)',
        borderRadius: 9,
        overflow: 'hidden',
      }}
    >
      {(['en', 'es'] as const).map((language) => (
        <button
          key={language}
          type="button"
          aria-pressed={props.language === language}
          onClick={() => props.onChange(language)}
          style={{
            ...base,
            background:
              props.language === language
                ? 'rgba(45,212,191,0.22)'
                : 'transparent',
            color:
              props.language === language ? '#fff' : 'rgba(233,242,240,0.6)',
          }}
        >
          {language.toUpperCase()}
        </button>
      ))}
    </span>
  );
}
