import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = ts.transpileModule(
  readFileSync(new URL('../../src/lib/study/http.ts', import.meta.url), 'utf8'),
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
  URL,
  require(name) {
    if (name === 'next/server') {
      return { NextResponse: { json: (body, init) => ({ body, ...init }) } };
    }
    if (name === '@/lib/study/errors') {
      return {
        StudyError: class StudyError extends Error {
          constructor(status, code, message) {
            super(message);
            this.status = status;
            this.code = code;
          }
        },
      };
    }
    throw new Error(`Unexpected dependency: ${name}`);
  },
});

const { enforceSameOrigin, jsonBody, requireSameOrigin } = exported.exports;

test('accepts same-origin mutations and rejects host, scheme-port, and malformed origins', () => {
  const request = (origin) => new Request('https://study.example.test/api/study/assignment', {
    method: 'POST',
    headers: origin === undefined ? {} : { origin },
  });

  assert.equal(requireSameOrigin(request()), true, 'non-browser clients without Origin remain eligible for auth checks');
  assert.equal(requireSameOrigin(request('https://study.example.test')), true);
  assert.equal(requireSameOrigin(request('https://study.example.test:443')), true);
  assert.equal(requireSameOrigin(request('https://study.example.test:444')), false);
  assert.equal(requireSameOrigin(request('https://other.example.test')), false);
  assert.equal(requireSameOrigin(request('not a url')), false);
});

test('raises a typed authorization error before a cross-origin mutation reaches domain code', () => {
  const request = new Request('https://study.example.test/api/study/assignment', {
    method: 'POST',
    headers: { origin: 'https://attacker.example.test' },
  });
  assert.throws(() => enforceSameOrigin(request), (cause) => (
    cause.status === 403
    && cause.code === 'CROSS_ORIGIN_REQUEST'
  ));
});

test('distinguishes malformed JSON from a valid JSON scalar for downstream schema validation', async () => {
  const valid = new Request('https://study.example.test/api/study/consent', {
    method: 'POST',
    body: 'false',
  });
  assert.equal(await jsonBody(valid), false);

  const invalid = new Request('https://study.example.test/api/study/consent', {
    method: 'POST',
    body: '{broken',
  });
  await assert.rejects(() => jsonBody(invalid), (cause) => (
    cause.status === 400
    && cause.code === 'INVALID_JSON'
  ));
});
