# 과제 7 — 시험용 비밀번호 변경 Preview 준비 (2026-10-18)

- 이 문서는 **기존 인증 연결이 설정된 Preview** `task7-neon-integration`에서만 테스트하기 위한 배포 기록입니다. **Production/main 변경 없음.**
- 이 Preview 브랜치의 `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `DATABASE_URL`은 이미 설정되어 있었으며, 실제 비밀값은 읽거나 GitHub에 복사하지 않았습니다.
- `api/auth.js`의 `changePassword`는 유효한 Neon Auth 세션, 일치하는 서버 설정의 승인 이메일, Preview 전용 기능 플래그를 모두 요구합니다. 서버는 `revokeOtherSessions:true`를 강제합니다.
- 브랜치 전용 플래그 및 시험 계정 제한값은 Vercel Environment Variables에서 적용. **비밀번호·쿠키·세션 값은 이 문서에 기록하지 않음.**
- 개인정보 보호: 사용자 브라우저 전용 화면에서는 로그인 확인 후 비밀번호 입력칸을 렌더링합니다. 사용자 비밀번호는 대화로 수집하지 않습니다.
- 검증 코드: 소스 기반 모의 테스트 15/15 통과. 실제 세션 무효화 여부는 사용자 브라우저의 두 분리된 세션과 서버 HTTP 200/401 증거로 판정하며, 현재 **실측 미완료**입니다.
- 검사 후에는 브랜치 전용 `PASSWORD_CHANGE_TEST_ENABLED`를 다시 `false`로 비활성화합니다.
