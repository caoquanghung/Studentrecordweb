import { Suspense } from 'react';
import { StudyRuntime } from '@/components/study/StudyRuntime';

async function StudyRunContent({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const query = await searchParams;
  return <StudyRuntime initialSourceMode={query.source === 'zip' ? 'zip' : 'stream'} />;
}

export default function StudyRunPage(props: {
  searchParams: Promise<{ source?: string }>;
}) {
  return <Suspense fallback={<main style={{ padding: '2rem' }}>Đang mở phiên study…</main>}>
    <StudyRunContent {...props} />
  </Suspense>;
}
