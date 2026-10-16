import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  BarChart3,
  IndianRupee,
  Layers3,
  ListChecks,
  LogOut,
  PanelsTopLeft,
  Settings2,
  Trash2,
  UserPlus,
  Users2,
} from "lucide-react";
import MobileSidebarDrawer from "./MobileSidebarDrawer";
import MobileBottomNav from "./MobileBottomNav";
import AdminGlobalSearch from "./admin/AdminGlobalSearch";
import PortalHeader from "./PortalHeader";
import useSidebarFocusZones from "../hooks/useSidebarFocusZones";

export const adminSidebarModules = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3, live: true, to: "/admin-panel/dashboard" },
  { id: "leads", label: "Leads", icon: UserPlus, live: true, to: "/admin-panel/leads" },
  { id: "clients", label: "Clients", icon: Users2, live: true, to: "/admin-panel/clients" },
  {
    id: "service-management",
    label: "Services",
    icon: PanelsTopLeft,
    group: true,
    children: [
      { id: "plans", label: "Plans", icon: Layers3, live: true, to: "/admin-panel/website-management/plans" },
    ],
  },
  {
    id: "project-setup",
    label: "Project Setup",
    icon: Settings2,
    group: true,
    children: [
      { id: "base-price", label: "Category Base Price", icon: IndianRupee, live: true, to: "/admin-panel/project-setup/base-price" },
      { id: "features", label: "Features", icon: ListChecks, live: true, to: "/admin-panel/project-setup/features" },
    ],
  },
  { id: "trash", label: "Trash", icon: Trash2, live: true, to: "/admin-panel/trash" },
  { id: "money-management", label: "Money Management", icon: IndianRupee, live: true, to: "/admin-panel/money-management" },
  { id: "upcoming-orders", label: "Upcoming Orders", icon: Layers3, soon: true },
  { id: "upcoming-reports", label: "Upcoming Reports", icon: BarChart3, soon: true },
];

