import Mailjet from 'node-mailjet';

const MAILJET_API_KEY    = process.env.MAILJET_API_KEY    ?? '';
const MAILJET_SECRET_KEY = process.env.MAILJET_SECRET_KEY ?? '';
const MAILJET_FROM_EMAIL = process.env.MAILJET_FROM_EMAIL ?? 'noreply@setlist.kirknet.io';
const MAILJET_FROM_NAME  = process.env.MAILJET_FROM_NAME  ?? 'SetlistPRO';

let client: ReturnType<typeof Mailjet.apiConnect> | null = null;

function getClient() {
  if (!client) {
    if (!MAILJET_API_KEY || !MAILJET_SECRET_KEY) {
      console.warn('[Email] Mailjet credentials not configured — emails will be logged to console');
      return null;
    }
    client = Mailjet.apiConnect(MAILJET_API_KEY, MAILJET_SECRET_KEY);
  }
  return client;
}

interface SendEmailOptions {
  to: string;
  toName?: string;
  subject: string;
  textBody: string;
  htmlBody: string;
}

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export async function sendEmail(opts: SendEmailOptions): Promise<boolean> {
  const mj = getClient();

  if (!mj) {
    if (IS_PRODUCTION) {
      throw new Error(`[Email] Mailjet not configured — cannot send "${opts.subject}" to ${opts.to}`);
    }
    console.log(`[Email] (dev) To: ${opts.to} | Subject: ${opts.subject}`);
    console.log(`[Email] (dev) Email would be sent (content redacted in logs)`);
    return true;
  }

  try {
    await mj.post('send', { version: 'v3.1' }).request({
      Messages: [{
        From:    { Email: MAILJET_FROM_EMAIL, Name: MAILJET_FROM_NAME },
        To:      [{ Email: opts.to, Name: opts.toName ?? opts.to }],
        Subject: opts.subject,
        TextPart: opts.textBody,
        HTMLPart: opts.htmlBody,
      }],
    });
    console.log(`[Email] Sent "${opts.subject}" to ${opts.to}`);
    return true;
  } catch (err) {
    console.error('[Email] Failed to send:', err);
    if (IS_PRODUCTION) {
      throw new Error(`[Email] Failed to deliver "${opts.subject}" to ${opts.to}`);
    }
    return false;
  }
}

export async function sendPasswordResetEmail(email: string, url: string, userName?: string) {
  return sendEmail({
    to: email,
    toName: userName,
    subject: 'Reset your SetlistPRO password',
    textBody: `Click the link below to reset your password:\n\n${url}\n\nIf you didn't request this, you can safely ignore this email.`,
    htmlBody: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#1a1a1a">Reset Your Password</h2>
        <p>Click the button below to reset your SetlistPRO password:</p>
        <p style="text-align:center;margin:32px 0">
          <a href="${url}" style="background:#2563eb;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600">
            Reset Password
          </a>
        </p>
        <p style="color:#666;font-size:13px">If you didn't request this, you can safely ignore this email.</p>
      </div>`,
  });
}

export async function sendVerificationEmail(email: string, url: string, userName?: string) {
  return sendEmail({
    to: email,
    toName: userName,
    subject: 'Verify your SetlistPRO email',
    textBody: `Welcome to SetlistPRO! Verify your email by visiting:\n\n${url}`,
    htmlBody: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#1a1a1a">Verify Your Email</h2>
        <p>Welcome to SetlistPRO! Click the button below to verify your email address:</p>
        <p style="text-align:center;margin:32px 0">
          <a href="${url}" style="background:#2563eb;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600">
            Verify Email
          </a>
        </p>
      </div>`,
  });
}

export async function sendMagicLinkEmail(email: string, url: string, userName?: string) {
  return sendEmail({
    to: email,
    toName: userName,
    subject: 'Your SetlistPRO sign-in link',
    textBody: `Sign in to SetlistPRO by visiting:\n\n${url}\n\nThis link expires in 10 minutes.`,
    htmlBody: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#1a1a1a">Sign In to SetlistPRO</h2>
        <p>Click the button below to sign in instantly:</p>
        <p style="text-align:center;margin:32px 0">
          <a href="${url}" style="background:#2563eb;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600">
            Sign In
          </a>
        </p>
        <p style="color:#666;font-size:13px">This link expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
      </div>`,
  });
}

export async function sendPhoneReassignmentEmail(email: string, phone: string, userName?: string) {
  const maskedPhone = phone.replace(/(\d{3})\d+(\d{4})/, '$1****$2');
  return sendEmail({
    to: email,
    toName: userName,
    subject: 'Your phone number was reassigned on SetlistPRO',
    textBody: `The phone number ${maskedPhone} previously associated with your SetlistPRO account has been reassigned to another account. If this was not expected, please contact support.`,
    htmlBody: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#1a1a1a">Phone Number Reassigned</h2>
        <p>The phone number <strong>${maskedPhone}</strong> previously associated with your SetlistPRO account has been reassigned to another account.</p>
        <p style="color:#666;font-size:13px">If this was not expected, please contact support or add a new phone number in your profile settings.</p>
      </div>`,
  });
}

export async function sendOTPEmail(email: string, otp: string, userName?: string) {
  return sendEmail({
    to: email,
    toName: userName,
    subject: `${otp} is your SetlistPRO verification code`,
    textBody: `Your SetlistPRO verification code is: ${otp}\n\nThis code expires in 10 minutes.`,
    htmlBody: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#1a1a1a">Your Verification Code</h2>
        <p style="text-align:center;margin:32px 0">
          <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#2563eb">${otp}</span>
        </p>
        <p style="color:#666;font-size:13px;text-align:center">This code expires in 10 minutes.</p>
      </div>`,
  });
}
