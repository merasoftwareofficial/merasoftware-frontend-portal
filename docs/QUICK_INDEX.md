## Template review saves — 31 October 2026

Popup Save template creates a new custom template; explicit management Edit still updates. Shared backend POST /templates validates sourceTemplateId/action/application and reuses canonical editor conversion; templateOptions remains action scoped. Website `src/app/admin/email-control/email-control-panel.tsx` and portal `src/components/EmailReviewDialog.js` add/select the new ID and retain all options. Originals/defaults remain unchanged; chips remain reusable. Includes pre-save Add Lead and phone-only proposal previews through the common portal dialog. Lead-page manual messaging is deferred.

Local checks: backend email 51/51; website email 23/23; portal email browser pass. Details: `E:/Allprojects/merasoftware/src/docs/email-control.md`. No deployment or live sends.

# Portal reservation work index — 25 October 2026

Portal UI consistency (26 October): Documents (`src/pages/CustomerDocuments.js`), Games (`src/chess/GamesListPage.js`), and Settings (`src/pages/SettingsPage.js`, `src/components/settings/`) now use the existing `src/components/WorkspacePanel.js` frame and `max-w-7xl` workspace width. Start with `tests/portal-settings-documents.browser.cjs` for responsive geometry and control checks; `tests/portal-workspace-ui.browser.cjs` checks existing reference pages against a baseline build. See CODE_AUDIT.md for verified scope.

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
