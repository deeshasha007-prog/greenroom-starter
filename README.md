# Greenroom — Settlement Intelligence
**Applied AI PM Case Study · Deeksha Sharma**

---

## What I built

A **Settlement Intelligence panel** added to the existing Greenroom settle page — solving the root cause of why 65% of shows at The Crescent can't be settled in-app.

The tool can't settle Vs deals today. Mariana does it manually in Google Sheets at 2am. This feature eliminates that entirely.

### Four components, one panel

| Component | What it does |
|---|---|
| **AI Deal Parser** | Reads deal_notes_freetext via Claude API. Extracts deal type, guarantee, percentage, ratchet thresholds, expense cap, recoup rules — each with a confidence score (High / Medium / Low) |
| **Vs Deal Calculator** | Runs settlement math end-to-end: gross → fees → expenses → ratchet check → percentage vs guarantee → artist earns. Stores full calculation_json |
| **Status Intelligence** | Detects when signoff_text is positive but status is still "Disputed". Surfaces a flag: "Agent approved — mark as Finalized?" |
| **Plain Language Summary** | Generates 2-3 sentences Mariana reads to the tour manager at 2am |

---

## What the data showed

Before writing any code, I queried data/greenroom.db directly:

Deal type distribution:
- vs: 188 shows
- flat: 186 shows  
- percentage_of_net: 119 shows
- door: 30 shows
- percentage_of_gross: 14 shows

351 of 537 shows (65%) cannot be settled in-app.
calculation_json is NULL for all 188 Vs deals — no math is ever stored.
22 settlements marked "disputed" have positive agent sign-off text — ghost disputes.

Root cause: Greenroom's data model was built for simple deals. Real deals are negotiated in prose. Mariana puts the actual terms in deal_notes_freetext because the structured fields can't hold them. The spreadsheet, the status drift, the disputes — all downstream of this mismatch.

---

## The $502.50 discrepancy (Park Avenue)

The prototype surfaces a real data integrity issue on show stl_show_0182 (Park Avenue):

- Mariana's spreadsheet result: $4,129.50 (manually entered)
- Settlement Intelligence calculator: $3,627.00
- Why: The expense cap of $650 was not applied in the manual calculation — full $1,320 in expenses were deducted instead of capping at $650

This is exactly the kind of error that causes post-show disputes with agents. The tool catches it automatically.

---

## Files added

- `app/api/settlement-intelligence/route.ts` — Anthropic API route
- `components/SettlementIntelligence.tsx` — Client component panel
- `lib/settlementIntelligence.ts` — Shared TypeScript types
- `lib/vsDealMath.ts` — Vs deal calculator logic
- `app/shows/[id]/settle/page.tsx` — Wired in after LifecycleBar

---

## How to run

Clone and install:

```bash
git clone https://github.com/deeshasha007-prog/greenroom-starter
cd greenroom-starter
git checkout cursor/settlement-intelligence-panel
npm install
npm run db:reset
```

Add your Anthropic API key:

```bash
echo 'ANTHROPIC_API_KEY=your-key-here' > .env.local
```

Start the app:

```bash
npm run dev
```

Open http://localhost:3000

To see the Settlement Intelligence panel:

1. Click any show with a Vs deal badge (e.g. Park Avenue, The Quiet Houses)
2. Click View settlement
3. Scroll past the lifecycle bar — the panel loads automatically

---

## Where to look in the UI

| Show | What to see |
|---|---|
| Park Avenue (show_0182) | Status flag, full calculator, $502.50 discrepancy vs manual number |
| The Quiet Houses (show_0081) | Vs deal variant, $12,506.90 manual settlement |
| Any Vs deal | AI parser extracting terms with confidence scores |

---

## What I cut and why

| Cut | Reason |
|---|---|
| Tier ratchets | Hard to parse reliably — flags for manual review instead |
| Agent read-only view | Separate surface — V2 once math is trusted |
| Real-time ticket polling | Needs POS webhook — V1 uses snapshot |
| Email notifications | Email infra too risky for timeline — in-app checkpoint instead |

---

## Stack

Next.js 16 · TypeScript · SQLite (Drizzle ORM) · Anthropic Claude API · Tailwind CSS

---

Applied AI PM Case Study · Deeksha Sharma · May 2026
