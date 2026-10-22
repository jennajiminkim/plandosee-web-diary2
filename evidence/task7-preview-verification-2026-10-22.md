# 과제 7 — Vercel 접근 복구 후 실제 Preview 검증 (2026-10-22, Asia/Seoul)

## 현재 판정

Vercel 프로젝트/배포 조회와 보호된 Preview 접근은 성공했다. 연결 재설정이나 Members 권한 추가는 요구하지 않았다. 과거 403이 발생했던 정확한 내부 원인 또는 해소 시점은 확정할 수 없다.

실제 배포에서 가입·로그인·로그아웃·로그아웃 이전 세션 차단, 테스트 환경 격리, 자료 저장·조회, 삭제 대상 건수를 확인했다. 자료 조회 오류를 발견해 테스트 DB 권한만 수정했다. **새 시험 계정 C의 영구 삭제와 삭제 후 HTTP 차단은 아직 실행하지 않았다.** 이전 승인 대상 A의 관리자 경로 삭제 완료와 구분한다.

## 환경과 접근

- 저장소: jennajiminkim/plandosee-web-diary2, Draft PR #6.
- 실제 검사 코드 SHA: 2db6caed8534b8831535afd7106e5a7ec837c408.
- Preview deployment: dpl_C8tEMgAqsT2psHaecmey6b8T4XuY, READY.
- 주소: https://plandosee-web-diary2-83lgc3kam-jennakim.vercel.app
- 시험 Origin: https://plandosee-web-diary2-git-feature-task7-safe-acc-1f8c13-jennakim.vercel.app
- Neon 프로젝트 frosty-term-80851719 / 테스트 task7-account-deletion-test / br-steep-king-b38tirzy.
- Preview 브랜치 전용 DATABASE_URL, NEON_AUTH_BASE_URL, NEON_AUTH_COOKIE_SECRET 등록 확인. sensitive 형식은 decrypt 요청에도 값이 반환되지 않으므로 서버의 preview 한정 읽기 전용 health 검사로 대상 일치를 검증했다. 값·접속 비밀번호·쿠키 비밀키는 출력하지 않았다.
- 배포 GET /api/health?verification=task7: HTTP 200, database=connected, preview=true, test_database=true, test_auth=true, cookie_secret_configured=true, deletion_enabled=false. DB·Auth 호스트를 알려진 테스트 endpoint와 각각 비교했다.
- Vercel Authentication 보호를 끄지 않았다. 공식 임시 공유 링크의 접근 쿠키를 사용했다. 링크와 쿠키 원문은 증거에 보관하지 않았다.
- 전용 fetch 도구는 /api/account의 앱 401을 deployment_authentication_required로 분류했지만, 별도 HTTP 클라이언트에서 실제 JSON {"error":"authentication_required"}를 확인했다. 따라서 이 사례는 앱의 비로그인 차단이다. 도구 오류를 새 Vercel 팀 권한 문제로 해석하지 않는다.
- 별도 클라우드 브라우저는 Vercel 로그인 화면에 도달했다. 사용자 자격증명을 요구하지 않고 HTTP/API 검증을 진행했다. **브라우저 폼·삭제 버튼 클릭 검증은 완료로 주장하지 않는다.**

## 발견된 오류와 수정

가입과 세션 인증 성공 후 GET /api/state 및 GET /api/account가 HTTP 503을 반환했다. 배포 로그의 PostgreSQL 오류는 42501이었다.

테스트 DB에서 pds_app_t7은 pds_runtime membership=false, pds_runtime은 개인 자료 14개 테이블 SELECT 권한=true였다. 테스트 브랜치에만 다음 설정을 적용했다.

```sql
GRANT pds_runtime TO pds_app_t7;
```

이는 앱의 SET LOCAL ROLE pds_runtime을 가능하게 한다. 스키마/RLS를 끄거나 인증 사용자 테이블의 접근 권한을 추가하지 않았다. membership=true 재조회 및 동일 배포·동일 세션으로 자료 조회 503→200을 확인했다. Production 역할·환경변수·기록은 변경하지 않았다. Production에 같은 수정이 필요하다고 추정하지 않는다.

## 실제 Preview HTTP 검사

예약 도메인 example.invalid와 무작위 비밀번호로 새 C를 생성했다. 공개 증거에는 이메일·비밀번호·전체 사용자 ID·쿠키를 넣지 않는다. C 식별용 ID 끝: c8776470.

| 검사 | 관찰 결과 |
| --- | --- |
| 비로그인 GET /api/state | 401 authentication_required |
| 신규 가입 | 200 |
| 가입 쿠키로 세션 | 200, authenticated=true |
| 동일 이메일 중복 가입 | 400 |
| 로그아웃 | 200 |
| 로그아웃 후 세션 | authenticated=false |
| 로그아웃 전 쿠키로 GET /api/state | 401 |
| 틀린 비밀번호 / 없는 이메일 | 모두 401, 상태·JSON 문구 동일 |
| 원래 비밀번호 재로그인·세션 복원 | 200, authenticated=true |
| 초기 빈 자료 조회 | 수정 전 503 → 권한 수정 후 200, 모든 배열 빈 상태 |
| 임시 날짜별 일지 저장 | 200, 1건 |
| 임시 주간 기록 저장 | 200, 1건 |
| GET /api/account | 200, 총 2건, dailyJournals=1, journals=1, 나머지 12종=0 |
| GET /api/state 재조회 | C 소유 두 기록만 반환 |
| C 세션에서 B 일지 ID로 수정 | 404 not_found, B 행 상태 지문 전후 동일 |
| 삭제 비활성 상태 POST /api/account | 409 account_deletion_not_enabled |

보호 본 계정 1건, 기존 대조군 B 사용자·일지·가져오기 이력 각각 1건 유지도 테스트 DB에서 조회했다. 전체 다른 계정 자료의 이번 작업 전후 상태 지문을 비교한 것으로 확대 해석하지 않는다.

## 자동 검사와 잔여 범위

- 이번 코드 변경 후 npm run check: 38개 통과, 실패 0개. 구문 검사와 PostgreSQL/PGlite 실제 제약/RLS 검사 포함.
- 삭제는 기본 비활성이며 Preview 단일 사용자 allowlist 조건도 유지했다. C 계정과 임시 기록 2건은 남아 있다.
- 앞서 승인받은 A의 삭제 결과: [승인된 A 정리 증거](task7-approved-test-deletion-2026-10-22.md).
- C를 영구 삭제하려면 새 대상임을 밝히고 승인을 받은 뒤 C만 allowlist에 지정해 실행한다. 자기 계정 /delete-user 지원, 이전 세션 private API 401, 동일 자격증명 재로그인 401, 자료 14종 잔존 0건과 다른 계정 보존을 실측하고 삭제 플래그를 끈다. 관리자 삭제 성공으로 자기 계정 삭제 성공을 대체하지 않는다.
- 운영 로그 전체 기간 요청은 Hobby 보관 범위를 초과해 400으로 거절됐다. 1시간 요청도 보관 범위 경계에서 거절됐고 30분 요청은 성공했으나 반환 로그가 0건이었다. 무로그·전체 기간 비밀정보 미노출을 증명하지 않는다.
- 관리형 Auth 내부 해시 설정 직접 증거와 일부 과거 404 원본의 미보존은 기존 한계를 유지한다.
- C134는 운영 화면의 정확한 자료 처리 안내를 사용자가 확인한 대안으로 이미 충족한다는 기존 판정을 유지한다. 자동 삭제 기능 통과 판정은 보류한다.
