import React from 'react';
import { useSelector } from 'react-redux';

import DashboardLayout from '../components/DashboardLayout';
import Badge from '../components/Badge';
import ProfileSettingsSection from '../components/settings/ProfileSettingsSection';
import AppearanceSettingsSection from '../components/settings/AppearanceSettingsSection';

/**
 * /settings — the one home for customer settings. Each setting group is its
 * own section component; a new group (notifications, language, …) is a new
 * section here, not a new page. /profile redirects here (customerRoutes.js).
 */
const SettingsPage = () => {
  const user = useSelector((state) => state?.user?.user);

  return (
    <DashboardLayout user={user} activeProject={null}>
      <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />

        <div className="relative mx-auto max-w-3xl">
          <div className="text-center">
            <Badge tone="neutral">Account</Badge>
            <h1 className="mt-5 text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl lg:text-4xl">
              Settings
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-base text-[var(--text-secondary)] sm:text-lg">
              Manage your profile and how the portal looks.
            </p>
          </div>

          <div className="mt-10 space-y-12">
            <ProfileSettingsSection />
            <AppearanceSettingsSection />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default SettingsPage;
