# 다음 작업자용 폴더 구성 안내

작성일: 2026-07-15  
대상 폴더: `C:\Users\Kate.Park\Desktop\Codex\AI_Reviewer\pdf_english_reviewer_260721`

이 문서는 이 폴더를 처음 넘겨받은 작업자가 프로젝트 구조, 실행 흐름, 주요 수정 지점, 주의해야 할 런타임 데이터를 빠르게 확인할 수 있도록 정리한 인수인계 자료입니다. 사용자용 기능 설명은 `README.md`, 설치와 로컬 실행 조건은 `SETUP_GUIDE.md`, 변경 이력은 `CHANGELOG.md`를 함께 보면 됩니다.

## 0.2 2026-07-21 Chicago Manual of Style pilot 수정본

- 이 폴더는 `pdf_english_reviewer_260721` 수정본입니다.
- `pdf_english_reviewer_260720`의 LanguageTool 비활성화 정책을 유지합니다.
- `config/team_standard/chicago_pilot_rules.yaml`에 Chicago Manual of Style 18판 기반 Team Manual Standard 파일럿 20개 규칙을 추가했습니다.
- `scripts/seed_chicago_pilot_rules.py`는 `--preview`, `--apply`, `--enable-high-confidence`, `--db` 옵션을 제공합니다.
- `--apply --enable-high-confidence` 실행 시 운영 DB 백업 후 8개 high-confidence 규칙은 enabled/approved, 나머지 12개는 disabled/candidate로 UPSERT합니다.
- `app/rules/chicago_pilot.py`와 `app/rules/engine.py`가 신규 rule_key를 matcher registry에 연결합니다.
- Review Results는 Key, Rule, Category, Source, Severity를 표시합니다.

## 0.1 2026-07-20 LanguageTool 비활성화 수정본

- 이 폴더는 `pdf_english_reviewer_260720` 수정본입니다.
- LanguageTool은 기본 비활성화 상태이며 `run_local.bat`에서 `LANGUAGETOOL_ENABLED=0`을 설정합니다.
- UI의 External Review Engines, Engine Status, engine filter에서 LanguageTool 항목을 제거했습니다.
- review profile 기본 엔진 목록에서 `languagetool`을 제거했습니다.
- API 요청에 `use_languagetool=true` 또는 `engines.languagetool=true`가 들어와도 기본 런타임에서는 선택/실행되지 않습니다.
- 기존 LanguageTool helper code와 legacy config 파일은 과거 데이터/복구 가능성을 위해 보존했지만 기본 실행 경로에서는 사용하지 않습니다.

## 0. 2026-07-16 후속 정리 요약

- 운영 DB의 테스트 전용 `TEST_CANDIDATE_ONLY` row를 삭제했습니다.
- `UNIT_SPACE_001`, `STYLE_EG_IE_COMMA_001`, `TM_CAUTION_LABEL_001`은 `data/reviewer.db:team_manual_standard_rules`에서 `enabled=1`, `approval_status='approved'` 상태입니다.
- `config/standards/TeamManual`은 외부 publishing standard discovery/execution에서 제외했습니다. 외부 표준은 Microsoft, IEEE, AMS, NIST만 유지합니다.
- Team Manual legacy YAML/Vale 파일은 삭제하지 않고 migration/provenance source로 보존합니다.
- 중복 issue deduplication은 대표 issue 하나만 남기되 `sources` 배열에 Team Manual Standard와 외부 표준 근거를 보존합니다.
- 후속 정리 보고서는 `interim_reports/TEAM_STANDARD_SOURCE_CLEANUP_REPORT.md`에 있습니다.
- Review 설정은 External Review Engines, Internal Standards, External Publishing Standards로 분리했습니다.
- Custom Review는 선택한 항목만 실행하며 Team Manual Standard를 강제 실행하지 않습니다.
- LanguageTool, Vale, Ollama finding은 자동으로 Team Manual Standard에 반영하지 않고, 사용자가 선택한 external engine issue만 `candidate + disabled`로 수동 저장할 수 있습니다.
- Review 선택/후보 등록 보고서는 `interim_reports/REVIEW_SELECTION_AND_CANDIDATE_IMPORT_REPORT.md`에 있습니다.

## 1. 프로젝트 한 줄 요약

PDF English Reviewer는 기술 매뉴얼 PDF를 로컬 PC에서 열고, PDF 텍스트를 추출한 뒤 LanguageTool, Ollama, Vale, 팀 규칙, 출판 표준, glossary 규칙으로 영어 검토 후보를 생성하는 FastAPI 기반 로컬 웹 애플리케이션입니다.

핵심 전제는 다음과 같습니다.

- 원본 PDF와 검토 데이터는 로컬 폴더의 `data/` 아래에 저장됩니다.
- 외부 클라우드 API를 기본 사용하지 않고, LanguageTool/Ollama/Vale도 로컬 엔진을 전제로 합니다.
- 원본 PDF 문구를 직접 수정하는 도구가 아닙니다. 제안, 상태, 코멘트, CSV/JSON/주석 PDF export를 만드는 리뷰 도구입니다.
- 프론트엔드는 빌드 과정이 없는 정적 HTML/CSS/JS입니다.
- 현재 폴더는 `git status` 기준 Git 저장소로 인식되지 않습니다. 변경 이력 확인이나 commit이 필요하면 먼저 Git 초기화/원격 여부를 확인해야 합니다.

## 2. 먼저 볼 파일

작업 시작 전 아래 순서로 확인하면 전체 흐름을 빠르게 잡을 수 있습니다.

| 파일 | 용도 |
|---|---|
| `README.md` | 사용자 관점 기능, 설치, 엔진 연결, acceptance test |
| `run_local.bat` | Windows 표준 실행 진입점과 환경변수 |
| `requirements.txt` | Python 의존성 |
| `app/main.py` | FastAPI API, DB schema, PDF 처리, 리뷰 실행, export의 중심 |
| `app/static/app_v3.js` | 브라우저 UI 상태 관리와 API 호출 |
| `app/static/index.html` | 화면 구조 |
| `app/static/styles.css` | UI 스타일 |
| `app/preflight.py` | 실행 전 로컬 환경/보안/엔진 점검 |
| `config/team_standard/rules.yaml` | 팀 표준 규칙 |
| `config/standards/*/rules/core.yaml` | 출판 표준별 규칙 |
| `tests/` | 회귀 테스트 |

## 3. 빠른 실행

Windows에서 표준 실행은 루트 폴더에서 다음 파일을 실행합니다.

```powershell
.\run_local.bat
```

수동 실행이 필요하면 다음 명령을 사용합니다.

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

브라우저 접속 주소:

```text
http://127.0.0.1:8000
```

테스트:

```powershell
.\.venv\Scripts\python.exe -m unittest discover tests
```

`pytest`가 없어도 `unittest`로 테스트할 수 있게 구성되어 있습니다. `run_tests.bat`도 테스트 보조 스크립트입니다.

## 4. 최상위 폴더 구조

```text
.
├─ app/                         # FastAPI 백엔드, 리뷰 파이프라인, 정적 프론트엔드
├─ config/                      # 팀 규칙, glossary seed/config, standards, Vale/LanguageTool 설정
├─ data/                        # 런타임 데이터. DB, 업로드 PDF, 렌더 이미지, export, 로그
├─ engines/                     # 로컬 엔진 번들. LanguageTool 6.6 포함
├─ examples/                    # 샘플 export/result 예시
├─ interim_reports/             # 설치/중간 작업 리포트
├─ output/                      # 샘플 PDF와 예시 산출물
├─ reference_sources/           # 스타일/용례 참고 자료
├─ scripts/                     # 실행 보조, preflight, 엔진 시작/동기화, 샘플 생성
├─ tests/                       # unittest 기반 회귀 테스트
├─ tmp/                         # 임시 패치/로그 파일
├─ tools/                       # 로컬 보조 바이너리. 예: Vale
├─ README.md                    # 사용자/운영 안내
├─ SETUP_GUIDE.md               # 설치/오프라인 구성 안내
├─ review_criteria.md           # Ollama/context review 기준
├─ requirements.txt
├─ run_local.bat
└─ run_tests.bat
```

`data/`, `output/`, `tmp/`, `.venv/`, `__pycache__/`는 작업 산출물 또는 런타임 파일이 많습니다. 특히 `data/`는 실제 사용자 문서와 DB가 들어갈 수 있으므로 임의 삭제하지 마십시오.

## 5. 실행 흐름

`run_local.bat` 기준 동작 순서는 다음과 같습니다.

1. 루트 폴더로 이동하고 로컬 실행 환경변수를 설정합니다.
2. `scripts\start_local_engines.ps1`로 LanguageTool 등 로컬 엔진 시작을 시도합니다.
3. `.venv\Scripts\python.exe` 존재와 실행 가능 여부를 확인합니다.
4. `scripts\preflight.py`를 실행해 의존성, 규칙 파일, 엔진 URL, 저장소, 포트, 보안 조건을 점검합니다.
5. 통과하면 `uvicorn app.main:app --host 127.0.0.1 --port 8000`으로 서버를 띄웁니다.
6. `scripts\open_reviewer_chrome.bat`가 브라우저를 열려고 시도합니다.

기본 엔진/보안 환경변수는 `run_local.bat`에 있습니다.

```text
LANGUAGETOOL_URL=http://127.0.0.1:8081/v2/check
OLLAMA_URL=http://127.0.0.1:11434/api/chat
OLLAMA_MODEL=qwen2.5:7b
OLLAMA_NO_CLOUD=1
OLLAMA_HOST=127.0.0.1:11434
REVIEWER_HOST=127.0.0.1
MAX_REVIEW_SECONDS=14400
```

## 6. `app/` 핵심 구조

```text
app/
├─ main.py                     # 가장 큰 핵심 파일
├─ preflight.py                # 실행 전 점검 로직
├─ static/
│  ├─ index.html               # 화면 구조
│  ├─ styles.css               # 스타일
│  └─ app_v3.js                # 프론트엔드 로직
├─ review/                     # 텍스트 추출 후 리뷰 유닛/진단/정규화 보조
├─ rules/                      # YAML rule engine, catalog, dashboard
├─ integrations/               # LanguageTool/Vale wrapper
├─ review_memory/              # 리뷰 메모리 backup/import/export
└─ exports/                    # Excel 등 export 보조
```

### `app/main.py`

가장 중요한 파일입니다. FastAPI 앱 생성, 정적 파일 제공, 보안 미들웨어, SQLite schema와 migration, PDF 업로드/렌더링/텍스트 추출, 리뷰 실행, glossary, issue 상태 변경, export, retention, diagnostics API가 대부분 이 파일에 있습니다.

