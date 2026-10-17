import React, { useState, useEffect, useContext } from 'react';
// import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { customerReturnState } from '../helpers/customerReturnNavigation';
import { Ticket, Plus, ArrowRight, Filter } from 'lucide-react';
import { toast } from 'sonner';
import SummaryApi from '../common';
import Context from '../context';
import CreateTicket from './CreateTicket';
import TriangleMazeLoader from '../components/TriangleMazeLoader';
import { useSelector } from 'react-redux';
import Surface from './Surface';
import Badge from './Badge';
import GlassButton from './GlassButton';

const TicketsList = () => {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  // const { userDetails } = useContext(Context);
  const userDetails = useSelector((state) => state.user.user);
  const isInitialized = useSelector((state) => state.user.initialized);
  
  // Fetch tickets from API
  const fetchTickets = async () => {
    if (!userDetails?._id) {
      // console.log("No user ID available, skipping fetch");
      return;
    }
    
    setLoading(true);
    try {
      let url = `${SummaryApi.getUserTickets.url}?page=${currentPage}`;
      if (statusFilter) {
        url += `&status=${statusFilter}`;
      }
      
      // console.log("Fetching tickets with URL:", url);

      const response = await fetch(url, {
        method: SummaryApi.getUserTickets.method,
        headers: { "Content-Type": "application/json" },
        credentials: 'include'
      });
      
      const result = await response.json();
      // console.log("API Response:", result);
      
      if (result.success) {
        // console.log("Setting tickets:", result.data.tickets);
        setTickets(result.data.tickets);
        setTotalPages(result.data.pagination.pages);
      } else {
        setError('Failed to load tickets');
        toast.error(result.message || 'Failed to load tickets');
      }
    } catch (err) {
      console.error('Error fetching tickets:', err);
      setError('Failed to load tickets. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  // Status pill. These were opaque `-100/-800` pairs — `bg-yellow-100
  // text-yellow-800`, `bg-blue-100 text-blue-800` — which are light patches
  // that ignore the theme entirely: on the dark page they read as lit slabs,
  // and blue is not in the portal palette at all. Same tone map as
  // TicketDetail.js, so one status cannot be two colours on two screens.
  const STATUS_BADGE = {
    pending: { label: 'Pending', tone: 'pending' },
    open: { label: 'Open', tone: 'neutral' },
    closed: { label: 'Closed', tone: 'success' },
  };

  const getStatusBadge = (status) => {
    const meta = STATUS_BADGE[status] || { label: 'Unknown', tone: 'neutral' };
    return <Badge tone={meta.tone} size="sm">{meta.label}</Badge>;
  };
  
  // Pagination handler
  const handlePageChange = (page) => {
    setCurrentPage(page);
  };
  
  // Format date helper
  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      const options = { day: '2-digit', month: 'short', year: 'numeric' };
      return date.toLocaleDateString('en-IN', options);
    } catch (error) {
      return 'Invalid date';
    }
  };
  
  // Pagination UI
  const renderPagination = () => {
    if (totalPages <= 1) return null;
    
    const pages = [];
    
    // Previous button
    pages.push(
      <button
        key="prev"
        onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1}
        className={`relative inline-flex items-center rounded-l-xl border px-2 py-2 backdrop-blur-md ${
          currentPage === 1
            ? 'cursor-not-allowed border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] text-[var(--text-muted)]'
            : 'border-[var(--glass-border-strong)] bg-[var(--glass-bg)] text-[var(--text-secondary)] hover:bg-[var(--glass-bg-strong)]'
        }`}
      >
        <span className="sr-only">Previous</span>
        <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      </button>
    );
    
    // Page numbers
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, startPage + 4);
    
    for (let i = startPage; i <= endPage; i++) {
      pages.push(
        <button
          key={i}
          onClick={() => handlePageChange(i)}
          className={`relative inline-flex items-center border px-4 py-2 backdrop-blur-md ${
            i === currentPage
              ? 'z-10 border-[var(--badge-success-border)] bg-[var(--badge-success-bg)] text-[var(--text-primary)]'
              : 'border-[var(--glass-border-strong)] bg-[var(--glass-bg)] text-[var(--text-secondary)] hover:bg-[var(--glass-bg-strong)]'
          }`}
        >
          {i}
        </button>
      );
    }
    
    // Next button
    pages.push(
      <button
        key="next"
        onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage === totalPages}
        className={`relative inline-flex items-center rounded-r-xl border px-2 py-2 backdrop-blur-md ${
          currentPage === totalPages
            ? 'cursor-not-allowed border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] text-[var(--text-muted)]'
            : 'border-[var(--glass-border-strong)] bg-[var(--glass-bg)] text-[var(--text-secondary)] hover:bg-[var(--glass-bg-strong)]'
        }`}
      >
        <span className="sr-only">Next</span>
        <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
      </button>
    );
    
    return (
      <div className="flex items-center justify-center mt-5">
        <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
          {pages}
        </nav>
      </div>
    );
  };
  
  // Effect to load tickets on component mount and when dependencies change
  useEffect(() => {
    if (isInitialized && userDetails?._id) {
      // console.log("Fetching tickets for user:", userDetails._id);
      fetchTickets();
    }
  }, [currentPage, statusFilter, userDetails, isInitialized]);
  
  return (
    <Surface radius="panel" className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-[var(--glass-sheen)] to-transparent" />
      <div className="relative flex items-center justify-between gap-3 border-b border-[var(--glass-border)] p-4 sm:px-6">
        <h2 className="flex items-center text-xl font-semibold text-[var(--text-primary)]">
          <Ticket className="mr-2 h-5 w-5" />
          My Support Tickets
        </h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="rounded-xl border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] py-1.5 pl-9 pr-3 text-sm text-[var(--text-primary)] backdrop-blur-md focus:border-[var(--badge-success-border)] focus:outline-none focus:ring-4 focus:ring-[var(--badge-success-bg)]"
            >
              <option className="bg-[var(--menu-bg)] text-[var(--text-primary)]" value="">All Tickets</option>
              <option className="bg-[var(--menu-bg)] text-[var(--text-primary)]" value="pending">Pending</option>
              <option className="bg-[var(--menu-bg)] text-[var(--text-primary)]" value="open">Open</option>
              <option className="bg-[var(--menu-bg)] text-[var(--text-primary)]" value="closed">Closed</option>
            </select>
            <Filter className="absolute left-3 top-2 h-4 w-4 text-[var(--text-muted)]" />
          </div>
          <GlassButton size="sm" onClick={() => setShowCreateForm(true)} className="sm:px-4">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Create Ticket</span>
            <span className="sm:hidden">New</span>
          </GlassButton>
        </div>
      </div>

      {loading ? (
        <div className="relative flex items-center justify-center p-12">
          <TriangleMazeLoader />
        </div>
      ) : error ? (
        <div className="relative p-6 text-center">
          <p className="text-[var(--badge-error-fg)]">{error}</p>
          <GlassButton onClick={fetchTickets} className="mt-4">
            Try Again
          </GlassButton>
        </div>
      ) : tickets.length === 0 ? (
        <div className="relative p-12 text-center">
          <div className="mb-4 flex justify-center">
            <Ticket className="h-12 w-12 text-[var(--text-muted)]" />
          </div>
          <h3 className="mb-2 text-lg font-medium text-[var(--text-primary)]">No tickets found</h3>
          <p className="mb-6 text-[var(--text-secondary)]">You haven't created any support tickets yet.</p>
          <GlassButton variant="primary" onClick={() => setShowCreateForm(true)} className="mx-auto">
            <Plus className="h-4 w-4" />
            Create Your First Ticket
          </GlassButton>
        </div>
      ) : (
        <>
          <div className="relative overflow-x-auto">
            <table className="min-w-full divide-y divide-[var(--divider)]">
              <thead className="bg-[var(--glass-bg-subtle)]">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
                    Ticket ID
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
                    Category
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
                    Subject
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
                    Created
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
                    Last Updated
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--divider)]">
                {tickets.map((ticket) => (
                  <tr
                    key={ticket.ticketId}
                    onClick={() => navigate(`/support-tickets/${ticket.ticketId}`, {
                      state: customerReturnState('/support'),
                    })}
                    className="cursor-pointer hover:bg-[var(--glass-bg-subtle)]"
                  >
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-[var(--text-primary)]">
                      {ticket.ticketId}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-[var(--text-secondary)]">
                      {ticket.category}
                    </td>
                    <td className="max-w-[200px] truncate whitespace-nowrap px-6 py-4 text-sm text-[var(--text-secondary)]">
                      {ticket.subject}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-[var(--text-secondary)]">
                      {getStatusBadge(ticket.status)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-[var(--text-secondary)]">
                      {formatDate(ticket.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-[var(--text-secondary)]">
                      {formatDate(ticket.updatedAt)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                      <span className="flex items-center justify-end gap-1 font-medium text-[var(--badge-success-fg)]">
                        View <ArrowRight className="h-4 w-4" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {renderPagination()}
        </>
      )}
      
      {/* Create Ticket Modal */}
      {showCreateForm && (
        <CreateTicket
          show={showCreateForm}
          handleClose={() => setShowCreateForm(false)}
          refreshTickets={fetchTickets}
        />
      )}
    </Surface>
  );
};

export default TicketsList;
