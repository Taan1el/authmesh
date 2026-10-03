import { configureAxe } from 'vitest-axe';

// jsdom cannot compute colors or layout, so color-contrast cannot run here
// (it was verified separately from computed values); region is off because
// tests render fragments of the page, not a full document.
export const axe = configureAxe({
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
  rules: {
    'color-contrast': { enabled: false },
    region: { enabled: false },
  },
});
