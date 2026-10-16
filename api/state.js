// Task 7: SAFE LOCKDOWN until authenticated, tenant-scoped Neon CRUD is complete.
// The Task 6 API read all users' data using an elevated Supabase key.
// Returning 401 for every method prevents accidental exposure from this route.
// Once session validation and per-owner RLS transactions are implemented, replace
// this file with real authorization-aware handlers and add adversarial tests.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(401).json({ error: 'authentication_required', detail: '개인 기록 API는 인증 기능 검증 후 이용할 수 있습니다.' });
}
