import React, { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Camera, Mail, Phone, User, Calendar, Link2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import SummaryApi from '../common';
import { setUserDetails } from '../store/userSlice';
import TriangleMazeLoader from '../components/TriangleMazeLoader';
import DashboardLayout from '../components/DashboardLayout';
import Surface from '../components/Surface';
import Badge from '../components/Badge';
import StorageService from '../utils/storageService';
import CookieManager from '../utils/cookieManager';
import uploadImage from '../helpers/uploadImage';
import { useOnlineStatus } from '../App';

const getFormData = (user) => ({
  name: user?.name || '',
  email: user?.email || '',
  phone: user?.phone || '',
  age: user?.age || '',
  profilePic: user?.profilePic || '',
});

const Profile = () => {
  const dispatch = useDispatch();
  const { isOnline } = useOnlineStatus();
  const user = useSelector((state) => state?.user?.user);
  const [formData, setFormData] = useState(() => getFormData(user));
  const [initialFormData, setInitialFormData] = useState(() => getFormData(user));
  const [selectedImage, setSelectedImage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [allowLoginFreeUploadLinks, setAllowLoginFreeUploadLinks] = useState(Boolean(user?.allowLoginFreeUploadLinks));
  const [uploadLinkPreferenceSaving, setUploadLinkPreferenceSaving] = useState(false);

  const fetchUserDetails = useCallback(async () => {
    try {
      const cachedUser = StorageService.getUserDetails();
      if (cachedUser) {
        dispatch(setUserDetails(cachedUser));
        setFormData(getFormData(cachedUser));
        setInitialFormData(getFormData(cachedUser));
        setLoading(false);
      }

      if (!isOnline) return;
      const response = await fetch(SummaryApi.current_user.url, {
        method: SummaryApi.current_user.method,
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        dispatch(setUserDetails(data.data));
        StorageService.setUserDetails(data.data);
        setFormData(getFormData(data.data));
        setInitialFormData(getFormData(data.data));
      }
    } catch (error) {
      console.error('Error fetching user details:', error);
    } finally {
      setLoading(false);
    }
  }, [dispatch, isOnline]);

  useEffect(() => {
    fetchUserDetails();
  }, [fetchUserDetails]);

  useEffect(() => {
    setAllowLoginFreeUploadLinks(Boolean(user?.allowLoginFreeUploadLinks));
  }, [user?.allowLoginFreeUploadLinks]);

  const handleUploadLinkPreference = async () => {
    if (uploadLinkPreferenceSaving || !isOnline) return;
    const nextValue = !allowLoginFreeUploadLinks;
    setUploadLinkPreferenceSaving(true);
    try {
      const response = await fetch(SummaryApi.myUploadLinkPreference.url, {
        method: SummaryApi.myUploadLinkPreference.method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowLoginFreeUploadLinks: nextValue }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.message || 'Could not update secure upload-link access');
      const updatedUser = { ...user, allowLoginFreeUploadLinks: result.data.allowLoginFreeUploadLinks };
      setAllowLoginFreeUploadLinks(result.data.allowLoginFreeUploadLinks);
      dispatch(setUserDetails(updatedUser));
      StorageService.setUserDetails(updatedUser);
      toast.success(result.data.allowLoginFreeUploadLinks ? 'Login-free upload links enabled' : 'Login-free upload links disabled');
    } catch (error) {
      toast.error(error.message || 'Could not update secure upload-link access');
    } finally {
      setUploadLinkPreferenceSaving(false);
    }
  };

  const isDirty = Boolean(selectedImage) || Object.keys(initialFormData).some((key) => formData[key] !== initialFormData[key]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    const nextValue = name === 'phone' || name === 'age' ? value.replace(/\D/g, '') : value;
    setFormData((current) => ({ ...current, [name]: nextValue }));
  };

  const handleImageChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedImage(file);
    setFormData((current) => ({ ...current, profilePic: URL.createObjectURL(file) }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!isDirty || saving) return;
    if (!isOnline) {
      toast.error('You are offline. Please check your internet connection.');
      return;
    }

    setSaving(true);
    try {
      let profilePic = formData.profilePic;
      if (selectedImage) {
        const imageData = await uploadImage(selectedImage);
        profilePic = imageData.url;
      }

      const response = await fetch(SummaryApi.updateProfile.url, {
        method: SummaryApi.updateProfile.method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          phone: formData.phone.trim(),
          age: formData.age,
          profilePic,
        }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.message || 'Failed to update profile');

      CookieManager.setUserDetails({
        _id: data.data._id,
        name: data.data.name,
        email: data.data.email,
        role: data.data.role,
      });
      StorageService.setUserDetails(data.data);
      dispatch(setUserDetails(data.data));
      setSelectedImage(null);
      setFormData(getFormData(data.data));
      setInitialFormData(getFormData(data.data));
      toast.success('Profile saved successfully');
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error(error.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout user={user} activeProject={null}>
      <div
        className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-4 py-10 sm:px-6 lg:px-8 lg:py-14"
      >
        <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />
        {(loading || saving) && <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center"><TriangleMazeLoader /></div>}

        <form onSubmit={handleSubmit} className="relative mx-auto max-w-3xl">
          <div className="text-center">
            <Badge tone="neutral">
              Account
            </Badge>
            <h1 className="mt-5 text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl lg:text-4xl">
              Profile settings
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-base text-[var(--text-secondary)] sm:text-lg">
              Update your personal information.
            </p>
          </div>

          <div className="mt-10 space-y-6">
            <Surface radius="panel" sheen className="p-6 sm:p-7">
              <div className="relative flex items-center gap-4">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] text-2xl font-bold text-[var(--text-primary)] backdrop-blur-md">
                  {formData.profilePic ? <img src={formData.profilePic} alt={formData.name || 'Profile'} className="h-full w-full object-cover" /> : (formData.name || 'U').trim().charAt(0).toUpperCase()}
                </div>
                <div>
                  <label htmlFor="profile-picture" className="inline-flex cursor-pointer items-center gap-2 text-base font-semibold text-[var(--eyebrow-fg)] hover:opacity-80"><Camera size={16} /> Change profile picture</label>
                  <input id="profile-picture" type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">JPG, PNG or WEBP</p>
                </div>
              </div>
            </Surface>

            <Surface radius="panel" sheen className="p-6 sm:p-7">
              <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-2 text-[var(--text-primary)]"><Link2 size={19} /></div>
                  <div>
                    <div className="flex items-center gap-2"><h2 className="text-base font-bold text-[var(--text-primary)]">Login-free secure upload links</h2><ShieldCheck size={16} className="text-emerald-500" /></div>
                    <p className="mt-1 max-w-xl text-sm text-[var(--text-secondary)]">When enabled, an admin-generated link can open only its selected project's or service's upload form without your portal login. Turn it off to require credential verification.</p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-label="Allow login-free secure upload links"
                  aria-checked={allowLoginFreeUploadLinks}
                  aria-busy={uploadLinkPreferenceSaving}
                  onClick={handleUploadLinkPreference}
                  disabled={uploadLinkPreferenceSaving || !isOnline}
                  className={`relative h-8 w-14 shrink-0 rounded-full border-[length:var(--glass-border-width)] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
                    allowLoginFreeUploadLinks
                      ? 'border-emerald-600 bg-emerald-500'
                      : 'border-[var(--glass-border-strong)] bg-[var(--text-muted)]'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`absolute left-0 top-1 h-6 w-6 rounded-full bg-white shadow-md ring-1 ring-black/10 transition-transform duration-200 ${
                      allowLoginFreeUploadLinks ? 'translate-x-7' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </Surface>

            <Surface radius="panel" sheen className="p-6 sm:p-7">
              <div className="relative grid gap-6 sm:grid-cols-2">
                <label className="block"><span className="mb-2 flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]"><User size={16} className="text-[var(--text-muted)]" /> Full name</span><input name="name" value={formData.name} onChange={handleChange} required className="w-full border-0 border-b border-[var(--glass-border-strong)] bg-transparent px-0 py-2 text-base text-[var(--text-primary)] outline-none transition focus:border-emerald-400 focus:ring-0" /></label>
                <label className="block"><span className="mb-2 flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]"><Mail size={16} className="text-[var(--text-muted)]" /> Email address</span><input name="email" value={formData.email} readOnly className="w-full border-0 border-b border-[var(--glass-border)] bg-transparent px-0 py-2 text-base text-[var(--text-primary)] outline-none" /></label>
                <label className="block"><span className="mb-2 flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]"><Phone size={16} className="text-[var(--text-muted)]" /> Phone number</span><input name="phone" type="tel" inputMode="numeric" pattern="[0-9]*" value={formData.phone} onChange={handleChange} className="w-full border-0 border-b border-[var(--glass-border-strong)] bg-transparent px-0 py-2 text-base text-[var(--text-primary)] outline-none transition focus:border-emerald-400 focus:ring-0" /></label>
                <label className="block"><span className="mb-2 flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]"><Calendar size={16} className="text-[var(--text-muted)]" /> Age</span><input name="age" type="text" inputMode="numeric" pattern="[0-9]*" maxLength="3" value={formData.age} onChange={handleChange} className="w-full border-0 border-b border-[var(--glass-border-strong)] bg-transparent px-0 py-2 text-base text-[var(--text-primary)] outline-none transition focus:border-emerald-400 focus:ring-0" /></label>
              </div>
            </Surface>

            <div className="flex justify-end"><button type="submit" disabled={!isDirty || saving} className={`rounded-xl border px-6 py-3 text-base font-semibold backdrop-blur-md transition ${isDirty && !saving ? 'border-emerald-400/40 bg-emerald-500/20 text-[var(--text-primary)] hover:bg-emerald-500/35' : 'cursor-not-allowed border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] text-[var(--text-muted)]'}`}>{saving ? 'Saving...' : 'Save changes'}</button></div>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
};

export default Profile;
