import { describe, it, expect } from 'vitest';
import { siteUrlFrom } from '../siteUrl';

describe('siteUrlFrom', () => {
  it('maps the API URL to the same deployment HTTP site', () => {
    expect(siteUrlFrom('https://proficient-cricket-154.convex.cloud')).toBe('https://proficient-cricket-154.convex.site');
    expect(siteUrlFrom('https://youthful-civet-99.convex.cloud/')).toBe('https://youthful-civet-99.convex.site');
  });
  it('falls back to production for missing or odd values', () => {
    expect(siteUrlFrom(undefined)).toBe('https://proficient-cricket-154.convex.site');
    expect(siteUrlFrom('http://localhost:3210')).toBe('https://proficient-cricket-154.convex.site');
  });
});
