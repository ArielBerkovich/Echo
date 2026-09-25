// Language metadata is the single source of truth for locale-sensitive UI
// behavior. Adding a language should require one entry here plus translations.
export const LANGUAGE_CONFIG = {
  en: {
    locale: "en-US",
    direction: "ltr",
    relativeLabels: {
      today: "Today",
      yesterday: "Yesterday",
      now: "now",
      minutesAgo: (count: number) => `${count} min`,
    },
  },
  he: {
    locale: "he-IL",
    direction: "rtl",
    relativeLabels: {
      today: "היום",
      yesterday: "אתמול",
      now: "עכשיו",
      minutesAgo: (count: number) => `לפני ${count} דק׳`,
    },
  },
} as const;

export type Language = keyof typeof LANGUAGE_CONFIG;
export type InterfaceDirection = (typeof LANGUAGE_CONFIG)[Language]["direction"];

export function languageConfig(language: string | null | undefined) {
  return LANGUAGE_CONFIG[language as Language] || LANGUAGE_CONFIG.en;
}

export function languageDirection(language: string | null | undefined): InterfaceDirection {
  return languageConfig(language).direction;
}

export function languageLocale(language: string | null | undefined) {
  return languageConfig(language).locale;
}
