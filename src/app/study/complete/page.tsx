import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import styles from '@/components/study/StudyRuntime.module.css';

export default function CompletePage() {
  return <main className={styles.readyShell}><section className={styles.readyCard}><header className={styles.readyHeader}><span>Đã hoàn tất</span><h1>Cảm ơn bạn đã tham gia</h1><p>Câu trả lời và dữ liệu bắt buộc đã được máy chủ xác nhận. Bạn có thể rời khỏi website.</p></header><div className={styles.readyBody}><div className={styles.rule}><Icon name="check" /> Phiên study đã được ghi nhận hoàn tất.</div><Link className={styles.back} href="/">Xem trạng thái của tôi</Link></div></section></main>;
}
