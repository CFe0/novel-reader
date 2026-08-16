/**
 * 核心逻辑冒烟测试（Node 环境运行，无需浏览器）：
 * 1. 编码识别（UTF-8 / GBK / UTF-16 LE）
 * 2. 分块章节扫描（标题、偏移、无章节回退）
 * 3. 中等大小文件的扫描性能
 *
 * 运行：npm run test:smoke
 */
import { detectEncoding } from '../src/lib/encoding';
import { scanChapters } from '../src/lib/chapters';

function assert(cond: boolean, msg: string): void {
  if (cond) {
    console.log('PASS:', msg);
  } else {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  }
}

function hexToBuffer(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function main(): Promise<void> {
  // ---- 编码识别 ----
  const text =
    '第一章 风起\n\n夜色如墨。\n\n第二章 云涌\n\n天光乍亮。\n\n楔子\n\n正文内容。\n';
  const utf8 = new TextEncoder().encode(text);
  assert(
    detectEncoding(utf8.buffer.slice(0, utf8.byteLength)) === 'utf-8',
    'UTF-8 识别为 utf-8',
  );

  // “第一章 风起”等内容的 GBK 字节（同时刻意选择恰好也合法的 UTF-8 序列，检验启发式）
  const gbkHex =
    'b5dad2bb d5c220 b7e7c6f0 0d0a0d0a d2b9c9ab c8e7c4ab a1a30d0a 0d0a ' +
    'b5dab6fe d5c220 d4c6d3bf 0d0a0d0a ccecb9e2 d5a7c1c1 a1a30d0a 0d0a ' +
    'd0a8d7d3 0d0a0d0a d5fdcec4 c4dac8dd a1a30d0a';
  const gbk = hexToBuffer(gbkHex);
  assert(
    detectEncoding(gbk.buffer.slice(0, gbk.byteLength)) === 'gb18030',
    'GBK 识别为 gb18030（而非误判 UTF-8）',
  );

  const utf16leBytes = new Uint8Array(Buffer.from(text, 'utf16le'));
  assert(
    detectEncoding(utf16leBytes.buffer) === 'utf-16le',
    'UTF-16 LE（无 BOM）识别为 utf-16le',
  );

  // ---- 章节扫描（GBK）----
  const gbkFile = new File([gbk as BlobPart], '测试.gbk.txt');
  const gbkChapters = await scanChapters(gbkFile, 'gb18030');
  assert(gbkChapters.length === 3, `GBK 文件识别出 3 章（实际 ${gbkChapters.length}）`);
  assert(gbkChapters[0]?.title === '第一章 风起', '第 1 章标题正确');
  assert(gbkChapters[1]?.title === '第二章 云涌', '第 2 章标题正确');
  assert(gbkChapters[2]?.title === '楔子', '第 3 章（楔子）标题正确');
  assert(
    gbkChapters[0].start === 0 &&
      gbkChapters[1].start === gbkChapters[0].end &&
      gbkChapters[2].start === gbkChapters[1].end &&
      gbkChapters[2].end === gbkFile.size,
    '章节字节偏移连续且收尾正确',
  );

  // ---- 无章节文件回退 ----
  const noChapter = new File(['完全没有章节标题的一段正文。'], '无章节.txt');
  const fallback = await scanChapters(noChapter, 'utf-8');
  assert(fallback.length === 1 && fallback[0].start === 0 && fallback[0].end === noChapter.size, '无章节时整本回退为一章');

  // ---- 中等大小文件 ----
  const filler = '这是用于填充文件大小的正文内容，用来验证分块扫描不会卡住。\n'.repeat(2);
  const bigLines: string[] = ['第1章 开始\n'];
  for (let i = 0; i < 120000; i++) bigLines.push(filler);
  bigLines.push('\n第999章 结束\n');
  const big = new TextEncoder().encode(bigLines.join(''));
  const bigFile = new File([big as BlobPart], '大文件.txt');
  const started = Date.now();
  const bigChapters = await scanChapters(bigFile, 'utf-8');
  const elapsed = Date.now() - started;
  assert(bigChapters.length === 2, `大文件识别出 2 章（实际 ${bigChapters.length}）`);
  assert(bigChapters[0].title === '第1章 开始' && bigChapters[1].title === '第999章 结束', '大文件章节标题正确');
  console.log(`INFO: 大文件 ${(big.byteLength / 1048576).toFixed(1)} MB 扫描耗时 ${elapsed}ms`);

  console.log(process.exitCode ? '\n存在失败用例' : '\n冒烟测试全部通过');
}

void main();
