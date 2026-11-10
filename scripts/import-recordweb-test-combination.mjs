import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { parseEnv } from 'node:util';
import { neon } from '@neondatabase/serverless';

const CHUNK_SIZE = 4_194_304;
const MAX_VIDEO_BYTES = 33_554_432;
const sourceIds = [];
let sourceFile;
let apply = false;

for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (argument === '--apply') apply = true;
  else if (argument === '--source-env') sourceFile = process.argv[++index];
  else if (argument === '--recording') sourceIds.push(process.argv[++index]);
  else throw new Error(`Unknown argument: ${argument}`);
}

if (!sourceFile || !sourceIds.length || sourceIds.length > 5 || new Set(sourceIds).size !== sourceIds.length
  || sourceIds.some((id) => !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id))) {
  throw new Error('Supply --source-env <file> and one to five unique --recording <UUID> values. Add --apply to import.');
}

const sourceEnvironment = parseEnv(readFileSync(resolve(sourceFile), 'utf8'));
if (!sourceEnvironment.DATABASE_URL || !process.env.DATABASE_URL) {
  throw new Error('Separate source and destination DATABASE_URL values are required.');
}

function databaseIdentity(value) {
  const url = new URL(value);
  return `${url.hostname.replace('-pooler.', '.')}${url.pathname}`;
}

if (databaseIdentity(sourceEnvironment.DATABASE_URL) === databaseIdentity(process.env.DATABASE_URL)) {
  throw new Error('The source Record Web database and destination Student Web database must be separate.');
}

const source = neon(sourceEnvironment.DATABASE_URL);
const target = neon(process.env.DATABASE_URL);
const rows = await source`SELECT id, duration_seconds, file_size_bytes, mime_type, storage_url
  FROM recordings WHERE id = ANY(${sourceIds}::uuid[]);`;
if (rows.length !== sourceIds.length) throw new Error('One or more selected Record Web recordings are missing.');

async function verifyAndHash(recording) {
  const sizeBytes = Number(recording.file_size_bytes);
  const durationSeconds = Number(recording.duration_seconds);
  const mimeType = String(recording.mime_type).split(';')[0].trim();
  const url = new URL(recording.storage_url);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.public.blob.vercel-storage.com')
    || !['video/mp4', 'video/webm'].includes(mimeType)
    || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_VIDEO_BYTES
    || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error(`Recording ${recording.id} is not eligible for this bounded test import.`);
  }
  const digests = [];
  for (let start = 0; start < sizeBytes; start += CHUNK_SIZE) {
    const end = Math.min(sizeBytes, start + CHUNK_SIZE) - 1;
    const response = await fetch(url, {
      headers: { Range: `bytes=${start}-${end}`, Origin: 'https://studentweb-ruddy.vercel.app' },
      signal: AbortSignal.timeout(30_000),
    });
    const expectedRange = `bytes ${start}-${end}/${sizeBytes}`;
    if (response.status !== 206 || response.headers.get('content-range') !== expectedRange
      || !response.body || response.headers.get('content-type')?.split(';')[0].trim() !== mimeType) {
      await response.body?.cancel();
      throw new Error(`Recording ${recording.id} failed the exact HTTP range/MIME check.`);
    }
    const allowedOrigin = response.headers.get('access-control-allow-origin');
    if (allowedOrigin !== '*' && allowedOrigin !== 'https://studentweb-ruddy.vercel.app') {
      await response.body.cancel();
      throw new Error(`Recording ${recording.id} does not permit the Student Web origin.`);
    }
    const hash = createHash('sha256');
    let received = 0;
    for await (const chunk of response.body) {
      received += chunk.byteLength;
      if (received > end - start + 1) throw new Error('The media response exceeded its declared byte range.');
      hash.update(chunk);
    }
    if (received !== end - start + 1) throw new Error('The media response was truncated.');
    digests.push(hash.digest('hex'));
  }
  return {
    id: recording.id,
    storageUrl: recording.storage_url,
    mimeType,
    durationSeconds,
    sizeBytes,
    integrity: { algorithm: 'sha256-chunks-v1', chunkSizeBytes: CHUNK_SIZE, orderedChunkDigests: digests },
  };
}

