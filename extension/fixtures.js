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

export const CLEANUP_SAMPLE_TABS = [
  { id: 101, windowId: 1, title: 'Tab Tamer cleanup checklist', url: 'https://github.com/example/tab-tamer/issues/14' },
  { id: 102, windowId: 1, title: 'Merged: add browser adapter', url: 'https://github.com/example/tab-tamer/pull/12' },
  { id: 103, windowId: 1, title: 'React useEffect guide', url: 'https://react.dev/reference/react/useEffect' },
  { id: 104, windowId: 1, title: 'Another useEffect tutorial', url: 'https://example.com/react-use-effect-tutorial' },
  { id: 105, windowId: 1, title: 'Manifest V2 migration guide (2023)', url: 'https://example.com/manifest-v2-2023' },
  { id: 106, windowId: 1, title: 'Untitled dashboard', url: 'https://dashboard.example.com/' },
  { id: 107, windowId: 1, title: 'Old Safari extension notes', url: 'https://notes.example.com/safari-extension-old' },
];

export const CLEANUP_SAMPLE_DECISIONS = [
  { ...CLEANUP_SAMPLE_TABS[0], category: 'keep', confidence: 0.95 },
  { ...CLEANUP_SAMPLE_TABS[1], category: 'finished', confidence: 0.91 },
  { ...CLEANUP_SAMPLE_TABS[2], category: 'keep', confidence: 0.86 },
  { ...CLEANUP_SAMPLE_TABS[3], category: 'redundant', confidence: 0.82 },
  { ...CLEANUP_SAMPLE_TABS[4], category: 'stale', confidence: 0.9 },
  { ...CLEANUP_SAMPLE_TABS[5], category: 'review', confidence: 0.42 },
  { ...CLEANUP_SAMPLE_TABS[6], category: 'stale', confidence: 0.65 },
];

export const SAMPLE_WORKFLOWS = {
  organize: { tabs: SAMPLE_TABS, decisions: SAMPLE_DECISIONS },
  cleanup: { tabs: CLEANUP_SAMPLE_TABS, decisions: CLEANUP_SAMPLE_DECISIONS },
};
