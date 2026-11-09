'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { AdminShell } from './AdminShell';
import styles from './AdminView.module.css';

export type AdminSection = 'overview' | 'invitations' | 'combinations' | 'participants' | 'exports';

interface InvitationRow { id: string; email: string; status: string; sentAt: string | null; acceptedAt: string | null }
interface ParticipantRow { id: string; email: string; combination: string; status: string; sourceMode: string | null; updatedAt: string }
interface CombinationRow { id: string; title: string; targetQuota: number; completedCount: number; heldCount: number; enabled: boolean; version: number; videoCount: number }
interface AdminData { mode: 'demo' | 'configured'; metrics: Record<string, number>; invitations: InvitationRow[]; participants: ParticipantRow[]; combinations: CombinationRow[] }

async function loadAdminData() {
  const response = await fetch('/api/admin/overview', { cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? 'Không thể tải dữ liệu quản trị.');
  return (body.data ?? body) as AdminData;
}

function Badge({ status }: { status: string }) {
  const variant = ['watching', 'active'].includes(status) ? styles.active : ['completed', 'accepted'].includes(status) ? styles.complete : styles.waiting;
  const labels: Record<string, string> = { watching: 'Đang xem', active: 'Đang hoạt động', completed: 'Hoàn tất', accepted: 'Đã tham gia', reserved: 'Đang giữ suất', retry_required: 'Cần làm lại', pending: 'Đã gửi', sent: 'Đã gửi', send_failed: 'Gửi lỗi', failed: 'Gửi lỗi' };
  return <span className={`${styles.badge} ${variant}`}>{labels[status] ?? status}</span>;
}

export function AdminView({ section }: { section: AdminSection }) {
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [combinationTitle, setCombinationTitle] = useState('');
  const [combinationQuota, setCombinationQuota] = useState('10');
  const [busy, setBusy] = useState(false);
  useEffect(() => { void loadAdminData().then(setData).catch((cause) => setError((cause as Error).message)); }, []);
  const title = { overview: 'Tổng quan study', invitations: 'Quản lý lời mời', combinations: 'Combination và quota', participants: 'Người tham gia', exports: 'Xuất dữ liệu nghiên cứu' }[section];
  const description = { overview: 'Theo dõi quota, tiến trình và tình trạng hiện tại của nghiên cứu.', invitations: 'Chỉ email được mời và xác minh mới được tham gia study.', combinations: 'Theo dõi nội dung, quota đã hoàn tất, suất đang giữ và khả năng tiếp nhận.', participants: 'Kiểm tra trạng thái phân bổ, phiên đang chạy và kết quả của từng participant.', exports: 'Tải dữ liệu đã được phép dưới dạng CSV hoặc JSON có phiên bản.' }[section];
  const active = section === 'overview' ? '/admin' : `/admin/${section}`;
  async function invite() {
    if (!email.trim()) return;
    setBusy(true);
    try {
      const response = await fetch('/api/admin/invitations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, idempotencyKey: crypto.randomUUID() }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'Không thể tạo lời mời.');
      setEmail('');
      setData(await loadAdminData());
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function createCombination() {
    const targetQuota = Number(combinationQuota);
    if (!combinationTitle.trim() || !Number.isSafeInteger(targetQuota) || targetQuota < 0) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin/combinations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: combinationTitle, targetQuota }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'Không thể tạo combination.');
      setCombinationTitle('');
      setData(await loadAdminData());
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function patchCombination(id: string, patch: { targetQuota?: number; enabled?: boolean }) {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/admin/combinations/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'Không thể cập nhật combination.');
      setData(await loadAdminData());
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  function exportData(format: 'csv' | 'json') {
    const anchor = document.createElement('a');
    anchor.href = `/api/admin/exports?format=${format}`;
    anchor.download = `student-study-export.${format}`;
    anchor.click();
  }
  return <AdminShell active={active} title={title} description={description} mode={data?.mode} actions={<button className={styles.button} type="button" onClick={() => void loadAdminData().then(setData).catch((cause) => setError((cause as Error).message))}><Icon name="refresh" size={15} /> Làm mới</button>}>
    {error && <p className={styles.message}>{error}</p>}
    {!data && !error && <section className={styles.panel}><p className={styles.empty}>Đang tải dữ liệu quản trị…</p></section>}
    {data && section === 'overview' && <Overview data={data} />}
    {data && section === 'invitations' && <><section className={styles.panel}><div className={styles.panelHeader}><div><h2>Mời participant</h2><p>Lời mời không giữ trước quota.</p></div><div className={styles.toolbar}><input className={styles.input} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="student@example.com" /><button className={styles.primary} type="button" disabled={busy || !email.trim()} onClick={() => void invite()}><Icon name="mail" size={15} />{busy ? 'Đang gửi…' : 'Gửi lời mời'}</button></div></div><InvitationTable rows={data.invitations} /></section></>}
    {data && section === 'combinations' && <><section className={styles.panel}><div className={styles.panelHeader}><div><h2>Tạo combination placeholder</h2><p>Metadata/video pipeline có thể cập nhật version sau; quota được bảo vệ bởi server.</p></div><div className={styles.toolbar}><input className={styles.input} value={combinationTitle} onChange={(event) => setCombinationTitle(event.target.value)} placeholder="Tên combination" /><input className={styles.select} type="number" min="0" value={combinationQuota} onChange={(event) => setCombinationQuota(event.target.value)} aria-label="Target quota" /><button className={styles.primary} type="button" disabled={busy || !combinationTitle.trim()} onClick={() => void createCombination()}>Tạo</button></div></div></section><CombinationTable rows={data.combinations} busy={busy} onPatch={(id, patch) => void patchCombination(id, patch)} /></>}
    {data && section === 'participants' && <ParticipantTable rows={data.participants} />}
    {data && section === 'exports' && <section className={styles.exportGrid}><article className={styles.exportCard}><Icon name="export" /><h2>CSV package</h2><p>Nhiều bảng dành cho phân tích: participant, assignment, questionnaire và telemetry hợp lệ. Dữ liệu nhận dạng được tách riêng.</p><button className={styles.primary} type="button" onClick={() => exportData('csv')}>Tải CSV package</button></article><article className={styles.exportCard}><Icon name="database" /><h2>JSON có cấu trúc</h2><p>Giữ quan hệ lồng nhau, phiên bản form/content/algorithm, timestamp và metadata của export.</p><button className={styles.primary} type="button" onClick={() => exportData('json')}>Tải JSON</button></article></section>}
  </AdminShell>;
}

function Overview({ data }: { data: AdminData }) {
  const metrics = [['Đã mời', 'invited'], ['Giữ suất', 'reserved'], ['Đang xem', 'active'], ['Post-study', 'postStudy'], ['Hoàn tất', 'completed'], ['Còn trống', 'available']] as const;
  return <><section className={styles.metrics}>{metrics.map(([label, key]) => <article className={styles.metric} key={key}><span>{label}</span><strong>{data.metrics[key] ?? 0}</strong></article>)}</section><div className={styles.grid}><ParticipantTable rows={data.participants} compact /><CombinationTable rows={data.combinations} compact /></div></>;
}

function InvitationTable({ rows }: { rows: InvitationRow[] }) {
  return <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Email</th><th>Trạng thái</th><th>Đã gửi</th><th>Đã tham gia</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.email}</strong></td><td><Badge status={row.status} /></td><td>{row.sentAt ? new Date(row.sentAt).toLocaleString('vi-VN') : '—'}</td><td>{row.acceptedAt ? new Date(row.acceptedAt).toLocaleString('vi-VN') : '—'}</td></tr>)}</tbody></table></div>;
}

