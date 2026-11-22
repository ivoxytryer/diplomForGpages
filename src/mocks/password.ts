/**
 * Демонстрационное хеширование паролей для MSW-мока.
 *
 * Это НЕ криптографически стойкая схема: браузерный мок не должен хранить
 * пароли в открытом виде, но и настоящий Argon2id здесь не нужен. На реальном
 * бэкенде используется Argon2id/bcrypt — см. docs/BACKEND.md.
 */

const ALGORITHM = 'mock-fnv1a';
const ROUNDS = 3;
const TEMPORARY_PASSWORD_LENGTH = 12;
const PASSWORD_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

function fnv1a(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function hashPassword(password: string, salt: string) {
  let accumulator = `${salt}:${password}`;
  for (let round = 0; round < ROUNDS; round += 1) {
    accumulator =
      fnv1a(`${accumulator}|${salt}|${round}`) +
      fnv1a(`${round}|${password}|${accumulator}`);
  }
  return `${ALGORITHM}$${salt}$${accumulator}`;
}

export function verifyPassword(password: string, stored: string | undefined) {
  if (!stored) return false;
  const [algorithm, salt] = stored.split('$');
  if (algorithm !== ALGORITHM || !salt) return false;
  return hashPassword(password, salt) === stored;
}

export function generateTemporaryPassword() {
  const values = new Uint32Array(TEMPORARY_PASSWORD_LENGTH);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(values);
  } else {
    for (let index = 0; index < values.length; index += 1) {
      values[index] = Math.floor(Math.random() * 0xffffffff);
    }
  }
  return Array.from(values, (value) => PASSWORD_ALPHABET[value % PASSWORD_ALPHABET.length]).join(
    '',
  );
}
