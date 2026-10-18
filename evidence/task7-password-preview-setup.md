# 과제 7 — 시험용 비밀번호 변경 Preview 준비 (2026-10-18)

- 이 문서는 **기존 인증 연결이 설정된 Preview** `task7-neon-integration`에서만 테스트하기 위한 배포 기록입니다. **Production/main 변경 없음.**
- 이 Preview 브랜치의 `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `DATABASE_URL`은 이미 설정되어 있었으며, 실제 비밀값은 읽거나 GitHub에 복사하지 않았습니다.
- `api/auth.js`의 `changePassword`는 유효한 Neon Auth 세션, 일치하는 서버 설정의 승인 이메일, Preview 전용 기능 플래그를 모두 요구합니다. 서버는 `revokeOtherSessions:true`를 강제합니다.
- 브랜치 전용 플래그 및 시험 계정 제한값은 Vercel Environment Variables에서 적용. **비밀번호·쿠키·세션 값은 이 문서에 기록하지 않음.**
- 개인정보 보호: 사용자 브라우저 전용 화면에서는 로그인 확인 후 비밀번호 입력칸을 렌더링합니다. 사용자 비밀번호는 대화로 수집하지 않습니다.
- 검증 코드: 소스 기반 모의 테스트 **15/15 통과**.
- **T07-C114 실제 실측 통과 (2026-10-18):** 승인된 별도 시험 계정에 대해 일반 Chrome과 시크릿 Chrome에서 각각 로그인. 시크릿 창의 `GET /api/state` 변경 전 **HTTP 200** 확인 → 일반 창의 전용 페이지에서 비밀번호 변경 **성공** → 기존 시크릿 세션에서 **동일한 `GET /api/state`가 HTTP 401 Unauthorized**. 메서드 GET, 보호 API 경로는 `/api/state`; 비밀번호·요청 쿠키·민감한 응답 JSON을 공개하거나 저장하지 않음.
- **범위 한정:** 다른 브라우저 세션의 접근 차단 실측은 통과. 비밀번호 변경을 실행한 일반 창 자체가 계속 200인지는 별도로 확인하지 않았으며, **세션의 자연 만료 후 차단(T07-C111)** 역시 아직 실측하지 않음.
- **검사 후 안전 조치:** Vercel `task7-neon-integration` 전용 `PASSWORD_CHANGE_TEST_ENABLED=false`로 변경 완료, 관리 API에서 저장값이 정확히 `false`인 것 확인. 이 설정은 **향후 배포에 적용**되므로 본 문서 갱신으로 Preview를 새로 배포하고 새 버전 연결 여부를 검증해야 함. 기존 변경 성공 배포의 고유 URL을 즉시 비활성화한다고 주장하지 않음.
- 검사 후에는 브랜치 전용 `PASSWORD_CHANGE_TEST_ENABLED`를 다시 `false`로 비활성화합니다.
