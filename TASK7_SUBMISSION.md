# 과제 7 제출용 인증 구현 설명서 — plan.do.see

> 업데이트: 2026-10-22 (Asia/Seoul). **실측 완료와 아직 필요한 증거를 구분**합니다.
> 검사 계정의 이메일·비밀번호·원본 쿠키·세션 토큰·해시 전체·비밀키는 이 문서에 기재하지 않습니다.
> 이 문서는 제출 전 점검본입니다. 완료되지 않은 5일 관찰·계정 삭제를 완료로 제출하지 마세요.

## 제출 주소

- 결과물: https://plandosee-web-diary2.vercel.app/
- 소스: https://github.com/jennajiminkim/plandosee-web-diary2
- 잠긴 5일 관찰: https://plandosee-web-diary2.vercel.app/experiment.html
- 마스킹된 검증 기록: [evidence/task7-auth-verification.md](evidence/task7-auth-verification.md)
- **2026-10-18 추가 감사:** [GitHub 전체 확인 브랜치 비밀정보 패턴 검사 · Better Auth/Neon 해시 근거 · 7건 마스킹 HTTP 요약](evidence/task7-secret-history-hash-and-http-audit.md) — 실제 비밀값 비공개, 검사 한계 명시.

## ① 무엇으로 붙였나

**관리형 인증 서비스: Neon Auth (Better Auth 기반)**를 선택했습니다. 프로젝트 선언 버전은 `@neondatabase/auth 0.6.0-beta`이며 `pg ^8.13.1`, `@neondatabase/serverless ^1.0.0`을 사용합니다([package.json](package.json)). 내부 Neon Auth 관리형 서버의 개별 설치 버전은 이 저장소에서 알 수 없습니다.

비밀번호 저장 방식은 Better Auth의 **기본 scrypt**와 일치하는 형식으로 관찰됐습니다. **scrypt를 사용하는 이유는 메모리 비용이 드는 비밀번호 키 유도 알고리즘으로 빠른 비밀번호 추측을 어렵게 만들기 위해서**입니다. Better Auth 공식 문서에서 기본값은 scrypt라고 명시하지만, 관리형 Neon Auth가 실제로 커스텀 없이 동일한 알고리즘을 실행하는지 직접 확인한 것은 아닙니다. **저장된 모습(원문 비공개):** `[서로 다른 32자리 16진수 솔트]:[128자리 16진수 해시]` 형식, 총 161자. 입력한 비밀번호 문장이 저장 필드에 그대로 나타나지 않았습니다. 관련 참고: https://better-auth.com/docs/reference/security

사용자 인증에는 **HttpOnly·Secure·SameSite=Lax 쿠키의 서버 측 세션**을 이용합니다. 인증되지 않은 요청은 기록을 읽을 수 없습니다.

## ② 왜 골랐나

자체 비밀번호 해시·세션 보관·쿠키 서명·로그아웃 무효화를 직접 설계하는 위험을 줄이고, 기존 다이어리 서버에서 사용자별 자료 격리에 집중하기 위해서입니다.

검토하고 선택하지 않은 방법은 **직접 bcrypt/argon2 서버를 작성하는 방식**입니다. 비밀번호 재설정과 무차별 대입·세션 폐기의 보안 책임까지 추가되어 기간과 위험이 커지므로 사용하지 않았습니다. 과제 6의 무로그인 자료 API를 유지하는 방식도 개인정보 분리 요건과 맞지 않습니다.

## ③ 어디를 어떻게 고쳤나

