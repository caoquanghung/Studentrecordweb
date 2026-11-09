'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { studyClient } from '@/lib/study/client';
import { enqueueTelemetry, flushTelemetry, purgeTelemetryQueue } from '@/lib/study/telemetry-client';
import { getPreparedVideoUrl, hasPreparedPackage } from '@/lib/study/zip-client';
import type { SourceMode, StudyStatus, TelemetryEvent } from '@/types/study';
import { PostStudyForm } from './PostStudyForm';
import styles from './StudyRuntime.module.css';

type RuntimePhase = 'loading' | 'ready' | 'watching' | 'post-study' | 'invalid' | 'error';
type Authority = { attemptId: string; controlVersion: number };

export function StudyRuntime({ initialSourceMode }: { initialSourceMode: SourceMode }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const armedRef = useRef(false);
  const internalMediaChangeRef = useRef(false);
  const invalidatingRef = useRef(false);
  const authorityRef = useRef<Authority | null>(null);
  const sequenceRef = useRef(0);
  const acknowledgedRef = useRef(0);
  const startedAtRef = useRef(0);
  const postOpenedAtRef = useRef(0);
  const lastCheckpointRef = useRef(-1);
  const bufferingTimerRef = useRef<number | null>(null);
  const phaseRef = useRef<RuntimePhase>('loading');
  const [status, setStatus] = useState<StudyStatus | null>(null);
  const [phase, setPhase] = useState<RuntimePhase>('loading');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [videoIndex, setVideoIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  const transition = useCallback((next: RuntimePhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const clearBufferingTimer = useCallback(() => {
    if (bufferingTimerRef.current !== null) {
      window.clearTimeout(bufferingTimerRef.current);
      bufferingTimerRef.current = null;
    }
  }, []);

  const invalidate = useCallback(async (reason: string) => {
    const authority = authorityRef.current;
    if (!authority || invalidatingRef.current || phaseRef.current === 'invalid') return;
    invalidatingRef.current = true;
    armedRef.current = false;
    clearBufferingTimer();
    videoRef.current?.pause();
    transition('invalid');
    try {
      await purgeTelemetryQueue(authority.attemptId);
      const next = await studyClient.invalidate(authority.attemptId, authority.controlVersion, reason);
      setStatus(next);
    } catch {
      // The short server lease is the fallback when this best-effort request cannot arrive.
    } finally {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
    }
  }, [clearBufferingTimer, transition]);

  function createEvent(eventType: string, payload: Record<string, unknown> = {}): TelemetryEvent {
    sequenceRef.current += 1;
    return {
      eventId: crypto.randomUUID(),
      sequence: sequenceRef.current,
      eventType,
      clientWallTime: new Date().toISOString(),
      clientMonotonicMs: Math.max(0, performance.now() - startedAtRef.current),
      payload,
    };
  }

  async function record(eventType: string, payload?: Record<string, unknown>) {
    const authority = authorityRef.current;
    if (!authority) return;
    try {
      await enqueueTelemetry(authority.attemptId, createEvent(eventType, payload));
    } catch {
      await invalidate('telemetry-queue-failed');
    }
  }

  useEffect(() => {
    let current = true;
    studyClient.status().then(async (next) => {
      if (!current) return;
      setStatus(next);
      if (next.completed) {
        router.replace('/study/complete');
        return;
      }
      if (next.attempt?.status === 'watching' || next.attempt?.status === 'post_study') {
        authorityRef.current = {
          attemptId: next.attempt.id,
          controlVersion: next.attempt.controlVersion,
        };
        await purgeTelemetryQueue(next.attempt.id).catch(() => undefined);
        if (current) await invalidate('page-reloaded');
        return;
      }
      if (!next.assignment || next.assignment.status === 'released' || !next.combination) {
        router.replace('/');
        return;
      }
      if (initialSourceMode === 'zip'
        && !hasPreparedPackage(next.combination.id, next.combination.version)) {
        setError('Package ZIP không còn trong bộ nhớ của tab này. Hãy quay lại và import/xác minh package trước khi bắt đầu.');
        transition('error');
        return;
      }
      transition(next.attempt?.status === 'invalid' ? 'invalid' : 'ready');
    }).catch((cause) => {
      if (!current) return;
      setError(cause instanceof Error ? cause.message : 'Không thể tải phiên study.');
      transition('error');
    });
    return () => { current = false; };
  }, [initialSourceMode, invalidate, router, transition]);

  useEffect(() => {
    const hidden = () => {
      if (armedRef.current && document.visibilityState !== 'visible') void invalidate('page-hidden');
    };
    const blur = () => { if (armedRef.current) void invalidate('window-blurred'); };
    const fullscreen = () => {
      if (armedRef.current && !document.fullscreenElement) void invalidate('fullscreen-exited');
    };
    const offline = () => { if (armedRef.current) void invalidate('connection-lost'); };
    const beforeUnload = () => {
      if (!armedRef.current) return;
      const authority = authorityRef.current;
      if (!authority) return;
      navigator.sendBeacon(
        `/api/study/attempts/${authority.attemptId}/invalidate`,
        new Blob([JSON.stringify({
          controlVersion: authority.controlVersion,
          reason: 'page-unloaded',
        })], { type: 'application/json' }),
      );
    };
    document.addEventListener('visibilitychange', hidden);
    document.addEventListener('fullscreenchange', fullscreen);
    window.addEventListener('blur', blur);
    window.addEventListener('offline', offline);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      document.removeEventListener('fullscreenchange', fullscreen);
      window.removeEventListener('blur', blur);
      window.removeEventListener('offline', offline);
      window.removeEventListener('beforeunload', beforeUnload);
      clearBufferingTimer();
    };
  }, [clearBufferingTimer, invalidate]);

  useEffect(() => {
    const authority = authorityRef.current;
    if (!authority || !['watching', 'post-study'].includes(phase)) return;
    const heartbeatSeconds = status?.policy?.heartbeatIntervalSeconds ?? 5;
    const flushSeconds = status?.policy?.telemetryFlushSeconds ?? 5;
    const heartbeat = window.setInterval(() => {
      void studyClient.heartbeat(authority.attemptId, authority.controlVersion)
        .catch(() => void invalidate('connection-lost'));
    }, heartbeatSeconds * 1000);
    const flush = window.setInterval(() => {
      void flushTelemetry(authority.attemptId, authority.controlVersion)
        .then((sequence) => { acknowledgedRef.current = Math.max(acknowledgedRef.current, sequence); })
        .catch(() => undefined);
    }, flushSeconds * 1000);
    return () => {
      window.clearInterval(heartbeat);
      window.clearInterval(flush);
    };
  }, [invalidate, phase, status?.policy?.heartbeatIntervalSeconds, status?.policy?.telemetryFlushSeconds]);

  async function start() {
    if (window.innerWidth < 800 || window.innerHeight < 550) {
      setError('Màn hình hiện tại quá nhỏ cho phiên study. Vui lòng dùng laptop và mở rộng cửa sổ.');
      return;
    }
    if (!document.documentElement.requestFullscreen) {
      setError('Trình duyệt này không hỗ trợ chế độ toàn màn hình bắt buộc.');
      return;
    }
    if (initialSourceMode === 'zip' && status?.combination
      && !hasPreparedPackage(status.combination.id, status.combination.version)) {
      setError('Package ZIP chưa sẵn sàng. Hãy quay lại bước chuẩn bị.');
      return;
    }
    setBusy(true);
    setError('');
    let attemptCreated = false;
    try {
      await document.documentElement.requestFullscreen();
      const next = await studyClient.start(initialSourceMode);
      if (!next.attempt) throw new Error('Server không trả về attempt hợp lệ.');
      attemptCreated = true;
      authorityRef.current = {
        attemptId: next.attempt.id,
        controlVersion: next.attempt.controlVersion,
      };
      invalidatingRef.current = false;
      startedAtRef.current = performance.now();
      sequenceRef.current = 0;
      acknowledgedRef.current = 0;
      lastCheckpointRef.current = -1;
      setVideoIndex(0);
      setProgress(0);
      setStatus(next);
      armedRef.current = true;
      transition('watching');
      await enqueueTelemetry(next.attempt.id, createEvent('attempt_started', {
        sourceMode: initialSourceMode,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        screen: { width: window.screen.width, height: window.screen.height },
        language: navigator.language,
        userAgent: navigator.userAgent.slice(0, 500),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }));
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      const video = videoRef.current;
      if (!video) throw new Error('Không tìm thấy trình phát video.');
      video.playbackRate = 1;
      await video.play();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Không thể bắt đầu study.';
      setError(`Không thể khởi động toàn màn hình/phát video: ${message}`);
      if (attemptCreated) await invalidate('start-failed');
      else if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  async function ended() {
    const combination = status?.combination;
    const authority = authorityRef.current;
    const currentVideo = combination?.videos[videoIndex];
    if (!combination || !authority || !currentVideo) return;
    await record('video_ended', {
      videoId: currentVideo.id,
      videoSequence: currentVideo.sequence,
    });
    if (phaseRef.current === 'invalid') return;
    if (videoIndex + 1 < combination.videos.length) {
      internalMediaChangeRef.current = true;
      lastCheckpointRef.current = -1;
      setVideoIndex((current) => current + 1);
      setProgress(0);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(async () => {
          try {
            if (!videoRef.current) throw new Error('Player unavailable.');
            videoRef.current.playbackRate = 1;
            await videoRef.current.play();
          } catch {
            await invalidate('auto-advance-failed');
          } finally {
            internalMediaChangeRef.current = false;
          }
        });
      });
      return;
    }
    try {
      const ack = await flushTelemetry(authority.attemptId, authority.controlVersion);
      acknowledgedRef.current = Math.max(acknowledgedRef.current, ack);
      const next = await studyClient.videoComplete(authority.attemptId, authority.controlVersion);
      setStatus(next);
      postOpenedAtRef.current = performance.now();
      transition('post-study');
    } catch {
      await invalidate('telemetry-sync-failed');
    }
  }

  async function submitPostStudy(answers: Record<string, unknown>) {
    const authority = authorityRef.current;
    if (!authority) return;
    setBusy(true);
    setError('');
    try {
      await record('post_study_submitted');
      if (phaseRef.current === 'invalid') return;
      await studyClient.postStudy(
        authority.attemptId,
        authority.controlVersion,
        answers,
        true,
        { durationMs: Math.max(0, performance.now() - postOpenedAtRef.current) },
      );
      const ack = await flushTelemetry(authority.attemptId, authority.controlVersion);
      acknowledgedRef.current = Math.max(acknowledgedRef.current, ack);
      const complete = await studyClient.complete(
        authority.attemptId,
        authority.controlVersion,
        acknowledgedRef.current,
      );
      armedRef.current = false;
      clearBufferingTimer();
      await purgeTelemetryQueue(authority.attemptId);
      setStatus(complete);
      if (document.fullscreenElement) await document.exitFullscreen();
      router.replace('/study/complete');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể hoàn tất study.');
    } finally {
      setBusy(false);
    }
  }

  function checkpoint(videoId: string, mediaTime: number) {
    setProgress(mediaTime);
    const interval = status?.policy?.playbackSampleSeconds ?? 1;
    const bucket = Math.floor(mediaTime / interval);
    if (bucket > lastCheckpointRef.current) {
      lastCheckpointRef.current = bucket;
      void record('playback_checkpoint', { videoId, mediaTime });
    }
  }

  function bufferingStarted(videoId: string) {
    if (bufferingTimerRef.current !== null) return;
    void record('buffering_started', { videoId });
    const limitSeconds = status?.policy?.maxBufferingSeconds ?? 5;
    bufferingTimerRef.current = window.setTimeout(() => {
      bufferingTimerRef.current = null;
      void invalidate('buffering-timeout');
    }, limitSeconds * 1000);
  }

  function playing(videoId: string) {
    if (bufferingTimerRef.current !== null) {
      clearBufferingTimer();
      void record('buffering_ended', { videoId });
    }
    void record('playing', { videoId });
  }

  if (phase === 'loading') return <div className={styles.readyShell}><p>Đang tải phiên study…</p></div>;
  if (phase === 'error') return <div className={styles.readyShell}><div className={styles.readyCard}><div className={styles.readyBody}><p className={styles.error}>{error}</p><Link className={styles.back} href="/">Quay lại trang chuẩn bị</Link></div></div></div>;
  if (phase === 'invalid') return <div className={styles.invalidOverlay}><div className={styles.invalidCard}><span className={styles.invalidIcon}><Icon name="warning" size={28} /></span><h1>Phiên xem không còn hợp lệ</h1><p>Tiến trình và telemetry xem của lần này đã bị xóa. Pre-study và câu trả lời form đã lưu vẫn được giữ. Nếu thời hạn còn hiệu lực, bạn có thể thực hiện lại toàn bộ playlist cũ.</p><Link href="/">Quay lại và kiểm tra suất</Link></div></div>;
  if (phase === 'ready') return <div className={styles.readyShell}><section className={styles.readyCard}><header className={styles.readyHeader}><span>Xác nhận cuối cùng</span><h1>Sẵn sàng bắt đầu study?</h1><p>Từ thời điểm bấm nút bên dưới đến khi khảo sát cuối được gửi thành công, phiên phải diễn ra liên tục.</p></header><div className={styles.readyBody}>
    <ul className={styles.ruleList}><li className={styles.rule}><Icon name="check" /> Video chạy tự động theo thứ tự ở tốc độ 1×.</li><li className={styles.rule}><Icon name="check" /> Không chuyển tab, thu nhỏ, tải lại hoặc thoát toàn màn hình.</li><li className={styles.rule}><Icon name="check" /> Không pause, tua, bỏ qua hoặc thay đổi tốc độ.</li><li className={styles.rule}><Icon name="check" /> Sự cố kỹ thuật cũng yêu cầu xem lại playlist từ đầu.</li></ul>
    <label className={styles.confirm}><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>Tôi đã đóng các ứng dụng gây xao nhãng, kiểm tra âm thanh và sẵn sàng hoàn thành liên tục.</span></label>
    {error && <p className={styles.error}>{error}</p>}
    <button className={styles.start} type="button" disabled={!confirmed || busy} onClick={() => void start()}><Icon name="play" /> {busy ? 'Đang bắt đầu…' : 'Bắt đầu study'}</button><Link className={styles.back} href="/">Chưa sẵn sàng — quay lại bước chuẩn bị</Link>
  </div></section></div>;

  const combination = status?.combination;
  const currentVideo = combination?.videos[videoIndex];
  const videoSource = currentVideo && combination
    ? (initialSourceMode === 'zip'
      ? getPreparedVideoUrl(combination.id, combination.version, currentVideo.id)
      : currentVideo.storageUrl)
    : null;
  return <div className={styles.runtime}>
    <header className={styles.topbar}><div className={styles.status}><span className={styles.liveDot} /><div><strong>{phase === 'post-study' ? 'Khảo sát sau study' : currentVideo?.title}</strong><span>Phiên đang được giám sát · Không rời khỏi trang</span></div></div><div className={styles.sync}><Icon name="shield" size={15} /> Đang đồng bộ</div></header>
    {phase === 'watching' && currentVideo && combination && videoSource && <main className={styles.main}><div className={styles.videoMeta}><div><h1>{currentVideo.title}</h1><p>Bài {videoIndex + 1} / {combination.videos.length} · {initialSourceMode === 'zip' ? 'Nguồn ZIP cục bộ' : 'Streaming cloud'}</p></div><span className={styles.timer}>{Math.floor(progress)}s / {currentVideo.durationSeconds}s</span></div><div className={styles.progressTrack}><span style={{ width: `${Math.min(100, (progress / Math.max(1, currentVideo.durationSeconds)) * 100)}%` }} /></div><div className={styles.videoFrame}><video
      key={currentVideo.id}
      ref={videoRef}
      className={styles.video}
      src={videoSource}
      preload="auto"
      controls={false}
      controlsList="nodownload noplaybackrate nofullscreen"
      disablePictureInPicture
      onContextMenu={(event) => event.preventDefault()}
      onTimeUpdate={(event) => checkpoint(currentVideo.id, event.currentTarget.currentTime)}
      onPause={() => { if (armedRef.current && !internalMediaChangeRef.current && !videoRef.current?.ended) void invalidate('unexpected-pause'); }}
      onSeeking={() => { if (armedRef.current && !internalMediaChangeRef.current) void invalidate('seeking-detected'); }}
      onRateChange={(event) => { if (armedRef.current && event.currentTarget.playbackRate !== 1) void invalidate('rate-changed'); }}
      onWaiting={() => bufferingStarted(currentVideo.id)}
      onPlaying={() => playing(currentVideo.id)}
      onError={() => void invalidate('media-error')}
      onEnded={() => void ended()}
    /></div></main>}
    {phase === 'post-study' && <main className={styles.postShell}><section className={styles.postCard}><header className={styles.postHeader}><span>Post-study</span><h1>Trải nghiệm của bạn</h1><p>Hãy trả lời dựa trên playlist vừa xem. Không có câu trả lời đúng hoặc sai. Quy tắc tập trung vẫn còn hiệu lực đến khi gửi thành công.</p></header>{error && <p className={styles.error}>{error}</p>}<PostStudyForm busy={busy} onSubmit={(answers) => void submitPostStudy(answers)} /></section></main>}
  </div>;
}
