import { useEffect, useState } from 'react';
import type { BookRecord, OnlineBook, Progress, ThemeName } from '../types';
import { idbAll } from '../lib/storage';
import { ENCODING_OPTIONS } from '../lib/encoding';
import { onlineBookId } from '../lib/fileOpen';
import { THEME_OPTIONS, THEME_SWATCHES } from '../lib/themes';

interface Props {
  books: BookRecord[];
  onlineBooks: OnlineBook[];
  shelfTheme: ThemeName;
  onShelfThemeChange: (theme: ThemeName) => void;
  onImport: () => void;
  onOpen: (book: BookRecord) => void;
  onOpenOnline: (book: OnlineBook) => void;
  onRefreshOnlineBooks: () => Promise<void>;
  onRemove: (book: BookRecord) => void;
  onToggleFavorite: (book: BookRecord) => void;
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

interface CardProps {
  book: BookRecord;
  progress?: Progress;
  onOpen: () => void;
  onRemove: () => void;
  onToggleFavorite: () => void;
}

function BookCard({ book, progress, onOpen, onRemove, onToggleFavorite }: CardProps) {
  const progressText =
    book.chapterCount != null
      ? progress
        ? `已读 第 ${progress.chapterIndex + 1} / ${book.chapterCount} 章`
        : `共 ${book.chapterCount} 章`
      : '章节识别中…';

  return (
    <div className="book-card">
      <div className="book-main" onClick={onOpen}>
        <div className="book-name">{book.name}</div>
        <div className="book-meta">
          {progressText} · {formatSize(book.size)} · {encodingName(book.encoding)} · {formatTime(book.lastOpenedAt)}
        </div>
      </div>
      <button
        className={`star-btn${book.isFavorite ? ' active' : ''}`}
        title={book.isFavorite ? '取消收藏' : '收藏'}
        onClick={onToggleFavorite}
      >
        {book.isFavorite ? '★' : '☆'}
      </button>
      <button className="btn" onClick={onOpen}>
        阅读
      </button>
      <button className="btn" onClick={onRemove}>
        移除
      </button>
    </div>
  );
}

export default function Bookshelf({
  books,
  onlineBooks,
  shelfTheme,
  onShelfThemeChange,
  onImport,
  onOpen,
  onOpenOnline,
  onRefreshOnlineBooks,
  onRemove,
  onToggleFavorite,
}: Props) {
  const [progressMap, setProgressMap] = useState<Record<string, Progress>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [updated, setUpdated] = useState(false);
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

  const favorites = books.filter((b) => b.isFavorite);
  const recent = books.slice(0, 8);

  const handleRefresh = async () => {
    setRefreshing(true);
    setUpdated(false);
    await onRefreshOnlineBooks();
    setRefreshing(false);
    setUpdated(true);
    window.setTimeout(() => setUpdated(false), 2000);
  };

  return (
    <div className="shelf">
      <header className="shelf-header">
        <div>
          <h1 className="shelf-title">本地小说阅读器</h1>
          <div className="shelf-sub">纯本地运行 · 文件不上传 · 起点风格阅读体验</div>
        </div>
        <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
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

      <div className="section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>在线书库（{onlineBooks.length}）· 任意设备联网即读</span>
        <button className="btn" onClick={() => void handleRefresh()} disabled={refreshing}>
          {refreshing ? '更新中…' : updated ? '已更新' : '更新在线书库'}
        </button>
      </div>
      {onlineBooks.length > 0 ? (
        onlineBooks.map((b) => {
          const progress = progressMap[onlineBookId(b.fileName, b.size)];
          return (
            <div className="book-card" key={b.fileName}>
              <div className="book-main" onClick={() => onOpenOnline(b)}>
                <div className="book-name">{b.title}</div>
                <div className="book-meta">
                  在线 · {formatSize(b.size)}
                  {progress ? ` · 已读至第 ${progress.chapterIndex + 1} 章` : ' · 点击在线阅读'}
                </div>
              </div>
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

      {books.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: 40 }}>📖</div>
          <p>书架还是空的</p>
          <p style={{ fontSize: 13 }}>点击上方按钮选择 TXT 小说，或直接把文件拖进页面</p>
          <button className="btn primary" onClick={onImport}>
            打开 TXT 文件
          </button>
        </div>
      ) : (
        <>
          {favorites.length > 0 && (
            <>
              <div className="section-title">收藏</div>
              {favorites.map((b) => (
                <BookCard
                  key={b.id}
                  book={b}
                  progress={progressMap[b.id]}
                  onOpen={() => onOpen(b)}
                  onRemove={() => onRemove(b)}
                  onToggleFavorite={() => onToggleFavorite(b)}
                />
              ))}
            </>
          )}
          <div className="section-title">最近阅读</div>
          {recent.map((b) => (
            <BookCard
              key={b.id}
              book={b}
              progress={progressMap[b.id]}
              onOpen={() => onOpen(b)}
              onRemove={() => onRemove(b)}
              onToggleFavorite={() => onToggleFavorite(b)}
            />
          ))}
          <div className="section-title">全部书籍（{books.length}）</div>
          {books.map((b) => (
            <BookCard
              key={b.id}
              book={b}
              progress={progressMap[b.id]}
              onOpen={() => onOpen(b)}
              onRemove={() => onRemove(b)}
              onToggleFavorite={() => onToggleFavorite(b)}
            />
          ))}
        </>
      )}
    </div>
  );
}
