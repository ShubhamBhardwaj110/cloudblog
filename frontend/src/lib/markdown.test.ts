import { describe, expect, it } from 'vitest';
import { coverGradient, timeAgo, toLocalInput, fromLocalInput } from './format';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('adds heading anchors and collects a TOC', () => {
    const { html, headings } = renderMarkdown('## Getting started\n\ntext\n\n### Install\n\n## Getting started');
    expect(headings.map((h) => h.id)).toEqual(['getting-started', 'install', 'getting-started-1']);
    expect(html).toContain('id="getting-started"');
  });

  it('highlights known languages and escapes unknown ones', () => {
    expect(renderMarkdown('```js\nconst a = 1\n```').html).toContain('hljs-keyword');
    expect(renderMarkdown('```nope\n<b>x</b>\n```').html).toContain('&lt;b&gt;');
  });

  it('removes scripts, event handlers and javascript: links', () => {
    const { html } = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[a](javascript:alert(1))');
    expect(html).not.toMatch(/<script|onerror|javascript:/i);
  });

  it('opens external links in a new tab safely', () => {
    expect(renderMarkdown('[x](https://example.com)').html).toContain('rel="noopener noreferrer"');
  });
});

describe('format helpers', () => {
  it('timeAgo', () => {
    const now = Date.parse('2026-01-10T00:00:00Z');
    expect(timeAgo('2026-01-09T00:00:00Z', now)).toBe('yesterday');
    expect(timeAgo('2026-01-10T00:00:00Z', now)).toBe('just now');
  });
  it('coverGradient is deterministic', () => {
    expect(coverGradient('abc')).toBe(coverGradient('abc'));
    expect(coverGradient('abc')).not.toBe(coverGradient('abd'));
  });
  it('datetime-local round trip', () => {
    const iso = '2026-05-01T10:30:00.000Z';
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
  });
});
