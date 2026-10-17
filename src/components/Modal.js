import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import Surface from './Surface';

/**
 * The portal's dialog.
 *
 * WHY THIS EXISTS
 * A popup is the most-looked-at card in the product — centred, with everything
 * else pushed behind it — and it was the portal's least maintained surface.
 * Across 17 in-page dialogs and 10 modal components, almost nothing agreed.
 * Eight of the ten components referenced no theme token at all and were built
 * from `bg-white`, `bg-gray-50` and a `bg-blue-600` header bar: a lit slab in
 * dark mode, a colour the portal does not use, and an 8px corner against pages
 * that use 16-32px. The backdrops disagreed too — `bg-black/10` (barely a dim),
 * `bg-black/50`, `bg-black/60`, and `--scrim`, which is `transparent` in two of
 * the three themes.
 *
 * THE REFERENCE
 * This is not a fresh design. WalletDetails' recharge panel is the one dialog
 * in the portal that reads correctly, and it was picked as the shape to copy:
 * an eyebrow above the title, no divider under the header, `p-5 sm:p-7`, a 2rem
 * corner, and — alone among all 17 — a full-width sheet on phones that becomes
 * a centred card from `sm` up.
 *
 * THE PANEL IS GLASS
 * An earlier draft made it solid `--menu-bg`, reasoning that a translucent panel
 * would let page text ghost through. Measuring it showed that reasoning was
 * wrong. Body text on the glass panel, composited over the backdrop over the
 * page, lands at 14.0:1 in dark and 16.1:1 in light — both far above the 7.0
 * AAA threshold, because the backdrop has already darkened (or lightened) the
 * page underneath before the panel's own fill goes over it. Solid measured
 * 17.9:1; the difference is invisible, and it cost the portal its glass.
 *
 * So the panel is `--glass-bg-strong` with `--glass-border-strong`, which is
 * what the reference dialog uses and what every card on the page behind it
 * uses. A dialog and a card are the same material.
 *
 * ADMIN SAFETY
 * New component. The admin modals are separate files and are untouched.
 */

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
};

const Modal = ({
  open = true,
  onClose,
  eyebrow,
  title,
  footer,
  size = 'sm',
  closeOnBackdrop = true,
  children,
  className = '',
}) => {
  // Escape-to-close and a background scroll lock. Neither existed on any of the
  // portal's dialogs, so both are handled once here instead of 17 times.
  useEffect(() => {
    if (!open || !onClose) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      onClick={closeOnBackdrop && onClose ? onClose : undefined}
      role="presentation"
    >
      <Surface
        tone="strong"
        size="card"
        radius="lg"
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        style={{ maxHeight: '92dvh' }}
        onClick={(e) => e.stopPropagation()}
        className={[
          // The sheet sits flush to the bottom edge on phones, so its lower
          // corners are square there and the full 2rem only applies from `sm`
          // up. No fill override: Surface's `strong` tone is the panel.
          'surface-dialog flex max-h-[92vh] w-full flex-col',
          'rounded-b-none sm:rounded-b-[var(--surface-radius-lg)]',
          SIZES[size] || SIZES.sm,
          className,
        ].filter(Boolean).join(' ')}
      >
        {(eyebrow || title || onClose) && (
          // No divider: the reference separates header from body with space, not
          // a line, which is what keeps the dialog from reading as a box inside
          // a box.
          <div className="mb-6 flex shrink-0 items-start justify-between gap-4">
            <div className="min-w-0">
              {eyebrow && (
                <p className="text-sm font-bold uppercase text-[var(--eyebrow-fg)]">{eyebrow}</p>
              )}
              {title && (
                <h2 className="mt-1 text-xl font-bold tracking-tight text-[var(--text-primary)]">
                  {title}
                </h2>
              )}
            </div>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mr-1 shrink-0 rounded-full p-2 text-[var(--text-muted)] transition hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)]"
              >
                <X size={18} />
              </button>
            )}
          </div>
        )}

        {/* Negative margins pull the scroll area back out to the panel's edge so
            a long body scrolls edge to edge, while its own padding keeps the
            content aligned with the header above it. */}
        <div className="-mx-5 min-h-0 flex-1 overflow-y-auto px-5 sm:-mx-7 sm:px-7">
          {children}
        </div>

        {footer && <div className="mt-6 shrink-0">{footer}</div>}
      </Surface>
    </div>, document.body
  );
};

export default Modal;
