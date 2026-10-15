import { useSelector } from "react-redux";
import { Navigate } from "react-router-dom";
import SessionPending from './SessionPending';

const ProtectedRoute = ({ children, requireRole }) => {
  const user = useSelector(state => state?.user?.user);
  const initialized = useSelector(state => state?.user?.initialized);

  if (!initialized) {
    return <SessionPending />;
  }

  if (!user?._id) {
    return <Navigate to="/login" replace />;
  }

  // Optional: Only for specific sensitive routes (admin routes)
  if (requireRole && !requireRole.includes(user?.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
};

export default ProtectedRoute;
