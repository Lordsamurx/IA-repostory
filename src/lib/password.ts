/**
 * Senhas do modo local (demonstração no navegador).
 *
 * Nunca guardamos a senha em texto puro: usamos PBKDF2-HMAC-SHA256 (Web Crypto)
 * com salt aleatório. Formato guardado:
 *   pbkdf2-sha256$<iterações>$<salt em base64>$<hash em base64>
 *
 * Este módulo não tem imports, para poder ser testado com o Node diretamente.
 */
const PREFIX = 'pbkdf2-sha256';
const ITERATIONS = 600_000;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

/**
 * Hash da senha de demonstração "demo123" (salt fixo, público: a senha do modo demo é conhecida).
 * Serve para o login demo funcionar sem guardar a senha em texto puro.
 */
export const DEMO_PASSWORD_HASH = 'pbkdf2-sha256$600000$bGVhZGZsb3ctZGVtby12MQ==$PG88gXk86l4S4t0xRxB3VCc0uqAf1+S1dv99wV9yECw=';

function subtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c?.subtle) {
    throw new Error('Este navegador não oferece criptografia segura. Abra o CRM em HTTPS ou em localhost para usar o modo local.');
  }
  return c.subtle;
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (s: string) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await subtle().importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle().deriveBits({ name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' }, key, KEY_BYTES * 8);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  subtle();
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, ITERATIONS);
  return `${PREFIX}$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [prefix, iter, saltB64, hashB64] = stored.split('$');
  if (prefix !== PREFIX || !iter || !saltB64 || !hashB64) return false;
  const iterations = Number(iter);
  if (!Number.isInteger(iterations) || iterations < 1) return false;
  const expected = fromBase64(hashB64);
  const actual = await derive(password, fromBase64(saltB64), iterations);
  return constantTimeEqual(actual, expected);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/**
 * Confere a senha de uma conta do modo local.
 * Conta com hash: verifica o hash. Conta antiga (senha em texto puro): aceita uma vez
 * e devolve o hash novo para o store gravar no lugar da senha em texto puro.
 */
export async function checkAccountPassword(
  account: { passwordHash?: string; password?: string },
  password: string,
): Promise<{ ok: boolean; passwordHash?: string }> {
  if (account.passwordHash) return { ok: await verifyPassword(password, account.passwordHash) };
  if (account.password && account.password === password) return { ok: true, passwordHash: await hashPassword(password) };
  return { ok: false };
}
