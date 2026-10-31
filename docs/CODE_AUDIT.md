## Template review saves — 31 October 2026

Popup Save template creates a new custom template; explicit management Edit still updates. Shared backend POST /templates validates sourceTemplateId/action/application and reuses canonical editor conversion; templateOptions remains action scoped. Website `src/app/admin/email-control/email-control-panel.tsx` and portal `src/components/EmailReviewDialog.js` add/select the new ID and retain all options. Originals/defaults remain unchanged; chips remain reusable. Includes pre-save Add Lead and phone-only proposal previews through the common portal dialog. Lead-page manual messaging is deferred.

Local checks: backend email 51/51; website email 23/23; portal email browser pass. Details: `E:/Allprojects/merasoftware/src/docs/email-control.md`. No deployment or live sends.

# Portal reservation audit — 25 October 2026

## Workspace UI consistency — 26 October 2026

- Cause: Documents, Games and Settings had independent narrow containers and section/card composition. Their containers were `max-w-4xl`, `max-w-6xl` and `max-w-3xl`, respectively, while Orders/Projects use `max-w-7xl`.
- Correction: reuse the existing WorkspacePanel/Surface/GlassButton components and the existing workspace width. Documents has a section header with Back/Refresh and divided document rows. Games has a Games section containing the existing game cards. Settings has Profile and Appearance sections; the Profile header Save button submits the existing form through its form ID.
- Ownership: document fetch/retry/download, profile persistence/upload preference, theme/accent state and game routing remain owned by their existing page handlers. No backend changes or production deployment.
- Verified against the compiled portal with local API fixtures: 36 geometry comparisons to Orders across three themes and four viewport widths; Retry, Refresh, Back, profile Save, keyboard controls/persistence and Chess navigation passed. All 24 theme/accent checks passed. Desktop and mobile screenshots were inspected. Production build passed with existing unrelated warnings.

Full context: [RESERVATION_AGENT_HANDOVER.md](../../merasoftware/src/docs/RESERVATION_AGENT_HANDOVER.md). This records verified local behavior, not production activation.

- My Offers is available to authenticated members/customers and reads owner-scoped backend records. Expired history remains; active deadlines use backend/server time. Changing accounts does not display the previous owner's rows.
- Signup/reservation does not grant the customer role. Admin lead conversion keeps the same account; existing login/reset continuation is preserved.
- The admin panel collects extension reason/deadline or force-apply preview/reason/typed code. Server checks are authoritative. The final UI forwards `previewToken` as well as `expectedRevision`; do not remove the token or bypass a stale-preview result.
- Whole-project surplus wallet credit is shown to admin; installment allocation stays a backend ledger operation. Do not maintain another balance/calculator in the browser.
- PhoneInput reads the backend-owned country list. OTP is provision only, not a completed feature.

Evidence: My Offers and admin reservation browser checks both passed; targeted portal ESLint passed. Browser API/navigation are fixtures, so live cookies, deployed feature compatibility and actual delivery still require rollout verification. No app code changed in the docs-only handover working.
