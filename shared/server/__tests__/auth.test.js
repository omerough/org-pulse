import { describe, it, expect, beforeEach, afterEach } from 'vitest'

const { proxySecretGuard, resolveJiraIdentity } = require('../auth');

function createMockReq(overrides = {}) {
  return {
    method: 'GET',
    path: '/api/roster',
    ip: '127.0.0.1',
    headers: {},
    ...overrides
  };
}

function createMockRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) { res.statusCode = code; return res; },
    json(data) { res.body = data; return res; }
  };
  return res;
}

describe('proxySecretGuard', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env.PROXY_AUTH_SECRET;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.PROXY_AUTH_SECRET;
    } else {
      process.env.PROXY_AUTH_SECRET = originalEnv;
    }
  });

  it('passes through when PROXY_AUTH_SECRET is not set', () => {
    delete process.env.PROXY_AUTH_SECRET;
    const req = createMockReq();
    const res = createMockRes();
    let called = false;
    proxySecretGuard(req, res, () => { called = true; });
    expect(called).toBe(true);
  });

  it('passes through when PROXY_AUTH_SECRET is empty string', () => {
    process.env.PROXY_AUTH_SECRET = '';
    const req = createMockReq();
    const res = createMockRes();
    let called = false;
    proxySecretGuard(req, res, () => { called = true; });
    expect(called).toBe(true);
  });

  it('passes through for OPTIONS requests even with secret set', () => {
    process.env.PROXY_AUTH_SECRET = 'test-secret';
    const req = createMockReq({ method: 'OPTIONS' });
    const res = createMockRes();
    let called = false;
    proxySecretGuard(req, res, () => { called = true; });
    expect(called).toBe(true);
  });

  it('passes through for /healthz path', () => {
    process.env.PROXY_AUTH_SECRET = 'test-secret';
    const req = createMockReq({ path: '/healthz' });
    const res = createMockRes();
    let called = false;
    proxySecretGuard(req, res, () => { called = true; });
    expect(called).toBe(true);
  });

  it('passes through for /api/healthz path', () => {
    process.env.PROXY_AUTH_SECRET = 'test-secret';
    const req = createMockReq({ path: '/api/healthz' });
    const res = createMockRes();
    let called = false;
    proxySecretGuard(req, res, () => { called = true; });
    expect(called).toBe(true);
  });

  it('passes through when valid secret is provided', () => {
    process.env.PROXY_AUTH_SECRET = 'test-secret';
    const req = createMockReq({ headers: { 'x-proxy-secret': 'test-secret' } });
    const res = createMockRes();
    let called = false;
    proxySecretGuard(req, res, () => { called = true; });
    expect(called).toBe(true);
  });

  it('returns 401 when secret is missing', () => {
    process.env.PROXY_AUTH_SECRET = 'test-secret';
    const req = createMockReq();
    const res = createMockRes();
    let called = false;
    proxySecretGuard(req, res, () => { called = true; });
    expect(called).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 when secret is invalid', () => {
    process.env.PROXY_AUTH_SECRET = 'test-secret';
    const req = createMockReq({ headers: { 'x-proxy-secret': 'wrong-secret' } });
    const res = createMockRes();
    let called = false;
    proxySecretGuard(req, res, () => { called = true; });
    expect(called).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });
});

describe('resolveJiraIdentity', () => {
  function makeStorage(files) {
    return (key) => files[key] ?? null;
  }

  it('returns null fields when uid is missing', () => {
    const readFromStorage = makeStorage({});
    expect(resolveJiraIdentity(readFromStorage, null)).toEqual({ jiraDisplayName: null, jiraAccountId: null });
  });

  it('returns null fields when the uid has no registry person', () => {
    const readFromStorage = makeStorage({
      'team-data/registry.json': { people: {} }
    });
    expect(resolveJiraIdentity(readFromStorage, 'jdoe')).toEqual({ jiraDisplayName: null, jiraAccountId: null });
  });

  it('returns null fields when the person has no Jira metrics cache entry', () => {
    const readFromStorage = makeStorage({
      'team-data/registry.json': { people: { jdoe: { name: 'Jane Doe' } } }
      // people/jane_doe.json intentionally absent
    });
    expect(resolveJiraIdentity(readFromStorage, 'jdoe')).toEqual({ jiraDisplayName: null, jiraAccountId: null });
  });

  it('resolves jiraDisplayName and jiraAccountId via the registry name and people cache', () => {
    const readFromStorage = makeStorage({
      'team-data/registry.json': { people: { jdoe: { name: 'Jane Doe' } } },
      'people/jane_doe.json': { jiraDisplayName: 'Jane Doe', jiraAccountId: '5e41b8c0-abc123' }
    });
    expect(resolveJiraIdentity(readFromStorage, 'jdoe')).toEqual({
      jiraDisplayName: 'Jane Doe',
      jiraAccountId: '5e41b8c0-abc123'
    });
  });

  it('returns jiraAccountId null when the cache entry has no account id', () => {
    const readFromStorage = makeStorage({
      'team-data/registry.json': { people: { jdoe: { name: 'Jane Doe' } } },
      'people/jane_doe.json': { jiraDisplayName: 'Jane Doe' }
    });
    expect(resolveJiraIdentity(readFromStorage, 'jdoe')).toEqual({
      jiraDisplayName: 'Jane Doe',
      jiraAccountId: null
    });
  });
});
