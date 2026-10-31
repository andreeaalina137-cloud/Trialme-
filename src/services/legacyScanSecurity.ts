export interface LegacyScanEnvironment {
  ENABLE_LEGACY_AI_SCAN_ENDPOINT?: string;
  LEGACY_AI_SCAN_SHARED_SECRET?: string;
}

/**
 * The legacy Gemini endpoint is intentionally opt-in. The production scanner
 * is local-first and does not require this route.
 */
export function isLegacyAiScanEnabled(env: LegacyScanEnvironment): boolean {
  return env.ENABLE_LEGACY_AI_SCAN_ENDPOINT === 'true'
    && Boolean(env.LEGACY_AI_SCAN_SHARED_SECRET?.trim())
    && (env.LEGACY_AI_SCAN_SHARED_SECRET?.trim().length ?? 0) >= 32;
}

export function isAuthorizedLegacyScanRequest(
  authorizationHeader: string | undefined,
  expectedSecret: string | undefined,
): boolean {
  const secret = expectedSecret?.trim();
  if (!secret || secret.length < 32 || !authorizationHeader) return false;
  return authorizationHeader === `Bearer ${secret}`;
}

/** Never return provider errors, request bodies, or statement content to logs. */
export function classifyLegacyScanError(error: unknown): 'service_unavailable' | 'provider_error' | 'unknown' {
  const candidate = error as { status?: unknown; statusCode?: unknown; message?: unknown } | null;
  const message = typeof candidate?.message === 'string' ? candidate.message.toLowerCase() : '';
  const status = candidate?.status === 503 || candidate?.statusCode === 503;
  if (
    status ||
    message.includes('503') ||
    message.includes('unavailable') ||
    message.includes('overloaded') ||
    message.includes('resource exhausted')
  ) {
    return 'service_unavailable';
  }
  if (message) return 'provider_error';
  return 'unknown';
}
