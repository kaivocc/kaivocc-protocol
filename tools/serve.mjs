// Tiny static server for local checks: node tools/serve.mjs [dir] [port]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
const dir = resolve(process.argv[2] || 'dist'), port = +(process.argv[3] || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
createServer(async (req, res) => {
  const raw = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let p = normalize(raw).split(/[\\/]/).filter(Boolean).filter((s) => s !== '..').join('/');
  if (!p || raw.endsWith('/')) p += 'index.html';
  try { const b = await readFile(join(dir, p)); res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end('not found'); }
}).listen(port, () => console.log('serving', dir, 'on', port));
