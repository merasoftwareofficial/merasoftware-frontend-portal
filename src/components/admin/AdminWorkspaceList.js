import React, { useEffect, useRef } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import DataSpinner from "./DataSpinner";
import UpdatingSign from "./UpdatingSign";

/**
 * Renders each row via `renderRow(item, index)` and adds shared row-to-row
 * keyboard navigation on top: ArrowUp/ArrowDown moves focus between rows,
 * and the first row is auto-focused once, right after the initial load
 * finishes (not on every re-render, so typing in a live-filtering search
 * box above the list never gets its focus stolen).
 *
 * Enter-to-open and Delete-to-delete stay in each page's own row
 * `onKeyDown` — only the page knows which action applies to which row
 * (e.g. a converted lead has no Delete). This component only owns moving
 * focus between rows, nothing about what a row does.
 *
 * `focusId` focuses that row instead of the first, for a list returned to. A column with
 * `sortKey` has a clickable heading: `sort` is the current { key, direction }, `onSort` gets the key.
 */
const AdminWorkspaceList = ({ columns, loading, emptyText, items, renderRow, footer, focusId, updating, sort, onSort }) => {
  const rowRefs = useRef([]);
  const hasAutoFocused = useRef(false);

  useEffect(() => {
    if (loading) {
      hasAutoFocused.current = false;
      return;
    }
    if (hasAutoFocused.current) return;
    if (items.length === 0) return;
    hasAutoFocused.current = true;
    const wanted = focusId ? items.findIndex((item) => String(item._id) === String(focusId)) : -1;
    // preventScroll: the list decides its own position, and focus must not move it.
    rowRefs.current[Math.max(wanted, 0)]?.focus({ preventScroll: true });
  }, [loading, items, focusId]);

  const handleContainerKeyDown = (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const currentIndex = rowRefs.current.findIndex((el) => el === document.activeElement);
    if (currentIndex === -1) return;
    const nextIndex = event.key === "ArrowDown" ? currentIndex + 1 : currentIndex - 1;
    const nextRow = rowRefs.current[nextIndex];
    // At the first/last row there's nothing left to move to inside this list —
    // don't swallow the key, let it bubble so an ancestor (e.g. a tab's content
    // container) can decide what "off the edge of this list" means.
    if (!nextRow) return;
    event.preventDefault();
    // This list has handled the key, so it must not reach an ancestor arrow handler as well.
    // preventDefault() only cancels the browser's default action — it does NOT stop bubbling,
    // so without this the event also reached AdminClientWorkspace.js's handleTabContentKeyDown,
    // which read the already-updated document.activeElement and advanced focus a second time:
    // one keypress, two rows, i.e. every other row appeared to be skipped. Deliberately placed
    // after the `!nextRow` guard above, so at the first/last row the key still bubbles and the
    // climb into the tab strip keeps working.
    event.stopPropagation();
    nextRow.focus();
  };

  const sortIcon = (key) => {
    if (sort?.key !== key) return <ArrowUpDown size={12} className="opacity-70" />;
    return sort.direction === "Asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
  };

  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-slate-200">
      <UpdatingSign show={updating && !loading} />
      <div className="grid grid-cols-12 gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 sm:px-6">
        {columns.map((column) => (
          <div key={column.label} className={column.className}>
            {column.sortKey ? (
              <button
                type="button"
                onClick={() => onSort(column.sortKey)}
                aria-label={`Sort by ${column.label}`}
                aria-pressed={sort?.key === column.sortKey}
                // focus-visible: the ring is for keyboard users only, so a mouse click leaves no box.
                className={["inline-flex cursor-pointer items-center gap-1 rounded uppercase tracking-[0.2em] outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-300", sort?.key === column.sortKey ? "font-extrabold text-emerald-600" : "font-semibold text-slate-500 hover:text-emerald-600"].join(" ")}
              >
                {column.label}
                {sortIcon(column.sortKey)}
              </button>
            ) : column.label}
          </div>
        ))}
      </div>

      {loading ? (
        <DataSpinner />
      ) : items.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-slate-500 sm:px-6">{emptyText}</div>
      ) : (
        <div className="divide-y divide-slate-200 bg-white" onKeyDown={handleContainerKeyDown}>
          {(() => {
            rowRefs.current = [];
            let navigableIndex = -1;
            return items.map((item, index) => {
              const row = renderRow(item, index);
              // Non-row entries (e.g. a group-header divider) aren't focusable
              // targets — skip them so arrow-navigation only visits real rows.
              const isNavigable = row.props.tabIndex === 0 || row.type === "button";
              if (!isNavigable) return row;
              navigableIndex += 1;
              const refIndex = navigableIndex;
              return React.cloneElement(row, {
                ref: (el) => {
                  rowRefs.current[refIndex] = el;
                },
              });
            });
          })()}
        </div>
      )}

      {footer && !loading ? <div className="border-t border-slate-200 px-5 py-3 text-sm text-slate-500 sm:px-6">{footer}</div> : null}
    </div>
  );
};

export default AdminWorkspaceList;
