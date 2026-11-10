'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { studyClient } from '@/lib/study/client';
import { useFormTiming } from '@/lib/study/form-timing';
import { checkStreamingReadiness } from '@/lib/study/readiness-client';
import { downloadStudyPackage, prepareZipPackage } from '@/lib/study/zip-client';
import type { SourceMode, StudyPackageDescriptor, StudyStatus } from '@/types/study';
import { ParticipantShell, StudyPanel, participantStyles } from './ParticipantShell';
import styles from './StudyFlow.module.css';

type PreStep = 'introduction' | 'consent' | 'pre-study' | 'assignment' | 'preparation';

function initialStep(status: StudyStatus): PreStep {
  if (status.assignment && status.assignment.status !== 'released') return 'preparation';
  if (status.preStudySubmitted) return 'assignment';
  if (status.consented) return 'pre-study';
  return 'introduction';
}

function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  return minutes > 0 ? `${minutes} phút` : `${seconds} giây`;
}

function Countdown({ expiresAt, serverTime, onExpire }: { expiresAt: string; serverTime: string; onExpire: () => void }) {
  const [remaining, setRemaining] = useState(Math.max(0, Date.parse(expiresAt) - Date.parse(serverTime)));
  const expiredRef = useRef(false);
  useEffect(() => {
    expiredRef.current = false;
    const clockOffset = Date.parse(serverTime) - Date.now();
    const timer = window.setInterval(() => {
      const next = Math.max(0, Date.parse(expiresAt) - Date.now() - clockOffset);
      setRemaining(next);
      if (next === 0 && !expiredRef.current) {
        expiredRef.current = true;
        window.clearInterval(timer);
        onExpire();
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt, onExpire, serverTime]);
  const totalSeconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return <span className={styles.countdown} aria-live="polite">{minutes}:{seconds}</span>;
}

function Introduction({ next }: { next: () => void }) {
  return <StudyPanel eyebrow="Trước khi bắt đầu" title="Chào mừng bạn đến với nghiên cứu" description="Bạn sẽ xem một playlist bài giảng được hệ thống phân bổ và trả lời hai bảng câu hỏi ngắn. Hãy đọc kỹ quy trình trước khi tiếp tục.">
    <div className={styles.stack}>
      <div className={styles.introGrid}>
        <article className={styles.infoCard}><span className={styles.infoIcon}><Icon name="list" /></span><h2>Một playlist duy nhất</h2><p>Bạn được phân bổ một tổ hợp bài giảng dựa trên câu trả lời trước study.</p></article>
        <article className={styles.infoCard}><span className={styles.infoIcon}><Icon name="clock" /></span><h2>Liên tục, không gián đoạn</h2><p>Sau khi bấm Bắt đầu study, bạn cần ở lại trang cho đến khi hoàn tất.</p></article>
        <article className={styles.infoCard}><span className={styles.infoIcon}><Icon name="shield" /></span><h2>Dữ liệu nghiên cứu</h2><p>Website ghi nhận tiến trình phát, trạng thái trang và câu trả lời đã mô tả.</p></article>
      </div>
      <div className={participantStyles.notice}><Icon name="warning" /><div><strong>Chưa có ràng buộc ở bước này</strong>Bạn có thể rời trang trước khi bấm Bắt đầu study. Sau khi nhận playlist, website sẽ hiển thị thời hạn giữ suất do server cấp.</div></div>
      <div className={participantStyles.actions}><button className={participantStyles.primary} type="button" onClick={next}>Đọc thông tin đồng thuận <Icon name="chevron" size={17} /></button></div>
    </div>
  </StudyPanel>;
}

function Consent({ submitting, onSubmit, back }: { submitting: boolean; onSubmit: (name: string, timing: Record<string, unknown>) => void; back: () => void }) {
  const [checks, setChecks] = useState([false, false, false, false]);
  const [name, setName] = useState('');
  const formTiming = useFormTiming();
  const ready = checks.every(Boolean) && name.trim().length >= 2;
  const labels = [
    'Tôi đã đọc hoặc được giải thích về hoạt động và dữ liệu được thu thập.',
    'Tôi hiểu quy tắc xem liên tục và điều gì xảy ra khi phiên bị gián đoạn.',
    'Tôi hiểu việc tham gia là tự nguyện và biết cách liên hệ nhóm nghiên cứu.',
    'Tôi đồng ý tham gia và cho phép sử dụng dữ liệu theo nội dung đã mô tả.',
  ];
  return <StudyPanel eyebrow="Đồng thuận tham gia" title="Thông tin nghiên cứu" description="Nội dung dưới đây là bản nháp theo đặc tả. Nhóm nghiên cứu cần thay các trường liên hệ và chính sách lưu trữ trước khi thu thập dữ liệu thật.">
    <div className={styles.stack}>
      <div className={styles.reading} tabIndex={0}>
        <h2>Mục đích</h2><p>Nghiên cứu tìm hiểu trải nghiệm học từ các bài giảng được ghi hình. Những người tham gia khác nhau có thể nhận playlist khác nhau.</p>
        <h2>Bạn sẽ làm gì?</h2><p>Trả lời khảo sát đầu, chuẩn bị video, xem toàn bộ playlist ở tốc độ 1× và trả lời khảo sát cuối.</p>
        <h2>Quy tắc xem</h2><ul><li>Không tạm dừng, tua, bỏ qua hoặc đổi tốc độ.</li><li>Không chuyển tab, thu nhỏ, tải lại hoặc rời khỏi chế độ toàn màn hình.</li><li>Nếu gián đoạn, phiên xem không hợp lệ và bạn cần xem lại từ đầu.</li></ul>
        <h2>Dữ liệu được thu thập</h2><p>Câu trả lời và thời gian form, playlist được phân bổ, sự kiện phát video, trạng thái hiển thị/tập trung, lỗi mạng và thông tin trình duyệt tối thiểu. Website không ghi camera, microphone hoặc màn hình của bạn.</p>
        <h2>Tính tự nguyện</h2><p>Bạn có thể từ chối hoặc dừng bất kỳ lúc nào. Việc dừng sẽ làm phiên hiện tại không hợp lệ nhưng không buộc bạn phải tiếp tục.</p>
      </div>
      <div className={styles.checks}>{labels.map((label, index) => <label className={styles.check} key={label}><input type="checkbox" checked={checks[index]} onChange={(event) => setChecks((current) => current.map((value, item) => item === index ? event.target.checked : value))} /><span>{label}</span></label>)}</div>
      <div className={styles.field}><label htmlFor="participant-name">Họ tên xác nhận <span className={styles.required}>*</span></label><input id="participant-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" /><span className={styles.hint}>Tên được lưu cùng phiên bản biểu mẫu đồng thuận.</span></div>
      <div className={participantStyles.actions}><button className={participantStyles.secondary} type="button" onClick={back}>Quay lại</button><button className={participantStyles.primary} type="button" disabled={!ready || submitting} onClick={() => onSubmit(name, formTiming())}>{submitting ? 'Đang lưu…' : 'Đồng ý và tiếp tục'}</button></div>
    </div>
  </StudyPanel>;
}

function PreStudy({ submitting, onSubmit }: { submitting: boolean; onSubmit: (answers: Record<string, unknown>, timing: Record<string, unknown>) => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const formTiming = useFormTiming();
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const answers = Object.fromEntries(form.entries());
    onSubmit(answers, formTiming());
  }
  return <StudyPanel eyebrow="Pre-study" title="Một vài thông tin về bạn" description="Câu trả lời có thể được thuật toán phân bổ playlist sử dụng. Chúng tôi không dùng câu trả lời tự đánh giá như một bài kiểm tra kiến thức.">
    <form ref={formRef} className={styles.form} onSubmit={submit}>
      <section className={styles.section}><h2>Thông tin chung</h2><div className={styles.fieldGrid}>
        <div className={styles.field}><label htmlFor="age">Tuổi <span className={styles.required}>*</span></label><input id="age" name="age" type="number" min="6" max="120" required /></div>
        <div className={styles.field}><label htmlFor="gender">Giới tính</label><select id="gender" name="gender" defaultValue=""><option value="" disabled>Chọn một phương án</option><option value="woman">Nữ</option><option value="man">Nam</option><option value="non-binary">Phi nhị nguyên</option><option value="self-describe">Tự mô tả</option><option value="prefer-not">Không muốn trả lời</option></select></div>
        <div className={styles.field}><label htmlFor="education">Trình độ học vấn hiện tại <span className={styles.required}>*</span></label><select id="education" name="education" required defaultValue=""><option value="" disabled>Chọn trình độ</option><option value="primary">Tiểu học</option><option value="lower-secondary">THCS</option><option value="upper-secondary">THPT</option><option value="college">Cao đẳng / nghề</option><option value="undergraduate">Đại học</option><option value="postgraduate">Sau đại học</option><option value="other">Khác</option></select></div>
        <div className={styles.field}><label htmlFor="major">Ngành hoặc lĩnh vực học</label><input id="major" name="major" maxLength={120} /></div>
      </div></section>
      <section className={styles.section}><h2>Kinh nghiệm học tập</h2><div className={styles.fieldGrid}>
        <div className={styles.field}><label htmlFor="familiarity">Mức độ quen thuộc với chủ đề bài giảng <span className={styles.required}>*</span></label><select id="familiarity" name="familiarity" required defaultValue=""><option value="" disabled>Chọn từ 1 đến 5</option>{[1,2,3,4,5].map((value) => <option key={value} value={value}>{value} — {value === 1 ? 'Hoàn toàn chưa quen' : value === 5 ? 'Rất quen thuộc' : ''}</option>)}</select></div>
        <div className={styles.field}><label htmlFor="priorStudy">Bạn đã học chủ đề này trước đây?</label><select id="priorStudy" name="priorStudy" defaultValue="no"><option value="no">Chưa</option><option value="self-study">Tự học</option><option value="course">Trong môn học</option><option value="work">Kinh nghiệm thực tế</option></select></div>
        <div className={styles.field}><label htmlFor="videoFrequency">Tần suất học qua video <span className={styles.required}>*</span></label><select id="videoFrequency" name="videoFrequency" required defaultValue="weekly"><option value="never">Không bao giờ</option><option value="monthly">Hàng tháng</option><option value="weekly">Hàng tuần</option><option value="several-weekly">Nhiều lần mỗi tuần</option><option value="daily">Gần như mỗi ngày</option></select></div>
        <div className={styles.field}><label htmlFor="languageComfort">Mức thoải mái với ngôn ngữ bài giảng <span className={styles.required}>*</span></label><select id="languageComfort" name="languageComfort" required defaultValue="3">{[1,2,3,4,5].map((value) => <option key={value} value={value}>{value} / 5</option>)}</select></div>
        <div className={`${styles.field} ${styles.fieldFull}`}><label htmlFor="supportNeeds">Điều gì về nghe, nhìn, ngôn ngữ hoặc quy tắc xem mà nhóm nghiên cứu nên biết?</label><textarea id="supportNeeds" name="supportNeeds" maxLength={500} /><span className={styles.hint}>Không cần cung cấp chẩn đoán y tế.</span></div>
      </div></section>
      <div className={participantStyles.actions}><button className={participantStyles.primary} type="submit" disabled={submitting}>{submitting ? 'Đang lưu…' : 'Lưu và phân bổ playlist'}</button></div>
    </form>
  </StudyPanel>;
}

function AssignmentView({ status, busy, onAssign }: { status: StudyStatus; busy: boolean; onAssign: () => void }) {
  return <StudyPanel eyebrow="Phân bổ playlist" title="Sẵn sàng nhận tổ hợp bài giảng" description="Hệ thống sẽ gọi thuật toán phân bổ và giữ một suất trong quota. Bản phát triển hiện sử dụng bộ chọn mẫu được đánh dấu rõ.">
    <div className={styles.emptyState}><span className={styles.infoIcon}><Icon name="database" /></span><h2>Dữ liệu pre-study đã được lưu</h2><p>Bạn không cần điền lại pre-study nếu suất hết hạn. Hệ thống sẽ chạy lại thuật toán để chọn một combination phù hợp còn chỗ.</p>{status.mode === 'demo' && <div className={`${participantStyles.notice}`}><Icon name="warning" /><div><strong>Development selector</strong>Chế độ demo chọn combination đầu tiên còn quota; đây chưa phải thuật toán nghiên cứu chính thức.</div></div>}<button className={participantStyles.primary} type="button" disabled={busy} onClick={onAssign}>{busy ? 'Đang phân bổ…' : 'Nhận playlist của tôi'}</button></div>
  </StudyPanel>;
}

function Preparation({ status, refresh }: { status: StudyStatus; refresh: () => Promise<void> }) {
  const [source, setSource] = useState<SourceMode>('stream');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [descriptor, setDescriptor] = useState<StudyPackageDescriptor | null>(null);
  const [progressText, setProgressText] = useState('');
  const [audioTested, setAudioTested] = useState(false);
  const [audioConfirmed, setAudioConfirmed] = useState(false);
  const [audioMessage, setAudioMessage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const combination = status.combination;
  const assignment = status.assignment;
  const expire = useCallback(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!assignment) return;
    let current = true;
    studyClient.package()
      .then((value) => { if (current) setDescriptor(value); })
      .catch(() => { if (current) setDescriptor(null); });
    return () => { current = false; };
  }, [assignment]);
  if (!combination || !assignment) return null;
  const totalDuration = combination.videos.reduce((sum, video) => sum + video.durationSeconds, 0);
  async function runStreamingReadiness() {
    setBusy(true); setMessage('');
    try {
      if (!combination) throw new Error('Combination không còn khả dụng.');
      const metrics = await checkStreamingReadiness(combination, status.policy);
      await studyClient.readiness('stream', true, metrics);
      setReady(true);
      setMessage(`Streaming sẵn sàng (${metrics.downloadMbps.toFixed(1)} Mbps; yêu cầu ${metrics.requiredMbps.toFixed(1)} Mbps).`);
    }
    catch (error) { setReady(false); setMessage(error instanceof Error ? error.message : 'Không thể kiểm tra.'); }
    finally { setBusy(false); }
  }
  async function importZip(file?: File) {
    if (!file) return;
    setBusy(true); setReady(false); setMessage(''); setProgressText('Đang đọc manifest…');
    try {
      const packageDescriptor = descriptor ?? await studyClient.package();
      setDescriptor(packageDescriptor);
      const result = await prepareZipPackage(file, packageDescriptor, (completed, total) => {
        setProgressText(`Đang xác minh video ${completed}/${total}…`);
      });
      await studyClient.readiness('zip', true, {
        packageId: result.packageId,
        videoCount: result.videoCount,
        extractedBytes: result.extractedBytes,
      });
      setReady(true);
      setMessage(`ZIP đã được xác minh: ${result.videoCount} video sẵn sàng phát cục bộ.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể chuẩn bị ZIP.');
    } finally {
      setBusy(false); setProgressText('');
      if (fileRef.current) fileRef.current.value = '';
    }
  }
  async function downloadPackage() {
    if (!descriptor) { setMessage('Descriptor package chưa tải xong; vui lòng thử lại.'); return; }
    setBusy(true); setMessage('Đang tạo package; không đóng trang này…');
    try {
      const result = await downloadStudyPackage(descriptor);
      setMessage(result.mode === 'streamed-to-disk' ? 'Đã lưu package xuống máy.' : 'Trình duyệt đã bắt đầu tải package.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể tải package.');
    } finally { setBusy(false); }
  }
  async function playAudioTest() {
    setAudioMessage('');
    setAudioTested(false);
    setAudioConfirmed(false);
    try {
      const AudioContextClass = window.AudioContext
        ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) throw new Error('Trình duyệt không hỗ trợ kiểm tra âm thanh Web Audio.');
      const audioContext = new AudioContextClass();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 523.25;
      gain.gain.value = 0.08;
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.onended = () => { void audioContext.close(); };
      await audioContext.resume();
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.7);
      setAudioTested(true);
      setAudioMessage('Âm thử đã phát. Hãy điều chỉnh âm lượng hệ thống nếu cần rồi xác nhận bên dưới.');
    } catch (error) {
      setAudioMessage(error instanceof Error ? error.message : 'Không thể phát âm thử.');
    }
  }
  const canContinue = ready && audioConfirmed;
  return <StudyPanel eyebrow="Chuẩn bị nội dung" title="Playlist của bạn đã được giữ chỗ" description="Chuẩn bị toàn bộ điều kiện trước khi bắt đầu. Việc tải hoặc nhập ZIP không kéo dài thời hạn giữ suất.">
    <div className={styles.stack}>
      <div className={styles.assignment}>
        <article className={styles.playlist}><h2>{combination.title}</h2><p>{combination.description}</p><ul className={styles.videoList}>{combination.videos.map((video) => <li className={styles.videoItem} key={video.id}><span className={styles.videoNumber}>{video.sequence}</span><strong>{video.title}</strong><time>{formatDuration(video.durationSeconds)}</time></li>)}</ul></article>
        <aside className={styles.reservation}><span>Suất còn hiệu lực</span><Countdown key={assignment.id} expiresAt={assignment.reservationExpiresAt} serverTime={status.serverTime} onExpire={expire} /><p>{combination.videos.length} video · khoảng {formatDuration(totalDuration)}. Hết giờ, hệ thống sẽ nhả suất và phân bổ lại khi bạn quay lại.</p></aside>
      </div>
      <div><span className={styles.legend}>Chọn nguồn phát</span><div className={styles.sourceGrid}>
        <button type="button" className={`${styles.sourceCard} ${source === 'stream' ? styles.sourceCardActive : ''}`} onClick={() => { setSource('stream'); setReady(false); setMessage(''); }}><span className={styles.sourceIcon}><Icon name="wifi" /></span><h2>Streaming từ cloud</h2><p>Video tải dần trong lúc xem. Phù hợp khi đường truyền ổn định.</p><small>Kiểm tra mạng trước khi bắt đầu</small></button>
        <button type="button" className={`${styles.sourceCard} ${source === 'zip' ? styles.sourceCardActive : ''}`} onClick={() => { setSource('zip'); setReady(false); setMessage(''); }}><span className={styles.sourceIcon}><Icon name="archive" /></span><h2>Phát từ gói ZIP</h2><p>Tải đầy đủ tài nguyên trước và phát cục bộ trong website; vẫn cần Internet để gửi log.</p><small>Có thể dùng ngay cả khi mạng tốt</small></button>
      </div></div>
      <div className={styles.readiness}>
        <div className={styles.readinessRow}><span>Trạng thái nguồn</span><strong className={ready ? styles.statusOk : styles.statusWait}>{ready ? 'Sẵn sàng' : 'Chưa kiểm tra'}</strong></div>
        {message && <div className={participantStyles.notice} aria-live="polite"><Icon name={ready ? 'check' : 'warning'} /><span>{message}</span></div>}
        {progressText && <p aria-live="polite">{progressText}</p>}
        {source === 'zip' && <><input ref={fileRef} className={styles.fileInput} type="file" accept=".zip,application/zip" onChange={(event) => void importZip(event.target.files?.[0])} /><div className={participantStyles.actions}><button className={participantStyles.secondary} type="button" disabled={busy || !descriptor} onClick={() => void downloadPackage()}>Tải package ZIP</button><button className={participantStyles.secondary} type="button" disabled={busy} onClick={() => fileRef.current?.click()}>Import và xác minh ZIP</button></div></>}
        {source === 'stream' && <button className={participantStyles.secondary} type="button" disabled={busy} onClick={() => void runStreamingReadiness()}>{busy ? 'Đang kiểm tra…' : 'Kiểm tra khả năng streaming'}</button>}
      </div>
      <div className={styles.readiness}>
        <div className={styles.readinessRow}><span>Kiểm tra âm thanh</span><strong className={audioConfirmed ? styles.statusOk : styles.statusWait}>{audioConfirmed ? 'Đã xác nhận' : 'Chưa xác nhận'}</strong></div>
        <button className={participantStyles.secondary} type="button" onClick={() => void playAudioTest()}>Phát âm thử</button>
        {audioMessage && <p className={styles.hint} aria-live="polite">{audioMessage}</p>}
        <label className={styles.audioCheck}><input type="checkbox" disabled={!audioTested} checked={audioConfirmed} onChange={(event) => setAudioConfirmed(event.target.checked)} /><span>Tôi nghe rõ âm thử ở mức âm lượng phù hợp.</span></label>
      </div>
      <div className={participantStyles.notice}><Icon name="shield" /><div><strong>Khi nào quy tắc nghiêm ngặt bắt đầu?</strong>Chỉ sau khi bạn vào màn hình study và bấm “Bắt đầu study”. Hãy hoàn tất kiểm tra âm thanh, đóng ứng dụng gây xao nhãng và cắm sạc trước đó.</div></div>
      <div className={participantStyles.actions}><Link className={participantStyles.primary} aria-disabled={!canContinue} tabIndex={canContinue ? 0 : -1} href={canContinue ? `/study/run?source=${source}` : '#'} onClick={(event) => { if (!canContinue) event.preventDefault(); }}>Tiếp tục đến màn hình study <Icon name="chevron" size={17} /></Link></div>
    </div>
  </StudyPanel>;
}

/** Admins land on /admin unless they explicitly open the participant preview (`/?preview=participant`). */
function shouldRedirectToAdmin(status: StudyStatus) {
  return status.role === 'admin'
    && new URLSearchParams(window.location.search).get('preview') !== 'participant';
}

export function StudyFlow() {
  const router = useRouter();
  const [status, setStatus] = useState<StudyStatus | null>(null);
  const [step, setStep] = useState<PreStep>('introduction');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    const next = await studyClient.status();
    setStatus(next);
    setStep(initialStep(next));
  }, []);
  useEffect(() => {
    let current = true;
    studyClient.status().then((next) => {
      if (!current) return;
      if (shouldRedirectToAdmin(next)) {
        router.replace('/admin');
        return;
      }
      setStatus(next);
      setStep(initialStep(next));
    }).catch((cause) => {
      if (current) setError(cause instanceof Error ? cause.message : 'Không thể tải trạng thái study.');
    });
    return () => { current = false; };
  }, [router]);
  const mode = status?.mode;
  if (error && !status) return <ParticipantShell currentStep="introduction"><StudyPanel eyebrow="Không thể tiếp tục" title="Có lỗi khi tải study" description={error}><div className={participantStyles.actions}><button className={participantStyles.secondary} onClick={() => window.location.reload()}>Thử lại</button></div></StudyPanel></ParticipantShell>;
  if (!status) return <ParticipantShell currentStep="introduction"><div className={participantStyles.loading}><div><div className={participantStyles.spinner} /><p>Đang kiểm tra lời mời và tiến trình…</p></div></div></ParticipantShell>;
  if (!status.invited) return <ParticipantShell currentStep="introduction" mode={mode}><StudyPanel eyebrow="Quyền truy cập" title="Email này chưa được mời" description="Chỉ những email được quản trị viên mời mới có thể tham gia. Hãy đăng nhập bằng đúng email trong thư mời hoặc liên hệ nhóm nghiên cứu."><div className={participantStyles.actions}><Link className={participantStyles.secondary} href="/sign-in">Đổi tài khoản</Link></div></StudyPanel></ParticipantShell>;
  if (status.completed) return <ParticipantShell currentStep="preparation" mode={mode}><StudyPanel eyebrow="Đã hoàn tất" title="Cảm ơn bạn đã tham gia" description="Câu trả lời và dữ liệu study bắt buộc đã được lưu thành công."><div className={`${participantStyles.notice} ${participantStyles.success}`}><Icon name="check" /><span>Bạn có thể đóng trang này.</span></div></StudyPanel></ParticipantShell>;
  async function perform(action: () => Promise<StudyStatus>, after?: (next: StudyStatus) => void) { setBusy(true); setError(''); try { const next = await action(); setStatus(next); after?.(next); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể hoàn tất yêu cầu.'); } finally { setBusy(false); } }
  return <ParticipantShell currentStep={step} mode={mode}>{error && <div className={`${participantStyles.notice} ${participantStyles.error}`}><Icon name="warning" /><span>{error}</span></div>}
    {step === 'introduction' && <Introduction next={() => setStep('consent')} />}
    {step === 'consent' && <Consent submitting={busy} back={() => setStep('introduction')} onSubmit={(name, timing) => void perform(() => studyClient.consent({ name, consentVersion: 'draft-v1', confirmations: [1,2,3,4], timing }), () => setStep('pre-study'))} />}
    {step === 'pre-study' && <PreStudy submitting={busy} onSubmit={(answers, timing) => void perform(() => studyClient.preStudy(answers, timing), () => setStep('assignment'))} />}
    {step === 'assignment' && <AssignmentView status={status} busy={busy} onAssign={() => void perform(studyClient.assignment, () => setStep('preparation'))} />}
    {step === 'preparation' && <Preparation status={status} refresh={refresh} />}
  </ParticipantShell>;
}
