import type { CallToolResult } from '@modelcontextprotocol/server';
import type * as z from 'zod/v4';

import { SYNTHETIC_SLICE_POLICY } from '../policy/slice-policy.js';

const PUBLIC_ERROR_CODES = new Set([
    'invalid_input',
    'authentication_required',
    'insufficient_scope',
    'access_denied',
    'rate_limited',
    'dependency_unavailable',
    'incompatible_source',
    'idempotency_conflict',
    'response_too_large',
    'not_found',
    'invalid_cursor',
    'request_cancelled',
    'internal_error'
]);

function publicErrorCode(error: unknown): string {
    if (typeof error !== 'object' || error === null || !('code' in error)) return 'internal_error';
    const code = Reflect.get(error, 'code');
    return typeof code === 'string' && PUBLIC_ERROR_CODES.has(code) ? code : 'internal_error';
}

export function errorToolResult(error: unknown): CallToolResult {
    const code = publicErrorCode(error);
    return {
        content: [{ type: 'text', text: `${code}: the request could not be completed.` }],
        isError: true
    };
}

export function successToolResult<TSchema extends z.ZodType>(
    schema: TSchema,
    value: unknown,
    genericText: string,
    maxResponseBytes = SYNTHETIC_SLICE_POLICY.maxResponseBytes
): CallToolResult {
    const structuredContent = schema.parse(value) as Record<string, unknown>;
    if (Buffer.byteLength(JSON.stringify(structuredContent), 'utf8') > maxResponseBytes) {
        return errorToolResult({ code: 'response_too_large' });
    }
    return {
        content: [{ type: 'text', text: genericText }],
        structuredContent
    };
}