function ParticipantTable({ rows, compact = false }: { rows: ParticipantRow[]; compact?: boolean }) {
  return <section className={styles.panel}><div className={styles.panelHeader}><div><h2>{compact ? 'Participant gần đây' : 'Danh sách participant'}</h2><p>{rows.length} bản ghi trong trang hiện tại</p></div>{!compact && <div className={styles.toolbar}><input className={styles.input} placeholder="Tìm email hoặc pID" /><select className={styles.select} defaultValue="all"><option value="all">Tất cả trạng thái</option><option value="reserved">Giữ suất</option><option value="watching">Đang xem</option><option value="completed">Hoàn tất</option></select></div>}</div><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Participant</th><th>Combination</th><th>Trạng thái</th>{!compact && <><th>Nguồn</th><th>Cập nhật</th></>}</tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><Link href={`/admin/participants/${row.id}`}><strong>{row.id}</strong></Link><br/><span className={styles.muted}>{row.email}</span></td><td>{row.combination}</td><td><Badge status={row.status} /></td>{!compact && <><td>{row.sourceMode ?? '—'}</td><td>{new Date(row.updatedAt).toLocaleString('vi-VN')}</td></>}</tr>)}</tbody></table></div></section>;
}

function CombinationTable({ rows, compact = false, busy = false, onPatch }: { rows: CombinationRow[]; compact?: boolean; busy?: boolean; onPatch?: (id: string, patch: { targetQuota?: number; enabled?: boolean }) => void }) {
  return <section className={styles.panel}><div className={styles.panelHeader}><div><h2>{compact ? 'Quota combinations' : 'Quản lý combinations'}</h2><p>Capacity được tính từ dữ liệu assignment hiện hành.</p></div></div><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Combination</th><th>Quota</th><th>Đã hoàn tất</th><th>Đang giữ</th>{!compact && <><th>Target quota</th><th>Trạng thái</th></>}</tr></thead><tbody>{rows.map((row) => { const used = row.completedCount + row.heldCount; return <tr key={row.id}><td><strong>{row.title}</strong><br/><span className={styles.muted}>v{row.version} · {row.videoCount} video</span></td><td className={styles.capacity}><strong>{used} / {row.targetQuota}</strong><div className={styles.capacityTrack}><span style={{ width: `${Math.min(100, used / Math.max(1, row.targetQuota) * 100)}%` }} /></div></td><td>{row.completedCount}</td><td>{row.heldCount}</td>{!compact && <><td><input className={styles.select} type="number" min={used} defaultValue={row.targetQuota} disabled={busy} aria-label={`Quota ${row.title}`} onBlur={(event) => { const targetQuota = Number(event.target.value); if (Number.isSafeInteger(targetQuota) && targetQuota !== row.targetQuota) onPatch?.(row.id, { targetQuota }); }} /></td><td><button className={row.enabled ? styles.danger : styles.button} type="button" disabled={busy} onClick={() => onPatch?.(row.id, { enabled: !row.enabled })}>{row.enabled ? 'Tạm ngưng' : 'Kích hoạt'}</button></td></>}</tr>; })}</tbody></table></div></section>;
}