자주 보게 되는 함수/영역:

| 목적 | 위치/이름 |
|---|---|
| 앱 생성과 정적 파일 mount | `app = FastAPI(...)`, `app.mount("/static", ...)` |
| DB 연결과 schema | `db_connection`, `init_db` |
| 실행 시 초기화 | `startup_event` |
| PDF 업로드 | `upload_document` |
| 페이지 렌더링 | `render_page_on_demand`, `/api/documents/{id}/page/{n}.png` |
| 텍스트 레이어 | `get_page_text_layer` |
| 텍스트 block 추출 | `extract_blocks`, `classify_block_role` |
| 리뷰 실행 | `review_document` |
| LanguageTool | `check_languagetool`, `categorize_languagetool` |
| Basic rules | `check_basic_rules` |
| Ollama context | `request_ollama` |
| Glossary 적용 | `find_preferred_term_issues`, glossary API |
| Issue 저장/수정 | `/api/documents/{id}/issues`, `/api/issues/{id}` |
| Export | `build_csv`, `build_json_export`, `build_annotated_pdf` |
| 엔진 상태 | `get_engine_status`, `get_vale_engine_status`, `get_ollama_engine_status` |
| 진단 | `run_local_diagnostics` |

`app/main.py`는 5,000줄 이상으로 커져 있으므로 큰 기능을 수정할 때는 해당 책임을 `app/review/`, `app/rules/`, `app/integrations/` 쪽으로 분리하는 것이 좋습니다. 단, 기존 테스트가 `app/main.py`의 함수나 API 응답 구조를 직접 기대할 수 있으므로 변경 전 `tests/`를 먼저 확인하십시오.

### `app/static/`

프론트엔드는 별도 번들러 없이 `index.html`, `styles.css`, `app_v3.js`만 사용합니다. 서버를 다시 빌드할 필요 없이 브라우저 새로고침으로 변경을 확인할 수 있습니다.

중요 지점:

- `index.html`: Reviewer, Workspaces, Manual Glossary, Engine Status, Upload, Review Results 화면 구조
- `app_v3.js`: API 호출, PDF viewer, issue card 렌더링, glossary modal, rule dashboard, engine status 갱신
- `styles.css`: 전체 레이아웃, PDF viewer, review panel, modal, dashboard 스타일

주의할 점:

- HTML id/class는 `tests/test_ui_contract.py` 같은 테스트에서 직접 검사될 수 있습니다.
- UI 버튼/필터 이름을 바꾸면 JS selector와 테스트를 같이 확인해야 합니다.
- 프론트엔드 상태는 브라우저 메모리와 `/api/documents/{id}/ui-state` 저장값이 함께 관여합니다.

### `app/preflight.py`

실행 전 조건 점검 모듈입니다. `scripts/preflight.py`가 이 모듈을 호출합니다.

점검 항목:

- Python 버전과 필수 패키지
- 필수 앱 파일/규칙 파일 존재 여부
- LanguageTool/Ollama URL이 로컬 또는 승인된 호스트인지
- Ollama cloud, web search, tool calling 비활성화 여부
- 서버 bind host가 loopback인지
- `data/` 저장소 위치와 포트 상태

보안 또는 실행 허용 조건을 바꿀 때는 `run_local.bat`, `scripts/preflight.py`, `app/preflight.py`를 함께 확인해야 합니다.

## 7. 리뷰 파이프라인 보조 모듈

`app/review/`는 PDF에서 추출한 텍스트를 리뷰 가능한 단위로 만들고, 엔진 결과를 보정하는 보조 모듈입니다.

```text
app/review/
├─ paragraph_reconstruction.py  # PDF line/block을 review unit으로 재구성
├─ sentence_segmentation.py     # 문장 분리와 약어 처리
├─ text_mapping.py              # 텍스트 좌표/검색 텍스트 mapping
├─ offset_mapping.py            # offset mapping 실패 표시
├─ normalization.py             # issue 정규화
├─ pipeline.py                  # 중복 제거 우선순위
├─ evidence.py                  # issue evidence 보강
├─ engine_diagnostics.py        # 엔진별 요청/응답/필터 통계
├─ engine_info.py               # 엔진 카드/상태 정보 구성
└─ profiles.py                  # review profile 로딩/해결
```

특히 `paragraph_reconstruction.py`가 중요합니다. PDF 텍스트는 줄 단위로 잘리는 경우가 많아 `reconstruct_review_blocks(...)`가 이어진 body/callout line을 하나의 review unit으로 합칩니다. 표, 수식, 값, spec 같은 structured role은 일반 문장처럼 grammar/context 엔진에 보내지 않도록 처리하는 흐름이 있으므로, 텍스트 추출 관련 변경 시 role 처리 테스트를 확인해야 합니다.

## 8. Rule engine과 설정 파일

`app/rules/`는 YAML 기반 규칙과 rule dashboard를 담당합니다.

```text
app/rules/
├─ models.py          # TeamRule 모델
├─ loader.py          # YAML load
├─ matchers.py        # regex rule 실행
├─ engine.py          # team/publishing standard rule 실행
├─ catalog.py         # rule inventory 구성
├─ dashboard.py       # finding summary/inventory/findings 응답
├─ builtin_rules.py
├─ team_standard_rules.py
└─ validators.py
```

주요 설정 위치:

```text
config/team_standard/rules.yaml
config/team_standard/glossary.csv
config/team_standard/protected_terms.csv
config/team_standard/abbreviations.txt
config/team_standard/style_profiles.yaml
config/standards/TeamManual/rules/core.yaml
config/standards/Microsoft/rules/core.yaml
config/standards/IEEE/rules/core.yaml
config/standards/AMS/rules/core.yaml
config/standards/NIST/rules/core.yaml
config/vale/.vale.ini
config/vale/styles/TeamManual/
config/languagetool/grammar_custom.xml
config/languagetool/disabled_languagetool_rules.txt
```

규칙을 추가하거나 고칠 때는 다음 테스트를 우선 확인하십시오.

- `tests/test_rules.py`
- `tests/test_team_rules.py`
- `tests/test_publishing_standards.py`
- `tests/test_rule_dashboard_review_memory.py`
- `tests/golden_sentences/*.csv`

## 9. 데이터 저장 구조

`data/`는 런타임 데이터 폴더입니다. 실제 작업 문서가 들어갈 수 있으므로 가장 조심해야 합니다.

```text
data/
├─ reviewer.db                 # 메인 SQLite DB
├─ documents/                   # 업로드된 원본 PDF
├─ renders/                     # 페이지 PNG 렌더 캐시
├─ manual_glossaries/           # 매뉴얼별 glossary SQLite DB
├─ exports/                     # glossary/export 산출물
├─ logs/                        # uvicorn/test/audit 로그
└─ ...
```

메인 DB는 `app/main.py`의 `init_db()`에서 schema를 생성/마이그레이션합니다. 주요 테이블은 다음 계열입니다.

- `documents`: 업로드 문서와 파일 경로
- `issues`: 리뷰 결과
- `dictionary_terms`, `glossary_terms`: 용어/용어집
- `project_settings`, `projects`: 프로젝트 설정
- `document_ui_state`: 마지막 페이지, 줌, view mode 등 UI 상태
- `review_sessions`: 리뷰 실행 이력
- `rule_feedback`, `rule_registry`: rule dashboard/feedback
- `ocr_results`: OCR 결과
- `retention_settings`: 보존 정책

삭제나 정리 작업은 직접 파일을 지우기보다 앱의 deletion/retention API 흐름을 먼저 확인하십시오. 직접 삭제하면 DB와 파일이 불일치할 수 있습니다.

## 10. 로컬 엔진

이 프로젝트는 여러 로컬 엔진을 선택적으로 사용합니다.

| 엔진 | 기본 위치/URL | 역할 |
|---|---|---|
| LanguageTool | `http://127.0.0.1:8081/v2/check` | 문법, 맞춤법, 구두점 |
| Ollama | `http://127.0.0.1:11434/api/chat` | 보수적 문맥/명확성 리뷰 |
| Vale | `tools/vale/vale.exe`, `config/vale/.vale.ini` | 스타일 규칙 |

`run_local.bat`는 `scripts/start_local_engines.ps1`를 호출해 로컬 엔진 시작을 시도합니다. 엔진이 없어도 Part Review 계열의 일부 고정 규칙과 glossary 검사는 동작할 수 있지만, Full Review는 LanguageTool/Ollama 상태와 보안 점검 결과에 영향을 받습니다.

엔진 관련 API:

- `/api/engines/status`
- `/api/engines/vale/status`
- `/api/engines/ollama/status`
- `/api/review-engines/info`
- `/api/review-engines/config`
- `/api/diagnostics`

## 11. 주요 API 영역

전체 라우트는 `app/main.py`에 직접 선언되어 있습니다. 작업자가 자주 보게 될 API 묶음은 다음과 같습니다.

| 영역 | 대표 경로 |
|---|---|
| 헬스체크 | `/api/health` |
| 문서 업로드/목록/조회 | `/api/documents`, `/api/documents/{document_id}` |
| PDF 원본/페이지/텍스트 레이어 | `/api/documents/{document_id}/original.pdf`, `/page/{page_number}.png`, `/text-layer` |
| 리뷰 실행/진행/세션 | `/api/documents/{document_id}/review`, `/review/progress`, `/review-sessions` |
| 이슈 조회/수정/일괄 처리 | `/api/documents/{document_id}/issues`, `/api/issues/{issue_id}` |
| Glossary | `/api/glossary`, `/api/glossary/{term_id}`, `/api/glossary/export.*` |
| 프로젝트 dictionary/settings | `/api/projects/{project_name}/dictionary`, `/settings` |
| Export | `/export.csv`, `/export.json`, `/export-annotated.pdf` |
| Retention/data deletion | `/api/settings/retention`, `/api/retention/*`, `/api/documents/{id}/data/{target}` |
| Rules/dashboard | `/api/rules`, `/api/rule-dashboard/*`, `/api/standards`, `/api/review-profiles` |
| Review memory | `/api/review-memory/*` |
| Engines/diagnostics/audit | `/api/engines/*`, `/api/diagnostics`, `/api/audit` |

## 12. 테스트 안내

전체 테스트:

```powershell
.\.venv\Scripts\python.exe -m unittest discover tests
```

특정 테스트:

```powershell
.\.venv\Scripts\python.exe -m unittest tests.test_rules
.\.venv\Scripts\python.exe -m unittest tests.test_preflight
.\.venv\Scripts\python.exe -m unittest tests.test_security
.\.venv\Scripts\python.exe -m unittest tests.test_ui_contract
```

