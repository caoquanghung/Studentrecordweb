'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { SignOutControl } from '@/components/ui/SignOutControl';
import styles from './AdminShell.module.css';

const items: { href: string; label: string; icon: IconName }[] = [
  { href: '/admin', label: 'Tổng quan', icon: 'dashboard' },
  { href: '/admin/invitations', label: 'Lời mời', icon: 'mail' },
  { href: '/admin/combinations', label: 'Combinations', icon: 'list' },
  { href: '/admin/participants', label: 'Người tham gia', icon: 'users' },
  { href: '/admin/exports', label: 'Xuất dữ liệu', icon: 'export' },
];

export function AdminShell({ active, title, description, mode, actions, children }: { active: string; title: string; description: string; mode?: string; actions?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <div className={styles.shell}>
    <button className={styles.menu} type="button" aria-label="Mở điều hướng" onClick={() => setOpen((value) => !value)}>☰</button>
    <aside className={`${styles.sidebar} ${open ? styles.sidebarOpen : ''}`}>
      <div><Link className={styles.brand} href="/admin"><span className={styles.mark}><Icon name="book" /></span><span><strong>Lecture Study</strong><span>Research Administration</span></span></Link><nav className={styles.nav} aria-label="Quản trị study">{items.map((item) => <Link key={item.href} href={item.href} className={active === item.href ? styles.active : ''} onClick={() => setOpen(false)}><Icon name={item.icon} size={18} />{item.label}</Link>)}</nav></div>
      <footer className={styles.footer}>{mode === 'demo' && <span className={styles.demo}>DEMO DATA · KHÔNG PHẢI DỮ LIỆU THẬT</span>}<Link className={styles.participantLink} href="/">Xem giao diện participant</Link><SignOutControl className={styles.signOut} /></footer>
    </aside>
    <main className={styles.main}><div className={styles.content}><header className={styles.header}><div><span>Quản trị nghiên cứu</span><h1>{title}</h1><p>{description}</p></div>{actions && <div className={styles.headerActions}>{actions}</div>}</header>{children}</div></main>
  </div>;
}
