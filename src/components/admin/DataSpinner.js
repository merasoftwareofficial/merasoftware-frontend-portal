import React from "react";
import { Loader2 } from "lucide-react";

// Inline, it stands where a list's rows will be. `floating`, it sits over a whole screen whose
// sections are already showing, and never blocks them: clicks pass through and nothing moves.
const DataSpinner = ({ floating = false }) => (floating ? (
  <div role="status" data-spinner="1" className="pointer-events-none fixed left-1/2 top-1/2 z-40 flex -translate-x-1/2 -translate-y-1/2 lg:left-[calc(50%+9rem)]">
    <Loader2 size={36} className="animate-spin text-emerald-600" />
    {/* Only the spinner shows; screen readers still hear what it means. */}
    <span className="sr-only">Loading...</span>
  </div>
) : (
  <div role="status" data-spinner="1" className="flex flex-col items-center justify-center gap-3 px-5 py-16 text-sm text-slate-500 sm:px-6">
    <Loader2 size={32} className="animate-spin text-emerald-600" />
    Loading...
  </div>
));

export default DataSpinner;