기능 변경별 우선 테스트:

| 변경 영역 | 우선 테스트 |
|---|---|
| preflight/보안 | `test_preflight.py`, `test_security.py` |
| glossary | `test_glossary.py` |
| rule engine | `test_rules.py`, `test_team_rules.py`, `test_publishing_standards.py` |
| rule dashboard/review memory | `test_rule_dashboard_review_memory.py`, `test_rule_feedback.py` |
| UI id/API contract | `test_ui_contract.py` |
| Vale | `test_vale_integration.py` |
| evidence/diagnostics | `test_issue_evidence.py`, `test_engine_diagnostics.py` |

## 13. 작업 시 주의사항

- `data/` 안의 PDF, DB, 렌더, 로그는 사용자의 실제 작업 결과일 수 있습니다. 정리 요청이 명확하지 않으면 삭제하지 마십시오.
- `engines/languagetool/LanguageTool-6.6/`는 외부 엔진 번들로 파일 수가 매우 많습니다. 일반 기능 수정 때는 건드릴 필요가 없습니다.
- `tools/vale/vale.exe`는 로컬 실행 파일입니다. 업데이트가 필요하면 `scripts/install_vale_local.ps1` 흐름을 먼저 확인하십시오.
- `tmp/`에는 이전 패치 스크립트와 로그가 남아 있습니다. 현재 앱 동작의 필수 소스는 아닐 가능성이 높지만, 삭제 전 사용자 확인이 필요합니다.
- `__pycache__/`와 `.venv/`는 소스가 아닙니다.
- 프론트엔드 파일은 빌드 시스템이 없으므로 변경 즉시 반영되지만, 브라우저 캐시 때문에 강력 새로고침이 필요할 수 있습니다.
- API 응답 필드명과 HTML id는 테스트와 강하게 연결되어 있을 수 있으므로 이름 변경은 신중히 해야 합니다.
- 로컬 보안 정책상 비-loopback client와 비승인 엔진 host는 차단하는 방향으로 설계되어 있습니다. 외부 접속 허용 변경은 보안 요구사항을 먼저 확인해야 합니다.

## 14. 다음 작업자가 추천받는 첫 확인 절차

1. `README.md`의 기능 범위와 실행 조건을 읽습니다.
2. `run_local.bat`에서 현재 환경변수와 실행 순서를 확인합니다.
3. `.\.venv\Scripts\python.exe -m unittest discover tests`로 현재 회귀 상태를 확인합니다.
4. 서버가 필요한 작업이면 `.\run_local.bat`로 실행하고 `http://127.0.0.1:8000`에서 UI를 확인합니다.
5. 기능 수정 전에는 관련 테스트 파일과 `app/main.py`의 해당 API 영역을 먼저 확인합니다.
6. 데이터 정리 또는 초기화가 필요한 경우 `data/`를 직접 지우지 말고 앱의 삭제/retention 흐름을 확인합니다.

## 15. 관련 문서

- `README.md`: 사용자와 운영자용 전체 안내
- `SETUP_GUIDE.md`: 설치/오프라인 dependency 구성
- `CHANGELOG.md`: 변경 이력

## 16. Team Manual Standard 통합 우선 작업

### 16.1 현재 연결 여부에 대한 판단

현재 인수인계 문서에서 확인되는 범위에서는 **Team Manual Standard와 Team Rule Engine이 하나의 저장 공간을 공유하는 구조는 아닙니다.**

- 팀 규칙 저장 위치: `config/team_standard/rules.yaml`
- Team Manual 표준 규칙 저장 위치: `config/standards/TeamManual/rules/core.yaml`
- Team Manual용 Vale 규칙 위치: `config/vale/styles/TeamManual/`
- 실행 계층: `app/rules/engine.py`, `app/rules/loader.py`, `app/rules/matchers.py`

즉, `app/rules/`의 백엔드 실행 계층이 여러 규칙 소스를 공통으로 실행할 가능성은 높지만, 규칙의 원본 데이터는 서로 다른 파일에 분산되어 있습니다. 따라서 현재 구조는 다음과 같이 판단하는 것이 안전합니다.

```text
저장소 연결: 아니요. 단일 원본이 아님.
실행기 연결: 부분적으로 예. 공통 Rule Engine이 여러 소스를 실행할 수 있음.
UI 연결: 별도 기능으로 노출되어 사용자에게 중복 기능처럼 보일 수 있음.
Glossary 연결: 별도 DB/API/Matcher 흐름으로 관리됨.
```

정확한 호출 관계는 실제 프로젝트에서 아래 항목을 검색하여 최종 확인해야 합니다.

```powershell
rg -n "team_standard|TeamManual|rules/core.yaml|load.*rule|find_preferred_term_issues|glossary" app config tests
```

특히 다음 사항을 확인합니다.

1. `config/team_standard/rules.yaml`을 로드하는 함수와 호출 위치
2. `config/standards/TeamManual/rules/core.yaml`을 로드하는 함수와 호출 위치
3. 두 규칙 묶음이 동일한 리뷰 세션에서 동시에 실행되는지
4. 동일 Rule ID 또는 동일 Pattern이 중복 Issue를 생성하는지
5. Vale의 `TeamManual` 스타일이 YAML TeamManual 규칙과 동시에 실행되는지
6. Glossary Matcher가 Full Review 또는 Part Review에서 자동 실행되는지

### 16.2 사용자 의견과 권장 의견 비교

| 구분 | 사용자 의견 | 권장 의견 | 판단 |
|---|---|---|---|
| 사용자 편집 창구 | Team Manual Standard만 수정 가능 | Team Manual Standard만 단일 관리 UI로 제공 | 일치 |
| Team Rule Engine | 비활성화 | UI는 비활성화하고 백엔드 실행기는 유지 | 백엔드 유지가 더 적합 |
| Glossary | 비활성화 | UI와 Matcher를 일시 비활성화하되 기존 데이터는 보존 | 데이터 보존 조건으로 적합 |
| 규칙 저장 | 작성 규칙을 DB로 통합 | DB를 유일한 원본으로 지정 | 일치 |
| 규칙 실행 | DB에 모은 규칙을 실행 | Rule Engine이 DB 규칙을 읽어 실행 | 일치 |
| YAML/Vale | 중복 문제 제거 필요 | 수동 편집 원본에서 제외하고 DB 기반 Adapter 또는 Export 산출물로 전환 | 권장 |

최종 권장 방향은 다음과 같습니다.

> **Team Manual Standard를 유일한 사용자 편집 화면과 Canonical Database로 만들고, Team Rule Engine은 별도 UI 없이 DB의 활성 규칙을 실행하는 백엔드 서비스로 유지합니다. Glossary UI와 Glossary Matcher는 초기 통합 기간 동안 비활성화하지만 기존 데이터와 API 코드는 삭제하지 않습니다.**

Team Rule Engine 자체를 완전히 끄면 DB에 모은 규칙을 실제 검토에 사용할 수 없으므로, 사용자 의견 중 “Team Rule Engine 비활성화”는 **별도 UI와 독립 관리 기능만 비활성화**하는 의미로 적용하는 것이 더 적합합니다.

### 16.3 목표 구조

```text
[사용자 화면]
Team Manual Standard
├─ Writing Rules
├─ Rule Candidates
├─ Validation
├─ Activation Status
└─ Change History

[단일 원본]
data/reviewer.db
└─ team_manual_standard_rules

[백엔드]
Rule Execution Engine
├─ DB Rule Loader
├─ Rule Validator
├─ Regex/Pattern Matcher
├─ Issue Builder
└─ Execution Diagnostics

[일시 비활성화]
├─ Team Rule Engine 별도 UI
├─ Rule Dashboard의 독립 편집 기능
├─ Manual Glossary UI
└─ Glossary Matcher의 자동 리뷰 실행

[레거시 데이터: 삭제 금지]
├─ config/team_standard/rules.yaml
├─ config/standards/TeamManual/rules/core.yaml
├─ config/vale/styles/TeamManual/
└─ 기존 glossary DB/CSV
```

### 16.4 네 가지 구조상 문제와 해결 방식

#### 문제 1. 같은 규칙이 여러 위치에 중복될 수 있음

해결 방식:

- `reviewer.db`의 `team_manual_standard_rules` 테이블을 유일한 원본으로 지정합니다.
- YAML, TeamManual core YAML, Vale TeamManual 규칙을 스캔하는 일회성 Migration을 작성합니다.
- Pattern, Message, Replacement, Category를 정규화하여 중복 후보를 탐지합니다.
- 완전 중복은 하나로 병합하고, 충돌 규칙은 자동 병합하지 않고 Migration Report에 남깁니다.
- Migration 이후 레거시 파일은 읽기 전용 백업으로 유지하며 런타임에서 직접 로드하지 않습니다.

#### 문제 2. 어느 파일이 최종 원본인지 알기 어려움

해결 방식:

- 코드, UI, README에 `reviewer.db`가 Canonical Source임을 명시합니다.
- Team Manual Standard CRUD는 DB만 수정하도록 구성합니다.
- `source_type`, `source_path`, `legacy_rule_id`를 DB에 기록해 이관 출처를 추적합니다.
- 앱 시작 시 Team Manual Standard를 YAML과 Vale에서 직접 로드하는 경로를 차단합니다.

#### 문제 3. 한 규칙을 수정해도 Vale와 YAML 규칙이 다르게 동작할 수 있음

해결 방식:

- 내부 Team Manual 규칙은 DB에서 한 번만 실행합니다.
- `config/vale/styles/TeamManual/`은 초기 통합 단계에서 비활성화합니다.
- Vale는 외부 표준 또는 Vale 전용 규칙에만 사용하도록 범위를 제한합니다.
- 향후 Vale 형식이 필요하면 DB에서 Vale 파일을 생성하는 단방향 Export/Adapter를 사용합니다.
- 생성된 Vale 파일은 편집 원본이 아니라 빌드 산출물로 취급합니다.

#### 문제 4. UI에서 Team Manual Standard와 Team Rule이 별도 항목으로 보임

해결 방식:

- Team Rule Engine 또는 Rule Dashboard의 독립 메뉴를 숨깁니다.
- Manual Glossary 메뉴도 초기 통합 단계에서 숨깁니다.
- 사용자에게는 `Team Manual Standard` 메뉴 하나만 표시합니다.
- Rule Engine은 Engine Status에서 내부 실행 상태만 확인할 수 있게 하고 편집 버튼은 제공하지 않습니다.
- Workspaces의 후보 등록 버튼은 `Add to Team Manual Standard`로 통합합니다.

### 16.5 권장 DB 모델

