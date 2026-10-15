import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { useOnlineStatus } from './App';
import { setUserDetails, updateWalletBalance, logout } from './store/userSlice';
import SummaryApi from './common';
import Context from './context';
import CookieManager from './utils/cookieManager';
import StorageService from './utils/storageService';
import ScrollToTop from './helpers/scrollTop';
import { getOrderCategory, isActiveWorkItem } from './helpers/orderPresentation';
import { clearOrderSummary, getOrderSummary } from './utils/orderSummaryClient';
import { createSessionClient } from './utils/sessionClient';
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
  const store = useStore();
  const user = useSelector(state => state?.user?.user);
  const { isOnline, isInitialized } = useOnlineStatus(); 
  const [walletBalance, setWalletBalance] = useState(0);
  const [activeProject, setActiveProject] = useState(null);
  const [showQR, setShowQR] = useState(false);

  const [sessionError, setSessionError] = useState('');
  const [sessionChecking, setSessionChecking] = useState(false);
  const [sessionClient] = useState(() => createSessionClient({
    url: SummaryApi.current_user.url,
    method: SummaryApi.current_user.method,
    onChecking: () => {
      setSessionError('');
      setSessionChecking(true);
    },
    onUser: (details) => {
      const cached = StorageService.getUserDetails();
      if (cached?._id !== details._id) clearOrderSummary();
      CookieManager.setUserDetails(details);
      StorageService.setUserDetails(details);
      dispatch(setUserDetails(details));
      const balance = Number(details.walletBalance || 0);
      setWalletBalance(balance);
      dispatch(updateWalletBalance(balance));
      StorageService.setWalletBalance(balance);
      setSessionChecking(false);
    },
    onSignedOut: () => clearLocalSession(),
    onError: (message) => {
      setSessionError(message);
      setSessionChecking(false);
    },
  }));
  const fetchUserDetails = sessionClient.check;

  // Drops everything this browser remembers about the signed-in user.
  const clearLocalSession = () => {
    sessionClient.cancel();
    setSessionError('');
    setSessionChecking(false);
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
      const response = await fetch(SummaryApi.logout_user.url, {
        method: SummaryApi.logout_user.method,
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

   // Add a function to update active project that can be called from child components
 const updateActiveProject = (project) => {
  // console.log("AppContent: updating activeProject:", project);
  setActiveProject(project);
};

  useEffect(() => {
    if (!isInitialized) return;
    void sessionClient.check();
    // Recheck on connectivity changes, and discard responses after unmount.
    return () => sessionClient.cancel();
  }, [isInitialized, isOnline, sessionClient]);

  useEffect(() => store.subscribe(() => {
    const session = store.getState().user;
    // Existing portal screens dispatch logout themselves. Invalidate pending
    // checks synchronously too, so none can restore a user after that action.
    if (session.initialized && !session.user) {
      sessionClient.cancel();
      setSessionChecking(false);
    }
  }), [store, sessionClient]);

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
        sessionError,
        sessionChecking,
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
