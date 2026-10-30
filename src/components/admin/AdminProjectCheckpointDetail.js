import React, { useEffect, useState } from "react";
import AdminInfoPill from "./AdminInfoPill";

const getStatusLabel = (node) => {
  if (node?.status === "deleted") return "Deleted";
  if (node?.status === "archived") return "Archived";
  return "Active";
};

const getStatusClassName = (node) => {
  const label = getStatusLabel(node).toLowerCase();
  if (label === "active") return "bg-emerald-100 text-emerald-800";
  if (label === "deleted") return "bg-rose-100 text-rose-700";
  return "bg-slate-100 text-slate-700";
};

const AdminProjectCheckpointDetail = ({
  node,
  currentProjectProgress = 0,
  messages = [],
  updateMode = false,
  updateModeLabel = "Add Node",
  formatDateTime,
  onAddNode,
  onPrepareMessage,
  latestNodeId,
  isSubmitting = false,
  editingNode = null,
  editBounds = null,
  onSaveCorrection,
  onCancelEdit,
}) => {
  const [newNodeTitle, setNewNodeTitle] = useState("");
  const [newNodePercentage, setNewNodePercentage] = useState("");
  useEffect(() => {
    setNewNodeTitle(editingNode?.title || "");
    setNewNodePercentage(editingNode ? String(editingNode.cumulativeProgress ?? "") : "");
  }, [editingNode]);

  const enteredPercentage = Number(newNodePercentage);
  const isStartingNodeEdit = Boolean(editingNode && editBounds?.isStartingNode);

  // Editing constraints mirror the backend editProjectNode rules exactly:
  //  - starting node: progress is locked at 0%, only title changes
  //  - other node: progress must sit strictly between its neighbours
  //  - new node (not editing): progress must be above current active progress
  let minimumNextPercentage;
  let maximumNextPercentage;
  if (editingNode) {
    minimumNextPercentage = Math.min(100, Number(editBounds?.lowerBound ?? 0) + 0.1);
    maximumNextPercentage = editBounds?.upperBound != null
      ? Math.max(0, Number(editBounds.upperBound) - 0.1)
      : 100;
  } else {
    minimumNextPercentage = Math.min(100, Number(currentProjectProgress || 0) + 0.1);
    maximumNextPercentage = 100;
  }

  const isNewPercentageValid = isStartingNodeEdit
    ? true
    : newNodePercentage !== "" &&
      Number.isFinite(enteredPercentage) &&
      enteredPercentage >= minimumNextPercentage &&
      enteredPercentage <= maximumNextPercentage;
  const canSubmitNode = Boolean(newNodeTitle.trim() && isNewPercentageValid) && !isSubmitting;

  if (updateMode) {
    if (!editingNode && Number(currentProjectProgress) >= 100) return <div className="rounded-2xl border border-slate-300 bg-white p-4">
      <h3 className="text-lg font-semibold">Project complete — 100%</h3>
      <p className="mt-2 text-sm text-slate-600">Review the saved completion update in Communication.</p>
      <button type="button" disabled={isSubmitting || !latestNodeId} onClick={() => onPrepareMessage?.(latestNodeId)} className="mt-4 rounded-lg bg-blue-700 px-4 py-2 text-white disabled:opacity-50">Review customer message</button>
    </div>;
    return <div className="rounded-2xl border border-slate-300 bg-white p-4">
      <h3 className="text-lg font-semibold">{editingNode ? "Edit Node" : updateModeLabel}</h3>
      <p className="mt-2 text-sm text-slate-600">Current progress: {Number(currentProjectProgress || 0)}%</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-[9rem_1fr]">
        <label className="text-sm font-medium">New progress %
          <input type="number" min={minimumNextPercentage} max={maximumNextPercentage} step="0.1"
            disabled={isStartingNodeEdit || isSubmitting} value={isStartingNodeEdit ? "0" : newNodePercentage}
            onChange={event => setNewNodePercentage(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 p-2" />
        </label>
        <label className="text-sm font-medium">Node title
          <input value={newNodeTitle} disabled={isSubmitting} onChange={event => setNewNodeTitle(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 p-2" />
        </label>
      </div>
      <p className="mt-2 text-xs text-slate-500">{isStartingNodeEdit ? "Starting node stays at 0%." : `Valid range: ${minimumNextPercentage.toFixed(1)}%–${maximumNextPercentage.toFixed(1)}%.`}</p>
      {!editingNode && <p className="mt-3 text-sm text-slate-600">Save this node, then review the customer message in the communication popup.</p>}
      <div className="mt-4 flex gap-3">
        {editingNode && <button type="button" disabled={isSubmitting} onClick={onCancelEdit} className="rounded-lg border px-4 py-2">Cancel Edit</button>}
        <button type="button" disabled={!canSubmitNode} className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-50"
          onClick={async () => {
            if (editingNode) await onSaveCorrection?.(editingNode, newNodeTitle.trim(), enteredPercentage, "");
            else if (await onAddNode?.(newNodeTitle.trim(), enteredPercentage, "")) { setNewNodeTitle(""); setNewNodePercentage(""); }
          }}>{isSubmitting ? "Saving..." : editingNode ? "Save Correction" : "Add Node"}</button>
      </div>
    </div>;
  }

  if (!node) {
    return (
      <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
        <p className="text-sm text-slate-500">Select a node to view its details.</p>
      </div>
    );
  }

  const linkedMessages = Array.isArray(messages)
    ? messages.filter((message) => message?.nodeId && message.nodeId === node.nodeId)
    : [];
  const statusLabel = getStatusLabel(node);
  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">Selected Node</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">{node.title}</h3>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClassName(node)}`}>
          {statusLabel}
        </span>
      </div>

      {node.status === "active" && node.visibleToClient !== false && Number(node.cumulativeProgress) > 0 && !node.editedAt &&
        <button type="button" disabled={isSubmitting} onClick={() => onPrepareMessage?.(node.nodeId)} className="mt-4 rounded-lg border border-blue-300 px-3 py-2 text-sm font-medium text-blue-700">Review customer message</button>}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <AdminInfoPill label="Cumulative Progress" value={`${node.cumulativeProgress || 0}%`} />
        <AdminInfoPill label="Visible To Client" value={node.visibleToClient === false ? "No" : "Yes"} />
        <AdminInfoPill label="Created At" value={formatDateTime(node.createdAt)} />
        <AdminInfoPill label="Related Records" value={linkedMessages.length} />
      </div>

      <div className="mt-4 rounded-[1.25rem] border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-900">Node Records</p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">
              {linkedMessages.length} record{linkedMessages.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        <div className="mt-3 space-y-3">
          {linkedMessages.length === 0 ? (
            <p className="text-sm text-slate-500">No related record available for this node.</p>
          ) : (
            linkedMessages.map((message, index) => (
              <div key={message.id || `${node.nodeId}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold capitalize text-slate-900">{message.sender || "Unknown"}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(message.timestamp)}</p>
                </div>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">
                  {message.message || "No message details available."}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
};

export default AdminProjectCheckpointDetail;
