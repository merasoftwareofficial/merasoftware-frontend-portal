import React, { useState, useContext } from 'react';
import { Phone, Mail, MessageSquare, HelpCircle, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import Context from '../context';
import CreateTicket from '../components/CreateTicket';
import TicketsList from '../components/TicketsList';
import DashboardLayout from '../components/DashboardLayout';
import Surface from '../components/Surface';
import Badge from '../components/Badge';
import { AnimatedSection, getStaggerDelay } from '../components/PageMotion';

const ContactSupportPage = () => {
  const { userDetails } = useContext(Context);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);
  const [user, setUser] = useState(null);
  
  // Common FAQs
  const faqs = [
    {
      question: 'How do I create a new support ticket?',
      answer: 'Click on the "Create New Ticket" button, select a category related to your issue, provide a clear subject, and describe your problem in detail. We’ll update your ticket when there is progress.'
    },
    {
      question: 'How long will it take to get a response?',
      answer: "We aim to respond to all tickets within 24 hours. Complex issues may take longer to resolve, but we'll keep you updated on the progress throughout the process."
    },
    {
      question: 'Can I have multiple tickets open at once?',
      answer: 'No, you can only have one active ticket at a time. This helps us focus on resolving your current issue effectively before addressing new concerns.'
    },
    {
      question: 'How do I know when my ticket status changes?',
      answer: "You can check your ticket status in the 'My Tickets' section. The status will change from Pending to Open when our team starts working on it, and to Closed when it's resolved."
    },
    {
      question: 'How do I provide more information for my ticket?',
      answer: "Simply open your existing ticket and use the reply section at the bottom to add more information or respond to our team's questions."
    }
  ];

  return (
    <DashboardLayout user={user}>
      <div
        className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-4 py-10 sm:px-6 lg:px-8 lg:py-14"
      >
        <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />

        <div className="relative mx-auto max-w-6xl">
          <div className="text-center">
            <Badge tone="neutral">
              <Sparkles className="mr-2 h-3.5 w-3.5" />
              Support
            </Badge>
            <h1 className="mt-5 text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl lg:text-4xl">
              How can we help you?
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-base text-[var(--text-secondary)] sm:text-lg">
              Our dedicated support team is here to assist you with any questions or issues you might encounter.
            </p>
          </div>

          {/* Contact Options */}
          <div className="mt-10 grid grid-cols-1 gap-6 sm:mt-12 md:grid-cols-3">
            <Surface as={AnimatedSection} delay={getStaggerDelay(0)} radius="panel" className="group p-6 text-center">
              <Surface radius="card" className="mx-auto flex h-14 w-14 items-center justify-center">
                <MessageSquare className="h-7 w-7 text-[var(--text-primary)]" strokeWidth={1.75} />
              </Surface>
              <h3 className="relative mt-5 text-xl font-semibold text-[var(--text-primary)]">Support Ticket</h3>
              <p className="relative mt-2 text-base leading-relaxed text-[var(--text-secondary)]">
                Create a support ticket for any issues or questions you have.
              </p>
              <button
                onClick={() => setShowCreateForm(true)}
                className="relative mt-5 inline-flex items-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/20 px-4 py-2 text-base font-medium text-[var(--text-primary)] backdrop-blur-md transition-all duration-300 hover:bg-emerald-500/35"
              >
                Create New Ticket
              </button>
            </Surface>

            <Surface as={AnimatedSection} delay={getStaggerDelay(1)} radius="panel" className="p-6 text-center">
              <Surface radius="card" className="mx-auto flex h-14 w-14 items-center justify-center">
                <Phone className="h-7 w-7 text-[var(--text-primary)]" strokeWidth={1.75} />
              </Surface>
              <h3 className="relative mt-5 text-xl font-semibold text-[var(--text-primary)]">Call Us</h3>
              <p className="relative mt-2 text-base leading-relaxed text-[var(--text-secondary)]">
                For urgent matters, feel free to call our support team directly.
              </p>
              <p className="relative mt-4 text-lg font-semibold text-emerald-400">+91 92565 37003</p>
              <p className="relative mt-1 text-sm text-[var(--text-muted)]">Monday-Friday: 9AM-6PM IST</p>
            </Surface>

            <Surface as={AnimatedSection} delay={getStaggerDelay(2)} radius="panel" className="p-6 text-center">
              <Surface radius="card" className="mx-auto flex h-14 w-14 items-center justify-center">
                <Mail className="h-7 w-7 text-[var(--text-primary)]" strokeWidth={1.75} />
              </Surface>
              <h3 className="relative mt-5 text-xl font-semibold text-[var(--text-primary)]">Email Us</h3>
              <p className="relative mt-2 text-base leading-relaxed text-[var(--text-secondary)]">
                You can also reach our support team via email for general inquiries.
              </p>
              <p className="relative mt-4 text-lg font-semibold text-emerald-400">info@vacomputers.com</p>
              <p className="relative mt-1 text-sm text-[var(--text-muted)]">We typically respond within 24 hours</p>
            </Surface>
          </div>

          {/* Tickets List */}
          <div className="mt-12">
            <TicketsList />
          </div>

          {/* FAQs */}
          <div className="mt-12">
            <div className="mb-6 flex items-center">
              <HelpCircle className="mr-2 h-6 w-6 text-emerald-400" />
              <h2 className="text-xl font-bold text-[var(--text-primary)]">Frequently Asked Questions</h2>
            </div>

            <Surface radius="panel" className="divide-y divide-[var(--divider)] overflow-hidden">
              {faqs.map((faq, index) => (
                <div key={index} className="hover:bg-[var(--glass-bg-subtle)]">
                  <button
                    className="w-full px-6 py-4 text-left focus:outline-none"
                    onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-medium text-[var(--text-primary)]">{faq.question}</h3>
                      {openFaq === index ? (
                        <ChevronUp className="h-5 w-5 text-[var(--text-secondary)]" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-[var(--text-secondary)]" />
                      )}
                    </div>
                  </button>
                  {openFaq === index && (
                    <div className="px-6 pb-4">
                      <p className="text-base text-[var(--text-secondary)]">{faq.answer}</p>
                    </div>
                  )}
                </div>
              ))}
            </Surface>
          </div>
        </div>
      </div>

      {/* Create Ticket Modal */}
      {showCreateForm && (
        <CreateTicket
          show={showCreateForm}
          handleClose={() => setShowCreateForm(false)}
        />
      )}
    </DashboardLayout>
  );
};

export default ContactSupportPage;
