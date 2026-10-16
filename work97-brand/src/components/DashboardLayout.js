// src/components/DashboardLayout.jsx
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'sonner';
import {
  Home, ShoppingBag, UserCircle, Wallet, MessageSquare, LogOut,
  FileText, PlusCircle, Gamepad2, FileCheck
} from 'lucide-react';
import SummaryApi from '../common';
import { logout } from '../store/userSlice';
import CookieManager from '../utils/cookieManager';
import StorageService from '../utils/storageService';
import { useOnlineStatus } from '../App';
import MobileSidebarDrawer from './MobileSidebarDrawer';
import MobileBottomNav from './MobileBottomNav';
import PortalHeader from './PortalHeader';
import SidebarNavItem from './SidebarNavItem';
import DraftOrderSavedDrawer from './DraftOrderSavedDrawer';
import Modal from './Modal';
import GlassButton from './GlassButton';
import FloatingCartButton from './FloatingCartButton';
import { ThemeProvider } from '../context/ThemeContext';
import { PageTransition } from './PageMotion';

const DashboardLayout = ({ children, user, walletBalance, cartCount, isLoading, activeProject }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { isOnline } = useOnlineStatus();
  const currentPath = location.pathname;
  
  // Get user from Redux store as backup
  const reduxUser = useSelector(state => state?.user?.user);
  const currentUser = user || reduxUser;
  
  // State for logout confirmation popup
  const [showLogoutConfirmation, setShowLogoutConfirmation] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // If user is null/undefined, redirect to login
  useEffect(() => {
    if (!isLoading && !currentUser) {
      navigate('/login');
    }
  }, [currentUser, isLoading, navigate]);
  
  const projectsAndPlansActive = currentPath.startsWith('/projects-and-plans');
  const quickLinks = [
    {
      to: '/dashboard',
      label: 'Dashboard',
      icon: Home,
      active: currentPath === '/dashboard',
    },
    {
      to: '/projects-and-plans',
      label: 'Projects and Plans',
      icon: FileText,
      active: projectsAndPlansActive,
    },
    {
      to: '/start-new-project',
      label: 'Explore Services',
      icon: PlusCircle,
      active: currentPath.startsWith('/start-new-project'),
    },
  ];

  const gamesActive = currentPath.startsWith('/games');
  const secondaryLinks = [
    { to: '/order', label: 'Orders', icon: ShoppingBag, active: currentPath.startsWith('/order') },
    { to: '/documents', label: 'Documents', icon: FileCheck, active: currentPath.startsWith('/documents') },
    { to: '/wallet', label: 'Wallet', icon: Wallet, active: currentPath.startsWith('/wallet') },
    { to: '/games', label: 'Games', icon: Gamepad2, active: gamesActive },
    { to: '/profile', label: 'Settings', icon: UserCircle, active: currentPath.startsWith('/profile') },
    { to: '/support', label: 'Support', icon: MessageSquare, active: currentPath.startsWith('/support') },
  ];

  const bottomNavTabs = [
    { to: '/dashboard', label: 'Dashboard', icon: Home, active: currentPath === '/dashboard' },
    { to: '/projects-and-plans', label: 'Projects', icon: FileText, active: projectsAndPlansActive },
    { to: '/start-new-project', label: 'Start', icon: PlusCircle, active: currentPath.startsWith('/start-new-project') },
    { to: '/games', label: 'Games', icon: Gamepad2, active: gamesActive },
  ];

  // Handle logout confirmation
  const handleLogoutClick = () => {
    setShowLogoutConfirmation(true);
  };

  // Handle actual logout
  const handleConfirmLogout = async () => {
    try {
      setIsLoggingOut(true);
      
      // 1. Save guest slides before logout
      const guestSlides = StorageService.getGuestSlides();
      if (guestSlides && guestSlides.length > 0) {
        try {
          // Store in multiple locations for backup
          sessionStorage.setItem('sessionGuestSlides', JSON.stringify(guestSlides));
          localStorage.setItem('preservedGuestSlides', JSON.stringify(guestSlides));
          localStorage.setItem('guestSlides', JSON.stringify(guestSlides)); 
          localStorage.setItem('lastLogoutTimestamp', Date.now().toString());
        } catch (backupError) {
          console.error('Failed to backup slides:', backupError);
        }
      }

      // 2. Call logout API if online
      if (isOnline) {
        const response = await fetch(SummaryApi.logout_user.url, {
          method: SummaryApi.logout_user.method,
          credentials: 'include'
        });
    
        const data = await response.json();
        if (data.success) {
          toast.success(data.message);
        }
      }

      // 3. Clear cookies
      CookieManager.clearAll();
      
      // 4. Clear user data from localStorage
      StorageService.clearUserData();
      
      // 5. Verify guest slides are preserved
      const preserved = localStorage.getItem('preservedGuestSlides');
      const sessionBackup = sessionStorage.getItem('sessionGuestSlides');
      
      if (!localStorage.getItem('guestSlides')) {
        if (preserved) {
          localStorage.setItem('guestSlides', preserved);
        } else if (sessionBackup) {
          localStorage.setItem('guestSlides', sessionBackup);
        }
      }
      
      // 6. Close popup first
      setShowLogoutConfirmation(false);
      
      // 7. Dispatch logout action
      dispatch(logout());
      
      // 8. Navigate after a small delay to prevent race condition
      setTimeout(() => {
        navigate("/", { replace: true });
      }, 100);
      
    } catch (error) {
      console.error("Error during logout:", error);
      toast.error("Logout failed. Please try again.");
    } finally {
      setIsLoggingOut(false);
    }
  };

  // Handle cancel logout
  const handleCancelLogout = () => {
    setShowLogoutConfirmation(false);
  };

  // Loading state or no user
  if (!currentUser) {
    return (
      <div className="portal-surface flex min-h-full">
        <div className="w-full p-4 flex flex-col">
          <div className="animate-pulse">
            <div className="h-32 rounded mb-4 bg-[var(--glass-bg-subtle)]"></div>
            <div className="h-64 rounded bg-[var(--glass-bg-subtle)]"></div>
          </div>
        </div>
      </div>
    );
  }

  const sidebarContent = (
    <div className="flex h-full w-full flex-col">
      <div className="border-b border-[var(--glass-border)] px-5 pt-8 pb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--glass-bg-strong)] text-[var(--text-primary)] ring-1 ring-[var(--glass-border)]">
            {currentUser?.profilePic ? (
              <img
                src={currentUser.profilePic}
                alt={currentUser?.name || 'User'}
                className="h-full w-full rounded-2xl object-cover"
              />
            ) : (
              <span className="text-lg font-bold">
                {(currentUser?.name || 'U').trim().charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-[var(--text-primary)]">
              {currentUser?.name || 'User'}
            </p>
            <p className="truncate text-sm text-[var(--text-secondary)]">
              {currentUser?.email || 'Customer Portal'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-3 py-4">
        <p className="px-3 text-sm font-semibold uppercase text-[var(--text-muted)]">
          Quick Links
        </p>

        <div className="mt-3 space-y-2">
          {quickLinks.map((link) => (
            <SidebarNavItem
              key={link.label}
              {...link}
              variant="primary"
              onNavigate={() => setMobileMenuOpen(false)}
            />
          ))}
        </div>

        <div className="mt-6 border-t border-[var(--glass-border)] pt-4">
          <p className="px-3 text-sm font-semibold uppercase text-[var(--text-muted)]">
            More
          </p>
          <div className="mt-3 space-y-2">
            {secondaryLinks.map((link) => (
              <SidebarNavItem
                key={link.label}
                {...link}
                variant="secondary"
                onNavigate={() => setMobileMenuOpen(false)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--glass-border)] p-4">
        <button
          onClick={handleLogoutClick}
          className="flex w-full items-center gap-3 rounded-2xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-3 text-left text-base font-semibold text-[var(--danger-fg)] transition hover:bg-[var(--danger-bg-hover)]"
          disabled={isLoggingOut}
        >
          <LogOut size={18} className="shrink-0" />
          <span className="flex-1">
            {isLoggingOut ? 'Logging out...' : 'Logout'}
          </span>
        </button>
      </div>
    </div>
  );

  return (
    <ThemeProvider>
      <PortalHeader
        user={currentUser}
        portalLabel="Customer Portal"
        dashboardTo="/dashboard"
        onLogout={handleLogoutClick}
        showThemeSwitch
        links={[...quickLinks, ...secondaryLinks].map(({ to, label }) => ({ to, label }))}
      />
      <div className="flex min-h-full items-stretch bg-[var(--shell-bg)]">
        <aside
          className="portal-surface sticky top-16 z-40 hidden h-[calc(100vh-4rem)] w-72 shrink-0 flex-col self-start overflow-y-auto border-r border-[var(--sidebar-border)] text-[var(--text-primary)] shadow-2xl lg:flex"
        >
          <div className="flex h-full w-full flex-col bg-[var(--scrim)]">
            {sidebarContent}
          </div>
        </aside>

        <MobileSidebarDrawer isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} themed>
          {sidebarContent}
        </MobileSidebarDrawer>

        <div className="min-w-0 flex-1">
          <main
            className="portal-surface min-h-full pb-16 lg:pb-0"
          >
            <PageTransition pageKey={location.key}>
              {children}
            </PageTransition>
          </main>
        </div>
      </div>

      <MobileBottomNav tabs={bottomNavTabs} onMoreClick={() => setMobileMenuOpen(true)} themed />

      {/* Customer cart (moved from AppContent — cart is a customer-portal feature). */}
      <DraftOrderSavedDrawer />
      <FloatingCartButton />

      {/* Logout Confirmation Popup */}
      {/* The logout confirm was a hand-written overlay: its own bg-black/50
          scrim, its own panel, its own close button, no Escape key. Modal has
          all four. The red stays — "Yes, Logout" is a destructive confirm, and
          white on red-600 measures 4.8:1, so here the colour both means
          something and is readable. */}
      {showLogoutConfirmation && currentUser && (
        <Modal
          open
          onClose={isLoggingOut ? undefined : handleCancelLogout}
          title="Confirm Logout"
          footer={(
            <div className="flex gap-3">
              <GlassButton
                onClick={handleCancelLogout}
                disabled={isLoggingOut}
                strong
                className="flex-1 disabled:opacity-50"
              >
                No, Cancel
              </GlassButton>
              <GlassButton
                onClick={handleConfirmLogout}
                disabled={isLoggingOut}
                className="flex-1 border-transparent bg-red-600 text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoggingOut ? 'Logging out...' : 'Yes, Logout'}
              </GlassButton>
            </div>
          )}
        >
          <p className="mb-2 text-base text-[var(--text-secondary)]">
            Hello <span className="font-medium text-[var(--text-primary)]">{currentUser?.name || 'User'}</span>,
          </p>
          <p className="text-base text-[var(--text-secondary)]">
            Are you sure you want to logout from your account?
          </p>
        </Modal>
      )}
    </ThemeProvider>
  );
};

export default DashboardLayout;
