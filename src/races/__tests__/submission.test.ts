import { describe, it, expect } from 'vitest';
import {
  validateSubmission,
  isValidIsoDate,
  addMonthsIso,
  addDaysIso,
  daysBetweenIso,
  utcTodayIso,
  todayIsoLocal,
  SERVER_DATE_SLACK_DAYS,
  formatDateInput,
  isSafePublicUrl,
  hostOf,
  normalizeRaceName,
  raceNamesSimilar,
  isLikelySameRace,
  communityEventId,
  planCuratedReplace,
  missingLinkFields,
  classifyFetchStatus,
  htmlToText,
  pageMentionsName,
  pageMentionsDate,
  parseAiVerdict,
  buildVerifyMessages,
  summarizeVerification,
  proGateAllows,
  parseAdminEmails,
  isAdminEmail,
  composeReportReason,
  validateReportReason,
  cleanReviewNote,
  submissionStatusCopy,
  SUBMISSION_LIMITS,
  RACE_SUBMISSION_PRO_BENEFIT,
} from '../submission';
import type { RaceSubmissionInput } from '../submission';

const TODAY = '2026-10-08';

const good = {
  name: '  Manila   Marathon 2027 ',
  dateStart: '2027-02-14',
  city: 'Manila',
  country: 'ph',
  distances: ['42K', '5K', '21K', '5K'],
  officialUrl: 'https://www.manilamarathon.ph/2027',
};

// Same shape as the server-side ingest validator in convex/http.ts — every
// approved community row must be able to round-trip through the weekly routine.
const INGEST_ID = /^[a-z0-9-]{6,80}$/;
const INGEST_URL = /^https:\/\/\S{5,300}$/;

describe('dates', () => {
  it('validates real calendar dates only', () => {
    expect(isValidIsoDate('2027-02-28')).toBe(true);
    expect(isValidIsoDate('2028-02-29')).toBe(true);
    expect(isValidIsoDate('2027-02-29')).toBe(false);
    expect(isValidIsoDate('2027-13-01')).toBe(false);
    expect(isValidIsoDate('2027-2-1')).toBe(false);
    expect(isValidIsoDate(20270214)).toBe(false);
  });

  it('does month/day math in calendar days', () => {
    expect(addMonthsIso('2026-10-08', 18)).toBe('2028-04-08');
    expect(addMonthsIso('2027-01-31', 1)).toBe('2027-02-28');
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetweenIso('2027-02-14', '2027-02-15')).toBe(1);
    expect(daysBetweenIso('2027-02-15', '2027-02-14')).toBe(-1);
  });

  it('reads today on the right calendar', () => {
    expect(utcTodayIso(Date.UTC(2026, 9, 8, 23, 59))).toBe('2026-10-08');
    expect(todayIsoLocal(new Date(2026, 9, 8, 23, 30))).toBe('2026-10-08');
  });

  it('formats keypad digits into YYYY-MM-DD', () => {
    expect(formatDateInput('2027')).toBe('2027');
    expect(formatDateInput('202702')).toBe('2027-02');
    expect(formatDateInput('20270214')).toBe('2027-02-14');
    expect(formatDateInput('2027-02-14')).toBe('2027-02-14');
    expect(formatDateInput('2027021499')).toBe('2027-02-14');
  });
});