| 흐름 | 소스 | 서버 동작 |
| --- | --- | --- |
| 첫 화면/회원가입 | [index.html](index.html), [auth-ui.js](auth-ui.js), [api/auth.js](api/auth.js) | `POST /api/auth?action=signup`을 Neon Auth로 전달 |
| 로그인 | [auth-ui.js](auth-ui.js), [api/auth.js](api/auth.js) | `POST /api/auth?action=login`, 세션 쿠키 발급 |
| 세션 확인 | [api/auth.js](api/auth.js), [api/db.js](api/db.js) | `GET /api/auth?action=session`, 서버가 검증한 ID만 사용 |
| 로그아웃 | [auth-ui.js](auth-ui.js), [api/auth.js](api/auth.js) | `POST /api/auth?action=logout`, 로그아웃 뒤 세션 재확인 |
| 자료 조회 | [api/state.js](api/state.js), [api/db.js](api/db.js) | `GET /api/state` 사용자별 DB 조회, 무인증 401 |
| 자료 추가/수정/삭제 | [api/actions.js](api/actions.js), [api/state.js](api/state.js) | SQL 계정 조건 + 서버 트랜잭션 + FORCE RLS |
| 강제 접근 검사 | [api/ownership-test.js](api/ownership-test.js) | 양방향 타인 ID 읽기/수정/삭제 요청에 404 |
| 백업 | [api/export.js](api/export.js) | 계정별 플래너, 날짜별 카드, 5일 관찰, 규칙 변경을 한 JSON에 포함 |
| 5일 관찰 | [api/experiment.js](api/experiment.js), [experiment-ui.js](experiment-ui.js) | 실제 서울 날짜만 입력, Day 2 뒤 계획 규칙 변경, 5일 합계/평균 |

DB 접근은 `api/db.js`에서 로그인한 ID를 읽고 `SET LOCAL ROLE pds_runtime` 및 트랜잭션 한정 `app.user_id`를 설정한 뒤 실행합니다. 스키마에 `FORCE ROW LEVEL SECURITY`가 있어 UI에서 숨기는 방식에만 의존하지 않습니다.

**과제 6 계승:** 과제 6 저장소 https://github.com/jennajiminkim/plandosee-web-diary 의 확인 당시 최신 커밋 `644525924bbab27a2384fdcf54f1ba62933617e8`을 기준으로, 과제 7 저장소 `main`과 GitHub compare 결과 `status=ahead`, `behind_by=0`, merge base가 바로 그 커밋임을 확인했습니다. 따라서 **코드 이력의 조상 관계는 증명됨**(T07-C78). 실제 제출 당시 T06 **고정 커밋과 비교**(C77)는 아직 제출 당시 URL/커밋을 통한 확인이 필요합니다. **C100은 이전 완료:** 사용자가 2026-10-14 과제 6 JSON(9종·66건)과 2026-10-18 과제 7 JSON(9종·86건)을 직접 제공했고, 기존 기록 **66/66건 대응** 및 과제 7 본인 계정에서 기존 계획·일기 조회를 확인했습니다. 가져오기 과정에서 새 ID가 부여됐고, 내부 다이어리 `plan_id` 연결 1건 차이는 별도로 남아 있으므로 모든 필드가 원문과 동일하다고 주장하지 않습니다.

## ④ 안 열리는 것을 확인한 기록

자세한 요청/응답 구조와 증거의 한계는 [마스킹된 검증 기록](evidence/task7-auth-verification.md)을 참고합니다.

**기존 사용자 실측 — 재검사 생략:**

- 로그인 세션에서 `GET /api/state`의 본인 개인 데이터가 JSON으로 표시됨. 로그아웃한 상태에서 동일 메서드/주소가 **HTTP 401 Unauthorized**, 응답 `{"error":"authentication_required"}`였음.
- 로그아웃 **전**에 보관한 `session_token=[REDACTED]` 쿠키를 로그아웃 **후** Chrome의 Request Cookies에 실제 전송시키고 같은 `GET /api/state`가 **HTTP 401**을 반환함(이전 세션 재사용 거절).
- **계정 A→B / B→A, 각각 GET·PATCH·DELETE**, 타 계정 6회 요청 모두 **HTTP 404 `{"error":"not_found"}`**. 본인 계정 기록은 HTTP 200 `verified:true`. 이 실측은 사용자가 2026-10-16에 진행한 과거 검사이며 비밀번호·쿠키는 저장하지 않음.
- Neon SQL Editor에서 credential 저장값 길이 **161자**, 해시 문자열 형태 `^[0-9a-f]{32}:[0-9a-f]{128}$`를 확인. 동일 시험용 비밀번호로 만든 **두 계정**에서 `account_count=2`, `distinct_hash_count=2`, `distinct_salt_count=2` 확인. **원본 해시값은 이 문서에 게시하지 않음**.
- 기존 계정 로그아웃 후 재로그인 성공, 본인 기록 재확인. `/api/health`에서 `{"database":"connected"}` 확인.

