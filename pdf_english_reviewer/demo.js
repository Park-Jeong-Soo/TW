// demo_v4.js — PDF English Reviewer (client-side preview shim), v4
//
// v4 changes from the previous demo.js:
// - Browser grammar rules on part-of-speech tags (no backend): compound-modifier
//   hyphenation, passive voice, dates as YYYY-MM-DD. Rule engine and rules are
//   included below (PosRules). The tagger is loaded from vendor/wink-bundle.min.js
//   (override with window.WINK_BUNDLE_URL).
// - Paragraphs rebuilt from PDF.js items, so sentences wrapped over two lines are
//   checked whole; headings vs body decided by font size (rule `scope`).
// - Highlights use measured glyph widths (also fixes regex-rule highlights).
// - Multi-line highlights in the viewer and in the exported PDF.
// - Optional Vale server: set window.VALE_API_URL (e.g. "/api/vale").

// Browser-side grammar rules on wink-nlp part-of-speech tags.
// No backend: the tagger runs in the page (wink-nlp + wink-eng-lite-web-model, MIT).
//
// Rules are data, in the spirit of Vale's `sequence` checks:
//   kind: "sequence"  tokens: [{ text, pos, negate }]   consecutive tokens in one sentence
//         text: regex on the token text (case-insensitive), pos: regex on the UPOS tag
//         (ADJ ADP ADV AUX CCONJ DET INTJ NOUN NUM PART PRON PROPN PUNCT SCONJ SYM VERB X)
//   kind: "entity"    entity: "DATE" | "TIME" | ...   text: regex on the entity text
//   scope: "body" | "heading" | "all"   (paragraph role decided from font size)
//   suggestion: "$1-$2 $3" ($n = n-th matched token) or "{iso_date}"
(function (root) {
  const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";

  const DEFAULT_POS_RULES = [
    {
      id: "pos-compound-modifier", kind: "sequence", scope: "body",
      category: "hyphenation_terminology", severity: "minor", enabled: true,
      name: "Chicago 7.85 — Hyphenate compound modifier before a noun (POS)",
      tokens: [
        { text: "^(high|low|long|short|full|real|wide|fine|open|closed)$", pos: "^ADJ$" },
        { text: "^(voltage|frequency|resolution|speed|temperature|power|pressure|precision|range|term|time|scale|loop|band)$", pos: "^NOUN$" },
        { pos: "^(NOUN|PROPN)$" },
      ],
      suggestion: "$1-$2 $3",
    },
    {
      id: "pos-passive-voice", kind: "sequence", scope: "body",
      category: "grammar", severity: "minor", enabled: true,
      name: "Passive voice — use active voice when the actor matters (POS)",
      tokens: [
        { text: "^(am|is|are|was|were|be|been|being)$", pos: "^AUX$" },
        { pos: "^VERB$", text: "ing$", negate: true },
      ],
      suggestion: "(rewrite in active voice)",
    },
    {
      id: "pos-date-iso", kind: "entity", entity: "DATE", scope: "all",
      category: "numbers_abbreviations", severity: "minor", enabled: true,
      name: "Team Manual Standard — Dates as YYYY-MM-DD (date recognition)",
      text: `^(${MONTHS})\\s+\\d{1,2},?\\s+\\d{4}$|^\\d{1,2}\\s+(${MONTHS})\\s+\\d{4}$`,
      suggestion: "{iso_date}",
    },
  ];

  function isoDate(text) {
    const m = new RegExp(`(${MONTHS})\\s+(\\d{1,2}),?\\s+(\\d{4})|(\\d{1,2})\\s+(${MONTHS})\\s+(\\d{4})`, "i").exec(text);
    if (!m) return "(use YYYY-MM-DD)";
    const month = m[1] || m[5], day = m[2] || m[4], year = m[3] || m[6];
    const idx = MONTHS.split("|").findIndex((x) => x.toLowerCase() === month.toLowerCase()) + 1;
    return `${year}-${String(idx).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function compile(rules) {
    return rules.filter((r) => r.enabled !== false).map((r) => ({
      ...r,
      _tokens: (r.tokens || []).map((t) => ({
        textRe: t.text ? new RegExp(t.text, "i") : null,
        posRe: t.pos ? new RegExp(t.pos) : null,
        negate: !!t.negate,
      })),
      _textRe: r.text && r.kind === "entity" ? new RegExp(r.text, "i") : null,
    }));
  }

  function tokenMatches(spec, tok) {
    const posOk = !spec.posRe || spec.posRe.test(tok.pos);
    const textHit = !spec.textRe || spec.textRe.test(tok.value);
    // negate applies to the text test: "a VERB whose text does NOT end in -ing"
    return posOk && (spec.negate ? !textHit : textHit);
  }

  // Tag one paragraph. Returns tokens with character offsets into `text`.
  function analyze(nlp, text) {
    const its = nlp.its;
    const doc = nlp.readDoc(text);
    const tokens = [];
    let pos = 0;
    doc.tokens().each((t) => {
      const value = t.out(its.value);
      // Locate the token in the original text (offsets are needed for highlights).
      const at = text.indexOf(value, pos);
      const start = at >= 0 ? at : pos + t.out(its.precedingSpaces).length;
      tokens.push({ value, pos: t.out(its.pos), start, end: start + value.length });
      pos = start + value.length;
    });
    const sentences = [];
    doc.sentences().each((s) => { const [a, b] = s.out(its.span); sentences.push([a, b]); });
    const entities = [];
    doc.entities().each((e) => {
      const [a, b] = e.out(its.span);
      entities.push({ type: e.out(its.type), start: tokens[a].start, end: tokens[b].end, a, b });
    });
    return { tokens, sentences, entities };
  }

  function fill(template, groups, matched) {
    if (template === "{iso_date}") return isoDate(matched);
    return template.replace(/\$(\d+)/g, (_, n) => groups[Number(n) - 1] ?? "");
  }

  // paragraphs: [{ text, role }]  ->  [{ paragraph, start, end, text, suggestion, rule }]
  function check(nlp, paragraphs, rules) {
    const compiled = compile(rules);
    const out = [];
    paragraphs.forEach((para, pi) => {
      const active = compiled.filter((r) => (r.scope || "body") === "all" || r.scope === para.role);
      if (!active.length || !para.text.trim()) return;
      const { tokens, sentences, entities } = analyze(nlp, para.text);
      for (const rule of active) {
        if (rule.kind === "entity") {
          for (const e of entities) {
            if (e.type !== rule.entity) continue;
            const t = para.text.slice(e.start, e.end);
            if (rule._textRe && !rule._textRe.test(t)) continue;
            out.push({ paragraph: pi, start: e.start, end: e.end, text: t, suggestion: fill(rule.suggestion, [], t), rule });
          }
          continue;
        }
        const n = rule._tokens.length;
        for (const [a, b] of sentences) {
          for (let i = a; i + n - 1 <= b; i++) {
            if (!rule._tokens.every((spec, k) => tokenMatches(spec, tokens[i + k]))) continue;
            const first = tokens[i], last = tokens[i + n - 1];
            const groups = tokens.slice(i, i + n).map((t) => t.value);
            out.push({ paragraph: pi, start: first.start, end: last.end,
              text: para.text.slice(first.start, last.end), suggestion: fill(rule.suggestion, groups), rule });
          }
        }
      }
    });
    return out;
  }

  const api = { DEFAULT_POS_RULES, check, analyze, isoDate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PosRules = api;
})(typeof window !== "undefined" ? window : globalThis);

// Client-side preview shim for TW/pdf_english_reviewer.
// - Intercepts PDF upload and renders via PDF.js
// - Saves PDFs to IndexedDB (blob) + localStorage (metadata) → Workspaces tab
// - Runs simple rule matching (typo, spacing) against PDF text layer
// - Excludes text within 2.5cm top/bottom margin (header/footer)
// - Team Manual Standard tab becomes a rule editor (add/edit/delete/toggle)
// - Export the original PDF with highlight comments for suggestions
// - Grammar rules on part-of-speech tags, run in the browser (wink-nlp, no backend):
//   paragraphs rebuilt from PDF.js items, headings/body split by font size
// - Optional: sends the PDF to a Vale server (review_server.py / backend /api/vale)

(function () {
  //
  // ─── Config ─────────────────────────────────────────────────────────────
  //
  const PDFJS_VERSION = "3.11.174";
  const PDFJS_SOURCES = [
    `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build`,
    `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build`,
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`,
  ];
  const PDFLIB_URL = "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js";

  // Vale server (review_server.py). Override before this script loads:
  //   <script>window.VALE_API_URL = "http://my-host:5001/api/vale";</script>
  //   <script>window.VALE_ENABLED = false;</script>
  // Vale runs only when a server URL is configured (window.VALE_API_URL).
  const VALE_API_URL = window.VALE_API_URL || "http://127.0.0.1:5001/api/vale";
  const VALE_ENABLED = window.VALE_ENABLED ?? Boolean(window.VALE_API_URL);

  const POS_TAGS = ["ADJ", "ADP", "ADV", "AUX", "CCONJ", "DET", "INTJ", "NOUN", "NUM",
    "PART", "PRON", "PROPN", "PUNCT", "SCONJ", "SYM", "VERB", "X"];
  const WINK_BUNDLE_URL = window.WINK_BUNDLE_URL || "vendor/wink-bundle.min.js";
  const VALE_STYLES = window.VALE_STYLES || "EnTech";
  const VALE_TIMEOUT_MS = window.VALE_TIMEOUT_MS || 10 * 60 * 1000;

  const WS_STORAGE_KEY = "tw-demo-workspaces-v1";
  const REVIEW_STORAGE_PREFIX = "tw-demo-review-v1:";
  const RULES_STORAGE_KEY = "tw-demo-rules-v4";
  const RULES_MIGRATION_KEY = "tw-demo-rules-migration-v5";
  const RULES_ADDITION_KEY = "tw-demo-rules-addition-v6";
  const RULES_EXPANSION_KEY = "tw-demo-rules-expansion-v7";
  const RULES_EXPANSION_2026_KEY = "tw-demo-rules-expansion-v8";
  const TABLE_HEADER_RULE_KEY = "tw-demo-rules-table-header-v9";
  const RULES_CMOS17_KEY = "tw-demo-rules-cmos17-v9";
  const RULES_CMOS17_V2_KEY = "tw-demo-rules-cmos17-v10";
  const RULES_POS_KEY = "tw-demo-rules-pos-v11";
  const RULES_POS_V12_KEY = "tw-demo-rules-pos-v12";
  const RULES_FIX_V13_KEY = "tw-demo-rules-fix-v13";
  const IDB_NAME = "tw-demo-pdf-store";
  const IDB_STORE = "pdfs";

  // 2.5 cm margin (top and bottom) excluded from review — headers/footers.
  const MARGIN_CM = 2.5;
  const MARGIN_PT = MARGIN_CM * 72 / 2.54; // ≈ 70.87 pt

  // Chicago rules declared later; forward reference resolved by defining
  // DEFAULT_RULES via a function call after CHICAGO_RULES.
  let DEFAULT_RULES; // filled after CHICAGO_RULES declaration
  const _BASE_RULES = [
    // Common English typos.
    { id: "typo-teh",     category: "typo", name: "teh → the",           pattern: "\\bteh\\b",        flags: "gi", replacement: "the",     severity: "minor", enabled: true },
    { id: "typo-adress",  category: "typo", name: "adress → address",    pattern: "\\badress\\b",     flags: "gi", replacement: "address", severity: "minor", enabled: true },
    { id: "typo-recieve", category: "typo", name: "recieve → receive",   pattern: "\\brecieve\\b",    flags: "gi", replacement: "receive", severity: "minor", enabled: true },
    { id: "typo-seperate",category: "typo", name: "seperate → separate", pattern: "\\bseperate\\b",   flags: "gi", replacement: "separate",severity: "minor", enabled: true },
    { id: "typo-occured", category: "typo", name: "occured → occurred",  pattern: "\\boccured\\b",    flags: "gi", replacement: "occurred",severity: "minor", enabled: true },
    { id: "typo-untill",  category: "typo", name: "untill → until",      pattern: "\\buntill\\b",     flags: "gi", replacement: "until",   severity: "minor", enabled: true },
    { id: "typo-alot",    category: "typo", name: "alot → a lot",        pattern: "\\balot\\b",       flags: "gi", replacement: "a lot",   severity: "minor", enabled: true },
    { id: "typo-thier",   category: "typo", name: "thier → their",       pattern: "\\bthier\\b",      flags: "gi", replacement: "their",   severity: "minor", enabled: true },
    // Spacing.
    { id: "space-double", category: "spacing", name: "Double space",        pattern: "  +",             flags: "g", replacement: " ", severity: "minor", enabled: true },
  ];

  const SEVERITY_STYLES = {
    critical: { fill: "rgba(239, 68, 68, 0.30)",  border: "#ef4444", label: "Critical" },
    major:    { fill: "rgba(249, 115, 22, 0.30)", border: "#f97316", label: "Major" },
    minor:    { fill: "rgba(234, 179, 8, 0.35)",  border: "#eab308", label: "Minor" },
  };
  const CATEGORY_LABELS = {
    typo: "Typo", spacing: "Spacing", punctuation: "Punctuation", grammar: "Grammar",
    capitalization: "Capitalization", numbers_abbreviations: "Numbers & abbreviations",
    hyphenation_terminology: "Hyphenation & terminology", custom: "Custom",
  };
  const CATEGORY_COLORS = {
    typo: "#f59e0b", spacing: "#3b82f6", custom: "#8b5cf6",
    punctuation: "#0ea5e9", grammar: "#a855f7", capitalization: "#14b8a6",
    numbers_abbreviations: "#f43f5e", hyphenation_terminology: "#eab308",
    style: "#64748b", analysis: "#10b981",
  };

  // Hand-curated Chicago Manual of Style rules (pilot). These are local defaults,
  // not downloaded from Chicago or pinned to a single manual edition.
  // Regex-implementable rules are enabled by default; NLP/parser/context-only
  // rules are added as disabled with a placeholder pattern so users see them
  // in the editor and can enable or refine.
  const CHICAGO_RULES = [
    { id: "chicago-01-double-space",   category: "punctuation", name: "Chicago 6.7 — One space after sentence-ending punctuation",
      pattern: "([.!?])  +", flags: "g", replacement: "$1 ", severity: "minor", enabled: true },
    { id: "chicago-02-serial-comma",   category: "punctuation", name: "Chicago 6.19 — Serial (Oxford) comma",
      pattern: "(?<!(?:^|[.!?]\\s)(?:After|Before|During|When|While|If|Once|Since|Because|Although|In|On|At|For|With|By|To|From|Under|Without)\\b[^,.!?]*)\\b(\\w+),\\s+(\\w+)\\s+(and|or)\\s+(\\w+)",
      flags: "g", replacement: "$1, $2, $3 $4", severity: "minor", enabled: true, pos: "NOUN|PROPN NOUN|PROPN CCONJ NOUN|PROPN" },
    { id: "chicago-04-comma-splice",   category: "grammar", name: "Chicago 6.23 — Comma splice between independent clauses (heuristic)",
      pattern: "\\b(is|are|was|were|has|have|had|will)\\s+\\w+[^.!?]{0,60},\\s+(it|this|that|these|those|they|we|you|he|she)\\s+(is|are|was|were|has|have|had|will)\\b",
      flags: "gi", replacement: ". (start new sentence)", severity: "major", enabled: false },
    { id: "chicago-05-cap-after-colon",category: "capitalization", name: "Chicago 6.63 — Capitalize a complete sentence after a colon",
      pattern: ":\\s+([a-z])", flags: "g", replacement: ": (capitalize)", severity: "minor", enabled: false },
    { id: "chicago-10-list-punct",     category: "punctuation", name: "Chicago 6.130 — List items with inconsistent punctuation (heuristic)",
      pattern: "(^|\\n)\\s*[-•*]\\s+[a-z]",
      flags: "gm", replacement: "$&", severity: "minor", enabled: false },
    // POS condition: first word adjective-like, then a noun, then the noun it modifies.
    // Rejects "at high speed for", "low frequency and", "high resolution is" etc.
    { id: "chicago-11-hyphen-modifier",category: "hyphenation_terminology", name: "Chicago 7.85 — Hyphenate compound modifier before noun",
      pattern: "\\b(high|low|long|short|full|part|real|multi|open|closed|wide|narrow|fine|coarse)\\s+(speed|resolution|term|scale|frequency|time|source|purpose|loop|range|band|precision|grained|voltage|power|pressure|temperature)\\s+(\\w+)",
      flags: "gi", replacement: "$1-$2 $3", severity: "minor", enabled: true, pos: "ADJ|NOUN|X NOUN NOUN|PROPN" },
    { id: "chicago-12-no-hyphen-ly",   category: "hyphenation_terminology", name: "Chicago 7.86 — Do not hyphenate an -ly adverb compound",
      pattern: "\\b(\\w+ly)-(\\w+)", flags: "g", replacement: "$1 $2", severity: "minor", enabled: true },
    { id: "chicago-13-suspended-hyphen",category:"hyphenation_terminology", name: "Chicago 7.88 — Suspended hyphens in shared compounds (heuristic)",
      pattern: "\\b(low|high|short|long|left|right|up|down)\\s+and\\s+(low|high|short|long|left|right|up|down)-(\\w+)",
      flags: "gi", replacement: "$1- and $2-$3", severity: "minor", enabled: false },
    { id: "chicago-15-ui-capitalization",category: "hyphenation_terminology", name: "Chicago 8.155 — UI action word capitalization (heuristic)",
      pattern: "\\b(click|press|select|tap|choose)\\s+(ok|cancel|submit|apply|save|delete|close|reset|next|previous|back|help|open|edit)\\b",
      flags: "g", replacement: "$1 (capitalize $2)", severity: "minor", enabled: false },
    { id: "chicago-16-subject-verb",   category: "grammar", name: "Chicago 5.140 — Subject-verb agreement (heuristic)",
      pattern: "\\b(they|we|you|these|those)\\s+(is|has|was)\\b|\\b(he|she|it|this|that)\\s+(are|have|were)\\b",
      flags: "gi", replacement: "(check verb form)", severity: "major", enabled: false },
    { id: "chicago-17-pronoun-agree",  category: "grammar", name: "Chicago 5.30 — Pronoun-antecedent agreement (heuristic)",
      pattern: "\\b(each|every|either|neither)\\s+\\w+(?:\\s+\\w+)?\\s+(they|their|them)\\b",
      flags: "gi", replacement: "(consider singular pronoun)", severity: "major", enabled: false },
    { id: "chicago-18-dangling",       category: "grammar", name: "Chicago 5.115 — Dangling participial phrase (heuristic)",
      pattern: "^(While|After|Before|When|Having|Being|Using|Considering|Following)\\s+\\w+ing\\s+[\\w\\s]{3,40},\\s+(the|it|this|these|that)\\s+\\w+",
      flags: "gm", replacement: "$&", severity: "major", enabled: false },
    { id: "chicago-19-tense",          category: "grammar", name: "Chicago 5.132 — Mixed verb tense (heuristic)",
      pattern: "\\b(will|shall)\\s+\\w+\\b[^.!?]{0,50}\\b(was|were|had)\\b",
      flags: "gi", replacement: "(use consistent tense)", severity: "minor", enabled: false },
    { id: "chicago-20-parallel-lists", category: "grammar", name: "Chicago 6.130 — Non-parallel list items (heuristic)",
      pattern: "(?:^|\\n)\\s*\\d+\\.\\s+\\w+ing\\b[^\\n]*\\n\\s*\\d+\\.\\s+(?!\\w+ing\\b)[A-Za-z]\\w+",
      flags: "gm", replacement: "(use parallel forms)", severity: "minor", enabled: false },
    { id: "chicago-21-colon-space", category: "punctuation", name: "Chicago 6.66 — Space after a colon",
      pattern: ":([A-Za-z])", flags: "g", replacement: ": $1", severity: "minor", enabled: true },
    { id: "chicago-22-em-dash-space", category: "punctuation", name: "Chicago 6.91 — Close up spaces around an em dash",
      pattern: "([A-Za-z])(?: +— *| *— +)([A-Za-z])", flags: "g", replacement: "$1—$2", severity: "minor", enabled: true },
    { id: "chicago-23-decimal-zero", category: "numbers_abbreviations", name: "Chicago 9.21 — Zero before a decimal fraction",
      pattern: "(?<![\\w.])\\.(\\d+)\\b", flags: "g", replacement: "0.$1", severity: "minor", enabled: true },
    { id: "chicago-24-number-range", category: "numbers_abbreviations", name: "Chicago 9.62 — En dash in page and figure ranges",
      pattern: "\\b(pages?|pp\\.?|figures?|figs?\\.?)\\s+(\\d+)-(\\d+)\\b", flags: "gi", replacement: "$1 $2–$3", severity: "minor", enabled: true },
    { id: "chicago-25-us-abbreviation", category: "numbers_abbreviations", name: "Chicago 10.37 — US without periods",
      pattern: "\\bU\\.S\\.(?=\\s|[),;:]|$)", flags: "g", replacement: "US", severity: "minor", enabled: true },
    { id: "chicago-26-date-day-comma", category: "punctuation", name: "Chicago 6.41 — Comma after the day in a month-day-year date",
      pattern: "\\b(January|February|March|April|May|June|July|August|September|October|November|December)\\s+(\\d{1,2})\\s+((?:19|20)\\d{2})\\b", flags: "g", replacement: "$1 $2, $3", severity: "minor", enabled: true },
    { id: "chicago-27-date-year-comma", category: "punctuation", name: "Chicago 6.41 — Comma after the year when a date continues a sentence",
      pattern: "\\b(January|February|March|April|May|June|July|August|September|October|November|December)\\s+(\\d{1,2}),\\s+((?:19|20)\\d{2})\\s+([a-z])", flags: "g", replacement: "$1 $2, $3, $4", severity: "minor", enabled: true },
    { id: "chicago-28-for-example-comma", category: "punctuation", name: "Chicago 6.54 — Comma after introductory 'for example'",
      pattern: "^For example\\s+([A-Za-z])", flags: "g", replacement: "For example, $1", severity: "minor", enabled: true },
    { id: "chicago-29-year-range", category: "numbers_abbreviations", name: "Chicago 6.83 — En dash in labeled year ranges",
      pattern: "\\b(years?)\\s+((?:19|20)\\d{2})-((?:19|20)\\d{2})\\b", flags: "gi", replacement: "$1 $2–$3", severity: "minor", enabled: true },
    { id: "chicago-30-slash-alternatives", category: "punctuation", name: "Chicago 6.113 — No spaces in single-word slash alternatives",
      pattern: "\\b(on|off|yes|no|input|output|read|write|start|stop|open|closed|true|false)\\s+/\\s+(on|off|yes|no|input|output|read|write|start|stop|open|closed|true|false)\\b", flags: "gi", replacement: "$1/$2", severity: "minor", enabled: true },
    { id: "chicago-31-punctuation-space", category: "punctuation", name: "Chicago 6.127 — No space before a comma or semicolon",
      pattern: "([A-Za-z]) +([,;])", flags: "g", replacement: "$1$2", severity: "minor", enabled: true },
    { id: "chicago-32-website", category: "hyphenation_terminology", name: "Chicago 7.85 — Website as one word",
      pattern: "\\b([Ww])eb[ -]+site(s)?\\b", flags: "g", replacement: "$1ebsite$2", severity: "minor", enabled: true },
    { id: "chicago-33-percent-range", category: "numbers_abbreviations", name: "Chicago 9.19 — Repeat percent sign in a range",
      pattern: "\\b(\\d+(?:\\.\\d+)?)\\s*[-–]\\s*(\\d+(?:\\.\\d+)?)%", flags: "g", replacement: "$1%–$2%", severity: "minor", enabled: true },
    { id: "chicago-34-kilogram-case", category: "numbers_abbreviations", name: "Chicago 10.58 — Lowercase kg unit symbol",
      pattern: "\\b(\\d+(?:\\.\\d+)?)\\s+Kg\\b", flags: "g", replacement: "$1 kg", severity: "minor", enabled: true },
    { id: "chicago-35-si-plural", category: "numbers_abbreviations", name: "Chicago 10.59 — Do not pluralize SI unit symbols",
      pattern: "\\b(\\d+(?:\\.\\d+)?)\\s+(kg|mg|km|cm|mm|nm)s\\b", flags: "g", replacement: "$1 $2", severity: "minor", enabled: true },
    { id: "chicago-36-quote-comma", category: "punctuation", name: "Chicago 6.9 — Comma inside closing quotation mark",
      pattern: '"([^"\\n]+)",', flags: "g", replacement: '"$1,"', severity: "minor", enabled: true },
    { id: "chicago-37-quote-period", category: "punctuation", name: "Chicago 6.9 — Period inside closing quotation mark",
      pattern: '"([^"\\n]+)"\\.', flags: "g", replacement: '"$1."', severity: "minor", enabled: true },
    { id: "chicago-38-yes-comma", category: "punctuation", name: "Chicago 6.37 — Comma after introductory Yes",
      pattern: "^Yes\\s+([a-z])", flags: "g", replacement: "Yes, $1", severity: "minor", enabled: true },
    { id: "chicago-39-no-comma", category: "punctuation", name: "Chicago 6.37 — Comma after introductory No",
      pattern: "^No\\s+(I|we|you|he|she|it|they)\\b", flags: "g", replacement: "No, $1", severity: "minor", enabled: true },
    { id: "chicago-40-oh-comma", category: "punctuation", name: "Chicago 6.38 — Comma after introductory Oh",
      pattern: "^Oh\\s+([a-z])", flags: "g", replacement: "Oh, $1", severity: "minor", enabled: true },
    { id: "chicago-41-ah-comma", category: "punctuation", name: "Chicago 6.38 — Comma after introductory Ah",
      pattern: "^Ah\\s+([a-z])", flags: "g", replacement: "Ah, $1", severity: "minor", enabled: true },
    { id: "chicago-42-namely-comma", category: "punctuation", name: "Chicago 6.54 — Comma after introductory Namely",
      pattern: "^Namely\\s+([a-z])", flags: "g", replacement: "Namely, $1", severity: "minor", enabled: true },
    { id: "chicago-43-that-is-comma", category: "punctuation", name: "Chicago 6.54 — Comma after introductory That is",
      pattern: "^That is\\s+([a-z])", flags: "g", replacement: "That is, $1", severity: "minor", enabled: true },
    { id: "chicago-44-khz-case", category: "numbers_abbreviations", name: "Chicago 10.58 — Correct kHz unit capitalization",
      pattern: "\\b(\\d+(?:\\.\\d+)?)\\s+KHz\\b", flags: "g", replacement: "$1 kHz", severity: "minor", enabled: true },
    { id: "chicago-45-mpa-case", category: "numbers_abbreviations", name: "Chicago 10.58 — Correct MPa unit capitalization",
      pattern: "\\b(\\d+(?:\\.\\d+)?)\\s+Mpa\\b", flags: "g", replacement: "$1 MPa", severity: "minor", enabled: true },
    { id: "chicago-46-kpa-uppercase", category: "numbers_abbreviations", name: "Chicago 10.58 — Correct all-capitals KPA unit symbol",
      pattern: "\\b(\\d+(?:\\.\\d+)?)\\s+KPA\\b", flags: "g", replacement: "$1 kPa", severity: "minor", enabled: true },
    { id: "chicago-47-section-range", category: "numbers_abbreviations", name: "Chicago 6.83 — En dash in numbered section ranges",
      pattern: "\\b(sections?|secs?\\.?)\\s+(\\d+)-(\\d+)\\b", flags: "gi", replacement: "$1 $2–$3", severity: "minor", enabled: true },
    { id: "chicago-48-chapter-range", category: "numbers_abbreviations", name: "Chicago 6.83 — En dash in numbered chapter ranges",
      pattern: "\\b(chapters?|chaps?\\.?)\\s+(\\d+)-(\\d+)\\b", flags: "gi", replacement: "$1 $2–$3", severity: "minor", enabled: true },
    { id: "chicago-49-decade-apostrophe", category: "numbers_abbreviations", name: "Chicago 9.35 — Decades without an apostrophe",
      pattern: "\\b((?:18|19|20)\\d0)'s\\b", flags: "g", replacement: "$1s", severity: "minor", enabled: true },
    { id: "chicago-50-percent-space", category: "numbers_abbreviations", name: "Chicago 9.20 — Close percent symbol to numeral",
      pattern: "\\b(\\d+(?:\\.\\d+)?) +%", flags: "g", replacement: "$1%", severity: "minor", enabled: true },
    { id: "chicago-51-ratio-space", category: "numbers_abbreviations", name: "Chicago 9.60 — Close up numerical ratios",
      pattern: "\\b(\\d+) +: +(\\d+)\\b", flags: "g", replacement: "$1:$2", severity: "minor", enabled: true },
    { id: "chicago-52-kpa-case", category: "numbers_abbreviations", name: "Chicago 10.58 — Correct kPa unit capitalization",
      pattern: "\\b(\\d+(?:\\.\\d+)?)\\s+KPa\\b", flags: "g", replacement: "$1 kPa", severity: "minor", enabled: true },
    { id: "chicago-53-mhz-case", category: "numbers_abbreviations", name: "Chicago 10.58 — Correct MHz unit capitalization",
      pattern: "\\b(\\d+(?:\\.\\d+)?)\\s+Mhz\\b", flags: "g", replacement: "$1 MHz", severity: "minor", enabled: true },
    { id: "chicago-54-ghz-case", category: "numbers_abbreviations", name: "Chicago 10.58 — Correct GHz unit capitalization",
      pattern: "\\b(\\d+(?:\\.\\d+)?)\\s+Ghz\\b", flags: "g", replacement: "$1 GHz", severity: "minor", enabled: true },
    { id: "chicago-55-period-space", category: "punctuation", name: "Chicago 6.127 — No space before a sentence period",
      pattern: "([A-Za-z]) +\\.(?=\\s|$)", flags: "g", replacement: "$1.", severity: "minor", enabled: true },
    // CMOS 18 guidance: abbreviations, dates, punctuation, plurals, and current spelling.
    { id: "chicago-56-am-time", category: "numbers_abbreviations", name: "Chicago 10.46 — Lowercase a.m. after a time", pattern: "\\b(\\d{1,2}(?::\\d{2})?)\\s*A\\.?M\\.?(?=\\s|[),;.!?]|$)", flags: "g", replacement: "$1 a.m.", severity: "minor", enabled: true },
    { id: "chicago-57-pm-time", category: "numbers_abbreviations", name: "Chicago 10.46 — Lowercase p.m. after a time", pattern: "\\b(\\d{1,2}(?::\\d{2})?)\\s*P\\.?M\\.?(?=\\s|[),;.!?]|$)", flags: "g", replacement: "$1 p.m.", severity: "minor", enabled: true },
    { id: "chicago-58-email", category: "hyphenation_terminology", name: "Chicago — Email without a hyphen", pattern: "\\b([Ee])-mail\\b", flags: "g", replacement: "$1mail", severity: "minor", enabled: true },
    { id: "chicago-59-esports", category: "hyphenation_terminology", name: "Chicago — Esports without a hyphen", pattern: "\\b([Ee])-sports\\b", flags: "g", replacement: "$1sports", severity: "minor", enabled: true },
    { id: "chicago-60-eg-comma", category: "punctuation", name: "Chicago — Comma after e.g.", pattern: "\\be\\.g\\.(?!,)(?=\\s+[A-Za-z])", flags: "gi", replacement: "e.g.,", severity: "minor", enabled: true },
    { id: "chicago-61-ie-comma", category: "punctuation", name: "Chicago — Comma after i.e.", pattern: "\\bi\\.e\\.(?!,)(?=\\s+[A-Za-z])", flags: "gi", replacement: "i.e.,", severity: "minor", enabled: true },
    { id: "chicago-62-etc-period", category: "numbers_abbreviations", name: "Chicago — Period after etc.", pattern: "\\betc(?=\\s*[,;)]|$)", flags: "gi", replacement: "etc.", severity: "minor", enabled: true },
    { id: "chicago-63-dc", category: "numbers_abbreviations", name: "Chicago — DC without periods", pattern: "\\bD\\.C\\.(?=\\s|[),;:]|$)", flags: "g", replacement: "DC", severity: "minor", enabled: true },
    { id: "chicago-64-uk", category: "numbers_abbreviations", name: "Chicago — UK without periods", pattern: "\\bU\\.K\\.(?=\\s|[),;:]|$)", flags: "g", replacement: "UK", severity: "minor", enabled: true },
    { id: "chicago-65-eu", category: "numbers_abbreviations", name: "Chicago — EU without periods", pattern: "\\bE\\.U\\.(?=\\s|[),;:]|$)", flags: "g", replacement: "EU", severity: "minor", enabled: true },
    { id: "chicago-66-un", category: "numbers_abbreviations", name: "Chicago — UN without periods", pattern: "\\bU\\.N\\.(?=\\s|[),;:]|$)", flags: "g", replacement: "UN", severity: "minor", enabled: true },
    { id: "chicago-67-month-day-cardinal", category: "numbers_abbreviations", name: "Chicago 9.33 — Cardinal day after a month", pattern: "\\b(January|February|March|April|May|June|July|August|September|October|November|December)\\s+(\\d{1,2})(?:st|nd|rd|th)\\b", flags: "g", replacement: "$1 $2", severity: "minor", enabled: true },
    { id: "chicago-68-ellipsis-before", category: "punctuation", name: "Chicago 12.68 — Space before a mid-sentence ellipsis", pattern: "([A-Za-z])…", flags: "g", replacement: "$1 …", severity: "minor", enabled: true },
    { id: "chicago-69-ellipsis-after", category: "punctuation", name: "Chicago 12.68 — Space after a mid-sentence ellipsis", pattern: "…([A-Za-z])", flags: "g", replacement: "… $1", severity: "minor", enabled: true },
    { id: "chicago-70-question-space", category: "punctuation", name: "Chicago 6.129 — No space before a question mark", pattern: "([A-Za-z]) +\\?", flags: "g", replacement: "$1?", severity: "minor", enabled: true },
    { id: "chicago-71-exclamation-space", category: "punctuation", name: "Chicago 6.129 — No space before an exclamation point", pattern: "([A-Za-z]) +!", flags: "g", replacement: "$1!", severity: "minor", enabled: true },
    { id: "chicago-72-acronym-plural", category: "numbers_abbreviations", name: "Chicago 7.15 — No apostrophe in an acronym plural (review context)", pattern: "\\b([A-Z]{2,})['’]s\\b", flags: "g", replacement: "$1s", severity: "minor", enabled: false },
    { id: "chicago-73-internet", category: "capitalization", name: "Chicago — Lowercase generic internet (review proper names)", pattern: "\\bInternet\\b", flags: "g", replacement: "internet", severity: "minor", enabled: false },
    { id: "chicago-74-seasons", category: "capitalization", name: "Chicago — Lowercase generic seasons (review titles)", pattern: "\\b(Spring|Summer|Autumn|Fall|Winter)\\b", flags: "g", replacement: "(lowercase generic season)", severity: "minor", enabled: false },
    { id: "chicago-75-titles", category: "capitalization", name: "Chicago — Lowercase generic office titles after the name (review context)", pattern: "\\b(President|Secretary|Director) of (?:the|a)\\b", flags: "g", replacement: "(lowercase office title)", severity: "minor", enabled: false },
    // ── CMOS 17-labelled rules imported from an earlier duplicate script; cited source file is absent ──
    // Numbers
    { id: "chicago-76-from-number-range",   category: "numbers_abbreviations", name: "Chicago 9.60 — Use 'to' not a dash after 'from' in a number range",
      pattern: "\\bfrom\\s+(\\d+)\\s*[-–]\\s*(\\d+)\\b", flags: "g", replacement: "from $1 to $2", severity: "minor", enabled: true },
    { id: "chicago-77-between-number-range", category: "numbers_abbreviations", name: "Chicago 9.60 — Use 'and' not a dash after 'between' in a number range",
      pattern: "\\bbetween\\s+(\\d+)\\s*[-–]\\s*(\\d+)\\b", flags: "g", replacement: "between $1 and $2", severity: "minor", enabled: true },
    // Academic degrees without periods (CMOS 17 §10.21)
    { id: "chicago-78-phd-no-periods",  category: "numbers_abbreviations", name: "Chicago 10.21 — PhD without periods",
      pattern: "\\bPh\\.D\\.(?=\\s|[),;:]|$)", flags: "g", replacement: "PhD", severity: "minor", enabled: true },
    { id: "chicago-79-md-no-periods",   category: "numbers_abbreviations", name: "Chicago 10.21 — MD without periods",
      pattern: "\\bM\\.D\\.(?=\\s|[),;:]|$)", flags: "g", replacement: "MD", severity: "minor", enabled: true },
    { id: "chicago-80-ba-no-periods",   category: "numbers_abbreviations", name: "Chicago 10.21 — BA without periods",
      pattern: "\\bB\\.A\\.(?=\\s|[),;:]|$)", flags: "g", replacement: "BA", severity: "minor", enabled: true },
    { id: "chicago-81-ma-no-periods",   category: "numbers_abbreviations", name: "Chicago 10.21 — MA without periods",
      pattern: "\\bM\\.A\\.(?=\\s|[),;:]|$)", flags: "g", replacement: "MA", severity: "minor", enabled: true },
    { id: "chicago-82-bs-no-periods",   category: "numbers_abbreviations", name: "Chicago 10.21 — BS without periods",
      pattern: "\\bB\\.S\\.(?=\\s|[),;:]|$)", flags: "g", replacement: "BS", severity: "minor", enabled: true },
    { id: "chicago-83-ms-no-periods",   category: "numbers_abbreviations", name: "Chicago 10.21 — MS without periods",
      pattern: "\\bM\\.S\\.(?=\\s|[),;:]|$)", flags: "g", replacement: "MS", severity: "minor", enabled: true },
    { id: "chicago-84-jd-no-periods",   category: "numbers_abbreviations", name: "Chicago 10.21 — JD without periods",
      pattern: "\\bJ\\.D\\.(?=\\s|[),;:]|$)", flags: "g", replacement: "JD", severity: "minor", enabled: true },
    // Punctuation
    { id: "chicago-85-comma-before-etc", category: "punctuation", name: "Chicago 6.20 — Comma before etc. in a series",
      pattern: "([A-Za-z0-9])\\s+etc\\.", flags: "g", replacement: "$1, etc.", severity: "minor", enabled: true },
    // Disabled / heuristic — require user review
    { id: "chicago-86-ordinal-2d",       category: "numbers_abbreviations", name: "Chicago 9.6 — Use 2nd/22nd not 2d/22d for ordinals (review: 12d is exception)",
      pattern: "\\b(\\d*2)d\\b", flags: "g", replacement: "$1nd", severity: "minor", enabled: false },
    { id: "chicago-87-thousands-comma",  category: "numbers_abbreviations", name: "Chicago 9.55 — Comma separator in 4-digit numbers (heuristic; review page nums/years)",
      pattern: "\\b([1-9])(\\d{3})\\b(?!,)", flags: "g", replacement: "$1,$2", severity: "minor", enabled: false },
    // ── CMOS 17 rules (batch 2) — from chapters 1–5, 8, 11–15 ──────────────────
    // §13.61: [sic] must be in square brackets
    { id: "chicago-88-sic-brackets",     category: "punctuation", name: "Chicago 13.61 — [sic] in square brackets",
      pattern: "(?<!\\[)\\bsic\\b(?!\\])", flags: "gi", replacement: "[sic]", severity: "minor", enabled: true },
    // §14.29: Chicago 17 discourages ibid. — prefer shortened citation
    { id: "chicago-89-ibid-discouraged", category: "grammar", name: "Chicago 14.29 — ibid. discouraged; use shortened citation instead",
      pattern: "\\bibid\\.?", flags: "gi", replacement: "(use shortened citation — CMOS 14.30)", severity: "minor", enabled: false },
    // §14.47: cf. means "compare", not "see"
    { id: "chicago-90-cf-period",        category: "numbers_abbreviations", name: "Chicago 14.47 — cf. requires period; use only to mean 'compare'",
      pattern: "\\bcf\\b(?!\\.)", flags: "g", replacement: "cf.", severity: "minor", enabled: true },
    // §6.20 / §14.76: et al. must have period
    { id: "chicago-91-et-al-period",     category: "numbers_abbreviations", name: "Chicago 6.20 / 14.76 — et al. requires period",
      pattern: "\\bet al\\b(?!\\.)", flags: "gi", replacement: "et al.", severity: "minor", enabled: true },
    // §8.4: Space between initials in personal names (e.g., E.B. White → E. B. White)
    { id: "chicago-92-initials-space",   category: "spacing", name: "Chicago 8.4 — Space between initials in personal names",
      pattern: "\\b(?!(?:U\\.S|D\\.C|U\\.K|E\\.U|U\\.N|M\\.D|B\\.A|M\\.A|B\\.S|M\\.S|J\\.D)\\.)([A-Z]\\.)([A-Z]\\.)(?=\\s+[A-Z][a-z])", flags: "g", replacement: "$1 $2", severity: "minor", enabled: true },
    // §5.49: Possessive pronouns take no apostrophe (hers, theirs, yours, ours)
    { id: "chicago-93-possessive-pronoun", category: "grammar", name: "Chicago 5.49 — Possessive pronouns need no apostrophe",
      pattern: "\\b(her|their|your|our)'s\\b", flags: "gi", replacement: "$1s", severity: "minor", enabled: true },
    // §10.42: vs. requires period in regular text (v. in legal citations)
    { id: "chicago-94-vs-period",        category: "numbers_abbreviations", name: "Chicago 10.42 — vs. requires period in regular text",
      pattern: "\\bvs\\b(?!\\.)", flags: "g", replacement: "vs.", severity: "minor", enabled: true },
    // §15.25: Author-date parenthetical citation — no comma between author name and year
    { id: "chicago-95-author-date-comma", category: "numbers_abbreviations", name: "Chicago 15.25 — No comma between author name and year in parenthetical citation",
      pattern: "\\(([A-Z][a-z]+(?:\\s+et al\\.)?),\\s*((?:19|20)\\d{2}[a-z]?)\\)", flags: "g", replacement: "($1 $2)", severity: "minor", enabled: false },
    // §5.243: Double negative construction (heuristic; disabled for review)
    { id: "chicago-96-double-negative",  category: "grammar", name: "Chicago 5.243 — Double negative construction (heuristic)",
      pattern: "\\b(don't|doesn't|didn't|won't|wouldn't|can't|couldn't|isn't|aren't)\\b[^.!?]{0,60}\\b(nothing|nobody|nowhere|no one|never)\\b",
      flags: "gi", replacement: "(double negative — rewrite)", severity: "major", enabled: false },
  ];
  // Style-guide rules that need part-of-speech checks.
  const STYLE_RULES = [
    // Source: Google developer documentation style guide, "Use active voice"
    // (https://developers.google.com/style/voice). Passive is fine when the actor is
    // unknown or unimportant, so this is a minor suggestion.
    { id: "style-passive-voice", category: "grammar", name: "Google Developer Docs Style — Prefer active voice (passive voice detected)",
      pattern: "\\b(am|is|are|was|were|be|been|being)\\s+(?!\\w+ing\\b)(\\w+)\\b", flags: "gi",
      replacement: "(consider active voice)", severity: "minor", enabled: true, pos: "AUX VERB" },
    // Source: Google "Present tense" (https://developers.google.com/style/tense). Future
    // tense is fine for an action that really happens later, so this is a suggestion.
    { id: "style-future-tense", category: "grammar", name: "Google Developer Docs Style — Use present tense (future 'will' detected)",
      pattern: "\\b(will)\\s+(\\w+)\\b", flags: "gi",
      replacement: "(use present tense unless the action happens later)", severity: "minor", enabled: true, pos: "AUX VERB|AUX" },
    // Source: Google "Sentence structure" (https://developers.google.com/style/sentence-structure):
    // put the condition or goal before the instruction. "..." = any number of words.
    { id: "style-condition-first-if", category: "grammar", name: "Google Developer Docs Style — Put the condition before the instruction",
      pattern: "(?<=^|[.!?]\\s)[A-Z][^.!?]*?\\bif\\s+you\\b[^.!?]*", flags: "g",
      replacement: "(start with the condition: \"If you …, …\")", severity: "minor", enabled: true, pos: "VERB ... SCONJ PRON ..." },
    { id: "style-condition-first-see", category: "grammar", name: "Google Developer Docs Style — Put \"For more information\" first",
      pattern: "(?<=^|[.!?]\\s)(See|Refer to|Read)\\b[^.!?]*?\\bfor (?:more information|more details|details)\\b", flags: "g",
      replacement: "(start with: \"For more information, see …\")", severity: "minor", enabled: true, pos: "VERB ..." },
    // Goal after the instruction ("Press Start to begin the scan."). Off by default:
    // very common in procedures, and "to" is sometimes mis-tagged ("to low frequency").
    { id: "style-condition-first-to", category: "grammar", name: "Google Developer Docs Style — Put the goal before the instruction",
      pattern: "(?<=^|[.!?]\\s)[A-Z][^.!?]*?(?<!\\b(?:want|wants|need|needs|have|has|try|going|able|how)\\s)\\bto\\s+(?!(?:low|high|zero|maximum|minimum|full|default)\\b)\\w+[^.!?]*", flags: "g",
      replacement: "(start with the goal: \"To …, …\")", severity: "minor", enabled: false, pos: "VERB ... PART VERB ..." },
  ];
  const TEAM_RULES = [
    { id: "space-unit", category: "spacing", name: "Team Manual Standard — Space between numbers and units",
      pattern: "\\b(?!(?:1[89]|20)\\d0s\\b)(\\d+(?:\\.\\d+)?)(°C|°F|mm|cm|m|km|kg|g|mg|V|A|Hz|kHz|MHz|GHz|MPa|kPa|Pa|nm|um|μm|W|kW|s|ms|us|μs|ns)\\b", flags: "g", replacement: "$1 $2", severity: "minor", enabled: true },
    { id: "team-title-case", category: "capitalization", name: "Team Manual Standard-Title Case for headings, figure labels, table labels, and callout",
      pattern: "^(?:Figure|Fig\\.|Table)\\s+\\d+[.:]\\s+.+$", flags: "g", replacement: "(capitalize title words)", severity: "minor", enabled: true },
    { id: "team-table-header-case", category: "capitalization", name: "Team Manual Standard — Title Case for table headers only",
      pattern: "(table header identified by PDF layout)", flags: "g", replacement: "(capitalize table header words)", severity: "minor", enabled: true },
  ];
  DEFAULT_RULES = [..._BASE_RULES, ...CHICAGO_RULES, ...STYLE_RULES, ...TEAM_RULES];
  // Stored copies of rules before v11/v12/v13, used to upgrade only if not edited by user.
  // Before v13: Chicago 8.4 also matched U.S., D.C., M.D. ...; Chicago 9.6 used "$12nd"
  // (read as group 12, giving the suggestion "nd").
  const CHICAGO_92_V12_PATTERN = "\\b([A-Z]\\.)([A-Z]\\.)";
  const CHICAGO_86_V12_REPLACEMENT = "$12nd";
  // Before v13: the unit-spacing rule read a decade ("1990s") as number + "s" (seconds).
  const SPACE_UNIT_V12_PATTERN = "\\b(\\d+(?:\\.\\d+)?)(°C|°F|mm|cm|m|km|kg|g|mg|V|A|Hz|kHz|MHz|GHz|MPa|kPa|Pa|nm|um|μm|W|kW|s|ms|us|μs|ns)\\b";
  const CHICAGO_02_V11_PATTERN = "(\\w+),\\s+(\\w+)\\s+(and|or)\\s+(\\w+)";
  const CHICAGO_11_V10_PATTERN = "\\b(high|low|long|short|full|part|real|multi|open|closed|wide|narrow|fine|coarse)\\s+(speed|resolution|term|scale|frequency|time|source|purpose|loop|range|band|precision|grained)\\s+(\\w+)";
  const REMOVED_RULE_IDS = new Set(["chicago-03-intro-clause", "chicago-08-define-abbrev", "chicago-14-consistent-compound"]);
  const NEW_RULES = CHICAGO_RULES.filter((rule) => /^chicago-2[1-5]-/.test(rule.id));
  const ADDED_RULES = CHICAGO_RULES.filter((rule) => /^chicago-(?:2[6-9]|3[0-5])-/.test(rule.id));
  const EXPANDED_RULES = [...CHICAGO_RULES.filter((rule) => /^chicago-(?:3[6-9]|4\d|5[0-5])-/.test(rule.id)), ...TEAM_RULES];
  const EXPANDED_2026_RULES = CHICAGO_RULES.filter((rule) => /^chicago-(?:5[6-9]|6\d|7[0-5])-/.test(rule.id));
  const CMOS17_RULES = CHICAGO_RULES.filter((rule) => /^chicago-(?:7[6-9]|8[0-7])-/.test(rule.id));
  const CMOS17_V2_RULES = CHICAGO_RULES.filter((rule) => /^chicago-(?:8[8-9]|9[0-6])-/.test(rule.id));

  //
  // ─── PDF.js loader ─────────────────────────────────────────────────────
  //
  let pdfjsReady = null;
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Failed to load " + src));
      document.head.appendChild(s);
    });
  }
  async function ensurePdfjs() {
    if (pdfjsReady) return pdfjsReady;
    pdfjsReady = (async () => {
      let lastErr;
      for (const base of PDFJS_SOURCES) {
        try {
          await loadScript(`${base}/pdf.min.js`);
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${base}/pdf.worker.min.js`;
          return;
        } catch (err) { lastErr = err; console.warn("[demo] PDF.js load failed from", base, err); }
      }
      throw lastErr || new Error("All PDF.js CDNs failed");
    })();
    return pdfjsReady;
  }
  ensurePdfjs().catch((err) => console.warn("[demo] PDF.js preload failed:", err));

  let pdfLibReady = null;
  async function ensurePdfLib() {
    if (window.PDFLib?.PDFDocument) return;
    if (!pdfLibReady) pdfLibReady = loadScript(PDFLIB_URL).catch((err) => {
      pdfLibReady = null;
      throw err;
    });
    await pdfLibReady;
    if (!window.PDFLib?.PDFDocument) throw new Error("PDF annotation library is unavailable.");
  }

  //
  // ─── IndexedDB (PDF blobs) ─────────────────────────────────────────────
  //
  function idbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbPut(id, blob) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(blob, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async function idbGet(id) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbDelete(id) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  //
  // ─── Workspace metadata (localStorage) ─────────────────────────────────
  //
  function readWorkspaces() {
    try { return JSON.parse(localStorage.getItem(WS_STORAGE_KEY) || "[]"); }
    catch { return []; }
  }
  function writeWorkspaces(list) { localStorage.setItem(WS_STORAGE_KEY, JSON.stringify(list)); }
  function addWorkspaceMeta(meta) { const list = readWorkspaces(); list.unshift(meta); writeWorkspaces(list); }
  function removeWorkspaceMeta(id) { writeWorkspaces(readWorkspaces().filter((w) => w.id !== id)); }
  function reviewStorageKey(id) { return REVIEW_STORAGE_PREFIX + id; }
  function findingKey(finding) {
    return JSON.stringify([finding.page, finding.ruleId, finding.text, finding.bboxes || finding.bbox]);
  }
  function restoreReviewDecisions(findings, workspaceId) {
    if (!workspaceId) return findings;
    try {
      const saved = JSON.parse(localStorage.getItem(reviewStorageKey(workspaceId)) || "{}");
      for (const finding of findings) {
        const decision = saved[findingKey(finding)];
        if (!decision) continue;
        if (["accepted", "rejected"].includes(decision.status)) finding.status = decision.status;
        finding.reviewerComment = String(decision.reviewerComment || "");
      }
    } catch (error) { console.warn("[demo] review decisions could not be restored:", error); }
    return findings;
  }
  function saveReviewDecisions() {
    if (!viewerState.workspaceId) return;
    const saved = {};
    for (const finding of viewerState.findings) {
      if (finding.status === "pending" && !finding.reviewerComment) continue;
      saved[findingKey(finding)] = {
        status: finding.status,
        reviewerComment: finding.reviewerComment || "",
      };
    }
    try { localStorage.setItem(reviewStorageKey(viewerState.workspaceId), JSON.stringify(saved)); }
    catch (error) { console.warn("[demo] review decisions could not be saved:", error); }
  }

  function newId() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  //
  // ─── Rules storage (localStorage) ──────────────────────────────────────
  //
  function getRules() {
    try {
      const raw = localStorage.getItem(RULES_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      let rules = Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_RULES.slice();
      if (localStorage.getItem(RULES_MIGRATION_KEY) !== "done") {
        rules = rules.filter((rule) => !REMOVED_RULE_IDS.has(rule.id));
        const existingIds = new Set(rules.map((rule) => rule.id));
        rules.push(...NEW_RULES.filter((rule) => !existingIds.has(rule.id)));
        saveRules(rules);
        localStorage.setItem(RULES_MIGRATION_KEY, "done");
      }
      if (localStorage.getItem(RULES_ADDITION_KEY) !== "done") {
        const existingIds = new Set(rules.map((rule) => rule.id));
        rules.push(...ADDED_RULES.filter((rule) => !existingIds.has(rule.id)));
        saveRules(rules);
        localStorage.setItem(RULES_ADDITION_KEY, "done");
      }
      if (localStorage.getItem(RULES_EXPANSION_KEY) !== "done") {
        const existingIds = new Set(rules.map((rule) => rule.id));
        rules.push(...EXPANDED_RULES.filter((rule) => !existingIds.has(rule.id)));
        saveRules(rules);
        localStorage.setItem(RULES_EXPANSION_KEY, "done");
      }
      if (localStorage.getItem(RULES_EXPANSION_2026_KEY) !== "done") {
        const existingIds = new Set(rules.map((rule) => rule.id));
        rules.push(...EXPANDED_2026_RULES.filter((rule) => !existingIds.has(rule.id)));
        const defaultUnitRule = TEAM_RULES.find((rule) => rule.id === "space-unit");
        let unitRule = rules.find((rule) => rule.id === "space-unit");
        if (!unitRule) {
          unitRule = { ...defaultUnitRule };
          rules.push(unitRule);
        }
        if (unitRule && unitRule.name === "Number-unit spacing") {
          unitRule.name = defaultUnitRule.name;
          unitRule.pattern = defaultUnitRule.pattern;
        }
        saveRules(rules);
        localStorage.setItem(RULES_EXPANSION_2026_KEY, "done");
      }
      if (localStorage.getItem(TABLE_HEADER_RULE_KEY) !== "done") {
        if (!rules.some((rule) => rule.id === "team-table-header-case")) {
          rules.push({ ...TEAM_RULES.find((rule) => rule.id === "team-table-header-case") });
        }
        saveRules(rules);
        localStorage.setItem(TABLE_HEADER_RULE_KEY, "done");
      }
      if (localStorage.getItem(RULES_CMOS17_KEY) !== "done") {
        const existingIds = new Set(rules.map((rule) => rule.id));
        rules.push(...CMOS17_RULES.filter((rule) => !existingIds.has(rule.id)));
        saveRules(rules);
        localStorage.setItem(RULES_CMOS17_KEY, "done");
      }
      if (localStorage.getItem(RULES_CMOS17_V2_KEY) !== "done") {
        const existingIds = new Set(rules.map((rule) => rule.id));
        rules.push(...CMOS17_V2_RULES.filter((rule) => !existingIds.has(rule.id)));
        saveRules(rules);
        localStorage.setItem(RULES_CMOS17_V2_KEY, "done");
      }
      if (localStorage.getItem(RULES_POS_KEY) !== "done") {
        // v11: POS conditions. Upgrade chicago-11 unless the user changed its pattern,
        // and add the passive-voice rule.
        const h = rules.find((rule) => rule.id === "chicago-11-hyphen-modifier");
        const hDefault = CHICAGO_RULES.find((rule) => rule.id === "chicago-11-hyphen-modifier");
        if (h && h.pattern === CHICAGO_11_V10_PATTERN) Object.assign(h, { ...hDefault });
        const existingIds = new Set(rules.map((rule) => rule.id));
        rules.push(...STYLE_RULES.filter((rule) => !existingIds.has(rule.id)));
        saveRules(rules);
        localStorage.setItem(RULES_POS_KEY, "done");
      }
      if (localStorage.getItem(RULES_POS_V12_KEY) !== "done") {
        // v12: serial comma gets a POS condition (unless the user changed its pattern);
        // add future-tense and condition-before-instruction rules.
        const sc = rules.find((rule) => rule.id === "chicago-02-serial-comma");
        if (sc && sc.pattern === CHICAGO_02_V11_PATTERN) Object.assign(sc, { ...CHICAGO_RULES.find((rule) => rule.id === "chicago-02-serial-comma") });
        const existingIds = new Set(rules.map((rule) => rule.id));
        rules.push(...STYLE_RULES.filter((rule) => !existingIds.has(rule.id)));
        saveRules(rules);
        localStorage.setItem(RULES_POS_V12_KEY, "done");
      }
      if (localStorage.getItem(RULES_FIX_V13_KEY) !== "done") {
        // v13: fixes found by the self-check, applied only to rules the user has not edited.
        const r92 = rules.find((rule) => rule.id === "chicago-92-initials-space");
        if (r92 && r92.pattern === CHICAGO_92_V12_PATTERN) r92.pattern = CHICAGO_RULES.find((rule) => rule.id === r92.id).pattern;
        const r86 = rules.find((rule) => rule.id === "chicago-86-ordinal-2d");
        if (r86 && r86.replacement === CHICAGO_86_V12_REPLACEMENT) r86.replacement = "$1nd";
        const ru = rules.find((rule) => rule.id === "space-unit");
        if (ru && ru.pattern === SPACE_UNIT_V12_PATTERN) ru.pattern = TEAM_RULES.find((rule) => rule.id === "space-unit").pattern;
        saveRules(rules);
        localStorage.setItem(RULES_FIX_V13_KEY, "done");
      }
      const titleRuleDefault = TEAM_RULES.find((rule) => rule.id === "team-title-case");
      const titleRules = rules.filter((rule) => rule.id === "team-title-case");
      if (titleRules.some((rule) => rule.name !== titleRuleDefault.name || rule.pattern !== titleRuleDefault.pattern)) {
        titleRules.forEach((rule) => {
          rule.name = titleRuleDefault.name;
          rule.pattern = titleRuleDefault.pattern;
        });
        saveRules(rules);
      }
      return rules;
    } catch { return DEFAULT_RULES.slice(); }
  }
  function saveRules(rules) { localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules)); }
  function upsertRule(rule) {
    const list = getRules();
    const idx = list.findIndex((r) => r.id === rule.id);
    if (idx >= 0) list[idx] = rule; else list.push(rule);
    saveRules(list);
  }
  function deleteRuleId(id) { saveRules(getRules().filter((r) => r.id !== id)); }
  function resetRules() { localStorage.removeItem(RULES_STORAGE_KEY); }

  //
  // ─── Upload form intercept (capture phase) ─────────────────────────────
  //
  document.addEventListener("submit", async (event) => {
    const form = event.target;
    if (!form || form.id !== "upload-form") return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const fileInput = document.getElementById("pdf-file");
    const projectInput = document.getElementById("project-name");
    const reviewerInput = document.getElementById("reviewer");
    const file = fileInput && fileInput.files && fileInput.files[0];
    const btn = form.querySelector('button[type="submit"]');
    if (!file) { alert("Please choose a PDF file first."); return; }
    if (btn) { btn.disabled = true; btn.textContent = "Rendering preview…"; }
    try {
      await ensurePdfjs();
      const buffer = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: buffer.slice(0) }).promise;
      const id = newId();
      try {
        await idbPut(id, new Blob([buffer], { type: "application/pdf" }));
        addWorkspaceMeta({
          id, filename: file.name,
          project_name: (projectInput && projectInput.value) || "",
          reviewer: (reviewerInput && reviewerInput.value) || "",
          page_count: pdf.numPages, size_bytes: file.size,
          created_at: new Date().toISOString(),
        });
      } catch (storeErr) { console.warn("[demo] persist failed:", storeErr); }
      await renderViewer(pdf, file.name, id);
    } catch (err) {
      console.error("[demo] PDF render failed:", err);
      alert("PDF render failed: " + (err && err.message ? err.message : err));
    } finally { if (btn) { btn.disabled = false; btn.textContent = "Open review workspace"; } }
  }, true);

  //
  // ─── Workspaces list ───────────────────────────────────────────────────
  //
  window.loadWorkspaces = renderSavedWorkspaces;
  function renderSavedWorkspaces() {
    const container = document.getElementById("workspace-list");
    if (!container) return;
    const searchInput = document.getElementById("workspace-search");
    const query = (searchInput && searchInput.value.trim().toLowerCase()) || "";
    const list = readWorkspaces().filter((item) =>
      item.filename.toLowerCase().includes(query) ||
      (item.project_name || "").toLowerCase().includes(query));
    if (!list.length) {
      container.innerHTML = `
        <div class="empty-issues" style="padding:24px;text-align:center;color:#6b7280;">
          No saved workspaces yet.<br/>
          <span style="font-size:12px;">Upload a PDF from the Reviewer tab to save it here for later.</span>
        </div>`;
      return;
    }
    container.innerHTML = list.map((item) => `
      <article class="workspace-card">
        <div class="workspace-card-main">
          <span class="term-status active">saved</span>
          <h3>${escapeHtml(item.filename)}</h3>
          <p>${escapeHtml(item.project_name || "—")} · ${item.page_count} pages · ${escapeHtml(item.reviewer || "—")}</p>
        </div>
        <div class="workspace-progress">
          <strong>Preview only</strong>
          <span>Saved ${escapeHtml(new Date(item.created_at).toLocaleString())} · ${formatBytes(item.size_bytes)}</span>
        </div>
        <div class="workspace-actions">
          <button class="primary" data-demo-open="${item.id}">Open Workspace</button>
          <button class="danger" data-demo-delete="${item.id}">Delete Workspace</button>
        </div>
      </article>`).join("");
    container.querySelectorAll("[data-demo-open]").forEach((b) =>
      b.addEventListener("click", () => openSavedWorkspace(b.dataset.demoOpen)));
    container.querySelectorAll("[data-demo-delete]").forEach((b) =>
      b.addEventListener("click", () => deleteSavedWorkspace(b.dataset.demoDelete)));
  }
  async function openSavedWorkspace(id) {
    const meta = readWorkspaces().find((w) => w.id === id);
    if (!meta) return alert("Workspace metadata missing.");
    try {
      const blob = await idbGet(id);
      if (!blob) return alert("Stored PDF blob not found.");
      await ensurePdfjs();
      const buffer = await blob.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
      if (typeof window.showView === "function") window.showView("reviewer");
      await renderViewer(pdf, meta.filename, id);
    } catch (err) { alert("Could not reopen workspace: " + err.message); }
  }
  async function deleteSavedWorkspace(id) {
    const meta = readWorkspaces().find((w) => w.id === id);
    if (!meta) return;
    if (!confirm(`Delete this workspace?\n\n${meta.filename}`)) return;
    try { await idbDelete(id); } catch (err) { console.warn("[demo] IDB delete failed:", err); }
    removeWorkspaceMeta(id);
    localStorage.removeItem(reviewStorageKey(id));
    renderSavedWorkspaces();
  }
  document.addEventListener("input", (event) => {
    if (event.target && event.target.id === "workspace-search") renderSavedWorkspaces();
  }, true);

  //
  // ─── Reviewer state ────────────────────────────────────────────────────
  //
  const viewerState = { pdf: null, zoom: 1, viewMode: "one", currentPage: 1, filename: "", workspaceId: null, findings: [], activeFindingId: null,
    textPages: new Map(), searchMatches: [], searchIndex: -1, searchRequest: 0, renderRequest: 0 };

  async function renderViewer(pdf, name, workspaceId = null) {
    window.previewViewerActive = true;
    viewerState.pdf = pdf;
    viewerState.filename = name;
    viewerState.workspaceId = workspaceId;
    viewerState.currentPage = 1;
    viewerState.zoom = 1;
    viewerState.viewMode = "one";
    viewerState.findings = [];
    viewerState.activeFindingId = null;
    viewerState.textPages = new Map();
    viewerState.searchMatches = [];
    viewerState.searchIndex = -1;
    viewerState.searchRequest += 1;
    setText("pdf-search-count", "0 / 0");
    const searchInput = document.getElementById("pdf-search-input");
    if (searchInput) searchInput.value = "";

    const upload = document.getElementById("upload-panel");
    const workspace = document.getElementById("workspace");
    if (upload) upload.classList.add("hidden");
    if (!workspace) return;
    workspace.classList.remove("hidden");

    setText("document-name", name);
    setText("document-meta", `${pdf.numPages} pages · Preview mode (header/footer 2.5cm excluded)`);
    setText("review-status", "Extracting text and matching rules…");
    setText("page-label", `/ ${pdf.numPages}`);
    setText("dictionary-count", "0 terms");

    const pageInput = document.getElementById("page-number-input");
    if (pageInput) { pageInput.value = 1; pageInput.max = pdf.numPages; }

    const ollamaLog = document.getElementById("ollama-log-list");
    if (ollamaLog) ollamaLog.innerHTML = `<span class="hint">Preview mode — Ollama disabled.</span>`;
    const dictList = document.getElementById("dictionary-list");
    if (dictList) dictList.innerHTML = `<span class="hint">Preview mode — glossary requires backend.</span>`;

    hideUnusedSidebarSections();
    wireDocumentDataButtons();
    wireViewerToolbar();
    wireIssuesFilters();
    wireIssueActions();
    setupExportButton();
    await renderCurrentPages();

    Promise.allSettled([runRulesOnPdf(pdf), runPosRulesOnPdf(pdf), runValeOnPdf(pdf)]).then(([regexRes, posRes, valeRes]) => {
      if (regexRes.status === "rejected") throw regexRes.reason;
      const regexFindings = regexRes.value;
      const posFindings = posRes.status === "fulfilled" ? posRes.value : [];
      if (posRes.status === "rejected") console.warn("[demo] POS-condition rules skipped:", posRes.reason);
      const valeFindings = valeRes.status === "fulfilled" ? valeRes.value : [];
      if (valeRes.status === "rejected") console.warn("[demo] Vale check skipped:", valeRes.reason);
      const allFindings = sortFindings([...regexFindings, ...posFindings]);
      const findings = mergeFindings(allFindings, valeFindings);
      viewerState.findings = restoreReviewDecisions(findings, viewerState.workspaceId);
      setText("issue-total", String(findings.length));
      const cnt = findings.length;
      const posNote = posRes.status === "rejected" ? " · part-of-speech tagger unavailable: rules with a POS condition were skipped" : "";
      const valeNote = posNote + (!VALE_ENABLED ? ""
        : valeRes.status === "fulfilled" ? ` · Vale: ${valeFindings.length}`
        : " · Vale server unavailable");
      setText("review-status", (cnt
        ? `Review complete — ${cnt} suggestion${cnt === 1 ? "" : "s"} from ${getRules().filter((r) => r.enabled).length} enabled rules`
        : `Review complete — no matches found`) + valeNote);
      renderIssuesPanel();
      renderCurrentPages();
      const oldPanel = document.getElementById("self-check-panel");
      if (selfCheck.pending && name === SELF_CHECK_FILENAME) { selfCheck.pending = false; renderSelfCheckReport(findings); }
      else if (oldPanel) oldPanel.remove();
    }).catch((err) => {
      selfCheck.pending = false;
      console.warn("[demo] rule run failed:", err);
      setText("review-status", "Rule matching failed (see console).");
    });
  }

  //
  // ─── POS rules in the browser (no backend) ─────────────────────────────
  //
  let taggerReady = null;
  async function ensureTagger() {
    if (!taggerReady) taggerReady = (async () => {
      if (!window.WinkBundle) await loadScript(WINK_BUNDLE_URL);
      return window.WinkBundle.winkNLP(window.WinkBundle.model);
    })().catch((err) => { taggerReady = null; throw err; });
    return taggerReady;
  }

  // PDF.js text items -> lines (same baseline) -> paragraphs (break on a large
  // line gap, a font-size change or a font change such as bold, so headings never
  // merge with body text).
  // Every character keeps its item and index so a match can be highlighted.
  function buildParagraphs(items, pageHeight) {
    const usable = items.filter((item) => {
      if (!item.str || !item.str.trim()) return false;
      const [, y, , h] = itemBbox(item);
      return y >= MARGIN_PT && y + h <= pageHeight - MARGIN_PT;
    });
    const lines = [];
    for (const it of [...usable].sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4])) {
      const size = itemFontSize(it) || 10;
      const line = lines[lines.length - 1];
      if (line && Math.abs(line.y - it.transform[5]) < 0.5 * size) line.items.push(it);
      else lines.push({ y: it.transform[5], items: [it] });
    }
    lines.forEach((l) => {
      l.items.sort((a, b) => a.transform[4] - b.transform[4]);
      l.size = Math.max(...l.items.map((it) => itemFontSize(it)));
      // The line's main font (the one carrying the most characters): a bold heading
      // uses a different font from the body even when its size is close.
      const chars = new Map();
      for (const it of l.items) chars.set(it.fontName, (chars.get(it.fontName) || 0) + it.str.trim().length);
      l.font = [...chars.entries()].sort((a, b) => b[1] - a[1])[0][0];
    });
    const paras = [];
    let cur = null, prev = null;
    for (const line of lines) {
      const newPara = !prev || (prev.y - line.y) > 1.6 * prev.size
        || Math.abs(line.size - prev.size) > 0.15 * prev.size
        || line.font !== prev.font;
      if (newPara) { cur = { text: "", map: [] }; paras.push(cur); }
      else if (!cur.text.endsWith("-")) { cur.text += " "; cur.map.push(null); } // "high-" + "voltage": no space
      let lastEnd = null;
      for (const it of line.items) {
        const size = itemFontSize(it) || 10;
        if (lastEnd !== null && it.transform[4] - lastEnd > 0.15 * size
          && !/\s$/.test(cur.text) && !/^\s/.test(it.str)) { cur.text += " "; cur.map.push(null); }
        for (let i = 0; i < it.str.length; i++) { cur.text += it.str[i]; cur.map.push({ item: it, i }); }
        lastEnd = it.transform[4] + (it.width || 0);
      }
      prev = line;
    }
    return paras;
  }

  // Character range in a paragraph -> highlight boxes, one per text line.
  function boxesForRange(para, start, end) {
    const perItem = new Map();
    for (let c = start; c < end; c++) {
      const m = para.map[c];
      if (!m) continue;
      const r = perItem.get(m.item) || [m.i, m.i];
      perItem.set(m.item, [Math.min(r[0], m.i), Math.max(r[1], m.i)]);
    }
    const lines = [];
    for (const [item, [a, b]] of perItem) {
      const box = bboxSlice(item, a, b - a + 1, itemBbox(item));
      const line = lines.find((l) => Math.abs(l[1] - box[1]) < box[3] * 0.5);
      if (!line) { lines.push(box); continue; }
      const x0 = Math.min(line[0], box[0]), x1 = Math.max(line[0] + line[2], box[0] + box[2]);
      line[0] = x0; line[2] = x1 - x0;
    }
    return lines.sort((p, q) => q[1] - p[1]);
  }

  // wink-nlp often tags a capitalized sentence-initial verb ("Click", "Use", "Open")
  // as a proper noun. Tag a copy in which such a word starts lowercase; the copy has
  // the same length, so offsets still point into the original text.
  function taggingCopy(text) {
    return text.replace(/(^|[.!?:]\s+)([A-Z])(?=[a-z]+\b)/g, (m, before, c) => before + c.toLowerCase());
  }
  function looksImperative(nlp, sentence) {
    const its = nlp.its;
    const words = [];
    nlp.readDoc("you " + sentence.charAt(0).toLowerCase() + sentence.slice(1)).tokens().each((t) => {
      const p = t.out(its.pos);
      if (p !== "PUNCT" && p !== "SPACE") words.push({ value: t.out(its.value), pos: p });
    });
    if (!words[1] || words[1].pos !== "VERB") return false;
    const next = words[2];
    if (!next) return true;
    if (/^[A-Z]/.test(next.value)) return true;
    return ["DET", "PRON", "NUM", "ADP", "ADJ", "ADV", "PART", "PROPN"].includes(next.pos);
  }
  function tagParagraph(nlp, text) {
    const its = nlp.its;
    const tokens = [];
    const copy = taggingCopy(text);
    let at = 0;
    nlp.readDoc(copy).tokens().each((t) => {
      const v = t.out(its.value);
      const found = copy.indexOf(v, at);
      const start = found >= 0 ? found : at;
      tokens.push({ value: text.slice(start, start + v.length), pos: t.out(its.pos), start, end: start + v.length });
      at = start + v.length;
    });
    tokens.forEach((t, i) => {
      const prev = tokens.slice(0, i).reverse().find((x) => x.pos !== "SPACE");
      const atStart = !prev || /^[.!?:]$/.test(prev.value);
      if (!atStart || !/^[A-Z][a-z]+$/.test(t.value) || t.pos === "VERB") return;
      const rest = text.slice(t.start);
      const sentence = rest.slice(0, (rest.search(/[.!?](\s|$)/) + 1) || rest.length);
      if (looksImperative(nlp, sentence)) t.pos = "VERB";
    });
    return tokens;
  }
  function parsePosCondition(condition) {
    return String(condition || "").trim().split(/\s+/).filter(Boolean).map((part) => part.split("|"));
  }
  function posConditionError(condition) {
    const bad = parsePosCondition(condition).flat().filter((tag) => tag !== "*" && tag !== "..." && !POS_TAGS.includes(tag));
    return bad.length ? `Unknown POS tag: ${bad.join(", ")}` : "";
  }
  function posConditionMatches(want, tokens, start, end) {
    const words = tokens.filter((t) => t.start < end && t.end > start && t.pos !== "PUNCT" && t.pos !== "SPACE");
    const memo = new Map();
    const fits = (i, j) => {
      const key = i * 10000 + j;
      if (memo.has(key)) return memo.get(key);
      let ok;
      if (i === want.length) ok = j === words.length;
      else if (want[i].includes("...")) ok = fits(i + 1, j) || (j < words.length && fits(i, j + 1));
      else ok = j < words.length && (want[i].includes("*") || want[i].includes(words[j].pos)) && fits(i + 1, j + 1);
      memo.set(key, ok);
      return ok;
    };
    return fits(0, 0);
  }
  function sortFindings(list) {
    return list.sort((a, b) => a.page - b.page
      || (b.bbox?.[1] ?? 0) - (a.bbox?.[1] ?? 0) || (a.bbox?.[0] ?? 0) - (b.bbox?.[0] ?? 0));
  }

  //
  // ─── Self-check: a generated sample PDF with known errors ──────────────
  //
  // Each case has a deliberately wrong text (its rule must flag it, and applying
  // the rule's suggestion must give the corrected text) and the corrected text (no
  // enabled rule may flag it; this also catches two rules that contradict each other).
  // The sample PDF is generated from this list with pdf-lib: edit it to add cases.
  // One case per rule (two for table headers). Fields: category, ruleId, flag (text the
  // rule must flag), wrong, right. Optional: layout ("heading" | "figure" | "table" |
  // "table10"), noFixCheck (the suggestion is a note, not a replacement), limit (why
  // the rule cannot work in the PDF pipeline; reported as KNOWN LIMITATION).
  const SELF_CHECK_CASES = [
    // ── Typo ──
    { category: "typo", ruleId: "typo-teh", flag: "teh", wrong: "Check teh cable before each scan.", right: "Check the cable before each scan." },
    { category: "typo", ruleId: "typo-adress", flag: "adress", wrong: "Enter the IP adress of the controller.", right: "Enter the IP address of the controller." },
    { category: "typo", ruleId: "typo-recieve", flag: "recieve", wrong: "The controller does not recieve a signal.", right: "The controller does not receive a signal." },
    { category: "typo", ruleId: "typo-seperate", flag: "seperate", wrong: "Keep each sample in a seperate holder.", right: "Keep each sample in a separate holder." },
    { category: "typo", ruleId: "typo-occured", flag: "occured", wrong: "An error occured during the approach.", right: "An error occurred during the approach." },
    { category: "typo", ruleId: "typo-untill", flag: "untill", wrong: "Wait untill the stage stops moving.", right: "Wait until the stage stops moving." },
    { category: "typo", ruleId: "typo-alot", flag: "alot", wrong: "A large scan takes alot of time.", right: "A large scan takes a lot of time." },
    { category: "typo", ruleId: "typo-thier", flag: "thier", wrong: "Users save thier settings in a project.", right: "Users save their settings in a project." },
    // ── Spacing ──
    { category: "spacing", ruleId: "space-double", flag: "  ", wrong: "Connect the  probe holder to the stage.", right: "Connect the probe holder to the stage.",
      limit: "PDF.js merges consecutive spaces when it extracts text, so a double space never reaches the rules." },
    { category: "spacing", ruleId: "space-unit", flag: "10V", wrong: "Set the sample bias to 10V before the scan.", right: "Set the sample bias to 10 V before the scan." },
    { category: "spacing", ruleId: "chicago-92-initials-space", flag: "J.R.", wrong: "J.R. Smith describes the method in the appendix.", right: "J. R. Smith describes the method in the appendix." },
    // ── Punctuation ──
    { category: "punctuation", ruleId: "chicago-01-double-space", flag: ".  ", wrong: "Stop the scan.  Then lift the tip.", right: "Stop the scan. Then lift the tip.",
      limit: "PDF.js merges consecutive spaces when it extracts text, so two spaces after a period never reach the rules." },
    { category: "punctuation", ruleId: "chicago-02-serial-comma", flag: "sample, holder and probe", wrong: "Remove the sample, holder and probe before shipping.", right: "Remove the sample, holder, and probe before shipping." },
    { category: "punctuation", ruleId: "chicago-10-list-punct", flag: "• c", wrong: "• connect the cable to the controller", right: "• Connect the cable to the controller.", noFixCheck: true },
    { category: "punctuation", ruleId: "chicago-21-colon-space", flag: ":D", wrong: "Note:Disconnect the cable first.", right: "Note: Disconnect the cable first." },
    { category: "punctuation", ruleId: "chicago-22-em-dash-space", flag: "e — t", wrong: "Check the voltage — then start the scan.", right: "Check the voltage—then start the scan." },
    { category: "punctuation", ruleId: "chicago-26-date-day-comma", flag: "October 1 2026", wrong: "The update arrives on October 1 2026.", right: "The update arrives on October 1, 2026." },
    { category: "punctuation", ruleId: "chicago-27-date-year-comma", flag: "2026 t", wrong: "On October 1, 2026 the service period starts.", right: "On October 1, 2026, the service period starts." },
    { category: "punctuation", ruleId: "chicago-28-for-example-comma", flag: "For example t", wrong: "For example the tip can touch the sample.", right: "For example, the tip can touch the sample." },
    { category: "punctuation", ruleId: "chicago-30-slash-alternatives", flag: "on / off", wrong: "Set the switch to on / off as needed.", right: "Set the switch to on/off as needed." },
    { category: "punctuation", ruleId: "chicago-31-punctuation-space", flag: "r ,", wrong: "Turn off the amplifier , then wait ten seconds.", right: "Turn off the amplifier, then wait ten seconds." },
    { category: "punctuation", ruleId: "chicago-36-quote-comma", flag: "\"Auto\",", wrong: "Select \"Auto\", then press Start.", right: "Select \"Auto,\" then press Start." },
    { category: "punctuation", ruleId: "chicago-37-quote-period", flag: "\"Manual\".", wrong: "Set the mode to \"Manual\".", right: "Set the mode to \"Manual.\"" },
    { category: "punctuation", ruleId: "chicago-38-yes-comma", flag: "Yes t", wrong: "Yes the stage returns to the home position.", right: "Yes, the stage returns to the home position." },
    { category: "punctuation", ruleId: "chicago-39-no-comma", flag: "No it", wrong: "No it does not need a new probe.", right: "No, it does not need a new probe." },
    { category: "punctuation", ruleId: "chicago-40-oh-comma", flag: "Oh t", wrong: "Oh the cover is still open.", right: "Oh, the cover is still open." },
    { category: "punctuation", ruleId: "chicago-41-ah-comma", flag: "Ah t", wrong: "Ah the scan finished early.", right: "Ah, the scan finished early." },
    { category: "punctuation", ruleId: "chicago-42-namely-comma", flag: "Namely t", wrong: "Namely the tip and the sample must stay clean.", right: "Namely, the tip and the sample must stay clean." },
    { category: "punctuation", ruleId: "chicago-43-that-is-comma", flag: "That is t", wrong: "That is the stage must stay cold.", right: "That is, the stage must stay cold." },
    { category: "punctuation", ruleId: "chicago-55-period-space", flag: "e .", wrong: "Lift the probe from the stage .", right: "Lift the probe from the stage." },
    { category: "punctuation", ruleId: "chicago-60-eg-comma", flag: "e.g.", wrong: "Use a stiff probe, e.g. the NSC18 model.", right: "Use a stiff probe, e.g., the NSC18 model." },
    { category: "punctuation", ruleId: "chicago-61-ie-comma", flag: "i.e.", wrong: "Use the slow mode, i.e. the 0.5 Hz rate.", right: "Use the slow mode, i.e., the 0.5 Hz rate." },
    { category: "punctuation", ruleId: "chicago-68-ellipsis-before", flag: "s…", wrong: "Open Settings… and choose a mode.", right: "Open Settings … and choose a mode." },
    { category: "punctuation", ruleId: "chicago-69-ellipsis-after", flag: "…t", wrong: "Wait …then restart the controller.", right: "Wait … then restart the controller." },
    { category: "punctuation", ruleId: "chicago-70-question-space", flag: "y ?", wrong: "Is the stage ready ?", right: "Is the stage ready?" },
    { category: "punctuation", ruleId: "chicago-71-exclamation-space", flag: "p !", wrong: "Do not touch the tip !", right: "Do not touch the tip!" },
    { category: "punctuation", ruleId: "chicago-85-comma-before-etc", flag: "s etc.", wrong: "Check the cables and probes etc. before use.", right: "Check the cables and probes, etc. before use." },
    { category: "punctuation", ruleId: "chicago-88-sic-brackets", flag: "sic", wrong: "The old label reads lenght sic on the box.", right: "The old label reads lenght [sic] on the box." },
    // ── Grammar ──
    { category: "grammar", ruleId: "chicago-04-comma-splice", flag: "is ready, it is", wrong: "The stage is ready, it is safe to start.", right: "The stage is ready. It is safe to start.", noFixCheck: true },
    { category: "grammar", ruleId: "chicago-16-subject-verb", flag: "These is", wrong: "These is the default settings.", right: "These are the default settings." },
    { category: "grammar", ruleId: "chicago-17-pronoun-agree", flag: "Each user saves their", wrong: "Each user saves their own settings.", right: "All users save their own settings." },
    { category: "grammar", ruleId: "chicago-18-dangling", flag: "After loading the sample, the stage", wrong: "After loading the sample, the stage moves up.", right: "After you load the sample, the stage moves up.", noFixCheck: true },
    { category: "grammar", ruleId: "chicago-19-tense", flag: "will stop when the scan was", wrong: "The stage will stop when the scan was complete.", right: "The stage stops when the scan is complete." },
    { category: "grammar", ruleId: "chicago-20-parallel-lists", flag: "1.", wrong: "1. Loading the sample|2. Start the scan", right: "1. Load the sample|2. Start the scan",
      layout: "lines", limit: "The pattern spans two list lines, but rules are checked one text line at a time, so it never matches." },
    { category: "grammar", ruleId: "chicago-89-ibid-discouraged", flag: "Ibid.", wrong: "Ibid. page 4 lists the values.", right: "Smith, Manual, page 4 lists the values." },
    { category: "grammar", ruleId: "chicago-93-possessive-pronoun", flag: "your's", wrong: "The final choice is your's.", right: "The final choice is yours." },
    { category: "grammar", ruleId: "chicago-96-double-negative", flag: "Don't touch nothing", wrong: "Don't touch nothing on the stage.", right: "Don't touch anything on the stage." },
    { category: "grammar", ruleId: "style-passive-voice", flag: "is applied", wrong: "The sample bias is applied by the controller.", right: "The controller applies the sample bias." },
    { category: "grammar", ruleId: "style-future-tense", flag: "will move", wrong: "The stage will move to the home position.", right: "The stage moves to the home position." },
    { category: "grammar", ruleId: "style-condition-first-if", flag: "Click Delete if you", wrong: "Click Delete if you want to remove the scan data from the current project folder.", right: "If you want to remove the scan data from the current project folder, click Delete." },
    { category: "grammar", ruleId: "style-condition-first-see", flag: "See the maintenance chapter for more information", wrong: "See the maintenance chapter for more information.", right: "For more information, see the maintenance chapter." },
    { category: "grammar", ruleId: "style-condition-first-to", flag: "Press Start to begin the scan", wrong: "Press Start to begin the scan.", right: "To begin the scan, press Start." },
    // ── Capitalization ──
    { category: "capitalization", ruleId: "chicago-05-cap-after-colon", flag: ": c", wrong: "Note: connect the ground cable first.", right: "Note: Connect the ground cable first.", noFixCheck: true },
    { category: "capitalization", ruleId: "chicago-73-internet", flag: "Internet", wrong: "Download the driver from the Internet.", right: "Download the driver from the internet." },
    { category: "capitalization", ruleId: "chicago-74-seasons", flag: "Winter", wrong: "Humidity drops in the Winter months.", right: "Humidity drops in the winter months." },
    { category: "capitalization", ruleId: "chicago-75-titles", flag: "Director of the", wrong: "Ask the Director of the lab for access.", right: "Ask the director of the lab for access." },
    { category: "capitalization", ruleId: "team-title-case", layout: "heading", flag: "Install the high-voltage module", wrong: "Install the high-voltage module", right: "Install the High-Voltage Module" },
    { category: "capitalization", ruleId: "team-title-case", layout: "figure", flag: "signal flow", wrong: "Figure 1. signal flow of the amplifier", right: "Figure 1. Signal Flow of the Amplifier" },
    { category: "capitalization", ruleId: "team-title-case", layout: "figure", flag: "scan parameters", wrong: "Table 3. scan parameters", right: "Table 3. Scan Parameters" },
    { category: "capitalization", ruleId: "team-table-header-case", layout: "table", flag: "scan mode", wrong: "Table 1. Scan Settings|scan mode|setpoint|Contact|Low", right: "Table 1. Scan Settings|Scan Mode|Setpoint|Contact|Low" },
    { category: "capitalization", ruleId: "team-table-header-case", layout: "tableBody", flag: "drive amplitude", wrong: "Table 2. Drive Settings|drive amplitude|phase|10 mV|90 deg", right: "Table 2. Drive Settings|Drive Amplitude|Phase|10 mV|90 deg" },
    // ── Hyphenation & terminology ──
    { category: "hyphenation_terminology", ruleId: "chicago-11-hyphen-modifier", flag: "high voltage amplifier", wrong: "Connect the cable to the high voltage amplifier.", right: "Connect the cable to the high-voltage amplifier." },
    { category: "hyphenation_terminology", ruleId: "chicago-12-no-hyphen-ly", flag: "newly-installed", wrong: "Use a newly-installed probe for the first scan.", right: "Use a newly installed probe for the first scan." },
    { category: "hyphenation_terminology", ruleId: "chicago-13-suspended-hyphen", flag: "low and high-voltage", wrong: "The unit has low and high-voltage outputs.", right: "The unit has low- and high-voltage outputs." },
    { category: "hyphenation_terminology", ruleId: "chicago-15-ui-capitalization", flag: "click apply", wrong: "Then click apply to keep the settings.", right: "Then click Apply to keep the settings.", noFixCheck: true },
    { category: "hyphenation_terminology", ruleId: "chicago-32-website", flag: "web site", wrong: "Visit the web site for updates.", right: "Visit the website for updates." },
    { category: "hyphenation_terminology", ruleId: "chicago-58-email", flag: "e-mail", wrong: "Send the log file by e-mail to the service team.", right: "Send the log file by email to the service team." },
    { category: "hyphenation_terminology", ruleId: "chicago-59-esports", flag: "e-sports", wrong: "The e-sports club uses the same monitor.", right: "The esports club uses the same monitor." },
    // ── Numbers & abbreviations ──
    { category: "numbers_abbreviations", ruleId: "chicago-23-decimal-zero", flag: ".5", wrong: "Set the gain to .5 before the scan.", right: "Set the gain to 0.5 before the scan." },
    { category: "numbers_abbreviations", ruleId: "chicago-24-number-range", flag: "pages 10-12", wrong: "See pages 10-12 in the user guide.", right: "See pages 10–12 in the user guide." },
    { category: "numbers_abbreviations", ruleId: "chicago-25-us-abbreviation", flag: "U.S.", wrong: "The U.S. version uses a different plug.", right: "The US version uses a different plug." },
    { category: "numbers_abbreviations", ruleId: "chicago-29-year-range", flag: "years 2019-2021", wrong: "Units built in the years 2019-2021 need a new cable.", right: "Units built in the years 2019–2021 need a new cable." },
    { category: "numbers_abbreviations", ruleId: "chicago-33-percent-range", flag: "10-20%", wrong: "Use 10-20% of the maximum power.", right: "Use 10%–20% of the maximum power." },
    { category: "numbers_abbreviations", ruleId: "chicago-34-kilogram-case", flag: "5 Kg", wrong: "The stage carries up to 5 Kg of load.", right: "The stage carries up to 5 kg of load." },
    { category: "numbers_abbreviations", ruleId: "chicago-35-si-plural", flag: "5 mms", wrong: "Lower the head by 5 mms first.", right: "Lower the head by 5 mm first." },
    { category: "numbers_abbreviations", ruleId: "chicago-44-khz-case", flag: "10 KHz", wrong: "Set the filter to 10 KHz before the scan.", right: "Set the filter to 10 kHz before the scan." },
    { category: "numbers_abbreviations", ruleId: "chicago-45-mpa-case", flag: "2 Mpa", wrong: "The chamber holds up to 2 Mpa of pressure.", right: "The chamber holds up to 2 MPa of pressure." },
    { category: "numbers_abbreviations", ruleId: "chicago-46-kpa-uppercase", flag: "3 KPA", wrong: "Keep the line pressure near 3 KPA in use.", right: "Keep the line pressure near 3 kPa in use." },
    { category: "numbers_abbreviations", ruleId: "chicago-47-section-range", flag: "sections 3-5", wrong: "Read sections 3-5 before the first scan.", right: "Read sections 3–5 before the first scan." },
    { category: "numbers_abbreviations", ruleId: "chicago-48-chapter-range", flag: "chapters 2-4", wrong: "Read chapters 2-4 before the first scan.", right: "Read chapters 2–4 before the first scan." },
    { category: "numbers_abbreviations", ruleId: "chicago-49-decade-apostrophe", flag: "1990's", wrong: "The first units date from the 1990's.", right: "The first units date from the 1990s." },
    { category: "numbers_abbreviations", ruleId: "chicago-50-percent-space", flag: "10 %", wrong: "The drift stays below 10 % per hour.", right: "The drift stays below 10% per hour." },
    { category: "numbers_abbreviations", ruleId: "chicago-51-ratio-space", flag: "1 : 4", wrong: "Mix the epoxy at a 1 : 4 ratio.", right: "Mix the epoxy at a 1:4 ratio." },
    { category: "numbers_abbreviations", ruleId: "chicago-52-kpa-case", flag: "3 KPa", wrong: "Keep the line pressure near 3 KPa in use.", right: "Keep the line pressure near 3 kPa in use." },
    { category: "numbers_abbreviations", ruleId: "chicago-53-mhz-case", flag: "50 Mhz", wrong: "The clock runs at 50 Mhz in this mode.", right: "The clock runs at 50 MHz in this mode." },
    { category: "numbers_abbreviations", ruleId: "chicago-54-ghz-case", flag: "2 Ghz", wrong: "The link runs at 2 Ghz in this mode.", right: "The link runs at 2 GHz in this mode." },
    { category: "numbers_abbreviations", ruleId: "chicago-56-am-time", flag: "9:00 AM", wrong: "Restart the controller at 9:00 AM every day.", right: "Restart the controller at 9:00 a.m. every day." },
    { category: "numbers_abbreviations", ruleId: "chicago-57-pm-time", flag: "5:30 PM", wrong: "Back up the data at 5:30 PM every day.", right: "Back up the data at 5:30 p.m. every day." },
    { category: "numbers_abbreviations", ruleId: "chicago-62-etc-period", flag: "etc", wrong: "Check the cables, probes, etc, before use.", right: "Check the cables, probes, etc., before use." },
    { category: "numbers_abbreviations", ruleId: "chicago-63-dc", flag: "D.C.", wrong: "The D.C. office handles service calls.", right: "The DC office handles service calls." },
    { category: "numbers_abbreviations", ruleId: "chicago-64-uk", flag: "U.K.", wrong: "The U.K. office handles service calls.", right: "The UK office handles service calls." },
    { category: "numbers_abbreviations", ruleId: "chicago-65-eu", flag: "E.U.", wrong: "The E.U. office handles service calls.", right: "The EU office handles service calls." },
    { category: "numbers_abbreviations", ruleId: "chicago-66-un", flag: "U.N.", wrong: "The U.N. office handles service calls.", right: "The UN office handles service calls." },
    { category: "numbers_abbreviations", ruleId: "chicago-67-month-day-cardinal", flag: "October 1st", wrong: "The update is due on October 1st this year.", right: "The update is due on October 1 this year." },
    { category: "numbers_abbreviations", ruleId: "chicago-72-acronym-plural", flag: "PDF's", wrong: "Save all PDF's in the project folder.", right: "Save all PDFs in the project folder." },
    { category: "numbers_abbreviations", ruleId: "chicago-76-from-number-range", flag: "from 10-20", wrong: "Set the voltage from 10-20 V for this test.", right: "Set the voltage from 10 to 20 V for this test." },
    { category: "numbers_abbreviations", ruleId: "chicago-77-between-number-range", flag: "between 10-20", wrong: "Keep the voltage between 10-20 V for this test.", right: "Keep the voltage between 10 and 20 V for this test." },
    { category: "numbers_abbreviations", ruleId: "chicago-78-phd-no-periods", flag: "Ph.D.", wrong: "A Ph.D. student wrote this chapter.", right: "A PhD student wrote this chapter." },
    { category: "numbers_abbreviations", ruleId: "chicago-79-md-no-periods", flag: "M.D.", wrong: "An M.D. degree is not required here.", right: "An MD degree is not required here." },
    { category: "numbers_abbreviations", ruleId: "chicago-80-ba-no-periods", flag: "B.A.", wrong: "A B.A. degree is not required here.", right: "A BA degree is not required here." },
    { category: "numbers_abbreviations", ruleId: "chicago-81-ma-no-periods", flag: "M.A.", wrong: "An M.A. degree is not required here.", right: "An MA degree is not required here." },
    { category: "numbers_abbreviations", ruleId: "chicago-82-bs-no-periods", flag: "B.S.", wrong: "A B.S. degree is not required here.", right: "A BS degree is not required here." },
    { category: "numbers_abbreviations", ruleId: "chicago-83-ms-no-periods", flag: "M.S.", wrong: "An M.S. degree is not required here.", right: "An MS degree is not required here." },
    { category: "numbers_abbreviations", ruleId: "chicago-84-jd-no-periods", flag: "J.D.", wrong: "A J.D. degree is not required here.", right: "A JD degree is not required here." },
    { category: "numbers_abbreviations", ruleId: "chicago-86-ordinal-2d", flag: "2d", wrong: "Repeat the 2d scan after cooling.", right: "Repeat the 2nd scan after cooling." },
    { category: "numbers_abbreviations", ruleId: "chicago-87-thousands-comma", flag: "2500", wrong: "Set 2500 points for each line.", right: "Set 2,500 points for each line." },
    { category: "numbers_abbreviations", ruleId: "chicago-90-cf-period", flag: "cf", wrong: "For the limits, cf the appendix.", right: "For the limits, cf. the appendix." },
    { category: "numbers_abbreviations", ruleId: "chicago-91-et-al-period", flag: "et al", wrong: "Kim et al reported the same drift.", right: "Kim et al. reported the same drift." },
    { category: "numbers_abbreviations", ruleId: "chicago-94-vs-period", flag: "vs", wrong: "Plot the height vs time for each line.", right: "Plot the height vs. time for each line." },
    { category: "numbers_abbreviations", ruleId: "chicago-95-author-date-comma", flag: "(Kim, 2020)", wrong: "The method follows (Kim, 2020) closely.", right: "The method follows (Kim 2020) closely." },
  ];
  // Text in the header/footer bands (top/bottom MARGIN_CM) must never be flagged.
  const SELF_CHECK_MARGIN_TEXT = {
    header: "Self-check sample - teh header, 10 % drift, high voltage amplifier, will be removed",
    footer: "Footer - recieve, e-mail, sample, holder and probe, 9:00 AM",
  };
  const SELF_CHECK_FILENAME = "self-check-sample.pdf";
  const selfCheck = { pending: false, placed: [], lastReport: null, forceAll: false, running: false };
  // Rules used for a review. During "Test all rules" every rule runs, but nothing is saved.
  function activeRules() {
    const rules = getRules();
    return selfCheck.running && selfCheck.forceAll ? rules.map((r) => ({ ...r, enabled: true })) : rules.filter((r) => r.enabled);
  }

  async function buildSelfCheckPdf() {
    await ensurePdfLib();
    const { PDFDocument, StandardFonts } = window.PDFLib;
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const W = 595.28, H = 841.89, left = 72, width = 400;
    const top = H - MARGIN_PT - 24, bottom = MARGIN_PT + 24;
    let page = null, pageNo = 0, y = 0;
    const placed = [];
    const newPage = () => {
      page = doc.addPage([W, H]); pageNo++; y = top;
      page.drawText(SELF_CHECK_MARGIN_TEXT.header, { x: left, y: H - 40, size: 9, font });
      page.drawText(`${SELF_CHECK_MARGIN_TEXT.footer} - page ${pageNo}`, { x: left, y: 36, size: 9, font });
    };
    const ensure = (h) => { if (!page || y - h < bottom) newPage(); };
    const wrap = (text, f, size) => {
      const words = text.split(" "), lines = [];
      let line = "";
      for (const w of words) {
        const next = line === "" ? w : line + " " + w;
        if (line !== "" && f.widthOfTextAtSize(next, size) > width) { lines.push(line); line = w; } else line = next;
      }
      if (line) lines.push(line);
      return lines;
    };
    const paragraph = (text, size = 10.5, leading = 14) => {
      const lines = wrap(text, font, size);
      ensure(lines.length * leading + 8);
      for (const l of lines) { page.drawText(l, { x: left, y, size, font }); y -= leading; }
      y -= 8;
    };
    // Headings need clear space above and below to count as headings (isProminentHeading).
    const heading = (text, size = 14) => {
      ensure(60);
      y -= 14; page.drawText(text, { x: left, y, size, font: bold }); y -= 30;
    };
    const figure = (text) => { ensure(30); page.drawText(text, { x: left, y, size: 9, font }); y -= 26; };
    // headerSize 11: larger than body; 10.5: bold at body size (as most manuals set it).
    const table = (spec, headerSize = 11) => {
      const [title, h1, h2, c1, c2] = spec.split("|");
      ensure(80);
      page.drawText(title, { x: left, y, size: 9, font }); y -= 20;
      page.drawText(h1, { x: left, y, size: headerSize, font: bold }); page.drawText(h2, { x: left + 160, y, size: headerSize, font: bold }); y -= 16;
      page.drawText(c1, { x: left, y, size: 9, font }); page.drawText(c2, { x: left + 160, y, size: 9, font }); y -= 30;
    };
    const put = (c, text, kind) => {
      if (c.layout === "heading") heading(text);
      else if (c.layout === "figure") figure(text);
      else if (c.layout === "table") table(text);
      else if (c.layout === "tableBody") table(text, 10.5);
      else if (c.layout === "lines") { for (const l of text.split("|")) paragraph(l); }
      else paragraph(text);
      placed.push({ c, kind, page: pageNo, text: c.layout ? text.split("|").join(" ") : text });
    };
    // Section labels are bold headings too, so they are written in Title Case.
    const label = (text) => { ensure(40); y -= 6; page.drawText(titleCaseText(text), { x: left, y, size: 12, font: bold }); y -= 22; };

    newPage();
    heading("Self-Check Sample: Deliberate Errors", 16);
    let lastCat = "";
    for (const c of SELF_CHECK_CASES) {
      if (c.category !== lastCat) { label(CATEGORY_LABELS[c.category] || c.category); lastCat = c.category; }
      put(c, c.wrong, "wrong");
    }
    page = null; // corrected versions start on a new page
    newPage();
    heading("Self-Check Sample: Corrected Text", 16);
    lastCat = "";
    for (const c of SELF_CHECK_CASES) {
      if (c.category !== lastCat) { label(CATEGORY_LABELS[c.category] || c.category); lastCat = c.category; }
      put(c, c.right, "right");
    }
    return { bytes: await doc.save(), placed };
  }

  async function runSelfCheck(forceAll = false) {
    selfCheck.forceAll = !!forceAll;
    const btn = document.getElementById("self-check-btn");
    if (btn) { btn.disabled = true; btn.textContent = "Building sample…"; }
    try {
      await ensurePdfjs();
      const { bytes, placed } = await buildSelfCheckPdf();
      const pdf = await window.pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
      selfCheck.pending = true;
      selfCheck.running = true;
      selfCheck.placed = placed;
      await renderViewer(pdf, SELF_CHECK_FILENAME);
    } catch (err) {
      selfCheck.pending = false;
      selfCheck.running = false;
      console.error("[demo] self-check failed:", err);
      alert("Self-check failed: " + (err && err.message ? err.message : err));
    } finally { if (btn) { btn.disabled = false; btn.textContent = "Run self-check"; } }
  }

  const normText = (s) => String(s || "").replace(/\s+/g, " ").trim();
  // A finding belongs to a placed text if both its match and its context sit inside it.
  function findingIn(f, place) {
    if (f.page !== place.page) return false;
    const t = normText(place.text), m = normText(f.text), ctx = normText(f.context);
    if (!m || !t.includes(m)) return false;
    return !ctx || t.includes(ctx) || ctx.includes(t);
  }

  function evaluateSelfCheck(findings) {
    const rules = getRules();
    const rows = SELF_CHECK_CASES.map((c) => {
      const rule = rules.find((r) => r.id === c.ruleId);
      const wrong = selfCheck.placed.find((p) => p.c === c && p.kind === "wrong");
      const right = selfCheck.placed.find((p) => p.c === c && p.kind === "right");
      const onWrong = findings.filter((f) => findingIn(f, wrong));
      const target = onWrong.filter((f) => f.ruleId === c.ruleId && normText(f.text).includes(normText(c.flag)));
      const others = onWrong.filter((f) => f.ruleId !== c.ruleId && rules.find((x) => x.id === f.ruleId)?.enabled);
      // Corrected text: only rules that are on in the user's settings (plus the case's
      // own rule) count, so "Test all rules" checks each off rule on its own.
      const onRight = findings.filter((f) => findingIn(f, right)
        && (f.ruleId === c.ruleId || rules.find((x) => x.id === f.ruleId)?.enabled));
      // Applying the suggestion to the wrong text must give the corrected text. Skipped
      // for advice ("(consider active voice)") and layout rules (whole heading/cell).
      let fixedText = null;
      const f0 = target[0];
      if (f0 && !c.layout && !c.noFixCheck && f0.suggestion && !/^\(/.test(f0.suggestion)) {
        fixedText = normText(normText(c.wrong).replace(normText(f0.text), f0.suggestion));
      }
      const fixOk = fixedText === null || fixedText === normText(c.right);
      let status;
      if (!rule) status = "missing";
      else if (!rule.enabled && !selfCheck.forceAll) status = "off";
      else if (target.length && !onRight.length && fixOk) status = "pass";
      else status = c.limit ? "limit" : "fail";
      return { c, rule, status, target, others, onRight, fixedText, fixOk, wrongPage: wrong.page, rightPage: right.page,
        offInSettings: !!rule && !rule.enabled };
    });
    const margin = findings.filter((f) => {
      const t = normText(f.text);
      return [SELF_CHECK_MARGIN_TEXT.header, SELF_CHECK_MARGIN_TEXT.footer].some((m) => normText(m).includes(t)
        && normText(f.context) && normText(m).includes(normText(f.context)));
    });
    const tested = new Set(SELF_CHECK_CASES.map((c) => c.ruleId));
    const uncovered = rules.filter((r) => !tested.has(r.id));
    return { rows, margin, uncovered };
  }

  function renderSelfCheckReport(findings) {
    selfCheck.running = false;
    const { rows, margin, uncovered } = evaluateSelfCheck(findings);
    selfCheck.lastReport = { rows, margin, uncovered };
    const ws = document.getElementById("workspace");
    if (!ws) return;
    let panel = document.getElementById("self-check-panel");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "self-check-panel";
      panel.style.cssText = "margin:0 0 12px;padding:12px 14px;border:1px solid #d1d5db;border-radius:10px;background:#ffffff;color:#111827;font-size:13px;";
      ws.insertBefore(panel, ws.firstChild);
    }
    const tested = rows.filter((r) => r.status === "pass" || r.status === "fail");
    const passed = rows.filter((r) => r.status === "pass").length + (margin.length ? 0 : 1);
    const total = tested.length + 1; // +1: header/footer exclusion
    const ok = passed === total;
    const cats = [...new Set(rows.map((r) => r.c.category))];
    const chip = (cat) => {
      const rs = rows.filter((r) => r.c.category === cat), p = rs.filter((r) => r.status === "pass").length;
      const t = rs.filter((r) => r.status === "pass" || r.status === "fail").length;
      const lim = rs.filter((r) => r.status === "limit").length, off = rs.filter((r) => r.status === "off" || r.status === "missing").length;
      const good = p === t;
      const extra = [lim ? `${lim} limit` : "", off ? `${off} off` : ""].filter(Boolean).join(", ");
      return `<span style="display:inline-block;margin:2px 4px 2px 0;padding:2px 8px;border-radius:999px;font-size:12px;background:${good ? "#d1fae5" : "#fee2e2"};color:${good ? "#065f46" : "#991b1b"};">${escapeHtml(CATEGORY_LABELS[cat] || cat)} ${p}/${t}${extra ? ` (${extra})` : ""}</span>`;
    };
    const statusCell = (r) => (r.offInSettings && selfCheck.forceAll && r.status !== "off" ? '<span style="color:#6b7280;font-size:11px;">off in settings · </span>' : "") + ({ pass: '<b style="color:#047857;">PASS</b>', fail: '<b style="color:#b91c1c;">FAIL</b>',
      limit: '<b style="color:#92400e;">KNOWN LIMITATION</b>',
      off: '<span style="color:#6b7280;">rule off (not tested)</span>', missing: '<span style="color:#6b7280;">rule deleted</span>' }[r.status]);
    const detail = (r) => {
      if (r.status === "off" || r.status === "missing") return "";
      if (r.status === "limit") return `<span style="color:#92400e;">${escapeHtml(r.c.limit)}</span>`;
      const bits = [];
      if (!r.target.length) bits.push(`<span style="color:#b91c1c;">wrong text not flagged by this rule</span>`);
      if (!r.fixOk) bits.push(`<span style="color:#b91c1c;">suggested fix gives: "${escapeHtml(r.fixedText)}"</span>`);
      if (r.onRight.length) bits.push(`<span style="color:#b91c1c;">corrected text flagged by: ${r.onRight.map((f) => escapeHtml(f.ruleName)).join("; ")}</span>`);
      if (r.others.length) bits.push(`<span style="color:#92400e;">also flagged by: ${r.others.map((f) => escapeHtml(f.ruleName)).join("; ")}</span>`);
      return bits.join("<br>");
    };
    panel.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;justify-content:space-between;">
        <div><b>Self-check${selfCheck.forceAll ? " (all rules, including off ones)" : ""}:</b> <b style="color:${ok ? "#047857" : "#b91c1c"};">${passed} / ${total} passed</b>
          <span style="color:#6b7280;"> · each case: wrong text flagged by its rule, its suggestion gives the corrected text, and the corrected text is flagged by no rule${rows.some((r) => r.status === "limit") ? ` · ${rows.filter((r) => r.status === "limit").length} known limitation (not counted)` : ""}</span></div>
        <div style="display:flex;gap:6px;">
          <button type="button" data-self-check="rerun" title="Run the self-check again, e.g. after editing a rule" style="padding:4px 10px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;">Run again</button>
          <button type="button" data-self-check="all" title="Also test rules that are off in your settings, for this run only (nothing is saved)" style="padding:4px 10px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;">${selfCheck.forceAll ? "Test enabled rules only" : "Test all rules, including off ones"}</button>
          <button type="button" data-self-check="toggle" style="padding:4px 10px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;">Details</button>
          <button type="button" data-self-check="close" style="padding:4px 10px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;">Close</button>
        </div>
      </div>
      <div style="margin-top:6px;">${cats.map(chip).join("")}${uncovered.length ? `<span style="display:inline-block;margin:2px 4px 2px 0;padding:2px 8px;border-radius:999px;font-size:12px;background:#fef3c7;color:#92400e;">${uncovered.length} rule${uncovered.length === 1 ? "" : "s"} without a test case</span>` : ""}<span style="display:inline-block;margin:2px 4px 2px 0;padding:2px 8px;border-radius:999px;font-size:12px;background:${margin.length ? "#fee2e2" : "#d1fae5"};color:${margin.length ? "#991b1b" : "#065f46"};">Header/footer excluded ${margin.length ? "0/1" : "1/1"}</span></div>
      <div data-self-check="details" style="display:${ok ? "none" : "block"};margin-top:8px;overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
          <tr style="color:#6b7280;text-align:left;"><th style="padding:4px 6px;">Category</th><th style="padding:4px 6px;">Rule</th><th style="padding:4px 6px;">Wrong text (p.)</th><th style="padding:4px 6px;">Corrected text (p.)</th><th style="padding:4px 6px;">Result</th></tr>
          ${rows.map((r) => `<tr style="border-top:1px solid #e5e7eb;vertical-align:top;">
            <td style="padding:4px 6px;">${escapeHtml(CATEGORY_LABELS[r.c.category] || r.c.category)}</td>
            <td style="padding:4px 6px;">${escapeHtml(r.rule ? r.rule.name : r.c.ruleId)}</td>
            <td style="padding:4px 6px;">${escapeHtml(r.c.wrong.split("|").join(" "))} <span style="color:#6b7280;">(p.${r.wrongPage})</span></td>
            <td style="padding:4px 6px;">${escapeHtml(r.c.right.split("|").join(" "))} <span style="color:#6b7280;">(p.${r.rightPage})</span></td>
            <td style="padding:4px 6px;">${statusCell(r)}${detail(r) ? `<div style="margin-top:2px;">${detail(r)}</div>` : ""}</td></tr>`).join("")}
          <tr style="border-top:1px solid #e5e7eb;"><td style="padding:4px 6px;">Layout</td><td style="padding:4px 6px;">Header/footer exclusion (${MARGIN_CM} cm)</td>
            <td style="padding:4px 6px;" colspan="2">${escapeHtml(SELF_CHECK_MARGIN_TEXT.header)} / ${escapeHtml(SELF_CHECK_MARGIN_TEXT.footer)}</td>
            <td style="padding:4px 6px;">${margin.length ? `<b style="color:#b91c1c;">FAIL</b> (${margin.length} flagged)` : '<b style="color:#047857;">PASS</b>'}</td></tr>
          ${uncovered.map((r) => `<tr style="border-top:1px solid #e5e7eb;"><td style="padding:4px 6px;">${escapeHtml(CATEGORY_LABELS[r.category] || r.category)}</td>
            <td style="padding:4px 6px;">${escapeHtml(r.name)}</td><td style="padding:4px 6px;" colspan="2" style="color:#6b7280;">No test case for this rule (add one to SELF_CHECK_CASES)</td>
            <td style="padding:4px 6px;color:#92400e;font-weight:700;">NOT COVERED</td></tr>`).join("")}
        </table>
      </div>`;
    panel.querySelector('[data-self-check="toggle"]').onclick = () => {
      const d = panel.querySelector('[data-self-check="details"]');
      d.style.display = d.style.display === "none" ? "block" : "none";
    };
    panel.querySelector('[data-self-check="close"]').onclick = () => panel.remove();
    panel.querySelector('[data-self-check="rerun"]').onclick = (e) => { e.target.disabled = true; e.target.textContent = "Running…"; runSelfCheck(selfCheck.forceAll); };
    panel.querySelector('[data-self-check="all"]').onclick = (e) => { e.target.disabled = true; e.target.textContent = "Running…"; runSelfCheck(!selfCheck.forceAll); };
  }

  // "Run self-check" button next to the upload button ("Run again" is in the report panel).
  function injectSelfCheckButtons() {
    const form = document.getElementById("upload-form");
    if (form && !document.getElementById("self-check-btn")) {
      const b = document.createElement("button");
      b.type = "button"; b.id = "self-check-btn"; b.textContent = "Run self-check";
      b.title = "Review a generated sample PDF with known errors in every category and report what the rules caught";
      b.style.cssText = "margin-left:8px;";
      b.addEventListener("click", () => runSelfCheck(false));
      const submit = form.querySelector('button[type="submit"]');
      if (submit && submit.parentNode) submit.parentNode.insertBefore(b, submit.nextSibling); else form.appendChild(b);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", injectSelfCheckButtons);
  else injectSelfCheckButtons();

  async function runPosRulesOnPdf(pdf) {
    const compiled = activeRules().filter((r) => r.pos).map((r) => {
      try {
        const flags = (r.flags || "g").includes("g") ? (r.flags || "g") : (r.flags || "") + "g";
        return { rule: r, re: new RegExp(r.pattern, flags), want: parsePosCondition(r.pos) };
      } catch { return null; }
    }).filter(Boolean);
    if (!compiled.length) return [];
    const nlp = await ensureTagger();
    const findings = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      let content;
      try { content = await page.getTextContent(); } catch { continue; }
      rememberStyles(content);
      for (const para of buildParagraphs(content.items, page.view[3])) {
        let tokens = null; // tag only paragraphs where some pattern matches
        for (const { rule, re, want } of compiled) {
          re.lastIndex = 0;
          let m;
          while ((m = re.exec(para.text)) !== null) {
            if (!m[0]) { re.lastIndex++; continue; }
            tokens = tokens || tagParagraph(nlp, para.text);
            if (!posConditionMatches(want, tokens, m.index, m.index + m[0].length)) continue;
            const boxes = boxesForRange(para, m.index, m.index + m[0].length);
            if (!boxes.length) continue;
            findings.push({
              id: newId(), page: p, ruleId: rule.id, ruleName: rule.name,
              category: rule.category, severity: rule.severity,
              text: m[0], context: para.text, suggestion: applyReplacement(rule.replacement, m),
              bbox: boxes[0], bboxes: boxes, status: "pending",
            });
          }
        }
      }
    }
    return findings;
  }

  //
  // ─── Vale (server-side, POS/grammar-aware) ─────────────────────────────
  //
  // The server extracts text from the PDF itself (text layer, or OCR for
  // scanned pages), joins wrapped lines into paragraphs so sentences that
  // cross a line break are checked whole, runs Vale, and returns findings
  // with PDF coordinates in the same [x, y, w, h] form used here.
  async function runValeOnPdf(pdf) {
    if (!VALE_ENABLED) return [];
    const data = await pdf.getData();
    const params = new URLSearchParams({ margin_cm: String(MARGIN_CM), styles: VALE_STYLES, ocr: "auto" });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), VALE_TIMEOUT_MS);
    try {
      const res = await fetch(`${VALE_API_URL}?${params}`, {
        method: "POST", headers: { "Content-Type": "application/pdf" }, body: data, signal: ctrl.signal,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      const ocrPages = (body.pages || []).filter((p) => p.source === "ocr").map((p) => p.page);
      if (ocrPages.length) console.info("[demo] Vale used OCR on pages:", ocrPages);
      return (body.findings || []).map((f) => ({ ...f, id: newId(), status: "pending" }));
    } finally { clearTimeout(timer); }
  }

  function bboxOverlap(a, b) {
    const w = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
    const h = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
    if (w <= 0 || h <= 0) return 0;
    return (w * h) / Math.min(a[2] * a[3], b[2] * b[3]);
  }
  // Keep every regex finding; drop a Vale finding that flags the same spot
  // for the same category (e.g. Chicago 7.85 hyphenation and Vale both enabled).
  function mergeFindings(regexFindings, valeFindings) {
    const kept = valeFindings.filter((v) => !regexFindings.some((r) =>
      r.page === v.page && r.category === v.category && Array.isArray(r.bbox)
      && (v.bboxes || [v.bbox]).some((b) => bboxOverlap(r.bbox, b) > 0.5)));
    return [...regexFindings, ...kept].sort((a, b) =>
      a.page - b.page || (b.bbox?.[1] ?? 0) - (a.bbox?.[1] ?? 0) || (a.bbox?.[0] ?? 0) - (b.bbox?.[0] ?? 0));
  }

  //
  // ─── Rule matching over PDF text ───────────────────────────────────────
  //
  async function runRulesOnPdf(pdf) {
    const rules = activeRules();
    if (!rules.length) return [];
    const titleRule = rules.find((r) => r.id === "team-title-case");
    const tableHeaderRule = rules.find((r) => r.id === "team-table-header-case");
    const compiled = rules.filter((r) => !["team-title-case", "team-table-header-case"].includes(r.id) && !r.pos).map((r) => {
      try { return { rule: r, re: new RegExp(r.pattern, r.flags || "g") }; }
      catch { return null; }
    }).filter(Boolean);

    const findings = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      if (p === 1 || p % 10 === 0 || p === pdf.numPages) {
        setText("review-status", `Reviewing page ${p} / ${pdf.numPages}…`);
      }
      const page = await pdf.getPage(p);
      const pageHeight = page.view[3]; // [x0, y0, x1, y1]
      let content;
      try { content = await page.getTextContent(); } catch { continue; }
      rememberStyles(content);
      await resolveFontNames(page, content.items);
      viewerState.textPages.set(p, content.items);
      const bodySize = 10.5; // Table grid geometry only; heading detection does not infer body size.
      const tableTitles = content.items.filter((item) => /^Table\s+\d+[.:](?:\s+|$)/i.test(item.str || ""));
      const { headerItems, tableItems } = detectTableRows(content.items, tableTitles, bodySize);
      const labelPrefixes = content.items.filter((item) => /^(?:Figure|Fig\.|Table)\s+\d+[.:]$/i.test((item.str || "").trim()));
      for (const item of content.items) {
        if (!item.str || !item.str.trim()) continue;
        const bbox = itemBbox(item);
        // Header/footer margin filter: PDF coord y from bottom.
        // Skip if item's bottom is below MARGIN_PT (bottom margin)
        // or item's top is above pageHeight - MARGIN_PT (top margin).
        const yBottom = bbox[1];
        const yTop = bbox[1] + bbox[3];
        if (yBottom < MARGIN_PT) continue;                    // in bottom footer
        if (yTop > pageHeight - MARGIN_PT) continue;          // in top header

        if (tableHeaderRule && headerItems.has(item) && !isExcludedTitleItem(item)) {
          const suggestion = titleCaseText(item.str);
          if (suggestion !== item.str) findings.push({
            id: newId(), page: p, ruleId: tableHeaderRule.id, ruleName: tableHeaderRule.name,
            category: tableHeaderRule.category, severity: tableHeaderRule.severity,
            text: item.str, context: item.str, suggestion, bbox, status: "pending",
            explanation: "Use title case for this table header.",
          });
        }
        if (titleRule && isTitleText(item, content.items, tableItems, labelPrefixes)) {
          const suggestion = titleCaseSuggestion(item.str);
          if (suggestion !== item.str) findings.push({
            id: newId(), page: p, ruleId: titleRule.id, ruleName: titleRule.name,
            category: titleRule.category, severity: titleRule.severity,
            text: item.str, context: item.str, suggestion, bbox, status: "pending",
            explanation: "Use title case for this heading, figure or table label, or callout.",
          });
        }

        for (const { rule, re } of compiled) {
          re.lastIndex = 0;
          let m;
          while ((m = re.exec(item.str)) !== null) {
            const matchText = m[0];
            const replacement = applyReplacement(rule.replacement, m);
            findings.push({
              id: newId(),
              page: p,
              ruleId: rule.id,
              ruleName: rule.name,
              category: rule.category,
              severity: rule.severity,
              text: matchText,
              context: item.str,
              suggestion: replacement,
              bbox: bboxSlice(item, m.index, matchText.length, bbox),
              status: "pending",
              explanation: `This text matches the ${rule.name} rule.`,
            });
            if (!re.global) break;
          }
        }
      }
    }
    return findings;
  }

  // Team style: keep articles, conjunctions, and prepositions lowercase within titles.
  const TITLE_SMALL_WORDS = new Set([
    "a", "an", "the",
    "and", "but", "or", "nor", "for", "so", "yet", "although", "as", "because",
    "before", "either", "if", "neither", "once", "provided", "since", "than", "that",
    "though", "till", "unless", "until", "when", "whenever", "where", "whereas",
    "wherever", "whether", "while",
    "about", "above", "across", "after", "against", "along", "amid", "among", "around",
    "at", "behind", "below", "beneath", "beside", "besides", "between", "beyond", "by",
    "concerning", "despite", "down", "during", "except", "from", "in", "inside", "into",
    "like", "near", "of", "off", "on", "onto", "out", "outside", "over", "past", "per",
    "regarding", "round", "through", "throughout", "to", "toward", "towards", "under",
    "underneath", "unlike", "unto", "up", "upon", "via", "with", "within", "without",
  ]);
  function itemFontSize(item) { return Math.hypot(item.transform?.[2] || 0, item.transform?.[3] || 0); }
  // PDF.js reports item.fontName as an internal id ("g_d0_f3"), so "Bold" never
  // appears in it. The real PostScript name ("Arial-BoldMT", "Helvetica-Bold") is on
  // the loaded font object, which exists once the page's operator list has been
  // built. Fonts are shared across pages, so this costs one extra pass only on pages
  // that introduce a new font.
  const realFontName = new Map(); // PDF.js font id -> PostScript font name
  async function resolveFontNames(page, items) {
    const ids = [...new Set(items.map((it) => it.fontName).filter(Boolean))].filter((id) => !realFontName.has(id));
    if (!ids.length) return;
    const tryGet = (id) => {
      try {
        if (page.commonObjs.has(id)) { realFontName.set(id, page.commonObjs.get(id)?.name || ""); return true; }
      } catch { /* not resolved yet */ }
      return false;
    };
    if (ids.every(tryGet)) return;
    try { await page.getOperatorList(); } catch { /* fall back to the id */ }
    ids.forEach(tryGet);
  }
  function isBoldItem(item) {
    return /bold|semibold|heavy|black/i.test(realFontName.get(item.fontName) || item.fontName || "");
  }
  function isBodyFontSize(size) { return Math.abs(size - 10.5) <= 0.15; }
  function isExcludedTitleFontSize(size) { return Math.abs(size - 10) <= 0.15 || isBodyFontSize(size); }
  function isExcludedTitleItem(item) {
    return isExcludedTitleFontSize(itemFontSize(item))
      || (Number.isFinite(item.height) && isExcludedTitleFontSize(item.height));
  }
  function titleCaseText(text) {
    let wordIndex = 0;
    const titlePrefixLength = /^(?:Figure|Fig\.|Table|Callout)\s+\w+[.:]\s+/i.exec(text)?.[0].length || 0;
    let titleStarted = false;
    return text.replace(/[A-Za-z][A-Za-z'’]*/g, (word, offset) => {
      if (titlePrefixLength && offset >= titlePrefixLength && !titleStarted) { wordIndex = 0; titleStarted = true; }
      if (/^[A-Z]{2,}$/.test(word) || /[a-z][A-Z]/.test(word)) { wordIndex++; return word; }
      const lower = word.toLowerCase();
      const result = wordIndex > 0 && TITLE_SMALL_WORDS.has(lower) ? lower : lower[0].toUpperCase() + lower.slice(1);
      wordIndex++;
      return result;
    });
  }
  function titleCaseSuggestion(text) {
    const prefix = /^(?:Figure|Fig\.|Table|Callout)\s+\w+[.:]\s+/i.exec(text);
    if (!prefix) return titleCaseText(text);
    const descriptionStart = text.indexOf(". ", prefix[0].length);
    return descriptionStart < 0
      ? titleCaseText(text)
      : titleCaseText(text.slice(0, descriptionStart + 1)) + text.slice(descriptionStart + 1);
  }
  function isProminentHeading(item, pageItems) {
    if (!pageItems.length) return false;
    const size = itemFontSize(item);
    if (!size) return false;
    const y = item.transform?.[5];
    if (!Number.isFinite(y)) return false;
    const baselines = pageItems.filter((other) => other !== item && other.str?.trim())
      .map((other) => other.transform?.[5]).filter(Number.isFinite);
    if (!baselines.length) return false;
    const above = Math.min(...baselines.filter((baseline) => baseline > y + 2).map((baseline) => baseline - y));
    const below = Math.min(...baselines.filter((baseline) => baseline < y - 2).map((baseline) => y - baseline));
    const minGap = Math.max(14, size * 1.35);
    return above >= minGap && below >= minGap;
  }
  function detectTableRows(pageItems, tableTitles, bodySize) {
    const headerItems = new Set();
    const tableItems = new Set();
    for (const title of tableTitles) {
      const titleY = title.transform?.[5];
      const titleX = title.transform?.[4];
      if (!Number.isFinite(titleY) || !Number.isFinite(titleX)) continue;
      const nextTitleY = Math.max(...tableTitles.filter((other) => other !== title && other.transform?.[5] < titleY)
        .map((other) => other.transform[5]));
      const lowerY = Math.max(titleY - 500, Number.isFinite(nextTitleY) ? nextTitleY + bodySize : -Infinity);
      const rows = [];
      for (const item of pageItems) {
        const y = item.transform?.[5], x = item.transform?.[4];
        if (!item.str?.trim() || !Number.isFinite(x) || !Number.isFinite(y)
          || y > titleY - bodySize * 1.1 || y < lowerY || x < titleX - 30 || x > titleX + 600
          || /^(?:Figure|Fig\.|Table|Callout)\s+\w+[.:]/i.test(item.str.trim())) continue;
        let row = rows.find((candidate) => Math.abs(candidate.y - y) < 2);
        if (!row) { row = { y, items: [] }; rows.push(row); }
        row.items.push(item);
      }
      rows.sort((a, b) => b.y - a.y);
      const gridRows = rows.filter((row) => {
        const cells = row.items.sort((a, b) => a.transform[4] - b.transform[4]);
        return cells.length >= 2 && cells.some((cell, index) => index > 0
          && cell.transform[4] - cells[index - 1].transform[4] > Math.max(40, (cells[index - 1].width || 0) * 0.8));
      });
      if (!gridRows.length) continue;
      for (const row of gridRows) row.items.forEach((item) => tableItems.add(item));
      const firstRow = gridRows[0];
      const distinctHeaderStyle = firstRow.items.some((item) => isBoldItem(item)
        || Math.hypot(item.transform?.[2] || 0, item.transform?.[3] || 0) > bodySize * 1.03);
      if (distinctHeaderStyle && firstRow.y > titleY - 120) firstRow.items.forEach((item) => headerItems.add(item));
    }
    return { headerItems, tableItems };
  }
  function classifyTextRole(item, pageItems = [], tableItems = new Set(), labelPrefixes = []) {
    const value = (item.str || "").trim();
    if (!value || tableItems.has(item)) return "other";
    const baseline = item.transform?.[5];
    const line = pageItems.length && Number.isFinite(baseline)
      ? pageItems.filter((part) => part.str?.trim() && Math.abs((part.transform?.[5] ?? NaN) - baseline) < 2)
        .sort((a, b) => (a.transform?.[4] ?? 0) - (b.transform?.[4] ?? 0))
        .map((part) => part.str.trim()).join(" ")
      : value;
    if (isExcludedTitleItem(item)) return /\.\s*$/.test(line) ? "body" : "other";
    if (/^(?:Figure|Fig\.|Table)\s+\d+[.:]\s+\S/i.test(value)) return "label";
    const x = item.transform?.[4], y = item.transform?.[5];
    if (labelPrefixes.some((prefix) => Number.isFinite(x) && Number.isFinite(y)
      && Math.abs(y - prefix.transform?.[5]) < 3 && x > prefix.transform?.[4]
      && x - prefix.transform?.[4] < (prefix.width || 100) + 60)) return "label";
    // Ignore periods in a section number such as 1.2, but not periods in prose.
    if (line.replace(/^\d+(?:\.\d+)*[.:]?\s*/, "").includes(".")) return "other";
    if (!isBoldItem(item)) return "other";
    return isProminentHeading(item, pageItems) ? "heading" : "other";
  }
  function isTitleText(item, pageItems = [], tableItems = new Set(), labelPrefixes = []) {
    const role = classifyTextRole(item, pageItems, tableItems, labelPrefixes);
    return role === "heading" || role === "label";
  }

  function applyReplacement(template, match) {
    if (!template) return "";
    return template.replace(/\$(\d+)/g, (_, n) => match[Number(n)] || "");
  }

  function itemBbox(item) {
    const tx = item.transform;
    const fontHeight = Math.abs(tx[3] || tx[0] || 12);
    const x = tx[4];
    const y = tx[5];
    const w = item.width || (item.str.length * fontHeight * 0.5);
    return [x, y - fontHeight * 0.15, w, fontHeight * 1.1];
  }
  // Character positions inside a PDF.js text item. PDF.js gives only the
  // item's total width, so measure the text with the item's font family on a
  // canvas and scale it to that width (a "W" is wider than an "i"). Falls back
  // to equal-width characters if the font family is unknown.
  const fontFamilyOf = new Map(); // PDF.js fontName -> CSS font family
  function rememberStyles(content) {
    for (const [name, st] of Object.entries((content && content.styles) || {})) {
      fontFamilyOf.set(name, st.fontFamily || "sans-serif");
    }
  }
  let measureCtx = null;
  function measureText(text, family) {
    if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
    measureCtx.font = `100px ${family}`;
    return measureCtx.measureText(text).width;
  }
  function bboxSlice(item, startIdx, len, fullBbox) {
    if (!item.str.length) return fullBbox;
    const family = fontFamilyOf.get(item.fontName);
    if (family && typeof document !== "undefined") {
      const total = measureText(item.str, family);
      if (total > 0) {
        const x0 = (measureText(item.str.slice(0, startIdx), family) / total) * fullBbox[2];
        const x1 = (measureText(item.str.slice(0, startIdx + len), family) / total) * fullBbox[2];
        return [fullBbox[0] + x0, fullBbox[1], Math.max(x1 - x0, 1), fullBbox[3]];
      }
    }
    const charW = fullBbox[2] / item.str.length;
    return [fullBbox[0] + startIdx * charW, fullBbox[1], Math.max(charW * len, charW), fullBbox[3]];
  }

  //
  // ─── Page rendering with highlight overlay ─────────────────────────────
  //
  async function renderCurrentPages() {
    const request = ++viewerState.renderRequest;
    const container = document.getElementById("pdf-document");
    if (!container || !viewerState.pdf) return;
    container.innerHTML = "";
    container.className = `pdf-document ${viewerState.viewMode === "two" ? "two-page" : "one-page"}`;
    const pdf = viewerState.pdf;
    const total = pdf.numPages;
    const pages = viewerState.viewMode === "two"
      ? [viewerState.currentPage, viewerState.currentPage + 1].filter((n) => n >= 1 && n <= total)
      : [viewerState.currentPage];

    for (const pageNum of pages) {
      const page = await pdf.getPage(pageNum);
      if (request !== viewerState.renderRequest) return;
      const original = page.getViewport({ scale: 1 });
      const viewerWidth = document.getElementById("pdf-canvas-wrap")?.clientWidth || 800;
      const layout = window.a4PageLayout(original.width, original.height, viewerWidth, viewerState.zoom, viewerState.viewMode === "two");
      const viewport = page.getViewport({ scale: layout.contentScale });
      const wrap = document.createElement("div");
      wrap.className = "pdf-page-wrap";
      wrap.dataset.page = pageNum;
      wrap.style.cssText = `display:inline-block;position:relative;width:${layout.paperWidth}px;`;
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(layout.paperWidth); canvas.height = Math.ceil(layout.paperHeight);
      canvas.style.cssText = `display:block;width:${layout.paperWidth}px;height:${layout.paperHeight}px;box-shadow:0 2px 12px rgba(0,0,0,0.08);background:#fff;`;
      wrap.appendChild(canvas);
      const overlay = document.createElement("div");
      overlay.className = "findings-overlay";
      overlay.style.cssText = `position:absolute;left:0;top:0;width:${layout.paperWidth}px;height:${layout.paperHeight}px;pointer-events:none;`;
      wrap.appendChild(overlay);
      const label = document.createElement("div");
      label.textContent = `Page ${pageNum} / ${total}`;
      label.style.cssText = "font-size:11px;color:#6b7280;margin-top:6px;text-align:center;";
      wrap.appendChild(label);
      container.appendChild(wrap);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport,
        transform: [1, 0, 0, 1, layout.offsetX, layout.offsetY] }).promise;
      if (request !== viewerState.renderRequest) return;
      drawFindingsForPage(overlay, pageNum, viewport, layout.offsetX, layout.offsetY);
      drawPdfSearchMark(overlay, pageNum, viewport, layout.offsetX, layout.offsetY);
    }
    setText("zoom-label", Math.round(viewerState.zoom * 100) + "%");
  }

  function drawFindingsForPage(overlay, pageNum, viewport, offsetX = 0, offsetY = 0) {
    overlay.innerHTML = "";
    const activeCat = getFilterValue("category-filter");
    const findings = viewerState.findings.filter((f) => f.page === pageNum);
    for (const f of findings) {
      if (f.status === "rejected") continue;
      if (activeCat !== "all" && f.category !== activeCat) continue;
      const style = SEVERITY_STYLES[f.severity] || SEVERITY_STYLES.minor;
      const isActive = f.id === viewerState.activeFindingId;
      const isAccepted = f.status === "accepted";
      for (const [px, py, pw, ph] of (Array.isArray(f.bboxes) && f.bboxes.length ? f.bboxes : [f.bbox])) {
      const [vx1, vy1] = viewport.convertToViewportPoint(px, py + ph);
      const [vx2, vy2] = viewport.convertToViewportPoint(px + pw, py);
      const x = Math.min(vx1, vx2) + offsetX, y = Math.min(vy1, vy2) + offsetY;
      const w = Math.abs(vx2 - vx1), h = Math.abs(vy2 - vy1);
      const mark = document.createElement("div");
      mark.dataset.findingId = f.id;
      mark.style.cssText = `
        position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;
        background:${isAccepted ? "transparent" : style.fill};
        border:${isActive ? `2px solid ${style.border}` : (isAccepted ? `1px dashed ${style.border}` : "none")};
        border-radius:2px;pointer-events:auto;cursor:pointer;transition:all 0.15s;`;
      mark.title = `${style.label} · ${f.ruleName}\n${f.text} → ${f.suggestion || "review"}`;
      mark.addEventListener("click", () => focusFinding(f.id));
      overlay.appendChild(mark);
      }
    }
  }

  function drawPdfSearchMark(overlay, pageNum, viewport, offsetX, offsetY) {
    const match = viewerState.searchMatches[viewerState.searchIndex];
    if (!match || match.page !== pageNum) return;
    const [x, y, width, height] = match.bbox;
    const [left, bottom] = viewport.convertToViewportPoint(x, y);
    const [right, top] = viewport.convertToViewportPoint(x + width, y + height);
    const mark = document.createElement("div");
    mark.className = "pdf-search-mark";
    mark.style.cssText = `left:${Math.min(left, right) + offsetX}px;top:${Math.min(top, bottom) + offsetY}px;width:${Math.abs(right - left)}px;height:${Math.abs(bottom - top)}px;`;
    overlay.appendChild(mark);
  }

  async function searchPreviewPdf(query) {
    const request = ++viewerState.searchRequest;
    viewerState.searchMatches = [];
    viewerState.searchIndex = -1;
    setText("pdf-search-count", query.trim() ? "Searching…" : "0 / 0");
    if (!query.trim() || !viewerState.pdf) { renderCurrentPages(); return; }
    const pages = [];
    for (let pageNumber = 1; pageNumber <= viewerState.pdf.numPages; pageNumber++) {
      let items = viewerState.textPages.get(pageNumber);
      if (!items) {
        try {
          const page = await viewerState.pdf.getPage(pageNumber);
          items = (await page.getTextContent()).items;
        } catch { items = []; }
        viewerState.textPages.set(pageNumber, items);
      }
      if (request !== viewerState.searchRequest) return;
      pages.push({ page: pageNumber, items: items.map((item) => ({ text: item.str, bbox: itemBbox(item) })) });
    }
    viewerState.searchMatches = window.findPdfTextMatches(pages, query);
    viewerState.searchIndex = viewerState.searchMatches.length ? 0 : -1;
    setText("pdf-search-count", viewerState.searchMatches.length ? `1 / ${viewerState.searchMatches.length}` : "0 / 0");
    if (viewerState.searchMatches.length) {
      await gotoPage(viewerState.searchMatches[0].page);
      document.querySelector(".findings-overlay .pdf-search-mark")?.scrollIntoView({ block: "center", inline: "center" });
    } else renderCurrentPages();
  }

  async function movePreviewPdfSearch(direction) {
    if (!viewerState.searchMatches.length) return;
    viewerState.searchIndex = (viewerState.searchIndex + direction + viewerState.searchMatches.length) % viewerState.searchMatches.length;
    setText("pdf-search-count", `${viewerState.searchIndex + 1} / ${viewerState.searchMatches.length}`);
    await gotoPage(viewerState.searchMatches[viewerState.searchIndex].page);
    document.querySelector(".findings-overlay .pdf-search-mark")?.scrollIntoView({ block: "center", inline: "center" });
  }

  window.previewPdfSearch = searchPreviewPdf;
  window.previewPdfSearchMove = movePreviewPdfSearch;
  window.previewSetZoom = (factor) => setZoom(viewerState.zoom * factor);
  window.previewRerender = renderCurrentPages;

  //
  // ─── Left sidebar cleanup ──────────────────────────────────────────────
  // Hide everything except the Document data card (per user request).
  //
  function hideUnusedSidebarSections() {
    const sidebar = document.querySelector(".left-sidebar");
    if (!sidebar) return;
    const hide = (sel) => sidebar.querySelectorAll(sel).forEach((el) => (el.style.display = "none"));
    hide(".doc-info");
    hide(".run-review-card");
    // Only hide the Applied Glossary dictionary card, keep the Document Data one.
    sidebar.querySelectorAll(".dictionary-card").forEach((el) => {
      if (!el.classList.contains("document-data-card")) el.style.display = "none";
    });
    // Add a compact document header at the top of the sidebar.
    const dataCard = sidebar.querySelector(".document-data-card");
    if (dataCard && !document.getElementById("demo-doc-header")) {
      const header = document.createElement("div");
      header.id = "demo-doc-header";
      header.style.cssText = "padding:12px 14px;margin-bottom:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;";
      header.innerHTML = `
        <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;margin:0 0 4px;">Current document</p>
        <h3 id="demo-doc-name" style="font-size:14px;font-weight:600;color:#111827;margin:0 0 4px;word-break:break-all;"></h3>
        <p id="demo-doc-meta" style="font-size:12px;color:#6b7280;margin:0;"></p>`;
      dataCard.parentNode.insertBefore(header, dataCard);
    }
    setText("demo-doc-name", viewerState.filename);
    setText("demo-doc-meta", `${viewerState.pdf.numPages} pages · header/footer 2.5 cm excluded`);
  }

  let docDataWired = false;
  function wireDocumentDataButtons() {
    if (docDataWired) return;
    docDataWired = true;
    const card = document.querySelector(".document-data-card");
    if (!card) return;
    card.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-delete-document]");
      if (!btn) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const target = btn.dataset.deleteDocument;
      if (target === "review-results") {
        if (!confirm("Clear all review results for this session?")) return;
        viewerState.findings = [];
        if (viewerState.workspaceId) localStorage.removeItem(reviewStorageKey(viewerState.workspaceId));
        setText("issue-total", "0");
        setText("review-status", "Review results cleared");
        renderIssuesPanel();
        renderCurrentPages();
        return;
      }
      if (target === "generated-files") {
        alert("Use Export PDF Report in the Reviewer tab to download the original PDF with highlight comments.");
        return;
      }
      if (target === "original" || target === "all") {
        if (!confirm("Delete this workspace and return to upload?")) return;
        if (viewerState.workspaceId) {
          try { await idbDelete(viewerState.workspaceId); } catch {}
          removeWorkspaceMeta(viewerState.workspaceId);
          localStorage.removeItem(reviewStorageKey(viewerState.workspaceId));
        }
        viewerState.pdf = null;
        viewerState.workspaceId = null;
        viewerState.findings = [];
        const upload = document.getElementById("upload-panel");
        const workspace = document.getElementById("workspace");
        if (workspace) workspace.classList.add("hidden");
        if (upload) upload.classList.remove("hidden");
      }
    }, true); // capture: bypass app.js handlers
  }

  //
  // ─── Toolbar wiring ────────────────────────────────────────────────────
  //
  let viewerWired = false;
  function wireViewerToolbar() {
    if (viewerWired) return;
    viewerWired = true;
    on("previous-page-btn", "click", () => gotoPage(viewerState.currentPage - 1));
    on("next-page-btn", "click", () => gotoPage(viewerState.currentPage + step()));
    on("page-number-input", "change", (e) => gotoPage(parseInt(e.target.value, 10) || 1));
    on("one-page-mode-btn", "click", () => setViewMode("one"));
    on("two-page-mode-btn", "click", () => setViewMode("two"));
    on("zoom-in-btn", "click", () => setZoom(viewerState.zoom * 1.15));
    on("zoom-out-btn", "click", () => setZoom(viewerState.zoom / 1.15));
    on("reset-zoom-btn", "click", () => setZoom(1));
    on("fit-width-btn", "click", () => setZoom(1.5));
    on("fit-page-btn", "click", () => setZoom(1));
  }
  function step() { return viewerState.viewMode === "two" ? 2 : 1; }
  function gotoPage(n) {
    if (!viewerState.pdf) return;
    const total = viewerState.pdf.numPages;
    viewerState.currentPage = Math.max(1, Math.min(n, total));
    const input = document.getElementById("page-number-input");
    if (input) input.value = viewerState.currentPage;
    return renderCurrentPages();
  }
  function setViewMode(mode) {
    viewerState.viewMode = mode;
    const one = document.getElementById("one-page-mode-btn");
    const two = document.getElementById("two-page-mode-btn");
    if (one) one.classList.toggle("active", mode === "one");
    if (two) two.classList.toggle("active", mode === "two");
    renderCurrentPages();
  }
  function setZoom(z) { viewerState.zoom = Math.max(0.4, Math.min(z, 3)); renderCurrentPages(); }

  //
  // ─── Suggestions panel ────────────────────────────────────────────────
  //
  let filtersWired = false;
  function wireIssuesFilters() {
    if (filtersWired) return;
    filtersWired = true;
    // Rebuild category filter to only expose our categories.
    const catSel = document.getElementById("category-filter");
    if (catSel) {
      catSel.innerHTML = `
        <option value="all">All categories</option>
        <option value="typo">Typo</option>
        <option value="spacing">Spacing</option>
        <option value="punctuation">Punctuation</option>
        <option value="grammar">Grammar</option>
        <option value="capitalization">Capitalization</option>
        <option value="numbers_abbreviations">Numbers &amp; abbreviations</option>
        <option value="hyphenation_terminology">Hyphenation &amp; terminology</option>
        `;
    }
    on("category-filter", "change", () => { renderIssuesPanel(); renderCurrentPages(); });
    on("issue-search", "input", renderIssuesPanel);
  }
  let actionsWired = false;
  function wireIssueActions() {
    if (actionsWired) return;
    actionsWired = true;
    const container = document.getElementById("issues-list");
    if (!container) return;
    container.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-demo-action]");
      if (!btn) {
        const card = e.target.closest("[data-demo-finding-id]");
        if (card && !e.target.matches("button, input")) focusFinding(card.dataset.demoFindingId);
        return;
      }
      e.stopPropagation();
      const id = btn.dataset.demoFindingId;
      const action = btn.dataset.demoAction;
      const f = viewerState.findings.find((x) => x.id === id);
      if (!f) return;
      if (action === "accept") f.status = f.status === "accepted" ? "pending" : "accepted";
      if (action === "reject") f.status = f.status === "rejected" ? "pending" : "rejected";
      saveReviewDecisions();
      renderIssuesPanel();
      renderCurrentPages();
    });
    container.addEventListener("input", (event) => {
      const input = event.target.closest("[data-demo-comment-id]");
      if (!input) return;
      const finding = viewerState.findings.find((item) => item.id === input.dataset.demoCommentId);
      if (!finding) return;
      finding.reviewerComment = input.value;
      saveReviewDecisions();
    });
  }
  function getFilterValue(id) { const el = document.getElementById(id); return (el && el.value) || "all"; }
  function visibleFindings() {
    const cat = getFilterValue("category-filter");
    const query = (document.getElementById("issue-search")?.value || "").trim().toLocaleLowerCase();
    return viewerState.findings.filter((f) =>
      (cat === "all" || f.category === cat)
      && (!query || [f.ruleName, f.ruleId, f.category, "Team Manual Standard"]
        .some((value) => String(value || "").toLocaleLowerCase().includes(query)))
    );
  }
  function renderIssuesPanel() {
    const target = document.getElementById("issues-list");
    if (!target) return;
    const list = visibleFindings();
    setText("issue-total", String(list.length));
    if (!list.length) {
      target.innerHTML = `<div class="empty-issues" style="padding:20px;color:#6b7280;">No suggestions match this filter.</div>`;
      return;
    }
    target.innerHTML = list.map((f) => {
      const style = SEVERITY_STYLES[f.severity] || SEVERITY_STYLES.minor;
      const isActive = f.id === viewerState.activeFindingId;
      const statusBadge = f.status === "accepted"
        ? `<span style="background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">accepted</span>`
        : f.status === "rejected"
          ? `<span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">ignored</span>`
          : `<span style="background:#e5e7eb;color:#374151;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">pending</span>`;
      const catColor = CATEGORY_COLORS[f.category] || "#6b7280";
      return `
        <article class="issue-card" data-demo-finding-id="${f.id}"
          style="border-left:4px solid ${style.border};${isActive ? "box-shadow:0 0 0 2px rgba(39,103,168,.25);" : ""}">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;">
            <span style="font-size:11px;color:${catColor};text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">${escapeHtml(f.category)} · p.${f.page}</span>
            ${statusBadge}
          </div>
          <div style="font-size:13px;font-weight:600;color:#111827;margin-bottom:6px;">${escapeHtml(f.ruleName)}</div>
          <div style="display:flex;gap:6px;align-items:center;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;margin:6px 0;flex-wrap:wrap;">
            <code style="background:${style.fill};padding:2px 6px;border-radius:3px;">${escapeHtml(f.text)}</code>
            <span style="color:#9ca3af;">→</span>
            <code style="background:#d1fae5;color:#065f46;padding:2px 6px;border-radius:3px;">${escapeHtml(f.suggestion || "review")}</code>
          </div>
          <div style="font-size:11px;color:#6b7280;margin-top:6px;">Context: <em>…${escapeHtml(truncate(f.context, 80))}…</em></div>
          <label style="display:block;font-size:11px;color:#6b7280;margin-top:8px;">Reviewer comment
            <input class="reviewer-comment" data-demo-comment-id="${f.id}" value="${escapeHtml(f.reviewerComment || "")}" placeholder="Reviewer comment" />
          </label>
          <div style="display:flex;gap:6px;margin-top:10px;">
            <button data-demo-action="accept" data-demo-finding-id="${f.id}"
              style="flex:1;padding:6px 10px;border:1px solid #10b981;background:${f.status === "accepted" ? "#10b981" : "#fff"};color:${f.status === "accepted" ? "#fff" : "#10b981"};border-radius:6px;cursor:pointer;font-size:12px;font-weight:500;">
              ${f.status === "accepted" ? "✓ Accepted" : "Accept"}
            </button>
            <button data-demo-action="reject" data-demo-finding-id="${f.id}"
              style="flex:1;padding:6px 10px;border:1px solid #ef4444;background:${f.status === "rejected" ? "#ef4444" : "#fff"};color:${f.status === "rejected" ? "#fff" : "#ef4444"};border-radius:6px;cursor:pointer;font-size:12px;font-weight:500;">
              ${f.status === "rejected" ? "✕ Ignored" : "Ignore"}
            </button>
          </div>
        </article>`;
    }).join("");
  }
  function truncate(s, n) { return s.length <= n ? s : s.slice(0, n); }
  function focusFinding(id) {
    const f = viewerState.findings.find((x) => x.id === id);
    if (!f) return;
    viewerState.activeFindingId = id;
    if (viewerState.currentPage !== f.page) gotoPage(f.page);
    else renderCurrentPages();
    renderIssuesPanel();
    setTimeout(() => {
      const card = document.querySelector(`[data-demo-finding-id="${id}"]`);
      if (card && card.scrollIntoView) card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);
  }

  //
  // ─── Export original PDF with highlight comments ──────────────────────
  //
  function setupExportButton() {
    const btn = document.getElementById("download-pdf-btn");
    if (!btn) return;
    btn.classList.remove("hidden");
    btn.textContent = "Export PDF Report";
    if (btn.dataset.demoWired) return;
    btn.dataset.demoWired = "1";
    btn.addEventListener("click", exportReport);
  }

  async function exportReport() {
    const findings = viewerState.findings.filter((f) => f.status === "accepted");
    if (!viewerState.pdf) { alert("Open a PDF before exporting."); return; }
    if (!findings.length) { alert("Accept a suggestion before exporting PDF comments."); return; }
    try {
      await ensurePdfLib();
      const original = await viewerState.pdf.getData();
      const doc = await window.PDFLib.PDFDocument.load(original);
      let annotated = 0;
      for (const finding of findings) {
        if (addHighlightComment(doc, finding)) annotated++;
      }
      if (!annotated) throw new Error("No accepted suggestions have valid PDF highlight coordinates.");
      const bytes = await doc.save();
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const safeName = viewerState.filename.replace(/\.pdf$/i, "").replace(/[^\w.-]+/g, "_");
      const link = document.createElement("a");
      link.href = url;
      link.download = `${safeName || "review"}_annotated_review.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      console.error("[demo] export failed:", err);
      alert("Export failed: " + err.message);
    }
  }
  function hexToRgb(hex) {
    const m = /^#?([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})$/i.exec(hex);
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
  }
  function addHighlightComment(doc, finding) {
    if (!Number.isInteger(finding.page) || finding.page < 1 || finding.page > doc.getPageCount()) return false;
    const page = doc.getPage(finding.page - 1);
    const crop = page.getCropBox();
    const boxes = (Array.isArray(finding.bboxes) && finding.bboxes.length ? finding.bboxes : [finding.bbox || []])
      .filter((b) => b.length === 4 && b.every(Number.isFinite) && b[2] > 0 && b[3] > 0)
      .map(([x, y, w, h]) => [Math.max(x, crop.x), Math.max(y, crop.y),
        Math.min(x + w, crop.x + crop.width), Math.min(y + h, crop.y + crop.height)])
      .filter(([l, b, r, t]) => l < r && b < t);
    if (!boxes.length) return false;
    const left = Math.min(...boxes.map((b) => b[0]));
    const bottom = Math.min(...boxes.map((b) => b[1]));
    const right = Math.max(...boxes.map((b) => b[2]));
    const top = Math.max(...boxes.map((b) => b[3]));
    const color = hexToRgb(CATEGORY_COLORS[finding.category] || "#fbb82e").map((channel) => channel / 255);
    const comment = `Original: ${finding.text || ""}\nSuggestion: ${finding.suggestion || "Review manually"}\nExplanation: ${finding.explanation || finding.ruleName || "Review suggestion"}\nReviewer comment: ${finding.reviewerComment || "-"}`;
    const { PDFHexString } = window.PDFLib;
    const annotation = doc.context.obj({
      Type: "Annot", Subtype: "Highlight",
      Rect: [left, bottom, right, top],
      QuadPoints: boxes.flatMap(([l, b, r, t]) => [l, t, r, t, l, b, r, b]),
      C: color, CA: 0.35, F: 4,
      T: PDFHexString.fromText(`${finding.category || "Review"} [accepted]`),
      Contents: PDFHexString.fromText(comment),
    });
    page.node.addAnnot(doc.context.register(annotation));
    return true;
  }

  //
  // ─── Team Manual Standard tab → Rule editor ───────────────────────────
  //
  window.loadTeamStandardRules = renderRuleEditor;
  const ruleFilters = { enabled: "all", category: "all", name: "", pattern: "", replacement: "", severity: "all" };
  function filteredRules(rules) {
    return rules.filter((rule) =>
      (ruleFilters.enabled === "all" || String(Boolean(rule.enabled)) === ruleFilters.enabled)
      && (ruleFilters.category === "all" || rule.category === ruleFilters.category)
      && (ruleFilters.severity === "all" || rule.severity === ruleFilters.severity)
      && ["name", "pattern", "replacement"].every((key) => String(rule[key] || "").toLowerCase().includes(ruleFilters[key].toLowerCase())));
  }

  function renderRuleEditor() {
    const view = document.getElementById("team-standard-view");
    if (!view) return;
    const rules = getRules();
    view.innerHTML = `
      <div class="page-shell" style="max-width:1100px;margin:0 auto;padding:24px;">
        <div class="page-heading" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <div>
            <p class="eyebrow">RULE EDITOR (DB)</p>
            <h2>Team Manual Standard</h2>
            <p style="color:#6b7280;font-size:13px;">Add, edit, or remove rules used by the reviewer. Stored in your browser's localStorage.</p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="primary" id="rule-add-btn">+ Add Rule</button>
            <button class="secondary" id="rule-export-btn">Export JSON</button>
            <button class="secondary" id="rule-import-btn">Import JSON</button>
            <button class="danger" id="rule-reset-btn">Reset Defaults</button>
          </div>
        </div>
        <div style="background:#eff6ff;border:1px solid #93c5fd;color:#1e40af;padding:12px 16px;border-radius:8px;font-size:12px;margin-bottom:16px;line-height:1.5;">
          <strong>How it works:</strong> Each rule uses a JavaScript regular expression tested against text extracted from the PDF (excluding the top and bottom ${MARGIN_CM} cm). Matches appear as highlighted findings. Use <code>$1</code>, <code>$2</code>… in the replacement to reference capture groups. A rule with a <strong>POS condition</strong> (shown in purple under its pattern) also checks the part of speech of each matched word, e.g. <code>ADJ|NOUN NOUN NOUN|PROPN</code>, or <code>VERB ... SCONJ PRON ...</code> where <code>...</code> stands for any number of words; it is checked on whole paragraphs, so phrases split across lines are found.
        </div>
        <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;font-size:13px;">
          <thead style="background:#f9fafb;">
            <tr>
              ${["enabled", "category", "name", "pattern", "replacement", "severity"].map((key) => `<th style="padding:10px;text-align:left;border-bottom:1px solid #e5e7eb;vertical-align:top;">${{enabled:"On",category:"Category",name:"Name",pattern:"Pattern (regex)",replacement:"Replacement",severity:"Severity"}[key]} <button type="button" data-rule-filter-button="${key}" aria-label="Filter ${{enabled:"On",category:"Category",name:"Name",pattern:"Pattern",replacement:"Replacement",severity:"Severity"}[key]}" title="Filter this column" style="border:1px solid #cbd5e1;background:#fff;border-radius:4px;cursor:pointer;">⌕</button><div data-rule-filter-panel="${key}" hidden style="margin-top:6px;">${key === "enabled" || key === "category" || key === "severity" ? `<select data-rule-filter-input="${key}" aria-label="Filter ${key}" style="max-width:130px;">${["all", ...(key === "enabled" ? ["true", "false"] : key === "severity" ? ["minor", "major", "critical"] : [...new Set(rules.map((rule) => rule.category))].sort())].map((option) => `<option value="${escapeHtml(option)}" ${ruleFilters[key] === option ? "selected" : ""}>${option === "true" ? "On" : option === "false" ? "Off" : option}</option>`).join("")}</select>` : `<input type="search" data-rule-filter-input="${key}" aria-label="Filter ${key}" value="${escapeHtml(ruleFilters[key])}" style="width:120px;" />`}</div></th>`).join("")}
              <th style="padding:10px;text-align:right;border-bottom:1px solid #e5e7eb;">Actions</th>
            </tr>
          </thead>
          <tbody id="rule-tbody">
            ${filteredRules(rules).map(renderRuleRow).join("")}
          </tbody>
        </table>
        <input type="file" id="rule-import-file" accept="application/json" style="display:none;" />
      </div>
      <div id="rule-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:1000;align-items:center;justify-content:center;padding:20px;"></div>
    `;
    wireRuleEditor();
  }

  function renderRuleRow(r) {
    return `
      <tr data-rule-id="${r.id}" style="border-bottom:1px solid #f3f4f6;">
        <td style="padding:8px;"><input type="checkbox" data-rule-toggle ${r.enabled ? "checked" : ""} /></td>
        <td style="padding:8px;"><span style="background:${CATEGORY_COLORS[r.category] || "#6b7280"};color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;">${escapeHtml(r.category)}</span></td>
        <td style="padding:8px;font-weight:500;">${escapeHtml(r.name)}</td>
        <td style="padding:8px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#374151;">${escapeHtml(r.pattern)}${r.pos ? `<div style="margin-top:4px;color:#7c3aed;">POS: ${escapeHtml(r.pos)}</div>` : ""}</td>
        <td style="padding:8px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#059669;">${escapeHtml(r.replacement || "—")}</td>
        <td style="padding:8px;"><span style="color:${(SEVERITY_STYLES[r.severity] || SEVERITY_STYLES.minor).border};font-weight:600;font-size:12px;">${escapeHtml(r.severity)}</span></td>
        <td style="padding:8px;text-align:right;">
          <button data-rule-edit style="padding:4px 10px;border:1px solid #d1d5db;background:#fff;border-radius:6px;cursor:pointer;font-size:12px;margin-right:4px;">Edit</button>
          <button data-rule-delete style="padding:4px 10px;border:1px solid #ef4444;background:#fff;color:#ef4444;border-radius:6px;cursor:pointer;font-size:12px;">Delete</button>
        </td>
      </tr>`;
  }

  function wireRuleEditor() {
    const header = document.querySelector("#team-standard-view thead");
    header.addEventListener("click", (event) => {
      const button = event.target.closest("[data-rule-filter-button]");
      if (!button) return;
      const panel = header.querySelector(`[data-rule-filter-panel="${button.dataset.ruleFilterButton}"]`);
      panel.hidden = !panel.hidden;
      button.setAttribute("aria-expanded", String(!panel.hidden));
      if (!panel.hidden) panel.querySelector("input,select").focus();
    });
    const updateFilter = (event) => {
      const key = event.target.dataset.ruleFilterInput;
      if (!key) return;
      ruleFilters[key] = event.target.value;
      document.getElementById("rule-tbody").innerHTML = filteredRules(getRules()).map(renderRuleRow).join("");
    };
    header.addEventListener("input", updateFilter);
    header.addEventListener("change", updateFilter);
    document.getElementById("rule-add-btn").addEventListener("click", () => openRuleModal(null));
    document.getElementById("rule-reset-btn").addEventListener("click", () => {
      if (!confirm("Reset to default rules? Your custom rules will be removed.")) return;
      resetRules();
      renderRuleEditor();
    });
    document.getElementById("rule-export-btn").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(getRules(), null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "review_rules.json"; a.click();
      URL.revokeObjectURL(url);
    });
    document.getElementById("rule-import-btn").addEventListener("click", () => {
      document.getElementById("rule-import-file").click();
    });
    document.getElementById("rule-import-file").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) throw new Error("Expected an array of rules.");
        saveRules(parsed);
        renderRuleEditor();
        alert(`Imported ${parsed.length} rules.`);
      } catch (err) { alert("Import failed: " + err.message); }
      e.target.value = "";
    });

    const tbody = document.getElementById("rule-tbody");
    tbody.addEventListener("click", (e) => {
      const row = e.target.closest("[data-rule-id]");
      if (!row) return;
      const id = row.dataset.ruleId;
      if (e.target.matches("[data-rule-edit]")) openRuleModal(getRules().find((r) => r.id === id));
      if (e.target.matches("[data-rule-delete]")) {
        if (!confirm("Delete this rule?")) return;
        deleteRuleId(id); renderRuleEditor();
      }
    });
    tbody.addEventListener("change", (e) => {
      if (!e.target.matches("[data-rule-toggle]")) return;
      const row = e.target.closest("[data-rule-id]");
      const id = row.dataset.ruleId;
      const rule = getRules().find((r) => r.id === id);
      if (rule) {
        rule.enabled = e.target.checked;
        upsertRule(rule);
        tbody.innerHTML = filteredRules(getRules()).map(renderRuleRow).join("");
      }
    });
  }

  function openRuleModal(existing) {
    const modal = document.getElementById("rule-modal");
    const r = existing || { id: "custom-" + Date.now(), category: "custom", name: "", pattern: "", flags: "g", replacement: "", severity: "minor", enabled: true };
    const layoutRule = r.id === "team-title-case" || r.id === "team-table-header-case";
    modal.style.display = "flex";
    modal.innerHTML = `
      <div style="background:#fff;border-radius:10px;padding:24px;max-width:520px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.25);">
        <h3 style="margin:0 0 16px;font-size:18px;">${existing ? "Edit Rule" : "Add Rule"}</h3>
        <form id="rule-form" style="display:flex;flex-direction:column;gap:12px;">
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;">Name
            <input name="name" value="${escapeHtml(r.name)}" required style="padding:8px;border:1px solid #d1d5db;border-radius:6px;" />
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;">Category
            <select name="category" style="padding:8px;border:1px solid #d1d5db;border-radius:6px;">
              <option value="typo" ${r.category === "typo" ? "selected" : ""}>Typo</option>
              <option value="spacing" ${r.category === "spacing" ? "selected" : ""}>Spacing</option>
              <option value="punctuation" ${r.category === "punctuation" ? "selected" : ""}>Punctuation</option>
              <option value="grammar" ${r.category === "grammar" ? "selected" : ""}>Grammar</option>
              <option value="capitalization" ${r.category === "capitalization" ? "selected" : ""}>Capitalization</option>
              <option value="numbers_abbreviations" ${r.category === "numbers_abbreviations" ? "selected" : ""}>Numbers &amp; abbreviations</option>
              <option value="hyphenation_terminology" ${r.category === "hyphenation_terminology" ? "selected" : ""}>Hyphenation &amp; terminology</option>
              <option value="custom" ${r.category === "custom" ? "selected" : ""}>Custom</option>
            </select>
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;">Pattern (JavaScript regex, without / /)
            <input name="pattern" value="${escapeHtml(r.pattern)}" required ${layoutRule ? "readonly" : ""} style="padding:8px;border:1px solid #d1d5db;border-radius:6px;font-family:ui-monospace,monospace;" />
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;">Flags
            <input name="flags" value="${escapeHtml(r.flags || "g")}" placeholder="g, gi, gm…" style="padding:8px;border:1px solid #d1d5db;border-radius:6px;font-family:ui-monospace,monospace;" />
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;">Replacement (use $1, $2 for capture groups)
            <input name="replacement" value="${escapeHtml(r.replacement || "")}" ${layoutRule ? "readonly" : ""} style="padding:8px;border:1px solid #d1d5db;border-radius:6px;font-family:ui-monospace,monospace;" />
          </label>
          ${r.id === "team-title-case" ? '<p style="margin:0;color:#6b7280;font-size:12px;">Heading: Bold/Semibold/Heavy, spaced from nearby lines, and no period. Body: 10 or 10.5 pt (±0.15 pt) ending in a period. Figure/Table labels: recognized outside those font sizes. Callouts follow the heading criteria. This rule uses PDF layout; the pattern is shown for reference.</p>' : ''}
          ${r.id === "team-table-header-case" ? '<p style="margin:0;color:#6b7280;font-size:12px;">Table headers are identified from PDF layout and checked separately. The pattern is shown for reference.</p>' : ''}
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;">POS condition (optional) — one part of speech per matched word
            <input name="pos" value="${escapeHtml(r.pos || "")}" ${layoutRule ? "readonly" : ""} placeholder="e.g. ADJ|NOUN NOUN NOUN|PROPN — leave empty for a text-only rule" style="padding:8px;border:1px solid #d1d5db;border-radius:6px;font-family:ui-monospace,monospace;" />
            <span style="color:#6b7280;font-size:11px;">${POS_TAGS.join(" ")} · "|" = either · "*" = any one word · "..." = any number of words</span>
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;">Severity
            <select name="severity" style="padding:8px;border:1px solid #d1d5db;border-radius:6px;">
              <option value="minor" ${r.severity === "minor" ? "selected" : ""}>Minor (yellow)</option>
              <option value="major" ${r.severity === "major" ? "selected" : ""}>Major (orange)</option>
              <option value="critical" ${r.severity === "critical" ? "selected" : ""}>Critical (red)</option>
            </select>
          </label>
          <div id="rule-preview" style="font-size:12px;color:#6b7280;padding:8px;background:#f9fafb;border-radius:6px;min-height:20px;"></div>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">
            <button type="button" id="rule-cancel" style="padding:8px 16px;border:1px solid #d1d5db;background:#fff;border-radius:6px;cursor:pointer;">Cancel</button>
            <button type="submit" style="padding:8px 16px;border:none;background:#3b82f6;color:#fff;border-radius:6px;cursor:pointer;">Save</button>
          </div>
        </form>
      </div>`;

    const form = modal.querySelector("#rule-form");
    const preview = modal.querySelector("#rule-preview");
    function updatePreview() {
      const fd = new FormData(form);
      try {
        const re = new RegExp(fd.get("pattern"), fd.get("flags") || "g");
        const posErr = posConditionError(fd.get("pos"));
        if (posErr) {
          preview.textContent = `POS condition: ${posErr}`;
          preview.style.color = "#dc2626";
          return;
        }
        const pos = String(fd.get("pos") || "").trim().replace(/\s+/g, " ");
        preview.textContent = `Pattern OK · ${re}` + (pos ? ` · POS: ${pos}` : "");
        preview.style.color = "#059669";
      } catch (err) {
        preview.textContent = `Invalid regex: ${err.message}`;
        preview.style.color = "#dc2626";
      }
    }
    form.addEventListener("input", updatePreview);
    updatePreview();

    modal.querySelector("#rule-cancel").addEventListener("click", () => modal.style.display = "none");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const rule = {
        id: r.id,
        name: fd.get("name").trim(),
        category: fd.get("category"),
        pattern: fd.get("pattern"),
        flags: (fd.get("flags") || "g").trim() || "g",
        replacement: fd.get("replacement") || "",
        severity: fd.get("severity"),
        enabled: r.enabled !== false,
      };
      const pos = String(fd.get("pos") || "").trim().replace(/\s+/g, " ");
      if (pos) rule.pos = pos;
      try { new RegExp(rule.pattern, rule.flags); } catch (err) { alert("Invalid regex: " + err.message); return; }
      const posErr = posConditionError(rule.pos);
      if (posErr) { alert(posErr); return; }
      upsertRule(rule);
      modal.style.display = "none";
      renderRuleEditor();
    });
  }

  //
  // ─── utils ─────────────────────────────────────────────────────────────
  //
  function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
  function on(id, ev, handler) { const el = document.getElementById(id); if (el) el.addEventListener(ev, handler); }
  function formatBytes(bytes) {
    if (!bytes && bytes !== 0) return "—";
    const units = ["B", "KB", "MB", "GB"]; let i = 0, n = bytes;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
  }
  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
})();
