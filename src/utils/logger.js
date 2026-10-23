const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 50 };
const configuredLevel = import.meta.env.VITE_LOG_LEVEL?.toLowerCase();
const defaultLevel = import.meta.env.DEV ? 'debug' : 'warn';
const activeLevel = Object.hasOwn(LEVELS, configuredLevel) ? configuredLevel : defaultLevel;

const redactText = (value) => value
  .replace(/\bBearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
  .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED_JWT]');

const sanitize = (value, seen = new WeakSet()) => {
  if (typeof value === 'string') return redactText(value);
  if (value instanceof Error) {
    return { name: value.name, message: redactText(value.message) };
  }
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => sanitize(item, seen));

  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    /password|token|authorization|secret|cookie|email|phone/i.test(key)
      ? '[REDACTED]'
      : sanitize(item, seen),
  ]));
};

const write = (level, args) => {
  if (LEVELS[level] < LEVELS[activeLevel]) return;
  const method = level === 'debug' ? 'debug' : level;
  globalThis.console?.[method]?.('[InventoryPro]', ...args.map((arg) => sanitize(arg)));
};

const logger = Object.freeze({
  debug: (...args) => write('debug', args),
  info: (...args) => write('info', args),
  warn: (...args) => write('warn', args),
  error: (...args) => write('error', args),
});

export default logger;
