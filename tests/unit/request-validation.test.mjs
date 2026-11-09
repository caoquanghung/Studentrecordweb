import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = ts.transpileModule(
  readFileSync(new URL('../../src/lib/study/errors.ts', import.meta.url), 'utf8'),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  },
).outputText;

const exported = { exports: {} };
vm.runInNewContext(source, {
  module: exported,
  exports: exported.exports,
  Error,
  console,
  require(name) {
    if (name === 'next/server') {
      return { NextResponse: { json: (body, init) => ({ body, ...init }) } };
    }
    throw new Error(`Unexpected dependency: ${name}`);
  },
});

const { requireObject, requireUuid } = exported.exports;

test('accepts JSON records but rejects arrays, null, and scalars as mutation payloads', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(requireObject({ answer: 2 }))), { answer: 2 });
  for (const value of [null, [], 'answer', 2, true]) {
    assert.throws(() => requireObject(value), (cause) => (
      cause.code === 'INVALID_REQUEST'
      && cause.status === 422
      && /JSON object/.test(cause.message)
    ));
  }
});

test('UUID validation accepts supported versions and rejects ambiguous identifiers', () => {
  for (const id of [
    '123e4567-e89b-12d3-a456-426614174000',
    '123e4567-e89b-82d3-b456-426614174000',
  ]) {
    assert.equal(requireUuid(id, 'attemptId'), id);
  }

  for (const id of [
    '../attempt',
    '123e4567-e89b-02d3-a456-426614174000',
    '123e4567-e89b-12d3-7456-426614174000',
    '123E4567E89B12D3A456426614174000',
    123,
  ]) {
    assert.throws(() => requireUuid(id, 'attemptId'), (cause) => (
      cause.code === 'INVALID_REQUEST'
      && cause.status === 422
      && /attemptId must be a UUID/.test(cause.message)
    ));
  }
});
