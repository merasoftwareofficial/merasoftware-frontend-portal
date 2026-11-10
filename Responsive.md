# Client portal mobile responsiveness — investigation and handoff

Last updated: 10 November 2026. This document records an investigation and an implementation plan. **No client portal responsive changes have been made as part of this investigation.**

## User's scope and correction

The requested work is mobile and tablet responsiveness **only for the client/customer portal** in this React frontend:

- Repository: `E:\Allprojects\frontend`
- Git remote: `merasoftwareofficial/merasoftware-frontend-portal`
- Stack: React 19, Create React App (`react-scripts`), React Router and Tailwind CSS.
- Customer routes: `src/routes/customerRoutes.js`. Customer-specific rendering of `/my-offers` is also in scope; it is registered in `src/routes/publicRoutes.js` and renders `DashboardLayout` only for a customer.
- Preserve the current desktop appearance as closely as possible.

**Out of scope:** the admin portal and its pages, backend, and the separate Next.js marketing website at `E:\Allprojects\merasoftware`. Shared components also used by admin must not be changed in a way that changes admin layout or behavior. Use an existing customer-only prop/branch such as `themed`, a customer-specific wrapper, or another narrowly scoped approach, and verify the admin view is unaffected. Likewise, `ProjectDetails.js` is used by both customer and admin: scope any change to its customer branch rather than applying a blanket change.

The user's general default project is the Next.js website when a task is unspecified. **This task explicitly identifies the React client portal**, so that default does not select the Next.js repository. An old code comment refers to `E:\merasoftware-new`, but that path was absent when checked; the current frontend checkout and its Git remote identify `E:\Allprojects\frontend` as the portal.

## Mistake to avoid

The previous agent mistakenly interpreted “React frontend” as the React-based Next.js marketing website, implemented responsive changes there, and pushed commit `8776760` to that website's repository. The user clarified that the problem was in the React portal and that the Next.js site was already responsive. Do **not** treat the Next.js work, its screenshots, its tests, or its commit as evidence that the portal is fixed. Do not modify or revert that separate website unless the user explicitly asks.

The user then explicitly required investigation and a plan before implementation. The current request is to write this handoff. **Do not start portal implementation based solely on this document; follow the user's next instruction.**

## Repository state to preserve

On inspection, `main` tracked `origin/main` and these documentation files were already deleted in the working tree:

```text
README.md
docs/CODE_AUDIT.md
docs/QUICK_INDEX.md
src/DOCS/CODEBASE_MAP.md
src/DOCS/README.md
src/DOCS/context-keyboard.md
src/DOCS/plan-system.md
src/DOCS/showcase-packages.md
```

