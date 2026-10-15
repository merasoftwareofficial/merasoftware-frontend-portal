import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "sonner";
import {
  ArrowLeft,
  BadgeCheck,
  Clock3,
  FileText,
  Grid2x2,
  Inbox,
  Layers3,
  Loader2,
  ShieldCheck,
  Wallet,
  AlertCircle,
  Eye,
  EyeOff,
  Pencil,
  RotateCcw,
  Save,
  Trash2,
  Undo2,
  X,
  Copy,
  KeyRound,
  ShieldAlert,
  Upload,
  Download,
  Send,
  Share2,
  Ban,
} from "lucide-react";
import SummaryApi from "../common";
import displayINRCurrency from "../helpers/displayCurrency";
import projectCategoryOptions, { isFeatureForCategory } from "../helpers/projectCategoryOptions";
import { downloadAuthenticatedFile } from "../helpers/downloadFile";
import { logout } from "../store/userSlice";
import CookieManager from "../utils/cookieManager";
import StorageService from "../utils/storageService";
import { useOnlineStatus } from "../App";
import AdminLayout from "../components/AdminLayout";
import AdminInfoPill from "../components/admin/AdminInfoPill";
import AdminWorkspaceList from "../components/admin/AdminWorkspaceList";
import AdminWorkspaceShell, { AdminWorkspaceHeader } from "../components/admin/AdminWorkspaceShell";
import AdminWorkspaceTabs from "../components/admin/AdminWorkspaceTabs";
import AdminProjectCheckpointDetail from "../components/admin/AdminProjectCheckpointDetail";
import PortfolioSourceSettings from "../components/admin/PortfolioSourceSettings";
import ClientSubmissionsPanel from "../components/admin/ClientSubmissionsPanel";
import {
  formatCurrency,
  getLedgerStatusLabel,
  buildLedgerItems,
  groupLedgerItemsByProject,
} from "../helpers/paymentLedger";
import { adminReturnState, getAdminReturnTarget, goToAdminReturn } from "../helpers/adminReturnNavigation";
import focusFirstInteractiveElement, { getInteractiveElements } from "../utils/focusFirstInteractiveElement";
import { getOrderDisplayName } from "../helpers/orderPresentation";
import { getPaymentMethodText } from "../helpers/invoicePresentation";

const CANCEL_REFUND_MODE_OPTIONS = [
  { key: "source", label: "To source", hint: "Same proportion it was paid" },
  { key: "wallet_first", label: "Wallet first", hint: "Fill the wallet, then the rest" },
  { key: "manual", label: "Manual", hint: "Set each method yourself" },
];

const OVERVIEW_TAB = { id: "overview", label: "Overview", active: true };
const PROJECTS_TAB = { id: "projects", label: "Projects", active: true };
const PLANS_TAB = { id: "plans", label: "Plans", active: true };
const PAYMENTS_TAB = { id: "payments", label: "Payments", active: true };
const DELETED_PROJECTS_TAB = { id: "deleted-projects", label: "Deleted Projects", active: true };
const DOCUMENTS_TAB = { id: "documents", label: "Documents", active: true };
const UPLOAD_LINKS_TAB = { id: "upload-links", label: "Upload Links", active: true };
const ACCESS_TAB = { id: "access", label: "Account & Access", active: true };

// Fixed tab order (user-confirmed) — same for every client, no longer derived from whether the
// client currently has an active project/plan.
const WORKSPACE_TABS = [PROJECTS_TAB, PLANS_TAB, PAYMENTS_TAB, DELETED_PROJECTS_TAB, DOCUMENTS_TAB, UPLOAD_LINKS_TAB, ACCESS_TAB, OVERVIEW_TAB];

const safeDateTime = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (value) => {
  const parsed = safeDateTime(value);
  return parsed ? parsed.toLocaleDateString("en-IN") : "N/A";
};

