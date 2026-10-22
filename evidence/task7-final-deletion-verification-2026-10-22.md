# 과제 7 — 승인된 C 실삭제·접근 차단 검증 (2026-10-22, Asia/Seoul)

## 결과

**승인된 테스트 계정 C와 임시 기록 2건의 영구 정리 및 삭제 후 접근 차단 검증은 완료했다. 앱의 자기 계정 자동 삭제는 현재 제공자의 404 응답으로 미통과다. 두 결과를 합쳐 성공으로 보고하지 않는다.**

사용자는 실제 사용하는 본 계정을 제외하고 남은 실삭제 및 임시 기록 2건의 영구 삭제를 승인했다. C(ID 끝 c8776470)만 대상으로 삼았다. 보호 본 계정에는 로그인·비밀번호 변경·자료 쓰기·삭제를 하지 않았다. Production 환경변수·DB 권한·실제 사용자 자료도 변경하지 않았다. main에는 검증 문서만 반영했다.

## 격리와 실행 범위

- Neon 프로젝트 frosty-term-80851719, 테스트 브랜치 task7-account-deletion-test / br-steep-king-b38tirzy.
- Preview 작업 브랜치 feature/task7-safe-account-deletion.
- 배포 서버의 읽기 전용 검증에서 preview=true, test_database=true, test_auth=true, cookie_secret_configured=true와 실제 DB 접속 성공을 재확인했다.
- DB에서 C가 예약 테스트 이메일과 시험 이름을 가진 별도 계정임을 확인했다. 삭제 직전 개인 자료는 날짜별 일지 1건·주간 기록 1건, 나머지 12종 0건이었다.
- Preview 전용 ACCOUNT_DELETION_ENABLED와 단일 ACCOUNT_DELETION_TEST_USER_ID만 임시 설정했다. Production 설정은 변경하지 않았다.
- Vercel 배포 API의 preview 값은 400으로 거절됐고, staging 대상 요청은 자동 승인 검토가 격리 미확인을 이유로 차단했다. staging에는 배포하지 않았다. 이미 Preview로 확인한 비운영 작업 브랜치의 Git 자동 배포로 진행했으며, 실행 전에 실제 Preview 환경을 다시 확인했다.

## 실제 앱 삭제 API 검사 — 거절과 롤백 확인

시험 배포 dpl_FHa7sUw3WmDANwNnyq2N3s9ghSkP / SHA 7491fe088f4420657c16975f9df1cd46a3e529b4에서 수행했다.

| 검사 | 결과 |
| --- | --- |
| C 세션, 삭제 대상 총 2건, C만 활성화 | 확인 |
| 잘못된 확인 문구 | 400 explicit_confirmation_required, 2건 보존 |
| 잘못된 확인 이메일 | 400 account_email_mismatch, 2건 보존 |
| 틀린 비밀번호 | 409 auth_delete_unavailable_or_rejected, 2건 보존 |
| 다른 Origin의 요청 | 403 forbidden_origin |
| 삭제 전 원래 서명 쿠키로 private API | 200 |
| 정확한 이메일·비밀번호·확인 문구로 삭제 | 409, 성공 안내 없음, DB 삭제 롤백 |

기존 오류는 제공자 상태를 숨기므로 API에 비밀을 노출하지 않는 고정 분류 로그를 추가했다. SHA ae063a6cd41ae5300731a9f9a5aa121668bfb98c, 배포 dpl_HYkWRyWgg19h5HoeJVaACaYkSTEw에서 같은 C를 대상으로 재확인했다.

```text
Managed Auth deletion rejected 404 unclassified
```

공식 SDK 문서와 서버 OpenAPI에 deleteUser/delete-user가 존재한다는 근거와, 이 환경에서 인증된 실제 요청이 삭제를 수행한다는 근거는 다르다. **현재 테스트 서비스는 올바른 자격증명 요청에도 404를 반환했다.** 이것만으로 모든 Neon Auth 환경에서 지원하지 않는다고 일반화하거나, 설정이 disabled임을 확정하지 않는다. 틀린 비밀번호 거절도 이 404의 영향일 수 있으므로 제공자의 비밀번호 재확인 기능이 독립적으로 통과했다고 주장하지 않는다.