**2026-10-18 실제 HTTP 검증 추가 완료:** T07-C98 중복 가입 `POST /api/auth?action=signup` → HTTP 400; T07-C99 기존 이메일+틀린 비밀번호 및 없는 이메일+틀린 비밀번호 각각 `POST /api/auth?action=login` → HTTP 401, 동일 오류 문구. 실제 Chrome Network Preview 스크린샷 3장과 요청 메서드·상태를 확인했으며 마스킹된 요청/응답은 [검증 기록 7절](evidence/task7-auth-verification.md)에 정리했습니다. 동일 검사는 재실행하지 않습니다.

**2026-10-18 실제 Production 로그 검사:** Vercel Request Logs에서 최근 1시간의 요청 로그 21건이 표시되는 것을 확인한 뒤 `password`와 `session_token=`을 각각 검색한 결과 **모두 0건**. [C105·C106의 범위 한정 증거](evidence/task7-auth-verification.md)를 확보했습니다. 추가 24시간 Runtime Logs 질의는 도구 오류로 결과를 확보하지 못해 **0건이라고 주장하지 않습니다**. 전체 기간·다른 비밀정보 표현은 미검증입니다.

**여전히 필요한 증거:** 관리형 비밀번호 저장의 *운영 서버 알고리즘 직접 설정 근거*(C101~103; 기본 scrypt 문서와 저장값 형식은 확인). **C111은 2026-10-18 실제 Neon 운영 세션 13/13건에 만료 시각이 있으며 설정된 수명이 168시간(7일)임을 읽기 전용 집계로 확인해 원문 기준 충족**했습니다. 자연 만료 후 쿠키를 직접 재전송해 401을 확인하는 **별도 추가 실험만 시간 부족으로 생략**했습니다. [C111 실측](evidence/task7-auth-verification.md). **C114는 2026-10-18 Preview에서 다른 시크릿 세션의 `GET /api/state` HTTP 200→401로 실측 통과**했습니다. C46은 9개 브랜치 누적 193개 커밋의 **비밀값 패턴 검사에서 실제 의심 징후 0건**이었으나 전수 보증은 아니며, C129는 **7건 마스킹 재구성 요약 작성**과 달리 원본 요청·응답 전문은 일부 미보존입니다. 로그 전체·브라우저 화면·Network 응답의 민감정보 전수 검사는 미완료입니다. [추가 감사](evidence/task7-secret-history-hash-and-http-audit.md). C122·C123·C125는 반복하지 않습니다.

Better Auth 문서상 기본 세션 TTL은 **7일**(`expiresIn=604800`), `updateAge` 기본값 **1일**입니다. 이 값은 **라이브러리 기본값**이지 현재 Neon 관리형 서비스의 실측 설정이 아닙니다. 참고: https://better-auth.com/docs/concepts/session-management

## ⑤ AI와 나

- **AI에게 맡긴 일:** Neon Auth 프록시·계정별 RLS API·일지 및 백업 코드 작성, 날짜별 카드·관찰 UI 개선, 안전한 테스트와 GitHub/Vercel 배포.
- **내가 직접 판단한 일:** White & Blue 스타일, `MY FIRST STEP`의 2분 첫 행동 지표, 하루하루 한문장 카드 보존, 검사 계정으로 개인정보 보호 실측, 완료된 보안 검사의 중복 재실행 생략.
- **AI 제안을 따르지 않은 일:** 처음 제안된 주간 한문장 카드가 아닌 **일별 독립 카드**로 바꾸도록 직접 요구했고, 링 그래프의 크기·두께·글자 비율도 반복해서 변경하도록 요청함.

## ⑥ 아직 못 막은 것 — 실제 위험

