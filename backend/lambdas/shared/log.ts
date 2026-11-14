type Fields = Record<string, unknown>;

/** Structured JSON logs. Never pass tokens, PINs or customer text. */
export function log(level: 'info' | 'warn' | 'error', msg: string, fields: Fields = {}): void {
  const line = JSON.stringify({ level, msg, ...fields, ts: new Date().toISOString() });
  if (level === 'error') console.error(line);
  else console.log(line);
}
