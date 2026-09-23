
// Ensure output directory exists
const _path = require("path");
const _fs = require("fs");
const _outDir = _path.join(__dirname, "../output/pptx");
if (!_fs.existsSync(_outDir)) _fs.mkdirSync(_outDir, { recursive: true });

const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const {
  FaMicroscope, FaSearch, FaTags, FaFilter, FaBookOpen,
  FaDownload, FaCheckCircle, FaCogs, FaUsers, FaRocket,
  FaFileAlt, FaStar, FaWrench, FaBrain, FaLayerGroup,
  FaChartBar, FaDatabase, FaFilePdf, FaClipboardList,
  FaArrowRight, FaGlobe, FaRobot, FaListOl
} = require("react-icons/fa");

/* ── PALETTE ─────────────────────────────────────── */
const C = {
  navy:    "0B1D3A",
  blue:    "185FA5",
  sky:     "5BA3E0",
  ice:     "D6E8F7",
  white:   "FFFFFF",
  off:     "F4F7FB",
  g1:      "8A93A8",
  g2:      "D0D7E4",
  g3:      "EEF1F7",
  teal:    "00C2A8",
  amber:   "E8A030",
  green:   "3DAA6E",
  purple:  "7B4FA8",
  red:     "C0392B",
  text:    "1A2540",
  text2:   "4A5568",
};

/* ── ICON HELPER ─────────────────────────────────── */
async function ico(Comp, color = C.white, size = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(
    React.createElement(Comp, { color: `#${color}`, size: String(size) })
  );
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}
const mkSh = () => ({ type:"outer", color:"000000", blur:12, offset:3, angle:135, opacity:0.10 });

/* ── COMMON HELPERS ──────────────────────────────── */
function footer(sl, lang) {
  sl.addShape("rect", { x:0, y:5.45, w:10, h:0.175, fill:{ color:C.navy } });
  sl.addText(
    lang==="ko"
      ? "AFM Journal Search Tool v2  ·  Park Systems  ·  2025"
      : "AFM Journal Search Tool v2  ·  Park Systems  ·  2025",
    { x:0.4, y:5.46, w:9.2, h:0.15, fontSize:8, color:C.g2, valign:"middle", margin:0 }
  );
}
function pageNum(sl, n, total) {
  sl.addText(`${n} / ${total}`, {
    x:9.3, y:5.27, w:0.6, h:0.18, fontSize:9, color:C.g1, align:"right", margin:0
  });
}
function hdrBar(sl, tag, title) {
  sl.addShape("rect", { x:0, y:0, w:10, h:1.15, fill:{ color:C.navy } });
  sl.addText(tag,  { x:0.5, y:0.07, w:7, h:0.38, fontSize:9.5, color:C.teal, bold:true, charSpacing:2, margin:0 });
  sl.addText(title,{ x:0.5, y:0.47, w:9, h:0.56, fontSize:24,  bold:true, color:C.white, margin:0 });
}

