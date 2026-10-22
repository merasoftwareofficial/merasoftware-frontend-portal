import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Layers, Plus, X } from "lucide-react";
import SummaryApi from "../common";
import { logout } from "../store/userSlice";
import CookieManager from "../utils/cookieManager";
import StorageService from "../utils/storageService";
import AdminLayout from "../components/AdminLayout";
import AdminWorkspaceShell, { AdminWorkspaceHeader } from "../components/admin/AdminWorkspaceShell";
import useProjectCategories from "../hooks/useProjectCategories";

// Project Categories — the admin side of the category SSOT (backend helpers/projectCategories.js).
// A category's key is permanent (orders store it), so it is set once and categories are archived,
// never deleted. Locked categories feed the customer website questionnaire and stay active.

const formInputClassName =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-black outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-500";
const formLabelClassName = "mb-1.5 block text-base font-semibold text-slate-700";
const hintClassName = "mt-1.5 text-sm text-slate-500";

const KEY_PATTERN = /^[a-z][a-z0-9_]{2,39}$/;
const keyFromName = (name) => name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^[^a-z]+|_+$/g, "").slice(0, 40);
const formatPrice = (value) => `₹${Number(value).toLocaleString("en-IN")}`;
const usageText = (usage = {}) =>
  `${usage.projects || 0} projects · ${usage.features || 0} features · ${usage.packages || 0} packages`;

const Badge = ({ tone = "slate", children }) => {
  const tones = {
    slate: "bg-slate-100 text-slate-600",
    amber: "bg-amber-100 text-amber-800",
    emerald: "bg-emerald-100 text-emerald-800",
  };
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${tones[tone]}`}>{children}</span>;
};

const CategoryForm = ({ entry, nextSortOrder, onCancel, onSaved }) => {
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
      onSaved?.();
    } catch (error) {
      toast.error(error.message || "Failed to save category");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-lg font-bold text-slate-900">{creating ? "New project category" : entry.label}</h3>
        <button
          type="button"
          onClick={onCancel}
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

const AdminCategoryBasePricePage = () => {
  const user = useSelector((state) => state?.user?.user);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { categories, loading, error, reload } = useProjectCategories("admin");
  const [editing, setEditing] = useState(null); // null = closed, "new" = create, otherwise the entry
  const [showArchived, setShowArchived] = useState(false);

  const archivedCount = categories.filter((entry) => entry.status === "archived").length;
  const visible = categories.filter((entry) => showArchived || entry.status !== "archived");
  const nextSortOrder = Math.min(9999, categories.reduce((max, entry) => Math.max(max, entry.sortOrder < 9999 ? entry.sortOrder : 0), 0) + 1);

  const handleSaved = () => {
    setEditing(null);
    reload();
  };

  const handleLogout = async () => {
    try {
      const response = await fetch(SummaryApi.logout_user.url, {
        method: SummaryApi.logout_user.method,
        credentials: "include",
      });
      const result = await response.json();
      if (result.success) toast.success(result.message);
    } catch (logoutError) {
      console.error("Error during logout:", logoutError);
      toast.error("Logout failed. Please try again.");
    } finally {
      CookieManager.clearAll();
      StorageService.clearUserData();
      dispatch(logout());
      navigate("/");
    }
  };

  return (
    <AdminLayout user={user} onLogout={handleLogout}>
      <AdminWorkspaceShell>
        <AdminWorkspaceHeader
          icon={Layers}
          title="Project Categories"
          subtitle="Every project category in one place: name, base price, timeline start and who can order it. Used by project creation, features, packages and website offers."
        />

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
          >
            <Plus size={17} />
            Add Category
          </button>
          {archivedCount ? (
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
              Show archived ({archivedCount})
            </label>
          ) : null}
        </div>

        <div className="p-5 sm:p-6">
          {loading ? (
            <p className="text-sm text-slate-500">Loading categories...</p>
          ) : error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {error}{" "}
              <button type="button" className="font-semibold underline" onClick={reload}>Try again</button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <div className="hidden grid-cols-12 gap-3 bg-slate-100 px-5 py-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-600 md:grid">
                <div className="col-span-5">Category</div>
                <div className="col-span-2">Base Price</div>
                <div className="col-span-4">Used in</div>
                <div className="col-span-1 text-right">Open</div>
              </div>
              {visible.map((entry, index) => (
                <button
                  key={entry.category}
                  type="button"
                  onClick={() => setEditing(entry)}
                  className={`grid w-full grid-cols-1 gap-2 px-5 py-4 text-left transition hover:bg-slate-100 md:grid-cols-12 md:items-center md:gap-3 ${index % 2 === 0 ? "bg-white" : "bg-slate-50"} ${entry.status === "archived" ? "opacity-60" : ""}`}
                >
                  <div className="md:col-span-5">
                    <p className="text-sm font-semibold text-slate-900">{entry.label}</p>
                    <p className="mt-0.5 font-mono text-xs text-slate-500">{entry.category}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {entry.status === "archived" ? <Badge>Archived</Badge> : null}
                      {entry.locked ? <Badge>Locked</Badge> : null}
                      <Badge tone={entry.customerSelectable ? "emerald" : "slate"}>{entry.customerSelectable ? "Customers can order" : "Admin only"}</Badge>
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    {entry.configured
                      ? <p className="text-sm font-semibold text-slate-900">{formatPrice(entry.basePrice)}</p>
                      : <Badge tone="amber">Not configured</Badge>}
                  </div>
                  <div className="md:col-span-4">
                    <p className="text-xs text-slate-500">{usageText(entry.usage)}</p>
                  </div>
                  <div className="hidden justify-end md:col-span-1 md:flex">
                    <span className="text-xs font-semibold text-slate-500">Open</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {editing ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/40 p-4">
            <div className="my-auto w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
              <CategoryForm
                entry={editing === "new" ? null : editing}
                nextSortOrder={nextSortOrder}
                onCancel={() => setEditing(null)}
                onSaved={handleSaved}
              />
            </div>
          </div>
        ) : null}
      </AdminWorkspaceShell>
    </AdminLayout>
  );
};

export default AdminCategoryBasePricePage;
