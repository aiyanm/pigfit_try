export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_PREFIX = '[services]';

export const logger = {
  debug: (...args: unknown[]) => console.debug(LOG_PREFIX, ...args),
  info: (...args: unknown[]) => console.info(LOG_PREFIX, ...args),
  warn: (...args: unknown[]) => console.warn(LOG_PREFIX, ...args),
  error: (...args: unknown[]) => console.error(LOG_PREFIX, ...args),
};
