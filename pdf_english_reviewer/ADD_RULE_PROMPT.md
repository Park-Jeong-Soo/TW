# Claude Prompt — Add Rules to demo.js

## How to use

1. Open a new Claude conversation (claude.ai or Claude Code).
2. Attach **two files**: `demo.js` (current version) + `RULE_SPEC.md`.
3. Copy the prompt below, fill in the `## Rules to Add` section, and send.
4. Claude returns the updated `demo.js`. Replace the old file and run `git add demo.js && git commit -m "Add rules" && git push`.

---

## Prompt Template (copy from here)

```
You are editing demo.js, the rule engine for a PDF English reviewer tool.

Attached files:
- demo.js — the current rule file
- RULE_SPEC.md — the rule format specification

Please add the following rules. For each rule:
1. Choose the correct array (CHICAGO_RULES / STYLE_RULES / TEAM_RULES) per RULE_SPEC §3.
2. Assign the next available `chicago-NN` id, or the appropriate prefix per RULE_SPEC §4.
3. Add at least one SELF_CHECK_CASES test case per RULE_SPEC §8.
4. Add a migration key only if you are editing an existing rule (per RULE_SPEC §7).
5. Do not change any other part of the file.

Output: the complete updated demo.js file.

## Rules to Add

### Rule 1
- Description: [설명 — 무엇을 잡아야 하는지]
- Should flag: [예시 틀린 문장]
- Should suggest: [예시 고친 문장]
- Category: [typo / spacing / punctuation / grammar / capitalization / numbers_abbreviations / hyphenation_terminology / custom]
- Array: [CHICAGO_RULES / STYLE_RULES / TEAM_RULES]
- Severity: [minor / major / critical]
- Enabled by default: [yes / no]
- POS condition needed: [no / yes → specify]
- Source / reference: [Chicago 6.xx / Google Dev Docs / Team standard / etc.]

### Rule 2 (있으면 추가)
- Description:
- Should flag:
- Should suggest:
- Category:
- Array:
- Severity:
- Enabled by default:
- POS condition needed:
- Source / reference:
```

---

## Tips

- **Array 선택 기준**
  - 문법 규칙 + 품사 조건 필요 → `STYLE_RULES`
  - Chicago Manual of Style 근거 → `CHICAGO_RULES`
  - 팀 내부 표준 → `TEAM_RULES`

- **Replacement 작성 기준**
  - 자동 수정 가능 → `"$1 corrected $2"` 형태
  - 검토 필요 / 규칙이 복잡 → `"(note: …)"` 형태
  - 단순 삭제 → `""` 또는 `"$1"`

- **Enabled 기준**
  - 확실한 오류 → `true`
  - 휴리스틱 / 검토 필요 → `false`

- **기존 규칙 수정 시**: Claude에게 "기존 `[rule-id]` 규칙의 `[field]`를 `[new value]`로 변경해줘" 라고 명시. 마이그레이션 키 자동 생성됨.
