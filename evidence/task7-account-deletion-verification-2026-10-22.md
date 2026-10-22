# 과제 7 계정 삭제 검증 — 2026-10-22 (Asia/Seoul)

## 최종 판정

**인증과 테스트 DB 격리 실측 완료, 영구 삭제와 배포 전체 흐름 검증은 미완료.**
Production 환경변수·인증 계정·기록에는 쓰기/삭제 작업을 하지 않았다. `ACCOUNT_DELETION_ENABLED`는 Vercel에서 변경하지 않았다. 기존 사용자와 기존 테스트 계정의 비밀번호도 변경하지 않았다.

## 실제 확인한 환경

- 저장소: `jennajiminkim/plandosee-web-diary2`, PR #6, 시작 HEAD `dadbb67ff1af13ce496adef234b71486f1847fe4`.
- Neon 프로젝트 `frosty-term-80851719`.
- 테스트: `task7-account-deletion-test` / `br-steep-king-b38tirzy` / endpoint `ep-ancient-darkness-b3ha58cs`.
- 운영: `production` / `br-sweet-mountain-b3anx3dc` / endpoint `ep-autumn-thunder-b31xxgfx`.
- 각각의 DB endpoint와 Auth base URL이 다름을 관리 API에서 확인했다. 테스트 브랜치는 `parent-data` 복제이므로 실제 사용자 기록의 복사본이 있을 수 있다. 기존 복사본도 삭제 대상으로 삼지 않았다.
- Vercel Preview의 **실제 환경변수 값/스코프와 DB·Auth의 연결 일치 여부는 미확인**이다. 변수가 등록됐다는 사용자 설명만으로 격리됐다고 판정하지 않았다.

## Vercel 접근 차단

`get_deployment`, 보호 URL 조회, 임시 접근 링크 발급이 모두 연결 권한 문제로 403을 반환했다. 알려진 팀 ID `team_yXPDMrPhM9w8AFm3pJdhXYHH`를 명시했다. 오류는 `Not authorized ... scope "jennakim"`이었다. 연결된 팀 목록도 비어 있었다. 오류가 안내한 팀 접근 승인 기능은 현재 노출된 도구 목록에 없고, 인증된 로컬 Vercel CLI도 없었다.

따라서 READY 여부의 독립적 재확인, 배포 환경변수 조회, 브라우저 로그인, Preview 내 계정 삭제는 수행하지 못했다. 보호 설정을 끄거나 우회 비밀키를 생성하지 않았다. GitHub의 기존 Vercel bot READY 기록은 현재 배포 재검증으로 취급하지 않는다.

## 로그인 관련 설정 수정

테스트 Auth의 trusted origins에 현재 배포 URL과 브랜치 URL이 없었다. **테스트 브랜치에만** 다음 두 origin을 추가하고 목록을 다시 조회해 반영을 확인했다.

- `https://plandosee-web-diary2-e640cis8a-jennakim.vercel.app`
- `https://plandosee-web-diary2-git-feature-task7-safe-acc-1f8c13-jennakim.vercel.app`

기존 테스트 계정의 user 1건과 credential account 1건은 존재했다. 비밀번호를 알 수 없고 Preview 접근도 막혀 있어 기존 계정의 로그인 실패 원인을 최종 확정하지는 않았다. 허용 origin 누락은 확인된 설정 문제이며, 이것이 유일한 원인이라고 주장하지 않는다.

## 새 테스트 계정 실제 인증 결과

현재 코드의 서버 인증 핸들러를 로컬에서 직접 실행해, 위 테스트 Neon Auth에 연결했다. Origin/Host는 현재 Preview 주소를 사용했다. 이 검사는 Vercel 배포 브라우저 검사와 구분한다. 무작위 비밀번호·예약된 테스트 이메일을 사용한 새 계정 A와 B만 생성했다. 비밀번호·이메일·쿠키·세션·원본 사용자 ID는 이 증거에 넣지 않는다.

| 검사 | A | B |
| --- | --- | --- |
| 회원가입 | HTTP 200 | HTTP 200 |
| 발급 쿠키로 세션 확인 | authenticated=true | authenticated=true |
| 동일 이메일 재가입 | HTTP 400 | HTTP 400 |
| 로그아웃 | HTTP 200 | HTTP 200 |
| 로그아웃 전 쿠키 재사용 | authenticated=false | authenticated=false |
| 기존 자격증명 재로그인 | HTTP 200 | HTTP 200 |
| 재로그인 세션 복원 | authenticated=true | authenticated=true |
| 틀린 비밀번호 / 존재하지 않는 이메일 | 모두 401, 동일한 응답 | 모두 401, 동일한 응답 |

SDK의 추가 로컬 session-data 쿠키 생성 요청에서 시간 초과 로그가 관찰됐으나, 위 세션 토큰 인증·로그아웃 무효화는 성공했다. Vercel 환경에서 같은 시간 초과가 발생하는지는 미확인이다. 이 애플리케이션은 세션 권한 판정에 SDK 로컬 캐시를 사용하지 않고 제공자에 조회하며 `disableCookieCache=true`도 명시하도록 수정했다.

## 실제 테스트 DB의 임시 기록

Neon HTTP 트랜잭션으로 **확인된 테스트 DB에만** 접근했다. 각 트랜잭션에서 `SET LOCAL ROLE pds_runtime`과 세션에서 확인한 테스트 계정 ID의 `app.user_id`를 설정했다.

| 계정 | 날짜별 일지 | 가져오기 이력 | 나머지 12종 | 전체 |
| --- | ---: | ---: | ---: | ---: |
| 신규 A (삭제 승인 대기) | 1 | 1 | 0 | 2 |
| 신규 B (보존 대조군) | 1 | 1 | 0 | 2 |

