'use client';
import React, { useEffect, useState } from 'react';

async function request(url, body) {
  const response = await fetch(url, {
    method: body ? 'PATCH' : 'GET', credentials: 'include', cache: 'no-store',
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || 'Settings request failed. Please retry.');
  return result.data;
}

export default function BusinessSettings({ contactEndpoint, invoiceEndpoint }) {
  const [contacts, setContacts] = useState(null);
  const [profile, setProfile] = useState(null);
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true); setError('');
    try {
      const [contact, invoice] = await Promise.all([request(contactEndpoint), request(invoiceEndpoint)]);
      setContacts(contact); setProfile(invoice); setAddress(invoice.addressLines.join('\n'));
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    let active = true;
    Promise.all([request(contactEndpoint), request(invoiceEndpoint)]).then(([contact, invoice]) => {
      if (active) { setContacts(contact); setProfile(invoice); setAddress(invoice.addressLines.join('\n')); }
    }).catch(failure => { if (active) setError(failure.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [contactEndpoint, invoiceEndpoint]);

  async function save(event) {
    event.preventDefault(); setError(''); setNotice('');
    const lines = address.split('\n').map(line => line.trim()).filter(Boolean);
    if (!lines.length || lines.length > 4 || lines.some(line => line.length > 160)) {
      setError('Enter 1–4 address lines, with no more than 160 characters per line.'); return;
    }
    setBusy(true);
    const results = await Promise.allSettled([
      request(invoiceEndpoint, { ...profile, addressLines: lines }),
      request(contactEndpoint, { name: contacts.name, contactEmail: contacts.contactEmail, whatsappNumbers: contacts.whatsappNumbers.filter(Boolean) }),
    ]);
    if (results[0].status === 'fulfilled') { setProfile(results[0].value); setAddress(results[0].value.addressLines.join('\n')); }
    if (results[1].status === 'fulfilled') setContacts(results[1].value);
    const failed = results.flatMap((result, i) => result.status === 'rejected' ? [(i === 0 ? 'Invoice details: ' : 'Team contacts: ') + result.reason.message] : []);
    if (failed.length) setError((failed.length === 1 ? 'Some changes were saved. ' : 'Changes could not be saved. ') + failed.join(' ') + ' Your entered values are retained; retry Save changes.');
    else setNotice('All changes saved.');
    setBusy(false);
  }

  function field(key, label, type = 'text', required = false) {
    return <label className="bs-field" key={key}><span>{label}</span><input type={type} required={required} value={profile[key] || ''} onChange={event => setProfile({ ...profile, [key]: event.target.value })} /></label>;
  }
  return <div className="business-settings">
    <style>{`
      .business-settings{width:100%;max-width:960px;margin:24px auto;color:#172d3e;font-family:Arial,Helvetica,sans-serif}
      .business-settings *{box-sizing:border-box}
      .business-settings .bs-form{background:#fff;border:1px solid #dce5ec;border-radius:16px;overflow:hidden;box-shadow:0 3px 14px #172d3e06}
      .business-settings .bs-section{padding:26px 30px;border:0;margin:0;min-width:0}
      .business-settings .bs-section+.bs-section{border-top:1px solid #e6edf2}
      .business-settings h2{font-size:18px;line-height:1.4;margin:0 0 6px;font-weight:650}
      .business-settings .bs-description{font-size:14px;line-height:1.6;color:#607587;margin:0 0 22px}
      .business-settings .bs-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
      .business-settings .bs-field{display:flex;flex-direction:column;gap:8px;font-size:14px;font-weight:550;min-width:0}
      .business-settings input,.business-settings textarea,.business-settings select{display:block;width:100%;min-width:0;border:1px solid #bacbd7;border-radius:8px;background:#fff;color:#172d3e;padding:11px 12px;font:inherit;font-weight:400;line-height:1.5}
      .business-settings input:focus,.business-settings textarea:focus,.business-settings select:focus{outline:2px solid #0b758744;outline-offset:1px;border-color:#0b7587}
      .business-settings textarea{resize:vertical;min-height:112px}
      .business-settings .bs-address{margin:20px 0}
      .business-settings small{font-size:12px;color:#607587;font-weight:400}
      .business-settings .bs-phones{display:grid;gap:12px;margin:20px 0 12px}
      .business-settings .bs-phone{display:grid;grid-template-columns:180px minmax(0,1fr) auto;align-items:end;gap:10px}
      .business-settings button{font:inherit;cursor:pointer}
      .business-settings .bs-secondary{border:1px solid #cbd9e3;border-radius:8px;background:#fff;padding:10px 14px;color:#285269;font-size:14px}
      .business-settings .bs-remove{border:0;background:transparent;padding:12px 5px;color:#a63838;font-size:13px}
      .business-settings .bs-footer{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px 30px;background:#f7fafc;border-top:1px solid #e6edf2}
      .business-settings .bs-save{border:0;border-radius:8px;background:#086b7c;color:white;font-weight:600;padding:12px 24px;white-space:nowrap}
      .business-settings button:disabled{opacity:.55;cursor:wait}
      .business-settings .bs-status{padding:14px 18px;border-radius:8px;margin-bottom:16px;font-size:14px;line-height:1.6}
      .business-settings .bs-error{background:#fff1f0;color:#9b2929}
      .business-settings .bs-success{background:#edf9f2;color:#23653d}
      .business-settings details summary{cursor:pointer;font-weight:600;font-size:15px}
      .business-settings details[open] summary{margin-bottom:20px}
      .business-settings .bs-account{font-size:13px;color:#607587;margin:20px 0 0;overflow-wrap:anywhere}
      @media(max-width:600px){.business-settings .bs-grid{grid-template-columns:1fr}.business-settings .bs-section{padding:22px 18px}.business-settings .bs-phone{grid-template-columns:110px minmax(0,1fr)}.business-settings .bs-remove{grid-column:2;justify-self:end;padding:0}.business-settings .bs-footer{padding:18px;align-items:stretch;flex-direction:column}}
    `}</style>
    {error && <div role="alert" className="bs-status bs-error">{error} {!profile && <button type="button" className="bs-secondary" onClick={load}>Retry loading</button>}</div>}
    {notice && <div role="status" className="bs-status bs-success">{notice}</div>}
    {loading ? <p role="status">Loading settings…</p> : profile && contacts && <form className="bs-form" onSubmit={save}>
      <fieldset disabled={busy} className="bs-section">
        <h2>Business &amp; invoice details</h2>
        <p className="bs-description">These details appear on new invoices and existing invoices downloaded again.</p>
        <div className="bs-grid">{field('businessName', 'Business name', 'text', true)}{field('tagline', 'Tagline')}</div>
        <label className="bs-field bs-address"><span>Invoice address</span><textarea aria-label="Invoice address" required rows={4} value={address} onChange={event => setAddress(event.target.value)} /><small>Enter the complete address, using up to four lines.</small></label>
        <div className="bs-grid">{field('email', 'Invoice email', 'email', true)}{field('phone', 'Invoice phone', 'tel', true)}</div>
      </fieldset>
      <fieldset disabled={busy} className="bs-section">
        <h2>Team notifications</h2>
        <p className="bs-description">Manage the contact email and WhatsApp numbers saved for your admin account.</p>
        <label className="bs-field"><span>Team contact email</span><input type="email" maxLength={254} value={contacts.contactEmail} onChange={event => setContacts({ ...contacts, contactEmail: event.target.value })} /></label>
        <div className="bs-phones">{contacts.whatsappNumbers.map((number, index) => {
          const code = [...contacts.countries].sort((a, b) => b.code.length - a.code.length).find(country => number.startsWith(country.code))?.code || '+91';
          return <div className="bs-phone" key={index}>
            <label className="bs-field"><span>Country code {index + 1}</span><select value={code} onChange={event => setContacts({ ...contacts, whatsappNumbers: contacts.whatsappNumbers.map((n, i) => i === index ? event.target.value + n.slice(code.length) : n) })}>{contacts.countries.map(country => <option key={country.code} value={country.code}>{country.label} ({country.code})</option>)}</select></label>
            <label className="bs-field"><span>WhatsApp number {index + 1}</span><input type="tel" required value={number.slice(code.length)} onChange={event => setContacts({ ...contacts, whatsappNumbers: contacts.whatsappNumbers.map((n, i) => i === index ? code + event.target.value.replace(/\D/g, '') : n) })} /></label>
            <button type="button" className="bs-remove" onClick={() => setContacts({ ...contacts, whatsappNumbers: contacts.whatsappNumbers.filter((_, i) => i !== index) })}>Remove</button>
          </div>;
        })}</div>
        {contacts.whatsappNumbers.length < 2 && <button type="button" className="bs-secondary" onClick={() => setContacts({ ...contacts, whatsappNumbers: [...contacts.whatsappNumbers, '+91'] })}>Add WhatsApp number</button>}
        <p className="bs-account">Signed in as {contacts.name} · {contacts.loginEmail}</p>
      </fieldset>
      <fieldset disabled={busy} className="bs-section"><details><summary>Additional business details</summary><div className="bs-grid">
        {field('legalName', 'Legal name (optional)')}{field('gstin', 'GSTIN (optional)')}{field('pan', 'PAN (optional)')}{field('websiteUrl', 'Website URL', 'url', true)}{field('termsUrl', 'Terms URL', 'url', true)}
        <label className="bs-field"><span>Admin display name</span><input required maxLength={120} value={contacts.name} onChange={event => setContacts({ ...contacts, name: event.target.value })} /></label>
      </div></details></fieldset>
      <div className="bs-footer"><small>Website and portal use the same saved settings.</small><button type="submit" disabled={busy} className="bs-save">{busy ? 'Saving…' : 'Save changes'}</button></div>
    </form>}
  </div>;
}

