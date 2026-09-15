// The one place that decides whether the app talks to the real Express API
// or the in-browser demo. Components import from here, never directly from
// ./api.js or ./demoApi.js, so the choice stays in a single spot.
import { api as realApi } from './api.js';
import { api as demoApiImpl, resetDemoData } from './demoApi.js';

export const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';

export const api = isDemoMode ? demoApiImpl : realApi;

// Only meaningful in demo mode; the real API has no equivalent action a
// browser client can trigger, so DemoBanner is the only caller.
export { resetDemoData };
