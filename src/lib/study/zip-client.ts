'use client';

import { BlobReader, BlobWriter, TextWriter, ZipReader, type FileEntry } from '@zip.js/zip.js';
import { downloadZip } from 'client-zip';
import type {
  StudyPackageDescriptor,
  StudyPackageManifest,
  StudyPackageManifestVideo,
} from '@/types/study';

const MANIFEST_MAX_BYTES = 1_048_576;
const ARCHIVE_MAX_ENTRIES = 256;
const BLOB_FALLBACK_MAX_BYTES = 268_435_456;
const SUPPORTED_MIME_TYPES = new Set(['video/mp4', 'video/webm', 'video/ogg']);

interface PreparedPackage {
  key: string;
  packageId: string;
  urls: Map<string, string>;
}

interface SaveFilePickerWindow extends Window {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<FileSystemFileHandle>;
}

let preparedPackage: PreparedPackage | null = null;

function packageKey(combinationId: string, contentVersion: number) {
  return `${combinationId}:v${contentVersion}`;
}

function safePath(value: unknown) {
  if (typeof value !== 'string' || !value || value.length > 300
    || value.includes('\\') || value.includes('\0') || value.startsWith('/')
    || /^[a-z]:/i.test(value) || value.split('/').some((part) => part === '..' || part === '')) {
    throw new Error('Gói ZIP chứa đường dẫn file không an toàn.');
  }
  return value;
}

function extensionFor(mimeType: string) {
  if (mimeType === 'video/webm') return 'webm';
  if (mimeType === 'video/ogg') return 'ogv';
  return 'mp4';
}

function derivedManifest(descriptor: StudyPackageDescriptor): StudyPackageManifest {
  return {
    schemaVersion: 1,
    combinationId: descriptor.combination.id,
    contentVersion: descriptor.combination.version,
    packageId: descriptor.packageId,
    videos: descriptor.combination.videos.map((video) => ({
      videoId: video.id,
      sequence: video.sequence,
      relativePath: `videos/${video.sequence}-${video.id}.${extensionFor(video.mimeType)}`,
      mimeType: video.mimeType,
      durationSeconds: video.durationSeconds,
      sizeBytes: video.sizeBytes,
    })),
  };
}

function normalizeManifest(value: unknown, fallback: StudyPackageManifest): StudyPackageManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const candidate = value as Record<string, unknown>;
  if (!Array.isArray(candidate.videos) || candidate.videos.length !== fallback.videos.length) return fallback;
  const videos = candidate.videos.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Manifest package không hợp lệ.');
    const video = item as Record<string, unknown>;
    return {
      videoId: String(video.videoId ?? ''),
      sequence: Number(video.sequence),
      relativePath: safePath(video.relativePath),
      mimeType: String(video.mimeType ?? ''),
      durationSeconds: Number(video.durationSeconds),
      sizeBytes: video.sizeBytes == null ? undefined : Number(video.sizeBytes),
      integrity: video.integrity && typeof video.integrity === 'object'
        ? video.integrity as StudyPackageManifestVideo['integrity']
        : undefined,
    };
  });
  return {
    schemaVersion: Number(candidate.schemaVersion),
    combinationId: String(candidate.combinationId ?? ''),
    contentVersion: Number(candidate.contentVersion),
    packageId: String(candidate.packageId ?? ''),
    videos,
  };
}

function authoritativeManifest(descriptor: StudyPackageDescriptor) {
  return normalizeManifest(descriptor.manifest, derivedManifest(descriptor));
}

function validateManifest(imported: StudyPackageManifest, expected: StudyPackageManifest) {
  if (imported.schemaVersion !== expected.schemaVersion
    || imported.combinationId !== expected.combinationId
    || imported.contentVersion !== expected.contentVersion
    || imported.packageId !== expected.packageId
    || imported.videos.length !== expected.videos.length) {
    throw new Error('Gói ZIP không thuộc đúng combination/version đang được giữ suất.');
  }
  imported.videos.forEach((video, index) => {
    const target = expected.videos[index];
    if (!target || video.videoId !== target.videoId || video.sequence !== target.sequence
      || safePath(video.relativePath) !== safePath(target.relativePath)
      || video.mimeType !== target.mimeType) {
      throw new Error('Thứ tự hoặc metadata video trong ZIP không khớp assignment.');
    }
    if (!SUPPORTED_MIME_TYPES.has(video.mimeType)) throw new Error(`Định dạng ${video.mimeType} chưa được hỗ trợ.`);
  });
}

