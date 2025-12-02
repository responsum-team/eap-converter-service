import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
// use require to avoid TS module-not-found for jwks-rsa types
const jwksClient: any = require('jwks-rsa');

const TENANT_ID = process.env.AZURE_TENANT_ID || '';
const CLIENT_ID = process.env.AZURE_CLIENT_ID || '';

const jwksUri = `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`;
const issuer = `https://login.microsoftonline.com/${TENANT_ID}/v2.0`;

const client = jwksClient({
  jwksUri,
  cache: true,
  rateLimit: true,
  jwksRequestsPerMinute: 10,
});

function getSigningKeyAsync(kid: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!kid) return reject(new Error('No kid provided'));
    client.getSigningKey(kid, (err: any, key: any) => {
      if (err) return reject(err);
      const signingKey = key && (key.getPublicKey ? key.getPublicKey() : key.rsaPublicKey);
      if (!signingKey) return reject(new Error('Signing key not found'));
      resolve(signingKey);
    });
  });
}

export default async function azureJwtAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Indicate middleware is active for debugging
  console.log(`[auth] middleware invoked - path=${req.path} method=${req.method}`);

  // Allow unauthenticated health endpoints
  if (req.path === '/health' || req.path === '/healthz') {
    console.log('[auth] skipping auth for health endpoint');
    next();
    return;
  }

  const authHeader = (req.headers['authorization'] || req.headers['Authorization']) as string | undefined;
  if (!authHeader) {
    console.log('[auth] missing Authorization header');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = parts[1];
  let unverifiedHeader: { header?: any } | null = null;
  try {
    unverifiedHeader = jwt.decode(token, { complete: true }) as { header?: any } | null;
  } catch (err: any) {
    console.log('[auth] token decoding failed:', err && err.message ? err.message : String(err));
    res.status(401).json({ error: 'Unauthorized'});
    return;
  }

  const kid = unverifiedHeader?.header?.kid;
  if (!kid) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    console.log('[auth] fetching signing key for kid=', kid);
    const signingKey = await getSigningKeyAsync(kid);
    const verifyOptions: any = {
      audience: CLIENT_ID || undefined,
      issuer: issuer || undefined,
      algorithms: ['RS256'],
    };

    const payload = jwt.verify(token, signingKey, verifyOptions) as any;

    // Extra tenant validation similar to Python implementation
    if (payload && payload.tid && TENANT_ID && payload.tid !== TENANT_ID) {
      console.log('[auth] invalid tenant in token', payload.tid);
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    (req as any).user = payload;
    console.log('[auth] token valid for sub=', payload && payload.sub);
    next();
    return;
  } catch (err: any) {
    console.log('[auth] token verification failed:', err && err.message ? err.message : String(err));
    res.status(401).json({ error: 'Unauthorized'});
    return;
  }
}
