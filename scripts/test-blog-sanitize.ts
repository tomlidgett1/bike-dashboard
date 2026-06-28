import { sanitizeBlogCredit, sanitizeBlogText } from '../src/lib/blog/sanitize';

const cases: Array<{ in: string; out: string }> = [
  { in: 'The peloton — suddenly — stopped', out: 'The peloton, suddenly, stopped' },
  { in: 'Read more at https://cyclingnews.com/story', out: '' },
  { in: 'Great stage (Source: https://example.com)', out: 'Great stage' },
  { in: '[this link](https://example.com) matters', out: 'this link matters' },
  { in: 'Pogačar won — brilliantly', out: 'Pogačar won, brilliantly' },
];

for (const { in: input, out } of cases) {
  const result = sanitizeBlogText(input);
  if (result !== out) {
    console.error('FAIL:', { input, expected: out, got: result });
    process.exit(1);
  }
}

if (sanitizeBlogCredit('https://example.com/photo.jpg') !== null) {
  console.error('FAIL: URL credit should be null');
  process.exit(1);
}

if (sanitizeBlogCredit('Getty Images') !== 'Getty Images') {
  console.error('FAIL: text credit should remain');
  process.exit(1);
}

console.log('sanitize tests passed');
