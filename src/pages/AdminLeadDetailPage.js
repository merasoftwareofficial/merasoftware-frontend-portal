import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Download, Loader2, Mail, MessageSquarePlus, Pencil, Phone, UserCheck, UserPlus, X } from "lucide-react";
import SummaryApi from "../common";
import { logout } from "../store/userSlice";
import CookieManager from "../utils/cookieManager";
import StorageService from "../utils/storageService";
import { useOnlineStatus } from "../App";
import AdminLayout from "../components/AdminLayout";
import AdminWorkspaceShell, { AdminWorkspaceHeader } from "../components/admin/AdminWorkspaceShell";
import AdminInfoPill from "../components/admin/AdminInfoPill";
import EditLeadModal from "../components/admin/EditLeadModal";
import KeyboardSelect from "../components/KeyboardSelect";
import KeyboardHint from "../components/KeyboardHint";
import { goToAdminReturn } from "../helpers/adminReturnNavigation";
import isAccountEmail from "../helpers/accountEmail";
import { DEFAULT_LEAD_STATUS, leadStatusLabel, leadStatusOptions, leadStatusStyle } from "../helpers/leadStatuses";
import LeadProposals from "../components/admin/LeadProposals";
import ProposalSentBadge from "../components/admin/ProposalSentBadge";

const formatDateTime = (value) => {
  if (!value) return "N/A";
  return new Date(value).toLocaleString("en-IN");
};