기존 `rule_registry`를 확장할 수 있는지 먼저 확인하고, 책임과 필드가 맞지 않으면 별도 테이블을 생성합니다.

```sql
CREATE TABLE IF NOT EXISTS team_manual_standard_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_key TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    matcher_type TEXT NOT NULL,
    pattern TEXT NOT NULL,
    replacement TEXT,
    message TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'warning',
    scope TEXT NOT NULL DEFAULT 'team',
    enabled INTEGER NOT NULL DEFAULT 1,
    approval_status TEXT NOT NULL DEFAULT 'approved',
    source_type TEXT NOT NULL DEFAULT 'database',
    source_path TEXT,
    legacy_rule_id TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_by TEXT,
    reviewed_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

최소한 다음 기능을 지원해야 합니다.

- 목록 조회
- 신규 규칙 생성
- 기존 규칙 수정
- 활성화/비활성화
- 규칙 삭제 대신 Archive
- 테스트 문장으로 규칙 검증
- 중복 규칙 검사
- 변경 이력 저장
- 이관 출처 확인

### 16.6 Codex 작업 명령어

아래 명령을 프로젝트 루트에서 Codex에 전달합니다.

```text
현재 프로젝트의 Team Manual Standard, Team Rule Engine, Glossary 구조를 초기 개발 단계에 맞게 통합해줘.

[핵심 결정]
1. 사용자에게 보이는 단일 관리 기능은 "Team Manual Standard"만 유지한다.
2. Team Rule Engine의 별도 UI와 독립 편집 기능은 비활성화한다.
3. Team Rule Engine 백엔드 실행 로직은 삭제하거나 끄지 말고, Team Manual Standard DB의 활성 규칙을 실행하는 내부 엔진으로 유지한다.
4. Manual Glossary UI와 Glossary Matcher의 자동 실행은 일시 비활성화한다.
5. 기존 Glossary DB/CSV/API 코드와 데이터는 삭제하지 말고 향후 통합을 위해 보존한다.
6. 내부 Team Manual 작성 규칙의 유일한 원본은 SQLite reviewer.db로 지정한다.
7. 외부 출판 표준인 Microsoft, IEEE, AMS, NIST의 규칙과 실행 흐름은 이번 작업에서 변경하지 않는다.

[먼저 조사할 내용]
- config/team_standard/rules.yaml의 loader와 실행 호출 위치를 찾는다.
- config/standards/TeamManual/rules/core.yaml의 loader와 실행 호출 위치를 찾는다.
- config/vale/styles/TeamManual/의 실행 여부를 찾는다.
- 위 세 규칙 소스가 같은 Review에서 중복 실행되는지 확인한다.
- Team Rule Engine UI, Rule Dashboard, Manual Glossary UI의 HTML id, JS selector, API 호출 위치를 찾는다.
- 기존 rule_registry 테이블을 Canonical Rule DB로 확장할 수 있는지 검토한다.
- 조사 결과를 코드 수정 전에 interim_reports/TEAM_STANDARD_CONNECTION_AUDIT.md에 작성한다.

[DB 통합]
- reviewer.db를 Team Manual Standard의 Canonical Source로 만든다.
- 기존 rule_registry가 목적에 맞으면 필요한 column과 migration을 추가하고, 맞지 않으면 team_manual_standard_rules 테이블을 생성한다.
- Rule에는 최소한 rule_key, title, description, category, matcher_type, pattern, replacement, message, severity, scope, enabled, approval_status, source_type, source_path, legacy_rule_id, version, created_at, updated_at을 저장한다.
- config/team_standard/rules.yaml, config/standards/TeamManual/rules/core.yaml, config/vale/styles/TeamManual/의 내부 팀 규칙을 읽어 DB로 이관하는 idempotent migration을 작성한다.
- 동일 Rule ID, 동일 Pattern, 동일 Message를 비교하여 중복 후보를 찾는다.
- 완전 중복은 하나만 이관하고, 내용이 충돌하는 규칙은 자동 병합하지 말고 migration report에 기록한다.
- 기존 파일은 삭제하거나 덮어쓰지 말고 backup/legacy source로 보존한다.

[단일 원본 적용]
- Migration이 완료된 뒤 내부 Team Manual 규칙은 DB에서만 로드한다.
- config/team_standard/rules.yaml과 config/standards/TeamManual/rules/core.yaml을 런타임에서 동시에 직접 실행하지 않도록 한다.
- config/vale/styles/TeamManual/은 내부 Team Manual 규칙 실행 경로에서 비활성화한다.
- 향후 Vale 파일이 필요할 경우 DB에서 생성하는 단방향 export/adapter 구조를 위한 TODO와 인터페이스만 남긴다.
- Microsoft, IEEE, AMS, NIST Vale/YAML 규칙은 그대로 유지한다.

[백엔드]
- 기존 Rule Engine의 matcher, validator, issue builder를 재사용한다.
- DBRuleLoader 또는 동등한 책임의 모듈을 추가해 enabled=1, approval_status='approved'인 Team Manual Standard 규칙만 로드한다.
- Review 실행 시 Team Manual Standard 규칙이 정확히 한 번만 실행되도록 한다.
- 생성된 Issue에는 source='Team Manual Standard'와 rule_key를 기록한다.
- 중복 Issue 제거 로직이 Rule ID와 text range를 함께 고려하도록 확인한다.
- Engine Status에는 Team Manual Standard Rule Engine을 내부 엔진으로 표시하되 편집 링크는 제공하지 않는다.

[UI]
- Team Rule Engine, Rule Dashboard 독립 관리 메뉴를 숨기거나 feature flag로 비활성화한다.
- Manual Glossary 메뉴와 Add to Glossary 버튼을 숨기거나 feature flag로 비활성화한다.
- Review Result 및 Workspaces에 노출된 `Ignore to Rule`, `Promote to Rule` 버튼도 초기 개발 단계에서는 숨긴다. 기능과 이벤트 핸들러를 삭제하지 말고 feature flag로만 비활성화하여 향후 다시 활성화할 수 있게 한다.
- Team Manual Standard 메뉴만 유지하고 다음 CRUD를 제공한다.
  1. Rule 목록
  2. Rule 생성
  3. Rule 수정
  4. Enable/Disable
  5. Archive
  6. 테스트 문장 검증
  7. 중복 검사
  8. Migration source 표시
- Workspaces에서 규칙 후보를 저장할 때 버튼 이름을 "Add to Team Manual Standard"로 통일한다.
- 후보는 즉시 활성화하지 말고 approval_status='candidate'로 저장한 뒤 Team Manual Standard 화면에서 검증 및 승인하도록 한다.
- 기존 HTML id와 API contract를 변경해야 하면 tests/test_ui_contract.py도 함께 수정한다.

[기능 플래그]
초기 개발 단계에서 기능을 안전하게 되돌릴 수 있도록 다음과 동등한 설정을 추가한다.
- TEAM_STANDARD_DB_ENABLED=1
- TEAM_RULE_MANAGEMENT_UI_ENABLED=0
- MANUAL_GLOSSARY_UI_ENABLED=0
- MANUAL_GLOSSARY_MATCHER_ENABLED=0
- RULE_PROMOTION_ACTIONS_UI_ENABLED=0
- LEGACY_TEAM_RULE_FILES_ENABLED=0

환경변수가 없을 때도 위 값이 기본값이 되도록 한다. 기존 Glossary 데이터와 레거시 규칙 파일은 절대 삭제하지 않는다.

[API]
- /api/team-manual-standard/rules 목록 조회
- /api/team-manual-standard/rules 생성
- /api/team-manual-standard/rules/{id} 수정
- /api/team-manual-standard/rules/{id}/status 활성화/비활성화/승인/Archive
- /api/team-manual-standard/rules/validate 테스트 문장 검증
- /api/team-manual-standard/migration-report 이관 결과 조회
- 기존 Rule Dashboard 및 Glossary API는 삭제하지 말고 feature disabled 상태를 명확히 반환하거나 내부 호환성을 유지한다.

[테스트]
- YAML Team Rule과 TeamManual core rule이 중복 실행되지 않는 테스트
- TeamManual Vale 규칙이 내부 Team Standard와 동시에 실행되지 않는 테스트
- DB의 enabled/approved rule만 실행되는 테스트
- Rule 수정 후 다음 Review부터 변경 내용이 적용되는 테스트
- candidate rule이 실행되지 않는 테스트
- Team Rule Engine 및 Glossary 메뉴가 숨겨지는 UI contract 테스트
- `Ignore to Rule`, `Promote to Rule` 버튼이 기본 설정에서 렌더링되지 않는 UI contract 테스트
- RULE_PROMOTION_ACTIONS_UI_ENABLED=1일 때 기존 버튼과 이벤트 흐름이 복구되는 테스트
- 기존 Glossary DB와 CSV가 삭제 또는 변경되지 않는 테스트
- Microsoft, IEEE, AMS, NIST 규칙에 회귀가 없는 테스트
- migration을 두 번 실행해도 중복 row가 생기지 않는 테스트
- 전체 unittest 회귀 테스트

[완료 조건]
1. 사용자가 수정할 수 있는 내부 기준 화면은 Team Manual Standard 하나뿐이다.
2. 내부 작성 규칙의 Canonical Source는 reviewer.db 하나뿐이다.
3. Team Rule Engine은 DB 규칙을 실행하는 백엔드로만 동작한다.
4. 같은 내부 규칙이 YAML, TeamManual core YAML, Vale에서 중복 실행되지 않는다.
5. Glossary UI와 자동 Matcher는 비활성화되지만 기존 데이터는 보존된다.
6. `Ignore to Rule`, `Promote to Rule` 버튼은 기본 UI에서 보이지 않지만 관련 코드와 데이터는 보존된다.
7. 외부 표준 규칙의 동작은 바뀌지 않는다.
8. 변경 파일, DB migration, feature flag, 테스트 결과를 interim_reports/TEAM_STANDARD_DB_CONSOLIDATION_REPORT.md에 기록한다.
9. README.md, NEXT_WORKER_FOLDER_OVERVIEW.md, CHANGELOG.md를 새 구조에 맞게 갱신한다.

