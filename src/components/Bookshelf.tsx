import { useEffect, useMemo, useState } from 'react';
import type { BookGroup, BookRecord, OnlineBook, Progress, ThemeName } from '../types';
import { idbAll } from '../lib/storage';
import { ENCODING_OPTIONS } from '../lib/encoding';
import { lanBookId, onlineBookId } from '../lib/fileOpen';
import { THEME_OPTIONS, THEME_SWATCHES } from '../lib/themes';

const COVER_COLORS = ['#b7d3a8', '#c9b8dc', '#f2d0a4', '#a8c8dc', '#dcb0b0', '#bcd3d8', '#e4c8a8', '#c0c8d8'];

interface Props {
  books: BookRecord[];
  groups: BookGroup[];
  onlineBooks: OnlineBook[];
  lanBooks: OnlineBook[];
  lanAvailable: boolean;
  shelfTheme: ThemeName;
  onShelfThemeChange: (theme: ThemeName) => void;
  onImport: () => void;
  onImportFolder: () => void;
  onRefreshOnlineBooks: () => Promise<void>;
  onOpenBook: (book: BookRecord) => void;
  onOpenOnline: (book: OnlineBook) => void;
  onOpenLan: (book: OnlineBook) => void;
  onAddOnline: (book: OnlineBook) => Promise<void>;
  onAddLan: (book: OnlineBook) => Promise<void>;
  onToggleFavorite: (book: BookRecord) => void;
  onCreateGroup: (name: string) => Promise<void>;
  onRenameGroup: (id: string, name: string) => Promise<void>;
  onDeleteGroup: (id: string) => Promise<void>;
  onMoveGroup: (id: string, dir: -1 | 1) => Promise<void>;
  onRemoveFromShelf: (ids: string[]) => Promise<void>;
  onMoveBooksToGroup: (ids: string[], groupId: string | null) => Promise<void>;
  onSetPinned: (ids: string[], pinned: boolean) => Promise<void>;
}

