# DziuraŁódź – pothole damage claim kit for Łódź

A Polish website for drivers who damaged a tyre, rim or suspension in a pothole in Łódź. It shows where to file (ZDiT or GDDKiA), compares claiming from the city's insurer against the driver's own AC policy, checks the 3 photos ZDiT requires, and generates a ready-to-sign A4 PDF: the claim letter, a witness statement and a photo appendix.

Everything runs in the visitor's browser. No server, no database, no cookies. Personal data never leaves the visitor's phone.

## Go live (free, GitHub Pages)

1. On GitHub open **Settings → Pages**.
2. Under **Build and deployment**: Source = **Deploy from a branch**, Branch = **main**, folder = **/ (root)**, then **Save**.
3. Wait 1–2 minutes. The site is at `https://parsa-rezaei.github.io/-d-Pothole-ZDiT-Road-Damage-Compensation-Kit-/`.

## Earn money: edit `config.js` only

| Setting | What it does |
|---|---|
| `paymentUrl` | Empty = PDF is free. Paste a Stripe Payment Link (BLIK) to charge for the PDF. |
| `paymentReturnsToSite` | `true` for Stripe (set Stripe "After payment → Redirect" to `<site>/?oplacono=1`). `false` for links that do not return to the site. |
| `price` | Price shown on the page, e.g. `"9,99 zł"`. |
| `tipUrl` | Optional "buy me a coffee" link shown while the PDF is free. |
| `sellerName`, `sellerEmail` | Required by Polish consumer law when you charge money. Shown in the terms section. |
| `adContactEmail` | Shows a "book this ad space" box for Łódź tyre shops and tow services. |
| `partners` | Paid local ads shown at the top of the page. |

## Custom domain

After buying a domain: Settings → Pages → Custom domain. Then replace the `github.io` address in `index.html`, `robots.txt` and `sitemap.xml` with the new domain.

## Keep the facts current

The city's insurer data (PZU S.A., policy 1077814389) covers incidents from 2023–2026. When Łódź publishes the insurer for 2027, update `PZU` in `app.js` and the texts in `index.html`.

## For developers

```
npm install
npm run build   # compiles Tailwind CSS to assets/styles.css and copies pdfmake to vendor/
npm test        # end-to-end test in Chromium (needs Playwright and poppler-utils)
```
