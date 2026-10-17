import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText } from 'lucide-react';
import SummaryApi from '../common';
import { toast } from 'sonner';
import CustomerWorkspaceTabs from '../components/CustomerWorkspaceTabs';
import Badge from '../components/Badge';
import { getInvoiceStatusText, getInvoicePurposeText, isFreeInvoice } from '../helpers/invoicePresentation';
import { getOrderDisplayName } from '../helpers/orderPresentation';

const UserInvoices = () => {
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const navigate = useNavigate();

    useEffect(() => {
        fetchInvoices();
    }, []);

    const fetchInvoices = async () => {
        try {
            setLoading(true);
            // The old /api/my-invoices endpoint is not mounted. Invoice Detail and Order Detail
            // already use this authenticated customer workspace, which returns both invoice
            // models with their owned order display data; this page now reads that same truth.
            const response = await fetch(SummaryApi.myPaymentWorkspace.url, {
                method: SummaryApi.myPaymentWorkspace.method,
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (data.success) {
                setInvoices(Array.isArray(data.data?.invoices) ? data.data.invoices : []);
            } else {
                toast.error(data.message || 'Failed to fetch invoices');
            }
        } catch (error) {
            console.error('Error fetching invoices:', error);
            toast.error('Failed to load invoices');
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    const isOverdue = (dueDate, status) => {
        if (status === 'paid' || status === 'cancelled') return false;
        return new Date(dueDate) < new Date();
    };

    const filteredInvoices = filter === 'all'
        ? invoices
        : invoices.filter(inv => inv.status === filter);

    if (loading) {
        return (
            <div
                className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-4 py-10 sm:px-6 lg:px-8 lg:py-14 flex items-center justify-center"
            >
                <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />
                <div className="relative text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-text mx-auto"></div>
                    <p className="mt-4 text-base text-[var(--text-primary)]">Loading invoices...</p>
                </div>
            </div>
        );
    }

    return (
        <div
            className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-4 py-10 sm:px-6 lg:px-8 lg:py-14"
        >
            <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />

            <div className="relative mx-auto max-w-7xl">
                {/* Header */}
                <div className="text-center mb-6">
                    <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">Your bills</h1>
                    <p className="mt-1 text-base text-[var(--text-secondary)]">See payments for your projects and plans.</p>
                </div>

                {/* Card: filter row + invoice list */}
                <div className="relative overflow-hidden rounded-3xl border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] backdrop-blur-2xl backdrop-saturate-150 shadow-[var(--card-shadow)]">
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-[var(--glass-sheen)] to-transparent" />

                    <div className="relative flex flex-wrap items-center justify-between gap-3 border-b border-[var(--glass-border)] px-5 py-4 sm:px-6">
                        <div className="flex items-center gap-2">
                            <FileText className="h-5 w-5 text-[var(--text-primary)]" />
                            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Bills</h2>
                        </div>
                        <CustomerWorkspaceTabs
                            tabs={['all', 'unpaid', 'partially_paid', 'paid', 'overdue', 'cancelled'].map((status) => ({
                                id: status,
                                label: status === 'all'
                                    ? 'All'
                                    : `${getInvoiceStatusText({ status }).label} (${invoices.filter((inv) => inv.status === status).length})`,
                            }))}
                            activeTab={filter}
                            onChange={setFilter}
                            ariaLabel="Invoice status filters"
                            variant="inline"
                        />
                    </div>

                    <div className="relative bg-[var(--glass-bg-subtle)] px-5 py-5 sm:px-6">
                        {filteredInvoices.length === 0 ? (
                            <div className="p-8 text-center">
                                <FileText className="h-12 w-12 mx-auto text-[var(--text-muted)]" />
                                <p className="mt-4 text-lg font-semibold text-[var(--text-primary)]">No invoices found</p>
                                <p className="text-sm text-[var(--text-secondary)] mt-2">
                                    {filter === 'all'
                                        ? 'You don\'t have any invoices yet'
                                        : `No ${filter} invoices`}
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {filteredInvoices.map((invoice, index) => (
                                    <div
                                        key={invoice._id}
                                        className={`rounded-2xl border border-[var(--glass-border)] p-5 ${index % 2 === 0 ? 'bg-[var(--glass-bg-subtle)]' : 'bg-[var(--glass-bg-subtle)]'}`}
                                    >
                                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                                            {/* Left Section */}
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 mb-2 flex-wrap">
                                                    {/* Was the invoice number as the heading and the raw
                                                        status value beside it — "INV-202609-0005" and
                                                        "partially_paid". The row now leads with what the
                                                        bill is for, and the status is worded by the same
                                                        helper every other invoice surface uses. */}
                                                    <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                                                        {getInvoicePurposeText(invoice, getOrderDisplayName(invoice.orderId, ''))}
                                                    </h3>
                                                    <Badge tone={getInvoiceStatusText(invoice).tone}>
                                                        {getInvoiceStatusText(invoice).label}
                                                    </Badge>
                                                    {isOverdue(invoice.dueDate, invoice.status) && (
                                                        <Badge tone="error" size="sm">
                                                            Past due
                                                        </Badge>
                                                    )}
                                                </div>

                                                <div className="text-sm text-[var(--text-secondary)] space-y-1">
                                                    {invoice.renewalPeriodStart && invoice.renewalPeriodEnd ? (
                                                        <p><span className="font-medium text-[var(--text-muted)]">Covers:</span>{' '}{formatDate(invoice.renewalPeriodStart)} - {formatDate(invoice.renewalPeriodEnd)}</p>
                                                    ) : null}
                                                    <p>
                                                        <span className="font-medium text-[var(--text-muted)]">Sent:</span> {formatDate(invoice.invoiceDate)}
                                                    </p>
                                                    <p>
                                                        <span className="font-medium text-[var(--text-muted)]">Pay by:</span> {formatDate(invoice.dueDate)}
                                                    </p>
                                                    {invoice.paidDate && (
                                                        <p className="text-[var(--badge-success-fg)]">
                                                            <span className="font-medium">Paid:</span> {formatDate(invoice.paidDate)}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Right Section */}
                                            <div className="flex flex-col items-end gap-3">
                                                <div className="text-right">
                                                    <p className="text-sm text-[var(--text-secondary)]">Amount</p>
                                                    <p className="text-2xl font-bold text-[var(--text-primary)]">
                                                        {isFreeInvoice(invoice) ? 'FREE' : `₹${invoice.amount.toLocaleString()}`}
                                                    </p>
                                                </div>

                                                {['unpaid', 'partially_paid', 'overdue'].includes(invoice.status) ? (
                                                    <button
                                                        onClick={() => navigate(`/invoice-detail/${invoice._id}`)}
                                                        className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                                                            invoice.status === 'overdue'
                                                                ? 'bg-red-600 hover:bg-red-700 text-[var(--text-primary)]'
                                                                : 'bg-accent-solid hover:bg-accent-solid-hover text-accent-on-solid'
                                                        }`}
                                                    >
                                                        View bill
                                                    </button>
                                                ) : invoice.status === 'paid' ? (
                                                    <div className="flex items-center gap-2 text-[var(--badge-success-fg)]">
                                                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                        </svg>
                                                        <span className="font-medium">Paid</span>
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>

                                        {/* Additional Info */}
                                        {invoice.notes && (
                                            <div className="mt-4 pt-4 border-t border-[var(--glass-border)]">
                                                <p className="text-sm text-[var(--text-secondary)]">
                                                    <span className="font-medium text-[var(--text-muted)]">Note:</span> {invoice.notes}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UserInvoices;
