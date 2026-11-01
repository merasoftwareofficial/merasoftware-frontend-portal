import React from "react";
import { Loader2 } from "lucide-react";

// Shown in place of data that has not arrived yet; the rest of the screen stays usable.
const DataSpinner = () => (
  <div role="status" data-spinner="1" className="flex flex-col items-center justify-center gap-3 px-5 py-16 text-sm text-slate-500 sm:px-6">
    <Loader2 size={32} className="animate-spin text-emerald-600" />
    Loading...
  </div>
);

export default DataSpinner;
