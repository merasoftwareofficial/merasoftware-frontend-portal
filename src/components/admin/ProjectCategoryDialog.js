import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { X } from "lucide-react";
import SummaryApi from "../../common";
const formInputClassName =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-black outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-500";
const formLabelClassName = "mb-1.5 block text-base font-semibold text-slate-700";
const hintClassName = "mt-1.5 text-sm text-slate-500";

const KEY_PATTERN = /^[a-z][a-z0-9_]{2,39}$/;
const keyFromName = (name) => name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^[^a-z]+|_+$/g, "").slice(0, 40);
export const ProjectCategoryForm = ({ entry, nextSortOrder, onCancel, onSaved }) => {
  const creating = !entry;
  const locked = Boolean(entry?.locked);
  const [label, setLabel] = useState(entry?.label ?? "");
  const [key, setKey] = useState(entry?.category ?? "");
  const [keyEdited, setKeyEdited] = useState(false);
  const [basePrice, setBasePrice] = useState(entry?.basePrice ?? "");
  const [description, setDescription] = useState(entry?.description ?? "");
  const [startingNodeTitle, setStartingNodeTitle] = useState(entry?.startingNodeTitle ?? "");
  const [sortOrder, setSortOrder] = useState(entry?.sortOrder ?? nextSortOrder);
  const [customerSelectable, setCustomerSelectable] = useState(entry?.customerSelectable ?? false);
  const [status, setStatus] = useState(entry?.status ?? "active");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLabelChange = (value) => {
    setLabel(value);
    // The key follows the name until the admin edits it; it can never change after creation.
    if (creating && !keyEdited) setKey(keyFromName(value));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!label.trim()) return toast.error("Enter a category name.");
    if (creating && !KEY_PATTERN.test(key)) return toast.error("Key must be 3–40 lowercase letters, numbers or underscores, starting with a letter.");
    const price = basePrice === "" || basePrice === null ? null : Number(basePrice);
    if (price !== null && (!Number.isFinite(price) || price < 0)) return toast.error("Base price must be zero or more, or left empty.");
    const order = Number(sortOrder);
    if (!Number.isInteger(order) || order < 0 || order > 9999) return toast.error("Display order must be a whole number from 0 to 9999.");

    setIsSubmitting(true);
    try {
      const response = await fetch(SummaryApi.updateCategoryBasePrice.url, {
        method: SummaryApi.updateCategoryBasePrice.method.toUpperCase(),
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creating,
          category: key,
          label: label.trim(),
          basePrice: price,
          description: description.trim(),
          startingNodeTitle: startingNodeTitle.trim(),
          sortOrder: order,
          customerSelectable,
          status,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Failed to save category");
      toast.success(creating ? "Category created." : "Category saved.");
      onSaved?.(result.data);
    } catch (error) {
      toast.error(error.message || "Failed to save category");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form aria-busy={isSubmitting} onSubmit={handleSubmit}>
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-lg font-bold text-slate-900">{creating ? "New project category" : entry.label}</h3>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-white hover:text-slate-700"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={formLabelClassName} htmlFor="category-name">Category name</label>
          <input id="category-name" className={formInputClassName} maxLength={60} value={label} onChange={(event) => handleLabelChange(event.target.value)} placeholder="e.g. SEO Services" />
        </div>

        <div className="sm:col-span-2">
          <label className={formLabelClassName} htmlFor="category-key">Key</label>
          <input
            id="category-key"
            className={`${formInputClassName} font-mono`}
            maxLength={40}
            value={key}
            disabled={!creating}
            onChange={(event) => { setKey(event.target.value); setKeyEdited(true); }}
          />
          <p className={hintClassName}>
            {creating ? "Permanent — projects, offers and packages store this. It cannot be changed later." : "Permanent. Rename the category above instead."}
          </p>
        </div>

        <div>
          <label className={formLabelClassName} htmlFor="category-price">Base price (₹)</label>
          <input id="category-price" type="number" min={0} step="0.01" className={formInputClassName} value={basePrice ?? ""} onChange={(event) => setBasePrice(event.target.value)} placeholder="Not configured" />
          <p className={hintClassName}>Leave empty if not decided. Customers cannot order a category without a price.</p>
        </div>

        <div>
          <label className={formLabelClassName} htmlFor="category-order">Display order</label>
          <input id="category-order" type="number" min={0} max={9999} step={1} className={formInputClassName} value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} />
          <p className={hintClassName}>Lower numbers appear first in every list.</p>
        </div>

        <div className="sm:col-span-2">
          <label className={formLabelClassName} htmlFor="category-description">Description</label>
          <textarea id="category-description" className={formInputClassName} rows={3} maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Shown to admin when this category is selected" />
        </div>

        <div className="sm:col-span-2">
          <label className={formLabelClassName} htmlFor="category-node">Starting node title</label>
          <input id="category-node" className={formInputClassName} maxLength={120} value={startingNodeTitle} onChange={(event) => setStartingNodeTitle(event.target.value)} placeholder="Project Started" />
          <p className={hintClassName}>First step on the project timeline, for both admin-created and customer projects.</p>
        </div>

        <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 h-4 w-4 rounded border-slate-300" checked={customerSelectable} disabled={locked} onChange={(event) => setCustomerSelectable(event.target.checked)} />
            <span>
              <span className="block text-base font-semibold text-slate-800">Customers can order this online</span>
              <span className="block text-sm text-slate-500">Off = only admin can create projects in this category.</span>
            </span>
          </label>
          <div className="mt-4">
            <label className={formLabelClassName} htmlFor="category-status">Status</label>
            <select id="category-status" className={formInputClassName} value={status} disabled={locked} onChange={(event) => setStatus(event.target.value)}>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
            <p className={hintClassName}>
              {locked
                ? "Locked: the customer website questionnaire sends customers to this category, so it stays active, open to customers and priced."
                : "Archived categories are not offered for new projects. Existing projects keep their category."}
            </p>
            {!creating && status === "archived" && entry.status !== "archived" && entry.usage?.projects ? (
              <p className="mt-1.5 text-sm text-amber-700">{entry.usage.projects} existing project(s) keep this category.</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? "Saving..." : creating ? "Create category" : "Save"}
        </button>
      </div>
    </form>
  );
};

export function ProjectCategoryDialog(props) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.querySelector('input, button')?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  return createPortal(<div ref={ref} onKeyDown={event => {
    event.stopPropagation();
    if (event.key === "Escape" && !ref.current?.querySelector('form[aria-busy="true"]')) { event.preventDefault(); props.onCancel(); }
    if (event.key === "Tab") {
      const controls = [...ref.current.querySelectorAll('input:not(:disabled), button:not(:disabled), select:not(:disabled), textarea:not(:disabled)')];
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }} role="dialog" aria-modal="true" aria-label="Project category" className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-900/40 p-4">
    <div className="my-auto w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl"><ProjectCategoryForm {...props} /></div>
  </div>, document.body);
}
