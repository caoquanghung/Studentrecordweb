'use client';

import type { Combination, StudyStatus } from '@/types/study';

type ReadinessPolicy = StudyStatus['policy'];

function requiredMegabitsPerSecond(combination: Combination, margin: number, minimum: number) {
  const measured = combination.videos
    .filter((video) => video.sizeBytes && video.durationSeconds > 0)
    .map((video) => (Number(video.sizeBytes) * 8) / video.durationSeconds / 1_000_000);
  const baseline = measured.length ? Math.max(...measured) * margin : minimum;
  return Math.max(0.25, Number.isFinite(baseline) ? baseline : 2);
}

export async function checkStreamingReadiness(combination: Combination, policy?: ReadinessPolicy) {
  if (!navigator.onLine) throw new Error('Thiết bị đang offline. ZIP vẫn cần Internet để xác thực và gửi telemetry.');
  const probe = document.createElement('video');
  const unsupported = combination.videos.find((video) => !probe.canPlayType(video.mimeType));
  if (unsupported) throw new Error(`Trình duyệt không hỗ trợ định dạng ${unsupported.mimeType}.`);
  const target = combination.videos[0];
  if (!target) throw new Error('Combination không có video để kiểm tra.');
  const sampleBytes = policy?.readinessSampleBytes ?? 1_048_576;
  const timeoutMs = (policy?.readinessTimeoutSeconds ?? 15) * 1000;
  const bitrateMargin = policy?.streamBitrateMargin ?? 1.5;
  const minimumStreamMbps = policy?.minimumStreamMbps ?? 2;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();
  let receivedBytes = 0;
  try {
    const response = await fetch(target.storageUrl, {
      cache: 'no-store',
      headers: { Range: `bytes=0-${sampleBytes - 1}` },
      signal: controller.signal,
    });
    if (!response.ok || !response.body) throw new Error('Không thể tải mẫu video từ cloud storage.');
    const reader = response.body.getReader();
    while (receivedBytes < sampleBytes) {
      const chunk = await reader.read();
      if (chunk.done) break;
      receivedBytes += chunk.value.byteLength;
    }
    await reader.cancel().catch(() => undefined);
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw new Error('Kiểm tra streaming quá thời gian; hãy thử lại hoặc dùng ZIP.');
    }
    throw cause;
  } finally {
    window.clearTimeout(timeout);
  }
  const durationMs = Math.max(1, performance.now() - startedAt);
  const downloadMbps = (receivedBytes * 8) / durationMs / 1000;
  const requiredMbps = requiredMegabitsPerSecond(combination, bitrateMargin, minimumStreamMbps);
  if (receivedBytes < 65_536 || downloadMbps < requiredMbps) {
    throw new Error(`Tốc độ đo được ${downloadMbps.toFixed(1)} Mbps, thấp hơn mức ${requiredMbps.toFixed(1)} Mbps. Hãy dùng ZIP hoặc thử lại sau.`);
  }
  return {
    downloadMbps: Number(downloadMbps.toFixed(2)),
    requiredMbps: Number(requiredMbps.toFixed(2)),
    sampleBytes: receivedBytes,
    durationMs: Math.round(durationMs),
    testedVideoId: target.id,
  };
}
