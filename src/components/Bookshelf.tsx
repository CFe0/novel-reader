import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { BookGroup, BookRecord, OnlineBook, Progress, ThemeName } from '../types';
import { idbAll } from '../lib/storage';
import { ENCODING_OPTIONS } from '../lib/encoding';
import { THEME_OPTIONS, THEME_SWATCHES } from '../lib/themes';

type Tab = 'online' | 'lan' | 'local';
const TAB_KEY = 'txt-reader-tab';

interface Props {
  books: BookRecord[];
  groups: BookGroup[];
  onlineBooks: OnlineBook[];
  lanBooks: OnlineBook[];
  lanAvailable: boolean;
  shelfTheme: ThemeName;
  onShelfThemeChange: (theme: ThemeName) => void;
  onOpenLocal: (book: BookRecord) => void;
  onOpenOnline: (book: OnlineBook) => void;
  onOpenLan: (book: OnlineBook) => void;
  onImport: () => void;
  onImportFolder: () => void;
  onRefreshOnlineBooks: () => Promise<void>;
  onRemoveLocal: (book: BookRecord) => void;
  onCreateGroup: (name: string) => Promise<void>;
  onRenameGroup: (id: string, name: string) => Promise<void>;
  onDeleteGroup: (id: string) => Promise<void>;
  onMoveGroup: (id: string, dir: -1 | 1) => Promise<void>;
  onMoveBooksToGroup: (ids: string[], groupId: string | null) => Promise<void>;
}

