import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { ArrowLeft, FileText, Download, RefreshCw } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import Badge from '../components/Badge';
import GlassButton from '../components/GlassButton';
import WorkspacePanel from '../components/WorkspacePanel';
import SummaryApi from '../common';
import { goToCustomerReturn } from '../helpers/customerReturnNavigation';

const formatFileSize = (bytes) => {
  const n = Number(bytes) || 0;
  if (n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDateTime = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleString('en-IN');
};

// Every row is an admin-sent document: client-stage agreement/general documents,
// or lead-stage proposals and follow-up attachments.
// The badge says what KIND of document this is — proposal, follow-up,
// agreement. That is a label, not a status, so it no longer takes a status
// colour: amber for a proposal implied "needs attention", sky was a hue the
// portal does not use at all, and each -200 text was picked against the dark
// ground (roughly 1.5:1 on the light page). All four kinds now read neutral and
// are told apart by their words.
const getDocMeta = (doc) => {
  if (doc?.kind === 'proposal') return { label: `Proposal v${doc.version}` };
  if (doc?.kind === 'follow-up') return { label: 'Follow-up Document' };
  if (doc?.source === 'agreement') return { label: 'Agreement' };
  return { label: 'Document' };
};

const CustomerDocuments = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useSelector((state) => state?.user?.user);

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await fetch(SummaryApi.myDocuments.url, {
          method: SummaryApi.myDocuments.method,
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || 'Failed to load documents');
        if (!cancelled) setDocuments(result.data?.documents || []);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load documents');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const handleBack = () => goToCustomerReturn(navigate, location, '/dashboard');

  return (
    <DashboardLayout user={user}>
      <div
        className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-4 py-10 sm:px-6 lg:px-8 lg:py-14"
      >
        <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />

        <div className="relative mx-auto max-w-7xl">
            <header className="text-center">
              <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl lg:text-4xl">
                Documents
              </h1>
              <p className="mx-auto mt-3 max-w-2xl text-base text-[var(--text-secondary)] sm:text-lg">
                Proposals and agreements shared with you
              </p>
            </header>
          <WorkspacePanel className="mt-10" title="Documents" icon={FileText} actions={<>
            <GlassButton onClick={handleBack}><ArrowLeft size={16} />Back</GlassButton>
            <GlassButton disabled={loading} onClick={() => setReload(value => value + 1)}><RefreshCw size={16} />{loading ? 'Refreshing…' : 'Refresh'}</GlassButton>
          </>}>
            <div className="relative">
              {loading ? (
                <p role="status" className="px-5 py-10 text-center text-base text-[var(--text-secondary)] sm:px-6">Loading documents…</p>
              ) : error ? (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-3 px-5 py-6 sm:px-6">
                  <p className="text-sm text-[var(--badge-error-fg)]">{error}</p>
                  <GlassButton onClick={() => setReload(value => value + 1)}><RefreshCw size={16} />Retry</GlassButton>
                </div>
              ) : documents.length === 0 ? (
                <p className="px-5 py-12 text-center text-base text-[var(--text-secondary)] sm:px-6">
                  No documents yet. Any document shared with you before or after becoming a client will appear here.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--divider)]">
                  {documents.map((doc) => {
                    const meta = getDocMeta(doc);
                    const sizeLabel = formatFileSize(doc.size);
                    return (
                      <li
                        key={doc.id}
                        className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone="neutral" size="sm">
                              {meta.label}
                            </Badge>
                            <span className="break-words text-base font-semibold text-[var(--text-primary)]">
                              {doc.name || 'Document'}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-[var(--text-secondary)]">
                            {formatDateTime(doc.date)}
                            {sizeLabel ? ` · ${sizeLabel}` : ''}
                          </p>
                        </div>
                        {doc.downloadLink ? (
                          <GlassButton as="a" size="sm"
                            href={doc.downloadLink}
                            target="_blank"
                            rel="noreferrer"
                            className="w-fit shrink-0"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Download
                          </GlassButton>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </WorkspacePanel>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CustomerDocuments;
