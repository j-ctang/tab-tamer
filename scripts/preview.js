import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const root = join(import.meta.dirname, '..', 'extension');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };

const server = createServer(async (req, res) => {
  const path = req.url === '/' ? '/dashboard.html' : req.url;
  try {
    const body = await readFile(join(root, path));
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

const port = process.env.PORT || 4173;
server.listen(port, () => console.log(`Tab Tamer preview: http://localhost:${port}`));
