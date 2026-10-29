import React, { useState } from "react";
import { ProjectCategoryDialog } from "./ProjectCategoryDialog";
export function PlanCategoryPicker({ catalogue, categoryKey, busy, onSelect, onCatalogue, reload }) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const categories = catalogue.categories.filter(row => (!row.legacy && row.status === "active") || row.key === categoryKey);
  return <div className="admin-field"><label><span>Project category</span>
    <select aria-label="Plan category" required value={categoryKey} disabled={busy} onChange={event => onSelect(event.target.value)}>
      <option value="">Choose a category</option>{categories.map(row => <option key={row.key} value={row.key}>{row.label}{row.legacy ? " (needs category mapping)" : row.status === "archived" ? " (archived)" : ""}</option>)}
    </select></label>
    <button type="button" className="admin-action" disabled={busy} onClick={() => { setError(""); setCreating(true); }}>+ New category</button>
    {error && <p role="alert">{error}</p>}
    {creating && <ProjectCategoryDialog nextSortOrder={Math.min(9999, Math.max(0, ...catalogue.projectCategories.map(row => row.sortOrder || 0)) + 1)}
      onCancel={() => setCreating(false)} onSaved={async category => {
        setCreating(false);
        if (category.status !== "archived") onSelect(category.category);
        else setError("Category created as archived. Activate it in Project Categories before selecting it.");
        // Retain the successful creation/selection even if the follow-up reload fails.
        const entry = { ...category, key: category.category, linkedProjectCategory: category.category };
        onCatalogue({ ...catalogue, categories: [...catalogue.categories, entry], projectCategories: [...catalogue.projectCategories, category] });
        try { onCatalogue(await reload()); } catch (cause) { setError(cause.message || "Category created. Reload categories to refresh the list."); }
      }} />}
  </div>;
}
