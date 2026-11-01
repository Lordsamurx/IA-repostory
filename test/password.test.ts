// Testes do hash de senhas do modo local. Rode com: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAccountPassword, DEMO_PASSWORD_HASH, hashPassword, verifyPassword } from '../src/lib/password.ts';

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

test('conta antiga com senha em texto puro entra uma vez e recebe hash', async () => {
  const r = await checkAccountPassword({ password: 'antiga-1' }, 'antiga-1');
  assert.equal(r.ok, true);
  assert.ok(r.passwordHash?.startsWith('pbkdf2-sha256$'));
  assert.ok(!r.passwordHash?.includes('antiga-1'));
  assert.equal(await verifyPassword('antiga-1', r.passwordHash!), true);
});

test('conta antiga com senha errada não entra e não recebe hash', async () => {
  assert.deepEqual(await checkAccountPassword({ password: 'antiga-1' }, 'outra'), { ok: false });
});

test('conta antiga com senha vazia nunca entra', async () => {
  assert.deepEqual(await checkAccountPassword({ password: '' }, ''), { ok: false });
  assert.deepEqual(await checkAccountPassword({}, ''), { ok: false });
});

test('conta com hash confere pelo hash e não gera hash novo', async () => {
  const h = await hashPassword('nova-2');
  assert.deepEqual(await checkAccountPassword({ passwordHash: h }, 'nova-2'), { ok: true });
  assert.deepEqual(await checkAccountPassword({ passwordHash: h }, 'errada'), { ok: false });
});
