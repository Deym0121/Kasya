/**
 * Kasya's public legal + support pages (Privacy Policy, Terms of Use,
 * Support), served by convex/http.ts at /privacy, /terms and /support on the
 * deployment's .convex.site domain. Pure strings — no imports — so the Convex
 * bundler, vitest and a plain `node` preview can all load this file.
 *
 * Keep these in step with what the app actually does: App Review checks the
 * privacy policy against the App Privacy answers (5.1.1) and the Terms carry
 * the community rules clubs need (1.2).
 */

export const CONTACT_EMAIL = 'joshualadero0121@gmail.com';
export const LAST_UPDATED = 'October 18, 2026';
export const APPLE_EULA_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

const STYLE =
  'body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0B0C0E;color:#F3F4F6;margin:0;padding:40px 20px}' +
  'main{max-width:680px;margin:0 auto;line-height:1.6}h1{color:#FF4D0D;font-size:28px;margin-bottom:4px}' +
  'h2{font-size:18px;margin-top:30px}h3{font-size:15px;margin:18px 0 4px;color:#F3F4F6}a{color:#FF8A54}' +
  'p,li{color:#C6C9D1;font-size:15px}.updated{color:#959AA4;font-size:13px;margin-top:0}' +
  '.box{background:#15161B;border:1px solid #24262C;border-radius:14px;padding:4px 18px;margin:20px 0}' +
  'nav{font-size:14px;margin-bottom:8px}nav a{margin-right:14px}' +
  'footer{margin-top:44px;font-size:12px;color:#959AA4;border-top:1px solid #24262C;padding-top:16px}';

