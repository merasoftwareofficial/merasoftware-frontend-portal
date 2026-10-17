import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import SummaryApi from "../common";
import { getPortalHome } from "../helpers/portalHome";

const SetNewPassword = () => {
  const navigate = useNavigate();
  const user = useSelector((state) => state?.user?.user);
  const portalHome = getPortalHome(user?.role);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (newPassword.length < 4) {
      toast.error("Password must be at least 4 characters long");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(SummaryApi.setNewPassword.url, {
        method: SummaryApi.setNewPassword.method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      const result = await response.json();
      if (!result.success) {
        toast.error(result.message || "Failed to update password");
        return;
      }
      toast.success("Password updated successfully");
      navigate(portalHome, { replace: true });
    } catch (error) {
      console.error("Error setting new password:", error);
      toast.error("Error updating password");
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    navigate(portalHome, { replace: true });
  };

  return (
    <div className="portal-surface flex min-h-screen items-center justify-center px-4 py-10">
      <div className="glass-panel w-full max-w-md rounded-3xl p-8">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-300">
            <KeyRound size={26} />
          </div>
          <h1 className="mt-4 text-xl font-bold text-[var(--text-primary)]">Set your password</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Your account was created with a default password. Set your own password to secure it.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-[var(--text-secondary)]">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              className="w-full rounded-2xl border border-[var(--field-border)] bg-[var(--field-bg)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-emerald-400/50 focus:bg-[var(--glass-bg)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-[var(--text-secondary)]">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              className="w-full rounded-2xl border border-[var(--field-border)] bg-[var(--field-bg)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-emerald-400/50 focus:bg-[var(--glass-bg)]"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Password"}
          </button>
        </form>

        <button
          type="button"
          onClick={handleSkip}
          className="mt-4 w-full text-center text-sm font-medium text-[var(--text-muted)] transition hover:text-[var(--text-secondary)]"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
};

export default SetNewPassword;
