# Portal reservation work index — 25 October 2026

Start with the [cross-repo handover](../../merasoftware/src/docs/RESERVATION_AGENT_HANDOVER.md), then [CODE_AUDIT.md](CODE_AUDIT.md). Business rules and financial decisions live in backend helpers; do not duplicate them in UI state.

| Surface | Files |
|---|---|
| Admin history, extension and force-apply | `src/components/admin/ReservedOffersPanel.js`, mounted by `src/pages/AdminClientWorkspace.js` |
| Admin creation from saved reservation | `CreateProjectForClientForm` inside `src/pages/AdminClientWorkspace.js` |
| Member/customer My Offers | `src/pages/MyOffers.js`, `src/routes/publicRoutes.js`; members get their own reservations without general customer layout/access |
| API endpoints | `src/common/index.js`; backend `routes/offerReservations.js` owns authorization/commands |
| Login/reset continuation | `src/components/ProtectedRoute.js`, `src/pages/Login.js`, `src/pages/SetNewPassword.js`, `src/helpers/postLogin.js` |
| Phone collection | `src/components/PhoneInput.js`; `AddCustomerModal.js`, `AddAdminModal.js`, `AddDeveloperModal.js`, `AddPartnerModal.js` |

Verification from this repo: `node tests/offer-reservations-browser.cjs` and `node tests/reserved-offers-admin-browser.cjs`. Both passed against fixture transport. Existing real backend rules are exercised in its disposable replica-set suites. Final source originals: `E:/Allprojects/backup/frontend/work10-reservation-final`; handover-doc originals: `work11-reservation-handover-docs`.

Remaining: coordinated deployment with the backend's single-use preview-token protocol and [live rollout checks](../../backend/docs/RESERVATION_ROLLOUT.md). New daily/manual/stage reminders and signup OTP remain deferred.
