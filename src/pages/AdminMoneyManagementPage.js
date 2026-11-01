import { useResource } from '../hooks/useResource';
import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { IndianRupee, Loader2 } from "lucide-react";
import SummaryApi from "../common";
import { logout } from "../store/userSlice";
import CookieManager from "../utils/cookieManager";
import StorageService from "../utils/storageService";
import { useOnlineStatus } from "../App";
import AdminLayout from "../components/AdminLayout";
import AdminWorkspaceShell, { AdminWorkspaceHeader } from "../components/admin/AdminWorkspaceShell";

const AdminMoneyManagementPage = () => {
  const user = useSelector((state) => state?.user?.user);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isOnline } = useOnlineStatus();

  const [saving, setSaving] = useState(false);
  const [rewardAmount, setRewardAmount] = useState("");

  const handleLogout = async () => {
    try {
      if (isOnline) {
        const response = await fetch(SummaryApi.logout_user.url, {
          method: SummaryApi.logout_user.method,
          credentials: "include",
        });
        const data = await response.json();
        if (data.success) toast.success(data.message);
      }
      CookieManager.clearAll();
      StorageService.clearUserData();
      dispatch(logout());
      navigate("/");
    } catch (error) {
      console.error("Error during logout:", error);
      toast.error("Logout failed. Please try again.");
    }
  };

  const { loading, error } = useResource(SummaryApi.getAdminSettings.url, (next, initial) => {
    if (initial) setRewardAmount(String(next?.leadReferralRewardAmount ?? 0));
  });
  useEffect(() => { if (error) toast.error(error); }, [error]);

  const handleSave = async (event) => {
    event.preventDefault();

    const amount = Number(rewardAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(SummaryApi.updateAdminSettings.url, {
        method: SummaryApi.updateAdminSettings.method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadReferralRewardAmount: amount }),
      });
      const result = await response.json();
      if (!result.success) {
        toast.error(result.message || "Failed to update settings");
        return;
      }
      toast.success("Settings updated");
      setRewardAmount(String(result.data?.leadReferralRewardAmount ?? amount));
    } catch (error) {
      console.error("Error updating admin settings:", error);
      toast.error("Error updating settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout user={user} onLogout={handleLogout}>
      <AdminWorkspaceShell>
        <AdminWorkspaceHeader
          icon={IndianRupee}
          title="Money Management"
          subtitle="Configure admin-editable amounts used across the platform."
        />

        <div className="p-5 sm:p-6">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 className="animate-spin" size={28} />
            </div>
          ) : (
            <div className="max-w-xl rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Lead Reference Reward</h3>
              <p className="mt-1 text-sm text-slate-500">
                Amount instantly credited to a customer's wallet when a new lead is linked to them via the Add Lead "Reference" source.
              </p>

              <form onSubmit={handleSave} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label className="mb-1 block text-sm font-semibold text-slate-700">Reward Amount (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={rewardAmount}
                    onChange={(e) => setRewardAmount(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                  />
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </form>
            </div>
          )}
        </div>
      </AdminWorkspaceShell>
    </AdminLayout>
  );
};

export default AdminMoneyManagementPage;
