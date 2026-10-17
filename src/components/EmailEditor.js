import { useEffect, useMemo, useRef } from 'react';
import { mergeAttributes, Node } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';

// The visual email editor of the review popup — the same document and chips as the website's
// Email Control editor (merasoftware/src/app/admin/email-control/email-editor.tsx). Only the
// backend converts the document to the stored text (backend/helpers/emailDoc.js); the node
// names and attributes below are that contract.
const chipLabel = (labels, key) => labels[key]?.label || key;
const chipHint = (labels, key) => labels[key]?.hint || '';
const CHIP = 'inline-block rounded-full border border-cyan-700 bg-cyan-700/10 px-2 text-[0.9em] leading-6 whitespace-nowrap';
const SECTION = 'my-2 rounded-lg border border-dashed border-cyan-700 bg-cyan-700/10 px-3 py-2 font-semibold';

const EmailVariable = Node.create({
  name: 'emailVariable',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addOptions() { return { labels: {} }; },
  addAttributes() { return { key: { default: null } }; },
  parseHTML() { return [{ tag: 'span[data-email-variable]', getAttrs: element => ({ key: element.dataset.emailVariable }) }]; },
  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-email-variable': node.attrs.key, class: CHIP, title: chipHint(this.options.labels, node.attrs.key) }), chipLabel(this.options.labels, node.attrs.key)];
  },
  renderText({ node }) { return `[${chipLabel(this.options.labels, node.attrs.key)}]`; },
});

const EmailSection = Node.create({
  name: 'emailSection',
  group: 'block',
  atom: true,
  selectable: true,
  addOptions() { return { labels: {} }; },
  addAttributes() { return { key: { default: null } }; },
  parseHTML() { return [{ tag: 'div[data-email-section]', getAttrs: element => ({ key: element.dataset.emailSection }) }]; },
  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-email-section': node.attrs.key, class: SECTION, title: chipHint(this.options.labels, node.attrs.key) }), `▦ ${chipLabel(this.options.labels, node.attrs.key)}`];
  },
});

/** Plain text as paragraphs — only for a backend older than the editor, which sends no document. */
export const plainDoc = (text = '') => ({ type: 'doc', content: text.split(/\n{2,}/).map(block => ({ type: 'paragraph', content: block ? [{ type: 'text', text: block }] : [] })) });
/** True when a document holds any text or chip. */
export const docHasContent = node => !!node && (node.type === 'emailVariable' || node.type === 'emailSection' || (node.type === 'text' ? !!node.text?.trim() : (node.content || []).some(docHasContent)));

