import React from 'react';
import { Link } from 'react-router-dom';
import BusinessSettings from '../components/admin/BusinessSettings';

export default function AdminSettingsPage() {
  const base = process.env.REACT_APP_BACKEND_URL;
  return <main className="mx-auto w-full max-w-5xl p-4 sm:p-8">
    <h1 className="text-2xl font-bold text-slate-900">Business details</h1>
    <p className="mt-2 text-sm text-slate-600">Manage invoice details and your team notification contacts.</p>
    <Link to="/admin-panel/email-control" className="mt-4 inline-flex text-sm font-semibold text-slate-700">Communication settings →</Link>
    <BusinessSettings contactEndpoint={`${base}/api/admin/my-settings`} invoiceEndpoint={`${base}/api/admin/invoice-settings`} />
  </main>;
}
