export type EncodingLabel =
  | 'utf-8'
  | 'utf-16le'
  | 'utf-16be'
  | 'gb18030'
  | 'big5'
  | 'windows-1252';

export interface BookRecord {
  id: string;
  name: string;
  fileName: string;
  size: number;
  lastModified: number;
  lastOpenedAt: number;
  isFavorite: boolean;
  encoding: EncodingLabel | null;
  chapterCount: number | null;
  source: 'local' | 'online';
  url?: string;
}

export interface OnlineBook {
  title: string;
  fileName: string;
  size: number;
}

export interface OnlineChapterIndex {
  fileName: string;
  size: number;
  encoding: EncodingLabel;
  chapters: Chapter[];
}

export interface Progress {
  bookId: string;
  chapterIndex: number;
  scrollTop: number;
  updatedAt: number;
}

export interface Chapter {
  index: number;
  title: string;
  start: number; // 文件内字节偏移（含章节标题行）
  end: number;   // 下一章字节偏移（不含）
}

export type ThemeName = 'light' | 'sepia' | 'green' | 'dark';

export type ReadingMode = 'chapter' | 'scroll';

export interface ReaderSettings {
  fontFamily: string;
  fontSize: number;      // px
  lineHeight: number;    // 行距倍数
  paragraphGap: number;  // 段距 em
  textAlign: 'left' | 'justify';
  maxWidth: number;      // 正文最大宽度 px
  theme: ThemeName;
  readingMode: ReadingMode;
}

export interface OpenedTxt {
  file: File;
  handle: FileSystemFileHandle | null;
}