const AdminLayout = ({
  user,
  onLogout,
  children,
}) => {
  const location = useLocation();
  const currentPath = location.pathname;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { sidebarRef, mainRef, navRefs, handleSidebarKeyDown } = useSidebarFocusZones();
  navRefs.current = [];
  const registerNavRef = (el) => {
    if (el) navRefs.current.push(el);
  };

  // Flatten the sidebar modules (incl. group children) into routable header
  // links — same SSOT array as the sidebar, only "soon" placeholders skipped.
  const headerLinks = adminSidebarModules.flatMap((module) =>
    module.group
      ? module.children.filter((child) => child.to).map(({ to, label }) => ({ to, label }))
      : module.to
        ? [{ to: module.to, label: module.label }]
        : []
  );

  // Mobile bottom bar: 4 most-used admin destinations + a "More" button that
  // opens the same MobileSidebarDrawer (rest of the modules live there).
  const bottomNavTabs = [
    { to: "/admin-panel/dashboard", label: "Dashboard", icon: BarChart3, active: currentPath === "/admin-panel/dashboard" },
    { to: "/admin-panel/leads", label: "Leads", icon: UserPlus, active: currentPath.startsWith("/admin-panel/leads") },
    { to: "/admin-panel/clients", label: "Clients", icon: Users2, active: currentPath.startsWith("/admin-panel/clients") },
    { to: "/admin-panel/website-management/plans", label: "Services", icon: Layers3, active: currentPath.startsWith("/admin-panel/website-management") },
  ];

  const sidebarContent = (
    <div className="flex h-full w-full flex-col">
      <div className="border-b border-slate-800 px-5 pt-8 pb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-300">
            {user?.profilePic ? (
              <img
                src={user.profilePic}
                alt={user?.name || "Admin"}
                className="h-full w-full rounded-2xl object-cover"
              />
            ) : (
              <span className="text-lg font-bold">
                {(user?.name || "A").slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">
              {user?.name || "Admin"}
            </p>
            <p className="truncate text-xs text-slate-400">
              {user?.email || "Admin Panel"}
            </p>
          </div>
        </div>

        <div className="mt-6 inline-flex rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
          Admin Panel
        </div>

        <div className="mt-5">
          <AdminGlobalSearch onNavigate={() => setMobileMenuOpen(false)} />
        </div>
      </div>

      <div className="flex-1 px-3 py-4">
        <p className="px-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Modules
        </p>

        <div className="mt-3 space-y-2">
          {adminSidebarModules.map((module) => {
            if (module.group) {
              const GroupIcon = module.icon;
              return (
                <div key={module.id} className="space-y-1">
                  <div className="flex items-center gap-3 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                    <GroupIcon size={16} className="shrink-0" />
                    <span>{module.label}</span>
                  </div>
                  {module.children.map((child) => {
                    const ChildIcon = child.icon;
                    const childIsActive = currentPath === child.to || currentPath.startsWith(`${child.to}/`);
                    return (
                      <Link
                        key={child.id}
                        ref={registerNavRef}
                        to={child.to}
                        aria-current={childIsActive ? "page" : undefined}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`group ml-3 flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-slate-950 ${childIsActive ? "bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-950/30" : "bg-slate-900/70 text-slate-200 hover:bg-slate-800"}`}
                      >
                        <ChildIcon size={18} className="shrink-0" />
                        <span className="flex-1">{child.label}</span>
                        <span className="text-xs opacity-70">{child.live ? "Live" : "Soon"}</span>
                      </Link>
                    );
                  })}
                </div>
              );
            }

            const isActive =
              currentPath === module.to ||
              (module.to && currentPath.startsWith(`${module.to}/`));
            const Icon = module.icon;
            const isUpcoming = Boolean(module.soon);
            const buttonClassName = [
              "group flex w-full min-w-0 items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-slate-950",
              isActive
                ? "bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-950/30"
                : isUpcoming
                  ? "cursor-not-allowed bg-slate-900/40 text-slate-500"
                  : "bg-slate-900/70 text-slate-200 hover:bg-slate-800",
            ].join(" ");

            if (module.to) {
              return (
                <Link
                  key={module.id}
                  ref={registerNavRef}
                  to={module.to}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => setMobileMenuOpen(false)}
                  className={buttonClassName}
                >
                  <Icon size={18} className="shrink-0" />
                  <span className="flex-1">{module.label}</span>
                  <span className="text-xs opacity-70">
                    {module.live ? "Live" : "Soon"}
                  </span>
                </Link>
              );
            }

            return (
              <button
                key={module.id}
                type="button"
                disabled={isUpcoming}
                className={buttonClassName}
              >
                <Icon size={18} className="shrink-0" />
                <span className="flex-1">{module.label}</span>
                <span className="text-xs opacity-70">
                  {module.live ? "Live" : "Soon"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-white/10 p-4">
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-left text-sm font-semibold text-red-200 transition hover:bg-red-500/20"
        >
          <LogOut size={18} className="shrink-0" />
          <span className="flex-1">Logout</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <PortalHeader
        user={user}
        portalLabel="Admin Portal"
        dashboardTo="/admin-panel/dashboard"
        onLogout={onLogout}
        showProfileLink={false}
        links={headerLinks}
      />
      <div className="flex min-h-full items-stretch bg-slate-100">
        <aside
          ref={sidebarRef}
          onKeyDown={handleSidebarKeyDown}
          className="sticky top-16 z-40 hidden h-[calc(100vh-4rem)] w-72 shrink-0 self-start overflow-y-auto border-r border-slate-800 bg-slate-950 text-white shadow-2xl lg:flex lg:flex-col"
        >
          {sidebarContent}
        </aside>

        <MobileSidebarDrawer isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)}>
          {sidebarContent}
        </MobileSidebarDrawer>

        <div className="min-w-0 flex-1">
        <main
          ref={mainRef}
          tabIndex={-1}
          className="min-h-full bg-slate-100 pb-16 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 lg:pb-0"
        >
          {children}
        </main>
      </div>
      </div>

      <MobileBottomNav tabs={bottomNavTabs} onMoreClick={() => setMobileMenuOpen(true)} />
    </>
  );
};

export default AdminLayout;
