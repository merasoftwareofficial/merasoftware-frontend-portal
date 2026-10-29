import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Layers, Plus } from "lucide-react";
import { ProjectCategoryDialog } from "../components/admin/ProjectCategoryDialog";
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

const formatPrice = (value) => `₹${Number(value).toLocaleString("en-IN")}`;
const usageText = (usage = {}) =>
  `${usage.projects || 0} projects · ${usage.features || 0} features · ${usage.packages || 0} packages · ${usage.plans || 0} plans`;

const Badge = ({ tone = "slate", children }) => {
  const tones = {
    slate: "bg-slate-100 text-slate-600",
    amber: "bg-amber-100 text-amber-800",
    emerald: "bg-emerald-100 text-emerald-800",
  };
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${tones[tone]}`}>{children}</span>;
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
          <ProjectCategoryDialog entry={editing === "new" ? null : editing} nextSortOrder={nextSortOrder}
            onCancel={() => setEditing(null)} onSaved={handleSaved} />
        ) : null}
      </AdminWorkspaceShell>
    </AdminLayout>
  );
};

export default AdminCategoryBasePricePage;
