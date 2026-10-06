# Rule Specification — pdf_english_reviewer / demo.js

This document defines the rule format used in `demo.js`.  
When adding or editing rules, follow this spec exactly.

---

## 1. Rule Object Fields

```js
{
  id:             string,   // REQUIRED. Unique kebab-case. Never change after first deploy.
  category:       string,   // REQUIRED. See §2.
  name:           string,   // REQUIRED. Human-readable. Format: "Source — Description".
  pattern:        string,   // REQUIRED (except layout rules). JS regex without /…/ delimiters.
  flags:          string,   // REQUIRED. Usually "g" or "gi". Always include "g".
  replacement:    string,   // REQUIRED. Corrected text, "$1"/"$2" for groups, or "(note)" for advisory.
  severity:       string,   // REQUIRED. "minor" | "major" | "critical".
  enabled:        boolean,  // REQUIRED. true = on by default, false = off by default.
  pos:            string,   // OPTIONAL. POS condition (STYLE_RULES only). See §5.
  skipOnItalic:   boolean,  // OPTIONAL. When true, skip this rule for italic text items.
  skipOnLastPage: boolean,  // OPTIONAL. When true, skip this rule for the document's last page.
}
```

> **Engine behavior**: The cover page (p = 1) and the back cover (last page) are **globally excluded** from all rules — no findings are ever generated for those pages regardless of individual rule fields.

---

## 2. Categories

| Value | Label |
|-------|-------|
| `typo` | Typo |
| `spacing` | Spacing |
| `punctuation` | Punctuation |
| `grammar` | Grammar |
| `capitalization` | Capitalization |
| `numbers_abbreviations` | Numbers & abbreviations |
| `hyphenation_terminology` | Hyphenation & terminology |
| `custom` | Custom |

---

## 3. Rule Arrays

| Array | Purpose |
|-------|---------|
| `CHICAGO_RULES` | Chicago Manual of Style rules (regex-only) |
| `STYLE_RULES` | Grammar rules that need POS (part-of-speech) conditions |
| `TEAM_RULES` | Internal team standards |

Rules go **at the end of the matching array**, just before the closing `];`.

---

## 4. ID Naming Convention

| Array | Prefix | Example |
|-------|--------|---------|
| `CHICAGO_RULES` | `chicago-NN-keyword` | `chicago-97-footnote-dash` |
| `STYLE_RULES` | `style-keyword` | `style-passive-voice` |
| `TEAM_RULES` | `team-keyword` | `team-abbreviation-period` |

`NN` for `CHICAGO_RULES`: use the next available number after the last `chicago-NN` in the array.

---

## 5. POS Condition (pos field — STYLE_RULES only)

Syntax: space-separated UPOS tags, `|` for OR, `*` for any tag, `...` for any number of tokens.

Valid UPOS tags: `ADJ ADP ADV AUX CCONJ DET INTJ NOUN NUM PART PRON PROPN PUNCT SCONJ SYM VERB X`

Examples:
- `"AUX VERB"` — auxiliary followed by verb
- `"ADJ|NOUN NOUN"` — adjective or noun, then noun
- `"VERB ... SCONJ PRON ..."` — verb, any words, then subordinating conjunction + pronoun

---

## 6. Replacement Field

| Pattern | Meaning |
|---------|---------|
| `"$1 $2"` | Use capture groups from `pattern` |
| `"(note text)"` | Advisory comment — not auto-applied |
| `""` | No suggestion (flag only) |
| `"word"` | Exact replacement |

---

## 7. Migration Key Requirement

When **editing an existing rule** (changing `pattern`, `name`, `flags`, `replacement`, `severity`, `pos`, `skipOnItalic`, or `skipOnLastPage`):

1. Add a new `const` key near the other migration keys (around line 200):
   ```js
   const RULES_EDIT_YYYYMMDDTHHMMSS_KEY = "tw-demo-rules-edit-yyyymmddthhmmssZ";
   ```
2. Add a migration block inside `getRules()`, after the last `localStorage.setItem(…, "done")` block:
   ```js
   if (localStorage.getItem(RULES_EDIT_YYYYMMDDTHHMMSS_KEY) !== "done") {
     const r = rules.find((r) => r.id === "the-rule-id");
     if (r) { /* apply the field change */ }
     saveRules(rules);
     localStorage.setItem(RULES_EDIT_YYYYMMDDTHHMMSS_KEY, "done");
   }
   ```

When **only adding new rules** (no existing rule changes): no migration key needed.

---

## 8. Self-Check Test Cases (SELF_CHECK_CASES)

Each new rule should have at least one test case added to `SELF_CHECK_CASES`:

```js
{
  category: "same as rule.category",
  ruleId:   "same as rule.id",
  flag:     "the exact text the rule should match",
  wrong:    "Full sentence containing the error.",
  right:    "Full sentence with the error corrected.",
  // optional:
  layout:   "body" | "heading" | "figure" | "table" | "tableBody" | "lines",
  noFixCheck: true,   // if replacement is advisory ("(…)")
  limit:    "known limitation note",
}
```

> Self-check cases are placed on interior pages of a generated test PDF, so the global cover/back-cover exclusion does not affect self-check results.

---

## 9. Example Rule (CHICAGO_RULES)

```js
{ id: "chicago-97-em-dash-spacing", category: "punctuation", name: "Chicago 6.87 — No spaces around em dash",
  pattern: "\\s+—\\s+|\\s+—|—\\s+", flags: "g", replacement: "—", severity: "minor", enabled: true },
```

## 10. Example Rule (STYLE_RULES, with POS)

```js
{ id: "style-noun-string", category: "grammar", name: "Google Dev Docs — Avoid noun strings (3+ nouns in a row)",
  pattern: "\\b(\\w+)\\s+(\\w+)\\s+(\\w+)\\b", flags: "g",
  replacement: "(consider restructuring: use prepositions or verbs)", severity: "minor", enabled: false,
  pos: "NOUN NOUN NOUN" },
```

## 11. Example Rule (TEAM_RULES)

```js
{ id: "team-product-name", category: "typo", name: "Team Manual Standard — Correct product name spelling",
  pattern: "\\bNanoScope\\b", flags: "g", replacement: "NanoScope", severity: "minor", enabled: true },
```

## 12. Example Rule (with skipOnItalic)

```js
{ id: "chicago-87-thousands-comma", category: "numbers_abbreviations",
  name: "Chicago 9.55 — Comma separator in 4-digit numbers (excludes dates, URLs, Korean/US addresses, italic text, last page)",
  pattern: "...", flags: "g", replacement: "$1,$2", severity: "minor", enabled: false,
  skipOnItalic: true, skipOnLastPage: true },
```
