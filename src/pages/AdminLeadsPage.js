import { emailApi, reviewEmail } from '../helpers/emailReview';
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowUpDown, Loader2, Plus, RefreshCw, Search, Trash2, UserPlus, X } from "lucide-react";
import SummaryApi from "../common";
import { logout } from "../store/userSlice";
import CookieManager from "../utils/cookieManager";
import StorageService from "../utils/storageService";
import { useOnlineStatus } from "../App";
import AdminLayout from "../components/AdminLayout";
import AdminWorkspaceShell, { AdminWorkspaceHeader } from "../components/admin/AdminWorkspaceShell";
import AdminWorkspaceList from "../components/admin/AdminWorkspaceList";
import AdminFilterDropdown from "../components/admin/AdminFilterDropdown";
import KeyboardSelect from "../components/KeyboardSelect";
import KeyboardHint from "../components/KeyboardHint";
import { adminReturnState } from "../helpers/adminReturnNavigation";
import leadSourceOptions from "../helpers/leadSourceOptions";
import { LEAD_STATUSES, PROPOSAL_SENT, leadStatusLabel, leadStatusStyle } from "../helpers/leadStatuses";
import ProposalSentBadge from "../components/admin/ProposalSentBadge";

const formatDate = (value) => {
  if (!value) return "N/A";
  return new Date(value).toLocaleDateString("en-IN");
};

const sortOptions = [
  { value: "lastUpdatedDesc", label: "Last Updated: Newest" },
  { value: "lastUpdatedAsc", label: "Last Updated: Oldest" },
  { value: "nameAsc", label: "Name: A-Z" },
  { value: "nameDesc", label: "Name: Z-A" },
];

const getLeadLastUpdated = (lead) => lead?.updatedAt || lead?.createdAt || null;

const emptyForm = { name: "", phone: "", email: "", source: "", notes: "", referredByUserId: "" };

