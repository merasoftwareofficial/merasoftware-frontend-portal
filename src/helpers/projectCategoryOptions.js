// Project categories are no longer listed here: they come from the backend SSOT through
// hooks/useProjectCategories.js, and a project's name for its category is frozen on the order
// (projectSnapshot.categoryLabel). Only the shared feature-matching rule remains.

// A feature's compatibleWith[] carries which categories it is offered for, where an
// EMPTY array means "all categories". Kept here so every list/filter reads it the
// same way instead of each caller re-deciding what empty means. The backend half is
// helpers/featureCatalogue.js.
export const isFeatureForCategory = (feature, category) => {
  const compatible = feature?.compatibleWith;
  if (!Array.isArray(compatible) || compatible.length === 0) return true;
  return compatible.includes(category);
};
