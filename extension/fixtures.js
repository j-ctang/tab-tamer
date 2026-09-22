export const SAMPLE_TABS = [
  { id: 1, windowId: 1, title: 'React docs: useEffect', url: 'https://react.dev/reference/react/useEffect' },
  { id: 2, windowId: 1, title: 'Tab Tamer — GitHub issue #12', url: 'https://github.com/example/tab-tamer/issues/12' },
  { id: 3, windowId: 1, title: 'MDN: Array.prototype.flatMap', url: 'https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Array/flatMap' },
  { id: 4, windowId: 1, title: 'Best noise-cancelling headphones 2026', url: 'https://example.com/reviews/headphones' },
  { id: 5, windowId: 1, title: 'A History of Ancient Rome (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Ancient_Rome' },
  { id: 6, windowId: 1, title: 'Team standup notes — Sept 22', url: 'https://notes.example.com/standup-0922' },
  { id: 7, windowId: 1, title: 'r/webdev: anyone else fighting Safari extensions', url: 'https://reddit.com/r/webdev/comments/example' },
  { id: 8, windowId: 1, title: 'localhost:3000', url: 'http://localhost:3000/' },
];

export const SAMPLE_DECISIONS = [
  { ...SAMPLE_TABS[0], category: 'focus', confidence: 0.95 },
  { ...SAMPLE_TABS[1], category: 'focus', confidence: 0.88 },
  { ...SAMPLE_TABS[2], category: 'later', confidence: 0.8 },
  { ...SAMPLE_TABS[3], category: 'distraction', confidence: 0.92 },
  { ...SAMPLE_TABS[4], category: 'distraction', confidence: 0.7 },
  { ...SAMPLE_TABS[5], category: 'later', confidence: 0.6 },
  { ...SAMPLE_TABS[6], category: 'review', confidence: 0.4 },
  { ...SAMPLE_TABS[7], category: 'review', confidence: 0.3 },
];