/* ══════════════════════════════════════════════════
   BUILD ONE DECK
══════════════════════════════════════════════════ */
async function buildDeck(lang) {
  const ko = lang === "ko";
  const pres = new pptxgen();
  pres.layout  = "LAYOUT_16x9";
  pres.author  = "Park Systems";
  pres.title   = ko
    ? "AFM Journal Search Tool v2 — 소개 자료"
    : "AFM Journal Search Tool v2 — Introduction";
  const T = 11; // total slides

  /* ──────────────────────────────────────────────
     SLIDE 1  TITLE
  ────────────────────────────────────────────── */
  {
    const sl = pres.addSlide();
    sl.background = { color: C.navy };
    sl.addShape("ellipse", { x:6.0,  y:-1.3, w:7,   h:7,   fill:{ color:C.blue,  transparency:82 }, line:{ color:C.blue,  transparency:82, width:0 } });
    sl.addShape("ellipse", { x:7.8,  y:3.0,  w:3.5, h:3.5, fill:{ color:C.teal,  transparency:87 }, line:{ color:C.teal,  transparency:87, width:0 } });
    sl.addShape("rect",    { x:0.55, y:1.1,  w:0.07, h:3.3, fill:{ color:C.teal } });

    sl.addText(ko ? "RESEARCH TOOL  ·  v2.0  ·  최종 버전" : "RESEARCH TOOL  ·  v2.0  ·  FINAL RELEASE",
      { x:0.75, y:1.13, w:7, h:0.3, fontSize:9.5, color:C.teal, bold:true, charSpacing:3, margin:0 });
    sl.addText(ko ? "AFM 저널\n검색 도구" : "AFM Journal\nSearch Tool",
      { x:0.75, y:1.48, w:7.5, h:1.95, fontSize:46, bold:true, color:C.white, valign:"top", margin:0 });
    sl.addText(
      ko  ? "매뉴얼 Introduction 작성을 위한\n저널 검색 · 품질 평가 · PDF 수집 · ZIP 내보내기 통합 도구"
          : "Integrated tool for Manual Introduction writing:\njournal search · quality scoring · PDF collection · ZIP export",
      { x:0.75, y:3.5, w:7.2, h:0.95, fontSize:14, color:C.ice, valign:"top", margin:0, lineSpacingMultiple:1.45 });
    const iMicro = await ico(FaMicroscope, C.teal, 512);
    sl.addImage({ data:iMicro, x:8.0, y:1.15, w:1.5, h:1.5 });
    sl.addShape("rect", { x:0, y:5.1, w:10, h:0.525, fill:{ color:"091628" } });
    sl.addText("Park Systems  ·  AFM Manual Introduction Builder  ·  2025",
      { x:0.5, y:5.15, w:9, h:0.4, fontSize:9.5, color:C.g2, margin:0 });
  }

  /* ──────────────────────────────────────────────
     SLIDE 2  OVERVIEW / AGENDA
  ────────────────────────────────────────────── */
  {
    const sl = pres.addSlide();
    sl.background = { color: C.off };
    sl.addShape("rect", { x:0, y:0, w:3.4, h:5.625, fill:{ color:C.navy } });
    sl.addText(ko ? "목차" : "Agenda",
      { x:0.35, y:0.5, w:2.7, h:0.48, fontSize:22, bold:true, color:C.white, margin:0 });
    sl.addText(ko ? "이 발표 자료의 구성" : "Presentation structure",
      { x:0.35, y:1.05, w:2.7, h:0.45, fontSize:11, color:C.ice, margin:0, lineSpacingMultiple:1.4 });
    sl.addShape("rect", { x:0.35, y:1.58, w:1.6, h:0.05, fill:{ color:C.teal } });

    const navItems = ko
      ? ["배경 & 문제 인식","표준 작성 프로세스","도구 소개 (v2)","주요 기능 (7가지)","자동 저널 등록","품질 점수 시스템","사용 방법","ZIP 출력물","다음 개선 계획"]
      : ["Background & Problem","Standard Writing Process","Tool Overview (v2)","Key Features (7)","Auto Registration","Quality Score System","How to Use","ZIP Output","Next Revision Plan"];
    navItems.forEach((t,i) => {
      sl.addShape("ellipse", { x:0.35, y:2.06+i*0.37, w:0.18, h:0.18, fill:{ color:C.teal } });
      sl.addText(`${i+1}.  ${t}`, { x:0.62, y:2.01+i*0.37, w:2.55, h:0.3, fontSize:11, color:C.white, margin:0 });
    });

    const boxes = [
      { n:"7",  lbl: ko?"핵심 기능":"Key Features",  sub: ko?"키워드~ZIP 전체 워크플로우":"Full workflow from keywords to ZIP" },
      { n:"6",  lbl: ko?"학술 DB":"Academic DBs",    sub: ko?"CrossRef·Scholar·ScienceDirect 외":"CrossRef·Scholar·ScienceDirect +" },
      { n:"6",  lbl: ko?"ZIP 출력 파일":"ZIP Output Files", sub:"JSON·HTML·MD·TXT·PDF" },
      { n:"v2", lbl: ko?"최신 버전":"Latest Version", sub: ko?"자동 등록 + PDF 수집 추가":"Auto register + PDF collection" },
    ];
    boxes.forEach((b,i) => {
      const x = 3.6 + (i%2)*3.1, y = 0.4 + Math.floor(i/2)*2.55;
      sl.addShape("rect", { x, y, w:2.88, h:2.28, fill:{ color:C.white }, shadow:mkSh() });
      sl.addShape("rect", { x, y, w:0.07, h:2.28, fill:{ color:C.teal } });
      sl.addText(b.n,   { x:x+0.22, y:y+0.2,  w:2.4, h:0.85, fontSize:50, bold:true, color:C.navy, margin:0 });
      sl.addText(b.lbl, { x:x+0.22, y:y+1.08, w:2.5, h:0.38, fontSize:13, bold:true, color:C.text,  margin:0 });
      sl.addText(b.sub, { x:x+0.22, y:y+1.5,  w:2.5, h:0.58, fontSize:10, color:C.g1,  margin:0, lineSpacingMultiple:1.3 });
    });
    footer(sl, lang); pageNum(sl, 2, T);
  }

  /* ──────────────────────────────────────────────
     SLIDE 3  BACKGROUND
  ────────────────────────────────────────────── */
  {
    const sl = pres.addSlide();
    sl.background = { color: C.white };
    hdrBar(sl, ko?"Background":"Background", ko?"배경 & 문제 인식":"Background & Problem Recognition");
    const pains = [
      { icon:FaSearch,   title:ko?"저널 검색의 비효율":"Inefficient Journal Search",
        body:ko?"연구자마다 다른 DB를 사용하고\n검색 기준이 달라 시간이\n크게 소모됨":"Researchers use different DBs\nwith no unified search\nstandard — time-consuming" },
      { icon:FaFilter,   title:ko?"품질 판단 기준 부재":"No Quality Benchmark",
        body:ko?"IF · 인용 수 · 수식 수를\n동시에 고려할 통합\n평가 도구 없음":"No integrated tool to\nsimultaneously evaluate IF,\ncitations, and equation count" },
      { icon:FaFileAlt,  title:ko?"반복적인 수작업":"Repetitive Manual Work",
        body:ko?"키워드 정리 → 링크 복사 →\n저널 메모 → 초안 작성이\n매번 반복됨":"Keyword collection → URL copy\n→ journal notes → draft writing\nrepeated every time" },
    ];
    for (let i=0; i<pains.length; i++) {
      const x = 0.4 + i*3.1;
      sl.addShape("rect", { x, y:1.35, w:2.88, h:3.65, fill:{ color:C.g3 }, shadow:mkSh() });
      const ic = await ico(pains[i].icon, C.blue, 256);
      sl.addImage({ data:ic, x:x+1.17, y:1.56, w:0.54, h:0.54 });
      sl.addShape("rect", { x:x+0.8, y:2.22, w:1.28, h:0.05, fill:{ color:C.teal } });
      sl.addText(pains[i].title, { x:x+0.15, y:2.32, w:2.58, h:0.48, fontSize:13, bold:true, color:C.navy, align:"center", margin:0 });
      sl.addText(pains[i].body,  { x:x+0.15, y:2.88, w:2.58, h:1.75, fontSize:11, color:C.text2, align:"center", margin:0, lineSpacingMultiple:1.5 });
    }
    sl.addShape("rect", { x:0.4, y:5.08, w:9.2, h:0.35, fill:{ color:C.ice } });
    sl.addText(
      ko ? "→  이 모든 과정을 단 하나의 HTML 파일로 통합한 도구가 AFM Journal Search Tool v2 입니다"
         : "→  AFM Journal Search Tool v2 integrates all these steps into a single HTML file",
      { x:0.6, y:5.1, w:8.8, h:0.3, fontSize:11, color:C.navy, bold:true, margin:0 }
    );
    footer(sl, lang); pageNum(sl, 3, T);
  }

  /* ──────────────────────────────────────────────
     SLIDE 4  5-STEP PROCESS
  ────────────────────────────────────────────── */
  {
    const sl = pres.addSlide();
    sl.background = { color: C.off };
    hdrBar(sl,
      ko?"Standard Process":"Standard Process",
      ko?"AFM 매뉴얼 Introduction 표준 작성 프로세스":"AFM Manual Introduction Standard Writing Process");

    const steps = ko
      ? [
          { num:"1", title:"키워드 추합",     desc:"이전 매뉴얼 +\nPark Systems 학습\n페이지 기반 키워드",    color:C.blue },
          { num:"2", title:"저널 검색",        desc:"CrossRef API\nGoogle Scholar\nScienceDirect 등",         color:"1A7A6E" },
          { num:"3", title:"저널 선별",        desc:"IF · 인용 수 · 수식 수\n기준 품질 점수 산정\n(0~100점)", color:C.amber },
          { num:"4", title:"Introduction\n초안", desc:"물리 수식 중심\n사용자 관점\n구성",                     color:C.purple },
          { num:"5", title:"전문가 검토\n& 배포", desc:"물리적 타당성\n실제 시스템 일치\n피드백 반영",         color:C.red },
        ]
      : [
          { num:"1", title:"Keyword\nCollection", desc:"Previous manuals +\nPark Systems\nlearning page",     color:C.blue },
          { num:"2", title:"Journal\nSearch",      desc:"CrossRef API\nGoogle Scholar\nScienceDirect etc.",   color:"1A7A6E" },
          { num:"3", title:"Journal\nSelection",   desc:"Quality score by\nIF · citations · eqs\n(0–100 pts)", color:C.amber },
          { num:"4", title:"Draft\nIntroduction",  desc:"Physics equation\nfocused\nuser perspective",        color:C.purple },
          { num:"5", title:"Expert Review\n& Release", desc:"Physical validity\nsystem accuracy\nfeedback",   color:C.red },
        ];

    sl.addShape("rect", { x:0.95, y:2.82, w:8.1, h:0.06, fill:{ color:C.g2 } });
    steps.forEach((s,i) => {
      const x = 0.38 + i*1.84;
      sl.addShape("ellipse", { x:x+0.36, y:2.47, w:0.7, h:0.7, fill:{ color:s.color } });
      sl.addText(s.num, { x:x+0.36, y:2.47, w:0.7, h:0.7, fontSize:17, bold:true, color:C.white, align:"center", valign:"middle", margin:0 });
      sl.addShape("rect", { x:x+0.12, y:3.25, w:1.58, h:2.0, fill:{ color:C.white }, shadow:mkSh() });
      sl.addShape("rect", { x:x+0.12, y:3.25, w:1.58, h:0.05, fill:{ color:s.color } });
      sl.addText(s.title,{ x:x+0.17, y:3.33, w:1.48, h:0.48, fontSize:11,  bold:true, color:C.navy, align:"center", margin:0 });
      sl.addText(s.desc, { x:x+0.17, y:3.87, w:1.48, h:1.25, fontSize:9.5, color:C.text2, align:"center", margin:0, lineSpacingMultiple:1.4 });
    });
    ["→","→","→","→"].forEach((a,i) => {
      sl.addText(a, { x:1.88+i*1.84, y:2.6, w:0.5, h:0.44, fontSize:18, color:C.g2, align:"center", margin:0 });
    });
    footer(sl, lang); pageNum(sl, 4, T);
  }

  /* ──────────────────────────────────────────────
     SLIDE 5  TOOL OVERVIEW (What is it?)
  ────────────────────────────────────────────── */
  {
    const sl = pres.addSlide();
    sl.background = { color: C.navy };
    sl.addShape("ellipse", { x:7.0, y:-0.9, w:5.5, h:5.5, fill:{ color:C.blue, transparency:84 }, line:{ color:C.blue, transparency:84, width:0 } });
    sl.addShape("ellipse", { x:-1.2, y:3.3, w:4,   h:4,   fill:{ color:C.teal, transparency:89 }, line:{ color:C.teal, transparency:89, width:0 } });

    sl.addText(ko?"What is it?":"What is it?",
      { x:0.55, y:0.32, w:4, h:0.38, fontSize:10.5, color:C.teal, bold:true, charSpacing:2, margin:0 });
    sl.addText(ko?"AFM Journal Search Tool v2":"AFM Journal Search Tool v2",
      { x:0.55, y:0.73, w:8.5, h:0.72, fontSize:32, bold:true, color:C.white, margin:0 });
    sl.addShape("rect", { x:0.55, y:1.52, w:2.4, h:0.06, fill:{ color:C.teal } });
    sl.addText(
      ko  ? "단 하나의 HTML 파일로 동작하는 독립 실행형 연구 도구입니다.\n설치 없이 브라우저에서 바로 실행되며, 파일 하나로 누구에게나 공유할 수 있습니다."
          : "A standalone research tool powered by a single HTML file.\nOpens instantly in any browser — no installation needed. Share with anyone via one file.",
      { x:0.55, y:1.65, w:8.5, h:0.85, fontSize:13.5, color:C.ice, margin:0, lineSpacingMultiple:1.5 });

    const boxes = [
      { icon:FaRocket,    title:ko?"단일 HTML 파일":"Single HTML File",     body:ko?"설치 불필요\n브라우저로 즉시 실행":"No install required\nRuns instantly in browser" },
      { icon:FaCogs,      title:ko?"오프라인 동작":"Works Offline",          body:ko?"인터넷 없이도\n모든 기능 사용 가능":"All features available\nwithout internet" },
      { icon:FaGlobe,     title:ko?"API 자동 검색":"API Auto-Search",        body:ko?"CrossRef + Unpaywall\n자동 메타데이터 수집":"CrossRef + Unpaywall\nauto metadata fetch" },
      { icon:FaUsers,     title:ko?"즉시 공유":"Instant Sharing",            body:ko?"이메일·메신저로\n바로 전달 가능":"Send via email or\nmessenger directly" },
    ];
    for (let i=0; i<boxes.length; i++) {
      const x = 0.55 + i*2.35;
      sl.addShape("rect", { x, y:2.78, w:2.15, h:2.1,
        fill:{ color:C.blue, transparency:80 },
        line:{ color:C.sky, transparency:60, width:1 } });
      const ic = await ico(boxes[i].icon, C.teal, 256);
      sl.addImage({ data:ic, x:x+0.15, y:2.92, w:0.42, h:0.42 });
      sl.addText(boxes[i].title, { x:x+0.14, y:3.42, w:1.88, h:0.36, fontSize:12,  bold:true, color:C.white,  margin:0 });
      sl.addText(boxes[i].body,  { x:x+0.14, y:3.82, w:1.88, h:0.72, fontSize:10.5,color:C.ice, margin:0, lineSpacingMultiple:1.4 });
    }
    footer(sl, lang); pageNum(sl, 5, T);
  }

  /* ──────────────────────────────────────────────
     SLIDE 6  KEY FEATURES (7)
  ────────────────────────────────────────────── */
  {
    const sl = pres.addSlide();
    sl.background = { color: C.white };
    hdrBar(sl, "Key Features", ko?"7가지 핵심 기능":"7 Key Features");

    const feats = ko
      ? [
          { n:"①", t:"키워드 설정",      d:"Preset 30개 + 커스텀",       c:C.blue },
          { n:"②", t:"검색 필터",        d:"연도·IF·인용 수 기준 설정",   c:C.blue },
          { n:"③", t:"DB 검색 링크",     d:"6개 DB 자동 URL + Sci-Hub",  c:"1A7A6E" },
          { n:"④", t:"자동 저널 등록",   d:"CrossRef + Unpaywall API",    c:C.amber },
          { n:"⑤", t:"수동 저널 등록",   d:"DOI 자동 완성 + 직접 입력",  c:C.amber },
          { n:"⑥", t:"저널 목록",        d:"정렬·선택·통계 관리",         c:C.purple },
          { n:"⑦", t:"ZIP 내보내기",     d:"6종 파일 + PDF 일괄 다운로드",c:C.red },
        ]
      : [
          { n:"①", t:"Keywords",         d:"30 presets + custom add",     c:C.blue },
          { n:"②", t:"Search Filters",   d:"Year · IF · Citation criteria",c:C.blue },
          { n:"③", t:"DB Search Links",  d:"6 DBs auto URL + Sci-Hub",    c:"1A7A6E" },
          { n:"④", t:"Auto Registration",d:"CrossRef + Unpaywall API",    c:C.amber },
          { n:"⑤", t:"Manual Register",  d:"DOI auto-fill + manual entry",c:C.amber },
          { n:"⑥", t:"Journal List",     d:"Sort · select · statistics",  c:C.purple },
          { n:"⑦", t:"ZIP Export",       d:"6 file types + PDF batch DL", c:C.red },
        ];

    feats.forEach((f,i) => {
      const row = Math.floor(i/4), col = i%4;
      const x = 0.35 + col*2.35, y = 1.3 + row*1.73, w=2.15, h=1.55;
      sl.addShape("rect", { x, y, w, h, fill:{ color:C.g3 }, shadow:mkSh() });
      sl.addShape("rect", { x, y, w:0.06, h, fill:{ color:f.c } });
      sl.addText(f.n, { x:x+0.18, y:y+0.16, w:1.8, h:0.38, fontSize:20, bold:true, color:f.c, margin:0 });
      sl.addText(f.t, { x:x+0.18, y:y+0.56, w:1.85, h:0.38, fontSize:12, bold:true, color:C.navy, margin:0 });
      sl.addText(f.d, { x:x+0.18, y:y+0.96, w:1.85, h:0.5,  fontSize:9.5,color:C.text2, margin:0, lineSpacingMultiple:1.3 });
    });
    footer(sl, lang); pageNum(sl, 6, T);
  }

  /* ──────────────────────────────────────────────
     SLIDE 7  AUTO REGISTRATION FLOW
  ────────────────────────────────────────────── */
  {
    const sl = pres.addSlide();
    sl.background = { color: C.off };
    hdrBar(sl,
      ko?"Auto Registration":"Auto Registration",
      ko?"자동 저널 등록 프로세스":"Automatic Journal Registration Process");

    // Flow: 3 steps
    const flow = ko
      ? [
          { icon:FaSearch,   title:"CrossRef API 검색",    desc:"키워드로 관련도 순\n상위 10개 저널 검색\n(무료 공개 API)",       color:C.blue },
          { icon:FaFilePdf,  title:"Unpaywall PDF 확인",   desc:"각 DOI별 오픈 액세스\nPDF 다운로드 가능 여부\n실시간 확인",         color:"1A7A6E" },
          { icon:FaDatabase, title:"자동 등록 & 저장",     desc:"PDF 가능 저널 자동 등록\n메타데이터 자동 완성\nZIP에 PDF 포함",     color:C.amber },
        ]
      : [
          { icon:FaSearch,   title:"CrossRef API Search",  desc:"Search top 10 journals\nby relevance score\n(free public API)",    color:C.blue },
          { icon:FaFilePdf,  title:"Unpaywall PDF Check",  desc:"Verify open-access\nPDF availability for\neach DOI in real-time", color:"1A7A6E" },
          { icon:FaDatabase, title:"Auto Register & Save", desc:"Auto-register PDF journals\nAuto-fill metadata\nInclude PDF in ZIP", color:C.amber },
        ];

    // Arrow connector line
    sl.addShape("rect", { x:1.0, y:3.2, w:8.0, h:0.05, fill:{ color:C.g2 } });
    for (let i=0; i<flow.length; i++) {
      const x = 0.5 + i*3.1;
      sl.addShape("rect", { x, y:1.35, w:2.8, h:3.5, fill:{ color:C.white }, shadow:mkSh() });
      sl.addShape("rect", { x, y:1.35, w:2.8, h:0.07, fill:{ color:flow[i].color } });
      const ic = await ico(flow[i].icon, flow[i].color, 256);
      sl.addImage({ data:ic, x:x+1.1, y:1.55, w:0.6, h:0.6 });
      sl.addShape("ellipse", { x:x+1.25, y:3.05, w:0.3, h:0.3, fill:{ color:flow[i].color } });
      sl.addText(`${i+1}`, { x:x+1.25, y:3.05, w:0.3, h:0.3, fontSize:12, bold:true, color:C.white, align:"center", valign:"middle", margin:0 });
      sl.addText(flow[i].title, { x:x+0.15, y:2.28, w:2.5, h:0.55, fontSize:13, bold:true, color:C.navy, align:"center", margin:0 });
      sl.addText(flow[i].desc,  { x:x+0.15, y:2.92, w:2.5, h:1.6,  fontSize:11, color:C.text2, align:"center", margin:0, lineSpacingMultiple:1.5 });
      if (i<2) sl.addText("→", { x:x+2.55, y:3.0, w:0.5, h:0.4, fontSize:20, color:C.g2, align:"center", margin:0 });
    }

    // Bottom callout
    sl.addShape("rect", { x:0.4, y:5.07, w:9.2, h:0.35, fill:{ color:C.ice } });
    sl.addText(
      ko  ? "⚡  이메일 주소 입력만으로 CrossRef + Unpaywall 두 API를 동시에 활용 — 별도 API 키 불필요"
          : "⚡  Just enter your email to use both CrossRef + Unpaywall simultaneously — no API key needed",
      { x:0.6, y:5.09, w:8.8, h:0.3, fontSize:11, color:C.navy, bold:true, margin:0 }
    );
    footer(sl, lang); pageNum(sl, 7, T);
  }

  /* ──────────────────────────────────────────────
     SLIDE 8  QUALITY SCORE
  ────────────────────────────────────────────── */
  {
    const sl = pres.addSlide();
    sl.background = { color: C.white };
    hdrBar(sl, "Quality Score System",
      ko?"저널 품질 점수 자동 산정 시스템":"Automatic Journal Quality Scoring System");

    // Left score bars
    sl.addShape("rect", { x:0.35, y:1.32, w:4.6, h:3.82, fill:{ color:C.white }, shadow:mkSh() });
    sl.addText(ko?"점수 = IF + 인용 + 수식 + 보너스":"Score = IF + Citations + Equations + Bonus",
      { x:0.5, y:1.44, w:4.3, h:0.42, fontSize:11, color:C.navy, bold:true, margin:0 });
    const bars = [
      { lbl:ko?"인용 수 (Citations)":"Citations",        pts:40, color:C.amber,  note:ko?"500회 이상 = 만점":"500+ = max" },
      { lbl:ko?"Impact Factor":"Impact Factor",           pts:30, color:C.green,  note:ko?"IF 20 이상 = 만점":"IF ≥ 20 = max" },
      { lbl:ko?"수식 수 (Equations)":"Equations",        pts:20, color:C.blue,   note:ko?"20개 이상 = 만점":"20+ = max" },
      { lbl:ko?"Physics / 회로 포함":"Physics / Circuit",pts:10, color:C.purple, note:ko?"각 5점 보너스":"5 pts each" },
    ];
    bars.forEach((b,i) => {
      const y = 2.04 + i*0.78;
      sl.addText(b.lbl, { x:0.5, y, w:2.4, h:0.3, fontSize:11, color:C.text, margin:0 });
      sl.addShape("rect", { x:0.5, y:y+0.3, w:3.9, h:0.22, fill:{ color:C.g2 } });
      sl.addShape("rect", { x:0.5, y:y+0.3, w:3.9*(b.pts/100), h:0.22, fill:{ color:b.color } });
      sl.addText(`${b.pts}${ko?"점":"pts"}  ·  ${b.note}`, { x:0.5, y:y+0.54, w:3.9, h:0.2, fontSize:9, color:C.g1, margin:0 });
    });

    // Right grade boxes
    sl.addText(ko?"점수 등급":"Score Grade",
      { x:5.3, y:1.44, w:4.3, h:0.42, fontSize:14, bold:true, color:C.navy, margin:0 });
    const grades = [
      { r:ko?"70~100점":"70–100",  g:ko?"우수":"Excellent",  d:ko?"Introduction 핵심 참고 저널":"Primary reference journal for Introduction", c:C.green },
      { r:ko?"40~69점": "40–69",   g:ko?"양호":"Good",       d:ko?"보조 참고 자료로 활용":"Use as supplementary reference", c:C.blue },
      { r:ko?"0~39점":  "0–39",    g:ko?"검토 필요":"Review", d:ko?"추가 검증 후 사용 권장":"Verify further before use", c:C.amber },
    ];
    grades.forEach((g,i) => {
      sl.addShape("rect", { x:5.3, y:2.03+i*1.07, w:4.3, h:0.9, fill:{ color:C.white }, shadow:mkSh() });
      sl.addShape("rect", { x:5.3, y:2.03+i*1.07, w:0.07, h:0.9, fill:{ color:g.c } });
      sl.addText(g.r, { x:5.48, y:2.08+i*1.07, w:1.3, h:0.35, fontSize:13, bold:true, color:g.c, margin:0 });
      sl.addText(`${g.g}  ·  ${g.d}`, { x:5.48, y:2.46+i*1.07, w:3.9, h:0.35, fontSize:10, color:C.text2, margin:0 });
    });
    footer(sl, lang); pageNum(sl, 8, T);
  }

  /* ──────────────────────────────────────────────
     SLIDE 9  HOW TO USE
  ────────────────────────────────────────────── */
  {
    const sl = pres.addSlide();
    sl.background = { color: C.white };
    hdrBar(sl, "How to Use", ko?"사용 방법 — Step by Step":"How to Use — Step by Step");

    const steps = ko
      ? [
          { s:"STEP 1", t:"HTML 파일 열기",     d:"AFM_Journal_Search_Tool_KO.html을 Chrome/Edge로 드래그 앤 드롭" },
          { s:"STEP 2", t:"키워드 선택",         d:"Preset 30개 클릭 선택 또는 직접 커스텀 키워드 추가" },
          { s:"STEP 3", t:"자동 검색 실행",      d:"이메일 입력 후 '자동 검색 시작' → CrossRef + Unpaywall API 자동 실행" },
          { s:"STEP 4", t:"PDF 가능 저널 등록",  d:"PDF 접근 가능 저널 일괄 등록 또는 개별 선택 등록" },
          { s:"STEP 5", t:"ZIP 다운로드",        d:"모드명 입력 후 ZIP 버튼 클릭 — PDF + 6종 파일 일괄 다운로드" },
        ]
      : [
          { s:"STEP 1", t:"Open HTML File",      d:"Drag & drop AFM_Journal_Search_Tool_EN.html into Chrome/Edge" },
          { s:"STEP 2", t:"Select Keywords",      d:"Click preset keywords or add custom keywords manually" },
          { s:"STEP 3", t:"Run Auto Search",      d:"Enter email → click 'Start Auto Search' → CrossRef + Unpaywall API runs automatically" },
          { s:"STEP 4", t:"Register PDF Journals",d:"Bulk register journals with PDF access or register individually" },
          { s:"STEP 5", t:"Download ZIP",         d:"Enter mode name → click ZIP button — download PDF + 6 file types at once" },
        ];

    steps.forEach((h,i) => {
      const y = 1.32 + i*0.78;
      sl.addShape("ellipse", { x:0.35, y:y, w:0.52, h:0.52, fill:{ color:C.navy } });
      sl.addText(`${i+1}`, { x:0.35, y, w:0.52, h:0.52, fontSize:13, bold:true, color:C.white, align:"center", valign:"middle", margin:0 });
      if (i<steps.length-1) sl.addShape("rect", { x:0.595, y:y+0.52, w:0.05, h:0.26, fill:{ color:C.g2 } });
      sl.addText(h.s, { x:1.04, y:y+0.03, w:1.1, h:0.24, fontSize:9, bold:true, color:C.teal, charSpacing:1, margin:0 });
      sl.addText(h.t, { x:1.04, y:y+0.25, w:2.2, h:0.28, fontSize:13, bold:true, color:C.navy, margin:0 });
      sl.addText(h.d, { x:3.6,  y:y+0.04, w:6.0, h:0.63, fontSize:11, color:C.text2, margin:0, lineSpacingMultiple:1.4 });
      if (i<steps.length-1) sl.addShape("rect", { x:3.6, y:y+0.71, w:6.0, h:0.01, fill:{ color:C.g2 } });
    });
    footer(sl, lang); pageNum(sl, 9, T);
  }

  /* ──────────────────────────────────────────────
     SLIDE 10  ZIP OUTPUT
  ────────────────────────────────────────────── */
  {
    const sl = pres.addSlide();
    sl.background = { color: C.off };
    hdrBar(sl, "ZIP Output", ko?"ZIP 출력 파일 상세":"ZIP Output Files Detail");

    const files = [
      { f:"journals.json",        t:"JSON", c:C.amber,  d:ko?"저널 전체 메타데이터\n(IF · 인용 · 점수 · PDF URL)":"Full journal metadata\n(IF · citations · score · PDF URL)" },
      { f:"report.html",          t:"HTML", c:C.blue,   d:ko?"브라우저 열람 가능\n저널 품질 비교 보고서":"Browser-viewable\njournal quality report" },
      { f:"keywords.txt",         t:"TXT",  c:C.green,  d:ko?"키워드 목록 및\n전체 검색 쿼리 문자열":"Keyword list and\nfull search query string" },
      { f:"search_links.txt",     t:"TXT",  c:"1A7A6E", d:ko?"6개 DB 자동 생성\n검색 URL 목록":"Auto-generated search\nURLs for 6 databases" },
      { f:"intro_template.md",    t:"MD",   c:C.purple, d:ko?"Chapter 1 Introduction\nMarkdown 초안 (수식 포함)":"Chapter 1 Introduction\nMarkdown draft (with equations)" },
      { f:"review_checklist.md",  t:"MD",   c:C.red,    d:ko?"AFM 전문가 피드백용\n검토 체크리스트":"Expert review checklist\nfor AFM specialists" },
      { f:"pdf/ (folder)",        t:"PDF",  c:"1A5276", d:ko?"오픈 액세스 PDF 자동\n다운로드 포함 폴더":"Auto-downloaded\nopen-access PDFs folder" },
    ];
    files.forEach((o,i) => {
      const col=i%4, row=Math.floor(i/4);
      const x=0.3+col*2.42, y=1.3+row*1.9, w=2.22, h=1.68;
      sl.addShape("rect", { x, y, w, h, fill:{ color:C.white }, shadow:mkSh() });
      sl.addShape("rect", { x, y, w:0.07, h, fill:{ color:o.c } });
      sl.addShape("rect", { x:x+w-0.7, y:y+0.1, w:0.62, h:0.27, fill:{ color:o.c } });
      sl.addText(o.t, { x:x+w-0.7, y:y+0.1, w:0.62, h:0.27, fontSize:9, bold:true, color:C.white, align:"center", valign:"middle", margin:0 });
      sl.addText(o.f, { x:x+0.18, y:y+0.16, w:1.9,  h:0.38, fontSize:11, bold:true, color:C.navy, margin:0 });
      sl.addText(o.d, { x:x+0.18, y:y+0.62, w:1.9,  h:0.9,  fontSize:9.5, color:C.text2, margin:0, lineSpacingMultiple:1.4 });
    });
    footer(sl, lang); pageNum(sl, 10, T);
  }

  /* ──────────────────────────────────────────────
     SLIDE 11  NEXT REVISION PLAN
  ────────────────────────────────────────────── */
  {
    const sl = pres.addSlide();
    sl.background = { color: C.navy };
    // Decorations
    sl.addShape("ellipse", { x:-1.5, y:-1.0, w:6,   h:6,   fill:{ color:C.blue,  transparency:84 }, line:{ color:C.blue,  transparency:84, width:0 } });
    sl.addShape("ellipse", { x:7.8,  y:3.5,  w:4.5, h:4.5, fill:{ color:C.teal,  transparency:87 }, line:{ color:C.teal,  transparency:87, width:0 } });

    // Header
    sl.addText(ko?"Next Revision Plan":"Next Revision Plan",
      { x:0.55, y:0.25, w:5, h:0.38, fontSize:10.5, color:C.teal, bold:true, charSpacing:2, margin:0 });
    sl.addText(ko?"다음 버전 개선 계획":"Upcoming Version Roadmap",
      { x:0.55, y:0.65, w:8.5, h:0.65, fontSize:30, bold:true, color:C.white, margin:0 });
    sl.addShape("rect", { x:0.55, y:1.38, w:2.6, h:0.06, fill:{ color:C.teal } });

    // Two revision cards
    const revisions = ko
      ? [
          {
            icon: FaListOl,
            tag:  "REVISION 1",
            title:"저널 Grading 세부 규정 고도화",
            points:[
              "수식 유형별 가중치 세분화 (기본 수식 vs. 핵심 물리 수식)",
              "저널 분야 적합성 지수 추가 (AFM 관련도 자동 판별)",
              "인용 맥락 분석 — 단순 인용 vs. 핵심 참고로 분류",
              "Impact Factor 구간별 차등 점수 체계 도입",
              "최신성 지수 추가 (최근 5년 인용 비율 반영)",
            ]
          },
          {
            icon: FaBrain,
            tag:  "REVISION 2",
            title:"등록 저널 기반 Introduction 자동 작성 지원",
            points:[
              "등록된 저널에서 핵심 문장 자동 Summary 추출",
              "기존 Introduction 구성 구조에 맞춘 섹션별 내용 배치",
              "수식·레퍼런스 자동 매핑 및 초안 생성",
              "사용자 검토 → 피드백 반영 → 재생성 워크플로우",
              "최종 초안을 Markdown / Word 형식으로 내보내기",
            ]
          }
        ]
      : [
          {
            icon: FaListOl,
            tag:  "REVISION 1",
            title:"Advanced Journal Grading Rules",
            points:[
              "Differentiate equation weight by type (basic vs. core physics equations)",
              "Add field relevance index (auto-detect AFM topic alignment)",
              "Citation context analysis — distinguish core vs. incidental citations",
              "Tiered Impact Factor scoring with finer grade intervals",
              "Recency index — incorporate recent 5-year citation ratio",
            ]
          },
          {
            icon: FaBrain,
            tag:  "REVISION 2",
            title:"AI-Assisted Introduction Drafting from Registered Journals",
            points:[
              "Auto-extract key sentences and summaries from registered journals",
              "Map content to the existing Introduction section structure",
              "Auto-map equations and references and generate draft",
              "User review → feedback → regeneration workflow",
              "Export final draft as Markdown or Word document",
            ]
          }
        ];

    for (let i=0; i<2; i++) {
      const rev = revisions[i];
      const x = 0.4 + i*4.75;
      sl.addShape("rect", { x, y:1.6, w:4.5, h:3.8,
        fill:{ color:C.blue, transparency:80 },
        line:{ color:C.sky, transparency:55, width:1 }
      });
      // Tag chip
      sl.addShape("rect", { x:x+0.18, y:1.73, w:1.2, h:0.26, fill:{ color:C.teal } });
      sl.addText(rev.tag, { x:x+0.18, y:1.73, w:1.2, h:0.26, fontSize:9, bold:true, color:C.white, align:"center", valign:"middle", margin:0 });
      // Icon
      const ic = await ico(rev.icon, C.teal, 256);
      sl.addImage({ data:ic, x:x+1.5, y:1.68, w:0.38, h:0.38 });
      // Title
      sl.addText(rev.title, { x:x+0.18, y:2.08, w:4.15, h:0.52, fontSize:13, bold:true, color:C.white, margin:0, lineSpacingMultiple:1.3 });
      // Bullet points
      sl.addText(
        rev.points.map(p => ({ text:"·  "+p, options:{ breakLine:true, fontSize:10.5, color:C.ice } })),
        { x:x+0.18, y:2.68, w:4.15, h:2.6, margin:0, lineSpacingMultiple:1.55 }
      );
    }

    // Bottom note
    sl.addShape("rect", { x:0, y:5.1, w:10, h:0.525, fill:{ color:"091628" } });
    sl.addText(
      ko  ? "Park Systems  ·  AFM Manual Introduction Builder  ·  2025  ·  v3 예정"
          : "Park Systems  ·  AFM Manual Introduction Builder  ·  2025  ·  v3 Coming Soon",
      { x:0.5, y:5.15, w:9, h:0.4, fontSize:9.5, color:C.g2, margin:0 }
    );
  }

  /* ── WRITE ────────────────────────────────── */
  const filename = `${require("path").resolve(__dirname,"../output/pptx")}/AFM_Tool_Intro_${lang==="ko"?"KO":"EN"}.pptx`;
  await pres.writeFile({ fileName: filename });
  console.log(`✅ ${filename}`);
}

/* ── RUN BOTH ────────────────────────────────── */
(async () => {
  await buildDeck("ko");
  await buildDeck("en");
  console.log("🎉 Both decks done.");
})();
