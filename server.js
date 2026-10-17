// Servidor do quebra-cabeça em dupla: entrega o HTML e ordena as ações de cada sala.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const HTML = path.join(__dirname, 'quebra-cabeca.html');
const TIPOS = new Set(['init', 'pegar', 'soltar', 'girar', 'passar']);
const salas = new Map(); // código da sala -> { clientes: Set, log: [] }

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/') {
    fs.readFile(HTML, (erro, dados) => {
      if (erro) { res.writeHead(500); return res.end('Arquivo do jogo não encontrado.'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(dados);
    });
    return;
  }
  if (url.pathname === '/health') { res.writeHead(200); return res.end('ok'); }
  res.writeHead(404); res.end('Não encontrado');
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });

function enviarA(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}
function difundir(sala, msg) {
  sala.clientes.forEach(c => enviarA(c, msg));
}

wss.on('connection', (ws, req) => {
  const codigo = (new URL(req.url, 'http://localhost').searchParams.get('sala') || 'sala-1').slice(0, 40);
  if (!salas.has(codigo)) salas.set(codigo, { clientes: new Set(), log: [] });
  const sala = salas.get(codigo);
  sala.clientes.add(ws);
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', bruto => {
    let m;
    try { m = JSON.parse(bruto); } catch { return; }

    if (m.t === 'pedido') return enviarA(ws, { t: 'log', log: sala.log });

    if (m.t === 'acao' && m.a && TIPOS.has(m.a.t)) {
      // Só uma partida por sala: se já existe, a imagem não pode ser escolhida de novo
      if (m.a.t === 'init' && sala.log.length) return enviarA(ws, { t: 'log', log: sala.log });
      // Outras ações só fazem sentido depois do init
      if (m.a.t !== 'init' && sala.log.length === 0) return;
      sala.log.push(m.a);
      difundir(sala, { t: 'acao', a: m.a });
    }
  });

  ws.on('close', () => {
    sala.clientes.delete(ws);
    if (sala.clientes.size === 0) salas.delete(codigo); // sala vazia: a partida é encerrada
  });
});

// Mantém conexões vivas (Render derruba conexões ociosas)
setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

server.listen(PORT, () => console.log(`Quebra-cabeça rodando na porta ${PORT}`));
