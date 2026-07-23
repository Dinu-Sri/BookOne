import 'server-only';

import { Resend } from 'resend';

interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

export async function sendAuthEmail(message: EmailMessage): Promise<void> {
  const resend = getResend();
  const from = process.env.EMAIL_FROM ?? 'BookOne <noreply@bookone.clossyan.com>';

  if (!resend) {
    // Staging/dev: no outbound email. Callers must not require delivery.
    console.warn(
      `[email] RESEND_API_KEY empty — skipped email to ${message.to}: ${message.subject}`,
    );
    return;
  }

  await resend.emails.send({
    from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}
