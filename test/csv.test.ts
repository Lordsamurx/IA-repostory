// Testes da geração de CSV segura (CSV injection). Rode com: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, toCsv } from '../src/lib/csv.ts';

test('neutraliza células que começam com = + - @ tab ou CR', () => {
  const perigosos = ['=HYPERLINK("http://evil")', '+cmd|calc', '-1+1', '@SOMA(A1)', '\tcmd', '\rcmd', '  =1+1'];
  for (const v of perigosos) {
    const cell = csvCell(v);
    assert.ok(cell.startsWith(`"'`), `não neutralizou ${JSON.stringify(v)} -> ${cell}`);
  }
});

test('texto comum continua igual, só com aspas escapadas', () => {
  assert.equal(csvCell('Ana Maria'), '"Ana Maria"');
  assert.equal(csvCell('diz "oi"'), '"diz ""oi"""');
});

test('números não são alterados (inclusive negativos)', () => {
  assert.equal(csvCell(-5), '"-5"');
  assert.equal(csvCell(1234.5), '"1234.5"');
});

test('nulos e indefinidos viram célula vazia', () => {
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell(undefined), '""');
});

test('toCsv separa por ponto e vírgula e quebra linhas', () => {
  assert.equal(toCsv([['Nome', 'Valor'], ['=x', 2]]), '"Nome";"Valor"\n"\'=x";"2"');
});
