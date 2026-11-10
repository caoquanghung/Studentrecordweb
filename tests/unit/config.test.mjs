import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const configSource = readFileSync(
  new URL('../../src/lib/study/config.ts', import.meta.url),
  'utf8',
);

function loadConfig(environment = {}) {
  const exported = { exports: {} };
  const source = ts.transpileModule(configSource, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;

  vm.runInNewContext(source, {
    module: exported,
    exports: exported.exports,
    process: { env: environment },
    require(name) {
      if (name === 'server-only') return {};
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });

  return exported.exports;
}

test('uses one configurable reservation policy without coupling it to liveness', () => {
  const { getStudyConfig } = loadConfig({
    NODE_ENV: 'test',
    STUDY_RESERVATION_DURATION_SECONDS: '73',
    STUDY_HEARTBEAT_INTERVAL_SECONDS: '4',
    STUDY_CONNECTION_TIMEOUT_SECONDS: '19',
    STUDY_TELEMETRY_FLUSH_SECONDS: '7',
  });

  assert.deepEqual(
    JSON.parse(JSON.stringify(getStudyConfig())),
    {
      reservationDurationSeconds: 73,
      heartbeatIntervalSeconds: 4,
      connectionTimeoutSeconds: 19,
      telemetryFlushSeconds: 7,
      playbackSampleSeconds: 1,
      maxBufferingSeconds: 5,
      readinessTtlSeconds: 120,
      readinessSampleBytes: 1048576,
      readinessTimeoutSeconds: 15,
      streamBitrateMargin: 1.5,
      minimumStreamMbps: 2,
      minimumPlaybackRatio: 0.9,
      assignmentMode: 'development-stub',
      demoMode: true,
    },
  );
});

test('rejects malformed durations and a timeout that cannot outlive a heartbeat', () => {
  for (const [name, value] of [
    ['STUDY_RESERVATION_DURATION_SECONDS', '0'],
    ['STUDY_RESERVATION_DURATION_SECONDS', '-1'],
    ['STUDY_RESERVATION_DURATION_SECONDS', '1.5'],
    ['STUDY_TELEMETRY_FLUSH_SECONDS', 'NaN'],
  ]) {
    const { getStudyConfig } = loadConfig({ NODE_ENV: 'test', [name]: value });
    assert.throws(() => getStudyConfig(), new RegExp(`${name} must be a positive integer`));
  }

  for (const timeout of ['5', '4']) {
    const { getStudyConfig } = loadConfig({
      NODE_ENV: 'test',
      STUDY_HEARTBEAT_INTERVAL_SECONDS: '5',
      STUDY_CONNECTION_TIMEOUT_SECONDS: timeout,
    });
    assert.throws(() => getStudyConfig(), /must be greater than the heartbeat interval/);
  }

  const invalidRatio = loadConfig({ NODE_ENV: 'test', STUDY_MIN_PLAYBACK_RATIO: '1.1' });
  assert.throws(() => invalidRatio.getStudyConfig(), /must be at most 1/);
});

test('fails closed when a production deployment would use the fixture selector', () => {
  const fixture = loadConfig({ NODE_ENV: 'production' });
  assert.throws(
    () => fixture.getStudyConfig(),
    /Production requires STUDY_ASSIGNMENT_MODE=configured/,
  );

  const configured = loadConfig({
    NODE_ENV: 'production',
    STUDY_ASSIGNMENT_MODE: 'configured',
    STUDENTWEB_DEMO_MODE: 'true',
  });
  const result = configured.getStudyConfig();
  assert.equal(result.assignmentMode, 'configured');
  assert.equal(result.demoMode, false, 'production cannot enable demo identity through an environment toggle');
});

test('reports external service readiness only when both sides of identity and the database are configured', () => {
  const absent = loadConfig({});
  assert.equal(absent.isClerkConfigured(), false);
  assert.equal(absent.isDatabaseConfigured(), false);

  const partial = loadConfig({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_example' });
  assert.equal(partial.isClerkConfigured(), false);

  const ready = loadConfig({
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_example',
    CLERK_SECRET_KEY: 'sk_test_example',
    DATABASE_URL: 'postgresql://example.invalid/database',
  });
  assert.equal(ready.isClerkConfigured(), true);
  assert.equal(ready.isDatabaseConfigured(), true);
});
