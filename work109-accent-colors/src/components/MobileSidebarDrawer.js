import React, { useEffect } from 'react';
import { X } from 'lucide-react';

// `themed` is opt-in: the customer portal passes it, the admin panel does not
// and so keeps its original fixed-dark drawer.
const MobileSidebarDrawer = ({ isOpen, onClose, themed = false, children }) => {
  const c = (adminClass, themedClass) => (themed ? themedClass : adminClass);
  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div
        className={`absolute inset-0 ${c("bg-black/50", "modal-backdrop")}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div className={`portal-surface absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col shadow-2xl ${c("bg-slate-950 text-white", "text-[var(--text-primary)]")}`}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close menu"
          className={`absolute left-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full ${c("bg-white/10 text-white hover:bg-white/20", "bg-[var(--glass-bg)] text-[var(--text-primary)] hover:bg-[var(--glass-bg-hover)]")}`}
        >
          <X size={18} />
        </button>
        <div className="h-full overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
};

export default MobileSidebarDrawer;