describe('validateSubmission', () => {
  it('accepts and normalizes a legit race', () => {
    const r = validateSubmission(good, TODAY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({
      name: 'Manila Marathon 2027',
      dateStart: '2027-02-14',
      city: 'Manila',
      country: 'PH',
      distances: ['5K', '21K', '42K'],
      officialUrl: 'https://www.manilamarathon.ph/2027',
    });
  });

  it('keeps optional fields only when filled, and drops a same-day end date', () => {
    const r = validateSubmission(
      { ...good, dateEnd: '2027-02-14', registrationUrl: '', organizer: '  Runrio  ' },
      TODAY,
    );
    expect(r.ok && r.value).toMatchObject({ organizer: 'Runrio' });
    expect(r.ok && 'dateEnd' in r.value).toBe(false);
    expect(r.ok && 'registrationUrl' in r.value).toBe(false);
    const multi = validateSubmission({ ...good, dateEnd: '2027-02-15' }, TODAY);
    expect(multi.ok && multi.value.dateEnd).toBe('2027-02-15');
  });

  it('requires the official https page', () => {
    const missing = validateSubmission({ ...good, officialUrl: '' }, TODAY);
    expect(!missing.ok && missing.errors.officialUrl).toMatch(/official page/);
    const http = validateSubmission({ ...good, officialUrl: 'http://manilamarathon.ph' }, TODAY);
    expect(!http.ok && http.errors.officialUrl).toMatch(/https/);
    const local = validateSubmission({ ...good, officialUrl: 'https://localhost/race' }, TODAY);
    expect(!local.ok && local.errors.officialUrl).toBeTruthy();
  });

  it('rejects past dates and dates beyond the 18-month horizon', () => {
    const past = validateSubmission({ ...good, dateStart: '2026-10-07' }, TODAY);
    expect(!past.ok && past.errors.dateStart).toMatch(/passed/);
    expect(validateSubmission({ ...good, dateStart: TODAY }, TODAY).ok).toBe(true);
    expect(validateSubmission({ ...good, dateStart: '2028-04-08' }, TODAY).ok).toBe(true);
    const far = validateSubmission({ ...good, dateStart: '2028-04-09' }, TODAY);
    expect(!far.ok && far.errors.dateStart).toMatch(/18 months/);
    const junk = validateSubmission({ ...good, dateStart: '14/02/2027' }, TODAY);
    expect(!junk.ok && junk.errors.dateStart).toMatch(/YYYY-MM-DD/);
  });

  it('server slack widens both ends by a day, so the app is never looser than the server', () => {
    const slack = { slackDays: SERVER_DATE_SLACK_DAYS };
    expect(validateSubmission({ ...good, dateStart: '2026-10-07' }, TODAY, slack).ok).toBe(true);
    expect(validateSubmission({ ...good, dateStart: '2026-10-06' }, TODAY, slack).ok).toBe(false);
    expect(validateSubmission({ ...good, dateStart: '2028-04-09' }, TODAY, slack).ok).toBe(true);
    expect(validateSubmission({ ...good, dateStart: '2028-04-10' }, TODAY, slack).ok).toBe(false);
  });

  it('bounds multi-day events', () => {
    const before = validateSubmission({ ...good, dateEnd: '2027-02-13' }, TODAY);
    expect(!before.ok && before.errors.dateEnd).toMatch(/before/);
    const long = validateSubmission({ ...good, dateEnd: '2027-03-14' }, TODAY);
    expect(!long.ok && long.errors.dateEnd).toMatch(/14 days/);
  });

  it('only accepts whitelisted distances and countries', () => {
    const none = validateSubmission({ ...good, distances: [] }, TODAY);
    expect(!none.ok && none.errors.distances).toBeTruthy();
    const odd = validateSubmission({ ...good, distances: ['5K', '3K'] }, TODAY);
    expect(!odd.ok && odd.errors.distances).toBeTruthy();
    const country = validateSubmission({ ...good, country: 'FR' }, TODAY);
    expect(!country.ok && country.errors.country).toBeTruthy();
  });

  it('enforces name/city length and content limits', () => {
    const short = validateSubmission({ ...good, name: 'Run' }, TODAY);
    expect(!short.ok && short.errors.name).toMatch(/short/);
    const long = validateSubmission({ ...good, name: 'M'.repeat(SUBMISSION_LIMITS.nameMax + 1) }, TODAY);
    expect(!long.ok && long.errors.name).toMatch(/120/);
    const link = validateSubmission({ ...good, name: 'Best race www.spam.biz' }, TODAY);
    expect(!link.ok && link.errors.name).toMatch(/link/);
    const markup = validateSubmission({ ...good, name: '<b>Manila Marathon</b>' }, TODAY);
    expect(!markup.ok && markup.errors.name).toBeTruthy();
    const digits = validateSubmission({ ...good, name: '12345 6789' }, TODAY);
    expect(!digits.ok && digits.errors.name).toBeTruthy();
    const city = validateSubmission({ ...good, city: 'C'.repeat(81) }, TODAY);
    expect(!city.ok && city.errors.city).toMatch(/80/);
    expect(validateSubmission({ ...good, city: '' }, TODAY).ok).toBe(false);
  });

  it('treats non-string junk as missing, never throws', () => {
    const r = validateSubmission({ name: 42, distances: 'all', country: null, officialUrl: {} } as never, TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.errors).sort()).toEqual(['city', 'country', 'dateStart', 'distances', 'name', 'officialUrl']);
    }
  });

  it('produces values the race ingest validator accepts', () => {
    const r = validateSubmission(
      { ...good, registrationUrl: 'https://raceroster.com/events/2027/123/manila' },
      TODAY,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.name.length).toBeLessThanOrEqual(120);
    expect(r.value.city.length).toBeLessThanOrEqual(80);
    expect(r.value.officialUrl).toMatch(INGEST_URL);
    expect(r.value.registrationUrl).toMatch(INGEST_URL);
  });
});

