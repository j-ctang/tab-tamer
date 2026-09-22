import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const root = join(import.meta.dirname, '..', 'extension');
const rootResolved = resolve(root);
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };

const server = createServer(async (req, res) => {
  const reqPath = req.url === '/' ? '/dashboard.html' : req.url;
  const filePath = resolve(join(root, reqPath));
  if (filePath !== rootResolved && !filePath.startsWith(rootResolved + '/')) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  try {
    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': types[extname(filePath)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

const port = process.env.PORT || 4173;
server.listen(port, '127.0.0.1', () => console.log(`Tab Tamer preview: http://localhost:${port}`));
