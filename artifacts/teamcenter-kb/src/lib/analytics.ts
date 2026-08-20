import { recordAnalyticsEvent } from '@workspace/api-client-react';

type AnalyticsParams = Record<string, string | number | boolean | undefined>;

type Gtag = (
  command: 'config' | 'event' | 'js',
  target: string | Date,
  params?: AnalyticsParams,
) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

const measurementId = import.meta.env.VITE_GA4_MEASUREMENT_ID as string | undefined;

function getStoredId(storage: Storage, key: string, prefix: string): string {
  const existing = storage.getItem(key);
  if (existing) return existing;
  const created = `${prefix}-${crypto.randomUUID()}`;
  storage.setItem(key, created);
  return created;
}

export function getVisitorId(): string {
  return getStoredId(localStorage, 'arya_analytics_visitor_id', 'visitor');
}

export function getAnalyticsSessionId(): string {
  return getStoredId(sessionStorage, 'arya_analytics_session_id', 'session');
}

export function trackEvent(name: string, params?: AnalyticsParams) {
  if (!measurementId || !window.gtag) return;
  window.gtag('event', name, params);
}

export function recordPageView() {
  return recordAnalyticsEvent({
    eventType: 'page_view',
    visitorId: getVisitorId(),
    sessionId: getAnalyticsSessionId(),
    language: navigator.language?.slice(0, 20) || null,
  });
}