describe('isSafePublicUrl (SSRF guard for the server-side fetch)', () => {
  it.each([
    'https://manilamarathon.ph',
    'https://www.pinoyfitness.com/2027/01/milo-marathon/',
    'https://raceroster.com/events/2027/1?x=1#reg',
    'https://xn--maratn-cwa.ph/',
    'https://example.com:443/path',
  ])('allows %s', (u) => expect(isSafePublicUrl(u)).toBe(true));

  it.each([
    'http://manilamarathon.ph',
    'https://localhost/',
    'https://foo.localhost/',
    'https://127.0.0.1/',
    'https://10.0.0.1/',
    'https://[::1]/',
    'https://0x7f000001/',
    'https://10.0.0.1.nip.io/',
    'https://10-0-0-1.sslip.io/',
    'https://user:pass@example.com/',
    'https://example.com:8080/',
    'https://intranet.corp/',
    'https://printer.local/',
    'https://metadata.internal/',
    'https://a.ph',
    'https://exa mple.com',
    'javascript:alert(1)',
    'https://example.123/',
    `https://example.com/${'a'.repeat(300)}`,
  ])('blocks %s', (u) => expect(isSafePublicUrl(u)).toBe(false));

  it('allows http only when asked (final URL after redirects)', () => {
    expect(isSafePublicUrl('http://manilamarathon.ph/', { allowHttp: true })).toBe(true);
    expect(isSafePublicUrl('http://192.168.0.1/', { allowHttp: true })).toBe(false);
  });

  it('extracts a display host', () => {
    expect(hostOf('https://www.Pinoyfitness.com/x')).toBe('pinoyfitness.com');
    expect(hostOf('nope')).toBe('');
  });
});

describe('duplicate matching', () => {
  it('normalizes names', () => {
    expect(normalizeRaceName('The 10th Annual Manila Marathon 2027!')).toBe('manila marathon');
    expect(normalizeRaceName('Café Run & Ride Int’l')).toBe('cafe run ride int l');
    expect(normalizeRaceName("Café Run & Ride Int'l")).toBe('cafe run ride international');
  });

  it('matches the same race written differently', () => {
    expect(raceNamesSimilar('Manila Marathon 2027', 'The Manila Marathon')).toBe(true);
    expect(raceNamesSimilar('MILO Marathon - Manila', 'Milo Marathon Manila Leg')).toBe(true);
    expect(raceNamesSimilar('Condura Skyway Marathon', 'Condura Skyway Marathon 2027')).toBe(true);
  });

  it('keeps different races apart', () => {
    expect(raceNamesSimilar('Tokyo Marathon', 'Osaka Marathon')).toBe(false);
    expect(raceNamesSimilar('Run United 1', 'Run United 2')).toBe(false);
    expect(raceNamesSimilar('Fun Run', 'Night Fun Run')).toBe(false);
    expect(raceNamesSimilar('Manila Marathon', 'Cebu Marathon')).toBe(false);
    expect(raceNamesSimilar('', 'Manila Marathon')).toBe(false);
  });

  it('requires the date within ±1 day', () => {
    const a = { name: 'Manila Marathon', dateStart: '2027-02-14' };
    expect(isLikelySameRace(a, { name: 'The Manila Marathon 2027', dateStart: '2027-02-15' })).toBe(true);
    expect(isLikelySameRace(a, { name: 'The Manila Marathon 2027', dateStart: '2027-02-16' })).toBe(false);
    expect(isLikelySameRace(a, { name: 'Manila Marathon', dateStart: 'bad' })).toBe(false);
  });
});

