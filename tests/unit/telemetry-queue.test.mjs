import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = ts.transpileModule(
  readFileSync(new URL('../../src/lib/study/telemetry-client.ts', import.meta.url), 'utf8'),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  },
).outputText;

function fixture(acceptedThrough = Number.MAX_SAFE_INTEGER) {
  const store = new Map();
  const sent = [];
  const exported = { exports: {} };
  vm.runInNewContext(source, {
    module: exported,
    exports: exported.exports,
    require(name) {
      if (name === 'idb-keyval') {
        return {
          get: async (key) => store.get(key),
          set: async (key, value) => { store.set(key, value); },
          del: async (key) => { store.delete(key); },
        };
      }
      if (name === './client') {
        return {
          studyClient: {
            events: async (attemptId, controlVersion, events) => {
              sent.push({ attemptId, controlVersion, events });
              return { acceptedThrough };
            },
          },
        };
      }
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return { api: exported.exports, sent, store };
}

function event(eventId, sequence) {
  return {
    eventId, sequence, eventType: 'video_progress', clientWallTime: new Date().toISOString(),
    clientMonotonicMs: sequence * 1000, payload: { mediaTime: sequence },
  };
}

test('queues retryable events once and sends them in sequence-preserving batches', async () => {
  const { api, sent } = fixture(2);
  await api.enqueueTelemetry('attempt-a', event('one', 1));
  await api.enqueueTelemetry('attempt-a', event('one', 1));
  await api.enqueueTelemetry('attempt-a', event('two', 2));

  assert.deepEqual(
    JSON.parse(JSON.stringify(await api.readTelemetryQueue('attempt-a'))).map((item) => item.eventId),
    ['one', 'two'],
  );
  assert.equal(await api.flushTelemetry('attempt-a', 7), 2);
  assert.equal(sent.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(sent[0].events.map((item) => item.sequence))), [1, 2]);
  assert.equal(sent[0].controlVersion, 7);
  assert.deepEqual(JSON.parse(JSON.stringify(await api.readTelemetryQueue('attempt-a'))), []);
});

test('removes only a contiguous acknowledged prefix and retains later events for retry', async () => {
  const { api, sent } = fixture(1);
  for (let sequence = 1; sequence <= 3; sequence += 1) {
    await api.enqueueTelemetry('attempt-b', event(`event-${sequence}`, sequence));
  }

  assert.equal(await api.flushTelemetry('attempt-b', 4), 1);
  assert.deepEqual(JSON.parse(JSON.stringify(sent[0].events.map((item) => item.sequence))), [1, 2, 3]);
  assert.deepEqual(
    JSON.parse(JSON.stringify(await api.readTelemetryQueue('attempt-b'))).map((item) => item.sequence),
    [2, 3],
  );
});

test('purges one attempt without deleting another attempt queue', async () => {
  const { api } = fixture();
  await api.enqueueTelemetry('attempt-a', event('a', 1));
  await api.enqueueTelemetry('attempt-b', event('b', 1));

  await api.purgeTelemetryQueue('attempt-a');
  assert.deepEqual(JSON.parse(JSON.stringify(await api.readTelemetryQueue('attempt-a'))), []);
  assert.deepEqual(
    JSON.parse(JSON.stringify(await api.readTelemetryQueue('attempt-b'))).map((item) => item.eventId),
    ['b'],
  );
});

test('bounds each network flush to 100 events and retains the rest', async () => {
  const { api, sent } = fixture(100);
  for (let sequence = 1; sequence <= 105; sequence += 1) {
    await api.enqueueTelemetry('attempt-c', event(`event-${sequence}`, sequence));
  }

  await api.flushTelemetry('attempt-c', 2);
  assert.equal(sent[0].events.length, 100);
  assert.deepEqual(
    JSON.parse(JSON.stringify(await api.readTelemetryQueue('attempt-c'))).map((item) => item.sequence),
    [101, 102, 103, 104, 105],
  );
});
