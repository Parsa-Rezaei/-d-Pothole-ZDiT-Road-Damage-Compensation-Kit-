/*
 * USTAWIENIA STRONY — jedyny plik, który musisz edytować.
 * SITE SETTINGS — the only file you need to edit.
 *
 * Edycja na GitHubie: otwórz ten plik → ikona ołówka → zmień wartość w cudzysłowie → "Commit changes".
 */
window.SITE_CONFIG = {
  // ── PŁATNOŚĆ / PAYMENT ────────────────────────────────────────────────
  // Pusty paymentUrl = PDF do pobrania za darmo (dobry start, żeby zdobyć ruch z Google).
  // Empty paymentUrl = free PDF download.
  //
  // Stripe Payment Link (BLIK): wklej link "https://buy.stripe.com/..." i ustaw
  // paymentReturnsToSite: true. W Stripe ustaw: After payment → Redirect to your website →
  //   <adres strony>/?oplacono=1
  // Inny link (np. buycoffee.to, który nie wraca na stronę): paymentReturnsToSite: false.
  paymentUrl: "",
  paymentReturnsToSite: true,
  price: "9,99 zł",

  // Opcjonalny link "Postaw kawę" pokazywany przy darmowym pobraniu (np. https://buycoffee.to/twoja-nazwa).
  tipUrl: "",

  // ── DANE SPRZEDAWCY (wymagane, gdy pobierasz opłatę) / SELLER (required for paid mode) ──
  sellerName: "",
  sellerEmail: "",

  // ── REKLAMA LOKALNA / LOCAL PARTNER ADS ───────────────────────────────
  // Adres e-mail, pod który warsztaty mogą pisać, aby wykupić miejsce reklamowe.
  // Puste = ramka "Reklamuj się tutaj" jest ukryta.
  adContactEmail: "",

  // Partnerzy wyświetlani na górze strony. Przykład jednego wpisu:
  // { name: "Wulkanizacja XYZ 24h", text: "Naprawa opon, prostowanie felg. Faktura do zwrotu z PZU.", phone: "+48 600 000 000", url: "https://..." }
  partners: []
};
