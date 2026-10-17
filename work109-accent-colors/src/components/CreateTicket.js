import React, { useState } from 'react';
import { toast } from 'sonner';
import { AlertCircle, MessageSquare } from 'lucide-react';
import SummaryApi from '../common';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { customerReturnState } from '../helpers/customerReturnNavigation';
import Modal from './Modal';
import GlassButton from './GlassButton';

const CreateTicket = ({ show, handleClose, refreshTickets }) => {
  const navigate = useNavigate();
  const [category, setCategory] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasOpenTicket, setHasOpenTicket] = useState(false);
  const [openTicketId, setOpenTicketId] = useState('');
  // const { userDetails } = useContext(Context);
  const userDetails = useSelector((state) => state.user.user);

  // Check if user has any open tickets
  const checkOpenTickets = async () => {
    if (!userDetails?._id) return;
    
    try {
      const response = await fetch(SummaryApi.getUserTickets.url, {
        method: SummaryApi.getUserTickets.method,
        headers: { "Content-Type": "application/json" },
        credentials: 'include'
      });
      
      const result = await response.json();
      
      if (result.success) {
        const openTickets = result.data.tickets.filter(
          ticket => ticket.status === 'pending' || ticket.status === 'open'
        );
        
        if (openTickets.length > 0) {
          setHasOpenTicket(true);
          setOpenTicketId(openTickets[0].ticketId);
        } else {
          setHasOpenTicket(false);
          setOpenTicketId('');
        }
      }
    } catch (error) {
      console.error('Error checking open tickets:', error);
    }
  };

  // Handle ticket creation
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!category || !subject || !description) {
      toast.error('Please fill all required fields');
      return;
    }
    
    setLoading(true);
    
    try {
      const response = await fetch(SummaryApi.createTicket.url, {
        method: SummaryApi.createTicket.method,
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({
          category,
          subject,
          description
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        toast.success('Ticket created successfully!');
        setCategory('');
        setSubject('');
        setDescription('');
        
        if (refreshTickets) {
          refreshTickets();
        }
        
        handleClose();
      } else {
        if (result.ticketId) {
          setHasOpenTicket(true);
          setOpenTicketId(result.ticketId);
        }
        toast.error(result.message || 'Error creating ticket');
      }
    } catch (error) {
      console.error('Error creating ticket:', error);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Reset form fields
  const resetForm = () => {
    setCategory('');
    setSubject('');
    setDescription('');
  };

  // Effect to check for open tickets when the modal shows
  React.useEffect(() => {
    if (show && userDetails?._id) {
      checkOpenTickets();
    }
  }, [show, userDetails]);

  const closeModal = () => {
    resetForm();
    handleClose();
  };

  const openExistingTicket = () => {
    handleClose();
    navigate(`/support-tickets/${openTicketId}`, { state: customerReturnState('/support') });
  };

  const fieldClassName = 'w-full rounded-xl border border-[var(--glass-border-strong)] bg-[var(--glass-bg-subtle)] px-3 py-2.5 text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] transition focus:border-[var(--badge-success-border)] focus:outline-none focus:ring-4 focus:ring-[var(--badge-success-bg)]';

  return (
    // Was a hand-written dialog. Two things were wrong beyond the shell:
    //
    //   1. The scrim was `bg-[var(--glass-bg-subtle)]` — a *surface* fill, not a
    //      backdrop. It never darkened the page behind the dialog in any theme.
    //      `.modal-backdrop` is the portal's one scrim.
    //   2. `text-amber-100 on bg-amber-500/10` measured 1.03:1 on the light
    //      dialog (13.83:1 on the dark one, which is why it read as fine). The
    //      emerald icon tile was the same story at 1.11:1.
    //
    // The buttons are the reverse of the usual bug: `bg-emerald-500` with
    // `text-[var(--text-primary)]` is 7.04:1 in light but only 2.42:1 in DARK,
    // because --text-primary goes near-white there. GlassButton's primary
    // variant is the inverted-ink fill, which is correct in every theme.
    <Modal
      open={show}
      onClose={loading ? undefined : closeModal}
      size="md"
      eyebrow="Support"
      title="Create support ticket"
      footer={!hasOpenTicket && (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <GlassButton onClick={closeModal} disabled={loading} strong className="disabled:opacity-50">
            Cancel
          </GlassButton>
          <GlassButton
            type="submit"
            form="create-ticket-form"
            variant="primary"
            disabled={loading}
            className="disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading && <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
            {loading ? 'Submitting\u2026' : 'Submit ticket'}
          </GlassButton>
        </div>
      )}
    >
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border-[length:var(--glass-border-width)] border-[var(--glass-border-strong)] bg-[var(--glass-bg)] text-[var(--text-primary)]">
          <MessageSquare className="h-5 w-5" />
        </span>
        <p className="text-sm text-[var(--text-secondary)]">
          Describe the issue and our team will review it.
        </p>
      </div>

      {hasOpenTicket ? (
        <div className="badge badge-pending rounded-2xl p-4">
          <div className="flex items-center gap-2 font-semibold">
            <AlertCircle className="h-5 w-5" />
            You already have an open ticket
          </div>
          <p className="mt-2 text-sm opacity-90">
            Please wait for resolution before creating a new ticket.
          </p>
          <GlassButton variant="primary" onClick={openExistingTicket} className="mt-4">
            View existing ticket
          </GlassButton>
        </div>
      ) : (
        <form id="create-ticket-form" className="space-y-4" onSubmit={handleSubmit}>
          <label className="block"><span className="mb-1.5 block text-sm font-semibold text-[var(--text-secondary)]">Category *</span><select value={category} onChange={(event) => setCategory(event.target.value)} required className={fieldClassName}><option value="">Select a category</option><option value="Billing">Billing issue</option><option value="Technical">Technical problem</option><option value="Product">Product question</option><option value="Account">Account management</option><option value="Other">Other</option></select></label>
          <label className="block"><span className="mb-1.5 block text-sm font-semibold text-[var(--text-secondary)]">Subject *</span><input type="text" placeholder="Brief summary of your issue" value={subject} onChange={(event) => setSubject(event.target.value)} required className={fieldClassName} /></label>
          <label className="block"><span className="mb-1.5 block text-sm font-semibold text-[var(--text-secondary)]">Description *</span><textarea rows={5} placeholder="Please describe your issue in detail" value={description} onChange={(event) => setDescription(event.target.value)} required className={fieldClassName} /></label>
        </form>
      )}
    </Modal>
  );
};

export default CreateTicket;
