// DentPilot — приём заявок «Solicită o prezentare» с dentpilot.md (27.09.2026).
//
// Сайт статический (GitHub Pages), и до этого форма была ссылкой mailto: она
// только просила открыть почтовую программу, а «Mulțumim!» показывала всегда —
// заявка без настроенной почты у посетителя пропадала молча. Теперь форма шлёт
// заявку сюда, в Cloudflare Worker на forms.dentpilot.md: проверка источника и
// полей, ловушка для ботов, лимит с адреса и ДВА письма одним вызовом Resend —
// заявка Олегу (Reply-To = клиент) и подтверждение клиенту с contact@dentpilot.md.
//
// ⭐ Правило, ради которого всё затевалось: заявка не теряется МОЛЧА. Resend не
// принял пару писем — заявка Олегу уходит отдельно, с пометкой, что клиент
// подтверждения не получил; не ушла и она — посетитель видит отказ с телефоном,
// а не благодарность.
// Секрет RESEND_API_KEY кладётся `wrangler secret put`, в файлах его нет.

import { autoReply, notice, resultPage } from './letters.js';

const API = 'https://api.resend.com';
const MAX_BODY = 8 * 1024;   // заявка — полкилобайта; чужой мегабайт до разбора не доходит
const LANGS = ['ro', 'ru'];
// Ссылка или разметка в имени/клинике — это спам через наше подтверждение:
// имя уходит в письмо на адрес, который ввёл посетитель, а не мы.
const URLISH = /https?:|www\.|:\/\/|[<>]/i;
const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;
// Как связаться (08.10, редизайн сайта): телефон по умолчанию — поле старых форм без него
const VIAS = ['telefon', 'whatsapp', 'viber'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ ok: true }, 200);
    if (url.pathname !== '/prezentare') return new Response('Not found', { status: 404 });

    const origin = request.headers.get('Origin') || '';
    const allowed = origins(env).includes(origin);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: allowed ? 204 : 403, headers: allowed ? cors(origin, true) : {} });
    }
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST, OPTIONS' } });
    }

    // Скрипт страницы просит JSON; форма без скрипта получает страницу-ответ
    const asJson = (request.headers.get('Accept') || '').includes('application/json');
    let lang = 'ro';
    const answer = (status, body) => (asJson
      ? json(body, status, allowed ? origin : '')
      : page(resultPage(lang, body), status));

    if (!allowed) return answer(403, { ok: false, code: 'origin' });
    if (Number(request.headers.get('Content-Length') || 0) > MAX_BODY) {
      return answer(413, { ok: false, code: 'bad_request' });
    }
    let form;
    try {
      const buf = await request.arrayBuffer();
      if (buf.byteLength > MAX_BODY) return answer(413, { ok: false, code: 'bad_request' });
      form = await new Response(buf, { headers: { 'Content-Type': request.headers.get('Content-Type') || '' } })
        .formData();
    } catch {
      return answer(400, { ok: false, code: 'bad_request' });
    }
    const raw = String(form.get('lang') || '');
    lang = LANGS.includes(raw) ? raw : 'ro';
    const country = request.headers.get('CF-IPCountry') || '';

    const ip = request.headers.get('CF-Connecting-IP') || '';
    if (env.LIMITER && ip) {
      const { success } = await env.LIMITER.limit({ key: ip });
      if (!success) return answer(429, { ok: false, code: 'limited' });
    }
    if (String(form.get('website') || '').trim()) {
      // поле, которого человек не видит: боту «принято», писем нет
      log({ ev: 'honeypot', lang, country });
      return answer(200, { ok: true, confirmed: true });
    }
    const { f, field } = clean(form);
    if (field) return answer(400, { ok: false, code: 'invalid', field });

    const toOleg = (meta) => mail(env, { ...notice(f, lang, meta), to: env.NOTIFY_TO });
    if (!f.email) {
      // E-mail необязателен (08.10): без адреса подтверждать некому — только заявка Олегу
      const only = await send(env, '/emails', toOleg({ country }));
      log({ ev: 'lead', lang, country, confirmed: false, noEmail: true, notice: only.ok ? 'ok' : only.error });
      if (only.ok) return answer(200, { ok: true, confirmed: false });
      return answer(502, { ok: false, code: 'send_failed' });
    }
    const both = await send(env, '/emails/batch', [
      toOleg({ country }),
      mail(env, { ...autoReply(f, lang), replyTo: env.REPLY_TO }),
    ]);
    if (both.ok) {
      log({ ev: 'lead', lang, country, confirmed: true });
      return answer(200, { ok: true, confirmed: true });
    }
    // Пару не приняли (чаще всего — адрес клиента): заявка Олегу — отдельно
    const alone = await send(env, '/emails', toOleg({ country, replyFailed: both.error }));
    log({ ev: 'lead', lang, country, confirmed: false, batch: both.error, notice: alone.ok ? 'ok' : alone.error });
    if (alone.ok) return answer(200, { ok: true, confirmed: false });
    return answer(502, { ok: false, code: 'send_failed' });
  },
};

/** Поля заявки → {f, field}: field — имя первого негодного поля или ''. */
export function clean(form) {
  const one = (k, max) => String(form.get(k) || '').replace(/\s+/g, ' ').trim().slice(0, max + 1);
  const f = {
    nume: one('nume', 80),
    clinica: one('clinica', 120),
    telefon: one('telefon', 40),
    email: one('email', 254),
    via: String(form.get('via') || '').trim().toLowerCase(),
  };
  if (!VIAS.includes(f.via)) f.via = 'telefon';
  if (f.nume.length < 2 || f.nume.length > 80 || URLISH.test(f.nume) || f.nume.includes('@')) {
    return { f, field: 'nume' };
  }
  if (f.clinica.length < 2 || f.clinica.length > 120 || URLISH.test(f.clinica)) return { f, field: 'clinica' };
  const digits = f.telefon.replace(/\D/g, '').length;
  if (digits < 8 || digits > 15 || /[^\d\s+()./-]/.test(f.telefon)) return { f, field: 'telefon' };
  if (f.email && (f.email.length > 254 || !EMAIL.test(f.email))) return { f, field: 'email' };
  return { f, field: '' };
}

function origins(env) {
  return String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function mail(env, letter) {
  const m = {
    from: env.MAIL_FROM,
    to: [letter.to],
    subject: letter.subject,
    text: letter.text,
    tags: [{ name: 'form', value: 'prezentare' }, { name: 'kind', value: letter.kind }],
  };
  if (letter.html) m.html = letter.html;
  if (letter.replyTo) m.reply_to = letter.replyTo;
  return m;
}

async function send(env, path, payload) {
  if (!env.RESEND_API_KEY) return { ok: false, error: 'no_api_key' };
  try {
    const r = await fetch(API + path, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (r.ok) return { ok: true, error: '' };
    const data = await r.json().catch(() => null);
    return { ok: false, error: `${r.status} ${(data && (data.name || data.message)) || ''}`.trim() };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

function cors(origin, preflight) {
  const h = { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
  if (preflight) {
    h['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Content-Type, Accept';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}

function json(body, status, origin = '') {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...(origin ? cors(origin, false) : {}),
    },
  });
}

function page(html, status) {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

// В журнал Workers — без персональных данных: язык, страна, исход
function log(o) {
  console.log(JSON.stringify(o));
}
