import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowUpDown, Loader2, RefreshCw, RotateCcw, Search, Trash2 } from "lucide-react";
import SummaryApi from "../common";
import { logout } from "../store/userSlice";
import CookieManager from "../utils/cookieManager";
import StorageService from "../utils/storageService";
import { useOnlineStatus } from "../App";
import AdminLayout from "../components/AdminLayout";
import AdminWorkspaceShell, { AdminWorkspaceHeader } from "../components/admin/AdminWorkspaceShell";
import AdminWorkspaceList from "../components/admin/AdminWorkspaceList";
import AdminFilterDropdown from "../components/admin/AdminFilterDropdown";
import { leadStatusLabel } from "../helpers/leadStatuses";

const TYPE_STYLES = {
  client: "bg-emerald-100 text-emerald-800",
  lead: "bg-amber-100 text-amber-800",
};

const formatDate = (value) => {
  if (!value) return "N/A";
  return new Date(value).toLocaleDateString("en-IN");
};

const sortOptions = [
  { value: "deletedDesc", label: "Deleted: Newest" },
  { value: "deletedAsc", label: "Deleted: Oldest" },
  { value: "daysLeftAsc", label: "Days Left: Least" },
  { value: "nameAsc", label: "Name: A-Z" },
];

const AdminTrashPage = () => {
  const user = useSelector((state) => state?.user?.user);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isOnline } = useOnlineStatus();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("deletedDesc");
  const [busyKey, setBusyKey] = useState(null); // `${type}:${id}` while restoring/purging
  const [toPurge, setToPurge] = useState(null);

  const handleLogout = async () => {
    try {
      if (isOnline) {
        const response = await fetch(SummaryApi.logout_user.url, {
          method: SummaryApi.logout_user.method,
          credentials: "include",
        });
        const data = await response.json();
        if (data.success) toast.success(data.message);
      }
      CookieManager.clearAll();
      StorageService.clearUserData();
      dispatch(logout());
      navigate("/");
    } catch (error) {
      console.error("Error during logout:", error);
      toast.error("Logout failed. Please try again.");
    }
  };

  const fetchTrash = async () => {
    try {
      setLoading(true);
      const response = await fetch(SummaryApi.getTrash.url, {
        method: SummaryApi.getTrash.method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const result = await response.json();
      if (!result.success) {
        toast.error(result.message || "Failed to load Trash");
        return;
      }
      setItems(result.data || []);
    } catch (error) {
      console.error("Error fetching Trash:", error);
      toast.error("Error loading Trash");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTrash();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchTrash();
  };

  const handleRestore = async (item) => {
    const key = `${item.type}:${item._id}`;
    if (busyKey) return;
    try {
      setBusyKey(key);
      const response = await fetch(`${SummaryApi.restoreTrash.url}/${item.type}/${item._id}/restore`, {
        method: SummaryApi.restoreTrash.method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const result = await response.json();
      if (!result.success) {
        toast.error(result.message || "Failed to restore");
        return;
      }
      toast.success(item.type === "client" ? "Client restored" : "Lead restored");
      await fetchTrash();
    } catch (error) {
      console.error("Error restoring:", error);
      toast.error("Error restoring");
    } finally {
      setBusyKey(null);
    }
  };

  const confirmPurge = async () => {
    const item = toPurge;
    if (!item || busyKey) return;
    const key = `${item.type}:${item._id}`;
    try {
      setBusyKey(key);
      const response = await fetch(`${SummaryApi.purgeTrash.url}/${item.type}/${item._id}`, {
        method: SummaryApi.purgeTrash.method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const result = await response.json();
      if (!result.success) {
        toast.error(result.message || "Failed to delete permanently");
        return;
      }
      toast.success("Permanently deleted");
      setToPurge(null);
      await fetchTrash();
    } catch (error) {
      console.error("Error purging:", error);
      toast.error("Error deleting permanently");
    } finally {
      setBusyKey(null);
    }
  };

  const displayedItems = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    let result = items;

    if (query) {
      result = result.filter(
        (item) =>
          item.name?.toLowerCase().includes(query) ||
          item.email?.toLowerCase().includes(query) ||
          item.phone?.toLowerCase().includes(query)
      );
    }

    result = [...result].sort((left, right) => {
      const leftName = (left.name || "").toLowerCase();
      const rightName = (right.name || "").toLowerCase();
      const leftDeleted = new Date(left.deletedAt || 0).getTime();
      const rightDeleted = new Date(right.deletedAt || 0).getTime();

      switch (sortBy) {
        case "deletedAsc":
          return leftDeleted - rightDeleted;
        case "daysLeftAsc":
          return (left.daysLeft || 0) - (right.daysLeft || 0);
        case "nameAsc":
          return leftName.localeCompare(rightName, "en", { sensitivity: "base" });
        case "deletedDesc":
        default:
          return rightDeleted - leftDeleted;
      }
    });

    return result;
  }, [items, searchTerm, sortBy]);

  return (
    <AdminLayout user={user} onLogout={handleLogout}>
      <AdminWorkspaceShell>
        <AdminWorkspaceHeader
          icon={Trash2}
          title="Trash"
          subtitle="Deleted leads and clients are kept here for 30 days. Restore anytime, or delete forever. Expired items are removed automatically."
          actions={
            <div className="flex w-full flex-col gap-3 sm:flex-row lg:min-w-[24rem] lg:justify-end">
              <AdminFilterDropdown
                icon={ArrowUpDown}
                label="Sort"
                value={sortBy}
                options={sortOptions}
                onChange={setSortBy}
                ariaLabel="Sort trash"
              />
              <button
                type="button"
                onClick={handleRefresh}
                disabled={loading || refreshing}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
                Refresh
              </button>
            </div>
          }
        />

        <div className="border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div className="relative w-full">
            <Search className="absolute left-3 top-3 text-slate-400" size={18} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search trash by name, email, or phone"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"
            />
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <AdminWorkspaceList
            columns={[
              { label: "Name", className: "col-span-12 lg:col-span-3" },
              { label: "Contact", className: "col-span-6 lg:col-span-3" },
              { label: "Type", className: "col-span-6 lg:col-span-1" },
              { label: "Deleted", className: "col-span-6 lg:col-span-1" },
              { label: "Auto-delete", className: "col-span-6 lg:col-span-1" },
              { label: "Action", className: "col-span-12 text-right lg:col-span-3" },
            ]}
            loading={loading}
            emptyText="Trash is empty. Deleted leads and clients will appear here."
            items={displayedItems}
            footer={`Showing ${displayedItems.length} of ${items.length} items in Trash`}
            renderRow={(item, index) => {
              const key = `${item.type}:${item._id}`;
              const busy = busyKey === key;
              return (
                <div
                  key={key}
                  className={[
                    "grid w-full grid-cols-12 gap-3 px-5 py-4 text-left sm:px-6",
                    index % 2 === 0 ? "bg-white" : "bg-slate-50",
                  ].join(" ")}
                >
                  <div className="col-span-12 lg:col-span-3">
                    <p className="truncate text-base font-bold text-slate-950">{index + 1}. {item.name || "N/A"}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.type === "lead" ? `Lead · ${leadStatusLabel(item.status)}` : "Client"}
                    </p>
                  </div>
                  <div className="col-span-6 lg:col-span-3 lg:flex lg:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{item.email || "N/A"}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">{item.phone || "N/A"}</p>
                    </div>
                  </div>
                  <div className="col-span-6 lg:col-span-1 lg:flex lg:items-center">
                    <span className={["inline-flex rounded-full px-3 py-1 text-xs font-semibold capitalize", TYPE_STYLES[item.type] || TYPE_STYLES.lead].join(" ")}>
                      {item.type}
                    </span>
                  </div>
                  <div className="col-span-6 lg:col-span-1 lg:flex lg:items-center">
                    <p className="text-sm font-semibold text-slate-900">{formatDate(item.deletedAt)}</p>
                  </div>
                  <div className="col-span-6 lg:col-span-1 lg:flex lg:items-center">
                    <span
                      className={[
                        "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
                        item.daysLeft <= 3 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700",
                      ].join(" ")}
                    >
                      {item.daysLeft} day{item.daysLeft === 1 ? "" : "s"} left
                    </span>
                  </div>

                  <div className="col-span-12 flex items-center justify-end gap-2 lg:col-span-3">
                    <button
                      type="button"
                      onClick={() => handleRestore(item)}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {busy ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                      Restore
                    </button>
                    <button
                      type="button"
                      onClick={() => setToPurge(item)}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Trash2 size={14} />
                      Delete Forever
                    </button>
                  </div>
                </div>
              );
            }}
          />
        </div>
      </AdminWorkspaceShell>

      {toPurge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl">
            <div className="px-6 pt-6">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-600">
                <Trash2 size={24} />
              </div>
              <h2 className="mt-4 text-center text-lg font-bold text-slate-900">Delete permanently?</h2>
              <p className="mt-2 text-center text-sm text-slate-600">
                <span className="font-semibold text-slate-900">{toPurge.name || "This record"}</span> will be permanently
                deleted. This action cannot be undone.
              </p>
            </div>
            <div className="flex justify-center gap-3 px-6 py-6">
              <button
                type="button"
                onClick={() => !busyKey && setToPurge(null)}
                disabled={Boolean(busyKey)}
                className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmPurge}
                disabled={Boolean(busyKey)}
                className="inline-flex items-center gap-2 rounded-2xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyKey ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                {busyKey ? "Deleting..." : "Delete Forever"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default AdminTrashPage;
