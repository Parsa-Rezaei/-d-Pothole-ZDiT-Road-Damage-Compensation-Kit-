# Security checklist (owner)

The website has no server, no database and stores no visitor data, so there is nothing on it to steal. The real risk is someone taking over **your accounts** and changing the payment link or phone number. Protect the accounts:

1. **GitHub:** turn on two-factor authentication (Settings → Password and authentication). Use a passkey or an authenticator app, not SMS. Whoever can edit `config.js` controls where payments go.
2. **GitHub, verified domain:** after buying the domain, verify it at github.com/settings/pages. This stops other people from pointing their own GitHub site at your domain.
3. **Gmail (business):** 2-step verification, plus a recovery phone and email.
4. **Stripe:** 2-step authentication. Accept **BLIK only** at first: card payments on a cheap product attract stolen-card testing, and each dispute costs a fee.
5. **Domain registrar (OVH / nazwa.pl):** 2-step authentication and domain transfer lock. Auto-renew ON, so the domain does not expire and get bought by someone else.
6. **Phishing:** Stripe, GitHub and OVH never ask for your password by email or SMS. Always log in by typing the address yourself.
7. **AI browser agent:** never give it passwords, 2FA codes, card numbers or ID documents. Enter those yourself.
8. **Monthly:** open `config.js` on GitHub and check that `paymentUrl`, `adContactPhone` and `partners` are what you set.

## Known limitation
The paid-PDF check happens in the visitor's browser. A technical visitor can unlock the PDF without paying. This can only lose you a 9.99 zł sale; it cannot take money from your account. Closing it fully needs a server that verifies each Stripe payment.

## Built-in protections
- Content-Security-Policy: only the site's own scripts can run, and no data can be sent to other servers.
- Links from `config.js` must be `https://`. `javascript:` and similar links are refused.
- The page refuses to run inside another site's frame (clickjacking).
- All text typed by users is escaped before it is shown on the page.
- The PDF library is a pinned copy stored in this repository; nothing loads from external CDNs.
