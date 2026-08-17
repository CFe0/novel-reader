import type { ReaderSettings, ThemeName } from '../types';

export const DEFAULT_SETTINGS: ReaderSettings = {
  fontFamily: "'Microsoft YaHei', sans-serif",
  fontSize: 24,
  lineHeight: 1.9,
  paragraphGap: 0.8,
  textAlign: 'justify',
  maxWidth: 1000,
  theme: 'dark',
  readingMode: 'scroll',
};

const KEY = 'txt-reader-settings';
const SETTINGS_VERSION = 3;

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

const SHELF_THEME_KEY = 'txt-reader-shelf-theme';

/** 书架主题与阅读主题分开保存；首次打开书架默认日间 */
export function loadShelfTheme(): ThemeName {
  try {
    const raw = localStorage.getItem(SHELF_THEME_KEY);
    const valid: ThemeName[] = ['light', 'sepia', 'green', 'dark', 'lightGreen', 'sage'];
    if (raw && valid.includes(raw as ThemeName)) return raw as ThemeName;
  } catch {
    // 忽略
  }
  return 'light';
}

export function saveShelfTheme(theme: ThemeName): void {
  try {
    localStorage.setItem(SHELF_THEME_KEY, theme);
  } catch {
    // 忽略
  }
}
