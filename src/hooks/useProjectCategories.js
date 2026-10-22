import { useCallback, useEffect, useState } from "react";
import SummaryApi from "../common";

// Project categories from the backend SSOT (backend helpers/projectCategories.js).
//   scope "admin":    every category (archived included) with price, status and usage.
//   scope "customer": only categories a customer can order online (active, opened, priced).
// Nothing in the portal hardcodes the category list any more; read it through this hook.
const ENDPOINTS = {
  admin: () => SummaryApi.categoryBasePrices,
  customer: () => SummaryApi.customerProjectCategories,
};

const useProjectCategories = (scope = "admin") => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const endpoint = ENDPOINTS[scope]();
        const response = await fetch(endpoint.url, { method: endpoint.method.toUpperCase(), credentials: "include", signal: controller.signal });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || "Project categories could not be loaded");
        setCategories(Array.isArray(result.data) ? result.data : []);
      } catch (loadError) {
        if (loadError.name !== "AbortError") setError(loadError.message || "Project categories could not be loaded");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [scope, reloadKey]);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);
  return { categories, loading, error, reload };
};

export default useProjectCategories;
