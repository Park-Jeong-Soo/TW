# AFM Journal Search Tool v2

> **AFM 매뉴얼 Introduction 작성을 위한 저널 검색·품질 평가·PDF 수집·ZIP 내보내기 통합 도구**

Park Systems | 2025 | v2.0 Final Release

---

## 빠른 시작

### 1. HTML 도구 바로 사용 (설치 불필요)
```
tools/AFM_Journal_Search_KO.html  → Chrome/Edge에 드래그 앤 드롭
tools/AFM_Journal_Search_EN.html  → Drag & drop into Chrome/Edge
```

### 2. 발표 자료·가이드 생성
```bash
npm install
npm run build
```

생성된 파일은 `output/` 폴더에 저장됩니다.

---

## 포함된 파일

| 파일 | 설명 |
|------|------|
| `tools/AFM_Journal_Search_KO.html` | 한국어 저널 검색 도구 |
| `tools/AFM_Journal_Search_EN.html` | 영어 저널 검색 도구 |
| `output/pptx/AFM_Tool_Intro_KO.pptx` | 한국어 소개 발표 자료 (11슬라이드) |
| `output/pptx/AFM_Tool_Intro_EN.pptx` | 영어 소개 발표 자료 (11슬라이드) |
| `output/pdf/AFM_UserGuide_KO.pdf` | 한국어 사용 가이드 (13페이지) |
| `output/pdf/AFM_UserGuide_EN.pdf` | 영어 사용 가이드 (13페이지) |
| `output/docx/AFM_Tool_Intro_Script_KO.docx` | 10분 발표 스크립트 |

---

## 5단계 작성 프로세스

```
① 키워드 추합  →  ② 저널 검색  →  ③ 저널 선별  →  ④ 초안 작성  →  ⑤ 전문가 검토
   (Preset 30개)    (CrossRef +      (품질 점수        (intro_template    (review_checklist
                     Unpaywall)       0~100점)          .md 기반)          .md 활용)
```

---

## 품질 점수 기준

| 항목 | 배점 | 만점 조건 |
|------|------|-----------|
| 인용 수 (Citations) | 40점 | 500회 이상 |
| Impact Factor | 30점 | IF 20 이상 |
| 수식 수 (Equations) | 20점 | 20개 이상 |
| Physics / 회로 포함 | 10점 | 각 5점 보너스 |

---

## 다음 버전 계획 (v3)

- **REVISION 1**: 저널 Grading 세부 규정 고도화 (수식 유형별 가중치, 인용 맥락 분석)
- **REVISION 2**: 등록 저널 기반 Introduction 자동 작성 지원 (핵심 문장 추출 → 초안 생성)

---

*Park Systems · AFM Manual Introduction Builder · 2025*
