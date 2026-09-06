/**
 * 局域网书库服务（支持登记/固定多个本机文件夹）
 *
 * 用法：
 *   npm run lan                   启动服务（自动构建）
 *   node server/lan-server.mjs add  "D:\书库\玄幻"   登记一个固定文件夹
 *   node server/lan-server.mjs remove <路径或序号>    移除登记
 *   node server/lan-server.mjs list                  查看已登记文件夹
 *
 * 手机访问：http://<电脑局域网IP>:8612/
 * 内置书库：项目目录的「局域网书库」文件夹始终被包含。
 */
import { createServer } from 'node:http';
import { readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, extname, resolve, sep } from 'node:path';
import { networkInterfaces } from 'node:os';

const root = fileURLToPath(new URL('..', import.meta.url));
const distDir = join(root, 'dist');
const builtinBooksDir = join(root, '局域网书库');
const configPath = join(root, 'lan-config.json');
const PORT = Number(process.env.PORT || 8612);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.nojekyll': 'text/plain',
};

async function loadConfig() {
  try {
    const raw = await readFile(configPath, 'utf-8');
    const cfg = JSON.parse(raw);
    return Array.isArray(cfg?.roots) ? cfg.roots : [];
  } catch {
    return [];
  }
}

async function saveConfig(roots) {
  await mkdir(root, { recursive: true });
  await writeFile(configPath, JSON.stringify({ roots }, null, 2) + '\n', 'utf-8');
}

function norm(p) {
  return resolve(p).replace(/\/+$/, '').toLowerCase();
}

async function cmdAdd(dir) {
  const target = resolve(dir);
  if (!existsSync(target) || !(await stat(target)).isDirectory()) {
    console.error('文件夹不存在或不是目录：' + target);
    process.exit(1);
  }
  const roots = await loadConfig();
  if (roots.some((r) => norm(r.path) === norm(target))) {
    console.log('该文件夹已在书库中：' + target);
    return;
  }
  roots.push({ path: target, addedAt: Date.now() });
  await saveConfig(roots);
  console.log('已登记固定书库：' + target);
}

async function cmdRemove(arg) {
  const roots = await loadConfig();
  const idx = Number(arg);
  const i = Number.isInteger(idx) ? idx : roots.findIndex((r) => norm(r.path) === norm(arg));
  if (i < 0 || i >= roots.length) {
    console.error('未找到该书库（可用 list 查看序号/路径）');
    process.exit(1);
  }
  const removed = roots.splice(i, 1);
  await saveConfig(roots);
  console.log('已移除书库：' + removed[0].path);
}

async function cmdList() {
  const roots = await loadConfig();
  console.log('=== 已登记的书库文件夹 ===');
  if (!roots.length) console.log('（无，可运行 node server/lan-server.mjs add "文件夹路径" 添加）');
  roots.forEach((r, i) => console.log(`[${i}] ${r.path}`));
}

async function scanDir(dir, base) {
  const books = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return books;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  for (const e of entries) {
    const full = join(dir, e.name);
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) {
      books.push(...(await scanDir(full, rel)));
    } else if (e.isFile() && e.name.toLowerCase().endsWith('.txt')) {
      const st = await stat(full);
      books.push({ title: rel.replace(/\.txt$/i, ''), fileName: rel, size: st.size });
    }
  }
  return books;
}

async function lanBookIndex() {
  const roots = [builtinBooksDir, ...(await loadConfig()).map((r) => r.path)];
  const books = [];
  for (const dir of roots) {
    books.push(...(await scanDir(dir, '')));
  }
  return JSON.stringify({ books }, null, 2);
}

function safeJoin(base, rel) {
  const target = resolve(base, rel);
  if (target !== base && !target.startsWith(base + sep)) return null;
  return target;
}

function writeJson(res, body) {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

async function findBookFile(rel) {
  const roots = [builtinBooksDir, ...(await loadConfig()).map((r) => r.path)];
  for (const dir of roots) {
    const fp = safeJoin(dir, rel);
    if (fp) {
      try {
        const st = await stat(fp);
        if (st.isFile()) return { fp, st };
      } catch {
        // 继续找下一个书库
      }
    }
  }
  return null;
}

const server = createServer(async (req, res) => {
  try {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
    } catch {
      res.writeHead(400);
      res.end('Bad Request');
      return;
    }

    if (pathname === '/lan-books/index.json') {
      writeJson(res, await lanBookIndex());
      return;
    }
    if (pathname.startsWith('/lan-books/')) {
      const rel = pathname.slice('/lan-books/'.length);
      const found = await findBookFile(rel);
      if (!found) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
      const { fp, st } = found;
      const range = req.headers.range;
      if (range) {
        const m = /^bytes=(\d+)-(\d*)$/.exec(range);
        const start = m ? Number(m[1]) : 0;
        const end = m && m[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${st.size}`,
          'Content-Length': end - start + 1,
          'Content-Type': 'text/plain; charset=utf-8',
          'Accept-Ranges': 'bytes',
        });
        createReadStream(fp, { start, end }).pipe(res);
        return;
      }
      res.writeHead(200, {
        'Content-Length': st.size,
        'Content-Type': 'text/plain; charset=utf-8',
        'Accept-Ranges': 'bytes',
      });
      createReadStream(fp).pipe(res);
      return;
    }

    const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const filePath = safeJoin(distDir, rel);
    if (!filePath) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    let data = await readFile(filePath).catch(() => null);
    if (data === null) {
      data = await readFile(join(distDir, 'index.html')).catch(() => null);
      if (!data) {
        res.writeHead(500);
        res.end('请先运行 npm run build 生成 dist');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      res.end(data);
      return;
    }
    const ext = extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch (err) {
    res.writeHead(500);
    res.end('Server error: ' + err.message);
  }
});

// ---------- CLI ----------
const [cmd, arg] = process.argv.slice(2);
if (cmd === 'add') {
  await cmdAdd(arg);
} else if (cmd === 'remove') {
  await cmdRemove(arg);
} else if (cmd === 'list') {
  await cmdList();
} else if (cmd && cmd !== 'serve') {
  console.error('未知命令：' + cmd);
  console.error('用法：node server/lan-server.mjs [serve|add <路径>|remove <路径或序号>|list]');
  process.exit(1);
} else {
  await cmdList();
  server.listen(PORT, '0.0.0.0', () => {
    const nets = networkInterfaces();
    const ips = [];
    for (const list of Object.values(nets)) {
      for (const item of list || []) {
        if (item.family === 'IPv4' && !item.internal) ips.push(item.address);
      }
    }
    console.log('=== 局域网书库已启动 ===');
    console.log('本机访问：  http://127.0.0.1:' + PORT + '/');
    for (const ip of ips) console.log('手机访问：  http://' + ip + ':' + PORT + '/');
    console.log('登记书库：node server/lan-server.mjs add "文件夹路径"');
  });
}
