// Приём заявок: node --test test/  (из папки forms, без зависимостей).
// Resend подменён: каждый вызов записывается, ответ — из очереди `replies`.
import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { clean } from '../src/worker.js';

const ORIGIN = 'https://dentpilot.md';
const ENV = {
  RESEND_API_KEY: 're_test',
  MAIL_FROM: 'DentPilot <contact@dentpilot.md>',
  REPLY_TO: 'contact@dentpilot.md',
  NOTIFY_TO: 'dentpilotpro@gmail.com',
  ALLOWED_ORIGINS: 'https://dentpilot.md,https://www.dentpilot.md',
};
const GOOD = {
  nume: 'Ion Popescu', clinica: 'Zâmbet Dent', telefon: '+373 69 123 456', email: 'ion@zambet.md', lang: 'ro',
};

let calls;
let replies;
let logs;
const realFetch = globalThis.fetch;
const realLog = console.log;

beforeEach(() => {
  calls = [];
  replies = [];
  logs = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init, body: JSON.parse(init.body) });
    const r = replies.shift() || { status: 200, body: { data: [{ id: 'a' }, { id: 'b' }] } };
    if (r.throw) throw new Error(r.throw);
    return new Response(JSON.stringify(r.body), { status: r.status });
  };
  console.log = (...a) => logs.push(a.join(' '));
});

afterEach(() => {
  globalThis.fetch = realFetch;
  console.log = realLog;
});

function post(fields, { origin = ORIGIN, accept = 'application/json', headers = {}, body } = {}) {
  return new Request('https://forms.dentpilot.md/prezentare', {
    method: 'POST',
    body: body ?? new URLSearchParams(fields),
    headers: { Origin: origin, Accept: accept, ...headers },
  });
}

test('заявка: два письма одним вызовом — Олегу (ответ уходит клиенту) и подтверждение клиенту', async () => {
  const r = await worker.fetch(post(GOOD), ENV);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, confirmed: true });
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.resend.com/emails/batch');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer re_test');
  const [toOleg, toClient] = calls[0].body;
  assert.deepEqual(toOleg.to, ['dentpilotpro@gmail.com']);
  assert.equal(toOleg.reply_to, 'ion@zambet.md');
  assert.equal(toOleg.subject, 'Заявка на презентацию: Zâmbet Dent (Ion Popescu)');
  assert.match(toOleg.text, /Телефон: {2}\+373 69 123 456/);
  assert.match(toOleg.text, /румынская — отвечать по-румынски/);
  assert.match(toOleg.text, /ушло вместе с этим письмом/);
  assert.deepEqual(toClient.to, ['ion@zambet.md']);
  assert.equal(toClient.from, 'DentPilot <contact@dentpilot.md>');
  assert.equal(toClient.reply_to, 'contact@dentpilot.md');
  assert.equal(toClient.subject, 'Am primit cererea dvs. de prezentare DentPilot');
  assert.match(toClient.html, /Bună ziua, Ion Popescu,/);
  assert.match(toClient.text, /o zi lucrătoare la \+373 69 123 456/);
  assert.match(toClient.text, /„Zâmbet Dent”/);
  assert.deepEqual(toClient.tags, [{ name: 'form', value: 'prezentare' }, { name: 'kind', value: 'reply' }]);
});

test('русская страница — русское письмо клиенту, Олегу — пометка языка', async () => {
  const r = await worker.fetch(post({ ...GOOD, lang: 'ru' }), ENV);
  assert.equal(r.status, 200);
  const [toOleg, toClient] = calls[0].body;
  assert.match(toOleg.text, /русская — отвечать по-русски/);
  assert.equal(toClient.subject, 'Мы получили вашу заявку на презентацию DentPilot');
  assert.match(toClient.html, /<html lang="ru">/);
  assert.match(toClient.text, /Здравствуйте, Ion Popescu!/);
  assert.match(toClient.text, /позвоним по номеру \+373 69 123 456/);
});

test('неизвестный язык — румынский: письмо не уходит на языке, которого нет', async () => {
  await worker.fetch(post({ ...GOOD, lang: 'en' }), ENV);
  assert.equal(calls[0].body[1].subject, 'Am primit cererea dvs. de prezentare DentPilot');
});

test('значение поля экранируется в HTML письма, а в тексте остаётся как есть', async () => {
  await worker.fetch(post({ ...GOOD, clinica: 'Dent & Co "Smile"' }), ENV);
  const toClient = calls[0].body[1];
  assert.match(toClient.html, /Dent &amp; Co &quot;Smile&quot;/);
  assert.doesNotMatch(toClient.html, /Dent & Co/);
  assert.match(toClient.text, /Dent & Co "Smile"/);
});

