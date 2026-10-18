# 과제 7 — 인증/격리 검증 기록 (비밀값 마스킹)

기준: 사용자 실측(2026-10-16~17)과 현재 GitHub 서버 코드의 요청 구조를 구분합니다. **과거에 통과한 검사를 다시 요구하지 않습니다.** 이 파일의 `[REDACTED]`는 실제 비밀값이 아니라 표시용 자리표시자입니다.

## 1. 일반 로그아웃 전후 (사용자 실측)

- 대상: `https://plandosee-web-diary2.vercel.app/api/state`
- 요청 메서드: **GET** (전후 동일).
- 로그인 중: 개인 계정의 `plans` JSON 결과를 확인. 정확한 HTTP 200 캡처는 따로 없으므로 본문 표시 확인으로 기록.
- 일반 로그아웃 후: Chrome Network **HTTP 401 Unauthorized**.
- 반환 본문: `{"error":"authentication_required"}`.
- 증명 범위: 브라우저가 로그아웃한 뒤 보호 API가 자료를 반환하지 않음.

## 2. 이전 쿠키 강제 재사용 (사용자 실측)

- 로그인 전에 저장한 것이 아니라 **로그아웃 전에 보관한 이전** `session_token=[REDACTED]`을 복원.
- **GET /api/state** 요청의 Chrome Network `Request Cookies`에 해당 이름이 실제 포함됨을 확인.
- 로그아웃 후 이전 쿠키 재전송 결과: **HTTP 401 Unauthorized**.
- 값·토큰·헤더 원문: **보관·게시하지 않음**.
- 증명 범위: 해당 과거 쿠키 재전송 요청의 서버 접근 차단. **TTL이나 비밀번호 변경 후 모든 세션 폐기 테스트와 구별**합니다.

## 3. 계정 A와 B의 교차 접근 (2026-10-16 사용자 실측, 중복 실행 불필요)

대상 인터페이스: `/api/ownership-test`와 `/isolation-test.html`. 아래는 **소스에서 확인한 요청 구조**와 **이전 사용자가 확인한 HTTP 결과**를 조합한 재현 표이며, 저장 당시의 전체 HTTP 원본 덤프가 아닙니다.

| 세션 | 요청 구조 (식별자 가림) | 실측 결과 |
| --- | --- | --- |
| A | `GET /api/ownership-test?id=[B_RECORD_ID]` | **404** `{"error":"not_found"}` |
| A | `PATCH /api/ownership-test` JSON `{"id":"[B_RECORD_ID]"}` | **404** `{"error":"not_found"}` |
| A | `DELETE /api/ownership-test` JSON `{"id":"[B_RECORD_ID]"}` | **404** `{"error":"not_found"}` |
| B | `GET /api/ownership-test?id=[A_RECORD_ID]` | **404** `{"error":"not_found"}` |
| B | `PATCH /api/ownership-test` JSON `{"id":"[A_RECORD_ID]"}` | **404** `{"error":"not_found"}` |
| B | `DELETE /api/ownership-test` JSON `{"id":"[A_RECORD_ID]"}` | **404** `{"error":"not_found"}` |

본인 소유 데이터 요청은 **HTTP 200** 및 `verified:true` 확인. 계정 B의 `GET /api/state`에는 `plans: []` 등 빈 배열이 확인됐습니다. 현재 코드에서 **각 조회·변경 SQL에 `WHERE user_id=$...`**와 FORCE RLS가 적용됩니다.

**증거가 아직 부족한 범위:** 양측 거절 직전/직후의 건수 불변 표, 다른 계정 정보로 URL·임의 헤더·본문을 변조한 요청의 개별 실측, A와 B 전체 목록의 양방향 내용 대조. 해당 결과를 기존 테스트 완료처럼 표시하지 않습니다.

## 4. 비밀번호 저장/솔트 (2026-10-17 사용자 실측)

Neon Auth `neon_auth.account`의 `providerId='credential'` 데이터로 읽기 전용 집계.

| 항목 | 실측 집계 |
| --- | --- |
| 당시 credential 계정 | 3 |
| 당시 계정별 저장 문자열 길이 | 161자(각 계정) |
| 패턴 | `^[0-9a-f]{32}:[0-9a-f]{128}$` |
| 당시 서로 다른 솔트 | 3 |
| **같은 시험용 비밀번호를 사용한 서로 다른 계정** | `account_count=2` |
| 저장값 구별 | `distinct_hash_count=2` |
| 솔트 구별 | `distinct_salt_count=2` |

입력 비밀번호 원문·실제 161자 해시 문자열·솔트 원문은 저장소에 싣지 않습니다. 위 집계는 다른 솔트/저장값이 생성됐다는 실측 증거입니다. Better Auth 기본 해시 알고리즘은 **scrypt**이지만 이 집계만으로 관리형 Neon Auth 운영의 내부 설정을 단정하지 않습니다.

## 5. 공개 로그인과 소스 역사

- GitHub 저장소 visibility: **public**(연결된 GitHub API로 확인).
- 프런트 소스: `index.html` + `auth-ui.js`는 자료 다운로드 전에 세션을 검사하도록 작성됨. **최초 시크릿창 표시 결과의 캡처는 별도 필요**.
- 무인증 직접 보호 API: 사용자 실측 위 **GET /api/state → 401**.
- T06 원본: `jennajiminkim/plandosee-web-diary`, 마지막 확인한 `main` 커밋 `644525924bbab27a2384fdcf54f1ba62933617e8`.
- T07 `main`에서 `64452592…`과 비교: GitHub `status=ahead`, `behind_by=0`, `merge_base_commit=64452592…`. **T06 코드 조상 포함 확인**.

