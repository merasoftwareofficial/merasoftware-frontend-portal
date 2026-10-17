import React, { useState, useEffect, useRef, useContext } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowLeft, Send, User, Check, X, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import SummaryApi from '../common';
import Context from '../context';
import TriangleMazeLoader from '../components/TriangleMazeLoader';
import DashboardLayout from '../components/DashboardLayout';
import Surface from '../components/Surface';
import Badge from '../components/Badge';
import GlassButton from '../components/GlassButton';
import { useSelector } from 'react-redux';
import { customerReturnState, goToCustomerReturn } from '../helpers/customerReturnNavigation';

const TicketDetail = ({ isAdmin = false }) => {
  const { ticketId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const handleBack = () => {
    if (isAdmin) {
      navigate(-1);
      return;
    }
    goToCustomerReturn(navigate, location, '/support');
  };
  // const { userDetails } = useContext(Context);
  // Context के बजाय Redux का उपयोग करें
  const userDetails = useSelector((state) => state.user.user);
  const isInitialized = useSelector((state) => state.user.initialized);
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [closingTicket, setClosingTicket] = useState(false);
  const messagesEndRef = useRef(null);

  // Fetch ticket details
  const fetchTicketDetails = async () => {
    if (!ticketId || !userDetails?._id) {
      console.log("No user ID or ticket ID available");
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch(`${SummaryApi.getTicketDetails.url}/${ticketId}`, {
        method: SummaryApi.getTicketDetails.method,
        headers: { "Content-Type": "application/json" },
        credentials: 'include'
      });
      
      const result = await response.json();
      
      if (result.success) {
        setTicket(result.data);
      } else {
        setError(result.message || 'Failed to load ticket details');
        toast.error(result.message || 'Failed to load ticket details');
      }
    } catch (err) {
      console.error('Error fetching ticket details:', err);
      setError('Failed to load ticket details. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle reply submission
  const handleReply = async (e) => {
    e.preventDefault();
    
    if (!replyMessage.trim()) {
      toast.error('Please enter a message');
      return;
    }
    
    setSendingReply(true);
    
    try {
      const response = await fetch(`${SummaryApi.replyTicket.url}/${ticketId}`, {
        method: SummaryApi.replyTicket.method,
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({
          message: replyMessage
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setReplyMessage('');
        fetchTicketDetails(); // Refresh ticket details
        toast.success('Reply sent successfully');
      } else {
        toast.error(result.message || 'Failed to send reply');
      }
    } catch (err) {
      console.error('Error sending reply:', err);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setSendingReply(false);
    }
  };

  // Handle close ticket (admin only)
  const handleCloseTicket = async () => {
    if (!window.confirm('Are you sure you want to close this ticket?')) {
      return;
    }
    
    setClosingTicket(true);
    
    try {
      const response = await fetch(`${SummaryApi.closeTicket.url}/${ticketId}`, {
        method: SummaryApi.closeTicket.method,
        headers: { "Content-Type": "application/json" },
        credentials: 'include'
      });
      
      const result = await response.json();
      
      if (result.success) {
        fetchTicketDetails(); // Refresh ticket details
        toast.success('Ticket closed successfully');
      } else {
        toast.error(result.message || 'Failed to close ticket');
      }
    } catch (err) {
      console.error('Error closing ticket:', err);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setClosingTicket(false);
    }
  };

  // Format date helper
  const formatDateTime = (dateString) => {
    try {
      return format(new Date(dateString), 'dd MMM yyyy, HH:mm');
    } catch (error) {
      return 'Invalid date';
    }
  };

  // Status pill. Four hand-written spans became four tones — the amber and
  // emerald ones were `text-amber-300` / `text-emerald-300` on a 20% fill, which
  // measures about 1.2:1 on the light page. The icons are dropped so this badge
  // has the same shape as every other status badge in the portal.
  const STATUS_BADGE = {
    pending: { label: 'Pending', tone: 'pending' },
    open: { label: 'Open', tone: 'neutral' },
    closed: { label: 'Closed', tone: 'success' },
  };

  const getStatusBadge = (status) => {
    const meta = STATUS_BADGE[status] || { label: 'Unknown', tone: 'neutral' };
    return <Badge tone={meta.tone}>{meta.label}</Badge>;
  };

  // Scroll to bottom of messages when ticket updates
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [ticket?.messages]);

  // Load ticket details on component mount
  useEffect(() => {
    if (isInitialized && userDetails?._id) {
      console.log("Fetching ticket details for:", ticketId);
      fetchTicketDetails();
    }
  }, [ticketId, userDetails, isInitialized]);

  if (loading) {
    return (
      <DashboardLayout user={userDetails}>
        <div className="flex justify-center items-center p-12">
          <TriangleMazeLoader />
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout user={userDetails}>
        <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />
          <Surface radius="panel" className="relative mx-auto max-w-3xl p-8">
            <div className="flex flex-col items-center justify-center text-center">
              <AlertTriangle className="mb-4 h-12 w-12 text-[var(--badge-error-fg)]" />
              <h3 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">Error Loading Ticket</h3>
              <p className="mb-4 text-base text-[var(--text-secondary)]">{error}</p>
              <div className="flex gap-4">
                <GlassButton onClick={handleBack}>Go Back</GlassButton>
                <GlassButton variant="primary" onClick={fetchTicketDetails}>Try Again</GlassButton>
              </div>
            </div>
          </Surface>
        </div>
      </DashboardLayout>
    );
  }

  if (!ticket) {
    return (
      <DashboardLayout user={userDetails}>
        <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />
          <Surface radius="panel" className="relative mx-auto max-w-3xl p-8">
            <div className="flex flex-col items-center justify-center text-center">
              <AlertTriangle className="mb-4 h-12 w-12 text-[var(--badge-pending-fg)]" />
              <h3 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">Ticket Not Found</h3>
              <p className="mb-4 text-base text-[var(--text-secondary)]">The ticket you're looking for doesn't exist or you don't have permission to view it.</p>
              <GlassButton variant="primary" onClick={handleBack}>Go Back</GlassButton>
            </div>
          </Surface>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout user={userDetails}>
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
    <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />
    <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-4">
      {/* Ticket Header */}
      <div className="relative flex items-center justify-center">
        <GlassButton size="lg" onClick={handleBack} className="absolute left-0 shrink-0">
          <ArrowLeft className="h-5 w-5" />
          Back
        </GlassButton>

        <div className="text-center">
          <h1 className="flex flex-wrap items-center justify-center gap-3 text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">
            Ticket: {ticket.ticketId}
            {getStatusBadge(ticket.status)}
          </h1>
          <p className="mt-1 text-base text-[var(--text-secondary)]">
            Created on {formatDateTime(ticket.createdAt)}
          </p>
        </div>
      </div>

      {isAdmin && ticket.status !== 'closed' && (
        <div className="flex justify-center">
          <GlassButton
            onClick={handleCloseTicket}
            disabled={closingTicket}
            variant="primary"
            className={closingTicket ? 'cursor-not-allowed opacity-70' : ''}
          >
            {closingTicket ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                <span>Closing...</span>
              </>
            ) : (
              <>
                <X className="h-4 w-4 mr-1" />
                <span>Close Ticket</span>
              </>
            )}
          </GlassButton>
        </div>
      )}

      {/* Ticket Details */}
      <Surface radius="panel" sheen className="overflow-hidden p-5 sm:p-6">

        <div className="relative grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <h2 className="text-sm font-medium text-[var(--text-muted)] mb-2">Subject</h2>
            <p className="text-base font-semibold text-[var(--text-primary)]">{ticket.subject}</p>

            <h2 className="text-sm font-medium text-[var(--text-muted)] mt-4 mb-2">Category</h2>
            <p className="text-base font-semibold text-[var(--text-primary)]">{ticket.category}</p>
          </div>

          <div>
            <h2 className="text-sm font-medium text-[var(--text-muted)] mb-2">Customer</h2>
            <p className="text-base font-semibold text-[var(--text-primary)]">{ticket.userId?.name || 'Unknown'}</p>

            <h2 className="text-sm font-medium text-[var(--text-muted)] mt-4 mb-2">Email</h2>
            <p className="text-base font-semibold text-[var(--text-primary)]">{ticket.userId?.email || 'Unknown'}</p>
          </div>
        </div>

        {/* Status History Timeline */}
        <div className="relative mb-8">
          <h2 className="text-sm font-medium text-[var(--text-muted)] mb-4">Status History</h2>

          <div className="relative">
            {/* Line that connects all the timeline events */}
            <div className="absolute h-full w-0.5 bg-[var(--glass-bg-strong)] left-2.5 top-0"></div>

            {/* Timeline events */}
            <div className="space-y-6 relative">
              {ticket.statusHistory?.map((status, index) => (
                <div key={index} className="flex items-start">
                  {/* A timeline dot IS a status, so it keeps its colour — but
                      amber-500/60 and emerald-500/60 were picked against the dark
                      page. The badge tokens invert for light mode. */}
                  <div className={`
                    z-10 h-5 w-5 flex-shrink-0 rounded-full border
                    ${status.status === 'pending' ? 'border-[var(--badge-pending-border)] bg-[var(--badge-pending-fg)]' : ''}
                    ${status.status === 'open' ? 'border-[var(--glass-border-strong)] bg-[var(--glass-bg-strong)]' : ''}
                    ${status.status === 'closed' ? 'border-[var(--badge-success-border)] bg-[var(--badge-success-fg)]' : ''}
                  `}></div>
                  <div className="ml-4">
                    <p className="text-base font-medium text-[var(--text-primary)] capitalize">
                      {status.status}
                    </p>
                    <p className="text-sm text-[var(--text-secondary)]">
                      {formatDateTime(status.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Conversation */}
        <div className="relative mb-2">
          <h2 className="text-sm font-medium text-[var(--text-muted)] mb-4">Conversation</h2>

          <Surface tone="subtle" className="overflow-hidden">
            <div className="p-4 bg-[var(--glass-bg-subtle)] border-b border-[var(--glass-border)]">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] flex items-center justify-center flex-shrink-0">
                  <User className="h-4 w-4 text-[var(--text-primary)]" />
                </div>
                <div>
                  <p className="text-base font-medium text-[var(--text-primary)]">
                    {ticket.userId?.name || 'Customer'} - <span className="text-[var(--text-secondary)] text-sm font-normal">Original Request</span>
                  </p>
                  <div className="mt-1 text-base text-[var(--text-secondary)] whitespace-pre-wrap">
                    {ticket.description}
                  </div>
                  <p className="text-sm text-[var(--text-muted)] mt-1">
                    {formatDateTime(ticket.createdAt)}
                  </p>
                </div>
              </div>
            </div>

            {/* Message list with scrollable container */}
            <div className="max-h-96 overflow-y-auto p-4 space-y-4">
              {ticket.messages?.map((msg, index) => {
                // Skip the first message (it's the original request)
                if (index === 0) return null;

                const isAdmin = msg.sender === 'admin';

                return (
                  <div key={index} className={`flex items-start gap-3 ${isAdmin ? 'flex-row-reverse' : ''}`}>
                    {/* The support side used to be amber — avatar ring, icon and
                        message bubble. Who sent a message is an identity, not a
                        status, and amber already means "pending" two sections up
                        on this same screen. The two sides are still told apart by
                        the side they sit on, the icon, and the name above the
                        bubble; the support bubble also sits one glass level
                        heavier. `text-amber-300` on the light page measured about
                        1.5:1 in any case. */}
                    <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border ${
                      isAdmin ? 'border-[var(--glass-border-strong)] bg-[var(--glass-bg-strong)]' : 'border-[var(--glass-border-strong)] bg-[var(--glass-bg)]'
                    }`}>
                      {isAdmin ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-[var(--text-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      ) : (
                        <User className="h-4 w-4 text-[var(--text-primary)]" />
                      )}
                    </div>

                    <div className={`max-w-[80%] ${isAdmin ? 'text-right' : ''}`}>
                      <p className="text-base font-medium text-[var(--text-primary)]">
                        {isAdmin ? 'Support Team' : (ticket.userId?.name || 'Customer')}
                      </p>
                      <div className={`mt-1 whitespace-pre-wrap rounded-xl border p-3 text-base text-[var(--text-primary)] ${
                        isAdmin ? 'border-[var(--glass-border-strong)] bg-[var(--glass-bg-strong)]' : 'border-[var(--glass-border)] bg-[var(--glass-bg-subtle)]'
                      }`}>
                        {msg.message}
                      </div>
                      <p className="text-sm text-[var(--text-muted)] mt-1">
                        {formatDateTime(msg.timestamp)}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply form */}
            {ticket.status !== 'closed' ? (
              <div className="p-4 border-t border-[var(--glass-border)]">
                <form onSubmit={handleReply}>
                  <div className="flex items-start gap-2">
                    <textarea
                      value={replyMessage}
                      onChange={(e) => setReplyMessage(e.target.value)}
                      placeholder="Type your reply here..."
                      className="flex-grow rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-2 text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--badge-success-border)] focus:outline-none focus:ring-4 focus:ring-[var(--badge-success-bg)]"
                      rows={3}
                    ></textarea>
                    <GlassButton
                      type="submit"
                      variant="primary"
                      disabled={sendingReply || !replyMessage.trim()}
                      className={sendingReply || !replyMessage.trim() ? 'cursor-not-allowed opacity-70' : ''}
                    >
                      {sendingReply ? (
                        <div className="flex items-center">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                          <span>Sending...</span>
                        </div>
                      ) : (
                        <div className="flex items-center">
                          <Send className="h-4 w-4 mr-1" />
                          <span>Send</span>
                        </div>
                      )}
                    </GlassButton>
                  </div>
                </form>
              </div>
            ) : (
              <div className="p-4 bg-[var(--glass-bg-subtle)] border-t border-[var(--glass-border)]">
                <div className="flex items-center justify-center text-[var(--text-secondary)] text-base">
                  <Check className="mr-2 h-5 w-5 text-[var(--badge-success-fg)]" />
                  <span>This ticket is closed. If you have further questions, please create a new ticket.</span>
                </div>
              </div>
            )}
          </Surface>
        </div>
      </Surface>
    </div>
    </div>
    </DashboardLayout>
  );
};

export default TicketDetail;
