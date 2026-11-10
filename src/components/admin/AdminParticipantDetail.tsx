'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminShell } from './AdminShell';
import styles from './AdminParticipantDetail.module.css';

type Row = Record<string, unknown>;

function object(value: unknown): Row {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
}

function display(value: unknown) {
  if (value == null || value === '') return '—';
  return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
}

export function AdminParticipantDetail({ participantId }: { participantId: string }) {
  const [data, setData] = useState<Row | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    fetch(`/api/admin/participants/${participantId}`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? 'Không thể tải participant.');
        return object(body.data ?? body);
      })
      .then((value) => { if (current) setData(value); })
      .catch((cause) => { if (current) setError((cause as Error).message); });
    return () => { current = false; };
  }, [participantId]);

  const participant = object(data?.participant ?? data);
  const demoForms: unknown[] = [
    data?.preStudy ? { form_kind: 'pre_study', status: 'submitted', answers: data.preStudy } : null,
    data?.postStudy ? { form_kind: 'post_study', status: 'submitted', answers: data.postStudy } : null,
  ];
  const forms = Array.isArray(data?.forms)
    ? data.forms.map(object)
    : demoForms.filter(Boolean).map(object);
  const telemetry = Array.isArray(data?.telemetry) ? data.telemetry.map(object) : [];
  const assignments = Array.isArray(data?.assignments)
    ? data.assignments.map(object)
    : data?.assignment ? [object(data.assignment)] : [];
  const attempts = Array.isArray(data?.attempts)
    ? data.attempts.map(object)
    : data?.attempt ? [object(data.attempt)] : [];

  return <AdminShell active="/admin/participants" title="Chi tiết participant" description="Câu trả lời, assignment và telemetry hợp lệ hiện còn trên server." actions={<Link className={styles.back} href="/admin/participants">Quay lại danh sách</Link>}>
    {error && <p className={styles.error}>{error}</p>}
    {!data && !error && <section className={styles.panel}>Đang tải…</section>}
    {data && <div className={styles.stack}>
      <section className={styles.panel}><h2>Participant</h2><dl className={styles.summary}><div><dt>pID</dt><dd>{display(participant.id ?? participantId)}</dd></div><div><dt>Email</dt><dd>{display(participant.email)}</dd></div><div><dt>Tạo lúc</dt><dd>{display(participant.created_at)}</dd></div></dl></section>
      <section className={styles.panel}><h2>Assignment</h2>{assignments.length ? <div className={styles.tableWrap}><table><thead><tr><th>ID</th><th>Combination</th><th>Trạng thái</th><th>Deadline</th></tr></thead><tbody>{assignments.map((row, index) => <tr key={String(row.id ?? index)}><td>{display(row.id)}</td><td>{display(row.combination_id ?? row.combinationId)}</td><td>{display(row.status)}</td><td>{display(row.reservation_expires_at ?? row.reservationExpiresAt)}</td></tr>)}</tbody></table></div> : <p>Chưa có assignment.</p>}</section>
      <section className={styles.panel}><h2>Attempts</h2>{attempts.length ? <div className={styles.tableWrap}><table><thead><tr><th>ID</th><th>Lần</th><th>Trạng thái</th><th>Nguồn</th><th>Lý do invalid</th></tr></thead><tbody>{attempts.map((row, index) => <tr key={String(row.id ?? index)}><td>{display(row.id)}</td><td>{display(row.attempt_number ?? row.attemptNumber)}</td><td>{display(row.status)}</td><td>{display(row.source_mode ?? row.sourceMode)}</td><td>{display(row.invalidation_reason)}</td></tr>)}</tbody></table></div> : <p>Chưa có attempt.</p>}</section>
      <section className={styles.panel}><h2>Questionnaire responses</h2>{forms.length ? <div className={styles.cards}>{forms.map((row, index) => <article key={String(row.id ?? index)}><header><strong>{display(row.form_kind ?? row.formKind)}</strong><span>{display(row.status)}</span></header><h3>Answers</h3><pre>{display(row.answers)}</pre><h3>Timing</h3><pre>{display(row.timing)}</pre></article>)}</div> : <p>Chưa có câu trả lời.</p>}</section>
      <section className={styles.panel}><h2>Telemetry ({telemetry.length})</h2>{telemetry.length ? <div className={styles.tableWrap}><table><thead><tr><th>Sequence</th><th>Event</th><th>Client time</th><th>Payload</th></tr></thead><tbody>{telemetry.map((row, index) => <tr key={String(row.id ?? index)}><td>{display(row.sequence)}</td><td>{display(row.event_type ?? row.eventType)}</td><td>{display(row.client_wall_time ?? row.clientWallTime)}</td><td><pre>{display(row.payload)}</pre></td></tr>)}</tbody></table></div> : <p>Không có telemetry hợp lệ (attempt invalid đã được purge).</p>}</section>
    </div>}
  </AdminShell>;
}
