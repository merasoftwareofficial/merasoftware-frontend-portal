import React from 'react';
import { Link } from 'react-router-dom';

/**
 * One nav row in the customer sidebar — the single place that decides what a
 * nav item looks like.
 *
 * WHY THIS EXISTS
 * The two lists (Quick Links, More) were written out separately and had drifted
 * apart on five properties at once: padding, font weight, icon size, resting
 * text token, and — the one that actually mattered — the active treatment.
 * Quick Links painted its selected row solid emerald; More only nudged the
 * glass a shade, which was near-invisible in light mode and weak in dark. The
 * header, meanwhile, marks the same page with a solid emerald pill, so one page
 * was being announced two different ways on one screen.
 *
 * So: selection is defined once, here, and both lists get it. The Quick/More
 * distinction survives only as `variant`, which touches the *resting* look —
 * never the selected one.
 *
 * Colours come from tokens (`--nav-active-*`), because emerald-500 that reads
 * well on the dark ground glares on the light page and drops white text under
 * 4.5:1. index.css holds the per-theme values.
 */

const VARIANTS = {
  primary: {
    row: 'px-4 py-3 text-base font-semibold',
    icon: 18,
    restingText: 'text-[var(--text-primary)]',
  },
  secondary: {
    row: 'px-4 py-2.5 text-base font-medium',
    icon: 16,
    restingText: 'text-[var(--text-secondary)]',
  },
};

const SidebarNavItem = ({ to, label, icon: Icon, active, variant = 'primary', onNavigate }) => {
  const { row, icon, restingText } = VARIANTS[variant] || VARIANTS.primary;

  return (
    <Link
      to={to}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={[
        'group flex items-center gap-3 rounded-2xl transition-all',
        row,
        active
          ? 'bg-[var(--nav-active-bg)] text-[var(--nav-active-fg)] shadow-[var(--nav-active-shadow)]'
          : `bg-[var(--glass-bg-subtle)] ${restingText} hover:bg-[var(--glass-bg-hover)]`,
      ].join(' ')}
    >
      <Icon size={icon} className="shrink-0" />
      <span className="flex-1">{label}</span>
    </Link>
  );
};

export default SidebarNavItem;
