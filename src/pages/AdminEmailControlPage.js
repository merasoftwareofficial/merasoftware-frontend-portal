import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import AdminLayout from '../components/AdminLayout';
import { emailApi, decideDraft } from '../helpers/emailReview';
import SummaryApi from '../common';
import { logout } from '../store/userSlice';
import CookieManager from '../utils/cookieManager';
import StorageService from '../utils/storageService';

export default function AdminEmailControlPage() {
  const user = useSelector(state => state?.user?.user);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [editor, setEditor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function handleLogout() {
    try {
      await fetch(SummaryApi.logout_user.url, { method: SummaryApi.logout_user.method, credentials: 'include' });
      CookieManager.clearAll(); StorageService.clearUserData(); dispatch(logout()); navigate('/');
    } catch { toast.error('Logout failed. Please try again.'); }
  }
  async function load() {
    try { setData(await emailApi()); setError(''); }
    catch (err) { setError(err.message); }
  }
  useEffect(() => { load(); }, []);
  async function savePolicy(event, values) {
    setBusy(true);
    try { await emailApi(`/policies/${event}`, { method: 'PUT', body: JSON.stringify(values) }); await load(); }
    catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  }
  async function saveTemplate(event) {
    event.preventDefault(); setBusy(true);
    try {
      await emailApi(editor._id ? `/templates/${editor._id}` : '/templates', { method: editor._id ? 'PUT' : 'POST', body: JSON.stringify(editor) });
      setEditor(null); await load(); toast.success('Template saved');
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  }
  async function review(draft) {
    setBusy(true);
    try { const result = await decideDraft(draft); toast.success(result.status === 'sent' ? 'Email sent' : 'Email skipped'); }
    catch (err) { toast.error(err.message); }
    finally { await load(); setBusy(false); }
  }
  return <AdminLayout user={user} onLogout={handleLogout}>
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Email Control</h1>
      <p>Website and portal email rules and templates. Automatic and scheduled email sending is disabled. Every email requires a Send Mail decision.</p>
      {error && <p role="alert" className="text-red-700">{error} <button onClick={load}>Retry</button></p>}
      {!data && !error && <p>Loading email settings…</p>}
      {data && <>
        <div className="overflow-auto rounded-xl border bg-white">
          <table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-3">Section / action</th><th className="p-3">Sending rule</th><th className="p-3">Default template</th><th className="p-3">Templates</th></tr></thead>
            <tbody>{data.events.map(event => {
              const policy = data.policies.find(p => p.event === event.key) || { mode: 'review', defaultTemplate: '' };
              const templates = data.templates.filter(t => t.event === event.key);
              return <tr key={event.key} className="border-b align-top">
                <td className="p-3"><small className="text-slate-500">{event.section}</small><div>{event.label}</div></td>
                <td className="p-3"><select aria-label={`${event.label} sending rule`} disabled={busy} value={policy.mode} onChange={e => savePolicy(event.key, { ...policy, mode: e.target.value })}><option value="review">Ask before sending</option><option value="off">Off</option></select></td>
                <td className="p-3"><select aria-label={`${event.label} default template`} disabled={busy} value={policy.defaultTemplate || ''} onChange={e => savePolicy(event.key, { ...policy, defaultTemplate: e.target.value })}><option value="">Built-in action template</option>{templates.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}</select></td>
                <td className="space-x-3 p-3"><button disabled={busy} className="text-emerald-700 underline" onClick={() => setEditor({ event: event.key, name: '', subject: '{{subject}}', text: '{{message}}' })}>Add template</button>{templates.map(t => <button disabled={busy} className="text-blue-700 underline" key={t._id} onClick={() => setEditor(t)}>Edit {t.name}</button>)}</td>
              </tr>;
            })}</tbody></table>
        </div>
        {editor && <form onSubmit={saveTemplate} className="space-y-3 rounded-xl border bg-white p-5">
          <h2 className="font-bold">{editor._id ? 'Edit' : 'New'} template — {data.events.find(e => e.key === editor.event)?.label}</h2>
          <p className="text-sm">Variables: {'{{subject}}'} and {'{{message}}'} from the action. Lead welcome also supports {'{{name}}'}.</p>
          <label className="block">Name<input required maxLength={100} className="block w-full rounded border p-2" value={editor.name} onChange={e => setEditor({ ...editor, name: e.target.value })} /></label>
          <label className="block">Subject<input required maxLength={300} className="block w-full rounded border p-2" value={editor.subject} onChange={e => setEditor({ ...editor, subject: e.target.value })} /></label>
          <label className="block">Message<textarea required rows={8} maxLength={100000} className="block w-full rounded border p-2" value={editor.text} onChange={e => setEditor({ ...editor, text: e.target.value })} /></label>
          <button disabled={busy} className="rounded bg-emerald-700 px-4 py-2 text-white">Save template</button> <button disabled={busy} type="button" onClick={() => setEditor(null)}>Cancel</button>
        </form>}
        <section><h2 className="mb-3 text-lg font-bold">Recent email decisions</h2><p className="mb-3 text-sm">Drafts expire after 23 hours. Failed send retries use the original reviewed content to prevent duplicate delivery.</p>
          {data.drafts.length === 0 && <p>No email drafts yet.</p>}
          {data.drafts.map(draft => <div key={draft._id} className="my-2 rounded border bg-white p-3"><strong>{draft.subject}</strong><p className="text-sm">{draft.to.join(', ')} · {draft.status}</p>{draft.failure && <p className="text-sm text-red-700">{draft.failure}</p>}{['pending', 'failed'].includes(draft.status) && <button disabled={busy} className="text-emerald-700 underline" onClick={() => review(draft)}>Review email</button>}</div>)}
        </section>
      </>}
    </div>
  </AdminLayout>;
}