- **로그인 무차별 대입 방어 확인 부족:** 관리형 서비스의 속도 제한과 계정 잠금 정책을 실제로 확인하지 않아 대량 추측 공격 대응 정도를 단언할 수 없습니다.
- **세션 자연 만료 증거 미완성:** 로그아웃 후 이전 쿠키 재사용은 차단을 확인했고, **비밀번호 변경 후 다른 시크릿 세션 접근 차단(C114)은 Preview 실측 통과**했습니다. 다만 TTL 경과로 자연 만료된 쿠키를 직접 재전송해 차단됐는지는 미실측입니다. 모든 브라우저·모든 세션 폐기까지 포괄하는 검사는 아닙니다.
- **계정 삭제 실검증 대기:** 이 Draft에는 14개 자료 테이블과 관리형 인증 계정을 연결해 삭제하는 UI/API가 구현됐습니다. 테스트 Auth의 새 계정 2개 인증 흐름과 실제 테스트 DB의 임시 기록·RLS를 확인했고 PostgreSQL 자동 검증도 통과했습니다. 다만 Vercel 팀 권한 403으로 Preview 환경변수·브라우저 흐름이 미확인이고, 관리형 계정 영구 삭제는 승인 전입니다. Production에는 적용하지 않았습니다. [2026-10-22 실측·한계·잔여 승인](evidence/task7-account-deletion-verification-2026-10-22.md)을 참고하세요.
- **이전 과제 데이터 이전 증거 부족:** 과제 6 실제 최종 제출 데이터 전부가 지금 계정으로 이전됐는지, 일부만 재작성된 것인지 확정할 내보내기 대조 자료가 없습니다.
- **5일 실사용 증거:** 2026-10-17 및 10-18의 실제 1·2일차 기록과 **2일차 뒤 계획 규칙 1회 변경(C09–C12)**이 운영 DB에서 확인됐습니다. **지표·단위·계산식 동일성(C13–C15)**도 검증됐습니다. **3~5일차 실측 기록, 5일 전후 실제 비교, 전체 합계/평균 수동 대조는 아직 진행 중**입니다. 임의 날짜/수치를 만들지 않습니다. [검증 문서](evidence/task7-c09-c15-rule-comparison-2026-10-18.md).
- **요청 기록 원본 일부 부족:** C122의 실제 4건 404 및 전후 DB 건수·상태 지문을 확보했지만, 기존 양방향 GET 포함 전체 요청·응답에 대한 마스킹된 개별 HTTP 전문과 다른 남은 요구 항목은 제출 전 확인이 필요합니다.

## 짧은 확인 방법 — 4줄

1. **위치:** https://plandosee-web-diary2.vercel.app/ 에 새 시크릿 창으로 접속합니다.
2. **행동:** ① 첫 화면 로그인 확인 → ② 본인 계정에서 로그인 → ③ 본인 기록/5일 관찰 화면 열기(심사자에게 계정 비밀번호는 주지 않음).
3. **통과 모습:** 로그아웃 전에는 로그인 첫 화면, 로그인 후에는 본인 데이터만 보임. 위 실측 `401`과 `404`가 서버 차단 증거입니다.
4. **실패 모습:** 무인증 `GET /api/state`가 `401 authentication_required`, 타인 기록 조회/수정/삭제는 `404 not_found`를 반환합니다.

## AI와 내 판단 — 제출용 3줄

1. **AI:** 인증 서버 연결, API/RLS 코드, UI·테스트·배포 및 증거 문서 구조화.
2. **나:** 디자인, MY FIRST STEP 관찰 지표, 일별 카드 형태, 실제 계정 실측 및 변경 승인.
3. **AI 제안 미채택:** 주간 카드 하나로 덮어쓰는 설계 대신 독립된 일별 카드를 고집했으며 그래프 디자인도 수정 요구.

## 완주 상태

