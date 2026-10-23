// The words in the screenshot workspace: an online shop's product team at work.

export const PEOPLE = {
  maria: { name: "Maria Lindqvist" },
  dev: { name: "Dev Patel", email: "dev@acme.example", role: "member" as const },
  aino: { name: "Aino Virtanen", email: "aino@acme.example", role: "member" as const },
  tomi: { name: "Tomi Laine", email: "tomi@acme.example", role: "member" as const },
};

export const FREE_SHIPPING_PLAN_V1 = `# Plan: free shipping over €100 for the autumn campaign

## What exists today
- Shipping is priced per order in \`src/checkout/shipping.ts\`: a flat €4.90 below €50 and €2.90 above.
- Discount codes are applied in \`src/checkout/discounts.ts\` before shipping is priced.
- The cart shows a "free shipping" hint only for the old €150 summer threshold, hard-coded in \`CartSummary.tsx\`.

## The change
1. Add a \`freeShippingThreshold\` setting, €100 for the campaign, read from the campaign config.
2. Price shipping at €0 when the order total reaches the threshold.
3. Replace the hard-coded hint with "€12 away from free shipping", based on the setting.

## How to test
Shipping pricing at €99.99, €100 and €100.01, with and without a discount code, and the cart hint.

## Open question
Does the threshold count the total before or after discount codes? I've asked Maria.
`;

export const FREE_SHIPPING_PLAN_V2 = `# Plan: free shipping over €100 for the autumn campaign

## What exists today
- Shipping is priced per order in \`src/checkout/shipping.ts\`: a flat €4.90 below €50 and €2.90 above.
- Discount codes are applied in \`src/checkout/discounts.ts\` before shipping is priced.
- The cart shows a "free shipping" hint only for the old €150 summer threshold, hard-coded in \`CartSummary.tsx\`.

## The change
1. Add a \`freeShippingThreshold\` setting, €100 for the campaign, read from the campaign config so marketing can change it without a release.
2. Price shipping at €0 when the order total after discount codes reaches the threshold.
3. Replace the hard-coded hint with "€12 away from free shipping", based on the setting and the discounted total.
4. Show the free shipping line in the order confirmation email.

## How to test
Shipping pricing at €99.99, €100 and €100.01, with and without a discount code, and the cart hint.
`;

export const FREE_SHIPPING_QUESTION = {
  question: "Should the €100 threshold count the order total before or after discount codes? A €110 cart with a 15% code comes to €93.50.",
  options: ["After discount codes (recommended: what the customer actually pays)", "Before discount codes", "Before codes, but not for staff discount codes"],
  answer: "After discount codes. We don't want a code to make shipping cost more.",
};

export const DELIVERY_ESTIMATE_QUESTION = {
  question:
    "Product pages can show a delivery estimate from either carrier. Posti's API gives a date range per postcode; DHL only gives a 'next working day' flag. Which should the estimate use?",
  options: ["Posti's date range, with DHL as the fallback", "DHL only, as 'Arrives tomorrow' when it applies", "The slower of the two, to under-promise"],
};

export const GIFT_NOTE_PLAN = `# Plan: gift note at checkout

## What exists today
- Checkout is three steps: cart → address → payment (\`src/checkout/steps\`).
- Orders already carry free-text \`deliveryInstructions\`, printed on the packing slip.

## Part 1: Take the note at checkout
1. Add \`giftNote\` (optional, up to 200 characters) to the order model and API.
2. Add an "Add a gift note" toggle and text field to the address step.

## Part 2: Print it on the packing slip
1. Pass \`giftNote\` to the warehouse service and show it on the packing slip.

## How to test
Order API validation, the checkout step, and the packing slip template.
`;

export const DECK_PLAN = `# Plan: Q3 product update deck

A seven-slide HTML deck for the customer webinar on 30 October, built from \`notes/q3-release-notes.md\` and written in the tone of \`notes/brand-voice.md\`.

1. Title: "What's new this quarter"
2. Shared dashboards: lead with the 3× faster charts, then sharing by link
3. Scheduled reports: weekly PDFs to any inbox
4. Mobile app: offline mode and push alerts
5. What customers told us: three quotes from \`research/customer-interviews.md\`
6. Coming next quarter
7. Questions and where to get help

Each slide gets one headline and at most three short points. Screenshots come from the release notes folder.
`;

export const BRAND_VOICE = `# Acme brand voice

We write like a helpful colleague, not a brochure.

- Plain words. "Use", not "leverage". "Help", not "empower".
- Lead with what the customer can do now, then how.
- One idea per sentence. Short paragraphs.
- Numbers beat adjectives: "charts load 3× faster", not "blazing fast".
- No exclamation marks in headlines.

## Words we use
Shared dashboards, scheduled reports, workspace, teammates.

## Words we avoid
Seamless, revolutionary, synergy, best-in-class.
`;

export const RELEASE_NOTES = `# Q3 release notes

## Shared dashboards
- Charts render 3× faster on dashboards with more than 20 widgets.
- Share a read-only dashboard by link, with an optional expiry date.

## Scheduled reports
- Send any dashboard as a weekly or monthly PDF to any email address.

## Mobile app
- Offline mode keeps the last synced dashboards available.
- Push alerts when a metric crosses a threshold you set.
`;

export const INTERVIEWS = `# Customer interviews, September

> "We stopped exporting to spreadsheets once dashboards could be shared by link." — Operations lead, logistics company

> "The weekly PDF is the only report our board actually reads." — CFO, retail chain

> "Offline mode saved me on the train every morning." — Field sales manager
`;

const SLIDES = [
  ["What's new this quarter", "Q3 product update · 30 October"],
  ["Shared dashboards", "Charts load 3× faster on big dashboards. Share a read-only view by link, with an expiry date."],
  ["Scheduled reports", "Send any dashboard as a weekly or monthly PDF, to any inbox."],
  ["Mobile app", "Offline mode keeps your dashboards with you. Push alerts tell you when a metric crosses your line."],
  ["What customers told us", "“The weekly PDF is the only report our board actually reads.” — CFO, retail chain"],
  ["Coming next quarter", "Dashboard templates, comments on charts, and single sign-on for every plan."],
  ["Questions?", "help.acme.example · your account manager · #acme-customers"],
];

export const DECK_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Q3 product update</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
${SLIDES.map(([title, body], index) => `<section class="slide${index === 1 ? " current" : ""}"><p class="count">${index + 1} / ${SLIDES.length}</p><h1>${title}</h1><p>${body}</p></section>`).join("\n")}
<script>
const slides = [...document.querySelectorAll('.slide')];
let current = 1;
const show = (n) => { current = (n + slides.length) % slides.length; slides.forEach((s, i) => s.classList.toggle('current', i === current)); };
document.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') show(current + 1); if (e.key === 'ArrowLeft') show(current - 1); });
document.addEventListener('click', () => show(current + 1));
</script>
</body>
</html>
`;

export const DECK_CSS = `body { margin: 0; font-family: Inter, system-ui, sans-serif; background: #0f172a; color: #f8fafc; }
.slide { display: none; min-height: 100vh; box-sizing: border-box; padding: 12vh 10vw; background: linear-gradient(135deg, #1e3a8a, #0f172a 60%); }
.slide.current { display: block; }
.slide h1 { font-size: 6vw; margin: 0 0 4vh; letter-spacing: -0.02em; }
.slide p { font-size: 2.4vw; line-height: 1.4; max-width: 60vw; color: #cbd5e1; }
.slide .count { font-size: 1.2vw; color: #93c5fd; margin-bottom: 6vh; }
`;
