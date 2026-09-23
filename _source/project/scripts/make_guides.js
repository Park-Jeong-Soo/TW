/**
 * 사용자 가이드 HTML을 output/pdf/ 폴더에 생성합니다.
 * 브라우저에서 열어 Ctrl+P → PDF로 저장하거나,
 * wkhtmltopdf가 설치된 환경에서는 자동으로 PDF 변환됩니다.
 *
 * 실행: node scripts/make_guides.js
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT   = path.resolve(__dirname, '..');
const OUT    = path.join(ROOT, 'output', 'pdf');

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

// ── 공통 CSS ──────────────────────────────────────────────────────────
const CSS = `
:root {
  --navy:#0B1D3A; --blue:#185FA5; --teal:#00C2A8;
  --amber:#C47A0A; --green:#2D7A4A; --gray:#4A5568;
  --lgray:#8A93A8; --bg:#F4F7FB; --border:#D0D7E4;
}
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:Arial,sans-serif;color:#1A2540;font-size:10.5pt;line-height:1.7;background:#fff;}
@page{size:A4;margin:18mm 16mm 22mm 16mm;}
@page:first{margin-top:0;margin-bottom:0;margin-left:0;margin-right:0;}
.cover{background:linear-gradient(145deg,#0B1D3A 0%,#185FA5 100%);
  min-height:297mm;padding:36mm 20mm 24mm;page-break-after:always;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;}
.cover-tag{font-size:8pt;font-weight:700;letter-spacing:.2em;color:#00C2A8;
  text-transform:uppercase;margin-bottom:6mm;}
.cover-title{font-size:36pt;font-weight:700;color:#fff;line-height:1.2;margin-bottom:5mm;}
.cover-title span{color:#00C2A8;}
.cover-sub{font-size:12pt;color:#B5D4F4;line-height:1.6;margin-bottom:10mm;}
.cover-line{width:40mm;height:2mm;background:#00C2A8;margin-bottom:8mm;}
.chips{display:flex;gap:4mm;flex-wrap:wrap;}
.chip{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);
  border-radius:20px;padding:2mm 5mm;font-size:8pt;color:#D6E8F7;}
.cover-foot{margin-top:auto;padding-top:80mm;font-size:8pt;color:rgba(255,255,255,.3);}
.toc-page{page-break-after:always;padding:12mm 0 8mm;}
.toc-title{font-size:18pt;font-weight:700;color:var(--navy);padding-bottom:3mm;
  border-bottom:2px solid var(--teal);margin-bottom:6mm;}
.toc-item{display:flex;padding:2.5mm 0;border-bottom:1px dotted var(--border);font-size:10pt;}
.toc-num{min-width:8mm;font-weight:700;color:var(--blue);}
.toc-label{flex:1;}.toc-label.sub{padding-left:8mm;color:var(--gray);font-size:9.5pt;}
.toc-pg{font-size:9pt;color:var(--lgray);}
.section{page-break-inside:avoid;margin-bottom:8mm;}
.break{page-break-before:always;}
.ch-hdr{background:var(--navy);color:#fff;padding:5mm 7mm;margin-bottom:5mm;border-radius:4px;}
.ch-tag{font-size:7pt;color:var(--teal);font-weight:700;letter-spacing:.15em;
  text-transform:uppercase;margin-bottom:1.5mm;}
.ch-title{font-size:15pt;font-weight:700;color:#fff;}
h2{font-size:13pt;font-weight:700;color:var(--navy);padding-left:3.5mm;
  border-left:3px solid var(--teal);margin:5mm 0 3mm;}
h3{font-size:11pt;font-weight:700;color:var(--blue);margin:4mm 0 2mm;}
p{margin-bottom:3mm;}
.step{display:flex;gap:4mm;margin-bottom:4mm;page-break-inside:avoid;}
.step-n{min-width:7mm;height:7mm;background:var(--navy);color:#fff;border-radius:50%;
  display:flex;align-items:center;justify-content:center;font-size:8pt;font-weight:700;
  flex-shrink:0;margin-top:.5mm;}
.step-c{flex:1;}.step-t{font-weight:700;color:var(--navy);margin-bottom:1mm;}
.step-d{font-size:9.5pt;color:var(--gray);}
.info{border-left:3px solid var(--blue);background:#E6F1FB;padding:3mm 4mm;
  margin:3mm 0;border-radius:0 4px 4px 0;font-size:9.5pt;color:#0C3A6A;}
.info.tip{border-color:var(--teal);background:#E0F7F5;color:#0A5045;}
.info.warn{border-color:var(--amber);background:#FEF3E0;color:#7A4A0A;}
.info.ok{border-color:var(--green);background:#E4F5EC;color:#1E5A38;}
.info-lbl{font-weight:700;margin-bottom:1mm;font-size:8pt;letter-spacing:.05em;}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin:3mm 0;}
.card{background:var(--bg);border:1px solid var(--border);border-radius:5px;padding:3.5mm 4mm;}
.card-h{font-weight:700;font-size:9.5pt;color:var(--navy);margin-bottom:2mm;}
.card-b{font-size:9pt;color:var(--gray);line-height:1.6;}
.score-row{margin-bottom:3mm;}
.score-lr{display:flex;justify-content:space-between;font-size:9pt;margin-bottom:1mm;}
.score-lbl{font-weight:500;}.score-pts{font-weight:700;color:var(--blue);}
.score-track{height:5px;background:var(--border);border-radius:3px;overflow:hidden;}
.score-fill{height:100%;border-radius:3px;}
.score-note{font-size:8pt;color:var(--lgray);margin-top:1mm;}
table{width:100%;border-collapse:collapse;margin:3mm 0;font-size:9pt;}
th{background:var(--navy);color:#fff;padding:2.5mm 3mm;text-align:left;
  font-weight:600;font-size:8.5pt;}
td{padding:2.5mm 3mm;border-bottom:1px solid var(--border);color:var(--gray);}
tr:nth-child(even) td{background:var(--bg);}
.fb{display:inline-block;padding:.5mm 2.5mm;border-radius:3px;font-size:7pt;
  font-weight:700;color:#fff;margin-left:1.5mm;vertical-align:middle;}
.fb-json{background:var(--amber);}.fb-html{background:var(--blue);}
.fb-txt{background:var(--green);}.fb-md{background:#7B4FA8;}.fb-pdf{background:#C0392B;}
.rev{background:var(--navy);color:#fff;border-radius:6px;padding:4mm 5mm;margin-bottom:4mm;}
.rev-tag{display:inline-block;background:var(--teal);color:#fff;font-size:7pt;
  font-weight:700;padding:.5mm 3mm;border-radius:12px;margin-bottom:2mm;}
.rev-title{font-size:11pt;font-weight:700;color:#fff;margin-bottom:2.5mm;}
.rev-list{list-style:none;padding:0;}
.rev-list li{font-size:9.5pt;color:#B5D4F4;padding:1mm 0 1mm 4mm;position:relative;}
.rev-list li::before{content:'·';position:absolute;left:0;color:var(--teal);font-weight:700;}
ul.gl{padding-left:5mm;margin:2mm 0;}
ul.gl li{margin-bottom:1.5mm;font-size:9.5pt;color:var(--gray);}
.hl{color:var(--blue);font-weight:700;}
.mono{font-family:'Courier New',monospace;font-size:8.5pt;background:var(--bg);
  padding:.5mm 1.5mm;border-radius:3px;}
.sep{border:none;border-top:1px solid var(--border);margin:5mm 0;}
`;

// ── 한국어 가이드 HTML ────────────────────────────────────────────────
function buildKO() {
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"/>
<title>AFM Journal Search Tool v2 — 한국어 사용 가이드</title>
<style>${CSS}</style></head><body>

<div class="cover">
  <div class="cover-tag">USER GUIDE &nbsp;·&nbsp; KOREAN EDITION</div>
  <div class="cover-title">AFM Journal<br><span>Search Tool</span> v2</div>
  <div class="cover-sub">매뉴얼 Introduction 작성을 위한<br>저널 검색 · 품질 평가 · PDF 수집 · ZIP 내보내기 통합 도구</div>
  <div class="cover-line"></div>
  <div class="chips">
    <div class="chip">버전 v2.0 — 최종 배포</div>
    <div class="chip">Park Systems</div>
    <div class="chip">2025</div>
    <div class="chip">한국어 사용 가이드</div>
  </div>
  <div class="cover-foot">AFM Manual Introduction Builder · Park Systems · 2025</div>
</div>

<div class="toc-page">
  <div class="toc-title">목차</div>
  <div class="toc-item"><span class="toc-num">1.</span><span class="toc-label">도구 소개 및 개요</span><span class="toc-pg">3</span></div>
  <div class="toc-item"><span class="toc-num"></span><span class="toc-label sub">1.1 AFM Journal Search Tool이란? / 1.2 주요 특징 / 1.3 시스템 요구사항</span></div>
  <div class="toc-item"><span class="toc-num">2.</span><span class="toc-label">시작하기</span><span class="toc-pg">4</span></div>
  <div class="toc-item"><span class="toc-num">3.</span><span class="toc-label">워크플로우 — 단계별 가이드 (STEP 1~7)</span><span class="toc-pg">5</span></div>
  <div class="toc-item"><span class="toc-num">4.</span><span class="toc-label">저널 품질 점수 시스템</span><span class="toc-pg">8</span></div>
  <div class="toc-item"><span class="toc-num">5.</span><span class="toc-label">ZIP 출력 파일 상세</span><span class="toc-pg">9</span></div>
  <div class="toc-item"><span class="toc-num">6.</span><span class="toc-label">자동 저널 등록 API 안내</span><span class="toc-pg">10</span></div>
  <div class="toc-item"><span class="toc-num">7.</span><span class="toc-label">자주 묻는 질문 (FAQ)</span><span class="toc-pg">11</span></div>
  <div class="toc-item"><span class="toc-num">8.</span><span class="toc-label">다음 버전 개선 계획</span><span class="toc-pg">12</span></div>
</div>

<div class="section break">
  <div class="ch-hdr"><div class="ch-tag">CHAPTER 01</div><div class="ch-title">도구 소개 및 개요</div></div>
  <h2>1.1 AFM Journal Search Tool이란?</h2>
  <p>AFM 측정 모드 매뉴얼의 <span class="hl">Chapter 1 Introduction 작성</span>을 체계화하기 위해 개발된 통합 연구 도구입니다. 기존에 연구자마다 다르게 수행하던 저널 검색·선별·정리 과정을 <span class="hl">단일 HTML 파일</span> 하나로 표준화했습니다.</p>
  <div class="info tip"><div class="info-lbl">이 도구가 해결하는 문제</div>연구자마다 다른 DB 사용으로 검색 기준 불일치, IF·인용 수·수식 수 통합 평가 도구 부재, 키워드 정리→검색→메모→초안 작성 반복 문제를 해결합니다.</div>
  <h2>1.2 주요 특징</h2>
  <div class="grid2">
    <div class="card"><div class="card-h">단일 HTML 파일</div><div class="card-b">설치 없이 Chrome/Edge에서 즉시 실행. 오프라인 대부분 기능 사용 가능.</div></div>
    <div class="card"><div class="card-h">API 자동 검색</div><div class="card-b">CrossRef + Unpaywall API로 키워드 기반 자동 검색 및 PDF 접근 가능 여부 실시간 확인.</div></div>
    <div class="card"><div class="card-h">품질 점수 자동 산정</div><div class="card-b">IF, 인용 수, 수식 수, Physics/회로 포함 여부 기준 0~100점 자동 계산.</div></div>
    <div class="card"><div class="card-h">ZIP 일괄 출력</div><div class="card-b">메타데이터, 보고서, 초안 템플릿, 체크리스트, PDF까지 ZIP 하나로 다운로드.</div></div>
  </div>
  <h2>1.3 시스템 요구사항</h2>
  <table><tr><th>항목</th><th>요구사항</th><th>권장</th></tr>
  <tr><td>브라우저</td><td>Chrome 90+ / Edge 90+</td><td>Chrome 최신 버전</td></tr>
  <tr><td>인터넷</td><td>자동 검색 기능 사용 시 필요</td><td>자동 검색 및 PDF 다운로드</td></tr>
  <tr><td>이메일</td><td>Unpaywall API 사용 시 필요</td><td>실제 사용 중인 이메일</td></tr>
  <tr><td>OS</td><td>Windows / macOS / Linux</td><td>—</td></tr></table>
</div>

<div class="section break">
  <div class="ch-hdr"><div class="ch-tag">CHAPTER 02</div><div class="ch-title">시작하기</div></div>
  <h2>2.1 파일 실행 방법</h2>
  <div class="step"><div class="step-n">1</div><div class="step-c"><div class="step-t">파일 저장</div><div class="step-d"><span class="mono">AFM_Journal_Search_KO.html</span>을 컴퓨터에 저장합니다.</div></div></div>
  <div class="step"><div class="step-n">2</div><div class="step-c"><div class="step-t">브라우저로 열기</div><div class="step-d">HTML 파일을 Chrome/Edge에 <strong>드래그 앤 드롭</strong>하거나, 우클릭 → 연결 프로그램 → Chrome을 선택합니다.</div></div></div>
  <div class="step"><div class="step-n">3</div><div class="step-c"><div class="step-t">즉시 사용 가능</div><div class="step-d">별도 설치나 로그인 없이 모든 기능을 바로 사용할 수 있습니다.</div></div></div>
  <div class="info warn"><div class="info-lbl">주의</div>반드시 <strong>Chrome 또는 Edge</strong>에서 열어야 모든 기능이 정상 동작합니다.</div>
  <h2>2.2 화면 구성</h2>
  <table><tr><th>영역</th><th>메뉴</th><th>용도</th></tr>
  <tr><td>워크플로우</td><td>키워드 설정 / 검색 필터 / 검색 링크</td><td>검색 준비</td></tr>
  <tr><td>저널 관리</td><td>자동 저널 등록 / 수동 저널 등록 / 저널 목록</td><td>저널 수집 및 관리</td></tr>
  <tr><td>완료</td><td>ZIP 내보내기 / 작성 프로세스</td><td>결과 출력</td></tr></table>
</div>

<div class="section break">
  <div class="ch-hdr"><div class="ch-tag">CHAPTER 03</div><div class="ch-title">워크플로우 — 단계별 가이드</div></div>
  <h2>STEP 1 &nbsp;|&nbsp; 키워드 설정</h2>
  <p>사이드바에서 <span class="hl">키워드 설정</span>을 클릭합니다. Preset 키워드 30개 중 클릭으로 선택하거나 직접 추가합니다.</p>
  <div class="info"><div class="info-lbl">기본 선택 키워드</div>atomic force microscopy · tapping mode AFM · tip-sample interaction · cantilever dynamics · Q factor cantilever</div>
  <div class="info tip"><div class="info-lbl">권장 사항</div>키워드는 영문으로 입력하세요. Park Systems AFM-modes 페이지를 참고하여 작성 중인 모드에 맞는 키워드를 추가하세요.</div>
  <hr class="sep"/>
  <h2>STEP 2 &nbsp;|&nbsp; 검색 필터 설정</h2>
  <p>필터 탭에서 출판 연도, IF, 인용 수, 결과 수를 설정합니다. <strong>Unpaywall API 이메일은 필수로 입력</strong>해야 자동 등록 기능이 활성화됩니다.</p>
  <hr class="sep"/>
  <h2>STEP 3 &nbsp;|&nbsp; 학술 DB 검색</h2>
  <table><tr><th>데이터베이스</th><th>특징</th><th>Sci-Hub</th></tr>
  <tr><td>Google Scholar</td><td>가장 광범위한 학술 검색</td><td>—</td></tr>
  <tr><td>ScienceDirect</td><td>Elsevier 저널 전문</td><td>제공</td></tr>
  <tr><td>Springer / Nature</td><td>고IF Nature 계열</td><td>제공</td></tr>
  <tr><td>ACS Publications</td><td>미국화학회 저널</td><td>제공</td></tr>
  <tr><td>Wiley Online Library</td><td>Wiley 계열 저널</td><td>제공</td></tr>
  <tr><td>PubMed</td><td>바이오/나노 분야</td><td>—</td></tr></table>
  <hr class="sep"/>
  <h2>STEP 4 &nbsp;|&nbsp; 자동 저널 등록</h2>
  <div class="step"><div class="step-n">1</div><div class="step-c"><div class="step-t">이메일 확인 후 '자동 검색 시작' 클릭</div><div class="step-d">CrossRef API → 상위 10개 검색 → Unpaywall API → PDF 접근 가능 여부 확인</div></div></div>
  <div class="step"><div class="step-n">2</div><div class="step-c"><div class="step-t">결과 카드 확인</div><div class="step-d">각 저널에 PDF 가능/불가 상태가 표시됩니다.</div></div></div>
  <div class="step"><div class="step-n">3</div><div class="step-c"><div class="step-t">등록 방법 선택</div><div class="step-d">PDF 가능 저널 일괄 등록 / 전체 등록 / 개별 등록 중 선택합니다.</div></div></div>
  <div class="info ok"><div class="info-lbl">자동 완성 항목</div>제목 · 저자 · 연도 · 저널명 · 인용 수 · DOI · PDF URL · OA 여부 · Physics/회로 감지 · 품질 점수</div>
  <hr class="sep"/>
  <h2>STEP 5 &nbsp;|&nbsp; 수동 저널 등록 (DOI)</h2>
  <p>DOI를 입력하면 CrossRef + Unpaywall에서 메타데이터와 PDF URL이 자동 완성됩니다. Introduction의 수식 수는 논문을 직접 열어 세어 입력합니다.</p>
  <hr class="sep"/>
  <h2>STEP 6 &nbsp;|&nbsp; 저널 목록 관리</h2>
  <div class="grid2">
    <div class="card"><div class="card-h">정렬</div><div class="card-b">점수순 · 인용순 · IF순 · 연도순</div></div>
    <div class="card"><div class="card-h">선택 관리</div><div class="card-b">체크박스로 ZIP 포함 여부 결정</div></div>
    <div class="card"><div class="card-h">PDF 열기</div><div class="card-b">PDF URL 있는 저널 즉시 열람</div></div>
    <div class="card"><div class="card-h">통계</div><div class="card-b">총 수 · 선택됨 · PDF 보유 · 평균 점수</div></div>
  </div>
  <hr class="sep"/>
  <h2>STEP 7 &nbsp;|&nbsp; ZIP 내보내기</h2>
  <div class="step"><div class="step-n">1</div><div class="step-c"><div class="step-t">AFM 모드명 입력</div><div class="step-d">예: Tapping_Mode, PFM, KPFM</div></div></div>
  <div class="step"><div class="step-n">2</div><div class="step-c"><div class="step-t">파일 선택 후 ZIP 다운로드</div><div class="step-d">PDF 포함 시 순서대로 다운로드 후 압축. 저널 수에 따라 수 분 소요 가능.</div></div></div>
</div>

<div class="section break">
  <div class="ch-hdr"><div class="ch-tag">CHAPTER 04</div><div class="ch-title">저널 품질 점수 시스템</div></div>
  <div class="score-row"><div class="score-lr"><span class="score-lbl">인용 수 (Citations)</span><span class="score-pts">40점</span></div><div class="score-track"><div class="score-fill" style="width:100%;background:#C47A0A;"></div></div><div class="score-note">최대: 500회 이상 — min(인용수/500, 1) × 40</div></div>
  <div class="score-row"><div class="score-lr"><span class="score-lbl">Impact Factor</span><span class="score-pts">30점</span></div><div class="score-track"><div class="score-fill" style="width:75%;background:#2D7A4A;"></div></div><div class="score-note">최대: IF 20 이상 — min(IF/20, 1) × 30</div></div>
  <div class="score-row"><div class="score-lr"><span class="score-lbl">Introduction 수식 수</span><span class="score-pts">20점</span></div><div class="score-track"><div class="score-fill" style="width:50%;background:#185FA5;"></div></div><div class="score-note">최대: 20개 이상 — min(수식수/20, 1) × 20</div></div>
  <div class="score-row"><div class="score-lr"><span class="score-lbl">Physics / 회로 포함</span><span class="score-pts">10점</span></div><div class="score-track"><div class="score-fill" style="width:25%;background:#7B4FA8;"></div></div><div class="score-note">각 5점 보너스 — 제목·초록 키워드 자동 감지</div></div>
  <table><tr><th>점수</th><th>등급</th><th>활용</th></tr>
  <tr><td>70~100점</td><td>우수</td><td>Introduction 핵심 참고 저널</td></tr>
  <tr><td>40~69점</td><td>양호</td><td>보조 참고 자료</td></tr>
  <tr><td>0~39점</td><td>검토 필요</td><td>추가 검증 후 사용 권장</td></tr></table>
</div>

<div class="section break">
  <div class="ch-hdr"><div class="ch-tag">CHAPTER 05</div><div class="ch-title">ZIP 출력 파일 상세</div></div>
  <table><tr><th>파일명</th><th>형식</th><th>내용</th></tr>
  <tr><td><strong>journals.json</strong><span class="fb fb-json">JSON</span></td><td>JSON</td><td>저널 전체 메타데이터 (IF · 인용 · 점수 · PDF URL)</td></tr>
  <tr><td><strong>report.html</strong><span class="fb fb-html">HTML</span></td><td>HTML</td><td>브라우저 열람 가능 품질 비교 보고서</td></tr>
  <tr><td><strong>keywords.txt</strong><span class="fb fb-txt">TXT</span></td><td>TXT</td><td>키워드 목록 및 검색 쿼리</td></tr>
  <tr><td><strong>search_links.txt</strong><span class="fb fb-txt">TXT</span></td><td>TXT</td><td>6개 DB 검색 URL 목록</td></tr>
  <tr><td><strong>intro_template.md</strong><span class="fb fb-md">MD</span></td><td>Markdown</td><td>Chapter 1 Introduction 초안 (핵심 수식 포함)</td></tr>
  <tr><td><strong>review_checklist.md</strong><span class="fb fb-md">MD</span></td><td>Markdown</td><td>AFM 전문가 피드백 체크리스트</td></tr>
  <tr><td><strong>pdf/ 폴더</strong><span class="fb fb-pdf">PDF</span></td><td>PDF</td><td>오픈 액세스 PDF 자동 다운로드</td></tr></table>
</div>

<div class="section break">
  <div class="ch-hdr"><div class="ch-tag">CHAPTER 06</div><div class="ch-title">자동 저널 등록 API 안내</div></div>
  <div class="grid2">
    <div class="card"><div class="card-h">CrossRef API</div><div class="card-b"><strong>용도:</strong> 키워드 검색, DOI 메타데이터<br><strong>비용:</strong> 완전 무료<br><strong>API 키:</strong> 불필요</div></div>
    <div class="card"><div class="card-h">Unpaywall API</div><div class="card-b"><strong>용도:</strong> 오픈 액세스 PDF URL 확인<br><strong>비용:</strong> 완전 무료<br><strong>필요:</strong> 이메일 주소만</div></div>
  </div>
  <div class="info"><div class="info-lbl">이메일 개인정보</div>입력 이메일은 Unpaywall API 서버로만 전송되며 도구 내 저장되지 않습니다.</div>
</div>

<div class="section break">
  <div class="ch-hdr"><div class="ch-tag">CHAPTER 07</div><div class="ch-title">자주 묻는 질문 (FAQ)</div></div>
  <h3>Q1. 인터넷 없이 사용 가능한가요?</h3>
  <p>키워드 설정, 수동 등록, 목록 관리, ZIP 생성(PDF 제외)은 오프라인 가능. 자동 검색·DOI 자동 완성·PDF 다운로드는 인터넷 필요.</p>
  <h3>Q2. 자동 검색에서 결과가 없어요.</h3>
  <p>① 이메일 입력 확인 ② 키워드 선택(파란색) 확인 ③ 인터넷 연결 확인 ④ 더 일반적인 키워드로 변경</p>
  <h3>Q3. PDF 다운로드가 안 돼요.</h3>
  <p>해당 저널이 유료(구독 필요)입니다. Sci-Hub 버튼으로 접근하거나 기관 계정을 이용하세요.</p>
  <h3>Q4. ZIP 생성이 너무 느려요.</h3>
  <p>PDF 폴더를 체크 해제하면 훨씬 빠르게 생성됩니다.</p>
  <h3>Q5. 브라우저를 닫으면 데이터가 사라지나요?</h3>
  <p>네. 현재 버전은 세션 메모리에만 저장됩니다. 작업 후 반드시 ZIP으로 내보내세요.</p>
</div>

<div class="section break">
  <div class="ch-hdr"><div class="ch-tag">CHAPTER 08</div><div class="ch-title">다음 버전 개선 계획</div></div>
  <div class="rev">
    <div class="rev-tag">REVISION 1</div>
    <div class="rev-title">저널 Grading 세부 규정 고도화</div>
    <ul class="rev-list">
      <li>수식 유형별 가중치 세분화 (기본 수식 vs. 핵심 물리 수식)</li>
      <li>저널 분야 적합성 지수 추가 (AFM 관련도 자동 판별)</li>
      <li>인용 맥락 분석 — 단순 인용 vs. 핵심 참고로 분류</li>
      <li>Impact Factor 구간별 차등 점수 체계 도입</li>
      <li>최신성 지수 추가 (최근 5년 인용 비율 반영)</li>
    </ul>
  </div>
  <div class="rev">
    <div class="rev-tag">REVISION 2</div>
    <div class="rev-title">등록 저널 기반 Introduction 자동 작성 지원</div>
    <ul class="rev-list">
      <li>등록된 저널에서 핵심 문장 자동 Summary 추출</li>
      <li>기존 Introduction 구성 구조에 맞춘 섹션별 내용 배치</li>
      <li>수식·레퍼런스 자동 매핑 및 초안 생성</li>
      <li>사용자 검토 → 피드백 반영 → 재생성 워크플로우</li>
      <li>최종 초안을 Markdown / Word 형식으로 내보내기</li>
    </ul>
  </div>
  <div class="info"><div class="info-lbl">문의 및 피드백</div>도구 사용 중 문제나 개선 제안은 Park Systems 담당자에게 연락하세요. 사용자 피드백이 다음 버전에 직접 반영됩니다.</div>
</div>

</body></html>`;
}

// ── 영어 가이드 HTML ──────────────────────────────────────────────────
function buildEN() {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/>
<title>AFM Journal Search Tool v2 — English User Guide</title>
<style>${CSS}</style></head><body>

<div class="cover">
  <div class="cover-tag">USER GUIDE &nbsp;·&nbsp; ENGLISH EDITION</div>
  <div class="cover-title">AFM Journal<br><span>Search Tool</span> v2</div>
  <div class="cover-sub">Integrated tool for AFM Manual Introduction writing:<br>journal search · quality scoring · PDF collection · ZIP export</div>
  <div class="cover-line"></div>
  <div class="chips">
    <div class="chip">Version v2.0 — Final Release</div>
    <div class="chip">Park Systems</div>
    <div class="chip">2025</div>
    <div class="chip">English User Guide</div>
  </div>
  <div class="cover-foot">AFM Manual Introduction Builder · Park Systems · 2025</div>
</div>

<div class="toc-page">
  <div class="toc-title">Table of Contents</div>
  <div class="toc-item"><span class="toc-num">1.</span><span class="toc-label">Tool Overview</span><span class="toc-pg">3</span></div>
  <div class="toc-item"><span class="toc-num"></span><span class="toc-label sub">1.1 What is AFM Journal Search Tool? / 1.2 Key Features / 1.3 System Requirements</span></div>
  <div class="toc-item"><span class="toc-num">2.</span><span class="toc-label">Getting Started</span><span class="toc-pg">4</span></div>
  <div class="toc-item"><span class="toc-num">3.</span><span class="toc-label">Workflow — Step-by-Step Guide (STEP 1–7)</span><span class="toc-pg">5</span></div>
  <div class="toc-item"><span class="toc-num">4.</span><span class="toc-label">Journal Quality Score System</span><span class="toc-pg">8</span></div>
  <div class="toc-item"><span class="toc-num">5.</span><span class="toc-label">ZIP Output Files Detail</span><span class="toc-pg">9</span></div>
  <div class="toc-item"><span class="toc-num">6.</span><span class="toc-label">API Reference for Auto Registration</span><span class="toc-pg">10</span></div>
  <div class="toc-item"><span class="toc-num">7.</span><span class="toc-label">Frequently Asked Questions (FAQ)</span><span class="toc-pg">11</span></div>
  <div class="toc-item"><span class="toc-num">8.</span><span class="toc-label">Next Version Roadmap</span><span class="toc-pg">12</span></div>
</div>

<div class="section break">
  <div class="ch-hdr"><div class="ch-tag">CHAPTER 01</div><div class="ch-title">Tool Overview</div></div>
  <h2>1.1 What is AFM Journal Search Tool?</h2>
  <p>An integrated research tool designed to systematize <span class="hl">Chapter 1 Introduction writing</span> for AFM measurement mode manuals. It consolidates journal searching, evaluation, and organization into a <span class="hl">single HTML file</span>.</p>
  <div class="info tip"><div class="info-lbl">Problems this tool solves</div>Inconsistent search criteria, no unified IF·citations·equation evaluation, and repeated keyword-search-notes-draft cycles — all solved in one place.</div>
  <h2>1.2 Key Features</h2>
  <div class="grid2">
    <div class="card"><div class="card-h">Single HTML File</div><div class="card-b">No install. Opens instantly in Chrome/Edge. Most features work offline.</div></div>
    <div class="card"><div class="card-h">API Auto-Search</div><div class="card-b">CrossRef + Unpaywall APIs for automatic keyword-based search and real-time PDF availability check.</div></div>
    <div class="card"><div class="card-h">Auto Quality Scoring</div><div class="card-b">0–100 score calculated from IF, citations, equation count, and physics/circuit content.</div></div>
    <div class="card"><div class="card-h">Batch ZIP Export</div><div class="card-b">Metadata, report, draft template, checklist, and PDFs — all in one ZIP.</div></div>
  </div>
  <h2>1.3 System Requirements</h2>
  <table><tr><th>Item</th><th>Minimum</th><th>Recommended</th></tr>
  <tr><td>Browser</td><td>Chrome 90+ / Edge 90+</td><td>Latest Chrome</td></tr>
  <tr><td>Internet</td><td>Required for auto-search</td><td>For auto-search &amp; PDF download</td></tr>
  <tr><td>Email</td><td>Required for Unpaywall API</td><td>Your active email</td></tr>
  <tr><td>OS</td><td>Windows / macOS / Linux</td><td>—</td></tr></table>
</div>

<div class="section break">
  <div class="ch-hdr"><div class="ch-tag">CHAPTER 02</div><div class="ch-title">Getting Started</div></div>
  <h2>2.1 How to Open the Tool</h2>
  <div class="step"><div class="step-n">1</div><div class="step-c"><div class="step-t">Save the File</div><div class="step-d">Save <span class="mono">AFM_Journal_Search_EN.html</span> to your computer.</div></div></div>
  <div class="step"><div class="step-n">2</div><div class="step-c"><div class="step-t">Open in Browser</div><div class="step-d"><strong>Drag and drop</strong> the HTML file into Chrome or Edge, or right-click → Open with → Chrome.</div></div></div>
  <div class="step"><div class="step-n">3</div><div class="step-c"><div class="step-t">Ready to Use</div><div class="step-d">All features available immediately — no login or installation required.</div></div></div>
  <div class="info warn"><div class="info-lbl">Important</div>Always open in <strong>Chrome or Edge</strong> for full feature support.</div>
  <h2>2.2 Interface Layout</h2>
  <table><tr><th>Section</th><th>Menu Items</th><th>Purpose</th></tr>
  <tr><td>Workflow</td><td>Keywords / Search Filters / Search Links</td><td>Search preparation</td></tr>
  <tr><td>Journal Management</td><td>Auto Registration / Manual Registration / Journal List</td><td>Journal collection</td></tr>
  <tr><td>Finish</td><td>ZIP Export / Write Process</td><td>Output &amp; reference</td></tr></table>
</div>

<div class="section break">
  <div class="ch-hdr"><div class="ch-tag">CHAPTER 03</div><div class="ch-title">Workflow — Step-by-Step Guide</div></div>
  <h2>STEP 1 &nbsp;|&nbsp; Keyword Setup</h2>
  <p>Click <span class="hl">Keywords</span> in the sidebar. Select from 30 preset keywords or add custom ones.</p>
  <div class="info"><div class="info-lbl">Default active keywords</div>atomic force microscopy · tapping mode AFM · tip-sample interaction · cantilever dynamics · Q factor cantilever</div>
  <hr class="sep"/>
  <h2>STEP 2 &nbsp;|&nbsp; Search Filter Configuration</h2>
  <p>Set publication year, IF, citation count, and result count. <strong>Unpaywall API email is required</strong> to enable auto registration.</p>
  <hr class="sep"/>
  <h2>STEP 3 &nbsp;|&nbsp; Academic Database Search</h2>
  <table><tr><th>Database</th><th>Specialization</th><th>Sci-Hub</th></tr>
  <tr><td>Google Scholar</td><td>Broadest search</td><td>—</td></tr>
  <tr><td>ScienceDirect</td><td>Elsevier journals</td><td>Yes</td></tr>
  <tr><td>Springer / Nature</td><td>High-IF Nature family</td><td>Yes</td></tr>
  <tr><td>ACS Publications</td><td>American Chemical Society</td><td>Yes</td></tr>
  <tr><td>Wiley Online Library</td><td>Wiley journals</td><td>Yes</td></tr>
  <tr><td>PubMed</td><td>Bio/nano field</td><td>—</td></tr></table>
  <hr class="sep"/>
  <h2>STEP 4 &nbsp;|&nbsp; Auto Journal Registration</h2>
  <div class="step"><div class="step-n">1</div><div class="step-c"><div class="step-t">Click 'Start Auto Search'</div><div class="step-d">CrossRef API searches top 10 → Unpaywall API verifies PDF availability for each</div></div></div>
  <div class="step"><div class="step-n">2</div><div class="step-c"><div class="step-t">Review Result Cards</div><div class="step-d">Each card shows PDF Available or No PDF (Paywalled)</div></div></div>
  <div class="step"><div class="step-n">3</div><div class="step-c"><div class="step-t">Choose Registration Method</div><div class="step-d">Register All with PDF / Register All / Individual registration</div></div></div>
  <div class="info ok"><div class="info-lbl">Auto-filled fields</div>Title · Author · Year · Journal · Citations · DOI · PDF URL · OA status · Physics/Circuit detection · Quality Score</div>
  <hr class="sep"/>
  <h2>STEP 5 &nbsp;|&nbsp; Manual Registration via DOI</h2>
  <p>Enter a DOI to auto-fill metadata and PDF URL from CrossRef and Unpaywall. Equation count must be manually counted from the paper's Introduction.</p>
  <hr class="sep"/>
  <h2>STEP 6 &nbsp;|&nbsp; Journal List Management</h2>
  <div class="grid2">
    <div class="card"><div class="card-h">Sort Options</div><div class="card-b">Score · Citations · IF · Year</div></div>
    <div class="card"><div class="card-h">Selection Control</div><div class="card-b">Checkbox determines ZIP inclusion</div></div>
    <div class="card"><div class="card-h">PDF Quick Access</div><div class="card-b">Open PDF directly from card button</div></div>
    <div class="card"><div class="card-h">Statistics</div><div class="card-b">Total · Selected · Has PDF · Avg Score</div></div>
  </div>
  <hr class="sep"/>
  <h2>STEP 7 &nbsp;|&nbsp; ZIP Export</h2>
  <div class="step"><div class="step-n">1</div><div class="step-c"><div class="step-t">Enter AFM Mode Name</div><div class="step-d">e.g. Tapping_Mode, PFM, KPFM</div></div></div>
  <div class="step"><div class="step-n">2</div><div class="step-c"><div class="step-t">Select Files and Download</div><div class="step-d">If PDFs included, each downloads sequentially before compression. May take several minutes.</div></div></div>
</div>

<div class="section break">
  <div class="ch-hdr"><div class="ch-tag">CHAPTER 04</div><div class="ch-title">Journal Quality Score System</div></div>
  <div class="score-row"><div class="score-lr"><span class="score-lbl">Citations</span><span class="score-pts">40 pts</span></div><div class="score-track"><div class="score-fill" style="width:100%;background:#C47A0A;"></div></div><div class="score-note">Max: 500+ citations — min(citations/500, 1) × 40</div></div>
  <div class="score-row"><div class="score-lr"><span class="score-lbl">Impact Factor</span><span class="score-pts">30 pts</span></div><div class="score-track"><div class="score-fill" style="width:75%;background:#2D7A4A;"></div></div><div class="score-note">Max: IF 20+ — min(IF/20, 1) × 30</div></div>
  <div class="score-row"><div class="score-lr"><span class="score-lbl">Equations in Introduction</span><span class="score-pts">20 pts</span></div><div class="score-track"><div class="score-fill" style="width:50%;background:#185FA5;"></div></div><div class="score-note">Max: 20+ equations — min(eq/20, 1) × 20</div></div>
  <div class="score-row"><div class="score-lr"><span class="score-lbl">Physics / Circuit included</span><span class="score-pts">10 pts</span></div><div class="score-track"><div class="score-fill" style="width:25%;background:#7B4FA8;"></div></div><div class="score-note">+5 each — auto-detected from title &amp; abstract keywords</div></div>
  <table><tr><th>Score</th><th>Grade</th><th>Use</th></tr>
  <tr><td>70–100</td><td>Excellent</td><td>Primary reference for Introduction</td></tr>
  <tr><td>40–69</td><td>Good</td><td>Supplementary reference</td></tr>
  <tr><td>0–39</td><td>Review Needed</td><td>Verify before use</td></tr></table>
</div>

<div class="section break">
  <div class="ch-hdr"><div class="ch-tag">CHAPTER 05</div><div class="ch-title">ZIP Output Files Detail</div></div>
  <table><tr><th>Filename</th><th>Format</th><th>Contents</th></tr>
  <tr><td><strong>journals.json</strong><span class="fb fb-json">JSON</span></td><td>JSON</td><td>Full journal metadata (IF · citations · score · PDF URL)</td></tr>
  <tr><td><strong>report.html</strong><span class="fb fb-html">HTML</span></td><td>HTML</td><td>Browser-viewable quality comparison report</td></tr>
  <tr><td><strong>keywords.txt</strong><span class="fb fb-txt">TXT</span></td><td>TXT</td><td>Keyword list and search query string</td></tr>
  <tr><td><strong>search_links.txt</strong><span class="fb fb-txt">TXT</span></td><td>TXT</td><td>Auto-generated search URLs for 6 databases</td></tr>
  <tr><td><strong>intro_template.md</strong><span class="fb fb-md">MD</span></td><td>Markdown</td><td>Chapter 1 Introduction draft (with key equations)</td></tr>
  <tr><td><strong>review_checklist.md</strong><span class="fb fb-md">MD</span></td><td>Markdown</td><td>AFM expert review checklist</td></tr>
  <tr><td><strong>pdf/ folder</strong><span class="fb fb-pdf">PDF</span></td><td>PDF</td><td>Auto-downloaded open-access PDFs</td></tr></table>
</div>

<div class="section break">
  <div class="ch-hdr"><div class="ch-tag">CHAPTER 06</div><div class="ch-title">API Reference for Auto Registration</div></div>
  <div class="grid2">
    <div class="card"><div class="card-h">CrossRef API</div><div class="card-b"><strong>Purpose:</strong> Keyword search, DOI metadata<br><strong>Cost:</strong> Free<br><strong>API Key:</strong> Not required</div></div>
    <div class="card"><div class="card-h">Unpaywall API</div><div class="card-b"><strong>Purpose:</strong> Open-access PDF URL check<br><strong>Cost:</strong> Free<br><strong>Required:</strong> Email address only</div></div>
  </div>
  <div class="info"><div class="info-lbl">Email Privacy</div>Your email is sent only to the Unpaywall API server and not stored in the tool. Unpaywall does not use it for marketing.</div>
</div>

<div class="section break">
  <div class="ch-hdr"><div class="ch-tag">CHAPTER 07</div><div class="ch-title">Frequently Asked Questions</div></div>
  <h3>Q1. Can I use it without internet?</h3>
  <p>Keyword setup, manual registration, list management, and ZIP (without PDFs) work offline. Auto-search, DOI fetch, and PDF download require internet.</p>
  <h3>Q2. Auto search returns no results.</h3>
  <p>Check: email entered, keywords selected (blue), internet connected, try broader keywords.</p>
  <h3>Q3. Some journals show No PDF.</h3>
  <p>Journal is paywalled. Use Sci-Hub button with DOI or access through institutional account.</p>
  <h3>Q4. ZIP is very slow.</h3>
  <p>Uncheck "pdf/ folder" for much faster ZIP generation without PDFs.</p>
  <h3>Q5. Data disappears when browser closes.</h3>
  <p>Yes — current version uses session memory. Always export to ZIP before closing.</p>
</div>

<div class="section break">
  <div class="ch-hdr"><div class="ch-tag">CHAPTER 08</div><div class="ch-title">Next Version Roadmap</div></div>
  <div class="rev">
    <div class="rev-tag">REVISION 1</div>
    <div class="rev-title">Advanced Journal Grading Rules</div>
    <ul class="rev-list">
      <li>Differentiate equation weight by type (basic vs. core physics equations)</li>
      <li>Add field relevance index (auto-detect AFM topic alignment)</li>
      <li>Citation context analysis — core vs. incidental citations</li>
      <li>Tiered Impact Factor scoring with finer grade intervals</li>
      <li>Recency index — incorporate recent 5-year citation ratio</li>
    </ul>
  </div>
  <div class="rev">
    <div class="rev-tag">REVISION 2</div>
    <div class="rev-title">AI-Assisted Introduction Drafting from Registered Journals</div>
    <ul class="rev-list">
      <li>Auto-extract key sentences and summaries from registered journals</li>
      <li>Map content to the existing Introduction section structure</li>
      <li>Auto-map equations and references, generate draft</li>
      <li>User review → feedback → regeneration workflow</li>
      <li>Export final draft as Markdown or Word document</li>
    </ul>
  </div>
  <div class="info"><div class="info-lbl">Contact &amp; Feedback</div>Contact your Park Systems representative with issues or suggestions. User feedback is directly incorporated into the next version.</div>
</div>

</body></html>`;
}

// ── Write files ──────────────────────────────────────────────────────
const koPath = path.join(OUT, 'AFM_UserGuide_KO.html');
const enPath = path.join(OUT, 'AFM_UserGuide_EN.html');
fs.writeFileSync(koPath, buildKO(), 'utf-8');
fs.writeFileSync(enPath, buildEN(), 'utf-8');

console.log(`✅ 가이드 생성 완료`);
console.log(`   output/pdf/AFM_UserGuide_KO.html`);
console.log(`   output/pdf/AFM_UserGuide_EN.html`);
console.log('');
console.log('📄 PDF로 저장하려면:');
console.log('   브라우저에서 해당 HTML을 열고 Ctrl+P → 대상: PDF로 저장');

// wkhtmltopdf 자동 변환 시도 (설치된 경우)
try {
  execSync('where wkhtmltopdf 2>nul || which wkhtmltopdf 2>/dev/null', { stdio: 'pipe' });
  ['KO', 'EN'].forEach(lang => {
    const htmlFile = path.join(OUT, `AFM_UserGuide_${lang}.html`);
    const pdfFile  = path.join(OUT, `AFM_UserGuide_${lang}.pdf`);
    try {
      execSync(`wkhtmltopdf --page-size A4 --encoding UTF-8 --enable-local-file-access "${htmlFile}" "${pdfFile}"`, { stdio: 'pipe' });
      console.log(`✅ PDF 자동 변환: output/pdf/AFM_UserGuide_${lang}.pdf`);
    } catch (_) { /* wkhtmltopdf 변환 실패 시 무시 */ }
  });
} catch (_) { /* wkhtmltopdf 없음 — 무시 */ }
