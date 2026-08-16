import type { EncodingLabel } from '../types';

export const ENCODING_OPTIONS: Array<{ label: EncodingLabel; name: string }> = [
  { label: 'utf-8', name: 'UTF-8（推荐）' },
  { label: 'gb18030', name: 'GB18030 / GBK（简体）' },
  { label: 'big5', name: 'Big5（繁体）' },
  { label: 'utf-16le', name: 'UTF-16 LE' },
  { label: 'utf-16be', name: 'UTF-16 BE' },
  { label: 'windows-1252', name: 'Windows ANSI (Latin)' },
];

const BOM_MAP: Array<{ bytes: number[]; label: EncodingLabel; length: number }> = [
  { bytes: [0xef, 0xbb, 0xbf], label: 'utf-8', length: 3 },
  { bytes: [0xff, 0xfe], label: 'utf-16le', length: 2 },
  { bytes: [0xfe, 0xff], label: 'utf-16be', length: 2 },
];

export function detectBom(buf: ArrayBuffer): { label: EncodingLabel; length: number } | null {
  const b = new Uint8Array(buf.slice(0, 4));
  for (const entry of BOM_MAP) {
    if (entry.bytes.every((v, i) => b[i] === v)) {
      return { label: entry.label, length: entry.length };
    }
  }
  return null;
}

export function decodeWithLabel(buf: ArrayBuffer, label: EncodingLabel): string {
  let bytes = new Uint8Array(buf);
  const bom = detectBom(buf);
  if (bom && bom.label === label) {
    bytes = bytes.subarray(bom.length);
  }
  return new TextDecoder(label, { fatal: false }).decode(bytes);
}

function scoreText(s: string): number {
  let replacements = 0;
  let cjk = 0;
  let ascii = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 0xfffd) replacements++;
    else if (code >= 0x3400 && code <= 0x9fff) cjk++;
    else if (code < 0x80) ascii++;
  }
  return cjk * 2 + ascii * 0.2 - replacements * 1000;
}

export interface EncodingCandidate {
  label: EncodingLabel;
  name: string;
  score: number;
}

/**
 * 自动识别编码：
 * 1. BOM 优先；
 * 2. UTF-16 空字节模式；
 * 3. 严格 UTF-8 校验（能通过基本就是 UTF-8）；
 * 4. 其余按 GB18030 / Big5 打分，取更优者。
 */
export function detectEncoding(buf: ArrayBuffer): EncodingLabel {
  const bom = detectBom(buf);
  if (bom) return bom.label;

  const sample = buf.slice(0, Math.min(buf.byteLength, 1024 * 1024));
  const bytes = new Uint8Array(sample);

  const probe = bytes.subarray(0, Math.min(bytes.length, 4096));
  let oddZero = 0;
  let evenZero = 0;
  let pairs = 0;
  for (let i = 0; i + 1 < probe.length; i += 2) {
    pairs++;
    if (probe[i + 1] === 0) oddZero++;
    if (probe[i] === 0) evenZero++;
  }
  if (pairs > 16) {
    if (oddZero / pairs > 0.25 && evenZero / pairs < 0.05) return 'utf-16le';
    if (evenZero / pairs > 0.25 && oddZero / pairs < 0.05) return 'utf-16be';
  }

  const gb = decodeWithLabel(sample, 'gb18030');
  const big5 = decodeWithLabel(sample, 'big5');
  const gbScore = scoreText(gb);
  const big5Score = scoreText(big5);

  // 部分 GBK/Big5 字节序列恰好也是合法 UTF-8，因此“能解码”不足以判定；
  // 用解码后内容的中文/替换字符得分来对比 UTF-8 与 GB18030/Big5 的合理性。
  try {
    const utf8Text = new TextDecoder('utf-8').decode(sample);
    const utf8Score = scoreText(utf8Text);
    if (utf8Score >= Math.max(gbScore, big5Score)) return 'utf-8';
  } catch {
    // 不是合法 UTF-8，直接进入 GB18030/Big5 对比
  }

  return gbScore >= big5Score ? 'gb18030' : 'big5';
}

/** 供手动选择编码时使用：按得分排序的所有候选。 */
export function encodingCandidates(buf: ArrayBuffer): EncodingCandidate[] {
  const sample = buf.slice(0, Math.min(buf.byteLength, 256 * 1024));
  return ENCODING_OPTIONS.map((opt) => ({
    label: opt.label,
    name: opt.name,
    score: scoreText(decodeWithLabel(sample, opt.label)),
  })).sort((a, b) => b.score - a.score);
}
