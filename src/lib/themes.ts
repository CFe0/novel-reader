import type { ThemeName } from '../types';

export const THEME_ORDER: ThemeName[] = ['light', 'sepia', 'green', 'dark', 'lightGreen', 'sage'];

export const THEME_NAMES: Record<ThemeName, string> = {
  light: '日间',
  sepia: '米黄',
  green: '护眼绿',
  dark: '夜间',
  lightGreen: '浅绿',
  sage: '豆绿',
};

export const THEME_SWATCHES: Record<ThemeName, string> = {
  light: '#ffffff',
  sepia: '#f6f0e3',
  green: '#e9f1e5',
  dark: '#161719',
  lightGreen: '#E6F4DF',
  sage: '#DDE8D2',
};

export const THEME_OPTIONS: Array<{ id: ThemeName; name: string }> = THEME_ORDER.map((id) => ({
  id,
  name: THEME_NAMES[id],
}));
