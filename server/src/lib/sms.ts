const TWILIO_ACCOUNT_SID  = process.env.TWILIO_ACCOUNT_SID  ?? '';
const TWILIO_AUTH_TOKEN   = process.env.TWILIO_AUTH_TOKEN   ?? '';
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER ?? '';

let twilioClient: any = null;

async function getClient() {
  if (!twilioClient) {
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
      console.warn('[SMS] Twilio credentials not configured — SMS will be logged to console');
      return null;
    }
    const twilio = await import('twilio');
    twilioClient = twilio.default(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
}

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export async function sendSMS(to: string, body: string): Promise<boolean> {
  const client = await getClient();

  if (!client) {
    if (IS_PRODUCTION) {
      throw new Error(`[SMS] Twilio not configured — cannot send SMS to ${to}`);
    }
    console.log(`[SMS] (dev) To: ${to} | SMS would be sent (content redacted in logs)`);
    return true;
  }

  try {
    await client.messages.create({
      to,
      from: TWILIO_PHONE_NUMBER,
      body,
    });
    console.log(`[SMS] Sent to ${to}`);
    return true;
  } catch (err) {
    console.error('[SMS] Failed to send:', err);
    if (IS_PRODUCTION) {
      throw new Error(`[SMS] Failed to deliver SMS to ${to}`);
    }
    return false;
  }
}

export async function sendPhoneOTP(phoneNumber: string, code: string): Promise<boolean> {
  return sendSMS(phoneNumber, `Your SetlistPRO verification code is: ${code}`);
}
