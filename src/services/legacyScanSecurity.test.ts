import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyLegacyScanError,
  isAuthorizedLegacyScanRequest,
  isLegacyAiScanEnabled,
} from './legacyScanSecurity.ts';

const validSecret = 'a'.repeat(48);

test('legacy remote scanning is disabled unless explicitly enabled with a strong secret', () => {
  assert.equal(isLegacyAiScanEnabled({}), false);
  assert.equal(isLegacyAiScanEnabled({
    ENABLE_LEGACY_AI_SCAN_ENDPOINT: 'true',
    LEGACY_AI_SCAN_SHARED_SECRET: 'short',
  }), false);
  assert.equal(isLegacyAiScanEnabled({
    ENABLE_LEGACY_AI_SCAN_ENDPOINT: 'false',
    LEGACY_AI_SCAN_SHARED_SECRET: validSecret,
  }), false);
  assert.equal(isLegacyAiScanEnabled({
    ENABLE_LEGACY_AI_SCAN_ENDPOINT: 'true',
    LEGACY_AI_SCAN_SHARED_SECRET: validSecret,
  }), true);
});

test('legacy endpoint authorization requires an exact bearer secret', () => {
  assert.equal(isAuthorizedLegacyScanRequest(undefined, validSecret), false);
  assert.equal(isAuthorizedLegacyScanRequest(`Bearer ${validSecret.slice(0, 20)}`, validSecret), false);
  assert.equal(isAuthorizedLegacyScanRequest(`Bearer ${validSecret}`, validSecret), true);
  assert.equal(isAuthorizedLegacyScanRequest(`bearer ${validSecret}`, validSecret), false);
});

test('legacy scan error classification does not expose sensitive error content', () => {
  assert.equal(classifyLegacyScanError({ status: 503, message: 'statement-data-secret' }), 'service_unavailable');
  assert.equal(classifyLegacyScanError({ message: 'provider rejected private statement text' }), 'provider_error');
  assert.equal(classifyLegacyScanError({}), 'unknown');
});