async function sha256Hex(data: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function verifyBlob(blob: Blob, expected: StudyPackageManifestVideo) {
  if (expected.sizeBytes != null && blob.size !== expected.sizeBytes) {
    throw new Error(`Kích thước file ${expected.relativePath} không khớp manifest.`);
  }
  const integrity = expected.integrity;
  if (!integrity?.orderedChunkDigests?.length) return;
  if (integrity.algorithm !== 'sha256-chunks-v1'
    || !Number.isSafeInteger(integrity.chunkSizeBytes) || Number(integrity.chunkSizeBytes) <= 0) {
    throw new Error('Phiên bản integrity của ZIP chưa được hỗ trợ.');
  }
  const chunkSize = Number(integrity.chunkSizeBytes);
  if (Math.ceil(blob.size / chunkSize) !== integrity.orderedChunkDigests.length) {
    throw new Error(`Số chunk của ${expected.relativePath} không hợp lệ.`);
  }
  for (let index = 0; index < integrity.orderedChunkDigests.length; index += 1) {
    const chunk = await blob.slice(index * chunkSize, Math.min(blob.size, (index + 1) * chunkSize)).arrayBuffer();
    if (await sha256Hex(chunk) !== integrity.orderedChunkDigests[index].toLowerCase()) {
      throw new Error(`File ${expected.relativePath} bị hỏng hoặc đã bị thay đổi.`);
    }
  }
}

function revokePrepared(value: PreparedPackage | null) {
  value?.urls.forEach((url) => URL.revokeObjectURL(url));
}

export function getPreparedVideoUrl(combinationId: string, version: number, videoId: string) {
  if (preparedPackage?.key !== packageKey(combinationId, version)) return null;
  return preparedPackage.urls.get(videoId) ?? null;
}

export function hasPreparedPackage(combinationId: string, version: number) {
  return preparedPackage?.key === packageKey(combinationId, version);
}

export async function prepareZipPackage(
  file: File,
  descriptor: StudyPackageDescriptor,
  onProgress?: (completed: number, total: number) => void,
) {
  if (!file.name.toLowerCase().endsWith('.zip')) throw new Error('Vui lòng chọn đúng file ZIP.');
  if (file.size > BLOB_FALLBACK_MAX_BYTES) throw new Error('Gói ZIP vượt giới hạn 256 MiB của chế độ chuẩn bị hiện tại.');
  const expected = authoritativeManifest(descriptor);
  const reader = new ZipReader(new BlobReader(file), {
    checkOverlappingEntryOnly: true,
    checkOverlappingEntry: true,
  });
  const createdUrls: string[] = [];
  try {
    const entries = await reader.getEntries();
    if (entries.length < 2 || entries.length > ARCHIVE_MAX_ENTRIES) throw new Error('Số lượng entry trong ZIP không hợp lệ.');
    const paths = new Set<string>();
    for (const entry of entries) {
      const path = safePath(entry.filename);
      if (paths.has(path)) throw new Error(`ZIP chứa đường dẫn trùng: ${path}.`);
      paths.add(path);
      if (entry.encrypted) throw new Error('ZIP được mã hóa không được hỗ trợ.');
    }
    const manifestEntry = entries.find((entry): entry is FileEntry => (
      entry.filename === 'manifest.json' && !entry.directory && 'getData' in entry
    ));
    if (!manifestEntry || manifestEntry.uncompressedSize > MANIFEST_MAX_BYTES) throw new Error('ZIP thiếu manifest.json hợp lệ.');
    const manifestText = await manifestEntry.getData(new TextWriter());
    if (new TextEncoder().encode(manifestText).byteLength > MANIFEST_MAX_BYTES) throw new Error('Manifest ZIP quá lớn.');
    if (descriptor.manifestSha256 && await sha256Hex(new TextEncoder().encode(manifestText).buffer) !== descriptor.manifestSha256.toLowerCase()) {
      throw new Error('Chữ ký manifest ZIP không khớp descriptor từ server.');
    }
    const imported = normalizeManifest(JSON.parse(manifestText) as unknown, expected);
    validateManifest(imported, expected);
    const expectedPaths = new Set(['manifest.json', ...expected.videos.map((video) => safePath(video.relativePath))]);
    const unexpected = entries.find((entry) => !entry.directory && !expectedPaths.has(entry.filename));
    if (unexpected) throw new Error(`ZIP chứa file không được khai báo: ${unexpected.filename}.`);
    const totalBytes = expected.videos.reduce((sum, video) => sum + (video.sizeBytes ?? 0), 0);
    const declaredBytes = entries.reduce((sum, entry) => sum + (entry.directory ? 0 : entry.uncompressedSize), 0);
    if (declaredBytes > BLOB_FALLBACK_MAX_BYTES || totalBytes > BLOB_FALLBACK_MAX_BYTES) {
      throw new Error('Dung lượng giải nén vượt giới hạn an toàn 256 MiB.');
    }
    const urls = new Map<string, string>();
    for (let index = 0; index < expected.videos.length; index += 1) {
      const video = expected.videos[index];
      const entry = entries.find((candidate): candidate is FileEntry => (
        candidate.filename === video.relativePath && !candidate.directory && 'getData' in candidate
      ));
      if (!entry) throw new Error(`ZIP thiếu file ${video.relativePath}.`);
      const blob = await entry.getData(new BlobWriter(video.mimeType));
      await verifyBlob(blob, video);
      const url = URL.createObjectURL(blob);
      createdUrls.push(url);
      urls.set(video.videoId, url);
      onProgress?.(index + 1, expected.videos.length);
    }
    const next: PreparedPackage = {
      key: packageKey(expected.combinationId, expected.contentVersion),
      packageId: expected.packageId,
      urls,
    };
    revokePrepared(preparedPackage);
    preparedPackage = next;
    return { packageId: next.packageId, videoCount: urls.size, extractedBytes: declaredBytes };
  } catch (cause) {
    createdUrls.forEach((url) => URL.revokeObjectURL(url));
    if (cause instanceof SyntaxError) throw new Error('manifest.json không phải JSON hợp lệ.');
    throw cause;
  } finally {
    await reader.close().catch(() => undefined);
  }
}

function safeDownloadName(title: string) {
  const value = title.normalize('NFKD').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '');
  return `${value || 'lecture-study-package'}.zip`;
}

