# Claude PDF Manual Review Criteria (MVP 참고용)

> 출처: LPH (`d31dae5a-817a-4a77-bac3-c9e89d46f512.jsonl`), TCS3 (`a0b3a487...jsonl`) 세션 로그에서 복원한 확정 taxonomy.

---

## 1. Severity — 3단계

LPH 세션에서 실사용된 심각도 분류.

| 등급 | 색상 | 정의 | 예시 |
|---|---|---|---|
| **Critical** | 🔴 red | 사실 오류, 스펙 모순, 잘못된 용어 | `refraction ratio` → `refractive index` <br> "Petri dish 15 mm OK ↔ 15 mm 불호환" |
| **Major** | 🟠 orange | 문법·의미 불분명, 관사 누락, 표 정렬 붕괴 | "Once cantilever is immersed" <br> "the tip and prism enters" |
| **Minor** | 🟡 yellow | typo, 대소문자, 띄어쓰기, 단위 공백, 약어 미정의 | `NX 20` vs `NX10` <br> `~30nm` → `~30 nm` <br> `HEM` 미정의 |

MVP에서는 Acrobat annotation color 유지 권장.

---

## 2. Category — 6종

TCS3 MVP `pdf_review.py` 확정 enum.

```
typo | grammar | awkward | content | consistency | format
```

| 카테고리 | 체크 항목 |
|---|---|
| **typo** | 오타, 문자 붙어쓰기 (`Heather→Heater`, `Pamp→Ramp`, `SmartAnlaysis`) |
| **grammar** | 주술 불일치, 관사 누락, 3인칭 단수, comma splice, "to fixes" |
| **awkward** | 어색한 영어/한국어 표현, 직역체, 중복 단어 ("Start to start"), "especially better" |
| **content** | 스펙 모순, 타 모델 잔재 텍스트 (`TCS1`, `NX15`), CAUTION 본문 상충, 잘못된 소재 설명 |
| **consistency** | 용어 혼용 (`Liquid Probehand` vs `probe hand` vs `prober`), 표기 (`파크시스템즈` vs `파크시스템스`), 단위 공백 |
| **format** | 인코딩 깨짐 (`?→Ω/©/-`, `ᐕ→©`), 표 정렬 붕괴, 그림/표 번호 리셋 실패, 헤더 버전 오류 |

---

## 3. Issue 필수 필드 (submit_issues tool schema)

```json
{
  "page":        1,
  "search_text": "10~40자 verbatim substring, 페이지 내 unique",
  "comment":     "문제 + 수정안 (문서 언어와 동일)",
  "severity":    "typo | grammar | awkward | content | consistency | format"
}
```

**핵심 규칙 (SYSTEM_PROMPT 발췌)**:

- Do NOT invent issues.
- Do NOT flag stylistic preferences that are not actually wrong.
- Do NOT flag things that are correct in the source language.
- `search_text` 는 verbatim substring 이어야 함 (paraphrase 금지).
- `comment` 언어 = 문서 언어 (EN 문서 → EN 코멘트, KR 문서 → KR 코멘트).

---

## 4. 특수 체크리스트 (프롬프트에 명시)

- Numbering errors: figures / tables / sections out of sequence or duplicated
- Encoding/glyph errors: `?` where `Ω/©/-` should appear
- Leftover text: 타 제품/모델 참조 (e.g. `TCS1` in TCS3 manual)
- Contradictions between body and CAUTION/WARNING
- Korean spacing rules (한국어 문서일 때 별도 체크)
- Chapter intro comma patterns (Preface)
- 약어 최초 사용 시 풀이 여부 (`SLD (Superluminescent Diode)`, `HEM` 미정의 등)
- 단위 공백 통일 (`30nm` → `30 nm`)
- 관사 누락 (`the cantilever`)
- 회사명 표기 통일 (`Park Systems` / `파크시스템스`)

---

## 5. Rev00 vs Rev01 비교 (MVP 확장 권장)

파일명 패턴: `(43K) *.pdf` / `(43K-rev01) *.pdf` / `(44K) *.pdf` / `(44K-rev01) *.pdf` → draft → revised 검증 흐름.

권장 3-way diff 로직:

1. 두 PDF 각각 리뷰 → issue list 생성
2. `page + search_text` fuzzy match (Levenshtein 또는 substring)
3. 3-way 분류:
   - **resolved**: rev00 에 있었고 rev01 에서 사라짐
   - **unresolved**: rev00 · rev01 양쪽 존재
   - **new (regression)**: rev01 에서 신규 발생

43K → 44K 는 별도 문서 버전 (chapter 추가 등). rev diff 와 version diff 는 분리 처리.

---

## 6. Acrobat 출력 규격

- 저장 경로: 원본 폴더에 `(rev) <원본이름>.pdf`
- Annotation 구성: **highlight 1개 + popup note 1개** (Acrobat 표준)
  - 과거 실수: `double comment` (highlight + separate sticky). 회피 필요.
