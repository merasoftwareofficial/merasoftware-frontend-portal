import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { RefreshCw, Search, Users2 } from "lucide-react";
import { useResource } from '../hooks/useResource';
import { openedRow, rememberOpenedRow, useListReturn } from '../hooks/useListReturn';
import { CLIENT_CACHE } from '../utils/resourceCache';
import SummaryApi from "../common";
import AdminWorkspaceShell, { AdminWorkspaceHeader } from "../components/admin/AdminWorkspaceShell";
import { adminReturnState, getAdminPath } from "../helpers/adminReturnNavigation";
import AdminWorkspaceList from "../components/admin/AdminWorkspaceList";
import AdminDateTime from "../components/admin/AdminDateTime";
import { DEFAULT_SORT, nextSort, parseSort, sortRows, timeValue } from "../helpers/adminListSort";

const getClientLastUpdated = (client) => client?.latestActivityAt || client?.createdAt || null;

const sortColumns = [
  { key: "name", first: "Asc", value: (client) => client.name || "" },
  { key: "contact", first: "Asc", value: (client) => client.email || "" },
  { key: "status", first: "Asc", value: (client) => client.status || "Active" },
  { key: "added", first: "Desc", value: (client) => timeValue(client.createdAt) },
  { key: "lastUpdated", first: "Desc", value: (client) => timeValue(getClientLastUpdated(client)) },
];

const AdminClientsPage = () => {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const searchTerm = params.get('q') || '';
  const sort = parseSort(params.get('sort'), sortColumns);
  const updateParam = (name, value) => setParams(previous => {
    const next = new URLSearchParams(previous);
    if (value) next.set(name, value); else next.delete(name);
    return next;
  }, { replace: true, preventScrollReset: true });
  const setSearchTerm = value => updateParam('q', value);
  const sortByColumn = key => {
    const next = nextSort(sort, sortColumns.find(column => column.key === key));
    updateParam('sort', next === DEFAULT_SORT ? '' : next);
  };

  const { loading, refreshing, error, expired, refresh: handleRefresh } = useResource(SummaryApi.adminClients.url, next => setClients(Array.isArray(next) ? next : []), { cache: CLIENT_CACHE });
  useListReturn(!loading);
  useEffect(() => { if (error) toast.error(error); }, [error]);

  // The workspace is reachable from here and from the dashboard, so it is told where
  // Back should return to rather than being left to guess from history.
  // `client` stays as the workspace's fallback display data — unrelated to navigation.
  const handleClientOpen = (client) => {
    if (!client?._id) return;
    rememberOpenedRow("/admin-panel/clients", client._id);
    navigate(`/admin-panel/clients/${client._id}`, {
      state: { client, ...adminReturnState(getAdminPath(location)) },
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

    return sortRows(result, sort, sortColumns);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `sort` is rebuilt from these two strings each render.
  }, [clients, searchTerm, sort.key, sort.direction]);

  return (
    <>
      <AdminWorkspaceShell>
        <AdminWorkspaceHeader
          icon={Users2}
          title="Clients"
          subtitle="Customer list ordered by the latest verified client activity."
          actions={
            <div className="flex w-full flex-col gap-3 sm:flex-row lg:min-w-[23rem] lg:justify-end">
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
              { label: "Client", sortKey: "name", className: "col-span-12 lg:col-span-3" },
              { label: "Contact", sortKey: "contact", className: "col-span-6 lg:col-span-2" },
              { label: "Status", sortKey: "status", className: "col-span-6 lg:col-span-2" },
              { label: "Joined", sortKey: "added", className: "col-span-6 lg:col-span-2" },
              { label: "Updated", sortKey: "lastUpdated", className: "col-span-6 lg:col-span-2" },
              { label: "Open", className: "col-span-6 text-right lg:col-span-1" },
            ]}
            loading={loading}
            updating={refreshing}
            sort={sort}
            onSort={sortByColumn}
            focusId={openedRow("/admin-panel/clients")}
            emptyText={expired ? error : "No clients found."}
            items={expired ? [] : displayedClients}
            footer={expired ? null : `Showing ${displayedClients.length} of ${clients.length} clients`}
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
    </>
  );
};

export default AdminClientsPage;
