import { createBrowserRouter } from "react-router-dom";
import App from "../App"
import { publicRoutes } from "./publicRoutes";
import { customerRoutes } from "./customerRoutes";
import { adminPageLoaders, adminRoutes } from "./adminRoutes";
import AdminShell from "../components/AdminShell";
import ProtectedRoute from "../components/ProtectedRoute";
import RoleBasedHome from "../components/RoleBasedHome";

// Any unmatched URL (removed public pages like /home, typos, stale links) falls through to
// RoleBasedHome instead of React Router's blank "no routes matched" screen. RoleBasedHome
// already resolves logged-in users to their portal home and logged-out users to /login, so
// this route needs no logic of its own — it just has to be last so real routes win first.
const catchAllRoute = { path: "*", element: <RoleBasedHome /> };

// Every admin screen shares one shell. Each route keeps its own role check as well.
const adminShellRoute = {
  element: <ProtectedRoute requireRole={['admin']}><AdminShell preload={adminPageLoaders} /></ProtectedRoute>,
  children: adminRoutes,
};

// Create a router factory that takes routes as parameter
const createAppRouter = (routes) => {
  return createBrowserRouter([
    {
      path: "/",
      element: <App />,
      children: routes
    }
  ]);
};

// Export factory function and base routes
export const createRoleBasedRouter = (user, initialized) => {
  const routes = [...publicRoutes, ...customerRoutes, adminShellRoute, catchAllRoute];

  return createAppRouter(routes);
};
