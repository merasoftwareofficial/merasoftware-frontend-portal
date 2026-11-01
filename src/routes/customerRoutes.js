import { lazyPage } from './lazyPage';
import { Navigate } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";




























const CustomerDashboard = lazyPage(() => import('../pages/CustomerDashboard'));
const OrderPage = lazyPage(() => import('../pages/OrderPage'));
const OrderDetailPage = lazyPage(() => import('../pages/OrderDetailPage'));
const InvoiceDetailPage = lazyPage(() => import('../pages/InvoiceDetailPage'));
const ProjectDetails = lazyPage(() => import('../pages/ProjectDetails'));
const PlanDetails = lazyPage(() => import('../pages/PlanDetails'));
const WalletDetails = lazyPage(() => import('../pages/WalletDetails'));
const UserInvoices = lazyPage(() => import('../pages/UserInvoices'));
const DirectPayment = lazyPage(() => import('../pages/DirectPayment'));
const ContactSupport = lazyPage(() => import('../pages/ContactSupport'));
const InstallmentPayment = lazyPage(() => import('../pages/InstallmentPayment'));
const SettingsPage = lazyPage(() => import('../pages/SettingsPage'));
const TicketDetail = lazyPage(() => import('../pages/TicketDetail'));
const CompleteProfile = lazyPage(() => import('../pages/CompleteProfile'));
const ProjectsAndPlans = lazyPage(() => import('../pages/ProjectsAndPlans'));
const StartNewProject = lazyPage(() => import('../pages/StartNewProject'));
const StartProject = lazyPage(() => import('../pages/startproject'));
const StartNewProjectDetail = lazyPage(() => import('../pages/StartNewProjectDetail'));
const ServicePlanDetail = lazyPage(() => import('../pages/ServicePlanDetail'));
const PlanCheckout = lazyPage(() => import('../pages/PlanCheckout'));
const PlanCheckoutDone = lazyPage(() => import('../pages/PlanCheckout'), 'PlanCheckoutDone');
const GamesListPage = lazyPage(() => import('../chess/GamesListPage'));
const ChessPage = lazyPage(() => import('../chess/ChessPage'));
const SetNewPassword = lazyPage(() => import('../pages/SetNewPassword'));
const CustomerDocuments = lazyPage(() => import('../pages/CustomerDocuments'));
const StartProjectRequest = lazyPage(() => import('../pages/StartProjectRequest'));
const StartProjectRequestDetails = lazyPage(() => import('../pages/StartProjectRequestDetails'));
const MyReferredLeadsPage = lazyPage(() => import('../pages/MyReferredLeadsPage'));

const CustomerProtectedRoute = ({ children }) => (
  <ProtectedRoute requireRole={['customer']}>
    {children}
  </ProtectedRoute>
);

