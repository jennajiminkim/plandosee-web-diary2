// Task 7: connection-only health probe. No personal diary data is returned.
// This endpoint checks Neon reachability; it does not implement authentication.
import { neon } from '@neondatabase/serverless';

// Preview-only verification returns booleans, never connection strings or secrets.
export function testEnvironmentChecks(env = process.env) {
  const host = value => { try { return new URL(value).hostname; } catch { return ''; } };
  return {
    preview: env.VERCEL_ENV === 'preview',
    test_database: /^ep-ancient-darkness-b3ha58cs(?:-pooler)?\.c-4\.ap-southeast-1\.aws\.neon\.tech$/.test(host(env.DATABASE_URL)),
    test_auth: host(env.NEON_AUTH_BASE_URL) === 'ep-ancient-darkness-b3ha58cs.neonauth.c-4.ap-southeast-1.aws.neon.tech',
    cookie_secret_configured: Boolean(env.NEON_AUTH_COOKIE_SECRET),
    deletion_enabled: env.ACCOUNT_DELETION_ENABLED === 'true'
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ status: 'method_not_allowed' });
  }

  const verify = req.query?.verification === 'task7' && process.env.VERCEL_ENV === 'preview';
  const checks = verify ? testEnvironmentChecks() : null;
  if (verify && (!checks.test_database || !checks.test_auth || !checks.cookie_secret_configured)) {
    return res.status(503).json({ verification: checks, database: 'not_verified' });
  }

  const url = process.env.DATABASE_URL;
  if (!url) return res.status(503).json({ database: 'not_configured' });

  try {
    const sql = neon(url);
    const rows = await sql`SELECT 1::integer AS ok`;
    if (rows[0]?.ok !== 1) {
      return res.status(503).json({ database: 'unavailable' });
    }
    return res.status(200).json({ database: 'connected', ...(verify ? { verification: checks } : {}) });
  } catch (error) {
    // Never return the error object: connection failures can contain secret
    // credentials, host names, or the underlying connection URL.
    console.error('Database health check failed');
    return res.status(503).json({ database: 'unavailable' });
  }
}
