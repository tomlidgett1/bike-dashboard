import { isMelbourne7amWindow, melbourneDayKey } from '../src/lib/blog/melbourne-time';

// 7:00am Melbourne on a summer day (AEDT, UTC+11)
const summer7am = new Date('2026-01-15T20:00:00.000Z');
if (!isMelbourne7amWindow(summer7am)) {
  console.error('FAIL: expected 7am window for AEDT summer');
  process.exit(1);
}

// 6:00am Melbourne on same UTC slot in winter would be wrong — use winter date
const winter7am = new Date('2026-06-15T21:00:00.000Z');
if (!isMelbourne7amWindow(winter7am)) {
  console.error('FAIL: expected 7am window for AEST winter');
  process.exit(1);
}

// Outside window
const noon = new Date('2026-01-15T01:00:00.000Z'); // ~noon Melbourne summer
if (isMelbourne7amWindow(noon)) {
  console.error('FAIL: noon should not be in 7am window');
  process.exit(1);
}

const key = melbourneDayKey(new Date('2026-06-28T14:00:00.000Z'));
if (!key.startsWith('2026')) {
  console.error('FAIL: day key', key);
  process.exit(1);
}

console.log('melbourne-time tests passed');
