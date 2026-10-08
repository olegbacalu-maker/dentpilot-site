// Письма формы «Solicită o prezentare»: подтверждение клиенту (ro/ru, HTML +
// текст) и заявка Олегу (по-русски, текстом), плюс страница-ответ для формы,
// отправленной без скрипта. Язык — языком страницы, с которой пришла заявка.
//
// ⚠️ Обещание «позвоним в течение рабочего дня» и телефон живут ещё и в
// скрипте страниц (index.html / ru.html): меняются ВМЕСТЕ, иначе письмо и
// экран скажут клиенту разное.

export const PHONE = '+373 60 508 048';
const TEL = '+37360508048';
const SITE = 'https://dentpilot.md';
const LOGO = `${SITE}/mail/logo.png`;
const LEGAL = 'Oleg Bacalu, antreprenor independent · IDNO 1026023148339';
const FONT = "'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
// «Cum vă contactăm?» на сайте (08.10): ключ формы → имя канала в письмах
export const VIA = { telefon: 'Telefon', whatsapp: 'WhatsApp', viber: 'Viber' };

const T = {
  ro: {
    subject: 'Am primit cererea dvs. de prezentare DentPilot',
    preheader: 'Vă sunăm în cel mult o zi lucrătoare, ca să stabilim ora prezentării.',
    hello: (n) => `Bună ziua, ${n},`,
    intro: (c) => `Vă mulțumim pentru interesul față de DentPilot. Am primit cererea de prezentare pentru „${c}”.`,
    next: 'Ce urmează',
    steps: (p, via) => [
      via === 'telefon'
        ? `Vă sunăm în cel mult o zi lucrătoare la ${p}, ca să stabilim ora potrivită.`
        : `Vă scriem pe ${VIA[via]} la ${p} în cel mult o zi lucrătoare, ca să stabilim ora potrivită.`,
      'Prezentarea durează circa 15 minute: vedeți programul pe ecranul dvs. — programările, fișa pacientului '
        + 'cu odontograma, fișa 043/e și statisticile.',
      'Răspundem la întrebările despre instalare, preț și Legea 195/2024. Prezentarea este gratuită și nu vă '
        + 'obligă la nimic.',
    ],
    data: 'Datele cererii',
    labels: ['Nume', 'Clinica', 'Telefon', 'E-mail'],
    more: `Dacă doriți să adăugați ceva sau preferați o anumită oră, răspundeți la acest e-mail sau sunați-ne la ${PHONE}.`,
    regards: 'Cu stimă,',
    tagline: 'DentPilot — program pentru clinici stomatologice',
    footer: 'Ați primit acest e-mail pentru că adresa dvs. a fost introdusă în formularul de pe dentpilot.md. '
      + 'Dacă nu ați trimis dvs. cererea, ignorați mesajul — nu vă vom mai scrie.',
    privacy: 'Politica de confidențialitate',
    okTitle: 'Mulțumim!',
    okText: 'Am primit cererea. Vă sunăm în cel mult o zi lucrătoare, ca să stabilim ora prezentării.',
    failTitle: 'Cererea nu a fost trimisă',
    failText: `Verificați datele din formular sau sunați-ne: ${PHONE}.`,
    back: 'Înapoi la dentpilot.md',
    home: `${SITE}/#contact`,
  },
  ru: {
    subject: 'Мы получили вашу заявку на презентацию DentPilot',
    preheader: 'Позвоним в течение рабочего дня, чтобы договориться о времени презентации.',
    hello: (n) => `Здравствуйте, ${n}!`,
    intro: (c) => `Спасибо за интерес к DentPilot. Мы получили заявку на презентацию для «${c}».`,
    next: 'Что дальше',
    steps: (p, via) => [
      via === 'telefon'
        ? `В течение рабочего дня позвоним по номеру ${p}, чтобы договориться об удобном времени.`
        : `В течение рабочего дня напишем вам в ${VIA[via]} на номер ${p}, чтобы договориться об удобном времени.`,
      'Презентация занимает около 15 минут: вы видите программу на своём экране — расписание, карту пациента '
        + 'с одонтограммой, форму 043/e и статистику.',
      'Ответим на вопросы об установке, цене и Законе 195/2024. Презентация бесплатная и ни к чему не обязывает.',
    ],
    data: 'Данные заявки',
    labels: ['Имя', 'Клиника', 'Телефон', 'E-mail'],
    more: `Если хотите что-то добавить или вам удобно конкретное время — ответьте на это письмо или позвоните: ${PHONE}.`,
    regards: 'С уважением,',
    tagline: 'DentPilot — программа для стоматологических клиник',
    footer: 'Вы получили это письмо, потому что ваш адрес указали в форме на dentpilot.md. '
      + 'Если заявку отправляли не вы, просто проигнорируйте письмо — больше писать не будем.',
    privacy: 'Политика конфиденциальности',
    okTitle: 'Спасибо!',
    okText: 'Заявка получена. В течение рабочего дня позвоним, чтобы договориться о времени презентации.',
    failTitle: 'Заявка не отправлена',
    failText: `Проверьте данные в форме или позвоните нам: ${PHONE}.`,
    back: 'Вернуться на dentpilot.md',
    home: `${SITE}/ru.html#contact`,
  },
};

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Подтверждение клиенту: письмо на адрес из формы, языком страницы. */
export function autoReply(f, lang) {
  const t = T[lang] || T.ro;
  const steps = t.steps(f.telefon, f.via || 'telefon');
  const values = [f.nume, f.clinica, f.telefon, f.email];
  const text = [
    t.hello(f.nume),
    '',
    t.intro(f.clinica),
    '',
    `${t.next}:`,
    ...steps.map((s, i) => `${i + 1}. ${s}`),
    '',
    `${t.data}:`,
    ...t.labels.map((l, i) => `  ${l}: ${values[i]}`),
    '',
    t.more,
    '',
    t.regards,
    'Oleg Bacalu',
    t.tagline,
    `${PHONE} · ${SITE}`,
    '',
    '--',
    t.footer,
    `${t.privacy}: ${SITE}/privacy.html`,
    LEGAL,
  ].join('\n');
  return { kind: 'reply', to: f.email, subject: t.subject, text, html: replyHtml(t, lang, f, steps, values) };
}

