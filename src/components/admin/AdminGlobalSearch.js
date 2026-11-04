import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X } from "lucide-react";
import SummaryApi from "../../common";

const AdminGlobalSearch = ({ onNavigate }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  // Debounced search
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`${SummaryApi.adminGlobalSearch.url}?q=${encodeURIComponent(trimmed)}`, {
          method: SummaryApi.adminGlobalSearch.method,
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
        });
        const result = await response.json();
        if (result.success) {
          setResults(result.data || []);
        }
      } catch (error) {
        if (error.name !== "AbortError") {
          console.error("Global search error:", error);
        }
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (item) => {
    const path = item.type === "client"
      ? `/admin-panel/clients/${item._id}`
      : `/admin-panel/leads/${item._id}`;
    setQuery("");
    setResults([]);
    setOpen(false);
    if (onNavigate) onNavigate();
    navigate(path);
  };

  const clearQuery = () => {
    setQuery("");
    setResults([]);
  };

  const showDropdown = open && query.trim().length > 0;

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Search leads & clients"
          className="w-full rounded-2xl border border-slate-700 bg-slate-900/70 py-2.5 pl-9 pr-8 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-400/50 focus:bg-slate-900"
        />
        {query ? (
          <button
            type="button"
            onClick={clearQuery}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-500 transition hover:bg-slate-800 hover:text-slate-300"
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        ) : null}
      </div>

      {showDropdown ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-80 overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-2 shadow-2xl">
          {loading ? (
            <p className="px-3 py-3 text-xs text-slate-400">Searching...</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-3 text-xs text-slate-400">No matches found.</p>
          ) : (
            results.map((item) => (
              <button
                key={`${item.type}-${item._id}`}
                type="button"
                onClick={() => handleSelect(item)}
                className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-800"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{item.name || item.businessName || "Unnamed"}</p>
                  {item.name && item.businessName ? <p className="truncate text-xs font-medium text-slate-300">{item.businessName}</p> : null}
                  <p className="truncate text-xs text-slate-400">{item.email || item.phone || "—"}</p>
                </div>
                <span
                  className={[
                    "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                    item.type === "client"
                      ? "bg-emerald-500/15 text-emerald-300"
                      : "bg-amber-500/15 text-amber-300",
                  ].join(" ")}
                >
                  {item.type === "client" ? "Client" : "Lead"}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
};

export default AdminGlobalSearch;
