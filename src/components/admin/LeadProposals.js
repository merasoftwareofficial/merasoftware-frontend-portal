import React, { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, FilePlus2, X } from "lucide-react";
import SummaryApi from "../../common";
import { reviewEmail } from "../../helpers/emailReview";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // backend config/uploadLimits.js checks this too
const inputClass =
  "w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100";

const formatAmount = (amount) => (amount === null || amount === undefined ? null : `₹${Number(amount).toLocaleString("en-IN")}`);

/**
 * A lead's proposals: every version, and Add Proposal. The backend sets the status, versions and timeline
 * entry. A lead with an email gets the usual review popup from the response; a phone-only lead's message
 * is reviewed here and added to the WhatsApp queue. `onChanged` reloads the lead.
 */
const LeadProposals = ({ lead, readOnly, onChanged }) => {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);
  const proposals = [...(lead?.proposals || [])].sort((a, b) => b.version - a.version);
  const url = `${SummaryApi.uploadProposal.url}/${lead?._id}/proposal`;

  const close = () => {
    if (saving) return;
    setOpen(false); setFile(null); setAmount(""); setNote("");
  };

  const sendWhatsapp = async (version, preview) => {
    const decision = await reviewEmail(preview, "The proposal is saved. Choose whether to send this WhatsApp message.");
    if (decision.choice !== "send") return;
    const response = await fetch(`${url}/${version}/whatsapp`, {
      method: SummaryApi.uploadProposal.method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(decision),
    });
    const result = await response.json();
    if (result.success) toast.success("WhatsApp message queued");
    else toast.error(result.message || "The WhatsApp message was not queued");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!file) { toast.error("Please attach the proposal file"); return; }
    if (file.size > MAX_FILE_BYTES) { toast.error("The file must be 5 MB or smaller"); return; }
    try {
      setSaving(true);
      const formData = new FormData();
      formData.append("attachment", file);
      formData.append("amount", amount);
      formData.append("note", note);
      const response = await fetch(url, { method: SummaryApi.uploadProposal.method, credentials: "include", body: formData });
      const result = await response.json();
      if (!result.success) { toast.error(result.message || "Failed to add the proposal"); return; }
      toast.success(`Proposal v${result.data.version} added`);
      setOpen(false); setFile(null); setAmount(""); setNote("");
      await onChanged();
      if (result.data.messageBlocked) toast.info(`Proposal saved. No message goes: ${result.data.messageBlocked}`);
      else if (result.data.whatsappPreview) await sendWhatsapp(result.data.version, result.data.whatsappPreview);
      else if (result.data.messageUnavailable) toast.error("Proposal saved, but its message could not be prepared.");
      else if (!result.emailDraftIds?.length) toast.info("Proposal saved. No message was prepared: check this lead's email and WhatsApp number, and the Proposal sent action.");
    } catch (error) {
      console.error("Error adding proposal:", error);
      toast.error("Error adding proposal");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Proposals</h3>
      {proposals.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500">No proposals yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {proposals.map((item) => (
            <li key={item.version} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-900">
                  v{item.version}{formatAmount(item.amount) ? ` · ${formatAmount(item.amount)}` : ""}
                </span>
                {item.downloadLink ? (
                  <a href={item.downloadLink} target="_blank" rel="noopener noreferrer" aria-label={`Download proposal v${item.version}`} className="text-emerald-700 hover:text-emerald-800">
                    <Download size={16} />
                  </a>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {item.uploadedAt ? new Date(item.uploadedAt).toLocaleDateString("en-IN") : ""}{item.name ? ` · ${item.name}` : ""}
              </p>
              {item.note ? <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">{item.note}</p> : null}
            </li>
          ))}
        </ul>
      )}
      {!readOnly ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={!lead}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <FilePlus2 size={16} />
          Add Proposal
        </button>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="add-proposal-title" className="max-h-full w-full max-w-lg overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h2 id="add-proposal-title" className="text-lg font-bold text-slate-900">Add Proposal</h2>
              <button type="button" onClick={close} disabled={saving} aria-label="Close" className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
              <div>
                <label htmlFor="proposal-file" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Proposal file</label>
                <input id="proposal-file" ref={fileRef} type="file" accept=".pdf,.doc,.docx" autoFocus onChange={(e) => setFile(e.target.files?.[0] || null)} className={inputClass} />
                <p className="mt-1 text-xs text-slate-500">PDF or Word, up to 5 MB.</p>
              </div>
              <div>
                <label htmlFor="proposal-amount" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Amount (₹) <span className="font-normal normal-case text-slate-400">(optional)</span>
                </label>
                <input id="proposal-amount" type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label htmlFor="proposal-note" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Note <span className="font-normal normal-case text-slate-400">(optional)</span>
                </label>
                <textarea id="proposal-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={close} disabled={saving} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60">Cancel</button>
                <button type="submit" disabled={saving} className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">
                  {saving ? "Adding..." : "Add Proposal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default LeadProposals;
