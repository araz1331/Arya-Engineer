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

export function trackEvent(name: string, params?: AnalyticsParams) {
  if (!measurementId || !window.gtag) return;
  window.gtag('event', name, params);
}