describe('communityEventId', () => {
  it('makes an ingest-safe slug and avoids collisions', () => {
    const none = () => false;
    expect(communityEventId('Manila Marathon 2027', '2027-02-14', none, 'abc')).toBe('manila-marathon-2027');
    const taken = new Set(['manila-marathon-2027']);
    expect(communityEventId('Manila Marathon', '2027-02-14', (id) => taken.has(id), 'k57abcd123')).toBe(
      'manila-marathon-2027-02-14',
    );
    taken.add('manila-marathon-2027-02-14');
    expect(communityEventId('Manila Marathon', '2027-02-14', (id) => taken.has(id), 'k57abcd123')).toBe(
      'manila-marathon-2027-02-14-bcd123',
    );
  });

  it('stays valid for odd names', () => {
    for (const name of ['東京マラソン', 'Ạ', 'X'.repeat(200), '--- !!! ---', 'Hà Nội Marathon']) {
      const id = communityEventId(name, '2027-03-01', (x) => x.length < 30, 'k57abcd123');
      expect(id).toMatch(INGEST_ID);
    }
  });
});

describe('planCuratedReplace (weekly refresh never deletes community races)', () => {
  const curatedOld = { id: 'old-curated-2027', name: 'Old Curated Run', dateStart: '2027-01-10', source: 'curated' };
  const legacy = { id: 'legacy-row-2027', name: 'Legacy Row Run', dateStart: '2027-01-11' }; // pre-`source` rows
  const community = {
    id: 'cebu-city-marathon-2027',
    name: 'Cebu City Marathon',
    dateStart: '2027-01-17',
    source: 'community',
    officialUrl: 'https://cebumarathon.ph',
  };
  const otherCommunity = { id: 'davao-trail-2027', name: 'Davao Trail Ultra', dateStart: '2027-03-01', source: 'community' };

  it('deletes curated + legacy rows only, keeping every community row', () => {
    const plan = planCuratedReplace([curatedOld, legacy, community, otherCommunity], [
      { id: 'brand-new-run-2027', name: 'Brand New Run', dateStart: '2027-05-01' },
    ]);
    expect(plan.remove.map((r) => r.id).sort()).toEqual(['legacy-row-2027', 'old-curated-2027']);
    expect(plan.insert.map((e) => e.id)).toEqual(['brand-new-run-2027']);
    expect(plan.merge).toEqual([]);
  });

  it('merges a round-tripped community row by id instead of inserting a copy', () => {
    const roundTrip = { ...community, source: undefined, resultsUrl: 'https://results.example.ph/cebu' };
    const plan = planCuratedReplace([community], [roundTrip]);
    expect(plan.insert).toEqual([]);
    expect(plan.merge).toEqual([{ row: community, event: roundTrip, match: 'same_id' }]);
  });

  it('keeps one row when the routine adds the same race under its own id', () => {
    const curatedTwin = {
      id: 'cebu-marathon-2027',
      name: 'The Cebu City Marathon 2027',
      dateStart: '2027-01-18',
      regUrl: 'https://reg.example.ph/cebu',
    };
    const plan = planCuratedReplace([community], [curatedTwin]);
    expect(plan.insert).toEqual([]);
    expect(plan.merge[0]).toMatchObject({ row: community, match: 'same_race' });
    expect(missingLinkFields(community, curatedTwin)).toEqual({ regUrl: 'https://reg.example.ph/cebu' });
  });

  it('does not treat a different race on the same day as a twin', () => {
    const plan = planCuratedReplace([community], [{ id: 'cebu-night-run-2027', name: 'Cebu Night Run', dateStart: '2027-01-17' }]);
    expect(plan.insert).toHaveLength(1);
    expect(plan.merge).toEqual([]);
  });

  it('never overwrites links the community row already has', () => {
    expect(missingLinkFields(community, { ...community, officialUrl: 'https://other.example.ph' })).toEqual({});
  });
});

