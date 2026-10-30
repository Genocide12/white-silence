// Статический сервер разработки «Белого Безмолвия» — ноль зависимостей.
// Запуск: node scripts/serve.mjs [порт]   (по умолчанию 3000)
import { createServer } from 'http';
import { readFile, stat } from 'fs/promises';
import { extname, join, normalize, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = parseInt(process.env.PORT || process.argv[2] || '3000', 10);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.woff2': 'font/woff2',
};

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = normalize(join(ROOT, p));
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('403'); }
    const st = await stat(file).catch(() => null);
    const target = st && st.isDirectory() ? join(file, 'index.html') : file;
    const data = await readFile(target);
    res.writeHead(200, {
      'Content-Type': MIME[extname(target)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404: ' + req.url);
  }
}).listen(PORT, () => console.log(`Белое Безмолвие → http://localhost:${PORT} (корень: ${ROOT})`));
