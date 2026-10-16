import ProtectedRoute from "../components/ProtectedRoute";
import AdminDashboard from "../pages/AdminDashboard";
import AdminClientsPage from "../pages/AdminClientsPage";
import AdminLeadsPage from "../pages/AdminLeadsPage";
import AdminLeadDetailPage from "../pages/AdminLeadDetailPage";
import AdminClientWorkspace from "../pages/AdminClientWorkspace";
import AdminPaymentRecordDetail from "../pages/AdminPaymentRecordDetail";
import ProjectDetails from "../pages/ProjectDetails";
import AdminPlanProductsPage from "../pages/AdminPlanProductsPage";
import AdminCreateServicePage from "../pages/AdminCreateServicePage";
import AdminCategoryBasePricePage from "../pages/AdminCategoryBasePricePage";
import AdminFeatureProductsPage from "../pages/AdminFeatureProductsPage";
import AdminTrashPage from "../pages/AdminTrashPage";
import AdminMoneyManagementPage from "../pages/AdminMoneyManagementPage";

export const adminRoutes = [
  {
    path: "admin-panel/dashboard",
    element: (
      <ProtectedRoute requireRole={['admin']}>
        <AdminDashboard/>
      </ProtectedRoute>
    )
  },
  {
    path: "admin-panel/leads",
    element: (
      <ProtectedRoute requireRole={['admin']}>
        <AdminLeadsPage/>
      </ProtectedRoute>
    )
  },
  {
    path: "admin-panel/leads/:leadId",
    element: (
      <ProtectedRoute requireRole={['admin']}>
        <AdminLeadDetailPage/>
      </ProtectedRoute>
    )
  },
  {
    path: "admin-panel/clients",
    element: (
      <ProtectedRoute requireRole={['admin']}>
        <AdminClientsPage/>
      </ProtectedRoute>
    )
  },
  {
    path: "admin-panel/clients/:customerId/payments/:recordType/:recordId",
    element: (
      <ProtectedRoute requireRole={['admin']}>
        <AdminPaymentRecordDetail/>
      </ProtectedRoute>
    )
  },
  {
    path: "admin-panel/clients/:customerId",
    element: (
      <ProtectedRoute requireRole={['admin']}>
        <AdminClientWorkspace/>
      </ProtectedRoute>
    )
  },
  {
    path: "admin-panel/website-management/services/add",
    element: (
      <ProtectedRoute requireRole={['admin']}>
        <AdminCreateServicePage />
      </ProtectedRoute>
    )
  },
  {
    path: "admin-panel/website-management/plans",
    element: (
      <ProtectedRoute requireRole={['admin']}>
        <AdminPlanProductsPage/>
      </ProtectedRoute>
    )
  },
  {
    path: "admin-panel/project-setup/base-price",
    element: (
      <ProtectedRoute requireRole={['admin']}>
        <AdminCategoryBasePricePage/>
      </ProtectedRoute>
    )
  },
  {
    path: "admin-panel/project-setup/features",
    element: (
      <ProtectedRoute requireRole={['admin']}>
        <AdminFeatureProductsPage/>
      </ProtectedRoute>
    )
  },
  {
    path: "admin-panel/trash",
    element: (
      <ProtectedRoute requireRole={['admin']}>
        <AdminTrashPage/>
      </ProtectedRoute>
    )
  },
  {
    path: "admin-panel/money-management",
    element: (
      <ProtectedRoute requireRole={['admin']}>
        <AdminMoneyManagementPage/>
      </ProtectedRoute>
    )
  },
  {
    path: "admin-panel/project-details/:orderId",
    element: (
      <ProtectedRoute requireRole={['admin']}>
        <ProjectDetails isAdminView={true}/>
      </ProtectedRoute>
    )
  }
];
