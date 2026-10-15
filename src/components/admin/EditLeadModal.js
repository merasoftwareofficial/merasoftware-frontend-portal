import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import SummaryApi from "../../common";
import KeyboardSelect from "../KeyboardSelect";
import KeyboardHint from "../KeyboardHint";
import leadSourceOptions, { REFERENCE_SOURCE } from "../../helpers/leadSourceOptions";
import isAccountEmail from "../../helpers/accountEmail";

const inputClass =
  "w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100";

/**
 * Edits a lead's contact details (backend updateLead action "editDetails").
 * `forConvert` opens it from Convert when the lead is missing what a client
 * account needs: email becomes required and the save hands back to Convert.
 * A Reference lead's source is shown but locked — it is set only at creation.
 */
const EditLeadModal = ({ lead, forConvert = false, onClose, onSaved }) => {
  const [form, setForm] = useState({
    name: lead?.name || "",
    phone: lead?.phone || "",
    email: lead?.email || "",
    source: lead?.source || "",
    notes: lead?.notes || "",
  });
  const [saving, setSaving] = useState(false);

  const nameRef = useRef(null);
  const phoneRef = useRef(null);
  const emailRef = useRef(null);
  const sourceRef = useRef(null);
  const notesRef = useRef(null);
  const submitRef = useRef(null);

  const isReferenceLead = lead?.source === REFERENCE_SOURCE || Boolean(lead?.referredByUserId);
  const referrer = lead?.referredByUserId && typeof lead.referredByUserId === "object" ? lead.referredByUserId : null;

  // Reference is creation-only. An older lead's free-text source stays selectable
  // so opening and saving the form never changes it by accident.
  const sourceChoices = leadSourceOptions.filter((option) => option !== REFERENCE_SOURCE);
  if (form.source && !sourceChoices.includes(form.source) && !isReferenceLead) {
    sourceChoices.push(form.source);
  }

  useEffect(() => {
    // Convert opens this for a missing field: start there.
    if (forConvert && !form.phone.trim()) phoneRef.current?.focus();
    else if (forConvert) emailRef.current?.focus();
    else nameRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const focusNext = (nextRef) => (event) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    nextRef.current?.focus();
  };

  const closeIfIdle = () => {
    if (!saving) onClose();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const email = form.email.trim();
    if (!form.name.trim()) {
      toast.error("Please provide lead name");
      return;
    }
    if (!form.phone.trim()) {
      toast.error("Please provide a phone number");
      return;
    }
    if (forConvert && !email) {
      toast.error("An email is required to create a client account");
      return;
    }
    if (email && !isAccountEmail(email)) {
      toast.error("Please provide a valid email address");
      return;
    }

    try {
      setSaving(true);
      const formData = new FormData();
      formData.append("action", "editDetails");
      formData.append("name", form.name);
      formData.append("phone", form.phone);
      formData.append("email", email);
      formData.append("notes", form.notes);
      if (!isReferenceLead) {
        formData.append("source", form.source);
      }

      const response = await fetch(`${SummaryApi.updateLead.url}/${lead._id}`, {
        method: SummaryApi.updateLead.method,
        credentials: "include",
        body: formData,
      });
      const result = await response.json();
      if (!result.success) {
        toast.error(result.message || "Failed to update lead");
        return;
      }

      toast.success("Lead details updated");
      await onSaved(result.data);
    } catch (error) {
      console.error("Error updating lead:", error);
      toast.error("Error updating lead");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">Edit Lead</h2>
          <button
            type="button"
            onClick={closeIfIdle}
            className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {forConvert ? (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              A client account needs a phone and an email. Fill them in to continue converting this lead.
            </p>
          ) : null}

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Name<span className="text-red-500"> *</span></label>
            <input
              ref={nameRef}
              type="text"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              onKeyDown={focusNext(phoneRef)}
              placeholder="Lead full name"
              className={`peer ${inputClass}`}
            />
            <KeyboardHint id="hint-edit-lead-name" hint="Press Enter to go to next field" />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Phone<span className="text-red-500"> *</span></label>
              <input
                ref={phoneRef}
                type="text"
                value={form.phone}
                onChange={(e) => setField("phone", e.target.value)}
                onKeyDown={focusNext(emailRef)}
                placeholder="Phone number"
                className={`peer ${inputClass}`}
              />
              <KeyboardHint id="hint-edit-lead-phone" hint="Press Enter to go to next field" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                Email{forConvert ? <span className="text-red-500"> *</span> : null}
              </label>
              <input
                ref={emailRef}
                type="email"
                value={form.email}
                onChange={(e) => setField("email", e.target.value)}
                onKeyDown={focusNext(isReferenceLead ? notesRef : sourceRef)}
                placeholder="Email address"
                className={`peer ${inputClass}`}
              />
              <KeyboardHint id="hint-edit-lead-email" hint="Press Enter to go to next field" />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Source</label>
            {isReferenceLead ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3">
                <p className="text-sm font-semibold text-slate-800">
                  {REFERENCE_SOURCE}
                  {referrer?.name ? ` · ${referrer.name}` : ""}
                </p>
                <p className="text-xs text-slate-500">Set when the lead was created and cannot be changed.</p>
              </div>
            ) : (
              <>
                <KeyboardSelect
                  ref={sourceRef}
                  value={form.source}
                  onChange={(value) => setField("source", value)}
                  options={sourceChoices.map((option) => ({ value: option, label: option }))}
                  placeholder="Select source"
                  onConfirm={() => notesRef.current?.focus()}
                />
                <KeyboardHint id="hint-edit-lead-source" hint="Press ↓ or Enter to open · ↑↓ to move · Enter to select" />
              </>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Notes</label>
            <textarea
              ref={notesRef}
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              onKeyDown={focusNext(submitRef)}
              placeholder="Any context about this lead"
              rows={3}
              className={inputClass}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={closeIfIdle}
              disabled={saving}
              className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              ref={submitRef}
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 focus:animate-pulse focus:outline-none focus:ring-4 focus:ring-emerald-300 disabled:opacity-60"
            >
              {saving ? "Saving..." : forConvert ? "Save & Continue" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditLeadModal;
