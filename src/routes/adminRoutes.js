import { lazyPage } from './lazyPage';


import ProtectedRoute from "../components/ProtectedRoute";







import { Navigate } from "react-router-dom";






export const adminPageLoaders = [];
const adminPage = load => { adminPageLoaders.push(load); return lazyPage(load); };

const AdminEmailControlPage = adminPage(() => import('../pages/AdminEmailControlPage'));
const AdminSettingsPage = adminPage(() => import('../pages/AdminSettingsPage'));
const AdminDashboard = adminPage(() => import('../pages/AdminDashboard'));
const AdminClientsPage = adminPage(() => import('../pages/AdminClientsPage'));
const AdminLeadsPage = adminPage(() => import('../pages/AdminLeadsPage'));
const AdminLeadDetailPage = adminPage(() => import('../pages/AdminLeadDetailPage'));
const AdminClientWorkspace = adminPage(() => import('../pages/AdminClientWorkspace'));
const AdminPaymentRecordDetail = adminPage(() => import('../pages/AdminPaymentRecordDetail'));
const ProjectDetails = adminPage(() => import('../pages/ProjectDetails'));
const AdminPlansPage = adminPage(() => import('../pages/AdminPlansPage'));
const AdminCategoryBasePricePage = adminPage(() => import('../pages/AdminCategoryBasePricePage'));
const AdminFeatureProductsPage = adminPage(() => import('../pages/AdminFeatureProductsPage'));
const AdminTrashPage = adminPage(() => import('../pages/AdminTrashPage'));
const AdminMoneyManagementPage = adminPage(() => import('../pages/AdminMoneyManagementPage'));

export const adminRoutes = [
  { path: 'admin-panel/settings', element: <ProtectedRoute requireRole={['admin']}><AdminSettingsPage /></ProtectedRoute> },
  { path: 'admin-panel/email-control', element: <ProtectedRoute requireRole={['admin']}><AdminEmailControlPage /></ProtectedRoute> },
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
        <Navigate to="/admin-panel/website-management/plans?create=1" replace />
      </ProtectedRoute>
    )
  },
  {
    path: "admin-panel/website-management/plans",
    element: (
      <ProtectedRoute requireRole={['admin']}>
        <AdminPlansPage/>
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
