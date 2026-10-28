import CookieManager from "../utils/cookieManager";
import StorageService from "../utils/storageService";
import { setUserDetails, updateWalletBalance } from "../store/userSlice";
import { getPortalHome } from "./portalHome";
import { loginContinuation } from './planAuthReturn';

const postLogin = ({
  dataApi,
  dispatch,
  navigate,
  toast,
  fetchUserDetails,
  returnTo,
}) => {
  const user = dataApi?.data?.user;
  if (!user) {
    return;
  }

  const isDetailsCompleted = dataApi?.data?.isDetailsCompleted || false;
  const userSnapshot = {
    ...user,
    isDetailsCompleted,
  };

  // Supersede any check started before this sign-in changed the shared cookie.
  if (fetchUserDetails) {
    void fetchUserDetails({ force: true });
  }

  CookieManager.setUserDetails({
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    isDetailsCompleted,
  });

  dispatch(setUserDetails(userSnapshot));
  StorageService.setUserDetails(userSnapshot);

  if (dataApi.data.walletBalance !== undefined) {
    dispatch(updateWalletBalance(dataApi.data.walletBalance));
  }

  toast.success(dataApi.message);

  // First-login password reset (soft): users auto-created via lead convert
  // land on the set-password page but can skip to their portal home.
  navigate(loginContinuation({ role: user.role, mustResetPassword: dataApi.data.mustResetPassword,
    returnTo, home: getPortalHome(user.role) }), { replace: true });

};

export default postLogin;