function replyHtml(t, lang, f, steps, values) {
  const p = (s, extra = '') => `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.6;color:#16232B;${extra}">${s}</p>`;
  const stepRows = steps.map((s, i) => `
          <tr>
            <td width="26" valign="top" style="padding:0 12px 12px 0;">
              <div style="width:24px;height:24px;border-radius:7px;background:#E9F6F3;color:#0B7F70;font-family:${FONT};font-size:13px;font-weight:700;line-height:24px;text-align:center;">${i + 1}</div>
            </td>
            <td valign="top" style="padding:0 0 12px;font-family:${FONT};font-size:15px;line-height:1.55;color:#384850;">${esc(s)}</td>
          </tr>`).join('');
  const dataRows = t.labels.map((l, i) => `
            <tr>
              <td style="padding:4px 14px 4px 0;font-family:${FONT};font-size:13px;color:#7C8B91;white-space:nowrap;">${esc(l)}</td>
              <td style="padding:4px 0;font-family:${FONT};font-size:14.5px;color:#16232B;">${esc(values[i])}</td>
            </tr>`).join('');
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<title>${esc(t.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#F6F9F8;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(t.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F6F9F8" style="background:#F6F9F8;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="max-width:560px;background:#FFFFFF;border:1px solid #E6EDEB;border-radius:14px;">
        <tr>
          <td style="padding:22px 32px;border-bottom:1px solid #E6EDEB;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="28" height="28" bgcolor="#0E9F8A" align="center" valign="middle" style="width:28px;height:28px;background:#0E9F8A;border-radius:8px;"><img src="${LOGO}" width="28" height="28" alt="" style="display:block;border:0;width:28px;height:28px;border-radius:8px;"></td>
                <td style="padding-left:10px;font-family:${FONT};font-size:17px;font-weight:700;letter-spacing:-0.02em;color:#16232B;">DentPilot</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px 12px;">
            ${p(esc(t.hello(f.nume)))}
            ${p(esc(t.intro(f.clinica)))}
            <p style="margin:24px 0 12px;font-family:${FONT};font-size:12.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#0B7F70;">${esc(t.next)}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${stepRows}
            </table>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F6F9F8" style="margin:12px 0 22px;background:#F6F9F8;border-radius:10px;">
              <tr>
                <td style="padding:14px 18px;">
                  <p style="margin:0 0 6px;font-family:${FONT};font-size:12.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#7C8B91;">${esc(t.data)}</p>
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">${dataRows}
                  </table>
                </td>
              </tr>
            </table>
            ${p(esc(t.more))}
            ${p(`${esc(t.regards)}<br><b>Oleg Bacalu</b><br><span style="color:#5B6B72;">${esc(t.tagline)}</span><br><a href="tel:${TEL}" style="color:#0B7F70;text-decoration:none;">${PHONE}</a> · <a href="${SITE}" style="color:#0B7F70;text-decoration:none;">dentpilot.md</a>`, 'margin-top:24px;')}
          </td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
        <tr>
          <td style="padding:18px 32px 0;font-family:${FONT};font-size:12.5px;line-height:1.55;color:#7C8B91;">
            ${esc(t.footer)}<br>
            <a href="${SITE}/privacy.html" style="color:#5B6B72;">${esc(t.privacy)}</a> · ${esc(LEGAL)}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
`;
}

/** Заявка Олегу: по-русски, текстом; «Ответить» уходит клиенту. */
export function notice(f, lang, { country = '', replyFailed = '' } = {}) {
  const lines = [
    'Новая заявка на презентацию с dentpilot.md.',
    '',
    `  Имя:      ${f.nume}`,
    `  Клиника:  ${f.clinica}`,
    `  Телефон:  ${f.telefon}`,
    `  Связь:    ${VIA[f.via] || 'Telefon'}`,
    `  E-mail:   ${f.email || '— (не указан)'}`,
    '',
    lang === 'ru' ? 'Страница: русская — отвечать по-русски.' : 'Страница: румынская — отвечать по-румынски.',
    !f.email
      ? 'E-mail клиент не оставил: подтверждения нет, связь — по телефону/мессенджеру выше.'
      : replyFailed
        ? `ВНИМАНИЕ: подтверждение клиенту НЕ ушло (${replyFailed}). Проверь адрес и ответь клиенту сам.`
        : 'Подтверждение клиенту ушло вместе с этим письмом.',
  ];
  if (f.email) lines.push('«Ответить» на это письмо — ответ уйдёт клиенту.');
  if (country) lines.push(`Страна по IP: ${country}`);
  return {
    kind: 'notice',
    subject: `Заявка на презентацию: ${f.clinica} (${f.nume})`,
    text: lines.join('\n'),
    replyTo: f.email || undefined,
  };
}

/** Ответ форме, отправленной без скрипта: короткая страница со ссылкой назад. */
export function resultPage(lang, body) {
  const t = T[lang] || T.ro;
  const title = body.ok ? t.okTitle : t.failTitle;
  const text = body.ok ? t.okText : t.failText;
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)} — DentPilot</title>
<style>
body{margin:0;background:#F6F9F8;color:#16232B;font-family:${FONT}}
main{max-width:520px;margin:12vh auto 0;padding:32px;background:#FFFFFF;border:1px solid #E6EDEB;border-radius:16px}
h1{margin:0 0 12px;font-size:24px;letter-spacing:-0.02em}
p{margin:0 0 20px;font-size:16px;line-height:1.6;color:#384850}
a{color:#0B7F70;font-weight:600;text-decoration:none}
</style>
</head>
<body>
<main>
<h1>${esc(title)}</h1>
<p>${esc(text)}</p>
<a href="${t.home}">${esc(t.back)}</a>
</main>
</body>
</html>
`;
}
