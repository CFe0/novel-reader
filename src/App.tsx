import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import Bookshelf from './components/Bookshelf';
import Reader from './components/Reader';
import type {
  BookRecord,
  BookGroup,
  Chapter,
  EncodingLabel,
  OnlineBook,
  OnlineChapterIndex,
  ReaderSettings,
  ThemeName,
} from './types';
import { detectEncoding } from './lib/encoding';
import { scanChapters } from './lib/chapters';
import type { Sliceable } from './lib/chapters';
import { idbAll, idbDelete, idbGet, idbPut } from './lib/storage';
import {
  bookIdOf,
  getSavedHandle,
  lanBookId,
  onlineBookId,
  openSavedFile,
  pickTxtFilesWithPicker,
  RemoteBookFile,
  saveHandle,
  supportsFilePicker,
} from './lib/fileOpen';
import { loadSettings, loadShelfTheme, saveSettings, saveShelfTheme } from './lib/settings';

type View =
  | { kind: 'shelf' }
  | { kind: 'reader'; book: BookRecord; file: File | Sliceable; chapters: Chapter[]; encoding: EncodingLabel };

export default function App() {
  const [books, setBooks] = useState<BookRecord[]>([]);
  const [onlineBooks, setOnlineBooks] = useState<OnlineBook[]>([]);
  const [lanBooks, setLanBooks] = useState<OnlineBook[]>([]);
  const [lanAvailable, setLanAvailable] = useState(false);
  const [groups, setGroups] = useState<BookGroup[]>([]);
  const [settings, setSettings] = useState<ReaderSettings>(() => loadSettings());
  const [shelfTheme, setShelfTheme] = useState<ThemeName>(() => loadShelfTheme());
  const [view, setView] = useState<View>({ kind: 'shelf' });
  const [busy, setBusy] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const chapterCacheRef = useRef(new Map<string, Chapter[]>());

  useEffect(() => {
    document.documentElement.dataset.theme = view.kind === 'shelf' ? shelfTheme : settings.theme;
  }, [view.kind, shelfTheme, settings.theme]);

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

  useEffect(() => {
    let alive = true;
    void idbAll<BookGroup>('groups').then((list) => {
      if (!alive) return;
      list.sort((a, b) => a.order - b.order);
      setGroups(list);
    });
    return () => {
      alive = false;
    };
  }, []);

  // 读取/刷新仓库中的在线书库（books/index.json，构建时自动生成；带时间戳避免缓存）
  const refreshOnlineBooks = useCallback(async () => {
    try {
      const res = await fetch(`books/index.json?t=${Date.now()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { books?: OnlineBook[] };
      setOnlineBooks(data.books ?? []);
    } catch {
      // 网络异常时保留现有列表
    }
  }, []);

  useEffect(() => {
    if (view.kind === 'shelf') void refreshOnlineBooks();
  }, [view.kind, refreshOnlineBooks]);

  // 局域网书库：仅在本机 lan-server（npm run lan）提供页面时可检测到
  useEffect(() => {
    if (view.kind !== 'shelf') return;
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(`lan-books/index.json?t=${Date.now()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { books?: OnlineBook[] };
        if (!alive) return;
        setLanBooks(data.books ?? []);
        setLanAvailable(true);
        // 为局域网书籍建立书架记录（用于文件夹归属，保留已有分组）
        const created: BookRecord[] = [];
        for (const ob of data.books ?? []) {
          const id = lanBookId(ob.fileName, ob.size);
          const existing = await idbGet<BookRecord>('books', id);
          if (!existing) {
            const rec: BookRecord = {
              id,
              name: ob.title,
              fileName: ob.fileName,
              size: ob.size,
              lastModified: 0,
              lastOpenedAt: 0,
              isFavorite: false,
              encoding: null,
              chapterCount: null,
              source: 'lan',
              url: `lan-books/${encodeURIComponent(ob.fileName)}`,
              pinned: false,
            };
            created.push(rec);
            await idbPut('books', rec);
          }
        }
        if (created.length && alive) {
          setBooks((prev) => [...created.filter((r) => !prev.some((b) => b.id === r.id)), ...prev]);
        }
      } catch {
        if (alive) setLanAvailable(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [view.kind]);

  const openTxt = useCallback(
    async (
      file: File,
      handle: FileSystemFileHandle | null,
      encoding?: EncodingLabel,
      opts?: { id?: string; source?: 'local' | 'online' | 'lan'; url?: string; groupId?: string; pinned?: boolean },
    ) => {
      const id = opts?.id ?? bookIdOf(file);
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
      source: opts?.source ?? 'local',
      ...(opts?.url ? { url: opts.url } : {}),
      groupId: old?.groupId ?? opts?.groupId,
      pinned: old?.pinned ?? opts?.pinned ?? false,
    };
    await idbPut('books', record);
    if (opts?.source === undefined || opts?.source === 'local') await saveHandle(id, handle);
    setBooks((prev) =>
      [record, ...prev.filter((b) => b.id !== id)].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt),
    );
    setView({ kind: 'reader', book: record, file, chapters, encoding: enc });
    setBusy(null);
    },
    [],
  );

  const openRemoteBook = useCallback(
    async (ob: OnlineBook) => {
      const url = `books/${encodeURIComponent(ob.fileName)}`;
      setBusy('正在加载书籍信息…');
      try {
        const idxUrl = `books/${encodeURIComponent(ob.title)}/chapters.json`;
        const idxRes = await fetch(idxUrl);
        if (!idxRes.ok) throw new Error(`HTTP ${idxRes.status}`);
        const idx = (await idxRes.json()) as OnlineChapterIndex;
        const source = new RemoteBookFile(url, idx.size);
        const record: BookRecord = {
          id: onlineBookId(ob.fileName, ob.size),
          name: ob.title,
          fileName: ob.fileName,
          size: ob.size,
          lastModified: 0,
          lastOpenedAt: Date.now(),
          isFavorite: false,
          encoding: idx.encoding,
          chapterCount: idx.chapters.length,
          source: 'online',
          url,
          chaptersUrl: `books/${encodeURIComponent(ob.title)}/chapters/`,
        };
        setView({ kind: 'reader', book: record, file: source, chapters: idx.chapters, encoding: idx.encoding });
        setBusy(null);
      } catch (err) {
        console.warn('章节索引加载失败，回退整本下载', err);
        setBusy('正在下载整本小说…');
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const file = new File([await res.blob()], ob.fileName, { lastModified: 0 });
          await openTxt(file, null, undefined, {
            id: onlineBookId(ob.fileName, ob.size),
            source: 'online',
            url,
          });
        } catch (err2) {
          console.warn('在线书籍加载失败', err2);
          setBusy(null);
          alert('在线书籍加载失败，请检查网络后重试。');
        }
      }
    },
    [openTxt],
  );

  const openOnlineBook = useCallback(
    (ob: OnlineBook) => openRemoteBook(ob),
    [openRemoteBook],
  );

  const openLanBook = useCallback(
    async (ob: OnlineBook) => {
      const url = `lan-books/${encodeURIComponent(ob.fileName)}`;
      setBusy('正在从电脑加载书籍…');
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const file = new File([await res.blob()], ob.fileName, { lastModified: 0 });
        await openTxt(file, null, undefined, {
          id: lanBookId(ob.fileName, file.size),
          source: 'lan',
          url,
        });
      } catch (err) {
        console.warn('局域网书籍加载失败', err);
        setBusy(null);
        alert('局域网书籍加载失败，请确认电脑端服务正在运行。');
      }
    },
    [openTxt],
  );

  const reopenBook = useCallback(
    async (book: BookRecord) => {
      if (book.source === 'online') {
        await openRemoteBook({ title: book.name, fileName: book.fileName, size: book.size });
        return;
      }
      if (book.source === 'lan' && book.url) {
        setBusy('正在从电脑加载书籍…');
        try {
          const res = await fetch(book.url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const file = new File([await res.blob()], book.fileName, { lastModified: 0 });
          await openTxt(file, null, book.encoding ?? undefined, {
            id: book.id,
            source: 'lan',
            url: book.url,
            groupId: book.groupId,
            pinned: book.pinned,
          });
        } catch (err) {
          console.warn('局域网书籍重新加载失败', err);
          setBusy(null);
          alert('局域网书籍加载失败，请确认电脑端服务正在运行。');
        }
        return;
      }
      const handle = await getSavedHandle(book.id);
      if (!handle) {
        setBusy(null);
        alert(
          '当前网页环境无法自动记住该文件（浏览器仅对 https 或 localhost 开放此能力）。\n请点击右上角“打开 TXT”，重新选择同一个文件（同一文件会自动恢复进度与分组）。',
        );
        return;
      }
      setBusy('正在打开…');
      const file = await openSavedFile(book.id);
      if (!file) {
        setBusy(null);
        alert('未能获得文件读取权限，请重新选择该 TXT 文件。');
        return;
      }
      await openTxt(file, handle, book.encoding ?? undefined);
    },
    [openRemoteBook, openTxt],
  );

  const changeEncoding = useCallback(
    async (enc: EncodingLabel) => {
      if (view.kind !== 'reader') return;
      if (view.book.source === 'online') {
        alert('在线书籍暂不支持切换编码（书内编码已在发布时识别）。');
        return;
      }
      setBusy('正在按新编码重新解析章节…');
      const chapters = await scanChapters(view.file as File, enc, (p) =>
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

  const createGroup = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const order = groups.reduce((m, g) => Math.max(m, g.order), 0) + 1;
      const group: BookGroup = {
        id: `g_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
        name: trimmed,
        order,
        createdAt: Date.now(),
      };
      await idbPut('groups', group);
      setGroups((prev) => [...prev, group].sort((a, b) => a.order - b.order));
    },
    [groups],
  );

  const renameGroup = useCallback(
    async (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const target = groups.find((g) => g.id === id);
      if (!target) return;
      const next = { ...target, name: trimmed };
      await idbPut('groups', next);
      setGroups((prev) => prev.map((g) => (g.id === id ? next : g)));
    },
    [groups],
  );

  const deleteGroup = useCallback(
    async (id: string) => {
      const next = groups.filter((g) => g.id !== id);
      const affected = books.filter((b) => b.groupId === id);
      for (const b of affected) {
        const rec = { ...b, groupId: undefined };
        await idbPut('books', rec);
      }
      await idbDelete('groups', id);
      setGroups(next);
      setBooks((prev) => prev.map((b) => (b.groupId === id ? { ...b, groupId: undefined } : b)));
    },
    [groups, books],
  );

  const moveGroup = useCallback(
    async (id: string, dir: -1 | 1) => {
      const sorted = [...groups].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex((g) => g.id === id);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= sorted.length) return;
      [sorted[idx], sorted[j]] = [sorted[j], sorted[idx]];
      sorted.forEach((g, i) => {
        g.order = i + 1;
      });
      for (const g of sorted) await idbPut('groups', g);
      setGroups(sorted);
    },
    [groups],
  );

  const removeLocalBook = useCallback(async (book: BookRecord) => {
    await idbDelete('books', book.id);
    await idbDelete('progress', book.id);
    await idbDelete('handles', book.id);
    setBooks((prev) => prev.filter((b) => b.id !== book.id));
  }, []);

  const moveBooksToGroup = useCallback(
    async (ids: string[], groupId: string | null) => {
      const next = books.map((b) => (ids.includes(b.id) ? { ...b, groupId: groupId ?? undefined } : b));
      for (const b of next) {
        if (ids.includes(b.id)) await idbPut('books', b);
      }
      setBooks(next);
    },
    [books],
  );

  const updateSettings = useCallback((next: ReaderSettings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  const updateShelfTheme = useCallback((theme: ThemeName) => {
    setShelfTheme(theme);
    saveShelfTheme(theme);
  }, []);

  const importMany = useCallback(
    async (files: File[]) => {
      const txts = files.filter((f) => /\.txt$/i.test(f.name));
      if (!txts.length) return;
      setBusy(`正在导入 ${txts.length} 本小说…`);
      for (let i = 0; i < txts.length; i++) {
        setBusy(`正在导入 ${i + 1}/${txts.length}：${txts[i].name}`);
        await openTxt(txts[i], null);
      }
      setView({ kind: 'shelf' });
      setBusy(null);
    },
    [openTxt],
  );

  const onImportClick = useCallback(async () => {
    if (supportsFilePicker()) {
      try {
        const picked = await pickTxtFilesWithPicker();
        if (picked.length) {
          const files = picked.map((p) => p.file);
          void importMany(files);
        }
      } catch {
        alert('打开文件失败，请重试。');
      }
    } else {
      inputRef.current?.click();
    }
  }, [importMany]);

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length) void importMany(files);
    e.target.value = '';
  };

  const onFolderInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length) void importMany(files);
    e.target.value = '';
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const files = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    const txts = files.filter((f) => /\.txt$/i.test(f.name));
    if (files.length > 0 && txts.length === 0) {
      alert('仅支持 .txt 文件');
      return;
    }
    if (txts.length) void importMany(txts);
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
          groups={groups}
          onlineBooks={onlineBooks}
          lanBooks={lanBooks}
          lanAvailable={lanAvailable}
          shelfTheme={shelfTheme}
          onShelfThemeChange={updateShelfTheme}
          onOpenLocal={(b) => void reopenBook(b)}
          onOpenOnline={(b) => void openOnlineBook(b)}
          onOpenLan={(b) => void openLanBook(b)}
          onImport={() => void onImportClick()}
          onImportFolder={() => folderInputRef.current?.click()}
          onRefreshOnlineBooks={() => refreshOnlineBooks()}
          onRemoveLocal={(b) => void removeLocalBook(b)}
          onCreateGroup={(name) => createGroup(name)}
          onRenameGroup={(id, name) => renameGroup(id, name)}
          onDeleteGroup={(id) => deleteGroup(id)}
          onMoveGroup={(id, dir) => moveGroup(id, dir)}
          onMoveBooksToGroup={(ids, gid) => moveBooksToGroup(ids, gid)}
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
      <input
        ref={inputRef}
        type="file"
        accept=".txt,text/plain"
        multiple
        style={{ display: 'none' }}
        onChange={onInputChange}
      />
      <input
        ref={folderInputRef}
        type="file"
        accept=".txt,text/plain"
        multiple
        {...({ webkitdirectory: '' } as Record<string, string>)}
        style={{ display: 'none' }}
        onChange={onFolderInputChange}
      />
    </div>
  );
}
