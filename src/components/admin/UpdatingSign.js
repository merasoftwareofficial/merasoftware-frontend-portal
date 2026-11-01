import React from "react";
import { Loader2 } from "lucide-react";

// Says the screen's data is being checked. Fixed to the corner so it stays visible
// when scrolled and never moves the page when it comes and goes.
const UpdatingSign = ({ show }) => (show ? (
  <p role="status" data-updating="1" className="pointer-events-none fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-lg">
    <Loader2 size={13} className="animate-spin" />
    Updating...
  </p>
) : null);

export default UpdatingSign;