작업 중 기존 데이터를 삭제하거나 DB를 초기화하지 말고, migration 전 reviewer.db와 관련 config 파일의 백업을 생성해줘. 모든 수정 후 .venv\\Scripts\\python.exe -m unittest discover tests를 실행하고 실패 항목과 조치 결과를 보고서에 남겨줘.
```

### 16.7 구현 순서

한 번에 UI와 실행기를 모두 변경하기보다 다음 순서로 진행하는 것이 안전합니다.

1. 연결 관계 Audit 및 중복 규칙 조사
2. DB Schema와 Migration 구현
3. DB Rule Loader 구현
4. 레거시 TeamManual YAML/Vale 실행 차단
5. Team Manual Standard CRUD UI 구현
6. Team Rule Engine/Glossary UI 비활성화
7. Workspaces 후보 등록 흐름 연결
8. 테스트 및 Migration Report 확인
9. 레거시 파일을 읽기 전용 백업으로 전환

### 16.8 주의사항

- UI만 숨기고 기존 YAML과 Vale 실행을 유지하면 중복 문제는 해결되지 않습니다.
- Team Rule Engine 백엔드까지 비활성화하면 DB 규칙을 실행할 수 없습니다.
- Glossary 테이블과 파일을 삭제하면 향후 Terminology 유형으로 통합하기 어렵습니다.
- DB 이관 전 `reviewer.db`와 모든 팀 규칙 파일을 백업해야 합니다.
- 기존 `rule_registry`가 피드백·통계용 테이블이라면 무리하게 확장하지 말고 별도 Canonical Rule 테이블을 생성합니다.
- Team Manual Standard DB가 안정화된 뒤 Glossary를 `item_type='terminology'` 형태로 통합하는 2단계 작업을 진행하는 것이 적합합니다.

## 17. Rule 승격 버튼 임시 비활성화 및 PDF 콘텐츠 유형 판별 개선

### 17.1 `Ignore to Rule`, `Promote to Rule` 버튼 처리 원칙

현재는 Team Manual Standard DB를 먼저 안정화하는 단계이므로 Review Result 또는 Workspaces에서 규칙을 자동 승격시키는 다음 버튼은 1차적으로 사용자 화면에서 숨깁니다.

```text
Ignore to Rule
Promote to Rule
```

적용 원칙은 다음과 같습니다.

- 버튼 HTML, JavaScript 이벤트 핸들러, API, 기존 데이터 흐름을 삭제하지 않습니다.
- 기본값이 꺼진 feature flag를 통해 렌더링만 막습니다.
- 버튼이 숨겨진 상태에서도 기존 Issue의 Ignore, Accept, Reject 등 일반 검토 기능에는 영향이 없어야 합니다.
- 향후 Team Manual Standard의 검증·승인 흐름이 확정되면 동일한 feature flag를 켜서 복원할 수 있어야 합니다.
- CSS로만 `display:none`을 고정하지 말고, 서버 또는 프론트엔드 설정값을 기준으로 조건부 렌더링합니다.

권장 설정값:

```text
RULE_PROMOTION_ACTIONS_UI_ENABLED=0
```

`0`일 때 두 버튼을 렌더링하지 않고, `1`일 때 기존 기능을 복원합니다.

### 17.2 PDF 렌더링과 텍스트 추출에서 구분이 어려운 이유

PDF는 Word나 HTML처럼 문단, 표, 수식이라는 의미 구조를 반드시 저장하는 형식이 아닙니다. 많은 PDF는 페이지 위 특정 좌표에 문자와 선을 배치하는 방식으로 구성됩니다. 따라서 화면에서는 표와 수식이 명확해 보여도 추출 단계에서는 다음과 같이 나타날 수 있습니다.

```text
화면의 표
→ 서로 독립된 여러 단어와 좌표 조각

화면의 문단
→ 줄 단위 또는 span 단위로 분리된 텍스트 블록

화면의 수식
→ 일반 문자, 특수기호, 위첨자, 아래첨자가 서로 다른 좌표와 폰트로 분리된 조각
```

현재 프로젝트에는 `extract_blocks`, `classify_block_role`, `paragraph_reconstruction.py`가 있어 추출 블록을 분류하고 문단을 재구성하지만, 단일 블록이나 단순 휴리스틱만으로는 표·본문·수식을 안정적으로 구분하기 어렵습니다. 특히 분류가 잘못되면 다음 문제가 발생합니다.

| 오분류 | 발생 가능한 문제 |
|---|---|
| 표를 본문으로 분류 | 서로 다른 셀의 텍스트가 한 문장으로 합쳐져 대량의 문법 오탐 발생 |
| 본문을 표로 분류 | 정상 문장이 Grammar/Context Review에서 제외됨 |
| 수식을 본문으로 분류 | 수식 기호, 변수, 단위, 위첨자를 문법 오류로 판단 |
| 본문 일부를 수식으로 분류 | 실제 문법 오류를 놓침 |
| 표 주석·그림 캡션 혼동 | 본문과 다른 검토 정책이 필요한 텍스트가 잘못 라우팅됨 |

### 17.3 현재 구조의 핵심 한계

1. **PDF 원본에 의미 태그가 없을 수 있음**  
   추출 라이브러리는 대개 텍스트와 좌표를 반환할 뿐, 해당 영역이 표인지 수식인지 보장하지 않습니다.

2. **블록 단위 분류만으로는 부족함**  
   하나의 표가 여러 블록으로 나뉘거나, 하나의 블록 안에 본문과 인라인 수식이 함께 들어갈 수 있습니다.

3. **문단 재구성과 역할 분류의 순서가 충돌할 수 있음**  
   표 셀을 먼저 본문처럼 합치면 이후 단계에서 원래 셀 경계를 복구하기 어렵습니다.

4. **좌표 외 특징이 충분히 활용되지 않을 가능성**  
   폰트, 글자 크기, baseline, 위첨자·아래첨자, 선 도형, 반복 정렬, 열 간격 등을 함께 봐야 합니다.

5. **강제 분류 구조**  
   확신이 낮은 블록도 body/table/formula 중 하나로 강제 지정하면 잘못된 엔진 라우팅이 발생합니다. `unknown`과 confidence가 필요합니다.

6. **Native text와 OCR 결과의 구조 차이**  
   Native PDF 텍스트와 OCR 텍스트를 같은 기준으로 처리하면 좌표 정확도와 블록 경계 품질이 달라 오분류가 증가할 수 있습니다.

### 17.4 권장 판별 구조

한 번의 함수에서 바로 역할을 결정하기보다 다음 단계로 분리하는 것이 적합합니다.

```text
PDF page
  ↓
Character / Span 추출
  ↓
Line 구성
  ↓
Region 구성
  ↓
Layout feature 계산
  ↓
Role scoring
  ↓
body / table / formula / caption / header_footer / unknown
  ↓
Role별 재구성 및 Review Engine 라우팅
```

#### 단계 1. 추출 증거 보존

각 character 또는 span에 최소한 다음 값을 유지합니다.

- 원본 text
- bounding box
- page number와 page size
- font name
- font size
- bold/italic flag
- baseline 또는 y-position
- writing direction
- native extraction/OCR 출처
- 주변 선·사각형 도형 여부

텍스트를 먼저 합친 뒤 원본 정보를 버리면 표와 수식 판별에 필요한 증거를 잃을 수 있으므로, 원본 span 데이터는 최종 Issue mapping까지 보존해야 합니다.

#### 단계 2. 표 후보 탐지

표는 한 가지 조건이 아니라 다음 증거를 조합하여 점수화합니다.

- 세로·가로 ruling line 또는 cell rectangle 존재
- 여러 줄에서 반복되는 x 좌표와 열 경계
- 짧은 텍스트 조각이 일정 간격으로 정렬됨
- 숫자나 단위가 특정 열에 반복됨
- 행 간격과 열 간격이 규칙적임
- 문장 종결부호가 적고 열 단위 정렬성이 높음
- 동일한 행에서 큰 수평 공백이 반복됨

선이 없는 표도 많으므로 ruling line 탐지만으로 판별해서는 안 됩니다. 좌표 정렬과 whitespace 기반 후보 탐지를 함께 사용합니다.

#### 단계 3. 수식 후보 탐지

수식은 다음 특징을 조합합니다.

- 수학 기호 비율이 높음: `=`, `±`, `∑`, `∫`, `√`, `<`, `>`, `≤`, `≥`, `/`, `^`
- 일반 영문 단어보다 단일 문자 변수의 비율이 높음
- baseline 변화가 크고 위첨자·아래첨자가 존재
- 같은 줄 안에서 font size가 빈번히 바뀜
- Greek 문자나 특수 수학 폰트 사용
- 괄호, 숫자, 연산자가 높은 밀도로 존재
- 문장형 종결부호와 일반 동사 구조가 부족함

단, `Set the value to 10 ± 0.5 V.`처럼 본문에 포함된 인라인 수식은 전체 문장을 formula로 분류하지 않습니다. line 또는 span 내부에서 formula segment만 표시할 수 있어야 합니다.

#### 단계 4. 본문 후보 탐지

본문은 다음 특징이 상대적으로 높습니다.

- 비슷한 font와 font size가 여러 줄에 걸쳐 유지됨
- 줄의 시작 x 좌표와 폭이 일정함
- 문장부호와 일반 영어 단어 비율이 높음
- 이전 줄과 다음 줄이 자연스럽게 이어짐
- 열 경계보다 문단 폭을 따라 줄바꿈됨
- 제목·표·수식 후보 점수가 낮음

#### 단계 5. 확률 또는 점수 기반 결정

각 역할에 점수를 계산하고 최고 점수만 저장하지 말고 confidence와 reason code를 함께 남깁니다.

```json
{
  "role": "table",
  "confidence": 0.86,
  "reason_codes": [
    "repeated_column_alignment",
    "short_cell_like_spans",
    "numeric_column_pattern"
  ]
}
```

최고 점수가 임계값보다 낮거나 두 역할의 점수가 비슷하면 `unknown`으로 분류합니다. `unknown`은 문맥 LLM에 무조건 전달하지 말고 보수적인 검사만 적용합니다.

### 17.5 역할별 Review Engine 라우팅

| Role | LanguageTool | Ollama Context | Team Manual Standard | Glossary | 권장 처리 |
|---|---:|---:|---:|---:|---|
| body | 사용 | 사용 | 사용 | 현재 비활성 | 문단·문장 재구성 후 전체 검토 |
| caption/callout | 제한 사용 | 제한 사용 | 사용 | 현재 비활성 | 짧은 문장에 맞는 프로필 적용 |
| table | 기본 제외 | 제외 | 제한 사용 | 현재 비활성 | 단위·대소문자·금지표현 등 셀 안전 규칙만 적용 |
| formula | 제외 | 제외 | 수식 전용 규칙만 | 제외 | 일반 문법 검사 금지 |
| header/footer | 제외 | 제외 | 제한 또는 제외 | 제외 | 페이지 반복 영역 제거 |
| unknown | 보수적 사용 또는 제외 | 제외 | 안전 규칙만 | 현재 비활성 | 진단 로그에 남기고 강제 결합 금지 |

가장 먼저 해결해야 할 문제는 **표 셀 간 텍스트가 하나의 문장으로 합쳐지는 현상**입니다. 이는 오탐 수를 급격하게 증가시키므로 문법 품질 개선보다 먼저 cell boundary 보존을 우선해야 합니다.

### 17.6 단계별 구현 우선순위

#### 1차: 오탐 방지 중심

1. 표 후보 영역에서는 서로 다른 열의 텍스트를 문장으로 합치지 않습니다.
2. 수식 후보는 LanguageTool과 Ollama에서 제외합니다.
3. 분류 확신이 낮으면 `unknown`으로 남깁니다.
4. Issue와 diagnostics에 role, confidence, reason code를 기록합니다.
5. 기존 PDF 좌표 mapping은 유지합니다.

#### 2차: 분류 정확도 개선

1. ruling line과 rectangle 기반 표 탐지
2. x 좌표 clustering을 통한 borderless table 탐지
3. baseline/font 기반 수식 탐지
4. caption, note, callout 세부 분류
5. 페이지 반복 패턴 기반 header/footer 제거

#### 3차: 운영·검증 기능

1. PDF 화면에 role overlay를 표시하는 진단 모드
2. 사용자가 오분류 영역을 수정하는 개발자용 도구
3. 교정 결과를 golden fixture로 저장
4. PDF 유형별 regression test 구축

### 17.7 필요한 테스트 데이터

한두 개 PDF만으로 휴리스틱을 조정하면 다른 매뉴얼에서 회귀가 발생할 가능성이 큽니다. 최소 다음 fixture가 필요합니다.

- 선이 있는 표
- 선이 없는 표
- 셀이 병합된 표
- 숫자와 단위 중심의 specification table
- 긴 일반 문단
- 두 개 열로 구성된 본문
- 독립된 display equation
- 본문 안의 inline equation
- 위첨자·아래첨자가 많은 수식
- 표 아래 주석과 그림 캡션
- Native text PDF
- 스캔/OCR PDF

각 fixture에는 최소한 다음 기대값을 저장합니다.

```text
page
bbox
expected_role
expected_text_group
should_send_to_languagetool
should_send_to_ollama
```

### 17.8 Codex 작업 명령어: PDF 구조 분류 개선

```text
현재 PDF English Reviewer의 PDF 텍스트 추출 과정에서 표, 일반 본문, 수식이 명확히 구분되지 않아 잘못된 문장 결합과 문법 오탐이 발생한다. 기존 좌표 mapping과 리뷰 기능을 유지하면서 layout-aware content classification을 개선해줘.

