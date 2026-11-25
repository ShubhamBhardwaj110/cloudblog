import { describe, expect, it } from 'vitest';
import { excerpt, readingMinutes, renderMarkdown, slugify } from '../src/lib/text.js';

describe('slugify', () => {
  it('lowercases, strips accents and punctuation', () => {
    expect(slugify('Hello, World! Ünïcode café')).toBe('hello-world-unicode-cafe');
  });
  it('never returns an empty slug', () => {
    expect(slugify('!!!')).toBe('post');
  });
  it('caps length without a trailing dash', () => {
    const s = slugify('a'.repeat(79) + ' bbbb');
    expect(s.length).toBeLessThanOrEqual(80);
    expect(s.endsWith('-')).toBe(false);
  });
});

describe('readingMinutes / excerpt', () => {
  it('is at least one minute', () => expect(readingMinutes('hi')).toBe(1));
  it('scales with words', () => expect(readingMinutes('word '.repeat(2300))).toBe(10));
  it('excerpts plain text from markdown at a word boundary', () => {
    const e = excerpt('# Title\n\nSome **bold** [link](https://x.y) text that goes on and on', 30);
    expect(e).toBe('Title Some bold link text that…');
  });
});

describe('renderMarkdown sanitisation', () => {
  it('renders normal markdown', () => {
    expect(renderMarkdown('## Hi\n\n*there*')).toBe('<h2>Hi</h2>\n<p><em>there</em></p>\n');
  });
  it('strips script tags and event handlers', () => {
    const out = renderMarkdown('<script>alert(1)</script><img src="https://x/a.png" onerror="alert(1)">');
    expect(out).not.toMatch(/script|onerror/i);
    expect(out).toContain('src="https://x/a.png"');
  });
  it('drops javascript: URLs', () => {
    expect(renderMarkdown('[x](javascript:alert(1))')).not.toMatch(/javascript:/i);
  });
  it('opens external links safely', () => {
    expect(renderMarkdown('[x](https://example.com)')).toContain('rel="noopener noreferrer"');
  });
});
