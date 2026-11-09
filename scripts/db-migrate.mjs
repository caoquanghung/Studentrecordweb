import { existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDirectory = join(projectRoot, 'database', 'migrations');
const command = process.argv[2] ?? 'migrate';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is missing. Add it to .env.local or export it in the current shell.');
  process.exit(1);
}

function findPsql() {
  const candidates = [process.env.PSQL_PATH, 'psql', '/opt/homebrew/opt/libpq/bin/psql', '/usr/local/opt/libpq/bin/psql'].filter(Boolean);
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ['--version'], { encoding: 'utf8', stdio: 'pipe' });
    if (result.status === 0) return candidate;
  }
  console.error('psql was not found. Install libpq or set PSQL_PATH.');
  process.exit(1);
}

function connectionEnvironment(value) {
  let url;
  try { url = new URL(value); } catch { console.error('DATABASE_URL is invalid.'); process.exit(1); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    console.error('DATABASE_URL must use postgres:// or postgresql://.');
    process.exit(1);
  }
  return {
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: url.searchParams.get('sslmode') || 'require',
  };
}

const psql = findPsql();
const environment = { ...process.env, ...connectionEnvironment(process.env.DATABASE_URL) };
function run(args, options = {}) {
  const result = spawnSync(psql, ['--no-psqlrc', '--set=ON_ERROR_STOP=1', ...args], {
    cwd: projectRoot, env: environment, encoding: 'utf8', ...options,
  });
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  return result.stdout ?? '';
}

run(['--command', `CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(255) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`]);

if (!existsSync(migrationsDirectory)) throw new Error(`Migration directory not found: ${migrationsDirectory}`);
const files = readdirSync(migrationsDirectory).filter((file) => file.endsWith('.sql')).sort();
for (const file of files) {
  if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(file)) throw new Error(`Invalid migration filename: ${file}`);
}
const applied = new Set(run(['--tuples-only', '--no-align', '--command', 'SELECT version FROM schema_migrations ORDER BY version;'])
  .split('\n').map((value) => value.trim()).filter(Boolean));

if (command === 'status') {
  for (const file of files) {
    const version = file.slice(0, -4);
    console.log(`${applied.has(version) ? 'applied' : 'pending'}  ${version}`);
  }
  process.exit(0);
}

if (command === 'verify') {
  run(['--command', `DO $$
  DECLARE object_name TEXT;
  BEGIN
    FOREACH object_name IN ARRAY ARRAY[
      'app_users','invitations','participants','study_config','consents','combinations',
      'combination_versions','combination_videos','assignments','readiness_results',
      'attempts','form_responses','telemetry_events','idempotency_keys','admin_audit_log'
    ] LOOP
      IF to_regclass('public.' || object_name) IS NULL THEN
        RAISE EXCEPTION 'Missing table: %', object_name;
      END IF;
    END LOOP;
    IF to_regprocedure('reserve_study_assignment(uuid,uuid,integer,text,jsonb,integer)') IS NULL THEN
      RAISE EXCEPTION 'Missing reserve_study_assignment';
    END IF;
    IF to_regprocedure('start_study_attempt(uuid,uuid,text,integer)') IS NULL THEN
      RAISE EXCEPTION 'Missing start_study_attempt';
    END IF;
    IF to_regprocedure('invalidate_study_attempt(uuid,uuid,bigint,text)') IS NULL THEN
      RAISE EXCEPTION 'Missing invalidate_study_attempt';
    END IF;
    IF to_regprocedure('complete_study_attempt(uuid,uuid,bigint)') IS NULL THEN
      RAISE EXCEPTION 'Missing complete_study_attempt';
    END IF;
  END $$;`]);
  console.log('Database schema verified.');
  process.exit(0);
}

if (command !== 'migrate') {
  console.error(`Unknown command "${command}". Use migrate, status, or verify.`);
  process.exit(1);
}

let count = 0;
for (const file of files) {
  const version = file.slice(0, -4);
  if (applied.has(version)) continue;
  const migrationPath = join(migrationsDirectory, file).replaceAll("'", "''");
  const input = `\\i '${migrationPath}'\nINSERT INTO schema_migrations (version) VALUES ('${version}');\n`;
  console.log(`Applying ${version}...`);
  run(['--single-transaction', '--file=-'], { input });
  count += 1;
}
console.log(count ? `Applied ${count} migration(s).` : 'Database is already up to date.');
