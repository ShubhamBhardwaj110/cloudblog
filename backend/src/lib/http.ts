import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import { ZodError, type ZodType } from 'zod';

export type ApiEvent = APIGatewayProxyEventV2 | APIGatewayProxyEventV2WithJWTAuthorizer;
export type ApiResult = APIGatewayProxyStructuredResultV2;

/** An error that is safe to show to the client. Anything else becomes a generic 500. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`);

export function json(status: number, body: unknown, headers: Record<string, string> = {}): ApiResult {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
    body: JSON.stringify(body),
  };
}

export function parseBody<T>(event: ApiEvent, schema: ZodType<T>): T {
  let raw: unknown;
  try {
    const text = event.isBase64Encoded && event.body ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON');
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new HttpError(422, 'Validation failed', formatZod(result.error));
  }
  return result.data;
}

function formatZod(err: ZodError) {
  return err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
}

type Handler = (event: ApiEvent, params: Record<string, string>) => Promise<ApiResult>;

/**
 * Tiny router keyed on API Gateway's routeKey ("GET /posts/{slug}").
 * API Gateway already did the path matching, so we only dispatch.
 */
export function router(routes: Record<string, Handler>) {
  return async (event: ApiEvent): Promise<ApiResult> => {
    const route = routes[event.routeKey];
    try {
      if (!route) throw new HttpError(404, `No route for ${event.routeKey}`);
      const params: Record<string, string> = {};
      for (const [k, v] of Object.entries(event.pathParameters ?? {})) {
        if (v !== undefined) params[k] = decodeURIComponent(v);
      }
      return await route(event, params);
    } catch (err) {
      if (err instanceof HttpError) {
        return json(err.status, { error: err.message, details: err.details });
      }
      // Log full detail for CloudWatch, never leak it to clients.
      console.error(JSON.stringify({ level: 'error', routeKey: event.routeKey, message: (err as Error).message, stack: (err as Error).stack }));
      return json(500, { error: 'Internal server error', requestId: event.requestContext.requestId });
    }
  };
}

export function query(event: ApiEvent, name: string): string | undefined {
  return event.queryStringParameters?.[name];
}
