import React from 'react';
import { Download } from 'lucide-react';

import { formatFileSize, getRequestStatusMeta } from '../helpers/clientSubmissions';

// One renderer for the customer's uploaded data, used by every surface that shows it:
// the project page, the plan/service page, the My Updates page, and the admin client
// workspace. Before this, each page drew its own version and only one of them offered a
// download at all.
//
// Presentation only — it never fetches. Callers pass the array that
// GET /api/orders/:orderId/uploads returned, so the shape here is the server's shape
// (id / notes / files[].name), not the raw updateRequestModel document. The download is
// the same arrangement: this reports that one was asked for and the caller performs it,
// so the component stays a renderer even though a download is now a request, not a link.
//
// `theme` picks the surface's visual language: 'glass' for the customer portal over
// BG.png, 'light' for the admin panel's white cards. Only colours differ — the content,
// the ordering and the download rule are identical, which is the point.

const UploadedDataList = ({
  uploads = [],
  loading = false,
  error = '',
  theme = 'glass',
  emptyText = 'Nothing uploaded yet.',
  onDownload,
  downloadingId = '',
}) => {
  const isGlass = theme === 'glass';
  const t = (lightClass, glassClass) => (isGlass ? glassClass : lightClass);

  if (loading) {
    return <p className={t('py-4 text-sm text-slate-500', 'py-4 text-sm text-[var(--text-muted)]')}>Loading…</p>;
  }

  if (error) {
    return <p className={t('py-4 text-sm text-rose-600', 'py-4 text-sm text-[var(--badge-error-fg)]')}>{error}</p>;
  }

  if (!uploads || uploads.length === 0) {
    return <p className={t('py-4 text-sm text-slate-500', 'py-4 text-sm text-[var(--text-muted)]')}>{emptyText}</p>;
  }

  return (
    <div className={t('divide-y divide-slate-200', 'divide-y divide-[var(--divider)]')}>
      {uploads.map((attempt) => {
        const files = attempt.files || [];
        const notes = attempt.notes || [];
        const meta = getRequestStatusMeta(attempt.status, theme);
        const isDownloading = Boolean(downloadingId) && downloadingId === attempt.id;

        return (
          <div key={attempt.id} className="py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={t('text-sm font-semibold text-black', 'text-sm font-semibold text-[var(--text-primary)]')}>
                {attempt.createdAt ? new Date(attempt.createdAt).toLocaleString('en-GB', {
                  day: 'numeric', month: 'short', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                }) : ''}
              </span>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${meta.tone}`}>
                {meta.label}
              </span>
            </div>

            {notes.length > 0 ? (
              <p className={t(
                'mt-1.5 whitespace-pre-line text-sm leading-6 text-slate-700',
                'mt-1.5 whitespace-pre-line text-sm leading-6 text-[var(--text-secondary)]'
              )}>
                {notes.map((note) => note?.text).filter(Boolean).join('\n')}
              </p>
            ) : null}

            {files.length > 0 ? (
              <div className="mt-2">
                <ul className={t('space-y-1 text-sm text-slate-700', 'space-y-1 text-sm text-[var(--text-secondary)]')}>
                  {files.map((file) => (
                    <li key={file.id} className="flex items-center justify-between gap-3">
                      <span className={t('truncate text-black', 'truncate text-[var(--text-primary)]')}>
                        {file.name || 'File'}
                      </span>
                      <span className={t('shrink-0 text-xs text-slate-500', 'shrink-0 text-xs text-[var(--text-muted)]')}>
                        {file.isExpired ? 'Expired' : formatFileSize(file.size)}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* One zip per upload. The server decides whether anything is still
                    fetchable (hasDownloadableFiles), so this never offers a download
                    that would produce an empty archive.

                    A button, not a link: an <a href> to the API is a cross-site
                    navigation, and Firefox sends no session cookie on one, so the
                    download came back as a 401 page. The caller fetches it instead. */}
                {attempt.hasDownloadableFiles ? (
                  <button
                    type="button"
                    onClick={() => onDownload?.(attempt)}
                    disabled={isDownloading}
                    className={t(
                      'mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60',
                      'mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition hover:bg-[var(--glass-bg-hover)] disabled:cursor-not-allowed disabled:opacity-60'
                    )}
                  >
                    <Download className="h-3.5 w-3.5" />
                    {isDownloading ? 'Preparing…' : `Download ${files.length > 1 ? 'All' : ''}`.trim()}
                  </button>
                ) : (
                  <p className={t('mt-2 text-xs text-slate-500', 'mt-2 text-xs text-[var(--text-muted)]')}>
                    {attempt.deliveryStatus === 'queued' ? 'Upload received. Files will be available shortly.' : attempt.deliveryStatus === 'needs_review' ? 'Files temporarily unavailable. Please contact support.' : 'Files are no longer available.'}
                  </p>
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

export default UploadedDataList;
