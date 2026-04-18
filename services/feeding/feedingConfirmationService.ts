import type { FeedingConfirmationSession } from '../core/types';

const FEEDING_CONFIRMATION_DURATION_MS = 5 * 60 * 1000;
const MAX_SESSION_HISTORY = 20;

type SessionListener = (session: FeedingConfirmationSession | null) => void;

const activeSessionByPig = new Map<string, FeedingConfirmationSession>();
const sessionHistoryByPig = new Map<string, FeedingConfirmationSession[]>();
const expiryTimerByPig = new Map<string, ReturnType<typeof setTimeout>>();
const listenersByPig = new Map<string, Set<SessionListener>>();

const cloneSession = (session: FeedingConfirmationSession): FeedingConfirmationSession => ({ ...session });

const notify = (pigId: string): void => {
  const listeners = listenersByPig.get(pigId);
  if (!listeners || listeners.size === 0) return;
  const session = getActiveFeedingConfirmationSession(pigId);
  listeners.forEach((listener) => listener(session));
};

const clearExpiryTimer = (pigId: string): void => {
  const timer = expiryTimerByPig.get(pigId);
  if (timer) {
    clearTimeout(timer);
    expiryTimerByPig.delete(pigId);
  }
};

const recordSession = (session: FeedingConfirmationSession): void => {
  const history = sessionHistoryByPig.get(session.pigId) ?? [];
  const nextHistory = [cloneSession(session), ...history].slice(0, MAX_SESSION_HISTORY);
  sessionHistoryByPig.set(session.pigId, nextHistory);
};

const upsertSessionHistory = (session: FeedingConfirmationSession): void => {
  const history = sessionHistoryByPig.get(session.pigId) ?? [];
  const nextHistory = history.map((entry) =>
    entry.startedAt === session.startedAt ? cloneSession(session) : entry
  );
  sessionHistoryByPig.set(session.pigId, nextHistory);
};

const expireSession = (pigId: string, endedAt = Date.now(), canceled = false): void => {
  const current = activeSessionByPig.get(pigId);
  if (!current) return;

  const endedSession: FeedingConfirmationSession = {
    ...current,
    expiresAt: Math.min(current.expiresAt, endedAt),
    isActive: false,
    isCanceled: canceled,
  };

  activeSessionByPig.delete(pigId);
  clearExpiryTimer(pigId);
  upsertSessionHistory(endedSession);
  notify(pigId);
};

const scheduleExpiry = (session: FeedingConfirmationSession): void => {
  clearExpiryTimer(session.pigId);
  const delay = Math.max(0, session.expiresAt - Date.now());
  const timer = setTimeout(() => {
    expireSession(session.pigId, session.expiresAt, false);
  }, delay);
  expiryTimerByPig.set(session.pigId, timer);
};

export const startFeedingConfirmation = (
  pigId: string,
  startedAt = Date.now(),
  durationMs = FEEDING_CONFIRMATION_DURATION_MS
): FeedingConfirmationSession => {
  const current = getActiveFeedingConfirmationSession(pigId, startedAt);
  if (current) {
    return current;
  }

  const session: FeedingConfirmationSession = {
    pigId,
    startedAt,
    expiresAt: startedAt + durationMs,
    isActive: true,
    isCanceled: false,
  };

  activeSessionByPig.set(pigId, session);
  recordSession(session);
  scheduleExpiry(session);
  notify(pigId);
  return cloneSession(session);
};

export const cancelFeedingConfirmation = (pigId: string, canceledAt = Date.now()): void => {
  expireSession(pigId, canceledAt, true);
};

export const getActiveFeedingConfirmationSession = (
  pigId: string,
  at = Date.now()
): FeedingConfirmationSession | null => {
  const session = activeSessionByPig.get(pigId);
  if (!session) return null;

  if (session.expiresAt <= at) {
    expireSession(pigId, session.expiresAt, false);
    return null;
  }

  return cloneSession(session);
};

export const isFeedingConfirmationActive = (pigId: string, at = Date.now()): boolean =>
  getActiveFeedingConfirmationSession(pigId, at) !== null;

export const wasFeedingConfirmedAt = (pigId: string, timestamp: number): boolean => {
  const active = getActiveFeedingConfirmationSession(pigId, timestamp);
  if (active && active.startedAt <= timestamp && timestamp < active.expiresAt) {
    return true;
  }

  const history = sessionHistoryByPig.get(pigId) ?? [];
  return history.some(
    (session) =>
      !session.isCanceled &&
      session.startedAt <= timestamp &&
      timestamp < session.expiresAt
  );
};

export const subscribeToFeedingConfirmation = (
  pigId: string,
  listener: SessionListener
): (() => void) => {
  const listeners = listenersByPig.get(pigId) ?? new Set<SessionListener>();
  listeners.add(listener);
  listenersByPig.set(pigId, listeners);
  listener(getActiveFeedingConfirmationSession(pigId));

  return () => {
    const currentListeners = listenersByPig.get(pigId);
    if (!currentListeners) return;
    currentListeners.delete(listener);
    if (currentListeners.size === 0) {
      listenersByPig.delete(pigId);
    }
  };
};
