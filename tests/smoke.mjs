// Test end-to-end: node tests/smoke.mjs [katalog-na-wyniki]
// Uruchamia lokalny serwer, wypełnia kreator w Chromium (Playwright), pobiera PDF w trybie darmowym i płatnym.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'dziura-'));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain' };

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(root, p.endsWith('/') ? p + 'index.html' : p);
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failures++; };
const pad = n => String(n).padStart(2, '0');
const d = new Date(Date.now() - 2 * 864e5);
const incident = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true, locale: 'pl-PL' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

// Zdjęcia testowe: zrzuty ekranu kolorowych bloków.
const shot = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const photo = async (color, label) => {
  await shot.setContent(`<body style="margin:0;background:${color};display:grid;place-items:center;height:100vh;font:bold 120px sans-serif;color:#fff">${label}</body>`);
  return shot.screenshot({ type: 'jpeg', quality: 80 });
};
const imgs = [await photo('#475569', 'DZIURA'), await photo('#0f766e', 'ULICA'), await photo('#b45309', 'EL 12345')];

await page.goto(base);
check((await page.title()).includes('Odszkodowanie za dziurę w drodze Łódź'), 'tytuł strony');
check(await page.locator('h1').innerText() === 'Odszkodowanie za dziurę w drodze w Łodzi', 'nagłówek H1');
const ld = await page.$$eval('script[type="application/ld+json"]', s => s.map(x => JSON.parse(x.textContent)['@type']));
check(ld.includes('FAQPage') && ld.includes('SoftwareApplication'), 'JSON-LD poprawny (FAQPage + SoftwareApplication)');
check((await page.locator('#partners').innerText()).includes('WhatsApp'), 'ramka reklamowa z kontaktem SMS/WhatsApp');

await page.locator('input[name="road_type"][value="city"]').check();
check((await page.locator('#juris-result').innerText()).includes('Zgłaszasz do ZDiT'), 'Krok 0: droga w Łodzi → ZDiT');
await page.locator('input[name="road_type"][value="gddkia"]').check();
check((await page.locator('#juris-result').innerText()).includes('GDDKiA'), 'Krok 0: autostrada → GDDKiA');
await page.locator('input[name="road_type"][value="city"]').check();

await page.fill('#calc_cost', '1200');
await page.fill('#calc_premium', '1800');
await page.fill('#calc_loss', '15');
await page.fill('#calc_years', '2');
await page.fill('#calc_deductible', '500');
const calc = await page.locator('#calc-result').innerText();
check(/1\s?040,00/.test(calc), 'kalkulator: różnica 500 + 1800×15%×2 = 1040 zł');

for (let n = 1; n <= 3; n++) {
  await page.locator(`.photo-slot[data-photo="${n}"] .photo-input`).nth(1).setInputFiles({ name: `p${n}.jpg`, mimeType: 'image/jpeg', buffer: imgs[n - 1] });
}
await page.waitForFunction(() => document.querySelector('#photo-status').textContent.includes('wszystkie 3'));
check(true, 'moduł zdjęć: 3 zdjęcia dodane');

// Krok 1
await page.click('#wiz-next');
check(await page.locator('#step-error').isVisible(), 'walidacja: pusty krok 1 zablokowany');
await page.fill('#owner_name', 'Józef Żółkiewski-Łęcki');
await page.fill('#owner_phone', '600 100 200');
await page.fill('#owner_address', 'ul. Piotrkowska 1, 90-001 Łódź');
await page.fill('#owner_id', '44051401358');
await page.fill('#iban', 'PL61109010140000071219812874');
await page.click('#wiz-next');
check((await page.locator('#step-error').innerText()).includes('PESEL'), 'walidacja: zły PESEL wykryty');
await page.fill('#owner_id', '44051401359');
await page.click('#wiz-next');
check(await page.locator('.wiz-step[data-step="2"]').isVisible(), 'krok 1 → 2');

// Krok 2
await page.fill('#make', 'Škoda');
await page.fill('#model', 'Octavia');
await page.fill('#plate', 'el 12345');
check(await page.inputValue('#plate') === 'EL 12345', 'numer rejestracyjny zamieniany na wielkie litery');
await page.fill('#vin', 'TMBJJ7NE5L0123456');
await page.click('#wiz-next');

// Krok 3
await page.fill('#date', incident);
check((await page.locator('#insurer-box').innerText()).includes('1077814389'), 'krok 3: polisa PZU 1077814389 dla bieżącego roku');
await page.fill('#time', '20:00');
await page.fill('#street', 'Przybyszewskiego');
await page.fill('#building', 'przy nr 120');
await page.fill('#speed', '40');
await page.fill('#limit', '50');
await page.fill('#pot_l', '60');
await page.fill('#pot_w', '45');
await page.fill('#pot_d', '12');
await page.click('#desc-gen');
check((await page.inputValue('#description')).includes('ul. Przybyszewskiego'), 'generator opisu zdarzenia');
await page.fill('#street', 'A1 węzeł Łódź Wschód');
check((await page.locator('#street-alert').innerText()).includes('GDDKiA'), 'alert: autostrada wpisana w polu ulicy');
await page.fill('#street', 'Przybyszewskiego');
await page.click('#wiz-next');

