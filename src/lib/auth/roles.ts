import type { AppRole } from '@/types/study';

export const APP_PERMISSIONS = [
  'study:participate',
  'invitations:manage',
  'combinations:manage',
  'study-data:read',
  'study-data:export',
] as const;

export type AppPermission = (typeof APP_PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<AppRole, ReadonlySet<AppPermission>> = {
  student: new Set<AppPermission>(['study:participate']),
  admin: new Set<AppPermission>(APP_PERMISSIONS),
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function roleFromClaims(claimsValue: unknown): AppRole {
  const claims = record(claimsValue);
  const metadata = record(claims?.metadata);
  const publicMetadata = record(claims?.publicMetadata) ?? record(claims?.public_metadata);
  const role = metadata?.appRole ?? publicMetadata?.appRole ?? claims?.appRole;
  return role === 'admin' ? 'admin' : 'student';
}

export function permissionsForRole(role: AppRole): readonly AppPermission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function hasPermission(role: AppRole, permission: AppPermission) {
  return ROLE_PERMISSIONS[role].has(permission);
}
