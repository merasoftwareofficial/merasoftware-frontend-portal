// App.js
import './App.css';
import AppContent from './AppContent';
import { Toaster } from 'sonner';
import { createContext, useContext, useState, useEffect } from 'react';
import { DraftOrdersProvider } from './context/DraftOrdersContext';

// Create a simple context for online status
export const OnlineStatusContext = createContext();

function App() {
  const [isOnline, setIsOnline] = useState(window.navigator.onLine);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    console.log("🟢 [App.js] useEffect running - setting isInitialized=true");
    const handleOnline = () => {
      console.log("🌐 [App.js] Online event triggered");
      setIsOnline(true);
    };
    const handleOffline = () => {
      console.log("🌐 [App.js] Offline event triggered");
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Set initialized after checking online status
    setIsInitialized(true);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <OnlineStatusContext.Provider value={{ isOnline, isInitialized }}>
      <DraftOrdersProvider>
        <Toaster position="top-center" richColors />
        <AppContent />
      </DraftOrdersProvider>
    </OnlineStatusContext.Provider>
  );
}

// Custom hook for easy access
export const useOnlineStatus = () => {
  const context = useContext(OnlineStatusContext);
  if (!context) {
    throw new Error('useOnlineStatus must be used within OnlineStatusProvider');
  }
  return context;
};

export default App;