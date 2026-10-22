import React, { useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ListChecks, Plus, X } from "lucide-react";
import SummaryApi from "../common";
import { logout } from "../store/userSlice";
import CookieManager from "../utils/cookieManager";
import StorageService from "../utils/storageService";
import AdminLayout from "../components/AdminLayout";
import AdminWorkspaceShell, { AdminWorkspaceHeader } from "../components/admin/AdminWorkspaceShell";
import useProjectCategories from "../hooks/useProjectCategories";

const FEATURE_UPGRADE_CATEGORY = "feature_upgrades";

// compatibleWith[] carries the categories a feature is offered for; an EMPTY array
// means "all categories". The form exposes that as a two-way choice instead of
// making the admin reason about an empty list.
const CATEGORY_SCOPE_ALL = "all";
const CATEGORY_SCOPE_SELECTED = "selected";

const formInputClassName =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-black outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100";
const formLabelClassName = "mb-1.5 block text-base font-semibold text-slate-700";

const FeatureEditForm = ({ feature, categories, onCancel, onSaved, onDeleted }) => {
  const isEditing = Boolean(feature?._id);
  const [serviceName, setServiceName] = useState(feature?.serviceName ?? "");
  const [sellingPrice, setSellingPrice] = useState(feature?.sellingPrice ?? feature?.price ?? "");
  const [description, setDescription] = useState(feature?.formattedDescriptions?.[0]?.content ?? "");
  const [isHidden, setIsHidden] = useState(Boolean(feature?.isHidden));
  const [isQuantityBased, setIsQuantityBased] = useState(Boolean(feature?.isQuantityBased));
  const existingCategories = Array.isArray(feature?.compatibleWith) ? feature.compatibleWith : [];
  const [categoryScope, setCategoryScope] = useState(
    existingCategories.length > 0 ? CATEGORY_SCOPE_SELECTED : CATEGORY_SCOPE_ALL
  );
  const [selectedCategories, setSelectedCategories] = useState(existingCategories);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  // Active categories, plus any archived one this feature is already tagged with so it stays visible.
  const categoryChoices = categories.filter(
    (entry) => entry.status === "active" || existingCategories.includes(entry.category)
  );

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!serviceName.trim()) {
      toast.error("Feature name is required.");
      return;
    }
    const numericPrice = Number(sellingPrice);
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      toast.error("Price must be a non-negative number.");
      return;
    }
    const isScopedToSelection = categoryScope === CATEGORY_SCOPE_SELECTED;
    if (isScopedToSelection && selectedCategories.length === 0) {
      toast.error("Select at least one category, or choose All Categories.");
      return;
    }

    const payload = {
      serviceName: serviceName.trim(),
      category: FEATURE_UPGRADE_CATEGORY,
      price: numericPrice,
      sellingPrice: numericPrice,
      formattedDescriptions: description.trim() ? [{ content: description.trim() }] : [],
      isHidden,
      // Quantity-based => the project form charges this price per unit and shows a
      // +/- counter. Never inferred from serviceName.
      isQuantityBased,
      // Empty array = offered for every category.
      compatibleWith: isScopedToSelection ? selectedCategories : [],
    };
    if (isEditing) payload._id = feature._id;

    setIsSubmitting(true);
    try {
      const apiConfig = isEditing ? SummaryApi.updateProduct : SummaryApi.uploadProduct;
      const response = await fetch(apiConfig.url, {
        method: apiConfig.method.toUpperCase(),
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.message || "Failed to save feature");
      toast.success(isEditing ? "Feature updated." : "Feature added.");
      onSaved?.();
    } catch (error) {
      console.error("Error saving feature:", error);
      toast.error(error.message || "Failed to save feature");
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleCategory = (value) => {
    setSelectedCategories((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    );
  };

  const handleDelete = async () => {
    if (!isEditing) return;
    setIsDeleting(true);
    try {
      const response = await fetch(SummaryApi.deleteProduct.url, {
        method: SummaryApi.deleteProduct.method.toUpperCase(),
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _id: feature._id }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.message || "Failed to delete feature");
      toast.success("Feature deleted.");
      onDeleted?.();
    } catch (error) {
      console.error("Error deleting feature:", error);
      toast.error(error.message || "Failed to delete feature");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-lg font-bold text-slate-900">
          {isEditing ? "Edit Feature" : "Add Feature"}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-white hover:text-slate-700"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5">
        <div>
          <label className={formLabelClassName}>Feature Name *</label>
          <input
            type="text"
            className={formInputClassName}
            value={serviceName}
            onChange={(event) => setServiceName(event.target.value)}
            placeholder="e.g. Extra Revision Round"
          />
        </div>

        <div>
          <label className={formLabelClassName}>
            {isQuantityBased ? "Price per unit (₹) *" : "Price (₹) *"}
          </label>
          <input
            type="number"
            min={0}
            className={formInputClassName}
            value={sellingPrice}
            onChange={(event) => setSellingPrice(event.target.value)}
          />
        </div>

        <div>
          <label className={formLabelClassName}>Description</label>
          <textarea
            className={formInputClassName}
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <span className={formLabelClassName}>How is this feature charged?</span>
          <div className="mt-1 space-y-2">
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="radio"
                name="feature-quantity-mode"
                checked={!isQuantityBased}
                onChange={() => setIsQuantityBased(false)}
                className="mt-1 h-4 w-4 border-slate-300"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-800">Single feature</span>
                <span className="block text-xs text-slate-500">
                  Selected once and charged at its own price.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="radio"
                name="feature-quantity-mode"
                checked={isQuantityBased}
                onChange={() => setIsQuantityBased(true)}
                className="mt-1 h-4 w-4 border-slate-300"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-800">Quantity-based feature</span>
                <span className="block text-xs text-slate-500">
                  The project form shows a +/- counter and charges price x quantity.
                </span>
              </span>
            </label>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <span className={formLabelClassName}>Available for</span>
          <div className="mt-1 space-y-2">
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="radio"
                name="feature-category-scope"
                checked={categoryScope === CATEGORY_SCOPE_ALL}
                onChange={() => setCategoryScope(CATEGORY_SCOPE_ALL)}
                className="h-4 w-4 border-slate-300"
              />
              <span className="text-sm font-semibold text-slate-800">All categories</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="radio"
                name="feature-category-scope"
                checked={categoryScope === CATEGORY_SCOPE_SELECTED}
                onChange={() => setCategoryScope(CATEGORY_SCOPE_SELECTED)}
                className="h-4 w-4 border-slate-300"
              />
              <span className="text-sm font-semibold text-slate-800">Selected categories</span>
            </label>
          </div>

          {categoryScope === CATEGORY_SCOPE_SELECTED ? (
            <div className="mt-3 grid grid-cols-1 gap-2 border-t border-slate-200 pt-3 sm:grid-cols-2">
              {categoryChoices.map((option) => (
                <label key={option.category} className="flex cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={selectedCategories.includes(option.category)}
                    onChange={() => toggleCategory(option.category)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <span className="text-sm text-slate-700">{option.label}{option.status === "archived" ? " (archived)" : ""}</span>
                </label>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <input
            id="feature-hidden"
            type="checkbox"
            checked={isHidden}
            onChange={(event) => setIsHidden(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          <label htmlFor="feature-hidden" className="text-sm font-semibold text-slate-700">
            Hidden (not shown to clients)
          </label>
        </div>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        {isEditing ? (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting || isSubmitting}
            className="inline-flex items-center justify-center rounded-2xl border border-red-200 px-4 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        ) : (
          <span />
        )}
        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting || isDeleting}
            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || isDeleting}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </form>
  );
};

const AdminFeatureProductsPage = () => {
  const user = useSelector((state) => state?.user?.user);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [features, setFeatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingFeature, setEditingFeature] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const { categories } = useProjectCategories("admin");
  const categoryLabel = (key) => categories.find((entry) => entry.category === key)?.label || key;

  const fetchFeatures = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(SummaryApi.adminFeatureProducts.url, {
        method: SummaryApi.adminFeatureProducts.method.toUpperCase(),
        credentials: "include",
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.message || "Failed to load features");
      setFeatures(Array.isArray(result.data) ? result.data : []);
    } catch (error) {
      console.error("Error fetching feature products:", error);
      toast.error(error.message || "Failed to load features");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeatures();
  }, [fetchFeatures]);

  const handleAddFeature = () => {
    setEditingFeature(null);
    setIsFormOpen(true);
  };

  const handleFeatureOpen = (feature) => {
    setEditingFeature(feature);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingFeature(null);
  };

  const handleFeatureSaved = () => {
    closeForm();
    fetchFeatures();
  };

  const handleLogout = async () => {
    try {
      const response = await fetch(SummaryApi.logout_user.url, {
        method: SummaryApi.logout_user.method,
        credentials: "include",
      });
      const result = await response.json();
      if (result.success) toast.success(result.message);
    } catch (error) {
      console.error("Error during logout:", error);
      toast.error("Logout failed. Please try again.");
    } finally {
      CookieManager.clearAll();
      StorageService.clearUserData();
      dispatch(logout());
      navigate("/");
    }
  };

  return (
    <AdminLayout user={user} onLogout={handleLogout}>
      <AdminWorkspaceShell>
        <AdminWorkspaceHeader
          icon={ListChecks}
          title="Features"
          subtitle="Manage the Additional Features / Upgrades products (feature_upgrades) used across the customer storefront and the admin Create Project for Client form."
        />

        <div className="border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div className="flex justify-start">
            <button
              type="button"
              onClick={handleAddFeature}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
            >
              <Plus size={17} />
              Add Feature
            </button>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {loading ? (
            <p className="text-sm text-slate-500">Loading features...</p>
          ) : features.length === 0 ? (
            <p className="text-sm text-slate-500">No features yet. Click "Add Feature" above.</p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <div className="grid grid-cols-12 gap-3 bg-slate-100 px-5 py-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-600">
                <div className="col-span-6">Feature</div>
                <div className="col-span-3">Price (₹)</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-1 text-right">Open</div>
              </div>
              {features.map((feature, index) => (
                <button
                  key={feature._id}
                  type="button"
                  onClick={() => handleFeatureOpen(feature)}
                  className={`grid w-full grid-cols-12 items-center gap-3 px-5 py-4 text-left transition hover:bg-slate-100 ${index % 2 === 0 ? "bg-white" : "bg-slate-50"}`}
                >
                  <div className="col-span-6">
                    <p className="text-sm font-semibold text-slate-900">{index + 1}. {feature.serviceName}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          feature.isQuantityBased
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {feature.isQuantityBased ? "Quantity-based" : "Single"}
                      </span>
                      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                        {feature.compatibleWith?.length
                          ? feature.compatibleWith.map(categoryLabel).join(", ")
                          : "All categories"}
                      </span>
                    </div>
                    {feature.packageIncludes?.length ? (
                      <p className="mt-1 truncate text-xs text-slate-500">{feature.packageIncludes.join(", ")}</p>
                    ) : null}
                  </div>
                  <div className="col-span-3">
                    <p className="text-sm font-semibold text-slate-900">
                      ₹{feature.sellingPrice ?? feature.price}
                      {feature.isQuantityBased ? (
                        <span className="ml-1 text-xs font-normal text-slate-500">/ unit</span>
                      ) : null}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">{feature.isHidden ? "Hidden" : "Visible"}</span>
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <span className="text-xs font-semibold text-slate-500">Open</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {isFormOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
              <FeatureEditForm
                feature={editingFeature}
                categories={categories}
                onCancel={closeForm}
                onSaved={handleFeatureSaved}
                onDeleted={handleFeatureSaved}
              />
            </div>
          </div>
        ) : null}
      </AdminWorkspaceShell>
    </AdminLayout>
  );
};

export default AdminFeatureProductsPage;
