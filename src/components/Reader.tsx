import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BookRecord, Chapter, EncodingLabel, ReaderSettings, ThemeName } from '../types';
import { decodeChapter } from '../lib/chapters';
import { getProgress, saveProgress } from '../lib/storage';
import ChapterSidebar from './ChapterSidebar';
import SettingsDrawer from './SettingsDrawer';

const THEME_ORDER: ThemeName[] = ['light', 'sepia', 'green', 'dark'];
const THEME_NAMES: Record<ThemeName, string> = {
  light: '日间',
  sepia: '米黄',
  green: '护眼绿',
  dark: '夜间',
};
const SWATCH_COLORS: Record<ThemeName, string> = {
  light: '#ffffff',
  sepia: '#f6f0e3',
  green: '#e9f1e5',
  dark: '#161719',
};
const AUTO_LOAD_MARGIN = 600;
// 滚动模式下，当前章节之前最多保留的章节数；更早的章节会从页面卸载以节省内存
const TRIM_BEFORE = 15;

interface Props {
  book: BookRecord;
  file: File;
  chapters: Chapter[];
  encoding: EncodingLabel;
  settings: ReaderSettings;
  onSettingsChange: (next: ReaderSettings) => void;
  onEncodingChange: (label: EncodingLabel) => void;
  onBack: () => void;
}