[핵심 원칙]
1. PDF에는 의미 구조가 없을 수 있으므로 단일 regex나 단일 block 조건으로 body/table/formula를 결정하지 않는다.
2. character/span의 bbox, font, font size, baseline, writing direction, 주변 선 도형 정보를 가능한 범위에서 보존한다.
3. page -> span -> line -> region 순서의 계층 구조를 만든 뒤 region role을 판별한다.
4. role은 body, table, formula, caption, header_footer, unknown을 최소 지원한다.
5. 각 결과에는 confidence와 reason_codes를 기록한다.
6. 확신이 낮은 영역을 억지로 body로 분류하지 말고 unknown으로 유지한다.
7. OCR은 native text가 없거나 품질이 낮을 때만 fallback으로 사용하고, source_type=native|ocr을 기록한다.

[먼저 조사할 내용]
- app/main.py의 extract_blocks, classify_block_role, get_page_text_layer 호출 관계를 확인한다.
- app/review/paragraph_reconstruction.py가 어떤 role을 합치거나 제외하는지 확인한다.
- app/review/text_mapping.py와 offset_mapping.py가 block 병합 후 좌표를 어떻게 유지하는지 확인한다.
- 표 셀 또는 수식 조각이 body paragraph로 합쳐지는 실제 경로를 로그와 테스트로 재현한다.
- 조사 결과를 interim_reports/PDF_CONTENT_CLASSIFICATION_AUDIT.md에 기록한다.

[데이터 구조]
- 기존 block 모델을 깨지 않는 범위에서 LayoutSpan, LayoutLine, LayoutRegion 또는 동등한 내부 모델을 추가한다.
- 각 span/region에는 text, bbox, page_number, font_name, font_size, font_flags, baseline, source_type을 보존한다.
- region에는 role, confidence, reason_codes를 추가한다.
- API 호환성을 위해 기존 필드는 유지하고 새 필드는 optional로 추가한다.

[표 탐지]
- PDF drawing 정보에서 line/rectangle을 읽을 수 있으면 table ruling evidence로 사용한다.
- ruling line이 없는 표를 위해 여러 줄의 repeated x alignment, column gap, short span density, numeric column pattern을 점수화한다.
- 서로 다른 column/cell의 텍스트를 paragraph_reconstruction에서 하나의 문장으로 결합하지 않는다.
- 병합 셀과 multi-line cell은 같은 cell 또는 같은 column 범위 안에서만 재구성한다.
- 표 내부에서 LanguageTool과 Ollama를 기본 실행하지 않는다.

[수식 탐지]
- math symbol density, single-letter variable density, Greek character, baseline variance, superscript/subscript, font-size variance를 조합해 formula score를 계산한다.
- display equation은 formula role로 분류하고 LanguageTool/Ollama에서 제외한다.
- inline equation이 포함된 일반 문장은 전체를 formula로 제외하지 말고 가능하면 formula span만 보호한다.
- 수식에서 일반 띄어쓰기·문법 규칙이 실행되지 않도록 한다.

[본문 탐지]
- font consistency, line width, left alignment, sentence punctuation, lexical word ratio, adjacent-line continuity를 body score에 반영한다.
- 두 개 열 본문을 하나의 문단으로 교차 결합하지 않는다.
- 기존 paragraph reconstruction은 같은 region/column 안에서만 수행한다.

[엔진 라우팅]
- body: LanguageTool, Ollama, Team Manual Standard 실행
- caption/callout: 제한 프로필로 실행
- table: cell-safe Team Manual Standard 규칙만 실행
- formula: 일반 Grammar/Context 실행 금지
- header_footer: 반복 영역 제거 또는 검토 제외
- unknown: Ollama 제외, 안전한 고정 규칙만 실행
- Glossary Matcher는 현재 feature flag 정책에 따라 계속 비활성화한다.

[진단]
- review diagnostics에 role별 region 수, engine 전송 수, 제외 수, confidence 분포를 기록한다.
- 개발 모드에서 page region의 bbox, role, confidence를 JSON으로 조회할 수 있는 diagnostics API를 추가한다.
- 가능하면 PDF viewer에 optional role overlay를 추가하되 기본값은 off로 한다.

[테스트]
- 선이 있는 표와 선이 없는 표가 body로 합쳐지지 않는 테스트
- 두 개 열 본문이 열 사이에서 교차 결합되지 않는 테스트
- display equation이 LanguageTool/Ollama로 전달되지 않는 테스트
- inline equation을 포함한 본문은 본문 검토가 유지되는 테스트
- 표 셀의 bbox와 text mapping이 유지되는 테스트
- unknown confidence fallback 테스트
- native text와 OCR source_type 구분 테스트
- 기존 일반 문단 reconstruction 회귀 테스트
- tests/fixtures 또는 tests/golden_layout에 최소 표, 본문, 수식 샘플을 추가한다.

[완료 조건]
1. 표의 서로 다른 셀 텍스트가 하나의 문장으로 합쳐지지 않는다.
2. display equation은 일반 문법 및 문맥 엔진에서 제외된다.
3. 일반 본문은 기존 수준 이상으로 문단 재구성이 유지된다.
4. 모든 region에 role과 confidence가 기록된다.
5. 낮은 확신의 영역은 unknown으로 안전하게 처리된다.
6. 원본 PDF의 text-to-bbox mapping이 유지된다.
7. 변경 내용과 테스트 결과를 interim_reports/PDF_CONTENT_CLASSIFICATION_IMPLEMENTATION_REPORT.md에 기록한다.