They are pre-existing user/workspace state. Do not restore, delete, stage or commit them as part of this task. Recheck `git status` and applicable `AGENTS.md` files before making any future edits. No applicable `AGENTS.md` was found in the portal repository, its `E:\Allprojects` parent, or `E:\` during this inspection. This `Responsive.md` is a new handoff document, not an authorization to deploy or push.

## Confirmed findings

1. **Customer header overflows at 320px.** A local Chromium run of the existing build, with mocked customer identity/API responses, showed `document.documentElement.scrollWidth === 338` for a 320px viewport on each of `/dashboard`, `/projects-and-plans`, `/order`, `/my-offers`, `/settings`, and `/start-new-project`. At 390, 768, 1024 and 1440px those tested sample states had no document-level overflow. An element measurement on `/dashboard` placed the profile-menu wrapper/button between x=262 and x=338. The likely shared cause is the space needed by the customer header's logo, theme switch, profile control, padding and `gap-6` in `src/components/PortalHeader.js` and `src/components/BrandLogo.js`. The header has an admin consumer too: preserve its admin branch.
2. **Existing mobile navigation exists.** Customer `DashboardLayout.js` uses the shared `PortalHeader`, `MobileSidebarDrawer` and `MobileBottomNav`, passing customer theming where applicable. Desktop sidebar uses `lg:flex`; bottom navigation/drawer use `lg:hidden`. Examine interactions and content space before redesigning these components.
3. **Cart and bottom navigation may overlap.** Source inspection shows `FloatingCartButton.js` renders a 56px button at `bottom-6 right-6`, `z-50`, when the cart has items; `MobileBottomNav.js` is fixed at the bottom, `z-40`, on screens below `lg`. Their CSS positions can overlap. This is a source-based risk, **not yet verified with a populated-cart browser fixture**. Test hit targets, safe-area insets and content clearance with the cart both empty and populated.
4. Customer detail pages have complex states. For example, `src/pages/ProjectDetails.js` has a desktop-only `lg:block` section with nested multi-column layout; other mobile sections must be inspected separately rather than concluding that the desktop section itself overflows phones. Plan, payment, invoice, wallet, settings and support pages also have content-dependent layouts and dialogs. Their current behavior has not all been verified.

## Coverage and limits of the investigation

- Source inventory identified 31 customer route definitions, including redirects, parameterized routes and games. See `src/routes/customerRoutes.js` for the authoritative current list. `/my-offers` is separately registered and has customer and non-customer branches.
- A **read-only** browser smoke check used the existing `build/` output and intercepted API traffic with local fixtures. It checked 6 customer pages at 320, 390, 768, 1024 and 1440px. A few admin pages were also viewed during investigation, but **admin work is no longer in scope**.
- `build/index.html` was dated 10 November 2026 22:15, while the inspected latest source commit `f6e9b04` was dated 22:25 that day. The build may not include the latest source. Reproduce findings with a build of the current source before relying on them.
- The sample APIs were mostly empty. Populated projects, long names, purchase/checkout states, invoices, uploads, cart, modal states, loading/errors, all three customer themes, landscape and real devices have **not** been comprehensively verified. No physical-device, Safari or WebKit verification is claimed.
- A successful page load or absence of horizontal document scroll is not proof of usability. Check text clipping, overlapping controls, accessible interactions, readable inputs and reachable content too.
- Existing local test examples include `tests/portal-workspace-ui.browser.cjs`, `tests/project-detail-browser.cjs`, `tests/plan-checkout-browser.cjs` and `tests/portal-settings-documents.browser.cjs`. Inspect their assumptions and fixture coverage before reuse. They may use the existing `build/` directory; avoid treating that stale output as the current source.

## Proposed implementation plan — only after user authorizes work

1. Verify the repository path, instructions and current Git state. Inventory customer-only screens and shared components/branches; maintain a route/state checklist. Preserve pre-existing changes. Capture desktop and phone/tablet baseline screenshots from **current source** using isolated local fixtures and an isolated build/output where possible.
2. Reproduce the 320px customer header issue, measure which elements exceed the viewport, and make a customer-scoped fix. Keep existing admin header and desktop presentation intact; test customer signed-in, guest, long-name and menu states.
3. Verify and fix the customer shell: bottom navigation, drawer, theme/profile menus, floating cart, sticky actions, scrolling, safe-area insets and landscape. Test Escape/backdrop and focus where appropriate. Preserve existing navigation destinations and app behavior.
4. Check customer page families with representative populated and empty fixtures: dashboard; projects and plans; project/plan detail; purchase history, invoices and installment/payment flows; new-project/service selection and checkout; wallet; offers; documents/uploads; support/tickets; settings/profile; and customer games. Classify redirects separately. Fix causes at the smallest suitable customer component or customer-specific layout boundary; do not hide overflow globally.
5. Verify each relevant state at small phone, common phone, tablet portrait/landscape and desktop widths, including at least 320, 360, 390, 600, 768, 820, 1024, 1280 and 1440px, plus actual breakpoints. Compare desktop baselines and check that shared-component edits did not affect the admin view. Use browser automation and local mocked responses; do not create real purchases, send messages or modify production data.
6. Run the appropriate existing tests and current-source production build, add a focused regression test only where it verifies meaningful behavior, and document any unsupported device/browser or data-state coverage. Report exact findings and limitations. Commit/push/deploy only if separately authorized for this portal task.

## Completion criteria

- All applicable customer pages and meaningful interactions are checked with representative data; unresolved fixture gaps are identified.
- Customer content and controls fit the viewport without unintended page-level horizontal scrolling, clipped text, covered controls or inaccessible dialogs. Deliberate local scrolling for genuinely wide content remains usable.
- Existing desktop client UI and admin portal behavior remain intact, supported by comparison checks.
- Build and relevant tests pass, or any failure is reported accurately with its cause.
