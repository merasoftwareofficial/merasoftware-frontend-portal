import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * The portal's one loading mark. Use it wherever something is being fetched or
 * done; the portal does not use skeleton loaders.
 *
 * - `inline` (default): next to text or inside a button. It takes the text's
 *   colour, so it works on any button.
 * - `page`: a whole page or panel is waiting (GlassPageState, DashboardLayout).
 *
 * Its look, the 120ms fade-in and the reduced-motion rule are `.portal-spinner`
 * in src/index.css, shared with the boot loader in public/index.html. The words
 * next to it say what is happening, so the mark itself is hidden from screen readers.
 */
const SIZES = { inline: 'h-4 w-4', page: 'h-10 w-10 portal-spinner--accent' };

const Spinner = ({ size = 'inline', className = '' }) => (
  <Loader2 aria-hidden="true" className={`portal-spinner shrink-0 ${SIZES[size] || SIZES.inline} ${className}`} />
);

export default Spinner;
