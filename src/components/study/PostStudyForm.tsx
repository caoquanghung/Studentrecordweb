'use client';

import { useState } from 'react';
import { useFormTiming } from '@/lib/study/form-timing';
import { participantStyles } from './ParticipantShell';
import styles from './StudyRuntime.module.css';

const scaled = [
  ['understanding', 'Bạn cảm thấy mình hiểu nội dung bài giảng ở mức nào?', 'Hoàn toàn không hiểu', 'Hiểu rất rõ'],
  ['mentalDemand', 'Việc theo dõi bài giảng đòi hỏi tinh thần ở mức nào?', 'Không đòi hỏi', 'Rất đòi hỏi'],
  ['effort', 'Bạn đã nỗ lực hiểu nội dung ở mức nào?', 'Rất ít', 'Rất nhiều'],
  ['focusEase', 'Việc giữ tập trung dễ đến mức nào?', 'Rất khó', 'Rất dễ'],
  ['visualClarity', 'Phần trình bày hình ảnh rõ ràng đến mức nào?', 'Hoàn toàn không rõ', 'Rất rõ'],
  ['audioClarity', 'Âm thanh rõ ràng đến mức nào?', 'Hoàn toàn không rõ', 'Rất rõ'],
  ['satisfaction', 'Mức độ hài lòng chung với trải nghiệm này?', 'Rất không hài lòng', 'Rất hài lòng'],
] as const;

export function PostStudyForm({ busy, onSubmit }: { busy: boolean; onSubmit: (answers: Record<string, unknown>, timing: Record<string, unknown>) => void }) {
  const [savedLabel, setSavedLabel] = useState('Chưa gửi');
  const formTiming = useFormTiming();
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const answers = Object.fromEntries(new FormData(event.currentTarget).entries());
    setSavedLabel('Đang gửi…');
    onSubmit(answers, formTiming());
  }
  return <form className={styles.postForm} onSubmit={submit}>
    {scaled.map(([name, question, low, high]) => <div className={styles.question} key={name}><label htmlFor={name}>{question}</label><select id={name} name={name} required defaultValue=""><option value="" disabled>Chọn từ 1 đến 7</option>{[1,2,3,4,5,6,7].map((value) => <option key={value} value={value}>{value}{value === 1 ? ` — ${low}` : value === 7 ? ` — ${high}` : ''}</option>)}</select></div>)}
    <div className={styles.question}><label htmlFor="pace">Nhịp độ bài giảng phù hợp thế nào?</label><select id="pace" name="pace" required defaultValue=""><option value="" disabled>Chọn một phương án</option><option value="much-too-slow">Quá chậm</option><option value="slightly-slow">Hơi chậm</option><option value="about-right">Vừa phải</option><option value="slightly-fast">Hơi nhanh</option><option value="much-too-fast">Quá nhanh</option></select></div>
    <div className={styles.question}><label htmlFor="technicalProblem">Bạn có gặp vấn đề kỹ thuật trong lần thực hiện này?</label><select id="technicalProblem" name="technicalProblem" required defaultValue="no"><option value="no">Không</option><option value="yes">Có</option><option value="unsure">Không chắc</option></select></div>
    <div className={styles.question}><label htmlFor="distraction">Có điều gì ngoài study làm bạn xao nhãng?</label><select id="distraction" name="distraction" required defaultValue="no"><option value="no">Không</option><option value="yes">Có</option><option value="prefer-not">Không muốn trả lời</option></select></div>
    <div className={styles.question}><label htmlFor="helped">Điều gì giúp bạn hiểu nội dung?</label><textarea id="helped" name="helped" maxLength={1000} /></div>
    <div className={styles.question}><label htmlFor="improve">Điều gì khó theo dõi hoặc cần cải thiện?</label><textarea id="improve" name="improve" maxLength={1000} /></div>
    <div className={styles.postActions}><small aria-live="polite">{busy ? 'Đang đồng bộ câu trả lời và telemetry…' : savedLabel}</small><button className={participantStyles.primary} type="submit" disabled={busy}>{busy ? 'Đang hoàn tất…' : 'Gửi và hoàn tất study'}</button></div>
  </form>;
}
