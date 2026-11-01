import { lazyPage } from './lazyPage';

import RoleBasedHome from "../components/RoleBasedHome";


import ProtectedRoute from "../components/ProtectedRoute";

// The public marketing site has been removed — the app is portal-only.
// Only the entry routes survive here: the root landing (redirects to the
// correct portal or /login) and the login screen itself. Everything else is
// served by customerRoutes / adminRoutes.
const Login = lazyPage(() => import('../pages/Login'));
const ExternalUploadPage = lazyPage(() => import('../pages/ExternalUploadPage'));
const MyOffers = lazyPage(() => import('../pages/MyOffers'));

export const publicRoutes = [
  { path: 'my-offers', element: <ProtectedRoute><MyOffers /></ProtectedRoute> },
  {
    path: "",
    element: <RoleBasedHome />
  },
  {
    path: "login",
    element: <Login/>
  },
  {
    path: "unauthorized",
    element: <div className="flex items-center justify-center min-h-screen text-2xl font-bold">Unauthorized Access</div>
  },
  {
    path: "external-upload",
    element: <ExternalUploadPage />
  }
];
