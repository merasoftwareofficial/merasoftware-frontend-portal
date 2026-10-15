import React, { useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { createRoleBasedRouter } from './index';

const DynamicRouterWrapper = () => {
  // All routes are already registered. Guards subscribe to session changes;
  // replacing the router would remount App and restart session initialization.
  const [router] = useState(() => createRoleBasedRouter());

  return <RouterProvider router={router} />;
};

export default DynamicRouterWrapper;
