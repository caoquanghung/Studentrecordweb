import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Lecture Study', template: '%s · Lecture Study' },
  description: 'Website tham gia nghiên cứu HCI về trải nghiệm học qua bài giảng được ghi hình.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const content = (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
  return process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    ? <ClerkProvider>{content}</ClerkProvider>
    : content;
}