export default function EmailEditor({ id, label, value, onChange, disabled, variables = [], blocks = [] }) {
  // Keyed by content: callers pass fresh arrays each render, and a new key rebuilds the editor.
  const labelsKey = JSON.stringify([...variables, ...blocks].map(row => [row.key, { label: row.label, hint: row.hint }]));
  const labels = useMemo(() => Object.fromEntries(JSON.parse(labelsKey)), [labelsKey]);
  // The editor owns its document while typing; outside changes (template switch) are pushed in.
  const emitted = useRef('');
  const editor = useEditor({
    editable: !disabled,
    extensions: [
      StarterKit.configure({ blockquote: false, code: false, codeBlock: false, horizontalRule: false, italic: false, orderedList: false, strike: false, heading: { levels: [2] } }),
      Link.configure({ autolink: true, openOnClick: false, linkOnPaste: true }),
      EmailVariable.configure({ labels }),
      EmailSection.configure({ labels }),
    ],
    content: value,
    editorProps: { attributes: { id, role: 'textbox', 'aria-label': label, 'aria-multiline': 'true', class: 'min-h-[200px] px-3 py-2 outline-none [&_p]:my-1 [&_h2]:my-2 [&_h2]:text-lg [&_h2]:font-bold [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-6 [&_a]:text-cyan-700 [&_a]:underline' } },
    onUpdate: ({ editor: instance }) => { const doc = instance.getJSON(); emitted.current = JSON.stringify(doc); onChange(doc); },
  }, [labelsKey]);

  useEffect(() => {
    if (!editor || !value || JSON.stringify(value) === emitted.current) return;
    emitted.current = JSON.stringify(value);
    editor.commands.setContent(value, false);
  }, [editor, value]);
  useEffect(() => { editor?.setEditable(!disabled); }, [editor, disabled]);

  const button = on => `rounded border px-3 py-1 text-sm disabled:opacity-40 ${on ? 'bg-cyan-700 text-white border-cyan-700' : ''}`;
  const choices = [...variables.map(row => ({ ...row, kind: 'emailVariable' })), ...blocks.map(row => ({ ...row, kind: 'emailSection' }))];
  return (
    <>
      <span id={`${id}-label`} className="mt-4 block">{label}</span>
      <div className="mt-1 rounded border">
        <div role="toolbar" aria-label={`${label} formatting`} className="flex flex-wrap items-center gap-2 border-b p-2">
          <button type="button" className={button(editor?.isActive('bold'))} disabled={disabled || !editor} onClick={() => editor.chain().focus().toggleBold().run()}><strong>B</strong> Bold</button>
          <button type="button" className={button(editor?.isActive('heading'))} disabled={disabled || !editor} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>Heading</button>
          <button type="button" className={button(editor?.isActive('bulletList'))} disabled={disabled || !editor} onClick={() => editor.chain().focus().toggleBulletList().run()}>• List</button>
          {!!choices.length && (
            <select aria-label={`Insert detail into ${label}`} disabled={disabled || !editor} value="" className="rounded border px-2 py-1 text-sm"
              onChange={event => { const choice = choices.find(row => `${row.kind}:${row.key}` === event.target.value); if (choice) editor.chain().focus().insertContent({ type: choice.kind, attrs: { key: choice.key } }).run(); }}>
              <option value="">Insert detail…</option>
              {variables.length > 0 && <optgroup label="Details">{variables.map(row => <option key={row.key} value={`emailVariable:${row.key}`} title={row.hint}>{row.label}</option>)}</optgroup>}
              {blocks.length > 0 && <optgroup label="Sections">{blocks.map(row => <option key={row.key} value={`emailSection:${row.key}`} title={row.hint}>{row.label}</option>)}</optgroup>}
            </select>
          )}
        </div>
        <EditorContent editor={editor} />
      </div>
      {!!choices.length && <DetailsGuide label={label} choices={choices} disabled={disabled || !editor} onInsert={choice => editor.chain().focus().insertContent({ type: choice.kind, attrs: { key: choice.key } }).run()} />}
    </>
  );
}

// Always-visible list of the details this email can hold: what each one is filled with, an
// example (or, in a review, this email's own value), and a click inserts it at the cursor.
// Same as DetailsGuide in the website's email-editor.tsx.
function DetailsGuide({ label, choices, disabled, onInsert }) {
  const example = row => (row.value !== undefined ? (row.value ? `In this email: ${row.value}` : 'Empty in this email') : row.sample ? `e.g. ${row.sample}` : '');
  return (
    <section aria-label={`Available details for ${label}`} className="mt-2 rounded border p-3 text-sm">
      <h3 className="font-semibold">Available details</h3>
      <p className="opacity-75">Click a detail to put it where the cursor is. When the email is prepared, each detail is replaced by the real value — for example the client's own name. A line whose details are all empty is left out.</p>
      <ul className="mt-2 grid gap-1.5">
        {choices.map(row => (
          <li key={`${row.kind}:${row.key}`} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <button type="button" disabled={disabled} className={`${row.kind === 'emailSection' ? 'rounded-lg border border-dashed border-cyan-700 bg-cyan-700/10 px-2.5 font-semibold' : CHIP} cursor-pointer disabled:cursor-default disabled:opacity-60`}
              onMouseDown={event => event.preventDefault()} onClick={() => onInsert(row)}>
              {row.kind === 'emailSection' ? `▦ ${row.label}` : row.label}
            </button>
            <span>{row.hint || (row.kind === 'emailSection' ? 'A section this action builds; keep it on its own line' : 'Filled in automatically')}</span>
            {example(row) && <span className="opacity-75">{example(row)}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

// The final mail as the backend rendered it; sandboxed so it can never run script.
export function EmailPreview({ html }) {
  return <iframe title="Email preview" sandbox="" srcDoc={html} className="mt-3 h-80 w-full rounded border bg-white" />;
}
