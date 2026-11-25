import { Marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

/** "Hello, World! Ünïcode" -> "hello-world-unicode" */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '') || 'post';
}

const WORDS_PER_MINUTE = 230;

export function readingMinutes(markdown: string): number {
  const words = stripMarkdown(markdown).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

export function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_~|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function excerpt(markdown: string, max = 180): string {
  const text = stripMarkdown(markdown);
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  // If the cut lands exactly on a word boundary keep the whole thing, else back up to the last space.
  const end = text[max] === ' ' || cut.lastIndexOf(' ') <= 0 ? max : cut.lastIndexOf(' ');
  return cut.slice(0, end).replace(/[,.;:!?-]+$/, '') + '…';
}

const marked = new Marked({ gfm: true, breaks: false });

/**
 * Render author Markdown to HTML that is safe to inline into a page.
 * Raw HTML in the markdown is stripped by sanitize-html's allow-list;
 * URLs are limited to http(s)/mailto so `javascript:` links can't sneak in.
 */
export function renderMarkdown(markdown: string): string {
  const html = marked.parse(markdown, { async: false });
  return sanitizeHtml(html, {
    allowedTags: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'blockquote',
      'ul', 'ol', 'li', 'strong', 'em', 'del', 's', 'code', 'pre', 'a', 'img',
      'table', 'thead', 'tbody', 'tr', 'th', 'td', 'figure', 'figcaption', 'input',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'rel', 'target'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
      code: ['class'],
      th: ['align'],
      td: ['align'],
      input: ['type', 'checked', 'disabled'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    allowedClasses: { code: [/^language-[\w-]+$/] },
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: /^https?:/i.test(attribs.href ?? '')
          ? { ...attribs, rel: 'noopener noreferrer', target: '_blank' }
          : attribs,
      }),
      img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, loading: 'lazy' } }),
    },
    exclusiveFilter: (frame) => frame.tag === 'input' && frame.attribs.type !== 'checkbox',
  });
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);
