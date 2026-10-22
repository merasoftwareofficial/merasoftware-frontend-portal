const backendDomain = process.env.REACT_APP_BACKEND_URL //"http://localhost:8080"

const SummaryApi = {
    servicePlanOffers: { url: `${backendDomain}/api/customer/service-plan-offers`, method: 'get' },
    uploadSessions: { url: `${backendDomain}/api/upload-sessions`, method: 'post' },
    externalUploadSessions: { url: `${backendDomain}/api/external-upload/uploads`, method: 'post' },
    uploadProgress: { url: `${backendDomain}/api/upload-progress`, method: 'get' },
    externalUploadProgress: { url: `${backendDomain}/api/external-upload/progress`, method: 'get' },
    portfolioSource: { url: `${backendDomain}/api/admin/projects`, method: 'patch' },
    createCustomProjectOrder: {
        url: `${backendDomain}/api/customer/custom-project-order`,
        method: "post"
    },
    signUP : {
        url : `${backendDomain}/api/signup`,
        method: "post"
    },
    signIn : {
       url : `${backendDomain}/api/signin`,
        method: "post"
    },
    guestLogin: {
        url: `${backendDomain}/api/guest-login`,
        method: "post"
    },
    guestDummyWalletCredit: {
        url: `${backendDomain}/api/guest/demo-wallet-credit`,
        method: "post"
    },
    customerSignIn: {
       url: `${backendDomain}/api/auth/customer/login`,
       method: "post"
    },
    staffSignIn: {
       url: `${backendDomain}/api/auth/staff/login`,
       method: "post"
    },
    verifyOtp:{
      url : `${backendDomain}/api/verify-otp`,
      method: "post"
    },
    resendOtp: {
      url: `${backendDomain}/api/resend-otp`,
      method: "post"
    },
    current_user : {
        url : `${backendDomain}/api/user-details`,
        method : "get"
    },
    logout_user : {
        url : `${backendDomain}/api/userLogout`,
        method : "get"
    },
    allUser :{
        url : `${backendDomain}/api/all-user`,
        method : "get"
    },
    adminClients : {
        url : `${backendDomain}/api/admin/clients`,
        method : "get"
    },
    adminFeatureProducts : {
        url : `${backendDomain}/api/admin/feature-products`,
        method : "get"
    },
    adminPlanProducts : {
        url : `${backendDomain}/api/admin/plan-products`,
        method : "get"
    },
    // Smart removal: the server deletes an unpurchased plan and retires one that
    // customers already bought. url is a function — pass the plan id.
    retireOrDeletePlan : {
        url : (planId) => `${backendDomain}/api/admin/plans/${planId}`,
        method : "delete"
    },
    reactivatePlan : {
        url : (planId) => `${backendDomain}/api/admin/plans/${planId}/reactivate`,
        method : "post"
    },
    // "Delete Forever" from the Retired tab. Body { mode: "archive" | "hard",
    // confirmName } — hard mode also requires the plan's exact name to be retyped.
    purgePlan : {
        url : (planId) => `${backendDomain}/api/admin/plans/${planId}/purge`,
        method : "post"
    },
    createService : {
        url : `${backendDomain}/api/admin/services/create`,
        method : "post"
    },
    updateUser : {
        url : `${backendDomain}/api/update-user`,
        method : "post"
    },
    uploadProduct : {
        url : `${backendDomain}/api/upload-product`,
        method : "post"
    },
    allProduct : {
        url : `${backendDomain}/api/get-product`,
        method : "get"
    },
    getAllProducts: {
      url : `${backendDomain}/api/all-products`,
      method : "get"
    },
    updateProduct : {
        url : `${backendDomain}/api/update-product`,
        method : "post"
    },
    deleteProduct : {
        url : `${backendDomain}/api/delete-product`,
        method : "delete" 
    },
    productDetails : {
        url : `${backendDomain}/api/product-details`,
        method : "post"
    },
    uploadCategory : {
        url : `${backendDomain}/api/upload-category`,
        method : "post"
    },
    allCategory : {
        url : `${backendDomain}/api/get-categories`,
        method : "get"
    },
    updateCategory : {
        url: `${backendDomain}/api/update-category`,
        method : "post"
    },
    deleteCategory : {
        url : `${backendDomain}/api/delete-category`,
        method: "delete"
    },
    getCompatibleFeatures:{
        url: `${backendDomain}/api/compatible-features`,
        method: "get"
    },
    uploadAd : {
        url : `${backendDomain}/api/upload-ad`,
        method : "post"
    },
    uploadBanner : {
        url : `${backendDomain}/api/upload-banner`,
        method : "post"
    },
    allBanner : {
        url : `${backendDomain}/api/get-banner`,
        method : "get"
    },
    updateBanner : {
        url : `${backendDomain}/api/update-banner`,
        method : "post"
    },
    deleteBanner : {
        url : `${backendDomain}/api/delete-banner`,
        method : "delete"
    },
    updateProfile : {
        url : `${backendDomain}/api/update-profile`,
        method : "post"
    },
    uploadDeveloper : {
        url: `${backendDomain}/api/upload-developer`,
        method: "post"
    },
    allDevelopers:{
        url: `${backendDomain}/api/get-developer`,
        method: "get"
    },
    editDeveloper: {
        url : `${backendDomain}/api/edit-developer`,
        method: "post"
    },
    getSingleDeveloper: {
        url: `${backendDomain}/api/get-single-developer`,
        method : "get"
    },
    assignDeveloper:{
        url: `${backendDomain}/api/assign-developer`,
        method: "post"
    },
    createOrder : {
        url : `${backendDomain}/api/create-order`,
        method: "post"
    },
    createServicePlanOrder : {
        url : `${backendDomain}/api/customer/service-plan-order`,
        method: "post"
    },
    stopServiceRenewal : {
        url : `${backendDomain}/api/customer/service-plan/stop-renewal`,
        method: "post"
    },
    ordersList : {
        url : `${backendDomain}/api/get-order`,
        method: "get"
    },
    orderDetails: {
        url : `${backendDomain}/api/order-details`,
        method: "get"
    },
    deleteOrder: {
        url: `${backendDomain}/api/delete-order`,
        method: "delete"
    },
    validateUpdatePlan: {
        url : `${backendDomain}/api/validate-update-plan`,
        method: "post"
    },
    toggleUpdatePlan: {
        url : `${backendDomain}/api/toggle-update-plan`,
        method: "post"
    },
    // OLD RENEWAL - DEPRECATED
    renewMonthlyPlan: {
        url : `${backendDomain}/api/renew-monthly-plan`,
        method: "post"
    },
    // NEW RENEWAL SYSTEM (Approval-based flow)
    createRenewalOrder: {
        url: `${backendDomain}/api/create-renewal`,
        method: "post"
    },
    checkPendingRenewal: {
        url: `${backendDomain}/api/check-pending-renewal`,
        method: "get"
    },
    getUserRenewalStatus: {
        url: `${backendDomain}/api/user-renewal-status`,
        method: "get"
    },
    // Admin renewal management
    getPendingRenewals: {
        url: `${backendDomain}/api/pending-renewals`,
        method: "get"
    },
    approveRenewal: {
        url: `${backendDomain}/api/approve-renewal`,
        method: "post"
    },
    rejectRenewal: {
        url: `${backendDomain}/api/reject-renewal`,
        method: "post"
    },
    adminProjects : {
        url : `${backendDomain}/api/get-projects`,
        method : "get"
    },
    updateProjectProgress: {
        url : `${backendDomain}/api/update-project-progress`,
        method: "post"
    },
    adminUpdatePlans : {
        url: `${backendDomain}/api/get-update-plans`,
        method: "get"
    },
    updatePlanProgress: {
        url: `${backendDomain}/api/update-plan-progress`,
        method: "post"
    },
    getUpdatePlans: {
        url: `${backendDomain}/api/admin/get-update-plans`,
        method: "get"
    },
    closePlan: {
        url: `${backendDomain}/api/admin/close-plan`,
        method: "post"
    },
    sendProjectMessage: {
        url : `${backendDomain}/api/project-message`,
        method : "post"
    },
    updateProjectLink:{
      url : `${backendDomain}/api/update-project-link`,
      method: "post"
    },
    guestSlides: {
        url: `${backendDomain}/api/get-guest-slides`,
        method: "get"
      },
      userWelcome: {
        url: `${backendDomain}/api/get-user-welcome`,
        method: "get"
      },
      uploadGuestSlides: {
        url: `${backendDomain}/api/upload-guest-slides`,
        method: "post"
      },
      updateGuestSlides:{
        url : `${backendDomain}/api/update-guest-slides`,
        method: "post"
      },
      deleteGuestSlides: {
        url: `${backendDomain}/api/delete-guest-slides`,
        method: "delete"
      },
      uploadUserWelcome: {
        url: `${backendDomain}/api/upload-user-welcome`,
        method: "post"
      },
      updateUserWelcome: {
        url: `${backendDomain}/api/update-user-welcome`,
        method: "post"
      },
      deleteUserWelcome: {
        url: `${backendDomain}/api/delete-user-welcome`,
        method: "delete"
      },
      userUpdatePlans:{
        url: `${backendDomain}/api/user-update-plans`,
        method: "get"
      },
      requestUpdate: {
        url: `${backendDomain}/api/user-request-update`,
        method: "post"
      },
      userUpdateRequests : {
        url : `${backendDomain}/api/get-update-requests`,
        method: "get"
      },
      // Uploaded data for one order. Same two endpoints for customer and admin —
      // each authorises server-side, so both surfaces read one source.
      orderUploads: {
        url: `${backendDomain}/api/orders`,
        method: "get"
      },
      downloadUploadZip: {
        url: `${backendDomain}/api/uploads`,
        method: "get"
      },
      developerAssignedUpdates: {
        url: `${backendDomain}/api/assigned-updates`,
        method: "get"
      },
      developerUpdateMessage :{
        url: `${backendDomain}/api/developer-update-message`,
        method: "post"
      },
      addDeveloperNote: {
        url : `${backendDomain}/api/developer-add-note`,
        method: "post"
      },
      completeDeveloperUpdate :{
        url : `${backendDomain}/api/developer-complete-update`,
        method: "post"
      },
      getAdminUpdateSettings: {
        url: `${backendDomain}/api/get-file-settings`,
        method: "get"
      },
      adminUpdateSettings: {
        url : `${backendDomain}/api/update-file-settings`,
        method: "post"
      },
      downloadAllFiles:{
        url: `${backendDomain}/api/download-all-files/:requestId`,
        method: "get"
      },
      validateCoupon: {
        url : `${backendDomain}/api/validate-coupon`,
        method: "post"
      },
      getAllCoupons: {
        url: `${backendDomain}/api/get-coupons`,
        method: "get"
      },
      createCoupon: {
        url: `${backendDomain}/api/create-coupon`,
        method: "post"
      },
      updateCoupon: {
        url: `${backendDomain}/api/update-coupon`,
        method: "post"
      },
      deleteCoupon : {
        url: `${backendDomain}/api/delete-coupon`,
        method: "delete"
      },
      getProductsForCoupon : {
        url: `${backendDomain}/api/products-coupon`,
        method: "get"
      },
      payInstallment: {
        url: `${backendDomain}/api/pay-installment`,
        method: "post"
      },
      markInstallmentVerificationPending: {
        url: `${backendDomain}/api/mark-installment-pending`,
        method: "post"
      },
      checkPendingOrderTransactions:{
        url: `${backendDomain}/api/check-pending-order-transactions`,
        method :"get"
      },
      getAdminNotifications: {
        url: `${backendDomain}/api/admin-notifications`,
        method: "get"
      },
      markNotificationRead: {
        url: `${backendDomain}/api/mark-notification-read`,
        method: "post"
      },
      getUserNotifications: {
        url: `${backendDomain}/api/user-notifications`,
        method: "get"
      },
      getDeveloperNotifications: {
        url: `${backendDomain}/api/developer-notifications`,
        method: "get"
      },
      pendingOrders: {
        url : `${backendDomain}/api/pending-orders`,
        method: "get"
      },
      approveOrder: {
        url : `${backendDomain}/api/approve-order`,
        method: "post"
      },
      rejectOrder: {
        url : `${backendDomain}/api/reject-order`,
        method: "post"
      },
      downloadInvoice:{
        url : `${backendDomain}/api/download-invoice`,
        method: "get"
      },
      createTicket: {
        url : `${backendDomain}/api/create-ticket`,
        method: "post"
      },
      getUserTickets: {
        url : `${backendDomain}/api/get-user-tickets`,
        method: "get"
      },
      getTicketDetails: {
        url : `${backendDomain}/api/get-ticket-details`,
        method: "get"
      },
      replyTicket: {
        url : `${backendDomain}/api/ticket-reply`,
        method: "post"
      },
      closeTicket: {
        url : `${backendDomain}/api/ticket-close`,
        method: "post"
      },
      getAllTickets: {
        url : `${backendDomain}/api/get-all-tickets`,
        method: "get"
      },
      getGeneralUsers: {
         url: `${backendDomain}/api/general-users`,
         method: "get"
      },
      addRoleToUser: {
        url: `${backendDomain}/api/addRole`,
        method: "post"
      },
      hideProduct: {
        url: `${backendDomain}/api/hide-product`,
        method: "post"
      },
      UnhideProduct: {
        url: `${backendDomain}/api/unhide-product`,
        method: "post"
      },
      getHiddenProducts: {
        url: `${backendDomain}/api/get-hidden-products`,
        method: "get"
      },
      userRoleSwitch: {
        url: `${backendDomain}/api/role-switch`,
        method: "post"
      },
      businessCreatedToPartner: {
        url: `${backendDomain}/api/business-created`,
        method: "get"
      },
      businessCreatedFirstPurchase: {
        url: `${backendDomain}/api/first-purchase-list`,
        method: "get"
      },
      onlyFirstPurchase: {
        url: `${backendDomain}/api/only-first-order`,
        method: "get"
      },
      partnerCustomers : {
        url: `${backendDomain}/api/partner-customers`,
        method: "get"
      },
     completeProfile : {
      url: `${backendDomain}/api/complete-profile`,
      method : "post"
     },
     getCommissionHistory:{
      url: `${backendDomain}/api/get-commission-history`,
      method: "get"
     },
      getCommissionWalletSummary:{
      url: `${backendDomain}/api/commission-wallet-summary`,
      method: "get"
     },
     getWithdrawalHistory :{
      url: `${backendDomain}/api/get-withdrawal-history`,
      method: "get"
     },
     requestWithdrawal : {
      url: `${backendDomain}/api/request-withdrawal`,
      method: "post"
     },
     getAllWithdrawalRequests: {
      url: `${backendDomain}/api/all-withdrawal-requests`,
      method: "get"
     },
     approveWithdrawalRequest : {
      url: `${backendDomain}/api/approve-withdrawals`,
      method: "post"
     },
      rejectWithdrawalRequest : {
      url: `${backendDomain}/api/reject-withdrawals`,
      method: "post"
     },
     updatePartnerCustomer : {
      url: `${backendDomain}/api/update-partner-customer`,
      method: "post"
     },
     getPendingOrdersAndPayments:{
      url: `${backendDomain}/api/get-order-payment-verification`,
      method: "get"
     },
     addBankAccount: {
      url: `${backendDomain}/api/add-bank-account`,
      method: "post"
     },
     updateBankAccount: {
      url: `${backendDomain}/api/update-bank-account`,
      method: "post"
     },
     deleteBankAccount: {
      url: `${backendDomain}/api/delete-bank-account`,
      method: "delete"
     },
     getBankAccounts :{
      url: `${backendDomain}/api/get-bank-accounts`,
      method: "get"
     },
     getUserKycStatus: {
        url: `${backendDomain}/api/user-kyc-status`,
        method: "get"
    },
    getAllKycSubmissions: {
        url: `${backendDomain}/api/admin-kyc-submissions`,
        method: "get"
    },
    approveKyc: {
        url: `${backendDomain}/api/admin-kyc-approve`,
        method: "post"
    },
    rejectKyc: {
        url: `${backendDomain}/api/admin-kyc-reject`,
        method: "post"
    },
    wallet : {
        balance :{
            url : `${backendDomain}/api/wallet/balance`,
            method: "get"
        },
        // Instant wallet payment for an existing order/installment/invoice (customer's own money,
        // no approval). This replaced the old dead `deduct`/`add-balance` stubs (routes that were
        // never registered on the backend — they 404'd); InstallmentPayment.js and
        // InvoiceDetailPage.js now use this. See doc 51.
        payInstant : {
            url : `${backendDomain}/api/wallet/pay-instant`,
            method : "post"
        },
        history : {
            url : `${backendDomain}/api/wallet/history`,
            method : "get"
        },
        verifyPayment: {
            url: `${backendDomain}/api/wallet/verify-payment`,
            method: "post"
        },
        pendingTransactions: {
            url : `${backendDomain}/api/wallet/pending-transactions`,
            method: "get"
        },
        approveTransaction: {
            url: `${backendDomain}/api/wallet/approve-transaction`,
            method: "post"
        },
        rejectTransaction: {
            url: `${backendDomain}/api/wallet/reject-transaction`,
            method: "post"
        },
        adminTransactionHistory: {
            url: `${backendDomain}/api/wallet/admin-transaction-history`,
            method: "get"
        },
        deleteTransaction: {
            url: `${backendDomain}/api/wallet/delete-transaction`,
            method: "delete"
        },
    },
    // Monthly Invoice APIs
    invoices: {
        viewDocument: {
            url: `${backendDomain}/api/invoices`,
            method: "get"
        },
        downloadDocument: {
            url: `${backendDomain}/api/invoices`,
            method: "get"
        },
        getUserInvoices: {
            url: `${backendDomain}/api/my-invoices`,
            method: "get"
        },
        getAllInvoices: {
            url: `${backendDomain}/api/invoices`,
            method: "get"
        },
        getInvoiceById: {
            url: `${backendDomain}/api/invoices`,
            method: "get"
        },
        getInvoiceStatistics: {
            url: `${backendDomain}/api/invoices/statistics`,
            method: "get"
        },
        markInvoiceAsPaid: {
            url: `${backendDomain}/api/invoices`,
            method: "post"
        },
        cancelInvoice: {
            url: `${backendDomain}/api/invoices`,
            method: "post"
        },
        sendInvoiceReminder: {
            url: `${backendDomain}/api/invoices`,
            method: "post"
        },
        updateOverdueInvoices: {
            url: `${backendDomain}/api/invoices/update-overdue`,
            method: "post"
        }
    },
    workspaceActivityCounts: {
        url: `${backendDomain}/api/workspace-activity-counts`,
        method: "get"
    },
    adminUserWorkspace: {
        url: `${backendDomain}/api/admin/user-workspace`,
        method: "get"
    },
    adminRechargeWallet: {
        url: `${backendDomain}/api/admin/clients`,
        method: "post"
    },
    myPaymentWorkspace: {
        url: `${backendDomain}/api/my-payment-workspace`,
        method: "get"
    },
    adminPaymentRecord: {
        url: `${backendDomain}/api/admin/clients`,
        method: "get"
    },
    projectFinalInvoice: {
        url: `${backendDomain}/api/admin/project-final-invoices`,
        method: "get"
    },
    adminDeleteOrder: {
        url: `${backendDomain}/api/admin/delete-order`,
        method: "delete"
    },
    adminDeleteOrderScan: {
        url: `${backendDomain}/api/admin/delete-order`,
        method: "get"
    },
    adminCreateProjectOrder: {
        url: `${backendDomain}/api/admin/clients`,
        method: "post"
    },
    // Live (published, not expired) website offers for the Create Project form's Offer dropdown.
    adminSalesPackages: { url: `${backendDomain}/api/admin/sales-packages`, method: "get" },
    adminWebsiteOffers: {
        url: `${backendDomain}/api/admin/website-offers`,
        method: "get"
    },
    // Account & Access (admin) — caller appends `/:customerId/<action>`.
    clientCredentials: {
        url: `${backendDomain}/api/admin/clients`,
        method: "get"
    },
    resetClientPassword: {
        url: `${backendDomain}/api/admin/clients`,
        method: "post"
    },
    updateClientAccountStatus: {
        url: `${backendDomain}/api/admin/clients`,
        method: "post"
    },
    adminUploadLinks: {
        url: `${backendDomain}/api/admin/clients`,
        method: "get"
    },
    generateAdminUploadLink: {
        url: `${backendDomain}/api/admin/clients`,
        method: "post"
    },
    revokeAdminUploadLink: {
        url: `${backendDomain}/api/admin/clients`,
        method: "post"
    },
    myUploadLinkPreference: {
        url: `${backendDomain}/api/my-upload-link-preference`,
        method: "post"
    },
    externalUploadExchange: {
        url: `${backendDomain}/api/external-upload/exchange`,
        method: "post"
    },
    externalUploadCredentials: {
        url: `${backendDomain}/api/external-upload/credentials`,
        method: "post"
    },
    externalUploadSession: {
        url: `${backendDomain}/api/external-upload/session`,
        method: "get"
    },
    externalUploadSubmit: {
        url: `${backendDomain}/api/external-upload/submit`,
        method: "post"
    },
    approveProjectOrder: {
        url: `${backendDomain}/api/admin/projects`,
        method: "post"
    },
    // Cancellation is a two-call flow: the preview is read-only and tells the admin what will be
    // refunded and which methods need a reference id; the cancel call actually settles the money.
    // Both take the orderId as a path segment, like approveProjectOrder above.
    projectCancelPreview: {
        url: `${backendDomain}/api/admin/projects`,
        method: "get"
    },
    cancelProjectOrder: {
        url: `${backendDomain}/api/admin/projects`,
        method: "post"
    },
    categoryBasePrices: {
        url: `${backendDomain}/api/admin/category-base-prices`,
        method: "get"
    },
    updateCategoryBasePrice: {
        url: `${backendDomain}/api/admin/category-base-prices`,
        method: "post"
    },
    getMessageTemplates: {
        url: `${backendDomain}/api/admin/message-templates`,
        method: "get"
    },
    createMessageTemplate: {
        url: `${backendDomain}/api/admin/message-templates`,
        method: "post"
    },
    updateMessageTemplate: {
        url: `${backendDomain}/api/admin/message-templates`,
        method: "put"
    },
    deleteMessageTemplate: {
        url: `${backendDomain}/api/admin/message-templates`,
        method: "delete"
    },
    adminLeads: {
        url: `${backendDomain}/api/admin/leads`,
        method: "get"
    },
    createLead: {
        url: `${backendDomain}/api/admin/leads`,
        method: "post"
    },
    searchCustomers: {
        url: `${backendDomain}/api/admin/customers/search`,
        method: "get"
    },
    getAdminSettings: {
        url: `${backendDomain}/api/admin/settings`,
        method: "get"
    },
    updateAdminSettings: {
        url: `${backendDomain}/api/admin/settings`,
        method: "post"
    },
    myReferredLeads: {
        url: `${backendDomain}/api/my-referred-leads`,
        method: "get"
    },
    leadDetail: {
        url: `${backendDomain}/api/admin/leads`,
        method: "get"
    },
    updateLead: {
        url: `${backendDomain}/api/admin/leads`,
        method: "post"
    },
    deleteLead: {
        url: `${backendDomain}/api/admin/leads`,
        method: "delete"
    },
    // Trash (soft-delete) system. trashClient: POST /api/admin/clients/:id/trash.
    // getTrash: GET list. restoreTrash: POST /api/admin/trash/:type/:id/restore.
    // purgeTrash: DELETE /api/admin/trash/:type/:id (permanent).
    trashClient: {
        url: `${backendDomain}/api/admin/clients`,
        method: "post"
    },
    getTrash: {
        url: `${backendDomain}/api/admin/trash`,
        method: "get"
    },
    restoreTrash: {
        url: `${backendDomain}/api/admin/trash`,
        method: "post"
    },
    purgeTrash: {
        url: `${backendDomain}/api/admin/trash`,
        method: "delete"
    },
    adminGlobalSearch: {
        url: `${backendDomain}/api/admin/search`,
        method: "get"
    },
    convertLead: {
        url: `${backendDomain}/api/admin/leads`,
        method: "post"
    },
    setNewPassword: {
        url: `${backendDomain}/api/set-new-password`,
        method: "post"
    },
    uploadProposal: {
        url: `${backendDomain}/api/admin/leads`,
        method: "post"
    },
    // Client documents (agreements etc.). uploadClientDocument: admin POST to
    // /api/admin/clients/:customerId/documents (append customerId at call site).
    // myDocuments: customer GET — merged newest-first client documents + lead-stage files.
    uploadClientDocument: {
        url: `${backendDomain}/api/admin/clients`,
        method: "post"
    },
    adminClientDocuments: {
        url: `${backendDomain}/api/admin/clients`,
        method: "get"
    },
    myDocuments: {
        url: `${backendDomain}/api/my-documents`,
        method: "get"
    },
    createProjectNode: {
        url: `${backendDomain}/api/admin/projects`,
        method: "post"
    },
    editProjectNode: {
        url: `${backendDomain}/api/admin/projects`,
        method: "post"
    },
    deleteProjectNodes: {
        url: `${backendDomain}/api/admin/projects`,
        method: "post"
    },
    restoreProjectNodes: {
        url: `${backendDomain}/api/admin/projects`,
        method: "post"
    },
    setProjectNodeVisibility: {
        url: `${backendDomain}/api/admin/projects`,
        method: "post"
    },
    resetProjectNodes: {
        url: `${backendDomain}/api/admin/projects`,
        method: "post"
    }
}

export default SummaryApi;