const formatDateTime = (value) => {
  const parsed = safeDateTime(value);
  if (!parsed) return "N/A";
  return parsed.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const isWebsiteUpdateOrder = (order) =>
  Boolean(order?.productId?.isWebsiteUpdate || order?.productId?.category?.toLowerCase() === "website_updates");

const getWorkspaceItemName = (item) =>
  item?.projectSnapshot?.displayName || item?.productId?.serviceName || "N/A";

const getProjectCategory = (order) =>
  order?.projectSnapshot?.category || order?.productId?.category;

// Bucketing for the count tiles and the row sort order. These group by the engine's stable
// `code`, never by the displayed wording, so a label change cannot silently empty a bucket.
//
// The previous versions read order.status directly, including the values "rejected" /
// "cancelled" / "canceled" that are not in the status enum and therefore never matched — which
// is why a cancelled project counted as active and sorted with live work.
const stateCode = (order) => order?.orderState?.code;

const isCompletedOrder = (order) => {
  const code = stateCode(order);
  if (code) return code === "completed" || code === "plan_closed";
  // ── fallback: payloads that predate the engine ──
  return (order?.projectProgress || 0) >= 100 || order?.currentPhase === "completed";
};

const isRejectedOrder = (order) => {
  const code = stateCode(order);
  if (code) return code === "rejected" || code === "cancelled";
  // ── fallback ──
  return order?.orderVisibility === "payment-rejected" || order?.orderVisibility === "cancelled";
};

const isPendingOrder = (order) => {
  const code = stateCode(order);
  if (code) return code === "pending_approval" || code === "processing";
  // ── fallback ──
  return order?.orderVisibility === "pending-approval";
};

const isActiveOrder = (order) =>
  !isPendingOrder(order) && !isRejectedOrder(order) && !isCompletedOrder(order);

// Pending-approval ranks WITH active (both 0) so a brand-new project — which starts life as
// pending-approval — sorts by its own newest-first date instead of always dropping below active
// projects. Completed/rejected still rank below everything (they're finished/closed work), so
// they stay at the bottom regardless of how recently they were touched.
const getProjectSortRank = (order) => {
  if (isCompletedOrder(order)) return 2;
  if (isRejectedOrder(order)) return 1;
  return 0;
};

const getPlanSortRank = (plan) => {
  if (getPlanDisplayStatus(plan) === "Completed") return 3;
  if (getPlanDisplayStatus(plan) === "Expired" || getPlanDisplayStatus(plan) === "Inactive") return 2;
  return 0;
};

const sortWorkspaceItem = (a, b, getRank) => {
  const rankDiff = getRank(a) - getRank(b);
  if (rankDiff !== 0) return rankDiff;
  return (safeDateTime(b?.updatedAt || b?.createdAt)?.getTime() || 0) - (safeDateTime(a?.updatedAt || a?.createdAt)?.getTime() || 0);
};

// Display label for a project row. Derived by backend/helpers/orderStatusEngine.js and delivered
// on the order as `orderState`, so the admin and the customer can no longer be shown different
// answers for the same order.
//
// What this replaces, and why it was wrong: the previous version tested
// order.status === "rejected" / "cancelled" / "canceled". None of those values is in
// orderProductModel's status enum (['pending','in_progress','completed']), so that branch could
// never match. cancelProjectOrder.js writes orderVisibility only and leaves status at
// 'in_progress' — so a cancelled project fell through every branch and displayed "In Progress"
// to the admin while the customer correctly saw "Cancelled". That is the reported bug.
const getProjectDisplayStatus = (order) => {
  if (order?.orderState?.label) return order.orderState.label;

  // ── fallback: payloads that predate the engine ──
  if (order?.orderVisibility === "cancelled") return "Cancelled";
  if (order?.orderVisibility === "pending-approval") return "Processing";
  if (order?.orderVisibility === "payment-rejected") return "Rejected";
  if ((order?.projectProgress || 0) >= 100 || order?.currentPhase === "completed") return "Completed";
  return "In Progress";
};

// The build phase for a project row. Derived, not read from order.currentPhase: the stored column
// only ever moves to 'completed' (at 100%) or back to 'development' when a finished project drops
// below 100 — ordinary forward progress never advances it, so every running project displayed
// "planning" no matter how far along it was.
const getProjectPhaseLabel = (order) => {
  if (order?.orderState?.phaseLabel) return order.orderState.phaseLabel;
  return getPhaseLabel(order?.currentPhase);
};

const getPlanTypeLabel = (plan) => {
  if (plan?.productId?.isMonthlyRenewablePlan) return "Monthly Renewable Plan";
  if (plan?.productId?.isMonthlyLimitedPlan) return "Monthly Limited Plan";
  if (plan?.productId?.isUnlimitedUpdates) return "Unlimited Update Plan";
  return "Website Update Plan";
};

// Display label for a plan/service row — same engine, same reason as getProjectDisplayStatus.
//
// The previous version also tested plan.status against values absent from the status enum, and
// never read servicePlanStatus at all — so a paused service read "Active" and an active service
// whose isActive flag was stale read "Inactive".
const getPlanDisplayStatus = (plan) => {
  if (plan?.orderState?.label) return plan.orderState.label;

  // ── fallback: payloads that predate the engine ──
  const expiryDate = safeDateTime(plan?.currentMonthExpiryDate);
  const expired = plan?.autoRenewalStatus === "expired" || Boolean(expiryDate && expiryDate.getTime() < Date.now());

  if (plan?.orderVisibility === "cancelled") return "Cancelled";
  if (plan?.isActive === false) return "Inactive";
  if (expired) return "Expired";
  return "Active";
};

const getBadgeClassName = (label) => {
  switch ((label || "").toLowerCase()) {
    case "active":
      return "bg-emerald-100 text-emerald-800";
    case "paid":
    case "verified":
      return "bg-emerald-100 text-emerald-800";
    case "unpaid":
      return "bg-amber-100 text-amber-800";
    case "overdue":
      return "bg-rose-100 text-rose-800";
    case "inactive":
      return "bg-slate-100 text-slate-700";
    case "expired":
      return "bg-rose-100 text-rose-800";
    case "processing":
    case "pending":
      return "bg-amber-100 text-amber-800";
    case "in progress":
      return "bg-blue-100 text-blue-800";
    case "completed":
      return "bg-emerald-100 text-emerald-800";
    case "rejected":
    case "failed":
      return "bg-rose-100 text-rose-800";
    case "cancelled":
    case "canceled":
      return "bg-slate-100 text-slate-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
};

const toComparableId = (value) => {
  if (!value) return null;
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
};

const isSameId = (value, targetId) => {
  const comparable = toComparableId(value);
  return Boolean(comparable && targetId && comparable === String(targetId));
};

const getNodeStatusLabel = (node) => {
  if (node?.status === "deleted") return "Deleted";
  if (node?.status === "archived") return "Archived";
  return "Active";
};

const getNodeSelectionKey = (node) => node?.nodeId;

const getNodeBadgeClass = (node) => {
  const label = getNodeStatusLabel(node).toLowerCase();
  if (label === "active") return "bg-emerald-100 text-emerald-800";
  if (label === "deleted") return "bg-rose-100 text-rose-700";
  return "bg-slate-100 text-slate-700";
};

const AdminClientWorkspace = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { customerId } = useParams();
  const dispatch = useDispatch();
  const user = useSelector((state) => state?.user?.user);
  const { isOnline } = useOnlineStatus();
  const [searchParams, setSearchParams] = useSearchParams();

  // Which tab is open, and which project/plan/payment-group subpage is open inside it, is
  // NAVIGATION state, so it lives in the URL — not in useState. Storing it in component state
  // meant the browser had a single history entry for the whole page, so Alt+Left (which is the
  // browser's own gesture, not ours to intercept) left the workspace entirely instead of closing
  // the open subpage. Opening a subpage now pushes a history entry, so Back steps one layer.
  // Refresh and shareable links come free from the same change.
  const activeTab = searchParams.get("tab") || null;
  const activeProjectId = searchParams.get("project") || null;
  const activePlanId = searchParams.get("plan") || null;
  const activePaymentGroupId = searchParams.get("group") || null;

  // Single writer for every param above. The four subpage layers reset each other, so this
  // always writes the complete set and drops what the caller omitted — a partial merge would
  // let a stale `project` survive into the plans tab. `location.state` must be carried forward
  // by hand: setSearchParams drops it, and it holds both the preloaded client and the
  // adminReturnState that handleBack reads to find the parent that opened this workspace.
  const setWorkspaceParams = (next, { replace = false } = {}) => {
    const params = new URLSearchParams();
    if (next.tab) params.set("tab", next.tab);
    if (next.project) params.set("project", next.project);
    if (next.plan) params.set("plan", next.plan);
    if (next.group) params.set("group", next.group);
    setSearchParams(params, { replace, state: location.state });
  };

  // Closing a layer with the header's Back button must be the SAME operation as Alt+Left —
  // a real history step — or Back and Forward stop being symmetric. Writing a "closed" URL
  // instead looks identical on screen but appends a third entry: Alt+Right then has nowhere
  // to go, and Alt+Left reopens the project that was just closed. Only history.back() leaves
  // a forward entry behind, which is exactly what Alt+Right needs.
  //
  // Guarded, because stepping back is only correct when there IS an entry behind us. On a
  // direct load or refresh of a subpage URL there is none, and navigate(-1) would leave the
  // app entirely — that case drops the param instead.
  //
  // The guard reads React Router's own history index rather than counting pushes ourselves.
  // A counter drifts: the user pressing Alt+Left closes a subpage without going through any
  // handler, so our count would say one entry is behind us when none is. The router maintains
  // window.history.state.idx for every entry (initialising it to 0 on a fresh load), so it
  // stays correct no matter which gesture moved us.
  const canStepBackInHistory = () => {
    const index = window.history.state?.idx;
    return typeof index === "number" ? index > 0 : false;
  };

  const stepBackOrReplace = (tab) => {
    if (canStepBackInHistory()) {
      navigate(-1);
      return;
    }
    setWorkspaceParams({ tab }, { replace: true });
  };
  const [customerLoading, setCustomerLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [customer, setCustomer] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteScan, setDeleteScan] = useState(null);
  const [deleteScanLoading, setDeleteScanLoading] = useState(false);
  const [deleteSelections, setDeleteSelections] = useState({});
  const [deleteError, setDeleteError] = useState("");
  const [deletingOrderId, setDeletingOrderId] = useState(null);
  const deleteCheckboxRefs = useRef([]);
  const deleteSubmitButtonRef = useRef(null);
  const deleteHasAutoFocused = useRef(false);
  const deletePendingAdvanceIndex = useRef(null);
  // Cancellation flow — mirrors the delete flow above: a target, a read-only preview fetched
  // when the modal opens, and per-method reference ids the admin fills in before confirming.
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelPreview, setCancelPreview] = useState(null);
  const [cancelPreviewLoading, setCancelPreviewLoading] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelReferenceIds, setCancelReferenceIds] = useState({});
  // The refund figure the admin will actually give — seeded from the system's suggestion
  // when the preview loads, then editable.
  const [cancelRefundAmount, setCancelRefundAmount] = useState("");
  // How the refund divides across payment methods: source (default) / wallet_first / manual.
  const [cancelRefundMode, setCancelRefundMode] = useState("source");
  const [cancelManualLegs, setCancelManualLegs] = useState({});
  const [cancelRefundReason, setCancelRefundReason] = useState("");
  // Linked services the admin chose to cancel with the project, and each one's reference ids.
  const [cancelServiceIds, setCancelServiceIds] = useState([]);
  const [cancelServiceRefs, setCancelServiceRefs] = useState({});
  const [cancelError, setCancelError] = useState("");
  const [cancellingOrderId, setCancellingOrderId] = useState(null);
  const cancelAmountFieldRef = useRef(null);
  const cancelModeButtonRefs = useRef([]);
  const cancelLegRefs = useRef([]);
  const cancelManualLegRefs = useRef([]);
  const cancelRefundReasonFieldRef = useRef(null);
  const cancelServiceCheckboxRefs = useRef([]);
  const cancelServiceRefInputRefs = useRef({});
  const cancelReasonTextareaRef = useRef(null);
  const cancelSubmitButtonRef = useRef(null);
  const cancelHasAutoFocused = useRef(false);
  const cancelPendingServiceAdvanceIndex = useRef(null);
  const [showCreateProjectForm, setShowCreateProjectForm] = useState(false);
  const [workspaceRefreshKey, setWorkspaceRefreshKey] = useState(0);
  const [activeProject, setActiveProject] = useState(null);
  const [activeProjectLoading, setActiveProjectLoading] = useState(false);
  const [activeProjectError, setActiveProjectError] = useState("");
  const [activeProjectRefreshKey, setActiveProjectRefreshKey] = useState(0);
  const [selectedProjectCheckpointId, setSelectedProjectCheckpointId] = useState(null);
  const [activePlan, setActivePlan] = useState(null);
  const [activePlanLoading, setActivePlanLoading] = useState(false);
  const [activePlanError, setActivePlanError] = useState("");
  // Account & Access section state
  const [accessData, setAccessData] = useState(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [resetting, setResetting] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [showTrashConfirm, setShowTrashConfirm] = useState(false);
  const [trashing, setTrashing] = useState(false);
  // Documents section state (admin-sent documents timeline for this client)
  // Uploaded data for whichever project/plan subpage is open, from the shared
  // GET /api/orders/:orderId/uploads. Keyed by nothing — only one record is open at a
  // time, and switching records refetches.
  const [submissions, setSubmissions] = useState([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [submissionsError, setSubmissionsError] = useState("");
  const [documentsList, setDocumentsList] = useState(null);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState("");
  const [documentUploading, setDocumentUploading] = useState(false);
  const [uploadLinks, setUploadLinks] = useState(null);
  const [uploadLinksLoading, setUploadLinksLoading] = useState(false);
  const [uploadLinksLoadingMore, setUploadLinksLoadingMore] = useState(false);
  const [uploadLinksCursor, setUploadLinksCursor] = useState(null);
  const [uploadLinksError, setUploadLinksError] = useState("");
  const [selectedUploadLinkOrderId, setSelectedUploadLinkOrderId] = useState("");
  const [uploadLinkMode, setUploadLinkMode] = useState("single");
  const [generatedUploadLink, setGeneratedUploadLink] = useState("");
  const [uploadLinkGenerating, setUploadLinkGenerating] = useState(false);
  const [uploadLinkRevokingId, setUploadLinkRevokingId] = useState("");
  const [allData, setAllData] = useState({
    orders: [],
    renewals: [],
    transactions: [],
    invoices: [],
    updates: [],
    plans: [],
    summary: null,
  });

  // Memoised on the id, not the object. The browser structured-clones history state on
  // every navigation, so `location.state.client` is a NEW object each time even when the
  // client is identical — and this value is a dependency of the workspace load effect,
  // which would then refetch the whole workspace on every Back/Forward.
  const fallbackClientId = location.state?.client?._id ?? null;
  const fallbackClient = useMemo(
    () => location.state?.client ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fallbackClientId],
  );
  const client = customer || fallbackClient;
  const clientName = client?.name || "Client";
  const clientEmail = client?.email || "No email available";
  const clientStatus = client?.status || "Active";
  const createdAt = formatDate(client?.createdAt);
  const lastUpdatedAt = formatDateTime(client?.updatedAt || client?.lastUpdated || client?.createdAt);

  const resetDeleteFlow = () => {
    setDeleteTarget(null);
    setDeleteScan(null);
    setDeleteScanLoading(false);
    setDeleteSelections({});
    setDeleteError("");
  };

  const handleRequestDelete = async (item) => {
    if (!item?._id) return;

    setDeleteTarget(item);
    setDeleteScan(null);
    setDeleteSelections({});
    setDeleteError("");
    setDeleteScanLoading(true);

    try {
      const response = await fetch(`${SummaryApi.adminDeleteOrderScan.url}/${item._id}/scan`, {
        method: SummaryApi.adminDeleteOrderScan.method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || "Failed to scan project delete plan");
      }

      const scan = result.data || null;
      setDeleteScan(scan);

      const initialSelections = {};
      (scan?.sections || []).forEach((section) => {
        if (section.present) {
          initialSelections[section.key] = false;
        }
      });
      setDeleteSelections(initialSelections);
    } catch (error) {
      console.error("Error scanning delete plan:", error);
      setDeleteError(error.message || "Failed to scan project delete plan");
    } finally {
      setDeleteScanLoading(false);
    }
  };

  // Pushes a history entry, so Alt+Left closes this project and lands back on the projects
  // tab. Writes nothing but the URL: the fetch effect loads the project from the id, and the
  // checkpoint effect picks the selected node from what it loads. Seeding the list's own
  // partial object here would make a mouse click show data that a Back/Forward could not,
  // which is exactly the kind of two-paths-two-behaviours split this page had.
  const handleOpenProject = (project) => {
    if (!project?._id) return;
    setWorkspaceParams({ tab: "projects", project: project._id });
  };

  // Closing a project subpage happens for two unrelated reasons, and they need opposite
  // history behaviour, so they are two named functions rather than one with a flag:
  //
  //   handleBackToProjects   — the user is stepping back a layer. PUSHES, so Alt+Right
  //                            reopens the project, matching Windows Back/Forward symmetry.
  //   closeDeletedProject    — the project no longer exists. REPLACES, so no history entry
  //                            is ever left pointing at a deleted project's URL.
  //
  // Both clear the same cached objects, so that part is shared below. Never collapse these
  // back into one function: a caller would have to remember which history behaviour it wants,
  // and the safe-looking default is wrong for exactly one of them.
  // Neither of these clears activeProject by hand. Dropping the `project` param is what
  // closes the subpage, and the fetch effect clears the cache when that id goes away —
  // including when the user presses Alt+Left, which calls no handler at all.
  const handleBackToProjects = () => {
    stepBackOrReplace("projects");
  };

  // Replace, not a history step: the entry being overwritten is the deleted project's own
  // URL, so nothing must be able to reach it again — not Alt+Right, not Alt+Left.
  const closeDeletedProject = () => {
    setWorkspaceParams({ tab: "projects" }, { replace: true });
  };

  const handleSoftRefreshActiveProject = () => {
    setActiveProjectRefreshKey((current) => current + 1);
  };

  const handleOpenPlan = (plan) => {
    if (!plan?._id) return;
    setWorkspaceParams({ tab: "plans", plan: plan._id });
  };

  // Same contract as Projects above.
  const handleBackToPlans = () => {
    stepBackOrReplace("plans");
  };

  const closeDeletedPlan = () => {
    setWorkspaceParams({ tab: "plans" }, { replace: true });
  };

  const handleToggleDeleteSection = (sectionKey) => {
    setDeleteSelections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  };

  const removeOrderFromWorkspace = (orderId) => {
    setAllData((prev) => {
      const filteredOrders = prev.orders.filter((order) => !isSameId(order?._id, orderId));
      const filteredTransactions = prev.transactions.filter((transaction) => !isSameId(transaction?.orderId, orderId));
      const filteredInvoices = prev.invoices.filter((invoice) => !isSameId(invoice?.orderId, orderId));
      const filteredUpdates = prev.updates.filter((update) => !isSameId(update?.updatePlanId, orderId));
      const filteredRenewals = prev.renewals.filter((renewal) => !isSameId(renewal?.orderId, orderId) && !isSameId(renewal?.planId, orderId));
      const filteredPlans = prev.plans.filter((plan) => !isSameId(plan?._id, orderId));

      return {
        ...prev,
        orders: filteredOrders,
        transactions: filteredTransactions,
        invoices: filteredInvoices,
        updates: filteredUpdates,
        renewals: filteredRenewals,
        plans: filteredPlans,
        summary: null,
      };
    });
  };

  // Sole owner of activeProject. Nothing else writes it: the id in the URL says WHICH
  // project is open, and this effect supplies its data and clears it again. Both halves
  // matter — closing a project by pressing Alt+Left runs no handler at all, so if the
  // cache were only cleared by the Back handlers a closed project would stay in memory.
  useEffect(() => {
    if (!activeProjectId) {
      setActiveProject(null);
      setActiveProjectError("");
      setActiveProjectLoading(false);
      setSelectedProjectCheckpointId(null);
      return;
    }

    let isMounted = true;

    const loadProjectDetails = async () => {
      try {
        // Cleared BEFORE the request, not after it returns: otherwise switching from one
        // project to another renders the previous project's data under the new project's
        // URL until the response lands.
        setActiveProject(null);
        setSelectedProjectCheckpointId(null);
        setActiveProjectLoading(true);
        setActiveProjectError("");

        const response = await fetch(`${SummaryApi.orderDetails.url}/${activeProjectId}`, {
          credentials: "include",
        });
        const result = await response.json();

        if (!result.success) {
          throw new Error(result.message || "Failed to load project details");
        }

        if (isMounted) {
          setActiveProject(result.data || null);
        }
      } catch (error) {
        if (!isMounted) return;
        console.error("Error loading project details:", error);
        setActiveProjectError(error.message || "Failed to load project details");
      } finally {
        if (isMounted) {
          setActiveProjectLoading(false);
        }
      }
    };

    loadProjectDetails();

    return () => {
      isMounted = false;
    };
  }, [activeProjectId, activeProjectRefreshKey]);

  // Sole owner of activePlan — same contract as the project effect above.
  useEffect(() => {
    if (!activePlanId) {
      setActivePlan(null);
      setActivePlanError("");
      setActivePlanLoading(false);
      return;
    }

    let isMounted = true;

    const loadPlanDetails = async () => {
      try {
        // Cleared before the request — see the project effect above.
        setActivePlan(null);
        setActivePlanLoading(true);
        setActivePlanError("");

        const response = await fetch(`${SummaryApi.orderDetails.url}/${activePlanId}`, {
          credentials: "include",
        });
        const result = await response.json();

        if (!result.success) {
          throw new Error(result.message || "Failed to load plan details");
        }

        if (isMounted) {
          setActivePlan(result.data || null);
        }
      } catch (error) {
        if (!isMounted) return;
        console.error("Error loading plan details:", error);
        setActivePlanError(error.message || "Failed to load plan details");
      } finally {
        if (isMounted) {
          setActivePlanLoading(false);
        }
      }
    };

    loadPlanDetails();

    return () => {
      isMounted = false;
    };
  }, [activePlanId]);

  useEffect(() => {
    const nodes = activeProject?.projectNodes || [];
    if (!nodes.length) return;

    const selectedExists = nodes.some((node) => getNodeSelectionKey(node) === selectedProjectCheckpointId);
    if (selectedExists) return;

    const activeNodes = nodes.filter((node) => node?.status === "active");
    const lastNode = activeNodes[activeNodes.length - 1];
    setSelectedProjectCheckpointId(lastNode ? getNodeSelectionKey(lastNode) : null);
  }, [activeProject, selectedProjectCheckpointId]);

  // Leaving a subpage is now an explicit action in exactly one place: handleTabChange
  // clears the open project/plan before switching tabs. The two effects that used to
  // watch activeTab and clear the subpage after the fact are gone — they reacted to a
  // state change instead of owning it, so the tab rendered once against a subpage that
  // was still open, and they raced the Back handlers that clear the same state.

  const handleConfirmDelete = async () => {
    if (!deleteTarget?._id || !deleteScan) return;

    const selectedSections = Object.entries(deleteSelections)
      .filter(([, isSelected]) => isSelected)
      .map(([sectionKey]) => sectionKey);

    const orderId = deleteTarget._id;
    setDeletingOrderId(orderId);

    try {
      const response = await fetch(`${SummaryApi.adminDeleteOrder.url}/${orderId}`, {
        method: SummaryApi.adminDeleteOrder.method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedSections }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || "Failed to delete project");
      }

      removeOrderFromWorkspace(orderId);
      // Cleanup, not navigation — the order is gone, so this must not leave a forward
      // history entry pointing at it.
      if (activeProjectId === orderId) {
        closeDeletedProject();
      }
      if (activePlanId === orderId) {
        closeDeletedPlan();
      }
      if (client?._id || customerId) {
        StorageService.clearUserOrders(client?._id || customerId);
      }
      toast.success(result.message || "Project deleted successfully");
      resetDeleteFlow();
    } catch (error) {
      console.error("Error deleting project:", error);
      toast.error(error.message || "Failed to delete project");
    } finally {
      setDeletingOrderId(null);
    }
  };

  const resetCancelFlow = () => {
    setCancelTarget(null);
    setCancelPreview(null);
    setCancelPreviewLoading(false);
    setCancelReason("");
    setCancelReferenceIds({});
    setCancelRefundAmount("");
    setCancelRefundMode("source");
    setCancelManualLegs({});
    setCancelRefundReason("");
    setCancelServiceIds([]);
    setCancelServiceRefs({});
    setCancelError("");
  };

  // Opens the cancel modal and loads the read-only preview — what will be refunded, split by
  // the method each payment actually came in through. Nothing is written by this call.
  const handleRequestCancel = async (item) => {
    if (!item?._id) return;

    setCancelTarget(item);
    setCancelPreview(null);
    // Clear every per-cancellation choice, not just the first ones added — opening this for a
    // second project must never inherit the previous one's selected services or split mode.
    setCancelReason("");
    setCancelReferenceIds({});
    setCancelRefundAmount("");
    setCancelRefundMode("source");
    setCancelManualLegs({});
    setCancelRefundReason("");
    setCancelServiceIds([]);
    setCancelServiceRefs({});
    setCancelError("");
    setCancelPreviewLoading(true);

    try {
      const response = await fetch(`${SummaryApi.projectCancelPreview.url}/${item._id}/cancel-preview`, {
        method: SummaryApi.projectCancelPreview.method,
        credentials: "include",
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || "Failed to load cancellation details");
      }
      setCancelPreview(result.data);
      setCancelRefundAmount(String(result.data?.suggestion?.suggested ?? result.data?.refundable ?? ""));
    } catch (error) {
      console.error("Error loading cancellation preview:", error);
      setCancelError(error.message || "Failed to load cancellation details");
    } finally {
      setCancelPreviewLoading(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelTarget?._id || !cancelPreview) return;

    const orderId = cancelTarget._id;
    setCancellingOrderId(orderId);
    setCancelError("");

    try {
      const response = await fetch(`${SummaryApi.cancelProjectOrder.url}/${orderId}/cancel`, {
        method: SummaryApi.cancelProjectOrder.method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: cancelReason,
          referenceIds: cancelReferenceIds,
          refundAmount: cancelRefundAmount === "" ? null : Number(cancelRefundAmount),
          refundMode: cancelRefundMode,
          manualLegs: cancelRefundMode === "manual" ? cancelManualLegs : null,
          refundReason: cancelRefundReason,
          serviceIds: cancelServiceIds,
          serviceRefundOptions: cancelServiceIds.reduce((acc, id) => {
            acc[id] = { referenceIds: cancelServiceRefs[id] || {} };
            return acc;
          }, {}),
        }),
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || "Failed to cancel project");
      }

      if (client?._id || customerId) {
        StorageService.clearUserOrders(client?._id || customerId);
      }
      setWorkspaceRefreshKey((key) => key + 1);
      toast.success(result.message || "Project cancelled successfully");
      resetCancelFlow();
    } catch (error) {
      console.error("Error cancelling project:", error);
      setCancelError(error.message || "Failed to cancel project");
      toast.error(error.message || "Failed to cancel project");
    } finally {
      setCancellingOrderId(null);
    }
  };

  // Every non-wallet leg needs the admin's own reference id before the confirm button unlocks —
  // that money is sent by hand outside this system, and the customer is told the reference.
  // A refund may be zero (nothing owed back) but never negative, and never more than was
  // actually received — the server enforces the same rule.
  const cancelRefundValue = cancelRefundAmount === "" ? NaN : Number(cancelRefundAmount);
  const cancelAmountValid =
    Number.isFinite(cancelRefundValue) &&
    cancelRefundValue >= 0 &&
    cancelRefundValue <= Number(cancelPreview?.refundable || 0);
  // Mirrors helpers/orderRefundService.js's buildPayoutLegs so the modal shows exactly what the
  // server will pay out per method. The server re-derives and re-validates all of this — this
  // copy exists only so the admin sees the result before committing.
  const cancelSplitFor = (mode) => {
    const legs = cancelPreview?.legs || [];
    const total = Number(cancelPreview?.refundable || 0);
    if (!legs.length || !(total > 0) || !cancelAmountValid) return [];

    if (mode === "manual") {
      return legs.map((leg) => ({
        method: leg.method,
        amount: Math.round(Number(cancelManualLegs[leg.method] || 0)),
        original: leg.amount,
      }));
    }

    if (mode === "wallet_first") {
      let left = cancelRefundValue;
      const walletCap = Number(legs.find((leg) => leg.method === "wallet")?.amount || 0);
      const walletShare = Math.min(walletCap, left);
      left -= walletShare;
      const out = [{ method: "wallet", amount: walletShare, original: walletCap }];
      legs.forEach((leg) => {
        if (leg.method === "wallet") return;
        const share = Math.min(Number(leg.amount || 0), left);
        left -= share;
        out.push({ method: leg.method, amount: share, original: leg.amount });
      });
      return out;
    }

    let allocated = 0;
    return legs.map((leg, index) => {
      const share =
        index === legs.length - 1
          ? cancelRefundValue - allocated
          : Math.round((cancelRefundValue * leg.amount) / total);
      allocated += share;
      return { method: leg.method, amount: share, original: leg.amount };
    });
  };

  const cancelPayoutLegs = cancelSplitFor(cancelRefundMode).filter((leg) => leg.amount > 0);

  // The same three rules the server enforces, checked here so the button locks instead of the
  // request failing: no leg over its original, parts add up, and a wallet top-up needs a reason.
  const cancelSplitTotal = cancelSplitFor(cancelRefundMode).reduce((sum, leg) => sum + leg.amount, 0);
  const cancelSplitOverLeg = cancelSplitFor(cancelRefundMode).some(
    (leg) => leg.amount > Number(leg.original || 0) || leg.amount < 0
  );
  const cancelSplitValid =
    !cancelAmountValid || (!cancelSplitOverLeg && cancelSplitTotal === cancelRefundValue);

  const cancelSourceWallet = Number(
    cancelSplitFor("source").find((leg) => leg.method === "wallet")?.amount || 0
  );
  const cancelChosenWallet = Number(
    cancelSplitFor(cancelRefundMode).find((leg) => leg.method === "wallet")?.amount || 0
  );
  // Putting more into the wallet than the source split would turns the customer's bank money
  // into credit they cannot withdraw — allowed, but only on the record.
  const cancelNeedsRefundReason = cancelChosenWallet > cancelSourceWallet;
  const cancelReasonSatisfied = !cancelNeedsRefundReason || Boolean(cancelRefundReason.trim());

  // A chosen service refunds on its own suggested figure, so any non-wallet method it was paid
  // by needs its own reference id before the cancel can run.
  const cancelServicesNeedingRefs = (cancelPreview?.services || []).filter(
    (svc) => cancelServiceIds.includes(svc.orderId) && Number(svc.suggestion?.suggested || 0) > 0
  );
  const allCancelServiceRefsFilled = cancelServicesNeedingRefs.every((svc) =>
    (svc.legs || [])
      .filter((leg) => leg.method !== "wallet")
      .every((leg) => String(cancelServiceRefs[svc.orderId]?.[leg.method] || "").trim())
  );
  // Only legs actually being paid out need a reference id.
  const cancelExternalLegs = cancelPayoutLegs.filter((leg) => leg.method !== "wallet");
  const allCancelReferencesFilled = cancelExternalLegs.every((leg) =>
    String(cancelReferenceIds[leg.method] || "").trim()
  );

  // Same idea as Add Lead's focusAfterSource — the field after the legs is computed live off
  // form state, never a fixed position, since which fields even exist depends on the mode and
  // on whether a wallet top-up needs a reason. Takes `mode` explicitly (rather than reading
  // cancelRefundMode) because it can be called from the mode button's own onClick, in the same
  // tick as setCancelRefundMode — before that state update has actually re-rendered.
  const cancelServicesList = useMemo(() => cancelPreview?.services || [], [cancelPreview]);
  const focusAfterAllLegs = (mode) => {
    const chosenWallet = Number(cancelSplitFor(mode).find((leg) => leg.method === "wallet")?.amount || 0);
    const needsReason = chosenWallet > cancelSourceWallet;
    if (needsReason) {
      cancelRefundReasonFieldRef.current?.focus();
    } else if (cancelServicesList.length > 0) {
      cancelServiceCheckboxRefs.current[0]?.focus();
    } else {
      cancelReasonTextareaRef.current?.focus();
    }
  };

  const focusAfterAmount = () => {
    cancelModeButtonRefs.current[0]?.focus();
  };

  const focusAfterMode = (mode) => {
    if (mode === "manual") {
      cancelManualLegRefs.current[0]?.focus();
    } else {
      const externalLegs = cancelSplitFor(mode).filter((leg) => leg.method !== "wallet");
      if (externalLegs.length > 0) {
        cancelLegRefs.current[0]?.focus();
      } else {
        focusAfterAllLegs(mode);
      }
    }
  };

  useEffect(() => {
    if (!cancelTarget) return;
    const handleEscape = (event) => {
      if (event.key !== "Escape") return;
      if (cancellingOrderId) return;
      resetCancelFlow();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelTarget, cancellingOrderId]);

  // Mirrors the delete modal's auto-focus: land on the refund-amount field once the preview has
  // actually loaded, not before — falls back to whatever field is first when there's nothing to
  // refund (no amount field renders in that case).
  useEffect(() => {
    if (!cancelPreview || cancelPreviewLoading) {
      cancelHasAutoFocused.current = false;
      return;
    }
    if (cancelHasAutoFocused.current) return;
    cancelHasAutoFocused.current = true;
    if (cancelPreview.refundable > 0) {
      cancelAmountFieldRef.current?.focus();
    } else if (cancelServicesList.length > 0) {
      cancelServiceCheckboxRefs.current[0]?.focus();
    } else {
      cancelReasonTextareaRef.current?.focus();
    }
  }, [cancelPreview, cancelPreviewLoading, cancelServicesList.length]);

  // Runs after cancelServiceIds has actually re-rendered — same race the delete checklist's
  // Enter handler avoids: focusing the checkbox's sibling/next target synchronously would still
  // see the pre-toggle disabled/enabled state.
  useEffect(() => {
    if (cancelPendingServiceAdvanceIndex.current === null) return;
    const { index, orderId } = cancelPendingServiceAdvanceIndex.current;
    cancelPendingServiceAdvanceIndex.current = null;
    const svc = cancelServicesList[index];
    const isChosen = svc && cancelServiceIds.includes(svc.orderId);
    const hasRefInput =
      isChosen &&
      Number(svc.suggestion?.suggested || 0) > 0 &&
      (svc.legs || []).some((leg) => leg.method !== "wallet");
    if (hasRefInput) {
      const firstExternalLeg = (svc.legs || []).find((leg) => leg.method !== "wallet");
      cancelServiceRefInputRefs.current[`${orderId}-${firstExternalLeg.method}`]?.focus();
      return;
    }
    const nextCheckbox = cancelServiceCheckboxRefs.current[index + 1];
    if (nextCheckbox) {
      nextCheckbox.focus();
    } else {
      cancelReasonTextareaRef.current?.focus();
    }
  }, [cancelServiceIds, cancelServicesList]);

  const deleteChecklistSections = deleteScan?.sections || [];
  const deleteRequiredSections = deleteChecklistSections.filter((section) => section.present);
  // Delete is cleanup only — a project that took money must be cancelled (and refunded) first.
  // The server enforces this too; the UI reads the scan so it can say why the button is locked.
  const deleteNeedsCancelFirst = Boolean(
    deleteScan && !deleteScan.isCancelled && Number(deleteScan.paidTotal || 0) > 0
  );
  const allDeleteSectionsSelected =
    deleteRequiredSections.length > 0 &&
    deleteRequiredSections.every((section) => deleteSelections[section.key]);

  useEffect(() => {
    if (!deleteTarget) return;
    const handleEscape = (event) => {
      if (event.key !== "Escape") return;
      if (deletingOrderId || deleteScanLoading) return;
      resetDeleteFlow();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [deleteTarget, deletingOrderId, deleteScanLoading]);

  useEffect(() => {
    if (!deleteScan || deleteScanLoading) {
      deleteHasAutoFocused.current = false;
      return;
    }
    if (deleteHasAutoFocused.current) return;
    if (deleteRequiredSections.length === 0) return;
    deleteHasAutoFocused.current = true;
    deleteCheckboxRefs.current[0]?.focus();
  }, [deleteScan, deleteScanLoading, deleteRequiredSections.length]);

  // Runs after the toggled checkbox's state has actually re-rendered — moving focus inside
  // the same keydown that called handleToggleDeleteSection would target the submit button
  // while its `disabled` prop still reflected the pre-toggle value, and a disabled element
  // silently refuses focus.
  useEffect(() => {
    if (deletePendingAdvanceIndex.current === null) return;
    const index = deletePendingAdvanceIndex.current;
    deletePendingAdvanceIndex.current = null;
    const nextRef = deleteCheckboxRefs.current[index + 1];
    if (nextRef) {
      nextRef.focus();
    } else {
      deleteSubmitButtonRef.current?.focus();
    }
  }, [deleteSelections]);

  // Same URL-param pattern as Projects/Plans, with one difference: a payment group is openable
  // from TWO tabs — Payments and Deleted Projects both pass this as onOpenGroup — so the tab
  // must be carried through, never hardcoded to "payments", or opening a group from Deleted
  // Projects would silently switch tabs. Group keys are `group-<invoiceId>`,
  // `invoice-<id>-txn-<id>`, `transaction-<id>` or the literal "general"; all ASCII, but
  // encoded anyway rather than trusting that to stay true.
  const paymentGroupTab = () => (activeTab === "deleted-projects" ? "deleted-projects" : "payments");

  const handleOpenPaymentGroup = (group) => {
    if (!group?.key) return;
    setWorkspaceParams({ tab: paymentGroupTab(), group: group.key });
  };

  // Navigation only — nothing deletes a payment group, so there is no cleanup twin here.
  const handleBackToPayments = () => {
    stepBackOrReplace(paymentGroupTab());
  };

  // --- Account & Access handlers ---
  const loadAccessData = async () => {
    if (!customerId) return;
    try {
      setAccessLoading(true);
      setAccessError("");
      const response = await fetch(`${SummaryApi.clientCredentials.url}/${customerId}/credentials`, {
        method: SummaryApi.clientCredentials.method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.message || "Failed to load credentials");
      setAccessData(result.data);
    } catch (err) {
      setAccessError(err.message || "Failed to load credentials");
    } finally {
      setAccessLoading(false);
    }
  };

  // Load credentials when the Account & Access tab opens.
  useEffect(() => {
    if (activeTab === "access" && customerId && !accessData && !accessLoading) {
      loadAccessData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, customerId]);

  // --- Documents handlers ---
  const loadDocuments = async () => {
    if (!customerId) return;
    try {
      setDocumentsLoading(true);
      setDocumentsError("");
      const response = await fetch(`${SummaryApi.adminClientDocuments.url}/${customerId}/documents`, {
        method: SummaryApi.adminClientDocuments.method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.message || "Failed to load documents");
      setDocumentsList(result.data?.documents || []);
    } catch (err) {
      setDocumentsError(err.message || "Failed to load documents");
    } finally {
      setDocumentsLoading(false);
    }
  };

  // Load documents when the Documents tab opens.
  useEffect(() => {
    if (activeTab === "documents" && customerId && documentsList === null && !documentsLoading) {
      loadDocuments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, customerId]);

  const loadUploadLinks = async ({ append = false, cursor = null } = {}) => {
    if (!customerId) return;
    if (append) setUploadLinksLoadingMore(true);
    else setUploadLinksLoading(true);
    setUploadLinksError("");
    try {
      const query = new URLSearchParams({ limit: "20" });
      if (cursor) query.set("cursor", cursor);
      const response = await fetch(`${SummaryApi.adminUploadLinks.url}/${customerId}/upload-links?${query.toString()}`, { credentials: "include" });
      const result = await response.json();
      if (!result.success) throw new Error(result.message || "Could not load upload links");
      const items = result.data?.items || [];
      setUploadLinks((current) => append ? [...(current || []), ...items] : items);
      setUploadLinksCursor(result.data?.nextCursor || null);
    } catch (error) {
      setUploadLinksError(error.message || "Could not load upload links");
      if (!append) setUploadLinks([]);
    } finally {
      if (append) setUploadLinksLoadingMore(false);
      else setUploadLinksLoading(false);
    }
  };

  useEffect(() => {
    setUploadLinks(null);
    setUploadLinksCursor(null);
    setGeneratedUploadLink("");
  }, [customerId]);

  useEffect(() => {
    if (activeTab === "upload-links" && customerId && uploadLinks === null && !uploadLinksLoading) loadUploadLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, customerId]);

  const handleGenerateUploadLink = async () => {
    if (!selectedUploadLinkOrderId || uploadLinkGenerating) return;
    setUploadLinkGenerating(true);
    setGeneratedUploadLink("");
    try {
      const response = await fetch(`${SummaryApi.generateAdminUploadLink.url}/${customerId}/upload-links`, {
        method: SummaryApi.generateAdminUploadLink.method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: selectedUploadLinkOrderId, mode: uploadLinkMode }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.message || "Could not generate upload link");
      setGeneratedUploadLink(result.data.publicUrl);
      await loadUploadLinks();
      toast.success("Secure upload link generated");
    } catch (error) {
      toast.error(error.message || "Could not generate upload link");
    } finally {
      setUploadLinkGenerating(false);
    }
  };

  const handleRevokeUploadLink = async (linkId) => {
    if (!linkId || uploadLinkRevokingId) return;
    setUploadLinkRevokingId(linkId);
    try {
      const response = await fetch(`${SummaryApi.revokeAdminUploadLink.url}/${customerId}/upload-links/${linkId}/revoke`, {
        method: SummaryApi.revokeAdminUploadLink.method,
        credentials: "include",
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.message || "Could not revoke upload link");
      setGeneratedUploadLink("");
      await loadUploadLinks();
      toast.success("Upload link revoked");
    } catch (error) {
      toast.error(error.message || "Could not revoke upload link");
    } finally {
      setUploadLinkRevokingId("");
    }
  };

  const handleCopyGeneratedUploadLink = async () => {
    if (!generatedUploadLink) return;
    try {
      await navigator.clipboard.writeText(generatedUploadLink);
      toast.success("Upload link copied");
    } catch {
      toast.error("Could not copy upload link");
    }
  };

  // Uploaded data follows whichever record is open. The endpoint authorises server-side
  // (admin reads any order) and resolves which records belong to it — including those made
  // against services linked to a project — so nothing is filtered or merged here.
  useEffect(() => {
    const openOrderId = activeProjectId || activePlanId;
    if (!openOrderId) {
      setSubmissions([]);
      setSubmissionsError("");
      return;
    }

    let cancelled = false;
    const loadUploads = async () => {
      setSubmissionsLoading(true);
      setSubmissionsError("");
      try {
        const response = await fetch(`${SummaryApi.orderUploads.url}/${openOrderId}/uploads`, {
          method: SummaryApi.orderUploads.method,
          credentials: "include",
        });
        const data = await response.json();
        if (cancelled) return;
        if (!data?.success) {
          setSubmissions([]);
          setSubmissionsError(data?.message || "Could not load uploaded data");
          return;
        }
        setSubmissions(data.data || []);
      } catch (error) {
        if (cancelled) return;
        console.error("Error loading uploaded data:", error);
        setSubmissions([]);
        setSubmissionsError("Could not load uploaded data");
      } finally {
        if (!cancelled) setSubmissionsLoading(false);
      }
    };

    loadUploads();
    return () => {
      cancelled = true;
    };
  }, [activeProjectId, activePlanId]);

  const handleUploadDocument = async ({ file, source }) => {
    if (!customerId || !file) return;
    try {
      setDocumentUploading(true);
      const formData = new FormData();
      formData.append("document", file);
      formData.append("source", source || "general");
      const response = await fetch(`${SummaryApi.uploadClientDocument.url}/${customerId}/documents`, {
        method: SummaryApi.uploadClientDocument.method,
        credentials: "include",
        body: formData,
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.message || "Failed to upload document");
      toast.success("Document uploaded");
      // Refresh the timeline from the source of truth.
      await loadDocuments();
    } catch (err) {
      toast.error(err.message || "Failed to upload document");
    } finally {
      setDocumentUploading(false);
    }
  };

  const handleCopyPassword = async () => {
    const pwd = accessData?.plainPassword;
    if (!pwd) return;
    try {
      await navigator.clipboard.writeText(pwd);
      toast.success("Password copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  const handleResetPassword = async () => {
    if (!customerId) return;
    if (!newPasswordInput || newPasswordInput.length < 4) {
      toast.error("Password must be at least 4 characters");
      return;
    }
    try {
      setResetting(true);
      const response = await fetch(`${SummaryApi.resetClientPassword.url}/${customerId}/reset-password`, {
        method: SummaryApi.resetClientPassword.method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: newPasswordInput }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.message || "Failed to reset password");
      toast.success("Password reset successfully");
      setNewPasswordInput("");
      await loadAccessData();
    } catch (err) {
      toast.error(err.message || "Failed to reset password");
    } finally {
      setResetting(false);
    }
  };

  const handleToggleAccountStatus = async () => {
    if (!customerId || !accessData) return;
    const nextActive = !accessData.isActive;
    try {
      setStatusUpdating(true);
      const response = await fetch(`${SummaryApi.updateClientAccountStatus.url}/${customerId}/account-status`, {
        method: SummaryApi.updateClientAccountStatus.method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: nextActive }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.message || "Failed to update account status");
      toast.success(nextActive ? "Account enabled" : "Account disabled");
      setAccessData((prev) => (prev ? { ...prev, isActive: nextActive } : prev));
    } catch (err) {
      toast.error(err.message || "Failed to update account status");
    } finally {
      setStatusUpdating(false);
    }
  };

  // Soft-delete this client into Trash (hidden from lists + login blocked). Restorable
  // for 30 days from the admin Trash page. See 49_TRASH_SYSTEM_SOFT_DELETE.md.
  const handleTrashClient = async () => {
    if (!customerId || trashing) return;
    try {
      setTrashing(true);
      const response = await fetch(`${SummaryApi.trashClient.url}/${customerId}/trash`, {
        method: SummaryApi.trashClient.method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.message || "Failed to move client to Trash");
      toast.success("Client moved to Trash");
      setShowTrashConfirm(false);
      navigate("/admin-panel/clients");
    } catch (err) {
      toast.error(err.message || "Failed to move client to Trash");
    } finally {
      setTrashing(false);
    }
  };

  useEffect(() => {
    if (!customerId) return;

    const loadWorkspace = async () => {
      try {
        setCustomerLoading(true);
        setDataLoading(true);
        setFetchError("");

        const response = await fetch(`${SummaryApi.adminUserWorkspace.url}?customerId=${customerId}`, {
          method: SummaryApi.adminUserWorkspace.method,
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });

        const workspaceResult = await response.json();
        if (!workspaceResult.success) {
          throw new Error(workspaceResult.message || "Failed to load customer workspace");
        }

        const workspaceData = workspaceResult.data || {};
        const fetchedCustomer = workspaceData.customer || fallbackClient;

        setCustomer(fetchedCustomer || null);
        setAllData({
          orders: workspaceData.orders || [],
          renewals: workspaceData.renewals || [],
          transactions: workspaceData.transactions || [],
          invoices: workspaceData.invoices || [],
          updates: workspaceData.updates || [],
          plans: workspaceData.plans || [],
          summary: workspaceData.summary || null,
        });
        // Deliberately does NOT touch activeProject/activePlan. This effect loads the
        // CLIENT; the open subpage's data belongs to the fetch effects keyed on
        // activeProjectId/activePlanId, and a value with two owners is how the open project
        // used to blank out: a history navigation gave location.state a new object identity,
        // this effect re-ran on it and cleared the cache, and the fetch effect did not
        // reload because the id itself had not changed — so the subpage fell through to the
        // list mid-flight.
      } catch (error) {
        console.error("Error loading admin client workspace:", error);
        setFetchError("Failed to load customer data");
      } finally {
        setCustomerLoading(false);
        setDataLoading(false);
      }
    };

    loadWorkspace();
  }, [customerId, fallbackClient, workspaceRefreshKey]);

  const projectOrders = useMemo(
    () => allData.orders.filter((order) => !isWebsiteUpdateOrder(order)).slice().sort((a, b) => sortWorkspaceItem(a, b, getProjectSortRank)),
    [allData.orders]
  );

  const planOrders = useMemo(
    () => allData.orders.filter((order) => isWebsiteUpdateOrder(order)).slice().sort((a, b) => sortWorkspaceItem(a, b, getPlanSortRank)),
    [allData.orders]
  );

  // Fixed order (user-confirmed, replaces the earlier active-project/active-plan-dependent
  // ordering): Projects, Plans, Payments, Documents, Access, Overview last — same for every
  // client regardless of what they currently have running.
  const tabs = WORKSPACE_TABS;
  const tabContentRef = useRef(null);
  const tabsRef = useRef(null);

  // Moves focus one step at a time through every interactive element in the
  // active tab's content (header buttons, list rows, form fields — whatever
  // order they appear in the DOM), and off the top edge into the tab strip.
  //
  // This only ever runs on events that a nested widget chose not to consume:
  // AdminWorkspaceList's own row-to-row Up/Down already handles in-bounds
  // moves and only lets Up/Down bubble here at its first/last row (see its
  // own handleContainerKeyDown), so there's no double-handling. A tab with no
  // nested list at all (e.g. Overview's single tabIndex=0 stat card) just has
  // a one-element sequence, so Up from it goes straight to the tab strip.
  //
  // Deliberate exception: an open project/plan's checkpoint list
  // (WorkspaceDetailSubpage, rendered when activeProject/activePlan is set)
  // owns a separate checkbox multi-select with Shift-range-select, and
  // clamps Up/Down at its own edges by design so a selection in progress
  // never loses focus out of the list. It does not bubble here, and isn't
  // meant to — reaching the tab strip from inside it isn't supported; back
  // out to the list first.
  const handleTabContentKeyDown = (event) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    const elements = getInteractiveElements(tabContentRef.current);
    const currentIndex = elements.indexOf(document.activeElement);
    if (currentIndex === -1) return;

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (currentIndex === 0) {
        tabsRef.current?.focus();
      } else {
        elements[currentIndex - 1].focus();
      }
      return;
    }

    if (currentIndex < elements.length - 1) {
      event.preventDefault();
      elements[currentIndex + 1].focus();
    }
  };

  // A URL with no ?tab= gets the default written in, with replace so the bare URL does not
  // become a history entry of its own. Legacy callers that still pass location.state.activeTab
  // (AdminPaymentRecordDetail) are migrated to the param here rather than being special-cased
  // everywhere downstream.
  useEffect(() => {
    if (activeTab === null && !dataLoading) {
      setWorkspaceParams({ tab: location.state?.activeTab || tabs[0].id }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataLoading, activeTab]);

  const cards = useMemo(() => {
    const activeOrders = projectOrders.filter(isActiveOrder);
    const pendingOrders = projectOrders.filter(isPendingOrder);
    const completedOrders = projectOrders.filter(isCompletedOrder);
    const rejectedOrders = projectOrders.filter(isRejectedOrder);
    const activePlans = planOrders.filter((plan) => getPlanDisplayStatus(plan) === "Active");
    const walletBalance = Number(allData.summary?.walletBalance ?? client?.walletBalance ?? 0);

    return [
      {
        id: "total",
        label: "Total Services / Products",
        value: allData.orders.length,
        helper: "All assigned customer orders",
        icon: Layers3,
      },
      {
        id: "active",
        label: "Active",
        value: activeOrders.length,
        helper: "In-progress items",
        icon: BadgeCheck,
      },
      {
        id: "pending",
        label: "Pending",
        value: pendingOrders.length,
        helper: "Awaiting approval",
        icon: Clock3,
      },
      {
        id: "completed",
        label: "Completed",
        value: completedOrders.length,
        helper: "Fully delivered items",
        icon: Grid2x2,
      },
      {
        id: "rejected",
        label: "Rejected / Cancelled",
        value: rejectedOrders.length,
        helper: "Stopped or cancelled items",
        icon: ShieldCheck,
      },
      {
        id: "balance",
        label: "Wallet Balance",
        value: `₹${walletBalance.toLocaleString("en-IN")}`,
        helper: "Customer wallet amount",
        icon: Wallet,
      },
      {
        id: "plans",
        label: "Active Plans",
        value: activePlans.length,
        helper: "Currently usable update plans",
        icon: FileText,
      },
      {
        id: "issues",
        label: "Pending Updates",
        value: allData.summary?.pendingUpdates ?? 0,
        helper: "Update requests waiting",
        icon: AlertCircle,
      },
    ];
  }, [
    allData.orders,
    allData.summary,
    allData.updates,
    client,
    projectOrders,
    planOrders,
  ]);

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

  // Switching tabs closes whatever subpage is open, because setWorkspaceParams writes the
  // complete param set and this call omits project/plan/group — so a subpage cannot survive
  // into a tab that does not render it. Replace, not push: switching tabs should not stack a
  // history entry per tab, or Alt+Left out of a project would walk back through every tab
  // visited on the way in.
  const handleTabChange = (tabId) => {
    if (tabId === activeTab) return;

    setWorkspaceParams({ tab: tabId }, { replace: true });
  };

  // Back is one step, never a history jump. Inside an open project/plan subpage the
  // first Back closes that subpage (the same thing the subpage's own Back does), so the
  // header and in-page Back can never disagree. At workspace level it returns to the
  // parent that opened this client — the clients list or the dashboard, whichever it
  // actually was — instead of navigate(-1), which pointed at whatever happened to be
  // previous in history. A direct URL or refresh has no return target and falls back to
  // the clients list. See helpers/adminReturnNavigation.js.
  const handleBack = () => {
    if (activeProjectId) {
      handleBackToProjects();
      return;
    }

    if (activePlanId) {
      handleBackToPlans();
      return;
    }

    if (activePaymentGroupId) {
      handleBackToPayments();
      return;
    }

    goToAdminReturn(navigate, location, "/admin-panel/clients");
  };

  return (
    <AdminLayout
      user={user}
      onLogout={handleLogout}
    >
      <AdminWorkspaceShell>
        <AdminWorkspaceHeader
          eyebrow={
            <>
              <ShieldCheck size={14} />
              Admin Client Workspace
            </>
          }
          title={clientName}
          subtitle={clientEmail}
          leadingAction={
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white transition hover:bg-white/10"
              aria-label="Go back"
            >
              <ArrowLeft size={18} />
            </button>
          }
          meta={
            <>
              <AdminInfoPill label="Status" value={clientStatus} variant="dark" />
              <AdminInfoPill label="Joined" value={createdAt} variant="dark" />
            </>
          }
          loadingText={customerLoading ? "Loading customer profile..." : ""}
        />

        <AdminWorkspaceTabs
          ref={tabsRef}
          tabs={tabs}
          activeTab={activeTab || tabs[0].id}
          onChange={handleTabChange}
          onEnterContent={() => focusFirstInteractiveElement(tabContentRef.current)}
          ariaLabel="Client workspace sections"
        />

          <div className="p-5 sm:p-6" ref={tabContentRef} onKeyDown={handleTabContentKeyDown}>
        {activeTab === "overview" && (
          <section>
            <div className="mb-4">
              <h2 className="text-xl font-bold text-slate-900">Overview</h2>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {cards.map((card, cardIndex) => {
                const Icon = card.icon;
                return (
                  <div
                    key={card.id}
                    tabIndex={cardIndex === 0 ? 0 : undefined}
                    className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-500">{card.label}</p>
                        <p className="mt-3 text-3xl font-bold text-slate-900">{card.value}</p>
                        <p className="mt-2 text-xs text-slate-500">{card.helper}</p>
                      </div>
                      <div className="rounded-2xl bg-white p-3 text-slate-700 shadow-sm">
                        <Icon size={18} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Summary</h3>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-500">
                    <span>{allData.orders.length} orders</span>
                    <span>{allData.invoices.length} invoices</span>
                    <span>{allData.summary?.updateCount ?? 0} update requests</span>
                  </div>
                </div>
                {dataLoading ? <div className="text-sm text-slate-600">Loading...</div> : null}
              </div>
            </div>
          </section>
        )}

        {activeTab === "projects" && (
          <section className="space-y-5">
            {activeProject ? (
              <WorkspaceDetailSubpage
                item={activeProject}
                loading={activeProjectLoading}
                error={activeProjectError}
                onBack={handleBackToProjects}
                onDelete={handleRequestDelete}
                onCancel={handleRequestCancel}
                deletingOrderId={deletingOrderId}
                cancellingOrderId={cancellingOrderId}
                getStatusLabel={getProjectDisplayStatus}
                getBadgeClassName={getBadgeClassName}
                formatDateTime={formatDateTime}
                backLabel="Back to Projects"
                detailLabel="Project"
                summaryTitle="Project progress snapshot"
                selectedCheckpointId={selectedProjectCheckpointId}
                onSelectCheckpoint={setSelectedProjectCheckpointId}
                onSoftRefresh={handleSoftRefreshActiveProject}
                allInvoices={allData.invoices}
                allTransactions={allData.transactions}
                submissions={submissions}
                submissionsLoading={submissionsLoading}
                submissionsError={submissionsError}
              />
            ) : (
              <CompactWorkspaceCard
                title="Projects"
                subtitle={`Active projects first. Last updated ${lastUpdatedAt}.`}
                items={projectOrders}
                emptyText="No projects found for this client."
                onRowClick={handleOpenProject}
                onDelete={handleRequestDelete}
                onCancel={handleRequestCancel}
                deletingOrderId={deletingOrderId}
                cancellingOrderId={cancellingOrderId}
                headerAction={
                  <button
                    type="button"
                    onClick={() => setShowCreateProjectForm(true)}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    Create Project for Client
                  </button>
                }
                renderMeta={(order) => [
                  `Category: ${getCategoryLabel(getProjectCategory(order))}`,
                  `Phase: ${getProjectPhaseLabel(order)}`,
                  `Progress: ${order.projectProgress || 0}%`,
                ]}
                renderRight={(order) => (
                  <div className="flex flex-col items-end gap-2">
                    <span
                      className={[
                        "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
                        getBadgeClassName(getProjectDisplayStatus(order)),
                      ].join(" ")}
                    >
                      {getProjectDisplayStatus(order)}
                    </span>
                    <span className="text-xs text-slate-500">{formatDateTime(order.updatedAt || order.createdAt)}</span>
                  </div>
                )}
              />
            )}
          </section>
        )}

        {activeTab === "plans" && (
          <section className="space-y-5">
            {activePlan ? (
              <WorkspaceDetailSubpage
                item={activePlan}
                loading={activePlanLoading}
                error={activePlanError}
                onBack={handleBackToPlans}
                onDelete={handleRequestDelete}
                onCancel={handleRequestCancel}
                deletingOrderId={deletingOrderId}
                cancellingOrderId={cancellingOrderId}
                getStatusLabel={getPlanDisplayStatus}
                getBadgeClassName={getBadgeClassName}
                formatDateTime={formatDateTime}
                backLabel="Back to Plans"
                detailLabel="Plan"
                summaryTitle="Plan activity snapshot"
                submissions={submissions}
                submissionsLoading={submissionsLoading}
                submissionsError={submissionsError}
              />
            ) : (
              <CompactWorkspaceCard
                title="Plans"
                subtitle={`Active plans first. ${planOrders.length} total.`}
                items={planOrders}
                emptyText="No plans found for this client."
                onRowClick={handleOpenPlan}
                onDelete={handleRequestDelete}
                onCancel={handleRequestCancel}
                deletingOrderId={deletingOrderId}
                cancellingOrderId={cancellingOrderId}
                renderMeta={(plan) => [
                  `Type: ${getPlanTypeLabel(plan)}`,
                  `Usage: ${
                    plan.productId?.isMonthlyRenewablePlan || plan.productId?.isMonthlyLimitedPlan
                      ? `${plan.currentMonthUpdatesUsed || 0} used / ${plan.currentMonthUpdatesRemaining ?? "N/A"} remaining`
                      : `${plan.updatesUsed || 0} updates used`
                  }`,
                ]}
                renderRight={(plan) => (
                  <div className="flex flex-col items-end gap-2">
                    <span
                      className={[
                        "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
                        getBadgeClassName(getPlanDisplayStatus(plan)),
                      ].join(" ")}
                    >
                      {getPlanDisplayStatus(plan)}
                    </span>
                    <span className="text-xs text-slate-500">{formatDateTime(plan.updatedAt || plan.createdAt)}</span>
                  </div>
                )}
              />
            )}
          </section>
        )}

        {activeTab === "payments" && (
          activePaymentGroupId ? (
            <PaymentOrderHistorySubpage
              customerId={customerId}
              orderId={activePaymentGroupId}
              onBack={handleBackToPayments}
            />
          ) : (
            <PaymentInvoicesPanel
              transactions={allData.transactions}
              invoices={allData.invoices}
              getBadgeClassName={getBadgeClassName}
              formatDateTime={formatDateTime}
              onOpenGroup={handleOpenPaymentGroup}
              customerId={customerId}
              walletBalance={Number(allData.summary?.walletBalance ?? customer?.walletBalance ?? 0)}
              onRecharged={() => setWorkspaceRefreshKey((current) => current + 1)}
            />
          )
        )}

        {activeTab === "deleted-projects" && (
          <DeletedProjectsPanel
            transactions={allData.transactions}
            invoices={allData.invoices}
            formatDateTime={formatDateTime}
            onOpenGroup={handleOpenPaymentGroup}
          />
        )}

        {activeTab === "documents" && (
          <ClientDocumentsPanel
            documents={documentsList}
            loading={documentsLoading}
            error={documentsError}
            uploading={documentUploading}
            onUpload={handleUploadDocument}
            formatDateTime={formatDateTime}
          />
        )}

        {activeTab === "upload-links" && (
          <UploadLinksPanel
            customer={customer}
            orders={allData.orders}
            links={uploadLinks}
            loading={uploadLinksLoading}
            loadingMore={uploadLinksLoadingMore}
            hasMore={Boolean(uploadLinksCursor)}
            error={uploadLinksError}
            selectedOrderId={selectedUploadLinkOrderId}
            setSelectedOrderId={setSelectedUploadLinkOrderId}
            mode={uploadLinkMode}
            setMode={setUploadLinkMode}
            generatedLink={generatedUploadLink}
            generating={uploadLinkGenerating}
            revokingId={uploadLinkRevokingId}
            onGenerate={handleGenerateUploadLink}
            onCopy={handleCopyGeneratedUploadLink}
            onRevoke={handleRevokeUploadLink}
            onLoadMore={() => loadUploadLinks({ append: true, cursor: uploadLinksCursor })}
          />
        )}

        {activeTab === "access" && (
          <AccountAccessPanel
            accessData={accessData}
            accessLoading={accessLoading}
            accessError={accessError}
            showPassword={showPassword}
            setShowPassword={setShowPassword}
            onCopyPassword={handleCopyPassword}
            newPasswordInput={newPasswordInput}
            setNewPasswordInput={setNewPasswordInput}
            resetting={resetting}
            onResetPassword={handleResetPassword}
            statusUpdating={statusUpdating}
            onToggleStatus={handleToggleAccountStatus}
            onRequestTrash={() => setShowTrashConfirm(true)}
          />
        )}

        {fetchError ? (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {fetchError}
          </div>
        ) : null}
          </div>
      </AdminWorkspaceShell>

        {cancelTarget ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6">
            <div className="max-h-full w-full max-w-xl overflow-y-auto rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl">
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-amber-50 p-3 text-amber-600">
                  <Ban size={20} />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-slate-900">Cancel this project?</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {cancelPreview?.projectName || cancelTarget.productId?.serviceName || "Project"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetCancelFlow}
                  disabled={Boolean(cancellingOrderId)}
                  className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>

              {cancelPreviewLoading ? (
                <div className="mt-6 flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 size={16} className="animate-spin" /> Loading refund details...
                </div>
              ) : null}

              {cancelPreview && !cancelPreviewLoading ? (
                <div className="mt-6 space-y-5">
                  {cancelPreview.refundable > 0 ? (
                    <>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-bold uppercase tracking-wide text-slate-500">
                        Refund amount
                      </p>
                      {/* The working, not just the number — an unexplained figure gets
                          overridden every time, which defeats the point of calculating it. */}
                      <p className="mt-1 text-sm text-slate-600">
                        {cancelPreview.suggestion?.explanation}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-bold text-slate-500">₹</span>
                          <input
                            ref={cancelAmountFieldRef}
                            type="number"
                            min="0"
                            max={cancelPreview.refundable}
                            value={cancelRefundAmount}
                            onChange={(event) => setCancelRefundAmount(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key !== "Enter") return;
                              event.preventDefault();
                              focusAfterAmount();
                            }}
                            className="w-40 rounded-xl border border-slate-200 px-3 py-2 text-base font-bold text-slate-900 outline-none focus:border-emerald-500"
                          />
                        </div>
                        <span className="text-sm text-slate-500">
                          of {displayINRCurrency(cancelPreview.refundable)} received
                        </span>
                        {Number(cancelRefundAmount) !== Number(cancelPreview.suggestion?.suggested ?? -1) ? (
                          <button
                            type="button"
                            onClick={() => setCancelRefundAmount(String(cancelPreview.suggestion?.suggested ?? 0))}
                            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-white"
                          >
                            Use suggested {displayINRCurrency(cancelPreview.suggestion?.suggested || 0)}
                          </button>
                        ) : null}
                      </div>
                      {!cancelAmountValid ? (
                        <p className="mt-2 text-sm font-semibold text-rose-600">
                          Enter an amount between ₹0 and {displayINRCurrency(cancelPreview.refundable)}.
                        </p>
                      ) : null}
                      {cancelPreview.suggestion?.adminDecides ? (
                        <p className="mt-2 text-sm text-amber-700">
                          Work has already started — set this to what was actually spent.
                        </p>
                      ) : null}
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-bold uppercase tracking-wide text-slate-500">
                        How it goes back
                      </p>
                      <div
                        role="radiogroup"
                        aria-label="How the refund goes back"
                        className="mt-3 flex flex-wrap gap-2"
                        onKeyDown={(event) => {
                          if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
                          event.preventDefault();
                          const currentIndex = CANCEL_REFUND_MODE_OPTIONS.findIndex(
                            (option) => option.key === cancelRefundMode
                          );
                          if (currentIndex === -1) return;
                          const nextIndex = event.key === "ArrowRight"
                            ? (currentIndex + 1) % CANCEL_REFUND_MODE_OPTIONS.length
                            : (currentIndex - 1 + CANCEL_REFUND_MODE_OPTIONS.length) % CANCEL_REFUND_MODE_OPTIONS.length;
                          const nextMode = CANCEL_REFUND_MODE_OPTIONS[nextIndex].key;
                          setCancelRefundMode(nextMode);
                          cancelModeButtonRefs.current[nextIndex]?.focus();
                        }}
                      >
                        {CANCEL_REFUND_MODE_OPTIONS.map((option, optionIndex) => (
                          <button
                            key={option.key}
                            ref={(el) => { cancelModeButtonRefs.current[optionIndex] = el; }}
                            type="button"
                            role="radio"
                            aria-checked={cancelRefundMode === option.key}
                            onClick={() => {
                              setCancelRefundMode(option.key);
                              focusAfterMode(option.key);
                            }}
                            title={option.hint}
                            className={`rounded-xl border px-3 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-emerald-300 ${
                              cancelRefundMode === option.key
                                ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      <p className="mt-2 text-sm text-slate-500">
                        {cancelRefundMode === "source"
                          ? "Money goes back the way it came in, in the same proportion it was paid."
                          : cancelRefundMode === "wallet_first"
                            ? "The wallet is filled first, up to what it originally paid."
                            : "Set each method's share yourself. No method can get back more than it paid."}
                      </p>
                      <div className="mt-4 space-y-3">
                        {(() => {
                          let externalLegIndex = -1;
                          return cancelPayoutLegs.map((leg) => {
                            const isExternal = leg.method !== "wallet";
                            if (isExternal) externalLegIndex += 1;
                            const legRefIndex = externalLegIndex;
                            return (
                              <div key={leg.method} className="border-t border-slate-200 pt-3 first:border-t-0 first:pt-0">
                                <div className="flex items-center justify-between">
                                  <span className="text-base font-semibold text-slate-900">
                                    {getPaymentMethodText(leg.method)}
                                  </span>
                                  <span className="text-base font-bold text-slate-900">
                                    {displayINRCurrency(leg.amount)}
                                  </span>
                                </div>
                                {!isExternal ? (
                                  <p className="mt-1 text-sm text-emerald-600">
                                    Credited to the wallet automatically.
                                  </p>
                                ) : (
                                  <div className="mt-2">
                                    <p className="text-sm text-slate-500">
                                      Send this amount yourself, then enter the reference id.
                                    </p>
                                    <input
                                      ref={(el) => { cancelLegRefs.current[legRefIndex] = el; }}
                                      type="text"
                                      value={cancelReferenceIds[leg.method] || ""}
                                      onChange={(event) =>
                                        setCancelReferenceIds((prev) => ({
                                          ...prev,
                                          [leg.method]: event.target.value,
                                        }))
                                      }
                                      onKeyDown={(event) => {
                                        if (event.key !== "Enter") return;
                                        event.preventDefault();
                                        const nextRef = cancelLegRefs.current[legRefIndex + 1];
                                        if (nextRef) {
                                          nextRef.focus();
                                        } else {
                                          focusAfterAllLegs(cancelRefundMode);
                                        }
                                      }}
                                      placeholder="Reference / UTR id"
                                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-base text-slate-900 outline-none focus:border-emerald-500"
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          });
                        })()}
                        {cancelRefundMode === "manual" ? (
                          <div className="space-y-2 border-t border-slate-200 pt-3">
                            {(cancelPreview.legs || []).map((leg, manualIndex) => (
                              <div key={`manual-${leg.method}`} className="flex items-center justify-between gap-3">
                                <span className="text-sm font-semibold text-slate-700">
                                  {getPaymentMethodText(leg.method)}
                                  <span className="ml-2 font-normal text-slate-400">
                                    max {displayINRCurrency(leg.amount)}
                                  </span>
                                </span>
                                <input
                                  ref={(el) => { cancelManualLegRefs.current[manualIndex] = el; }}
                                  type="number"
                                  min="0"
                                  max={leg.amount}
                                  value={cancelManualLegs[leg.method] ?? ""}
                                  onChange={(event) =>
                                    setCancelManualLegs((prev) => ({
                                      ...prev,
                                      [leg.method]: event.target.value,
                                    }))
                                  }
                                  onKeyDown={(event) => {
                                    if (event.key !== "Enter") return;
                                    event.preventDefault();
                                    const nextRef = cancelManualLegRefs.current[manualIndex + 1];
                                    if (nextRef) {
                                      nextRef.focus();
                                    } else if (cancelExternalLegs.length > 0) {
                                      cancelLegRefs.current[0]?.focus();
                                    } else {
                                      focusAfterAllLegs(cancelRefundMode);
                                    }
                                  }}
                                  className="w-32 rounded-xl border border-slate-200 px-3 py-2 text-base text-slate-900 outline-none focus:border-emerald-500"
                                />
                              </div>
                            ))}
                            {!cancelSplitValid ? (
                              <p className="text-sm font-semibold text-rose-600">
                                The parts must add up to {displayINRCurrency(cancelRefundValue || 0)}, and no
                                method can get back more than it paid.
                              </p>
                            ) : null}
                          </div>
                        ) : null}

                        {cancelNeedsRefundReason ? (
                          <div className="border-t border-slate-200 pt-3">
                            <label className="text-sm font-bold text-amber-800">
                              Why is more going to the wallet?
                            </label>
                            <p className="mt-1 text-sm text-amber-700">
                              This turns the customer's bank money into wallet credit they cannot
                              withdraw — record that they asked for it.
                            </p>
                            <input
                              ref={cancelRefundReasonFieldRef}
                              type="text"
                              value={cancelRefundReason}
                              onChange={(event) => setCancelRefundReason(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key !== "Enter") return;
                                event.preventDefault();
                                if (cancelServicesList.length > 0) {
                                  cancelServiceCheckboxRefs.current[0]?.focus();
                                } else {
                                  cancelReasonTextareaRef.current?.focus();
                                }
                              }}
                              placeholder="e.g. Customer asked to keep it in the wallet"
                              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-base text-slate-900 outline-none focus:border-emerald-500"
                            />
                          </div>
                        ) : null}

                        <div className="flex items-center justify-between border-t border-slate-300 pt-3">
                          <span className="text-base font-bold text-slate-900">Total refund</span>
                          <span className="text-base font-bold text-slate-900">
                            {displayINRCurrency(cancelAmountValid ? cancelRefundValue : 0)}
                          </span>
                        </div>
                      </div>
                    </div>
                    </>
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      No payment was received for this project, so there is nothing to refund.
                    </div>
                  )}

                  {(cancelPreview.services || []).length > 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-bold uppercase tracking-wide text-slate-500">
                        Services on this project
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        A service left running will keep billing the customer for a project that no
                        longer exists. Choose which to cancel and refund too.
                      </p>
                      <div
                        className="mt-3 space-y-3"
                        onKeyDown={(event) => {
                          if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Enter") return;
                          const refs = cancelServiceCheckboxRefs.current;
                          const currentIndex = refs.findIndex((el) => el === document.activeElement);
                          if (currentIndex === -1) return;

                          if (event.key === "Enter") {
                            event.preventDefault();
                            const svc = cancelServicesList[currentIndex];
                            cancelPendingServiceAdvanceIndex.current = { index: currentIndex, orderId: svc.orderId };
                            setCancelServiceIds((prev) =>
                              prev.includes(svc.orderId)
                                ? prev.filter((id) => id !== svc.orderId)
                                : [...prev, svc.orderId]
                            );
                            return;
                          }

                          if (event.key === "ArrowDown") {
                            event.preventDefault();
                            refs[currentIndex + 1]?.focus();
                            return;
                          }

                          if (event.key === "ArrowUp") {
                            const prevRef = refs[currentIndex - 1];
                            if (!prevRef) return;
                            event.preventDefault();
                            prevRef.focus();
                          }
                        }}
                      >
                        {cancelPreview.services.map((svc, serviceIndex) => {
                          const chosen = cancelServiceIds.includes(svc.orderId);
                          const externalLegs = (svc.legs || []).filter((leg) => leg.method !== "wallet");
                          return (
                            <div key={svc.orderId} className="border-t border-slate-200 pt-3 first:border-t-0 first:pt-0">
                              <label className="flex items-start gap-3">
                                <input
                                  ref={(el) => { cancelServiceCheckboxRefs.current[serviceIndex] = el; }}
                                  type="checkbox"
                                  checked={chosen}
                                  onChange={(event) =>
                                    setCancelServiceIds((prev) =>
                                      event.target.checked
                                        ? [...prev, svc.orderId]
                                        : prev.filter((id) => id !== svc.orderId)
                                    )
                                  }
                                  className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600"
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block text-base font-semibold text-slate-900">{svc.name}</span>
                                  <span className="mt-0.5 block text-sm text-slate-500">
                                    {svc.suggestion?.explanation}
                                  </span>
                                  {Number(svc.suggestion?.suggested || 0) > 0 ? (
                                    <span className="mt-0.5 block text-sm font-semibold text-emerald-700">
                                      Refund {displayINRCurrency(svc.suggestion.suggested)}
                                    </span>
                                  ) : (
                                    <span className="mt-0.5 block text-sm text-slate-500">Nothing to refund</span>
                                  )}
                                </span>
                              </label>

                              {chosen && Number(svc.suggestion?.suggested || 0) > 0 && externalLegs.length > 0 ? (
                                <div className="mt-2 space-y-2 pl-7">
                                  {externalLegs.map((leg, legIndex) => (
                                    <div key={`${svc.orderId}-${leg.method}`}>
                                      <p className="text-sm text-slate-500">
                                        Send the {getPaymentMethodText(leg.method)}{" "}
                                        share yourself, then enter the reference id.
                                      </p>
                                      <input
                                        ref={(el) => { cancelServiceRefInputRefs.current[`${svc.orderId}-${leg.method}`] = el; }}
                                        type="text"
                                        value={cancelServiceRefs[svc.orderId]?.[leg.method] || ""}
                                        onChange={(event) =>
                                          setCancelServiceRefs((prev) => ({
                                            ...prev,
                                            [svc.orderId]: {
                                              ...(prev[svc.orderId] || {}),
                                              [leg.method]: event.target.value,
                                            },
                                          }))
                                        }
                                        onKeyDown={(event) => {
                                          if (event.key !== "Enter") return;
                                          event.preventDefault();
                                          const nextLeg = externalLegs[legIndex + 1];
                                          if (nextLeg) {
                                            cancelServiceRefInputRefs.current[`${svc.orderId}-${nextLeg.method}`]?.focus();
                                          } else {
                                            const nextCheckbox = cancelServiceCheckboxRefs.current[serviceIndex + 1];
                                            if (nextCheckbox) {
                                              nextCheckbox.focus();
                                            } else {
                                              cancelReasonTextareaRef.current?.focus();
                                            }
                                          }
                                        }}
                                        placeholder="Reference / UTR id"
                                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-base text-slate-900 outline-none focus:border-emerald-500"
                                      />
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                      {cancelServiceIds.length === 0 ? (
                        <p className="mt-3 text-sm text-amber-700">
                          None selected — these services will keep running and billing.
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <div>
                    <label className="text-sm font-bold text-slate-700">Reason (optional)</label>
                    <textarea
                      ref={cancelReasonTextareaRef}
                      value={cancelReason}
                      onChange={(event) => setCancelReason(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" || event.shiftKey) return;
                        event.preventDefault();
                        cancelSubmitButtonRef.current?.focus();
                      }}
                      rows={2}
                      placeholder="Shared with the customer"
                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-base text-slate-900 outline-none focus:border-emerald-500"
                    />
                  </div>

                  <p className="text-sm text-slate-500">
                    The customer will be notified by email with the refund details.
                  </p>
                </div>
              ) : null}

              {cancelError ? (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {cancelError}
                </div>
              ) : null}

              <div className="mt-6 flex justify-end">
                <button
                  ref={cancelSubmitButtonRef}
                  type="button"
                  onClick={handleConfirmCancel}
                  disabled={
                    Boolean(cancellingOrderId) ||
                    cancelPreviewLoading ||
                    !cancelPreview ||
                    !allCancelReferencesFilled ||
                    !cancelAmountValid ||
                    !cancelSplitValid ||
                    !cancelReasonSatisfied ||
                    !allCancelServiceRefsFilled
                  }
                  className="inline-flex items-center gap-2 rounded-2xl bg-amber-600 px-5 py-2.5 text-base font-bold text-white transition hover:bg-amber-700 focus:animate-pulse focus:ring-4 focus:ring-amber-300 disabled:opacity-50"
                >
                  {cancellingOrderId ? <Loader2 size={16} className="animate-spin" /> : null}
                  Cancel project
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {deleteTarget ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6">
            <div className="w-full max-w-xl rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl">
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-rose-50 p-3 text-rose-600">
                  <Trash2 size={20} />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-slate-900">
                    Delete {deleteScan?.orderType === "plan" ? "plan" : "project"} permanently?
                  </h3>
                  <p className="mt-2 text-sm text-slate-600">
                    Scan linked data, check only active sections, and delete runs only when all present items are selected.
                  </p>
                  <p className="mt-3 text-xs font-medium text-slate-500">
                    {deleteScan?.serviceName || deleteTarget.productId?.serviceName || "Project"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetDeleteFlow}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                  aria-label="Close delete dialog"
                  disabled={Boolean(deletingOrderId) || deleteScanLoading}
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mt-6 space-y-4">
                {(deleteScan?.linkedServices || []).length > 0 ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-sm font-bold text-amber-800">
                      Delete these services first
                    </p>
                    <p className="mt-1 text-sm text-amber-700">
                      {deleteScan.linkedServices.length} service
                      {deleteScan.linkedServices.length === 1 ? " is" : "s are"} attached to this
                      project. They are separate orders and are not deleted with it — clear them
                      first, or they will be left pointing at a project that no longer exists.
                    </p>
                    <ul className="mt-3 space-y-1.5">
                      {deleteScan.linkedServices.map((service) => (
                        <li key={service.orderId} className="flex items-center justify-between gap-3">
                          <span className="min-w-0 truncate text-sm font-semibold text-amber-900">
                            {service.name}
                          </span>
                          <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold capitalize text-amber-800">
                            {/* Same derivation as every other service badge in the app
                                (backend/helpers/orderStatusEngine.js). The inline version below
                                is the fallback for a linked-service payload that carries only the
                                few columns getOrderDetails selects for it. */}
                            {service.orderState?.label
                              || (service.orderVisibility === "cancelled"
                                ? "Cancelled"
                                : (service.servicePlanStatus || "active").replace("_", " "))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {deleteNeedsCancelFirst ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-sm font-bold text-amber-800">Cancel this project first</p>
                    <p className="mt-1 text-sm text-amber-700">
                      Payments were received for this project. Cancel it so the money is refunded
                      and recorded, then delete the record.
                    </p>
                  </div>
                ) : null}
                {deleteScanLoading ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    Scanning linked records...
                  </div>
                ) : null}

                {deleteError ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                    {deleteError}
                  </div>
                ) : null}

                {deleteScan && !deleteScanLoading ? (
                  <>
                    <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Select every existing section</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Missing sections stay disabled, present sections must be checked.
                          </p>
                        </div>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500">
                          {deleteRequiredSections.length} active
                        </span>
                      </div>

                      <div
                        className="mt-4 space-y-2"
                        onKeyDown={(event) => {
                          if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Enter") return;
                          const refs = deleteCheckboxRefs.current;
                          const currentIndex = refs.findIndex((el) => el === document.activeElement);
                          if (currentIndex === -1) return;

                          const focusNext = () => {
                            const nextRef = refs[currentIndex + 1];
                            if (nextRef) {
                              nextRef.focus();
                            } else {
                              deleteSubmitButtonRef.current?.focus();
                            }
                          };

                          if (event.key === "Enter") {
                            event.preventDefault();
                            deletePendingAdvanceIndex.current = currentIndex;
                            handleToggleDeleteSection(deleteRequiredSections[currentIndex]?.key);
                            return;
                          }

                          if (event.key === "ArrowDown") {
                            event.preventDefault();
                            focusNext();
                            return;
                          }

                          if (event.key === "ArrowUp") {
                            const prevRef = refs[currentIndex - 1];
                            if (!prevRef) return;
                            event.preventDefault();
                            prevRef.focus();
                          }
                        }}
                      >
                        {(() => {
                          deleteCheckboxRefs.current = [];
                          let navigableIndex = -1;
                          return deleteChecklistSections.map((section) => {
                            const isLocked = !section.present;
                            const isChecked = isLocked ? true : Boolean(deleteSelections[section.key]);
                            if (!isLocked) navigableIndex += 1;
                            const refIndex = navigableIndex;

                            return (
                              <label
                                key={section.key}
                                className={[
                                  "flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition",
                                  isLocked
                                    ? "cursor-not-allowed border-slate-200 bg-white text-slate-400"
                                    : "cursor-pointer border-slate-200 bg-white text-slate-700 hover:border-emerald-200 hover:bg-emerald-50/40 focus-within:border-emerald-400 focus-within:bg-emerald-50/60 focus-within:ring-2 focus-within:ring-emerald-200",
                                ].join(" ")}
                              >
                                <input
                                  type="checkbox"
                                  ref={isLocked ? null : (el) => { deleteCheckboxRefs.current[refIndex] = el; }}
                                  className="h-4 w-4 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                  checked={isChecked}
                                  disabled={isLocked || Boolean(deletingOrderId)}
                                  onChange={() => handleToggleDeleteSection(section.key)}
                                />
                                <span className="min-w-0 flex-1 truncate font-semibold text-slate-900">
                                  {section.label}
                                </span>
                                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                                  {section.count}
                                </span>
                                <span
                                  className={[
                                    "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                    section.present ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400",
                                  ].join(" ")}
                                >
                                  {section.present ? "Present" : "Missing"}
                                </span>
                              </label>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  </>
                ) : null}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  ref={deleteSubmitButtonRef}
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={Boolean(deletingOrderId) || deleteScanLoading || !allDeleteSectionsSelected || deleteNeedsCancelFirst}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-700 focus:animate-pulse focus:ring-4 focus:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {deletingOrderId ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 size={16} />
                      Delete selected sections
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {showCreateProjectForm ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6">
            <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl">
              <CreateProjectForClientForm
                clientName={clientName}
                customerId={customerId}
                onCancel={() => setShowCreateProjectForm(false)}
                onCreated={() => {
                  setShowCreateProjectForm(false);
                  setWorkspaceRefreshKey((current) => current + 1);
                }}
              />
            </div>
          </div>
        ) : null}

        {showTrashConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
            <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl">
              <div className="px-6 pt-6">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
                  <Trash2 size={24} />
                </div>
                <h2 className="mt-4 text-center text-lg font-bold text-slate-900">Move client to Trash?</h2>
                <p className="mt-2 text-center text-sm text-slate-600">
                  <span className="font-semibold text-slate-900">{customer?.name || "This client"}</span> will be hidden
                  and unable to log in. You can restore it from Trash within 30 days before it is permanently deleted.
                </p>
              </div>
              <div className="flex justify-center gap-3 px-6 py-6">
                <button
                  type="button"
                  onClick={() => !trashing && setShowTrashConfirm(false)}
                  disabled={trashing}
                  className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleTrashClient}
                  disabled={trashing}
                  className="inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {trashing ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  {trashing ? "Moving…" : "Move to Trash"}
                </button>
              </div>
            </div>
          </div>
        )}

    </AdminLayout>
  );
};

const formatFileSize = (bytes) => {
  const n = Number(bytes) || 0;
  if (n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const getDocKindMeta = (doc) => {
  if (doc?.kind === "proposal") {
    return { label: `Proposal v${doc.version}`, badge: "bg-amber-50 text-amber-700 border-amber-200" };
  }
  if (doc?.kind === "follow-up") {
    return { label: "Follow-up Document", badge: "bg-sky-50 text-sky-700 border-sky-200" };
  }
  if (doc?.source === "agreement") {
    return { label: "Agreement", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  }
  return { label: "Document", badge: "bg-slate-100 text-slate-600 border-slate-200" };
};

const ClientDocumentsPanel = ({ documents, loading, error, uploading, onUpload, formatDateTime }) => {
  const [file, setFile] = useState(null);
  const [source, setSource] = useState("agreement");
  const fileInputRef = useRef(null);

  const submit = async () => {
    if (!file) {
      toast.error("Please choose a file first");
      return;
    }
    await onUpload({ file, source });
    setFile(null);
    setSource("agreement");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="mt-5 space-y-5">
      {/* Upload card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 text-slate-900">
          <Upload size={18} />
          <h3 className="text-base font-bold">Send a Document</h3>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Upload an agreement or document for this client. It appears in their Documents page even if no project is running.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-1 file:text-white focus:border-slate-400 sm:max-w-sm"
          />
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-400 sm:max-w-[10rem]"
          >
            <option value="agreement">Agreement</option>
            <option value="general">General</option>
          </select>
          <button
            type="button"
            onClick={submit}
            disabled={uploading}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            <Upload size={15} />
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </div>
      </div>

      {/* Timeline card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 text-slate-900">
          <FileText size={18} />
          <h3 className="text-base font-bold">Documents Timeline</h3>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading documents…</p>
        ) : error ? (
          <p className="mt-4 text-sm text-rose-600">{error}</p>
        ) : !documents || documents.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            No documents yet. Any document sent while this client was a lead, and any document you upload after conversion, will appear here.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {documents.map((doc) => {
              const meta = getDocKindMeta(doc);
              const sizeLabel = formatFileSize(doc.size);
              return (
                <li
                  key={doc.id}
                  className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${meta.badge}`}>
                        {meta.label}
                      </span>
                      <span className="truncate text-sm font-semibold text-slate-800">{doc.name || "Document"}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDateTime(doc.date)}
                      {sizeLabel ? ` · ${sizeLabel}` : ""}
                    </p>
                  </div>
                  {doc.downloadLink ? (
                    <a
                      href={doc.downloadLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <Download size={14} />
                      Download
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

const UploadLinksPanel = ({
  customer, orders, links, loading, loadingMore, hasMore, error, selectedOrderId, setSelectedOrderId,
  mode, setMode, generatedLink, generating, revokingId, onGenerate, onCopy, onRevoke, onLoadMore,
}) => {
  const eligibleOrders = (orders || []).filter((order) => {
    if (order?.isWebsiteProject === true) return true;
    const snapshot = order?.servicePlanSnapshot || {};
    return order?.isServicePlan === true && (snapshot.capability === "upload_data" || snapshot.serviceBehavior === "portal_access_control");
  });
  const labelFor = (order) => order?.projectSnapshot?.displayName || order?.servicePlanSnapshot?.serviceName || order?.orderItems?.[0]?.name || "Untitled record";
  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-start gap-3"><Share2 size={19} className="mt-0.5 text-slate-600" /><div><h2 className="text-lg font-bold text-slate-900">Secure Upload Link</h2><p className="mt-1 text-sm text-slate-500">Generate an upload-only link for one project or service. Generating again replaces its previous active link.</p></div></div>
        <div className="mt-5 grid gap-4 md:grid-cols-[1fr_12rem_auto] md:items-end">
          <label className="block"><span className="mb-1.5 block text-sm font-semibold text-slate-700">Project or service</span><select value={selectedOrderId} onChange={(event) => setSelectedOrderId(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800"><option value="">Select a record</option>{eligibleOrders.map((order) => <option key={order._id} value={order._id}>{labelFor(order)}</option>)}</select></label>
          <label className="block"><span className="mb-1.5 block text-sm font-semibold text-slate-700">Link usage</span><select value={mode} onChange={(event) => setMode(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800"><option value="single">Single use</option><option value="multiple">Multiple use</option></select></label>
          <button type="button" disabled={!selectedOrderId || generating} onClick={onGenerate} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{generating ? "Generating…" : "Generate / Regenerate"}</button>
        </div>
        <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${customer?.allowLoginFreeUploadLinks ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{customer?.allowLoginFreeUploadLinks ? "Client allows login-free upload links." : "Client requires credential verification before upload."}</div>
        {generatedLink ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-sm font-semibold text-emerald-900">New link — copy it now</p><div className="mt-2 flex gap-2"><input readOnly value={generatedLink} className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-700" /><button type="button" onClick={onCopy} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"><Copy size={15} />Copy</button></div><p className="mt-2 text-xs text-emerald-700">For security, the full link is shown only when generated.</p></div> : null}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="text-base font-bold text-slate-900">Link history</h3>{loading ? <p className="mt-4 text-sm text-slate-500">Loading links…</p> : error && !(links || []).length ? <p className="mt-4 text-sm text-rose-600">{error}</p> : !(links || []).length ? <p className="mt-4 text-sm text-slate-500">No upload links generated.</p> : <div className="mt-4 space-y-3">{links.map((link) => <div key={link._id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-slate-800">{labelFor(link.orderId)}</p><p className="mt-1 text-xs text-slate-500">{link.mode === "single" ? "Single use" : "Multiple use"} · {link.status} · Used {link.useCount || 0} time(s)</p></div>{link.status === "active" ? <button type="button" onClick={() => onRevoke(link._id)} disabled={revokingId === link._id} className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50"><Ban size={15} />{revokingId === link._id ? "Revoking…" : "Revoke"}</button> : null}</div>)}{error ? <p className="text-sm text-rose-600">{error}</p> : null}{hasMore ? <button type="button" onClick={onLoadMore} disabled={loadingMore} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">{loadingMore ? "Loading…" : "Load more"}</button> : null}</div>}</div>
    </section>
  );
};

const AccountAccessPanel = ({
  accessData,
  accessLoading,
  accessError,
  showPassword,
  setShowPassword,
  onCopyPassword,
  newPasswordInput,
  setNewPasswordInput,
  resetting,
  onResetPassword,
  statusUpdating,
  onToggleStatus,
  onRequestTrash,
}) => {
  if (accessLoading) {
    return (
      <div className="mt-5 rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
        Loading account details…
      </div>
    );
  }

  if (accessError) {
    return (
      <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {accessError}
      </div>
    );
  }

  if (!accessData) return null;

  const isActive = accessData.isActive !== false;
  const hasPlain = !!accessData.plainPassword;

  return (
    <div className="mt-5 space-y-5">
      {/* Login credentials */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 text-slate-900">
          <KeyRound size={18} />
          <h3 className="text-base font-bold">Login Credentials</h3>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Login Email</p>
            <p className="mt-1 break-all text-sm font-semibold text-slate-800">{accessData.email}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Password</p>
            {hasPlain ? (
              <div className="mt-1 flex items-center gap-2">
                <span className="rounded-lg bg-slate-100 px-3 py-1 font-mono text-sm text-slate-800">
                  {showPassword ? accessData.plainPassword : "••••••••"}
                </span>
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                  title={showPassword ? "Hide" : "Show"}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
                <button
                  type="button"
                  onClick={onCopyPassword}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                  title="Copy"
                >
                  <Copy size={15} />
                </button>
              </div>
            ) : (
              <p className="mt-1 text-sm text-slate-500">
                Not available yet — will appear after this user's next login, or set a new one below.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Reset password */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 text-slate-900">
          <RotateCcw size={18} />
          <h3 className="text-base font-bold">Reset Password</h3>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Set a new password for this client. They can log in with it immediately.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={newPasswordInput}
            onChange={(e) => setNewPasswordInput(e.target.value)}
            placeholder="New password (min 4 characters)"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-400 sm:max-w-xs"
          />
          <button
            type="button"
            onClick={onResetPassword}
            disabled={resetting}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            <Save size={15} />
            {resetting ? "Saving…" : "Set Password"}
          </button>
        </div>
      </div>

      {/* Login access (ban / enable) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 text-slate-900">
          {isActive ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}
          <h3 className="text-base font-bold">Login Access</h3>
        </div>
        <div className="mt-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-800">
              {isActive ? "Account is active" : "Account is disabled"}
            </p>
            <p className="mt-0.5 text-sm text-slate-500">
              {isActive
                ? "This client can log in normally."
                : "This client cannot log in until re-enabled."}
            </p>
          </div>
          <button
            type="button"
            onClick={onToggleStatus}
            disabled={statusUpdating}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-60 ${
              isActive
                ? "bg-rose-600 text-white hover:bg-rose-700"
                : "bg-emerald-600 text-white hover:bg-emerald-700"
            }`}
          >
            {statusUpdating ? "Updating…" : isActive ? "Disable Login" : "Enable Login"}
          </button>
        </div>
      </div>

      {/* Delete client — soft-delete into Trash (restorable for 30 days) */}
      <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-5">
        <div className="flex items-center gap-2 text-rose-700">
          <Trash2 size={18} />
          <h3 className="text-base font-bold">Delete Client</h3>
        </div>
        <div className="mt-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-800">Move this client to Trash</p>
            <p className="mt-0.5 text-sm text-slate-500">
              The client is hidden and login is blocked. You can restore it from Trash within 30 days before it is
              permanently deleted.
            </p>
          </div>
          <button
            type="button"
            onClick={onRequestTrash}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
          >
            <Trash2 size={15} />
            Move to Trash
          </button>
        </div>
      </div>
    </div>
  );
};

const PaymentInvoicesPanel = ({
  transactions,
  invoices,
  getBadgeClassName,
  formatDateTime,
  onOpenGroup,
  customerId,
  walletBalance = 0,
  onRecharged,
}) => {
  const activeTransactions = transactions.filter((transaction) => !transaction?.orderDeleted);
  const activeInvoices = invoices.filter((invoice) => !invoice?.orderDeleted);
  const pendingPayments = activeTransactions.filter((transaction) => transaction?.status === "pending");
  const unpaidInvoices = activeInvoices.filter((invoice) => ["unpaid", "overdue"].includes(invoice?.status));
  const paidInvoices = activeInvoices.filter((invoice) => invoice?.status === "paid");
  const completedPayments = activeTransactions.filter((transaction) => transaction?.status === "completed");
  const ledgerItems = buildLedgerItems(transactions, invoices).sort(
    (left, right) => right.sortDate - left.sortDate
  );
  const allLedgerGroups = groupLedgerItemsByProject(ledgerItems);
  // Deleted projects (order hard-deleted, but its transactions/invoices survive) are kept out
  // of this tab entirely — they have their own "Deleted Projects" tab so this list stays clean.
  const ledgerGroups = allLedgerGroups.filter((group) => !group.items.some((item) => item.orderDeleted));

  // Admin wallet recharge — instant credit (creditWalletInstant), shows up in the same ledger.
  const [showRecharge, setShowRecharge] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState("");
  const [rechargeMethod, setRechargeMethod] = useState("upi");
  const [rechargeReference, setRechargeReference] = useState("");
  const [rechargeNote, setRechargeNote] = useState("");
  const [recharging, setRecharging] = useState(false);

  const resetRecharge = () => {
    setShowRecharge(false);
    setRechargeAmount("");
    setRechargeMethod("upi");
    setRechargeReference("");
    setRechargeNote("");
  };

  const handleRecharge = async () => {
    const amount = Number(rechargeAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    try {
      setRecharging(true);
      const response = await fetch(
        `${SummaryApi.adminRechargeWallet.url}/${customerId}/recharge-wallet`,
        {
          method: SummaryApi.adminRechargeWallet.method,
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount,
            paymentMethod: rechargeMethod,
            reference: rechargeReference.trim(),
            note: rechargeNote.trim(),
          }),
        }
      );
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || "Recharge failed");
      }
      toast.success(result.message || "Wallet recharged");
      resetRecharge();
      onRecharged?.();
    } catch (error) {
      console.error("Error recharging wallet:", error);
      toast.error(error.message || "Recharge failed");
    } finally {
      setRecharging(false);
    }
  };

  return (
    <section className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <AdminInfoPill label="Paid Payments" value={completedPayments.length} />
        <AdminInfoPill label="Pending Payments" value={pendingPayments.length} />
        <AdminInfoPill label="Unpaid Invoices" value={unpaidInvoices.length} />
        <AdminInfoPill label="Paid Invoices" value={paidInvoices.length} />
      </div>

      {/* Wallet balance + admin recharge */}
      <div className="flex flex-col gap-3 rounded-[1.5rem] border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
            <Wallet size={20} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Wallet balance</p>
            <p className="text-xl font-bold text-slate-900">₹{walletBalance.toLocaleString("en-IN")}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowRecharge(true)}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          <Wallet size={16} />
          Recharge Wallet
        </button>
      </div>

      <div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Payments</h2>
            <p className="mt-1 text-sm text-slate-500">Open a project or plan to see its complete payment history.</p>
          </div>
        </div>

        <div className="mt-5 space-y-5">
          {ledgerGroups.length === 0 ? (
            <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 p-6 text-center text-slate-500">
              No payment or invoice records found for this client.
            </div>
          ) : (
            ledgerGroups.map((group) => {
              const finalInvoice = group.items.find((item) => item.raw?.invoiceType === "project_final")?.raw || null;
              const finalInvoiceBalance = Math.max(
                0,
                Number(finalInvoice?.amount || 0) - Number(finalInvoice?.amountPaid || 0)
              );

              return (
              <button
                key={group.key}
                type="button"
                onClick={() => onOpenGroup?.(group)}
                className="flex w-full items-center justify-between gap-4 rounded-[1.5rem] border border-slate-200 bg-white px-5 py-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50/30"
              >
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-slate-900">{group.serviceName}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {group.items.length} {group.items.length === 1 ? "payment" : "payments"} · Last activity {formatDateTime(group.items[0]?.date)}
                  </p>
                  {finalInvoice ? (
                    <p className={`mt-2 text-xs font-bold ${finalInvoiceBalance === 0 ? "text-emerald-700" : "text-amber-700"}`}>
                      {finalInvoiceBalance === 0 ? "Fully paid" : `Pending ${formatCurrency(finalInvoiceBalance)}`}
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  Open payments
                </span>
              </button>
              );
            })
          )}
        </div>
      </div>

      {/* Admin recharge modal */}
      {showRecharge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" onClick={resetRecharge}>
          <div className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-600">Wallet recharge</p>
                <h3 className="mt-1 text-xl font-bold text-slate-900">Add money to client wallet</h3>
                <p className="mt-1 text-sm text-slate-500">Credited instantly — no approval needed. Appears in the client's wallet history.</p>
              </div>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">Amount (₹)</span>
                <input
                  type="number"
                  min="1"
                  value={rechargeAmount}
                  onChange={(e) => setRechargeAmount(e.target.value)}
                  placeholder="e.g. 500"
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-emerald-400"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">Method</span>
                <select
                  value={rechargeMethod}
                  onChange={(e) => setRechargeMethod(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-emerald-400"
                >
                  <option value="upi">UPI</option>
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank transfer</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">Reference (optional)</span>
                <input
                  type="text"
                  value={rechargeReference}
                  onChange={(e) => setRechargeReference(e.target.value)}
                  placeholder="UPI ID / bank reference"
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-emerald-400"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">Note (internal, optional)</span>
                <textarea
                  value={rechargeNote}
                  onChange={(e) => setRechargeNote(e.target.value)}
                  rows={2}
                  placeholder="e.g. Cash collected in person"
                  className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-emerald-400"
                />
              </label>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={resetRecharge}
                disabled={recharging}
                className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRecharge}
                disabled={recharging}
                className="flex-1 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {recharging ? "Recharging…" : "Recharge"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

// Shows the payment/invoice history of projects whose order was hard-deleted
// (deleteOrder.js) — their transactions/invoices survive with a broken orderId reference,
// flagged orderDeleted by getAdminUserWorkspace.js. Kept out of PaymentInvoicesPanel so that
// tab stays limited to the client's current projects; this tab is the only place that history
// is still visible. Read-only — no recharge/actions here, matching what a deleted project's
// records actually support.
const DeletedProjectsPanel = ({ transactions, invoices, formatDateTime, onOpenGroup }) => {
  const ledgerItems = buildLedgerItems(transactions, invoices);
  const deletedGroups = groupLedgerItemsByProject(ledgerItems).filter((group) =>
    group.items.some((item) => item.orderDeleted)
  );

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Deleted Projects</h2>
        <p className="mt-1 text-sm text-slate-500">
          Payment history for projects that were deleted. The project itself is gone; its
          payment records are kept here for reference.
        </p>
      </div>

      <div className="space-y-5">
        {deletedGroups.length === 0 ? (
          <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 p-6 text-center text-slate-500">
            No deleted projects with payment records for this client.
          </div>
        ) : (
          deletedGroups.map((group) => {
            const latestItem = group.items[0];
            const typeLabel = group.deletedProjectType === "plan" ? "Plan" : group.deletedProjectType === "project" ? "Project" : null;
            // Every fact below is read from the snapshot written by deleteOrder.js. Records
            // deleted before that snapshot existed simply have nothing to show, so each line
            // is rendered only when its own value is present.
            const facts = [
              typeLabel,
              group.startDate ? `Purchased ${formatDate(group.startDate)}` : null,
              group.deletedProjectDeletedAt ? `Deleted ${formatDate(group.deletedProjectDeletedAt)}` : null,
              // Falls back to the last payment record's own method for pre-snapshot deletions.
              // latestItem.method is already human text (paymentLedger.js); the raw snapshot
              // field needs its own translation.
              group.deletedProjectPaymentMethod
                ? `Paid by ${getPaymentMethodText(group.deletedProjectPaymentMethod)}`
                : latestItem?.method
                ? `Paid by ${latestItem.method}`
                : null,
            ].filter(Boolean);
            return (
              <button
                key={group.key}
                type="button"
                onClick={() => onOpenGroup?.(group)}
                className="flex w-full items-center justify-between gap-4 rounded-[1.5rem] border border-slate-200 bg-white px-5 py-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50/30"
              >
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-slate-900">{group.serviceName}</p>
                  <p className="mt-1 text-sm text-slate-500">{facts.join(" · ")}</p>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  Open payments
                </span>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
};

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"];
const getOrdinal = (n) => ORDINALS[n - 1] || `${n}th`;
const getOrderReference = (value) => String(value?._id || value || "");

const getInvoiceLabel = (invoice) => {
  if (invoice?.invoiceType === "project_final") return "Final Project Invoice";
  if (invoice?.invoiceType === "service_statement") return "Service Billing Statement";
  if (invoice?.installmentNumber) return `${getOrdinal(invoice.installmentNumber)} Installment Invoice`;
  if (invoice?.invoiceType === "plan_renewal") return "Plan Renewal Invoice";
  return "Invoice";
};

const getPaymentLabel = (transaction) => {
  if (transaction?.installmentNumber) return `${getOrdinal(transaction.installmentNumber)} Installment`;
  if (transaction?.type === "renewal") return "Renewal Payment";
  if (transaction?.type === "deposit") return "Wallet Recharge";
  return "Payment";
};

// In-place payment-group subpage — same pattern as the Projects/Plans subpages
// (activeProjectId/activePlanId): no route navigation, Back is a simple state-clear via
// the onBack prop. Adapted from AdminPaymentRecordDetail.js's PaymentOrderHistory, which
// remains a standalone routed page (used by any direct link) but is no longer how this
// workspace's own Payments tab opens a project's history.
const PaymentOrderHistorySubpage = ({ customerId, orderId, onBack }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [workspace, setWorkspace] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [actionTarget, setActionTarget] = useState(null);
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("upi");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [finalInvoiceAction, setFinalInvoiceAction] = useState("");
  const isGeneralPayments = orderId === "general";

  useEffect(() => {
    let isMounted = true;

    const loadWorkspace = async () => {
      try {
        setLoading(true);
        setError("");
        const response = await fetch(`${SummaryApi.adminUserWorkspace.url}?customerId=${customerId}`, {
          method: SummaryApi.adminUserWorkspace.method,
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.message || "Failed to load payment history");
        if (isMounted) setWorkspace(result.data || null);
      } catch (loadError) {
        if (!isMounted) return;
        console.error("Error loading payment history:", loadError);
        setError(loadError.message || "Failed to load payment history");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadWorkspace();
    return () => {
      isMounted = false;
    };
  }, [customerId, orderId, reloadKey]);

  const { order, invoices, finalInvoice, transactions, combinedRecords, paymentGroups, serviceName, invoiceValue, recordedPayments, pendingRecords, initialProjectInvoiceId } = useMemo(() => {
    const allOrders = workspace?.orders || [];
    const allInvoices = workspace?.invoices || [];
    const allTransactions = workspace?.transactions || [];
    const matchesOrder = (record) => {
      const linkedOrderId = getOrderReference(record?.orderId);
      return isGeneralPayments ? !linkedOrderId : linkedOrderId === String(orderId);
    };
    const matchingInvoices = allInvoices.filter(matchesOrder).sort(
      (left, right) => new Date(right.invoiceDate || right.createdAt || 0) - new Date(left.invoiceDate || left.createdAt || 0)
    );
    const matchingTransactions = allTransactions.filter(matchesOrder).sort(
      (left, right) => new Date(right.date || right.createdAt || 0) - new Date(left.date || left.createdAt || 0)
    );
    const matchingOrder = isGeneralPayments
      ? null
      : allOrders.find((candidate) => String(candidate?._id) === String(orderId)) || null;
    const resolvedServiceName = isGeneralPayments
      ? "Wallet & General Payments"
      : getOrderDisplayName(matchingOrder || matchingInvoices[0]?.orderId || matchingTransactions[0]?.orderId, "Payment History");
    const projectFinalInvoice = matchingInvoices.find((current) => current.invoiceType === "project_final") || null;
    const serviceStatement = matchingInvoices.find((current) => current.invoiceType === "service_statement") || null;
    const paymentInvoices = matchingInvoices.filter((current) => !["project_final", "service_statement"].includes(current.invoiceType));
    const totalInvoiceValue = paymentInvoices.reduce((sum, current) => sum + Number(current.amount || 0), 0);
    const totalRecordedPayments = matchingTransactions
      .filter((current) => current.status === "completed")
      .reduce((sum, current) => sum + Number(current.amount || 0), 0);
    const totalPendingRecords = matchingInvoices.filter((current) => ["unpaid", "partially_paid", "overdue"].includes(current.status)).length
      + matchingTransactions.filter((current) => current.status === "pending").length;
    const firstPendingProjectInvoice = matchingInvoices
      .filter((current) => current.invoiceType === "project" && ["unpaid", "overdue"].includes(current.status))
      .sort((left, right) => Number(left.installmentNumber || 1) - Number(right.installmentNumber || 1))[0];

    // Combine invoice + transaction into one row per real-world payment event, same intent
    // as paymentLedger.js's buildLedgerItems() dedup (transaction.invoiceId links the two).
    // An invoice with a linked transaction shows the transaction's status/method/reference
    // (the actual payment attempt) alongside the invoice's own number/due date; an invoice
    // with no transaction yet, or a transaction with no invoice (e.g. wallet-only general
    // payment), each get their own row.
    // One invoice can be settled by SEVERAL payments — a combined wallet+UPI purchase puts a
    // completed wallet leg and a pending UPI leg on the SAME invoice. Was: a Map keyed by
    // invoiceId, which holds one transaction per invoice, so the second leg silently overwrote
    // the first and only one row ever rendered. For a ₹2,500 combined purchase that meant the
    // ₹500 wallet row showed while the ₹2,000 UPI payment — the one actually awaiting the
    // admin's approval — had no row and therefore no Review button at all. Now every linked
    // transaction is kept, so each real payment event gets its own row.
    const transactionsByInvoiceId = new Map();
    matchingTransactions.forEach((transaction) => {
      const linkedInvoiceId = getOrderReference(transaction?.invoiceId);
      if (!linkedInvoiceId) return;
      if (!transactionsByInvoiceId.has(linkedInvoiceId)) transactionsByInvoiceId.set(linkedInvoiceId, []);
      transactionsByInvoiceId.get(linkedInvoiceId).push(transaction);
    });
    const linkedTransactionIds = new Set(
      [...transactionsByInvoiceId.values()].flat().map((transaction) => String(transaction._id))
    );

    // An invoice with N linked payments becomes N rows (each showing that payment's own status,
    // method and reference against the shared invoice); an invoice with none still shows once.
    const combinedFromInvoices = paymentInvoices.flatMap((invoice) => {
      const linked = transactionsByInvoiceId.get(String(invoice._id)) || [];
      if (!linked.length) {
        return [{
          key: `invoice-${invoice._id}`,
          invoice,
          transaction: null,
          sortDate: new Date(invoice.invoiceDate || invoice.createdAt || 0).getTime(),
        }];
      }
      return linked.map((transaction) => ({
        key: `invoice-${invoice._id}-txn-${transaction._id}`,
        invoice,
        transaction,
        sortDate: new Date(transaction.date || transaction.createdAt || invoice.invoiceDate || 0).getTime(),
      }));
    });
    const combinedFromUnlinkedTransactions = matchingTransactions
      .filter((transaction) => !linkedTransactionIds.has(String(transaction._id)) && !getOrderReference(transaction?.invoiceId))
      .map((transaction) => ({
        key: `transaction-${transaction._id}`,
        invoice: null,
        transaction,
        sortDate: new Date(transaction.date || transaction.createdAt || 0).getTime(),
      }));
    const combinedRecords = [...combinedFromInvoices, ...combinedFromUnlinkedTransactions].sort(
      (left, right) => right.sortDate - left.sortDate
    );

    // One installment invoice can be settled by several payments (e.g. part wallet, part UPI —
    // see the comment above transactionsByInvoiceId). combinedRecords already gives each leg its
    // own row so nothing about approvals/downloads changes; this only decides how those rows are
    // grouped on screen, so two "3rd Installment" cards don't sit side by side with no way to
    // tell they are the same bill split across two payments.
    const paymentGroups = [];
    const groupByInvoiceId = new Map();
    combinedRecords.forEach((record) => {
      const invoiceId = record.invoice ? String(record.invoice._id) : null;
      if (invoiceId && groupByInvoiceId.has(invoiceId)) {
        const group = groupByInvoiceId.get(invoiceId);
        group.records.push(record);
        group.sortDate = Math.max(group.sortDate, record.sortDate);
        return;
      }
      const group = { key: invoiceId ? `group-${invoiceId}` : record.key, invoice: record.invoice, records: [record], sortDate: record.sortDate };
      if (invoiceId) groupByInvoiceId.set(invoiceId, group);
      paymentGroups.push(group);
    });
    paymentGroups.sort((left, right) => right.sortDate - left.sortDate);

    return {
      order: matchingOrder,
      invoices: paymentInvoices,
      finalInvoice: projectFinalInvoice || serviceStatement,
      transactions: matchingTransactions,
      combinedRecords,
      paymentGroups,
      serviceName: resolvedServiceName,
      invoiceValue: totalInvoiceValue,
      recordedPayments: totalRecordedPayments,
      pendingRecords: totalPendingRecords,
      initialProjectInvoiceId: firstPendingProjectInvoice?._id || null,
    };
  }, [isGeneralPayments, orderId, workspace]);

  // File names are built from the project/plan name, never the invoice number — a number
  // means nothing to a person browsing their downloads folder.
  const invoiceFileName = (label) => `${(serviceName || "Invoice").replace(/[^\w\s-]/g, "").trim()} - ${label}.pdf`;

  const handleFinalInvoiceDownload = async () => {
    if (!finalInvoice || finalInvoiceAction) return;
    try {
      setFinalInvoiceAction("download");
      // One document endpoint for every invoice type — the backend decides the layout from the
      // invoice's own type, so the admin and the customer download the identical PDF.
      await downloadAuthenticatedFile(
        `${SummaryApi.invoices.downloadDocument.url}/${finalInvoice._id}/download`,
        invoiceFileName("Summary"),
      );
      toast.success("Final invoice download started");
    } catch (error) {
      toast.error(error.message || "Failed to download final invoice");
    } finally {
      setFinalInvoiceAction("");
    }
  };

  const handleFinalInvoiceView = () => {
    if (!finalInvoice || finalInvoiceAction) return;
    window.open(`${SummaryApi.invoices.viewDocument.url}/${finalInvoice._id}/view`, "_blank", "noopener,noreferrer");
  };

  const handleFinalInvoiceNativeShare = async () => {
    if (!finalInvoice || finalInvoiceAction) return;
    if (!navigator.share || !navigator.canShare) {
      toast.error("Native PDF sharing is not supported on this browser. Use Download instead.");
      return;
    }
    try {
      setFinalInvoiceAction("nativeShare");
      const response = await fetch(`${SummaryApi.invoices.downloadDocument.url}/${finalInvoice._id}/download`, { credentials: "include" });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || "Failed to prepare final invoice");
      const file = new File([await response.blob()], invoiceFileName("Summary"), { type: "application/pdf" });
      if (!navigator.canShare({ files: [file] })) throw new Error("Native PDF sharing is not supported on this device");
      await navigator.share({ title: serviceName || "Invoice", files: [file] });
    } catch (error) {
      if (error.name !== "AbortError") toast.error(error.message || "Failed to share final invoice");
    } finally {
      setFinalInvoiceAction("");
    }
  };

  // Per-record (regular, non-final) invoice download — same download-invoice endpoint
  // AdminPaymentRecordDetail.js's single-record page uses, now called directly from a row
  // here instead of requiring a navigate-away.
  const [invoiceRowAction, setInvoiceRowAction] = useState(null);

  const handleInvoiceDownload = async (invoice) => {
    if (!invoice?._id || invoiceRowAction) return;
    try {
      setInvoiceRowAction(`download-${invoice._id}`);
      await downloadAuthenticatedFile(
        `${SummaryApi.adminPaymentRecord.url}/${customerId}/payment-records/invoice/${invoice._id}/download-invoice`,
        invoiceFileName(getInvoiceLabel(invoice)),
      );
      toast.success("Invoice download started");
    } catch (error) {
      toast.error(error.message || "Failed to download invoice");
    } finally {
      setInvoiceRowAction(null);
    }
  };

  const openAction = (type, record) => {
    setActionTarget({ type, record });
    setPaymentMethod(record?.paymentMethod || "upi");
    setPaymentReference(record?.transactionReference || record?.upiTransactionId || "");
    setPaymentNote("");
    setRejectionReason("");
  };

  const closeAction = () => {
    if (!actionSubmitting) setActionTarget(null);
  };

  const completeAction = async (decision) => {
    if (!actionTarget || actionSubmitting) return;
    const { type, record } = actionTarget;

    if (["transaction", "projectApproval"].includes(type) && decision === "reject" && !rejectionReason.trim()) {
      toast.error("Rejection reason is required");
      return;
    }

    try {
      setActionSubmitting(true);
      let response;

      if (type === "transaction") {
        response = await fetch(
          decision === "approve" ? SummaryApi.wallet.approveTransaction.url : SummaryApi.wallet.rejectTransaction.url,
          {
            method: decision === "approve" ? SummaryApi.wallet.approveTransaction.method : SummaryApi.wallet.rejectTransaction.method,
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              decision === "approve"
                ? { transactionId: record.transactionId }
                : { transactionId: record.transactionId, rejectionReason: rejectionReason.trim() }
            ),
          }
        );
      } else if (type === "planInvoice") {
        response = await fetch(`${SummaryApi.invoices.markInvoiceAsPaid.url}/${record._id}/mark-paid`, {
          method: SummaryApi.invoices.markInvoiceAsPaid.method,
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paymentMethod,
            transactionReference: paymentReference.trim(),
            internalNote: paymentNote.trim(),
          }),
        });
      } else {
        response = await fetch(`${SummaryApi.approveProjectOrder.url}/${order._id}/approval`, {
          method: SummaryApi.approveProjectOrder.method,
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            decision === "record"
              ? {
                  mode: "approve_with_payment",
                  paymentMethod,
                  transactionReference: paymentReference.trim(),
                  notes: paymentNote.trim(),
                }
              : { mode: "reject", rejectionReason: rejectionReason.trim() }
          ),
        });
      }

      const result = await response.json();
      if (!result.success) throw new Error(result.message || "Payment action failed");

      toast.success(result.message || "Payment record updated");
      setActionTarget(null);
      setReloadKey((current) => current + 1);
    } catch (actionError) {
      console.error("Error updating payment record:", actionError);
      toast.error(actionError.message || "Payment action failed");
    } finally {
      setActionSubmitting(false);
    }
  };

  const totalAmount = Number(order?.totalAmount ?? order?.price ?? 0);
  const paidAmount = Number(order?.paidAmount ?? 0);
  const remainingAmount = Math.max(0, totalAmount - paidAmount);
  const installmentProgress = order?.isPartialPayment && Array.isArray(order?.installments)
    ? `Installment ${order?.currentInstallment || 1} of ${order.installments.length}`
    : null;

  return (
    <section className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
      >
        <ArrowLeft size={16} />
        Back to Payments
      </button>

      {loading ? (
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">Loading payment history...</div>
      ) : error ? (
        <div className="rounded-[2rem] border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">{error}</div>
      ) : (
        <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
          {/* Split layout: left keeps the title + summary table as-is, right starts from the
              same top row (Payment Records) instead of sitting below a separate title band. */}
          <div className="grid grid-cols-1 lg:grid-cols-2">
            <div className="overflow-x-auto border-b border-slate-200 lg:border-b-0 lg:border-r">
              <div className="p-5 sm:p-6">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Project / Plan Payment History</p>
                <h1 className="mt-2 text-2xl font-bold text-slate-900">{serviceName}</h1>
                <p className="mt-2 text-sm text-slate-500">All invoices and payment requests linked to this {isGeneralPayments ? "customer account" : "project or plan"}.</p>
              </div>
              <table className="w-full min-w-[420px] border-collapse border-t border-slate-200 text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-3 sm:px-6">Description</th>
                    <th className="px-5 py-3 sm:px-6">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {!isGeneralPayments && order ? (
                    <tr>
                      <td className="px-5 py-3 font-semibold text-slate-900 sm:px-6">Category</td>
                      <td className="px-5 py-3 text-slate-600 sm:px-6">{getCategoryLabel(getProjectCategory(order))}</td>
                    </tr>
                  ) : null}
                  {!isGeneralPayments && order ? (
                    <tr>
                      <td className="px-5 py-3 font-semibold text-slate-900 sm:px-6">Started</td>
                      <td className="px-5 py-3 text-slate-600 sm:px-6">{formatDateTime(order.createdAt)}</td>
                    </tr>
                  ) : null}
                  <tr>
                    <td className="px-5 py-3 font-semibold text-slate-900 sm:px-6">Total amount</td>
                    <td className="px-5 py-3 text-slate-600 sm:px-6">{formatCurrency(totalAmount)}</td>
                  </tr>
                  <tr>
                    <td className="px-5 py-3 font-semibold text-slate-900 sm:px-6">Paid</td>
                    <td className="px-5 py-3 text-slate-600 sm:px-6">{formatCurrency(paidAmount)}</td>
                  </tr>
                  <tr>
                    <td className="px-5 py-3 font-semibold text-slate-900 sm:px-6">Remaining</td>
                    <td className="px-5 py-3 text-slate-600 sm:px-6">{formatCurrency(remainingAmount)}</td>
                  </tr>
                  <tr>
                    <td className="px-5 py-3 font-semibold text-slate-900 sm:px-6">How they pay</td>
                    <td className="px-5 py-3 text-slate-600 sm:px-6">{order?.isPartialPayment ? "In parts" : "In full"}</td>
                  </tr>
                  {installmentProgress ? (
                    <tr>
                      <td className="px-5 py-3 font-semibold text-slate-900 sm:px-6">Parts paid so far</td>
                      <td className="px-5 py-3 text-slate-600 sm:px-6">{installmentProgress}</td>
                    </tr>
                  ) : null}
                  <tr>
                    <td className="px-5 py-3 font-semibold text-slate-900 sm:px-6">Still pending</td>
                    <td className="px-5 py-3 text-slate-600 sm:px-6">{pendingRecords}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="p-5 sm:p-6">
              {/* Combined project invoice — its own heading + card, one statement per project
                  covering the total amount and every completed payment against it. */}
              {finalInvoice ? (
                <>
                  <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Summary</h2>
                  <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">{finalInvoice.invoiceType === "service_statement" ? "Total for this plan" : "Total for this project"}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <p className="text-base font-bold text-slate-900">{formatCurrency(finalInvoice.amount)}</p>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getBadgeClassName(getLedgerStatusLabel(finalInvoice.status))}`}>{getLedgerStatusLabel(finalInvoice.status)}</span>
                    </div>
                    <p className="mt-2 text-xs font-semibold text-emerald-700">
                      {Number(finalInvoice.amount || 0) - Number(finalInvoice.amountPaid || 0) > 0
                        ? `${formatCurrency(Number(finalInvoice.amount || 0) - Number(finalInvoice.amountPaid || 0))} still to come`
                        : "Fully paid"}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={handleFinalInvoiceView} disabled={Boolean(finalInvoiceAction)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 disabled:opacity-60"><Eye size={13} />View</button>
                      <button type="button" onClick={handleFinalInvoiceDownload} disabled={Boolean(finalInvoiceAction)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 disabled:opacity-60"><Download size={13} />{finalInvoiceAction === "download" ? "Preparing..." : "Download"}</button>
                      <button type="button" onClick={handleFinalInvoiceNativeShare} disabled={Boolean(finalInvoiceAction)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 disabled:opacity-60"><Share2 size={13} />{finalInvoiceAction === "nativeShare" ? "Preparing..." : "Share"}</button>
                    </div>
                  </div>
                </>
              ) : null}

              {/* Payment records — one card per real payment event (invoice + its linked
                  transaction combined), grouped by invoice so a bill split across several
                  payments (e.g. part wallet, part UPI) reads as one thing with a total, not
                  as two identically-named cards with no visible link between them. */}
              <div className={`flex items-center justify-between gap-3 ${finalInvoice ? "mt-6" : ""}`}>
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Payments</h2>
              </div>

              {paymentGroups.length === 0 ? (
                <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No payment records found.</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {paymentGroups.map((group) => {
                    const renderLeg = ({ key, invoice, transaction }, { compact } = {}) => {
                      const isRecurringPlanInvoice = invoice && invoice.invoiceType !== "project";
                      const canRecordPlanInvoice = invoice && isRecurringPlanInvoice && ["unpaid", "overdue"].includes(invoice.status);
                      const canResolvePendingProject = invoice
                        && invoice.invoiceType === "project"
                        && order?.orderVisibility === "pending-approval"
                        && transactions.length === 0
                        && String(invoice._id) === String(initialProjectInvoiceId);
                      const canReviewTransaction = transaction && transaction.status === "pending";

                      // Transaction is the actual payment attempt, so its status/method/reference
                      // take priority when both exist; invoice-only rows fall back to invoice status.
                      const displayLabel = invoice ? getInvoiceLabel(invoice) : getPaymentLabel(transaction);
                      const displayStatus = getLedgerStatusLabel(transaction?.status || invoice?.status);
                      const displayAmount = transaction?.amount ?? invoice?.amount ?? 0;
                      const isBusyDownload = invoiceRowAction === `download-${invoice?._id}`;

                      return (
                        <div key={key} className={compact ? "border-t border-slate-100 pt-3" : "rounded-2xl border border-slate-200 p-4"}>
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-semibold text-slate-900">{compact ? getPaymentMethodText(transaction?.paymentMethod) : displayLabel}</p>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getBadgeClassName(displayStatus)}`}>{displayStatus}</span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {!compact && invoice ? `Due ${formatDateTime(invoice.dueDate)} · Issued ${formatDateTime(invoice.invoiceDate)}` : null}
                            {!compact && invoice && transaction ? " · " : null}
                            {transaction ? `${compact ? "" : `${getPaymentMethodText(transaction.paymentMethod)} · `}${formatDateTime(transaction.date || transaction.createdAt)}` : null}
                          </p>
                          {transaction?.rejectionReason ? <p className="mt-1 text-xs text-rose-700">Reason: {transaction.rejectionReason}</p> : null}

                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                            <p className="text-base font-bold text-slate-900">{formatCurrency(displayAmount)}</p>
                            <div className="flex flex-wrap justify-end gap-2">
                              {canReviewTransaction ? (
                                <button type="button" onClick={() => openAction("transaction", transaction)} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800">Review Payment</button>
                              ) : canRecordPlanInvoice ? (
                                <button type="button" onClick={() => openAction("planInvoice", invoice)} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700">Review & Record Payment</button>
                              ) : canResolvePendingProject ? (
                                <button type="button" onClick={() => openAction("projectApproval", invoice)} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700">Review Initial Payment</button>
                              ) : null}

                              {/* A project installment invoice is a payment target, not a document:
                                  the whole project is stated once in the Combined Invoice card above,
                                  which already carries the total, every installment and what is paid.
                                  Plan/service cycle invoices keep their own download. */}
                              {!compact && invoice?.invoiceNumber && invoice.invoiceType !== "project" ? (
                                <button type="button" onClick={() => handleInvoiceDownload(invoice)} disabled={Boolean(invoiceRowAction)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 disabled:opacity-60"><Download size={13} />{isBusyDownload ? "Preparing..." : "Download"}</button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    };

                    if (group.records.length === 1) return renderLeg(group.records[0]);

                    // Multiple payments settling the same invoice: one wrapper card with the
                    // combined total up top, each payment as its own compact row underneath —
                    // same label, same amount fields, same per-leg buttons as a solo card, just
                    // grouped so the split reads as one bill instead of two unrelated ones.
                    const groupTotal = group.records.reduce((sum, record) => sum + Number(record.transaction?.amount ?? record.invoice?.amount ?? 0), 0);
                    const groupLabel = getInvoiceLabel(group.invoice);
                    const groupIsBusyDownload = invoiceRowAction === `download-${group.invoice._id}`;
                    return (
                      <div key={group.key} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-slate-900">{groupLabel}</p>
                          <p className="text-base font-bold text-slate-900">{formatCurrency(groupTotal)}</p>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          Due {formatDateTime(group.invoice.dueDate)} · Issued {formatDateTime(group.invoice.invoiceDate)} · paid in {group.records.length} parts
                        </p>
                        {/* One invoice behind every leg here, so one Download for the whole group —
                            same button/handler a solo card would show, not repeated per leg. */}
                        {group.invoice.invoiceNumber && group.invoice.invoiceType !== "project" ? (
                          <div className="mt-3 flex justify-end">
                            <button type="button" onClick={() => handleInvoiceDownload(group.invoice)} disabled={Boolean(invoiceRowAction)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 disabled:opacity-60"><Download size={13} />{groupIsBusyDownload ? "Preparing..." : "Download"}</button>
                          </div>
                        ) : null}
                        <div className="mt-3 space-y-3">
                          {group.records.map((record) => renderLeg(record, { compact: true }))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {actionTarget ? (
            <div className="fixed inset-0 z-[70] flex items-end bg-slate-950/45 p-4 backdrop-blur-sm sm:items-center sm:justify-center" onClick={closeAction}>
              <div className="w-full max-w-xl rounded-[2rem] bg-white p-5 shadow-2xl sm:p-6" onClick={(event) => event.stopPropagation()}>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Payment review</p>
                <h2 className="mt-2 text-xl font-bold text-slate-900">
                  {actionTarget.type === "transaction"
                    ? "Review submitted payment"
                    : actionTarget.type === "planInvoice"
                    ? "Record plan invoice payment"
                    : "Review initial project payment"}
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  {actionTarget.type === "transaction"
                    ? `${formatCurrency(actionTarget.record.amount)} submitted via ${getPaymentMethodText(actionTarget.record.paymentMethod)}. Verify the reference before accepting.`
                    : `${formatCurrency(actionTarget.record.amount)} · ${getInvoiceLabel(actionTarget.record)}`}
                </p>

                {actionTarget.type !== "transaction" ? (
                  <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label>
                      <span className="text-sm font-semibold text-slate-700">Payment method</span>
                      <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} disabled={actionSubmitting} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-400">
                        <option value="upi">UPI</option>
                        <option value="bank_transfer">Bank transfer</option>
                        <option value="cash">Cash</option>
                        <option value="wallet">Wallet</option>
                      </select>
                    </label>
                    <label>
                      <span className="text-sm font-semibold text-slate-700">Reference</span>
                      <input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} disabled={actionSubmitting} placeholder="UPI or bank reference" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-400" />
                    </label>
                    <label className="sm:col-span-2">
                      <span className="text-sm font-semibold text-slate-700">Internal note</span>
                      <textarea value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} disabled={actionSubmitting} rows={3} placeholder="Optional internal verification note" className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-400" />
                    </label>
                  </div>
                ) : null}

                {(actionTarget.type === "transaction" || actionTarget.type === "projectApproval") ? (
                  <label className="mt-5 block">
                    <span className="text-sm font-semibold text-slate-700">Rejection reason</span>
                    <textarea value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} disabled={actionSubmitting} rows={3} placeholder="Required only when rejecting" className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-rose-400" />
                  </label>
                ) : null}

                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button type="button" onClick={closeAction} disabled={actionSubmitting} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">Cancel</button>
                  {(actionTarget.type === "transaction" || actionTarget.type === "projectApproval") ? (
                    <button type="button" onClick={() => completeAction("reject")} disabled={actionSubmitting || !rejectionReason.trim()} className="rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60">{actionSubmitting ? "Saving..." : "Reject"}</button>
                  ) : null}
                  <button type="button" onClick={() => completeAction(actionTarget.type === "transaction" ? "approve" : actionTarget.type === "planInvoice" ? "record" : "record")} disabled={actionSubmitting} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60">
                    {actionSubmitting ? "Saving..." : actionTarget.type === "transaction" ? "Accept Payment" : actionTarget.type === "planInvoice" ? "Record Payment" : "Record Payment & Approve"}
                  </button>
                </div>
              </div>
            </div>
      ) : null}
    </section>
  );
};

const CompactWorkspaceCard = ({ title, subtitle, items, emptyText, onRowClick, onDelete, onCancel, deletingOrderId, cancellingOrderId, renderMeta, renderRight, headerAction }) => {
  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
      </div>

      <div className="mt-5">
        <AdminWorkspaceList
          columns={[
            { label: "Item", className: "col-span-12 lg:col-span-5" },
            { label: "Details", className: "col-span-12 lg:col-span-4" },
            { label: "Status", className: "col-span-6 lg:col-span-2" },
            { label: "Action", className: "col-span-6 text-right lg:col-span-1" },
          ]}
          loading={false}
          emptyText={emptyText}
          items={items}
          renderRow={(item, index) => (
            <CompactWorkspaceRow
              key={item._id}
              tabIndex={0}
              item={item}
              index={index}
              onRowClick={onRowClick}
              onDelete={onDelete}
              onCancel={onCancel}
              deletingOrderId={deletingOrderId}
              cancellingOrderId={cancellingOrderId}
              renderMeta={renderMeta}
              renderRight={renderRight}
            />
          )}
        />
      </div>
    </div>
  );
};

// Forwards its ref to the root div — AdminWorkspaceList clones this element to attach the ref
// it uses for row-to-row ArrowUp/ArrowDown navigation, so a plain (non-forwardRef) component
// here would silently drop that ref and break the list's existing keyboard navigation.
const CompactWorkspaceRow = React.forwardRef(
  ({ item, index, onRowClick, onDelete, onCancel, deletingOrderId, cancellingOrderId, renderMeta, renderRight, tabIndex = 0 }, ref) => {
    return (
      <div
        ref={ref}
        role="button"
        // Comes from the `tabIndex={0}` the caller puts on this component: AdminWorkspaceList
        // reads `row.props.tabIndex` to decide whether a row is a navigation target, so the prop
        // has to actually reach the element it claims to describe. Previously it was dropped
        // here and the root div hardcoded its own 0 — the check passed on a prop that had no
        // effect, which is exactly the kind of mismatch that makes focus land inconsistently.
        tabIndex={tabIndex}
        onClick={() => onRowClick?.(item)}
        onKeyDown={(event) => {
          // Only act on keys pressed on the row itself. A keydown on one of the row's own
          // buttons (Cancel/Delete) bubbles up here too, and preventDefault() on it would
          // cancel the browser's native click — so the button's action never ran and the row
          // opened instead.
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onRowClick?.(item);
          } else if (event.key === "Delete") {
            // One key, one action — whichever single action this row is actually offering.
            // A row is never showing both buttons at once (see the action column below), so
            // Delete always maps to the one that is visible: Cancel while the project is
            // still running, the real delete once it has been cancelled. This is what lets
            // the row keep a single keyboard target (the lead-list model) instead of needing
            // ArrowLeft/Right to pick between two buttons inside the row.
            if (item.orderVisibility !== "cancelled") {
              if (!onCancel) return;
              event.preventDefault();
              onCancel(item);
            } else {
              if (!onDelete) return;
              event.preventDefault();
              onDelete(item);
            }
          }
        }}
        className={[
          "group grid w-full cursor-pointer grid-cols-12 gap-3 px-5 py-4 text-left transition outline-none hover:bg-slate-100 focus:bg-slate-100 sm:px-6",
          index % 2 === 0 ? "bg-white" : "bg-slate-50",
        ].join(" ")}
      >
        <div className="col-span-12 lg:col-span-5">
          <p className="truncate text-base font-semibold text-slate-900">{index + 1}. {getWorkspaceItemName(item)}</p>
        </div>

        <div className="col-span-12 lg:col-span-4 lg:flex lg:items-center">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            {renderMeta?.(item)?.map((meta) => (
              <span key={meta}>{meta}</span>
            ))}
          </div>
        </div>

        <div className="col-span-6 lg:col-span-2 lg:flex lg:items-center">
          <div>{renderRight?.(item)}</div>
        </div>

        <div className="col-span-6 flex flex-wrap items-center justify-end gap-2 lg:col-span-1">
          {/* Exactly one action is ever offered here, so the row has a single keyboard target.
              Cancel settles the money and closes the project; Delete only removes the record
              afterwards — so a running project can only be cancelled, and a cancelled one can
              only be deleted. `orderVisibility` is the field cancelProjectOrder.js writes, so
              "cancelled" here means genuinely cancelled — a payment-rejected order is not.

              Both buttons follow the lead-list reveal pattern (AdminLeadsPage.js): hidden until
              the row is hovered or focused, so "selected row" is what makes the action appear.
              `disabled:opacity-100` keeps the in-flight spinner visible even if focus moves away.
              The row is the only thing that is ever focused here — a button inside it is a mouse
              target, never a keyboard stop. `tabIndex={-1}` keeps them out of
              getInteractiveElements()'s sequence (so the tab's content handler and
              AdminWorkspaceList's row handler walk the same list of stops), and preventDefault on
              mousedown stops the browser's native focus-on-click, which would otherwise move
              focus off the row and leave arrow-navigation with nowhere to resume from. */}
          {onCancel && item.orderVisibility !== "cancelled" ? (
            <button
              type="button"
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.stopPropagation();
                onCancel(item);
              }}
              disabled={cancellingOrderId === item._id}
              className="inline-flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 opacity-0 transition hover:bg-amber-100 focus:opacity-100 group-hover:opacity-100 group-focus:opacity-100 disabled:cursor-not-allowed disabled:opacity-100"
            >
              {cancellingOrderId === item._id ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
              ) : (
                <Ban size={14} />
              )}
              Cancel
            </button>
          ) : null}
          {onDelete && item.orderVisibility === "cancelled" ? (
            <button
              type="button"
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.stopPropagation();
                onDelete(item);
              }}
              disabled={deletingOrderId === item._id}
              className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 opacity-0 transition hover:bg-rose-100 focus:opacity-100 group-hover:opacity-100 group-focus:opacity-100 disabled:cursor-not-allowed disabled:opacity-100"
            >
              {deletingOrderId === item._id ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-rose-600 border-t-transparent" />
              ) : (
                <Trash2 size={14} />
              )}
              Delete
            </button>
          ) : null}
        </div>
      </div>
    );
  }
);

// The four project categories come from helpers/projectCategoryOptions.js, the shared
// SSOT the Features form also builds its category picker from — so a feature can never
// be tagged with a category this form cannot offer.
const PROJECT_CATEGORIES = projectCategoryOptions;

// Keeps its own "N/A" fallback: this label is rendered for existing orders, where the
// category may be missing entirely, unlike the picker above.
const getCategoryLabel = (category) =>
  PROJECT_CATEGORIES.find((option) => option.value === category)?.label || category || "N/A";

const PROJECT_PHASES = {
  planning: "Planning",
  development: "Development",
  review: "Review",
  completed: "Completed",
};

const getPhaseLabel = (phase) => PROJECT_PHASES[phase] || phase || "N/A";

const FEATURE_UPGRADE_CATEGORY = "feature_upgrades";

const buildInstallmentPreview = (totalAmount, installmentCount) => {
  const count = Number(installmentCount) === 3 ? 3 : 2;
  const splits = count === 3 ? [30, 30, 40] : [50, 50];
  return splits.map((percentage, index) => ({
    installmentNumber: index + 1,
    percentage,
    amount: Math.round((totalAmount * percentage) / 100),
  }));
};

const projectFormInputClassName =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-black outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100";
const projectFormLabelClassName = "mb-1.5 block text-base font-semibold text-slate-700";

const PAYMENT_METHOD_OPTIONS = [
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "cash", label: "Cash" },
  { value: "wallet", label: "Wallet" },
];

const CreateProjectForClientForm = ({ clientName, customerId, onCancel, onCreated }) => {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [startingNodeTitle, setStartingNodeTitle] = useState("");
  const [category, setCategory] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [paymentType, setPaymentType] = useState("full");
  const [installmentCount, setInstallmentCount] = useState("2");

  const [paymentAction, setPaymentAction] = useState("record");
  const [paymentMethod, setPaymentMethod] = useState("upi");
  const [transactionReference, setTransactionReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  const [basePrice, setBasePrice] = useState(0);
  const [basePriceLoading, setBasePriceLoading] = useState(false);
  const [categoryDescription, setCategoryDescription] = useState("");

  const [availableFeatures, setAvailableFeatures] = useState([]);
  const [featuresLoading, setFeaturesLoading] = useState(true);
  const [featuresError, setFeaturesError] = useState("");
  const [selectedFeatureIds, setSelectedFeatureIds] = useState([]);
  const [featureQuantities, setFeatureQuantities] = useState({});
  const [isFeatureDropdownOpen, setIsFeatureDropdownOpen] = useState(false);
  const featureDropdownRef = useRef(null);

  useEffect(() => {
    const fetchFeatures = async () => {
      setFeaturesLoading(true);
      setFeaturesError("");
      try {
        const response = await fetch(SummaryApi.allProduct.url);
        const dataResponse = await response.json();
        const allProducts = dataResponse?.data || [];
        setAvailableFeatures(
          allProducts.filter((product) => product.category === FEATURE_UPGRADE_CATEGORY)
        );
      } catch (fetchError) {
        console.error("Error fetching additional features:", fetchError);
        setFeaturesError("Additional features could not be loaded.");
      } finally {
        setFeaturesLoading(false);
      }
    };
    fetchFeatures();
  }, []);

  useEffect(() => {
    if (!category) {
      setBasePrice(0);
      setCategoryDescription("");
      return;
    }

    const fetchBasePrice = async () => {
      setBasePriceLoading(true);
      try {
        const response = await fetch(SummaryApi.categoryBasePrices.url, {
          method: SummaryApi.categoryBasePrices.method.toUpperCase(),
          credentials: "include",
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.message || "Failed to load base price");
        const entry = (result.data || []).find((item) => item.category === category);
        setBasePrice(entry?.basePrice || 0);
        setCategoryDescription(entry?.description || "");
      } catch (fetchError) {
        console.error("Error fetching category base price:", fetchError);
        toast.error("Could not load base price for this category.");
        setBasePrice(0);
        setCategoryDescription("");
      } finally {
        setBasePriceLoading(false);
      }
    };
    fetchBasePrice();
  }, [category]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (featureDropdownRef.current && !featureDropdownRef.current.contains(event.target)) {
        setIsFeatureDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleFeature = (featureId) => {
    setSelectedFeatureIds((current) =>
      current.includes(featureId)
        ? current.filter((id) => id !== featureId)
        : [...current, featureId]
    );
    setFeatureQuantities((current) => {
      if (current[featureId]) return current;
      return { ...current, [featureId]: 1 };
    });
  };

  const updatePageQuantity = (featureId, delta) => {
    setFeatureQuantities((current) => {
      const nextValue = Math.max(1, (current[featureId] || 1) + delta);
      return { ...current, [featureId]: nextValue };
    });
  };

  // Only features offered for the chosen category are selectable. compatibleWith[] carries
  // that, an EMPTY array meaning "all categories" — the same rule the backend enforces in
  // adminCreateProjectOrder.js, so a feature can never be selected here and dropped there.
  const categoryFeatures = category
    ? availableFeatures.filter((feature) => isFeatureForCategory(feature, category))
    : availableFeatures;
  const selectableFeatures = categoryFeatures.filter(
    (feature) => !selectedFeatureIds.includes(feature._id)
  );
  const selectedFeatures = selectedFeatureIds
    .map((id) => categoryFeatures.find((feature) => feature._id === id))
    .filter(Boolean);
  const featuresTotal = selectedFeatures.reduce((sum, feature) => {
    const quantity = feature.isQuantityBased ? (featureQuantities[feature._id] || 1) : 1;
    return sum + (Number(feature.sellingPrice) || 0) * quantity;
  }, 0);
  const referenceTotal = Number(basePrice) + featuresTotal;

  const firstInstallmentAmount = paymentType === "partial" && sellingPrice
    ? buildInstallmentPreview(Number(sellingPrice), installmentCount)[0]?.amount || 0
    : Number(sellingPrice) || 0;

  const handleGoToPaymentStep = () => {
    if (!category || !sellingPrice) {
      toast.error("Category and selling price are required.");
      return;
    }
    setStep(2);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const formData = {
      projectName: projectName.trim() || null,
      startingNodeTitle: startingNodeTitle.trim() || null,
      category,
      sellingPrice,
      featureIds: selectedFeatureIds,
      featureQuantities,
      paymentType,
      installmentCount: paymentType === "partial" ? installmentCount : null,
      recordPayment: paymentAction === "record"
        ? {
            paymentMethod,
            transactionReference: transactionReference.trim(),
            notes: paymentNotes.trim(),
          }
        : null,
    };

    setIsSubmitting(true);
    try {
      const response = await fetch(
        `${SummaryApi.adminCreateProjectOrder.url}/${customerId}/create-project`,
        {
          method: SummaryApi.adminCreateProjectOrder.method,
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        }
      );

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || "Failed to create project");
      }

      toast.success("Project created and started for this client.");
      onCreated?.();
    } catch (error) {
      console.error("Error creating project for client:", error);
      toast.error(error.message || "Failed to create project");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={step === 2 ? handleSubmit : (event) => event.preventDefault()}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900">
            {step === 1 ? `Create Project for ${clientName}` : "Payment Settings"}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {step === 1
              ? "This creates a working project for this client only. It will not be saved to the project catalog."
              : "Record the first payment now, or let the client pay later. Step 2 of 2."}
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-white hover:text-slate-700"
          aria-label="Close create project form"
        >
          <X size={16} />
        </button>
      </div>

      {step === 1 ? (
      <>
      <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
        <div>
          <label className={projectFormLabelClassName}>Category</label>
          <select
            className={projectFormInputClassName}
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              // Features are category-scoped, so a selection made for the previous
              // category must not survive into the new one — the backend would drop
              // it anyway and the estimate would silently disagree with the order.
              setSelectedFeatureIds([]);
              setFeatureQuantities({});
            }}
          >
            <option value="">Select category</option>
            {PROJECT_CATEGORIES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={projectFormLabelClassName}>
            Project Name <span className="font-normal normal-case tracking-normal text-slate-400">(optional)</span>
          </label>
          <input
            type="text"
            className={projectFormInputClassName}
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            placeholder="Defaults to category name"
          />
        </div>

        <div>
          <label className={projectFormLabelClassName}>
            Starting Node Title <span className="font-normal normal-case tracking-normal text-slate-400">(optional)</span>
          </label>
          <input
            type="text"
            className={projectFormInputClassName}
            value={startingNodeTitle}
            onChange={(event) => setStartingNodeTitle(event.target.value)}
            placeholder="Defaults to 'Project Started'"
          />
        </div>

        {category && !basePriceLoading && categoryDescription ? (
          <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm font-semibold text-slate-500">Category Description</p>
            <p className="mt-1 text-sm text-slate-700">{categoryDescription}</p>
          </div>
        ) : null}

        <div className="md:col-span-2 grid grid-cols-1 gap-5 md:grid-cols-2">
        <div ref={featureDropdownRef}>
          <span className={projectFormLabelClassName}>
            Additional Features / Upgrades
          </span>

          {featuresLoading && (
            <p className="text-xs text-slate-500">Loading available features…</p>
          )}

          {!featuresLoading && featuresError && (
            <p className="text-xs text-red-500">{featuresError}</p>
          )}

          {!featuresLoading && !featuresError && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsFeatureDropdownOpen((open) => !open)}
                className={`${projectFormInputClassName} flex items-center justify-between text-left`}
              >
                <span className={selectableFeatures.length === 0 && selectedFeatures.length === 0 ? "text-slate-400" : ""}>
                  {availableFeatures.length === 0
                    ? "No features available"
                    : "Search & select features..."}
                </span>
                <span className="text-slate-400">▾</span>
              </button>

              {isFeatureDropdownOpen && (selectedFeatures.length > 0 || selectableFeatures.length > 0) && (
                <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                  {selectedFeatures.length > 0 && (
                    <div className="flex flex-wrap gap-2 border-b border-slate-100 p-2">
                      {selectedFeatures.map((feature) => {
                        const isQuantityBased = Boolean(feature.isQuantityBased);
                        const quantity = featureQuantities[feature._id] || 1;
                        return (
                          <span
                            key={feature._id}
                            className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 py-1 pl-3 pr-2 text-sm font-semibold text-emerald-800"
                          >
                            <span>{feature.serviceName}</span>

                            {typeof feature.sellingPrice === "number" && !isQuantityBased && (
                              <span className="text-emerald-600">₹{feature.sellingPrice}</span>
                            )}

                            {isQuantityBased ? (
                              <span className="flex items-center gap-1.5 rounded-full border border-emerald-300 bg-white px-1.5 py-0.5">
                                <span className="text-xs text-emerald-600">₹{feature.sellingPrice}</span>
                                <button
                                  type="button"
                                  onClick={() => updatePageQuantity(feature._id, -1)}
                                  className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 transition hover:bg-emerald-200"
                                  aria-label="Decrease page count"
                                >
                                  −
                                </button>
                                <span className="w-5 text-center text-sm">{quantity}</span>
                                <button
                                  type="button"
                                  onClick={() => updatePageQuantity(feature._id, 1)}
                                  className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 transition hover:bg-emerald-200"
                                  aria-label="Increase page count"
                                >
                                  +
                                </button>
                              </span>
                            ) : null}

                            <button
                              type="button"
                              onClick={() => toggleFeature(feature._id)}
                              className="flex h-5 w-5 items-center justify-center rounded-full text-emerald-500 transition hover:bg-red-100 hover:text-red-600"
                              aria-label={`Remove ${feature.serviceName}`}
                            >
                              ×
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {selectableFeatures.map((feature) => (
                    <button
                      key={feature._id}
                      type="button"
                      onClick={() => toggleFeature(feature._id)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-base text-black transition hover:bg-emerald-50"
                    >
                      <span>{feature.serviceName}</span>
                      {typeof feature.sellingPrice === "number" && (
                        <span className="text-base font-semibold text-slate-600">₹{feature.sellingPrice}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {selectedFeatures.length > 0 && (
            <p className="mt-2 text-sm font-semibold text-slate-600">
              Features total: ₹{featuresTotal.toLocaleString("en-IN")}
            </p>
          )}
        </div>

        <div>
          <label className={projectFormLabelClassName}>
            Selling Price <span className="font-normal normal-case tracking-normal text-slate-400">(what the client pays)</span>
          </label>
          <input
            type="number"
            min={0}
            className={projectFormInputClassName}
            value={sellingPrice}
            onChange={(event) => setSellingPrice(event.target.value)}
            placeholder="e.g. 12000"
          />
          {sellingPrice && Number(sellingPrice) < referenceTotal ? (
            <p className="mt-1.5 text-sm font-semibold text-emerald-600">
              Discount: ₹{(referenceTotal - Number(sellingPrice)).toLocaleString("en-IN")}
            </p>
          ) : null}
        </div>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-sm font-semibold text-slate-600">
          Reference Total: Category Price (₹{Number(basePrice).toLocaleString("en-IN")}) + Features (₹{featuresTotal.toLocaleString("en-IN")}) = ₹{referenceTotal.toLocaleString("en-IN")}
        </p>
      </div>

      <div className="mt-6 border-t border-slate-200 pt-5">
        <label className={projectFormLabelClassName}>Payment Type</label>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setPaymentType("full")}
            className={[
              "rounded-2xl border px-4 py-2.5 text-sm font-semibold transition",
              paymentType === "full"
                ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100",
            ].join(" ")}
          >
            One-time (Full)
          </button>
          <button
            type="button"
            onClick={() => setPaymentType("partial")}
            className={[
              "rounded-2xl border px-4 py-2.5 text-sm font-semibold transition",
              paymentType === "partial"
                ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100",
            ].join(" ")}
          >
            Partial (Installments)
          </button>
        </div>

        {paymentType === "partial" ? (
          <div className="mt-4 max-w-xs">
            <label className={projectFormLabelClassName}>Number of Installments</label>
            <select
              className={projectFormInputClassName}
              value={installmentCount}
              onChange={(event) => setInstallmentCount(event.target.value)}
            >
              <option value="2">2</option>
              <option value="3">3</option>
            </select>
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleGoToPaymentStep}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Next: Payment Settings
        </button>
      </div>
      </>
      ) : (
      <>
      <div className="mt-6 space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm font-semibold text-slate-500">Amount Due Now</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">₹{firstInstallmentAmount.toLocaleString("en-IN")}</p>
          <p className="mt-1 text-xs text-slate-500">
            {paymentType === "partial"
              ? `Installment 1 of ${installmentCount} — remaining installments stay unpaid and can be recorded later.`
              : "Full project amount (one-time payment)."}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setPaymentAction("record")}
            className={[
              "rounded-2xl border px-4 py-2.5 text-sm font-semibold transition",
              paymentAction === "record"
                ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100",
            ].join(" ")}
          >
            Record Payment Now
          </button>
          <button
            type="button"
            onClick={() => setPaymentAction("skip")}
            className={[
              "rounded-2xl border px-4 py-2.5 text-sm font-semibold transition",
              paymentAction === "skip"
                ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100",
            ].join(" ")}
          >
            Just Add Project, Let Client Pay the Bill
          </button>
        </div>

        {paymentAction === "record" ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <label className={projectFormLabelClassName}>Payment Method</label>
              <select
                className={projectFormInputClassName}
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value)}
              >
                {PAYMENT_METHOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={projectFormLabelClassName}>Transaction Reference</label>
              <input
                type="text"
                className={projectFormInputClassName}
                value={transactionReference}
                onChange={(event) => setTransactionReference(event.target.value)}
                placeholder="UPI ID or bank reference"
              />
            </div>
            <div className="md:col-span-2">
              <label className={projectFormLabelClassName}>
                Note <span className="font-normal normal-case tracking-normal text-slate-400">(internal only, not shown to client)</span>
              </label>
              <textarea
                rows={3}
                className={projectFormInputClassName}
                value={paymentNotes}
                onChange={(event) => setPaymentNotes(event.target.value)}
                placeholder="e.g. Collected cash in person"
              />
            </div>
          </div>
        ) : (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            The project will be created and started immediately, but its invoice stays unpaid until the client (or admin) records the payment later.
          </p>
        )}
      </div>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <button
          type="button"
          onClick={() => setStep(1)}
          disabled={isSubmitting}
          className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Creating...
            </>
          ) : (
            <>
              <Save size={16} />
              Create Project
            </>
          )}
        </button>
      </div>
      </>
      )}
    </form>
  );
};

const WorkspaceDetailSubpage = ({
  item,
  loading,
  error,
  onBack,
  onDelete,
  onCancel,
  deletingOrderId,
  cancellingOrderId,
  getStatusLabel,
  getBadgeClassName,
  formatDateTime,
  backLabel,
  detailLabel,
  summaryTitle,
  selectedCheckpointId,
  onSelectCheckpoint,
  onSoftRefresh,
  allInvoices = [],
  allTransactions = [],
  // Client-submitted data for THIS record. No admin read endpoint exists yet, so
  // nothing is passed in today and the panel renders its empty state. Kept as props
  // (not local fetch state) so wiring later means passing data in, not rewriting UI.
  submissions = [],
  submissionsLoading = false,
  submissionsError = "",
}) => {
  // Client Submissions is its own subpage one level below this one: opening it replaces
  // the project/plan detail, and its Back button returns here. Local view state, like
  // the selected node — leaving this record forgets it.
  const [submissionsOpen, setSubmissionsOpen] = useState(false);
  const [downloadingUploadId, setDownloadingUploadId] = useState("");
  const submissionsPendingCount = (submissions || []).filter(
    (entry) => entry?.status === "pending",
  ).length;

  // The zip is fetched rather than linked to, so the session cookie travels — see
  // helpers/downloadFile.js. One upload at a time; the button reports which.
  const handleUploadDownload = async (attempt) => {
    if (!attempt?.id || downloadingUploadId) return;
    try {
      setDownloadingUploadId(attempt.id);
      // Same name the server sets in Content-Disposition, which a blob download cannot read.
      await downloadAuthenticatedFile(
        `${SummaryApi.downloadUploadZip.url}/${attempt.id}/download`,
        `uploaded-data-${attempt.id}.zip`,
      );
      toast.success("Download started");
    } catch (error) {
      toast.error(error.message || "Failed to download files");
    } finally {
      setDownloadingUploadId("");
    }
  };

  const itemStatus = getStatusLabel(item);
  const isProjectDetail = detailLabel === "Project";

  // SSOT per-order ledger: filter the client's invoices + transactions down to THIS order,
  // then merge/dedup with the same buildLedgerItems() helper the Payment & Invoices tab uses.
  // transaction.orderId is a plain ObjectId; invoice.orderId is populated ({_id,...}) — handle both.
  const sameOrder = (ref) => String(ref?._id || ref) === String(item?._id);
  const orderInvoices = (allInvoices || []).filter((inv) => sameOrder(inv.orderId));
  const orderTransactions = (allTransactions || []).filter((txn) => sameOrder(txn.orderId));
  const orderLedgerItems = isProjectDetail
    ? buildLedgerItems(orderTransactions, orderInvoices)
    : [];
  const allNodes = item?.projectNodes || [];
  const activeRun = (item?.projectRuns || []).find((run) => run.status === "active") || null;
  const runNodes = activeRun ? allNodes.filter((node) => node.runId === activeRun.runId) : allNodes;
  const [updateMode, setUpdateMode] = useState(true);
  const [updateMessage, setUpdateMessage] = useState("");
  const [selectedNodeKeys, setSelectedNodeKeys] = useState([]);
  const [selectionAnchorKey, setSelectionAnchorKey] = useState(null);
  const [focusedNodeKey, setFocusedNodeKey] = useState(null);
  const nodeRowRefs = useRef({});
  const [hideDeletedNodesForClient, setHideDeletedNodesForClient] = useState(false);
  const [resetPreviewOpen, setResetPreviewOpen] = useState(false);
  const [resetStartingTitle, setResetStartingTitle] = useState("");
  const [nodeActionNotice, setNodeActionNotice] = useState("");
  const [isNodeActionSubmitting, setIsNodeActionSubmitting] = useState(false);
  const [editingNodeKey, setEditingNodeKey] = useState(null);

  // Approval bar state — only for the gap approveProjectOrder.js exists to close: a "Pay Later"
  // (decide_later) order that is pending-approval with NO transaction at all, so there is nothing
  // for the normal transaction-approval flow to act on (see approveProjectOrder.js's header
  // comment). A customer order that already has a pending transaction (full/installment payment
  // via wallet+UPI) is a DIFFERENT case — that payment already exists as a real transaction record
  // and must be approved/rejected from the Payment & Invoices tab (transactionApprovalController),
  // not waved through here with "Approve without Payment" / a duplicate "Record Payment" write.
  const hasPendingTransaction = orderTransactions.some((txn) => txn.status === "pending");
  const isPendingApproval = item?.orderVisibility === "pending-approval" && !hasPendingTransaction;
  const [approvalMode, setApprovalMode] = useState(null); // null | "record" | "reject"
  const [approvalMethod, setApprovalMethod] = useState("upi");
  const [approvalReference, setApprovalReference] = useState("");
  const [approvalNotes, setApprovalNotes] = useState("");
  const [approvalRejectReason, setApprovalRejectReason] = useState("");
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);

  const submitApproval = async (mode) => {
    setApprovalSubmitting(true);
    try {
      const response = await fetch(`${SummaryApi.approveProjectOrder.url}/${item._id}/approval`, {
        method: SummaryApi.approveProjectOrder.method.toUpperCase(),
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          paymentMethod: mode === "approve_with_payment" ? approvalMethod : undefined,
          transactionReference: mode === "approve_with_payment" ? approvalReference : undefined,
          notes: mode === "approve_with_payment" ? approvalNotes : undefined,
          rejectionReason: mode === "reject" ? approvalRejectReason : undefined,
        }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.message || "Approval action failed");
      toast.success(result.message || "Done");
      setApprovalMode(null);
      setApprovalReference("");
      setApprovalNotes("");
      setApprovalRejectReason("");
      onSoftRefresh?.();
    } catch (approvalError) {
      toast.error(approvalError.message || "Approval action failed");
    } finally {
      setApprovalSubmitting(false);
    }
  };

  const displayedNodes = [...runNodes].reverse();
  const displayedNodeKeys = displayedNodes.map((node) => getNodeSelectionKey(node));
  const activeNodes = runNodes.filter((node) => node.status === "active");
  const currentProjectProgress = item?.projectProgress || 0;
  const allNodesCompleted = activeNodes.length > 0 && currentProjectProgress >= 100;

  useEffect(() => {
    setUpdateMode(true);
    setUpdateMessage("");
    setSelectedNodeKeys([]);
    setSelectionAnchorKey(null);
    setFocusedNodeKey(null);
    setHideDeletedNodesForClient(false);
    setResetPreviewOpen(false);
    setResetStartingTitle("");
    setNodeActionNotice("");
    setEditingNodeKey(null);
    setApprovalMode(null);
    setApprovalMethod("upi");
    setApprovalReference("");
    setApprovalNotes("");
    setApprovalRejectReason("");
  }, [item?._id]);

  const getNodeSelectionRange = (selectionKey) => {
    const anchorIndex = displayedNodeKeys.indexOf(selectionAnchorKey);
    const targetIndex = displayedNodeKeys.indexOf(selectionKey);
    if (anchorIndex < 0 || targetIndex < 0) return [selectionKey];
    const rangeStart = Math.min(anchorIndex, targetIndex);
    const rangeEnd = Math.max(anchorIndex, targetIndex);
    return displayedNodeKeys.slice(rangeStart, rangeEnd + 1);
  };
  const toggleNodeSelection = (selectionKey) => {
    setSelectedNodeKeys((current) => (
      current.includes(selectionKey)
        ? current.filter((key) => key !== selectionKey)
        : [...current, selectionKey]
    ));
    setSelectionAnchorKey(selectionKey);
  };
  const selectNodeFromList = (selectionKey, { ctrlKey = false, shiftKey = false } = {}) => {
    setFocusedNodeKey(selectionKey);
    if (shiftKey && selectionAnchorKey) {
      const selectedRange = getNodeSelectionRange(selectionKey);
      setSelectedNodeKeys((current) => (
        ctrlKey ? [...new Set([...current, ...selectedRange])] : selectedRange
      ));
    } else if (ctrlKey) {
      setSelectedNodeKeys((current) => (
        current.includes(selectionKey)
          ? current.filter((key) => key !== selectionKey)
          : [...current, selectionKey]
      ));
      setSelectionAnchorKey(selectionKey);
    } else {
      setSelectedNodeKeys([selectionKey]);
      setSelectionAnchorKey(selectionKey);
    }
    setUpdateMode(false);
    setUpdateMessage("");
    setEditingNodeKey(null);
    onSelectCheckpoint?.(selectionKey);
  };

  const callNodeApi = async (apiConfig, pathSuffix, body) => {
    const response = await fetch(`${apiConfig.url}/${item._id}/nodes${pathSuffix}`, {
      method: apiConfig.method.toUpperCase(),
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.message || "Node action failed");
    return result;
  };

  const handleAddNode = async (title, percentage, message) => {
    setIsNodeActionSubmitting(true);
    setNodeActionNotice("");
    try {
      await callNodeApi(SummaryApi.createProjectNode, "", {
        title,
        cumulativeProgress: Number(percentage),
        message: message || undefined,
      });
      toast.success("Node added successfully.");
      setUpdateMessage("");
      onSoftRefresh?.();
    } catch (nodeError) {
      console.error("Error adding project node:", nodeError);
      toast.error(nodeError.message || "Failed to add node");
    } finally {
      setIsNodeActionSubmitting(false);
    }
  };

  const handleStartEditNode = (selectionKey) => {
    setEditingNodeKey(selectionKey);
    setUpdateMode(true);
    setUpdateMessage("");
  };

  const handleCancelEditNode = () => {
    setEditingNodeKey(null);
  };

  const handleSaveCorrection = async (editingNode, title, percentage, message) => {
    setIsNodeActionSubmitting(true);
    setNodeActionNotice("");
    try {
      await callNodeApi(SummaryApi.editProjectNode, "/edit", {
        nodeId: editingNode.nodeId,
        title,
        cumulativeProgress: Number(percentage),
        message: message || undefined,
      });
      toast.success("Node updated successfully.");
      setEditingNodeKey(null);
      setUpdateMessage("");
      onSoftRefresh?.();
    } catch (nodeError) {
      console.error("Error updating project node:", nodeError);
      toast.error(nodeError.message || "Failed to update node");
    } finally {
      setIsNodeActionSubmitting(false);
    }
  };

  const handleDeleteSelectedNodes = async () => {
    const nodeIds = selectedNodeKeys.filter((key) => {
      const node = runNodes.find((candidate) => getNodeSelectionKey(candidate) === key);
      return node?.status === "active";
    });
    if (nodeIds.length === 0) return;

    setIsNodeActionSubmitting(true);
    try {
      await callNodeApi(SummaryApi.deleteProjectNodes, "/delete", { nodeIds });
      toast.success(`${nodeIds.length} node(s) deleted.`);
      setSelectedNodeKeys([]);
      setSelectionAnchorKey(null);
      setFocusedNodeKey(null);
      onSoftRefresh?.();
    } catch (nodeError) {
      console.error("Error deleting project nodes:", nodeError);
      toast.error(nodeError.message || "Failed to delete node(s)");
    } finally {
      setIsNodeActionSubmitting(false);
    }
  };

  const handleRestoreSelectedNodes = async () => {
    const nodeIds = selectedNodeKeys.filter((key) => {
      const node = runNodes.find((candidate) => getNodeSelectionKey(candidate) === key);
      return node?.status === "deleted";
    });
    if (nodeIds.length === 0) return;

    setIsNodeActionSubmitting(true);
    try {
      await callNodeApi(SummaryApi.restoreProjectNodes, "/restore", { nodeIds });
      toast.success(`${nodeIds.length} node(s) restored.`);
      onSoftRefresh?.();
    } catch (nodeError) {
      console.error("Error restoring project nodes:", nodeError);
      toast.error(nodeError.message || "Failed to restore node(s)");
    } finally {
      setIsNodeActionSubmitting(false);
    }
  };

  const handleToggleVisibilitySelectedNodes = async (visibleToClient) => {
    const nodeIds = selectedNodeKeys.filter((key) =>
      runNodes.some((candidate) => getNodeSelectionKey(candidate) === key)
    );
    if (nodeIds.length === 0) return;

    setIsNodeActionSubmitting(true);
    try {
      await callNodeApi(SummaryApi.setProjectNodeVisibility, "/visibility", { nodeIds, visibleToClient });
      toast.success(`${nodeIds.length} node(s) updated.`);
      onSoftRefresh?.();
    } catch (nodeError) {
      console.error("Error updating project node visibility:", nodeError);
      toast.error(nodeError.message || "Failed to update visibility");
    } finally {
      setIsNodeActionSubmitting(false);
    }
  };

  const handleResetTimeline = async () => {
    if (!resetStartingTitle.trim()) {
      toast.error("Starting node title is required to reset.");
      return;
    }
    setIsNodeActionSubmitting(true);
    try {
      await callNodeApi(SummaryApi.resetProjectNodes, "/reset", {
        startingNodeTitle: resetStartingTitle.trim(),
      });
      toast.success("Project timeline reset.");
      setResetPreviewOpen(false);
      setResetStartingTitle("");
      setSelectedNodeKeys([]);
      onSoftRefresh?.();
    } catch (nodeError) {
      console.error("Error resetting project timeline:", nodeError);
      toast.error(nodeError.message || "Failed to reset project timeline");
    } finally {
      setIsNodeActionSubmitting(false);
    }
  };

  const selectedNode =
    runNodes.find((node) => getNodeSelectionKey(node) === selectedCheckpointId) ||
    activeNodes[activeNodes.length - 1] ||
    runNodes[runNodes.length - 1] ||
    null;
  const selectedNodeStates = selectedNodeKeys.map(
    (key) => runNodes.find((node) => getNodeSelectionKey(node) === key) || {}
  );
  const hasSelectedActiveNodes = selectedNodeStates.some((node) => node.status === "active");
  const hasSelectedInactiveNodes = selectedNodeStates.some((node) => node.status === "deleted");
  const hasInactiveNodes = runNodes.some((node) => node.status === "deleted");
  const selectedNodesAreHiddenForClient = selectedNodeStates.length > 0 && selectedNodeStates.every(
    (node) => node.visibleToClient === false
  );

  const editingNodeForDetail = editingNodeKey
    ? runNodes.find((node) => getNodeSelectionKey(node) === editingNodeKey) || null
    : null;
  const editBounds = editingNodeForDetail
    ? (() => {
        // activeNodes is already in creation order; the run's first active node
        // is the 0% starting node, and neighbours define the editable band.
        const targetIndex = activeNodes.findIndex(
          (node) => getNodeSelectionKey(node) === editingNodeKey
        );
        const lowerNeighbor = targetIndex > 0 ? activeNodes[targetIndex - 1] : null;
        const upperNeighbor = targetIndex >= 0 ? activeNodes[targetIndex + 1] : null;
        return {
          isStartingNode: targetIndex === 0,
          lowerBound: lowerNeighbor ? Number(lowerNeighbor.cumulativeProgress) || 0 : 0,
          upperBound: upperNeighbor ? Number(upperNeighbor.cumulativeProgress) || 0 : null,
        };
      })()
    : null;

  // Submissions subpage takes over the whole detail area, the same way this detail
  // subpage takes over the client workspace tab. Rendered for both projects and plans —
  // one component, both tabs.
  if (submissionsOpen) {
    return (
      <ClientSubmissionsPanel
        submissions={submissions}
        loading={submissionsLoading}
        error={submissionsError}
        onBack={() => setSubmissionsOpen(false)}
        recordLabel={detailLabel}
        onDownload={handleUploadDownload}
        downloadingId={downloadingUploadId}
      />
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-4 xl:flex-nowrap">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          <ArrowLeft size={16} />
          {backLabel}
        </button>

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-2xl font-bold text-slate-900">
            {getWorkspaceItemName(item) || `${detailLabel} Details`}
          </h2>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-l border-slate-200 pl-4 text-xs text-slate-500 xl:flex-nowrap">
          <span className="whitespace-nowrap">
            <span className="mr-1 font-semibold uppercase tracking-wide text-slate-400">Starting Date</span>
            <span className="font-semibold text-slate-700">{formatDateTime(item?.createdAt)}</span>
          </span>
        </div>

        {/* Entry point to the Client Submissions subpage. Sits next to Delete so it
            reads as an action on this record, not as another block of its content. */}
        <button
          type="button"
          onClick={() => setSubmissionsOpen(true)}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          title="View and download the data this client uploaded"
        >
          <Inbox size={16} />
          Uploaded Data
          {submissionsPendingCount > 0 ? (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
              {submissionsPendingCount}
            </span>
          ) : null}
        </button>

        {/* Cancel settles the money first; delete is only cleanup afterwards. */}
        {onCancel && item?.orderVisibility !== "cancelled" ? (
          <button
            type="button"
            onClick={() => onCancel(item)}
            disabled={cancellingOrderId === item?._id}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-70"
            aria-label={`Cancel ${detailLabel.toLowerCase()}`}
            title={`Cancel ${detailLabel.toLowerCase()}`}
          >
            {cancellingOrderId === item?._id ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
            ) : (
              <Ban size={16} />
            )}
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => onDelete(item)}
          disabled={deletingOrderId === item?._id}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-70"
          aria-label={`Delete ${detailLabel.toLowerCase()}`}
          title={`Delete ${detailLabel.toLowerCase()}`}
        >
          {deletingOrderId === item?._id ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-rose-600 border-t-transparent" />
          ) : (
            <Trash2 size={16} />
          )}
        </button>
      </div>

      <PortfolioSourceSettings key={item._id} item={item} onSaved={onSoftRefresh} />

      {isProjectDetail && item?.orderVisibility === "pending-approval" && hasPendingTransaction ? (
        <div className="mb-5 rounded-[1.5rem] border border-sky-200 bg-sky-50 p-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700">
              i
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold text-sky-900">Payment submitted, awaiting approval</p>
              <p className="mt-1 text-sm text-sky-700">
                The customer already submitted a payment for this project. Go to the Payments tab to approve or reject it — this project does not need "Approve without Payment".
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {isProjectDetail && isPendingApproval ? (
        <div className="mb-5 rounded-[1.5rem] border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              !
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold text-amber-900">This project is waiting for your approval</p>
              <p className="mt-1 text-sm text-amber-700">
                This project has no payment recorded yet. Record a payment to approve it, or reject the request — a project can never be approved without a payment on record.
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={approvalSubmitting}
                  onClick={() => setApprovalMode(approvalMode === "record" ? null : "record")}
                  className={[
                    "inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-70",
                    approvalMode === "record"
                      ? "border-emerald-400 bg-emerald-500 text-white hover:bg-emerald-600"
                      : "border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-50",
                  ].join(" ")}
                >
                  Record Payment
                </button>
                <button
                  type="button"
                  disabled={approvalSubmitting}
                  onClick={() => setApprovalMode(approvalMode === "reject" ? null : "reject")}
                  className={[
                    "inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-70",
                    approvalMode === "reject"
                      ? "border-rose-400 bg-rose-500 text-white hover:bg-rose-600"
                      : "border-rose-200 bg-white text-rose-700 hover:bg-rose-50",
                  ].join(" ")}
                >
                  Reject
                </button>
              </div>

              {approvalMode === "record" ? (
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-white p-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className={projectFormLabelClassName}>Payment Method</label>
                      <select
                        className={projectFormInputClassName}
                        value={approvalMethod}
                        onChange={(event) => setApprovalMethod(event.target.value)}
                      >
                        {PAYMENT_METHOD_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={projectFormLabelClassName}>Transaction Reference</label>
                      <input
                        type="text"
                        className={projectFormInputClassName}
                        value={approvalReference}
                        onChange={(event) => setApprovalReference(event.target.value)}
                        placeholder="UPI ID or bank reference"
                      />
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className={projectFormLabelClassName}>Note (optional)</label>
                    <input
                      type="text"
                      className={projectFormInputClassName}
                      value={approvalNotes}
                      onChange={(event) => setApprovalNotes(event.target.value)}
                      placeholder="Internal note for this payment"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={approvalSubmitting}
                    onClick={() => submitApproval("approve_with_payment")}
                    className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-emerald-400 bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {approvalSubmitting ? "Saving..." : "Record Payment & Approve"}
                  </button>
                </div>
              ) : null}

              {approvalMode === "reject" ? (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-white p-4">
                  <label className={projectFormLabelClassName}>Rejection Reason</label>
                  <input
                    type="text"
                    className={projectFormInputClassName}
                    value={approvalRejectReason}
                    onChange={(event) => setApprovalRejectReason(event.target.value)}
                    placeholder="Reason shown to the customer"
                  />
                  <button
                    type="button"
                    disabled={approvalSubmitting || !approvalRejectReason.trim()}
                    onClick={() => submitApproval("reject")}
                    className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-rose-400 bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {approvalSubmitting ? "Rejecting..." : "Confirm Reject"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
          Loading project details...
        </div>
      ) : error ? (
        <div className="rounded-[1.5rem] border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      ) : (
        <div className="space-y-5">
          {isProjectDetail ? (
            <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Payments</h3>
                  <p className="mt-1 text-sm text-slate-500">This project's own payment and invoice history.</p>
                </div>
              </div>

              {orderLedgerItems.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-500">
                  No payment or invoice records for this project yet.
                </div>
              ) : (
                <div className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200">
                  {orderLedgerItems.map((led) => {
                    const isTxn = led.kind === "transaction";
                    return (
                      <div key={led.id} className="px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase text-slate-500">
                                {isTxn ? "Payment" : "Invoice"}
                              </span>
                              <span className="font-semibold text-slate-900">{led.title}</span>
                              <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${getBadgeClassName(getLedgerStatusLabel(led.status))}`}>
                                {getLedgerStatusLabel(led.status)}
                              </span>
                            </div>
                            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                              <span>{led.method}</span>
                              <span>{formatDateTime(led.date)}</span>
                            </div>
                            {isTxn && led.raw?.rejectionReason ? (
                              <div className="mt-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-1.5 text-xs text-rose-700">
                                Reason: {led.raw.rejectionReason}
                              </div>
                            ) : null}
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-slate-500">Amount</p>
                            <p className="text-base font-bold text-slate-900">{formatCurrency(led.amount)}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          {isProjectDetail ? (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-500">Progress Nodes</p>
                      <h3 className="mt-1 text-lg font-semibold text-slate-900">Click a node for details</h3>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500">
                        {runNodes.length} nodes
                      </span>
                      <button
                        type="button"
                        onClick={() => setResetPreviewOpen((current) => !current)}
                        disabled={runNodes.length === 0 || isNodeActionSubmitting}
                        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-rose-300 bg-rose-100 px-3 text-xs font-semibold text-rose-800 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Reset history"
                        title={resetPreviewOpen ? "Close reset history" : "Reset history: archive current nodes and restart active progress at 0%"}
                      >
                        <RotateCcw size={19} />
                        <span>Reset history</span>
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2">
                    <span className="mr-1 text-xs font-semibold text-slate-600">{selectedNodeKeys.length} selected</span>
                    <button
                      type="button"
                      onClick={handleDeleteSelectedNodes}
                      disabled={!hasSelectedActiveNodes || isNodeActionSubmitting}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-rose-300 bg-rose-100 text-rose-800 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Delete selected node(s)"
                      title="Delete selected node(s)"
                    >
                      <Trash2 size={19} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStartEditNode(selectedNodeKeys[0])}
                      disabled={selectedNodeKeys.length !== 1 || !hasSelectedActiveNodes || isNodeActionSubmitting}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-amber-300 bg-amber-100 text-amber-800 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Edit selected node"
                      title="Edit selected node (deletes and recreates with corrected values)"
                    >
                      <Pencil size={19} />
                    </button>
                    <button
                      type="button"
                      onClick={handleRestoreSelectedNodes}
                      disabled={!hasSelectedInactiveNodes || isNodeActionSubmitting}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-300 bg-emerald-100 text-emerald-800 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Restore selected node(s)"
                      title="Restore selected node(s)"
                    >
                      <Undo2 size={19} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleVisibilitySelectedNodes(selectedNodesAreHiddenForClient)}
                      disabled={selectedNodeKeys.length === 0 || isNodeActionSubmitting}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-400 bg-slate-100 text-slate-800 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={selectedNodesAreHiddenForClient ? "Show selected node(s) to client" : "Hide selected node(s) from client"}
                      title={selectedNodesAreHiddenForClient ? "Show selected node(s) to client" : "Hide selected node(s) from client"}
                    >
                      {selectedNodesAreHiddenForClient ? <Eye size={19} /> : <EyeOff size={19} />}
                    </button>
                    <label className="ml-auto inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={hideDeletedNodesForClient}
                        onChange={(event) => setHideDeletedNodesForClient(event.target.checked)}
                        disabled={!hasInactiveNodes}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      Always hide deleted nodes from client
                    </label>
                  </div>

                  {nodeActionNotice ? (
                    <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
                      {nodeActionNotice}
                    </p>
                  ) : null}

                  {resetPreviewOpen ? (
                    <div className="mt-3 space-y-2.5 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2.5">
                      <div>
                        <p className="text-xs font-semibold text-slate-900">Reset project timeline</p>
                        <p className="mt-0.5 text-xs text-slate-500">Current nodes become archived history; active progress restarts at 0% with a new starting node.</p>
                      </div>
                      <input
                        type="text"
                        value={resetStartingTitle}
                        onChange={(event) => setResetStartingTitle(event.target.value)}
                        placeholder="New starting node title"
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none focus:border-slate-500"
                      />
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={handleResetTimeline}
                          disabled={isNodeActionSubmitting || !resetStartingTitle.trim()}
                          className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Confirm reset
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-4 max-h-[25rem] space-y-2 overflow-y-auto pr-1">
                    {runNodes.length === 0 ? (
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
                        No node history available for this project.
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setUpdateMode(true);
                            setEditingNodeKey(null);
                          }}
                          className={[
                            "flex w-full items-start gap-4 rounded-2xl border px-4 py-3 text-left transition",
                            updateMode
                              ? "border-slate-500 bg-slate-200 shadow-sm"
                              : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                          ].join(" ")}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate font-semibold text-slate-900">
                                {allNodesCompleted ? "Send Update" : "Add Node"}
                              </p>
                              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                Action
                              </span>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                              <span>{allNodesCompleted ? "Project update" : "Add a new progress node"}</span>
                              <span>Click to open</span>
                            </div>
                          </div>
                        </button>

                        {displayedNodes.map((node) => {
                        const selectionKey = getNodeSelectionKey(node);
                        const isSelected = selectionKey === selectedCheckpointId;
                        const isInactive = node.status === "deleted";
                        const isVisibleToClient = node.visibleToClient !== false;
                        const isHiddenFromClient = !isVisibleToClient || (isInactive && hideDeletedNodesForClient);
                        const isFocusedForSelection = focusedNodeKey === selectionKey;

                        return (
                          <div
                            key={selectionKey}
                            className="flex w-full items-center gap-2"
                          >
                            <input
                              type="checkbox"
                              checked={selectedNodeKeys.includes(selectionKey)}
                              onFocus={() => setFocusedNodeKey(selectionKey)}
                              onChange={() => toggleNodeSelection(selectionKey)}
                              className="h-4 w-4 shrink-0 rounded border-slate-300 text-rose-600"
                              aria-label={`Select ${node.title} for node management`}
                            />
                            <button
                              type="button"
                              ref={(element) => {
                                if (element) nodeRowRefs.current[selectionKey] = element;
                              }}
                              onFocus={() => setFocusedNodeKey(selectionKey)}
                              onKeyDown={(event) => {
                                if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                                  event.preventDefault();
                                  const currentIndex = displayedNodeKeys.indexOf(selectionKey);
                                  const direction = event.key === "ArrowUp" ? -1 : 1;
                                  const nextIndex = Math.min(
                                    Math.max(currentIndex + direction, 0),
                                    displayedNodeKeys.length - 1
                                  );
                                  const nextKey = displayedNodeKeys[nextIndex];
                                  nodeRowRefs.current[nextKey]?.focus();
                                  setFocusedNodeKey(nextKey);
                                  return;
                                }
                                if (event.key !== " " && event.key !== "Spacebar") return;
                                event.preventDefault();
                                if (event.shiftKey && selectionAnchorKey) {
                                  setSelectedNodeKeys(getNodeSelectionRange(selectionKey));
                                } else {
                                  toggleNodeSelection(selectionKey);
                                }
                              }}
                              onClick={(event) => selectNodeFromList(selectionKey, {
                                ctrlKey: event.ctrlKey || event.metaKey,
                                shiftKey: event.shiftKey,
                              })}
                              className={[
                                "min-w-0 flex-1 rounded-2xl border px-4 py-3 text-left transition",
                                isSelected
                                  ? "border-emerald-300 bg-emerald-50 shadow-sm"
                                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                                isFocusedForSelection ? "ring-2 ring-slate-300 ring-offset-1" : "",
                              ].join(" ")}
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate font-semibold text-slate-900">{node.title}</p>
                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${getNodeBadgeClass(node)}`}>
                                  {getNodeStatusLabel(node)}
                                </span>
                                {isHiddenFromClient ? (
                                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600">Client hidden</span>
                                ) : null}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                                <span>Progress: {node.cumulativeProgress}%</span>
                                <span>Created: {formatDateTime(node.createdAt)}</span>
                              </div>
                            </button>
                          </div>
                        );
                        })}
                      </>
                    )}
                  </div>
                </div>

                <AdminProjectCheckpointDetail
                  node={selectedNode}
                  messages={item?.messages}
                  updateMode={updateMode}
                  updateModeLabel={allNodesCompleted ? "Send Update" : "Add Node"}
                  updateMessage={updateMessage}
                  onUpdateMessageChange={setUpdateMessage}
                  currentProjectProgress={currentProjectProgress}
                  formatDateTime={formatDateTime}
                  onAddNode={handleAddNode}
                  isSubmitting={isNodeActionSubmitting}
                  editingNode={editingNodeForDetail}
                  editBounds={editBounds}
                  onSaveCorrection={handleSaveCorrection}
                  onCancelEdit={handleCancelEditNode}
                />
              </div>

            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5 lg:col-span-2">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-500">Timeline</p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-900">{summaryTitle}</h3>
                </div>
                <span
                  className={[
                    "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
                    getBadgeClassName(itemStatus),
                  ].join(" ")}
                >
                  {itemStatus}
                </span>
              </div>

              <div className="mt-4 rounded-[1.25rem] border border-slate-200 bg-white p-4">
                <p className="text-sm text-slate-500">
                  Last updated: {formatDateTime(item?.updatedAt || item?.createdAt)}
                </p>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${Math.max(0, Math.min(100, item?.projectProgress || 0))}%` }}
                  />
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {item?.projectProgress || 0}% complete
                </p>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm font-medium text-slate-500">{detailLabel} Info</p>
              <div className="mt-4 space-y-4 text-sm text-slate-700">
                <InfoLine label="Category" value={getCategoryLabel(getProjectCategory(item))} />
                <InfoLine label="Current Phase" value={getProjectPhaseLabel(item)} />
                <InfoLine label="Created" value={formatDateTime(item?.createdAt)} />
                <InfoLine label="Updated" value={formatDateTime(item?.updatedAt || item?.createdAt)} />
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};

const InfoLine = ({ label, value }) => {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="max-w-[60%] truncate text-right font-semibold text-slate-900">{value}</span>
    </div>
  );
};

export default AdminClientWorkspace;
