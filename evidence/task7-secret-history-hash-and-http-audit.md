# 과제 7 — Git 이력 비밀정보 검사 · 인증 해시 근거 · 제출용 HTTP 증거 정리

> 점검일: 2026-10-18 (KST). 실제 비밀번호, 인증 쿠키, 세션 토큰, DB 연결 비밀, 개인키, 사용자 이메일·ID를 이 문서에 기록하지 않습니다.

## A. C46 — 현재 GitHub 저장소 및 전체 확인 가능 브랜치 커밋의 비밀정보 패턴 검사

- 저장소: `jennajiminkim/plandosee-web-diary2`.
- 확인한 브랜치: `main`, `audit/task7-auth-missing-evidence`, `audit/task7-session-expiry-password-revocation`, `feature/daily-one-line-cards`, `feature/task7-safe-account-deletion`, `fix/experiment-edit-today-record`, `task7-auth-development`, `task7-neon-integration`, `task7/final-submission-audit` — 총 9개.
- 메인 이력 **163개 커밋**의 각 변경 패치를 검사. 별도 브랜치가 `main`에 비해 앞서는 이력은 각각 **3·15·8·1·3개**로, 추가 **30개 커밋** 검사. `main`보다 뒤에만 있는 나머지 브랜치들의 커밋은 `main` 검사 범위에 포함됩니다.
- 합계 **193개 커밋**의 추가/삭제 변경 패치에서 고신뢰 패턴 검사. GitHub에서 반환된 검사 대상 커밋의 변경 패치 누락 및 조회 실패는 **0건**.
- 패턴 범위: GitHub 토큰, AWS 액세스 키, Stripe 비밀키 형태, PEM 개인키 헤더, JWT 형태, 사용자명/비밀번호를 포함한 PostgreSQL·Redis·MongoDB URL, `DATABASE_URL`·`NEON_AUTH_COOKIE_SECRET`·`SUPABASE_SERVICE_ROLE_KEY`·`VERCEL_TOKEN`·`GITHUB_TOKEN` 등에 직접 문자열로 넣은 값, `.env`/자격증명 파일명의 커밋 흔적.
- **결과:** 실제 인증 비밀 또는 DB 연결 비밀번호로 의심되는 고신뢰 패턴 **0건**. 단, 일부 테스트 소스(`tests/api.test.mjs` 및 독립 검증 브랜치의 테스트 파일들)에서 비밀 변수에 문자열을 넣는 코드가 검출됐으나, 실제 인증정보가 아닌 **명시적인 테스트용 모의 값**으로 분류했습니다. 비밀값이나 모의 값을 이 문서에 복사하지 않았습니다.
- **범위의 한계:** 패턴 기반 검사입니다. 임의로 분할하거나 인코딩한 값, 알려지지 않은 공급업체 형식, 이미지·바이너리, GitHub 외부 저장소·배포 로그의 비밀정보, GitHub 플랫폼의 별도 비밀탐지 서비스 결과까지 전수 보장하지 않습니다. 따라서 '모든 비밀값 절대 미노출' 판정은 아닙니다.

**판정:** C46 중 GitHub에 보이는 현재 브랜치와 과거 커밋의 **고신뢰 비밀정보 패턴 검사 완료, 탐지 0건**. 더 광범위한 수동 보안 감사/플랫폼 비밀탐지는 별개입니다.

## B. C101~C103 — 비밀번호 해시 알고리즘의 증거 수준

