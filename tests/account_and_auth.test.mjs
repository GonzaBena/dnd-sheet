// tests/account_and_auth.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

test('dist/index.html and dist/campaigns/index.html contain Delete Account Modal', () => {
  const indexHtml = fs.readFileSync(path.resolve('dist/index.html'), 'utf-8');
  assert.ok(indexHtml.includes('delete-account-modal'), 'index.html must include delete-account-modal');
  assert.ok(indexHtml.includes('delete-account-confirm-input'), 'index.html must include confirmation input');
  assert.ok(indexHtml.includes('delete-account-submit-btn'), 'index.html must include deletion submit button');
  assert.ok(indexHtml.includes('btn-delete-account-top'), 'index.html must include desktop delete account action');
  assert.ok(indexHtml.includes('drawer-item-delete-account'), 'index.html must include mobile drawer delete account action');

  const campaignsHtml = fs.readFileSync(path.resolve('dist/campaigns/index.html'), 'utf-8');
  assert.ok(campaignsHtml.includes('delete-account-modal'), 'campaigns/index.html must include delete-account-modal');
  assert.ok(campaignsHtml.includes('menu-delete-account-btn'), 'campaigns/index.html must include header menu delete account option');
});

test('AuthGate markup in index.html contains dedicated password recovery view', () => {
  const indexHtml = fs.readFileSync(path.resolve('dist/index.html'), 'utf-8');
  assert.ok(indexHtml.includes('auth-forgot'), 'Must contain forgot password button');
  assert.ok(indexHtml.includes('auth-forgot-links'), 'Must contain forgot mode actions container');
  assert.ok(indexHtml.includes('auth-back-to-login'), 'Must contain back to login button');
});

test('authService exports required methods and error descriptions', async () => {
  const authModule = await import('../src/scripts/firebase/authService.ts');
  assert.strictEqual(typeof authModule.sendPasswordReset, 'function', 'sendPasswordReset must be exported');
  assert.strictEqual(typeof authModule.deleteCurrentUser, 'function', 'deleteCurrentUser must be exported');
  
  const recentLoginErr = authModule.describeAuthError({ code: 'auth/requires-recent-login' });
  assert.ok(recentLoginErr.includes('volver a iniciar sesión'), 'Must describe requires-recent-login clearly');
});

test('firestore.rules includes allow delete on users/{userId}', () => {
  const rules = fs.readFileSync(path.resolve('firestore.rules'), 'utf-8');
  assert.ok(
    rules.includes('allow delete: if signedIn() && uid() == userId;'),
    'firestore.rules must allow users to delete their own document'
  );
});

test('session synchronization and post-auth resolution logic', () => {
  const cloudSyncSrc = fs.readFileSync(path.resolve('src/scripts/data/cloudSync.ts'), 'utf-8');
  assert.ok(cloudSyncSrc.includes("localStorage.setItem('dnd_cloud_authed', '1')"), 'cloudSync must persist authed hint');
  assert.ok(cloudSyncSrc.includes("if (this.uid === user.uid)"), 'cloudSync must guard same user');
  assert.ok(cloudSyncSrc.includes("this.setState('ready')"), 'cloudSync must transition to ready');

  const authGateSrc = fs.readFileSync(path.resolve('src/components/auth/AuthGate.astro'), 'utf-8');
  assert.ok(authGateSrc.includes('handlePostAuthSuccess()'), 'AuthGate must handle post auth success callback');
  assert.ok(authGateSrc.includes("localStorage.removeItem('dnd_demo_mode')"), 'AuthGate must remove demo mode flag upon login');

  const indexSrc = fs.readFileSync(path.resolve('src/pages/index.astro'), 'utf-8');
  assert.ok(indexSrc.includes('cloudSession.ready().then'), 'index.astro must await cloudSession.ready()');
  assert.ok(indexSrc.includes('dnd_cloud_authed'), 'index.astro must check previous authed state to prevent landing flash');

  const campaignsSrc = fs.readFileSync(path.resolve('src/pages/campaigns.astro'), 'utf-8');
  assert.ok(campaignsSrc.includes("localStorage.removeItem('dnd_demo_mode')"), 'campaigns.astro must clear sticky demo mode for authed sessions');
});
