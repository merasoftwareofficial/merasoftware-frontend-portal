import { useRef } from 'react';

// Email text in the template markup the backend renders (backend/helpers/emailMarkup.js):
// **bold**, "## " headings and "- " list items. The website panel has the same editor.
export default function EmailTextEditor({ id, label, value, onChange, disabled, rows = 13 }) {
  const area = useRef(null);
  const edit = change => {
    const element = area.current; if (!element || disabled) return;
    const next = change(value, element.selectionStart, element.selectionEnd);
    onChange(next.text);
    requestAnimationFrame(() => { element.focus(); element.setSelectionRange(next.start, next.end); });
  };
  const bold = () => edit((text, start, end) => {
    const selected = text.slice(start, end) || 'bold text';
    return { text: `${text.slice(0, start)}**${selected}**${text.slice(end)}`, start: start + 2, end: start + 2 + selected.length };
  });
  // Prefixes every line the selection touches, e.g. "## " or "- ".
  const prefixLines = prefix => edit((text, start, end) => {
    const from = text.lastIndexOf('\n', start - 1) + 1;
    const newline = text.indexOf('\n', end);
    const to = newline === -1 ? text.length : newline;
    const block = text.slice(from, to).split('\n').map(line => (line.startsWith(prefix) ? line : prefix + line)).join('\n');
    return { text: text.slice(0, from) + block + text.slice(to), start: from, end: from + block.length };
  });
  const button = 'rounded border px-3 py-1 text-sm disabled:opacity-40';
  return (
    <>
      <label htmlFor={id} className="mt-4 block">{label}</label>
      <div role="toolbar" aria-label={`${label} formatting`} className="mt-1 flex gap-2">
        <button type="button" className={button} disabled={disabled} onClick={bold}><strong>B</strong> Bold</button>
        <button type="button" className={button} disabled={disabled} onClick={() => prefixLines('## ')}>Heading</button>
        <button type="button" className={button} disabled={disabled} onClick={() => prefixLines('- ')}>List</button>
      </div>
      <textarea id={id} ref={area} rows={rows} maxLength={100000} disabled={disabled} className="mt-2 w-full rounded border p-2" value={value} onChange={e => onChange(e.target.value)} />
      <p className="mt-1 text-xs text-slate-500">**bold** · "## " heading · "- " list item · links are detected. Keep {'{{section}}'} lines to include their tables.</p>
    </>
  );
}

// The final mail as the backend rendered it; sandboxed so it can never run script.
export function EmailPreview({ html }) {
  return <iframe title="Email preview" sandbox="" srcDoc={html} className="mt-3 h-80 w-full rounded border bg-white" />;
}
