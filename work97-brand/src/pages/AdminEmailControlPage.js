import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import AdminLayout from '../components/AdminLayout';

// The website owns the management UI; portal actions still use the same backend.
export default function AdminEmailControlPage() {
  const user = useSelector(state => state?.user?.user);
  const website = process.env.REACT_APP_WEBSITE_URL || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:3000' : 'https://www.merasoftware.com');
  const target = `${website.replace(/\/$/, '')}/admin/email-control?tab=portal`;
  useEffect(() => { window.location.replace(target); }, [target]);
  return <AdminLayout user={user}><div className="p-6"><h1 className="text-2xl font-bold">Email Control</h1><p className="my-3">Opening the shared email panel on the website.</p><a className="text-emerald-700 underline" href={target}>Open Portal email settings</a></div></AdminLayout>;
}
