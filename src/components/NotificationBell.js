import React, { useState, useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import SummaryApi from '../common';
import { useSelector } from 'react-redux';

const NotificationBell = () => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  // Get user data from Redux store
  const user = useSelector(state => state?.user?.user);
  const isAdmin = user?.role === 'ADMIN';
  const isDeveloper = user?.role === 'DEVELOPER';

  // Format time
  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Fetch notifications
  const fetchNotifications = async () => {
    // Don't attempt to fetch if no user is logged in
    if (!user?._id) return;

    try {
      setLoading(true);

      // Select the correct endpoint based on user role
    let endpoint;
    if (isAdmin) {
      endpoint = SummaryApi.getAdminNotifications.url;
    } else if (isDeveloper) {
      endpoint = SummaryApi.getDeveloperNotifications.url;
    } else {
      endpoint = SummaryApi.getUserNotifications.url;
    }


      const response = await fetch(endpoint, {
        credentials: 'include'
      });
      
      const data = await response.json();
      
      if (data.success) {
        setNotifications(data.data || []);
        const unread = (data.data || []).filter(notif => !notif.isRead).length;
        setUnreadCount(unread);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBellClick = async () => {
     // Mark all notifications as read if there are any unread notifications
     if (unreadCount > 0) {
       await markAllAsRead(); // Call to mark all as read
     }
     // Toggle the dropdown
     setIsOpen(prev => !prev);
   };

  // Mark notification as read
  const markAsRead = async (notificationId) => {
    try {
      const response = await fetch(SummaryApi.markNotificationRead.url, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          notificationId
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Update local state
        setNotifications(prev => prev.map(notif => 
          notif._id === notificationId ? { ...notif, isRead: true } : notif
        ));
        
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  // Handle notification click
  const handleNotificationClick = async (notification) => {
    // Mark as read
    if (!notification.isRead) {
      await markAsRead(notification._id);
    }
    
    // Navigate based on notification type
    if (notification.type === 'update_request' && notification.relatedId) {
      navigate(`/admin-panel/update-requests`);
    }
    
    // Close dropdown
    setIsOpen(false);
  };

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Initial fetch and polling (visible tabs only)
  useEffect(() => {
    if (user?._id) {
      fetchNotifications();

      const pollIfVisible = () => {
        if (document.visibilityState === 'visible') {
          fetchNotifications();
        }
      };

      // Poll for new notifications every 60 seconds while tab is visible
      const interval = setInterval(pollIfVisible, 60000);
      document.addEventListener('visibilitychange', pollIfVisible);

      return () => {
        clearInterval(interval);
        document.removeEventListener('visibilitychange', pollIfVisible);
      };
    }
  }, [user]);

  // Handle manual refresh
  const handleRefresh = () => {
    fetchNotifications();
    toast.info('Notifications refreshed');
  };

  // Mark all as read
     const markAllAsRead = async () => {
     try {
       const unreadNotifications = notifications.filter(notif => !notif.isRead);
       
       if (unreadNotifications.length === 0) {
         return; // No unread notifications
       }
       
       setLoading(true);
       
       // Mark each notification as read
       for (const notification of unreadNotifications) {
         await markAsRead(notification._id);
       }
       
       // Update all notifications in state
       setNotifications(prev => prev.map(notif => ({ ...notif, isRead: true })));
       setUnreadCount(0);
       
       // No toast message shown here
     } catch (error) {
       console.error('Error marking all notifications as read:', error);
     } finally {
       setLoading(false);
     }
   };
   

  return (
    <div className="relative" ref={dropdownRef}>
      <button
       onClick={handleBellClick} 
        className="relative p-2 text-gray-700 hover:bg-gray-100 rounded-full focus:outline-none"
      >
        <Bell className="w-6 h-6" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center w-4 h-4 text-xs font-bold text-white bg-red-500 rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg py-1 z-50 max-h-96 overflow-y-auto">
          <div className="px-4 py-2 border-b flex justify-between items-center">
            <h3 className="text-sm font-semibold">Notifications</h3>
            <div className="flex space-x-2">
              <button 
                onClick={handleRefresh} 
                className="text-xs text-blue-600 hover:text-blue-800"
                disabled={loading}
              >
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-blue-600 hover:text-blue-800"
                  disabled={loading}
                >
                  Mark all as read
                </button>
              )}
            </div>
          </div>
          
          {notifications.length === 0 ? (
            <div className="px-4 py-6 text-center text-gray-500">
              No notifications
            </div>
          ) : (
            <div>
              {notifications.map((notification) => (
                <div
                  key={notification._id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`px-4 py-3 border-b hover:bg-gray-50 cursor-pointer ${
                    !notification.isRead ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <h4 className={`text-sm font-medium ${!notification.isRead ? 'text-blue-600' : ''}`}>
                      {notification.title}
                    </h4>
                    <span className="text-xs text-gray-500">
                      {formatTime(notification.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {notification.message}
                  </p>
                </div>
              ))}
            </div>
          )}
          
          {notifications.length > 0 && (
            <div className="px-4 py-2 text-center">
              <button
                onClick={() => setIsOpen(false)}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Close
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;