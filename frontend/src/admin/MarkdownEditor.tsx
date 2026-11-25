import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { ImageIcon } from '../components/Icons';
import { renderMarkdown } from '../lib/markdown';

type Mode = 'write' | 'split' | 'preview';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onUpload: (file: File) => Promise<string>;
  onError: (message: string) => void;
}

/** Wrap/prefix the current selection, keeping the selection sensible afterwards. */
function applyFormat(el: HTMLTextAreaElement, kind: string): { value: string; start: number; end: number } {
  const { value, selectionStart: s, selectionEnd: e } = el;
  const sel = value.slice(s, e);
  const wrap = (before: string, after = before, placeholder = 'text') => {
    const inner = sel || placeholder;
    return { value: value.slice(0, s) + before + inner + after + value.slice(e), start: s + before.length, end: s + before.length + inner.length };
  };
  const linePrefix = (prefix: string) => {
    const lineStart = value.lastIndexOf('\n', s - 1) + 1;
    const block = value.slice(lineStart, e) || '';
    const next = block.split('\n').map((l, i) => (kind === 'ol' ? `${i + 1}. ` : prefix) + l).join('\n');
    return { value: value.slice(0, lineStart) + next + value.slice(e), start: lineStart, end: lineStart + next.length };
  };
  switch (kind) {
    case 'bold': return wrap('**');
    case 'italic': return wrap('_');
    case 'code': return sel.includes('\n') ? wrap('```\n', '\n```', 'code') : wrap('`', '`', 'code');
    case 'link': {
      const r = wrap('[', '](https://)', 'link text');
      return { ...r, start: r.end + 2, end: r.end + 10 };
    }
    case 'h2': return linePrefix('## ');
    case 'h3': return linePrefix('### ');
    case 'quote': return linePrefix('> ');
    case 'ul': return linePrefix('- ');
    case 'ol': return linePrefix('');
    default: return { value, start: s, end: e };
  }
}

const TOOLS: { kind: string; label: string; title: string; style?: React.CSSProperties }[] = [
  { kind: 'h2', label: 'H2', title: 'Heading' },
  { kind: 'h3', label: 'H3', title: 'Subheading' },
  { kind: 'bold', label: 'B', title: 'Bold (Ctrl+B)' },
  { kind: 'italic', label: 'I', title: 'Italic (Ctrl+I)', style: { fontStyle: 'italic', fontFamily: 'var(--font-serif)' } },
  { kind: 'link', label: '🔗', title: 'Link (Ctrl+K)' },
  { kind: 'quote', label: '❝', title: 'Quote' },
  { kind: 'code', label: '</>', title: 'Code', style: { fontFamily: 'var(--font-mono)', fontSize: '0.78rem' } },
  { kind: 'ul', label: '•', title: 'Bulleted list' },
  { kind: 'ol', label: '1.', title: 'Numbered list' },
];

export default function MarkdownEditor({ value, onChange, onUpload, onError }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>('split');
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(0);
  const deferred = useDeferredValue(value);
  const preview = useMemo(() => (mode === 'write' ? '' : renderMarkdown(deferred).html), [deferred, mode]);
  const words = useMemo(() => (value.trim() ? value.trim().split(/\s+/).length : 0), [value]);

  const format = (kind: string) => {
    const el = ref.current;
    if (!el) return;
    const r = applyFormat(el, kind);
    onChange(r.value);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(r.start, r.end); });
  };

  const insertAtCursor = (text: string) => {
    const el = ref.current;
    const pos = el ? el.selectionStart : value.length;
    const before = value.slice(0, pos);
    const sep = before && !before.endsWith('\n') ? '\n\n' : '';
    onChange(before + sep + text + '\n' + value.slice(pos));
  };

  const uploadFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) { onError(`${file.name} isn’t an image`); continue; }
      const token = `![Uploading ${file.name}…]()`;
      insertAtCursor(token);
      setUploading((n) => n + 1);
      try {
        const url = await onUpload(file);
        const alt = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
        // Replace the placeholder using the latest textarea value (user may have kept typing).
        const current = ref.current?.value ?? '';
        onChange(current.replace(token, `![${alt}](${url})`));
      } catch (err) {
        onError((err as Error).message);
        onChange((ref.current?.value ?? '').replace(token + '\n', '').replace(token, ''));
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === 'b') { e.preventDefault(); format('bold'); }
    else if (mod && e.key === 'i') { e.preventDefault(); format('italic'); }
    else if (mod && e.key === 'k') { e.preventDefault(); format('link'); }
    else if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.currentTarget;
      const s = el.selectionStart;
      onChange(value.slice(0, s) + '  ' + value.slice(el.selectionEnd));
      requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
    }
  };

  return (
    <div
      className={`md ${dragging ? 'dragging' : ''}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); setDragging(false); void uploadFiles(e.dataTransfer.files); } }}
    >
      <div className="md-toolbar">
        {TOOLS.map((t, i) => (
          <span key={t.kind} style={{ display: 'contents' }}>
            {(i === 2 || i === 5) && <span className="sep" />}
            <button type="button" className="tool" title={t.title} aria-label={t.title} style={t.style} onClick={() => format(t.kind)} disabled={mode === 'preview'}>
              {t.label}
            </button>
          </span>
        ))}
        <span className="sep" />
        <button type="button" className="tool" title="Insert image" aria-label="Insert image" onClick={() => fileRef.current?.click()}>
          <ImageIcon size={16} />
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) void uploadFiles(e.target.files); e.target.value = ''; }} />
        <div className="tabs" role="tablist" aria-label="Editor mode">
          {(['write', 'split', 'preview'] as Mode[]).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}>
              {m[0]!.toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className={`md-panes ${mode === 'split' ? 'split' : ''}`}>
        {mode !== 'preview' && (
          <textarea
            ref={ref}
            className="md-input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={(e) => { if (e.clipboardData.files.length) { e.preventDefault(); void uploadFiles(e.clipboardData.files); } }}
            placeholder={'Write in Markdown…\n\n## A heading\n\nSome **bold** text, a [link](https://example.com), and an image by dragging it here.'}
            spellCheck
            aria-label="Post content (Markdown)"
          />
        )}
        {mode !== 'write' && (
          <div className="md-preview">
            {deferred.trim() ? <div className="prose" dangerouslySetInnerHTML={{ __html: preview }} /> : <p className="hint">Nothing to preview yet.</p>}
          </div>
        )}
      </div>

      <div className="md-status">
        <span>{uploading > 0 ? `Uploading ${uploading} image${uploading > 1 ? 's' : ''}…` : 'Markdown · drag, drop or paste images'}</span>
        <span>{words.toLocaleString()} words · {Math.max(1, Math.round(words / 230))} min read</span>
      </div>
    </div>
  );
}
