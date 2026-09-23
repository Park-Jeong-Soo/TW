
// Ensure output directory exists
const _path = require("path");
const _fs = require("fs");
const _outDir = _path.join(__dirname, "../output/docx");
if (!_fs.existsSync(_outDir)) _fs.mkdirSync(_outDir, { recursive: true });

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType,
  VerticalAlign, LevelFormat, PageNumber, PageBreak
} = require('docx');
const fs = require('fs');

// ── PALETTE ──────────────────────────────────────────────
const NAVY   = "0B1D3A";
const BLUE   = "185FA5";
const TEAL   = "00C2A8";
const AMBER  = "C47A0A";
const GREEN  = "2D7A4A";
const GRAY   = "4A5568";
const LGRAY  = "8A93A8";
const WHITE  = "FFFFFF";

// ── HELPERS ───────────────────────────────────────────────
const t = (text, opts = {}) => new TextRun({ text, font: "Arial", ...opts });
const bold = (text, color) => t(text, { bold: true, color });
const gray = (text) => t(text, { color: LGRAY, size: 20 });

function hRule() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: TEAL, space: 4 } },
    spacing: { after: 120 }
  });
}

function slideHeader(num, title) {
  return [
    new Paragraph({
      children: [
        t(`슬라이드 ${num}  `, { bold: true, color: WHITE, size: 20,
          shading: { type: ShadingType.SOLID, fill: NAVY } }),
        t(`  ${title}  `, { bold: true, color: WHITE, size: 20,
          shading: { type: ShadingType.SOLID, fill: TEAL } }),
      ],
      spacing: { before: 340, after: 60 },
    }),
    new Paragraph({
      children: [
        t('[TIME] ', { color: TEAL, size: 19 }),
        t('목표 시간', { bold: true, color: GRAY, size: 19 }),
      ],
      spacing: { after: 40 }
    }),
  ];
}

function timeBar(label) {
  return new Paragraph({
    children: [
      t('  ' + label + '  ', {
        bold: true, color: WHITE, size: 19,
        shading: { type: ShadingType.SOLID, fill: AMBER }
      }),
    ],
    spacing: { before: 20, after: 100 },
  });
}

function script(text) {
  return new Paragraph({
    children: [t(text, { size: 22, color: "1A2540" })],
    spacing: { before: 80, after: 80 },
    indent: { left: 360 },
  });
}

function tip(text) {
  return new Paragraph({
    children: [
      t('[TIP] ', { size: 20 }),
      t(text, { size: 20, color: GREEN, italics: true }),
    ],
    spacing: { before: 60, after: 100 },
    indent: { left: 360 },
    border: { left: { style: BorderStyle.SINGLE, size: 12, color: TEAL, space: 8 } },
    shading: { type: ShadingType.SOLID, fill: "E0F7F5" }
  });
}

function keyword(text) {
  // inline keyword emphasis — wrap in square brackets visually
  return t(`[${text}]`, { bold: true, color: BLUE, size: 22 });
}

function sectionTitle(text) {
  return new Paragraph({
    children: [
      t('| ', { color: TEAL, bold: true, size: 24 }),
      t(text, { bold: true, color: NAVY, size: 24 }),
    ],
    spacing: { before: 200, after: 80 },
  });
}

function bullet(text, color = GRAY) {
  return new Paragraph({
    children: [
      t('  -  ', { color: TEAL, bold: true }),
      t(text, { color, size: 21 }),
    ],
    spacing: { before: 40, after: 40 },
    indent: { left: 360 },
  });
}

// ── BUILD DOC ─────────────────────────────────────────────
const children = [];

