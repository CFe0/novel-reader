import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const booksDir = fileURLToPath(new URL('../public/books/', import.meta.url));
const files = readdirSync(booksDir)
  .filter((f) => f.toLowerCase().endsWith('.txt'))
  .sort((a, b) => a.localeCompare(b, 'zh'));

const books = files.map((f) => {
  const st = statSync(join(booksDir, f));
  return { title: f.replace(/\.txt$/i, ''), fileName: f, size: st.size };
});

writeFileSync(join(booksDir, 'index.json'), JSON.stringify({ books }, null, 2) + '\n');
console.log(`在线书库 index.json 已生成：${books.length} 本`);