test('негодное поле — отказ с его именем, писем нет', async () => {
  const cases = [
    [{ nume: '' }, 'nume'],
    [{ nume: 'http://spam.example' }, 'nume'],
    [{ nume: '<b>Ion</b>' }, 'nume'],
    [{ nume: 'ion@zambet.md' }, 'nume'],
    [{ clinica: 'Vizitati www.spam.biz' }, 'clinica'],
    [{ clinica: 'x' }, 'clinica'],
    [{ telefon: '12345' }, 'telefon'],
    [{ telefon: '+373 69 123 456 sunati' }, 'telefon'],
    [{ email: 'ion@zambet' }, 'email'],
    [{ email: 'ion zambet.md' }, 'email'],
  ];
  for (const [patch, field] of cases) {
    const r = await worker.fetch(post({ ...GOOD, ...patch }), ENV);
    assert.equal(r.status, 400, JSON.stringify(patch));
    assert.deepEqual(await r.json(), { ok: false, code: 'invalid', field }, JSON.stringify(patch));
  }
  assert.equal(calls.length, 0);
});

test('пробелы в полях схлопываются', () => {
  const { f, field } = clean(new URLSearchParams({ ...GOOD, nume: '  Ion \n  Popescu ' }));
  assert.equal(field, '');
  assert.equal(f.nume, 'Ion Popescu');
});

test('ловушка: заполненное скрытое поле — «принято» без единого письма', async () => {
  const r = await worker.fetch(post({ ...GOOD, website: 'https://spam.example' }), ENV);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, confirmed: true });
  assert.equal(calls.length, 0);
});

test('чужой источник — 403 и без писем; предзапрос своего — разрешён', async () => {
  const r = await worker.fetch(post(GOOD, { origin: 'https://evil.example' }), ENV);
  assert.equal(r.status, 403);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(calls.length, 0);
  const pre = await worker.fetch(new Request('https://forms.dentpilot.md/prezentare',
    { method: 'OPTIONS', headers: { Origin: ORIGIN } }), ENV);
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.match(pre.headers.get('Access-Control-Allow-Methods'), /POST/);
  const bad = await worker.fetch(new Request('https://forms.dentpilot.md/prezentare',
    { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), ENV);
  assert.equal(bad.status, 403);
});

test('Resend не принял пару — заявка Олегу уходит одна, с пометкой; клиенту confirmed:false', async () => {
  replies = [
    { status: 422, body: { name: 'validation_error', message: 'Invalid `to` field.' } },
    { status: 200, body: { id: 'x' } },
  ];
  const r = await worker.fetch(post(GOOD), ENV);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, confirmed: false });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, 'https://api.resend.com/emails');
  assert.deepEqual(calls[1].body.to, ['dentpilotpro@gmail.com']);
  assert.match(calls[1].body.text, /подтверждение клиенту НЕ ушло \(422 validation_error\)/);
});

test('не ушло ничего — 502 send_failed, а не «Mulțumim!»', async () => {
  replies = [{ status: 500, body: {} }, { status: 500, body: {} }];
  const r = await worker.fetch(post(GOOD), ENV);
  assert.equal(r.status, 502);
  assert.deepEqual(await r.json(), { ok: false, code: 'send_failed' });
});

test('сеть до Resend упала — тот же отказ', async () => {
  replies = [{ throw: 'network' }, { throw: 'network' }];
  const r = await worker.fetch(post(GOOD), ENV);
  assert.equal(r.status, 502);
});

test('без ключа Resend — отказ, а не молчаливый успех', async () => {
  const { RESEND_API_KEY, ...noKey } = ENV;
  const r = await worker.fetch(post(GOOD), noKey);
  assert.equal(r.status, 502);
  assert.equal(calls.length, 0);
});

test('лимит с адреса — 429 до всякой отправки', async () => {
  const keys = [];
  const env = { ...ENV, LIMITER: { limit: async ({ key }) => { keys.push(key); return { success: false }; } } };
  const r = await worker.fetch(post(GOOD, { headers: { 'CF-Connecting-IP': '203.0.113.7' } }), env);
  assert.equal(r.status, 429);
  assert.deepEqual(await r.json(), { ok: false, code: 'limited' });
  assert.deepEqual(keys, ['203.0.113.7']);
  assert.equal(calls.length, 0);
});

