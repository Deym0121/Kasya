import { describe, expect, it } from 'vitest';
import { APPLE_EULA_URL, CONTACT_EMAIL, PRIVACY_BODY, SUPPORT_BODY, TERMS_BODY, legalHtml } from '../pages';

/** The hosted legal pages must keep saying what App Review checks for. */
describe('legal pages', () => {
  it('privacy policy covers every kind of data that leaves the phone', () => {
    for (const s of [
      'Sign in with Apple',
      'Apple Health',
      'never used for advertising',
      'daily totals',
      'distance and moving time of your runs',
      'club-level totals',
      'photo',
      'Report',
      'AI coach',
      'RevenueCat',
      'Delete account',
      'Data Privacy Act',
      'routes',
    ]) {
      expect(PRIVACY_BODY, s).toContain(s);
    }
    // the old email/password wording is gone
    expect(PRIVACY_BODY).not.toMatch(/password/i);
  });

  it('terms carry the UGC rules, subscription terms and Apple EULA', () => {
    expect(TERMS_BODY).toContain('zero tolerance for objectionable content and abusive users');
    expect(TERMS_BODY).toContain('Report this club');
    expect(TERMS_BODY).toContain('24 hours');
    expect(TERMS_BODY).toContain('auto-renewing subscription');
    expect(TERMS_BODY).toContain(APPLE_EULA_URL);
    expect(TERMS_BODY).toContain('not medical advice');
  });

  it('support explains watches via Apple Health and reporting clubs', () => {
    expect(SUPPORT_BODY).toContain('Garmin Connect');
    expect(SUPPORT_BODY).toContain('Report this club');
  });

  it('every page links the others and the contact address', () => {
    const html = legalHtml('Kasya — Terms of Use', TERMS_BODY);
    expect(html).toMatch(/^<!doctype html>/);
    for (const href of ['/privacy', '/terms', '/support', `mailto:${CONTACT_EMAIL}`]) expect(html).toContain(`href="${href}"`);
  });
});