const AdminLeadDetailPage = () => {
  const user = useSelector((state) => state?.user?.user);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { leadId } = useParams();
  const { isOnline } = useOnlineStatus();

  const [lead, setLead] = useState(null);
  const [finalMessageBusy, setFinalMessageBusy] = useState(false);
  const [messageBusy, setMessageBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [followUpNote, setFollowUpNote] = useState("");
  const [followUpBadge, setFollowUpBadge] = useState("");
  const [followUpFile, setFollowUpFile] = useState(null);
  const [followUpSaving, setFollowUpSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [showConvertConfirm, setShowConvertConfirm] = useState(false);
  const [showUpgradeConfirm, setShowUpgradeConfirm] = useState(false);
  // null = closed; "edit" = Edit Lead button; "convert" = opened by Convert for a missing field.
  const [editLeadMode, setEditLeadMode] = useState(null);
  const [editingFollowUpId, setEditingFollowUpId] = useState(null);
  const [editNote, setEditNote] = useState("");
  const [editBadge, setEditBadge] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const followUpBadgeRef = useRef(null);
  const followUpFileRef = useRef(null);
  const followUpNoteRef = useRef(null);
  const followUpSubmitRef = useRef(null);
  const editBadgeRef = useRef(null);
  const editNoteRef = useRef(null);
  const editSubmitRef = useRef(null);

  // Enter on a text field moves to the next field; a textarea keeps Shift+Enter
  // for a real newline. Shared with AdminLeadsPage's Add Lead form pattern —
  // see DOCS/context-keyboard.md.
  const focusNextOnEnter = (nextRef) => (event) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    nextRef.current?.focus();
  };

  const handleLogout = async () => {
    try {
      if (isOnline) {
        const response = await fetch(SummaryApi.logout_user.url, {
          method: SummaryApi.logout_user.method,
          credentials: "include",
        });
        const data = await response.json();
        if (data.success) {
          toast.success(data.message);
        }
      }
      CookieManager.clearAll();
      StorageService.clearUserData();
      dispatch(logout());
      navigate("/");
    } catch (error) {
      console.error("Error during logout:", error);
      toast.error("Logout failed. Please try again.");
    }
  };

  const fetchLead = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${SummaryApi.leadDetail.url}/${leadId}`, {
        method: SummaryApi.leadDetail.method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const result = await response.json();
      if (!result.success) {
        toast.error(result.message || "Failed to load lead");
        return;
      }
      setLead(result.data);
      // A new follow-up starts on the lead's current status.
      setFollowUpBadge(result.data?.status || DEFAULT_LEAD_STATUS);
    } catch (error) {
      console.error("Error fetching lead:", error);
      toast.error("Error loading lead");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  const isConverted = Boolean(lead?.convertedToUserId);
  const isMatured = isConverted || lead?.status === "Won";

  const noticeFinalMessage = (outcome) => {
    if (outcome === "unreachable" || outcome === "unavailable") toast.info("No final message was prepared: check this lead's WhatsApp number and email, and the Final message action.");
  };

  const finalMessage = lead?.finalMessage;
  // Only a Negative lead whose message hasn't gone: none yet, Don't Send, expired or failed, or a decision still open.
  const canSendFinalMessage = !isConverted && lead?.status === "Negative" && !lead?.requestedByUserId && (!finalMessage || ["not-sent", "review"].includes(finalMessage.status));
  const finalMessageLine = !finalMessage ? "" : {
    review: "Final message: waiting for your decision.",
    queued: "Final message: waiting in the WhatsApp queue.",
    waiting: `Final message sent. No reply yet; the lead goes Dead after ${finalMessage.deadlineAt ? new Date(finalMessage.deadlineAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) : "the wait"}.`,
    replied: `Final message replied: ${finalMessage.lastReplyText || "Message"}.${finalMessage.decision ? "" : " This reply needs your decision in Communication → Final Message."}`,
    dead: "Final message: no reply in time.",
    "not-sent": "Final message: not sent.",
    "email-only": "Final message: sent by email only, so it is not followed.",
    stopped: "Final message: stage changed by hand before the wait ended.",
  }[finalMessage.status] || "";

  // The popup opens from this response (helpers/emailReview.js), and the timeline shows the line once it closes.
  const sendMessage = async () => {
    try {
      setMessageBusy(true);
      const response = await fetch(`${SummaryApi.updateLead.url}/${leadId}/message`, { method: "post", credentials: "include" });
      const result = await response.json();
      if (!result.success) toast.error(result.message || "The message could not be prepared");
      await fetchLead();
    } catch (error) {
      console.error("Error preparing the message:", error);
      toast.error("The message could not be prepared");
    } finally {
      setMessageBusy(false);
    }
  };

  const sendFinalMessage = async () => {
    try {
      setFinalMessageBusy(true);
      const response = await fetch(`${SummaryApi.updateLead.url}/${leadId}/final-message`, { method: "post", credentials: "include" });
      const result = await response.json();
      if (!result.success) toast.error(result.message || "The final message could not be prepared");
      await fetchLead();
    } catch (error) {
      console.error("Error preparing the final message:", error);
      toast.error("The final message could not be prepared");
    } finally {
      setFinalMessageBusy(false);
    }
  };

  const handleAddFollowUp = async (event) => {
    event.preventDefault();
    if (!followUpNote.trim()) {
      toast.error("Please write a follow-up note");
      return;
    }
    try {
      setFollowUpSaving(true);
      // Multipart so the optional file rides along in the same request; adding the
      // follow-up also moves the lead's stage to the chosen badge (backend merge).
      const formData = new FormData();
      formData.append("action", "followUp");
      formData.append("badge", isMatured ? "Won" : followUpBadge);
      formData.append("note", followUpNote);
      if (followUpFile) {
        formData.append("attachment", followUpFile);
      }

      const response = await fetch(`${SummaryApi.updateLead.url}/${leadId}`, {
        method: SummaryApi.updateLead.method,
        credentials: "include",
        body: formData,
      });
      const result = await response.json();
      if (!result.success) {
        toast.error(result.message || "Failed to add follow-up");
        return;
      }
      toast.success("Follow-up added");
      noticeFinalMessage(result.finalMessage);
      setFollowUpNote("");
      setFollowUpFile(null);
      await fetchLead();
    } catch (error) {
      console.error("Error adding follow-up:", error);
      toast.error("Error adding follow-up");
    } finally {
      setFollowUpSaving(false);
    }
  };

  const startEditFollowUp = (item) => {
    setEditingFollowUpId(item._id);
    setEditNote(item.note || "");
    setEditBadge(item.badge || DEFAULT_LEAD_STATUS);
  };

  useEffect(() => {
    if (editingFollowUpId) {
      editBadgeRef.current?.focus();
    }
  }, [editingFollowUpId]);

  // Follow-up entry is this page's main keyboard task, so focus lands there as
  // soon as the lead (and its default Stage selection) has loaded.
  useEffect(() => {
    if (!loading && lead && !isConverted) {
      followUpBadgeRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, lead]);

  const cancelEditFollowUp = () => {
    if (editSaving) return;
    setEditingFollowUpId(null);
    setEditNote("");
    setEditBadge("");
  };

  const handleSaveEditFollowUp = async (event) => {
    event.preventDefault();
    if (!editBadge) {
      toast.error("Please select a stage badge");
      return;
    }
    if (!editNote.trim()) {
      toast.error("Please write a follow-up note");
      return;
    }
    try {
      setEditSaving(true);
      const formData = new FormData();
      formData.append("action", "editFollowUp");
      formData.append("followUpId", editingFollowUpId);
      formData.append("badge", editBadge);
      formData.append("note", editNote);

      const response = await fetch(`${SummaryApi.updateLead.url}/${leadId}`, {
        method: SummaryApi.updateLead.method,
        credentials: "include",
        body: formData,
      });
      const result = await response.json();
      if (!result.success) {
        toast.error(result.message || "Failed to update follow-up");
        return;
      }
      toast.success("Follow-up updated");
      noticeFinalMessage(result.finalMessage);
      setEditingFollowUpId(null);
      setEditNote("");
      setEditBadge("");
      await fetchLead();
    } catch (error) {
      console.error("Error updating follow-up:", error);
      toast.error("Error updating follow-up");
    } finally {
      setEditSaving(false);
    }
  };

  // A client account needs a phone and a valid email; when either is missing,
  // Convert opens Edit Lead first and continues to the confirm step on save.
  const isReadyToConvert = (target) => Boolean(target?.name?.trim()) && Boolean(target?.phone?.trim()) && isAccountEmail(target?.email || "");

  const requestConvert = () => {
    if (!lead || converting || isConverted) return;
    if (!isReadyToConvert(lead)) {
      setEditLeadMode("convert");
      return;
    }
    setShowConvertConfirm(true);
  };

  const handleLeadSaved = async (savedLead) => {
    const continueToConvert = editLeadMode === "convert";
    setEditLeadMode(null);
    await fetchLead();
    if (continueToConvert && isReadyToConvert(savedLead)) {
      setShowConvertConfirm(true);
    }
  };

  const closeConvertConfirm = () => {
    if (converting) return;
    setShowConvertConfirm(false);
    setShowUpgradeConfirm(false);
  };

  // upgradeExisting: the admin confirmed turning an existing blog-only website
  // account with this email into the client account (backend code EXISTING_MEMBER).
  const handleConvert = async (upgradeExisting = false) => {
    if (!lead || converting) return;

    try {
      setConverting(true);
      const response = await fetch(`${SummaryApi.convertLead.url}/${leadId}/convert`, {
        method: SummaryApi.convertLead.method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upgradeExisting }),
      });
      const result = await response.json();
      if (!result.success) {
        if (result.code === "EXISTING_MEMBER") {
          setShowConvertConfirm(false);
          setShowUpgradeConfirm(true);
          return;
        }
        toast.error(result.message || "Failed to convert lead");
        return;
      }
      toast.success(
        `${result.data?.upgradedExisting ? "Website account turned into a client." : "Client created."} Login email: ${result.data?.email} · Password: ${result.data?.defaultPassword}`
      );
      setShowConvertConfirm(false);
      setShowUpgradeConfirm(false);
      await fetchLead();
    } catch (error) {
      console.error("Error converting lead:", error);
      toast.error("Error converting lead");
    } finally {
      setConverting(false);
    }
  };

  const followUps = useMemo(() => {
    const list = lead?.followUps || [];
    return [...list].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [lead]);

  return (
    <AdminLayout user={user} onLogout={handleLogout}>
      <AdminWorkspaceShell>
        <AdminWorkspaceHeader
          icon={UserPlus}
          eyebrow={<>Lead</>}
          title={lead?.name || lead?.phone || (loading ? "Loading..." : "Lead")}
          subtitle={lead?.email || lead?.phone || ""}
          leadingAction={
            <button
              type="button"
              onClick={() => goToAdminReturn(navigate, location, "/admin-panel/leads")}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white transition hover:bg-white/10"
              aria-label="Go back"
            >
              <ArrowLeft size={18} />
            </button>
          }
          meta={
            <>
              <AdminInfoPill label="Status" value={leadStatusLabel(lead?.status)} variant="dark" />
              <AdminInfoPill label="Source" value={lead?.source || "N/A"} variant="dark" />
              <AdminInfoPill label="Added" value={lead?.createdAt ? new Date(lead.createdAt).toLocaleDateString("en-IN") : "N/A"} variant="dark" />
            </>
          }
          actions={
            lead && !isConverted ? (
              <button
                type="button"
                onClick={() => setEditLeadMode("edit")}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15 lg:w-auto"
              >
                <Pencil size={16} />
                Edit Lead
              </button>
            ) : null
          }
          loadingText={loading ? "Loading lead..." : ""}
        />

        <div className="grid grid-cols-1 gap-6 p-5 sm:p-6 lg:grid-cols-3">
          {/* Left: lead info + pipeline */}
          <div className="space-y-6 lg:col-span-1">
            <div className="rounded-3xl border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Contact</h3>
              <div className="mt-3 space-y-3">
                <div className="flex items-center gap-3 text-sm text-slate-800">
                  <Mail size={16} className="text-slate-400" />
                  <span className="truncate">{lead?.email || "N/A"}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-800">
                  <Phone size={16} className="text-slate-400" />
                  <span className="truncate">{lead?.phone || "N/A"}</span>
                </div>
              </div>
              {lead?.inquiry ? (
                <div className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-700">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">WhatsApp ad message</h4>
                  <p className="mt-2 break-words text-slate-800">{lead.inquiry.message}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    {lead.inquiry.firstAt ? new Date(lead.inquiry.firstAt).toLocaleString("en-IN") : ""}
                    {lead.inquiry.lastAt && lead.inquiry.lastAt !== lead.inquiry.firstAt ? ` · last message ${new Date(lead.inquiry.lastAt).toLocaleString("en-IN")}` : ""}
                  </p>
                  {lead.inquiry.profileName ? <p className="mt-1 text-xs text-slate-500">WhatsApp name: {lead.inquiry.profileName} (may not be their real name)</p> : null}
                </div>
              ) : null}
              {lead?.notes ? (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Notes</h4>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{lead.notes}</p>
                </div>
              ) : null}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Current Stage</h3>
              {isConverted ? (
                <div className="mt-3 space-y-3">
                  <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    Matured — follow-ups remain available.
                  </p>
                  {lead.clientAvailable !== false ? <button
                    type="button"
                    onClick={() => navigate(`/admin-panel/clients/${lead.convertedToUserId}`)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
                  >
                    <UserCheck size={16} />
                    View Client
                  </button> : <p className="text-xs text-slate-500">Linked client is unavailable.</p>}
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  <span
                    className={[
                      "inline-flex rounded-full border px-4 py-1.5 text-sm font-semibold",
                      leadStatusStyle(lead?.status),
                    ].join(" ")}
                  >
                    {leadStatusLabel(lead?.status)}
                  </span>
                  <p className="text-xs text-slate-500">
                    Change the stage on a follow-up. Adding a proposal never changes it.
                  </p>
                  {finalMessageLine ? <p className="text-xs font-medium text-slate-700">{finalMessageLine}</p> : null}
                  {canSendFinalMessage ? (
                    <button
                      type="button"
                      onClick={sendFinalMessage}
                      disabled={finalMessageBusy}
                      className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                    >
                      Send final message
                    </button>
                  ) : null}
                </div>
              )}
              {lead?.proposalSentAt ? (
                <div className="mt-3">
                  <ProposalSentBadge className="px-4 py-1.5 text-sm" />
                </div>
              ) : null}
              <button
                type="button"
                onClick={sendMessage}
                disabled={messageBusy || !lead}
                className="mt-3 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
              >
                Send message
              </button>
            </div>

            <LeadProposals lead={lead} readOnly={isConverted} onChanged={fetchLead} />

            {!isConverted ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-5">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Convert</h3>
                <p className="mt-2 text-xs text-slate-500">
                  Creates a customer account (default password <span className="font-semibold">1234</span>). Requires phone and email.
                </p>
                <button
                  type="button"
                  onClick={requestConvert}
                  disabled={converting || !lead}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <UserCheck size={16} />
                  Convert to Client
                </button>
                {lead && !isReadyToConvert(lead) ? (
                  <p className="mt-2 text-xs text-amber-600">
                    {!lead.phone?.trim()
                      ? "Phone missing — Convert will ask for it."
                      : "Valid email missing — Convert will ask for it."}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Right: follow-up log */}
          <div className="lg:col-span-2">
            <div className="rounded-3xl border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Follow-ups</h3>

              {lead ? (
                <form onSubmit={handleAddFollowUp} className="mt-3 space-y-3">
                  {/* Stage + file side by side; remark below (full width). */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {/* Stage badge (dropdown) — colored so the timeline flow is readable. */}
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Stage
                      </label>
                      <KeyboardSelect
                        ref={followUpBadgeRef}
                        value={isMatured ? "Won" : followUpBadge}
                        onChange={(value) => setFollowUpBadge(value)}
                        options={isMatured ? [{ value: "Won", label: "Matured" }] : leadStatusOptions(lead?.status)}
                        onConfirm={() => followUpFileRef.current?.focus()}
                        className={["font-semibold", leadStatusStyle(followUpBadge)].join(" ")}
                      />
                      <KeyboardHint id="hint-followup-stage" hint="Press ↓ or Enter to open · ↑↓ to move · Enter to select" />
                    </div>

                    {/* Optional attachment for this follow-up. */}
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Attachment <span className="font-normal normal-case text-slate-400">(optional)</span>
                      </label>
                      <input
                        ref={followUpFileRef}
                        type="file"
                        onChange={(e) => setFollowUpFile(e.target.files?.[0] || null)}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter") return;
                          event.preventDefault();
                          followUpNoteRef.current?.focus();
                        }}
                        className="peer block w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pl-3 text-sm text-slate-700 file:mr-3 file:rounded-xl file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
                      />
                      <KeyboardHint id="hint-followup-attachment" hint="Space to browse files · Enter to continue" />
                    </div>
                  </div>

                  {/* Remark (last, full width). */}
                  <div>
                    <textarea
                      ref={followUpNoteRef}
                      onKeyDown={focusNextOnEnter(followUpSubmitRef)}
                      value={followUpNote}
                      onChange={(e) => setFollowUpNote(e.target.value)}
                      placeholder="Add a follow-up note (call summary, next step, etc.)"
                      rows={3}
                      className="peer w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                    />
                    <KeyboardHint id="hint-followup-note" hint="Enter for next field · Shift+Enter for new line" />
                  </div>

                  <div className="flex justify-end">
                    <button
                      ref={followUpSubmitRef}
                      type="submit"
                      disabled={followUpSaving}
                      className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 focus:animate-pulse focus:outline-none focus:ring-4 focus:ring-emerald-300 disabled:opacity-60"
                    >
                      <MessageSquarePlus size={16} />
                      {followUpSaving ? "Adding..." : "Add Follow-up"}
                    </button>
                  </div>
                </form>
              ) : null}

              <div className="mt-5 space-y-3">
                {followUps.length === 0 ? (
                  <p className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                    No follow-ups yet.
                  </p>
                ) : (
                  followUps.map((item, index) => (
                    <div key={item._id || index} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      {editingFollowUpId === item._id ? (
                        <form onSubmit={handleSaveEditFollowUp} className="space-y-3">
                          <div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <KeyboardSelect
                                ref={editBadgeRef}
                                value={editBadge}
                                onChange={(value) => setEditBadge(value)}
                                options={isMatured ? [{ value: item.badge, label: leadStatusLabel(item.badge) }] : leadStatusOptions(item.badge)}
                                onConfirm={() => editNoteRef.current?.focus()}
                                className={["font-semibold", leadStatusStyle(editBadge)].join(" ")}
                              />
                            </div>
                            <KeyboardHint id="hint-editfollowup-stage" hint="Press ↓ or Enter to open · ↑↓ to move · Enter to select" />
                          </div>
                          <div>
                            <textarea
                              ref={editNoteRef}
                              onKeyDown={focusNextOnEnter(editSubmitRef)}
                              value={editNote}
                              onChange={(e) => setEditNote(e.target.value)}
                              rows={3}
                              className="peer w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                            />
                            <KeyboardHint id="hint-editfollowup-note" hint="Enter for next field · Shift+Enter for new line" />
                          </div>
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={cancelEditFollowUp}
                              disabled={editSaving}
                              className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                            >
                              <X size={14} />
                              Cancel
                            </button>
                            <button
                              ref={editSubmitRef}
                              type="submit"
                              disabled={editSaving}
                              className="inline-flex items-center gap-1.5 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 focus:animate-pulse focus:outline-none focus:ring-4 focus:ring-emerald-300 disabled:opacity-60"
                            >
                              {editSaving ? "Saving..." : "Save"}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              {item.badge ? (
                                <span
                                  className={[
                                    "inline-flex rounded-full border px-3 py-1 text-xs font-semibold",
                                    leadStatusStyle(item.badge),
                                  ].join(" ")}
                                >
                                  {leadStatusLabel(item.badge)}
                                </span>
                              ) : null}
                            </div>
                            {lead && !item.messageDraftId ? (
                              <button
                                type="button"
                                onClick={() => startEditFollowUp(item)}
                                className="inline-flex items-center gap-1 rounded-xl px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
                              >
                                <Pencil size={13} />
                                Edit
                              </button>
                            ) : null}
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{item.note}</p>
                          {item.attachment?.downloadLink ? (
                            <a
                              href={item.attachment.downloadLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                            >
                              <Download size={14} />
                              <span className="max-w-[200px] truncate">{item.attachment.name || "Attachment"}</span>
                            </a>
                          ) : null}
                          <p className="mt-2 text-xs text-slate-500">
                            {item.createdBy?.name ? `${item.createdBy.name} · ` : ""}
                            {formatDateTime(item.createdAt)}
                          </p>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </AdminWorkspaceShell>

      {showConvertConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl">
            <div className="px-6 pt-6">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                <UserCheck size={24} />
              </div>
              <h2 className="mt-4 text-center text-lg font-bold text-slate-900">Convert lead to client?</h2>
              <p className="mt-2 text-center text-sm text-slate-600">
                <span className="font-semibold text-slate-900">{lead?.name || "This lead"}</span> will get a new
                customer account with the default password <span className="font-semibold">1234</span>. The client
                can set their own password on first login.
              </p>
            </div>

            <div className="flex justify-center gap-3 px-6 py-6">
              <button
                type="button"
                onClick={closeConvertConfirm}
                disabled={converting}
                className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleConvert(false)}
                disabled={converting}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {converting ? <Loader2 size={16} className="animate-spin" /> : <UserCheck size={16} />}
                {converting ? "Converting..." : "Convert to Client"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showUpgradeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl">
            <div className="px-6 pt-6">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
                <UserCheck size={24} />
              </div>
              <h2 className="mt-4 text-center text-lg font-bold text-slate-900">Email already has a website account</h2>
              <p className="mt-2 text-center text-sm text-slate-600">
                <span className="font-semibold text-slate-900">{lead?.email}</span> already signed up on the website.
                Turn that account into this client's account? It keeps its website profile, and its password is reset to
                the default <span className="font-semibold">1234</span> — the client sets their own on first login.
              </p>
            </div>

            <div className="flex justify-center gap-3 px-6 py-6">
              <button
                type="button"
                onClick={closeConvertConfirm}
                disabled={converting}
                className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleConvert(true)}
                disabled={converting}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {converting ? <Loader2 size={16} className="animate-spin" /> : <UserCheck size={16} />}
                {converting ? "Converting..." : "Use This Account"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editLeadMode && lead ? (
        <EditLeadModal
          lead={lead}
          forConvert={editLeadMode === "convert"}
          onClose={() => setEditLeadMode(null)}
          onSaved={handleLeadSaved}
        />
      ) : null}
    </AdminLayout>
  );
};

export default AdminLeadDetailPage;
