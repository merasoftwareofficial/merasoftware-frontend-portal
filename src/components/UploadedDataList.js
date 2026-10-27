import React, { useState } from 'react';
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
//
// Plan uploads carry a status history (helpers/uploadStatus.js on the backend): shown when
// `showStatusHistory` is set. `onSetStatus(attempt, status, note)` adds the admin's
// In progress / Done / Rejected buttons — only on plan uploads (attempt.isPlanUpload), the only
// ones the backend lets change.

const STATUS_NEXT = { pending: ['in_progress', 'completed', 'rejected'], in_progress: ['completed', 'rejected'] };
const STATUS_ACTION = { in_progress: 'Mark in progress', completed: 'Mark done', rejected: 'Reject' };
const STATUS_WORD = { in_progress: 'In progress', completed: 'Done', rejected: 'Rejected' };

const UploadedDataList = ({
  uploads = [],
  loading = false,
  error = '',
  theme = 'glass',
  emptyText = 'Nothing uploaded yet.',
  onDownload,
  downloadingId = '',
  showStatusHistory = false,
  onSetStatus,
  statusBusyId = '',
}) => {
  const isGlass = theme === 'glass';
  const t = (lightClass, glassClass) => (isGlass ? glassClass : lightClass);
  // The note being written for one upload: { id, status, note }.
  const [draft, setDraft] = useState(null);
  const submitStatus = async (attempt) => {
    if (!draft || !onSetStatus) return;
    const saved = await onSetStatus(attempt, draft.status, draft.note.trim());
    if (saved) setDraft(null);
  };

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

            {showStatusHistory && (attempt.statusHistory || []).length > 0 ? (
              <ul className={t('mt-2 space-y-1 text-xs text-slate-600', 'mt-2 space-y-1 text-xs text-[var(--text-secondary)]')}>
                {attempt.statusHistory.map((entry, index) => (
                  <li key={`${entry.status}-${index}`}>
                    <span className="font-semibold">{STATUS_WORD[entry.status] || entry.status}</span>
                    {entry.at ? ` · ${new Date(entry.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
                    {entry.auto ? ' · when our team downloaded the files' : ''}
                    {entry.note ? <span className="block whitespace-pre-line">{entry.note}</span> : null}
                  </li>
                ))}
                {attempt.allowanceReturned ? <li>This update was given back, so it can be sent again.</li> : null}
              </ul>
            ) : null}

            {onSetStatus && attempt.isPlanUpload && STATUS_NEXT[attempt.status || 'pending'] ? (
              draft?.id === attempt.id ? (
                <div className="mt-2 space-y-2">
                  <textarea
                    value={draft.note}
                    onChange={(event) => setDraft({ ...draft, note: event.target.value })}
                    maxLength={2000}
                    rows={2}
                    placeholder={draft.status === 'rejected' ? 'Reason the client sees (required): what to send again' : 'Note the client sees (optional)'}
                    className={t('w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900', 'w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2 text-sm text-[var(--text-primary)]')}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={statusBusyId === attempt.id || (draft.status === 'rejected' && !draft.note.trim())}
                      onClick={() => submitStatus(attempt)}
                      className={t('rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50', 'rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50')}
                    >
                      {statusBusyId === attempt.id ? 'Saving…' : `${STATUS_ACTION[draft.status]} and tell the client`}
                    </button>
                    <button type="button" onClick={() => setDraft(null)} className={t('rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700', 'rounded-lg border border-[var(--glass-border)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]')}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {STATUS_NEXT[attempt.status || 'pending'].map((status) => (
                    <button
                      key={status}
                      type="button"
                      disabled={Boolean(statusBusyId)}
                      onClick={() => setDraft({ id: attempt.id, status, note: '' })}
                      className={t(
                        `rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50 ${status === 'rejected' ? 'border-rose-200 text-rose-700 hover:bg-rose-50' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`,
                        'rounded-lg border border-[var(--glass-border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-primary)] disabled:opacity-50'
                      )}
                    >
                      {STATUS_ACTION[status]}
                    </button>
                  ))}
                </div>
              )
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
