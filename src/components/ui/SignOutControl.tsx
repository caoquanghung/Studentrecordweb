'use client';

import { useClerk } from '@clerk/nextjs';
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

function ClerkSignOutButton({ className }: { className?: string }) {
  const { signOut } = useClerk();
  const [pending, setPending] = useState(false);
  return <button
    type="button"
    className={className}
    disabled={pending}
    onClick={async () => {
      setPending(true);
      try {
        await signOut({ redirectUrl: '/sign-in' });
      } finally {
        setPending(false);
      }
    }}
  >
    <Icon name="logout" size={16} />{pending ? 'Đang đăng xuất…' : 'Đăng xuất'}
  </button>;
}

/** Renders nothing when Clerk is not configured (demo mode has no session to end). */
export function SignOutControl({ className }: { className?: string }) {
  return clerkEnabled ? <ClerkSignOutButton className={className} /> : null;
}