- Severity 별 color mapping (TCS3 세션 확립):
  - `typo` → amber
  - `content` → red-pink
  - `consistency` → blue
  - `format` → green
  - `grammar` / `awkward` → 사용자 선택
- 위치 매칭: `fitz.Page.search_for(search_text)` → 실패 시 페이지 코너 fallback sticky
- Verbatim 매치 실패 시 fallback substring 자동 축소 로직 권장

---

## 7. 도메인 용어 검증 (AFM 분야)

LPH / TCS3 리뷰에서 실제 잡힌 도메인 이슈:

- `refraction ratio` → `refractive index`
- `cantilever` / `tip` / `prism` 관계
- `lock-in amplifier`, `KPFM`, `EFM`, `SLD` 등 약어 초출 풀이
- Immersion / Petri dish 스펙 (직경, 재질) 상호 검증
- CAUTION: 액체 · 전기 · 레이저 안전 조건

RAT (사람 리뷰) 문서 참고: `20260429_ RAT EFM Mode manual Review.txt` — 도메인 지식 크로스체크용.

---

## 8. MVP 코드 구조 참고

기존 MVP: `C:\Users\Kate.Park\Desktop\1. Manual\TCS3-UM0\feedback\claude\pdf_reviewer\pdf_review.py`

핵심 상수:

- `SYSTEM_PROMPT` — 위 규칙 정의
- `SUBMIT_TOOL` — schema 정의 (page / search_text / comment / severity)
- Category enum: `typo | grammar | awkward | content | consistency | format`
- PDF I/O: PyMuPDF (`fitz`)
- LLM: Anthropic SDK, tool use 강제 (`tool_choice = {"type": "tool", "name": "submit_issues"}`)

---

## 9. 참고 파일 경로

| 용도 | 경로 |
|---|---|
| 기존 MVP 소스 | `C:\Users\Kate.Park\Desktop\1. Manual\TCS3-UM0\feedback\claude\pdf_reviewer\pdf_review.py` |
| LPH 리뷰 로그 (Critical/Major/Minor 예시) | `~\.claude\projects\C--Users-Kate-Park-Desktop-1--Manual-LPH-UM0-B0-00-EN--NX-Liquid-Probehand--feedback-claude\d31dae5a-817a-4a77-bac3-c9e89d46f512.jsonl` |
| 사람 도메인 리뷰 | `C:\Users\Kate.Park\Desktop\1. Manual\MODE-UM0-B0.00-EN (Basic Mode Manual)\draft and feedback\20260429_ RAT EFM Mode manual Review.txt` |

---

## 10. 요약 — MVP 반영 우선순위

1. **필수**: Category enum 6종 + submit_issues schema 그대로 이식
2. **필수**: `Do NOT invent / stylistic / correct-in-source` 3대 금지 규칙 SYSTEM_PROMPT 포함
3. **권장**: Severity 3단계 (Critical/Major/Minor) + color mapping
4. **권장**: rev00 vs rev01 3-way diff (resolved / unresolved / new)
5. **선택**: 도메인 용어 사전 (AFM 관련) 별도 파일화 → SYSTEM_PROMPT 에 주입
6. **선택**: highlight + popup 단일 annotation 규칙 (double comment 회피)

---

## 11. CMOS 기반 영문 규칙

영문 기술 매뉴얼은 Chicago Manual of Style(CMOS)을 기본 스타일로 사용한다.
자동 판정은 오탐이 적은 다음 항목으로 제한한다.

- 세 개 이상의 단순 병렬 항목에는 마지막 `and` 또는 `or` 앞에 serial
  comma를 사용한다.
- `e.g.`와 `i.e.` 뒤에는 쉼표를 사용한다. 정식 본문에서는 가능하면
  `for example`, `that is`로 풀어 쓴다.
- 미국을 뜻하는 약어는 `U.S.`가 아닌 `US`로 표기한다.
- Figure 제목의 headline-style capitalization은
  `Figure <chapter>.<sequence>` 뒤의 실제 제목에만 적용한다. 관사,
  등위접속사, 전치사는 첫 단어와 마지막 단어가 아닌 경우 소문자로
  유지하고, 나머지 주요 단어는 대문자로 시작한다.

다음 항목은 CMOS 규칙과 별개로 프로젝트 예외를 우선한다.

- `TM`, `RTM`, `™`, `®`, 제품명, 모델명, UI label은 glossary 보호를
  적용한다.
- Table of Contents의 dot leader는 텍스트 검토에서 제외한다.
- 일반 공백은 검토하지 않고 수치와 단위 사이의 공백만 검토한다.
- 문맥 의존적 쉼표, 문체 선호, 광범위한 복합어 hyphenation은 자동으로
  단정하지 않는다.

LanguageTool 커스텀 규칙의 기준 파일은
`config/grammar_custom.xml`이며, 로컬 엔진 시작 시 설치 폴더로 복사한다.