작업 후 .venv\\Scripts\\python.exe -m unittest discover tests를 실행하고 회귀 실패와 수정 결과를 보고서에 남겨줘. OCR을 반복 호출하거나 모든 페이지에 강제 적용하지 말고 native extraction 우선 정책을 유지해줘.
```

### 17.9 종합 권장 방향

현재 단계에서는 두 작업의 우선순위를 다음과 같이 두는 것이 적합합니다.

```text
1. Team Manual Standard DB를 단일 원본으로 안정화
2. Team Rule Engine은 백엔드 실행기로만 유지
3. Glossary 및 Rule 승격 UI 임시 비활성화
4. PDF 표/수식 오분류로 발생하는 대량 오탐 차단
5. 분류 정확도가 안정된 뒤 Rule 승격과 Glossary 통합 재개
```

특히 PDF 분류 개선은 Team Manual Standard 규칙을 많이 추가하기 전에 진행하는 것이 좋습니다. 추출 단계에서 표 셀이나 수식을 본문으로 잘못 구성하면, 정확한 규칙을 작성해도 입력 자체가 잘못되어 오탐이 계속 발생하기 때문입니다.


## 18. 표·본문·수식 분류를 위한 공개 기준 및 로컬 도구 도입안

### 18.1 도입 목적

현재 자체 분류 로직만으로 PDF의 표, 일반 본문, 수식, 캡션, 머리말·꼬리말을 정확하게 구분하기에는 한계가 있습니다. PDF에는 문서의 의미 구조가 저장되지 않고 문자 좌표와 그리기 명령만 남는 경우가 많기 때문입니다.

따라서 처음부터 모든 레이아웃 분석기를 자체 개발하기보다 다음 원칙을 적용합니다.

```text
공개 문서 레이아웃 분류 체계를 내부 표준으로 사용
+
로컬 실행 가능한 레이아웃 분석기를 비교 엔진으로 도입
+
기존 PyMuPDF의 정확한 원문 좌표 및 PDF 하이라이트 기능 유지
```

이 도입안은 현재의 자체 분류 개선안을 대체하지 않습니다. 공개 모델의 분류 결과를 이용해 현재 로직을 검증하고, 필요한 역할 정보만 선택적으로 결합하는 보완 구조입니다.

### 18.2 우선 검토 도구

#### 1순위: Docling / Docling Serve

Docling을 1차 비교 도구로 사용합니다.

주요 활용 목적:

- 페이지 레이아웃 분석
- 본문, 제목, 표, 수식, 그림, 캡션 구분
- 읽기 순서 추정
- 구조화된 JSON 결과 생성
- 영역별 bounding box와 분류 결과 확보
- 로컬 또는 폐쇄망 환경에서 실행

`docling-serve`를 사용할 수 있는 경우 로컬 웹 UI와 REST API를 통해 현재 Reviewer와 독립적으로 먼저 평가합니다.

예상 로컬 접근 형태:

```text
Web UI: http://127.0.0.1:<configured-port>/ui
API documentation: http://127.0.0.1:<configured-port>/docs
```

포트와 실행 명령은 설치한 버전의 공식 문서를 확인하여 설정하고, 외부 네트워크로 bind하지 않습니다.

#### 보조 비교 도구

| 도구 | 주 사용 목적 | 현재 프로젝트에서의 위치 |
|---|---|---|
| Docling | 본문·표·수식·그림·캡션 및 읽기 순서 분석 | 1차 로컬 비교 엔진 |
| Unstructured | Title, NarrativeText, ListItem, Table 등 element 분리 | 분류 결과 교차 검증 |
| GROBID | 논문형 PDF의 섹션·참고문헌·표·그림 구조 분석 | 학술 논문 fixture 비교용 |
| Table Transformer 계열 | 표 영역 및 행·열 구조 인식 | 표 오분류가 계속될 때 선택 적용 |
| Mathpix | 수식 OCR 및 LaTeX 변환 | 보안이 허용된 공개 샘플의 수식 벤치마크용 |
| Adobe/Azure/Google 문서 분석 서비스 | 상용 레이아웃 분석 결과 비교 | 기밀이 없는 샘플의 참고 기준으로만 사용 |

현재 프로젝트는 로컬·오프라인 운영을 전제로 하므로 외부 클라우드 서비스는 운영 엔진으로 연결하지 않습니다. 외부 서비스와 비교가 필요하면 회사 기밀이 없는 공개 샘플 또는 직접 생성한 fixture만 사용합니다.

### 18.3 내부 분류 기준: DocLayNet 계열 역할 체계

자체적으로 임의의 역할 이름을 계속 추가하지 말고, 공개 문서 레이아웃 데이터셋에서 널리 사용하는 분류 개념을 참고해 내부 역할을 통일합니다.

Reviewer에서 우선 사용할 역할:

```text
body_text
section_header
list
Table
formula
figure
caption
footnote
header_footer
unknown
```

구현 시 API와 DB에는 소문자 `table`을 사용하고, 문서 표기 역시 다음 값으로 통일하는 것을 권장합니다.

```text
body_text
section_header
list
table
formula
figure
caption
footnote
header_footer
unknown
```

각 region은 최소한 다음 값을 보유해야 합니다.

```json
{
  "page_number": 1,
  "bbox": [72.0, 110.0, 530.0, 320.0],
  "role": "table",
  "confidence": 0.91,
  "reason_codes": [
    "repeated_column_alignment",
    "numeric_density",
    "docling_table_prediction"
  ],
  "source_type": "native"
}
```

`unknown`은 오류 상태가 아니라 안전한 fallback입니다. 확신이 낮은 영역을 `body_text`로 강제 분류하여 문법 엔진으로 보내는 것보다 자동 검토에서 제외하는 것이 적합합니다.

### 18.4 표 분석 단계 구분

표 분석을 하나의 기능으로 처리하지 않고 다음 단계로 분리합니다.

```text
1. Table Detection
   표가 있는 영역을 찾음

2. Table Structure Recognition
   행, 열, 셀, 병합 셀 구조를 복원함

3. Functional Analysis
   열 제목, 행 제목, 데이터 셀, 단위 셀 역할을 구분함
```

현재 Reviewer의 1차 목표는 표를 완전한 Excel 형태로 변환하는 것이 아닙니다. 우선순위는 다음과 같습니다.

```text
1. 표 영역을 body_text와 분리
2. 서로 다른 셀을 하나의 문장으로 합치지 않음
3. 일반 LanguageTool/Ollama 검토에서 표를 제외
4. 표 전용 Team Manual Standard 규칙만 제한적으로 실행
5. 필요성이 확인된 후에만 행·열·셀 구조 복원 강화
```

### 18.5 권장 혼합 아키텍처

기존 PyMuPDF 추출기를 즉시 제거하지 않습니다. 다음과 같이 역할을 분담합니다.

```text
원본 PDF
   ├─ PyMuPDF
   │    ├─ native text/span 추출
   │    ├─ 문자·단어·line bbox 확보
   │    ├─ drawing/line/rectangle 정보 확보
   │    ├─ PDF viewer text layer
   │    └─ issue highlight 및 annotated PDF 좌표
   │
   └─ Docling
        ├─ page layout 분석
        ├─ body/table/formula/figure/caption 분류
        ├─ reading order 추정
        └─ region-level bbox와 confidence 확보

PyMuPDF 좌표 + Docling region 결과
   ↓
Layout Mapping Layer
   ↓
Reviewer 내부 LayoutRegion
   ↓
paragraph reconstruction 및 engine routing
```

핵심 원칙:

- 원문 텍스트와 최종 PDF 좌표는 PyMuPDF 결과를 기준으로 유지합니다.
- Docling은 영역의 의미 역할과 읽기 순서를 제공하는 보조 분석기로 사용합니다.
- Docling 텍스트를 원문 대신 그대로 저장하지 않습니다.
- 두 결과가 불일치하면 PyMuPDF 원문을 유지하고 role은 `unknown` 또는 낮은 confidence로 처리합니다.
- Docling이 없거나 실행에 실패해도 기존 Reviewer는 자체 분류기로 계속 동작해야 합니다.

### 18.6 엔진 라우팅 기준

| Role | LanguageTool | Ollama | Team Manual Standard | 비고 |
|---|---:|---:|---:|---|
| `body_text` | 적용 | 적용 | 적용 | 일반 문단 재구성 수행 |
| `section_header` | 제한 적용 | 미적용 | 제목 규칙만 적용 | 문장 종결부호 규칙 제외 가능 |
| `list` | 제한 적용 | 선택 적용 | 목록 규칙 적용 | 항목 간 결합 금지 |
| `table` | 미적용 | 미적용 | 셀 안전 규칙만 적용 | 서로 다른 셀 결합 금지 |
| `formula` | 미적용 | 미적용 | 수식 포맷 규칙만 적용 | 수학 기호 보호 |
| `figure` | 미적용 | 미적용 | 미적용 | 내부 텍스트는 별도 판단 |
| `caption` | 제한 적용 | 미적용 | 캡션 규칙 적용 | 짧은 텍스트 프로필 사용 |
| `footnote` | 제한 적용 | 미적용 | 선택 적용 | 본문과 결합 금지 |
| `header_footer` | 미적용 | 미적용 | 미적용 | 반복 영역 제외 |
| `unknown` | 미적용 | 미적용 | 안전 규칙만 적용 | 수동 확인 대상으로 표시 가능 |

Glossary Matcher는 현재 비활성화 정책을 유지합니다.

### 18.7 단계별 도입 절차

#### Phase 0: 분류 기준 및 fixture 준비

- 실제 사내 매뉴얼에서 기밀을 제거한 샘플 또는 직접 생성한 PDF fixture를 준비합니다.
- 표, 본문, 수식, 캡션, 2단 본문, 머리말·꼬리말을 포함해야 합니다.
- 각 fixture에 정답 bbox와 role을 사람이 직접 기록합니다.
- 최소 20개 문서 또는 100페이지 이상의 비교 세트를 권장합니다.

#### Phase 1: Docling 독립 평가

- Reviewer 코드에 바로 연결하지 않습니다.
- 별도 스크립트 또는 로컬 Docling Serve에서 fixture를 실행합니다.
- Docling 결과를 JSON으로 저장합니다.
- 현재 자체 분류 결과와 page/region 단위로 비교합니다.

비교 지표:

```text
- body/table/formula role 정확도
- 표 셀이 body 문장으로 병합된 횟수
- display equation이 body로 분류된 횟수
- 두 개 열의 읽기 순서 오류 횟수
- caption과 본문의 잘못된 결합 횟수
- unknown 비율
- 페이지당 처리 시간
- 문서당 메모리 사용량
```

#### Phase 2: Shadow Mode 통합

Docling 결과를 실제 리뷰에 사용하지 않고 진단 데이터로만 저장합니다.

```text
REVIEWER_LAYOUT_ENGINE=legacy
DOCLING_SHADOW_MODE=1
```

Shadow Mode에서 다음을 비교합니다.

- `legacy_role`
- `docling_role`
- `final_role`
- confidence
- disagreement reason

이 단계에서는 기존 리뷰 결과가 바뀌면 안 됩니다.

#### Phase 3: Hybrid Mode 적용

검증 결과가 기준을 충족하면 다음 우선순위로 final role을 결정합니다.

```text
1. 명확한 PDF drawing 기반 table evidence
2. 높은 confidence의 Docling role
3. 기존 자체 layout score
4. unknown fallback
```

예시:

```text
DOCLING_MIN_CONFIDENCE=0.80
REVIEWER_LAYOUT_ENGINE=hybrid
```

#### Phase 4: 선택적 고도화

- 표 구조 인식이 실제 작업에 필요할 때만 Table Transformer 계열을 추가합니다.
- 수식을 LaTeX로 변환할 필요가 확인된 경우에만 수식 전용 엔진을 검토합니다.
- 모든 페이지에 OCR이나 추가 모델을 중복 실행하지 않습니다.

### 18.8 비교 결과 저장 및 진단 화면

다음 내부 구조를 추가하는 것을 권장합니다.

```text
data/layout_analysis/
├─ <document_id>/
│  ├─ legacy_regions.json
│  ├─ docling_regions.json
│  ├─ mapped_regions.json
│  └─ comparison.json
```

진단 API 예시:

```text
GET /api/documents/{document_id}/layout/regions
GET /api/documents/{document_id}/layout/comparison
POST /api/documents/{document_id}/layout/analyze
```

개발 모드의 PDF viewer에는 optional overlay를 제공합니다.

```text
[ ] Show layout regions
[ ] Show role labels
[ ] Show confidence
[ ] Show legacy/Docling disagreements
```

기본값은 모두 off로 유지합니다.

### 18.9 평가 기준

다음 지표를 문서별, 페이지별, role별로 계산합니다.

| 지표 | 설명 |
|---|---|
| Role Precision | 특정 role로 분류한 영역 중 실제 정답 비율 |
| Role Recall | 실제 해당 role 영역을 찾아낸 비율 |
| Region IoU | 정답 bbox와 예측 bbox의 겹침 정도 |
| Reading Order Error | 잘못된 문장 순서 또는 column 교차 횟수 |
| Cross-cell Merge Error | 서로 다른 표 셀이 한 문장으로 합쳐진 횟수 |
| Formula Leakage | formula가 일반 문법 엔진으로 전달된 횟수 |
| Body Review Retention | 정상 본문이 기존과 동일하게 검토된 비율 |
| Processing Time | 페이지·문서당 처리 시간 |

초기 적용 권장 기준:

```text
- Cross-cell Merge Error: 기존 대비 80% 이상 감소
- Formula Leakage: display equation 기준 95% 이상 차단
- Body Review Retention: 기존 정상 본문의 95% 이상 유지
- Reading Order Error: 기존 대비 감소
- 처리 실패 시 legacy fallback 성공률: 100%
```

정확도 수치는 실제 fixture 결과에 따라 조정합니다. 단순 전체 정확도만 사용하지 말고 표·수식 오분류와 정상 본문 손실을 별도로 평가해야 합니다.

### 18.10 Codex 작업 명령어: Docling 비교 및 Hybrid Layout 도입

```text
현재 PDF English Reviewer의 표, 본문, 수식 분류 정확도를 개선하기 위해 DocLayNet 계열 role taxonomy와 로컬 Docling 분석 결과를 도입해줘. 기존 PyMuPDF 기반 원문 추출, PDF text layer, issue bbox, annotated PDF 기능은 유지해야 하며 Docling으로 전면 교체하지 않는다.