## 6. T07-C133 — 사용자 다운로드 JSON 파일 검증 (2026-10-18)

사용자가 운영 사이트의 **전체 데이터 내보내기** 버튼으로 다운로드하여 채팅에 첨부한 `plan-do-see-private-2026-10-18.json`을 파일 파서로 검사했습니다. **개인 내용이 담긴 JSON 원본은 공개 저장소에 업로드하지 않았습니다.**

- `app=plan.do.see`, `format=pds-private-v1`이며 UTF-8 JSON 파싱 **성공**(28,956바이트).
- 플래너/관찰 데이터 **13개 배열 모두 존재**. 집계: `plans=9`, `versions=6`, `tasks=15`, `cells=20`, `logs=19`, `completions=5`, `reflections=2`, `journals=2`, `dailyJournals=1`, `colors=8`, `experiments=1`, `dailyRecords=1`, `ruleChanges=0`. 합계 **89건**(소프트 삭제 이력 포함).
- 관찰 1일차 `2026-10-17`의 측정값 **3건**, 활동 근거 텍스트 존재 확인. 규칙 변경 배열이 비어 있는 것은 아직 변경 실행 전 상태에 부합합니다.
- 계획/할 일/타임로그/한문장/관찰 등 10종의 외래 참조 점검에서 **누락 연결 0건**(다운로드된 표본 범위).
- `password`, `token`, `cookie`, `secret`, `api_key`, `private_key`, `session`을 포함한 **필드 이름 발견 0건**. 원본 값 전수 민감정보 검사나 과거 Git 이력 감사의 대체는 아닙니다.
- **판정: T07-C133 — 개인 기록+5일 관찰을 한 파일로 내보내기 실파일 검증 통과.** 현재 존재하는 기록을 내보낼 수 있다는 의미이며, 실제 5일 완주(C07)까지 의미하지 않습니다.

## 7. T07-C98 · C99 — 중복 가입 및 로그인 오류 메시지 실제 HTTP 검증 (2026-10-18)

사용자가 운영 사이트 Chrome DevTools **Network → Fetch/XHR → Preview/Headers**에서 직접 확인하고, **응답 Preview 스크린샷 3장 + Request URL·Method·Status Code 텍스트**를 제공했습니다. 이메일·비밀번호·쿠키·세션·요청 Payload는 공개 저장소에 싣지 않습니다.

| 검사 | 요청 | 실제 HTTP 상태 | 응답 본문 | 판정 |
| --- | --- | --- | --- | --- |
| A: 기존 계정 이메일로 중복 회원가입 | `POST https://plandosee-web-diary2.vercel.app/api/auth?action=signup` | **400 Bad Request** | `{"error":"가입을 완료할 수 없습니다. 이메일과 입력 정보를 확인해 주세요."}` | **PASS (C98)** |
| B: 기존 계정 이메일 + 잘못된 비밀번호 | `POST https://plandosee-web-diary2.vercel.app/api/auth?action=login` | **401 Unauthorized** | `{"error":"이메일 또는 비밀번호를 확인해 주세요."}` | **PASS (C99, B)** |
| C: 존재하지 않는 이메일 + 잘못된 비밀번호 | `POST https://plandosee-web-diary2.vercel.app/api/auth?action=login` | **401 Unauthorized** | `{"error":"이메일 또는 비밀번호를 확인해 주세요."}` | **PASS (C99, C)** |

- **B와 C의 경로·메서드·HTTP 상태·응답 문구가 완전히 같음**을 사용자가 확인했습니다.
- 운영 Neon `neon_auth."user"` 테이블에 `user_email_key` **UNIQUE(email)** 인덱스가 실제 존재하는 것도 별도로 읽기 전용 확인했습니다. 실제 중복 가입 400 응답과 DB UNIQUE 제약이 함께 중복 가입 방지의 근거입니다.
- 검증 한계: 이 결과는 동일 이메일 중복 가입 1회 및 로그인 실패 2회에 대한 실측입니다. 대소문자 변형/동시 가입 레이스·속도 제한의 전체 동작까지 증명하지는 않습니다.
- **민감정보 처리:** 스크린샷 원본은 대화 첨부로 검토했으며 공개 GitHub에 게시하지 않았습니다. 요청/응답 전문에서 인증 비밀값이나 실제 계정 이메일은 공개하지 않습니다.

## 8. 아직 모아야 할 실제 결과 — 미검증

- **C98 · C99 완료:** 위 7절 실제 HTTP 400/401 및 로그인 오류 동일성 증거 확보. 동일 검사를 반복하지 않음.
- 세션의 **실제 운영 TTL**, 비밀번호 변경 후 과거 세션 무효화.
- 서버 로그·화면·네트워크 전체에서 원문 암호 없음 확인(해시 실측과 별도).
- 목록 전체 양방향 격리/다른 ID 주입/거절 전후 실제 건수 확인.
- 5개의 서로 다른 서울 날짜 실제 실험 기록과 **Day 2 후 Day 3 전** 계획 규칙 변경·사유·시각, 5일 합계 및 평균을 손으로 계산한 표.
- 계정 삭제/자료 동시 삭제 절차. 전체 JSON 내보내기 실파일은 위 6절에서 이미 확인함.

**주의:** 이 파일의 재현용 `[A_RECORD_ID]` / `[B_RECORD_ID]`는 실제 요청을 재전송했다는 뜻이 아닙니다. 시간, URL, 실제 HTTP 값은 사용자가 이전에 확인한 범위로만 기술합니다.
