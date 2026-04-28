# Founderscope — Claude Design Prompt

> **Repo placement:** `DESIGN_PROMPT.md` at the repo root.
> **How to use:** Open a fresh Claude conversation with the shadcn MCP server and design/visualization tools enabled. Make sure the MCP is configured against the registries listed below. Paste the prompt block under "Prompt to paste" verbatim. Iterate from the output.

## Recommended shadcn MCP registries

Configure the shadcn MCP server with at least these registries — each adds something this product needs:

- **`ui.shadcn.com`** — canonical primitives. Always start here.
- **`originui.com`** — best-in-class form inputs, navigation patterns, and the cleanest combobox / dropdown implementations. Use for the typeahead search.
- **`tweakcn.com`** — theme generator and tasteful theme presets. Good for locking color tokens cleanly.
- **`tremor.so`** — Recharts-based chart blocks that look much better out of the box. Use for funding timeline and traction charts.
- **`magicui.design`** — sparingly, for one or two tasteful animated elements (number tickers).
- **Skip:** Aceternity UI for this project. Too flashy for the editorial aesthetic.

## Prompt to paste

```
I'm building Founderscope, an open-source company research tool for founders.
Type a company, get a structured "founder's-eye" report on its moat, founders,
tech stack, funding, traction, and market. Hero feature is a moat analysis
with an "AI-native replicability score" — could a technical founder rebuild
this in six months with Claude Code?

Design the full UI for this product. Use shadcn/ui as the foundation. Pull
from the shadcn MCP registries — ui.shadcn.com (primitives), originui.com
(forms and the search combobox), and tremor.so (charts). Use Recharts under
the hood for the timeline and traction graphs.

VISUAL DIRECTION
Aesthetic: editorial, not dashboard. Think Stratechery meets Linear meets a
well-designed essay. Reading-first, not metric-first. Generous whitespace.
Confident typography. The product should feel like a thoughtful founder
wrote it, not like a SaaS scraped some data.

NOT this: gradient-heavy SaaS landing pages, 47 colored badges per card,
glassmorphism, neon accents, cluttered Bloomberg-terminal density.

YES this: serif headlines paired with clean sans body, single tasteful
accent color, charts that look like they belong in a research note, lots of
breathing room, content hierarchy through typography not boxes-everywhere.

Pick a single accent color in the warm-neutral or muted-jewel-tone family
(deep amber, dusty teal, oxblood, slate-blue — your call, but commit to one
and justify it). Pair with zinc or stone neutrals. Dark mode is the default;
light mode must also feel intentional, not an afterthought. Use tweakcn.com
to lock the theme tokens cleanly.

Typography: a serif for H1/H2 (Newsreader, Source Serif, or Fraunces) paired
with a clean geometric sans for body and UI (Inter, Geist, or similar).
Numerics tabular wherever they appear in charts or stats.

LAYOUT
- Collapsible left sidebar (shadcn Sidebar component): logo at top, search
  bar, list of recently-researched companies globally, settings gear at
  bottom. Default expanded on desktop, collapsed on mobile.
- Main column: max-width ~720px for prose sections, charts can break out to
  ~960px. Single column. No right rail.
- No top nav. Sidebar is the navigation.

KEY SCREENS

1. Empty home state
   Centered hero: serif headline, one-line subtitle, the search combobox
   prominent. Below: 3–5 example companies as quiet pill suggestions ("Try:
   Stripe, Anthropic, Figma, Notion, Cursor"). No marketing fluff. Looks
   like a tool, not a landing page.

2. Search combobox (Origin UI's combobox pattern)
   As user types, dropdown shows matched companies from the global cache,
   each row: small logo, company name, "researched 3d ago" in muted text.
   Below matches: a separator and "Press Enter to research [query] →" as a
   fresh-research action. Keyboard-navigable. Fast.

3. Company report page — the main canvas. Seven sections in order:

   a. SNAPSHOT — header card with logo, company name as serif H1, one-line
      tagline, row of small badges (B2B, Series C, Fintech, Founded 2010,
      ~8000 employees). 2–3 sentence summary as lead paragraph, cited
      inline with small superscript numbers.

   b. MOAT & REPLICABILITY (the hero) — gets the most vertical real estate.
      A large "Replicability Score" visual (1–10, color-graded green→amber
      →red, with the score number in a serif display weight). Hover reveals
      a small radar chart of the four sub-axes (data moat, network effects,
      distribution, regulatory). Beside it: moat type label ("Network
      Effects + Distribution"). Below: prose breakdown with three
      subsections — "What's actually defensible", "What looks hard but
      isn't", "If you wanted to compete". The "if you wanted to compete"
      block reads as a quiet callout — left border accent, slightly
      different background, italic intro.

   c. FOUNDERS — 2–4 founder cards in a responsive grid. Each card:
      circular photo (initials fallback if no photo), name (serif), role,
      one-line "what they bring." Click opens a shadcn Sheet (right side)
      with full bio: education, prior companies, technical/non-technical
      badge, links to LinkedIn / Twitter / personal site, notable public
      work.

   d. TECH STACK & BUILD COST — two side-by-side grids ("Now" and "MVP
      era"), each showing layers (Frontend, Backend, Database, Infra,
      Vendors) with logo chips. Below: a compact horizontal stacked bar
      breaking down estimated MVP cost by category (Team, Infra, Other),
      with a total range expressed in serif display ("$80k – $140k").
      Below that: a 2–3 sentence narrative on stack evolution. Every
      number has a small "Estimated" badge with a methodology tooltip.

   e. FUNDING JOURNEY — Tremor LineChart or AreaChart showing cumulative
      capital raised over time. Annotated dots for each round (Seed,
      Series A, etc.) with hover cards showing round size, lead investor,
      valuation. Below: quiet table listing investors grouped by round.

   f. TRACTION — toggle group at top to switch between metrics (ARR
      estimate, employee count, web traffic). Each is a Tremor LineChart.
      Every chart has a small "Estimated" or "Confirmed" badge with
      source tooltip. If data is unavailable for a metric, show an honest
      empty state: "No reliable public data for ARR. Best signal:
      employee growth below."

   g. MARKET & COMPETITION — TAM/SAM/SOM as three nested concentric rings
      (custom SVG, not a chart library — clean and editorial). Numbers as
      large serif display. "Pioneer or follower?" call-out (quiet label
      + one-sentence verdict). Competitor logo grid below, 4–6
      competitors, each with a one-line positioning note.

4. Citations — every claim that ends with a fact has a small superscript
   number ([1], [2], etc.) in the accent color. Hover shows a popover with
   source URL and a 1–2 line quote excerpt. Click opens source in new tab.
   Bottom of report has a "Sources" section listing all numbered citations.

5. Loading state for fresh research — each section renders as a skeleton
   (shadcn Skeleton component) with the section's title visible at the top.
   As each section's API call completes, skeleton is replaced with real
   content via a smooth fade. Order of completion may vary.

6. Settings page (/settings) — minimal. Single card: "Anthropic API Key"
   with password input, save button, link to console.anthropic.com to get
   a key, small note: "Stored locally in your browser. Never sent to our
   servers except to make research requests on your behalf." Toggle for
   dark/light mode. That's it for v1.

7. Refresh confirmation modal — when user clicks Refresh on a cached
   report. "Re-research [Company]? This will use your Anthropic API key.
   Estimated cost: ~$0.40. The updated report becomes the new cached
   version for everyone." Two buttons: Cancel, Refresh.

INTERACTION DETAILS
- All transitions: 200ms ease-out, never longer. No bounces, no springs.
- Hover states: subtle background shift, no scale transforms.
- Focus rings: visible, accessible, in the accent color.
- Mobile: sidebar collapses to a hamburger sheet. Charts stack. Founder
  grid becomes single column. Test at 375px.

EXTENSIBILITY
The product is built around a section registry — new sections can be added
later. Design the report shell so new sections drop in cleanly without
visual surgery. Specifically: every section header follows the same
pattern (small uppercase eyebrow label, serif H2 title, optional muted
subtitle), and section spacing is uniform.

DELIVERABLES
1. Full design system: colors (light + dark), typography scale, spacing,
   border radii, shadow tokens. As shadcn theme CSS variables suitable for
   pasting into a Next.js + shadcn project.
2. Each screen above as a high-fidelity mockup.
3. Component inventory: which shadcn primitives, which Origin UI
   components, which Tremor charts. Cite the registry source for each.
4. A short rationale (3–5 sentences) for the color and typography choices.

CONSTRAINTS
- No emoji in the UI itself (chat is fine, product is not).
- No stock photography.
- No illustrated mascots.
- Founder photos come from real public sources only, never generated.
- Logos via Clearbit logo API (logo.clearbit.com/{domain}); initials
  fallback when missing.
```

## After the design output

When Claude returns the design system + mockups, save the theme CSS variables into a file you'll paste into the Next.js project later. Save the component inventory as `DESIGN_INVENTORY.md` at the repo root — the build prompts will reference it.