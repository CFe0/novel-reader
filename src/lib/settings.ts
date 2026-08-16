import type { ReaderSettings } from '../types';

export const DEFAULT_SETTINGS: ReaderSettings = {
  fontFamily: "'SimSun', 'Songti SC', serif",
  fontSize: 18,
  lineHeight: 1.8,
  paragraphGap: 0.4,
  textAlign: 'justify',
  maxWidth: 860,
  theme: 'light',
  readingMode: 'scroll',
};

const KEY = 'txt-reader-settings';

export function loadSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<ReaderSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: ReaderSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // 隐私模式下可能不可用，静默忽略
  }
}
