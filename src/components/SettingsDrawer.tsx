import type { EncodingLabel, ReaderSettings } from '../types';
import { ENCODING_OPTIONS } from '../lib/encoding';
import { THEME_OPTIONS } from '../lib/themes';

const FONTS = [
  { name: '宋体', value: "'SimSun', 'Songti SC', serif" },
  { name: '黑体', value: "'SimHei', 'Heiti SC', sans-serif" },
  { name: '微软雅黑', value: "'Microsoft YaHei', sans-serif" },
  { name: '楷体', value: "'KaiTi', 'Kaiti SC', serif" },
  { name: '等线', value: "'DengXian', sans-serif" },
  { name: '思源宋体', value: "'Noto Serif SC', 'Source Han Serif SC', serif" },
  { name: '思源黑体 CN', value: "'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif" },
];

interface Props {
  settings: ReaderSettings;
  onChange: (next: ReaderSettings) => void;
  encoding: EncodingLabel;
  isOnline?: boolean;
  onEncodingChange: (label: EncodingLabel) => void;
  onClose: () => void;
}

export default function SettingsDrawer({
  settings,
  onChange,
  encoding,
  isOnline = false,
  onEncodingChange,
  onClose,
}: Props) {
  const patch = (p: Partial<ReaderSettings>) => onChange({ ...settings, ...p });

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <aside className="settings-drawer">
        <div className="settings-header">
          <span>阅读设置</span>
          <button className="icon-btn" onClick={onClose} aria-label="关闭设置">
            ×
          </button>
        </div>

        <div className="setting-row">
          <div className="setting-label">主题</div>
          <div className="theme-grid">
            {THEME_OPTIONS.map((t) => (
              <button
                key={t.id}
                className={`theme-btn${settings.theme === t.id ? ' active' : ''}`}
                onClick={() => patch({ theme: t.id })}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>

        <div className="setting-row">
          <div className="setting-label">
            <span>字体</span>
          </div>
          <select value={settings.fontFamily} onChange={(e) => patch({ fontFamily: e.target.value })}>
            {FONTS.map((f) => (
              <option key={f.name} value={f.value}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        <div className="setting-row">
          <div className="setting-label">
            <span>字号</span>
            <span>{settings.fontSize}px</span>
          </div>
          <div className="font-size-row">
            <button className="btn" onClick={() => patch({ fontSize: Math.max(12, settings.fontSize - 1) })}>
              A−
            </button>
            <input
              type="range"
              min={12}
              max={28}
              step={1}
              value={settings.fontSize}
              onChange={(e) => patch({ fontSize: Number(e.target.value) })}
            />
            <button className="btn" onClick={() => patch({ fontSize: Math.min(28, settings.fontSize + 1) })}>
              A+
            </button>
          </div>
        </div>

        <div className="setting-row">
          <div className="setting-label">
            <span>行距</span>
            <span>{settings.lineHeight.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min={1.2}
            max={2.6}
            step={0.1}
            value={settings.lineHeight}
            onChange={(e) => patch({ lineHeight: Number(e.target.value) })}
          />
        </div>

        <div className="setting-row">
          <div className="setting-label">
            <span>段距</span>
            <span>{settings.paragraphGap.toFixed(1)}em</span>
          </div>
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.1}
            value={settings.paragraphGap}
            onChange={(e) => patch({ paragraphGap: Number(e.target.value) })}
          />
        </div>

        <div className="setting-row">
          <div className="setting-label">对齐方式</div>
          <select value={settings.textAlign} onChange={(e) => patch({ textAlign: e.target.value as ReaderSettings['textAlign'] })}>
            <option value="left">左对齐</option>
            <option value="justify">两端对齐</option>
          </select>
        </div>

        <div className="setting-row">
          <div className="setting-label">
            <span>正文最大宽度</span>
            <span>{settings.maxWidth}px</span>
          </div>
          <input
            type="range"
            min={560}
            max={1100}
            step={20}
            value={settings.maxWidth}
            onChange={(e) => patch({ maxWidth: Number(e.target.value) })}
          />
        </div>

        <div className="setting-row">
          <div className="setting-label">阅读模式</div>
          <select
            value={settings.readingMode}
            onChange={(e) => patch({ readingMode: e.target.value as ReaderSettings['readingMode'] })}
          >
            <option value="chapter">章节翻页（上一章 / 下一章）</option>
            <option value="scroll">滚动翻页（章末自动加载下一章）</option>
          </select>
        </div>

        {!isOnline && (
          <div className="setting-row">
            <div className="setting-label">
              <span>文件编码</span>
              <span>{encoding}</span>
            </div>
            <select
              value={encoding}
              onChange={(e) => onEncodingChange(e.target.value as EncodingLabel)}
            >
              {ENCODING_OPTIONS.map((o) => (
                <option key={o.label} value={o.label}>
                  {o.name}
                </option>
              ))}
            </select>
            <div className="setting-label" style={{ marginTop: 8 }}>
              切换编码后立即重新解析章节
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
