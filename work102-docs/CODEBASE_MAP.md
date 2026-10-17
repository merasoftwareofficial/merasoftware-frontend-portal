# Codebase Map — Current State Reference

Single source of truth for "where is the code for X and what is the current rule." No history, no rejected attempts, no session narration — only what is true today. Verified against live code, not just old docs.

Project root: `e:\merasoftware-new` — `backend/` (Node/Express/Mongoose) + `frontend/src/` (React).

---

## 1. Architecture & Routing

- Portal-only app. No public marketing/storefront site exists. `frontend/src/routes/publicRoutes.js` has exactly 4 routes: `""` (`RoleBasedHome`), `login`, `unauthorized`, and the deliberately public upload-only route `external-upload` (`ExternalUploadPage`).
- Boot chain: `src/index.js` → `src/App.js` (online-status context) → `src/AppContent.js` (session init, `Context.Provider`, `ScrollToTop`, renders `<Outlet/>`) → `src/routes/index.js` (assembles entry + `customerRoutes.js` + `adminRoutes.js`).
- Root `/` → `RoleBasedHome`: logged-out → `/login`; logged-in → `getPortalHome(role)` (`src/helpers/portalHome.js`) → admin: `/admin-panel/dashboard`, customer: `/dashboard`.
- Login: `src/pages/Login.js` only. **No signup page/route, no OTP-verification page, no forgot-password page** in the live UI. `POST /api/signup` + OTP backend (`backend/helpers/otpUtils.js`, `backend/models/otpModel.js`, `/verify-otp`, `/resend-otp`) exist but are unreachable from any UI. Customers are created only via lead conversion or admin client creation.
- Post-login: `src/helpers/postLogin.js` stores user in Redux/cookies/localStorage, redirects via `getPortalHome(role)`.
- Route guard: `src/components/ProtectedRoute.js` (`requireRole={['customer']}` / `['admin']`), redirects unauthorized to `/login` or `/unauthorized`.
- **Portal header — corrects stale claims in old docs**: `src/components/PortalHeader.js` (sticky `top-16`... actually `h-16 sticky top-0`) IS rendered by both `DashboardLayout.js` and `AdminLayout.js`. There is no *global* header in `AppContent.js` (that still renders only `<Outlet/>`), but each portal shell renders its own `PortalHeader` instance (logo, profile dropdown, nav links). Sidebars use `sticky top-16 h-[calc(100vh-4rem)]` — correct because this header exists.
- Mobile nav: `src/components/MobileSidebarDrawer.js` (shared, slides in from the **right**, used by both layouts) + `src/components/MobileBottomNav.js` (fixed bottom bar, `lg:hidden`). Customer tabs: Dashboard/Projects/Start/Games + More. Admin tabs: Dashboard/Leads/Clients/Projects + More. The customer account destination is labelled **Settings** in the shared header/sidebar navigation but deliberately keeps its established `/profile` route.

### Project ownership model
- No project catalogue exists. `backend/models/orderProductModel.js` is the project SSOT — owns client ref, frozen `projectSnapshot`, dynamic node timeline, pricing, payments, invoices.
- `isWebsiteProject` gates project-timeline workflows (not a "Website Management visibility" flag).
- `categoryBasePriceModel` + `feature_upgrades`-category `productModel` rows are internal pricing configuration only, never catalogue/listing entries.
- Two project-creation paths, same SSOT: admin (`POST /api/admin/clients/:customerId/create-project` → `backend/controller/order/adminCreateProjectOrder.js`) and customer custom-project flow (`POST /api/customer/custom-project-order` → `backend/controller/order/customerCreateCustomProjectOrder.js`). Neither creates a visible catalogue product.

### Known live bug
- `StartNewWebsiteCustomize.js` calls `SummaryApi.customerCategoryBasePrice`, which **does not exist** in `frontend/src/common/index.js` (confirmed by grep — zero matches). This will fail at runtime wherever that page tries to build the request URL.

---

## 2. Auth & Access Control

- **Admin password/login-ban system** (`backend/config/accessControlConfig.js`, flag `STORE_PLAIN_PASSWORD`): `userModel` has additive `plainPassword` (display-only, gated by the flag) and `isActive` (login gate, default `true`). Plaintext written at signup/convert/self-reset and **backfilled on next successful login** for pre-existing users. `userSignIn.js` blocks login when `isActive === false` (checked only after password match). Login always authenticates against the bcrypt hash — plaintext is never used for auth, and is stripped from the login response.
  - Endpoints (all under `/admin/clients/:customerId/*`, admin-only): `credentials` (`getClientCredentials.js`, view), `reset-password` (`resetClientPassword.js`), `account-status` (`updateClientAccountStatus.js`, ban/enable, self-account and admin-account guarded).
  - UI: `AdminClientWorkspace.js` → **Account & Access** tab.
  - Disable later: flip the flag + run `backend/scripts/removePlainPasswords.js`.
  - **Security-sensitive, accepted risk**: plaintext password storage was an explicit owner decision (DB-leak risk accepted).
- **Signup**: `POST /api/signup` + `SummaryApi.signUP` exist but are dead — no route registered in `publicRoutes.js`, no link anywhere in `Login.js`. `userSignUp.js` takes `role` from `req.body` (never exposed via UI today, but would be a privilege-escalation risk if a signup UI is ever built without fixing this first). `userModel` has no `isVerified`/`emailVerified` field.
- **Guest login / demo system** (`backend/controller/user/guestLogin.js`, `POST /api/guest-login`, public): creates a real `userModel` account (`isGuest: true`, full portal access) + a `leadModel` record (`source: "guest"`). Identity resolution via `backend/helpers/guestIdentityMatch.js` (checks both `userModel`+`leadModel`) — 4 outcomes: real-customer match → rejected ("sign in with password"), partial match → rejected ("already in use"), full match → resumes existing guest, no match → creates new guest.
  - Demo credit: `backend/config/guestDemoConfig.js` — ₹50,000 auto-credited on signup via `transactionService.creditWalletInstant()` with `paymentMethod: "demo"`.
  - 24-hour **inactivity** cascade-delete: `backend/helpers/guestCascadeDelete.js` (activity refreshed by a guest-only fire-and-forget write in `middleware/authToken.js`), lazily triggered via `purgeExpiredGuests.js` (called from `getAdminClients.js`, same lazy-purge pattern as Trash). Deletes the guest's `userModel` + everything it created, including `invoiceModel` (a gap the older `deleteOrder.js`/Trash system doesn't close). **Never deletes the lead** — only clears `guestUserId` link.
  - Refuses to expire a guest mid-chess-game (`chessRoomManager.getActiveGamesForUser()` check) — returns `reason: "active_chess_game"`.
  - Installments hidden from guests in `StartNewWebsiteCustomize.js`'s payment dropdown (avoids `progressThreshold` gate stalling a demo project); Full Payment / Decide Later remain available.
  - `getAdminClients.js` filters `isGuest: { $ne: true }`; `getAdminUserWorkspace.js` also returns "Customer not found" for any guest `customerId` (closes an earlier admin-visibility leak).
  - Convert-to-client (`convertLead.js`) cascade-deletes the guest account first if converting a guest, then creates the real customer normally (`mustResetPassword: true`).

---

## 3. Leads / CRM System