function formatSize(size: number): string {
  if (size >= 1048576) return `${(size / 1048576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function formatTime(ts: number): string {
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

function coverColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) % 997;
  return COVER_COLORS[h % COVER_COLORS.length];
}

function coverText(name: string): string {
  return name.replace(/《|》/g, '').slice(0, 2) || '书';
}

function sourceLabel(source: BookRecord['source']): string {
  if (source === 'online') return '在线';
  if (source === 'lan') return '局域网';
  return '本地';
}

function sortBooks(list: BookRecord[]): BookRecord[] {
  return [...list].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return b.lastOpenedAt - a.lastOpenedAt || a.name.localeCompare(b.name, 'zh');
  });
}

function BookRow({
  book,
  progress,
  manage,
  checked,
  onToggleCheck,
  onOpen,
  onFavorite,
}: {
  book: BookRecord;
  progress?: Progress;
  manage: boolean;
  checked: boolean;
  onToggleCheck: () => void;
  onOpen: () => void;
  onFavorite: () => void;
}) {
  const progressText =
    book.chapterCount != null
      ? progress
        ? `已读至第 ${progress.chapterIndex + 1}/${book.chapterCount} 章`
        : `共 ${book.chapterCount} 章`
      : '';
  return (
    <div className="book-card">
      {manage && (
        <input type="checkbox" checked={checked} onChange={onToggleCheck} style={{ width: 20, height: 20 }} />
      )}
      <div className="cover-tile" style={{ background: coverColor(book.name) }} onClick={manage ? onToggleCheck : onOpen}>
        {coverText(book.name)}
      </div>
      <div className="book-main" onClick={onOpen}>
        <div className="book-name">
          {book.pinned ? '📌 ' : ''}
          {book.name}
        </div>
        <div className="book-meta">
          {sourceLabel(book.source)} · {formatSize(book.size)} · {encodingName(book.encoding)}
          {progressText ? ` · ${progressText}` : ''} · {formatTime(book.lastOpenedAt)}
        </div>
      </div>
      <button
        className={`star-btn${book.isFavorite ? ' active' : ''}`}
        title={book.isFavorite ? '取消收藏' : '收藏'}
        onClick={onFavorite}
      >
        {book.isFavorite ? '★' : '☆'}
      </button>
      <button className="btn" onClick={onOpen}>
        阅读
      </button>
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
  onImport,
  onImportFolder,
  onRefreshOnlineBooks,
  onOpenBook,
  onOpenOnline,
  onOpenLan,
  onAddOnline,
  onAddLan,
  onToggleFavorite,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onMoveGroup,
  onRemoveFromShelf,
  onMoveBooksToGroup,
  onSetPinned,
}: Props) {
  const [progressMap, setProgressMap] = useState<Record<string, Progress>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [updated, setUpdated] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [dialog, setDialog] = useState<null | { kind: 'create' } | { kind: 'rename'; group: BookGroup }>(null);
  const [folderName, setFolderName] = useState('');
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [manage, setManage] = useState(false);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);

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

  const handleRefresh = async () => {
    setRefreshing(true);
    setUpdated(false);
    await onRefreshOnlineBooks();
    setRefreshing(false);
    setUpdated(true);
    window.setTimeout(() => setUpdated(false), 2000);
  };

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
    setFolderName('');
  };

  const removeFolder = (g: BookGroup) => {
    if (window.confirm(`删除文件夹「${g.name}」？文件夹内的小说仍保留在书架中。`)) void onDeleteGroup(g.id);
  };

  const shelfIds = useMemo(() => new Set(books.map((b) => b.id)), [books]);

  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? null;
  const showingAll = activeGroupId === '__all__';
  const currentBooks = useMemo(() => {
    const list = showingAll ? books : activeGroup ? books.filter((b) => b.groupId === activeGroup.id) : [];
    return sortBooks(list);
  }, [books, activeGroup, showingAll]);

  const groupBooks = (gid: string) => sortBooks(books.filter((b) => b.groupId === gid));
  const inDetail = activeGroup !== null || showingAll;

  const toggleChecked = (id: string) => {
    setCheckedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const exitManage = () => {
    setManage(false);
    setCheckedIds([]);
  };

  const moveTo = (gid: string) => {
    if (!checkedIds.length) return;
    void onMoveBooksToGroup(checkedIds, gid === '' ? null : gid);
    exitManage();
  };

  const doRemove = () => {
    if (!checkedIds.length) return;
    if (window.confirm(`将 ${checkedIds.length} 本小说移出书架？（不会删除电脑上的文件）`)) {
      void onRemoveFromShelf(checkedIds);
      exitManage();
    }
  };

  const doPin = (pinned: boolean) => {
    if (!checkedIds.length) return;
    void onSetPinned(checkedIds, pinned);
    exitManage();
  };

  // ---------- 文件夹详情 / 全部书籍管理 ----------
  if (inDetail) {
    const title = showingAll ? '全部书籍' : activeGroup!.name;
    return (
      <div className="shelf">
        <header className="shelf-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="btn" onClick={() => setActiveGroupId(null)}>
              ← 书架
            </button>
            <div>
              <h1 className="shelf-title" style={{ fontSize: 18 }}>
                {title}
              </h1>
              <div className="shelf-sub">共 {currentBooks.length} 本 · 滑动浏览 · 点击即可阅读</div>
            </div>
          </div>
          <button
            className={`btn ${manage ? 'primary' : ''} manage-btn`}
            onClick={() => (manage ? exitManage() : setManage(true))}
          >
            {manage ? '完成' : '管理'}
          </button>
        </header>

        {currentBooks.length === 0 && (
          <div className="empty-state">
            <p>{showingAll ? '书架还没有小说' : '这个文件夹还是空的'}</p>
          </div>
        )}

        {currentBooks.map((b) => (
          <BookRow
            key={b.id}
            book={b}
            progress={progressMap[b.id]}
            manage={manage}
            checked={checkedIds.includes(b.id)}
            onToggleCheck={() => toggleChecked(b.id)}
            onOpen={() => onOpenBook(b)}
            onFavorite={() => onToggleFavorite(b)}
          />
        ))}

        {manage && (
          <div className="batch-bar">
            <input
              type="checkbox"
              checked={checkedIds.length === currentBooks.length && currentBooks.length > 0}
              onChange={() => {
                if (checkedIds.length === currentBooks.length) setCheckedIds([]);
                else setCheckedIds(currentBooks.map((b) => b.id));
              }}
              style={{ width: 18, height: 18 }}
            />
            <span>{checkedIds.length} 本</span>
            <button className="btn" disabled={!checkedIds.length} onClick={() => doPin(true)}>
              置顶
            </button>
            <button className="btn" disabled={!checkedIds.length} onClick={() => doPin(false)}>
              取消置顶
            </button>
            <select
              disabled={!checkedIds.length}
              value=""
              onChange={(e) => {
                if (e.target.value !== '') moveTo(e.target.value);
              }}
            >
              <option value="">移动到…</option>
              <option value="">未分组</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <button className="btn" disabled={!checkedIds.length} onClick={doRemove}>
              移除书架
            </button>
          </div>
        )}
      </div>
    );
  }

  // ---------- 书架首页：文件夹卡片 + 快捷列表 ----------
  return (
    <div className="shelf">
      <header className="shelf-header">
        <div>
          <h1 className="shelf-title">本地小说阅读器</h1>
          <div className="shelf-sub">文件夹管理小说 · 小说负责阅读</div>
        </div>
        <div style={{ display: 'flex', gap: 8, position: 'relative', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button className="btn" onClick={() => setThemeOpen((o) => !o)}>
            主题：{THEME_OPTIONS.find((t) => t.id === shelfTheme)?.name}
          </button>
          <button className="btn pc-tool" onClick={onImportFolder}>
            导入文件夹
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

      <div className="section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>我的文件夹（{groups.length}）</span>
        <button className="btn pc-tool" onClick={openCreate}>
          新建文件夹
        </button>
      </div>

      {groups.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
          还没有文件夹。点“新建文件夹”创建，把小说按类型放进去（如：玄幻 / 科幻 / 待读）。
        </div>
      ) : (
        <div className="folder-grid">
          {groups.map((g, idx) => {
            const gb = groupBooks(g.id);
            const preview = gb.slice(0, 4);
            return (
              <div className="folder-card" key={g.id}>
                <div className="folder-main" onClick={() => setActiveGroupId(g.id)}>
                  <div className="folder-covers">
                    {preview.map((b) => (
                      <div key={b.id} className="folder-cover" style={{ background: coverColor(b.name) }}>
                        {coverText(b.name)}
                      </div>
                    ))}
                    {preview.length < 4 &&
                      Array.from({ length: 4 - preview.length }).map((_, i) => (
                        <div key={`e${i}`} className="folder-cover empty" />
                      ))}
                  </div>
                  <div className="folder-name">{g.name}</div>
                  <div className="folder-count">{gb.length} 本</div>
                </div>
                <div className="folder-actions">
                  <button className="icon-btn" title="上移" onClick={() => void onMoveGroup(g.id, -1)} disabled={idx === 0}>
                    ↑
                  </button>
                  <button
                    className="icon-btn"
                    title="下移"
                    onClick={() => void onMoveGroup(g.id, 1)}
                    disabled={idx === groups.length - 1}
                  >
                    ↓
                  </button>
                  <button className="icon-btn" title="重命名" onClick={() => openRename(g)}>
                    改
                  </button>
                  <button className="icon-btn" title="删除" onClick={() => removeFolder(g)}>
                    删
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="section-title">
        <button className="btn" onClick={() => setActiveGroupId('__all__')}>
          全部书籍（{books.length}）→ 管理
        </button>
      </div>

      <div className="section-title">在线书库（{onlineBooks.length}）· 任意设备联网即读</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <button className="btn" onClick={() => void handleRefresh()} disabled={refreshing}>
          {refreshing ? '更新中…' : updated ? '已更新' : '更新在线书库'}
        </button>
      </div>
      {onlineBooks.length > 0 ? (
        onlineBooks.map((b) => {
          const added = shelfIds.has(onlineBookId(b.fileName, b.size));
          return (
            <div className="book-card" key={b.fileName}>
              <div className="book-main" onClick={() => onOpenOnline(b)}>
                <div className="book-name">{b.title}</div>
                <div className="book-meta">在线 · {formatSize(b.size)} · 点击在线阅读</div>
              </div>
              {!added && (
                <button className="btn add-shelf-btn" onClick={() => void onAddOnline(b)}>
                  加入书架
                </button>
              )}
              <button className="btn primary" onClick={() => onOpenOnline(b)}>
                阅读
              </button>
            </div>
          );
        })
      ) : (
        <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 12 }}>
          暂无在线书籍，点击“更新在线书库”获取仓库中的最新书单。
        </div>
      )}

      {lanAvailable && (
        <>
          <div className="section-title">局域网书库（{lanBooks.length}）· 本机电脑共享</div>
          {lanBooks.length > 0 ? (
            lanBooks.map((b) => {
              const added = shelfIds.has(lanBookId(b.fileName, b.size));
              return (
                <div className="book-card" key={b.fileName}>
                  <div className="book-main" onClick={() => onOpenLan(b)}>
                    <div className="book-name">{b.title}</div>
                    <div className="book-meta">局域网 · {formatSize(b.size)} · 点击阅读</div>
                  </div>
                  {!added && (
                    <button className="btn add-shelf-btn" onClick={() => void onAddLan(b)}>
                      加入书架
                    </button>
                  )}
                  <button className="btn primary" onClick={() => onOpenLan(b)}>
                    阅读
                  </button>
                </div>
              );
            })
          ) : (
            <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 12 }}>
              电脑端书库为空：请在项目目录的「局域网书库」文件夹放入 TXT 小说。
            </div>
          )}
        </>
      )}

      {books.length > 0 && (
        <>
          <div className="section-title">最近阅读</div>
          {sortBooks(books)
            .filter((b) => b.lastOpenedAt > 0)
            .slice(0, 5)
            .map((b) => (
              <BookRow
                key={b.id}
                book={b}
                progress={progressMap[b.id]}
                manage={false}
                checked={false}
                onToggleCheck={() => undefined}
                onOpen={() => onOpenBook(b)}
                onFavorite={() => onToggleFavorite(b)}
              />
          ))}
        </>
      )}

      {dialog && (
        <div
          className="backdrop"
          onClick={() => {
            setDialog(null);
            setFolderName('');
          }}
        >
          <div className="input-modal" onClick={(e) => e.stopPropagation()}>
            <div className="input-modal-title">{dialog.kind === 'create' ? '新建文件夹' : '重命名文件夹'}</div>
            <input
              autoFocus
              value={folderName}
              placeholder="输入文件夹名称"
              onChange={(e) => setFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitFolder();
                if (e.key === 'Escape') setDialog(null);
              }}
            />
            <div className="input-modal-actions">
              <button
                className="btn"
                onClick={() => {
                  setDialog(null);
                  setFolderName('');
                }}
              >
                取消
              </button>
              <button className="btn primary" disabled={!folderName.trim()} onClick={submitFolder}>
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
