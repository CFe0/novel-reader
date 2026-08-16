import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import Bookshelf from './components/Bookshelf';
import Reader from './components/Reader';
import type { BookRecord, Chapter, EncodingLabel, ReaderSettings } from './types';
import { detectEncoding } from './lib/encoding';
import { scanChapters } from './lib/chapters';
import { idbAll, idbDelete, idbGet, idbPut } from './lib/storage';
import {
  bookIdOf,
  getSavedHandle,
  openSavedFile,
  pickTxtWithPicker,
  saveHandle,
  supportsFilePicker,
} from './lib/fileOpen';
import { loadSettings, saveSettings } from './lib/settings';

type View =
  | { kind: 'shelf' }
  | { kind: 'reader'; book: BookRecord; file: File; chapters: Chapter[]; encoding: EncodingLabel };

export default function App() {
  const [books, setBooks] = useState<BookRecord[]>([]);
  const [settings, setSettings] = useState<ReaderSettings>(() => loadSettings());
  const [view, setView] = useState<View>({ kind: 'shelf' });
  const [busy, setBusy] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const chapterCacheRef = useRef(new Map<string, Chapter[]>());

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  useEffect(() => {
    let alive = true;
    void idbAll<BookRecord>('books').then((list) => {
      if (!alive) return;
      list.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
      setBooks(list);
    });
    return () => {
      alive = false;
    };
  }, []);

  const openTxt = useCallback(async (file: File, handle: FileSystemFileHandle | null, encoding?: EncodingLabel) => {
    const id = bookIdOf(file);
    let enc = encoding;
    if (!enc) {
      setBusy('正在识别编码…');
      const head = await file.slice(0, Math.min(file.size, 1024 * 1024)).arrayBuffer();
      enc = detectEncoding(head);
    }
    let chapters = chapterCacheRef.current.get(id);
    if (!chapters) {
      setBusy('正在解析章节…');
      chapters = await scanChapters(file, enc, (p) => setBusy(`正在解析章节… ${Math.round(p * 100)}%`));
      chapterCacheRef.current.set(id, chapters);
    }
    const old = await idbGet<BookRecord>('books', id);
    const record: BookRecord = {
      id,
      name: file.name.replace(/\.txt$/i, '') || file.name,
      fileName: file.name,
      size: file.size,
      lastModified: file.lastModified,
      lastOpenedAt: Date.now(),
      isFavorite: old?.isFavorite ?? false,
      encoding: enc,
      chapterCount: chapters.length,
    };
    await idbPut('books', record);
    await saveHandle(id, handle);
    setBooks((prev) =>
      [record, ...prev.filter((b) => b.id !== id)].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt),
    );
    setView({ kind: 'reader', book: record, file, chapters, encoding: enc });
    setBusy(null);
  }, []);

  const reopenBook = useCallback(
    async (book: BookRecord) => {
      setBusy('正在打开…');
      const file = await openSavedFile(book.id);
      if (!file) {
        setBusy(null);
        alert('无法自动重新打开原文件（文件可能已被移动或删除），请重新选择该 TXT 文件。');
        return;
      }
      const handle = await getSavedHandle(book.id);
      await openTxt(file, handle, book.encoding ?? undefined);
    },
    [openTxt],
  );

  const changeEncoding = useCallback(
    async (enc: EncodingLabel) => {
      if (view.kind !== 'reader') return;
      setBusy('正在按新编码重新解析章节…');
      const chapters = await scanChapters(view.file, enc, (p) =>
        setBusy(`正在解析章节… ${Math.round(p * 100)}%`),
      );
      chapterCacheRef.current.set(view.book.id, chapters);
      const updated: BookRecord = { ...view.book, encoding: enc, chapterCount: chapters.length };
      await idbPut('books', updated);
      setBooks((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
      setView({ kind: 'reader', book: updated, file: view.file, chapters, encoding: enc });
      setBusy(null);
    },
    [view],
  );

  const removeBook = useCallback(
    async (book: BookRecord) => {
      if (!window.confirm(`确定从书架移除《${book.name}》吗？`)) return;
      await idbDelete('books', book.id);
      await idbDelete('progress', book.id);
      await idbDelete('handles', book.id);
      setBooks((prev) => prev.filter((b) => b.id !== book.id));
      if (view.kind === 'reader' && view.book.id === book.id) setView({ kind: 'shelf' });
    },
    [view],
  );

  const toggleFavorite = useCallback(async (book: BookRecord) => {
    const updated = { ...book, isFavorite: !book.isFavorite };
    await idbPut('books', updated);
    setBooks((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
  }, []);

  const updateSettings = useCallback((next: ReaderSettings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  const onImportClick = useCallback(async () => {
    if (supportsFilePicker()) {
      try {
        const picked = await pickTxtWithPicker();
        if (picked) void openTxt(picked.file, picked.handle);
      } catch {
        alert('打开文件失败，请重试。');
      }
    } else {
      inputRef.current?.click();
    }
  }, [openTxt]);

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void openTxt(f, null);
    e.target.value = '';
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    if (!/\.txt$/i.test(f.name)) {
      alert('仅支持 .txt 文件');
      return;
    }
    void openTxt(f, null);
  };

  return (
    <div
      className="app"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {busy && <div className="busy-overlay">{busy}</div>}
      {dragging && <div className="drop-hint">松开鼠标以打开 TXT 文件</div>}
      {view.kind === 'shelf' ? (
        <Bookshelf
          books={books}
          onImport={() => void onImportClick()}
          onOpen={(b) => void reopenBook(b)}
          onRemove={(b) => void removeBook(b)}
          onToggleFavorite={(b) => void toggleFavorite(b)}
        />
      ) : (
        <Reader
          key={`${view.book.id}|${view.encoding}`}
          book={view.book}
          file={view.file}
          chapters={view.chapters}
          encoding={view.encoding}
          settings={settings}
          onSettingsChange={updateSettings}
          onEncodingChange={(enc) => void changeEncoding(enc)}
          onBack={() => setView({ kind: 'shelf' })}
        />
      )}
      <input ref={inputRef} type="file" accept=".txt,text/plain" style={{ display: 'none' }} onChange={onInputChange} />
    </div>
  );
}