// Krok 4
await page.locator('.wiz-step[data-step="4"] input[data-k="police"]').check();
await page.locator('input[data-k="witness"]').check();
await page.fill('#w_name', 'Anna Nowak');
await page.fill('#w_address', 'ul. Zgierska 5, 91-001 Łódź');
await page.selectOption('#w_gender', 'k');
await page.click('#witness-gen');
check((await page.inputValue('#witness_text')).includes('byłam świadkiem'), 'generator oświadczenia świadka (forma żeńska)');
await page.click('#wiz-next');

// Krok 5
await page.fill('#items-body input[data-f="amount"]', '650');
await page.click('#item-add');
await page.locator('#items-body input[data-f="amount"]').nth(1).fill('800');
check(/1\s?450,00/.test(await page.locator('#items-total').innerText()), 'suma roszczenia 1450 zł');
await page.click('#wiz-next');
check((await page.locator('#step-error').innerText()).includes('pole wymagane'), 'walidacja: brak oświadczenia o prawdzie');
await page.locator('input[data-k="truth"]').check();
await page.click('#wiz-next');
check((await page.locator('#summary').innerText()).includes('PZU S.A., polisa OC Miasta Łodzi nr 1077814389'), 'podgląd: adresat i polisa');
check(await page.locator('#score-box').innerText().then(t => t.includes('100')), 'wskaźnik dowodów 100/100');

await page.screenshot({ path: path.join(out, 'mobile-step6.png'), fullPage: false });

// Pobranie PDF (tryb darmowy)
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#btn-download')]);
const pdf = path.join(out, 'free.pdf');
await dl.saveAs(pdf);
const text = execFileSync('pdftotext', ['-layout', pdf, '-']).toString();
check(text.includes('ZGŁOSZENIE SZKODY W POJEŹDZIE'), 'PDF: tytuł z polskimi znakami');
check(text.includes('Józef Żółkiewski-Łęcki'), 'PDF: znaki ą ć ę ł ń ó ś ź ż');
check(text.includes('nr polisy 1077814389'), 'PDF: numer polisy');
check(text.includes('Tuwima 36'), 'PDF: adres ZDiT');
check(text.includes('OŚWIADCZENIE ŚWIADKA ZDARZENIA'), 'PDF: oświadczenie świadka');
check(text.includes('286 § 1'), 'PDF: klauzula art. 286 § 1 KK');
check(text.includes('art. 817 § 1'), 'PDF: art. 817 KC');
check(text.includes('PL 61 1090 1014 0000 0712 1981 2874'), 'PDF: IBAN sformatowany');
const images = execFileSync('pdfimages', ['-list', pdf]).toString().trim().split('\n').length - 2;
check(images === 3, `PDF: 3 zdjęcia w załączniku (jest ${images})`);
const pages = +execFileSync('pdfinfo', [pdf]).toString().match(/Pages:\s+(\d+)/)[1];
check(pages >= 4, `PDF: ${pages} stron`);

// Tryb płatny: przekierowanie do operatora i powrót z ?oplacono=1, dane zachowane w sessionStorage.
await page.route('**/config.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.SITE_CONFIG = { paymentUrl: "${base}?oplacono=1", paymentReturnsToSite: true, price: "9,99 zł", sellerName: "Test", sellerEmail: "test@example.com", partners: [{ name: "Wulkanizacja Test 24h", text: "Prostowanie felg", phone: "+48 600 000 000" }], adContactEmail: "reklama@example.com" };` }));
await page.reload();
check(await page.locator('#partners').isVisible() && (await page.locator('#partners').innerText()).includes('Wulkanizacja Test 24h'), 'tryb płatny: ramka partnera widoczna');
check(await page.locator('.wiz-step[data-step="6"]').isVisible(), 'stan kreatora zachowany po odświeżeniu');
await page.click('#btn-download');
check(await page.locator('#pay-modal').isVisible(), 'tryb płatny: okno płatności');
check(await page.locator('#pay-go').getAttribute('aria-disabled') === 'true', 'tryb płatny: przycisk zablokowany bez zgody konsumenckiej');
await page.locator('#pay-consent').check();
await Promise.all([page.waitForURL(u => u.search.includes('oplacono')), page.click('#pay-go')]);
await page.waitForFunction(() => !location.search.includes('oplacono'));
check(await page.inputValue('#owner_name') === 'Józef Żółkiewski-Łęcki', 'po płatności: dane nadal wypełnione');
const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#btn-download')]);
await dl2.saveAs(path.join(out, 'paid.pdf'));
check(true, 'po płatności: PDF pobrany bez ponownej opłaty');

// Zrzuty: telefon i komputer
await page.unroute('**/config.js');
const desk = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await desk.goto(base);
await desk.screenshot({ path: path.join(out, 'desktop.png'), fullPage: true });
const mob = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await mob.goto(base);
await mob.screenshot({ path: path.join(out, 'mobile-top.png') });
const overflow = await mob.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
check(!overflow, 'brak poziomego przewijania na telefonie');

check(errors.length === 0, `brak błędów JS w konsoli ${errors.length ? JSON.stringify(errors) : ''}`);
await browser.close();
server.close();
console.log(`\nWyniki: ${out}\n${failures ? `${failures} FAIL` : 'Wszystkie testy OK'}`);
process.exit(failures ? 1 : 0);
