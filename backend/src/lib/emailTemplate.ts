const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface ReminderEmailInput {
  name: string;
  event: string;
  date: string; // YYYY-MM-DD
  time: string | null;
  timezone: string;
  appUrl: string;
}

export function reminderEmail(i: ReminderEmailInput) {
  const when = i.time ? `${i.time} (${i.timezone})` : `End of day (${i.timezone})`;
  const link = `${i.appUrl.replace(/\/$/, "")}/`;

  const text = `Hello ${i.name},

This is a reminder about your upcoming deadline.

Deadline: ${i.event}
Date: ${i.date}
Time: ${when}

Open ActionLens: ${link}

— ActionLens`;

  // Inline styles + tables: the only thing email clients render reliably.
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1c1f26">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#4f46e5;padding:16px 24px;color:#ffffff;font-size:18px;font-weight:600">ActionLens</td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 12px;font-size:15px">Hello ${esc(i.name)}, you have an upcoming deadline:</p>
<p style="margin:0 0 16px;font-size:20px;font-weight:600">${esc(i.event)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;margin-bottom:24px">
<tr><td style="padding:2px 16px 2px 0;color:#6b7280">Date</td><td>${esc(i.date)}</td></tr>
<tr><td style="padding:2px 16px 2px 0;color:#6b7280">Time</td><td>${esc(when)}</td></tr>
</table>
<a href="${esc(link)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600">View deadline</a>
</td></tr>
<tr><td style="padding:12px 24px;background:#f9fafb;color:#9ca3af;font-size:12px">You get this email because a document you uploaded contains this deadline. Mark it complete in ActionLens to stop reminders.</td></tr>
</table></td></tr></table></body></html>`;

  return { text, html };
}

export function verificationEmail(i: { name: string; code: string }) {
  const text = `Hello ${i.name},

Your ActionLens verification code is: ${i.code}

It expires in 10 minutes. If you didn't create an account, you can ignore this email.

— ActionLens`;

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1c1f26">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#4f46e5;padding:16px 24px;color:#ffffff;font-size:18px;font-weight:600">ActionLens</td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 12px;font-size:15px">Hello ${esc(i.name)}, enter this code to confirm your email:</p>
<p style="margin:0 0 16px;font-size:34px;font-weight:700;letter-spacing:8px;font-family:Consolas,monospace">${esc(i.code)}</p>
<p style="margin:0;font-size:13px;color:#6b7280">It expires in 10 minutes. If you didn't create an account, ignore this email.</p>
</td></tr></table></td></tr></table></body></html>`;

  return { text, html };
}

export function passwordResetEmail(i: { name: string; code: string }) {
  const text = `Hello ${i.name},

Your ActionLens password reset code is: ${i.code}

It expires in 10 minutes. If you didn't ask to reset your password, ignore this email; your password has not changed.

— ActionLens`;

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1c1f26">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#4f46e5;padding:16px 24px;color:#ffffff;font-size:18px;font-weight:600">ActionLens</td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 12px;font-size:15px">Hello ${esc(i.name)}, use this code to reset your password:</p>
<p style="margin:0 0 16px;font-size:34px;font-weight:700;letter-spacing:8px;font-family:Consolas,monospace">${esc(i.code)}</p>
<p style="margin:0;font-size:13px;color:#6b7280">It expires in 10 minutes. If you didn't ask for this, ignore this email; your password has not changed.</p>
</td></tr></table></td></tr></table></body></html>`;

  return { text, html };
}
