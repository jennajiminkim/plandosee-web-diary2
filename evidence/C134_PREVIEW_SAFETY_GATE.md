# C134 계정 삭제 기능 — Preview 개발 안전 게이트

상태: **설계/사전 검증**. 이 파일은 삭제 기능이 동작하거나 C134가 통과했다고 주장하지 않습니다.

## 구현할 동작
1. 로그인한 본인만 계정 삭제 요청 가능. 다른 계정 ID를 브라우저에서 받지 않음.
2. 비밀번호 재확인 및 사용자의 명시적 최종 동의.
3. 보호된 서버 API에서 본인 개인 자료와 인증 계정 삭제를 조정.
4. 삭제 성공 뒤 기존 세션으로 /api/state 접근은 401, 재로그인 불가, 개인 자료 0건을 독립 검사.
5. 도중 오류가 발생했을 때 부분 삭제·고아 기록이 생기지 않도록 설계 및 검증. 데이터 복구/보존 정책은 실제 구현과 일치하게 고지.

## 배포 전 필수 조건
- Vercel Preview에 사용하는 DATABASE_URL과 NEON_AUTH_BASE_URL이 운영 값과 **서로 다른 Neon branch**를 가리키는지 비밀값을 노출하지 않고 확인.
- Preview branch 내 Neon Auth가 해당 branch에 속하며 관리형 Better Auth의 delete-user 엔드포인트가 **활성화된 상태인지** 확인. 기본 Better Auth는 계정 삭제 비활성화.
- Neon Auth 삭제 + public.pds_* 데이터 삭제의 트랜잭션/실패 보상 전략과 실제 외래키/트리거 확인. 인증 계정과 개인 자료 삭제를 따로 호출하는 경우 부분 완료를 성공으로 보고하지 않음.
- 프로덕션 사용자의 복제된 개인 데이터를 Preview 테스트 대상으로 사용하지 않음. 테스트 전용 계정과 테스트 전용 자료만 사용.
- 서버에서 삭제 대상 user_id는 검증된 세션에서만 도출; 요청 본문 user_id 불신.
- CSRF/Origin 검증, 재인증, 입력 한도, 로그 민감정보 제거, 성공/거절 시 안전한 오류 처리.
- 새 계정 생성 → 자료 작성 → 내보내기 → 삭제 → 이전 세션 거절/재로그인 실패/DB 카운트 0 확인.
- 실제 운영 반영은 Preview 테스트 증거 검토 뒤 별도 승인.

## 현재 확인된 제한
- 연결된 Neon 도구에서 프로젝트 조회가 'Tool not found'로 실패해 데이터베이스 브랜치 분리 및 테이블 FK를 아직 독립 확인하지 못함.
- 본 프로젝트는 @neondatabase/auth 관리형 프록시 구조로 server-side Better Auth 옵션을 직접 변경할 수 있는 자체 호스팅 구성이 아님.
- 이 안전 게이트가 해소될 때까지 DELETE SQL, 인증 사용자 삭제 API 요청, 운영 배포를 실행하지 않음.

근거: https://better-auth.com/docs/concepts/users-accounts ; https://neon.com/blog/neon-auth-branchable-identity-in-your-database
