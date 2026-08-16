import type { ReaderSettings } from '../types';

export const DEFAULT_SETTINGS: ReaderSettings = {
  fontFamily: "'SimSun', 'Songti SC', serif",
  fontSize: 24,
  lineHeight: 1.9,
  paragraphGap: 0.8,
  textAlign: 'justify',
  maxWidth: 1000,
  theme: 'dark',
  readingMode: 'scroll',
};

const KEY = 'txt-reader-settings';
const SETTINGS_VERSION = 2;

export function loadSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ReaderSettings> & { version?: number };
    // 设置结构版本升级时，使用新的默认值（保留用户后续修改）
    if ((parsed.version ?? 1) < SETTINGS_VERSION) {
      saveSettings(DEFAULT_SETTINGS);
      return DEFAULT_SETTINGS;
    }
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: ReaderSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...settings, version: SETTINGS_VERSION }));
  } catch {
    // 隐私模式下可能不可用，静默忽略
  }
}