export async function downloadStudyPackage(descriptor: StudyPackageDescriptor) {
  const manifest = authoritativeManifest(descriptor);
  const files = async function* () {
    yield { name: 'manifest.json', input: JSON.stringify(manifest, null, 2) };
    for (const video of descriptor.combination.videos) {
      const manifestVideo = manifest.videos.find((item) => item.videoId === video.id);
      if (!manifestVideo) throw new Error(`Manifest thiếu video ${video.id}.`);
      const response = await fetch(video.storageUrl, { cache: 'no-store' });
      if (!response.ok || !response.body) throw new Error(`Không thể tải ${video.title}.`);
      yield { name: manifestVideo.relativePath, input: response };
    }
  };
  const response = downloadZip(files());
  const suggestedName = safeDownloadName(descriptor.combination.title);
  const pickerWindow = window as SaveFilePickerWindow;
  if (pickerWindow.showSaveFilePicker && response.body) {
    const handle = await pickerWindow.showSaveFilePicker({
      suggestedName,
      types: [{ description: 'Lecture study ZIP', accept: { 'application/zip': ['.zip'] } }],
    });
    const writable = await handle.createWritable();
    await response.body.pipeTo(writable);
    return { mode: 'streamed-to-disk' as const };
  }
  const knownBytes = descriptor.combination.videos.reduce((sum, video) => sum + (video.sizeBytes ?? 0), 0);
  if (!knownBytes || knownBytes > BLOB_FALLBACK_MAX_BYTES) {
    throw new Error('Trình duyệt không hỗ trợ lưu streaming và kích thước package chưa phù hợp với fallback 256 MiB.');
  }
  const blob = await response.blob();
  if (blob.size > BLOB_FALLBACK_MAX_BYTES) throw new Error('Package vượt giới hạn tải bằng bộ nhớ 256 MiB.');
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = suggestedName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return { mode: 'blob-download' as const };
}
