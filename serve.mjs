import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

const port = Number(process.env.RELIC_PORT || 8080);
const extensions = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json',
};
const publicFiles = new Set(['index.html', 'style.css', 'app.mjs', 'game.mjs', 'map.mjs', 'data.mjs', 'backup.mjs', 'sw.js',
  'manifest.webmanifest', 'crest.svg', 'march.svg', 'icon-192.png', 'icon-512.png']);
if (process.argv.includes('--dev')) publicFiles.add('dev.mjs');

const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  const file = path === '/' ? 'index.html' : path.slice(1);
  if (file !== basename(file) || !publicFiles.has(file)) {
    response.writeHead(404).end('Not found');
    return;
  }
  try {
    const assetPath = process.env.RELIC_ASSETS && file !== 'dev.mjs' ? join(process.env.RELIC_ASSETS, file) : new URL(file, import.meta.url);
    const contents = await readFile(assetPath);
    response.writeHead(200, { 'Content-Type': extensions[extname(file)], 'Cache-Control': 'no-cache' });
    response.end(contents);
  } catch {
    response.writeHead(404).end('Not found');
  }
});
server.listen(port, '127.0.0.1', () => console.log('Relic Company · http://localhost:' + server.address().port));