[목표 구조]
- PyMuPDF: 원문 text/span/bbox, drawing 정보, PDF viewer 및 highlight 좌표의 source of truth
- Docling: body_text, section_header, list, table, formula, figure, caption, footnote, header_footer의 region role과 reading order 보조 분석
- Layout Mapping Layer: Docling region과 PyMuPDF span을 bbox overlap으로 연결
- Reviewer LayoutRegion: 최종 role, confidence, reason_codes, source_type, legacy/docling evidence 저장

[보안 및 실행 원칙]
1. Docling은 로컬 PC에서만 실행한다.
2. 외부 API 또는 외부 파일 업로드 기능을 추가하지 않는다.
3. host는 127.0.0.1로 제한한다.
4. Docling 미설치, timeout, model load 실패 시 기존 legacy 분류기로 자동 fallback한다.
5. 원본 PDF와 추출 텍스트를 Docling 외부로 전송하지 않는다.
6. 모델 다운로드가 필요한 경우 설치 단계에서만 명시적으로 수행하고, 런타임에는 offline 실행 가능 여부를 preflight에서 확인한다.

[먼저 수행할 Audit]
- app/main.py의 extract_blocks, classify_block_role, get_page_text_layer 흐름을 조사한다.
- app/review/paragraph_reconstruction.py와 text_mapping.py가 role과 bbox를 어떻게 사용하는지 확인한다.
- config 및 환경변수에 현재 layout engine 설정이 있는지 확인한다.
- 현재 표 셀 병합, 수식 body 오분류, 2단 본문 reading order 오류를 fixture로 재현한다.
- 조사 결과를 interim_reports/DOCLING_LAYOUT_INTEGRATION_AUDIT.md에 기록한다.

[내부 Role 표준]
다음 role을 단일 enum 또는 상수 집합으로 정의한다.
- body_text
- section_header
- list
- table
- formula
- figure
- caption
- footnote
- header_footer
- unknown

기존 role 이름이 있으면 migration mapping을 만들고 API 호환성을 유지한다.

[Phase 1: 독립 비교 도구]
- scripts/analyze_layout_docling.py 또는 동등한 비교 스크립트를 추가한다.
- 입력 PDF를 받아 Docling JSON과 정규화된 region JSON을 data/layout_analysis/<document_id>/ 아래 저장한다.
- Reviewer DB 또는 실제 issue 생성에는 영향을 주지 않는다.
- Docling 모델의 원본 output과 Reviewer normalized output을 모두 보존한다.

[Phase 2: Shadow Mode]
- DOCLING_SHADOW_MODE=0을 기본값으로 하는 feature flag를 추가한다.
- 활성화 시 legacy 분류와 Docling 분류를 모두 실행하지만 final role은 legacy를 사용한다.
- legacy_role, docling_role, docling_confidence, disagreement_reason을 diagnostics에 기록한다.
- 기존 Review 결과와 API contract가 변경되지 않도록 한다.

[Phase 3: Hybrid Mode]
- REVIEWER_LAYOUT_ENGINE=legacy|hybrid 설정을 추가하고 기본값은 legacy로 둔다.
- hybrid일 때만 Docling role을 final role 결정에 사용한다.
- 높은 confidence의 Docling 예측, PDF drawing evidence, 기존 자체 score를 조합한다.
- DOCLING_MIN_CONFIDENCE 기본값은 0.80으로 하되 config에서 변경 가능하게 한다.
- 낮은 confidence 또는 mapping 실패 영역은 unknown으로 처리한다.

[Mapping]
- Docling region bbox와 PyMuPDF span bbox의 intersection-over-area 또는 IoU를 사용해 연결한다.
- 한 span이 여러 region에 걸치면 overlap, reading order, containment를 종합해 결정한다.
- 원문 text는 PyMuPDF 값을 유지한다.
- 좌표 단위, page size, rotation, crop box 차이를 정규화한다.
- mapping 실패 시 원문 span을 잃지 말고 legacy region 또는 unknown으로 보존한다.

[표 처리]
- table region 내부 span은 서로 다른 cell 또는 column 사이에서 paragraph로 합치지 않는다.
- 초기 단계에서는 table detection을 우선하며 완전한 셀 구조 복원은 선택 기능으로 둔다.
- table은 LanguageTool과 Ollama에서 제외한다.
- Team Manual Standard 중 table_safe=true인 규칙만 실행할 수 있도록 확장 가능 구조를 만든다.

[수식 처리]
- formula region은 LanguageTool과 Ollama에서 제외한다.
- inline formula가 body_text 안에 포함되면 해당 span만 protected range로 표시하고 주변 문장 검토는 유지한다.
- 수식 전용 변환 또는 OCR 엔진은 이번 작업 범위에 포함하지 않는다.

[엔진 라우팅]
- body_text: LanguageTool + Ollama + Team Manual Standard
- section_header: 제한 LanguageTool + 제목 규칙
- list: 제한 LanguageTool + 목록 규칙
- table: table-safe Team Manual Standard만
- formula: 수식 포맷 규칙만
- caption: 제한 프로필 + 캡션 규칙
- header_footer, figure: 일반 리뷰 제외
- unknown: Ollama 제외, 안전 규칙만
- Glossary Matcher는 기존 비활성화 상태를 유지한다.

[진단 UI/API]
- GET /api/documents/{id}/layout/regions
- GET /api/documents/{id}/layout/comparison
- 필요하면 POST /api/documents/{id}/layout/analyze를 개발 모드에서만 제공한다.
- PDF viewer에 Show layout regions overlay를 optional로 추가하고 기본 off로 둔다.
- role, confidence, legacy/docling disagreement를 확인할 수 있게 한다.

[테스트 Fixture]
- 선이 있는 표
- 선이 없는 표
- 병합 셀 표
- specification table
- 한 개 열 일반 본문
- 두 개 열 일반 본문
- display equation
- inline equation 포함 문단
- figure caption과 table caption
- 반복 header/footer
- native text PDF
- OCR fallback PDF

각 fixture에 page, bbox, expected_role, expected_reading_order, engine routing 기대값을 저장한다.

[평가 지표]
- role precision/recall
- bbox IoU
- cross-cell merge error
- formula leakage
- reading order error
- body review retention
- 페이지당 처리 시간
- fallback 성공률

[완료 조건]
1. Docling이 설치되지 않은 환경에서 기존 Reviewer가 정상 실행된다.
2. Shadow Mode에서 실제 review 결과는 변경되지 않는다.
3. Hybrid Mode에서 표 셀의 교차 병합이 기존 대비 감소한다.
4. display equation이 LanguageTool/Ollama로 전달되지 않는다.
5. 정상 본문 검토가 회귀하지 않는다.
6. 모든 region에 final role, confidence, reason_codes가 저장된다.
7. 원문 text와 PDF bbox mapping이 유지된다.
8. 외부 네트워크 전송이 없다.
9. 테스트 결과와 정확도 비교를 interim_reports/DOCLING_LAYOUT_INTEGRATION_REPORT.md에 기록한다.

작업 완료 후 .venv\\Scripts\\python.exe -m unittest discover tests를 실행하고 결과를 보고해줘. Docling 의존성 때문에 기존 필수 설치가 무거워지지 않도록 optional dependency와 feature flag로 구현해줘.
```

### 18.11 최종 권장 판단

현재 단계에서 가장 적합한 방향은 다음과 같습니다.

```text
내부 기준: DocLayNet 계열 role taxonomy
1차 원문·좌표 엔진: PyMuPDF
1차 레이아웃 비교 엔진: 로컬 Docling
실제 적용 방식: Shadow Mode 검증 후 Hybrid Mode
실패 시 처리: legacy classifier 자동 fallback
외부 클라우드 도구: 공개 fixture의 벤치마크 용도로만 사용
```

Docling의 결과를 즉시 최종 정답으로 사용하지 말고 실제 팀 매뉴얼 fixture로 검증해야 합니다. 특히 표와 수식의 자동 제외율뿐 아니라 정상 본문이 검토 대상에서 빠지는 비율도 함께 확인해야 합니다.

도입 우선순위는 다음과 같이 수정합니다.

```text
1. Team Manual Standard DB를 단일 원본으로 안정화
2. Team Rule Engine은 백엔드 실행기로만 유지
3. Glossary 및 Rule 승격 UI 임시 비활성화
4. PDF layout fixture와 내부 role taxonomy 확정
5. Docling 독립 평가 및 Shadow Mode 도입
6. 표·수식 오분류 차단 효과를 확인한 뒤 Hybrid Mode 활성화
7. 분류 정확도가 안정된 후 Rule 승격과 Glossary 통합 기능 재개
```

## 19. Chicago Pilot Batch 2 반영 상태 (2026-07-21)

- Batch 2 신규 Team Manual Standard 규칙 20개를 추가했다.
- 영역별 구성은 punctuation 5개, numbers_abbreviations 5개, hyphenation_terminology 5개, grammar 5개다.
- 공식 CMOS 18판 목차, What's New, Style Q&A로 검증한 절 번호와 선정 점수는 `docs/chicago_rule_research_batch2.md`에 기록했다.
- `scripts/seed_chicago_pilot_rules.py --batch 2 --apply --enable-high-confidence --report`로 Batch 2만 DB에 추가한다.
- Batch 2 low-risk 14개는 enabled/approved, medium-risk 6개는 candidate/disabled 상태로 운용한다.
- `LANGUAGETOOL_ENABLED=0` 및 숨김 UI feature flag 정책은 변경하지 않는다.
