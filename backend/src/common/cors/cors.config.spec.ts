import {
  buildCorsOptions,
  CORS_ALLOWED_HEADERS,
  CORS_ALLOWED_METHODS,
  CORS_EXPOSED_HEADERS,
  parseAllowedOrigins,
} from './cors.config';

describe('parseAllowedOrigins', () => {
  it.each([undefined, '', '   ', ' , ,'])(
    'returns an empty list (CORS off) for %j',
    (raw) => {
      expect(parseAllowedOrigins(raw)).toEqual([]);
    },
  );

  it('parses a single exact origin', () => {
    expect(parseAllowedOrigins('http://localhost:3000')).toEqual([
      'http://localhost:3000',
    ]);
  });

  it('parses several origins, trimming spaces and ignoring empty entries', () => {
    expect(
      parseAllowedOrigins(
        ' http://localhost:3000 , https://app.trustflow.example ,, ',
      ),
    ).toEqual(['http://localhost:3000', 'https://app.trustflow.example']);
  });

  it('removes duplicates', () => {
    expect(
      parseAllowedOrigins('http://localhost:3000,http://localhost:3000'),
    ).toEqual(['http://localhost:3000']);
  });

  it.each(['*', 'https://*.trustflow.example', 'http://localhost:3000,*'])(
    'rejects any wildcard: %j',
    (raw) => {
      expect(() => parseAllowedOrigins(raw)).toThrow(
        /wildcards are not allowed/,
      );
    },
  );

  it.each([
    ['no scheme', 'localhost:3000'],
    ['bare host', 'app.trustflow.example'],
    ['not a url', 'not a url'],
    ['literal null', 'null'],
  ])('rejects an invalid origin (%s)', (_label, raw) => {
    expect(() => parseAllowedOrigins(raw)).toThrow(
      /not a valid origin|http or https/,
    );
  });

  it.each([
    ['ftp://files.example'],
    ['file:///etc/passwd'],
    ['javascript:alert(1)'],
  ])('rejects a non-http(s) scheme: %s', (raw) => {
    expect(() => parseAllowedOrigins(raw)).toThrow(
      /http or https|not a valid origin/,
    );
  });

  it.each([
    ['trailing slash', 'http://localhost:3000/'],
    ['path', 'https://app.trustflow.example/app'],
    ['query', 'https://app.trustflow.example?x=1'],
    ['default https port', 'https://app.trustflow.example:443'],
    ['uppercase host', 'https://App.TrustFlow.example'],
    ['credentials in url', 'https://user:pw@app.trustflow.example'],
  ])('rejects something that is not a bare browser origin (%s)', (_l, raw) => {
    expect(() => parseAllowedOrigins(raw)).toThrow(/bare origin/);
  });

  it('allows http origins outside production', () => {
    expect(parseAllowedOrigins('http://localhost:3000', 'development')).toEqual(
      ['http://localhost:3000'],
    );
    expect(parseAllowedOrigins('http://localhost:3000', 'test')).toEqual([
      'http://localhost:3000',
    ]);
  });

  it('requires https in production', () => {
    expect(() =>
      parseAllowedOrigins('http://app.trustflow.example', 'production'),
    ).toThrow(/https in production/);
    expect(
      parseAllowedOrigins('https://app.trustflow.example', 'production'),
    ).toEqual(['https://app.trustflow.example']);
  });
});

describe('buildCorsOptions', () => {
  const origins = ['http://localhost:3000', 'https://app.trustflow.example'];
  const options = buildCorsOptions(origins);

  it('uses the exact origin list and never a wildcard', () => {
    expect(options.origin).toEqual(origins);
    expect(JSON.stringify(options)).not.toContain('"*"');
  });

  it('keeps credentials off (bearer tokens only)', () => {
    expect(options.credentials).toBe(false);
  });

  it('allows only the methods the API uses', () => {
    expect(options.methods).toEqual([
      'GET',
      'POST',
      'PATCH',
      'DELETE',
      'OPTIONS',
    ]);
    expect(options.methods).toEqual([...CORS_ALLOWED_METHODS]);
  });

  it('allows only Authorization and Content-Type request headers', () => {
    expect(options.allowedHeaders).toEqual(['Authorization', 'Content-Type']);
    expect(options.allowedHeaders).toEqual([...CORS_ALLOWED_HEADERS]);
  });

  it('exposes real header names, with no invalid prefix wildcard', () => {
    expect(options.exposedHeaders).toEqual([...CORS_EXPOSED_HEADERS]);
    expect(options.exposedHeaders).toContain('Retry-After');
    for (const header of options.exposedHeaders as string[]) {
      expect(header).not.toContain('*');
    }
  });

  it('does not share its arrays with the exported constants', () => {
    (options.origin as string[]).push('https://evil.example');
    expect(buildCorsOptions(origins).origin).toEqual(origins);
  });
});
