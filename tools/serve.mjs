import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.json': 'application/json; charset=utf-8', '.csv': 'text/csv; charset=utf-8' };
createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const path = pathname === '/' ? 'index.html' : pathname.slice(1);
    // Serve website assets only, never the local game directory or Git metadata.
    if (!['index.html', 'styles.css', 'app.js'].includes(path) && !path.startsWith('assets/')) {
      res.writeHead(404).end('Not found'); return;
    }
    const target = resolve(root, path);
    if (!target.startsWith(resolve(root) + sep)) { res.writeHead(403).end(); return; }
    const data = await readFile(target);
    res.writeHead(200, { 'Content-Type': types[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(5176, '127.0.0.1', () => console.log('Local: http://127.0.0.1:5176'));
