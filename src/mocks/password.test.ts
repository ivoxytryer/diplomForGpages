import { describe, expect, it } from 'vitest';
import {
  generateTemporaryPassword,
  hashPassword,
  verifyPassword,
} from './password';

describe('password mock helpers', () => {
  it('hashes a password without keeping it in plain text', () => {
    const hash = hashPassword('demo1234', 'u1');
    expect(hash).not.toContain('demo1234');
    expect(hash.startsWith('mock-fnv1a$u1$')).toBe(true);
  });

  it('verifies the correct password only', () => {
    const hash = hashPassword('demo1234', 'u1');
    expect(verifyPassword('demo1234', hash)).toBe(true);
    expect(verifyPassword('demo12345', hash)).toBe(false);
    expect(verifyPassword('demo1234', undefined)).toBe(false);
  });

  it('uses an individual salt for each user', () => {
    const first = hashPassword('demo1234', 'u1');
    const second = hashPassword('demo1234', 'u2');
    expect(first).not.toBe(second);
    expect(verifyPassword('demo1234', first)).toBe(true);
    expect(verifyPassword('demo1234', second)).toBe(true);
  });

  it('generates readable temporary passwords', () => {
    const password = generateTemporaryPassword();
    expect(password).toHaveLength(12);
    expect(password).toMatch(/^[A-Za-z2-9]+$/);
    expect(generateTemporaryPassword()).not.toBe(password);
  });
});
