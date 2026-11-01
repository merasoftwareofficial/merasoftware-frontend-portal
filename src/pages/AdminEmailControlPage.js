import { useEffect } from 'react';
import { WEBSITE_URL } from '../helpers/brand';

// The website owns the management UI; portal actions still use the same backend.
export default function AdminEmailControlPage() {
  const target = `${WEBSITE_URL}/admin/email-control?tab=portal`;
  useEffect(() => { window.location.replace(target); }, [target]);
  return <><div className="p-6"><h1 className="text-2xl font-bold">Email Control</h1><p className="my-3">Opening the shared email panel on the website.</p><a className="text-emerald-700 underline" href={target}>Open Portal email settings</a></div></>;
}
