import { SignIn } from '@clerk/nextjs';
import Link from 'next/link';
import { Suspense } from 'react';
import { Icon } from '@/components/ui/Icon';
import styles from './page.module.css';

export default function SignInPage() {
  const configured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  return <main className={styles.shell}><section className={styles.story}><span className={styles.mark}><Icon name="book" size={27} /></span><span>Lecture Study</span><h1>Tham gia nghiên cứu trong một không gian tập trung.</h1><p>Đăng nhập bằng đúng email đã được nhóm nghiên cứu mời. Mỗi participant được phân bổ một playlist và thực hiện toàn bộ study trên laptop.</p></section><section className={styles.auth}>{configured ? <Suspense fallback={null}><SignIn /></Suspense> : <div className={styles.demoCard}><span>Development demo</span><h2>Authentication chưa được cấu hình</h2><p>Clerk chưa có khóa trong môi trường này. Chế độ demo dùng state trong tiến trình server, sẽ mất khi server khởi động lại và không đại diện cho một phiên nghiên cứu thật.</p><Link href="/">Vào demo participant</Link><Link href="/admin">Xem demo admin</Link></div>}</section></main>;
}
