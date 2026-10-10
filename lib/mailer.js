'use strict';
// ============================================================
//  MAILER — lib/mailer.js
//  Dependency-free transactional email via HTTPS APIs.
//  Providers (auto-detected, first match wins):
//    RESEND_API_KEY   → Resend  (https://resend.com)
//    SENDGRID_API_KEY → SendGrid
//    MAILGUN_API_KEY + MAILGUN_DOMAIN → Mailgun
//    POSTMARK_TOKEN   → Postmark
//  When nothing is configured, send() resolves to
//  { delivered: false, reason: 'not_configured' } and the message
//  is logged to the server console (dev mode).
// ============================================================

const FROM = (process.env.MAIL_FROM || 'KEYCODE Studio <onboarding@resend.dev>').trim();

function providerInfo() {
  if (process.env.RESEND_API_KEY) return { name: 'resend', key: process.env.RESEND_API_KEY };
  if (process.env.SENDGRID_API_KEY) return { name: 'sendgrid', key: process.env.SENDGRID_API_KEY };
  if (process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN) {
    return { name: 'mailgun', key: process.env.MAILGUN_API_KEY, domain: process.env.MAILGUN_DOMAIN };
  }
  if (process.env.POSTMARK_TOKEN) return { name: 'postmark', key: process.env.POSTMARK_TOKEN };
  return null;
}

function isConfigured() { return Boolean(providerInfo()); }

async function send({ to, subject, text, html }) {
  if (!to) return { delivered: false, reason: 'no_recipient' };
  const p = providerInfo();
  const content = text || String(html || '').replace(/<[^>]+>/g, ' ').slice(0, 4000);
  if (!p) {
    // Dev fallback: log so the flow stays testable.
    console.log('[mailer] not configured — would send to ' + to + ': [' + subject + '] ' + String(content).slice(0, 200));
    return { delivered: false, reason: 'not_configured' };
  }
  try {
    if (p.name === 'resend') {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + p.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM, to: [to], subject, text: content, html: html || undefined }),
      });
      if (!r.ok) throw new Error('resend HTTP ' + r.status + ': ' + (await r.text()).slice(0, 200));
      return { delivered: true, provider: 'resend' };
    }
    if (p.name === 'sendgrid') {
      const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + p.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: (FROM.match(/<(.+)>/) || [, FROM])[1], name: 'KEYCODE Studio' },
          subject,
          content: [{ type: 'text/plain', value: content }].concat(html ? [{ type: 'text/html', value: html }] : []),
        }),
      });
      if (!r.ok) throw new Error('sendgrid HTTP ' + r.status + ': ' + (await r.text()).slice(0, 200));
      return { delivered: true, provider: 'sendgrid' };
    }
    if (p.name === 'mailgun') {
      const body = new URLSearchParams({
        from: FROM, to, subject, text: content,
      });
      if (html) body.set('html', html);
      const r = await fetch('https://api.mailgun.net/v3/' + p.domain + '/messages', {
        method: 'POST',
        headers: { 'Authorization': 'Basic ' + Buffer.from('api:' + p.key).toString('base64') },
        body: body,
      });
      if (!r.ok) throw new Error('mailgun HTTP ' + r.status + ': ' + (await r.text()).slice(0, 200));
      return { delivered: true, provider: 'mailgun' };
    }
    if (p.name === 'postmark') {
      const r = await fetch('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: { 'X-Postmark-Server-Token': p.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ From: FROM, To: to, Subject: subject, TextBody: content, HtmlBody: html || undefined, MessageStream: 'outbound' }),
      });
      if (!r.ok) throw new Error('postmark HTTP ' + r.status + ': ' + (await r.text()).slice(0, 200));
      return { delivered: true, provider: 'postmark' };
    }
    return { delivered: false, reason: 'unknown_provider' };
  } catch (e) {
    console.warn('[mailer] send failed:', e && e.message);
    return { delivered: false, reason: 'send_failed', error: String(e && e.message || e).slice(0, 200) };
  }
}

module.exports = { send: send, isConfigured: isConfigured, provider: function () { const p = providerInfo(); return p ? p.name : null; } };
