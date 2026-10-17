import React from 'react';
import { Link } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';

// `themed` is opt-in: only the customer portal passes it, so the admin panel
// keeps its original fixed-dark bar.
const MobileBottomNav = ({ tabs, onMoreClick, themed = false }) => {
  return (
    <nav className={`fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur lg:hidden ${themed ? "border-[var(--glass-border)] bg-[var(--header-bg)]" : "border-white/10 bg-slate-950/95"}`}>
      <div className="grid grid-cols-5">
        {tabs.map(({ to, label, icon: Icon, active }) => (
          <Link
            key={label}
            to={to}
            className={[
              'flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
              active
                ? (themed ? 'text-[var(--nav-active-bg)]' : 'text-emerald-400')
                : (themed ? 'text-[var(--text-muted)] hover:text-[var(--text-primary)]' : 'text-slate-400 hover:text-white'),
            ].join(' ')}
          >
            <Icon size={20} className="shrink-0" />
            <span className="truncate">{label}</span>
          </Link>
        ))}
        <button
          type="button"
          onClick={onMoreClick}
          className={`flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${themed ? "text-[var(--text-muted)] hover:text-[var(--text-primary)]" : "text-slate-400 hover:text-white"}`}
        >
          <MoreHorizontal size={20} className="shrink-0" />
          <span>More</span>
        </button>
      </div>
    </nav>
  );
};

export default MobileBottomNav;
