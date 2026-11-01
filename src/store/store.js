import { configureStore } from '@reduxjs/toolkit'
import userReducer from './userSlice'
import { setResourceIdentity } from '../utils/resourceClient';

export const store = configureStore({
  reducer: {
    user: userReducer
  },
})

// Invalidate before React cleanup when identity or active role changes.
store.subscribe(() => setResourceIdentity(store.getState().user.user));