기존 2026-10-17 사용자 실측(SQL 읽기 전용 집계, [관련 기록](task7-auth-verification.md#4-비밀번호-저장솔트-2026-10-17-사용자-실측)):

- Credential 계정 3건에서 저장 문자열 길이가 모두 **161자**.
- 정규식 `^[0-9a-f]{32}:[0-9a-f]{128}$` 형식 일치 3건.
- 서로 다른 솔트 3개. 같은 시험용 비밀번호를 사용한 계정 2개에서도 **서로 다른 저장값 2개·솔트 2개**.
- 원본 비밀번호·솔트·해시값은 조회 보고서에 복사하지 않았습니다.

새 공식 근거 확인:

1. [Better Auth 공식 보안 문서](https://better-auth.com/docs/reference/security): Better Auth는 **기본적으로 scrypt**로 비밀번호를 해싱하며, 해시 함수를 커스텀할 수 있다고 안내합니다.
2. [Better Auth 이메일/비밀번호 문서](https://better-auth.com/docs/authentication/email-password): 기본 scrypt 및 교체 가능한 `emailAndPassword.password.hash/verify` 설정을 명시합니다.
3. [Neon 공식 소개](https://neon.com/blog/neon-auth-branchable-identity-in-your-database): 현재 관리형 Neon Auth가 **Better Auth 기반**으로 실행되지만, 서버 측 구성과 운영은 Neon이 관리합니다.
4. 연결된 Neon의 **읽기 전용 Auth 설정 조회** 결과, `auth_methods.email_password` 설정은 표시되지만 **password hash 알고리즘 선택·커스텀 여부 필드는 제공되지 않았습니다.** 관리형 서버 내부 설정 또는 실행 구현을 직접 확인한 결과가 아닙니다.

**판정:** `scrypt`가 **라이브러리 기본 알고리즘이라는 문서 근거**와, **운영 DB의 scrypt 기본 형식과 일치하는 저장값·계정별 솔트 차이 실측**을 확보. 그러나 **해당 Neon 관리형 인증 인스턴스가 커스텀 해싱 없이 실제 scrypt를 실행한다는 직접 설정 증거는 미확보**. 따라서 C101~103에 대해 운영 알고리즘 확정까지 모두 실측 통과했다고 적지 않습니다.

## C. C129 — 기존 실측을 활용한 비밀값 마스킹 요청·응답 요약

아래 **요청 경로·메서드·HTTP 상태·기록된 응답 문구**는 [검증 기록](task7-auth-verification.md)에서 이미 사용자 실측으로 확인된 결과입니다. 대괄호 표시 필드와 JSON 요청 형태는 공개 증거를 위해 **재구성한 예시**로서 당시 브라우저의 전체 원본 헤더·요청 전문을 복구한 것이 **아닙니다**.

| 실제 검사 | 마스킹 요청 개요 (재구성 표시) | 실측 HTTP | 확인된 응답 |
| --- | --- | --- | --- |
| 로그아웃 후 본인 자료 요청 | `GET /api/state`, 인증 세션 없음 | **401** | `{"error":"authentication_required"}` |
| A→B 타인 기록 조회 | `GET /api/ownership-test?id=[OTHER_ACCOUNT_RECORD_ID]` | **404** | `{"error":"not_found"}` |
| A→B 타인 기록 수정 | `PATCH /api/ownership-test`, body `{"id":"[OTHER_ACCOUNT_RECORD_ID]"}` | **404** | `{"error":"not_found"}` |
| B→A 타인 기록 삭제 | `DELETE /api/ownership-test`, body `{"id":"[OTHER_ACCOUNT_RECORD_ID]"}` | **404** | `{"error":"not_found"}` |
| 기존 이메일로 중복 가입 | `POST /api/auth?action=signup`, 자격증명 `[비공개]` | **400** | `{"error":"가입을 완료할 수 없습니다. 이메일과 입력 정보를 확인해 주세요."}` |
| 잘못된 비밀번호로 로그인 | `POST /api/auth?action=login`, 자격증명 `[비공개]` | **401** | `{"error":"이메일 또는 비밀번호를 확인해 주세요."}` |
| 없는 이메일로 로그인 | `POST /api/auth?action=login`, 자격증명 `[비공개]` | **401** | 직전 잘못된 비밀번호와 **동일한 응답** |

- 앞서 A↔B 양방향 GET/PATCH/DELETE **6건 404**, 뒤이어 2026-10-18 양방향 PATCH/DELETE **4건 404** 및 검사 전후 DB 상태 지문 불변을 별도 실측했습니다. 여기서는 **과거에 관찰된 HTTP 사실만 재정리**했으며 요청을 재실행하지 않았습니다.
- 브라우저 원본 `Cookie`/`Authorization`, 세션 토큰, 실제 계정 이메일/사용자 ID, 비밀번호, 개인 응답 JSON 본문은 **공개하지 않았습니다**.
- **남은 제한:** C129에서 요구하는 '각 실제 요청의 마스킹된 헤더·본문까지 포함한 완전한 원본 요청/응답 쌍'은 일부 보관되어 있지 않아 이 요약표만으로 **전부 충족했다고 단언하지 않습니다.** 실제로 관찰하지 않은 내용을 원본 캡처로 가장하지 않습니다.

## D. C105·C106 — 운영 로그 범위

- **기존 사용자 실측:** 2026-10-18 Vercel Production 최근 1시간 Request Logs에서 요청 **21건** 확인, `password` 검색 **0건**, `session_token=` 검색 **0건**. [원본 범위 기록](task7-auth-verification.md#11-t07-c105c106--production-logs의-민감정보-검색-실측-2026-10-18).
- **이번 추가 시도:** 연결된 Vercel Runtime Logs 조회로 Production 최근 24시간의 `password`, `session_token=`, `authorization`, `cookie`, `DATABASE_URL` 표현 검색을 시도했지만 도구 응답 오류로 **결과를 검증할 수 없었음**. 이번 시도를 '0건'이라고 기록하지 않습니다.
- **판정:** 기존 확인한 1시간/2개 검색어 범위는 유지. Production 전체 기간·모든 표현에 대한 원문 비밀정보 무노출은 **미검증**입니다.

## 최종 요약

| 항목 | 이번 작업 결과 | 미확인 범위 |
| --- | --- | --- |
| C46 GitHub 비밀정보 감사 | 9개 브랜치 및 누적 193개 변경 커밋 패턴 검사, 고신뢰 실제 비밀 의심 0건 | 알려지지 않은 형식, 외부/바이너리 자료, 광범위 수동 감사 |
| C101~C103 알고리즘 | Better Auth 기본 scrypt 공식 문서 + 저장값/솔트 형식 실측 확인 | Neon 관리형 서버의 실제 해시 설정 직접 증명 |
| C129 마스킹 제출 자료 | 기존 실측 HTTP 401/404/400·응답을 비밀 없이 재정리 | 당시 전체 원본 요청/응답 헤더·본문 복구 불가 |
| C105·C106 운영 로그 | 기존 1시간 21건·검색어 2개 0건 실측 유지 | 24시간 및 다른 토큰 표기 확대 조회 실패 |

**작업 안전성:** 테스트 계정 비밀번호 변경, 로그인, 세션 삭제, 데이터 수정, DB 스키마 변경, Vercel 환경변수 변경은 수행하지 않았습니다. 과거 사용자 검사 결과를 중복 실행하지 않았습니다.
