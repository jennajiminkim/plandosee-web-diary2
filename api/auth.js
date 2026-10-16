// Task 7 authentication boundary: same-origin proxy to managed Neon Auth (Better Auth).
// The browser never receives a Neon database connection string or server secret.
// IMPORTANT: this auth gateway does not by itself unlock the diary data API.
const MAX_BODY = 8192;
const endpoints = {
  signup: { method: 'POST', path: '/sign-up/email' },
  login: { method: 'POST', path: '/sign-in/email' },
  logout: { method: 'POST', path: '/sign-out' },
  session: { method: 'GET', path: '/get-session' }
};

function originOf(req) {
  const host = req.headers.host;
  if (!host || !/^[a-z0-9.-]+(?::[0-9]+)?$/i.test(host)) return null;
  return (host.startsWith('localhost:') ? 'http://' : 'https://') + host;
}

export function sessionInfo(data) {
  const user = data?.user;
  const session = data?.session;
  return user && session && typeof user.id === 'string'
    ? { authenticated: true, user: { id: user.id, name: user.name || '', email: user.email || '' } }
    : { authenticated: false };
}

export async function neonAuth(req, action, body) {
  const base = process.env.NEON_AUTH_BASE_URL;
  if (!base) throw Object.assign(new Error('auth_not_configured'), { status: 503 });
  let endpoint;
  try {
    endpoint = new URL(base);
  } catch {
    throw Object.assign(new Error('auth_not_configured'), { status: 503 });
  }
  if (endpoint.protocol !== 'https:' || !endpoint.hostname.endsWith('.neon.tech')) {
    throw Object.assign(new Error('auth_not_configured'), { status: 503 });
  }
  const origin = originOf(req);
  if (!origin) throw Object.assign(new Error('invalid_origin'), { status: 400 });
  const spec = endpoints[action];
  const response = await fetch(endpoint.origin + endpoint.pathname.replace(/\/$/, '') + spec.path, {
    method: spec.method,
    redirect: 'manual',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      Origin: origin,
      Cookie: req.headers.cookie || ''
    },
    body: spec.method === 'POST' ? JSON.stringify(body || {}) : undefined,
    signal: AbortSignal.timeout(8000)
  });
  return response;
}

export function forwardCookies(res, upstream) {
  const raw=upstream.headers.getSetCookie?.() || [];
  const safe=raw.filter(v=>/^[A-Za-z0-9_.-]+=[^;\r\n]*/.test(v)).map(v=>{
    const parts=v.split(';');
    const first=parts.shift();
    // Translate cross-site managed-auth cookies to same-origin proxy cookies.
    const attrs=parts.filter(x=>!/^\s*(domain|path|samesite|partitioned|secure|httponly)(=|$)/i.test(x));
    return [first,...attrs,'Path=/','Secure','HttpOnly','SameSite=Lax'].join('; ');
  });
  if(safe.length)res.setHeader('Set-Cookie',safe);
}

// Names only. Never log or return cookie contents, session tokens, or signatures.
function cookieNames(header) {
  return String(header||'').split(';').map(part=>part.trim().split('=')[0])
    .filter(name=>/^[A-Za-z0-9_.-]{1,80}$/.test(name));
}
function authCookieNames(names) {
  return names.filter(name=>/(auth|session|token)/i.test(name)).slice(0,6);
}
async function responseJSON(response) {
  try { return await response.json(); } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const action = typeof req.query?.action === 'string' ? req.query.action : '';
  const spec = endpoints[action];
  if (!spec || req.method !== spec.method) return res.status(404).json({ error: 'not_found' });

  if (spec.method === 'POST') {
    const origin = originOf(req);
    if (!origin || req.headers.origin !== origin) {
      return res.status(403).json({ error: 'forbidden_origin' });
    }
  }

  try {
    let body = {};
    if (spec.method === 'POST' && action !== 'logout') {
      const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
      if (Buffer.byteLength(raw) > MAX_BODY) return res.status(413).json({ error: 'request_too_large' });
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      if (action === 'signup') {
        if (typeof body.name !== 'string' || body.name.trim().length < 1 || body.name.length > 80) {
          return res.status(400).json({ error: 'invalid_input' });
        }
      }
      if (typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) ||
          typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) {
        return res.status(400).json({ error: 'invalid_input' });
      }
      body = action === 'signup'
        ? { name: body.name.trim(), email: body.email.trim(), password: body.password }
        : { email: body.email.trim(), password: body.password };
    }
    const upstream = await neonAuth(req, action, body);
    const issued = upstream.headers.getSetCookie?.() || [];
    forwardCookies(res, upstream);
    const payload = await responseJSON(upstream);
    if (!upstream.ok) {
      if (action === 'login') return res.status(401).json({ error: '이메일 또는 비밀번호를 확인해 주세요.' });
      if (action === 'signup') return res.status(400).json({ error: '가입을 완료할 수 없습니다. 이메일과 입력 정보를 확인해 주세요.' });
      return res.status(401).json({ error: 'not_authenticated' });
    }
    if (action === 'session') {
      const info = sessionInfo(payload);
      // Diagnostic metadata contains no cookies, tokens, or personal information.
      // Useful for distinguishing a browser cookie issue from a rejected session.
      if (!info.authenticated) {
        const cookieHeader = req.headers.cookie || '';
        info.diagnostic = {
          request_has_cookies: cookieHeader.length > 0,
          request_has_session_cookie: /(?:^|;\s*)[^=;\s]*session_token=/.test(cookieHeader),
          cookie_names: authCookieNames(cookieNames(cookieHeader)),
          cookie_count: cookieNames(cookieHeader).length
        };
      }
      return res.status(200).json(info);
    }
    return res.status(200).json({
      ok: true,
      ...(action === 'login' || action === 'signup' ? {
        diagnostic: {
          upstream_set_cookie_count: issued.length,
          upstream_auth_cookie_names: authCookieNames(issued.map(item=>item.split('=')[0].trim()))
        }
      } : {})
    });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: e.message });
    // Do not print request bodies, credentials, cookies, or upstream response payloads.
    console.error('Neon Auth request failed');
    return res.status(503).json({ error: 'auth_unavailable' });
  }
}
