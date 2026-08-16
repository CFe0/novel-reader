import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Chapter } from '../types';

const SIDEBAR_WIDTH_KEY = 'txt-reader-sidebar-width';
const MIN_WIDTH = 300;
const MAX_WIDTH = 900;

interface Props {
  chapters: Chapter[];
  current: number;
  onSelect: (index: number) => void;
  onClose: () => void;
}

export default function ChapterSidebar({ chapters, current, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [width, setWidth] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
      if (saved >= MIN_WIDTH && saved <= MAX_WIDTH) return saved;
    } catch {
      // 忽略读取失败
    }
    return 380;
  });
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
    } catch {
      // 忽略写入失败
    }
  }, [width]);

  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: width };
    const onMove = (ev: PointerEvent) => {
      if (!dragRef.current) return;
      const next = Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, dragRef.current.startWidth + (ev.clientX - dragRef.current.startX)),
      );
      setWidth(next);
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return chapters;
    return chapters.filter((c) => c.title.toLowerCase().includes(q));
  }, [chapters, query]);

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <aside className="sidebar" style={{ width }}>
        <div className="sidebar-resizer" onPointerDown={startResize} title="拖动调整宽度" />
        <div className="sidebar-header">
          <div className="sidebar-header-group">
            <span>目录（{chapters.length} 章）</span>
            <span className="sidebar-hint">拖动右侧边缘可调宽</span>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="关闭目录">
            ×
          </button>
        </div>
        <input
          className="sidebar-search"
          placeholder="搜索章节名…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="chapter-list">
          {filtered.map((c) => (
            <button
              key={c.index}
              className={`chapter-item${c.index === current ? ' current' : ''}`}
              title={c.title}
              onClick={() => onSelect(c.index)}
            >
              {c.title}
            </button>
          ))}
          {filtered.length === 0 && <div style={{ color: 'var(--muted)', padding: 16 }}>没有匹配的章节</div>}
        </div>
      </aside>
    </>
  );
}
