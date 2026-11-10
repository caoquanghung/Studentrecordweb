import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = ts.transpileModule(
  readFileSync(new URL('../../src/lib/study/validation.ts', import.meta.url), 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
).outputText;

class StudyError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function requireObject(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new StudyError(422, 'INVALID_REQUEST', 'A JSON object is required.');
  }
  return value;
}

function requireUuid(value) {
  if (typeof value !== 'string') throw new StudyError(422, 'INVALID_REQUEST', 'UUID required.');
  return value;
}

const exported = { exports: {} };
vm.runInNewContext(source, {
  module: exported,
  exports: exported.exports,
  TextEncoder,
  Set,
  Number,
  Date,
  require(name) {
    if (name === '@/lib/study/errors') return { StudyError, requireObject, requireUuid };
    throw new Error(`Unexpected dependency: ${name}`);
  },
});

const { acknowledgedSequence, postStudyAnswers, preStudyAnswers } = exported.exports;

test('normalizes the complete pre-study contract and rejects missing selector inputs', () => {
  const valid = preStudyAnswers({
    age: '21', gender: 'prefer-not', education: 'undergraduate', major: ' HCI ',
    familiarity: '3', priorStudy: 'course', videoFrequency: 'weekly',
    languageComfort: '4', supportNeeds: '',
  });
  assert.equal(valid.age, 21);
  assert.equal(valid.familiarity, 3);
  assert.equal(valid.major, 'HCI');
  assert.throws(
    () => preStudyAnswers({ age: 21, education: 'undergraduate' }),
    (cause) => cause.code === 'INVALID_FORM_RESPONSE',
  );
});

test('requires every post-study scale and bounds free text', () => {
  const base = {
    understanding: '5', mentalDemand: '4', effort: '5', focusEase: '3',
    visualClarity: '6', audioClarity: '6', satisfaction: '5', pace: 'about-right',
    technicalProblem: 'no', distraction: 'no', helped: '', improve: '',
  };
  assert.equal(postStudyAnswers(base).satisfaction, 5);
  assert.throws(
    () => postStudyAnswers({ ...base, audioClarity: '8' }),
    (cause) => cause.code === 'INVALID_FORM_RESPONSE',
  );
  assert.throws(
    () => postStudyAnswers({ ...base, helped: 'x'.repeat(1001) }),
    (cause) => cause.code === 'INVALID_FORM_RESPONSE',
  );
});

test('completion acknowledgments must be positive safe integers', () => {
  assert.equal(acknowledgedSequence(7), 7);
  for (const value of [0, -1, 1.5, '7', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => acknowledgedSequence(value), (cause) => cause.code === 'INVALID_ACKNOWLEDGMENT');
  }
});