- Collection: `backend/models/leadModel.js` — never `userModel`. A lead's truth is `leadModel`; a client's is `userModel` (`roles: "customer"`).
- Controllers: `backend/controller/lead/` — `createLead.js`, `getLeads.js`, `getLeadDetail.js`, `updateLead.js`, `globalSearch.js`, `convertLead.js`, `uploadProposal.js`, `deleteLead.js`.
- Routes: `/api/admin/leads*`, `/api/admin/search` (`globalSearch.js` — searches both `userModel` and `leadModel` in parallel, badge-tags `Client`/`Lead`, excludes converted leads), `/api/admin/customers/search` (`searchCustomers.js` — customers only, no leads; used by the Reference typeahead below).
- Pages: `AdminLeadsPage.js` (`/admin-panel/leads`, list + Add-Lead modal, phone required at create, email optional) — filter badges: source (All/Normal/Guest) + status badges New/Contacted/Proposal Sent/Negative/Matured/All (**"Matured" is a display-only rename of the stored `"Won"` value**, DB/enum unchanged — `"Won"` is system-set only on convert, never manually selectable). `AdminLeadDetailPage.js` (`/admin-panel/leads/:leadId`) — 4-stage-plus-Won pipeline (`New→Contacted→Proposal Sent→Negative`, `Won` set only by convert), unified follow-up log (`action: "followUp"`, badge+note+optional attachment, merges into `lead.status`) with in-place edit (`action: "editFollowUp"`, editing the *latest* follow-up's badge also updates `lead.status`), versioned `proposals[]` upload via `GoogleDriveService`, Convert-to-Client button.
- **Follow-up `_id` backfill** (`backend/scripts/backfillFollowUpIds.js`, one-time, run 22-09-2026). *Before:* 33 of 36 `leadModel.followUps[]` entries (14 leads, all created on/before 18-09-2026) had **no `_id`** — the schema before the 19-09-2026 `leadModel.js` edit did not persist one. `getLeadDetail.js` serves follow-ups via `.lean()`, so Mongoose never generates an `_id` on read and the admin UI received `_id: undefined`; the edit form then posted the string `"undefined"`, `updateLead.js`'s `lead.followUps.id(followUpId)` returned `null`, and **every edit of an old follow-up answered `404 "Follow-up not found"`**. (A hydrated `_id` is regenerated per read, so it could never match what the UI last saw.) *After:* every entry has a persisted `_id`; verified `HTTP 200 "Follow-up updated"` on a previously-failing follow-up, 0 duplicates, and zero content drift vs a pre-migration backup across all 36 entries. The script is idempotent (only entries missing `_id`, guarded by array length) — safe to re-run. **No code change was needed**: the current schema and controller already produce correct data, so only the legacy rows were repaired.
- **Convert mechanics** (`convertLead.js`, the only place a `userModel` customer is created from a lead): reuses `userSignUp.js`'s bcrypt hashing, sets the **universal default password `"1234"`** + additive `userModel.mustResetPassword: true`. Links lead (`convertedToUserId`, status → `Won`, becomes read-only). Requires both email **and** phone (email is the login identifier). `userSignIn.js` returns `mustResetPassword`; `postLogin.js` routes first-login user to `/set-new-password` (soft "Skip for now" allowed). `setNewPassword.js` (`POST /api/set-new-password`) is the **only** password-change endpoint in the app. Deliberately does **not** set the new `userModel.referredBy` — see the Reference/reward note below.
- `getAdminClients.js` filters by role so leads never leak into the Clients list.
- Not built: CSV bulk import, in-app quotation builder, email/WhatsApp send integration (everything today is manual/record-only). A WhatsApp **sender** does exist but is dormant and wired to nothing — see §14a before assuming it has to be built from scratch.

### 3a. Lead Reference + Wallet Reward
- Add Lead's Source field is a fixed dropdown (`Outbound Call`/`Facebook`/`Instagram`/`Google`/`WhatsApp`/`Reference`) in `AdminLeadsPage.js` — `leadModel.source` itself stays a free string (the "guest" self-signup path, §2, still writes `source: "guest"` directly and is untouched by this dropdown).
- Selecting `Reference` opens a debounced typeahead (`/api/admin/customers/search`) to link the lead to an **existing customer**. A match sets `leadModel.referredByUserId` (additive `ObjectId ref: 'user'`, default `null`); no match falls back to plain-text behavior (nothing is linked).
- **Deliberately separate from `userModel.referredBy`/`referrals[]`.** That existing pair powers the Partner system (`getPartnerCustomers.js`/`updatePartnerCustomer.js` — lets a "partner" view and *edit* the users they referred). Writing a lead-reference into it would silently hand out that edit access, so `leadModel.referredByUserId` is tracking-only and `convertLead.js` still hardcodes `referredBy: null` on the created user.
- Reward: `createLead.js`, when `referredByUserId` resolves to a real user, credits that user's wallet **instantly** (on link, not on lead conversion) via `transactionService.creditWalletInstant()` — no cap on repeat references. Amount comes from `AdminSettings.getSettings().leadReferralRewardAmount` (admin-editable, see §3b). Transaction id is deterministic (`LEADREF-<leadId>`), so a retried request can't double-credit. `paymentMethod: "reward"` (additive transactionModel enum value — distinct from `"wallet"`/`"cash"`/etc., which describe how an admin *manually* collected money; a lead-reference reward is system-credited, not collected) — labelled "Referral Reward" in both `getPaymentMethodText` (`invoicePresentation.js`) and `paymentLedger.js`'s local label map. The credit runs in its own `try/catch` after `lead.save()` — a reward-credit failure is logged, never turns a successfully-created lead into a false "failed" response.
- Because `getWalletHistory.js` and `getAdminUserWorkspace.js` both query `transactionModel` unfiltered by `paymentMethod`, the reward transaction shows up automatically in the customer's own wallet history and in the admin's Client Workspace payments tab — no extra wiring needed beyond the credit itself.
- Customer-facing summary: `GET /api/my-referred-leads` (`myReferredLeads.js`) returns the calling customer's `leadModel.find({referredByUserId: req.userId})` paired with each lead's reward amount (looked up by the same deterministic `LEADREF-<leadId>` id). Surfaced as the "People connected" tile on `CustomerDashboard.js` → `MyReferredLeadsPage.js` (`/my-referred-leads`).

### 3b. Admin Settings (Money Management)
- Singleton config doc: `backend/models/adminSettingsModel.js` (`AdminSettings.getSettings()` — finds the one doc or creates it with schema defaults). Pre-existing field `fileExpirationDays`; additive field `leadReferralRewardAmount` (default `500`, min `0`) added for §3a.
- Endpoints: `GET/POST /api/admin/settings` (`getAdminSettings.js` / `updateAdminSettings.js`, admin-only). The update controller uses an explicit field allowlist (`UPDATABLE_FIELDS`) — a stray body key can never write to a settings field the route wasn't built to expose.
- UI: `AdminMoneyManagementPage.js` (`/admin-panel/money-management`) — currently a single editable line item (Lead Reference Reward amount); built to extend with more admin-configurable amounts later without a new page.

---

## 4. Projects — Creation, Node/Timeline System, Pricing

### Dynamic node/timeline system (current, live — supersedes any `checkpoints[]` references)
- Legacy `checkpoints[]` field/hooks are **fully removed** from both `orderProductModel.js` and `productModel.js` (verified zero matches in code).
- Order-owned canonical fields on `orderProductModel.js`: `projectTimelineVersion` (`1` = live on node system, `0` = 4 legacy non-website orders that predate/don't support it), `projectTimelineInitialized`, `projectRuns[]`, `projectNodes[]`, `projectNodeEvents[]`.
- `projectProgress` = max `cumulativeProgress` among active nodes (shared field, read by dashboards/summaries).
- Service: `backend/helpers/projectNodeService.js` — idempotent 0% init, active-run lookup, cumulative-progress validation, create/soft-delete/restore (blocked if a later active node has equal/lower progress)/visibility/reset+new-run/in-place **edit** (`editProjectNode()` — every node except the run's starting node, which is title-only/locked at 0%; new progress must sit strictly between neighbours).
- Controller/routes: `backend/controller/order/projectNodeController.js`, all under `/api/admin/projects/:orderId/nodes...` (create, edit, delete, restore, visibility, reset) — gated to `projectTimelineVersion: 1`.
- `initializeProjectTimeline()` is called at order-creation time by `createOrder.js`, `adminCreateProjectOrder.js`, and `customerCreateCustomProjectOrder.js` — not a separate approval-time step.
- All 9 pre-existing website-project orders were migrated via `backend/scripts/migratePreExistingOrdersToNodeSystem.js` — every `isWebsiteProject: true` order is on version 1.
- Frontend: `ProjectDetails.js` reads `order.projectNodes` (no predefined future-checkpoint list exists). Admin UI: `AdminClientWorkspace.js`'s project subpage + `AdminProjectCheckpointDetail.js` (Add Node / Add Node & Send / Edit).
- Confirmed dead/legacy, do not use: `ProjectWorkspaceModal.js`, `SummaryApi.updateProjectProgress` / `POST /api/update-project-progress` (route never registered).
- **Message templates (Add Node update message) are now persisted, not local state.** Was: `AdminProjectCheckpointDetail.js` kept `templates` in a plain `useState` seeded with 3 hardcoded defaults — Save/Save As/Delete only mutated that array, so every custom template vanished on remount/refresh. Now: `backend/models/messageTemplateModel.js` (`name`, `message`, `createdBy`, shared across all admins) + `backend/controller/admin/{getMessageTemplates,createMessageTemplate,updateMessageTemplate,deleteMessageTemplate}.js`, routed at `GET/POST /admin/message-templates` + `PUT/DELETE /admin/message-templates/:templateId`. `AdminProjectCheckpointDetail.js` fetches templates on mount and calls the matching endpoint from each handler before updating local state.
- **Deleted node display fix (client + admin, `ProjectDetails.js`).** Was: a soft-deleted node (`status: 'deleted'`, see `softDeleteProjectNodes()` above) stayed in the rendered timeline (`sortedNodes`/`timelineNodes` never filtered it out) but `TimelineCheckpointItem`'s label logic only branched on `isCompleted`/`isInProgress` — a deleted node matched neither, so it fell through to the default label **"Upcoming"**, and the separately-rendered "Checkpoint Details" status badge (both desktop and mobile layout) showed "Completed" for it too. Now: a new `isDeleted` prop (`node.status === 'deleted'`) drives its own branch everywhere a node's visuals are derived — label "Deleted", muted card/badge tone, `X` icon, strikethrough title — computed at both `timelineNodes.map` call sites and passed into `TimelineCheckpointItem`; the "Checkpoint Details" status badge checks `selectedNode.status === 'deleted'` first, at both its desktop and mobile render sites. Nodes are still never filtered out of the timeline — only their display changed.

### Admin "Create Project for Client" (`AdminClientWorkspace.js` → Projects tab)
- Form component: `CreateProjectForClientForm`. 2-step flow: Project Details → Payment Settings.
- Creates a **hidden** catalog product + an order — NOT wired through the customer storefront (`createOrder.js`/`DirectPayment.js` not reused). **Correction (verified 2026-09-23): `isCustomClientProject` is declared on `productModel.js` and never written or read by any controller** — the whole repo has exactly one mention, the schema line. The product is only `isHidden`, which hides it from listings but records **no ownership**: nothing says which client it was made for, so its URL still sells to anyone who reaches it and no query can answer "what was made for this client". Relevant to the planned client-exclusive sellables (`plan-system.md`).
- Category Base Price: fixed per-category price from `backend/models/categoryBasePriceModel.js`, managed at `/admin-panel/project-setup/base-price` (`AdminCategoryBasePricePage.js`). Read-only/auto-fetched in the form — never client-submitted.
- Additional Features: existing `feature_upgrades`-category `productModel` products (NOT a separate collection — a separate `projectFeatureModel` attempt was built then removed). Managed at `/admin-panel/project-setup/features` (`AdminFeatureProductsPage.js`) — the Add/Edit modal is **live again** (`FeatureEditForm`), and now also sets each feature's capability (see §4a).
- Server-side price re-derivation is mandatory: `adminCreateProjectOrder.js` never trusts client-submitted price/feature data — re-derives base price from `categoryBasePriceModel` and feature price from `productModel` (filtered to `feature_upgrades`).
- Reference Total = Base + Features (display only); Selling Price is manual; Discount = Reference Total − Selling Price.
- `startingNodeTitle` does **not** live on `productModel.js` (an early plan, never implemented that way) — it lives on `orderProductModel.js` (order-level, copied at start) and `categoryBasePriceModel.js` (per-category default, fields: `category`, `basePrice`, `description`, `startingNodeTitle`).
- `hasUnpaidInvoice` (from `getOrderDetails.js`) is scoped to only `order.currentInstallment`'s invoice, gated on that installment's `progressThreshold` being reached — NOT "any unpaid invoice on the order" (fixed; previously over-matched).
- Per-client **"Deleted Projects" tab** in `AdminClientWorkspace.js` shows `orderDeleted`-flagged payment history separately from the main Payment & Invoices tab.
- **LIVE BUG — modern service plans are listed under the Projects tab, leaving Plans dead** (audited 2026-09-23, unfixed). `AdminClientWorkspace.js` defines its own local `isWebsiteUpdateOrder()` asking only the **legacy** question (`productId.isWebsiteUpdate` / `category === "website_updates"`). Every current plan is `service_plan` + `isServicePlan: true` and has neither marker, so it answers no — and the split is binary (`planOrders` = matches, `projectOrders` = *everything else*), so all of them land in Projects. With 0 legacy orders live (§5a), the Plans tab is permanently empty. `getAdminUserWorkspace.js`'s `activePlans` tile counts by the same legacy marker (reads ~0); its `plans: []` response field is always empty, so the split is entirely client-side. **Fix: delete the local classifier, use `helpers/orderType.js`'s `isPlanItem()`** — the customer portal's classifier, which reads the order's own `isServicePlan` flag first and treats the catalogue as fallback, because a catalogue product can be retired or deleted while an order must always describe itself. Also drop the binary split: "not a plan" must not silently mean "project". This is the *tab-split* bug only — the wider legacy problem is §5a.

### 4a. Feature capability (quantity + category scope) — SSOT is the catalogue row, never the feature's name

**Was:** a feature's behaviour was inferred from its `serviceName`. `adminCreateProjectOrder.js` and `AdminClientWorkspace.js` each held `const ADD_NEW_PAGE_FEATURE_NAME = "Add New Page"` and compared with `===`; `StartNewWebsiteCustomize.js` and `customerCreateCustomProjectOrder.js` held `isPagesFeature()` doing `serviceName.toLowerCase().includes('add new page')`. Only a feature matching that string could be bought more than once, so a new quantity-style feature created from the admin form could never take a quantity — and the live catalogue row was actually named "Add new page", which the two `===` comparisons never matched, leaving the admin counter dead. Category scope was not set anywhere in the Features form, and `AdminClientWorkspace.js` applied no category filter at all, so every feature was offered for every project type.

**Now:** two catalogue fields decide both, set by the admin in `AdminFeatureProductsPage.js`'s `FeatureEditForm`:
- `productModel.isQuantityBased` (Boolean, default false) — true means the project form shows a `+`/`−` counter and the feature is charged `sellingPrice × quantity`; false means a single checkbox charged once. The form exposes it as a Single / Quantity-based radio and relabels the price field "Price per unit (₹)".
- `productModel.compatibleWith[]` (pre-existing field, now writable from this form) — which project categories the feature is offered for, where an **EMPTY array means "all categories"**. The form exposes it as All / Selected categories plus per-category checkboxes.

Every consumer now reads those two fields:
- `adminCreateProjectOrder.js` / `customerCreateCustomProjectOrder.js` — quantity comes from `feature.isQuantityBased ? Math.max(1, requested) : 1`, both controllers using the identical mapping; the feature query uses the shared `helpers/featureCatalogue.js`.
- `AdminClientWorkspace.js` (`CreateProjectForClientForm`) — counter and estimate keyed off `isQuantityBased`; the dropdown is filtered by `isFeatureForCategory()` and clears `selectedFeatureIds`/`featureQuantities` when the category changes, so a stale selection can't reach an order the backend would drop.
- `StartNewWebsiteCustomize.js` — see §4b.

**Category rule is shared, not re-derived per caller:** `backend/helpers/featureCatalogue.js` exports `featureCatalogueFilter(category)` (the Mongo `$or`: tagged with the category, `$size: 0`, `$exists: false`, or `null`) and `frontend/src/helpers/projectCategoryOptions.js` exports `isFeatureForCategory(feature, category)` (the JS predicate) — the two halves are deliberately kept in step, since a shape one side allows and the other rejects would show a feature the order then silently drops. `projectCategoryOptions.js` is also the SSOT for the four project categories (`AdminClientWorkspace.js`'s `PROJECT_CATEGORIES` now points at it). Do **not** use `helpers/compatibleWithOptions.js` for this — that older list still carries `web_applications`/`mobile_apps`, which match no live project category.

**Two latent bugs fixed in the same pass** (both dormant only because quantity could never exceed 1):
- *Invoice double-charge.* `downloadInvoice.js:96` prints `originalPrice × quantity`, but `adminCreateProjectOrder.js` was writing the already-multiplied total into `orderItems[].originalPrice`. 5 × ₹499 rendered as ₹12,475 instead of ₹2,495. Both project controllers now put the **unit** price in `originalPrice` and the total in `finalPrice` — the convention `createOrder.js` already used.
- *Snapshot dropped quantity.* `projectSnapshot.features[]` in `orderProductModel.js` declared only `featureId`/`name`/`price`, so the `quantity` the controllers sent was silently discarded by strict mode. The subdocument now declares `quantity` (default 1) and `unitPrice`, so the frozen record never has to divide to recover the rate.

### 4b. Customer custom-project form (`StartNewWebsiteCustomize.js`) — pages are an ordinary feature

**Was:** website pages were a hardcoded special case. `isPagesFeature()` matched by name, and that one feature was **auto-included in every order without the customer selecting it** (`chosenFeatureIds` filtered on `isPagesFeature(f) || selected`), rendered as an always-on counter labelled "Website Pages" instead of its own name, forced to `MIN_PAGES = 4`…`MAX_PAGES = 99`, always counted in the estimate, and sent as a separate `pageCount` field that the backend clamped and wrote to `projectSnapshot.totalPages`. A customer could not order a project without paying for at least 4 pages, and no other feature could ever take a quantity.

**Now:** every capability is an ordinary optional feature — the category base price is the package the customer already pays for, and extra pages are just a named line item on top. `isPagesFeature`/`MIN_PAGES`/`MAX_PAGES`/`pageCount` are gone; `MIN_QUANTITY = 1`/`MAX_QUANTITY = 99` bound any quantity-based feature. Each feature is a checkbox that, once ticked *and* if `isQuantityBased`, reveals a `+`/`−` counter; selected chips read `Feature ×5`; the estimate is `sellingPrice × quantity` over selected features only. The request body sends `featureQuantities` (same shape `adminCreateProjectOrder.js` accepts) instead of `pageCount`, and `projectSnapshot.totalPages` is **no longer written by this flow** — the count lives in `projectSnapshot.features[].quantity` (the admin flow never populated `totalPages` either). `orderItems[].quantity` was hardcoded to `1` here and now carries the real quantity.

**Still name-based, deliberately out of scope:** the *catalogue-product* purchase flow (`createOrder.js`, `DirectPayment.js`, `ProjectDetailView.js`, `QuantitySelector.js`, `DraftOrderCard.js`) still matches `'add new page'` by name. That flow computes `additionalQuantity` against a product's own `totalPages` (pages included in the package) and is a separate system from custom projects.

---

## 5. Service Plans / Add-on Services

### Schema & lifecycle
- `productModel.servicePlan{}` confirmed live fields: `planType`, `limitScope`, `manualUnit`, `manualCount`, `portalAccessCount`, `filesLimit`, `validityUnit`, `validityValue`, `validityInDays`, `billingCycle` (includes `every_2_years`…`every_5_years`), `serviceBehavior` enum (`portal_access_control` | `reminder_only`, legacy) — **plus, already implemented despite doc 56 calling this unbuilt**: `timing` enum (`during`|`during_and_after`|`after`), `dependency` enum (`project_required`|`standalone_or_project`|`standalone_only`), `capability` enum (`upload_data`|`send_reminders`), `purchaseType` enum (`one_time`|`recurring`), `monthlyReferencePrice`, `billingOptions[]`. Top-level `isServicePlan: Boolean` flags a catalogue row as a service.
- `orderProductModel` additive fields: `linkedProjectOrderId` (ObjectId ref order, null = standalone, set = add-on — the **only** project↔service link, no mapping model), `addedDuringProjectPhase` (`in_progress` | `after_completion`, re-derived server-side from real progress, never trusted from client), `servicePlanSnapshot{}` (frozen config at purchase, includes `serviceName` — added so a purchase survives the catalogue plan being deleted/retired later), `servicePlanStartDate/EndDate`, `serviceCurrentCycleNumber/Start/End`, `serviceAccessUsedInCycle/Total`, `serviceCycleHistory[]`, `servicePlanStatus`.
- Admin create: `createServicePlan.js`, route is **`POST /admin/services/create`** (not `/api/admin/plans/create` as older docs state — renamed during a later "Add-on Service" pass).
- **`AdminCreatePlanPage.js` is dead** — file only exists in a backup folder, not registered in `adminRoutes.js`. Admin plan/service creation now goes through `components/AddServiceModal.js` (referenced live in `ProjectDetails.js`, `ServicePlanDetail.js`, `common/index.js`), not a dedicated create-page.
- Admin catalogue list: `AdminPlanProductsPage.js` (`/admin-panel/website-management/plans`, `GET /api/admin/plan-products`) — query is `$or: [{category:'website_updates'},{isServicePlan:true}]`, `retiredAt: null` unless `?includeRetired=true`, `archivedAt: null` unconditionally (archived never resurfaces anywhere, even Retired tab).

### Purchase paths (customer)
- Standalone: `StartNewProject.js` → `ServicePlanDetail.js` (`/service-plan-detail/:planId`) → `customerCreateServicePlanOrder.js` (`POST /api/customer/service-plan-order`).
- Project add-on, single service: `ProjectDetails.js` "Add a Service" card → same detail/purchase flow, `linkedProjectOrderId` set, phase re-derived from real project progress server-side.
- Project add-on, multi-select: `components/AddServiceModal.js` (popup, not a page) → `customerCreateServicePlanOrdersBulk.js` (`POST /api/customer/service-plan-orders-bulk`) — validates every plan + whole-batch wallet cover **before** taking any money; rolls back compensatingly on mid-batch failure.
  - After either payment path (`handlePay`'s wallet-only branch, or `handleVerifyUpi`'s UPI branch) sets `purchasedSummary` and shows the in-modal success screen, a `setTimeout(() => onClose?.(), 1800)` auto-closes the modal ~1.8s later. Was: the modal stayed open on the success screen until the customer manually clicked "Done" (still present for an immediate close) — reported as feeling like the payment "didn't redirect." `onPurchased?.()` (order/wallet refetch) is unchanged and still fires immediately, before the close timer.
- Shared pricing/snapshot logic: `backend/helpers/servicePlanPurchase.js` (both single and bulk paths call this — never duplicate the price/duration/cycle/snapshot logic).
- Eligibility (`canAddService`): excludes only `pending-approval`/`payment-rejected` projects. A service is always paid in full, links to the project **at payment time**.

### Payment batches (multi-service wallet+UPI/combined) — `paymentBatchModel`
- Problem solved: `transactionModel.orderId`/`.invoiceId` are single refs; one UPI payment covering N service orders would strand N-1 pending forever.
- **A batch is an approval group, not a payment** — it lives in `backend/models/paymentBatchModel.js`, never in `transactionModel`. Fields: `batchRef` (unique), `upiTransactionId`, `totalAmount`, `walletPart`, `upiPart`, `paymentMethod` (`upi`|`combined`), `linkedProjectOrderId`, `orderIds[]`, `childTransactionIds[]`, `status` (`pending-approval`|`approved`|`rejected`) + verify/reject audit fields.
- Real money stays in **child transactions** — one per service, each with its own `orderId`/`invoiceId` and `parentTransactionId` = the batch's `batchRef`. Approving/rejecting the batch settles every child through the **unchanged** single-order path (`applyApprovedOrderPayment` / `rejectLinkedOrderPayment`).
- **Why not a transaction row** (this was the earlier design and is what it fixed): a transaction means "one payment applied to one order," and `transactionService.js` line ~53 infers `isWalletRecharge = !isInstallmentPayment && !orderId`. A batch has N orders, so as a transaction it needed `orderId: null` — which forced explicit `type`/`sourceType`/`paymentStatus` overrides to stop it being classified a wallet `deposit` (which would have **credited** the customer's wallet on approval), and still surfaced in the admin ledger as a nameless `Payment · UPI` row grouped under **"Wallet / General Payments"** (`paymentLedger.js` groups by `item.orderId`, so an `orderId`-less row lands in the wallet bucket). Moving it out of `transactionModel` restores the invariant that **every transaction row is one real payment against one order** — verified: the only `orderId: null` transactions left are genuine `type: "deposit"` wallet recharges.
- Split decided server-side: `walletPart = min(balance, total)`, wallet allocated sequentially across services (whole-rupee shares). Fully wallet-covered ⇒ instant activation, **no batch created**. Any UPI remainder ⇒ all services `pending-approval` together.
- Settlement endpoints are shared: `POST /wallet/approve-transaction` / `reject-transaction` resolve the id against `transactionModel` first, then `paymentBatchModel.batchRef`. `isBatchChild()` **blocks settling a batch child individually** (a batch is all-or-nothing) — approving one child would strand its siblings.
- Admin UI: `getAdminUserWorkspace.js` returns a `paymentBatches` array (with `orderIds`/`linkedProjectOrderId` populated for naming). `paymentLedger.js`'s `buildBatchLedgerItems()` lists only `pending-approval` batches (once settled, the children carry the outcome, so listing the batch too would duplicate the row). `AdminPaymentRecordDetail.js` renders each pending batch on **every order it paid for**, with an `actionTarget.type === "paymentBatch"` review modal; children of a pending batch are hidden from the per-order lists so no refused action is ever offered.
- **Pre-existing bug fixed alongside** (`transactionApprovalController.js`): rejecting a **combined** single-service/project payment never refunded the already-debited wallet portion. The wallet debit stores the UPI leg's id in its `parentTransactionId`, but in `customerCreateServicePlanOrder.js`/`customerCreateCustomProjectOrder.js` the UPI leg **is** the parent (that shared id is its own `transactionId`; its `parentTransactionId` is `null`) — so the refund query, which only ever checked `transaction.parentTransactionId`, matched nothing and the customer silently lost the money. Now `refundWalletPortionsFor()` (one shared helper, replacing the inline block) is called for both the transaction's own id and its parent id; it is idempotent on `transactionId`, so the double call never double-refunds. Confirmed pre-existing by re-running the regression suite against the pre-refactor file.
- Verification scripts (read-only, self-cleaning): `backend/scripts/verifyPaymentBatchFlow.js` (25 checks — batch approve/reject/combined-refund, child-guard, invariant) and `backend/scripts/verifyNonBatchPaymentRegression.js` (15 checks — single-service wallet/UPI/combined approve+reject, proves the non-batch paths are untouched).

### Project-bound service workspace
- When a project has 1+ linked service orders, `GET /api/order-details/:orderId` returns `linkedServices` and `ProjectDetails.js` renders `components/ProjectServiceWorkspace.js` instead of the plain timeline — linked services listed first (active → waiting → paused → inactive/expired), project row last.
- Routes: service detail nests under the project (`/project-details/:projectOrderId/services/:serviceOrderId`); the plain project timeline is still reachable directly via `/project-details/:orderId?view=project`.
- `linkedProjectOrderId` is the only relationship — no separate mapping model.

### Retire / delete / archive lifecycle (current — one lifecycle, no third tab)
- `productModel` additive: `retiredAt`/`retiredBy`, `archivedAt`/`archivedBy` (all default null). `hiddenBeforeRetire` was tried then **removed** — no longer exists.
- **"Remove" IS disable, "Restore" IS enable** — no separate availability toggle exists on the Plans page any more.
- Admin "Remove" (`retireOrDeletePlan.js`, `DELETE /api/admin/plans/:planId`): counts real orders server-side — **0 purchases → hard delete**, **1+ → retire** (sets `retiredAt`, `isHidden: true`).
- "Restore" (`reactivatePlan.js`, `POST /api/admin/plans/:planId/reactivate`): always sets `isHidden: false` (no remembered prior state).
- "Delete Forever" (`purgePlan.js`, `POST /api/admin/plans/:planId/purge`) — only reachable from the Retired tab. Two modes: `archive` (default, sets `archivedAt`, row kept so orders/invoices stay whole, hidden from every list including Retired) or `hard` (real `findByIdAndDelete`, requires retyping the exact plan name).
- Plans page: two tabs only — **Active Plans** (status badge "Active", action Remove) and **Retired Plans** (status badge "Disabled", actions Restore / Delete Forever).
- `retiredAt`/`archivedAt` filters applied in `getProduct.js`, `getAllProducts.js`, `getAdminPlanProducts.js` (`?includeRetired=true` opts back in).
- The pre-existing **unguarded** `DELETE /api/delete-product` now also refuses deletion of anything with purchases — protects all products, not just plans.
- `hideProduct.js`/`unhideProduct.js` reject a retired or archived plan server-side (prevents bypassing the lifecycle via the old direct routes).
- Display-name resilience: `helpers/orderPresentation.js`'s `getOrderDisplayName()` reads product → snapshot → `orderItems` → fallback, so an order can render its name even after its catalogue product is gone. `backend/scripts/backfillServicePlanSnapshotName.js` fills old orders **from the invoice line**, never from the product (avoids recreating the dependency).

### Fixed-tenure service billing (current)
- Recurring service purchases require both a billing period and a total tenure. `servicePlanPurchase.js` derives the immutable `serviceTotalCycles = tenureMonths / serviceBillingCycleMonths`; invalid/non-whole combinations are rejected server-side. The standalone purchase page and project add-service modal enforce the same required tenure rule.
- `serviceBillingSchedule.js` is the cycle-calculation SSOT. New service orders persist the cycle price, total/completed cycle counters, current cycle dates and next billing date. Legacy records with no `serviceTotalCycles` retain their old auto-renew behaviour and are not guessed/migrated by request-time code.
- `servicePlanRenewalCron.js` creates only the next due `plan_renewal` invoice. A paid cycle is settled by `serviceCycleSettlement.js`, which appends the immutable cycle history entry, advances the next billing date, and lets the final already-paid cycle remain active through its end date; the cron then marks the term expired without creating another invoice.
- Every fixed-tenure service receives one `service_statement` live billing statement via `serviceBillingStatement.js`. It aggregates the contracted total, paid total and completed-cycle count, while individual cycle invoices remain the only payment targets.
- The existing activation/enforcement gaps remain: a dormant `after` service is not automatically activated at project completion, upload/reminder allowance enforcement is not complete, and no admin UI exists to manually close a live service.

### 5a. The LEGACY plan system — superseded, still wired in, zero live orders (audited 2026-09-23)

**Read this before touching anything plan-shaped.** The old `website_updates` plan system was replaced by service plans (§5) but never removed, so the codebase carries two plan systems at once. Live data has **0 orders and 0 products** of the legacy kind — every legacy code path below is unreachable today.

- **Its markers**: product-side `isWebsiteUpdate`, `category: "website_updates"`, `updateCount`, `validityPeriod`, `isMonthlyLimitedPlan`, `isMonthlyRenewablePlan`, `yearlyPlanDuration`, `monthlyRenewalCost`; order-side `updatesUsed`, `totalYearlyDaysRemaining`, `currentMonthExpiryDate`. Seeing any of these means you are in legacy code.
- **Its footprint**: ~10 frontend files and ~21 backend files. It is not one stray check — it includes a whole renewal subsystem (`autoRenewalCron.js`, `renewMonthlyPlan.js`, `createRenewalOrder.js`, `checkRenewalStatus.js`, `validateUpdatePlan.js`, `getUserUpdatePlans.js`) that only ever fires for legacy plans and so never fires at all.
- **The trap**: legacy is usually the **fallback branch**, so it reads as the normal case. `orderPresentation.js`'s plan summary, `isFinishedItem`, `PlanDetails.js` and `OrderPage.js` all check service-plan first and fall through to legacy — the legacy half looks live but cannot execute. `UserUpdateDashboard.js` is built on legacy **dummy data** outright.
- **Consequence**: any new plan feature modelled on what these files appear to do will be built on a dead shape. Model it on the service-plan branch (§5, §7a) only.
- **Do not bulk-delete it** — that is a separate, deliberate decision; several of these files also serve live non-legacy paths. Recorded here so it is recognised, not so it is ripped out mid-task.

---

## 6. Payments & Invoices

### Core principle (binding, current)
- **Wallet = customer's own already-approved money → debited instantly, no approval needed.**
- **UPI = new external money → always goes to admin approval.**
- A full/partial order is created **only when the customer actually pays** (not before).
- Shared helper: `backend/helpers/transactionService.js` — `createPaymentTransaction` (pending), `deductWalletInstant` (atomic guarded debit, race-safe), `refundWalletInstant`, `creditWalletInstant` (admin deposit/credit).
- Shared instant-pay endpoint for existing orders/installments: `walletPayInstant.js` (`POST /api/wallet/pay-instant`) — supports partial (wallet+UPI combined) and settles `invoiceModel` invoices.
- **UPI evidence SSOT (new payments only):** `transactionModel.paymentEvidence` owns a real UPI reference (`upiReference` + normalized `upiReferenceKey`), capture channel, and capture time. `backend/helpers/upiPaymentEvidence.js` validates the client-standard 12+ digit reference and rejects reuse; its partial unique index protects concurrent new writes without changing old records. The legacy `upiTransactionId` remains compatibility-only because historical wallet/admin rows also contain synthetic non-UPI identifiers. Customer payment creation, generic verification, renewals, admin manual invoice/project records, and admin wallet recharges use this rule.

### Payment totals SSOT — `helpers/orderPaymentTotals.js` (binding, current)
- **"How much has this order/invoice actually received" is DERIVED from completed transactions — never accumulated by hand.** `sumReceivedFromTransactions`, `getOrderAmountReceived`, `getInvoiceAmountReceived`, `deriveInvoiceStatus`.
- Counting rules, each verified against live data before being written: only `status: "completed"` counts (a `pending` payment has not arrived); `refund` subtracts; `deposit` never counts (wallet recharge — all 15 in data carry `orderId: null`); **`renewal` never counts toward the order total** (recurring money for a later cycle — one legacy plan order priced ₹3,000 carries ₹18,000 of renewal transactions, so counting them reported it as massively overpaid). Renewal money is tracked per cycle by `serviceCycleSettlement.js` and the invoice it settles.
- **Was**: `markProjectInvoicePaid()` did `invoice.amountPaid += amountNow` and `reverseProjectInvoicePayment()` did `-= amountNow`, trusting each caller's arithmetic across nine separate write sites. Any caller that ran twice double-counted, and any caller that ran and then threw left the invoice crediting money that never completed. **Now**: both derive from the transactions linked to the invoice, so a repeated settle is idempotent and pending money can never present as paid. Because all nine write paths route through these two helpers, fixing them fixed every path at once — no per-file edits were needed.
- The blind-arithmetic fallback survives for one case only: an invoice with **no** transaction rows at all (legacy manual settle). It is gated on `countDocuments({invoiceId})`, deliberately **not** on `derived > 0` — a linked-but-pending payment derives to exactly 0, and falling back there would recreate the original bug. This was caught by `verifyPaymentSsotFlows.js` Case 1 failing on the first attempt, not by review.
- Verification: `backend/scripts/verifyOrderPaymentTotals.js` (15 checks — counting rules, status derivation, plus three live-data invariants) and `backend/scripts/verifyPaymentSsotFlows.js` (13 checks — end-to-end against the real helpers using throwaway records it deletes afterwards).

### Invoice SSOT
- **Every project order gets an `invoiceModel` invoice at creation** — all three creation paths (`createOrder.js` gated to `isWebsiteService`, `adminCreateProjectOrder.js`, `customerCreateCustomProjectOrder.js`) call the shared `createProjectInvoice()` in `backend/helpers/paymentRecording.js`. Only installment #1's invoice is created up front; #2/#3 are created due-based when actually paid, via `backend/helpers/installmentSettlement.js`'s `settleInstallmentInvoice()` (shared by `walletPayInstant.js` and `transactionApprovalController.js`).
- Legacy monthly plans remain on the separate `monthlyInvoiceModel`. New service-plan purchases and their fixed-tenure renewals use `invoiceModel`: initial cycle invoice (`project` for compatibility), subsequent `plan_renewal` invoices, and one non-payable `service_statement` per order.
- `invoiceModel.js` confirmed fields: `userId`, `orderId`, `invoiceNumber` (unique), `invoiceType` enum `["project", "project_final", "plan_renewal", "service_statement"]` (partial unique indexes enforce one `project_final` and one `service_statement` per order), `amount`, `amountPaid` (running total, default 0), `status` enum `["unpaid","partially_paid","paid","overdue","cancelled"]`, `invoiceDate`, `dueDate`, `paidDate`, `installmentNumber`, `serviceCycleNumber`, `lineItems[]`, `paymentMethod`, `transactionReference`, `notes`, `internalNote`, `markedPaidBy`.
- **Settlement is always derived, never hardcoded**: `markProjectInvoicePaid()` (`paymentRecording.js`) derives status from `amountPaid` vs `amount`, accepts an `existingTransaction` param so a wallet-instant payment settles through the SAME transaction (never a duplicate). `markInvoicePaidAndResumePlan()` (`invoiceLifecycle.js`) is the separate settle path for `monthlyInvoiceModel` only — both `walletPayInstant.js` and `transactionApprovalController.js` route by `invoiceType` to the correct one.
- **Project payment surfaces — three, not one (corrects the earlier "one canonical pay surface" claim).** All three post to the same two endpoints (`/wallet/pay-instant` for the wallet part, `/wallet/verify-payment` for the UPI part) but each builds its own payload, wallet/UPI split, QR step and error handling:
  - `InvoiceDetailPage.js` (`/invoice-detail/:invoiceId`) — pays a known invoice; sends `invoiceId` + `orderId` + `sourceType:'invoice'`. `ProjectDetails.js`'s "Payment Pending" banner routes here (via `order.unpaidInvoice`).
  - `InstallmentPayment.js` (`/installment-payment/:orderId/:installmentNumber`) — pays an installment with **no `invoiceId`**, only `orderId` + `installmentNumber`. This is why it still exists: `walletPayInstant.js`'s order-mode branch calls `settleInstallmentInvoice()`, which **finds or creates** that installment's invoice. Installment #2/#3 have no invoice until they are paid, so a surface that requires an `invoiceId` cannot start their payment. `OrderDetailPage.js` exposes only `order.currentInstallment` as payable, including an admin-deferred first installment; `InstallmentPayment.js` repeats that guard for direct URLs. `PaymentAlert.js`'s fallback route points here.
  - `DirectPayment.js` (`/direct-payment`) — rejected-order retry, reads `location.state.paymentData`/`retryPaymentId`.
  - **Known duplication, not yet fixed**: the payment logic + modal markup is copied across these three (and the QR/verify UI again in `AddServiceModal.js`, `ServicePlanDetail.js`, `StartNewWebsiteCustomize.js`, `WalletDetails.js`, `WalletRecharge.js`, `RenewalModal.js` — 9 files with their own `QRCodeSVG` block). A shared payment component is the agreed direction; nothing shared exists today, so a payment-rule change must be applied in every copy.
- Partial-payment settlement for installment #2/#3 uses the same shared path via `backend/helpers/installmentSettlement.js` (`settleInstallmentInvoice()`), called by both `walletPayInstant.js` and `transactionApprovalController.js`.

### Invoice documents (PDF) — one generator, one route
- **What a document looks like is decided by `invoice.invoiceType`, never by who is asking for it.** Was: an admin-only route rendered a `project_final` invoice through `generateProjectFinalInvoicePdf.js` (totals + payment history) while the customer route rendered the **same invoice** through `generateInvoiceDocumentPdf.js` (line items, no history) — one invoice, two different papers depending on the viewer. Now: `backend/helpers/generateInvoiceDocumentPdf.js` is the only generator, branching on type — `project_final`/`service_statement` get the statement layout (carried over verbatim from the admin generator, so the admin's document is unchanged), everything else gets the invoice layout. `generateProjectFinalInvoicePdf.js` was deleted.
- **`backend/controller/invoice/invoiceDocumentController.js` is the only load path.** It exports `loadInvoiceDocument()` — resolves against `invoiceModel` then `monthlyInvoiceModel`, populates `orderId` **without a `select`** (a narrowed select blanks the project name, since `getOrderDisplayName()` reads `projectSnapshot`/`productId`/`servicePlanSnapshot`), enforces "admin, or the invoice's own user", and loads the order's completed `payment`+`renewal` transactions when the invoice is a statement.
- Routes: `GET /invoices/:invoiceId/view` and `/download` serve customer and admin alike. The admin-only `/admin/project-final-invoices/:invoiceId/download|view` pair was **retired**; only `POST /admin/project-final-invoices/:invoiceId/resend` remains (emailing is an admin action), and it builds its attachment from the same shared loader + generator.
- Frontend: `AdminClientWorkspace.js` and `AdminPaymentRecordDetail.js` call `SummaryApi.invoices.downloadDocument/viewDocument` with no per-type branching; `SummaryApi.projectFinalInvoice` is now only used for `resend`. `InvoiceDetailPage.js` was already on this route and was not changed.
- **Per-installment invoice PDFs are deliberately not offered.** A project states itself once, in its `project_final` invoice (total, every installment, what is paid) — an installment invoice is a payment target, not a document. Admin: `AdminClientWorkspace.js`'s per-record Download button is hidden when `invoice.invoiceType === "project"` (plan/service cycle invoices keep theirs). Customer: `InvoiceDetailPage.js` shows View/Download/Share only when `isStatement` (`project_final`/`service_statement`), so a paid installment renders no document buttons.
- **Still not SSOT (known, unfixed)**: `generateMonthlyInvoicePdf` (`helpers/emailService.js`) is a third live generator used by email/cron and by `downloadPaymentRecordInvoice` (`monthlyInvoiceController.js`) — that admin per-record download **looks up project invoices in `monthlyInvoiceModel`**, where they do not exist, so it always fails ("This payment record does not have a linked invoice"). It is unreachable today only because the button above is hidden. `controller/user/downloadInvoice.js` (`GET /download-invoice/:orderId`) is a fourth generator with no caller at all.

### Approval rules (binding, current)
- **A project order can never be approved without a real payment on record — no exceptions.** `approveProjectOrder.js`'s `APPROVAL_MODES` is only `["approve_with_payment", "reject"]` — the earlier `approve_no_payment` mode was removed entirely, along with `AdminClientWorkspace.js`'s "Approve without Payment" button and `adminCreateProjectOrder.js`'s payment-less-approval path.
- Customer-paid orders (transaction already submitted, full/installment/wallet+UPI): approved/rejected in **Payment & Invoices tab** → `AdminPaymentRecordDetail.js` → `transactionApprovalController.js`.
  - **Two separate components live in this one file**: `SinglePaymentRecordDetail` (deep-linked single-record page) and `AdminPaymentRecordDetail` (the ledger-list page, which already had a review modal before opening `openAction("transaction", ...)`). Was: `SinglePaymentRecordDetail`'s "Accept Payment"/"Reject Payment" buttons called `handleApproveTransaction`/`handleRejectTransaction` directly on click — no confirmation step, so a single click immediately approved/rejected real money. Now: both buttons only set a `confirmAction` state (`"approve"`/`"reject"`); a small Yes/Cancel popup renders the amount and only calls the real handler when "Yes, Confirm" is clicked. The handlers themselves are unchanged.
  - **An approval is all-or-nothing** (`approveTransaction`). Was: `applyApprovedOrderPayment()` (invoice + order settlement) ran FIRST and the transaction was only marked `completed` afterwards — so anything that threw in between left the invoice already marked **paid** while its transaction stayed **pending**. The order was then unapprovable forever: the retry hit the invoice-balance guard (`"Transaction amount exceeds the invoice balance"`) because the invoice had no outstanding amount left. This was not theoretical — it is exactly what happened to a live service order (`settleServiceCycle` → `getCycleDates` threw `"Service billing cycle is missing"`). Now: the transaction is marked `completed` **before** applying the money, and the apply runs inside a `try` whose `catch` restores `status`, `paymentStatus`, `verifiedBy`/`verificationDate` **and reverses the wallet balance change already applied above** (`walletDelta`), then rethrows. A failed approval leaves nothing half-written and can simply be retried once the cause is fixed.
  - **`getCycleDates(service, 1)` no longer requires a billing-cycle length** (`helpers/serviceBillingSchedule.js`). Cycle 1's window is written at purchase by `servicePlanPurchase.js` from the plan's own validity; `serviceBillingCycleMonths` is only set when the customer picks one of the plan's `billingOptions`, so a plan sold on plain validity has none. Demanding it while settling the FIRST cycle is what threw mid-approval. Cycle 2+ still requires it (it must be projected forward) — guard verified still in place.
  - One-time repair for orders already broken this way: `backend/scripts/repairHalfApprovedInvoices.js` (dry-run by default, `--apply` to write) resets an invoice's `amountPaid`/`status` to its completed transactions. **Scope is deliberately narrow** — only invoices that have a still-`pending` transaction pointing at them. An earlier draft scanned every invoice with `amountPaid > 0` and would have reset **40 genuinely paid invoices to unpaid**, because historical transactions are joined by `orderId`, not `invoiceId`; the dry-run caught it before any write. One live invoice was repaired.
- Genuinely payment-less orders (customer "Pay Later" / admin-deferred): approved in **Projects tab** → open the pending project → approval bar (`POST /api/admin/projects/:orderId/approval`, `approveProjectOrder.js`) — Record Payment or Reject only.
- An order with an already-submitted pending transaction is excluded from the Projects-tab approval bar (`isPendingApproval` excludes `hasPendingTransaction`) — shows a neutral info banner instead, to prevent double-recording the same payment.
- **Progress-gate thresholds**: `installmentSchema.progressThreshold` (Number, nullable, 0-100) lets a later installment be gated by real `projectProgress` % instead of a hardcoded 40%/75%. Defaults: 2-split → `[null, 90]`; 3-split → `[null, 50, 90]`. Enforced in `projectNodeService.js`'s `appendProjectNode()` via `getBlockingInstallmentThreshold(order)` (admin can't push progress past a due, unpaid installment's threshold); `ProjectDetails.js`'s payment banner prefers `progressThreshold` over the legacy hardcoded values. No admin UI to edit thresholds after creation (creation-time default only).
- `ProjectDetails.js` gates only the upload/request-update **action**, not the whole page: `isUploadLocked = hasUnpaidInvoice || isOrderPendingApproval || isProjectComplete || isOrderCancelled` — the old full-page "Payment Processing" block screen was removed. The same four conditions are now enforced server-side too (`backend/helpers/projectUploadGate.js`, §7a) because `POST /api/user-request-update` is reachable directly.
- **List/badge `hasUnpaidInvoice` now shares the exact same due-installment rule as the detail page.** Was: `getUserOrder.js` (the `ProjectsAndPlans.js`/`CustomerDashboard.js` list feed, via `OrderListRow.js`'s `getItemStatusMeta()`) computed `hasUnpaidInvoice` as "ANY unpaid/overdue invoice exists on this order" — so an admin-created project with installment #1 paid still showed a "Payment Pending" badge because installment #2's invoice legitimately stays `unpaid` until its own `progressThreshold` is reached (this is the exact bug `getOrderDetails.js` had already been fixed for, see §6 core rule above — the list feed just never got the same fix). Now: the due-installment + `progressThreshold` logic lives in `backend/helpers/projectDuePayment.js`'s `getDueUnpaidInvoiceFilter(order)`, used by both `getOrderDetails.js` (unchanged behavior, just extracted) and `getUserOrder.js` (new — scoped to `isWebsiteProject` orders only, batched via one `$or` query to avoid N+1). `getUserOrder.js` additionally `.select()`s `installments`/`currentInstallment` on top of the shared `ORDER_SUMMARY_FIELDS` (Mongoose `.select()` calls merge, not overwrite) rather than adding those fields to `ORDER_SUMMARY_FIELDS` itself, since that constant is also read by `getAdminUserWorkspace.js`/`getMyPaymentWorkspace.js`. Plan orders are untouched (they use `monthlyInvoiceModel`, not this path).

### Admin ledger
- `AdminClientWorkspace.js` → **Payment & Invoices** tab (`PaymentInvoicesPanel`) reads existing `transactions`+`invoices` arrays via the shared `helpers/paymentLedger.js` merge/dedup logic — never a separate admin payment source.
- "Record Payment" (renamed from "Mark Invoice Paid") supports an admin-only `internalNote` (never shown to the customer) — distinct from the customer-payment Accept/Reject verification action.
- Per-project ledger: `WorkspaceDetailSubpage` also renders a read-only Payments & Invoices card scoped to just that order (same `buildLedgerItems()` helper).
- **"Deleted Projects" tab is now an intentional feature, not an accidental gap.** Was: `deleteOrder.js` cascade-deleted `updateRequestModel`/`monthlyInvoiceModel`/`transactionModel`/`partnerCommissionModel` but never touched `invoiceModel`, so an invoice survived as an unlabeled orphan (its `orderId` pointed at nothing) and the tab showed a generic "Deleted Project" string with no way to tell which project it had been. Now: `invoiceModel.js` has additive `deletedProjectName`/`deletedProjectType` fields; `deleteOrder.js` writes them onto every invoice for that order (via `invoiceModel.updateMany`) **before** deleting anything else, using `buildOrderDeletePlan()`'s already-computed `serviceName`/`orderType` — the same one shared code path handles both project and plan deletes, no separate logic needed. (`transactionModel` was hard-deleted at that time; it is now kept too — see §13.) `getAdminUserWorkspace.js` selects the new fields; `helpers/paymentLedger.js`'s `buildLedgerItems()`/`groupLedgerItemsByProject()` fall back to `deletedProjectName` (and carry `deletedProjectType` onto the group) when the live order is gone; `AdminClientWorkspace.js`'s `DeletedProjectsPanel` now shows type (Project/Plan), deleted date, and last payment method instead of just a generic name.
- **The snapshot carries five facts, not two.** Was: only `deletedProjectName`/`deletedProjectType` were written, so the panel had no purchase date (it comes from the order, which is gone) and no delete date at all — the line labelled **"Deleted on"** was actually rendering `group.items[0].date`, the *latest payment* date, which was simply wrong. Now `invoiceModel` also carries `deletedProjectStartDate` (the order's `createdAt`), `deletedProjectDeletedAt` (the real delete timestamp) and `deletedProjectPaymentMethod` (derived in `buildOrderDeletePlan()` from the order's **completed, non-`deposit`** transactions — `"combined"` when several methods were used), all written in the same `updateMany`. Each panel line renders only when its own value is present, since records deleted before this existed can never get one retroactively. **One-time cleanup**: `backend/scripts/purgeOrphanedDeletedProjectInvoices.js` (dry-run by default, `--apply` to write) permanently deleted 29 pre-fix orphaned invoices that had no snapshot and could never get one retroactively.
- `buildOrderDeletePlan()` (`backend/helpers/orderDeletePlan.js`)'s `serviceName`/`orderType` now match the frontend SSOTs instead of a narrower ad-hoc check. Was: `serviceName` only read `productId.serviceName` (blank/generic for a custom client project with no catalog product — see §4's "Create Project for Client" — since its name lives only in `projectSnapshot.displayName`); `orderType` only matched `productId.category === "website_updates"`, missing `service_plan` category orders entirely (add-on services bought via `AddServiceModal.js`), so a deleted add-on service would be mislabeled a "project." Now: `serviceName` follows the same priority as `helpers/orderPresentation.js`'s `getOrderDisplayName()` (`projectSnapshot.displayName` → `productId.serviceName` → `servicePlanSnapshot.serviceName` → `orderItems` → `"Project"`); `orderType` prefers the order-level `isWebsiteProject` field (set at creation, see §4) and only falls back to category-matching (now including `service_plan`, matching `helpers/orderType.js`'s `PLAN_CATEGORIES`) when that field is missing.
- Per-order payment history: `AdminClientWorkspace.js`'s `PaymentOrderHistorySubpage` (opened from a payment group row) is a **split layout** — left column keeps the title + summary table (Category/Started/Total/Paid/Remaining/Payment type/Pending records); right column starts from the same top row and holds a "Combined Invoice" section (the `project_final` statement card, if one exists) above a "Payment Records" section (one card per real payment event). No page-level `border-t` band between title and content — both columns start flush at the grid top. Email/resend actions were removed from both the combined-invoice card and per-record cards (View/Download/Share only) — `handleInvoiceResend`/`handleFinalInvoiceShare` and the `Mail` icon import were deleted as dead code, not just hidden.
- **One invoice can carry several payments — the record list must render one row per payment, not per invoice.** Was: `PaymentOrderHistorySubpage`'s `combinedRecords` built `transactionsByInvoiceId` as a `Map` of invoiceId → **one** transaction, so a later transaction on the same invoice silently overwrote the earlier one and `combinedFromInvoices` emitted a single row. A combined wallet+UPI purchase puts BOTH legs on the same invoice, so for a ₹2,500 service (₹500 wallet completed + ₹2,000 UPI pending) only the wallet row rendered — the pending UPI payment, the one actually awaiting approval, had no row and therefore no "Review Payment" button, making a correctly-created combined payment impossible to approve from this page. The backend was never wrong here: both transactions and the `partially_paid` invoice were correct. Now: the Map holds an **array** per invoice, `linkedTransactionIds` flattens it, and `combinedFromInvoices` uses `flatMap` to emit one row per linked transaction (an invoice with no transaction still emits its single row). Row keys are `invoice-<id>-txn-<id>`. Rendering was already correct and unchanged — each row prefers `transaction.status` over `invoice.status`, so the wallet row reads Paid and the UPI row reads Pending with its Review button.
- `helpers/paymentLedger.js` never had this bug — it keys a `Set` of invoice ids purely to dedup invoice rows and maps every transaction independently, so all legs of a combined payment already appear there.

- **A nameless batch payment no longer appears in the ledger at all** — superseded by §5's `paymentBatchModel`. Was: the multi-service batch parent was a `transactionModel` row with `orderId: null`, so `paymentLedger.js` (which names by `transaction.orderId` and groups by `item.orderId`) rendered it as a bare `"Payment · UPI"` under **"Wallet / General Payments"**, next to the real per-service child rows — reading as a duplicate, unnamed, wallet-style entry for a UPI plan purchase. An interim display-only fix (a `linkedProjectSnapshot` lookup in `getAdminUserWorkspace.js` + an `isServiceBatch` label branch) was built and then **removed** in favour of the structural fix: the batch is no longer a transaction, so no such row exists. `buildBatchLedgerItems()` lists pending batches from the separate `paymentBatches` array instead. Consequence to rely on: **"Wallet / General Payments" now contains only genuine wallet recharges** (`type: "deposit"`), because that bucket is exactly the set of `orderId`-less transactions and no payment can be `orderId`-less any more.

### Recurring-plan resume guard (`monthlyInvoiceModel` only)
- `invoiceLifecycle.js`'s `resumeOrderForPaidInvoice()` no longer resumes a plan order just because the invoice being settled right now is paid — it also checks `monthlyInvoiceModel.exists({orderId, status: {$in: ['unpaid','overdue']}})` first. If a *different* invoice on the same order is still unpaid/overdue, the order stays paused (`isActive: false`) until that one is settled too. Fixes the bug where paying only one of two overdue invoices resumed the plan while the other was still owed. The invoice being settled is already saved as `paid` before this check runs, so it never matches its own query. All 3 live callers (`transactionApprovalController.js`, `walletPayInstant.js`, `monthlyInvoiceController.js`'s `markInvoiceAsPaid`) get the fix automatically — none of them were touched directly.

---

## 7. Orders/Plans Classification Helpers (SSOT — use these, never duplicate)

- `frontend/src/helpers/orderType.js`:
  - `PROJECT_CATEGORIES` (Set: `standard_websites`, `dynamic_websites`, `cloud_software_development`, `app_development`, `web_applications`, `mobile_apps`) + `isProjectItem(order)` — true if `order.isWebsiteProject` or category matches.
  - `PLAN_CATEGORIES = new Set(['website_updates', 'service_plan'])` + `isPlanItem(order)`.
  - `isFinishedItem`, `sortItemsLatestFirst` (rank-based: finished items last, latest-update first).
- `frontend/src/helpers/orderPresentation.js`: `getOrderDisplayName(order, fallback)`, `getOrderCategory(order, fallback)`, `getRemainingDays(order)`, `getItemStatusMeta(order)`, `getItemSummary(order)`, `getItemTypeLabel(order)`, `getItemTypeAccent(order)`. `getOrderDisplayName` priority: `projectSnapshot.displayName` → `productId.serviceName` → `servicePlanSnapshot.serviceName` → `orderItems[].name` → fallback.
- Shared row UI: `components/OrderListRow.js` (`OrderListRow` + `OrderListHeader`) — used by both `CustomerDashboard.js` and `ProjectsAndPlans.js` so list logic/markup never drifts apart. **`ProjectsAndPlans.js`'s layout/status version is canonical** if the two ever need to differ.
- Safety net: `PlanDetails.js` and `ProjectDetails.js` each re-verify their fetched order's actual type after load and self-redirect (`{ replace: true }`) to the correct sibling page on mismatch.
- Project row status derivation (current, real fields only — no static labels): `orderVisibility === 'cancelled'` → `Cancelled` (**checked first**, so a project cancelled at 100% progress does not still read as Completed — see §8a); `orderVisibility === 'payment-rejected'` → `Payment Rejected`; `'pending-approval'` → `Booked`; `projectProgress >= 100` or `currentPhase === 'completed'` → `Completed`; approved + `projectProgress === 0` → `Developer Assigned` (**static label — no real developer-assignment backend exists**); approved + `0 < progress < 100` → `{progress}% Complete`.

---

## 7a. Upload Data / Update Requests (SSOT — three kinds, never two)

One route serves every "Upload Data" action: `POST /api/user-request-update` → `backend/controller/user/submitUpdateRequest.js` (`upload.any()`, files → Drive via `GoogleDriveService`, record → `updateRequestModel`). One modal serves it on the frontend: `components/UpdateRequestModal.js`, opened by `ProjectDetails.js`, `PlanDetails.js` and `UserUpdateDashboard.js`.

**The kind of upload decides where its allowance is read from — `backend/helpers/uploadType.js` is the only place that decides which:**

| Kind | Test | Allowance source | Counter spent |
|---|---|---|---|
| `service` | `order.isServicePlan === true` | `servicePlanSnapshot.portalAccessCount` / `.filesLimit` (frozen on the order, never the catalogue) | `serviceAccessUsedInCycle`, `serviceAccessUsedTotal` |
| `project` | `order.isWebsiteProject === true` | **none — unlimited by design** (portal access during development; no catalogue row, one project per client) | **none** |
| `legacy` | neither flag | `productId.updateCount` / `.validityPeriod` on the catalogue product | `updatesUsed` |

- **Allowance is a frozen number with a used-counter — not a balance, and nothing can raise it** (audited 2026-09-23). Only three writers touch `serviceAccessUsedInCycle`: `submitUpdateRequest.js` (+1 on upload, −1 on rollback) and the cycle/renewal settlers (reset to 0). `serviceAccessUsedTotal` is lifetime, never reset. Enforcement is `used >= snapshot.portalAccessCount`, checked twice — as validation, then as a race-safe atomic reservation (`findOneAndUpdate` + `$expr`). There is **no** admin endpoint or customer flow to grant, buy or extend allowance; more allowance means a new order. Rebuild designed in `plan-system.md` — read it before touching this.
- **`limitScope` is declared but inert.** `productModel.js` enums nine values (`per_day` … `per_year`, `per_plan`, `unlimited`, `manual`) and `createServicePlan.js` validates all nine, but **only `unlimited` changes behaviour** — the other eight are identical, because allowance resets on the **billing cycle**, never on the scope's own window. A plan sold as "5 per day" behaves exactly like "5 per year". Everywhere else the field is a display label only.
- `getUploadKind(order)` reads only the order's own two flags, never `productId` — an order must always be able to describe itself. Live data: 26 orders = 18 project, 8 service, **0 legacy** — the legacy branch here is dead code, like the rest of that system (§5a).
- **Project state gate**: `backend/helpers/projectUploadGate.js` → `assertProjectAcceptsUpload(order)` returns a refusal message or `null`. Each condition is answered by the module that already owns it — cancelled/complete from `orderStatusEngine.getOrderState`, payment-due from `projectDuePayment.getDueUnpaidInvoiceFilter`, pending-approval from `orderVisibility` — never re-derived here, so it cannot drift from `ProjectDetails.js`'s button (§6).
- **Per-request file caps** (`backend/config/uploadLimits.js`): service 100, project 100, legacy 20. These are technical caps (Drive time/memory/timeout), not business allowances.
- The upload is recorded against whichever order supplies the allowance (`updatePlanId`): the selected service when there is one, otherwise the order the modal was opened on. `UpdateRequestModal.js` never auto-selects a service for a **project** — only for a legacy plan.
- Read-back is separate and kind-agnostic: `backend/helpers/orderUploadHistory.js` (`getOrderUploadHistory`, `resolveUploadOwnerIds`) serves both the customer and admin views, and a project also owns the records of every service linked to it. It never touches `productId`, so it was never affected by the bug below.

### External upload links (Phase 3 complete)

- Admin link lifecycle is stored in `externalUploadLinkModel`; there can be only one `active` link per client/order. Regenerate replaces the previous active link, revoke disables it, and only a high-entropy token is shown once. The database stores only its SHA-256 digest.
- `externalUploadToken.js` is the token/URL SSOT. Production uses the existing canonical `FORNTEND_URL`; generated links use `/external-upload#token=...`, so the bearer token is not placed in the request path. Generate responses are `no-store`.
- `externalUploadSession.js` is isolated from the normal portal JWT: it requires `EXTERNAL_UPLOAD_TOKEN_SECRET`, uses an upload-only cookie path and distinguishes `challenge` from `access`, with access authenticated by either `link` consent or `credentials`.
- `externalUploadAccessPolicy.js` re-resolves the live link, customer and order for every protected external request. Therefore revoke/regenerate, client disablement and switching login-free consent off take effect immediately; a credential-verified access session does not depend on login-free consent.
- The client preference controls only whether credential verification may be skipped. It never prevents an admin from generating a link and never grants normal portal access.
- The preference UI lives in `Profile.js` under the customer navigation label **Settings** (`/profile`). Its accessible `role="switch"` control uses a bordered neutral OFF track and emerald ON track so both states remain visible on the portal themes; it persists through `POST /api/my-upload-link-preference`.
- Admin history uses stable cursor pagination (20 by default, capped at 50) backed by `{ customerId, createdAt, _id }`; the UI loads further pages explicitly instead of fetching an unbounded history.
- Public flow: `/external-upload#token=...` immediately removes the fragment, exchanges it through `POST /api/external-upload/exchange`, and continues with the scoped HttpOnly cookie. Consent ON issues restricted link-auth access; consent OFF issues only a challenge, upgraded through `POST /api/external-upload/credentials` after bcrypt verification. `GET /api/external-upload/session` safely resumes either state.
- State-changing public endpoints enforce the same CORS-origin SSOT as the app. Credential failures are counted on the link and temporarily blocked after repeated failures. The normal portal JWT is never accepted as an external-upload session.
- Submission order is fixed: allowed origin → scoped/live access → atomic single-use reservation → shared Multer policy → live access re-check → existing `submitUpdateRequest`. The server overwrites `userId`, `planId` and `serviceOrderId` from the link context; multipart body identifiers are never trusted.
- A single-use link is consumed only after the existing upload controller has persisted a successful request; validation or upload failure releases its reservation. An in-progress single-use submission temporarily blocks revoke/regenerate so it cannot be replaced halfway through persistence.
- Service allowance consumption is now a conditional atomic increment shared by normal portal and external submissions. A failed database save releases the reservation, and failed Drive/database work removes already-uploaded Drive files instead of returning a partial success. Google Drive uploads stream from memory without filename-derived temporary paths.
- The public React page mounts its own `ThemeProvider`, exposes only the selected target, live refusal/limits, credentials form when required, and upload form. It has no `ProtectedRoute`, portal navigation, history, payment, profile or download access.
- Required production configuration: the canonical `FORNTEND_URL` and an independent `EXTERNAL_UPLOAD_TOKEN_SECRET` of at least 32 characters.

### Fixed 2026-09-15 — project uploads crashed with a plan's allowance
- **Before**: the controller knew only two kinds (`isServicePlan ? service : legacy`). A project, being `isServicePlan: false`, fell through to the **legacy** branch, which read `updatePlan.productId.updateCount` — but a project's `productId` is `null` by design (`orderProductModel.productId` is `default: null`, not required). Result: `500 Cannot read properties of null (reading 'updateCount')` at the old L128, reproduced on order `6aa3ae1ea8bbc513b29bedc7`. Three further legacy reads (`isMonthlyLimitedPlan`, `isMonthlyRenewablePlan`, `validityPeriod`) had the same exposure.
- **Also before**: a successful project upload incremented `updatesUsed` — a legacy plan's counter on an order that has no plan (left `updatesUsed: 1` on order `6a8049eebfa39acf49716fc4`). And `UpdateRequestModal.js` auto-selected the customer's first active upload-service for a project, so a project upload could be recorded against an unrelated service order and spend **that** service's allowance; with no service to select it fell back to `LEGACY_MAX_FILE_COUNT`, advertising "Maximum 20 files" on something with no plan behind it.
- **After**: `getUploadKind()` gives the third answer, the project branch checks state instead of allowance and spends no counter, and every legacy read is behind `isLegacyUpload`. Service-plan behaviour is byte-identical — verified across all 8 service orders (same allow/refuse result, counters unchanged).
- **Still open (deliberate, out of that scope)**: a project upload's email/notification still fails silently — `emailService.js` reads `updateRequest.updatePlanId.productId.serviceName` unguarded, which throws for a project, and `submitUpdateRequest.js`'s notification block swallows it (`// Continue execution even if notification fails`). So the 2026-08-15 project upload stored its file but sent no admin email, no customer confirmation and no in-app notification. To be addressed by the planned **centralised notification system** (admin chooses which events notify), not by patching `emailService.js` here.

---

## 8. Trash / Soft-Delete System

- Applies to **leads and clients only** (not orders/projects — those use a separate hard-delete+scan system, §4/§6 above).
- `userModel`/`leadModel` additive: `deletedAt` (Date, null = active) + `deletedBy`.
- **No cron** — purge is lazy: opening `getTrash.js` (`GET /api/admin/trash`) purges anything past the 30-day retention, then lists remaining trashed records badge-tagged with `daysLeft`.
- Deleting a lead (`deleteLead.js`) or client (`trashClient.js`, `POST /api/admin/clients/:customerId/trash`) now soft-deletes; a trashed client also gets `isActive: false` (login blocked via the access-control gate in §2), restored to `true` on restore.
- All lead/client list reads filter `deletedAt: null`: `getLeads.js`, `getAdminClients.js`, both branches of `globalSearch.js`.
- Controllers: `backend/controller/trash/` — `trashConstants.js` (30-day retention helpers), `trashClient.js`, `getTrash.js`, `restoreTrash.js` (`POST /api/admin/trash/:type/:id/restore`), `purgeTrash.js` (`DELETE /api/admin/trash/:type/:id`, "Delete Forever").
- UI: `AdminTrashPage.js` (`/admin-panel/trash`), `AdminClientWorkspace.js`'s Account & Access tab (Delete Client → Move to Trash card).
- Retention (30 days) is a constant — no bulk restore/purge exists.

---

## 8a. Cancellation & Refund System (orders/projects/services)

**The rule: cancel settles the money, delete only removes the record.** Before this existed, deleting was the ONLY way to stop a project — so a customer's money vanished with no refund and no trace (`deleteOrder.js` hard-deleted every `transactionModel` row). Cancelling inserts the step where the money is settled while the payment records still exist.

Lifecycle: `active → cancelled → deleted`. **Cancellation is one-way — there is deliberately no un-cancel**, because the refund has already been paid out; reversing it would mean taking money back, which is a new payment, not an undo.

### Where it lives
- `backend/helpers/orderRefundService.js` — the refund SSOT. `buildRefundBreakdown()` (what was received, per method), `buildRefundSuggestion()` (how much is owed back), `buildPayoutLegs()` (how it splits), `refundOrderToSource()` (does it).
- `backend/controller/order/cancelProjectOrder.js` — `getProjectCancellationPreview` (read-only) + `cancelProjectOrder`. Never moves money itself; calls the engine.
- `backend/helpers/orderLifecycle.js` — `markOrderApproved()` / `canApproveOrder()` / `isOrderCancelled()`. The single place that knows `cancelled` is terminal.
- Routes: `GET /admin/projects/:orderId/cancel-preview`, `POST /admin/projects/:orderId/cancel` (both admin-only).
- UI: `AdminClientWorkspace.js` — Cancel button on all 4 project/plan surfaces (2 list cards + 2 detail subpages) + the cancel modal.

### Schema (all additive)
- `orderProductModel`: `orderVisibility` enum gained `'cancelled'`; `cancelledAt`, `cancelledBy`, `cancellationReason`; `refunds[]` (`method`, `amount`, `transactionId`, `referenceId`, `refundedAt`), `refundTotal`; audit trail `refundSuggestedAmount`, `refundBasis`, `refundExplanation`, `refundMode`, `refundModeReason`.
- `transactionModel`: `deletedProjectName`/`deletedProjectType` (see §13 — transactions now survive delete).
- `notificationModel`: type `'project_cancelled'`.

### How much is refunded (`buildRefundSuggestion`)
The figure is a **suggestion the admin can override**, never a hard rule — but it is always capped at what was actually received.
- **Project, 0% progress** → full refund, automatic (no work started).
- **Project, >0% progress** → suggests the remaining `100 - projectProgress`%, flagged `adminDecides: true`. Progress is not a reliable proxy for spend, so the admin sets the real figure.
- **Service** → pro-rata by days of the *running* cycle (`serviceCurrentCycleStart/End`, `serviceCyclePrice`). Completed cycles were delivered and are not refundable.
- **Service with no cycle data** → falls back to full refund rather than inventing a number.

Every suggestion carries its own `explanation` string ("7 of 30 days used, 23 unused — pro-rata of the current cycle"). **The working is shown, not just the total** — an unexplained figure gets overridden every time, which defeats the point of calculating it.

### How it splits (`buildPayoutLegs`) — three modes
An order's payment legs are already separate transactions with their own `paymentMethod`, so the split is **derived, never remembered by an admin**.
- `source` (default) — same proportion the money arrived in. Last leg absorbs the rounding remainder so parts sum exactly.
- `wallet_first` — fill the wallet leg up to its own original, then the rest.
- `manual` — the admin sets each leg.

**One rule holds in all three: a leg can never receive more than it originally paid.** Sending wallet money out to a bank, or bank money beyond what that bank sent, is not a refund.

**Wallet-excess needs a reason.** If the chosen split puts MORE into the wallet than `source` would, `refundReason` is required — that converts the customer's bank money into credit they cannot withdraw, which is legitimate only if they asked for it. The opposite direction (less into the wallet) needs nothing.

### Wallet vs external legs
- **Wallet** — credited instantly by `refundWalletInstant()` (idempotent on `transactionId`, so a retried cancel never double-credits).
- **Everything else** — the admin sends it by hand and records their own reference id, which is what the customer is told. **A reference id is required for every external leg being paid out, checked before any money moves** — a half-refunded order is worse than one refused outright.

### Ordering (matters, and mirrors the pre-existing rejection path)
1. Invoices/order settlement reversed, **then** the wallet credited — a customer can never hold refunded money while the invoice still reads as paid.
2. Refund runs **before** the order is marked cancelled — a refund that refuses leaves the order completely untouched.
3. `reverseOrderSettlement()` reverses **only the refunded amount**, spread oldest-invoice-first. This matters because `refundWalletInstant` sets no `invoiceId`, so an invoice's derived total never sees the refund — the reversal must state the figure itself. Reversing each invoice's whole `amountPaid` (the full-refund-only version) would wipe an invoice the customer only got half back on.

### Linked services
- Preview lists every attached service (`linkedProjectOrderId`, excluding already-cancelled) with **its own** breakdown and pro-rata suggestion — a service is billed by time, so its refund is its own figure, not a share of the project's.
- **The admin chooses which to cancel** — never automatic.
- A cancelled service gets `servicePlanStatus: 'cancelled'` **and** `serviceNextBillingDate: null`. This is the part that actually stops billing: `cron/servicePlanRenewalCron.js` selects on `servicePlanStatus: 'active'`, so a service left `active` keeps invoicing for a project that no longer exists.
- Service ids are validated as actually-attached **before** anything is written.
- A service that fails mid-loop is **reported in `failedServices`, not rolled back** — the project stays correctly cancelled and the admin retries that service alone. Rolling back would mean un-paying a completed refund.
- `cancelOneOrder()` is shared, so the project and each service close identically.

### Resurrection is blocked (was a live bug)
Four paths flipped an order back to `approved` whenever money settled, none aware cancellation existed — a cancelled project could be silently un-cancelled by a payment. All four now route through `markOrderApproved()`: `walletPayInstant.js` (installment settle **and** full settle), `transactionApprovalController.js` (admin approving a still-pending payment — the worst one, since the admin sees no sign of it), `serviceCycleSettlement.js` (a service's first cycle).

`walletPayInstant.js` also refuses a cancelled order **at the door** rather than taking money and declining to approve it further down. `canAddService` is gated on `cancelled` in both `ProjectDetails.js` and `customerCreateServicePlanOrder.js` — the backend had no project-status gate there at all before.

### Customer side
- `getItemStatusMeta()` (`orderPresentation.js`) returns a **"Cancelled"** badge, checked first so a project cancelled at 100% does not still read as Completed. One SSOT, so every list picks it up. `getItemSummary()` returns blank for cancelled.
- `ProjectDetails.js` renders a cancellation banner (reason + every refund leg + reference id) that outranks all payment banners; uploads are locked.
- Wallet refunds already rendered correctly in `WalletDetails.js` (`type: 'refund'`) — nothing was needed there.

### Verification scripts
Behaviour is covered by throwaway tests written during the build (not committed): refund breakdown counting rules, reference-id and ordering guards, the three split modes and their limits, the wallet-excess reason guard, suggestion figures, resurrection guards, service cancellation + billing stop, and the delete gate.

---

## 9. Client Documents System

- Owner is the **client (`userModel`), not an order/node** — so a demo client with no running project still has one place to receive an agreement.
- `userModel.documents[]` (`clientDocumentSchema` — Google Drive shape + `source` enum `agreement|general` + optional `orderId`/`nodeId` back-links, currently unused for actual node-upload).
- Controllers (`backend/controller/user/`): `uploadClientDocument.js` (`POST /api/admin/clients/:customerId/documents`, admin, `upload.any()` → Drive via `GoogleDriveService`), `getClientDocuments.js` (`GET /api/my-documents`, customer), `getAdminClientDocuments.js` (`GET /api/admin/clients/:customerId/documents`, admin).
- Both read controllers call `backend/helpers/clientDocumentsTimeline.js`, which merges `userModel.documents[]` + the converted lead's `proposals[]`/follow-up attachments (linked via `convertedToUserId`) into one newest-first timeline — two owners, one merged view, never duplicated in the DB.
- UI: `AdminClientWorkspace.js` → **Documents** tab (`ClientDocumentsPanel`); customer-facing `/documents` route → `CustomerDocuments.js`.
- Deferred: attaching a document during a project-node update (schema/controller already accept `nodeId`/`orderId`, node UI doesn't upload files yet).

---

## 10. Chess (known behavior/bugs)

- Chess is the **only** feature using a live WebSocket (`socket.io-client`, `frontend/src/chess/useChessSocket.js`) instead of HTTP.
- Backend auth (`backend/chess/chessSocket.js`) relies solely on the `token` httpOnly cookie during the socket handshake — no fallback token path.
- **Unresolved bug**: on iPhone/Safari, buttons appear dead — iOS Safari's ITP is stricter about `SameSite=None` cookies during WebSocket handshakes than ordinary fetch/XHR, so the cookie often doesn't attach and the connection silently fails. No UI surfaces the `connected`/`errorMessage` state from `useChessSocket.js`, so a failed connection is indistinguishable from "nothing happened." Three fixes were evaluated and paused: client-exposed JWT fallback (rejected, weakens sitewide `httpOnly`), same-site reverse proxy (needs hosting changes), chess-scoped low-privilege token (safest, paused at owner's request).
- **Fixed**: `chessRoomManager.js`'s `getPlayerColor()` now correctly reads `._id` from populated player docs (previously compared a populated `{_id,name,email}` object directly against a raw ObjectId and always failed once `players.white`/`black` were populated).
- Chess now uses `DashboardLayout` (previously had no shell/sidebar at all) and a branching Typeform-style lobby flow (`ChessLobby.js`) instead of three static forms.

---

## 11. UI Design System (conventions to follow — not optional)

### 11a. Theme system — three modes, customer portal only (current)

**Before**: every customer page hard-coded its colours and painted `BG.png` itself — ~2000 class occurrences across 26 pages and 15 components, including a second "light-glass" tier (`bg-white/55` + `text-black`) that stayed white even in the dark portal. One look, no way to change it.

**Now**: colours come from CSS variables keyed off `data-theme` on `<html>`. Three modes:

Listed here in the order the picker shows them, which is the order of `THEMES` in `ThemeContext.js` — that one array decides both the order and (via `DEFAULT_THEME`) the default.

| Mode | Page | Decoration | Notes |
|---|---|---|---|
| `light` | `#e8edf3` | none | frosted white cards — **DEFAULT** |
| `dark` | `#020617` | none | same glass, no image |
| `immersive` | `#020617` | `BG.png` + `--scrim` | identical to the pre-theme look |

**Default is `light` (owner's decision, 15-09-2026).** It was `immersive` until then, chosen so an existing customer who never touched the switch saw no change when the theme system shipped. That protection was deliberately given up: a customer who never picked a theme now lands on light. One who **did** pick is unaffected — their choice is in localStorage and still wins over the default.

Changing the default means changing it in **three** places, not one:
1. `DEFAULT_THEME` in `src/context/ThemeContext.js` (and `THEMES`, whose order is also the picker's order).
2. The hardcoded fallback in the `public/index.html` pre-paint script.
3. **The bare `:root` selector in `src/index.css`** — it is paired with whichever mode is the default (`:root, :root[data-theme="light"]`), because that block is what paints when no `data-theme` attribute exists yet: any paint before the pre-paint script runs, and a JS-less load. This one is easy to miss; it was originally paired with `immersive`.

If any of the three disagree, the page paints one theme and repaints into the other — the exact flash the pre-paint script exists to prevent.

**Where it lives**
| Concern | File |
|---|---|
| Token values (all 3 modes) | `src/index.css` — the only place a colour is written |
| Mode choice / persistence | `src/context/ThemeContext.js` — knows no colours |
| Picker UI | `src/components/ThemeSwitch.js` |
| Anti-flash (pre-paint) | `public/index.html` inline script — mirrors `DEFAULT_THEME`, keep in step |

Persisted under the `theme` localStorage key, which `DatabaseContext.js` already preserves across its cache clear (`keysToKeep`).

**Tokens** (the complete set — components use these names, never a raw colour):

| Group | Tokens |
|---|---|
| Ground | `--page-bg`, `--page-decoration`, `--scrim`, `--shell-bg` |
| Glass | `--glass-bg`, `--glass-bg-strong`, `--glass-bg-subtle`, `--glass-bg-hover`, `--glass-border`, `--glass-border-strong`, `--glass-border-width`, `--glass-sheen`, `--divider` |
| Form fields | `--field-bg`, `--field-border` — inputs sit *inside* glass, so they read as recessed wells, not another raised card |
| Type | `--text-primary`, `--text-secondary`, `--text-muted`, `--ink-rgb` |
| Chrome | `--header-bg`, `--menu-bg`, `--sidebar-border` |
| Depth | `--card-shadow`, `--glow-opacity` |

Two shared recipes in `index.css`: `.portal-surface` (foundation + decoration) and `.glass-panel` (fill + border + shadow + blur). `.glass-panel` is inside `@layer components` so Tailwind utilities reliably override it — a plain rule would tie on specificity and be settled by source order.

`--ink-rgb` is the inverted-button token: solid CTAs are `bg-[rgb(var(--ink-rgb))] text-[var(--page-bg)]`, so they read light-on-dark in dark mode and dark-on-light in light mode without a second class.

**Why light is NOT a mirror of dark** (binding — do not "simplify" this):
Dark glass = a *lighter* film over a dark ground; white/0.10 over `#020617` lifts the card (contrast 1.23). Applying the same arithmetic to a white page (slate/0.10 over white) gives contrast **1.01 — invisible**, which is exactly what the first attempt produced. On white there is no headroom above the page for a film to lift into, so light mode carries depth differently:
- page is tinted `#e8edf3`, **not** pure white — a white card on a white page separates at 1.00 and `backdrop-blur` has nothing to frost; this tint gives 1.13
- border is heavier and darker: `slate-900/0.20` at **1.5px** (`--glass-border-width`) → contrast 1.53, against dark's 1.77 at 1px
- two-layer shadow (tight contact + wide ambient) does the lifting a translucent fill cannot
- fill stays genuinely translucent (`white/0.72`) so blur still works

Glow blobs and card shadows are tuned for a dark ground, so both are tokens (`--glow-opacity` 0.30 dark / 0.14 light). Left fixed, they wash a light card out.

**Admin panel is untouched and must stay so.** Shared surfaces take an opt-in prop that defaults to the original fixed-dark classes; the admin panel simply never passes it:

| Component | Mechanism |
|---|---|
| `PortalHeader.js` | `showThemeSwitch` (also gates the picker) |
| `MobileSidebarDrawer.js` | `themed` |
| `MobileBottomNav.js` | `themed` |
| `UploadedDataList.js` | pre-existing `theme="glass"｜"light"` — only the `glass` branch was converted |
| `ProjectDetails.js` | renders in **both** portals; two switches decide which side a class belongs to — `g(adminClass, customerClass)` and an `isGlass` prop passed as `{!isAdminView}`. Only the customer side was converted; the admin literals are deliberate, not missed work. |

**Conversion status: complete (15-09-2026) — pages AND the component render paths behind them.** The earlier "complete" was true of the 26 pages only; ten pages still drew their UI from components that had never been converted, so those screens were half-new. Phase 2 of `DOCS/PORTAL_UI_CLEANUP_HANDOFF.md` finished the remaining 20 files (9,088 lines), ending with the three admin-shared ones. Verified end state: `text-black` in client pages **0** (was 174), light-glass tier `bg-white/40…90` **0**, self-painted `BG.png` **0** (was 25), customer-side hardcoded colours **0** across all 20 migrated files, all pages/components compile.

**How it was verified — measured, not grepped.** grep only says whether a token is present; it cannot say whether that token *works* where it sits. Each colour was composited over its real ground (page → backdrop → dialog panel → chip) in both themes and scored for WCAG contrast. That caught four defects invisible to reading: `focus:border-emerald-400/60` = **1.42** in light (a focus ring nobody can see), `hover:text-rose-400` = 2.42, the PDF icon `rose-300` = 1.84, the Word icon `sky-300` = 1.62. It also caught the mirror-image defect in `UserUpdateDashboard.js`, where light-only pairs (`bg-emerald-100 text-emerald-700`) measured **2.99 on a dark card** — a file that looks correct until you measure the other theme.

**Admin safety was proven by rendering, not by reading.** The three admin-shared files were SSR-rendered before and after with admin props and their markup diffed with class tokens sorted. Two traps are worth knowing: if the render FAILS on both sides the outputs compare equal and you get a false "identical: true" (the harness must refuse to pass on an error), and `ProjectDetails` with no `orderId` never mounts the regions that changed, so its customer-side control also compares equal. For that file the real proof was a string census — every customer-argument value replaced, every admin-argument value (`text-amber-800`, `bg-amber-50`, `text-emerald-700`, `bg-emerald-100`, `text-emerald-800`, `border-amber-300`) unchanged, counts identical.

**Deliberately left as literals** (correct in every mode, do not "fix"):
- `bg-black/30…60` modal backdrops
- `bg-white` QR-code tiles — scanners need real white
- `text-white` on **`emerald-600`** buttons — that one shade is dark enough in both themes. This does NOT generalise: `emerald-300/400` are dark-theme shades and measure ~1.3–1.8:1 on a light card, so a literal emerald elsewhere is a bug, not a convention. Status colour belongs to the `--badge-*` tokens, and a filled primary action belongs to `rgb(var(--ink-rgb))` with a `var(--page-bg)` label, which invert as a pair.
- One more shared-surface literal, deliberate: `ProjectDetails.js`'s loading backdrop (`bg-black/10`). It renders for the admin too and has no `isAdminView` gate, so theming it would move admin markup.

**Build note (pre-existing, unrelated to theming)**: `package.json` declares `tailwindcss@4.0.14`, but `react-scripts` resolves its own nested **v3.4.17**, which is what actually compiles (verified by running PostCSS). `index.css` uses v3 syntax accordingly. Note also that v3 cannot apply an opacity modifier to a variable — `bg-[var(--x)]/10` fails to compile; `bg-[rgb(var(--x)/0.1)]` works. Any `npm install` that removes the nested v3 will break all CSS.

### 11b. Layout patterns (still current — now expressed in tokens)

These are structural conventions and remain in force. Only their **colours** changed: what used to be written as a literal is now the matching token from 11a. Write the token, never the literal.

- **Background**: painted once by the shell (`.portal-surface` on `DashboardLayout`), from `--page-decoration` + `--scrim`. **Never re-add `import backgroundImage from '../assets/BG.png'` to a page** — 25 pages used to paint their own copy on top of the shell's, which is a bug, not a pattern.
- **Glass surfaces** — one scale, no separate tiers:
  - card / panel — the `.glass-panel` recipe, or `bg-[var(--glass-bg)]` + `border-[var(--glass-border)]`
  - recessed band (table headers, sub-wells) — `bg-[var(--glass-bg-subtle)]`
  - raised chip / active pill — `bg-[var(--glass-bg-strong)]`
  - hover — always `bg-[var(--glass-bg-hover)]`, never another level's resting value
  - form fields — `bg-[var(--field-bg)]` + `border-[var(--field-border)]`
- **Detail-page template** (site-wide standard — `ProjectDetails.js`, `PlanDetails.js`, `OrderDetailPage.js`, `InvoiceDetailPage.js`, `UserInvoices.js`, `TicketDetail.js`): open centered header, no bounding banner card — Back button `absolute left-0` on a glass pill; heading truly centered; content in ONE glass card with internal `border-t`/`border-r` dividers (`border-[var(--divider)]`) instead of multiple bordered sub-cards.
- **Zero-blue color rule**: emerald = progress/completion/real action; neutral glass = in-progress/active/selected; amber = pending/waiting; red = paused/error only. Real action buttons stay solid (`bg-emerald-600`), never glass — glass/badge styling is reserved for status pills only. Inverted neutral CTAs use `bg-[rgb(var(--ink-rgb))] text-[var(--page-bg)]`.
- **Full-page glass "documentation" layout** (preferred over the bounding-card template for any page with dropdowns/popovers that must escape clipping — established on `StartNewWebsiteCustomize.js`): frameless sheet `rounded-[2rem] bg-[var(--glass-bg-subtle)] p-6 backdrop-blur-2xl` — **no border, no shadow, no `overflow-hidden`**; responsive `grid-cols-[minmax(0,1fr)_360px]` (main + sticky summary rail); `border-t border-[var(--divider)]` section dividers, no nested sub-cards.
- **Open-heading + single-card list pattern** (`ProjectsAndPlans.js`, `CustomerDashboard.js`): no boxed banner — plain centered `<h1>` + subtext, then one `TicketsList.js`-style glass card (title + filters + counters in one header row, `bg-[var(--glass-bg-subtle)]` table-header band, alternating row shading via `--glass-bg-subtle` / `--glass-bg`).
- **Typography scale** (5 sizes max — do not introduce others): H1 `text-2xl` bold, H2 `text-xl` bold, H3 `text-lg` semibold, body `text-base`, sub-text `text-sm`. Colour comes from `--text-primary` / `--text-secondary` / `--text-muted`. Status badges/pills keep their semantic colours.

### 11c. Keyboard optimization (forms — pattern, not yet applied everywhere)

Full context/pattern lives in `frontend/src/DOCS/context-keyboard.md` — read that file before
converting any form to be keyboard-only. Summary: `components/KeyboardSelect.js` replaces native
`<select>` wherever a dropdown must sit inside an Enter-driven field chain (native selects can't
be reliably opened/confirmed via keyboard across browsers). Converted so far (2026-09-19): Add
Lead modal in `AdminLeadsPage.js` (auto-focus first field, Enter moves field-to-field, Esc
closes, single ✕ close affordance, submit button pulses on focus) and both follow-up forms on
`AdminLeadDetailPage.js` (Add Follow-up + inline Edit Follow-up). Textarea convention: plain
Enter moves to the next field, Shift+Enter inserts a newline. Not yet applied to any other form
in the app.

**Three conventions were retired by the theme work — do not reinstate them:**
1. **The "light-glass" second tier** (`bg-white/55` + `text-black` for dense data) is gone. It rendered white-on-white cards in the dark portal. There is now one glass scale, and text colour comes from tokens.
2. **`text-black` / `text-white` as canonical type colours** — replaced by `--text-primary`; a fixed value is wrong in at least one of the three modes. Client pages contain zero `text-black`.
3. **"Payment-input forms stay solid, not glassed"** — the wallet recharge modal, `DirectPayment.js` and `CompleteProfile.js` are now glass like everything else, on the owner's instruction.


---

## 12. Wallet & List Contracts

- Wallet balance SSOT: `userModel.walletBalance`, read via `current_user`/`userDetails`, surfaced through `AppContent`'s Context + Redux. No separate dashboard-owned wallet fetch.
- Wallet transaction history: `GET /api/wallet/history` (filtered `req.userId`, reads `transactionModel`) — read-only, never used to recalculate `walletBalance`. Includes lead-reference reward credits (`paymentMethod: "reward"`) with no extra filtering — see §3a.
- List surface contracts (do not mix): `ProjectsAndPlans.js` = project/plan tracking (progress far-right only); `OrderPage.js` = purchase history (price/date/type/status, no progress); `CustomerDashboard.js` = compact preview of latest 5 project/plan records.
- **`CustomerDashboard.js`'s "Open alerts" tile deep-links into the correct `OrderPage.js` tab.** `OrderPage.js`'s `activeTab` state now initializes from `location.state?.initialTab` (falls back to `'all'`) instead of always starting on "All orders". The dashboard tile computes which tab to send: `pending` only if there are pending-approval orders and no rejected ones, `rejected` only the reverse, `all` when both (or neither, in which case the tile isn't a link at all) — `OrderPage.js` has no combined pending+rejected tab, so `all` is the closest single tab covering everything the tile counted.
- **`OrderDetailPage.js` (`/order-detail/:orderId`) — installment projects render as ONE section.** Was: a two-column grid of three sub-cards — "Plan Snapshot", "Installments", and an "Invoice History" list that repeated every row of the schedule beside it (and showed the `project_final` statement as a second, larger `Due` bill the customer appeared to owe). Now: when `!isRecurringPlan && order.isPartialPayment && installments.length > 0`, the page renders a single section — a header line carrying the order's own facts (`Started {date} · Installments (n) · Total ₹x`) with a **Download Invoice** link for the `project_final` statement on the right (via the shared `/invoices/:id/download` route; absent when no statement exists), then the installment rows separated by `border-t`/`border-b` dividers, no sub-cards. Only the unpaid, non-pending `currentInstallment` is clickable, so the sequence is first → second → final; an admin-deferred first installment is also payable. Every other order shape (recurring plan, one-time full payment) keeps the original two-card layout, where `project_final` now renders with a non-payable "Full Invoice" badge instead of a `Due` one.

---

## 13. Admin Delete Flow (orders/projects)

- Scan-then-delete pattern: `GET /api/admin/delete-order/:orderId/scan` (`scanDeleteOrder.js`) returns active/missing linked sections → admin checks all active sections in a modal → `DELETE /api/admin/delete-order/:orderId` (`deleteOrder.js`) re-validates the same scan plan server-side, deletes in serialized order.
- **Cancel before delete (binding, server-enforced).** An order that actually received money must be cancelled first — `deleteOrder.js` checks `getOrderAmountReceived()` against `plan.isCancelled` and returns `400` with `requiresCancellation: true` otherwise. Deleting is cleanup; **cancelling is what settles and refunds the money** (§8a). An order nothing was ever paid on can still be deleted directly — there is nothing to settle. The delete modal reads `paidTotal`/`isCancelled` from the scan and locks its confirm button with the same rule.
- **`transactionModel` is NO LONGER cascaded — transactions survive the delete.** Was: hard-deleted with everything else, so a customer's payments (and, once refunds existed, the refund whose reference id they had been given) vanished with the order — the money had no trace at all. Now: `deleteOrder.js` writes `deletedProjectName`/`deletedProjectType` onto them (same snapshot idea as `invoiceModel`, since `orderId` resolves to nothing afterwards) and leaves the rows in place. `helpers/paymentLedger.js`'s transaction branch falls back to that snapshot for naming.
- `deleteOrder.js` still cascades (hard-deletes) `updateRequestModel`/`monthlyInvoiceModel`/`partnerCommissionModel`. `invoiceModel` is deliberately excluded — see §6's "Deleted Projects" entry for why (it gets a name/type snapshot written onto it first, instead of being cascaded, so the admin "Deleted Projects" tab can show what was deleted).
- **Linked services are listed, not deleted and not blocked.** `buildOrderDeletePlan()` returns `linkedServices[]` (name + status) and the delete modal warns "Delete these services first" with the list — each service is its own order with its own payments, so deleting the project would leave them pointing at nothing. Deliberately **frontend-only**: it is not a delete section, not in `requiredSectionKeys`, and the server does not refuse — no money is at risk, only tidiness, and an admin may mean to clear them afterwards. (Contrast the cancel-before-delete gate above, which IS server-enforced because money is.)

---

## 14. Known Open Gaps (real, unfixed — verified, not speculative)

- `StartNewWebsiteCustomize.js` calls a `SummaryApi.customerCategoryBasePrice` mapping that doesn't exist (§1).
- Chess iOS Safari WebSocket cookie-auth failure (§10) — unresolved.
- No admin capability exists to **activate** a customer's plan, or to pause/resume one — and **2 live service orders are stuck `paused` right now** (verified 2026-09-23), unusable with no control that can free them. **Closing** one is now possible — cancelling it (§8a) sets `servicePlanStatus: 'cancelled'` and stops the renewal cron — but that always settles/refunds the money and is one-way, so it is not a general-purpose "close this plan" control.
- Service system: no activation engine, no enforcement of upload/reminder allowances, no cycle/recurring billing beyond the first payment, no reminder delivery — see §5's three-axis design section for what's planned but not built.
- **Two plan systems coexist; the legacy one is unreachable but still wired into ~31 files** (§5a), including a renewal subsystem that never fires. Left in place deliberately — but never model new plan work on it.
- **Modern service plans show under the admin workspace's Projects tab, leaving Plans dead** (§4) — blocks every per-plan admin control, including the planned top-up.
- **A purchased plan's allowance cannot be changed by anyone** (§7a) — a client whose updates run out must rebuy the plan. Rebuild designed in `plan-system.md`.
- **`limitScope` advertises a window the code does not honour** (§7a) — eight of nine values inert.
- **A project upload's notifications fail silently** (§7a). `emailService.js` reads `updatePlanId.productId.serviceName` unguarded; a project has no `productId`, so the admin email, the customer confirmation and the in-app notification all throw — and `submitUpdateRequest.js`'s notification block catches and continues, so the upload succeeds while nobody is told. Left as-is on purpose: the fix belongs to the planned **centralised notification system** (one place deciding which events notify, admin-configurable), not to a guard bolted onto `emailService.js`.
- **No un-cancel.** Cancelling an order is deliberately one-way (§8a) — the refund has already been paid out, so reversing it would mean taking money back, which is a new payment rather than an undo. A mistaken cancellation is corrected by creating a new order.
- **Deleting a project does not clear the services attached to it.** They are listed with a warning in the delete dialog (§13) but nothing enforces it, so a project deleted with services still attached leaves them holding a `linkedProjectOrderId` that resolves to nothing. Accepted: the admin deletes those services manually, and the cancel-before-delete gate means each one's money is settled first regardless.
- `UserInvoices.js` (`/my-invoices`) calls `GET /api/my-invoices`, which **does not exist** as a registered backend route (confirmed by grep of `backend/routes/index.js`) — this page has been broken across many sessions and was never fixed.
- **A multi-service payment batch cannot be approved from `AdminClientWorkspace.js`** — the panel the Payments tab actually opens today. `PaymentOrderHistorySubpage` computes `matchingBatches` but never returns or renders them, and has no `"paymentBatch"` action type; it filters batch children only out of `combinedFromUnlinkedTransactions`, while a child carries its own `invoiceId` (`customerCreateServicePlanOrdersBulk.js`) and so renders from the **invoice** branch instead — its "Review Payment" button sends the child's `transactionId` and hits `isBatchChild()`'s guard: *"This payment is part of a multi-service payment. Approve the payment itself, not one service."* The working batch UI lives in `AdminPaymentRecordDetail.js` (`openAction("paymentBatch", batch)` → sends `batchRef`), but that page is **unreachable**: its route `admin-panel/clients/:customerId/payments/:recordType/:recordId` is registered, yet the live workspace no longer navigates to it — the Payments tab was deliberately moved from per-record `navigate()` to a group-level in-page subpage (`handleOpenPaymentGroup`/`activePaymentGroupId`), and the batch UI was later built in the page that change had orphaned. Backend is fine; the fix is to port the batch card + `"paymentBatch"` action into `PaymentOrderHistorySubpage` and filter batch children out of the invoice branch too.
- **`createOrder.js` never flips `orderVisibility` to `'approved'` on a wallet-paid order**: line 65 hardcodes `orderVisibility: 'pending-approval'` at creation regardless of the destructured `orderVisibility` param; the `paymentMethod === 'wallet'` branch (line 380+) only sends email/notifications, it never re-saves the order with `orderVisibility: 'approved'` the way `adminCreateProjectOrder.js`/`customerCreateCustomProjectOrder.js`/`customerCreateServicePlanOrder.js` do. Since `getItemStatusMeta()` (`orderPresentation.js`) and `ProjectDetails.js` both read `order.orderVisibility` directly, a wallet-paid order created through this path shows "Approval Pending" forever even though wallet money needs no approval. Confirmed by code inspection, not yet fixed or backfilled for any existing affected orders.

---

- **`components/RoleDirectoryPage.js` imports `../pages/SignUp`, which does not exist** — the file is
  nowhere in the repo, not even in the `backup-publicremoval-*` folders, so this import has been dead
  since the public signup page was removed. It does not break the build today only because the whole
  chain is unreachable: `RoleDirectoryPage` is imported by `AdminManagement`, `CustomerManagement`,
  `DeveloperManagement`, `ManagerManagement` and `PartnerManagement`, and **none of those five has a
  consumer either**. Found 07-09-2026 while verifying an unrelated deletion; left alone because
  removing six more files was outside what was asked.

---

## 14a. Dormant Subsystems — built, switched off, **do not delete**

### WhatsApp customer notifications — RETAINED ON PURPOSE (owner decision, 07-09-2026)

**What it was for.** Sending customers their order/payment updates over WhatsApp, without paying for the
official WhatsApp Business API — by driving a **real WhatsApp Web session** on a separate host.

**Three parts, all still in the repo:**

| Part | File | State today |
|---|---|---|
| Sender + rate-limit queue | `backend/helpers/whatsappService.js` | present, **zero callers** in the whole backend |
| Socket client | `frontend/src/components/socket.js` | present, imported only by `QRModal.js` and a commented import in `AppContent.js` |
| Reconnect QR dialog | `frontend/src/components/QRModal.js` | present, **no live consumer** |

**How it worked.**
`sendWhatsAppMessage(number, message)` pushes onto an in-process queue and POSTs to
`WHATSAPP_API_URL = http://35.208.75.95:3000/send`, releasing **one message every `DELAY_MS = 10000`ms
(10 s)** so WhatsApp does not flag the number for spam. A logged-out session answers
`{ status: 'not_logged_in' }`. That endpoint is **not in this repo** — it is a separate host running the
WhatsApp Web session.

A WhatsApp Web session has to be re-paired from a phone every few days, which is what `QRModal` existed
for. `socket.merasoftware.com` (also not in this repo) emitted three events — `qr` (the QR image),
`ready` (paired), `disconnected` (dropped). `components/socket.js` connects to it; `QRModal` rendered the
image under "Scan QR to Reconnect WhatsApp" and closed itself 1 s after `ready`.

**Why nothing happens today** (verified by reading the files, not by grep counts):
- `AppContent.js` — the `QRModal` and `socket` imports are commented out, and so are **both** socket
  `useEffect`s (`qr` → open, `ready` → close).
- `whatsappService.js` has **zero callers** anywhere in `backend/` (excluding `node_modules` and backups).
- The backend's socket.io is initialised **only for chess** (`index.js` → `initChessSocket`). No `qr`,
  `ready` or `disconnected` is emitted anywhere in the backend.

**To switch it back on**, in order: (1) bring the WhatsApp Web host at `WHATSAPP_API_URL` back up;
(2) bring back the socket server behind `socket.merasoftware.com` emitting `qr`/`ready`/`disconnected`;
(3) uncomment the two imports and two `useEffect`s in `AppContent.js` and render
`<QRModal show={showQR} onClose={() => setShowQR(false)} />`; (4) call `sendWhatsAppMessage(...)` from
wherever the notification belongs — **no controller calls it today**, so re-enabling the plumbing alone
sends nothing.

**Fix this at the same time:** `WHATSAPP_API_URL` is a hardcoded IP over plain `http://`, so message
bodies and customer phone numbers travel unencrypted.

> **Do not delete `whatsappService.js`, `socket.js` or `QRModal.js` in any dead-code cleanup.** They read
> as unused because the feature is off, not because it is unwanted — the owner wants this working again.

### Orphaned components — DELETED 07-09-2026

Deleted on the owner's instruction after verification. Kept here as a record of what existed and what
took over each job, so a future session does not go looking for a file that was removed on purpose.
Backup: `frontend/src/_backup_dead_code_work1/`.

Verified three ways before deleting: full-`src` name search, no `components/index.js` barrel exists, and
no `lazy()`/dynamic `import()` anywhere except `reportWebVitals.js`. Backend hits for these names were
checked one by one and were all unrelated locals (`isWalletRecharge`, `sendWalletRechargeConfirmationEmail`
and friends), not imports.

| File | What it did | What does that job now |
|---|---|---|
| `components/RenewalModal.js` (480) | Plan renewal payment dialog — wallet or UPI QR, own transaction ids, part-wallet/part-UPI | Superseded by the wallet/instant-pay flow; `PlanDetails.js` now handles renewal via `stopServiceRenewal` |
| `components/YearlyPlanDetailsModal.js` (262) | Popup breakdown of a plan — yearly days left, current-month days, updates used, next renewal | Became a full page — the plan details screen |
| `components/EditProfileModal.js` (240) | Profile edit popup — name/email/phone/age + Cloudinary picture upload | `pages/Profile.js` now has the same form inline |
| `components/OrderDetailsModal.js` (194) | Admin approve/reject an order, with a rejection reason | `pages/AdminClientWorkspace.js` |
| `components/TransactionModal.js` (187) | Admin approve/reject a transaction (payment / recharge / installment) | `pages/AdminPaymentRecordDetail.js` |
| `components/ImagePopup.js` (52) | Full-screen product image gallery with thumbnails | Belonged to the removed public shop pages (`backup-publicremoval-*`); not imported even there |
| `components/WalletRecharge.js` (220) | Wallet recharge form → UPI QR → transaction-id verification | `pages/WalletDetails.js` recharge panel — which then became the reference design for `components/Modal.js` |

**1,635 lines removed.** After deletion, every relative import in all 190 live source files still
resolves and all 190 compile.

One pre-existing broken import surfaced during that check and is **not** related to this deletion —
see §14 (`RoleDirectoryPage` → `../pages/SignUp`).

---

## 15. Where To Look First (quick index)

| Task | Primary files |
|---|---|
| Auth/login | `pages/Login.js`, `helpers/postLogin.js`, `helpers/portalHome.js`, `backend/controller/user/userSignIn.js` |
| Admin password/ban | `backend/config/accessControlConfig.js`, `backend/controller/admin/{getClientCredentials,resetClientPassword,updateClientAccountStatus}.js` |
| Guest login | `backend/controller/user/guestLogin.js`, `backend/helpers/{guestIdentityMatch,guestCascadeDelete,purgeExpiredGuests}.js`, `backend/config/guestDemoConfig.js` |
| Leads/CRM | `backend/controller/lead/*.js`, `backend/models/leadModel.js`, `pages/AdminLeads*.js` |
| Lead reference + wallet reward | `backend/controller/lead/createLead.js`, `backend/controller/user/{searchCustomers,myReferredLeads}.js`, `backend/models/adminSettingsModel.js`, `pages/{AdminMoneyManagementPage,MyReferredLeadsPage}.js` |
| Project creation (admin) | `backend/controller/order/adminCreateProjectOrder.js`, `AdminClientWorkspace.js` |
| Project creation (customer) | `backend/controller/order/customerCreateCustomProjectOrder.js`, `pages/StartNewWebsiteCustomize.js` |
| Feature catalogue (quantity/category) | `models/productModel.js` (`isQuantityBased`, `compatibleWith[]`), `backend/helpers/featureCatalogue.js`, `helpers/projectCategoryOptions.js`, `pages/AdminFeatureProductsPage.js` |
| Node/timeline system | `backend/helpers/projectNodeService.js`, `backend/controller/order/projectNodeController.js`, `pages/ProjectDetails.js` |
| Service plans | `backend/models/productModel.js` (`servicePlan{}`), `backend/helpers/servicePlanPurchase.js`, `pages/ServicePlanDetail.js`, `components/AddServiceModal.js` (admin create UI — not a dedicated page) |
| Payment batches (multi-service) | `backend/models/paymentBatchModel.js`, `backend/controller/order/customerCreateServicePlanOrdersBulk.js`, `backend/controller/user/transactionApprovalController.js`, `helpers/paymentLedger.js`, `components/AddServiceModal.js` |
| Plan retire/delete | `backend/controller/product/{retireOrDeletePlan,reactivatePlan,purgePlan}.js` |
| Payments/invoices | `backend/helpers/{paymentRecording,transactionService,installmentSettlement}.js`, `backend/models/invoiceModel.js` |
| Invoice PDF / download | `backend/helpers/generateInvoiceDocumentPdf.js` (only generator), `backend/controller/invoice/invoiceDocumentController.js` (only loader, exports `loadInvoiceDocument`) |
| Customer payment surfaces | `pages/InvoiceDetailPage.js` (invoice known), `pages/InstallmentPayment.js` (installment, no invoiceId yet), `pages/DirectPayment.js` (rejected-order retry) |
| Approval | `backend/controller/order/approveProjectOrder.js`, `backend/controller/user/transactionApprovalController.js` |
| Cancellation & refunds | `backend/helpers/orderRefundService.js` (refund SSOT), `backend/controller/order/cancelProjectOrder.js`, `backend/helpers/orderLifecycle.js` (terminal-state guard) |
| Trash | `backend/controller/trash/*.js` |
| Client documents | `backend/helpers/clientDocumentsTimeline.js`, `backend/controller/user/{uploadClientDocument,getClientDocuments,getAdminClientDocuments}.js` |
| Upload Data / update requests (§7a) | `backend/helpers/uploadType.js` (which kind), `backend/helpers/projectUploadGate.js` (project state gate), `backend/controller/user/submitUpdateRequest.js` (submit), `backend/helpers/orderUploadHistory.js` (read-back), `backend/config/uploadLimits.js` (file caps), `frontend/src/components/UpdateRequestModal.js` (the one modal) |
| External upload links | `backend/helpers/externalUploadToken.js` (token + public URL SSOT), `backend/helpers/externalUploadSession.js` (isolated scoped session), `backend/controller/user/{externalUploadLinkController,externalUploadController}.js` (admin lifecycle + public flow), `frontend/src/pages/ExternalUploadPage.js` (public upload-only UI), `frontend/src/pages/Profile.js` (client consent) |
| Project/plan classification | `helpers/orderType.js`, `helpers/orderPresentation.js`, `components/OrderListRow.js` |
| Chess | `frontend/src/chess/*`, `backend/chess/*` |
| WhatsApp notifications (dormant, keep) | `backend/helpers/whatsappService.js`, `frontend/src/components/{socket,QRModal}.js`, commented block in `AppContent.js` — see §14a |
| UI design system | `src/index.css` (§11a tokens + `.glass-panel`/`.portal-surface`), any file using `bg-[var(--glass-bg)]` |
| Theme system (3 modes) | `src/index.css` (all token values), `context/ThemeContext.js` (choice/persistence), `components/ThemeSwitch.js` (picker), `public/index.html` (anti-flash script) |
