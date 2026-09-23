# AFM Journal Search Tool — Claude Code Project

## 프로젝트 개요
AFM 측정 모드 매뉴얼의 **Chapter 1 Introduction** 작성을 위한 저널 검색·품질 평가·PDF 수집·ZIP 내보내기 통합 도구입니다.

## 폴더 구조
```
AFM_Journal_Search_Tool/
├── CLAUDE.md                        ← 이 파일 (Claude Code 작업 가이드)
├── README.md                        ← 프로젝트 설명
├── package.json                     ← Node.js 패키지 설정
│
├── tools/                           ← HTML 도구 (브라우저 실행형)
│   ├── AFM_Journal_Search_KO.html   ← 한국어 저널 검색 도구 v2
│   └── AFM_Journal_Search_EN.html   ← 영어 저널 검색 도구 v2
│
├── presentations/                   ← PPT 생성 스크립트
│   ├── make_intro_ppt.js            ← 소개 발표 자료 생성 (KO + EN)
│   └── make_script_docx.js          ← 발표 스크립트 Word 생성
│
├── guides/                          ← 사용자 가이드 생성 스크립트
│   ├── make_guide_ko.js             ← 한국어 가이드 PDF 생성
│   └── make_guide_en.js             ← 영어 가이드 PDF 생성
│
├── output/                          ← 생성된 파일 저장 폴더
│   ├── html/                        ← HTML 도구 복사본
│   ├── pptx/                        ← 생성된 PPT 파일
│   ├── pdf/                         ← 생성된 PDF 파일
│   └── docx/                        ← 생성된 Word 파일
│
└── assets/                          ← 공통 리소스
    └── fonts/                       ← 필요한 폰트 (자동 다운로드)
```

## Claude Code 실행 명령어

### 전체 빌드 (모든 파일 한 번에 생성)
```bash
npm run build
```

### 개별 실행
```bash
# PPT 생성 (한국어 + 영어)
npm run ppt

# 발표 스크립트 Word 생성
npm run script

# 사용자 가이드 PDF 생성
npm run guide

# HTML 도구를 output 폴더로 복사
npm run tools
```

### 의존성 설치
```bash
npm install
```

## 주요 의존성
- `pptxgenjs` — PPT 파일 생성
- `docx` — Word 파일 생성
- `jszip` — ZIP 파일 처리 (HTML 도구 내장)
- `react`, `react-dom`, `react-icons` — 아이콘 렌더링 (PPT 생성 시)
- `sharp` — SVG → PNG 변환 (PPT 아이콘 처리)

## HTML 도구 사용법
`tools/` 폴더의 HTML 파일을 Chrome/Edge에 드래그 앤 드롭하여 즉시 실행합니다.

## API 정보
- **CrossRef API**: https://api.crossref.org — 무료, API 키 불필요
- **Unpaywall API**: https://api.unpaywall.org — 무료, 이메일 주소만 필요

## 다음 버전 계획
- REVISION 1: 저널 Grading 세부 규정 고도화
- REVISION 2: 등록 저널 기반 Introduction 자동 작성 지원