describe('page checks', () => {
  const html = `<!doctype html><html><head><title>Manila Marathon 2027 &ndash; Official Site</title>
    <meta name="description" content="Race day: February 14, 2027 at the Mall of Asia grounds">
    <script>var x = "ignore me Tokyo";</script><style>.a{}</style>
    <script type="application/ld+json">{"@type":"SportsEvent","name":"Manila Marathon","startDate":"2027-02-14T04:00"}</script>
    </head><body><!-- comment --><h1>Run the city</h1><p>Caf&eacute; &amp; more &#8212; 42K &#x2F; 21K</p></body></html>`;

  it('extracts visible text, meta and JSON-LD; drops scripts/styles', () => {
    const { title, text } = htmlToText(html);
    expect(title).toBe('Manila Marathon 2027 – Official Site');
    expect(text).toContain('February 14, 2027');
    expect(text).toContain('Café & more — 42K / 21K');
    expect(text).toContain('"startDate":"2027-02-14T04:00"');
    expect(text).not.toContain('ignore me');
    expect(text).not.toContain('comment');
  });

  it('survives unclosed and hostile markup', () => {
    expect(htmlToText('<p>hello<script>never closed').text).toBe('hello');
    expect(htmlToText('&#0; &#xD800; &bogus; ok').text).toBe('&bogus; ok');
    expect(htmlToText('x'.repeat(10), 5).text).toBe('xxxxx');
  });

  it('finds the race name', () => {
    const { title, text } = htmlToText(html);
    expect(pageMentionsName(`${title} ${text}`, 'The Manila Marathon 2027')).toBe(true);
    expect(pageMentionsName('Milo Marathon Manila leg — register now', 'MILO Marathon Manila')).toBe(true);
    expect(pageMentionsName('Generic marathon blog about running', 'Cebu Marathon')).toBe(false);
    expect(pageMentionsName('anything', '')).toBe(false);
  });

  it.each([
    'Race day is February 14, 2027.',
    'Race day: Feb. 14th',
    'on 14 Feb 2027',
    'the 14th of February',
    'Sunday 14-15 February',
    'date: 14/02/2027',
    'date: 2/14/27',
    '"startDate":"2027-02-14T04:00"',
    '2027/02/14',
    '2027年2月14日',
  ])('finds the date in "%s"', (t) => expect(pageMentionsDate(t, '2027-02-14')).toBe(true));

  it.each(['February 4, 2027', 'Feb 140', '14 Febuary', '2027-02-15', 'March 14, 2027', '114/02/2027'])(
    'does not find the date in "%s"',
    (t) => expect(pageMentionsDate(t, '2027-02-14')).toBe(false),
  );

  it('handles single-digit days and September variants', () => {
    expect(pageMentionsDate('Sept 1, 2027', '2027-09-01')).toBe(true);
    expect(pageMentionsDate('Sep 12, 2027', '2027-09-01')).toBe(false);
    expect(pageMentionsDate('anything', 'not-a-date')).toBe(false);
  });

  it('classifies fetch outcomes (bot walls are not "unreachable")', () => {
    expect(classifyFetchStatus(200)).toBe('ok');
    expect(classifyFetchStatus(403)).toBe('blocked');
    expect(classifyFetchStatus(429)).toBe('blocked');
    expect(classifyFetchStatus(503)).toBe('blocked');
    expect(classifyFetchStatus(301)).toBe('blocked');
    expect(classifyFetchStatus(404)).toBe('unreachable');
    expect(classifyFetchStatus(410)).toBe('unreachable');
    expect(classifyFetchStatus(500)).toBe('unreachable');
  });
});

