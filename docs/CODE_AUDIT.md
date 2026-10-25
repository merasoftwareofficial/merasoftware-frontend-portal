# Portal reservation audit — 25 October 2026

Full context: [RESERVATION_AGENT_HANDOVER.md](../../merasoftware/src/docs/RESERVATION_AGENT_HANDOVER.md). This records verified local behavior, not production activation.

- My Offers is available to authenticated members/customers and reads owner-scoped backend records. Expired history remains; active deadlines use backend/server time. Changing accounts does not display the previous owner's rows.
- Signup/reservation does not grant the customer role. Admin lead conversion keeps the same account; existing login/reset continuation is preserved.
- The admin panel collects extension reason/deadline or force-apply preview/reason/typed code. Server checks are authoritative. The final UI forwards `previewToken` as well as `expectedRevision`; do not remove the token or bypass a stale-preview result.
- Whole-project surplus wallet credit is shown to admin; installment allocation stays a backend ledger operation. Do not maintain another balance/calculator in the browser.
- PhoneInput reads the backend-owned country list. OTP is provision only, not a completed feature.

Evidence: My Offers and admin reservation browser checks both passed; targeted portal ESLint passed. Browser API/navigation are fixtures, so live cookies, deployed feature compatibility and actual delivery still require rollout verification. No app code changed in the docs-only handover working.
