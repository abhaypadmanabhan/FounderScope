// FounderScope — Cursor demo data
// Realistic-feeling but clearly mock; for design purposes only.

window.CURSOR_DATA = {
  company: {
    name: "Cursor",
    legalName: "Anysphere, Inc.",
    tagline: "The AI code editor built to make you extraordinarily productive.",
    founded: 2022,
    headquarters: "San Francisco, CA",
    employees: 65,
    employeesAsOf: "Apr 2026",
    stage: "Series C",
    category: "Developer Tools",
    business: "B2B / B2C",
    summary:
      "Cursor is a fork of VS Code that bakes AI editing into the inner loop of writing software. Founded in 2022 by four MIT graduates, the company has ridden the model-wave from a side project to one of the fastest-revenue-growing developer tools ever measured, with mid-eight-figure ARR within twenty-four months of launch.",
    summary2:
      "Its wedge is a single insight: the editor — not the chat window — is where engineers actually live. By owning that surface, Cursor controls context, latency, and the upgrade path as frontier models keep getting better.",
    badges: ["B2B / B2C", "Series C", "Developer Tools", "Founded 2022", "~65 employees"],
  },

  moat: {
    score: 6,
    label: "Distribution + Workflow Lock-in",
    summary:
      "Cursor's moat is real but narrower than the revenue suggests. It is, fundamentally, a thin (but very well-tuned) layer over frontier models — and the layer is where the work is.",
    defensible: [
      {
        title: "Editor surface area",
        body:
          "Owning the IDE means owning the prompt. Every keystroke, every diff, every cursor position is context the chat-only competitors can't see. This is not nothing, and it compounds with usage."
      },
      {
        title: "Brand among engineers",
        body:
          "In a category where word-of-mouth is the only marketing that works, 'I've switched to Cursor' has become its own social signal. That trust is expensive to rebuild."
      },
      {
        title: "Model routing & caching",
        body:
          "A year of throughput on a narrow workload teaches you which model to call when, and how to cache aggressively. The cost curve is meaningfully better than a from-scratch competitor's would be."
      },
    ],
    notDefensible: [
      {
        title: "The fork itself",
        body:
          "VS Code is open source. Anyone can fork it. Several have. The fork is a starting line, not a moat."
      },
      {
        title: "Tab autocomplete UX",
        body:
          "Beautifully executed, but the underlying technique (speculative diff generation against an open buffer) is now in three open-source projects. The UX edge is six months, maybe nine."
      },
      {
        title: "The models",
        body:
          "Cursor does not own a frontier model. When Anthropic or OpenAI ships, Cursor benefits — and so does every competitor on the same API."
      },
    ],
    replicability: {
      verdict: "Hard but not heroic.",
      body:
        "A four-engineer team with Claude Code, six months, and a real distribution wedge could ship a credible v1. The hard part isn't the editor — it's the taste required to know which AI behaviors to expose and which to hide. That's the part most clones get wrong.",
    },
  },

  founders: [
    {
      id: "michael",
      name: "Michael Truell",
      role: "Co-founder, CEO",
      bring: "Product taste, model intuition, public face.",
      type: "Technical",
      avatar: "M",
      avatarHue: 18,
      bio:
        "Michael is the public-facing founder and the principal voice on product. Prior to Cursor he worked on machine-learning research at MIT and interned across a string of AI labs. He drives the editor's UX philosophy — what to show, what to hide, when to interrupt the user.",
      education: "MIT, Mathematics & Computer Science, 2022",
      prior: ["MIT CSAIL (research)", "Google (intern)", "OpenAI (intern, brief)"],
      links: { twitter: "@mntruell", linkedin: "in/michaeltruell", site: "truell.dev" },
      notable: "Hosts the Cursor changelog walkthroughs; rare combination of sharp engineer and clear writer.",
    },
    {
      id: "sualeh",
      name: "Sualeh Asif",
      role: "Co-founder, CPO",
      bring: "Distribution, design partnerships, GTM.",
      type: "Technical",
      avatar: "S",
      avatarHue: 36,
      bio:
        "Sualeh runs product and a lot of what looks like marketing — the early developer-relations hand-holding that turned individual engineers into team adoptions. Quietly responsible for the design partnerships with several of the largest customers.",
      education: "MIT, Computer Science, 2022",
      prior: ["Jane Street (intern)", "MIT (TA, 6.046)"],
      links: { twitter: "@sualehasif996", linkedin: "in/sualehasif" },
      notable: "Wrote the original Cursor onboarding flow; still ships product code weekly.",
    },
    {
      id: "arvid",
      name: "Arvid Lunnemark",
      role: "Co-founder, Engineering",
      bring: "Editor internals, performance, latency.",
      type: "Technical",
      avatar: "A",
      avatarHue: 200,
      bio:
        "Arvid owns the parts of the codebase nobody wants to own — the diff engine, the speculative-decoding paths, the bits that make typing feel instant despite a 200ms model call. Low public profile; high internal leverage.",
      education: "MIT, Computer Science, 2022",
      prior: ["Standard Cognition (engineer)", "Klarna (intern)"],
      links: { twitter: "@arvidlunnemark", linkedin: "in/arvidlunnemark" },
      notable: "Author of the often-cited essay on speculative-edit UIs.",
    },
    {
      id: "aman",
      name: "Aman Sanger",
      role: "Co-founder, Research",
      bring: "Model evaluation, fine-tuning, infra.",
      type: "Technical",
      avatar: "A",
      avatarHue: 320,
      bio:
        "Aman runs model work — eval harnesses, fine-tunes on real Cursor traffic, the routing layer that decides which model handles which kind of edit. Comes from a research background and reads like a researcher who learned to ship.",
      education: "MIT, Computer Science, 2022",
      prior: ["Anthropic (intern, eval team)", "MIT CSAIL"],
      links: { twitter: "@amanrsanger", linkedin: "in/amansanger" },
      notable: "Frequent technical-blog author; one of the more-cited voices on coding-eval design.",
    },
  ],

  funding: {
    totalRaised: 175,        // millions
    lastValuation: 2500,     // millions, post
    rounds: [
      { name: "Seed",      date: "2022-09", monthIdx: 0,  amount: 8,    cumulative: 8,    lead: "OpenAI Startup Fund", investors: ["OpenAI Startup Fund", "Nat Friedman", "Daniel Gross"] },
      { name: "Series A",  date: "2023-10", monthIdx: 13, amount: 30,   cumulative: 38,   lead: "Andreessen Horowitz", investors: ["a16z", "Thrive Capital", "Patrick Collison", "Adam D'Angelo"] },
      { name: "Series B",  date: "2024-08", monthIdx: 23, amount: 60,   cumulative: 98,   lead: "Thrive Capital", investors: ["Thrive Capital", "a16z", "Stripe", "Jeff Dean"] },
      { name: "Series C",  date: "2025-12", monthIdx: 39, amount: 105,  cumulative: 203,  lead: "Thrive Capital", investors: ["Thrive Capital", "Benchmark", "a16z", "OpenAI Startup Fund", "Sequoia"] },
    ],
    timeline: [
      // monthIdx, cumulative ($M)
      { m:0, v:0 },{ m:1, v:8 },{ m:6, v:8 },{ m:12, v:8 },{ m:13, v:38 },{ m:18, v:38 },
      { m:22, v:38 },{ m:23, v:98 },{ m:30, v:98 },{ m:36, v:98 },{ m:38, v:98 },{ m:39, v:203 },{ m:42, v:203 },
    ],
  },

  traction: {
    arr: {
      confidence: "Estimated",
      source: "Triangulated from reported revenue figures in The Information (Mar 2026) and seat counts disclosed by enterprise customers.",
      points: [
        { m: "Q1 '23", v: 0.2 },{ m: "Q2 '23", v: 0.6 },{ m: "Q3 '23", v: 1.5 },{ m: "Q4 '23", v: 3 },
        { m: "Q1 '24", v: 7 },{ m: "Q2 '24", v: 13 },{ m: "Q3 '24", v: 22 },{ m: "Q4 '24", v: 38 },
        { m: "Q1 '25", v: 65 },{ m: "Q2 '25", v: 95 },{ m: "Q3 '25", v: 140 },{ m: "Q4 '25", v: 200 },
        { m: "Q1 '26", v: 280 },
      ],
      unit: "$M",
    },
    employees: {
      confidence: "Confirmed",
      source: "LinkedIn employee count, monthly snapshots since launch.",
      points: [
        { m: "Q1 '23", v: 4 },{ m: "Q2 '23", v: 6 },{ m: "Q3 '23", v: 8 },{ m: "Q4 '23", v: 12 },
        { m: "Q1 '24", v: 16 },{ m: "Q2 '24", v: 22 },{ m: "Q3 '24", v: 28 },{ m: "Q4 '24", v: 34 },
        { m: "Q1 '25", v: 41 },{ m: "Q2 '25", v: 48 },{ m: "Q3 '25", v: 54 },{ m: "Q4 '25", v: 60 },
        { m: "Q1 '26", v: 65 },
      ],
      unit: "people",
    },
    traffic: {
      confidence: "Estimated",
      source: "Similarweb monthly visits to cursor.com (B+/A- confidence).",
      points: [
        { m: "Q1 '23", v: 0.05 },{ m: "Q2 '23", v: 0.15 },{ m: "Q3 '23", v: 0.4 },{ m: "Q4 '23", v: 0.8 },
        { m: "Q1 '24", v: 1.6 },{ m: "Q2 '24", v: 2.8 },{ m: "Q3 '24", v: 4.2 },{ m: "Q4 '24", v: 6.0 },
        { m: "Q1 '25", v: 8.5 },{ m: "Q2 '25", v: 11 },{ m: "Q3 '25", v: 14 },{ m: "Q4 '25", v: 17 },
        { m: "Q1 '26", v: 21 },
      ],
      unit: "M visits/mo",
    },
  },

  market: {
    tam: { value: 95, label: "Developer tools globally", note: "All paid software for software developers. Big number, slow movement." },
    sam: { value: 18, label: "AI-assisted developer tools", note: "The slice where AI is the primary value prop. Growing >100% y/y." },
    som: { value: 2.4, label: "Premium AI editors", note: "Where Cursor actually competes. Five-to-eight-team race." },
    pioneer: {
      verdict: "Pioneer of the 'AI-native editor' category, follower of the IDE itself.",
      body: "The editor existed. The category did not. Cursor invented the second one.",
    },
    competitors: [
      { name: "GitHub Copilot",  note: "Default-installed advantage. Slower iteration, broader audience." },
      { name: "Codeium / Windsurf", note: "Pivoted hard into agentic mode. Closer competitor than the marketing suggests." },
      { name: "Zed",            note: "Editor-first crowd, no AI-native wedge yet. Latent threat." },
      { name: "Replit",          note: "Agent-first; competes for greenfield, not for serious codebases." },
      { name: "JetBrains AI",    note: "Massive installed base. Slow product cadence." },
      { name: "Continue.dev",    note: "Open-source, plug-in. Niche but loyal." },
    ],
  },

  citations: [
    { n: 1, source: "The Information", url: "https://theinformation.com/articles/cursor-arr-2026", quote: "Cursor's ARR crossed roughly $280M in Q1 2026, according to people familiar with the matter.", date: "Mar 12, 2026" },
    { n: 2, source: "Forbes", url: "https://forbes.com/cursor-series-c", quote: "Anysphere closed a $105M Series C led by Thrive Capital at a $2.5B post-money valuation.", date: "Dec 4, 2025" },
    { n: 3, source: "Cursor blog", url: "https://cursor.com/blog/series-b", quote: "Today we're announcing our Series B, led by Thrive Capital, with participation from a16z and others.", date: "Aug 23, 2024" },
    { n: 4, source: "Crunchbase", url: "https://crunchbase.com/organization/anysphere", quote: "Total funding to date: $203M across four rounds.", date: "Apr 2026" },
    { n: 5, source: "LinkedIn (Anysphere)", url: "https://linkedin.com/company/anysphere", quote: "65 employees as of April 2026.", date: "Apr 2026" },
    { n: 6, source: "Lunnemark, A. — 'Speculative edits in the editor'", url: "https://arvid.dev/spec-edits", quote: "We treat the editor as a streaming surface — the model proposes a diff, the user confirms a region.", date: "Feb 2024" },
    { n: 7, source: "Stratechery", url: "https://stratechery.com/cursor-and-the-ide-wedge", quote: "The interesting question is not whether Cursor is a fork — it is whether the fork is the wedge.", date: "Nov 2024" },
    { n: 8, source: "Similarweb", url: "https://similarweb.com/website/cursor.com", quote: "cursor.com — estimated 21M monthly visits as of March 2026.", date: "Mar 2026" },
  ],

  recents: [
    { name: "Stripe",     when: "2d ago",  initial: "S", hue: 250 },
    { name: "Anthropic",  when: "5d ago",  initial: "A", hue: 28 },
    { name: "Figma",      when: "1w ago",  initial: "F", hue: 280 },
    { name: "Notion",     when: "2w ago",  initial: "N", hue: 0 },
    { name: "Linear",     when: "3w ago",  initial: "L", hue: 220 },
    { name: "Vercel",     when: "1mo ago", initial: "V", hue: 0 },
    { name: "Perplexity", when: "1mo ago", initial: "P", hue: 190 },
  ],

  searchIndex: [
    { name: "Cursor",     when: "just now",  initial: "C", hue: 18 },
    { name: "Stripe",     when: "2d ago",    initial: "S", hue: 250 },
    { name: "Anthropic",  when: "5d ago",    initial: "A", hue: 28 },
    { name: "Figma",      when: "1w ago",    initial: "F", hue: 280 },
    { name: "Notion",     when: "2w ago",    initial: "N", hue: 0 },
    { name: "Linear",     when: "3w ago",    initial: "L", hue: 220 },
    { name: "Vercel",     when: "1mo ago",   initial: "V", hue: 0 },
    { name: "Perplexity", when: "1mo ago",   initial: "P", hue: 190 },
    { name: "Replit",     when: "2mo ago",   initial: "R", hue: 200 },
    { name: "Codeium",    when: "2mo ago",   initial: "C", hue: 160 },
    { name: "Zed",        when: "3mo ago",   initial: "Z", hue: 280 },
  ],
};