export const customerRoutes = [
  {
    path: "set-new-password",
    element: (
      <CustomerProtectedRoute>
        <SetNewPassword/>
      </CustomerProtectedRoute>
    )
  },
  {
    path: "dashboard",
    element: (
      <CustomerProtectedRoute>
        <CustomerDashboard/>
      </CustomerProtectedRoute>
    )
  },
  {
    path: "projects-and-plans",
    element: (
      <CustomerProtectedRoute>
        <ProjectsAndPlans/>
      </CustomerProtectedRoute>
    )
  },
  {
    path: "start-new-project",
    element: (
      <CustomerProtectedRoute>
        <StartProject/>
      </CustomerProtectedRoute>
    )
  },
  {
    path: "start-new-project/services",
    element: (
      <CustomerProtectedRoute>
        <StartNewProject/>
      </CustomerProtectedRoute>
    )
  },
  {
    // Get a Service → Start a Project: choose a project type (pages/StartProjectRequest.js) …
    path: "start-new-project/project",
    element: <CustomerProtectedRoute><StartProjectRequest/></CustomerProtectedRoute>
  },
  {
    // … then the details form that sends the callback request (pages/StartProjectRequestDetails.js).
    path: "start-new-project/project/:category",
    element: <CustomerProtectedRoute><StartProjectRequestDetails/></CustomerProtectedRoute>
  },
  {
    // The old website questionnaire and online Customize pages are unlinked; old links land on Start a Project.
    path: "start-new-project/build/*",
    element: <Navigate to="/start-new-project/project" replace />
  },
  {
    path: "start-new-project/:projectId",
    element: (
      <CustomerProtectedRoute>
        <StartNewProjectDetail/>
      </CustomerProtectedRoute>
    )
  },
  {
    path: "order",
    element: (
      <CustomerProtectedRoute>
        <OrderPage/>
      </CustomerProtectedRoute>
    )
  },
  {
    path: "order-detail/:orderId",
    element: (
      <CustomerProtectedRoute>
        <OrderDetailPage/>
      </CustomerProtectedRoute>
    )
  },
  {
    path: "invoice-detail/:invoiceId",
    element: (
      <CustomerProtectedRoute>
        <InvoiceDetailPage/>
      </CustomerProtectedRoute>
    )
  },
  {
    path: "project-details/:orderId",
    element: (
      <CustomerProtectedRoute>
        <ProjectDetails/>
      </CustomerProtectedRoute>
    )
  },
  {
    path: "project-details/:projectOrderId/services/:serviceOrderId",
    element: (
      <CustomerProtectedRoute>
        <PlanDetails isProjectServiceView />
      </CustomerProtectedRoute>
    )
  },
  {
    path: "plan-details/:orderId",
    element: (
      <CustomerProtectedRoute>
        <PlanDetails/>
      </CustomerProtectedRoute>
    )
  },
  {
    path: "service-plan-detail/:planId",
    element: (
      <CustomerProtectedRoute>
        <ServicePlanDetail/>
      </CustomerProtectedRoute>
    )
  },
  // Paying for a chosen plan and its result (pages/PlanCheckout.js; merasoftware/src/docs/plan.md §4).
  {
    path: "checkout/:planId",
    element: (
      <CustomerProtectedRoute>
        <PlanCheckout/>
      </CustomerProtectedRoute>
    )
  },
  {
    path: "checkout/done/:orderId",
    element: (
      <CustomerProtectedRoute>
        <PlanCheckoutDone/>
      </CustomerProtectedRoute>
    )
  },
  {
    path: "wallet",
    element: (
      <CustomerProtectedRoute>
        <WalletDetails/>
      </CustomerProtectedRoute>
    )
  },
  {
    path: "my-referred-leads",
    element: (
      <CustomerProtectedRoute>
        <MyReferredLeadsPage/>
      </CustomerProtectedRoute>
    )
  },
  {
    path: "my-invoices",
    element: (
      <CustomerProtectedRoute>
        <UserInvoices/>
      </CustomerProtectedRoute>
    )
  },
  {
    path: "documents",
    element: (
      <CustomerProtectedRoute>
        <CustomerDocuments/>
      </CustomerProtectedRoute>
    )
  },
  {
    path: "direct-payment",
    element: (
      <CustomerProtectedRoute>
        <DirectPayment/>
      </CustomerProtectedRoute>
    )
  },
  {
    path: "support",
    element: (
      <CustomerProtectedRoute>
        <ContactSupport/>
      </CustomerProtectedRoute>
    )
  },
  {
    path: "installment-payment/:orderId/:installmentNumber",
    element: (
      <CustomerProtectedRoute>
        <InstallmentPayment/>
      </CustomerProtectedRoute>
    )
  },
  {
    path: "settings",
    element: (
      <CustomerProtectedRoute>
        <SettingsPage/>
      </CustomerProtectedRoute>
    )
  },
  {
    // Profile is now a section of Settings; kept so old links still land.
    path: "profile",
    element: (
      <CustomerProtectedRoute>
        <Navigate to="/settings" replace />
      </CustomerProtectedRoute>
    )
  },
  {
    path: "support-tickets/:ticketId",
    element: (
      <CustomerProtectedRoute>
        <TicketDetail/>
      </CustomerProtectedRoute>
    )
  },
  {
    path: "complete-profile",
    element: (
      <CustomerProtectedRoute>
        <CompleteProfile/>
      </CustomerProtectedRoute>
    )
  },
  {
    path: "games",
    element: (
      <CustomerProtectedRoute>
        <GamesListPage/>
      </CustomerProtectedRoute>
    )
  },
  {
    path: "games/chess",
    element: (
      <CustomerProtectedRoute>
        <ChessPage/>
      </CustomerProtectedRoute>
    )
  }
];
