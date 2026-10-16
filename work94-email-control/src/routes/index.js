import { createBrowserRouter } from "react-router-dom";
import App from "../App"
import { publicRoutes } from "./publicRoutes";
import { customerRoutes } from "./customerRoutes";
import { adminRoutes } from "./adminRoutes";
import { Provider } from "react-redux";
import store from "../store/store";
import RoleBasedHome from "../components/RoleBasedHome";

// Any unmatched URL (removed public pages like /home, typos, stale links) falls through to
// RoleBasedHome instead of React Router's blank "no routes matched" screen. RoleBasedHome
// already resolves logged-in users to their portal home and logged-out users to /login, so
// this route needs no logic of its own — it just has to be last so real routes win first.
const catchAllRoute = { path: "*", element: <RoleBasedHome /> };

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
  const routes = [...publicRoutes, ...customerRoutes, ...adminRoutes, catchAllRoute];

  return createAppRouter(routes);
};

// Default router with only public routes (for initial load)
const defaultRouter = createAppRouter([...publicRoutes, catchAllRoute]);

export default defaultRouter;