진단 코드는 제공자 원문 본문·이메일·비밀번호·쿠키를 로그에 넣지 않고 숫자 상태와 고정 분류만 남긴다. 변경 후 npm run check 38개 통과, 실패 0개.

## 승인된 관리자 정리 — 실제 완료

자기 계정 삭제 실패를 성공으로 바꾸지 않은 채, 사용자가 승인한 C와 2건만 정리했다.

1. 동일 테스트 브랜치에서 Neon 관리 API로 C 인증 사용자를 삭제했다.
2. 계정별 advisory lock을 획득하고 Auth 사용자 부재 및 전체 C 자료가 정확히 2건임을 확인했다.
3. pds_runtime 역할과 app.user_id=C를 사용한 단일 SQL 트랜잭션에서 날짜별 일지 1건·주간 기록 1건만 삭제했다. 각 삭제 건수와 전체 잔존 0건을 검증했다. 조건 불일치 시 전체 롤백하도록 했다.
4. Auth user/account/session과 개인 자료 14개 테이블, 총 17개 관계에서 C 잔존 0건을 다시 조회했다.

| 대상 | 삭제 후 |
| --- | ---: |
| C 인증 사용자 | 0 |
| C 로그인 account/credential | 0 |
| C 세션 | 0 |
| C 날짜별 일지 | 0 |
| C 주간 기록 | 0 |
| C 자료 14종 전체 | 0 |
| 보호 본 계정 | 1, 유지 |
| 대조군 B 사용자·일지·가져오기 이력 | 각각 1, 유지 |

C를 제외한 개인 자료 14종과 Auth 3종의 **전체 행 건수 및 정렬된 행 JSON 상태 지문**을 작업 전후 비교해 17종 모두 일치를 확인했다. 원본 개인 자료나 인증 해시는 공개 증거에 넣지 않았다.

## 삭제 후 HTTP 차단 — 원래 쿠키·자격증명으로 실측

삭제 전 HTTP 200을 확인한 실제 서명 쿠키를 별도로 보존해 재사용했다. 새로 만든 무효 쿠키로 대체하지 않았다.

| 요청 | 결과 |
| --- | --- |
| 원래 쿠키 GET /api/state | 401 authentication_required |
| 원래 쿠키 GET /api/account | 401 authentication_required |
| 원래 쿠키 POST /api/state, 일지 재생성 시도 | 401, 생성 안 됨 |
| 원래 쿠키 GET /api/auth?action=session | 200, authenticated=false |
| 같은 원래 이메일·비밀번호로 로그인 | 401, 재로그인 불가 |

이 HTTP 결과는 **관리자 정리 후 세션·접근 차단의 실측**이다. 앱 삭제 성공 응답·브라우저 쿠키 만료 헤더 전달·삭제 버튼 흐름의 성공 증거로 바꾸지 않는다.

## 종료 설정과 과제 판정

- Preview 설정의 ACCOUNT_DELETION_ENABLED=false로 복구하고 시험 사용자 allowlist도 비웠다. 배포 dpl_ahmAK7chNnUrDVfDXWgoY5M5cobn / SHA f6575e6c1afa04e0ab3825414c3a22a54a798440에서 GET /api/health?verification=task7 HTTP 200, deletion_enabled=false를 확인했다.
- Production 자동 삭제는 활성화하지 않았다. PR #6은 Draft로 유지하며 병합하지 않는다.
- C134는 사용자가 운영 화면에서 확인한 **정확한 자료 처리 안내 대안**으로 충족한다는 기존 판정을 유지한다.
- **자동 계정 삭제 UI/API는 현재 미통과**다. 제공자의 인증된 delete-user 404를 해결·재검증하기 전까지 운영에 활성화하지 않는다.
- 브라우저 폼·삭제 버튼 클릭은 미검증이다. 관리형 실제 해시 설정, 일부 과거 HTTP 원본 미보존, 전체 기간 운영 로그 보관 한계도 유지한다.
- 기계 판독용 마스킹 결과: [검증 요약 JSON](task7-final-deletion-verification-2026-10-22.json).
