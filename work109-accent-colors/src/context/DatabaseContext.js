import React, { createContext, useContext, useEffect, useState } from 'react';
import { openDB } from 'idb';

const DatabaseContext = createContext();

const DB_NAME = 'ecommerceDB';
const DB_VERSION = 2; // Version बढ़ा दी है
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

const PRIORITY_LEVELS = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low'
};

const LS_PREFIX = 'ecom_';

export function DatabaseProvider({ children }) {
  const [db, setDb] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isOnline, setIsOnline] = useState(window.navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const preserveGuestSlidesOnStartup = () => {
    console.log('Preserving guest slides during initialization');
    try {
      // Check all possible sources with improved format handling
      const sources = [
        { key: 'guestSlides', storage: localStorage },
        { key: 'preservedGuestSlides', storage: localStorage },
        { key: 'sessionGuestSlides', storage: sessionStorage },
        { key: `${LS_PREFIX}apiCache_guest_slides`, storage: localStorage }
      ];
      
      // Find first valid data source with proper format handling
      let bestSlides = null;
      
      for (const source of sources) {
        try {
          const data = source.storage.getItem(source.key);
          if (data) {
            let parsedData;
            try {
              parsedData = JSON.parse(data);
            } catch (parseError) {
              console.error(`Error parsing ${source.key}:`, parseError);
              continue;
            }
            
            // Handle all possible formats
            const slides = Array.isArray(parsedData) ? parsedData : 
                         (parsedData.data && Array.isArray(parsedData.data) ? parsedData.data : null);
            
            if (slides && slides.length > 0) {
              console.log(`Found guest slides in ${source.key}, count:`, slides.length);
              
              // Keep the one with most items if multiple sources found
              if (!bestSlides || slides.length > bestSlides.length) {
                bestSlides = slides;
              }
            }
          }
        } catch (e) {
          console.error(`Error reading from ${source.key}:`, e);
        }
      }
      
      // If we found data, ensure it's saved to all standard locations
      if (bestSlides && bestSlides.length > 0) {
        console.log('Saving best guest slides to all locations, count:', bestSlides.length);
        
        // Always save as plain arrays for consistency
        localStorage.setItem('guestSlides', JSON.stringify(bestSlides));
        sessionStorage.setItem('sessionGuestSlides', JSON.stringify(bestSlides));
        
        // Also save in IndexedDB format
        localStorage.setItem(`${LS_PREFIX}apiCache_guest_slides`, JSON.stringify({
          storeName: 'apiCache',
          key: 'guest_slides',
          data: bestSlides,
          priority: 'high',
          timestamp: new Date().toISOString()
        }));
      }
    } catch (error) {
      console.error('Error preserving guest slides on startup:', error);
    }
  };

  useEffect(() => {
    const initDB = async () => {
      try {

        // First, preserve guest slides before anything else
      preserveGuestSlidesOnStartup();

        const database = await openDB(DB_NAME, DB_VERSION, {
          upgrade(db, oldVersion, newVersion) {
            // Delete existing stores if they exist
            if (oldVersion < 2) {
              const stores = ['products', 'categories', 'apiCache', 'userData'];
              stores.forEach(store => {
                if (db.objectStoreNames.contains(store)) {
                  db.deleteObjectStore(store);
                }
              });

              // Create new stores with correct keyPath
              db.createObjectStore('products', { 
                keyPath: ['storeName', 'key'] 
              });
              db.createObjectStore('categories', { 
                keyPath: ['storeName', 'key'] 
              });
              db.createObjectStore('apiCache', { 
                keyPath: ['storeName', 'key'] 
              });
              db.createObjectStore('userData', { 
                keyPath: ['storeName', 'key'] 
              });
            }
          },
        });
        
        setDb(database);
        setIsInitialized(true);
      } catch (error) {
        console.error('Error initializing database:', error);
        setIsInitialized(true);
      }
    };

    initDB();
  }, []);

  const hybridCache = {
    isValid: (timestamp, duration = CACHE_DURATION) => {
      return timestamp && (Date.now() - new Date(timestamp).getTime() < duration);
    },

    store: async (storeName, key, data, priority = PRIORITY_LEVELS.MEDIUM) => {
      try {
        // Prepare cache data with composite key
        const cacheData = {
          storeName,
          key,
          data,
          priority,
          timestamp: new Date().toISOString()
        };

        // Store in IndexedDB
        if (db) {
          const store = db.transaction(storeName, 'readwrite').objectStore(storeName);
          await store.put(cacheData);
        }

        // Store in LocalStorage
        const lsKey = `${LS_PREFIX}${storeName}_${key}`;
        localStorage.setItem(lsKey, JSON.stringify(cacheData));

        return true;
      } catch (error) {
        console.error('Store error:', error);
        return false;
      }
    },

    get: async (storeName, key) => {
      try {
        // Check LocalStorage first
        const lsKey = `${LS_PREFIX}${storeName}_${key}`;
        const lsData = localStorage.getItem(lsKey);
        
        if (lsData) {
          const parsedData = JSON.parse(lsData);
          if (hybridCache.isValid(parsedData.timestamp)) {
            return parsedData;
          }
        }

        // If not in LocalStorage or invalid, check IndexedDB
        if (db) {
          const idbData = await db.get(storeName, [storeName, key]);
          if (idbData && hybridCache.isValid(idbData.timestamp)) {
            localStorage.setItem(lsKey, JSON.stringify(idbData));
            return idbData;
          }
        }

        return null;
      } catch (error) {
        console.error('Cache read error:', error);
        return null;
      }
    },

    clear: async (storeName, key) => {
      try {
        // Clear LocalStorage
        const lsKey = `${LS_PREFIX}${storeName}_${key}`;
        localStorage.removeItem(lsKey);

        // Clear IndexedDB
        if (db) {
          await db.delete(storeName, [storeName, key]);
        }

        return true;
      } catch (error) {
        console.error('Clear cache error:', error);
        return false;
      }
    },

    clearAll: async () => {
      try {
        // 1. First collect ALL guest slides data from multiple sources
        let bestGuestSlides = null;
        const backupSources = [
          { key: 'guestSlides', storage: localStorage },
          { key: 'preservedGuestSlides', storage: localStorage },
          { key: 'sessionGuestSlides', storage: sessionStorage },
          { key: `${LS_PREFIX}apiCache_guest_slides`, storage: localStorage }
        ];
        
        // Find best available slides from all sources
        for (const source of backupSources) {
          try {
            const data = source.storage.getItem(source.key);
            if (data) {
              const parsed = JSON.parse(data);
              // Handle all possible formats consistently
              const slides = Array.isArray(parsed) ? parsed : 
                            (parsed.data && Array.isArray(parsed.data) ? parsed.data : null);
              
              if (slides && slides.length > 0) {
                console.log(`Found slides in ${source.key}, count:`, slides.length);
                if (!bestGuestSlides || slides.length > bestGuestSlides.length) {
                  bestGuestSlides = slides;
                }
              }
            }
          } catch (e) {
            console.error(`Error reading from ${source.key}:`, e);
          }
        }
        
        // Important persistent data to preserve
        const persistentData = {
          theme: localStorage.getItem('theme'),
          language: localStorage.getItem('language'),
          lastLogoutTimestamp: localStorage.getItem('lastLogoutTimestamp')
        };
    
        // 2. Clear localStorage except for preserved keys
        const keysToKeep = ['theme', 'language', 'lastLogoutTimestamp', 'preservedGuestSlides'];
        Object.keys(localStorage)
          .filter(key => !keysToKeep.includes(key))
          .forEach(key => {
            localStorage.removeItem(key);
          });
    
        // 3. Restore guest slides using best available data
        if (bestGuestSlides && bestGuestSlides.length > 0) {
          console.log('Restoring guest slides after cache clear, count:', bestGuestSlides.length);
          
          // Save to all relevant locations consistently as arrays
          localStorage.setItem('guestSlides', JSON.stringify(bestGuestSlides));
          sessionStorage.setItem('sessionGuestSlides', JSON.stringify(bestGuestSlides));
          
          // Also save to hybridCache format
          localStorage.setItem(`${LS_PREFIX}apiCache_guest_slides`, JSON.stringify({
            storeName: 'apiCache',
            key: 'guest_slides',
            data: bestGuestSlides,
            priority: 'high',
            timestamp: new Date().toISOString()
          }));
        }
        
        // 4. Restore other persistent settings
        if (persistentData.theme) localStorage.setItem('theme', persistentData.theme);
        if (persistentData.language) localStorage.setItem('language', persistentData.language);
        if (persistentData.lastLogoutTimestamp) {
          localStorage.setItem('lastLogoutTimestamp', persistentData.lastLogoutTimestamp);
        }
    
        // 5. Clear IndexedDB stores while preserving guest slides
        if (db) {
          const stores = ['products', 'categories', 'apiCache', 'userData'];
          await Promise.all(stores.map(async store => {
            if (store === 'apiCache') {
              // For apiCache, only clear non-guest items
              const allItems = await db.getAll(store);
              const itemsToDelete = allItems.filter(item => 
                !item.key.includes('guest_slides')
              );
              
              // Use a slower but safer approach to avoid race conditions
              for (const item of itemsToDelete) {
                try {
                  await db.delete(store, [item.storeName, item.key]);
                } catch (e) {
                  console.error(`Error deleting item ${item.key}:`, e);
                }
              }
            } else {
              await db.clear(store);
            }
          }));
        }
    
        return true;
      } catch (error) {
        console.error('Clear all cache error:', error);
        return false;
      }
    }
  };

  const value = {
    db,
    isInitialized,
    isOnline,
    hybridCache
  };

  return (
    <DatabaseContext.Provider value={value}>
      {children}
    </DatabaseContext.Provider>
  );
}

export function useDatabase() {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error('useDatabase must be used within a DatabaseProvider');
  }
  return context;
}