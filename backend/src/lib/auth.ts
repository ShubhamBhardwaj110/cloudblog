import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { env } from './env.js';
import { type ApiEvent, HttpError } from './http.js';

export interface User {
  sub: string;
  email: string;
  name?: string;
  isAdmin: boolean;
}

/**
 * API Gateway's JWT authorizer has already verified signature, issuer, audience
 * and expiry of the Cognito ID token before the Lambda runs. We only read claims.
 */
export function getUser(event: ApiEvent): User {
  const claims = (event as APIGatewayProxyEventV2WithJWTAuthorizer).requestContext.authorizer?.jwt?.claims;
  if (!claims?.sub) throw new HttpError(401, 'Sign in required');
  if (claims.token_use && claims.token_use !== 'id') throw new HttpError(401, 'An ID token is required');
  const raw = claims['cognito:groups'];
  const groups = Array.isArray(raw) ? raw.map(String) : String(raw ?? '').replace(/^\[|\]$/g, '').split(/[\s,]+/);
  return {
    sub: String(claims.sub),
    email: String(claims.email ?? ''),
    name: claims.name ? String(claims.name) : undefined,
    isAdmin: groups.includes(env.adminGroup),
  };
}

export function requireAdmin(user: User): void {
  if (!user.isAdmin) throw new HttpError(403, 'Admin access required');
}