const AdminLeadsPage = () => {
  const user = useSelector((state) => state?.user?.user);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isOnline } = useOnlineStatus();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("lastUpdatedDesc");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [proposalSentOnly, setProposalSentOnly] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [leadToDelete, setLeadToDelete] = useState(null);
  const [referenceQuery, setReferenceQuery] = useState("");
  const [referenceResults, setReferenceResults] = useState([]);
  const [referenceSearching, setReferenceSearching] = useState(false);
  const [selectedReference, setSelectedReference] = useState(null);
  const [referenceHighlightIndex, setReferenceHighlightIndex] = useState(-1);

  const nameFieldRef = useRef(null);
  const phoneFieldRef = useRef(null);
  const emailFieldRef = useRef(null);
  const sourceFieldRef = useRef(null);
  const referenceFieldRef = useRef(null);
  const notesFieldRef = useRef(null);
  const submitButtonRef = useRef(null);

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

  const fetchLeads = async () => {
    try {
      setLoading(true);
      const response = await fetch(SummaryApi.adminLeads.url, {
        method: SummaryApi.adminLeads.method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      const result = await response.json();
      if (!result.success) {
        toast.error(result.message || "Failed to load leads");
        return;
      }

      setLeads(result.data || []);
    } catch (error) {
      console.error("Error fetching leads:", error);
      toast.error("Error loading leads");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  // Lead detail is told where Back should return to instead of relying on history,
  // matching how the clients list opens the client workspace.
  const openLead = (lead) => {
    if (!lead?._id) return;
    navigate(`/admin-panel/leads/${lead._id}`, {
      state: adminReturnState("/admin-panel/leads"),
    });
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchLeads();
  };

  const openAddModal = () => {
    setForm(emptyForm);
    setShowAddModal(true);
  };

  const closeAddModal = () => {
    if (saving) return;
    setShowAddModal(false);
    setReferenceQuery("");
    setReferenceResults([]);
    setSelectedReference(null);
    setReferenceHighlightIndex(-1);
  };

  // Modal opens with focus already in the Name field so lead entry needs no mouse.
  useEffect(() => {
    if (showAddModal) {
      nameFieldRef.current?.focus();
    }
  }, [showAddModal]);

  useEffect(() => {
    if (!showAddModal) return undefined;
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        closeAddModal();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddModal, saving]);

  // Enter on a text field moves to the next field instead of submitting the form.
  const focusNextField = (nextRef) => (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    nextRef.current?.focus();
  };

  // Same idea for a textarea: plain Enter moves to the next field, Shift+Enter
  // keeps the browser's normal newline behavior.
  const focusNextOnEnter = (nextRef) => (event) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    nextRef.current?.focus();
  };

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === "source" && value !== "Reference") {
      setReferenceQuery("");
      setReferenceResults([]);
      setSelectedReference(null);
      setForm((prev) => ({ ...prev, referredByUserId: "" }));
    }
  };

  const pickReference = (customer) => {
    setSelectedReference(customer);
    setForm((prev) => ({ ...prev, referredByUserId: customer._id }));
    setReferenceResults([]);
    setReferenceQuery("");
    setReferenceHighlightIndex(-1);
    notesFieldRef.current?.focus();
  };

  const handleReferenceKeyDown = (event) => {
    if (referenceResults.length === 0) {
      if (event.key === "Enter") {
        // No match picked — Enter just moves on, name stays as free-text notes context.
        event.preventDefault();
        notesFieldRef.current?.focus();
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setReferenceHighlightIndex((prev) => Math.min(prev + 1, referenceResults.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setReferenceHighlightIndex((prev) => Math.max(prev - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const index = referenceHighlightIndex >= 0 ? referenceHighlightIndex : 0;
      pickReference(referenceResults[index]);
    }
  };

  // After Source, the chain branches: Reference search field when source is
  // "Reference", otherwise straight to Notes.
  const focusAfterSource = () => {
    if (form.source === "Reference") {
      referenceFieldRef.current?.focus();
    } else {
      notesFieldRef.current?.focus();
    }
  };

  const clearReference = () => {
    setSelectedReference(null);
    setForm((prev) => ({ ...prev, referredByUserId: "" }));
  };

  useEffect(() => {
    if (form.source !== "Reference" || selectedReference || !referenceQuery.trim()) {
      setReferenceResults([]);
      return;
    }

    const handle = setTimeout(async () => {
      try {
        setReferenceSearching(true);
        const response = await fetch(
          `${SummaryApi.searchCustomers.url}?q=${encodeURIComponent(referenceQuery.trim())}`,
          {
            method: SummaryApi.searchCustomers.method,
            credentials: "include",
          }
        );
        const result = await response.json();
        setReferenceResults(result.success ? result.data : []);
      } catch (error) {
        console.error("Error searching customers:", error);
        setReferenceResults([]);
      } finally {
        setReferenceSearching(false);
      }
    }, 350);

    return () => clearTimeout(handle);
  }, [referenceQuery, form.source, selectedReference]);

  const handleCreateLead = async (event) => {
    event.preventDefault();

    if (!form.name.trim()) {
      toast.error("Please provide lead name");
      return;
    }
    if (!form.phone.trim()) {
      toast.error("Please provide a phone number");
      return;
    }

    try {
      setSaving(true);
      let emailReview = { choice: 'skip' };
      if (form.email.trim()) {
        const preview = await emailApi('/lead-preview', { method: 'POST', body: JSON.stringify({ name: form.name.trim(), email: form.email.trim() }) });
        if (preview) emailReview = await reviewEmail(preview, 'Choose whether to email this new lead. The lead will be added with either choice; mail sends only if saving succeeds.');
      }
      const response = await fetch(SummaryApi.createLead.url, {
        method: SummaryApi.createLead.method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, emailReview }),
      });

      const result = await response.json();
      if (!result.success) {
        toast.error(result.message || "Failed to create lead");
        return;
      }

      toast.success("Lead created successfully");
      if (result.emailStatus === 'sent') toast.success('Welcome email sent');
      if (['failed', 'unavailable'].includes(result.emailStatus)) toast.error('Lead saved. Email was not confirmed as sent; check Email Control.');
      setShowAddModal(false);
      setReferenceQuery("");
      setReferenceResults([]);
      setSelectedReference(null);
      await fetchLeads();
    } catch (error) {
      console.error("Error creating lead:", error);
      toast.error("Error creating lead");
    } finally {
      setSaving(false);
    }
  };

  const requestDeleteLead = (lead) => {
    if (deletingId) return;
    if (lead.convertedToUserId) {
      toast.error("Converted leads cannot be deleted");
      return;
    }
    setLeadToDelete(lead);
  };

  const closeDeleteModal = () => {
    if (deletingId) return;
    setLeadToDelete(null);
  };

  const confirmDeleteLead = async () => {
    const lead = leadToDelete;
    if (!lead || deletingId) return;

    try {
      setDeletingId(lead._id);
      const response = await fetch(`${SummaryApi.deleteLead.url}/${lead._id}`, {
        method: SummaryApi.deleteLead.method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const result = await response.json();
      if (!result.success) {
        toast.error(result.message || "Failed to delete lead");
        return;
      }
      toast.success("Lead moved to Trash");
      setLeadToDelete(null);
      await fetchLeads();
    } catch (error) {
      console.error("Error deleting lead:", error);
      toast.error("Error deleting lead");
    } finally {
      setDeletingId(null);
    }
  };

  const displayedLeads = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    let result = leads;

    if (sourceFilter === "guest") {
      result = result.filter((lead) => lead.source === "guest");
    } else if (sourceFilter === "normal") {
      result = result.filter((lead) => lead.source !== "guest");
    }

    if (statusFilter !== "all") {
      result = result.filter((lead) => lead.status === statusFilter);
    }

    if (proposalSentOnly) {
      result = result.filter((lead) => lead.proposalSentAt);
    }

    if (query) {
      result = result.filter((lead) => {
        return (
          lead.name?.toLowerCase().includes(query) ||
          lead.email?.toLowerCase().includes(query) ||
          lead.phone?.toLowerCase().includes(query)
        );
      });
    }

    result = [...result].sort((left, right) => {
      const leftName = (left.name || "").toLowerCase();
      const rightName = (right.name || "").toLowerCase();
      const leftUpdated = new Date(getLeadLastUpdated(left) || 0).getTime();
      const rightUpdated = new Date(getLeadLastUpdated(right) || 0).getTime();

      switch (sortBy) {
        case "lastUpdatedAsc":
          return leftUpdated - rightUpdated || leftName.localeCompare(rightName, "en", { sensitivity: "base" });
        case "nameAsc":
          return leftName.localeCompare(rightName, "en", { sensitivity: "base" });
        case "nameDesc":
          return rightName.localeCompare(leftName, "en", { sensitivity: "base" });
        case "lastUpdatedDesc":
        default:
          return rightUpdated - leftUpdated || leftName.localeCompare(rightName, "en", { sensitivity: "base" });
      }
    });

    return result;
  }, [leads, proposalSentOnly, searchTerm, sortBy, sourceFilter, statusFilter]);

  const sourceFilterOptions = [
    { value: "all", label: "All" },
    { value: "normal", label: "Normal" },
    { value: "guest", label: "Guest" },
  ];

  const statusFilterOptions = [
    { value: "all", label: "All" },
    ...LEAD_STATUSES.map((status) => ({ value: status, label: leadStatusLabel(status) })),
  ];

  return (
    <AdminLayout
      user={user}
      onLogout={handleLogout}
    >
      <AdminWorkspaceShell>
        <AdminWorkspaceHeader
          icon={UserPlus}
          title="Leads"
          subtitle="Prospects before they become customers. Manually added here; converted to clients later."
          actions={
            <div className="flex w-full flex-col gap-3 sm:flex-row lg:min-w-[28rem] lg:justify-end">
              <AdminFilterDropdown
                icon={ArrowUpDown}
                label="Sort"
                value={sortBy}
                options={sortOptions}
                onChange={setSortBy}
                ariaLabel="Sort leads"
              />

              <button
                type="button"
                onClick={handleRefresh}
                disabled={loading || refreshing}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
                Refresh
              </button>

              <button
                type="button"
                onClick={openAddModal}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-400/40 bg-emerald-500/20 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500/30"
              >
                <Plus size={16} />
                Add Lead
              </button>
            </div>
          }
        />

        <div className="border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div className="relative w-full">
            <Search className="absolute left-3 top-3 text-slate-400" size={18} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search leads by name, email, or phone"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {sourceFilterOptions.map((option) => {
              const isActive = sourceFilter === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSourceFilter(option.value)}
                  className={[
                    "rounded-full px-4 py-1.5 text-xs font-semibold transition",
                    isActive
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                  ].join(" ")}
                >
                  {option.label}
                </button>
              );
            })}

            <span className="mx-1 w-px self-stretch bg-slate-200" aria-hidden="true" />

            {statusFilterOptions.map((option) => {
              const isActive = statusFilter === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setStatusFilter(option.value)}
                  className={[
                    "rounded-full px-4 py-1.5 text-xs font-semibold transition",
                    isActive
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                  ].join(" ")}
                >
                  {option.label}
                </button>
              );
            })}

            <span className="mx-1 w-px self-stretch bg-slate-200" aria-hidden="true" />

            <button
              type="button"
              aria-pressed={proposalSentOnly}
              onClick={() => setProposalSentOnly((current) => !current)}
              className={[
                "rounded-full px-4 py-1.5 text-xs font-semibold transition",
                proposalSentOnly
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200",
              ].join(" ")}
            >
              {PROPOSAL_SENT}
            </button>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <AdminWorkspaceList
            columns={[
              { label: "Lead", className: "col-span-12 lg:col-span-3" },
              { label: "Contact", className: "col-span-6 lg:col-span-3" },
              { label: "Status", className: "col-span-6 lg:col-span-2" },
              { label: "Source", className: "col-span-6 lg:col-span-1" },
              { label: "Added", className: "col-span-6 lg:col-span-1" },
              { label: "Action", className: "col-span-6 text-right lg:col-span-2" },
            ]}
            loading={loading}
            emptyText="No leads yet. Use Add Lead to create one."
            items={displayedLeads}
            footer={`Showing ${displayedLeads.length} of ${leads.length} leads`}
            renderRow={(lead, index) => (
              <div
                key={lead._id}
                role="button"
                tabIndex={0}
                onClick={() => openLead(lead)}
                onKeyDown={(e) => {
                  // Only act on keys pressed on the row itself — a keydown on the row's own
                  // Delete button bubbles up here, and preventDefault() on it would cancel the
                  // browser's native click, so the button's action never ran.
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openLead(lead);
                  } else if (e.key === "Delete" && !lead.convertedToUserId) {
                    e.preventDefault();
                    requestDeleteLead(lead);
                  }
                }}
                className={[
                  "group grid w-full cursor-pointer grid-cols-12 gap-3 px-5 py-4 text-left transition outline-none hover:bg-slate-100 focus:bg-slate-100 sm:px-6",
                  index % 2 === 0 ? "bg-white" : "bg-slate-50",
                ].join(" ")}
              >
                <div className="col-span-12 lg:col-span-3">
                  <p className="truncate text-base font-bold text-slate-950">{index + 1}. {lead.name || "N/A"}</p>
                </div>
                <div className="col-span-6 lg:col-span-3 lg:flex lg:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{lead.email || "N/A"}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{lead.phone || "N/A"}</p>
                  </div>
                </div>
                <div className="col-span-6 flex flex-wrap items-center gap-1.5 lg:col-span-2">
                  <span className={["inline-flex rounded-full px-3 py-1 text-xs font-semibold", leadStatusStyle(lead.status)].join(" ")}>
                    {leadStatusLabel(lead.status)}
                  </span>
                  {lead.proposalSentAt ? <ProposalSentBadge /> : null}
                </div>
                <div className="col-span-6 lg:col-span-1 lg:flex lg:items-center">
                  {lead.source === "guest" ? (
                    <span className="inline-flex rounded-full bg-purple-100 px-2.5 py-1 text-xs font-semibold text-purple-700">
                      Guest
                    </span>
                  ) : (
                    <p className="truncate text-sm text-slate-700">{lead.source || "—"}</p>
                  )}
                </div>
                <div className="col-span-6 lg:col-span-1 lg:flex lg:items-center">
                  <p className="text-sm font-semibold text-slate-900">{formatDate(lead.createdAt)}</p>
                </div>

                {/* Action column — Delete button (hard red, appears on row hover; hidden for converted leads). */}
                <div className="col-span-6 flex items-center justify-end lg:col-span-2">
                  {!lead.convertedToUserId ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        requestDeleteLead(lead);
                      }}
                      disabled={deletingId === lead._id}
                      aria-label={`Delete lead ${lead.name || ""}`}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white opacity-0 transition hover:bg-red-700 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-300 group-hover:opacity-100 group-focus:opacity-100 disabled:cursor-not-allowed disabled:opacity-100"
                    >
                      {deletingId === lead._id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>
            )}
          />
        </div>
      </AdminWorkspaceShell>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-bold text-slate-900">Add Lead</h2>
              <button
                type="button"
                onClick={closeAddModal}
                className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateLead} className="space-y-4 px-6 py-5">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Name<span className="text-red-500"> *</span></label>
                <input
                  ref={nameFieldRef}
                  type="text"
                  value={form.name}
                  onChange={(e) => handleFormChange("name", e.target.value)}
                  onKeyDown={focusNextField(phoneFieldRef)}
                  placeholder="Lead full name"
                  className="peer w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                />
                <KeyboardHint id="hint-lead-name" hint="Press Enter to go to next field" />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">Phone<span className="text-red-500"> *</span></label>
                  <input
                    ref={phoneFieldRef}
                    type="text"
                    value={form.phone}
                    onChange={(e) => handleFormChange("phone", e.target.value)}
                    onKeyDown={focusNextField(emailFieldRef)}
                    placeholder="Phone number"
                    className="peer w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                  />
                  <KeyboardHint id="hint-lead-phone" hint="Press Enter to go to next field" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">Email</label>
                  <input
                    ref={emailFieldRef}
                    type="email"
                    value={form.email}
                    onChange={(e) => handleFormChange("email", e.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      sourceFieldRef.current?.focus();
                    }}
                    placeholder="Email address"
                    className="peer w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                  />
                  <KeyboardHint id="hint-lead-email" hint="Press Enter to go to next field" />
                </div>
              </div>

              <p className="text-xs text-slate-500">Phone is required. Email is needed later to convert this lead into a client.</p>

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Source</label>
                <KeyboardSelect
                  ref={sourceFieldRef}
                  value={form.source}
                  onChange={(value) => handleFormChange("source", value)}
                  options={leadSourceOptions.map((option) => ({ value: option, label: option }))}
                  placeholder="Select source"
                  onConfirm={focusAfterSource}
                />
                <KeyboardHint id="hint-lead-source" hint="Press ↓ or Enter to open · ↑↓ to move · Enter to select" />
              </div>

              {form.source === "Reference" && (
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">Referred By</label>
                  {selectedReference ? (
                    <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-emerald-800">{selectedReference.name}</p>
                        <p className="text-xs text-emerald-700">{selectedReference.phone || selectedReference.email}</p>
                      </div>
                      <button
                        type="button"
                        onClick={clearReference}
                        className="rounded-full p-1 text-emerald-700 transition hover:bg-emerald-100"
                        aria-label="Remove reference"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        ref={referenceFieldRef}
                        type="text"
                        value={referenceQuery}
                        onChange={(e) => {
                          setReferenceQuery(e.target.value);
                          setReferenceHighlightIndex(-1);
                        }}
                        onKeyDown={handleReferenceKeyDown}
                        placeholder="Search existing customer by name, phone or email"
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                      />
                      {referenceSearching && (
                        <p className="mt-1 text-xs text-slate-500">Searching...</p>
                      )}
                      {referenceResults.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
                          {referenceResults.map((customer, index) => (
                            <button
                              key={customer._id}
                              type="button"
                              onClick={() => pickReference(customer)}
                              onMouseEnter={() => setReferenceHighlightIndex(index)}
                              className={`flex w-full flex-col px-4 py-2 text-left text-sm ${
                                index === referenceHighlightIndex ? "bg-emerald-50" : "hover:bg-slate-50"
                              }`}
                            >
                              <span className="font-medium text-slate-800">{customer.name}</span>
                              <span className="text-xs text-slate-500">{customer.phone || customer.email}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <p className="mt-1 text-xs text-slate-500">
                        No match? The name you type in Notes will be saved as plain text instead.
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Notes</label>
                <textarea
                  ref={notesFieldRef}
                  value={form.notes}
                  onChange={(e) => handleFormChange("notes", e.target.value)}
                  onKeyDown={focusNextOnEnter(submitButtonRef)}
                  placeholder="Any context about this lead"
                  rows={3}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  ref={submitButtonRef}
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 focus:animate-pulse focus:outline-none focus:ring-4 focus:ring-emerald-300 disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Create Lead"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {leadToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl">
            <div className="px-6 pt-6">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-600">
                <Trash2 size={24} />
              </div>
              <h2 className="mt-4 text-center text-lg font-bold text-slate-900">Move lead to Trash?</h2>
              <p className="mt-2 text-center text-sm text-slate-600">
                <span className="font-semibold text-slate-900">{leadToDelete.name || "This lead"}</span> will be moved to
                Trash and hidden from your leads. You can restore it within 30 days before it is permanently deleted.
              </p>
            </div>

            <div className="flex justify-center gap-3 px-6 py-6">
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={Boolean(deletingId)}
                className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteLead}
                disabled={Boolean(deletingId)}
                className="inline-flex items-center gap-2 rounded-2xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingId ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                {deletingId ? "Moving..." : "Move to Trash"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default AdminLeadsPage;
