// Testes do hash de senhas do modo local. Rode com: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_PASSWORD_HASH, hashPassword, verifyPassword } from '../src/lib/password.ts';

test('o hash da demonstração confere com demo123 e não com outra senha', async () => {
  assert.equal(await verifyPassword('demo123', DEMO_PASSWORD_HASH), true);
  assert.equal(await verifyPassword('demo124', DEMO_PASSWORD_HASH), false);
});

test('o hash não contém a senha e usa salt aleatório', async () => {
  const a = await hashPassword('segredo-123');
  const b = await hashPassword('segredo-123');
  assert.ok(!a.includes('segredo-123'));
  assert.notEqual(a, b);
  assert.equal(await verifyPassword('segredo-123', a), true);
  assert.equal(await verifyPassword('segredo-124', a), false);
});

test('formatos inválidos ou desconhecidos nunca autenticam', async () => {
  assert.equal(await verifyPassword('x', 'md5$1$a$b'), false);
  assert.equal(await verifyPassword('demo123', 'demo123'), false);
  assert.equal(await verifyPassword('x', ''), false);
  assert.equal(await verifyPassword('x', 'pbkdf2-sha256$0$YQ==$YQ=='), false);
});
