import {expect, test} from 'bun:test';
import {normalizeLoginReturn} from '../src/auth-return';

test('login keeps the product route, filters, referral intent and anchor', () => {
  for (const destination of ['/', '/finance', '/arc', '/dashboard',
    '/onchain/projects?saved=1#projects', '/projects?projectId=arc&linkId=referral']) {
    expect(normalizeLoginReturn(destination)).toBe(destination);
  }
});

test('authentication control parameters cannot reopen login on arrival', () => {
  expect(normalizeLoginReturn('/finance?lang=en&login=1&next=https%3A%2F%2Fevil.test&error=failed#cashflow'))
    .toBe('/finance?lang=en#cashflow');
});

test('foreign destinations, ambiguous slashes, credentials and auth loops return home', () => {
  for (const destination of [null, undefined, 1, '', 'https://evil.test', '//evil.test',
    '/\\evil.test', '/foo/..//evil.test', '/%2f%2fevil.test', '/%5cevil.test',
    '/finance\n', '/%0afinance', '/login', '/register?next=%2Farc', '/log%69n',
    '/api/auth/google/start', '/finance#email_token=private', '/bad%']) {
    expect(normalizeLoginReturn(destination)).toBe('/');
  }
});
