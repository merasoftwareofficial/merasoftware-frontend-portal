import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowUpDown, RefreshCw, Search, Users2 } from "lucide-react";
import SummaryApi from "../common";
import { logout } from "../store/userSlice";
import CookieManager from "../utils/cookieManager";
import StorageService from "../utils/storageService";
import { useOnlineStatus } from "../App";
import AdminLayout from "../components/AdminLayout";
import AdminWorkspaceShell, { AdminWorkspaceHeader } from "../components/admin/AdminWorkspaceShell";
import { adminReturnState } from "../helpers/adminReturnNavigation";
import AdminWorkspaceList from "../components/admin/AdminWorkspaceList";
import AdminDateTime from "../components/admin/AdminDateTime";
import AdminFilterDropdown from "../components/admin/AdminFilterDropdown";

const sortOptions = [
  { value: "lastUpdatedDesc", label: "Last Updated: Newest" },
  { value: "lastUpdatedAsc", label: "Last Updated: Oldest" },
  { value: "nameAsc", label: "Name: A-Z" },
  { value: "nameDesc", label: "Name: Z-A" },
];

const getClientLastUpdated = (client) => client?.latestActivityAt || client?.createdAt || null;

const AdminClientsPage = () => {
  const user = useSelector((state) => state?.user?.user);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isOnline } = useOnlineStatus();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("lastUpdatedDesc");

  const handleLogout = async () => {
    try {
      if (isOnline) {
        const response = await fetch(SummaryApi.logout_user.url, {
          method: SummaryApi.logout_user.method,
          credentials: "include",
        });

        const data = await response.json();
        if (data.success) {
          toast.success(data.message);
        }
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

  const fetchClients = async () => {
    try {
      setLoading(true);
      const response = await fetch(SummaryApi.adminClients.url, {
        method: SummaryApi.adminClients.method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      const result = await response.json();
      if (!result.success) {
        toast.error(result.message || "Failed to load clients");
        return;
      }

      const customerList = (result.data || []).sort(
        (left, right) => new Date(right.latestActivityAt || right.createdAt || 0) - new Date(left.latestActivityAt || left.createdAt || 0)
      );

      setClients(customerList);
    } catch (error) {
      console.error("Error fetching clients:", error);
      toast.error("Error loading clients");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchClients();
  };

  // The workspace is reachable from here and from the dashboard, so it is told where
  // Back should return to rather than being left to guess from history.
  // `client` stays as the workspace's fallback display data — unrelated to navigation.
  const handleClientOpen = (client) => {
    if (!client?._id) return;
    navigate(`/admin-panel/clients/${client._id}`, {
      state: { client, ...adminReturnState("/admin-panel/clients") },
    });
  };

  const displayedClients = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    let result = clients;

    if (query) {
      result = result.filter((client) => {
        return (
          client.name?.toLowerCase().includes(query) ||
          client.email?.toLowerCase().includes(query) ||
          client.phone?.toLowerCase().includes(query)
        );
      });
    }

    result = [...result].sort((left, right) => {
      const leftName = (left.name || "").toLowerCase();
      const rightName = (right.name || "").toLowerCase();
      const leftUpdated = new Date(getClientLastUpdated(left) || 0).getTime();
      const rightUpdated = new Date(getClientLastUpdated(right) || 0).getTime();

      switch (sortBy) {
        case "lastUpdatedAsc":
          return leftUpdated - rightUpdated || leftName.localeCompare(rightName, "en", { sensitivity: "base" });
        case "nameAsc":
          return leftName.localeCompare(rightName, "en", { sensitivity: "base" });
        case "nameDesc":
          return rightName.localeCompare(leftName, "en", { sensitivity: "base" });
        case "lastUpdatedDesc":
        default:
          return rightUpdated - leftUpdated || leftName.localeCompare(rightName, "en", { sensitivity: "base" });
      }
    });

    return result;
  }, [clients, searchTerm, sortBy]);

  return (
    <AdminLayout
      user={user}
      onLogout={handleLogout}
    >
      <AdminWorkspaceShell>
        <AdminWorkspaceHeader
          icon={Users2}
          title="Clients"
          subtitle="Customer list ordered by the latest verified client activity."
          actions={
            <div className="flex w-full flex-col gap-3 sm:flex-row lg:min-w-[23rem] lg:justify-end">
              <AdminFilterDropdown
                icon={ArrowUpDown}
                label="Sort"
                value={sortBy}
                options={sortOptions}
                onChange={setSortBy}
                ariaLabel="Sort clients"
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
              placeholder="Search clients by name, email, or phone"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"
            />
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <AdminWorkspaceList
            columns={[
              { label: "Client", className: "col-span-12 lg:col-span-3" },
              { label: "Contact", className: "col-span-6 lg:col-span-2" },
              { label: "Status", className: "col-span-6 lg:col-span-2" },
              { label: "Joined", className: "col-span-6 lg:col-span-2" },
              { label: "Updated", className: "col-span-6 lg:col-span-2" },
              { label: "Open", className: "col-span-6 text-right lg:col-span-1" },
            ]}
            loading={loading}
            emptyText="No clients found."
            items={displayedClients}
            footer={`Showing ${displayedClients.length} of ${clients.length} clients`}
            renderRow={(client, index) => (
              <button
                key={client._id}
                type="button"
                onClick={() => handleClientOpen(client)}
                className={[
                  "grid w-full grid-cols-12 gap-3 px-5 py-4 text-left transition outline-none hover:bg-slate-100 focus:bg-slate-100 sm:px-6",
                  index % 2 === 0 ? "bg-white" : "bg-slate-50",
                ].join(" ")}
              >
                <div className="col-span-12 lg:col-span-3">
                  <p className="truncate text-base font-bold text-slate-950">{index + 1}. {client.name || "N/A"}</p>
                </div>
                <div className="col-span-6 lg:col-span-2 lg:flex lg:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{client.email || "N/A"}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{client.phone || "N/A"}</p>
                  </div>
                </div>
                <div className="col-span-6 lg:col-span-2 lg:flex lg:items-center">
                  <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                    {client.status || "Active"}
                  </span>
                </div>
                <div className="col-span-6 lg:col-span-2 lg:flex lg:items-center">
                  <AdminDateTime value={client.createdAt} />
                </div>
                <div className="col-span-6 lg:col-span-2 lg:flex lg:items-center">
                  <AdminDateTime value={getClientLastUpdated(client)} title={`IST · ${(client.latestActivitySource || "client_created").replaceAll("_", " ")}`} />
                </div>
                <div className="col-span-6 flex items-center justify-end lg:col-span-1">
                  <span className="text-xs font-semibold text-slate-500">Open</span>
                </div>
              </button>
            )}
          />
        </div>
      </AdminWorkspaceShell>
    </AdminLayout>
  );
};

export default AdminClientsPage;