export default function Reader({
  book,
  file,
  chapters,
  encoding,
  settings,
  onSettingsChange,
  onEncodingChange,
  onBack,
}: Props) {
  // 滚动阅读：页面只渲染 trimStart ~ rangeEnd 区间，滚到底自动向后追加，
  // 当前章节向前走远后自动卸载更早的章节，避免 DOM 无限增长。
  const [trimStart, setTrimStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(0);
  const [texts, setTexts] = useState<Record<number, string>>({});
  const [activeIndex, setActiveIndex] = useState(0);
  const [percent, setPercent] = useState(0);
  const [barsVisible, setBarsVisible] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [themePopoverOpen, setThemePopoverOpen] = useState(false);
  const [progressReady, setProgressReady] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const blockRefs = useRef(new Map<number, HTMLElement>());
  const loadingRef = useRef(new Set<number>());
  const activeIndexRef = useRef(0);
  const trimStartRef = useRef(0);
  const rangeEndRef = useRef(0);
  const saveTimerRef = useRef<number | null>(null);
  const initialOffsetRef = useRef<number | null>(null);
  const pendingScrollRef = useRef<number | null>(null);
  const pendingTrimAdjustRef = useRef<number | null>(null);
  const restoringRef = useRef(true);
  const appendingRef = useRef(false);
  const prevModeRef = useRef(settings.readingMode);
  const positionedRef = useRef(false);

  activeIndexRef.current = activeIndex;
  trimStartRef.current = trimStart;
  rangeEndRef.current = rangeEnd;

  const lastChapterIndex = chapters.length - 1;

  // 读取上次阅读进度：从上次所在章节开始渲染
  useEffect(() => {
    let alive = true;
    void getProgress(book.id).then((p) => {
      if (!alive) return;
      if (p) {
        const start = Math.min(Math.max(p.chapterIndex, 0), lastChapterIndex);
        initialOffsetRef.current = Math.max(0, p.scrollTop);
        pendingScrollRef.current = initialOffsetRef.current;
        setTrimStart(start);
        setRangeEnd(start);
        setActiveIndex(start);
      } else {
        pendingScrollRef.current = 0;
      }
      setProgressReady(true);
    });
    return () => {
      alive = false;
    };
  }, [book.id, lastChapterIndex]);

  // 解码范围内缺失的章节文本
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (let i = trimStart; i <= rangeEnd; i++) {
        if (cancelled) return;
        if (texts[i] !== undefined || loadingRef.current.has(i)) continue;
        loadingRef.current.add(i);
        try {
          const t = await decodeChapter(file, chapters[i], encoding);
          if (cancelled) return;
          setTexts((prev) => (prev[i] === t ? prev : { ...prev, [i]: t }));
        } finally {
          loadingRef.current.delete(i);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trimStart, rangeEnd, file, chapters, encoding, texts]);

  // 章节被卸载后，同步丢弃其文本，释放内存
  useEffect(() => {
    setTexts((prev) => {
      let changed = false;
      const next: Record<number, string> = {};
      for (const [k, v] of Object.entries(prev)) {
        const num = Number(k);
        if (num >= trimStart) next[num] = v;
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [trimStart]);

  const appendNext = useCallback(() => {
    if (settings.readingMode !== 'scroll') return;
    if (appendingRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (remaining < AUTO_LOAD_MARGIN && rangeEndRef.current < lastChapterIndex) {
      appendingRef.current = true;
      setRangeEnd((prev) => Math.min(prev + 1, lastChapterIndex));
      window.setTimeout(() => {
        appendingRef.current = false;
      }, 250);
    }
  }, [lastChapterIndex, settings.readingMode]);

  // 文本加载后检查是否还需要继续加载（章节过短时自动连续加载）
  useEffect(() => {
    appendNext();
  }, [texts, rangeEnd, appendNext]);

  // 从滚动模式切到章节翻页模式：收敛到当前章节，保留章节内滚动位置
  useEffect(() => {
    const prev = prevModeRef.current;
    prevModeRef.current = settings.readingMode;
    if (prev === 'scroll' && settings.readingMode === 'chapter' && rangeEndRef.current > trimStartRef.current) {
      const el = scrollRef.current;
      let local = 0;
      if (el) {
        const block = blockRefs.current.get(activeIndexRef.current);
        local = Math.max(0, el.scrollTop - (block?.offsetTop ?? 0));
      }
      pendingScrollRef.current = local;
      restoringRef.current = true;
      const idx = activeIndexRef.current;
      setTrimStart(idx);
      setRangeEnd(idx);
    }
  }, [settings.readingMode]);

  // 恢复/跳转后的滚动定位
  useEffect(() => {
    if (!progressReady || !restoringRef.current) return;
    if (texts[trimStart] === undefined) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = pendingScrollRef.current ?? 0;
    restoringRef.current = false;
    pendingScrollRef.current = null;
    positionedRef.current = true;
  }, [texts, trimStart, progressReady]);

  // 卸载远章节后补偿滚动位置，避免视觉跳动
  useLayoutEffect(() => {
    if (pendingTrimAdjustRef.current === null) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = pendingTrimAdjustRef.current;
    pendingTrimAdjustRef.current = null;
  }, [trimStart]);

  useEffect(() => {
    scrollRef.current?.focus();
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    positionedRef.current = true;
    const top = el.scrollTop;

    // 确定当前章节：视口顶部所落进的最后一个章节块
    let idx = trimStartRef.current;
    let block: HTMLElement | undefined;
    for (const [i, node] of blockRefs.current) {
      if (node.offsetTop <= top + 8) {
        idx = i;
        block = node;
      } else {
        break;
      }
    }
    if (idx !== activeIndexRef.current) setActiveIndex(idx);

    let local = 0;
    if (block) {
      local = Math.max(0, top - block.offsetTop);
      const h = block.scrollHeight;
      setPercent(h > el.clientHeight ? Math.min(1, local / (h - el.clientHeight)) : 0);
    } else {
      setPercent(0);
    }

    // 滚动模式下卸载已读过较远的章节
    if (settings.readingMode === 'scroll') {
      const newTrim = Math.max(0, idx - TRIM_BEFORE);
      if (newTrim > trimStartRef.current) {
        let removedHeight = 0;
        for (const [i, node] of blockRefs.current) {
          if (i >= newTrim) break;
          removedHeight += node.offsetHeight;
        }
        pendingTrimAdjustRef.current = Math.max(0, top - removedHeight);
        setTrimStart(newTrim);
      }
    }

    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void saveProgress({
        bookId: book.id,
        chapterIndex: idx,
        scrollTop: local,
        updatedAt: Date.now(),
      });
    }, 500);

    appendNext();
  }, [book.id, appendNext, settings.readingMode]);

  // 退出/刷新前兜底保存
  useEffect(() => {
    const flush = () => {
      if (!positionedRef.current) return;
      const el = scrollRef.current;
      let local = 0;
      if (el) {
        const block = blockRefs.current.get(activeIndexRef.current);
        local = Math.max(0, el.scrollTop - (block?.offsetTop ?? 0));
      }
      void saveProgress({
        bookId: book.id,
        chapterIndex: activeIndexRef.current,
        scrollTop: local,
        updatedAt: Date.now(),
      });
    };
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, [book.id]);

  const goToChapter = useCallback(
    (index: number) => {
      if (index < 0 || index > lastChapterIndex) return;
      pendingScrollRef.current = 0;
      restoringRef.current = true;
      setTrimStart(index);
      setRangeEnd(index);
      setActiveIndex(index);
      setPercent(0);
      const el = scrollRef.current;
      if (el) el.scrollTop = 0;
    },
    [lastChapterIndex],
  );

  // 快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = scrollRef.current;
      if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=' || e.key === '-')) {
        e.preventDefault();
        const delta = e.key === '-' ? -1 : 1;
        onSettingsChange({ ...settings, fontSize: Math.min(28, Math.max(12, settings.fontSize + delta)) });
        return;
      }
      switch (e.key) {
        case 'Escape':
          setBarsVisible((v) => !v);
          break;
        case 'ArrowRight':
          e.preventDefault();
          goToChapter(activeIndexRef.current + 1);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          goToChapter(activeIndexRef.current - 1);
          break;
        case 'PageDown':
          e.preventDefault();
          if (el) el.scrollTop += el.clientHeight * 0.9;
          break;
        case 'PageUp':
          e.preventDefault();
          if (el) el.scrollTop -= el.clientHeight * 0.9;
          break;
        case 'Home':
          e.preventDefault();
          if (el) el.scrollTop = 0;
          break;
        case 'End':
          e.preventDefault();
          if (el) el.scrollTop = el.scrollHeight;
          break;
        case 't':
        case 'T':
          setSidebarOpen((o) => !o);
          break;
        case 's':
        case 'S':
          setSettingsOpen((o) => !o);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settings, onSettingsChange, goToChapter]);

  const chapterParagraphs = (ch: Chapter): string[] => {
    const raw = texts[ch.index] ?? '';
    const lines = raw
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines[0] === ch.title.trim()) lines.shift();
    return lines;
  };

  const cycleTheme = () => {
    const idx = THEME_ORDER.indexOf(settings.theme);
    const next = THEME_ORDER[(idx + 1) % THEME_ORDER.length];
    onSettingsChange({ ...settings, theme: next });
  };

  const visibleChapters = chapters.slice(trimStart, rangeEnd + 1);
  const isLast = rangeEnd >= lastChapterIndex;
  const activeChapter = chapters[activeIndex] ?? chapters[0];
  const railRight = `max(8px, calc(50% - ${settings.maxWidth / 2}px - 56px))`;

  return (
    <div
      className={`reader${barsVisible ? '' : ' bars-hidden'}`}
      onMouseMove={() => {
        if (!barsVisible) setBarsVisible(true);
      }}
    >
      <header className="reader-topbar">
        <button className="btn" onClick={onBack}>
          ← 书架
        </button>
        <span className="topbar-book">{book.name}</span>
        <span className="topbar-chapter"> · {activeChapter?.title ?? ''}</span>
        {settings.readingMode === 'chapter' && (
          <span className="topbar-progress">
            第 {activeIndex + 1} / {chapters.length} 章 · {Math.round(percent * 100)}%
          </span>
        )}
        <div className="topbar-spacer" />
        <div className="topbar-tools">
          <button className="icon-btn" title="目录（t）" onClick={() => setSidebarOpen(true)}>
            目录
          </button>
          <button className="icon-btn" title="设置（s）" onClick={() => setSettingsOpen(true)}>
            设置
          </button>
          <button className="icon-btn" title="切换主题" onClick={cycleTheme}>
            主题
          </button>
        </div>
      </header>

      <div className="reader-scroll" ref={scrollRef} tabIndex={0} onScroll={handleScroll}>
        <div
          className="reader-content"
          style={{
            maxWidth: settings.maxWidth,
            fontSize: settings.fontSize,
            lineHeight: settings.lineHeight,
            textAlign: settings.textAlign,
            fontFamily: settings.fontFamily,
          }}
        >
          {visibleChapters.map((ch) => (
            <section
              key={ch.index}
              ref={(el) => {
                if (el) blockRefs.current.set(ch.index, el);
                else blockRefs.current.delete(ch.index);
              }}
              className="chapter-block"
            >
              <h1 className="chapter-title" style={{ fontSize: settings.fontSize + 10 }}>
                {ch.title}
              </h1>
              {chapterParagraphs(ch).map((p, i) => (
                <p key={i} style={{ marginBottom: `${settings.paragraphGap}em` }}>
                  {p}
                </p>
              ))}
              {texts[ch.index] === undefined && <p className="loading-line">加载中…</p>}
            </section>
          ))}
          <div className="chapter-end">{isLast ? '—— 全书完 ——' : '加载中…'}</div>
        </div>
      </div>

      <div className="side-rail" style={{ right: railRight }}>
        <button className="rail-btn" title="目录（t）" onClick={() => setSidebarOpen(true)}>
          ☰<span>目录</span>
        </button>
        <button className="rail-btn" title="设置（s）" onClick={() => setSettingsOpen(true)}>
          ⚙<span>设置</span>
        </button>
        <button className="rail-btn" title="主题" onClick={() => setThemePopoverOpen((o) => !o)}>
          ◐<span>主题</span>
        </button>
        {themePopoverOpen && (
          <div className="theme-popover">
            {THEME_ORDER.map((t) => (
              <button
                key={t}
                className={`theme-swatch-row${settings.theme === t ? ' active' : ''}`}
                onClick={() => {
                  onSettingsChange({ ...settings, theme: t });
                  setThemePopoverOpen(false);
                }}
              >
                <span className="swatch" style={{ background: SWATCH_COLORS[t] }} />
                {THEME_NAMES[t]}
              </button>
            ))}
          </div>
        )}
      </div>

      {settings.readingMode === 'chapter' && (
        <footer className="reader-bottombar">
          <div className="bottombar-inner" style={{ maxWidth: settings.maxWidth }}>
            <button className="btn nav-btn" disabled={activeIndex === 0} onClick={() => goToChapter(activeIndex - 1)}>
              上一章
            </button>
            <button
              className="btn nav-btn primary"
              disabled={activeIndex >= lastChapterIndex}
              onClick={() => goToChapter(activeIndex + 1)}
            >
              下一章
            </button>
          </div>
        </footer>
      )}

      {sidebarOpen && (
        <ChapterSidebar
          chapters={chapters}
          current={activeIndex}
          onSelect={(i) => {
            goToChapter(i);
            setSidebarOpen(false);
          }}
          onClose={() => setSidebarOpen(false)}
        />
      )}
      {settingsOpen && (
        <SettingsDrawer
          settings={settings}
          onChange={onSettingsChange}
          encoding={encoding}
          onEncodingChange={onEncodingChange}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