const recordings = [];
for (const id of sourceIds) {
  const recording = await verifyAndHash(rows.find((row) => row.id === id));
  recordings.push(recording);
  console.log(`Verified ${id}: exact bytes, MIME, ranges, CORS and chunk hashes.`);
}

const fingerprint = createHash('sha256').update(JSON.stringify(recordings)).digest();
const bytes = Buffer.from(fingerprint.subarray(0, 16));
bytes[6] = (bytes[6] & 0x0f) | 0x80;
bytes[8] = (bytes[8] & 0x3f) | 0x80;
const hex = bytes.toString('hex');
const combinationId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
const packageId = `recordweb-test-${fingerprint.toString('hex').slice(0, 16)}-v1`;
const manifest = {
  schemaVersion: 1,
  combinationId,
  contentVersion: 1,
  packageId,
  videos: recordings.map((recording, sequence) => ({
    videoId: recording.id,
    sequence,
    relativePath: `videos/${sequence}-${recording.id}.${recording.mimeType === 'video/webm' ? 'webm' : 'mp4'}`,
    mimeType: recording.mimeType,
    durationSeconds: recording.durationSeconds,
    sizeBytes: recording.sizeBytes,
    integrity: recording.integrity,
  })),
};
const manifestSha256 = createHash('sha256').update(JSON.stringify(manifest, null, 2)).digest('hex');
const totalDuration = recordings.reduce((sum, recording) => sum + recording.durationSeconds, 0);

if (apply) {
  const videos = recordings.map((recording, sequence) => ({
    videoId: recording.id, sequence, title: `Record Web test recording ${sequence + 1}`,
    storageUrl: recording.storageUrl, mimeType: recording.mimeType,
    durationSeconds: recording.durationSeconds, sizeBytes: recording.sizeBytes, integrity: recording.integrity,
  }));
  await target.transaction([
    target`INSERT INTO combinations (id, title, description, enabled, target_quota)
      VALUES (${combinationId}::uuid, 'Record Web playback test',
        'Test-only playlist referencing selected existing Record Web composites. Assignment algorithm is deferred.',
        FALSE, 0) ON CONFLICT (id) DO NOTHING;`,
    target`INSERT INTO combination_versions (
        combination_id, version, package_id, manifest, manifest_sha256, total_duration_seconds
      ) VALUES (${combinationId}::uuid, 1, ${packageId}, ${JSON.stringify(manifest)}::jsonb, ${manifestSha256}, ${totalDuration})
      ON CONFLICT (combination_id, version) DO NOTHING;`,
    target`INSERT INTO combination_videos (
        combination_id, combination_version, video_id, sequence, title, storage_url,
        mime_type, duration_seconds, size_bytes, integrity
      ) SELECT ${combinationId}::uuid, 1, e."videoId", e.sequence, e.title, e."storageUrl",
        e."mimeType", e."durationSeconds", e."sizeBytes", e.integrity
      FROM jsonb_to_recordset(${JSON.stringify(videos)}::jsonb) AS e(
        "videoId" UUID, sequence INTEGER, title TEXT, "storageUrl" TEXT, "mimeType" TEXT,
        "durationSeconds" NUMERIC, "sizeBytes" BIGINT, integrity JSONB
      ) ON CONFLICT (combination_id, combination_version, sequence) DO NOTHING;`,
  ]);
  const stored = await target`SELECT cv.manifest_sha256,
      (SELECT COUNT(*)::integer FROM combination_videos v
        WHERE v.combination_id = cv.combination_id AND v.combination_version = cv.version) AS video_count
    FROM combination_versions cv WHERE cv.combination_id = ${combinationId}::uuid AND cv.version = 1;`;
  if (stored[0]?.manifest_sha256 !== manifestSha256 || stored[0]?.video_count !== recordings.length) {
    throw new Error('The imported content version does not match the expected immutable test package.');
  }
}

console.log(JSON.stringify({
  applied: apply, combinationId, packageId, videoCount: recordings.length,
  totalDurationSeconds: totalDuration,
  note: 'New combinations are disabled with quota zero. Existing content is never overwritten. No selector or source access flag is modified.',
}));
