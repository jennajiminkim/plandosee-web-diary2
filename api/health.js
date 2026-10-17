// Task 7: connection-only health probe. No personal diary data is returned.
// This endpoint checks Neon reachability; it does not implement authentication.
import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ status: 'method_not_allowed' });
  }

  const url = process.env.DATABASE_URL;
  if (!url) return res.status(503).json({ database: 'not_configured' });

  try {
    const sql = neon(url);
    const rows = await sql`SELECT 1::integer AS ok`;
    if (rows[0]?.ok !== 1) {
      return res.status(503).json({ database: 'unavailable' });
    }
    return res.status(200).json({ database: 'connected' });
  } catch (error) {
    // Never return the error object: connection failures can contain secret
    // credentials, host names, or the underlying connection URL.
    console.error('Database health check failed');
    return res.status(503).json({ database: 'unavailable' });
  }
}
