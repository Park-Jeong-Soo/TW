# PDF English Reviewer 인수인계

작성일: 2026-10-02  
기준: Git `main`의 `756f45a` (`origin/main`에 푸시 완료)

## 지금 작업할 대상

현재 웹 미리보기는 `pdf_english_reviewer/`에 있다. 비교용 이전 서버 버전은 `pdf_english_reviewer_260810/`에 있다. PDF 내보내기 기능을 고칠 때 두 폴더를 혼동하지 않는 것이 중요하다.

| 파일 | 역할 |
|---|---|
| `index.html` | 화면과 스크립트 로딩 순서. `page_layout.js`, `pdf_search.js`, `app_v3.js`, `vendor/wink-bundle.min.js`, `demo_v4.js`를 차례로 로드한다. |
| `demo_v4.js` | **현재 미리보기의 주 작업 파일.** 업로드 가로채기, PDF 표시, 규칙/POS/Vale 검사, 제안 상태·코멘트 저장, PDF 내보내기를 처리한다. |
| `vendor/wink-bundle.min.js` | 브라우저용 wink NLP와 영어 모델. `window.WinkBundle.winkNLP` 및 `.model`을 제공한다. |
| `vendor/LICENSES.txt` | Wink 번들 관련 라이선스. |
| `app_v3.js`, `styles.css`, `page_layout.js`, `pdf_search.js` | 기존 UI와 스타일, PDF 페이지 배치·검색 보조 코드. 앞의 네 파일만으로 페이지 전체가 동작하는 구성은 아니다. |
| `demo.js` | 이전 미리보기 구현. `index.html`에서는 로드하지 않는다. 새 기능은 `demo_v4.js`에 반영해야 한다. |
| `demo.test.cjs`, `page_layout.test.cjs`, `pdf_search.test.cjs` | Node 기반 회귀 검사. |

`index.html`의 `/api/*` 응답 스텁과 `demo_v4.js`의 업로드/클릭 이벤트 가로채기가 기존 `app_v3.js` UI를 브라우저 미리보기로 전환한다. 따라서 `app_v3.js`의 서버 API 흐름을 보고 현재 미리보기 동작으로 오인하지 말 것.

## Export PDF Report: 현재 동작과 코드 위치

1. 제안 카드에서 **Accept**를 누르고 필요하면 `Reviewer comment`를 입력한다. 상태와 코멘트는 해당 workspace의 `localStorage`에 저장된다. PDF 원본은 브라우저 `IndexedDB`에 보관된다. 관련 함수: `findingKey`, `restoreReviewDecisions`, `saveReviewDecisions` (`demo_v4.js` 약 538~568행), 제안 이벤트 처리(약 1520행).
2. `setupExportButton`(약 1619행)이 `download-pdf-btn`을 **Export PDF Report**로 바꾸고 `exportReport`를 연결한다.
3. `exportReport`(약 1629행)는 `status === "accepted"`인 제안만 골라, PDF.js가 보유한 **원본 PDF 바이트**를 PDF-lib로 열고 브라우저에서 새 파일을 다운로드한다. 파일명은 `<원본이름>_annotated_review.pdf`이다. 수락된 제안이 없으면 알림을 띄운다.
4. `addHighlightComment`(약 1662행)는 제안 위치에 PDF `Highlight` 주석을 만든다. 여러 줄에 걸친 제안은 `bboxes`의 각 줄을 `QuadPoints`에 기록한다. 주석 내용은 `Original`, `Suggestion`, `Explanation`, `Reviewer comment`이며 제목에 `[accepted]`를 넣는다. 원문 문구는 바꾸지 않고, 별도 suggestion 목록 PDF도 만들지 않는다.

이전 서버 버전은 `pdf_english_reviewer_260810/app/static/app_v3.js` 약 2134행에서 `/api/documents/{id}/export-annotated.pdf`를 열고, `app/main.py` 약 2665행 `build_annotated_pdf`가 PyMuPDF로 주석 PDF를 만든다. **현재 미리보기는 서버 API를 호출하지 않고 PDF-lib로 브라우저에서 생성한다.** 두 구현은 생성 위치와 라이브러리가 다르지만, 수락한 제안을 원본 PDF 위치의 하이라이트 코멘트로 전달한다는 요구는 같다.

## v4에서 유지해야 할 기능

- 업로드 PDF의 전체 페이지를 검사한다. PDF.js 텍스트와 페이지 배치를 이용한 기본/Chicago 규칙을 포함한다.
- Wink 기반 품사 규칙(`PosRules`), 문단 재구성, 여러 줄에 걸친 위치 표시를 유지한다.
- `window.VALE_API_URL`이 설정된 경우에만 Vale 검사를 시도한다. 기본적으로 별도 Vale 서버가 필요한 기능이다.
- PDF 원본은 IndexedDB, workspace 메타데이터·규칙·제안 결정은 localStorage에 저장한다. 브라우저 저장소를 지우면 이 데이터도 사라진다.
- CDN에서 PDF.js(표시/텍스트 추출)와 PDF-lib(내보내기)를 불러온다. Wink 번들은 저장소에 포함되어 있다. 완전한 오프라인 실행을 목표로 한다면 이 CDN 의존성을 별도 처리해야 한다.

## 빠른 검증

저장소 루트에서 실행:

```powershell
node --check pdf_english_reviewer/demo_v4.js
node pdf_english_reviewer/demo.test.cjs
node pdf_english_reviewer/page_layout.test.cjs
node pdf_english_reviewer/pdf_search.test.cjs
git diff --check
```

`756f45a` 반영 뒤 위의 Node 테스트 세 가지는 통과했다. `demo.test.cjs`는 실제 저장된 Wink 번들을 로드하고 POS 규칙, 제안 상태 복원, 수락 항목만 내보내는 흐름, PDF 주석 내용 및 여러 줄 좌표를 검사한다. **실제 브라우저에서 PDF를 내려받아 Adobe Acrobat의 코멘트 패널로 확인하는 통합 검증은 아직 수행하지 않았다.** 다음 작업 시작 시 작은 테스트 PDF를 업로드하고 한 제안을 수락해 내보낸 뒤, Acrobat에서 하이라이트 위치와 네 가지 코멘트 필드를 확인하면 된다. CDN에 접근 가능한 환경에서 실행할 것.

## Git 및 작업 폴더 상태

마지막 기능 커밋은 `756f45a Add v4 preview entry and local Wink bundle`이며 `origin/main`에 푸시했다. 원격에서 올라온 실제 `demo_v4.js`와 Wink 번들을 보존하면서 기존 수락 상태/코멘트 내보내기 기능을 포팅했다. `pdf_english_reviewer_260810/data/`, `interim_reports/`, `output/`은 당시 미추적 로컬 디렉터리로, 커밋에 포함하지 않았다. 다음 커밋 전 `git status --short`로 변경 범위를 다시 확인할 것.
