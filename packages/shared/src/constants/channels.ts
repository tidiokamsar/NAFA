/**
 * The surfaces a request can arrive through.
 *
 * Recorded on audit events and on the request context: "who did what" is
 * incomplete without "from where", especially where USSD and WhatsApp are
 * first-class channels rather than fallbacks.
 */
export const CHANNELS = [
  'web',
  'mobile',
  'ussd',
  'whatsapp',
  'api',
  'system',
] as const;

export type Channel = (typeof CHANNELS)[number];

export function isChannel(value: unknown): value is Channel {
  return (
    typeof value === 'string' && (CHANNELS as readonly string[]).includes(value)
  );
}

/** Environments a service can run in. */
export const ENVIRONMENTS = [
  'development',
  'test',
  'staging',
  'production',
] as const;

export type Environment = (typeof ENVIRONMENTS)[number];
