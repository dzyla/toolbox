import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Laboratory incubation timing and kinetics intervals',
  formulas: [
    'Remaining time (s) = Duration (s) - Elapsed (s)',
    'Enzyme conversion (%) = 1 - e^(-k_cat × [E] × t / K_m)',
  ],
  assumptions: [
    'Browser background timers rely on Web Workers and timestamp delta comparison (`performance.now()` / `Date.now()`) to prevent throttling in inactive tabs.',
    'System audio alarms utilize the Web Audio API synthesizer directly on-device without external sound asset dependencies.',
  ],
  references: [
    { text: 'W3C HTML Timers and Background Tab Throttling Specifications', url: 'https://html.spec.whatwg.org/multipage/timers-and-user-prompts.html' },
  ],
  verified: '2026-09-03',
};