test('форма без скрипта получает страницу на своём языке, а не JSON', async () => {
  const ok = await worker.fetch(post(GOOD, { accept: 'text/html' }), ENV);
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('Content-Type'), /text\/html/);
  assert.match(await ok.text(), /Mulțumim!/);
  const ru = await worker.fetch(post({ ...GOOD, lang: 'ru' }, { accept: 'text/html' }), ENV);
  assert.match(await ru.text(), /Спасибо!.*[\s\S]*ru\.html#contact/);
  const bad = await worker.fetch(post({ ...GOOD, email: 'x' }, { accept: 'text/html' }), ENV);
  assert.equal(bad.status, 400);
  assert.match(await bad.text(), /Cererea nu a fost trimisă/);
});

test('слишком большое тело — 413 до разбора', async () => {
  const r = await worker.fetch(post(null, { body: new URLSearchParams({ ...GOOD, nume: 'x'.repeat(9000) }) }), ENV);
  assert.equal(r.status, 413);
  assert.equal(calls.length, 0);
});

test('чужой путь — 404, GET — 405, /health отвечает', async () => {
  assert.equal((await worker.fetch(new Request('https://forms.dentpilot.md/x'), ENV)).status, 404);
  assert.equal((await worker.fetch(new Request('https://forms.dentpilot.md/prezentare'), ENV)).status, 405);
  const h = await worker.fetch(new Request('https://forms.dentpilot.md/health'), ENV);
  assert.deepEqual(await h.json(), { ok: true });
});

test('в журнал Workers не попадают имя, телефон и адрес — ни на одном из путей', async () => {
  await worker.fetch(post(GOOD), ENV);                                   // обычный приём
  replies = [{ status: 422, body: { name: 'validation_error' } }, { status: 200, body: { id: 'x' } }];
  await worker.fetch(post(GOOD), ENV);                                   // запасной путь
  await worker.fetch(post({ ...GOOD, website: 'bot' }), ENV);            // ловушка
  assert.equal(logs.length, 3);
  for (const line of logs) {
    for (const v of [GOOD.nume, 'Popescu', GOOD.telefon, '123 456', GOOD.email, 'zambet']) {
      assert.ok(!line.includes(v), `журнал содержит «${v}»: ${line}`);
    }
  }
});

test('канал связи (08.10): WhatsApp/Viber попадает в заявку и в шаг письма; неизвестный — телефон', async () => {
  await worker.fetch(post({ ...GOOD, via: 'whatsapp' }), ENV);
  const [toOleg, toClient] = calls[0].body;
  assert.match(toOleg.text, /Связь: {4}WhatsApp/);
  assert.match(toClient.text, /Vă scriem pe WhatsApp la \+373 69 123 456/);
  assert.match(toClient.html, /Vă scriem pe WhatsApp/);
  await worker.fetch(post({ ...GOOD, via: 'fax', lang: 'ru' }), ENV);
  const [o2, c2] = calls[1].body;
  assert.match(o2.text, /Связь: {4}Telefon/);
  assert.match(c2.text, /позвоним по номеру/);
  const { f } = clean(new URLSearchParams({ ...GOOD, via: 'Viber' }));
  assert.equal(f.via, 'viber');
});

test('e-mail необязателен (08.10): без адреса — одно письмо Олегу, confirmed:false, без Reply-To', async () => {
  const r = await worker.fetch(post({ ...GOOD, email: '', via: 'viber' }), ENV);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, confirmed: false });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  const m = calls[0].body;
  assert.deepEqual(m.to, ['dentpilotpro@gmail.com']);
  assert.equal(m.reply_to, undefined);
  assert.match(m.text, /E-mail: {3}— \(не указан\)/);
  assert.match(m.text, /E-mail клиент не оставил/);
  assert.doesNotMatch(m.text, /«Ответить»/);
  // поле вовсе отсутствует (старая форма) — то же
  const { field } = clean(new URLSearchParams({ nume: GOOD.nume, clinica: GOOD.clinica, telefon: GOOD.telefon }));
  assert.equal(field, '');
});

test('без адреса и Resend отказал — 502, не «Mulțumim!»', async () => {
  replies = [{ status: 500, body: {} }];
  const r = await worker.fetch(post({ ...GOOD, email: '' }), ENV);
  assert.equal(r.status, 502);
  assert.deepEqual(await r.json(), { ok: false, code: 'send_failed' });
  assert.equal(calls.length, 1);
});
