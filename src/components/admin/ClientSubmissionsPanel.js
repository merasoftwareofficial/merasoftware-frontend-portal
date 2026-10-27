import React from "react";
import { ArrowLeft } from "lucide-react";

import UploadedDataList from "../UploadedDataList";

// Admin-side subpage for the data a client uploaded against one project or plan.
//
// Opened from the project/plan detail screen and replaces it, with its own Back button —
// the same open/replace/back shape the project subpage itself uses inside
// AdminClientWorkspace.js.
//
// The list itself is UploadedDataList, the same component the customer's own pages render,
// with theme="light" for the admin panel's white cards. That is the whole point: admin and
// customer read one endpoint and draw it with one component, so neither can show an upload
// or a download the other does not.
//
// Presentation only — the caller fetches and passes the array down, and performs the
// download it is asked for, so this stays a renderer like the list it wraps.

const ClientSubmissionsPanel = ({
  submissions = [],
  loading = false,
  error = "",
  onBack,
  recordLabel = "Project",
  onDownload,
  downloadingId = "",
  // Plan uploads: status history + In progress / Done / Rejected (UploadedDataList).
  onSetStatus,
  statusBusyId = "",
}) => {
  const pendingCount = (submissions || []).filter((item) => item?.status === "pending").length;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          <ArrowLeft size={16} />
          Back to {recordLabel}
        </button>

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-2xl font-bold text-slate-900">Uploaded Data</h2>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {pendingCount > 0 ? (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              {pendingCount} pending
            </span>
          ) : null}
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {(submissions || []).length} record{(submissions || []).length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Upload History</h3>
          <p className="mt-1 text-sm text-slate-500">
            Data and files this client sent through this {String(recordLabel).toLowerCase()}.
            Download an upload to get all of its files as one zip.
            {onSetStatus ? " Downloading a plan upload marks it In progress and tells the client." : ""}
          </p>
        </div>

        <div className="mt-4">
          <UploadedDataList
            uploads={submissions}
            loading={loading}
            error={error}
            theme="light"
            emptyText="Nothing uploaded against this record yet."
            onDownload={onDownload}
            downloadingId={downloadingId}
            showStatusHistory
            onSetStatus={onSetStatus}
            statusBusyId={statusBusyId}
          />
        </div>
      </div>
    </div>
  );
};

export default ClientSubmissionsPanel;
