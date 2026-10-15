import { Navigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { getPortalHome } from "../helpers/portalHome";
import SessionPending from './SessionPending';

// Root "/" landing. The public site is gone as an entry point:
// logged-out users go to /login, logged-in users to their portal home.
const RoleBasedHome = () => {
  const user = useSelector((state) => state?.user?.user);
  const initialized = useSelector((state) => state?.user?.initialized);

  // Someone signed in on the website arrives with the cookie but nothing cached yet:
  // wait for the user check instead of sending them to /login.
  if (!initialized) {
    return <SessionPending />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={getPortalHome(user.role)} replace />;
};

export default RoleBasedHome;
