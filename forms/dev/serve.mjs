// Локальный стенд формы заявки: сайт и Worker на одном адресе, письма — файлами.
//
//   node dev/serve.mjs [порт=8788] [resend=ok|reject|fail]
//
// Страницы site\ отдаются как есть, только адрес формы в них подменяется на
// свой (/prezentare): отладочных веток в самих страницах нет. Resend в сеть
// не зовётся — каждое письмо ложится в dev/outbox/ (.json, .txt и .html), а
// /__outbox/ показывает их списком. `reject` — Resend отверг пару (как на
// негодном адресе клиента), `fail` — не отвечает вовсе.
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = normalize(join(HERE, '..', '..'));
const OUTBOX = join(HERE, 'outbox');
const PORT = Number(process.argv[2] || 8788);
const MODE = process.argv[3] || 'ok';
const PROD = 'https://forms.dentpilot.md/prezentare';
const ORIGIN = `http://127.0.0.1:${PORT}`;

// [vars] — из wrangler.toml: у стенда нет своих копий адресов
const toml = readFileSync(join(HERE, '..', 'wrangler.toml'), 'utf8');
const section = toml.split(/^\[vars\]\s*$/m)[1].split(/^\[/m)[0];
const vars = Object.fromEntries([...section.matchAll(/^(\w+)\s*=\s*"([^"]*)"/gm)].map((m) => [m[1], m[2]]));
const env = { ...vars, RESEND_API_KEY: 'dev', ALLOWED_ORIGINS: ORIGIN };

mkdirSync(OUTBOX, { recursive: true });
let seq = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (!String(url).startsWith('https://api.resend.com')) return realFetch(url, init);
  const batch = String(url).endsWith('/batch');
  if (MODE === 'fail') return new Response('{"name":"internal_server_error"}', { status: 500 });
  if (MODE === 'reject' && batch) {
    return new Response('{"name":"validation_error","message":"Invalid `to` field."}', { status: 422 });
  }
  const payload = JSON.parse(init.body);
  const ids = (batch ? payload : [payload]).map((m) => {
    const kind = (m.tags || []).find((t) => t.name === 'kind')?.value || 'mail';
    const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${++seq}-${kind}`;
    writeFileSync(join(OUTBOX, `${id}.json`), JSON.stringify(m, null, 2));
    writeFileSync(join(OUTBOX, `${id}.txt`),
      `From: ${m.from}\nTo: ${m.to.join(', ')}\nReply-To: ${m.reply_to || ''}\nSubject: ${m.subject}\n\n${m.text}\n`);
    if (m.html) writeFileSync(join(OUTBOX, `${id}.html`), m.html);
    console.log(`письмо → ${m.to.join(', ')} «${m.subject}» (${id})`);
    return { id };
  });
  return new Response(JSON.stringify(batch ? { data: ids } : ids[0]), { status: 200 });
};

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css',
  '.png': 'image/png', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp',
};
const PASS = ['origin', 'accept', 'content-type'];

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, ORIGIN);
    if (url.pathname === '/prezentare' || url.pathname === '/health') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const headers = Object.fromEntries(PASS.filter((h) => req.headers[h]).map((h) => [h, req.headers[h]]));
      const r = await worker.fetch(new Request(ORIGIN + req.url, {
        method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
      }), env);
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    if (url.pathname === '/__outbox/') {
      const files = readdirSync(OUTBOX).filter((f) => !f.endsWith('.json')).sort().reverse();
      res.writeHead(200, { 'Content-Type': TYPES['.html'] });
      res.end(`<!doctype html><meta charset="utf-8"><title>outbox</title><ul>${
        files.map((f) => `<li><a href="/__outbox/${f}">${f}</a></li>`).join('')}</ul>`);
      return;
    }
    const rel = decodeURIComponent(url.pathname.startsWith('/__outbox/')
      ? join('forms', 'dev', 'outbox', url.pathname.slice('/__outbox/'.length))
      : url.pathname.replace(/^\/+/, '') || 'index.html');
    let file = normalize(join(SITE, rel));
    if (file !== SITE && !file.startsWith(SITE + sep)) { res.writeHead(403).end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) { res.writeHead(404).end('not found'); return; }
    let data = readFileSync(file);
    if (extname(file) === '.html') {
      // страницам — свой адрес формы; письмам — значок отсюда, пока сайт его не выложил
      data = Buffer.from(file.startsWith(OUTBOX)
        ? data.toString('utf8').replaceAll('https://dentpilot.md/mail/', '/mail/')
        : data.toString('utf8').replaceAll(PROD, '/prezentare'));
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch (e) {
    console.error(e);
    res.writeHead(500).end(String(e));
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`стенд формы: ${ORIGIN}/#contact   ru: ${ORIGIN}/ru.html#contact`);
  console.log(`Resend: ${MODE}; письма — ${ORIGIN}/__outbox/`);
});
