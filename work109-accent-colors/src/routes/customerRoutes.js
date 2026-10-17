import ProtectedRoute from "../components/ProtectedRoute";
import CustomerDashboard from "../pages/CustomerDashboard";
import OrderPage from "../pages/OrderPage";
import OrderDetailPage from "../pages/OrderDetailPage";
import InvoiceDetailPage from "../pages/InvoiceDetailPage";
import ProjectDetails from "../pages/ProjectDetails";
import PlanDetails from "../pages/PlanDetails";
import WalletDetails from "../pages/WalletDetails";
import UserUpdateDashboard from "../pages/UserUpdateDashboard";
import UserInvoices from "../pages/UserInvoices";
import DirectPayment from "../pages/DirectPayment";
import ContactSupport from "../pages/ContactSupport";
import InstallmentPayment from "../pages/InstallmentPayment";
import Profile from "../pages/Profile";
import TicketDetail from "../pages/TicketDetail";
import CompleteProfile from "../pages/CompleteProfile";
import ProjectsAndPlans from "../pages/ProjectsAndPlans";
import StartNewProject from "../pages/StartNewProject";
import StartProject from "../pages/startproject";
import StartNewProjectDetail from "../pages/StartNewProjectDetail";
import ServicePlanDetail from "../pages/ServicePlanDetail";
import GamesListPage from "../chess/GamesListPage";
import ChessPage from "../chess/ChessPage";
import SetNewPassword from "../pages/SetNewPassword";
import CustomerDocuments from "../pages/CustomerDocuments";
import StartNewWebsiteBuild from "../pages/StartNewWebsiteBuild";
import StartNewWebsiteCustomize from "../pages/StartNewWebsiteCustomize";
import MyReferredLeadsPage from "../pages/MyReferredLeadsPage";

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
    path: "start-new-project/build/new_website",
    element: <CustomerProtectedRoute><StartNewWebsiteBuild/></CustomerProtectedRoute>
  },
  {
    path: "start-new-project/build/new_website/customize",
    element: <CustomerProtectedRoute><StartNewWebsiteCustomize/></CustomerProtectedRoute>
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
    path: "my-updates",
    element: (
      <CustomerProtectedRoute>
        <UserUpdateDashboard/>
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
    path: "profile",
    element: (
      <CustomerProtectedRoute>
        <Profile/>
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
