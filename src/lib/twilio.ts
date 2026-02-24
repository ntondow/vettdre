import Twilio from "twilio";
import type { Twilio as TwilioClient } from "twilio";

// Lazy initialization — same pattern as Stripe (don't init at module level for Docker builds)
let _client: TwilioClient | null = null;

export function getTwilio(): TwilioClient {
  if (!_client) {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set");
    }
    _client = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return _client;
}
