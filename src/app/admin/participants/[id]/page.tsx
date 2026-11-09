import { Suspense } from 'react';
import { AdminParticipantDetail } from '@/components/admin/AdminParticipantDetail';

async function ParticipantContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminParticipantDetail participantId={id} />;
}

export default function ParticipantPage(props: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<main style={{ padding: '2rem' }}>Đang tải participant…</main>}>
    <ParticipantContent {...props} />
  </Suspense>;
}
