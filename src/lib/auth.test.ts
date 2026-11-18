import { describe, expect, it } from 'vitest';
import { isPublicPath, roleCan } from './auth';

describe('roles', () => {
  it('viewer reads but cannot write', () => {
    expect(roleCan('viewer', 'view.detail')).toBe(true);
    expect(roleCan('viewer', 'audit.write')).toBe(false);
    expect(roleCan('viewer', 'liaison.write')).toBe(false);
  });
  it('auditor writes audit records but not reference data or page text', () => {
    expect(roleCan('auditor', 'audit.write')).toBe(true);
    expect(roleCan('auditor', 'report.write')).toBe(true);
    expect(roleCan('auditor', 'liaison.write')).toBe(false);
    expect(roleCan('auditor', 'content.edit')).toBe(false);
  });
  it('admin can do everything', () => {
    for (const p of ['view.detail', 'audit.write', 'report.write', 'liaison.write', 'reference.write', 'content.edit'] as const) expect(roleCan('admin', p)).toBe(true);
  });
  it('no role means no permissions', () => expect(roleCan(null, 'view.detail')).toBe(false));
});

describe('signed-out access', () => {
  it('only dashboards, sign-in and certificate checks are public', () => {
    for (const p of ['/', '/overview', '/signin', '/verify/NA-CERT-2026-0001']) expect(isPublicPath(p)).toBe(true);
    for (const p of ['/planned', '/pending', '/reports', '/liaisons', '/certificates', '/training']) expect(isPublicPath(p)).toBe(false);
  });
});