| 영역 | 상태 | 참고 |
| --- | --- | --- |
| C01 / C03 / C39 / C40 | **공개 소스 확인 / 화면 새 시크릿창 실측 필요** | GitHub 공개 저장소 확인; 로그인 첫 화면 구현 |
| C77 / C78 | **C78 코드 조상 관계 통과 / C77 실제 최종 제출 대조 필요** | T06 `64452592...`이 T07 `main` 조상 |
| C91–C100 | **중복 가입(C98)·오류 메시지 동일성(C99) HTTP 실측 통과 / C100 기존 데이터 이전 확인 / C77 제출 고정 커밋 확인 필요** | 2026-10-18 HTTP 400·401·401. C100: T06 원본 JSON 66건과 T07 개인 내보내기 86건 중 기존 기록 66건 대응, 본인 계정 기존 기록 조회 완료. ID 재발급·내부 연결 1건 차이 별도 표기 |
| C101–C107 | **C104 해시·솔트 차이 실측 통과 / 기본 scrypt 공식문서 확인 / Neon 운영 해시 설정 미확정 / C105·C106 제한 범위 로그 실측** | 최근 1시간 21건·검색어 2개 0건, 추가 24시간 조회 실패. [기존 증거](evidence/task7-auth-verification.md) · [추가 감사](evidence/task7-secret-history-hash-and-http-audit.md) |
| C108–C115 | **C111 만료 시각·168시간 설정 수명 원문 기준 확인 / 로그아웃 이전 쿠키 401 / C114 비밀번호 변경 후 다른 세션 200→401 실측 통과** | C111: 운영 Neon 세션 13/13 `expiresAt` 존재, 생성→만료 168시간. 별도 자연 만료 쿠키 재전송 실험은 미실시. [실측 기록](evidence/task7-auth-verification.md) |
| C116–C126 | **양방향 404·목록 격리(C125)·ID 변조 방어(C123)·수정/삭제 거절 전후 DB 불변(C122) 실측 통과** / 일부 원본 요청 전문 추가 정리 필요 | C122: 14:35:11→14:41:37 KST, A 전용 테스트 기록 3→3건, B 2→2건, 두 계정 상태 지문 동일, PATCH/DELETE 양방향 각 404. [증거](evidence/task7-auth-verification.md) |
| C127–C131 | **6개 제출 항목 작성 / 기존 실제 HTTP 결과 7건을 비밀 없이 마스킹 재구성 / 당시 원본 요청·응답 전문은 일부 미보존** | [C129 마스킹 요약](evidence/task7-secret-history-hash-and-http-audit.md) — 요약과 원본 캡처를 혼동하지 않음 |
| C04–C08 / C23–C27 | **1일차 지표/단위/규칙 기록, 5일 완료 전** | 서버 서울 날짜 기록 |
| C07 / C09–C15 | **C09–C12 변경 시각·사유·1/2일차 연결 실측 통과, C13–C15 동일 지표·단위·계산식 유지 검증 통과 / C07 5일 완료 전** | 실제 2일 기록·1회 변경; 3~5일차 데이터 후 전후 실측 비교 필요. [C09–C15 실측 증거](evidence/task7-c09-c15-rule-comparison-2026-10-18.md) |
| C132 | **전체 합계·평균 표시 구현 / 실측 5일의 손계산 대조 미완성** | 실제 데이터 필요 |
| C133 | **2026-10-18 운영 다운로드 JSON 실파일 검증 통과:** 13개 배열(89건) 포함, 실험 1건·관찰 1건·규칙변경 0건, 참조 누락 0건 | `api/export.js`, [증거](evidence/task7-auth-verification.md) |
| C134 | **14개 자료·계정 삭제 코드 및 PostgreSQL 자동 검증 완료 / 관리형 실삭제·Preview 전체 흐름 미완료** | 삭제 플래그 기본 OFF, Preview는 새 테스트 계정 한 개만 허용. [2026-10-22 증거](evidence/task7-account-deletion-verification-2026-10-22.md). 실제 삭제 성공으로 제출하지 않음 |
| C46 | **확인된 9개 브랜치·193개 커밋의 고신뢰 비밀정보 패턴 검사에서 실제 노출 의심 0건** | 테스트 코드의 모의 비밀 변수 할당은 별도 분류. [검증 근거 및 범위](evidence/task7-secret-history-hash-and-http-audit.md) — 플랫폼 전수 탐지·숨은 표현은 보증하지 않음 |

**제출 전 확인:** 5일의 실제 기록·계획 변경, C134 삭제 안내 실제 화면 표시 여부, 마스킹 증거 자료가 모두 충족되었는지 확인하고 완료 항목만 체크합니다.