A 권한에서 B 소유 일지 조건으로 조회한 결과는 0건이었다. 기존 계정·기존 기록에는 쓰지 않았다. **실삭제 후 B 및 기존 계정 불변 검사는 아직 하지 않았다.** 두 테스트 계정과 4개 임시 기록은 현재 남겨 두었다.

## 관리형 계정 삭제 지원 판정

- Neon 공식 문서 `https://neon.com/docs/auth/reference/nextjs-server`에 Managed Better Auth의 `auth.deleteUser()`가 명시돼 있다.
- 해당 테스트 Auth의 `/open-api/generate-schema`를 HTTP 200으로 실제 조회했고 `/delete-user`가 존재했다. 완료 응답 정의는 `success:true`와 `message:"User deleted"`이며 확인 이메일 발송 응답도 별도로 정의된다.
- 무인증 `/delete-user` 요청은 401 `UNAUTHORIZED`였다. **API 존재 확인은 실제 삭제 활성화·성공 검증과 다르다.** 인증된 계정에 대한 영구 삭제는 최종 승인 전 실행하지 않았다.
- 관리 API를 이용한 관리자 강제 삭제로 앱의 자기 계정 삭제 검사를 대체하지 않는다.

## 수정과 자동 검증

1. 누락된 `pds_import_batches`를 포함해 삭제·미리보기 범위를 **14개 테이블**로 확장했다. 테스트 브랜치에만 `006_account_deletion_ledger.sql`의 DELETE 권한을 적용했다. Production에는 적용하지 않았다.
2. 계정별 advisory transaction lock과 잠금 뒤 Auth 사용자 존재 재확인을 도입했다. 삭제 전에 인증된 대기 요청이 삭제 후 기록을 다시 만드는 것을 차단한다. DB 커밋 실패와 Auth 삭제 사이의 분산 트랜잭션 한계는 여전히 존재한다.
3. 계정 삭제 응답의 만료 쿠키를 브라우저로 전달한다.
4. Preview에서는 `ACCOUNT_DELETION_ENABLED=true`뿐 아니라 `ACCOUNT_DELETION_TEST_USER_ID`가 일치하는 단 한 계정만 삭제 UI/API를 활성화한다. 복제된 다른 계정은 차단된다.
5. 구 Supabase API 전제 때문에 실패하던 9개 검사를 현재 Neon 코드의 동작 검사로 교체했다. SQL 소유권, 입력 검증, 트랜잭션, 세션 캐시 우회 검사도 포함한다.
6. PGlite PostgreSQL 엔진에서 저장소 SQL 스키마와 실제 제약조건·RLS를 사용해 14종 모두에 데이터를 채워 검사했다(A 15건 / B 15건). 제공자 거절과 확인 이메일 응답 시 A·B 모두 롤백 보존, 제공자 삭제 성공 **모의 응답** 시 A 전부 삭제·B 보존, 로컬 모의 identity 삭제 뒤 대기 요청 401을 확인했다. 이것은 **관리형 Auth 실삭제 증거가 아니다**.
7. `npm run check`: **36개 통과, 실패 0개**. 변경한 API·UI 구문 검사와 위 PostgreSQL 검사를 포함한다.
8. `main`의 기존 과제 증거·설명서 변경을 보존하고 index 충돌은 삭제 UI를 유지하는 방향으로 해소했다. PR은 Draft로 유지한다.

## 남은 실행 순서와 승인 대상

1. Vercel 연결이 `jennakim` 팀 및 이 프로젝트를 조회할 수 있도록 사용자 측 연결 권한을 부여한다.
2. 에이전트가 Preview의 실제 DB/Auth endpoint·환경변수 스코프를 비교하고 최신 코드로 Preview를 배포한다. Production은 그대로 둔다.
3. 보존 대조군 및 기존 계정의 테이블별 건수·상태 지문을 기록한다.
4. **신규 A만**, 임시 일지 1건과 가져오기 이력 1건, Auth 계정·세션·credential을 영구 삭제하는 최종 승인을 받는다. 신규 B와 기존 계정은 삭제하지 않는다.
5. 승인 후 Preview에만 A allowlist와 삭제 플래그를 적용하고 정상/오류 UI·틀린 확인정보·실삭제를 검증한다.
6. A의 Auth 사용자·credential·세션 0건, 14개 자료 테이블 0건, 이전 쿠키의 private API 401, 재로그인 401, B와 기존 계정 상태 지문 불변을 확인한다. 새 이메일 재가입은 삭제 전 계정으로의 재로그인과 혼동하지 않는다.
7. Preview 삭제 플래그를 다시 끄고 PR에 마스킹한 HTTP/SQL 증거를 추가한다.

## 과제 기준 관련 현재 판정

| 기준/영역 | 현재 결과 |
| --- | --- |
| C94–C98 가입·로그인·로그아웃·중복 | 테스트 Auth 서버 핸들러 실측 통과, Preview 브라우저 검증 미완 |
| C99 오류 통일 | 테스트 Auth에서 HTTP 상태·문구 일치 |
| 기존 세션 차단 | 로그아웃 후 재사용 차단 실측, 계정 삭제 후 차단은 미검증 |
| 본인 자료 격리 | 테스트 DB에서 A→B 일지 조회 0건, 삭제 후 보존 실측은 미검증 |
| C134 실제 계정·기록 삭제 | 코드·PostgreSQL 자동 검증 완료, 관리형 실삭제 미완료. 성공으로 제출하지 않음 |
| Production 적용 | 미실행, 병합·활성화 금지 |
