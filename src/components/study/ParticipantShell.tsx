import type { ReactNode } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { SignOutControl } from '@/components/ui/SignOutControl';
import styles from './ParticipantShell.module.css';

const steps = [
  ['Giới thiệu', 'introduction'],
  ['Đồng thuận', 'consent'],
  ['Khảo sát đầu', 'pre-study'],
  ['Phân bổ', 'assignment'],
  ['Chuẩn bị', 'preparation'],
] as const;

export function ParticipantShell({ currentStep, mode, children }: { currentStep: string; mode?: string; children: ReactNode }) {
  const currentIndex = Math.max(0, steps.findIndex(([, id]) => id === currentStep));
  return <div className={styles.shell}>
    <header className={styles.header}>
      <Link className={styles.brand} href="/">
        <span className={styles.brandMark}><Icon name="book" /></span>
        <span><strong>Lecture Study</strong><span>Nghiên cứu trải nghiệm học tập</span></span>
      </Link>
      <div className={styles.headerEnd}>
        {mode === 'demo' && <span className={styles.mode}>DEMO MODE</span>}
        <SignOutControl className={styles.signOut} />
      </div>
    </header>
    <main className={styles.main}>
      <nav className={styles.stepper} aria-label="Tiến trình trước study">
        {steps.map(([label, id], index) => <div key={id} className={`${styles.step} ${index < currentIndex ? styles.stepDone : ''} ${index === currentIndex ? styles.stepActive : ''}`} aria-current={index === currentIndex ? 'step' : undefined}>
          <span className={styles.stepNumber}>{index < currentIndex ? <Icon name="check" size={15} /> : index + 1}</span><span>{label}</span>
        </div>)}
      </nav>
      {children}
    </main>
  </div>;
}

export function StudyPanel({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) {
  return <section className={styles.panel}>
    <header className={styles.panelHeader}><span className={styles.eyebrow}>{eyebrow}</span><h1>{title}</h1><p>{description}</p></header>
    <div className={styles.panelBody}>{children}</div>
  </section>;
}

export { styles as participantStyles };