export function legalHtml(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${STYLE}</style></head><body><main><nav><a href="/privacy">Privacy Policy</a><a href="/terms">Terms of Use</a><a href="/support">Support</a></nav>${body}<footer>Kasya · wellness estimates, not medical advice · <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></footer></main></body></html>`;
}

const mail = `<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>`;

export const PRIVACY_BODY = `<h1>Kasya Privacy Policy</h1>
<p class="updated">Last updated ${LAST_UPDATED}</p>
<p>Kasya ("we", "us") helps you check your walking and running form, find shoes, track your activities, follow races, and compete with friends and running clubs. This policy explains what data the Kasya app uses, what leaves your phone, and the choices you have.</p>

<div class="box">
<p><b>In short:</b> we don't sell your data, show ads or track you across other apps. Camera video is never uploaded. GPS routes and your Apple Health data stay on your phone — the only fitness data that leaves it is the <b>daily totals</b> you choose to share by joining a group or running club.</p>
</div>

<h2>1. What stays on your phone</h2>
<ul>
<li><b>Camera (gait scans).</b> The camera is analyzed live on your device as body-landmark positions; only derived numbers (such as steps per minute) are kept. No video is uploaded. If you turn on "keep a clip for review", the clip stays on your device and is deleted right after you view it.</li>
<li><b>Activities and GPS routes.</b> Runs, walks, rides and hikes you record — including routes and location — are stored on your device only. Location is used only while you are recording an activity.</li>
<li><b>Apple Health.</b> If you connect Apple Health, Kasya reads workouts, workout routes, walking/running and cycling distance, steps, active energy, exercise minutes, heart rate and resting heart rate so activities from your Apple Watch or other watches (for example Garmin or COROS through their Apple Health sync) appear in Kasya, and it saves the activities you record back to Apple Health. This data stays on your device. It is never used for advertising or marketing, never sold, and never stored in iCloud by Kasya. The only exception is the daily totals described under Groups and running clubs below, which are sent only if you join a group or club.</li>
<li><b>Motion and fitness.</b> Step counts and cadence from your iPhone's motion sensors are processed on your device.</li>
<li><b>Your dashboard.</b> Daily goals, scores, heart-rate charts and activity history are kept on your device.</li>
</ul>

<h2>2. What we collect and why</h2>
<h3>Account</h3>
<p>When you sign in with Apple or Google we receive your name, email address (Apple may give us a private relay address instead) and an account identifier, to create and run your account. If you sign in with Apple we also store a token used only to revoke Apple sign-in when you delete your account.</p>
<h3>Gait scan results</h3>
<p>For signed-in users, scan results are backed up as derived numbers only — cadence, rhythm, symmetry and similar scores — so you keep your history across devices. No images or video.</p>
<h3>AI coach</h3>
<p>When you ask the AI coach a question, your message and de-identified scan numbers are sent to our AI provider (through OpenRouter) to generate the reply. We keep a daily usage counter to apply limits. We don't use your coach messages to identify you or for advertising.</p>
<h3>Subscriptions</h3>
<p>Kasya Premium is sold through the App Store. Subscription status is managed by RevenueCat and Apple. We never see your payment details.</p>
<h3>Race submissions and race reports</h3>
<p>If you submit a race or report wrong race information, we store what you entered, the time and your account identifier, so we can review it before anything is published.</p>
<h3>Groups and running clubs (only if you join one)</h3>
<p>While you are a member of at least one group or club, Kasya uploads your <b>daily totals</b>: steps, active minutes, active calories, and the distance and moving time of your runs. We also store your first name (as your display name), your memberships, your lifetime step total (for levels) and your monthly totals.</p>
<ul>
<li>Members of your groups and clubs can see your first name and these totals on the leaderboards.</li>
<li>A club's public page and the club rankings show only club-level totals (sums across members) — never individual members.</li>
<li>We never upload your routes, locations, heart rate or other Health records.</li>
<li>When you leave your last group or club, your uploaded daily totals are deleted. Club totals for past months keep only the anonymous sums they already include.</li>
</ul>
<h3>Club content</h3>
<p>If you create a running club, its name, country, city, description, emblem and the photo you choose are public: anyone using Kasya can see them in club rankings and search. Photos are resized on your phone before upload.</p>
<h3>Reports</h3>
<p>If you report a club, we store the reason, any note you add, and your account identifier so we can review it.</p>
<h3>Support</h3>
<p>If you email us, we use your email and message to help you.</p>

<h2>3. How we use data</h2>
<p>Only to provide and improve Kasya's features, keep accounts secure, enforce our <a href="/terms">Terms of Use</a> and meet legal obligations. We do not sell personal data, do not use it for advertising, and do not track you across other companies' apps or websites.</p>

<h2>4. Who we share it with</h2>
<ul>
<li><b>Service providers</b> that run Kasya for us: Convex (database and hosting), RevenueCat (subscriptions), Apple and Google (sign-in), our AI provider through OpenRouter (AI coach), and Expo (delivering app updates, which involves standard technical data such as app version and IP address).</li>
<li><b>Other Kasya users</b>, only as described for groups and running clubs above.</li>
<li><b>Authorities</b>, if the law requires it.</li>
</ul>

<h2>5. Keeping and deleting data</h2>
<ul>
<li><b>Delete account:</b> in the app go to Profile → Delete account. This removes your account, sign-in records, scan results, race submissions and reports, group and club memberships, uploaded daily totals and stats, and revokes Sign in with Apple. Clubs you own pass to the next member, or are deleted with their photo when no one is left.</li>
<li><b>Leave groups and clubs</b> at any time; leaving your last one deletes your uploaded daily totals.</li>
<li>You can also email us at ${mail} and we'll delete your data for you.</li>
</ul>

<h2>6. Your rights</h2>
<p>You can ask to access, correct or delete your personal data, or object to how we use it, by emailing ${mail}. If you are in the Philippines, you have these rights under the Data Privacy Act of 2012 (Republic Act No. 10173) and may also contact the National Privacy Commission.</p>

<h2>7. Security and storage</h2>
<p>Data is sent over encrypted connections (HTTPS) and access is restricted. Our servers may be located outside your country, including in the United States.</p>

<h2>8. Children</h2>
<p>Kasya is not directed to children under 13, and we do not knowingly collect their personal data.</p>

<h2>9. Changes</h2>
<p>We'll update this page when Kasya changes how it uses data, and change the date at the top.</p>

<h2>10. Contact</h2>
<p>Questions or requests: ${mail}</p>`;

export const TERMS_BODY = `<h1>Kasya Terms of Use</h1>
<p class="updated">Last updated ${LAST_UPDATED}</p>
<p>These terms apply when you use the Kasya app and its services. By using Kasya you agree to them and to our <a href="/privacy">Privacy Policy</a>. If you downloaded Kasya from the App Store, Apple's <a href="${APPLE_EULA_URL}">Standard Licensed Application End User License Agreement</a> also applies; Apple is not responsible for Kasya or its content.</p>

<h2>1. Not medical advice</h2>
<p>Kasya gives wellness estimates — gait scores, cadence, heart-rate zones, activity scores and shoe suggestions. They are not medical advice, diagnosis or treatment. Talk to a qualified professional before starting a new exercise program or if you have pain, an injury or a health condition. Exercise is at your own risk; stay aware of traffic and your surroundings when you record an activity.</p>

<h2>2. Your account</h2>
<p>Keep your account details accurate and your device secure. You are responsible for what happens under your account. You can delete your account at any time in Profile → Delete account.</p>

<h2>3. Kasya Premium subscriptions</h2>
<ul>
<li>Premium is an auto-renewing subscription sold through the App Store. Payment is charged to your Apple ID when you confirm the purchase.</li>
<li>It renews automatically unless you cancel at least 24 hours before the end of the current period; your account is charged for renewal within the 24 hours before the period ends.</li>
<li>If a free trial is offered, it becomes a paid subscription when it ends unless you cancel at least 24 hours before; any unused part of a trial ends when you buy a subscription.</li>
<li>Manage or cancel in your App Store account settings. Refunds are handled by Apple.</li>
</ul>

<h2>4. Community rules — groups, running clubs and race submissions</h2>
<p>Kasya has <b>zero tolerance for objectionable content and abusive users.</b> You must not post or create — in a club name, photo, description, display name, race submission, report or anything else other people can see — content that:</p>
<ul>
<li>is hateful, harassing, bullying, threatening or discriminatory;</li>
<li>is sexual, violent, graphic or otherwise offensive;</li>
<li>is illegal, promotes illegal activity or dangerous behavior;</li>
<li>impersonates a person, brand or organization, or misleads people about who you are;</li>
<li>is spam, advertising or a scam;</li>
<li>shares someone else's personal information or infringes someone's copyright, trademark or privacy.</li>
</ul>
<p>You also must not cheat leaderboards (for example with fake, simulated or manually inflated activity data), or abuse, overload or try to break the service.</p>
<p><b>Reporting and enforcement.</b> Use "Report this club" in the app, or email ${mail}, to report content or users. We review reports and act on objectionable content, normally within 24 hours. Clubs that receive several reports are hidden while we review them. We may remove content, hide or delete clubs, remove members, correct suspicious data, and suspend or delete accounts that break these rules — without notice where needed. You can hide any club from your own view, and club owners can remove members from their club.</p>
<p><b>Club owners</b> are responsible for their club's name, photo and description and must have the rights to any photo they upload.</p>

<h2>5. Your content</h2>
<p>You keep ownership of what you create in Kasya. You give us a worldwide, non-exclusive, royalty-free license to host, store, resize and display it only as needed to run Kasya (for example, showing your club photo in the rankings). This license ends when you delete the content or your account, except for anonymous totals already included in club statistics.</p>

<h2>6. Leaderboards and data</h2>
<p>Rankings are based on data from your phone, your watch and Apple Health and may be incomplete or delayed. We may correct, exclude or reset data that looks wrong or unfair.</p>

<h2>7. Other services</h2>
<p>Kasya works with services we don't control, such as Apple Health, Garmin Connect, Sign in with Apple and Google. Their own terms and privacy policies apply to them.</p>

<h2>8. Changes and ending your use</h2>
<p>We may update Kasya and these terms; we'll change the date above, and continuing to use Kasya means you accept the update. You can stop using Kasya at any time. We may suspend or end access for anyone who breaks these terms.</p>

<h2>9. Disclaimers and liability</h2>
<p>Kasya is provided "as is". To the extent the law allows, we are not liable for indirect or consequential losses, or for injuries or losses from exercise, from relying on estimates, or from content posted by other users. Nothing in these terms limits rights you have under consumer law that cannot be waived.</p>

<h2>10. Governing law and contact</h2>
<p>These terms are governed by the laws of the Republic of the Philippines. Questions: ${mail}</p>`;

export const SUPPORT_BODY = `<h1>Kasya Support</h1>
<h2>Common questions</h2>
<ul>
<li><b>The scan says capture failed.</b> Prop your phone side-on, step 3–4 meters back, make sure your whole body is in frame with decent lighting, then follow the countdown.</li>
<li><b>Does Kasya record video?</b> Not by default, and video is never uploaded. If you opt in to "keep a clip for review", the clip stays on your device and is deleted right after you view it. See our <a href="/privacy">Privacy Policy</a>.</li>
<li><b>Can I connect my Garmin (or COROS, Polar, Suunto) watch?</b> Yes, through Apple Health. In your watch's app (for example Garmin Connect → Settings → Connected Apps → Apple Health) turn on sharing of workouts, steps and heart rate. Then in Kasya go to Activity → Connect Apple Health.</li>
<li><b>How do running clubs work?</b> Go to Activity → Groups &amp; running clubs → Running clubs. Start a club or join one from its page (invite-only clubs need the club code). Every member's daily steps and runs add up, and clubs are ranked each month in their country and worldwide.</li>
<li><b>How do I report a club?</b> Open the club page and tap "Report this club", or email us. You can also hide a club from your own view. See the community rules in our <a href="/terms">Terms of Use</a>.</li>
<li><b>How do I cancel my subscription?</b> Subscriptions are billed by the App Store — manage or cancel them in your App Store account settings, or in the app under Profile → Manage subscription.</li>
<li><b>How do I delete my account?</b> Profile → Delete account, or email us.</li>
</ul>
<h2>Contact us</h2>
<p>Email ${mail} — we usually reply within a couple of days.</p>`;
