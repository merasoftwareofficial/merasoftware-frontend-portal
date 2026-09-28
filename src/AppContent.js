import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useOnlineStatus } from './App';
import { setUserDetails, updateWalletBalance, logout } from './store/userSlice';
import SummaryApi from './common';
import Context from './context';
import CookieManager from './utils/cookieManager';
import StorageService from './utils/storageService';
import ScrollToTop from './helpers/scrollTop';
import { getOrderCategory, isActiveWorkItem } from './helpers/orderPresentation';
import { clearOrderSummary, getOrderSummary } from './utils/orderSummaryClient';
// import QRModal from './components/QRModal';
// import socket from './components/socket';
// import { AnimatePresence } from 'framer-motion';
// import AnimatedRoutes from './components/AnimatedRoutes';

const STORAGE_KEYS = {
  WALLET_BALANCE: 'walletBalance',
  USER_DETAILS: 'userDetails',
  GUEST_SLIDES: 'guestSlides'
};

const AppContent = () => {
  const dispatch = useDispatch();
  const user = useSelector(state => state?.user?.user);
  const { isOnline, isInitialized } = useOnlineStatus(); 
  const [walletBalance, setWalletBalance] = useState(0);
  const [activeProject, setActiveProject] = useState(null);
  const [showQR, setShowQR] = useState(false);

  // Drops everything this browser remembers about the signed-in user.
  const clearLocalSession = () => {
    CookieManager.clearAll();
    // Clear localStorage but preserve essential data
    StorageService.clearAll();
    clearOrderSummary();
    document.cookie = "session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    setWalletBalance(0);
    dispatch(updateWalletBalance(0));
    dispatch(logout());
  };

  const handleLogout = async () => {
    try {
      const response = await fetch(SummaryApi.logout.url, {
        method: SummaryApi.logout.method,
        credentials: 'include'
      });

      if (response.ok) {
        clearLocalSession();
      }
    } catch (error) {
      console.error("Error during logout:", error);
    }
  };

  const fetchWalletBalance = async () => {
    try {
      const response = await fetch(SummaryApi.current_user.url, {
        method: SummaryApi.current_user.method,
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch wallet balance: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        const balance = Number(data.data?.walletBalance || 0);
        setWalletBalance(balance);
        dispatch(updateWalletBalance(balance));
        StorageService.setWalletBalance(balance);
      }
    } catch (error) {
      console.error("Error fetching wallet balance:", error);
      const cachedBalance = StorageService.getWalletBalance();
      if (cachedBalance !== null) {
        setWalletBalance(cachedBalance);
        dispatch(updateWalletBalance(cachedBalance));
      }
    }
  };

  const fetchUserDetails = async () => {
    try {
      let hasUserData = false;
      let loadedUser = null;

      // First check localStorage
      const cachedDetails = StorageService.getUserDetails();
      if (cachedDetails) {
        dispatch(setUserDetails(cachedDetails));
        const cachedWalletBalance = Number(cachedDetails.walletBalance || 0);
        setWalletBalance(cachedWalletBalance);
        dispatch(updateWalletBalance(cachedWalletBalance));
        hasUserData = true;
        loadedUser = cachedDetails;
      }

      // If online, fetch fresh data
      if (isOnline) {
        const dataResponse = await fetch(SummaryApi.current_user.url, {
          method: SummaryApi.current_user.method,
          credentials: 'include'
        });
        // 401: the shared cookie is gone or no longer valid (signed out on the website,
        // banned, deleted) — the cached user must go too. Other failures keep the cache.
        if (dataResponse.status === 401) {
          clearLocalSession();
          return null;
        }
        if (!dataResponse.ok) {
          return hasUserData ? loadedUser : null;
        }
        const dataApi = await dataResponse.json();
        
        if (dataApi.success && dataApi.data) {
          // Save to cookies
          CookieManager.setUserDetails({
            _id: dataApi.data._id,
            name: dataApi.data.name,
            email: dataApi.data.email,
            role: dataApi.data.role
          });

          // Save to localStorage
          StorageService.setUserDetails(dataApi.data);
          dispatch(setUserDetails(dataApi.data));
          loadedUser = dataApi.data;
          
          // Update wallet balance if it exists
          if (dataApi.data.walletBalance !== undefined) {
            const balance = Number(dataApi.data.walletBalance || 0);
            setWalletBalance(balance);
            dispatch(updateWalletBalance(balance));
            StorageService.setWalletBalance(balance);
          }
          hasUserData = true;
        }
      }

      return hasUserData ? loadedUser : null;
    } catch (error) {
      console.error("Error fetching user details:", error);
      return null;
    }
  };

   // Add a function to update active project that can be called from child components
 const updateActiveProject = (project) => {
  // console.log("AppContent: updating activeProject:", project);
  setActiveProject(project);
};

  useEffect(() => {
    const initializeData = async () => {
      try {
        console.log("🔵 [AppContent] initializeData() started - isInitialized:", isInitialized);

        if (!isInitialized) {
          console.log("🔴 [AppContent] isInitialized is false, returning early");
          return;
        }

        // Try to get user data from localStorage first
        const cachedUser = StorageService.getUserDetails();
        console.log("💾 [AppContent] Checking localStorage for userDetails:", cachedUser ? "FOUND" : "NOT FOUND");
        console.log("💾 [AppContent] Cached user data:", cachedUser);

        if (cachedUser) {
          console.log("✅ [AppContent] Restoring user from localStorage:", cachedUser.name);
          await fetchUserDetails();
          return;
        }

        if (isOnline) {
          console.log("🌐 [AppContent] User is online, verifying session with API");
          const userLoaded = await fetchUserDetails();

          if (!userLoaded) {
            console.log("❌ [AppContent] API returned not ok, logging out");
            dispatch(logout());
            return;
          }
        } else {
          // Offline aur no cached user
          console.log("📡 [AppContent] Offline aur no cached user, logging out");
          dispatch(logout());
        }
      } catch (error) {
        console.error("Error during initialization:", error);
        dispatch(logout());
      }
    };

    console.log("🟡 [AppContent] useEffect dependency changed - isInitialized:", isInitialized);
    initializeData();
  }, [isInitialized]);

  // In AppContent.js
useEffect(() => {
  const fetchActiveProject = async () => {
    if (!user?._id || user.role !== "customer") {
      setActiveProject(null);
      return;
    }
    
    try {
      const allOrders = await getOrderSummary({ force: true });
      if (allOrders) {
        
        // Filter for website projects
        const websiteProjects = allOrders.filter(order => {
          const category = getOrderCategory(order).toLowerCase();
          return ['standard_websites', 'dynamic_websites', 'cloud_software_development', 'app_development'].includes(category);
        });
        
        // Find active (in-progress) project
        const activeProj = websiteProjects.find(project => {
          const category = getOrderCategory(project).toLowerCase();
          if (!category) return false;
          
          if (['standard_websites', 'dynamic_websites', 'cloud_software_development', 'app_development'].includes(category)) {
            // Shared with every other "what is the customer working on" list
            // (helpers/orderPresentation.js). Written inline here before, which is how it came to
            // exclude only rejected — a cancelled project still counted as the active one.
            return isActiveWorkItem(project);
          }
          return false;
        });
        
        // console.log("Setting active project at AppContent level:", activeProj);
        setActiveProject(activeProj || null);
      }
    } catch (error) {
      console.error("Error fetching active project:", error);
    }
  };

  fetchActiveProject();
  
  // Re-fetch at intervals or when user changes
  const interval = setInterval(fetchActiveProject, 300000); // every 5 minutes
  return () => clearInterval(interval);
  
}, [user?._id, user?.role]);

// useEffect(() => {
//   const handleQR = () => setShowQR(true);
//   socket.on('qr', handleQR);
//   return () => socket.off('qr', handleQR);
// }, []);

// useEffect(() => {
//   const handleReady = () => setShowQR(false);

//   socket.on('ready', handleReady);
//   return () => socket.off('ready', handleReady);
// }, []);
  // const isDashboard = window.location.pathname.includes('/dashboard');

  return (
     <Context.Provider value={{
        fetchUserDetails,
        walletBalance,
        setWalletBalance,
        fetchWalletBalance,
        handleLogout,
        activeProject,
      updateActiveProject
      }}>
        <div className="flex min-h-screen flex-col">
          <ScrollToTop />
          <main className="flex-1 pt-0 md:pt-0">
            <Outlet />
          </main>
        </div>
      </Context.Provider>
  )
}

export default AppContent;
