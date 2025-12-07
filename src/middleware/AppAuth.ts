import 'dotenv/config'; 
import type { MiddlewareHandler } from 'hono';
import { createHash } from 'node:crypto';

const SECRET = process.env.API_SECRET!;
const WINDOW = 240_000;

export const appAuth = (): MiddlewareHandler => async (c, next) => {
  const sig   = c.req.header('X-App-Signature');
  const ts    = c.req.header('X-App-Timestamp');
  if (!sig || !ts) return c.text('Missing creds', 401);

  const now = Date.now();
  if (Math.abs(now - Number(ts)) > WINDOW) return c.text('Stale', 401);

  const expected = createHash('sha256')
                     .update(`${SECRET}${ts}`)
                     .digest('hex');
  if (sig !== expected) return c.text('Bad sig', 401);

  await next();
};