function formatSize(size: number): string {
  if (size >= 1048576) return `${(size / 1048576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function formatTime(ts: number): string {
  if (!ts) return '未打开';
  const d = new Date(ts);
  const now = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (d.toDateString() === now.toDateString()) return `今天 ${hh}:${mm}`;
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日`;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function encodingName(label: string | null): string {
  if (!label) return '编码未知';
  return ENCODING_OPTIONS.find((o) => o.label === label)?.name.split('（')[0] ?? label;
}

function sourceName(s: BookRecord['source']): string {
  if (s === 'online') return '在线';
  if (s === 'lan') return '局域网';
  return '本地';
}

function progressText(book: BookRecord, progress?: Progress): string {
  if (progress) return `已读至第 ${progress.chapterIndex + 1} 章`;
  if (book.chapterCount != null) return `共 ${book.chapterCount} 章`;
  return '';
}

function BookLine({
  book,
  progress,
  onClick,
  actions,
  meta,
}: {
  book: BookRecord;
  progress?: Progress;
  onClick: () => void;
  actions?: ReactNode;
  meta?: string;
}) {
  return (
    <div className="book-card">
      <div className="book-main" onClick={onClick}>
        <div className="book-name">{book.name}</div>
        <div className="book-meta">
          {meta ?? `${sourceName(book.source)} · ${formatSize(book.size)} · ${encodingName(book.encoding)}`}
          {progressText(book, progress) ? ` · ${progressText(book, progress)}` : ''} · {formatTime(book.lastOpenedAt)}
        </div>
      </div>
      {actions}
    </div>
  );
}

export default function Bookshelf({
  books,
  groups,
  onlineBooks,
  lanBooks,
  lanAvailable,
  shelfTheme,
  onShelfThemeChange,
  onOpenLocal,
  onOpenOnline,
  onOpenLan,
  onImport,
  onImportFolder,
  onRefreshOnlineBooks,
  onRemoveLocal,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onMoveGroup,
  onMoveBooksToGroup,
}: Props) {
  const [tab, setTab] = useState<Tab>(() => {
    const saved = localStorage.getItem(TAB_KEY) as Tab | null;
    return saved === 'online' || saved === 'lan' || saved === 'local' ? saved : 'online';
  });
  const [progressMap, setProgressMap] = useState<Record<string, Progress>>({});
  const [dialog, setDialog] = useState<null | { kind: 'create' } | { kind: 'rename'; group: BookGroup }>(null);
  const [folderName, setFolderName] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addTo, setAddTo] = useState<BookGroup | null>(null);
  const [addIds, setAddIds] = useState<string[]>([]);
  const [themeOpen, setThemeOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    void idbAll<Progress>('progress').then((list) => {
      if (!alive) return;
      const map: Record<string, Progress> = {};
      for (const p of list) map[p.bookId] = p;
      setProgressMap(map);
    });
    return () => {
      alive = false;
    };
  }, [books]);

  useEffect(() => {
    localStorage.setItem(TAB_KEY, tab);
  }, [tab]);

  const setTabAndReset = (t: Tab) => {
    setTab(t);
    setQuery('');
    setPage(1);
  };

  const lanRecords = useMemo(() => books.filter((b) => b.source === 'lan'), [books]);
  const localRecords = useMemo(() => books.filter((b) => b.source === 'local'), [books]);
  const recent = useMemo(
    () =>
      books
        .filter((b) => b.lastOpenedAt > 0)
        .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
        .slice(0, 3),
    [books],
  );

  const openRecent = (b: BookRecord) => {
    if (b.source === 'online') onOpenOnline({ title: b.name, fileName: b.fileName, size: b.size });
    else if (b.source === 'lan') onOpenLan({ title: b.name, fileName: b.fileName, size: b.size });
    else onOpenLocal(b);
  };

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ---------- 文件夹弹窗 ----------
  const openCreate = () => {
    setFolderName('');
    setDialog({ kind: 'create' });
  };
  const openRename = (g: BookGroup) => {
    setFolderName(g.name);
    setDialog({ kind: 'rename', group: g });
  };
  const submitFolder = () => {
    const name = folderName.trim();
    if (!name || !dialog) return;
    if (dialog.kind === 'create') void onCreateGroup(name);
    else if (name !== dialog.group.name) void onRenameGroup(dialog.group.id, name);
    setDialog(null);
  };
  const closeDialog = () => setDialog(null);

  // ---------- 添加书籍弹窗 ----------
  const ungroupedLan = useMemo(() => lanRecords.filter((b) => !b.groupId), [lanRecords]);
  const openAddBooks = (g: BookGroup) => {
    setAddIds([]);
    setAddTo(g);
  };
  const confirmAddBooks = () => {
    if (addTo && addIds.length) void onMoveBooksToGroup(addIds, addTo.id);
    setAddTo(null);
  };

  // ---------- 顶部公共区 ----------
  const header = (
    <>
      <header className="shelf-header">
        <div>
          <h1 className="shelf-title">本地小说阅读器</h1>
          <div className="shelf-sub">在线书库 · 任意设备联网即读 · 文件不上传，纯本地运行</div>
        </div>
        <div style={{ display: 'flex', gap: 8, position: 'relative', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button className="btn" onClick={() => setThemeOpen((o) => !o)}>
            主题：{THEME_OPTIONS.find((t) => t.id === shelfTheme)?.name}
          </button>
          <button className="btn primary" onClick={onImport}>
            打开 TXT
          </button>
          {themeOpen && (
            <div className="shelf-theme-popover">
              {THEME_OPTIONS.map((t) => (
                <button
                  key={t.id}
                  className={`theme-swatch-row${shelfTheme === t.id ? ' active' : ''}`}
                  onClick={() => {
                    onShelfThemeChange(t.id);
                    setThemeOpen(false);
                  }}
                >
                  <span className="swatch" style={{ background: THEME_SWATCHES[t.id] }} />
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="section-title">最近阅读</div>
      {recent.length === 0 && <div className="hint-text">还没有阅读记录，打开任意书库的一本小说后会显示在这里（最多 3 本）。</div>}
      <div className="recent-list">
        {recent.map((b) => {
          const p = progressMap[b.id];
          const total = b.chapterCount;
          const percent = p && total ? Math.round(((p.chapterIndex + 1) / total) * 100) : null;
          return (
            <div key={b.id} className="recent-card" onClick={() => openRecent(b)}>
              <div className="book-name">{b.name}</div>
              <div className="book-meta">
                书库：{sourceName(b.source)} · 查看时间：{formatTime(b.lastOpenedAt)}
              </div>
              <div className="book-meta">
                进度：
                {p
                  ? total
                    ? `第 ${p.chapterIndex + 1}/${total} 章（约 ${percent}%）`
                    : `第 ${p.chapterIndex + 1} 章`
                  : total
                    ? `尚未阅读 · 共 ${total} 章`
                    : '尚未阅读'}
              </div>
              <div className="btn primary" style={{ alignSelf: 'flex-start' }}>
                继续阅读
              </div>
            </div>
          );
        })}
      </div>
      <div className="library-tabs">
        <button className={`lib-tab${tab === 'online' ? ' active' : ''}`} onClick={() => setTabAndReset('online')}>
          在线书库
        </button>
        <button className={`lib-tab${tab === 'lan' ? ' active' : ''}`} onClick={() => setTabAndReset('lan')}>
          局域网书库
        </button>
        <button className={`lib-tab${tab === 'local' ? ' active' : ''}`} onClick={() => setTabAndReset('local')}>
          本地书库
        </button>
      </div>
    </>
  );

  const renderOnline = () => {
    const filtered = query.trim()
      ? onlineBooks.filter((b) => b.title.toLowerCase().includes(query.trim().toLowerCase()))
      : onlineBooks;
    const per = 5;
    const totalPages = Math.max(1, Math.ceil(filtered.length / per));
    const cur = Math.min(page, totalPages);
    const slice = filtered.slice((cur - 1) * per, cur * per);
    return (
      <>
        <div className="tab-toolbar">
          <input
            className="search-input"
            placeholder="搜索书名…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
          <button
            className="btn"
            onClick={() => {
              void (async () => {
                await onRefreshOnlineBooks();
              })();
            }}
          >
            更新在线书库
          </button>
        </div>
        {onlineBooks.length === 0 && <div className="hint-text">暂无在线书籍。</div>}
        {slice.map((b) => {
          const id = `online|${b.fileName}|${b.size}`;
          const progress = progressMap[id];
          const rec = books.find((x) => x.id === id);
          return (
            <div className="book-card" key={b.fileName}>
              <div className="book-main" onClick={() => onOpenOnline(b)}>
                <div className="book-name">{b.title}</div>
                <div className="book-meta">
                  在线 · {formatSize(b.size)}
                  {progress ? ` · 已读至第 ${progress.chapterIndex + 1} 章` : rec?.chapterCount ? ` · 共 ${rec.chapterCount} 章` : ''}
                </div>
              </div>
              <button className="btn primary" onClick={() => onOpenOnline(b)}>
                阅读
              </button>
            </div>
          );
        })}
        {totalPages > 1 && (
          <div className="pagination">
            <button className="btn" disabled={cur === 1} onClick={() => setPage(cur - 1)}>
              ‹
            </button>
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                className={`btn${cur === i + 1 ? ' primary' : ''}`}
                onClick={() => setPage(i + 1)}
              >
                {i + 1}
              </button>
            ))}
            <button className="btn" disabled={cur === totalPages} onClick={() => setPage(cur + 1)}>
              ›
            </button>
            <span className="page-info">
              第 {cur}/{totalPages} 页
            </span>
          </div>
        )}
      </>
    );
  };

  const renderLanRow = (g: BookGroup) => {
    const key = `g:${g.id}`;
    const open = expanded.has(key);
    const items = lanRecords.filter((b) => b.groupId === g.id);
    return (
      <div key={g.id} className="lan-group-block">
        <div className="lan-row" onClick={() => toggleExpand(key)}>
          <span className={`chevron${open ? ' open' : ''}`}>▸</span>
          <span className="lan-row-name">{g.name}</span>
          <span className="lan-row-count">{items.length} 本</span>
        </div>
        <div className="folder-actions pc-tool" onClick={(e) => e.stopPropagation()}>
          <button className="icon-btn" title="添加书籍" onClick={() => openAddBooks(g)}>
            ＋
          </button>
          <button className="icon-btn" title="上移" onClick={() => void onMoveGroup(g.id, -1)}>
            ↑
          </button>
          <button className="icon-btn" title="下移" onClick={() => void onMoveGroup(g.id, 1)}>
            ↓
          </button>
          <button className="icon-btn" title="重命名" onClick={() => openRename(g)}>
            改
          </button>
          <button
            className="icon-btn"
            title="删除文件夹（书保留为未分组）"
            onClick={() => {
              if (window.confirm(`删除文件夹「${g.name}」？里面的书会回到“未分组”。`)) void onDeleteGroup(g.id);
            }}
          >
            删
          </button>
        </div>
        {open &&
          (items.length === 0 ? (
            <div className="hint-text">文件夹为空，点“＋”从未分组添加书籍</div>
          ) : (
            items.map((b) => (
              <BookLine
                key={b.id}
                book={b}
                progress={progressMap[b.id]}
                onClick={() => onOpenLan({ title: b.name, fileName: b.fileName, size: b.size })}
                actions={
                  <button
                    className="btn pc-tool"
                    onClick={() => void onMoveBooksToGroup([b.id], null)}
                  >
                    移出
                  </button>
                }
              />
            ))
          ))}
      </div>
    );
  };

  const renderUngrouped = () => {
    const key = '__ungrouped';
    const open = expanded.has(key);
    return (
      <div className="lan-group-block">
        <div className="lan-row" onClick={() => toggleExpand(key)}>
          <span className={`chevron${open ? ' open' : ''}`}>▸</span>
          <span className="lan-row-name">未分组</span>
          <span className="lan-row-count">{ungroupedLan.length} 本</span>
        </div>
        {open &&
          (ungroupedLan.length === 0 ? (
            <div className="hint-text">没有未分组的书</div>
          ) : (
            ungroupedLan.map((b) => (
              <BookLine
                key={b.id}
                book={b}
                progress={progressMap[b.id]}
                onClick={() => onOpenLan({ title: b.name, fileName: b.fileName, size: b.size })}
                meta="局域网 · 未分组"
              />
            ))
          ))}
      </div>
    );
  };

  const renderLan = () => {
    if (!lanAvailable) {
      return (
        <div className="hint-text">
          局域网书库未连接：请在电脑上运行「启动局域网书库.bat」，手机与本机连同一 Wi-Fi 后刷新。
        </div>
      );
    }
    return (
      <>
        <div className="tab-toolbar">
          <span>电脑共享 · 共 {lanBooks.length} 本</span>
          <button className="btn pc-tool" onClick={openCreate}>
            新建文件夹
          </button>
        </div>
        {renderUngrouped()}
        {groups.map((g) => renderLanRow(g))}
      </>
    );
  };

  const renderLocal = () => (
    <>
      <div className="tab-toolbar">
        <button className="btn" onClick={onImport}>
          打开 TXT（可多选）
        </button>
        <button className="btn pc-tool" onClick={onImportFolder}>
          导入文件夹
        </button>
      </div>
      {localRecords.length === 0 && <div className="hint-text">本地书库为空，用“打开 TXT”或拖拽文件添加。</div>}
      {localRecords
        .slice()
        .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
        .map((b) => (
          <BookLine
            key={b.id}
            book={b}
            progress={progressMap[b.id]}
            onClick={() => onOpenLocal(b)}
            actions={
              <button
                className="btn pc-tool"
                onClick={() => {
                  if (window.confirm(`将《${b.name}》移出书架？（不会删除文件）`)) onRemoveLocal(b);
                }}
              >
                移除
              </button>
            }
          />
        ))}
    </>
  );

  return (
    <div className="shelf">
      {header}
      {tab === 'online' && renderOnline()}
      {tab === 'lan' && renderLan()}
      {tab === 'local' && renderLocal()}

      {dialog && (
        <div className="backdrop" onClick={closeDialog}>
          <div className="input-modal" onClick={(e) => e.stopPropagation()}>
            <div className="input-modal-title">{dialog.kind === 'create' ? '新建文件夹' : '重命名文件夹'}</div>
            <input
              autoFocus
              value={folderName}
              placeholder="输入文件夹名称"
              onChange={(e) => setFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitFolder();
                if (e.key === 'Escape') closeDialog();
              }}
            />
            <div className="input-modal-actions">
              <button className="btn" onClick={closeDialog}>
                取消
              </button>
              <button className="btn primary" disabled={!folderName.trim()} onClick={submitFolder}>
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      {addTo && (
        <div
          className="backdrop"
          onClick={() => {
            setAddTo(null);
            setAddIds([]);
          }}
        >
          <div className="input-modal wide" onClick={(e) => e.stopPropagation()}>
            <div className="input-modal-title">从未分组添加书籍到「{addTo.name}」</div>
            <div className="pick-list">
              {ungroupedLan.map((b) => (
                <label key={b.id} className="pick-item">
                  <input
                    type="checkbox"
                    checked={addIds.includes(b.id)}
                    onChange={() =>
                      setAddIds((prev) => (prev.includes(b.id) ? prev.filter((x) => x !== b.id) : [...prev, b.id]))
                    }
                  />
                  {b.name}
                </label>
              ))}
              {ungroupedLan.length === 0 && <div className="hint-text">未分组里没有书了</div>}
            </div>
            <div className="input-modal-actions">
              <button
                className="btn"
                onClick={() => {
                  setAddTo(null);
                  setAddIds([]);
                }}
              >
                取消
              </button>
              <button className="btn primary" disabled={!addIds.length} onClick={confirmAddBooks}>
                添加（{addIds.length}）
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
