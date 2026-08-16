import { readdirSync, statSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const booksDir = fileURLToPath(new URL('../public/books/', import.meta.url));

// 与 src/lib/chapters.ts 保持一致的章节规则
const PATTERNS = [
  { re: /^第\s*[0-9零一二三四五六七八九十百千万两〇]+\s*[章回节卷集篇部][^\n]{0,40}/ },
  { re: /^(楔子|序章|序言|引子|引言|前言|番外|尾声|后记|终章|大结局)[^\n]{0,40}/ },
  { re: /^chapter\s+\d+[^\n]{0,60}/i },
];

function matchChapterTitle(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  for (const p of PATTERNS) {
    if (p.re.test(trimmed)) return trimmed.slice(0, 60);
  }
  return null;
}

function detectEncoding(buf) {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return 'utf-8';
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return 'utf-16le';
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return 'utf-16be';
  const sample = buf.subarray(0, Math.min(buf.length, 1024 * 1024));
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(sample);
    return 'utf-8';
  } catch {
    // 非法 UTF-8，按 GB18030 处理
  }
  return 'gb18030';
}

function scanChapters(buf, encoding) {
  const decoder = new TextDecoder(encoding, { fatal: false });
  const chapters = [];
  let current = null;
  let lineStart = 0;
  for (let i = 0; i <= buf.length; i++) {
    if (i < buf.length && buf[i] !== 0x0a) continue;
    let lineBytes = buf.subarray(lineStart, i);
    if (lineBytes.length > 0 && lineBytes[lineBytes.length - 1] === 0x0d) {
      lineBytes = lineBytes.subarray(0, lineBytes.length - 1);
    }
    const line = decoder.decode(lineBytes);
    const title = matchChapterTitle(line);
    if (title) {
      if (current) chapters.push({ index: chapters.length, title: current.title, start: current.start, end: lineStart });
      current = { title, start: lineStart };
    }
    lineStart = i + 1;
  }
  if (current) {
    chapters.push({ index: chapters.length, title: current.title, start: current.start, end: buf.length });
  }
  if (chapters.length === 0) {
    return [{ index: 0, title: '全文', start: 0, end: buf.length }];
  }
  if (chapters[0].start > 0) {
    chapters.unshift({ index: 0, title: '开篇', start: 0, end: chapters[0].start });
    chapters.forEach((c, i) => {
      c.index = i;
    });
  }
  return chapters;
}

const files = readdirSync(booksDir)
  .filter((f) => f.toLowerCase().endsWith('.txt'))
  .sort((a, b) => a.localeCompare(b, 'zh'));

for (const f of files) {
  const buf = readFileSync(join(booksDir, f));
  const encoding = detectEncoding(buf);
  const chapters = scanChapters(buf, encoding);
  const title = f.replace(/\.txt$/i, '');
  const dir = join(booksDir, title);
  mkdirSync(dir, { recursive: true });
  const payload = { fileName: f, size: buf.length, encoding, chapters };
  writeFileSync(join(dir, 'chapters.json'), JSON.stringify(payload, null, 2) + '\n');
  console.log(`已生成章节索引：${title}（${chapters.length} 章，编码 ${encoding}，${(buf.length / 1048576).toFixed(1)} MB）`);
}
