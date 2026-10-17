import React, { useState, useEffect, useRef, useCallback, useContext, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { 
  X, ArrowLeft, Clock, Check, List, Upload,
  ExternalLink, ChevronDown
} from 'lucide-react';
import { toast } from 'sonner';
import { getOrderCategoryLabel, getOrderDisplayName } from '../helpers/orderPresentation';
import SummaryApi from '../common';
import TriangleMazeLoader from '../components/TriangleMazeLoader';
import DashboardLayout from '../components/DashboardLayout';
import AdminLayout from '../components/AdminLayout';
import UpdateRequestModal from '../components/UpdateRequestModal';
import PaymentAlert from '../components/PaymentAlert';
import { logout } from '../store/userSlice';
import CookieManager from '../utils/cookieManager';
import StorageService from '../utils/storageService';
import { useOnlineStatus } from '../App';
import { isPlanItem } from '../helpers/orderType';
import AddServiceModal from '../components/AddServiceModal';
import ProjectServiceWorkspace from '../components/ProjectServiceWorkspace';
import Context from '../context';
import { customerChildState, goToCustomerReturn } from '../helpers/customerReturnNavigation';
import UploadedDataList from '../components/UploadedDataList';
import { downloadAuthenticatedFile } from '../helpers/downloadFile';
import OrderLifecycleTimeline from '../components/OrderLifecycleTimeline';

const normalizeNodeKey = (value) => {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
};

const getDefaultNodeId = (nodes = []) => {
  const activeNodes = nodes.filter((node) => node.status === 'active');
  const lastActiveNode = activeNodes[activeNodes.length - 1];

  if (lastActiveNode) {
    return normalizeNodeKey(lastActiveNode.nodeId);
  }

  if (nodes.length > 0) {
    return normalizeNodeKey(nodes[nodes.length - 1].nodeId);
  }

  return '';
};

const TimelineCheckpointItem = ({
  checkpoint: node,
  isCompleted,
  isInProgress,
  isDeleted = false,
  isSelected,
  messageCount,
  formatDate,
  onSelect,
  compact = false,
  isGlass = false,
  // Expanded state carries the node's own record inline. isExpanded is driven by the
  // same selectedNodeId the page already tracked, so selection and expansion are one
  // thing, not two competing states.
  isExpanded = false,
  messages = [],
  formatDateTimeValue,
}) => {
  const statusLabel = isDeleted
    ? 'Deleted'
    : compact
      ? isCompleted
        ? 'Done'
        : isInProgress
          ? 'Live'
          : 'Soon'
      : isCompleted
        ? 'Completed'
        : isInProgress
          ? 'In Progress'
          : 'Upcoming';

  const statusTone = isDeleted
    ? isGlass
      ? 'border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-secondary)]'
      : 'border-[var(--glass-border)] bg-slate-100 text-[var(--text-muted)]'
    : isGlass
      ? isCompleted
        ? 'border-[var(--badge-success-border)] bg-[var(--badge-success-bg)] text-[var(--badge-success-fg)]'
        : isInProgress
          ? 'border-[var(--glass-border-strong)] bg-[var(--glass-bg-strong)] text-[var(--text-primary)]'
          : 'border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-secondary)]'
      : isCompleted
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : isInProgress
          ? 'border-[var(--glass-border)] bg-slate-100 text-[var(--text-secondary)]'
          : 'border-[var(--glass-border)] bg-white text-[var(--text-secondary)]';

  const cardTone = isDeleted
    ? isGlass
      ? 'border-[var(--glass-border)] bg-[var(--glass-bg-subtle)]'
      : 'border-[var(--glass-border)] bg-slate-50'
    : isGlass
      ? isSelected
        ? compact
          ? 'border-[var(--glass-border-strong)] bg-[var(--glass-bg)] ring-2 ring-[var(--glass-border-strong)]'
          : 'border-[var(--glass-border-strong)] bg-[var(--glass-bg)] shadow-md ring-2 ring-[var(--glass-border-strong)]'
        : 'border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] hover:border-[var(--glass-border-strong)] hover:bg-[var(--glass-bg-subtle)]'
      : isSelected
        ? compact
          ? 'border-[var(--glass-border)] bg-slate-50 ring-2 ring-slate-200'
          : 'border-[var(--glass-border)] bg-white shadow-md ring-2 ring-slate-200'
        : 'border-[var(--glass-border)] bg-white hover:border-[var(--glass-border)] hover:bg-slate-50';

  const badgeTone = isDeleted
    ? isGlass
      ? 'border-[var(--glass-border-strong)] bg-[var(--glass-bg-strong)]'
      : 'border-[var(--glass-border)] bg-slate-200'
    : isGlass
      ? isSelected
        ? 'border-[var(--glass-border-strong)] bg-[var(--glass-bg-strong)]'
        : isCompleted
          ? 'border-[var(--badge-success-border)] bg-[var(--badge-success-bg)]'
          : isInProgress
            ? 'border-[var(--glass-border-strong)] bg-[var(--glass-bg-strong)]'
            : 'border-[var(--glass-border)] bg-[var(--glass-bg)]'
      : isSelected
        ? 'border-slate-400 bg-slate-100'
        : isCompleted
          ? 'border-emerald-500 bg-emerald-50'
          : isInProgress
            ? 'border-slate-400 bg-slate-100'
            : 'border-[var(--glass-border)] bg-white';

  // The node row is a button, so the expanded record cannot be nested inside it
  // (interactive content inside a button is invalid and breaks keyboard use).
  // The row and its expanded body are therefore siblings inside one card wrapper,
  // and the border/background that used to sit on the button now sits on that wrapper.
  return (
    <div
      className={[
        compact
          ? 'w-full overflow-hidden rounded-[1.25rem] border backdrop-blur-md transition'
          : 'relative w-full overflow-hidden rounded-[1.25rem] border backdrop-blur-md transition',
        cardTone,
      ].join(' ')}
    >
    <button
      type="button"
      data-node-id={node.nodeId}
      onClick={onSelect}
      aria-expanded={isExpanded}
      className={[
        'flex w-full items-start gap-3 text-left',
        compact ? 'p-3.5' : 'p-3',
      ].join(' ')}
    >
      <div
        className={[
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2',
          badgeTone,
        ].join(' ')}
      >
        {isDeleted ? (
          <X className={isGlass ? 'h-4 w-4 text-[var(--text-secondary)]' : 'h-4 w-4 text-[var(--text-secondary)]'} />
        ) : isCompleted ? (
          <Check className={isGlass ? 'h-4 w-4 text-[var(--badge-success-fg)]' : 'h-4 w-4 text-emerald-500'} />
        ) : isInProgress ? (
          <Clock className={isGlass ? 'h-4 w-4 text-[var(--text-primary)]' : 'h-4 w-4 text-[var(--text-secondary)]'} />
        ) : (
          <span className={isGlass ? 'h-3 w-3 rounded-full bg-[var(--glass-bg-strong)]' : 'h-3 w-3 rounded-full bg-slate-300'}></span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className={compact ? 'flex items-center justify-between gap-2' : 'flex flex-wrap items-center gap-2'}>
          <h3 className={[
            'truncate text-base font-semibold',
            isDeleted ? 'line-through' : '',
            isDeleted ? (isGlass ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)]') : (isGlass ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]'),
          ].join(' ')}>
            {node.title}
          </h3>
          {/* Progress rides inside the status badge rather than beside it — "Completed"
              next to "100% complete" said the same thing twice. A deleted node has no
              meaningful progress, so it keeps the bare label. */}
          <span className={["rounded-full border px-2 py-0.5 text-sm font-semibold tabular-nums", statusTone].join(' ')}>
            {isDeleted ? statusLabel : `${statusLabel} · ${node.cumulativeProgress}%`}
          </span>
        </div>
        {/* Collapsed only. Once the node is open its record carries the full date and
            time per update, so showing a date here too would print it twice. */}
        {!isExpanded ? (
          <div className={isGlass ? 'mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-[var(--text-secondary)]' : 'mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-[var(--text-primary)]'}>
            <span>{formatDate(node.createdAt)}</span>
          </div>
        ) : null}
      </div>

      <ChevronDown
        className={[
          'mt-1 h-4 w-4 shrink-0 transition-transform',
          isExpanded ? 'rotate-180' : '',
          isGlass ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)]',
        ].join(' ')}
      />
    </button>

    {/* The record that used to live in the third column. Same data, rendered inside
        the node it belongs to, so the timeline gets the full width instead. */}
    {isExpanded ? (
      <div className={[
        compact ? 'px-3.5 pb-3.5' : 'px-3 pb-3',
        isGlass ? 'border-t border-[var(--glass-border)]' : 'border-t border-[var(--glass-border)]',
      ].join(' ')}>
        {/* Only what the row above does not already say. The row carries the node's
            title, date and update count, so repeating them here (and labelling each
            with its own heading) was decoration, not information. Progress is the one
            fact the row omits, so it rides along with each note instead of claiming a
            column of its own. Message titles are dropped too — checkpointName is the
            node's own name in practice, printed two lines above. */}
        {messages.length > 0 ? (
          <div className={isGlass ? 'divide-y divide-[var(--divider)]' : 'divide-y divide-slate-200'}>
            {messages.map((message, index) => (
              <div
                key={message._id || message.id || `${node.nodeId}-message-${index}`}
                className="py-3"
              >
                <p className={isGlass ? 'whitespace-pre-line text-base leading-6 text-[var(--text-secondary)]' : 'whitespace-pre-line text-base leading-6 text-[var(--text-secondary)]'}>
                  {message.message || message.remark || message.notes || '—'}
                </p>
                {/* Progress belongs to the node, not to each update, so it is printed
                    once below rather than repeated on every row. */}
                <div className={[
                  'mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm tabular-nums',
                  isGlass ? 'text-[var(--text-muted)]' : 'text-[var(--text-muted)]',
                ].join(' ')}>
                  {message.timestamp && formatDateTimeValue ? (
                    <span>{formatDateTimeValue(message.timestamp)}</span>
                  ) : null}
                  {(message.fileName || message.fileSize) ? (
                    <span className={isGlass ? 'text-[var(--badge-success-fg)]' : 'text-emerald-700'}>
                      {message.fileName || 'Attachment'}
                      {message.fileSize ? ` · ${message.fileSize}` : ''}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className={[
            'pt-3 text-sm',
            isGlass ? 'text-[var(--text-muted)]' : 'text-[var(--text-muted)]',
          ].join(' ')}>
            No update recorded
          </p>
        )}
      </div>
    ) : null}
    </div>
  );
};

const ProjectDetails = ({ isAdminView = false }) => {
  const { orderId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const user = useSelector((state) => state?.user?.user);
  const { isOnline } = useOnlineStatus();
  const timelineRef = useRef(null);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [shouldShowPaymentAlert, setShouldShowPaymentAlert] = useState(false);
  const [currentInstallment, setCurrentInstallment] = useState(null);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  // What the customer has uploaded against THIS order (updateRequestModel records).
  const [uploadHistory, setUploadHistory] = useState([]);
  const [uploadHistoryLoading, setUploadHistoryLoading] = useState(false);
  const [downloadingUploadId, setDownloadingUploadId] = useState('');
  const [showAddServiceModal, setShowAddServiceModal] = useState(false);
  const [isProjectPaused, setIsProjectPaused] = useState(false);
  // Wallet balance for the add-service modal — read from the app-wide SSOT,
  // never fetched separately here.
  const appContext = useContext(Context);
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const g = (adminClass, customerClass) => (isAdminView ? adminClass : customerClass);
  const [selectedNodeId, setSelectedNodeId] = useState('');

  const handleLogout = async () => {
    try {
      if (isOnline) {
        const response = await fetch(SummaryApi.logout_user.url, {
          method: SummaryApi.logout_user.method,
          credentials: 'include',
        });

        const data = await response.json();
        if (data.success) {
          toast.success(data.message);
        }
      }

      CookieManager.clearAll();
      StorageService.clearUserData();

      dispatch(logout());
      navigate('/');
    } catch (error) {
      console.error('Error during logout:', error);
      toast.error('Logout failed. Please try again.');
    }
  };

  const Shell = isAdminView ? AdminLayout : DashboardLayout;
  const shellProps = isAdminView
    ? {
        user,
        onLogout: handleLogout,
      }
    : {
        user,
      };
  const checkPaymentStatus = useCallback(async (order) => {
    // If project is already completed, don't show payment alert
    // A finished or closed project has no payment left to chase. Derived from the engine's
    // state code where present (backend/helpers/orderStatusEngine.js); the raw expression is
    // the pre-engine fallback. 'cancelled' was missing here — a cancelled project could still
    // raise a payment alert for money that has already been settled and refunded.
    const stateCode = order.orderState?.code;
    const isClosedToPayment = stateCode
      ? ['completed', 'cancelled', 'rejected'].includes(stateCode)
      : order.projectProgress >= 100 || order.currentPhase === 'completed';
    if (isClosedToPayment) {
      setShouldShowPaymentAlert(false);
      setIsProjectPaused(false);
      return;
    }

    // A payment the customer has already submitted but the admin hasn't verified yet.
    // Sourced from the order payload itself (getOrderDetails.js derives `hasPendingPayment`
    // from the pending transaction, alongside hasUnpaidInvoice) — no separate request.
    //
    // Before: this called `SummaryApi.checkPendingOrderTransactions`, a route that was never
    // registered on the backend. Every call 404'd, threw on JSON.parse, and was swallowed by the
    // catch below — so a submitted-but-unapproved payment never showed as pending anywhere.
    if (order.hasPendingPayment) {
      const installmentNumber = order.pendingPayment?.installmentNumber || 1;

      const relevantInstallment =
        (order.installments || []).find(
          (inst) => inst.installmentNumber === installmentNumber
        ) || {
          installmentNumber,
          amount: order.pendingPayment?.amount || 0,
        };

      setShouldShowPaymentAlert(true);
      setIsProjectPaused(false); // Not paused while payment is being verified
      setCurrentInstallment({
        ...relevantInstallment,
        paymentStatus: 'pending-approval'
      });
      return;
    }

    // Regular installment check flow
    if (order.installments && order.installments.length > 0) {
      const nextUnpaidInstallment = order.installments.find(inst => !inst.paid);
      
      if (nextUnpaidInstallment) {
        // Check if there's a pending approval for this installment in the order record
        const isPendingApproval = nextUnpaidInstallment.paymentStatus === 'pending-approval';
        
        // If payment is awaiting verification based on order status, show the pending alert
        if (isPendingApproval) {
          setShouldShowPaymentAlert(true);
          setIsProjectPaused(false); // Not paused while payment is being verified
          setCurrentInstallment({
            ...nextUnpaidInstallment,
            paymentStatus: 'pending-approval'
          });
          return;
        }
        
        // Determine if we should show the alert based on progress. Prefer the installment's own
        // admin-configured progressThreshold (Layer B — per-project gate, matches the backend's
        // appendProjectNode() cap in projectNodeService.js exactly). Fall back to the old
        // hardcoded 40%/75% only for installments created before this field existed
        // (progressThreshold is null/undefined on them), so pre-existing orders keep behaving
        // exactly as before.
        const hasThreshold = nextUnpaidInstallment.progressThreshold != null;
        const shouldPause = hasThreshold
          ? Math.round(order.projectProgress) >= Number(nextUnpaidInstallment.progressThreshold)
          : (nextUnpaidInstallment.installmentNumber === 2 && Math.round(order.projectProgress) >= 40) ||
            (nextUnpaidInstallment.installmentNumber === 3 && Math.round(order.projectProgress) >= 75);

        setShouldShowPaymentAlert(shouldPause);
        setIsProjectPaused(shouldPause);
        setCurrentInstallment(nextUnpaidInstallment);
      } else {
        // All installments paid, no alert needed
        setShouldShowPaymentAlert(false);
        setIsProjectPaused(false);
      }
    }
  }, []);

  // Upload history for this order, from the shared source (orderUploadHistory.js).
  // The server resolves which records belong to this order — a project also owns the
  // uploads made against the services linked to it — so nothing is filtered here, and
  // the admin view reads the same endpoint rather than being skipped.
  const fetchUploadHistory = useCallback(async () => {
    setUploadHistoryLoading(true);
    try {
      const response = await fetch(`${SummaryApi.orderUploads.url}/${orderId}/uploads`, {
        method: SummaryApi.orderUploads.method,
        credentials: 'include',
      });
      const data = await response.json();
      setUploadHistory(data?.success ? (data.data || []) : []);
    } catch (error) {
      console.error('Error fetching upload history:', error);
      setUploadHistory([]);
    } finally {
      setUploadHistoryLoading(false);
    }
  }, [orderId]);

  const fetchOrderDetails = useCallback(async () => {
    try {
      // First fetch order data
      const orderResponse = await fetch(`${SummaryApi.orderDetails.url}/${orderId}`, {
        credentials: 'include',
      });
      const orderData = await orderResponse.json();
      
      if (orderData.success) {
        const order = orderData.data;

        if (!isAdminView && isPlanItem(order)) {
          navigate(`/plan-details/${orderId}`, { replace: true, state: location.state });
          return;
        }

        // A pending-approval order (payment submitted, awaiting admin approval — either the whole
        // order or a later installment's UPI portion) no longer full-page-blocks the customer.
        // The project stays visible and interactive to whatever degree it already is; the
        // "Upload Data" action gate below (isActionLocked) covers the payment-pending case with a
        // disabled button + badge instead, matching the existing hasUnpaidInvoice pattern rather
        // than a separate, inconsistent full-screen state.

        if (order.orderVisibility === 'payment-rejected') {
          setOrder({
            ...order,
            isPaymentRejected: true,
            rejectionReason: order.rejectionReason || "Your payment was rejected. Please retry payment to access this project."
          });
          setLoading(false);
          return;
        }

        const nodes = Array.isArray(order.projectNodes) ? order.projectNodes : [];
        const normalizedMessages = Array.isArray(order.messages)
          ? order.messages.map((message) => {
              const linkedNode = message.nodeId
                ? nodes.find((node) => node.nodeId === message.nodeId)
                : null;

              return {
                ...message,
                checkpointName: linkedNode?.title || 'Project Update',
              };
            })
          : [];

        const mappedOrder = {
          ...order,
          messages: normalizedMessages,
        };

        setOrder(mappedOrder);

        // Check if this is a partial payment order and if we should show payment alert
        if (order.isPartialPayment) {
          checkPaymentStatus(mappedOrder);
        }
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  }, [orderId, checkPaymentStatus, isAdminView]);

  useEffect(() => {
    fetchOrderDetails();
  }, [fetchOrderDetails]);

  useEffect(() => {
    fetchUploadHistory();
  }, [fetchUploadHistory]);

  // Add polling mechanism — covers changes made by SOMEONE ELSE (admin approving a payment,
  // pushing project progress), which this tab has no way of knowing about.
  useEffect(() => {
    const intervalId = setInterval(() => {
      fetchOrderDetails();
    }, 30000); // Check every 30 seconds

    return () => clearInterval(intervalId);
  }, [fetchOrderDetails]);

  // Soft refresh after the customer pays — InvoiceDetailPage sets a sessionStorage
  // marker before returning through the shared customer-navigation contract. This
  // consumes it exactly once so the page never shows pre-payment data until polling.
  useEffect(() => {
    let paymentJustSubmitted = null;
    try {
      paymentJustSubmitted = sessionStorage.getItem('paymentJustSubmitted');
      if (paymentJustSubmitted) sessionStorage.removeItem('paymentJustSubmitted');
    } catch (error) {
      // Storage unavailable — the 30s polling above still picks the change up.
    }

    if (paymentJustSubmitted) fetchOrderDetails();
  }, [fetchOrderDetails]);

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDateTime = (date) => {
    return `${formatDate(date)} at ${formatTime(date)}`;
  };

  const handleBack = () => {
    if (isAdminView) {
      navigate(-1);
      return;
    }

    goToCustomerReturn(navigate, location, '/projects-and-plans');
  };

  // SSOT: all payment goes through the canonical invoice page. This project page never
  // hosts its own payment form — it only routes to /invoice-detail/:invoiceId, which is
  // the single place an invoice is paid.
  const handleMakePayment = () => {
    if (order?.unpaidInvoice?._id) {
      navigate(`/invoice-detail/${order.unpaidInvoice._id}`, {
        state: customerChildState(location),
      });
    } else {
      navigate(`/order-detail/${orderId}`, {
        state: customerChildState(location),
      });
    }
  };

  // Same completion test the payment-alert logic already uses (see
  // checkPaymentStatus) — kept identical so "finished" means one thing on
  // this page.
  // Read from the engine's derived state where it is available, so a gate can never disagree
  // with the badge sitting next to it. The raw-field expression stays as the fallback for
  // payloads that predate the engine.
  const isProjectFinished = order
    ? (order.orderState?.code
        ? order.orderState.code === 'completed'
        : order.projectProgress >= 100 || order.currentPhase === 'completed')
    : false;

  // A service can be attached to any project that is a confirmed sale — whether
  // it is mid-build, on an installment plan, or already delivered. The only
  // exclusions are the states where the project itself isn't real yet (awaiting approval,
  // rejected) or is closed for good (cancelled — settled and refunded, nothing new may be
  // bought against it).
  const canAddService = Boolean(
    order &&
      (order.orderState?.code
        ? !['pending_approval', 'processing', 'rejected', 'cancelled'].includes(order.orderState.code)
        : order.orderVisibility !== 'pending-approval' &&
          order.orderVisibility !== 'payment-rejected' &&
          order.orderVisibility !== 'cancelled')
  );

  // Services are picked in a modal rather than on a separate page, so the
  // customer never leaves their project — no attach-context has to be carried
  // through navigation, and closing returns them exactly where they were.
  const handleAddService = () => setShowAddServiceModal(true);

  // The upload zip is fetched, not linked to, so the session cookie travels with it —
  // see helpers/downloadFile.js. One at a time; the list shows which is preparing.
  const handleUploadDownload = async (attempt) => {
    if (!attempt?.id || downloadingUploadId) return;
    try {
      setDownloadingUploadId(attempt.id);
      // Same name the server sets in Content-Disposition, which a blob download cannot read.
      await downloadAuthenticatedFile(
        `${SummaryApi.downloadUploadZip.url}/${attempt.id}/download`,
        `uploaded-data-${attempt.id}.zip`
      );
      toast.success('Download started');
    } catch (error) {
      toast.error(error.message || 'Failed to download files');
    } finally {
      setDownloadingUploadId('');
    }
  };

  const sortedNodes = useMemo(() => {
    const nodes = order?.projectNodes || [];
    return [...nodes].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }, [order?.projectNodes]);

  // The newest active node is the one being worked on — unless it has reached 100%,
  // in which case nothing is in progress and every node reads as completed. Backend
  // already draws this line (syncActiveProjectProgress marks the order "completed" at
  // 100%); without the same check here the page showed "In Progress" on a node the
  // server considered finished.
  const inProgressNode = useMemo(() => {
    const activeNodes = sortedNodes.filter((node) => node.status === 'active');
    const latest = activeNodes[activeNodes.length - 1] || null;
    if (!latest) return null;
    return Number(latest.cumulativeProgress) >= 100 ? null : latest;
  }, [sortedNodes]);

  const timelineNodes = useMemo(
    () => [...sortedNodes].reverse(),
    [sortedNodes]
  );
  const selectedNode = useMemo(
    () =>
      timelineNodes.find(
        (node) => normalizeNodeKey(node.nodeId) === normalizeNodeKey(selectedNodeId)
      ) || null,
    [selectedNodeId, timelineNodes]
  );
  const selectedNodeMessages = useMemo(
    () =>
      (order?.messages || []).filter(
        (message) => normalizeNodeKey(message.nodeId) === normalizeNodeKey(selectedNode?.nodeId)
      ),
    [order?.messages, selectedNode?.nodeId]
  );
  // Which node is open. Nothing chosen yet ⇒ the latest node, which timelineNodes
  // already sorts to the top (it is sortedNodes reversed). Derived rather than seeded
  // into state so a newly added node becomes the open one on its own, with no effect
  // to keep in sync.
  const [collapsedOnDesktop, setCollapsedOnDesktop] = useState(false);
  const expandedNodeId = useMemo(
    () => (collapsedOnDesktop ? '' : selectedNodeId || timelineNodes[0]?.nodeId || ''),
    [collapsedOnDesktop, selectedNodeId, timelineNodes]
  );
  // Each node now renders its own record inline, so it needs the messages themselves,
  // not just how many there are. Built once here and reused for both — the counts are
  // derived from this same map so a node's badge can never disagree with its record.
  const nodeMessages = useMemo(
    () =>
      timelineNodes.reduce((acc, node) => {
        acc[node.nodeId] = (order?.messages || []).filter(
          (message) => normalizeNodeKey(message.nodeId) === normalizeNodeKey(node.nodeId)
        );
        return acc;
      }, {}),
    [order?.messages, timelineNodes]
  );
  const nodeMessageCounts = useMemo(
    () =>
      Object.keys(nodeMessages).reduce((acc, nodeId) => {
        acc[nodeId] = nodeMessages[nodeId].length;
        return acc;
      }, {}),
    [nodeMessages]
  );

  useEffect(() => {
    const defaultNodeId = getDefaultNodeId(sortedNodes);

    setSelectedNodeId((currentSelection) => {
      const selectionExists = timelineNodes.some(
        (node) => normalizeNodeKey(node.nodeId) === normalizeNodeKey(currentSelection)
      );

      if (selectionExists) {
        return currentSelection;
      }

      return defaultNodeId;
    });
  }, [orderId, sortedNodes, timelineNodes]);

  if (loading) {
    return (
      <Shell {...shellProps}>
        {/* Shared with the admin view (no isAdminView gate), so this backdrop is left
            as-is: theming it would change admin markup. */}
        <div className="fixed inset-0 bg-black bg-opacity-10 flex items-center justify-center z-50">
          <div className="rounded-lg p-8">
            <TriangleMazeLoader />
          </div>
        </div>
      </Shell>
    );
  }

  // Special rendering for rejected payments
  if (order && order.isPaymentRejected && !isAdminView) {
    return (
      <Shell {...shellProps}>
        <div className="p-6">
          <div className="rounded-r-lg border-l-4 border-[var(--badge-error-border)] bg-[var(--badge-error-bg)] p-4 shadow-sm">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-[var(--badge-error-fg)]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-lg font-semibold text-[var(--badge-error-fg)]">Payment Rejected</h3>
                <div className="mt-2 text-base text-[var(--text-secondary)]">
                  <p>Your payment for this project was rejected.</p>
                  <p className="mt-2 font-medium">Reason: {order.rejectionReason || "Payment verification failed"}</p>
                </div>
                <div className="mt-4 flex space-x-4">
                  <button
                    onClick={handleBack}
                    className="rounded-lg border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] px-4 py-2 text-base font-semibold text-[var(--text-primary)] transition hover:bg-[var(--glass-bg-strong)]"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => {
                      // SSOT: retry pays the same invoice via the canonical invoice page —
                      // no re-order through DirectPayment.js (which would create a duplicate).
                      if (order?.unpaidInvoice?._id) {
                        navigate(`/invoice-detail/${order.unpaidInvoice._id}`, {
                          state: customerChildState(location),
                        });
                      } else {
                        navigate(`/order-detail/${order._id}`, {
                          state: customerChildState(location),
                        });
                      }
                    }}
                    className="rounded-lg bg-[rgb(var(--ink-rgb))] px-4 py-2 text-base font-semibold text-[var(--page-bg)] transition hover:bg-[rgb(var(--ink-rgb)/0.85)]"
                  >
                    Retry Payment
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  if (!order) {
    return (
      <Shell {...shellProps}>
        <div className="p-6">
          <div className="bg-white rounded-lg p-6 text-center shadow-sm">
            <h2 className="text-lg font-semibold text-red-600 mb-2">Project Not Found</h2>
            <p className="text-base text-[var(--text-primary)] mb-4">The project you're looking for doesn't exist or you don't have access to it.</p>
            <button
                    onClick={handleBack}
              className="px-4 py-2 bg-emerald-600 text-[var(--text-primary)] rounded-lg hover:bg-emerald-700 text-base font-semibold"
            >
              Back
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  const shouldShowServiceWorkspace = !isAdminView &&
    searchParams.get('view') !== 'project' &&
    Array.isArray(order.linkedServices) &&
    order.linkedServices.length > 0;

  if (shouldShowServiceWorkspace) {
    return (
      <Shell {...shellProps}>
        <ProjectServiceWorkspace
          project={order}
          onAddService={handleAddService}
          onBack={handleBack}
          onOpenService={(serviceOrderId) => navigate(
            `/project-details/${order._id}/services/${serviceOrderId}`,
            { state: customerChildState(location) }
          )}
          onOpenProject={() => navigate(
            `/project-details/${order._id}?view=project`,
            { state: customerChildState(location) }
          )}
        />
        <AddServiceModal
          isOpen={showAddServiceModal}
          onClose={() => setShowAddServiceModal(false)}
          projectOrderId={orderId}
          projectName={getOrderDisplayName(order, 'your project')}
          isProjectFinished={isProjectFinished}
          walletBalance={appContext?.walletBalance || 0}
          onPurchased={() => {
            appContext?.fetchWalletBalance?.();
            fetchOrderDetails();
          }}
        />
      </Shell>
    );
  }
  
  // Calculate progress percentage
  const progressPercentage = Math.round(order.projectProgress);
  const currentStageLabel = inProgressNode?.title || selectedNode?.title || 'All stages completed';
  const totalUpdates = order?.messages?.length || 0;

  // Whole-order pending-approval (admin hasn't approved the order yet) — no longer a
  // full-page block; it gates the "Upload Data" action the same way hasUnpaidInvoice does.
  const isOrderPendingApproval = order.orderVisibility === 'pending-approval';

  // Has the customer actually SUBMITTED money that is waiting on admin verification?
  // This is NOT the same thing as isOrderPendingApproval: a "pay later" (decide_later) order is
  // born 'pending-approval' with zero payment, so orderVisibility alone cannot tell "money sent,
  // awaiting approval" apart from "nothing paid yet". Only a pending payment transaction proves
  // money was submitted — derived by getOrderDetails.js as hasPendingPayment.
  const hasPendingPayment = Boolean(order.hasPendingPayment);
  // A finished project takes no more uploads. Read from the same projectProgress the
  // donut shows, which backend derives from the nodes — so the button and the timeline
  // can never disagree about whether the work is done.
  const isProjectComplete = progressPercentage >= 100;
  // A cancelled project is closed and its money already settled — nothing more can be
  // uploaded or requested against it.
  const isOrderCancelled = order.orderState?.code === 'cancelled' || order.orderVisibility === 'cancelled';
  const isUploadLocked =
    Boolean(order.hasUnpaidInvoice) || isOrderPendingApproval || isProjectComplete || isOrderCancelled;

  // Why the upload is locked, not just that it is. All four reasons used to collapse into one
  // "Pending" pill, so a CANCELLED project offered "Upload Data · Pending" — telling the customer
  // to wait for something that is never coming. The button now says which state it is in.
  const uploadLockMeta = isOrderCancelled
    ? { badge: 'Cancelled', title: 'This project has been cancelled' }
    : isProjectComplete
      ? { badge: null, title: 'This project is complete' }
      : order.hasUnpaidInvoice
        ? { badge: 'Payment due', title: 'You can upload data after payment is received' }
        : isOrderPendingApproval
          ? { badge: 'Pending', title: 'You can upload data after payment is confirmed' }
          : { badge: null, title: undefined };

  return (
    <Shell {...shellProps}>
      <div
        className={
          isAdminView
            ? 'w-full bg-slate-50 px-4 py-4 pb-8 sm:px-6 lg:px-8 lg:pb-10'
            : 'relative min-h-[calc(100vh-4rem)] overflow-hidden px-4 py-10 sm:px-6 lg:px-8 lg:py-14'
        }
      >
        {!isAdminView && <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />}

        <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-4">
          <div className="relative flex items-center justify-center">
            <button
              type="button"
              onClick={handleBack}
              className={g(
                'absolute left-0 inline-flex w-fit shrink-0 items-center gap-2 rounded-2xl border border-[var(--glass-border)] bg-white px-5 py-3 text-lg font-semibold text-[var(--text-primary)] transition hover:bg-slate-50', 'absolute left-0 inline-flex w-fit shrink-0 items-center gap-2 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-5 py-3 text-lg font-semibold text-[var(--text-primary)] backdrop-blur-md transition hover:bg-[var(--glass-bg-strong)]')}
            >
              <ArrowLeft className="h-5 w-5" />
              Back
            </button>

            <div className="text-center">
              <h1 className={g('text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl', 'text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl lg:text-4xl')}>
                {getOrderDisplayName(order)}
              </h1>
              <p className={g('mt-1 text-base text-[var(--text-primary)]', 'mt-1 text-base text-[var(--text-secondary)] sm:text-lg')}>
                {getOrderCategoryLabel(order, 'Project')}
              </p>
            </div>
          </div>

          {!isAdminView && shouldShowPaymentAlert && currentInstallment && (
            <PaymentAlert
              installmentNumber={currentInstallment.installmentNumber}
              amount={currentInstallment.amount}
              projectId={orderId}
              progress={Math.round(order.projectProgress)}
              paymentStatus={currentInstallment.paymentStatus || 'none'}
              onClick={handleMakePayment}
            />
          )}

          {/* Exactly ONE payment banner renders, chosen by what is actually true — never two.
              Order matters: "money submitted, awaiting approval" is the more specific state and
              wins over "payment still due".

              The gate here is hasPendingPayment (a real pending transaction), NOT
              isOrderPendingApproval. That distinction is the bug this replaced: a "pay later"
              (decide_later) order is created 'pending-approval' with ZERO payment, so gating on
              orderVisibility showed "Payment Submitted — Awaiting Approval" to a customer who had
              not paid anything yet, and — because the invoice legitimately stays unpaid until an
              admin approves — kept showing "Payment Pending" even right after they DID submit a
              UPI payment. The two states were swapped in exactly the case that matters. */}
          {/* A cancelled project outranks every payment banner below: the money is already
              settled, so "payment pending" / "awaiting approval" no longer mean anything. */}
          {isOrderCancelled && (
            <div className={g(
              'mb-6 rounded-2xl border border-[var(--glass-border)] bg-slate-100 p-4', 'mb-6 rounded-2xl border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] p-4 backdrop-blur-md')}>
              <p className={g('text-base font-semibold text-[var(--text-primary)]', 'text-base font-semibold text-[var(--text-primary)]')}>
                Project Cancelled
              </p>
              {order.cancellationReason ? (
                <p className={g('mt-1 text-sm text-[var(--text-secondary)]', 'mt-1 text-sm text-[var(--text-secondary)]')}>
                  {order.cancellationReason}
                </p>
              ) : null}
              {Number(order.refundTotal || 0) > 0 ? (
                <div className="mt-3">
                  <p className={g('text-sm font-semibold text-[var(--text-secondary)]', 'text-sm font-semibold text-[var(--text-secondary)]')}>
                    Refunded ₹{Number(order.refundTotal).toLocaleString('en-IN')}
                  </p>
                  <div className="mt-2 space-y-1">
                    {(order.refunds || []).map((refund, index) => (
                      <p
                        key={`${refund.method}-${index}`}
                        className={g('text-sm text-[var(--text-secondary)]', 'text-sm text-[var(--text-secondary)]')}
                      >
                        <span className="capitalize">{String(refund.method).replace('_', ' ')}</span>
                        {' — ₹'}
                        {Number(refund.amount || 0).toLocaleString('en-IN')}
                        {refund.method === 'wallet'
                          ? ' (added to your wallet)'
                          : ''}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {!isAdminView && !isOrderCancelled && hasPendingPayment && (
            <div className={g(
              'mb-6 rounded-2xl border border-emerald-300 bg-emerald-50 p-4', 'mb-6 rounded-2xl border border-[var(--badge-success-border)] bg-[var(--badge-success-bg)] p-4 backdrop-blur-md')}>
              <p className={g('text-base font-semibold text-emerald-800', 'text-base font-semibold text-[var(--badge-success-fg)]')}>
                Payment received
              </p>
              <p className={g('mt-1 text-sm text-emerald-700', 'mt-1 text-sm text-[var(--badge-success-fg)]')}>
                {order.pendingPayment?.amount
                  ? `We have received your payment of ₹${Number(order.pendingPayment.amount).toLocaleString('en-IN')}. We’ll let you know when it is confirmed.`
                  : 'We have received your payment. We’ll let you know when it is confirmed.'}
              </p>
            </div>
          )}

          {!isAdminView && !isOrderCancelled && !hasPendingPayment && order.hasUnpaidInvoice && (
            <div className={g(
              'mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4', 'mb-6 rounded-2xl border border-[var(--badge-pending-border)] bg-[var(--badge-pending-bg)] p-4 backdrop-blur-md')}>
              <p className={g('text-base font-semibold text-amber-800', 'text-base font-semibold text-[var(--badge-pending-fg)]')}>
                Payment due
              </p>
              <p className={g('mt-1 text-sm text-amber-700', 'mt-1 text-sm text-[var(--badge-pending-fg)]')}>
                ₹{Number(order.unpaidInvoice?.amount || 0).toLocaleString('en-IN')} is due for this project. Pay now to continue.
              </p>
              {order.unpaidInvoice?._id && (
                <button
                  type="button"
                  onClick={() => navigate(`/invoice-detail/${order.unpaidInvoice._id}`, {
                    state: customerChildState(location),
                  })}
                  className={g(
                    'mt-2 text-sm font-semibold text-amber-800 underline underline-offset-2 transition hover:text-amber-900', 'mt-2 text-sm font-semibold text-[var(--badge-pending-fg)] underline underline-offset-2 transition hover:text-[var(--text-primary)]')}
                >
                  Pay now
                </button>
              )}
            </div>
          )}

          {/* Add-on services. Available both while the project is running and
              after it is finished — only the wording changes, since the two
              cases mean different things to the customer (extending a live
              project vs. ongoing servicing of a delivered one).

              A service is a SEPARATE purchase with its own full payment and its
              own invoice — it is deliberately NOT gated on the project's own
              payment state. A project on an installment plan is a customer in
              good standing (installment #2 isn't even due until its progress
              threshold unlocks), so blocking them from buying a service would
              block the customer most likely to want one. Only a project that
              isn't a confirmed sale yet is excluded. */}
          {/* One card for the whole page — the service offer, the summary band and the
              timeline are separated by dividers rather than by cards of their own. The
              card is the wrapper; the two-column band is a grid nested inside it. */}
          <div className={g('hidden rounded-[1.75rem] border border-[var(--glass-border)] bg-white shadow-sm lg:block', 'relative hidden overflow-hidden rounded-[1.75rem] border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] shadow-[var(--card-shadow)] backdrop-blur-2xl backdrop-saturate-150 lg:block')}>
                {!isAdminView && <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-[var(--glass-sheen)] to-transparent" />}

                {!isAdminView && canAddService && (
                  <div className={g(
                    'relative flex flex-col gap-3 border-b border-[var(--glass-border)] p-4 sm:flex-row sm:items-center sm:justify-between', 'relative flex flex-col gap-3 border-b border-[var(--glass-border)] p-4 sm:flex-row sm:items-center sm:justify-between')}>
                    <div>
                      <p className={g('text-base font-semibold text-[var(--text-primary)]', 'text-base font-semibold text-[var(--text-primary)]')}>
                        {isProjectFinished ? 'Ongoing servicing for this project' : 'Add a service to this project'}
                      </p>
                      <p className={g('mt-1 text-sm text-[var(--text-secondary)]', 'mt-1 text-sm text-[var(--text-secondary)]')}>
                        {isProjectFinished
                          ? 'Keep this project maintained with a recurring service — maintenance, marketing, renewals and more.'
                          : 'Add extra services alongside your running project, such as marketing, content or maintenance.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddService}
                      className={g(
                        'inline-flex shrink-0 items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-base font-semibold text-[var(--text-primary)] transition hover:bg-emerald-700', 'inline-flex shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--ink-rgb))] px-4 py-2.5 text-base font-semibold text-[var(--page-bg)] transition hover:bg-[rgb(var(--ink-rgb)/0.85)]')}
                    >
                      Add a Service
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-2 items-stretch">
                <aside className={g('h-[620px] border-r border-[var(--glass-border)]', 'relative h-[620px] border-r border-[var(--glass-border)]')}>
                  <div className="flex h-full min-h-0 flex-col p-4">
                      {/* Donut on the left, the snapshot facts it summarises on the right,
                          with the actions sitting under those facts. */}
                      <div className="grid grid-cols-2 items-start gap-5">
                        <div className="relative mx-auto flex h-40 w-40 shrink-0 items-center justify-center">
                          <div className={g('absolute inset-0 rounded-full border-[12px] border-[var(--glass-border)]', 'absolute inset-0 rounded-full border-[12px] border-[var(--glass-border)]')}></div>
                          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100">
                            <circle
                              cx="50"
                              cy="50"
                              r="46"
                              fill="none"
                              stroke={isProjectPaused ? "#EF4444" : "#10B981"}
                              strokeWidth="8"
                              strokeDasharray={`${progressPercentage * 2.89} 1000`}
                              strokeLinecap="round"
                              transform="rotate(-90 50 50)"
                            />
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                            <span className={g('text-2xl font-bold text-[var(--text-primary)]', 'text-2xl font-bold text-[var(--text-primary)]')}>{progressPercentage}%</span>
                            <span className={g('mt-1 text-sm font-medium text-[var(--text-primary)]', 'mt-1 text-sm font-medium text-[var(--text-secondary)]')}>Complete</span>
                          </div>
                        </div>

                        <div className="min-w-0">
                          {/* Document style: divider-separated key/value rows, no boxes */}
                          <div className={g('divide-y divide-slate-200', 'divide-y divide-[var(--divider)]')}>
                            <div className="flex items-center justify-between gap-3 py-2">
                              <span className={g('text-sm text-[var(--text-secondary)]', 'text-sm text-[var(--text-secondary)]')}>Last update</span>
                              <span className={g('text-right text-base font-semibold text-[var(--text-primary)]', 'text-right text-base font-semibold text-[var(--text-primary)]')}>{formatDateTime(order.updatedAt || order.createdAt)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3 py-2">
                              <span className={g('text-sm text-[var(--text-secondary)]', 'text-sm text-[var(--text-secondary)]')}>Updates linked</span>
                              <span className={g('text-base font-semibold tabular-nums text-[var(--text-primary)]', 'text-base font-semibold tabular-nums text-[var(--text-primary)]')}>{totalUpdates}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3 py-2">
                              <span className={g('text-sm text-[var(--text-secondary)]', 'text-sm text-[var(--text-secondary)]')}>Current phase</span>
                              {/* Derived by backend/helpers/orderStatusEngine.js, not the stored
                                  currentPhase column: that column only ever moves to 'completed'
                                  at 100%, so a project at 1% displayed "planning" indefinitely. */}
                              <span className={g('text-base font-semibold text-[var(--text-primary)]', 'text-base font-semibold text-[var(--text-primary)]')}>{order.orderState?.phaseLabel || order.currentPhase || 'N/A'}</span>
                            </div>
                          </div>

                          {/* Lifecycle history — when this order was approved, when work began,
                              when it finished. Comes from backend/helpers/orderLifecycleLog.js;
                              before that log existed none of these dates were recorded at all. */}
                          {order.lifecycleTimeline?.length ? (
                            <div className={g('mt-5 border-t border-[var(--glass-border)] pt-4', 'mt-5 border-t border-[var(--glass-border)] pt-4')}>
                              <p className={g('mb-3 text-sm font-semibold text-[var(--text-primary)]', 'mb-3 text-sm font-semibold text-[var(--text-primary)]')}>Project history</p>
                              {/* g() takes (adminClass, customerClass) and the admin classes here
                                  are the light ones — this page renders light for admin and dark
                                  for the customer, so the timeline's palette follows the same way. */}
                              <OrderLifecycleTimeline timeline={order.lifecycleTimeline} dark={!isAdminView} />
                            </div>
                          ) : null}

                          {!isAdminView ? (
                            <button
                              type="button"
                              onClick={() => setUpdateModalOpen(true)}
                              disabled={isUploadLocked}
                              title={uploadLockMeta.title}
                              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-base font-semibold text-[var(--text-primary)] transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:hover:bg-slate-400"
                            >
                              {/* A completed project says so instead of offering an upload it
                                  will not accept. Payment locks keep their own wording. */}
                              {isOrderCancelled ? (
                                <>
                                  <X className="h-4 w-4" />
                                  Project Cancelled
                                </>
                              ) : isProjectComplete ? (
                                <>
                                  <Check className="h-4 w-4" />
                                  Project Completed
                                </>
                              ) : (
                                <>
                                  <Upload className="h-4 w-4" />
                                  Upload Data
                                  {uploadLockMeta.badge && (
                                    <span className="ml-1 rounded-full bg-[var(--glass-bg-strong)] px-2 py-0.5 text-xs font-semibold">{uploadLockMeta.badge}</span>
                                  )}
                                </>
                              )}
                            </button>
                          ) : null}

                          {order.projectLink && order.projectLink.trim() !== '' ? (
                            <a
                              href={order.projectLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={g(
                                'mt-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-base font-semibold text-emerald-700 transition hover:bg-emerald-100', 'mt-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-2.5 text-base font-semibold text-[var(--text-primary)] backdrop-blur-md transition hover:bg-[var(--glass-bg-strong)]')}
                            >
                              <ExternalLink className="h-4 w-4" />
                              View Project
                            </a>
                          ) : null}
                        </div>
                      </div>

                      {/* Uploaded data history fills whatever space the summary band leaves,
                          separated from it by a divider rather than by a card of its own.
                          Scrolls internally so the column keeps its fixed height. */}
                      <div className={g('mt-4 flex min-h-0 flex-1 flex-col border-t border-[var(--glass-border)] pt-4', 'mt-4 flex min-h-0 flex-1 flex-col border-t border-[var(--glass-border)] pt-4')}>
                        <div className="flex items-center justify-between gap-3">
                          <p className={g('text-sm font-medium text-[var(--text-primary)]', 'text-sm font-medium text-[var(--text-secondary)]')}>Uploaded Data</p>
                          <span className={g('rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-[var(--text-secondary)]', 'rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] px-2.5 py-0.5 text-xs font-semibold text-[var(--text-primary)]')}>
                            {uploadHistory.length}
                          </span>
                        </div>

                        <div className="mt-2 min-h-0 flex-1 overflow-auto pr-1">
                          <UploadedDataList
                            uploads={uploadHistory}
                            loading={uploadHistoryLoading}
                            theme={isAdminView ? 'light' : 'glass'}
                            emptyText="Nothing uploaded yet. Anything you send appears here."
                            onDownload={handleUploadDownload}
                            downloadingId={downloadingUploadId}
                          />
                        </div>
                      </div>
                  </div>
                </aside>

                <section className={g('min-w-0 h-[620px]', 'relative min-w-0 h-[620px]')}>
                  <div className="flex h-full min-h-0 flex-col p-4">
                    <div className={g('flex flex-col gap-2 border-b border-[var(--glass-border)] pb-4 sm:flex-row sm:items-center sm:justify-between', 'flex flex-col gap-2 border-b border-[var(--glass-border)] pb-4 sm:flex-row sm:items-center sm:justify-between')}>
                      <div>
                        <p className={g('text-sm font-medium text-[var(--text-primary)]', 'text-sm font-medium text-[var(--text-secondary)]')}>Progress Timeline</p>
                        <h2 className={g('mt-1 text-xl font-bold text-[var(--text-primary)]', 'mt-1 text-xl font-bold text-[var(--text-primary)]')}>Select a checkpoint to see its updates</h2>
                      </div>
                      <span className={g('rounded-full bg-white px-3 py-1 text-sm font-semibold text-[var(--text-primary)]', 'rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-1 text-sm font-semibold text-[var(--text-primary)] backdrop-blur-md')}>
                        {timelineNodes.length} stages
                      </span>
                    </div>

                    <div ref={timelineRef} className="mt-3 flex-1 min-h-0 overflow-auto pr-1">
                      <div className="relative pl-2">
                        <div className="space-y-2">
                          {timelineNodes.map((node) => {
                            const isDeleted = node.status === 'deleted';
                            const isInProgress = node === inProgressNode;
                            const isCompleted = node.status === 'active' && !isInProgress;
                            // Guarded against the empty key: with nothing expanded,
                            // normalizeNodeKey('') would otherwise match a node whose
                            // own id is missing and open it.
                            const isExpanded =
                              Boolean(expandedNodeId) &&
                              normalizeNodeKey(expandedNodeId) === normalizeNodeKey(node.nodeId);

                            return (
                              <TimelineCheckpointItem
                                key={node.nodeId}
                                checkpoint={node}
                              isCompleted={isCompleted}
                              isInProgress={isInProgress}
                              isDeleted={isDeleted}
                              isSelected={isExpanded}
                              isExpanded={isExpanded}
                              messages={nodeMessages[node.nodeId] || []}
                              messageCount={nodeMessageCounts[node.nodeId] || 0}
                              formatDate={formatDate}
                              formatDateTimeValue={formatDateTime}
                              // Clicking the open node closes it; clicking another opens that one.
                              // selectedNodeId itself is left pointing at a real node — the mobile
                              // layout below still reads it — so "closed" is tracked separately.
                              onSelect={() => {
                                if (isExpanded) {
                                  setCollapsedOnDesktop(true);
                                  return;
                                }
                                setCollapsedOnDesktop(false);
                                setSelectedNodeId(node.nodeId);
                              }}
                              isGlass={!isAdminView}
                            />
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
                </div>
              </div>

              <div className="space-y-4 lg:hidden">
                <section className={g('rounded-[1.75rem] border border-[var(--glass-border)] bg-slate-50 p-5 shadow-sm', 'relative overflow-hidden rounded-[1.75rem] border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] p-5 shadow-[var(--card-shadow)] backdrop-blur-2xl backdrop-saturate-150')}>
                  {!isAdminView && <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-[var(--glass-sheen)] to-transparent" />}
                  <div className="relative flex items-center justify-between gap-4">
                    <div>
                      <p className={g('text-sm font-medium text-[var(--text-primary)]', 'text-sm font-medium text-[var(--text-secondary)]')}>Current Stage</p>
                      <h2 className={g('mt-1 text-xl font-bold text-[var(--text-primary)]', 'mt-1 text-xl font-bold text-[var(--text-primary)]')}>{currentStageLabel}</h2>
                    </div>
                    <div className="relative flex h-24 w-24 items-center justify-center">
                      <div className={g('absolute inset-0 rounded-full border-8 border-[var(--glass-border)]', 'absolute inset-0 rounded-full border-8 border-[var(--glass-border)]')}></div>
                      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100">
                        <circle
                          cx="50"
                          cy="50"
                          r="46"
                          fill="none"
                          stroke={isProjectPaused ? "#EF4444" : "#10B981"}
                          strokeWidth="8"
                          strokeDasharray={`${progressPercentage * 2.89} 1000`}
                          strokeLinecap="round"
                          transform="rotate(-90 50 50)"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                        <span className={g('text-lg font-bold text-[var(--text-primary)]', 'text-lg font-bold text-[var(--text-primary)]')}>{progressPercentage}%</span>
                        <span className={g('text-sm font-medium text-[var(--text-primary)]', 'text-sm font-medium text-[var(--text-secondary)]')}>Complete</span>
                      </div>
                    </div>
                  </div>

                  <div className="relative mt-4 grid grid-cols-2 gap-3">
                    <div className={g('rounded-2xl border border-[var(--glass-border)] bg-white p-3', 'rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3')}>
                      <p className={g('text-sm uppercase text-[var(--text-primary)]', 'text-sm uppercase text-[var(--text-secondary)]')}>Updates</p>
                      <p className={g('mt-1 text-base font-semibold text-[var(--text-primary)]', 'mt-1 text-base font-semibold text-[var(--text-primary)]')}>{totalUpdates}</p>
                    </div>
                    <div className={g('rounded-2xl border border-[var(--glass-border)] bg-white p-3', 'rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3')}>
                      <p className={g('text-sm uppercase text-[var(--text-primary)]', 'text-sm uppercase text-[var(--text-secondary)]')}>Checkpoints</p>
                      <p className={g('mt-1 text-base font-semibold text-[var(--text-primary)]', 'mt-1 text-base font-semibold text-[var(--text-primary)]')}>{timelineNodes.length}</p>
                    </div>
                  </div>

                  {!isAdminView ? (
                    <div className="relative mt-4 space-y-3">
                      <button
                        type="button"
                        onClick={() => setUpdateModalOpen(true)}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-base font-semibold text-[var(--text-primary)] transition hover:bg-emerald-700"
                      >
                        <Upload className="h-4 w-4" />
                        Upload Data
                      </button>
                      {order.projectLink && order.projectLink.trim() !== '' ? (
                        <a
                          href={order.projectLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-3 text-base font-semibold text-[var(--text-primary)] backdrop-blur-md transition hover:bg-[var(--glass-bg-strong)]"
                        >
                          <ExternalLink className="h-4 w-4" />
                          View Project
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </section>

                <section className={g('rounded-[1.75rem] border border-[var(--glass-border)] bg-white p-5 shadow-sm', 'relative overflow-hidden rounded-[1.75rem] border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] p-5 shadow-[var(--card-shadow)] backdrop-blur-2xl backdrop-saturate-150')}>
                  {!isAdminView && <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-[var(--glass-sheen)] to-transparent" />}
                  <div className="relative flex items-center justify-between gap-3">
                    <div>
                      <p className={g('text-sm font-medium text-[var(--text-primary)]', 'text-sm font-medium text-[var(--text-secondary)]')}>Progress Timeline</p>
                      <h2 className={g('mt-1 text-lg font-semibold text-[var(--text-primary)]', 'mt-1 text-lg font-semibold text-[var(--text-primary)]')}>Timeline</h2>
                    </div>
                    <button
                      onClick={() => setTimelineExpanded(!timelineExpanded)}
                      className={g('inline-flex items-center justify-center rounded-2xl border border-[var(--glass-border)] bg-slate-50 px-3 py-2 text-base font-semibold text-[var(--text-primary)] transition hover:bg-slate-100', 'inline-flex items-center justify-center rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2 text-base font-semibold text-[var(--text-primary)] backdrop-blur-md transition hover:bg-[var(--glass-bg-strong)]')}
                    >
                      {timelineExpanded ? (
                        <>
                          <X className="mr-1 h-4 w-4" />
                          Close
                        </>
                      ) : (
                        <>
                          <List className="mr-1 h-4 w-4" />
                          View
                        </>
                      )}
                    </button>
                  </div>

                  {timelineExpanded ? (
                    <div
                      ref={timelineRef}
                      className="relative mt-4 max-h-[318px] overflow-auto pr-1"
                    >
                      <div className="space-y-2.5">
                        {timelineNodes.map((node) => {
                          const isDeleted = node.status === 'deleted';
                          const isInProgress = node === inProgressNode;
                          const isCompleted = node.status === 'active' && !isInProgress;
                          const isSelected = normalizeNodeKey(selectedNodeId) === normalizeNodeKey(node.nodeId);

                          return (
                            <TimelineCheckpointItem
                              key={node.nodeId}
                              checkpoint={node}
                              isCompleted={isCompleted}
                              isInProgress={isInProgress}
                              isDeleted={isDeleted}
                              isSelected={isSelected}
                              messageCount={nodeMessageCounts[node.nodeId] || 0}
                              formatDate={formatDate}
                              onSelect={() => setSelectedNodeId(node.nodeId)}
                              compact
                              isGlass={!isAdminView}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className={g('mt-4 rounded-2xl border border-dashed border-[var(--glass-border)] bg-slate-50 p-4 text-base text-[var(--text-primary)]', 'relative mt-4 rounded-2xl border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg)] p-4 text-base text-[var(--text-secondary)]')}>
                      Open the timeline to select a checkpoint.
                    </div>
                  )}
                </section>

                <section className={g('rounded-[1.75rem] border border-[var(--glass-border)] bg-white p-5 shadow-sm', 'relative overflow-hidden rounded-[1.75rem] border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] p-5 shadow-[var(--card-shadow)] backdrop-blur-2xl backdrop-saturate-150')}>
                  {!isAdminView && <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-[var(--glass-sheen)] to-transparent" />}
                  <div className={g('flex items-start justify-between gap-4 border-b border-[var(--glass-border)] pb-4', 'relative flex items-start justify-between gap-4 border-b border-[var(--glass-border)] pb-4')}>
                    <div>
                      <p className={g('text-sm font-medium text-[var(--text-primary)]', 'text-sm font-medium text-[var(--text-secondary)]')}>Checkpoint Details</p>
                      <h2 className={g('mt-1 text-lg font-semibold text-[var(--text-primary)]', 'mt-1 text-lg font-semibold text-[var(--text-primary)]')}>
                        {selectedNode ? selectedNode.title : 'Select a checkpoint'}
                      </h2>
                    </div>
                    {selectedNode ? (
                      <span className={[
                        "rounded-full px-3 py-1 text-sm font-semibold",
                        selectedNode.status === 'deleted'
                          ? g('bg-slate-100 text-[var(--text-muted)]', 'border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] text-[var(--text-muted)]')
                          : selectedNode === inProgressNode
                            ? g('bg-slate-100 text-[var(--text-secondary)]', 'border border-[var(--glass-border-strong)] bg-[var(--glass-bg-strong)] text-[var(--text-primary)]')
                            : g('bg-emerald-100 text-emerald-700', 'border border-[var(--badge-success-border)] bg-[var(--badge-success-bg)] text-[var(--badge-success-fg)]'),
                      ].join(" ")}>
                        {selectedNode.status === 'deleted' ? 'Deleted' : selectedNode === inProgressNode ? 'Active' : 'Completed'}
                      </span>
                    ) : null}
                  </div>

                  {selectedNode ? (
                    <div className="relative mt-4 space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className={g('rounded-2xl border border-[var(--glass-border)] bg-slate-50 p-3', 'rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3')}>
                          <p className={g('text-sm uppercase text-[var(--text-primary)]', 'text-sm uppercase text-[var(--text-secondary)]')}>Date</p>
                          <p className={g('mt-1 text-base font-semibold text-[var(--text-primary)]', 'mt-1 text-base font-semibold text-[var(--text-primary)]')}>
                            {formatDate(selectedNode.createdAt)}
                          </p>
                        </div>
                        <div className={g('rounded-2xl border border-[var(--glass-border)] bg-slate-50 p-3', 'rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3')}>
                          <p className={g('text-sm uppercase text-[var(--text-primary)]', 'text-sm uppercase text-[var(--text-secondary)]')}>Updates</p>
                          <p className={g('mt-1 text-base font-semibold text-[var(--text-primary)]', 'mt-1 text-base font-semibold text-[var(--text-primary)]')}>{selectedNodeMessages.length}</p>
                        </div>
                      </div>

                      <div className={g('rounded-[1.25rem] border border-[var(--glass-border)] bg-slate-50 p-4', 'rounded-[1.25rem] border border-[var(--glass-border)] bg-[var(--glass-bg)] p-4')}>
                        <p className={g('text-base font-semibold text-[var(--text-primary)]', 'text-base font-semibold text-[var(--text-primary)]')}>Updates</p>
                        <div className="mt-3 space-y-3">
                          {selectedNodeMessages.length > 0 ? (
                            selectedNodeMessages.map((message, index) => (
                              <div key={message._id || message.id || `${selectedNode.nodeId}-message-${index}`} className={g('rounded-2xl border border-[var(--glass-border)] bg-white p-3', 'rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3')}>
                                <div className="flex items-center justify-between gap-3">
                                  <p className={g('text-base font-semibold text-[var(--text-primary)]', 'text-base font-semibold text-[var(--text-primary)]')}>
                                    {message.checkpointName || selectedNode.title}
                                  </p>
                                  <p className={g('text-sm text-[var(--text-primary)]', 'text-sm text-[var(--text-secondary)]')}>
                                    {message.timestamp ? formatDateTime(message.timestamp) : 'No date'}
                                  </p>
                                </div>
                                <p className={g('mt-2 whitespace-pre-line text-base text-[var(--text-primary)]', 'mt-2 whitespace-pre-line text-base text-[var(--text-secondary)]')}>
                                  {message.message || message.remark || message.notes || 'No update details have been added.'}
                                </p>
                              </div>
                            ))
                          ) : (
                            <p className={g('text-base text-[var(--text-primary)]', 'text-base text-[var(--text-secondary)]')}>No updates have been added for this checkpoint yet.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className={g('mt-4 rounded-2xl border border-[var(--glass-border)] bg-slate-50 p-4 text-base text-[var(--text-primary)]', 'relative mt-4 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-4 text-base text-[var(--text-secondary)]')}>
                      Project updates will appear here when they are added.
                    </div>
                  )}
                </section>
              </div>
          </div>
        </div>

        {/* Update Request Modal */}
        {updateModalOpen && !isAdminView && (
          <UpdateRequestModal
            plan={order}
            onClose={() => setUpdateModalOpen(false)}
            onSubmitSuccess={() => {
              setUpdateModalOpen(false);
              fetchOrderDetails();
              fetchUploadHistory();
            }}
          />
        )}

      {!isAdminView && (
        <AddServiceModal
          isOpen={showAddServiceModal}
          onClose={() => setShowAddServiceModal(false)}
          projectOrderId={orderId}
          projectName={getOrderDisplayName(order, 'your project')}
          isProjectFinished={isProjectFinished}
          walletBalance={appContext?.walletBalance || 0}
          onPurchased={() => {
            appContext?.fetchWalletBalance?.();
            fetchOrderDetails();
          }}
        />
      )}
    </Shell>
  );
};


export default ProjectDetails;
