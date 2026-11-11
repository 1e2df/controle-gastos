// Servidor local só para desenvolvimento: entrega os arquivos da pasta docs/.
// O app em si não precisa de servidor: os dados ficam no aparelho (IndexedDB).
//   node server.js          -> http://localhost:3210
//   node server.js --rede   -> também acessível por outros aparelhos do mesmo Wi-Fi
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REDE = process.argv.includes('--rede');
const PORT = Number(process.env.PORT) || 3210;
const RAIZ = path.join(__dirname, 'docs');

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.md': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let caminho;
  try {
    caminho = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    caminho = null;
  }
  if (caminho?.endsWith('/')) caminho += 'index.html';
  const arquivo = caminho && path.join(RAIZ, caminho);

  // Só GET, só arquivos de tipos conhecidos e só dentro de docs/.
  const permitido =
    req.method === 'GET' && arquivo && arquivo.startsWith(RAIZ + path.sep) && TIPOS[path.extname(arquivo)];
  if (!permitido || !fs.existsSync(arquivo) || !fs.statSync(arquivo).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Não encontrado.');
  }
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arquivo)], 'Cache-Control': 'no-cache' });
  fs.createReadStream(arquivo).pipe(res);
});

server.listen(PORT, REDE ? '0.0.0.0' : '127.0.0.1', () => {
  console.log(`Controle de gastos em http://localhost:${PORT}`);
  if (!REDE) return;
  const ips = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
  for (const ip of ips) console.log(`Na rede: http://${ip}:${PORT} (sem HTTPS: não instala nem funciona offline)`);
});
