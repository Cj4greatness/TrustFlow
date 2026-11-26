import { DEFAULT_IPV6_SUBNET_PREFIX, normalizeIp } from '@nestjs/throttler';

interface AuthClientIpRequest {
  headers?: unknown;
  ip?: unknown;
}

const isTestEnvironment = (): boolean =>
  process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;

export function getAuthClientIp(request: AuthClientIpRequest): string {
  if (isTestEnvironment()) {
    const headers = request.headers;
    const testIp =
      typeof headers === 'object' &&
      headers !== null &&
      'x-test-client-ip' in headers
        ? headers['x-test-client-ip']
        : undefined;
    if (typeof testIp === 'string' && testIp.length > 0) {
      return testIp;
    }
  }

  return normalizeIp(
    typeof request.ip === 'string' ? request.ip : '',
    DEFAULT_IPV6_SUBNET_PREFIX,
  );
}
