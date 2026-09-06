/**
 * 局域网书库服务：把电脑本地 `局域网书库/` 文件夹共享给同一网络内的手机/平板。
 *
 * 运行：npm run lan
 * 手机访问：http://<电脑局域网IP>:8612/
 * 书库列表：http://<电脑局域网IP>:8612/lan-books/index.json
 */
import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, extname, resolve, sep } from 'node:path';
import { networkInterfaces } from 'node:os';

const root = fileURLToPath(new URL('..', import.meta.url));
const distDir = join(root, 'dist');
const lanBooksDir = join(root, '局域网书库');
const PORT = Number(process.env.PORT || 8612);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.nojekyll': 'text/plain',
};

function safeJoin(base, rel) {
  const target = resolve(base, rel);
  if (target !== base && !target.startsWith(base + sep)) return null;
  return target;
}

async function lanBookIndex() {
  const books = [];
  try {
    const files = (await readdir(lanBooksDir))
      .filter((f) => f.toLowerCase().endsWith('.txt'))
      .sort((a, b) => a.localeCompare(b, 'zh'));
    for (const f of files) {
      const st = await stat(join(lanBooksDir, f));
      books.push({ title: f.replace(/\.txt$/i, ''), fileName: f, size: st.size });
    }
  } catch {
    // 书库目录不存在时返回空列表
  }
  return JSON.stringify({ books }, null, 2);
}

function writeJson(res, body) {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
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

    // 局域网书库
    if (pathname === '/lan-books/index.json') {
      writeJson(res, await lanBookIndex());
      return;
    }
    if (pathname.startsWith('/lan-books/')) {
      const filePath = safeJoin(lanBooksDir, pathname.slice('/lan-books/'.length));
      if (!filePath) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      try {
        const st = await stat(filePath);
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
          createReadStream(filePath, { start, end }).pipe(res);
          return;
        }
        res.writeHead(200, {
          'Content-Length': st.size,
          'Content-Type': 'text/plain; charset=utf-8',
          'Accept-Ranges': 'bytes',
        });
        createReadStream(filePath).pipe(res);
        return;
      } catch {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
    }

    // 应用静态文件（dist）
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
  console.log('（请把 TXT 小说放进项目目录的「局域网书库」文件夹）');
});
