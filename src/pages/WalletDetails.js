import React, { useContext, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  AlertCircle,
  ArrowDownLeft,
  CheckCircle2,
  Clock3,
  CreditCard,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingCart,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import Context from '../context';
import SummaryApi from '../common';
import displayINRCurrency from '../helpers/displayCurrency';
import TriangleMazeLoader from '../components/TriangleMazeLoader';
import DashboardLayout from '../components/DashboardLayout';
import Surface from '../components/Surface';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import { getOrderCategory, getOrderDisplayName, isActiveWorkItem } from '../helpers/orderPresentation';
import { getPaymentMethodText, getInstallmentPartText } from '../helpers/invoicePresentation';

const WalletDetails = () => {
  const [walletHistory, setWalletHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState('');
  const [showQR, setShowQR] = useState(false);
  const [transactionId, setTransactionId] = useState('');
  const [upiLink, setUpiLink] = useState('');
  const [verificationStatus, setVerificationStatus] = useState('');
  const [verificationSubmitted, setVerificationSubmitted] = useState(false);
  const [upiTransactionId, setUpiTransactionId] = useState('');
  const [activeProject, setActiveProject] = useState(null);
  const [showRechargePanel, setShowRechargePanel] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [historySearch, setHistorySearch] = useState('');
  const [showAllHistory, setShowAllHistory] = useState(false);
  const user = useSelector(state => state?.user?.user);
  const context = useContext(Context);

  const getTotalSpending = () => walletHistory
    .filter(transaction => transaction.type === 'payment' || transaction.type === 'service' || (transaction.amount < 0 && transaction.type !== 'deposit'))
    .reduce((total, transaction) => total + Math.abs(Number(transaction.amount) || 0), 0);

  const getTotalAdded = () => walletHistory
    .filter(transaction => transaction.type === 'deposit' || transaction.type === 'refund')
    .reduce((total, transaction) => total + Math.abs(Number(transaction.amount) || 0), 0);

  const getPendingAmount = () => walletHistory
    .filter(transaction => transaction.status === 'pending')
    .reduce((total, transaction) => total + Math.abs(Number(transaction.amount) || 0), 0);

  const fetchWalletHistory = async () => {
    try {
      setLoading(true);
      const response = await fetch(SummaryApi.wallet.history.url, {
        method: SummaryApi.wallet.history.method,
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
      });
      const responseText = await response.text();
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        throw new Error(`Wallet history returned an invalid response (${response.status})`);
      }
      if (!response.ok) throw new Error(responseData?.message || `Wallet history request failed (${response.status})`);
      if (responseData.success) setWalletHistory(Array.isArray(responseData.data) ? responseData.data : []);
      else throw new Error(responseData.message || 'Wallet history request failed');
    } catch (error) {
      console.error('Error fetching wallet history:', error);
      toast.error('Failed to fetch transaction history');
    } finally {
      setLoading(false);
    }
  };

  const fetchActiveProject = async () => {
    try {
      const response = await fetch(SummaryApi.ordersList.url, {
        method: SummaryApi.ordersList.method,
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        const activeProj = (data.data || []).find(order => {
          const category = getOrderCategory(order).toLowerCase();
          const supportedCategory = ['standard_websites', 'dynamic_websites', 'cloud_software_development', 'app_development'].includes(category);
          // Same "is this live work" rule every other list uses
          // (helpers/orderPresentation.js) — written inline here before, and so it excluded only
          // rejected: a cancelled project still surfaced as the customer's active project.
          return supportedCategory && isActiveWorkItem(order);
        });
        setActiveProject(activeProj || null);
      }
    } catch (error) {
      console.error('Error fetching active project:', error);
    }
  };

  useEffect(() => {
    fetchWalletHistory();
    fetchActiveProject();
    if (context?.fetchWalletBalance) context.fetchWalletBalance();
  }, [context]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  // A row has to answer one question: what did this money go to?
  //
  // It used to answer it from `transaction.description` whenever the name was missing —
  // and that string is written at payment time for the log, not for the customer. Seven
  // different payment paths each write their own, so the screen showed things like
  // "Payment (wallet) for invoice INV-202609-0002" and, worse,
  // "Installment 1 (wallet) for order 6a952b7464002ecd93fc6743" — a raw database id.
  //
  // The name was never missing. It sits on the order, in whichever of its four places
  // matches how that order was made, and getOrderDisplayName already knows the order to
  // look in. The wallet feed simply was not sending those fields (getWalletHistory.js).
  // With them sent, all 10 spending rows in live data name themselves.
  //
  // `description` is no longer printed anywhere. If a name genuinely cannot be found the
  // row says plainly that it was a payment, rather than exposing an internal line.
  const getTransactionDisplay = transaction => {
    const paidFor = transaction.productId?.serviceName || getOrderDisplayName(transaction.orderId, '');

    if (transaction.type === 'refund') {
      return { sign: '+', color: 'text-[var(--badge-success-fg)]', title: paidFor ? `Refund for ${paidFor}` : 'Refund received', icon: <ArrowDownLeft size={17} />, iconBg: 'badge badge-success' };
    }
    if (transaction.type === 'deposit') {
      return { sign: '+', color: 'text-[var(--badge-success-fg)]', title: 'Money added to wallet', icon: <CreditCard size={17} />, iconBg: 'badge badge-success' };
    }

    // A numbered installment is worth saying — the customer is paying one project in
    // parts and this tells them which part this was. Everything else is just the name.
    const part = transaction.installmentNumber
      ? ` · ${getInstallmentPartText(transaction.installmentNumber)} payment`
      : '';

    if (transaction.type === 'renewal') {
      return { sign: '-', color: 'text-[var(--badge-error-fg)]', title: paidFor ? `${paidFor} · renewal` : 'Plan renewal', icon: <ShoppingCart size={17} />, iconBg: 'bg-[var(--glass-bg-strong)] text-[var(--text-secondary)]' };
    }
    return { sign: '-', color: 'text-[var(--badge-error-fg)]', title: paidFor ? `${paidFor}${part}` : 'Payment', icon: <ShoppingCart size={17} />, iconBg: 'bg-[var(--glass-bg-strong)] text-[var(--text-secondary)]' };
  };

  // Tones, not classes. These were `bg-emerald-50 text-emerald-700` and
  // friends: a light tint with same-hue text, which is thin on the light page
  // and a lit slab on the dark one, because -50 shades ignore the theme.
  // Refunded was sky — the portal's palette has no blue, and a refund is not a
  // fourth status, it is money arriving, so it reads as success.
//
// "Approved" and "Pending" named the admin's queue rather than the money. From the
// customer's side a payment has either gone through or is still being looked at.
  const getStatus = status => {
    if (status === 'completed') return { label: 'Done', tone: 'success', icon: CheckCircle2 };
    if (status === 'pending') return { label: 'Being checked', tone: 'pending', icon: Clock3 };
    if (status === 'failed' || status === 'rejected') return { label: 'Rejected', tone: 'error', icon: AlertCircle };
    if (status === 'refunded') return { label: 'Refunded', tone: 'success', icon: ArrowDownLeft };
    return null;
  };

  // This page kept its own three-entry map, which had no answer for cash or bank_transfer —
  // both of which exist in live data. The complete map lives in helpers/invoicePresentation.js
  // now, shared with the invoice page, so one payment method cannot read two ways.

  // The filters were labelled with the ledger's own words — "credit" and "debit" — which
  // name the accounting direction rather than what happened to the customer's money. The
  // filter values themselves are unchanged; only what the buttons are called.
  const HISTORY_FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'credit', label: 'Money in' },
    { id: 'debit', label: 'Money out' },
    { id: 'pending', label: 'Pending' },
  ];

  const filteredHistory = walletHistory.filter(transaction => {
    const isCredit = transaction.type === 'deposit' || transaction.type === 'refund';
    const matchesFilter = historyFilter === 'all' || (historyFilter === 'credit' && isCredit) || (historyFilter === 'debit' && !isCredit) || (historyFilter === 'pending' && transaction.status === 'pending');
    const searchText = historySearch.trim().toLowerCase();
    // Search matches what the customer can see. `description` was in here too, so typing
    // an invoice number or an order id returned rows whose visible text contains neither —
    // a result the reader cannot account for.
    const searchableText = [getTransactionDisplay(transaction).title, transaction.status, transaction.productId?.serviceName].filter(Boolean).join(' ').toLowerCase();
    return matchesFilter && (!searchText || searchableText.includes(searchText));
  });
  const visibleHistory = showAllHistory ? filteredHistory : filteredHistory.slice(0, 5);

  const resetRecharge = () => {
    setShowQR(false);
    setVerificationSubmitted(false);
    setAmount('');
    setTransactionId('');
    setUpiLink('');
    setVerificationStatus('');
    setUpiTransactionId('');
    setShowRechargePanel(false);
  };

  const handleProceedToPayment = event => {
    event.preventDefault();
    if (!amount || Number.isNaN(Number(amount)) || Number(amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    const txnId = `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;
    setTransactionId(txnId);
    const upi = `upi://pay?pa=vacomputers.com@okhdfcbank&pn=VA%20Computer&am=${amount}&cu=INR&tn=${encodeURIComponent(`Wallet Recharge - ${txnId}`)}&tr=${txnId}`;
    setUpiLink(upi);
    setShowQR(true);
  };

  const verifyTransaction = async event => {
    event.preventDefault();
    if (!upiTransactionId || upiTransactionId.length < 10 || upiTransactionId.length > 12) {
      setVerificationStatus('That does not look like a valid payment reference');
      return;
    }
    setLoading(true);
    setVerificationStatus('Checking your payment...');
    try {
      const response = await fetch(SummaryApi.wallet.verifyPayment.url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId, amount: Number(amount), upiTransactionId }),
      });
      const data = await response.json();
      if (data.success) {
        setVerificationStatus('We have your payment.');
        setVerificationSubmitted(true);
      } else setVerificationStatus(data.message || 'We could not check this payment. Please contact support.');
    } catch (error) {
      console.error('Error verifying payment:', error);
      setVerificationStatus('Something went wrong. Please try again in a moment.');
    } finally {
      setLoading(false);
    }
  };

  const refreshWallet = () => {
    fetchWalletHistory();
    if (context?.fetchWalletBalance) context.fetchWalletBalance();
  };

  const renderRechargePanel = () => {
    if (!showRechargePanel) return null;
    return (
      <Modal onClose={resetRecharge} title="Add money to your wallet">
          {!showQR ? (
            <form onSubmit={handleProceedToPayment}>
              <label htmlFor="amount" className="text-base font-bold uppercase text-[var(--text-primary)]">Amount</label>
              <div className="mt-2 flex items-center rounded-2xl border border-[var(--field-border)] bg-[var(--field-bg)] px-4 transition focus-within:border-accent-text focus-within:ring-4 focus-within:ring-[var(--accent-soft-bg)]">
                <span className="text-lg font-bold text-[var(--text-primary)]">₹</span>
                <input id="amount" type="number" value={amount} onChange={event => setAmount(event.target.value)} className="w-full bg-transparent px-3 py-4 text-lg font-bold text-[var(--text-primary)] outline-none" placeholder="0" min="1" />
              </div>
              {/* Was a three-line bill — "Recharge amount", "Processing fee ₹0", "Total" —
                  printing the same number twice with a charge that does not exist between
                  them. The amount the customer typed is already on screen above; what this
                  needs to say is that nothing is added to it. */}
              <p className="mt-3 text-sm text-[var(--text-secondary)]">No fees — the full amount goes into your wallet.</p>
              <button type="submit" className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[rgb(var(--ink-rgb))] px-4 py-3.5 text-base font-bold text-[var(--page-bg)] transition hover:bg-accent-solid hover:text-accent-on-solid"><CreditCard size={17} /> Continue to payment</button>
            </form>
          ) : !verificationSubmitted ? (
            <div>
              <div className="text-center">
                {/* The internal transaction id was printed under the amount. It is generated
                    here to tie the UPI payment to this request; the customer never types it,
                    quotes it or sees it again. It still travels inside the UPI link. */}
                <p className="text-base font-semibold text-[var(--text-primary)]">Scan to pay {displayINRCurrency(amount)}</p>
                <div className="mx-auto my-5 w-fit rounded-3xl border border-[var(--glass-border)] bg-white p-4 shadow-sm">{/* Stays literally white in every theme: a QR code needs a light quiet zone to scan, so this is the one place a raw colour is correct. */}<QRCodeSVG value={upiLink} size={184} /></div>
                <p className="text-sm leading-5 text-[var(--text-primary)]">Use Google Pay, PhonePe, Paytm or any UPI app.</p>
              </div>
              <form onSubmit={verifyTransaction} className="mt-6">
                <label htmlFor="upiTransactionId" className="text-base font-bold uppercase text-[var(--text-primary)]">UPI transaction ID</label>
                <input id="upiTransactionId" type="text" value={upiTransactionId} onChange={event => setUpiTransactionId(event.target.value.replace(/[^0-9]/g, '').slice(0, 12))} className="mt-2 w-full rounded-2xl border border-[var(--glass-border)] px-4 py-3.5 text-base outline-none transition focus:border-accent-text focus:ring-4 focus:ring-[var(--accent-soft-bg)]" placeholder="Enter 10-12 digit ID" minLength={10} maxLength={12} required />
                <p className="mt-2 text-sm text-[var(--text-primary)]">You can find this ID in your UPI payment receipt.</p>
                <button type="submit" disabled={loading || !upiTransactionId} className="mt-5 w-full rounded-2xl bg-[var(--nav-active-bg)] px-4 py-3.5 text-base font-bold text-[var(--nav-active-fg)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-[var(--glass-bg-subtle)] disabled:text-[var(--text-muted)]">{loading ? 'Sending...' : 'Send for checking'}</button>
                {verificationStatus && <p className="mt-3 text-center text-sm text-[var(--text-primary)]">{verificationStatus}</p>}
              </form>
              <button onClick={() => { setShowQR(false); setUpiTransactionId(''); setVerificationStatus(''); }} className="mt-4 w-full text-center text-base font-semibold text-[var(--text-primary)] hover:text-[var(--text-secondary)]">Go back</button>
            </div>
          ) : (
            <div className="py-6 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full badge badge-success"><CheckCircle2 size={28} /></div>
              {/* "Request submitted / waiting for admin approval / update after verification"
                  described the queue the payment had entered. What the customer needs to know
                  is that it arrived and when the money shows up. */}
              <h3 className="mt-4 text-lg font-semibold text-[var(--text-primary)]">We have your payment</h3>
              <p className="mx-auto mt-2 max-w-xs text-base leading-6 text-[var(--text-primary)]">We are checking it now. Your balance will go up once it clears.</p>
              <button onClick={resetRecharge} className="mt-6 rounded-2xl bg-[rgb(var(--ink-rgb))] px-5 py-3 text-base font-bold text-[var(--page-bg)] hover:bg-[rgb(var(--ink-rgb)/0.85)]">Close</button>
            </div>
      )}
      </Modal>
    );
  };

  const transactionRow = transaction => {
    const display = getTransactionDisplay(transaction);
    const status = getStatus(transaction.status);
    const date = new Date(transaction.date);
    const formattedDate = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const formattedTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return (
      <div key={transaction._id || transaction.id || `${transaction.date}-${transaction.amount}`} className="grid grid-cols-[5.25rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-5 py-4 transition hover:bg-[var(--glass-bg-strong)] sm:grid-cols-[5.25rem_minmax(0,1fr)_7.5rem_5.5rem] sm:px-6">
        <p className={`w-[5.25rem] shrink-0 text-base font-bold ${display.color}`}>{display.sign}{displayINRCurrency(Math.abs(Number(transaction.amount) || 0))}</p>
        <div className="flex min-w-0 items-center gap-2.5">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${display.iconBg}`}>{React.cloneElement(display.icon, { size: 15 })}</div>
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-[var(--text-primary)]">{display.title}</p>
            {/* The line used to end with " · UPI ref: 4821" — the last four digits of the
                payment reference. A partial reference cannot be matched against anything;
                the whole one lives on the payment itself if it is ever needed. */}
            <p className="mt-0.5 truncate text-sm text-[var(--text-primary)]">{formattedDate} · {formattedTime}</p>
          </div>
        </div>
        <div className="col-start-2 flex items-center justify-between gap-2 sm:contents">
          {/* The mobile-only "Payment mode" caption sat directly above the word UPI, which
              names itself. */}
          <div className="text-left sm:text-right"><p className="text-sm font-bold text-[var(--text-primary)]">{getPaymentMethodText(transaction.paymentMethod)}</p></div>
          {status ? <Badge tone={status.tone} size="sm" icon={status.icon}>{status.label}</Badge> : <span className="text-sm text-[var(--text-primary)]">-</span>}
        </div>
      </div>
    );
  };

  const pendingCount = walletHistory.filter(transaction => transaction.status === 'pending').length;

  return (
    <DashboardLayout user={user} activeProject={activeProject}>
      <div
        className="min-h-full px-3 py-4 sm:px-5 lg:px-8 lg:py-7"
      >
        <div className="mx-auto max-w-7xl">
          <Surface as="section" tone="subtle" sheen className="p-3 text-[var(--text-primary)] sm:p-4">
              <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-accent-400/20 blur-3xl" />
            <div className="relative grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
              <Surface tone="subtle" className="p-5 sm:p-6"><p className="text-sm font-bold uppercase text-[var(--eyebrow-fg)]">{getGreeting()}, {user?.name || 'User'}</p><h1 className="mt-2 text-2xl font-bold tracking-tight text-[var(--text-primary)]">Your wallet</h1><div className="mt-6 flex items-center justify-between"><span className="text-sm font-bold uppercase text-[var(--text-primary)]">Available balance</span><WalletIcon /></div><p className="mt-4 text-2xl font-bold tracking-tight text-[var(--text-primary)]">{displayINRCurrency(context?.walletBalance || 0)}</p><p className="mt-2 max-w-sm text-sm text-[var(--text-primary)]">Use this for any payment in the portal.</p><div className="mt-5 flex flex-wrap gap-2"><button onClick={() => setShowRechargePanel(true)} className="inline-flex items-center gap-2 rounded-xl bg-[var(--nav-active-bg)] px-4 py-2.5 text-base font-bold text-[var(--nav-active-fg)] transition hover:opacity-90"><Plus size={15} /> Recharge wallet</button><button onClick={refreshWallet} className="inline-flex items-center gap-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-3 py-2.5 text-base font-bold text-[var(--text-primary)] hover:bg-[var(--glass-bg)]"><RefreshCw size={14} /> Refresh</button></div></Surface>
              <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-1">
                <StatTile label="Total added" value={displayINRCurrency(getTotalAdded())} tone="neutral" />
                <StatTile label="Total spent" value={displayINRCurrency(getTotalSpending())} tone="neutral" />
                <StatTile label="Being checked" value={pendingCount} tone="pending" helper={getPendingAmount() > 0 ? displayINRCurrency(getPendingAmount()) : 'Nothing waiting'} />
              </div>
            </div>
          </Surface>

          <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1.35fr_0.65fr]">
          <Surface as="section" tone="strong" className="overflow-hidden lg:order-2">
            <div className="border-b border-[var(--glass-border-strong)] p-5 sm:px-6"><div className="flex items-center gap-2"><ShieldCheck size={17} className="text-[var(--eyebrow-fg)]" /><h2 className="text-lg font-semibold text-[var(--text-primary)]">Your payments to us</h2></div><p className="mt-1 text-sm text-[var(--text-primary)]">Money you add is credited once we have checked it.</p></div>
            <div className="grid gap-3 p-4 sm:p-5"><ApprovalItem icon={<CheckCircle2 size={17} />} label="Cleared" value={walletHistory.filter(transaction => transaction.status === 'completed').length} tone="success" /><ApprovalItem icon={<Clock3 size={17} />} label="Being checked" value={pendingCount} tone="pending" /><ApprovalItem icon={<AlertCircle size={17} />} label="Rejected" value={walletHistory.filter(transaction => transaction.status === 'failed').length} tone="error" /></div>
          </Surface>

          <Surface as="section" tone="strong" className="overflow-hidden lg:order-1">
            <div className="border-b border-[var(--glass-border-strong)] p-5 sm:p-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><h2 className="text-lg font-semibold text-[var(--text-primary)]">Your money</h2><p className="mt-1 text-sm text-[var(--text-primary)]">Everything that came in and went out.</p></div><div className="flex flex-col gap-2 sm:flex-row"><div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" /><input type="search" value={historySearch} onChange={event => { setHistorySearch(event.target.value); setShowAllHistory(false); }} placeholder="Search history" className="w-full rounded-xl border border-[var(--glass-border-strong)] bg-[var(--glass-bg-strong)] py-2.5 pl-9 pr-3 text-base text-[var(--text-primary)] outline-none backdrop-blur-md focus:border-accent-text focus:ring-4 focus:ring-[var(--accent-soft-bg)] sm:w-52" /></div><div className="flex rounded-xl bg-[var(--glass-bg-strong)] p-1 backdrop-blur-md">{HISTORY_FILTERS.map(filter => <button key={filter.id} onClick={() => { setHistoryFilter(filter.id); setShowAllHistory(false); }} className={`whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-bold transition ${historyFilter === filter.id ? 'bg-[var(--glass-bg-strong)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-primary)] hover:text-[var(--text-secondary)]'}`}>{filter.label}</button>)}</div></div></div></div>
            <div className="divide-y divide-[var(--divider)]">{visibleHistory.map(transactionRow)}{filteredHistory.length === 0 && <div className="px-5 py-14 text-center"><div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--glass-bg-strong)] text-[var(--text-muted)] backdrop-blur-md"><Search size={18} /></div><p className="mt-3 text-base font-bold text-[var(--text-primary)]">No transactions found</p><p className="mt-1 text-sm text-[var(--text-primary)]">Try a different filter or search term.</p></div>}</div>
            {filteredHistory.length > 5 && !showAllHistory && <button type="button" onClick={() => setShowAllHistory(true)} className="w-full border-t border-[var(--glass-border-strong)] px-5 py-4 text-base font-bold text-[var(--text-primary)] transition hover:bg-[var(--glass-bg-strong)] hover:text-[var(--accent-soft-fg)] sm:px-6">Show more transactions <span className="ml-1 text-[var(--text-primary)]">({filteredHistory.length - 5} more)</span></button>}
            {filteredHistory.length > 5 && showAllHistory && <button type="button" onClick={() => setShowAllHistory(false)} className="w-full border-t border-[var(--glass-border-strong)] px-5 py-4 text-base font-bold text-[var(--text-primary)] transition hover:bg-[var(--glass-bg-strong)] hover:text-[var(--accent-soft-fg)] sm:px-6">Show less transactions</button>}
          </Surface>
          </div>
        </div>
      </div>
      {renderRechargePanel()}
      {loading && <div className="modal-backdrop fixed inset-0 z-[60] flex items-center justify-center"><Surface tone="strong" size="compact"><TriangleMazeLoader /></Surface></div>}
    </DashboardLayout>
  );
};

const WalletIcon = () => <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)]"><CreditCard size={17} className="text-[var(--text-primary)]" /></div>;

// Kept as a local component — it is a small stat tile, not the dashboard's
// MetricCard (no glow, no icon, no hover), so merging the two would invent an
// abstraction neither page asked for. Only its container moves to Surface, and
// its label colours move to tokens: `text-emerald-200` and `text-amber-200`
// were picked for the dark ground and drop to roughly 1.5:1 on the light page.
//
// `tone` here labels three different measures, not three states — added, spent
// and pending are not success/error. Only pending is genuinely a status, so it
// is the only one that keeps a colour; the other two read as plain text. That
// is the point of colour meaning something.
const StatTile = ({ label, value, tone, helper }) => {
  const toneStyles = {
    pending: 'text-[var(--badge-pending-fg)]',
    neutral: 'text-[var(--text-secondary)]',
  };
  return (
    <Surface tone="metric" radius="sm" className="p-3.5 text-[var(--text-primary)]">
      <p className={`text-sm font-bold uppercase ${toneStyles[tone] || toneStyles.neutral}`}>{label}</p>
      <p className="mt-2 text-lg font-semibold tracking-tight text-[var(--text-primary)]">{value}</p>
      {helper && <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{helper}</p>}
    </Surface>
  );
};

// The icon chip carried `bg-emerald-50 text-emerald-600` — a -50 fill is a lit
// patch on the dark themes. It is a status (approved / waiting / rejected), so
// the badge tones apply directly.
const ApprovalItem = ({ icon, label, value, tone }) => (
  <Surface tone="strong" className="flex items-center gap-3 p-3">
    <div className={`badge badge-${tone} flex h-9 w-9 shrink-0 items-center justify-center rounded-xl`}>{icon}</div>
    <div>
      <p className="text-sm font-semibold text-[var(--text-primary)]">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-[var(--text-primary)]">{value}</p>
    </div>
  </Surface>
);

export default WalletDetails;
