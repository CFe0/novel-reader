import type { Chapter, EncodingLabel } from '../types';
import { decodeWithLabel } from './encoding';

/**
 * 可扩展的章节规则表：命中顺序即优先级。
 * 每个正则作用于“去掉首尾空白后的整行”。
 */
const CHAPTER_PATTERNS: Array<{ id: string; name: string; re: RegExp }> = [
  { id: 'cn-numbered', name: '第X章/回/节/卷/集/篇/部', re: /^第\s*[0-9零一二三四五六七八九十百千万两〇]+\s*[章回节卷集篇部][^\n]{0,40}/ },
  { id: 'cn-note', name: '楔子/序章/引子/番外/尾声等', re: /^(楔子|序章|序言|引子|引言|前言|番外|尾声|后记|终章|大结局)[^\n]{0,40}/ },
  { id: 'en', name: 'Chapter N', re: /^chapter\s+\d+[^\n]{0,60}/i },
];

export function matchChapterTitle(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  for (const p of CHAPTER_PATTERNS) {
    if (p.re.test(trimmed)) return trimmed.slice(0, 60);
  }
  return null;
}

export function getChapterPatterns(): Array<{ id: string; name: string }> {
  return CHAPTER_PATTERNS.map(({ id, name }) => ({ id, name }));
}

const CHUNK_SIZE = 4 * 1024 * 1024;

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/**
 * 分块扫描章节，不整本读入内存。
 * 对每个 4MB 块，拼接上一块未终结的行尾（carry），按行解码后匹配章节规则，
 * 记录“章节标题 + 文件字节偏移”。最后产出按偏移排序的章节列表。
 */
export async function scanChapters(
  file: File,
  encoding: EncodingLabel,
  onProgress?: (percent: number) => void,
): Promise<Chapter[]> {
  const chapters: Chapter[] = [];
  let current: { title: string; start: number } | null = null;
  let carry = new Uint8Array(0);
  const decoder = new TextDecoder(encoding, { fatal: false });

  for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
    const end = Math.min(offset + CHUNK_SIZE, file.size);
    const chunk = new Uint8Array(await file.slice(offset, end).arrayBuffer());
    const combined = concat(carry, chunk);
    const base = offset - carry.length;

    let lineStart = 0;
    for (let i = 0; i < combined.length; i++) {
      if (combined[i] !== 0x0a) continue;
      let lineBytes = combined.subarray(lineStart, i);
      if (lineBytes.length > 0 && lineBytes[lineBytes.length - 1] === 0x0d) {
        lineBytes = lineBytes.subarray(0, lineBytes.length - 1);
      }
      const line = decoder.decode(lineBytes);
      const title = matchChapterTitle(line);
      if (title) {
        if (current) {
          chapters.push({ index: chapters.length, title: current.title, start: current.start, end: base + lineStart });
        }
        current = { title, start: base + lineStart };
      }
      lineStart = i + 1;
    }
    carry = combined.subarray(lineStart);
    onProgress?.(Math.min(1, end / file.size));
  }

  if (current) {
    chapters.push({ index: chapters.length, title: current.title, start: current.start, end: file.size });
  }

  if (chapters.length === 0) {
    // 识别失败：整本作为一章，保证可以正常阅读
    return [{ index: 0, title: file.name.replace(/\.txt$/i, '') || file.name, start: 0, end: file.size }];
  }

  // 第一个章节前存在正文（如卷首语），补一个“开篇”
  if (chapters[0].start > 0) {
    chapters.unshift({ index: 0, title: '开篇', start: 0, end: chapters[0].start });
    chapters.forEach((c, i) => {
      c.index = i;
    });
  }

  return chapters;
}

export async function decodeChapter(
  file: File,
  chapter: Chapter,
  encoding: EncodingLabel,
): Promise<string> {
  const buf = await file.slice(chapter.start, chapter.end).arrayBuffer();
  return decodeWithLabel(buf, encoding);
}
