# Showcase packages

Packages are enquiries on the website, not purchasable portal products. An admin selects a published package or eligible category offer in Create Project. The server verifies pricing, eligibility and the quote version. Included work and terms are saved in `projectSnapshot.salesAgreement` and displayed by `ProjectAgreement` on the project/service workspace and invoice screen.

Related service plans are references only; existing plan checkout is the only way to purchase those services. A package selection cannot activate a plan.

The backend owns package configuration; the website `/admin/packages` form edits it using portal-admin permissions. `/campaign/packages` displays the public catalogue. Its three initial examples are Starter ₹699, Plus ₹2,699 and Complete ₹4,699 while the starter offer is live. Additional admin discounts require a reason.

Admin submissions carry a creation key to prevent duplicate projects on a retry. Paise-safe installment previews are shared by admin/customer project forms and match backend allocation.

Existing project/plan histories remain independent of future package edits. Legacy orders without an agreement retain their original presentation; an existing offer title can still be shown without inventing past prices or terms.
