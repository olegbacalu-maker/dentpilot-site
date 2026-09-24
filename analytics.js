/* Google Analytics — ONLY after the visitor says yes (Legea 195/2024).
   Until "Accept" nothing is fetched from Google and no cookie is set; the
   choice lives in localStorage, not in a cookie.
   GA_ID empty = this file does nothing: no banner, no "Setări cookie" link.
   A banner with no tracker behind it would tell the visitor a lie. */
(function () {
  var GA_ID = 'G-LQ7S2EG89M';
  var KEY = 'dp-consent-v1';
  var ru = (document.documentElement.lang || '').indexOf('ru') === 0;
  var T = ru ? {
    text: 'Мы используем Google Analytics, чтобы видеть, сколько посетителей у сайта и какие страницы они читают. Аналитические cookie ставятся только с вашего согласия.',
    yes: 'Принять', no: 'Отказаться', more: 'Подробнее'
  } : {
    text: 'Folosim Google Analytics ca să vedem câți vizitatori are site-ul și ce pagini citesc. Cookie-urile de analiză se pun doar cu acordul dvs.',
    yes: 'Accept', no: 'Refuz', more: 'Detalii'
  };

  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function put(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  function load() {
    if (window.dpGA) return;
    window.dpGA = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    // privacy.html promises exactly this: no ad signals, cookies <= 13 months
    window.gtag('config', GA_ID, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_expires: 395 * 86400
    });
  }

  // Withdrawal must undo what was set: GA cookies sit on the bare domain
  function wipe() {
    var host = location.hostname, bare = host.replace(/^www\./, '');
    document.cookie.split(';').forEach(function (c) {
      var n = c.split('=')[0].trim();
      if (n.indexOf('_ga') !== 0) return;
      ['', host, '.' + bare].forEach(function (d) {
        document.cookie = n + '=; Max-Age=0; path=/' + (d ? '; domain=' + d : '');
      });
    });
  }

  var box;
  function banner() {
    if (box) { box.hidden = false; return; }
    var css = document.createElement('style');
    css.textContent =
      '.dp-cc{position:fixed;left:16px;right:16px;bottom:16px;z-index:1000;max-width:520px;box-sizing:border-box;background:#FFFFFF;border:1px solid #E6EDEB;border-radius:14px;box-shadow:0 2px 6px rgba(11,43,38,.06),0 24px 60px -16px rgba(11,43,38,.28);padding:18px 20px;font-family:inherit;color:#16232B}' +
      '.dp-cc[hidden]{display:none}' +
      '.dp-cc p{margin:0;font-size:14.5px;line-height:1.55;color:#384850}' +
      '.dp-cc a{color:#0B7F70}' +
      '.dp-cc div{display:flex;gap:10px;margin-top:14px}' +
      // equal size on purpose: saying no must be as easy as saying yes
      '.dp-cc button{flex:1;font:inherit;font-size:15px;font-weight:600;padding:11px 16px;border-radius:10px;cursor:pointer;border:1px solid #0E9F8A}' +
      '.dp-cc button[data-v=denied]{background:#FFFFFF;color:#0B7F70}' +
      '.dp-cc button[data-v=granted]{background:#0E9F8A;color:#FFFFFF}';
    document.head.appendChild(css);
    box = document.createElement('div');
    box.className = 'dp-cc';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Cookie');
    box.innerHTML = '<p>' + T.text + ' <a href="privacy.html#cookie">' + T.more +
      '</a></p><div><button type="button" data-v="denied">' + T.no +
      '</button><button type="button" data-v="granted">' + T.yes + '</button></div>';
    box.addEventListener('click', function (e) {
      var v = e.target.getAttribute && e.target.getAttribute('data-v');
      if (!v) return;
      put(v);
      box.hidden = true;
      if (v === 'granted') load();
      else if (window.dpGA) {
        // switch gtag off FIRST: on unload it rewrites _ga_<ID> (seen 09-24)
        window['ga-disable-' + GA_ID] = true;
        wipe();
        location.reload();
      }
    });
    document.body.appendChild(box);
  }

  if (!GA_ID) return;
  function init() {
    var links = document.querySelectorAll('[data-dp-consent]');
    for (var i = 0; i < links.length; i++) {
      links[i].hidden = false;
      links[i].addEventListener('click', function (e) { e.preventDefault(); banner(); });
    }
    var v = get();
    if (v === 'granted') load();
    else if (v === 'denied') wipe(); // leftovers of an earlier yes, if any
    else banner();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
