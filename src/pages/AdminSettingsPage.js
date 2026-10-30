import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import AdminLayout from '../components/AdminLayout';
import { toast } from 'sonner';
import SummaryApi from '../common';
import StorageService from '../utils/storageService';
import CookieManager from '../utils/cookieManager';

const endpoint = `${process.env.REACT_APP_BACKEND_URL}/api/admin/my-settings`;
async function readSettings() {
  const response = await fetch(endpoint, { credentials: 'include' });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || 'Could not load settings');
  return result.data;
}
export default function AdminSettingsPage() {
  const user = useSelector(state => state?.user?.user);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function handleLogout() {
    try {
      const response = await fetch(SummaryApi.logout_user.url, { method: SummaryApi.logout_user.method, credentials: 'include' });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Could not sign out');
      StorageService.clearUserData(); CookieManager.clearAll(); window.location.assign('/');
    } catch (err) { setError(err.message); }
  }
  async function load() {
    try { setData(await readSettings()); } catch (err) { setError(err.message || 'Could not load settings'); }
  }
  useEffect(() => {
    let active = true;
    readSettings().then(value => { if (active) setData(value); }).catch(err => { if (active) setError(err.message || 'Could not load settings'); });
    return () => { active = false; };
  }, []);
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch(endpoint, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: data.name, contactEmail: data.contactEmail, whatsappNumbers: data.whatsappNumbers.filter(Boolean) }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Could not save settings');
      setData(result.data); toast.success('Settings saved');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <AdminLayout user={user} onLogout={handleLogout}><main className="mx-auto w-full max-w-3xl p-4 sm:p-8">
    <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
    <p className="mt-2 text-sm text-slate-600">Manage your profile and contact information.</p>
    {error && <p role="alert" className="my-4 rounded-lg bg-red-50 p-3 text-red-800">{error} {!data && <button onClick={() => { setError(''); load(); }} className="underline">Retry</button>}</p>}
    {!data ? !error && <p role="status" className="mt-6">Loading settings...</p> :
      <form onSubmit={save} className="mt-6 space-y-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
        <fieldset disabled={busy} className="space-y-5">
          <label className="block text-sm font-medium">Name<input required maxLength={120} value={data.name} onChange={e => setData({ ...data, name: e.target.value })} className="mt-1 block w-full rounded-lg border p-2.5" /></label>
          <p className="text-sm text-slate-600">Login email: {data.loginEmail}</p>
          <label className="block text-sm font-medium">Contact email<input type="email" maxLength={254} value={data.contactEmail} onChange={e => setData({ ...data, contactEmail: e.target.value })} className="mt-1 block w-full rounded-lg border p-2.5" /></label>
          <section className="space-y-3"><h2 className="font-semibold">WhatsApp numbers</h2>
            <p className="text-sm text-slate-600">Save up to two numbers with their country codes.</p>
            {data.whatsappNumbers.map((value, index) => {
              const country = data.countries.find(row => value.startsWith(row.code))?.code || '+91';
              return <div key={index} className="flex flex-wrap gap-2">
                <select aria-label={`Country code ${index + 1}`} value={country} onChange={e => setData({ ...data, whatsappNumbers: data.whatsappNumbers.map((n, i) => i === index ? e.target.value + n.slice(country.length) : n) })} className="max-w-full rounded-lg border p-2">
                  {data.countries.map(row => <option key={row.code} value={row.code}>{row.label} ({row.code})</option>)}
                </select>
                <input aria-label={`WhatsApp number ${index + 1}`} type="tel" required value={value.slice(country.length)} onChange={e => setData({ ...data, whatsappNumbers: data.whatsappNumbers.map((n, i) => i === index ? country + e.target.value.replace(/\D/g, '') : n) })} className="min-w-0 flex-1 rounded-lg border p-2" />
                <button type="button" onClick={() => setData({ ...data, whatsappNumbers: data.whatsappNumbers.filter((_, i) => i !== index) })} className="px-2 text-red-700">Remove</button>
              </div>;
            })}
            {data.whatsappNumbers.length < 2 && <button type="button" onClick={() => setData({ ...data, whatsappNumbers: [...data.whatsappNumbers, '+91'] })} className="rounded-lg border px-3 py-2 text-sm">Add WhatsApp number</button>}
          </section>
          <button type="submit" className="rounded-lg bg-blue-700 px-5 py-2.5 font-semibold text-white disabled:opacity-50">{busy ? 'Saving...' : 'Save settings'}</button>
        </fieldset>
      </form>}
  </main></AdminLayout>;
}