describe('AI verdict', () => {
  it('parses strict JSON, with or without fences/prose', () => {
    expect(
      parseAiVerdict('```json\n{"legit":true,"nameMatch":true,"dateMatch":true,"locationMatch":false,"reason":" Official  site. "}\n```'),
    ).toEqual({ legit: true, nameMatch: true, dateMatch: true, locationMatch: false, reason: 'Official site.' });
    expect(
      parseAiVerdict('Sure! {"legit":"false","nameMatch":"yes","dateMatch":"no","locationMatch":true}'),
    ).toEqual({ legit: false, nameMatch: true, dateMatch: false, locationMatch: true, reason: '' });
  });

  it('rejects anything incomplete or malformed', () => {
    expect(parseAiVerdict('{"legit":true}')).toBeNull();
    expect(parseAiVerdict('{"legit":maybe,"nameMatch":true}')).toBeNull();
    expect(parseAiVerdict('[true]')).toBeNull();
    expect(parseAiVerdict('no json here')).toBeNull();
    expect(parseAiVerdict(null)).toBeNull();
    expect(parseAiVerdict('{"legit":1,"nameMatch":true,"dateMatch":true,"locationMatch":true}')).toBeNull();
  });

  it('caps the reason', () => {
    const v = parseAiVerdict(
      JSON.stringify({ legit: true, nameMatch: true, dateMatch: true, locationMatch: true, reason: 'x'.repeat(999) }),
    );
    expect(v?.reason.length).toBe(300);
  });

  it('frames the page as untrusted data and truncates it', () => {
    const sub: RaceSubmissionInput = {
      name: 'Manila Marathon',
      dateStart: '2027-02-14',
      city: 'Manila',
      country: 'PH',
      distances: ['42K'],
      officialUrl: 'https://manilamarathon.ph',
    };
    const msgs = buildVerifyMessages(sub, { url: sub.officialUrl, title: 'T', text: 'y'.repeat(10_000) }, 100);
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toMatch(/untrusted DATA/);
    expect(msgs[1].content).toContain('"country":"Philippines"');
    expect(msgs[1].content).toContain('y'.repeat(100));
    expect(msgs[1].content).not.toContain('y'.repeat(101));
  });
});

describe('summarizeVerification — never publishes', () => {
  const now = 1_800_000_000_000;
  const ai = { legit: true, nameMatch: true, dateMatch: true, locationMatch: true, reason: 'Official page.' };

  it('auto-rejects only an unreachable official page, with a clear reason', () => {
    const notFound = summarizeVerification({ now, fetchClass: 'unreachable', httpStatus: 404, aiConfigured: true, ai: null });
    expect(notFound.status).toBe('auto_rejected');
    expect(notFound.reviewNote).toMatch(/couldn’t open the official page \(the page was not found\)/);
    expect(notFound.verification).toMatchObject({ urlReachable: false, aiVerdict: 'unavailable', checkedAt: now });
    const timeout = summarizeVerification({ now, fetchClass: 'unreachable', fetchDetail: 'it timed out', aiConfigured: true, ai: null });
    expect(timeout.reviewNote).toMatch(/it timed out/);
    const err = summarizeVerification({ now, fetchClass: 'unreachable', httpStatus: 500, aiConfigured: true, ai: null });
    expect(err.reviewNote).toMatch(/HTTP 500/);
  });

  it('keeps bot-walled pages pending for a human', () => {
    const r = summarizeVerification({ now, fetchClass: 'blocked', httpStatus: 403, aiConfigured: true, ai: null });
    expect(r.status).toBe('pending');
    expect(r.verification.urlReachable).toBe(true);
    expect(r.verification.aiSummary).toMatch(/blocks automated checks \(HTTP 403\)/);
  });

  it('stays pending even with a perfect AI verdict', () => {
    const r = summarizeVerification({ now, fetchClass: 'ok', nameFound: true, dateFound: true, aiConfigured: true, ai });
    expect(r.status).toBe('pending');
    expect(r.verification).toMatchObject({ urlReachable: true, nameFound: true, dateFound: true, aiVerdict: 'legit' });
    expect(r.verification.aiSummary).toMatch(/looks legit — name ✓ date ✓ place ✓\. Official page\./);
  });

  it('flags doubtful verdicts and missing AI', () => {
    const doubt = summarizeVerification({
      now, fetchClass: 'ok', nameFound: true, dateFound: false, aiConfigured: true,
      ai: { ...ai, dateMatch: false, reason: 'Page shows 2026.' },
    });
    expect(doubt.verification.aiVerdict).toBe('doubtful');
    expect(doubt.verification.aiSummary).toMatch(/date ✗/);
    const off = summarizeVerification({ now, fetchClass: 'ok', aiConfigured: false, ai: null });
    expect(off.verification.aiSummary).toMatch(/OPENROUTER_API_KEY/);
    const failed = summarizeVerification({ now, fetchClass: 'ok', aiConfigured: true, ai: null });
    expect(failed.verification.aiSummary).toMatch(/AI check failed/);
    const pdf = summarizeVerification({ now, fetchClass: 'ok', textual: false, aiConfigured: true, ai: null });
    expect(pdf.verification.aiSummary).toMatch(/not a web page/);
    expect(pdf.verification.aiSummary).not.toMatch(/AI check failed/);
  });
});