// ════════════════════════════════════════════════════════
// COVER PAGE
// ════════════════════════════════════════════════════════
children.push(
  new Paragraph({
    children: [t("AFM Journal Search Tool v2", { bold: true, color: NAVY, size: 52, font: "Arial" })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 1200, after: 160 },
  }),
  new Paragraph({
    children: [t("10분 발표 스크립트", { color: TEAL, bold: true, size: 36, font: "Arial" })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
  }),
  new Paragraph({
    children: [t("— AFM_Tool_Intro_KO.pptx 기반 —", { color: LGRAY, size: 22, italics: true })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 600 },
  }),

  // Summary table
  new Table({
    width: { size: 8000, type: WidthType.DXA },
    rows: [
      new TableRow({ children: [
        new TableCell({
          children: [new Paragraph({ children: [t("총 슬라이드", { bold: true, color: WHITE, size: 21 })], alignment: AlignmentType.CENTER })],
          shading: { type: ShadingType.SOLID, fill: NAVY },
          width: { size: 2000, type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
        }),
        new TableCell({
          children: [new Paragraph({ children: [t("11장", { bold: true, color: NAVY, size: 21 })], alignment: AlignmentType.CENTER })],
          width: { size: 2000, type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
        }),
        new TableCell({
          children: [new Paragraph({ children: [t("총 발표 시간", { bold: true, color: WHITE, size: 21 })], alignment: AlignmentType.CENTER })],
          shading: { type: ShadingType.SOLID, fill: NAVY },
          width: { size: 2000, type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
        }),
        new TableCell({
          children: [new Paragraph({ children: [t("약 10분", { bold: true, color: NAVY, size: 21 })], alignment: AlignmentType.CENTER })],
          width: { size: 2000, type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
        }),
      ]}),
    ],
  }),

  new Paragraph({
    children: [t("발표자 참고 안내", { bold: true, color: GRAY, size: 21 })],
    spacing: { before: 500, after: 100 },
  }),

  ...([
    "• 각 슬라이드 앞의 [TIME] 태그는 해당 슬라이드에서 머물러야 할 권장 시간입니다.",
    "• [TIP] 박스는 청중 반응이나 강조 포인트에 대한 발표자 팁입니다.",
    "• [강조 단어]는 슬라이드 화면의 해당 요소를 가리키며 말할 부분입니다.",
    "• 스크립트는 자연스러운 구어체로 작성되었습니다. 읽지 말고 이해한 후 자신의 언어로 말하세요.",
    "• 마지막 슬라이드(다음 버전 계획)는 질문 유도용으로, 발표 분위기에 따라 짧게 줄여도 됩니다.",
  ].map(t_txt => new Paragraph({
    children: [t(t_txt, { size: 21, color: GRAY })],
    spacing: { before: 40, after: 40 }
  }))),

  new Paragraph({ children: [new PageBreak()] }),

// ════════════════════════════════════════════════════════
// SL 1 — TITLE
// ════════════════════════════════════════════════════════
  ...slideHeader(1, "타이틀"),
  timeBar("[TIME] 00:00 ~ 01:00  (약 1분)"),

  sectionTitle("오프닝 & 자기소개"),

  script("안녕하세요. 오늘은 제가 직접 만들고 사용하고 있는 도구 하나를 소개하려 합니다."),
  script("바로 'AFM Journal Search Tool v2'입니다."),
  script("이름에서 짐작하시겠지만, AFM 측정 모드 매뉴얼을 작성할 때 Chapter 1, 즉 Introduction을 쓰기 위해 저널을 검색하고 정리하는 작업을 자동화한 도구입니다."),
  script("저는 매뉴얼을 작성할 때마다 늘 같은 고민을 했습니다. '어떤 저널을 참고해야 하지? 이 논문이 좋은 논문인지 어떻게 빠르게 판단하지? 매번 같은 검색을 반복해야 하나?' 라는 것들이었습니다."),
  script("그 고민의 결과물이 오늘 소개드릴 이 도구입니다."),
  tip("슬라이드의 현미경 아이콘과 타이틀을 잠깐 보여주며 분위기를 잡으세요. 첫 1분은 청중의 집중을 확보하는 시간입니다."),

  new Paragraph({ children: [new PageBreak()] }),

// ════════════════════════════════════════════════════════
// SL 2 — 목차
// ════════════════════════════════════════════════════════
  ...slideHeader(2, "목차"),
  timeBar("[TIME] 01:00 ~ 01:30  (약 30초)"),

  sectionTitle("발표 구성 안내"),

  script("오늘 발표는 크게 다섯 가지 흐름으로 진행됩니다."),
  script("먼저 이 도구가 왜 필요했는지 배경을 말씀드리고, 기존에 어떻게 Introduction을 작성해왔는지 표준 프로세스를 소개합니다."),
  script("그다음 실제 도구가 어떻게 작동하는지, 주요 기능 7가지를 살펴보고, 핵심인 자동 저널 등록과 품질 점수 시스템을 설명드립니다."),
  script("마지막으로 어떻게 사용하면 되는지 단계별로 안내하고, 앞으로 어떤 기능을 추가할 계획인지로 마무리하겠습니다."),
  script("화면 오른쪽에 숫자 카드 네 개가 보이시죠? 이게 오늘 발표의 핵심을 압축한 겁니다. 5단계 프로세스, 7개 학술 DB, 3가지 품질 기준, 6종 출력 파일."),
  tip("이 슬라이드는 빠르게 넘어가도 됩니다. 30초 안에 로드맵만 공유하는 것이 목적입니다."),

  new Paragraph({ children: [new PageBreak()] }),

// ════════════════════════════════════════════════════════
// SL 3 — 배경 & 문제 인식
// ════════════════════════════════════════════════════════
  ...slideHeader(3, "배경 & 문제 인식"),
  timeBar("[TIME] 01:30 ~ 02:30  (약 1분)"),

  sectionTitle("왜 이 도구가 필요했나"),

  script("솔직히 말씀드리면, 저널 검색은 매번 힘들었습니다. 방식이 체계적이지 않았거든요."),
  script("세 가지 문제가 있었습니다."),
  script("첫째, 연구자마다 다른 DB를 씁니다. 누구는 Scholar만, 누구는 ScienceDirect만. 기준이 없으니 같은 모드라도 참고한 논문이 다 달랐습니다."),
  script("둘째, 좋은 논문이 뭔지 판단 기준이 없었습니다. Impact Factor가 높으면 좋은 건지, 인용 수가 많아야 하는 건지, 수식이 풍부해야 하는 건지 — 이걸 동시에 고려할 방법이 없었어요."),
  script("셋째, 매번 같은 작업을 반복해야 했습니다. 키워드 정리, 링크 복사, 메모, 초안 — 이걸 새 모드마다 처음부터 다시."),
  script("그래서 화면 하단에 써있듯이, 이 모든 과정을 HTML 파일 하나로 통합한 것이 이 도구입니다."),
  tip("청중이 공감할 수 있도록 '저도 그런 경험 있으셨죠?'라는 뉘앙스로 말하면 좋습니다."),

  new Paragraph({ children: [new PageBreak()] }),

// ════════════════════════════════════════════════════════
// SL 4 — 표준 작성 프로세스
// ════════════════════════════════════════════════════════
  ...slideHeader(4, "표준 작성 프로세스"),
  timeBar("[TIME] 02:30 ~ 03:30  (약 1분)"),

  sectionTitle("5단계로 정리된 Introduction 작성 워크플로우"),

  script("이 도구는 기존에 구두로만 전달되던 Introduction 작성 노하우를 5단계로 공식화했습니다."),
  script("첫 번째는 [키워드 추합]입니다. 이전 매뉴얼과 Park Systems 학습 페이지를 기반으로 핵심 키워드를 모읍니다."),
  script("두 번째는 [저널 검색]. CrossRef API, Google Scholar, ScienceDirect 등 여러 DB를 통해 관련 논문을 찾습니다. 유료 저널은 Sci-Hub를 통해 접근할 수 있습니다."),
  script("세 번째는 [저널 선별]. Impact Factor, 인용 수, Introduction의 수식 수를 기준으로 0점에서 100점 사이 품질 점수를 자동으로 계산합니다."),
  script("네 번째는 [초안 작성]. tip-sample 간 물리 현상, 회로와 신호처리를 중심으로 사용자 관점에서 이해 가능한 Introduction을 구성합니다."),
  script("다섯 번째는 [전문가 검토]. 물리적 타당성과 실제 시스템 구동 방식과의 일치 여부를 AFM 전문가에게 피드백 받은 후 최종 배포합니다."),
  script("이 5단계는 이제 도구 안에 고스란히 담겨 있습니다."),
  tip("슬라이드의 1~5번 원형 아이콘을 순서대로 가리키며 설명하면 시각적 흐름이 좋습니다."),

  new Paragraph({ children: [new PageBreak()] }),

// ════════════════════════════════════════════════════════
// SL 5 — 도구 소개
// ════════════════════════════════════════════════════════
  ...slideHeader(5, "도구 소개"),
  timeBar("[TIME] 03:30 ~ 04:15  (약 45초)"),

  sectionTitle("핵심 가치: 단일 HTML 파일"),

  script("이 도구의 가장 큰 강점은 단 하나의 HTML 파일이라는 겁니다."),
  script("설치가 필요 없습니다. Chrome이나 Edge 브라우저에 파일을 드래그하면 끝입니다. 서버도 필요 없고, 계정도 필요 없습니다."),
  script("[오프라인 동작] — 인터넷 없이도 대부분의 기능을 쓸 수 있습니다. 검색 필터 설정, 저널 수동 등록, 목록 관리, ZIP 생성이 모두 가능합니다."),
  script("[API 자동 검색] — 인터넷이 연결되면 CrossRef API와 Unpaywall API를 통해 저널 검색과 PDF 접근 가능 여부 확인까지 자동으로 됩니다."),
  script("[즉시 공유] — 파일 하나를 이메일이나 메신저로 보내면 모든 팀원이 동일한 환경에서 동일한 기준으로 작업할 수 있습니다."),
  tip("'파일 하나'라는 점을 강조하세요. 이 부분에서 청중이 가장 흥미를 보입니다."),

  new Paragraph({ children: [new PageBreak()] }),

// ════════════════════════════════════════════════════════
// SL 6 — 주요 기능 7가지
// ════════════════════════════════════════════════════════
  ...slideHeader(6, "7가지 핵심 기능"),
  timeBar("[TIME] 04:15 ~ 05:15  (약 1분)"),

  sectionTitle("메뉴 구성과 각 기능의 역할"),

  script("도구는 총 7개 메뉴로 구성됩니다. 슬라이드를 보시면 순서대로 나열되어 있습니다."),
  script("① [키워드 설정] — Preset 키워드 30개를 클릭으로 선택하거나 직접 추가합니다. 이 키워드가 이후 모든 검색의 기반이 됩니다."),
  script("② [검색 필터] — 연도, Impact Factor, 인용 수 기준을 설정합니다. 여기서 Unpaywall API용 이메일도 입력합니다."),
  script("③ [DB 검색 링크] — 6개 학술 DB의 검색 URL이 키워드와 연도를 반영해 자동 생성됩니다. Sci-Hub 바로가기도 포함되어 있습니다."),
  script("④ [자동 저널 등록] — 오늘 발표의 핵심 기능입니다. 다음 슬라이드에서 자세히 설명드리겠습니다."),
  script("⑤ [수동 저널 등록] — DOI를 입력하면 메타데이터가 자동 완성됩니다. 필요한 경우 직접 입력도 가능합니다."),
  script("⑥ [저널 목록] — 등록된 저널을 점수순, 인용순, IF순으로 정렬하고 통계를 확인합니다."),
  script("⑦ [ZIP 내보내기] — 선택된 저널의 데이터와 PDF를 ZIP 하나로 다운로드합니다."),
  tip("각 번호 카드를 화면에서 가리키며 빠른 템포로 설명하세요. 이 슬라이드는 개요이므로 깊게 들어가지 않아도 됩니다."),

  new Paragraph({ children: [new PageBreak()] }),

// ════════════════════════════════════════════════════════
// SL 7 — 자동 저널 등록
// ════════════════════════════════════════════════════════
  ...slideHeader(7, "자동 저널 등록 프로세스"),
  timeBar("[TIME] 05:15 ~ 06:30  (약 1분 15초)"),

  sectionTitle("CrossRef + Unpaywall — 두 API의 역할 분담"),

  script("이 기능이 이 도구의 핵심입니다. 자동 저널 등록."),
  script("작동 방식은 단순합니다. 이메일 주소 하나만 입력하면 두 개의 무료 공개 API가 순서대로 작동합니다."),
  script("먼저 [CrossRef API]가 선택된 키워드를 바탕으로 관련도 순 상위 저널을 검색해 옵니다. 이 API는 무료이고 API 키도 필요 없습니다. DOI, 제목, 저자, 인용 수, 저널명이 모두 자동으로 가져와집니다."),
  script("다음으로 [Unpaywall API]가 각 저널의 DOI를 받아서 해당 논문의 오픈 액세스 PDF가 있는지, 있다면 다운로드 URL이 무엇인지 실시간으로 확인합니다."),
  script("그 결과로 각 저널 카드에 초록색으로 [PDF 다운로드 가능] 또는 빨간색으로 [PDF 불가, 유료]가 표시됩니다."),
  script("그리고 하단에 두 가지 버튼이 나타납니다. 'PDF 가능한 저널만 모두 등록'과 '전체 등록'. 목적에 따라 선택하면 됩니다."),
  script("PDF가 없는 유료 저널은 Sci-Hub 버튼이 나타나서 DOI로 직접 접근할 수 있도록 안내합니다."),
  tip("슬라이드의 3단계 플로우 화살표를 보여주며 설명하면 이해가 빠릅니다. 하단의 '이메일만 입력하면 된다'는 점을 재차 강조하세요."),

  new Paragraph({ children: [new PageBreak()] }),

// ════════════════════════════════════════════════════════
// SL 8 — 품질 점수
// ════════════════════════════════════════════════════════
  ...slideHeader(8, "저널 품질 점수 시스템"),
  timeBar("[TIME] 06:30 ~ 07:30  (약 1분)"),

  sectionTitle("객관적 기준으로 저널을 줄 세우다"),

  script("저널을 찾은 다음 문제는 '이게 좋은 논문인가?'를 판단하는 겁니다."),
  script("이 도구는 0점에서 100점 사이의 품질 점수를 자동으로 계산합니다. 기준은 네 가지입니다."),
  script("가장 높은 비중은 [인용 수]입니다. 최대 40점입니다. 500회 이상 인용되면 만점이에요. 많은 연구자들이 참고했다는 건 검증된 내용이라는 의미입니다."),
  script("다음은 [Impact Factor], 최대 30점. IF 20 이상이면 만점입니다."),
  script("세 번째는 [수식 수]입니다. 최대 20점인데, 이게 AFM 매뉴얼 특화 기준입니다. Introduction에 수식이 많다는 건 물리적 원리를 제대로 다루고 있다는 뜻이거든요. 수식 수는 논문을 직접 열어 세어야 합니다."),
  script("마지막으로 tip-sample 물리 내용이나 회로·신호처리 내용이 포함되어 있으면 각각 5점씩 보너스입니다. 이건 제목과 초록에서 키워드를 자동으로 감지합니다."),
  script("70점 이상이면 우수, 40~69점은 양호, 39점 이하는 추가 검토 필요로 분류됩니다."),
  tip("왼쪽 바 차트를 손으로 가리키며 비중을 설명하세요. '수식 수는 AFM 특화 기준이다'를 강조하면 청중이 이 도구의 차별성을 느낄 수 있습니다."),

  new Paragraph({ children: [new PageBreak()] }),

// ════════════════════════════════════════════════════════
// SL 9 — 사용 방법
// ════════════════════════════════════════════════════════
  ...slideHeader(9, "사용 방법"),
  timeBar("[TIME] 07:30 ~ 08:30  (약 1분)"),

  sectionTitle("HTML 열기부터 ZIP 다운로드까지 5단계"),

  script("이제 실제로 어떻게 쓰는지 단계별로 말씀드리겠습니다."),
  script("STEP 1 — HTML 파일을 Chrome이나 Edge에서 엽니다. 드래그 앤 드롭으로 끝입니다."),
  script("STEP 2 — 왼쪽 사이드바에서 '키워드 설정'을 클릭하고 관련 Preset 키워드를 선택하거나 직접 추가합니다. Park Systems 학습 페이지의 모드 설명을 참고하시면 좋습니다."),
  script("STEP 3 — 검색 필터 탭에서 이메일을 입력한 뒤, '자동 저널 등록' 메뉴에서 '자동 검색 시작' 버튼을 누릅니다. 진행 바가 돌아가면서 CrossRef와 Unpaywall API가 자동으로 실행됩니다."),
  script("STEP 4 — 결과 카드에서 PDF 가능한 저널을 확인하고 원하는 저널을 등록합니다. 개별 등록도 되고 PDF 가능한 저널 전체를 한 번에 등록할 수도 있습니다."),
  script("STEP 5 — ZIP 내보내기 탭에서 AFM 모드명을 입력하고 다운로드 버튼을 누르면 끝입니다. 메타데이터, 보고서, 초안 템플릿, 체크리스트, PDF까지 한 번에 받아가실 수 있습니다."),
  tip("실제 화면을 데모로 보여드릴 수 있다면 이 슬라이드에서 데모를 삽입하면 가장 효과적입니다."),

  new Paragraph({ children: [new PageBreak()] }),

// ════════════════════════════════════════════════════════
// SL 10 — ZIP 출력
// ════════════════════════════════════════════════════════
  ...slideHeader(10, "ZIP 출력 파일 상세"),
  timeBar("[TIME] 08:30 ~ 09:00  (약 30초)"),

  sectionTitle("ZIP 안에 들어있는 것들"),

  script("다운로드받는 ZIP 파일에는 총 7종의 파일이 들어있습니다. 빠르게 살펴보겠습니다."),
  script("[journals.json] — 저널 전체 메타데이터. IF, 인용 수, 점수, PDF URL이 모두 담겨 있어 다른 도구에서도 활용 가능합니다."),
  script("[report.html] — 브라우저에서 바로 열 수 있는 품질 비교 보고서."),
  script("[search_links.txt]와 [keywords.txt] — 나중에 재검색할 때 바로 쓸 수 있는 URL과 키워드 목록."),
  script("[intro_template.md] — Introduction 초안입니다. van der Waals 힘부터 조화진동자 모델까지 핵심 수식이 미리 들어있는 Markdown 파일입니다."),
  script("[review_checklist.md] — AFM 전문가 피드백용 체크리스트. 물리적 타당성과 시스템 일치 여부를 항목별로 확인할 수 있습니다."),
  script("그리고 [pdf 폴더] — 오픈 액세스 논문 PDF가 자동으로 다운로드되어 폴더에 담겨 옵니다."),
  tip("카드들을 빠르게 훑으면서 '이거 하나면 Introduction 초안 작성 재료가 다 모인다'는 메시지를 전달하세요."),

  new Paragraph({ children: [new PageBreak()] }),

// ════════════════════════════════════════════════════════
// SL 11 — REVISION PLAN
// ════════════════════════════════════════════════════════
  ...slideHeader(11, "다음 버전 개선 계획"),
  timeBar("[TIME] 09:00 ~ 10:00  (약 1분)"),

  sectionTitle("v2.0 이후: 더 정교하게, 더 스마트하게"),

  script("마지막으로 앞으로 어떤 기능을 추가할 계획인지 말씀드리겠습니다."),
  script("두 가지 큰 방향이 있습니다."),
  script("첫 번째는 [REVISION 1: 저널 Grading 세부 규정 고도화]입니다."),
  script("지금은 수식 수를 단순히 개수로만 세지만, 앞으로는 수식의 종류를 구분할 겁니다. 기본적인 사칙연산 수준인지, 아니면 AFM의 물리 원리를 담은 핵심 수식인지."),
  script("또 인용의 맥락도 분석하려 합니다. 단순히 방법론으로 인용된 건지, 아니면 이론적 근거로 핵심 인용된 건지를 구분하면 훨씬 정확한 품질 평가가 가능해집니다."),
  script("최근 5년간의 인용 비율도 반영할 예정입니다. 오래됐지만 여전히 인용되는 논문이 훨씬 가치 있으니까요."),
  script("두 번째는 [REVISION 2: 등록 저널 기반 Introduction 자동 작성 지원]입니다."),
  script("단순히 저널을 모으는 것에서 한 발 더 나아가, 모은 저널들로부터 핵심 문장을 자동 추출하고, 기존 Introduction 구조에 맞게 섹션별로 배치해 초안을 생성하는 기능입니다."),
  script("사용자가 검토하고 피드백을 주면 재생성하는 반복 워크플로우도 구현할 예정이며, 최종 결과물을 Markdown이나 Word 파일로 바로 내보낼 수 있게 됩니다."),
  script("이 두 가지가 완성되면, 저널 검색에서 최종 초안 완성까지의 전체 프로세스를 이 도구 하나로 마무리할 수 있을 것으로 기대하고 있습니다."),
  tip("'이 두 가지가 구현되면 여러분이 직접 테스트해보실 수 있도록 공유하겠습니다'로 마무리하면 참여를 유도할 수 있습니다."),

  new Paragraph({ spacing: { before: 400 } }),

  // ── CLOSING ──
  new Paragraph({
    children: [
      t("발표를 들어주셔서 감사합니다. 질문 있으시면 말씀해 주세요.",
        { bold: true, color: NAVY, size: 24 }),
    ],
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 200 },
    border: {
      top:    { style: BorderStyle.SINGLE, size: 6, color: TEAL, space: 6 },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: TEAL, space: 6 },
    }
  }),

  new Paragraph({ spacing: { before: 300 } }),

  // Quick reference table
  new Paragraph({
    children: [t("슬라이드별 타임라인 요약", { bold: true, color: NAVY, size: 22 })],
    spacing: { before: 200, after: 100 },
  }),

  new Table({
    width: { size: 9000, type: WidthType.DXA },
    rows: [
      // Header
      new TableRow({ tableHeader: true, children: [
        ...(["슬라이드","제목","시간","누적"].map(h =>
          new TableCell({
            children: [new Paragraph({ children: [t(h, { bold: true, color: WHITE, size: 19 })], alignment: AlignmentType.CENTER })],
            shading: { type: ShadingType.SOLID, fill: NAVY },
            width: { size: h==="제목"?3600:1800, type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
          })
        ))
      ]}),
      ...[
        ["1", "타이틀 & 인트로", "1:00", "1:00"],
        ["2", "목차", "0:30", "1:30"],
        ["3", "배경 & 문제 인식", "1:00", "2:30"],
        ["4", "표준 작성 프로세스", "1:00", "3:30"],
        ["5", "도구 소개", "0:45", "4:15"],
        ["6", "7가지 핵심 기능", "1:00", "5:15"],
        ["7", "자동 저널 등록", "1:15", "6:30"],
        ["8", "품질 점수 시스템", "1:00", "7:30"],
        ["9", "사용 방법", "1:00", "8:30"],
        ["10", "ZIP 출력물", "0:30", "9:00"],
        ["11", "다음 버전 계획", "1:00", "10:00"],
      ].map(([num, title, dur, cum], i) =>
        new TableRow({ children: [
          new TableCell({
            children: [new Paragraph({ children: [t(num, { bold: true, color: BLUE, size: 19 })], alignment: AlignmentType.CENTER })],
            shading: { type: ShadingType.SOLID, fill: i%2===0 ? "F4F7FB" : WHITE },
            width: { size: 1800, type: WidthType.DXA },
          }),
          new TableCell({
            children: [new Paragraph({ children: [t(title, { size: 19, color: GRAY })] })],
            shading: { type: ShadingType.SOLID, fill: i%2===0 ? "F4F7FB" : WHITE },
            width: { size: 3600, type: WidthType.DXA },
          }),
          new TableCell({
            children: [new Paragraph({ children: [t(dur, { size: 19, color: TEAL, bold: true })], alignment: AlignmentType.CENTER })],
            shading: { type: ShadingType.SOLID, fill: i%2===0 ? "F4F7FB" : WHITE },
            width: { size: 1800, type: WidthType.DXA },
          }),
          new TableCell({
            children: [new Paragraph({ children: [t(cum, { size: 19, color: GRAY })], alignment: AlignmentType.CENTER })],
            shading: { type: ShadingType.SOLID, fill: i%2===0 ? "F4F7FB" : WHITE },
            width: { size: 1800, type: WidthType.DXA },
          }),
        ]})
      ),
    ]
  }),
);

// ── DOCUMENT ─────────────────────────────────────────────
const doc = new Document({
  styles: {
    default: {
      document: { run: { font: "Arial", size: 22, color: "1A2540" } }
    },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal",
        run: { bold: true, size: 28, color: NAVY, font: "Arial" },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 }
      },
    ]
  },
  numbering: { config: [] },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 },
        margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 }
      }
    },
    children,
  }]
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(`${require("path").resolve(__dirname,"../output/docx")}/AFM_Tool_Intro_Script_KO.docx`, buf);
  console.log("✅ Script DOCX written");
  console.log("Size:", buf.length, "bytes");
});
