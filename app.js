/* DziuraŁódź – logika aplikacji. Wszystko działa w przeglądarce; nic nie jest wysyłane na serwer. */
(() => {
  'use strict';

  const CFG = Object.assign({
    paymentUrl: '', paymentReturnsToSite: true, price: '9,99 zł', tipUrl: '',
    sellerName: '', sellerEmail: '', adContactEmail: '', adContactPhone: '', partners: []
  }, window.SITE_CONFIG || {});

  // ── Dane domenowe (stan na 10.2026, źródła: uml.lodz.pl, procedura KA-01544, GDDKiA) ──
  const ZDIT = {
    name: 'Zarząd Dróg i Transportu w Łodzi',
    lines: ['ul. Tuwima 36', '90-002 Łódź'],
    email: 'zdit@zdit.uml.lodz.pl',
    phone: '42 638-58-68',
    online: 'https://zdlodz.zglos.online/'
  };
  const GDDKIA = {
    name: 'Generalna Dyrekcja Dróg Krajowych i Autostrad – Oddział w Łodzi',
    lines: ['ul. Irysowa 2', '91-857 Łódź'],
    phone: '42 233 96 00'
  };
  const PZU = { name: 'PZU S.A.', policy: '1077814389', from: 2023, to: 2026 };
  const HIGHWAY_RE = /\b(?:A ?1|A ?2|S ?8|S ?14)\b|autostrad|ekspresow/i;
  const OUTSIDE_RE = /\b(?:Zgierz|Pabianic|Konstantyn[oó]w|Aleksandr[oó]w|Rzg[oó]w|Ksawer[oó]w|Stryk[oó]w|Andrespol|Tuszyn|Brójce)/i;
  const PARTS = ['Opona', 'Felga aluminiowa', 'Felga stalowa', 'Kołpak', 'Wahacz', 'Amortyzator', 'Drążek / końcówka drążka', 'Łożysko / piasta', 'Geometria zawieszenia', 'Montaż i wyważenie kół', 'Holowanie / pomoc drogowa', 'Inne'];

  const KEY = 'dziuralodz.v1';
  const PAID_KEY = 'dziuralodz.paid';
  const photoKey = n => 'dziuralodz.photo' + n;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const has = v => v !== undefined && v !== null && String(v).trim() !== '';
  const PLN = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' });
  const money = v => PLN.format(v || 0);
  const fmtDate = s => { if (!s) return ''; const [y, m, d] = s.split('-'); return `${d}.${m}.${y}`; };
  const pad = n => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

  const store = {
    get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); return true; } catch { return false; } },
    del(k) { try { sessionStorage.removeItem(k); } catch { /* brak dostępu */ } }
  };

  // ── Stan ──
  const state = { step: 1, items: [{ part: 'Opona', desc: '', amount: '' }] };
  const photos = { 1: null, 2: null, 3: null };

  function load() {
    try { Object.assign(state, JSON.parse(store.get(KEY) || '{}')); } catch { /* uszkodzony zapis */ }
    for (const n of [1, 2, 3]) {
      try { photos[n] = JSON.parse(store.get(photoKey(n)) || 'null'); } catch { photos[n] = null; }
    }
  }
  let saveTimer;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => store.set(KEY, JSON.stringify(state)), 250);
  }
  function saveNow() { clearTimeout(saveTimer); store.set(KEY, JSON.stringify(state)); }

  // ── Walidatory ──
  const V = {
    pesel(s) {
      if (!/^\d{11}$/.test(s)) return false;
      const w = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
      const sum = w.reduce((a, x, i) => a + x * +s[i], 0);
      return (10 - (sum % 10)) % 10 === +s[10];
    },
    nip(s) {
      if (!/^\d{10}$/.test(s)) return false;
      const w = [6, 5, 7, 2, 3, 4, 5, 6, 7];
      const c = w.reduce((a, x, i) => a + x * +s[i], 0) % 11;
      return c !== 10 && c === +s[9];
    },
    peselnip(v) {
      const s = v.replace(/[\s-]/g, '');
      if (s.length === 11) return V.pesel(s) || 'Nieprawidłowy PESEL (błędna suma kontrolna).';
      if (s.length === 10) return V.nip(s) || 'Nieprawidłowy NIP (błędna suma kontrolna).';
      return 'Wpisz 11 cyfr PESEL albo 10 cyfr NIP.';
    },
    iban(v) {
      let s = v.replace(/\s/g, '').toUpperCase();
      if (/^\d{26}$/.test(s)) s = 'PL' + s;
      if (!/^PL\d{26}$/.test(s)) return 'Numer rachunku powinien mieć 26 cyfr.';
      const r = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, c => c.charCodeAt(0) - 55);
      let m = 0;
      for (const ch of r) m = (m * 10 + +ch) % 97;
      return m === 1 || 'Nieprawidłowy numer rachunku – sprawdź cyfry.';
    },
    vin(v) { return /^[A-HJ-NPR-Z0-9]{17}$/.test(v.toUpperCase()) || 'VIN ma 17 znaków (bez liter I, O, Q).'; },
    plate(v) { const s = v.toUpperCase().replace(/\s+/g, ''); return (/^[A-Z][A-Z0-9]{3,7}$/.test(s) && /\d/.test(s)) || 'Sprawdź numer rejestracyjny.'; },
    pastdate(v) { return v <= today() || 'Data zdarzenia nie może być z przyszłości.'; }
  };
  const formatIban = v => {
    const s = v.replace(/\s/g, '').toUpperCase().replace(/^PL/, '');
    return 'PL ' + s.replace(/(.{2})(.{0,})/, '$1 $2').replace(/(\d{4})(?=\d)/g, '$1 ').trim();
  };

  // ── Wiązanie pól formularza ze stanem (data-k) ──
  function readInput(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'radio') return el.checked ? el.value : undefined;
    return el.value;
  }
  function writeInput(el, v) {
    if (el.type === 'checkbox') el.checked = !!v;
    else if (el.type === 'radio') el.checked = el.value === v;
    else if (v !== undefined && v !== null) el.value = v;
  }
  function bindInputs() {
    $$('[data-k]').forEach(el => {
      const k = el.dataset.k;
      if (k in state) writeInput(el, state[k]);
      else if (el.type !== 'radio') state[k] = readInput(el);
      const evt = (el.type === 'checkbox' || el.type === 'radio' || el.tagName === 'SELECT') ? 'change' : 'input';
      el.addEventListener(evt, () => {
        if (el.type === 'radio' && !el.checked) return;
        if (k === 'plate' || k === 'vin') {
          const pos = el.selectionStart;
          el.value = el.value.toUpperCase();
          try { el.setSelectionRange(pos, pos); } catch { /* typ pola bez zaznaczenia */ }
        }
        state[k] = readInput(el);
        $$(`[data-k="${k}"]`).forEach(o => { if (o !== el) writeInput(o, state[k]); });
        el.removeAttribute('aria-invalid');
        render();
        save();
      });
      if (el.dataset.validate === 'iban') el.addEventListener('blur', () => {
        if (has(el.value) && V.iban(el.value) === true) { el.value = formatIban(el.value); state.iban = el.value; save(); }
      });
    });
  }

  // ── UI pomocnicze ──
  let toastTimer;
  function toast(msg, ms = 3500) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
  }
  const box = (tone, html) => {
    const tones = {
      ok: 'border-emerald-200 bg-emerald-50 text-emerald-900',
      warn: 'border-amber-300 bg-amber-50 text-amber-950',
      bad: 'border-red-200 bg-red-50 text-red-900',
      info: 'border-sky-200 bg-sky-50 text-sky-950'
    };
    return `<div class="rounded-xl border p-4 text-sm leading-relaxed ${tones[tone]}">${html}</div>`;
  };
  const toggle = (sel, show) => $(sel).classList.toggle('hidden', !show);

  // ── Logika: zarządca, ubezpieczyciel, przedawnienie ──
  function addressee() {
    return (state.road_type === 'gddkia' || HIGHWAY_RE.test(state.street || '')) ? 'gddkia' : 'zdit';
  }
  function insurerFor(date) {
    if (!date) return null;
    const y = +date.slice(0, 4);
    if (y >= PZU.from && y <= PZU.to) return { known: true, text: `${PZU.name}, polisa OC Miasta Łodzi nr ${PZU.policy}` };
    if (y === 2022) return { known: false, text: 'TUW PZUW (szkody z 2022 r.) – numer polisy potwierdź w ZDiT' };
    if (y < 2022) return { known: false, text: 'ubezpieczyciela Miasta dla tego roku potwierdź w ZDiT' };
    return { known: false, text: 'brak opublikowanych danych o ubezpieczycielu na ten rok – ZDiT przekaże zgłoszenie właściwemu ubezpieczycielowi' };
  }
  function limitationDate(date) {
    const d = new Date(date + 'T12:00:00');
    d.setFullYear(d.getFullYear() + 3);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  const streetFull = () => { const s = String(state.street || '').trim(); return !s ? '…' : /^(ul|al|pl|os|aleja|plac|rondo|skwer|trasa)\b/i.test(s) ? s : `ul. ${s}`; };
  const driverName = () => state.driver_same ? state.owner_name : state.driver_name;
  const itemsTotal = () => (state.items || []).reduce((a, it) => a + num(it.amount), 0);
  const vehicle = () => [state.make, state.model].filter(has).join(' ');

  // ── Renderowanie ──
  function renderPartners() {
    const el = $('#partners');
    const partners = (CFG.partners || []).filter(p => p && p.name);
    if (!partners.length && !CFG.adContactEmail && !CFG.adContactPhone) return;
    let html = '<div class="rounded-2xl border border-amber-300 bg-amber-50 p-4"><div class="mb-2 flex items-center justify-between gap-2"><p class="text-xs font-bold uppercase tracking-wider text-amber-800">Partner lokalny w Łodzi</p><span class="pill bg-amber-200 text-amber-900">Reklama</span></div><div class="grid gap-3 sm:grid-cols-2">';
    for (const p of partners) {
      const tel = p.phone ? `<a class="btn-dark mt-2 w-full text-sm" href="tel:${esc(p.phone.replace(/[^\d+]/g, ''))}">📞 Zadzwoń: ${esc(p.phone)}</a>` : '';
      const url = p.url ? `<a class="mt-1 block text-center text-sm font-semibold text-amber-800 underline" href="${esc(p.url)}" rel="sponsored noopener" target="_blank">Strona partnera</a>` : '';
      html += `<div class="rounded-xl bg-white p-3 shadow-sm"><p class="font-extrabold">${esc(p.name)}</p>${p.text ? `<p class="mt-0.5 text-sm text-slate-600">${esc(p.text)}</p>` : ''}${tel}${url}</div>`;
    }
    if (!partners.length) {
      html += '<div class="rounded-xl bg-white p-3 shadow-sm sm:col-span-2"><p class="font-extrabold">Całodobowa wulkanizacja, prostowanie felg, pomoc drogowa w Łodzi?</p><p class="mt-0.5 text-sm text-slate-600">To miejsce widzą kierowcy, którzy właśnie uszkodzili koło na łódzkiej dziurze.</p></div>';
    }
    html += '</div>';
    const adLinks = [];
    if (CFG.adContactPhone) {
      const digits = CFG.adContactPhone.replace(/[^\d]/g, '');
      const msg = encodeURIComponent('Dzień dobry, chcę zarezerwować reklamę na stronie DziuraŁódź.');
      adLinks.push(`<a class="font-bold underline" href="https://wa.me/${digits}?text=${msg}" target="_blank" rel="noopener">WhatsApp</a>`, `<a class="font-bold underline" href="sms:+${digits}?body=${msg}">SMS ${esc(CFG.adContactPhone)}</a>`);
    }
    if (CFG.adContactEmail) adLinks.push(`<a class="font-bold underline" href="mailto:${esc(CFG.adContactEmail)}?subject=${encodeURIComponent('Reklama na stronie DziuraŁódź')}">e-mail</a>`);
    if (adLinks.length) html += `<p class="mt-2 text-xs text-amber-900">Masz warsztat, wulkanizację lub pomoc drogową w Łodzi? Zarezerwuj to miejsce: ${adLinks.join(' · ')} (preferowany kontakt pisemny)</p>`;
    html += '</div>';
    el.innerHTML = html;
    el.classList.remove('hidden');
  }

  function renderJuris() {
    const el = $('#juris-result');
    const t = state.road_type;
    if (!t) { el.innerHTML = ''; return; }
    const map = {
      city: box('ok', `<b>Zgłaszasz do ZDiT.</b> ${ZDIT.name}, ${ZDIT.lines.join(', ')}, e-mail <a class="underline font-semibold" href="mailto:${ZDIT.email}">${ZDIT.email}</a>, tel. ${ZDIT.phone}. Szkody z lat 2023–2026 obejmuje polisa OC Miasta Łodzi w ${PZU.name} nr <b>${PZU.policy}</b>. <a href="#kreator" class="font-bold underline">Przejdź do kreatora →</a>`),
      gddkia: box('warn', `<b>To nie jest droga ZDiT.</b> Autostradami i drogami ekspresowymi zarządza GDDKiA (z wyjątkiem odcinków koncesyjnych). W rejonie Łodzi: ${GDDKIA.name}, ${GDDKIA.lines.join(', ')}, tel. ${GDDKIA.phone}. Kreator zaadresuje pismo do GDDKiA zamiast do ZDiT – polisa Miasta Łodzi nie ma tu zastosowania.`),
      outside: box('warn', '<b>Poza Łodzią zarządca zależy od kategorii drogi</b> (art. 19 ust. 2 ustawy o drogach publicznych): droga krajowa – GDDKiA (w woj. łódzkim: Oddział w Łodzi), droga wojewódzka – Zarząd Dróg Wojewódzkich w Łodzi, droga powiatowa – zarząd dróg danego powiatu, droga gminna – urząd gminy lub miasta. Ustal zarządcę, zanim wyślesz pismo – to zgłoszenie jest przygotowane dla dróg w Łodzi.'),
      internal: box('bad', '<b>Drogi wewnętrzne nie są drogami publicznymi</b> – ZDiT za nie nie odpowiada. Roszczenie kieruj do właściciela lub zarządcy terenu (np. spółdzielni mieszkaniowej, właściciela parkingu) i jego ubezpieczyciela OC.')
    };
    el.innerHTML = map[t] || '';
  }

  function renderCalc() {
    const cost = num(state.calc_cost), prem = num(state.calc_premium), loss = num(state.calc_loss),
      yrs = num(state.calc_years), ded = num(state.calc_deductible);
    const el = $('#calc-result');
    if (!cost) { el.innerHTML = box('info', 'Wpisz koszt naprawy, aby zobaczyć porównanie.'); return; }
    const extra = prem * loss / 100 * yrs;
    const acPayout = Math.max(0, cost - ded);
    const acNet = acPayout - extra;
    const saved = cost - acNet;
    el.innerHTML = `
      <div class="grid gap-3 sm:grid-cols-2">
        <div class="rounded-xl border border-slate-200 p-4">
          <p class="text-xs font-bold uppercase tracking-wider text-slate-500">Z własnego AC</p>
          <p class="mt-1 text-sm">Wypłata: <b>${money(acPayout)}</b>${ded ? ` (po udziale własnym ${money(ded)})` : ''}</p>
          <p class="text-sm">Wyższa składka: <b>− ${money(extra)}</b>${yrs ? ` przez ${yrs} ${yrs === 1 ? 'rok' : (yrs < 5 ? 'lata' : 'lat')}` : ''}</p>
          <p class="mt-2 text-lg font-black ${acNet > 0 ? 'text-slate-900' : 'text-red-600'}">Realnie zostaje: ${money(acNet)}</p>
        </div>
        <div class="rounded-xl border-2 border-emerald-400 bg-emerald-50 p-4">
          <p class="text-xs font-bold uppercase tracking-wider text-emerald-800">Z OC Miasta (ZDiT → ${PZU.name})</p>
          <p class="mt-1 text-sm">Wypłata do: <b>${money(cost)}</b>, jeśli ubezpieczyciel uzna odpowiedzialność Miasta.</p>
          <p class="text-sm">Wpływ na Twoje zniżki w AC: <b>brak</b> – to nie jest szkoda z Twojej polisy.</p>
          <p class="mt-2 text-lg font-black text-emerald-800">Różnica na Twoją korzyść: ${money(saved)}</p>
        </div>
      </div>
      ${acNet <= 0 ? `<div class="mt-3">${box('bad', '<b>Zgłoszenie z własnego AC się nie opłaca</b> – udział własny i wyższa składka zjadają całą wypłatę.')}</div>` : ''}
      <p class="hint mt-2">Odszkodowanie z OC Miasta może zostać obniżone, jeśli ubezpieczyciel uzna, że kierowca przyczynił się do szkody (art. 362 KC), np. przekraczając prędkość.</p>`;
  }

  function scoreItems() {
    const days = state.date ? Math.round((new Date(today()) - new Date(state.date)) / 864e5) : null;
    return [
      ['Zdjęcie nr 1 – bezpośrednia przyczyna szkody', 15, !!photos[1]],
      ['Zdjęcie nr 2 – lokalizacja na tle otoczenia', 15, !!photos[2]],
      ['Zdjęcie nr 3 – pojazd z tablicą rejestracyjną', 15, !!photos[3]],
      ['Notatka Policji / Straży Miejskiej', 15, !!state.police],
      ['Świadek zdarzenia', 10, !!state.witness && has(state.w_name)],
      ['Ubytek nie był oznakowany', 10, state.signs === 'brak'],
      ['Prędkość nie większa niż dozwolona', 10, has(state.speed) && has(state.limit) && num(state.speed) <= num(state.limit)],
      ['Zmierzone wymiary dziury', 5, has(state.pot_l) && has(state.pot_w) && has(state.pot_d)],
      ['Szybkie zgłoszenie (do 7 dni od zdarzenia)', 5, days !== null && days >= 0 && days <= 7]
    ];
  }
  function renderScore() {
    const items = scoreItems();
    const score = items.reduce((a, [, w, ok]) => a + (ok ? w : 0), 0);
    const color = score >= 75 ? 'bg-emerald-500' : score >= 45 ? 'bg-amber-500' : 'bg-red-500';
    const missing = items.filter(i => !i[2]);
    $('#score-box').innerHTML = `
      <div class="rounded-xl bg-slate-900 p-4 text-white">
        <div class="flex items-end justify-between gap-3"><p class="font-bold">Siła Twojej dokumentacji</p><p class="text-3xl font-black">${score}<span class="text-base text-slate-400">/100</span></p></div>
        <div class="mt-2 h-3 overflow-hidden rounded-full bg-slate-700" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${score}"><div class="h-full ${color}" style="width:${score}%"></div></div>
        ${missing.length ? `<p class="mt-3 text-sm text-slate-300">Możesz wzmocnić zgłoszenie:</p><ul class="mt-1 space-y-0.5 text-sm">${missing.map(([t, w]) => `<li>＋${w} · ${esc(t)}</li>`).join('')}</ul>` : '<p class="mt-3 text-sm text-emerald-300">Masz komplet dowodów.</p>'}
        <p class="mt-3 text-xs text-slate-400">Wskaźnik orientacyjny: pokazuje kompletność dowodów, a nie prognozę decyzji ubezpieczyciela.</p>
      </div>`;
  }

  function renderInsurer() {
    const el = $('#insurer-box');
    if (!state.date) { el.innerHTML = ''; return; }
    if (V.pastdate(state.date) !== true) { el.innerHTML = box('bad', 'Data zdarzenia nie może być z przyszłości.'); return; }
    const ins = insurerFor(state.date);
    const lim = limitationDate(state.date);
    let html = addressee() === 'gddkia'
      ? box('warn', `Droga zarządzana przez GDDKiA – pismo zostanie zaadresowane do: ${GDDKIA.name}, ${GDDKIA.lines.join(', ')}.`)
      : box(ins.known ? 'ok' : 'warn', `Ubezpieczyciel dla tej daty: <b>${esc(ins.text)}</b>.`);
    if (lim < today()) html += `<div class="mt-2">${box('bad', `Od zdarzenia minęły ponad 3 lata (termin minął ${fmtDate(lim)}) – roszczenie może być przedawnione (art. 442¹ § 1 KC).`)}</div>`;
    el.innerHTML = html;
  }

  function renderStreetAlert() {
    const s = state.street || '';
    const el = $('#street-alert');
    if (HIGHWAY_RE.test(s)) el.innerHTML = box('warn', `Wygląda na autostradę lub drogę ekspresową – zarządcą jest GDDKiA, nie ZDiT. Pismo zostanie zaadresowane do ${GDDKIA.name}.`);
    else if (OUTSIDE_RE.test(s)) el.innerHTML = box('warn', 'Ta miejscowość leży poza Łodzią – ZDiT zarządza tylko drogami w granicach miasta. Sprawdź zarządcę w sekcji „Kto odpowiada za tę drogę?”.');
    else el.innerHTML = '';
  }

  function renderItems() {
    const body = $('#items-body');
    const focused = document.activeElement;
    const focusKey = focused && focused.closest('#items-body') ? [focused.dataset.i, focused.dataset.f] : null;
    body.innerHTML = (state.items || []).map((it, i) => `
      <tr class="align-top">
        <td class="py-1 pr-2"><select class="inp py-2 text-sm" data-i="${i}" data-f="part" aria-label="Część">${PARTS.map(p => `<option${p === it.part ? ' selected' : ''}>${p}</option>`).join('')}</select></td>
        <td class="py-1 pr-2"><input class="inp py-2 text-sm" data-i="${i}" data-f="desc" value="${esc(it.desc)}" placeholder="np. 17&quot;, przód lewy" aria-label="Opis"></td>
        <td class="py-1 pr-2"><input class="inp py-2 text-sm" type="number" inputmode="decimal" min="0" step="0.01" data-i="${i}" data-f="amount" value="${esc(it.amount)}" aria-label="Kwota w zł"></td>
        <td class="py-1"><button type="button" class="rounded-lg px-2 py-2 text-lg text-slate-400 hover:text-red-600" data-del="${i}" aria-label="Usuń pozycję">×</button></td>
      </tr>`).join('');
    if (focusKey) $(`#items-body [data-i="${focusKey[0]}"][data-f="${focusKey[1]}"]`)?.focus();
    $('#items-total').textContent = money(itemsTotal());
  }

  function renderVisibility() {
    toggle('#driver-box', !state.driver_same);
    toggle('#police-box', !!state.police);
    toggle('#witness-box', !!state.witness);
  }

  function render() {
    renderVisibility();
    renderJuris();
    renderCalc();
    renderScore();
    renderInsurer();
    renderStreetAlert();
    $('#items-total').textContent = money(itemsTotal());
    if (state.step === 6) renderSummary();
  }

  // ── Generatory tekstu ──
  function genDescription() {
    const dims = [state.pot_l, state.pot_w].every(has) ? `o wymiarach ok. ${state.pot_l} × ${state.pot_w} cm` : '';
    const depth = has(state.pot_d) ? ` i głębokości ok. ${state.pot_d} cm` : '';
    const signs = { brak: ' Ubytek nie był oznakowany znakami ostrzegawczymi ani wygrodzony.', bylo: ' Ubytek był oznakowany.', nie_wiem: '' }[state.signs || 'brak'];
    const evidence = ['zdjęciami', state.police ? 'notatką służb' : '', state.witness ? 'oświadczeniem świadka' : ''].filter(Boolean).join(', ');
    return `W dniu ${fmtDate(state.date) || '…'} około godz. ${state.time || '…'} pojazd ${vehicle() || '…'} o nr rej. ${(state.plate || '…').toUpperCase()}, `
      + `poruszając się ${streetFull()} w Łodzi${has(state.direction) ? ` (kierunek: ${state.direction})` : ''} `
      + `z prędkością ok. ${state.speed || '…'} km/h (dozwolona: ${state.limit || '…'} km/h), w okolicy ${state.building || '…'} najechał kołem na ubytek w nawierzchni jezdni`
      + `${dims ? ' ' + dims : ''}${depth}.${signs} Warunki: ${state.weather || 'sucha nawierzchnia'}, ${state.light || 'dzień'}. `
      + `W wyniku najechania na ubytek uszkodzeniu uległy elementy pojazdu wymienione w części VI zgłoszenia. Zdarzenie zostało udokumentowane ${evidence}.`;
  }

  function genWitness() {
    const k = state.w_gender === 'k';
    const f = (m, w) => k ? w : m;
    const role = { pasazer: 'pasażerem tego pojazdu', kierowca: 'kierowcą innego pojazdu jadącego w pobliżu', pieszy: 'pieszym przebywającym w pobliżu miejsca zdarzenia', inny: 'osobą obecną na miejscu zdarzenia' }[state.w_role || 'pasazer'];
    const parts = (state.items || []).filter(i => num(i.amount) > 0 || has(i.desc)).map(i => i.part.toLowerCase());
    const lines = [
      `Ja, ${f('niżej podpisany', 'niżej podpisana')} ${state.w_name || '…'}, zam. ${state.w_address || '…'}, oświadczam, że w dniu ${fmtDate(state.date) || '…'} około godz. ${state.time || '…'} w Łodzi, ${streetFull()} (${state.building || '…'}), ${f('byłem', 'byłam')} świadkiem zdarzenia z udziałem pojazdu ${vehicle() || '…'} o nr rej. ${(state.plate || '…').toUpperCase()}, którym kierował(a) ${driverName() || '…'}. W chwili zdarzenia ${f('byłem', 'byłam')} ${role}.`
    ];
    if (state.w_saw_hit) lines.push(`${f('Widziałem', 'Widziałam')}, jak pojazd najechał kołem na ubytek (dziurę) w nawierzchni jezdni.`);
    if (state.w_saw_sound) lines.push(`${f('Słyszałem', 'Słyszałam')} wyraźne uderzenie koła o krawędź ubytku.`);
    if (state.w_saw_damage) lines.push(`Bezpośrednio po zdarzeniu ${f('widziałem', 'widziałam')} uszkodzenia pojazdu${parts.length ? ` (${[...new Set(parts)].join(', ')})` : ''}.`);
    if (state.w_saw_nosign) lines.push('Ubytek nie był w żaden sposób oznakowany ani wygrodzony.');
    if (state.w_saw_speed) lines.push('Pojazd poruszał się z prędkością nie większą niż dozwolona w tym miejscu.');
    lines.push('Oświadczam, że powyższe informacje są zgodne z prawdą.');
    return lines.join(' ');
  }

  // ── Kreator (kroki) ──
  const STEPS = 6;
  function renderProgress() {
    $('#wiz-progress').innerHTML = $$('.wiz-step').map(fs => {
      const n = +fs.dataset.step;
      const cls = n < state.step ? 'bg-amber-500 text-slate-950' : n === state.step ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500';
      return `<li><button type="button" data-goto="${n}" class="w-full rounded-lg px-1 py-2 text-[11px] font-bold leading-tight sm:text-xs ${cls}" ${n > state.step ? 'disabled' : ''} aria-current="${n === state.step ? 'step' : 'false'}">${n}. ${fs.dataset.title}</button></li>`;
    }).join('');
  }
  function showStep(n, scroll = true) {
    state.step = Math.min(Math.max(1, n), STEPS);
    $$('.wiz-step').forEach(fs => fs.classList.toggle('hidden', +fs.dataset.step !== state.step));
    toggle('#wiz-prev', state.step > 1);
    toggle('#wiz-next', state.step < STEPS);
    $('#wiz-next').textContent = state.step === 5 ? 'Podgląd zgłoszenia →' : 'Dalej →';
    $('#step-error').classList.add('hidden');
    renderProgress();
    if (state.step === 6) renderSummary();
    if (state.step >= 5) idle(loadPdfMake);
    if (scroll) $('#kreator').scrollIntoView({ behavior: 'smooth', block: 'start' });
    save();
  }
  function reqIf(expr) {
    if (!expr) return false;
    return expr.startsWith('!') ? !state[expr.slice(1)] : !!state[expr];
  }
  function validateStep(n) {
    const fs = $(`.wiz-step[data-step="${n}"]`);
    const errors = [];
    let first = null;
    $$('[data-k]', fs).forEach(el => {
      if (el.closest('.hidden') && el.closest('.hidden') !== fs) return;
      const v = el.type === 'checkbox' ? el.checked : el.value.trim();
      const required = el.required || reqIf(el.dataset.reqIf);
      let msg = null;
      if (required && !v) msg = `${labelOf(el)} – pole wymagane.`;
      else if (v && el.dataset.validate) { const r = V[el.dataset.validate](String(v)); if (r !== true) msg = `${labelOf(el)}: ${r}`; }
      if (msg) { el.setAttribute('aria-invalid', 'true'); errors.push(msg); first = first || el; } else el.removeAttribute('aria-invalid');
    });
    if (n === 5 && itemsTotal() <= 0) errors.unshift('Dodaj co najmniej jedną pozycję kosztów z kwotą.');
    return { ok: !errors.length, errors, first };
  }
  function labelOf(el) {
    const l = el.id && $(`label[for="${el.id}"]`);
    return (l ? l.textContent : el.closest('label')?.textContent || 'Pole').replace(/\*/g, '').trim().slice(0, 60);
  }
  function showErrors(res) {
    const e = $('#step-error');
    e.innerHTML = res.errors.map(esc).join('<br>');
    e.classList.remove('hidden');
    res.first?.focus();
  }
  function validateAll() {
    for (let n = 1; n <= 5; n++) {
      const r = validateStep(n);
      if (!r.ok) { showStep(n); setTimeout(() => showErrors(r), 50); return false; }
    }
    return true;
  }

  // ── Podsumowanie (podgląd bezpłatny) ──
  function renderSummary() {
    const ins = insurerFor(state.date);
    const to = addressee() === 'gddkia' ? GDDKIA : ZDIT;
    const warns = [];
    for (const n of [1, 2, 3]) if (!photos[n]) warns.push(`Brak zdjęcia nr ${n} – dodaj je w sekcji „3 obowiązkowe zdjęcia ZDiT” albo dołącz osobno.`);
    if (state.road_type === 'outside' || OUTSIDE_RE.test(state.street || '')) warns.push('Zaznaczono drogę poza Łodzią – upewnij się, kto jest jej zarządcą, zanim wyślesz pismo.');
    if (state.road_type === 'internal') warns.push('Zaznaczono drogę wewnętrzną – ZDiT za nią nie odpowiada.');
    if (state.date && limitationDate(state.date) < today()) warns.push('Roszczenie może być przedawnione (ponad 3 lata od zdarzenia).');
    if (has(state.speed) && has(state.limit) && num(state.speed) > num(state.limit)) warns.push('Podana prędkość przekracza dozwoloną – ubezpieczyciel może obniżyć odszkodowanie (art. 362 KC).');
    const row = (k, v) => `<div class="flex justify-between gap-3 border-b border-slate-100 py-1.5"><dt class="text-slate-500">${k}</dt><dd class="text-right font-semibold">${esc(v) || '—'}</dd></div>`;
    $('#summary').innerHTML = `
      ${warns.map(w => box('warn', esc(w))).join('')}
      <dl class="rounded-xl border border-slate-200 p-4">
        ${row('Adresat', `${to.name}, ${to.lines.join(', ')}`)}
        ${addressee() === 'zdit' ? row('Polisa / ubezpieczyciel', ins ? ins.text : '') : ''}
        ${row('Poszkodowany', state.owner_name)}
        ${row('Pojazd', `${vehicle()} · ${(state.plate || '').toUpperCase()}`)}
        ${row('Data i godzina', `${fmtDate(state.date)} ${state.time || ''}`)}
        ${row('Miejsce', `Łódź, ${streetFull()}, ${state.building || ''}`)}
        ${row('Dziura (dł. × szer. × głęb.)', [state.pot_l, state.pot_w, state.pot_d].every(has) ? `${state.pot_l} × ${state.pot_w} × ${state.pot_d} cm` : '')}
        ${row('Świadek', state.witness ? state.w_name : 'brak')}
        ${row('Policja / Straż Miejska', state.police ? 'tak' : 'nie')}
        ${row('Zdjęcia', `${[1, 2, 3].filter(n => photos[n]).length} z 3`)}
        <div class="flex justify-between gap-3 pt-2"><dt class="font-bold">Kwota roszczenia</dt><dd class="text-lg font-black">${money(itemsTotal())}</dd></div>
      </dl>
      <p class="text-xs text-slate-500">Termin wypłaty: 30 dni od dnia, w którym ubezpieczyciel otrzyma zgłoszenie (art. 817 § 1 KC). Jeśli wyślesz zgłoszenie dziś, to ok. ${fmtDate(addDays(today(), 30))}.</p>`;
    renderDownloadNote();
  }

  // ── Zdjęcia ──
  function processPhoto(file) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) { reject(new Error('To nie jest plik zdjęcia.')); return; }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const max = 1600;
          const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
          const w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          let q = 0.82, data = c.toDataURL('image/jpeg', q);
          while (data.length > 650000 && q > 0.45) { q -= 0.12; data = c.toDataURL('image/jpeg', q); }
          resolve({ data, w: img.naturalWidth, h: img.naturalHeight, ts: file.lastModified || Date.now() });
        } catch (e) { reject(e); } finally { URL.revokeObjectURL(url); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Nie udało się odczytać zdjęcia. Jeśli to format HEIC, ustaw w aparacie „Najbardziej zgodne” (JPG) lub wybierz zdjęcie z galerii.')); };
      img.src = url;
    });
  }
  function renderPhoto(n) {
    const slot = $(`.photo-slot[data-photo="${n}"]`);
    const p = photos[n];
    const prev = $('.photo-preview', slot);
    prev.classList.toggle('hidden', !p);
    $('.photo-remove', slot).classList.toggle('hidden', !p);
    slot.classList.toggle('border-emerald-400', !!p);
    slot.classList.toggle('bg-emerald-50/40', !!p);
    slot.classList.toggle('border-slate-300', !p);
    if (p) {
      $('img', prev).src = p.data;
      const d = new Date(p.ts);
      const low = Math.max(p.w, p.h) < 1000;
      $('.photo-meta', prev).innerHTML = `✔ ${p.w}×${p.h} px · data pliku: ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}${low ? ' · <b class="text-red-600">niska rozdzielczość – zrób ostrzejsze zdjęcie</b>' : ''}`;
    }
    const count = [1, 2, 3].filter(i => photos[i]).length;
    $('#photo-status').textContent = count === 3 ? '✔ Masz wszystkie 3 wymagane zdjęcia.' : `Dodano ${count} z 3 wymaganych zdjęć.`;
  }
  function bindPhotos() {
    $$('.photo-slot').forEach(slot => {
      const n = +slot.dataset.photo;
      $$('.photo-input', slot).forEach(inp => inp.addEventListener('change', async () => {
        const file = inp.files && inp.files[0];
        inp.value = '';
        if (!file) return;
        try {
          photos[n] = await processPhoto(file);
          if (!store.set(photoKey(n), JSON.stringify(photos[n]))) toast('Zdjęcie dodane. Uwaga: brak miejsca w pamięci przeglądarki – nie odświeżaj strony.');
          else toast(`Zdjęcie nr ${n} dodane.`);
        } catch (e) { toast(e.message, 6000); }
        renderPhoto(n);
        render();
      }));
      $('.photo-remove', slot).addEventListener('click', () => {
        photos[n] = null;
        store.del(photoKey(n));
        renderPhoto(n);
        render();
      });
      renderPhoto(n);
    });
  }

  // ── PDF ──
  let pdfPromise;
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('Nie udało się wczytać generatora PDF. Sprawdź połączenie z internetem.'));
      document.head.appendChild(s);
    });
  }
  function loadPdfMake() {
    if (!pdfPromise) {
      pdfPromise = loadScript('vendor/pdfmake.min.js').then(() => loadScript('vendor/vfs_fonts.js'));
      pdfPromise.catch(() => { pdfPromise = null; });
    }
    return pdfPromise;
  }
  const idle = fn => (window.requestIdleCallback || (f => setTimeout(f, 300)))(() => fn().catch(() => {}));

  function kv(rows) {
    return {
      table: { widths: [150, '*'], body: rows.filter(r => r).map(([k, v]) => [{ text: k, style: 'k' }, { text: has(v) ? String(v) : '—', style: 'v' }]) },
      layout: { hLineColor: () => '#e2e8f0', vLineColor: () => '#e2e8f0', paddingTop: () => 3, paddingBottom: () => 3 },
      margin: [0, 0, 0, 8]
    };
  }
  const sec = t => ({ text: t, style: 'sec' });
  const sigLine = label => ({ columns: [{ text: '' }, { stack: [{ text: '.......................................................', alignment: 'center' }, { text: label, style: 'small', alignment: 'center' }], width: 240 }], margin: [0, 28, 0, 0] });

  function buildDoc() {
    const isG = addressee() === 'gddkia';
    const to = isG ? GDDKIA : ZDIT;
    const ins = insurerFor(state.date);
    const total = itemsTotal();
    const plate = (state.plate || '').toUpperCase();
    const signsTxt = { brak: 'brak oznakowania i wygrodzenia', bylo: 'było oznakowane', nie_wiem: 'nie wiem' }[state.signs || 'brak'];
    const acTxt = { brak: 'pojazd nie posiada AC', nie_zgloszono: 'pojazd posiada AC – szkoda nie została zgłoszona z AC', zgloszono: 'pojazd posiada AC – szkoda została zgłoszona z AC' }[state.ac || 'brak'];
    const vatTxt = { nie: 'nie', tak: 'tak – w całości', czesciowo: 'tak – częściowo' }[state.vat || 'nie'];
    const attachments = ['Kopia dowodu rejestracyjnego pojazdu (dołączyć)', 'Załącznik zdjęciowy – zdjęcia nr 1–3'];
    if (state.witness) attachments.push('Oświadczenie świadka');
    if (state.police) attachments.push('Notatka Policji / Straży Miejskiej (lub dane do jej uzyskania)');
    if (state.cost_basis === 'kosztorys') attachments.push('Kosztorys / wycena naprawy');
    if (state.cost_basis === 'faktura') attachments.push('Faktura / rachunek za naprawę');

    const content = [
      { columns: [
        { stack: [{ text: state.owner_name || '', bold: true }, state.owner_address || '', state.owner_phone ? `tel. ${state.owner_phone}` : '', state.owner_email || ''], style: 'small' },
        { text: `Łódź, dnia ${fmtDate(today())}`, alignment: 'right', style: 'small' }
      ] },
      { stack: [{ text: to.name, bold: true }, ...to.lines], margin: [260, 18, 0, 18] },
      { text: 'ZGŁOSZENIE SZKODY W POJEŹDZIE', style: 'title' },
      { text: isG ? 'z ubezpieczenia OC zarządcy drogi (GDDKiA)' : `z polisy OC Miasta Łodzi${ins && ins.known ? ` – ${PZU.name}, nr polisy ${PZU.policy}` : ''}`, style: 'subtitle' },
      { text: `Zgłaszam szkodę w pojeździe ${vehicle()} o nr rej. ${plate}, powstałą w dniu ${fmtDate(state.date)} w wyniku najechania na ubytek w nawierzchni drogi publicznej${isG ? '' : ' w Łodzi, zarządzanej przez Prezydenta Miasta Łodzi (ZDiT)'}, i wnoszę o przekazanie zgłoszenia ubezpieczycielowi odpowiedzialności cywilnej zarządcy drogi oraz o wypłatę odszkodowania w kwocie ${money(total)}.`, margin: [0, 0, 0, 10] },

      sec('I. Właściciel pojazdu (poszkodowany)'),
      kv([
        ['Imię i nazwisko / nazwa', state.owner_name], ['Adres', state.owner_address], ['PESEL / NIP', state.owner_id],
        ['Telefon', state.owner_phone], ['E-mail', state.owner_email],
        ['Rachunek do wypłaty odszkodowania', has(state.iban) ? formatIban(state.iban) : ''], ['Możliwość odliczenia VAT', vatTxt]
      ]),
      sec('II. Kierujący pojazdem'),
      kv(state.driver_same ? [['Kierujący', 'właściciel pojazdu']] : [['Imię i nazwisko', state.driver_name], ['Adres', state.driver_address], ['Telefon', state.driver_phone]]),
      sec('III. Pojazd'),
      kv([
        ['Marka i model', vehicle()], ['Nr rejestracyjny', plate], ['VIN', (state.vin || '').toUpperCase()], ['Rok produkcji', state.year],
        ['Badanie techniczne ważne do', fmtDate(state.inspection)], ['Ubezpieczenie AC', acTxt],
        ['Miejsce oględzin pojazdu', state.insp_place], ['Kontakt w sprawie oględzin', state.insp_contact]
      ]),
      sec('IV. Okoliczności zdarzenia'),
      kv([
        ['Data i godzina', `${fmtDate(state.date)}, godz. ${state.time || ''}`],
        ['Miejsce', `Łódź, ${streetFull()}, ${state.building || ''}`], ['Kierunek jazdy', state.direction],
        ['Prędkość / dozwolona', `${state.speed || '—'} km/h / ${state.limit || '—'} km/h`],
        ['Warunki atmosferyczne', state.weather], ['Oświetlenie', state.light],
        ['Wymiary ubytku (dł. × szer. × głęb.)', `${state.pot_l || '—'} × ${state.pot_w || '—'} × ${state.pot_d || '—'} cm`],
        ['Oznakowanie ubytku', signsTxt]
      ]),
      { text: 'Opis przebiegu zdarzenia:', style: 'k', margin: [0, 0, 0, 2] },
      { text: state.description || '', margin: [0, 0, 0, 10] },
      sec('V. Dowody'),
      kv([
        ['Interwencja Policji / Straży Miejskiej', state.police ? ['tak', state.police_unit, state.police_ref].filter(has).join(', ') : 'nie'],
        ['Świadek', state.witness ? [state.w_name, state.w_address, state.w_phone ? `tel. ${state.w_phone}` : ''].filter(has).join(', ') : 'brak'],
        ['Dokumentacja zdjęciowa', `${[1, 2, 3].filter(n => photos[n]).length} zdjęć – załącznik zdjęciowy`]
      ]),
      sec('VI. Roszczenie'),
      {
        table: {
          headerRows: 1, widths: ['*', '*', 90],
          body: [
            [{ text: 'Część / usługa', style: 'k' }, { text: 'Opis', style: 'k' }, { text: 'Kwota', style: 'k', alignment: 'right' }],
            ...(state.items || []).filter(i => num(i.amount) > 0).map(i => [i.part, i.desc || '', { text: money(num(i.amount)), alignment: 'right' }]),
            [{ text: 'RAZEM', bold: true, colSpan: 2 }, {}, { text: money(total), bold: true, alignment: 'right' }]
          ]
        },
        layout: { hLineColor: () => '#cbd5e1', vLineColor: () => '#cbd5e1' }, margin: [0, 0, 0, 4]
      },
      { text: `Kwota ustalona na podstawie: ${{ kosztorys: 'kosztorysu / wyceny warsztatu', faktura: 'faktury / rachunku', szacunek: 'wstępnego szacunku – dokumenty zostaną doręczone' }[state.cost_basis || 'kosztorys']}.`, style: 'small', margin: [0, 0, 0, 10] },
      sec('VII. Załączniki'),
      { ol: attachments, margin: [0, 0, 0, 10] },
      sec('VIII. Oświadczenia'),
      { text: 'Oświadczam, że podane powyżej informacje są zgodne z prawdą.', margin: [0, 0, 0, 4] },
      { text: 'Klauzula informacyjna: Złożone w toku postępowania likwidacyjnego, niezgodne z prawdą oświadczenie co do powstania szkody może stanowić podstawę do odpowiedzialności za przestępstwo oszustwa z art. 286 § 1 Kodeksu karnego.', style: 'small', margin: [0, 0, 0, 4] },
      { text: 'Zgodnie z art. 817 § 1 Kodeksu cywilnego ubezpieczyciel obowiązany jest spełnić świadczenie w terminie trzydziestu dni, licząc od daty otrzymania zawiadomienia o wypadku.', style: 'small' },
      sigLine('data i czytelny podpis zgłaszającego')
    ];

    if (state.witness) {
      content.push(
        { text: `Łódź, dnia ${fmtDate(today())}`, alignment: 'right', style: 'small', pageBreak: 'before' },
        { text: 'OŚWIADCZENIE ŚWIADKA ZDARZENIA', style: 'title', margin: [0, 24, 0, 4] },
        { text: `dotyczy szkody w pojeździe ${vehicle()} nr rej. ${plate} z dnia ${fmtDate(state.date)}`, style: 'subtitle' },
        kv([['Imię i nazwisko świadka', state.w_name], ['Adres', state.w_address], ['Telefon', state.w_phone]]),
        { text: state.witness_text || genWitness(), margin: [0, 8, 0, 0], lineHeight: 1.35 },
        sigLine('czytelny podpis świadka')
      );
    }

    content.push({ text: 'ZAŁĄCZNIK ZDJĘCIOWY', style: 'title', pageBreak: 'before' },
      { text: `szkoda w pojeździe nr rej. ${plate} · ${fmtDate(state.date)} · Łódź, ${streetFull()}`, style: 'subtitle' });
    const captions = { 1: 'Zdjęcie nr 1 – bezpośrednia przyczyna szkody (ubytek w nawierzchni)', 2: 'Zdjęcie nr 2 – lokalizacja przyczyny szkody na tle otoczenia', 3: 'Zdjęcie nr 3 – uszkodzony pojazd z widoczną tablicą rejestracyjną' };
    for (const n of [1, 2, 3]) {
      const p = photos[n];
      const block = [{ text: captions[n], style: 'sec' }];
      if (p) {
        const d = new Date(p.ts);
        block.push({ image: p.data, fit: [515, 185], alignment: 'center' }, { text: `data pliku: ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`, style: 'small', alignment: 'center', margin: [0, 2, 0, 6] });
      } else block.push({ text: 'Brak zdjęcia w kreatorze – dołącz je osobno.', italics: true, color: '#b91c1c', margin: [0, 0, 0, 8] });
      content.push({ stack: block, unbreakable: true });
    }

    const due = addDays(today(), 30);
    content.push(
      { text: 'INSTRUKCJA – TEJ STRONY NIE WYSYŁAJ', style: 'title', color: '#b45309', pageBreak: 'before' },
      { text: 'Co zrobić z tym pakietem', style: 'subtitle' },
      { ol: [
        'Wydrukuj zgłoszenie i podpisz je w miejscu „data i czytelny podpis zgłaszającego”. Świadek podpisuje swoje oświadczenie.',
        'Dołącz kopię (skan lub zdjęcie) dowodu rejestracyjnego pojazdu oraz – jeśli masz – kosztorys/fakturę i notatkę Policji/Straży Miejskiej.',
        isG
          ? `Wyślij zgłoszenie do: ${GDDKIA.name}, ${GDDKIA.lines.join(', ')} (tel. ${GDDKIA.phone}) – pocztą lub osobiście w kancelarii.`
          : `Złóż zgłoszenie w ZDiT: e-mailem (skany) na ${ZDIT.email}, przez formularz elektroniczny ${ZDIT.online}, listem poleconym na adres ${ZDIT.name}, ${ZDIT.lines.join(', ')}, albo osobiście (ul. Tuwima 36 lub punkt obsługi UMŁ, ul. Piotrkowska 171/173). ZDiT może poprosić o uzupełnienie danych na własnym druku – przepisz je wtedy z tego pisma.`,
        'Zachowaj potwierdzenie nadania lub złożenia (data jest ważna dla terminu wypłaty).',
        `Ubezpieczyciel ma co do zasady 30 dni od otrzymania zgłoszenia na wypłatę (art. 817 § 1 KC). Przy wysyłce dziś – ok. ${fmtDate(due)}. Jeśli wyjaśnienie okoliczności w tym terminie jest niemożliwe, termin wynosi 14 dni od dnia, w którym wyjaśnienie było możliwe; bezsporna część – w 30 dni (art. 817 § 2 KC).`,
        isG ? 'Nie zgłaszaj tej szkody z polisy Miasta Łodzi – odpowiada zarządca autostrady lub drogi ekspresowej.' : `Szkodę można też zgłosić bezpośrednio do ${PZU.name}, podając numer polisy OC Miasta Łodzi ${PZU.policy}. Pytania: ZDiT, tel. ${ZDIT.phone}.`,
        'Jeśli otrzymasz odmowę lub zaniżoną kwotę: złóż reklamację do ubezpieczyciela, a następnie możesz skierować wniosek do Rzecznika Finansowego lub sprawę do sądu. Roszczenie przedawnia się co do zasady po 3 latach (art. 442¹ § 1 KC).'
      ], lineHeight: 1.3 },
      { text: 'Dokument przygotowany przez zgłaszającego w niezależnym kreatorze DziuraŁódź. Kreator nie jest powiązany z UMŁ, ZDiT, GDDKiA ani PZU S.A. i nie stanowi porady prawnej.', style: 'small', margin: [0, 16, 0, 0] }
    );

    return {
      pageSize: 'A4',
      pageMargins: [40, 40, 40, 50],
      info: { title: `Zgłoszenie szkody – ${plate}`, author: state.owner_name || '', subject: 'Zgłoszenie szkody w pojeździe' },
      content,
      footer: (cur, cnt) => ({ text: `Zgłoszenie szkody · ${plate} · strona ${cur} z ${cnt}`, alignment: 'center', fontSize: 8, color: '#64748b', margin: [0, 18, 0, 0] }),
      defaultStyle: { font: 'Roboto', fontSize: 9.5, lineHeight: 1.2, color: '#0f172a' },
      styles: {
        title: { fontSize: 15, bold: true, alignment: 'center' },
        subtitle: { fontSize: 10, alignment: 'center', color: '#475569', margin: [0, 2, 0, 12] },
        sec: { fontSize: 10.5, bold: true, margin: [0, 6, 0, 4], color: '#0f172a' },
        k: { bold: true, color: '#334155' },
        v: {},
        small: { fontSize: 8.5, color: '#334155' }
      }
    };
  }

  async function downloadPdf() {
    const btn = $('#btn-download');
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Przygotowuję PDF…';
    try {
      await loadPdfMake();
      const name = `zgloszenie-szkody-${(state.plate || 'pojazd').toUpperCase().replace(/[^A-Z0-9]/g, '')}-${state.date || today()}.pdf`;
      window.pdfMake.createPdf(buildDoc()).download(name);
      toast('PDF zapisany. Wydrukuj, podpisz i wyślij zgodnie z instrukcją na ostatniej stronie.', 6000);
    } catch (e) {
      toast(e.message || 'Nie udało się utworzyć PDF.', 6000);
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  // ── Płatność ──
  let returnedFromPayment = false;
  const paidMode = () => has(CFG.paymentUrl);
  const isPaid = () => store.get(PAID_KEY) === '1';
  function renderDownloadNote() {
    const note = $('#download-note');
    if (!paidMode()) {
      note.innerHTML = 'Bezpłatnie.' + (has(CFG.tipUrl) ? ` Pomogło? <a class="font-semibold underline" href="${esc(CFG.tipUrl)}" target="_blank" rel="noopener">Postaw kawę autorowi</a>.` : '');
      return;
    }
    note.textContent = isPaid() ? 'Opłacono – możesz pobierać PDF bez limitu w tej karcie.' : `Podgląd jest bezpłatny. Pakiet PDF: ${CFG.price} (BLIK / karta).`;
  }
  function openModal() {
    const m = $('#pay-modal');
    $('#pay-price').textContent = CFG.price;
    $$('.pay-price-inline').forEach(e => { e.textContent = CFG.price; });
    $('#pay-info').textContent = CFG.paymentReturnsToSite
      ? 'Jednorazowa opłata BLIK-iem lub kartą. Po płatności wrócisz automatycznie na tę stronę – Twoje dane pozostaną wypełnione, a PDF wygeneruje się w Twojej przeglądarce.'
      : 'Płatność otworzy się w nowej karcie. Po zapłacie wróć do tej karty i kliknij „Zapłaciłem(-am) – pobierz PDF”.';
    $('#pay-consent').checked = false;
    syncPayBtn();
    $('#pay-done').classList.add('hidden');
    m.classList.remove('hidden');
    m.classList.add('flex');
    $('#pay-consent').focus();
  }
  function closeModal() {
    const m = $('#pay-modal');
    m.classList.add('hidden');
    m.classList.remove('flex');
  }
  function syncPayBtn() {
    const ok = $('#pay-consent').checked;
    const a = $('#pay-go');
    a.setAttribute('aria-disabled', String(!ok));
    a.classList.toggle('opacity-50', !ok);
    a.classList.toggle('pointer-events-none', !ok);
  }
  function bindPayment() {
    $('#pay-consent').addEventListener('change', syncPayBtn);
    $('#pay-close').addEventListener('click', closeModal);
    $('#pay-modal').addEventListener('click', e => { if (e.target.id === 'pay-modal') closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
    $('#pay-go').addEventListener('click', e => {
      e.preventDefault();
      if (!$('#pay-consent').checked) return;
      if (CFG.paymentReturnsToSite) {
        saveNow();
        location.href = CFG.paymentUrl;
      } else {
        window.open(CFG.paymentUrl, '_blank', 'noopener');
        $('#pay-done').classList.remove('hidden');
      }
    });
    $('#pay-done').addEventListener('click', () => {
      store.set(PAID_KEY, '1');
      closeModal();
      renderDownloadNote();
      downloadPdf();
    });
    $('#btn-download').addEventListener('click', () => {
      if (!validateAll()) return;
      if (!paidMode() || isPaid()) downloadPdf();
      else openModal();
    });
    if (new URLSearchParams(location.search).has('oplacono')) {
      returnedFromPayment = true;
      store.set(PAID_KEY, '1');
      history.replaceState(null, '', location.pathname + location.hash);
      state.step = 6;
      setTimeout(() => toast('Płatność przyjęta – dziękujemy! Kliknij „Pobierz kompletny pakiet dokumentów PDF”.', 7000), 300);
    }
    if (paidMode()) {
      $('#terms-paid').classList.remove('hidden');
      $$('[data-seller="name"]').forEach(e => { e.textContent = CFG.sellerName || '—'; });
      $$('[data-seller="email"]').forEach(e => { e.textContent = CFG.sellerEmail || '—'; });
      $$('[data-seller="price"]').forEach(e => { e.textContent = CFG.price; });
    }
  }

  // ── Start ──
  function init() {
    load();
    bindInputs();
    bindPhotos();
    bindPayment();
    renderPartners();
    renderItems();

    $('#wiz-next').addEventListener('click', () => {
      const r = validateStep(state.step);
      if (!r.ok) { showErrors(r); return; }
      showStep(state.step + 1);
    });
    $('#wiz-prev').addEventListener('click', () => showStep(state.step - 1));
    $('#wiz-progress').addEventListener('click', e => {
      const b = e.target.closest('[data-goto]');
      if (b && !b.disabled) showStep(+b.dataset.goto);
    });
    $('#desc-gen').addEventListener('click', () => {
      const el = $('#description');
      if (has(el.value) && !confirm('Zastąpić obecny opis wygenerowanym tekstem?')) return;
      el.value = genDescription();
      el.dispatchEvent(new Event('input'));
    });
    $('#witness-gen').addEventListener('click', () => {
      const el = $('#witness_text');
      if (has(el.value) && !confirm('Zastąpić obecną treść oświadczenia?')) return;
      el.value = genWitness();
      el.dispatchEvent(new Event('input'));
    });
    $('#item-add').addEventListener('click', () => {
      state.items.push({ part: 'Felga aluminiowa', desc: '', amount: '' });
      renderItems();
      save();
    });
    $('#items-body').addEventListener('input', e => {
      const t = e.target;
      if (!t.dataset.f) return;
      state.items[+t.dataset.i][t.dataset.f] = t.value;
      $('#items-total').textContent = money(itemsTotal());
      save();
    });
    $('#items-body').addEventListener('click', e => {
      const b = e.target.closest('[data-del]');
      if (!b) return;
      state.items.splice(+b.dataset.del, 1);
      if (!state.items.length) state.items.push({ part: 'Opona', desc: '', amount: '' });
      renderItems();
      save();
    });
    $('#btn-clear').addEventListener('click', () => {
      if (!confirm('Usunąć wszystkie wpisane dane i zdjęcia z tej przeglądarki?')) return;
      const paid = isPaid();
      try { sessionStorage.clear(); } catch { /* brak dostępu */ }
      if (paid) store.set(PAID_KEY, '1');
      location.reload();
    });
    $('#date').max = today();

    render();
    showStep(state.step || 1, returnedFromPayment);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