describe('access rules', () => {
  it('Pro gate mirrors the AI coach, with a strict switch', () => {
    expect(proGateAllows({ active: true, linked: true }, true)).toBe(true);
    expect(proGateAllows({ active: false, linked: true }, false)).toBe(false);
    expect(proGateAllows({ active: false, linked: false }, false)).toBe(true);
    expect(proGateAllows({ active: false, linked: false }, true)).toBe(false);
  });

  it('parses ADMIN_EMAILS loosely and matches case-insensitively', () => {
    const admins = parseAdminEmails(' Lloyd@Example.com, ops@kasya.app ;bad-entry\nthird@x.io ');
    expect(admins).toEqual(['lloyd@example.com', 'ops@kasya.app', 'third@x.io']);
    expect(isAdminEmail('LLOYD@example.com', admins)).toBe(true);
    expect(isAdminEmail('someone@example.com', admins)).toBe(false);
    expect(isAdminEmail(null, admins)).toBe(false);
    expect(parseAdminEmails(undefined)).toEqual([]);
  });
});

describe('reports, notes and copy', () => {
  it('composes report reasons', () => {
    expect(composeReportReason('Wrong date', '  It moved to   March 7 ')).toBe('Wrong date: It moved to March 7');
    expect(composeReportReason('Broken link', '')).toBe('Broken link');
    expect(composeReportReason(null, 'Cancelled per FB page')).toBe('Cancelled per FB page');
    expect(composeReportReason(null, 'no')).toBeNull();
    expect(validateReportReason('x'.repeat(900))?.length).toBe(SUBMISSION_LIMITS.reportReasonMax);
    expect(validateReportReason(123)).toBeNull();
  });

  it('cleans review notes', () => {
    expect(cleanReviewNote('  Duplicate   of Milo  ')).toBe('Duplicate of Milo');
    expect(cleanReviewNote(undefined)).toBe('');
    expect(cleanReviewNote('n'.repeat(400)).length).toBe(SUBMISSION_LIMITS.reviewNoteMax);
  });

  it('labels statuses for runners', () => {
    expect(submissionStatusCopy('pending')).toEqual({ label: 'Pending review', tone: 'pending' });
    expect(submissionStatusCopy('approved')).toEqual({ label: 'Published', tone: 'published' });
    expect(submissionStatusCopy('rejected').label).toBe('Not approved');
    expect(submissionStatusCopy('auto_rejected').label).toBe('Not approved');
    expect(RACE_SUBMISSION_PRO_BENEFIT.length).toBeLessThan(60);
  });
});
