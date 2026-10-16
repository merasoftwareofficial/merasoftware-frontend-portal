import React, { useContext, useState } from "react";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import { useDispatch } from "react-redux";
import SummaryApi from "../common";
import Context from "../context";
import postLogin from "../helpers/postLogin";
import GuestLoginModal from "../components/GuestLoginModal";

const Login = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [data, setData] = useState({
    email: "",
    password: "",
  });

  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { fetchUserDetails } = useContext(Context);

  const handleOnChange = (e) => {
    const { name, value } = e.target;
    setData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const endpoint = SummaryApi.signIn;
    const payload = { email: data.email, password: data.password };

    try {
      const dataResponse = await fetch(endpoint.url, {
        method: endpoint.method,
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const dataApi = await dataResponse.json();

      if (!dataApi.success) {
        toast.error(dataApi.message || "Login failed");
        return;
      }

      postLogin({
        dataApi,
        dispatch,
        navigate,
        toast,
        fetchUserDetails,
      });
    } catch (error) {
      console.error("Login error:", error);
      toast.error("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="login" className="min-h-screen bg-white flex">
      {/* Left Side - Dark Blue/Black with Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-900 via-blue-900 to-black flex-col justify-center items-center px-12 relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute top-10 right-10 w-32 h-32 bg-blue-500 rounded-full opacity-10 blur-3xl"></div>
        <div className="absolute bottom-20 left-10 w-40 h-40 bg-blue-600 rounded-full opacity-10 blur-3xl"></div>

        <div className="relative z-10 text-center">
          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-500 rounded-xl mb-6">
              <span className="text-white text-2xl font-bold">M</span>
            </div>
          </div>

          <h1 className="text-4xl font-bold text-white mb-4">
            MeraSoftware
          </h1>
          <p className="text-lg text-blue-200 mb-8 leading-relaxed max-w-sm">
            We Build Software That Fits Your Business
          </p>

          <div className="space-y-4 text-left inline-block">
            <div className="flex items-center gap-3 text-blue-100">
              <div className="w-1 h-1 bg-blue-400 rounded-full"></div>
              <span>Custom Software Development</span>
            </div>
            <div className="flex items-center gap-3 text-blue-100">
              <div className="w-1 h-1 bg-blue-400 rounded-full"></div>
              <span>Web & Mobile Applications</span>
            </div>
            <div className="flex items-center gap-3 text-blue-100">
              <div className="w-1 h-1 bg-blue-400 rounded-full"></div>
              <span>Cloud Solutions & Support</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-12 lg:px-12">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden mb-8 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-500 rounded-lg mb-4">
              <span className="text-white text-xl font-bold">M</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">MeraSoftware</h1>
          </div>

          <div>
            <h2 className="text-3xl font-bold text-slate-900 mb-2">
              Welcome Back
            </h2>
            <p className="text-slate-600 mb-8">
              Sign in to your account to continue
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email Field */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                placeholder="admin@merasoftware.com"
                name="email"
                value={data.email}
                onChange={handleOnChange}
                required
                className="w-full px-4 py-3 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  name="password"
                  value={data.password}
                  onChange={handleOnChange}
                  required
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-600 hover:text-slate-900 transition"
                >
                  {showPassword ? (
                    <FaEyeSlash className="w-5 h-5" />
                  ) : (
                    <FaEye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-slate-300 text-blue-500 focus:ring-2 focus:ring-blue-500"
                />
                Remember me
              </label>
              <a href="#" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                Forgot password?
              </a>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold py-3 px-4 rounded-lg transition duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <span className="inline-block animate-spin">⏳</span>
                  Signing in...
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          {/* Guest Login */}
          <div className="mt-6">
            <div className="relative flex items-center">
              <div className="flex-grow border-t border-slate-200"></div>
              <span className="mx-3 text-xs text-slate-400 uppercase">or</span>
              <div className="flex-grow border-t border-slate-200"></div>
            </div>
            <button
              type="button"
              onClick={() => setShowGuestModal(true)}
              className="w-full mt-4 border border-slate-300 text-slate-700 font-semibold py-3 px-4 rounded-lg hover:bg-slate-50 transition"
            >
              Login as Guest
            </button>
          </div>

          {/* Footer */}
          <div className="mt-8 text-center text-sm text-slate-600">
            <p>
              Don't have an account?{" "}
              <a href="#" className="text-blue-600 hover:text-blue-700 font-medium">
                Contact Sales
              </a>
            </p>
          </div>
        </div>
      </div>

      {showGuestModal && (
        <GuestLoginModal
          onClose={() => setShowGuestModal(false)}
          onSuccess={(dataApi) => {
            setShowGuestModal(false);
            postLogin({ dataApi, dispatch, navigate, toast, fetchUserDetails });
          }}
        />
      )}
    </section>
  );
};

export default Login;
