import SummaryApi from '../common';
import { resourceDomains } from './usePortalUpdates';

// Exercise the real URL inventory: endpoint renames must not silently disable
// mounted-page invalidation. Derived detail URLs include their actual suffixes.
const inventory = [
  ['Dashboard', SummaryApi.adminDashboard.url, 'clients'],
  ['Clients', SummaryApi.adminClients.url, 'users'],
  ['Admin plans', SummaryApi.adminPlanCatalogue.url, 'catalog'],
  ['Features', SummaryApi.adminFeatureProducts.url, 'catalog'],
  ['Money', SummaryApi.getAdminSettings.url, 'settings'],
  ['Trash', SummaryApi.getTrash.url, 'orders'],
  ['Orders', SummaryApi.ordersList.url, 'orders'],
  ['Invoices', SummaryApi.myInvoices.url + '?invoiceId=fixture', 'invoices'],
  ['Order detail', SummaryApi.orderDetails.url + '/fixture', 'orders'],
  ['Uploads', SummaryApi.orderUploads.url + '/fixture/uploads', 'uploads'],
  ['Workspace', SummaryApi.adminUserWorkspace.url + '?customerId=fixture', 'users'],
  ['Access', SummaryApi.clientCredentials.url + '/fixture/credentials', 'users'],
  ['Client documents', SummaryApi.adminClientDocuments.url + '/fixture/documents', 'documents'],
  ['Upload links', SummaryApi.adminUploadLinks.url + '/fixture/upload-links?limit=20', 'upload-links'],
  ['Documents', SummaryApi.myDocuments.url, 'documents'],
  ['Profile', SummaryApi.current_user.url, 'users'],
  ['Tickets', SummaryApi.getUserTickets.url + '?page=2', 'tickets'],
  ['Ticket detail', SummaryApi.getTicketDetails.url + '/fixture', 'tickets'],
  ['Referrals', SummaryApi.myReferredLeads.url, 'referrals'],
  ['Catalogue', SummaryApi.customerPlanCatalogue.url, 'catalog'],
  ['Offers', SummaryApi.offerReservations.url, 'offers'],
  ['Wallet', SummaryApi.wallet.history.url, 'wallet'],
];
test.each(inventory)('%s remains subscribed after endpoint changes', (_name, url, domain) => {
  expect(url).not.toContain('undefined');
  expect(resourceDomains(url)).toContain(domain);
});
test('mutations and unknown reads do not acquire a speculative domain', () => {
  expect(resourceDomains('https://fixture.test/api/wallet/pay-instant')).toEqual([]);
  expect(resourceDomains('https://fixture.test/api/unknown')).toEqual([]);
});
