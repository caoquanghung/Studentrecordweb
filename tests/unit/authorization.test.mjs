import assert from 'node:assert/strict';
import test from 'node:test';
import {
  APP_PERMISSIONS,
  hasPermission,
  permissionsForRole,
  roleFromClaims,
} from '../../src/lib/auth/roles.ts';

test('unknown, malformed, and client-invented roles fail closed to student', () => {
  for (const claims of [
    undefined,
    null,
    'admin',
    { metadata: 'admin' },
    { metadata: { appRole: 'developer' } },
    { metadata: { appRole: 'owner' } },
    { publicMetadata: { appRole: true } },
  ]) {
    assert.equal(roleFromClaims(claims), 'student');
  }
});

test('reads admin only from the supported signed claim shapes', () => {
  assert.equal(roleFromClaims({ metadata: { appRole: 'admin' } }), 'admin');
  assert.equal(roleFromClaims({ publicMetadata: { appRole: 'admin' } }), 'admin');
  assert.equal(roleFromClaims({ public_metadata: { appRole: 'admin' } }), 'admin');
  assert.equal(roleFromClaims({ appRole: 'admin' }), 'admin');
});

test('student has participation only while admin receives every declared capability', () => {
  assert.deepEqual(permissionsForRole('student'), ['study:participate']);
  assert.equal(hasPermission('student', 'study:participate'), true);
  for (const permission of APP_PERMISSIONS.filter((value) => value !== 'study:participate')) {
    assert.equal(hasPermission('student', permission), false, `${permission} must remain privileged`);
  }

  assert.deepEqual(new Set(permissionsForRole('admin')), new Set(APP_PERMISSIONS));
  for (const permission of APP_PERMISSIONS) {
    assert.equal(hasPermission('admin', permission), true);
  }
});

test('permission arrays cannot mutate the role policy', () => {
  const copy = permissionsForRole('student');
  copy.push('study-data:export');
  assert.equal(hasPermission('student', 'study-data:export'), false);
  assert.deepEqual(permissionsForRole('student'), ['study:participate']);
});
