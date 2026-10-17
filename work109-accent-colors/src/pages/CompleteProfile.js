import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import SummaryApi from '../common';
import imageTobase64 from '../helpers/imageTobase64';
import { toast } from 'sonner';
import DashboardLayout from '../components/DashboardLayout';
import {
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  User,
  CreditCard,
  FileText,
  MapPin,
  Upload,
  Trash2,
  Camera,
  Sparkles
} from 'lucide-react';

const CompleteProfile = ({ user, onKycComplete, onCancel, initialData }) => {
  const reduxUser = useSelector((state) => state?.user?.user);
  const currentUser = user || reduxUser;
  const navigate = useNavigate();
   const [showConfirmationPopup, setShowConfirmationPopup] = useState(false);

  // ====== Step State ======
  const [currentStep, setCurrentStep] = useState(1);

  // ====== Form States (unchanged keys to preserve functionality) ======
  const [basicDetails, setBasicDetails] = useState({
    name: '',
    email: '',
    // phone: '',
    dob: '',
    age: ''
  });

  // const [bankAccounts, setBankAccounts] = useState([]);

   const [documents, setDocuments] = useState({
        documentType: '', // 'aadhar' or 'driving_license'
        documentFrontPhoto: null,
        documentBackPhoto: null, // Optional for DL
        selfiePhoto: null
    });

  const [address, setAddress] = useState({
    streetAddress: '',
    city: '',
    state: '',
    pinCode: '',
    landmark: ''
  });

  // ====== Effects ======
  useEffect(() => {
    // const savedBasicDetails = localStorage.getItem('completeProfile_basicDetails');
    // const savedBankAccounts = localStorage.getItem('completeProfile_bankAccounts');
    // const savedDocuments = localStorage.getItem('completeProfile_documents');
    // const savedAddress = localStorage.getItem('completeProfile_address');

    // if (savedBasicDetails) {
    //   setBasicDetails(JSON.parse(savedBasicDetails));
    // } else if (user) {
    //   setBasicDetails((prev) => ({
    //     ...prev,
    //     name: user.name || '',
    //     email: user.email || ''
    //   }));
    // }

    // if (savedBankAccounts) setBankAccounts(JSON.parse(savedBankAccounts));
    // if (savedDocuments) setDocuments(JSON.parse(savedDocuments));
    // if (savedAddress) setAddress(JSON.parse(savedAddress));

 if (initialData) {
            setBasicDetails({
                name: initialData.name || '',
                email: initialData.email || '',
                dob: initialData.dob ? new Date(initialData.dob).toISOString().split('T')[0] : '',
                age: initialData.age || ''
            });
            setAddress(initialData.userDetails?.address || { streetAddress: '', city: '', state: '', pinCode: '', landmark: '' });
            setDocuments(initialData.userDetails?.kycDocuments || { documentType: '', documentFrontPhoto: null, documentBackPhoto: null, selfiePhoto: null });
        }
    }, [initialData]); // Depend on initialData prop

  // ====== Helpers ======
  // const saveStepData = () => {
  //   if (currentStep === 1) {
  //     localStorage.setItem('completeProfile_basicDetails', JSON.stringify(basicDetails));
  //   } else if (currentStep === 2) {
  //     localStorage.setItem('completeProfile_bankAccounts', JSON.stringify(bankAccounts));
  //   } else if (currentStep === 3) {
  //     localStorage.setItem('completeProfile_documents', JSON.stringify(documents));
  //   } else if (currentStep === 4) {
  //     localStorage.setItem('completeProfile_address', JSON.stringify(address));
  //   }
  // };

  const isValidImageType = (file) => {
    return file && (file.type === 'image/jpeg' || file.type === 'image/jpg');
  };

  const handleDobChange = (e) => {
    const dobValue = e.target.value;
    setBasicDetails((prev) => ({ ...prev, dob: dobValue }));

    if (dobValue) {
      const birthDate = new Date(dobValue);
      const today = new Date();
      let calculatedAge = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        calculatedAge--;
      }
      setBasicDetails((prev) => ({ ...prev, age: calculatedAge.toString() }));
    } else {
      setBasicDetails((prev) => ({ ...prev, age: '' }));
    }
  };

  // ====== Navigation ======
 // Modify handleNext:
    const handleNext = () => {
        if (currentStep === 1) { // Basic Details validation
            if (!basicDetails.name || !basicDetails.email || !basicDetails.dob || !basicDetails.age) {
                toast.error('Please fill all required basic details.');
                return;
            }
            // Add phone validation here if you decide to keep phone in basicDetails
            // but the requirement was to remove it from KYC.
            // If phone is still needed, it should be managed in the Profile tab.
        } else if (currentStep === 2) { // Address validation
            if (!address.streetAddress || !address.city || !address.state || !address.pinCode) {
                toast.error('Please fill all required address details.');
                return;
            }
        } else if (currentStep === 3) { // Documents validation
            if (!documents.documentFrontPhoto || !documents.selfiePhoto) {
                toast.error('Please upload at least one document photo (Aadhaar/DL) and a selfie (JPG/JPEG only).');
                return;
            }
        }
         // saveStepData(); // REMOVE THIS
        if (currentStep < 3) setCurrentStep((s) => s + 1); // Max step is now 3
    };

  const handlePrevious = () => {
    if (currentStep > 1) setCurrentStep((s) => s - 1);
  };

  // ====== Bank Accounts ======
  // const addBankAccount = () => {
  //   if (bankAccounts.length < 2) {
  //     setBankAccounts([
  //       ...bankAccounts,
  //       {
  //         id: Date.now(),
  //         bankName: '',
  //         bankAccountNumber: '',
  //         bankIFSCCode: '',
  //         accountHolderName: '',
  //         upiId: '',
  //         qrCode: null,
  //         isPrimary: false
  //       }
  //     ]);
  //   } else {
  //     toast.error('You can add up to 2 bank accounts only.');
  //   }
  // };

  // const removeBankAccount = (id) => {
  //   setBankAccounts(bankAccounts.filter((acc) => acc.id !== id));
  // };

  // const updateBankAccount = (id, field, value) => {
  //   setBankAccounts(bankAccounts.map((acc) => (acc.id === id ? { ...acc, [field]: value } : acc)));
  // };

  // const handleBankQrUpload = async (id, file) => {
  //   if (!isValidImageType(file)) {
  //     toast.error('Only JPG/JPEG images are allowed.');
  //     return;
  //   }
  //   const base64Image = await imageTobase64(file);
  //   setBankAccounts(bankAccounts.map((acc) => (acc.id === id ? { ...acc, qrCode: base64Image } : acc)));
  // };

  // ====== Documents ======
  const handleDocumentUpload = async (field, file) => {
    if (!isValidImageType(file)) {
      toast.error('Only JPG/JPEG images are allowed.');
      return;
    }
    const base64Image = await imageTobase64(file);
    setDocuments((prev) => ({ ...prev, [field]: base64Image }));
  };

  // ====== Address ======
  const updateAddressField = (field, value) => {
    setAddress((prev) => ({ ...prev, [field]: value }));
  };

  // ====== Submit ======
  const handleFinish = async () => {
    // saveStepData();
    // Show confirmation popup first
        setShowConfirmationPopup(true);
    };

    const confirmSubmission = async () => {
        setShowConfirmationPopup(false); // Close confirmation popup

    const payload = {
      // phone: basicDetails.phone,
      age: parseInt(basicDetails.age, 10),
      dob: basicDetails.dob,
      // bankAccounts: bankAccounts.map(({ id, ...rest }) => rest),
      kycDocuments: {
                documentType: documents.documentType,
                documentFrontPhoto: documents.documentFrontPhoto,
                documentBackPhoto: documents.documentBackPhoto,
                selfiePhoto: documents.selfiePhoto
            },
      address: {
        streetAddress: address.streetAddress,
        city: address.city,
        state: address.state,
        pinCode: address.pinCode,
        landmark: address.landmark
      }
    };

    try {
      const response = await fetch(SummaryApi.completeProfile.url, {
        method: SummaryApi.completeProfile.method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (data.success) {
        toast.success('KYC completed successfully!');
        // localStorage.removeItem('completeProfile_basicDetails');
        // localStorage.removeItem('completeProfile_bankAccounts');
        // localStorage.removeItem('completeProfile_documents');
        // localStorage.removeItem('completeProfile_address');

         // Call the callback function passed from PartnerDashboard
                if (onKycComplete) {
                    onKycComplete();
                }
                // No navigation from here, PartnerDashboard will handle it
            } else {
                toast.error(data.message || 'Failed to complete KYC.');
            }
        } catch (error) {
            console.error('Error completing KYC:', error);
            toast.error('An error occurred while completing KYC.');
        }
    };

  // Update steps array:
    const steps = [
        { id: 1, title: 'Basic Details', icon: User },
        { id: 2, title: 'Address', icon: MapPin }, // Changed order
        { id: 3, title: 'Documents', icon: FileText } // Max step is 3
    ];

  const StepIndicator = () => (
    <div className="flex items-center justify-center mb-6 px-2">
      <div className="flex items-center w-full max-w-2xl">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center flex-1">
            <div
              className={`flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 ${
                currentStep >= step.id
                  ? 'border-transparent bg-[rgb(var(--ink-rgb))] text-[var(--page-bg)]'
                  : 'bg-[var(--field-bg)] border-[var(--field-border)] text-[var(--text-muted)]'
              }`}
            >
              {currentStep > step.id ? (
                <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" />
              ) : (
                <step.icon className="w-4 h-4 sm:w-5 sm:h-5" />
              )}
            </div>
            <div className="hidden sm:block">
              <span
                className={`ml-2 text-sm font-medium ${
                  currentStep >= step.id ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
                }`}
              >
                {step.title}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div className="flex-1 mx-2 sm:mx-4">
                <div className={`h-0.5 ${currentStep > step.id ? 'bg-[rgb(var(--ink-rgb))]' : 'bg-[var(--glass-bg-strong)]'}`} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  // ====== Render current step exactly via switch/case (no inner components) ======
const renderCurrentStep = () => {
        switch (currentStep) {
            case 1:
                return (
                    <div className="space-y-4 sm:space-y-6">
                        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-4 sm:mb-6">Basic Details</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                            <div>
                                <label className="block text-base font-medium text-[var(--text-primary)] mb-2">Full Name</label>
                                <input
                                    type="text"
                                    value={basicDetails.name}
                                    onChange={(e) => setBasicDetails((prev) => ({ ...prev, name: e.target.value }))}
                                    autoComplete="name"
                                    className="w-full px-3 py-2 sm:px-4 sm:py-3 border border-[var(--field-border)] rounded-lg text-[var(--text-primary)]"
                                />
                            </div>
                            <div>
                                <label className="block text-base font-medium text-[var(--text-primary)] mb-2">Email Address</label>
                                <input
                                    type="email"
                                    value={basicDetails.email}
                                    disabled
                                    className="w-full px-3 py-2 sm:px-4 sm:py-3 border border-[var(--field-border)] rounded-lg bg-[var(--field-bg)] text-[var(--text-primary)]"
                                />
                            </div>
                            {/* REMOVE PHONE FIELD */}
                            {/* <div>
                                <label className="block text-base font-medium text-[var(--text-primary)] mb-2">Phone Number *</label>
                                <input
                                    type="tel"
                                    value={basicDetails.phone}
                                    onChange={(e) => setBasicDetails((prev) => ({ ...prev, phone: e.target.value }))}
                                    className="w-full px-3 py-2 sm:px-4 sm:py-3 border border-[var(--field-border)] rounded-lg focus:ring-2 focus:ring-[var(--badge-success-fg)] focus:border-transparent"
                                    placeholder="Enter your phone number"
                                    autoComplete="tel"
                                />
                            </div> */}
                            <div>
                                <label className="block text-base font-medium text-[var(--text-primary)] mb-2">Date of Birth *</label>
                                <input
                                    type="date"
                                    value={basicDetails.dob}
                                    onChange={handleDobChange}
                                    className="w-full px-3 py-2 sm:px-4 sm:py-3 border border-[var(--field-border)] rounded-lg focus:ring-2 focus:ring-[var(--badge-success-fg)] focus:border-transparent"
                                />
                            </div>
                            <div>
                                <label className="block text-base font-medium text-[var(--text-primary)] mb-2">Age</label>
                                <input
                                    type="number"
                                    value={basicDetails.age}
                                    readOnly
                                    className="w-full px-3 py-2 sm:px-4 sm:py-3 border border-[var(--field-border)] rounded-lg bg-[var(--field-bg)] text-[var(--text-primary)]"
                                />
                            </div>
                        </div>
                    </div>
                );
            case 2: // This is now Address
                return (
                    <div className="space-y-4 sm:space-y-6">
                        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-4 sm:mb-6">Permanent Address</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                            <div className="sm:col-span-2">
                                <label className="block text-base font-medium text-[var(--text-primary)] mb-2">Street Address *</label>
                                <input
                                    type="text"
                                    value={address.streetAddress}
                                    onChange={(e) => updateAddressField('streetAddress', e.target.value)}
                                    className="w-full px-3 py-2 sm:px-4 sm:py-3 border border-[var(--field-border)] rounded-lg focus:ring-2 focus:ring-[var(--badge-success-fg)] focus:border-transparent"
                                    placeholder="Enter street address"
                                    autoComplete="street-address"
                                />
                            </div>
                            <div>
                                <label className="block text-base font-medium text-[var(--text-primary)] mb-2">City *</label>
                                <input
                                    type="text"
                                    value={address.city}
                                    onChange={(e) => updateAddressField('city', e.target.value)}
                                    className="w-full px-3 py-2 sm:px-4 sm:py-3 border border-[var(--field-border)] rounded-lg focus:ring-2 focus:ring-[var(--badge-success-fg)] focus:border-transparent"
                                    placeholder="Enter city"
                                    autoComplete="address-level2"
                                />
                            </div>
                            <div>
                                <label className="block text-base font-medium text-[var(--text-primary)] mb-2">State *</label>
                                <input
                                    type="text"
                                    value={address.state}
                                    onChange={(e) => updateAddressField('state', e.target.value)}
                                    className="w-full px-3 py-2 sm:px-4 sm:py-3 border border-[var(--field-border)] rounded-lg focus:ring-2 focus:ring-[var(--badge-success-fg)] focus:border-transparent"
                                    placeholder="Enter state"
                                    autoComplete="address-level1"
                                />
                            </div>
                            <div>
                                <label className="block text-base font-medium text-[var(--text-primary)] mb-2">PIN Code *</label>
                                <input
                                    type="text"
                                    value={address.pinCode}
                                    onChange={(e) => updateAddressField('pinCode', e.target.value)}
                                    className="w-full px-3 py-2 sm:px-4 sm:py-3 border border-[var(--field-border)] rounded-lg focus:ring-2 focus:ring-[var(--badge-success-fg)] focus:border-transparent"
                                    placeholder="Enter PIN code"
                                    autoComplete="postal-code"
                                />
                            </div>
                            <div>
                                <label className="block text-base font-medium text-[var(--text-primary)] mb-2">Landmark</label>
                                <input
                                    type="text"
                                    value={address.landmark}
                                    onChange={(e) => updateAddressField('landmark', e.target.value)}
                                    className="w-full px-3 py-2 sm:px-4 sm:py-3 border border-[var(--field-border)] rounded-lg focus:ring-2 focus:ring-[var(--badge-success-fg)] focus:border-transparent"
                                    placeholder="Enter landmark (optional)"
                                    autoComplete="off"
                                />
                            </div>
                        </div>
                    </div>
                );
            case 3: // This is now Documents
                return (
                    <div className="space-y-4 sm:space-y-6">
                        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-4 sm:mb-6">Documents</h2>

                        {/* Document Type Selection */}
                        <div>
                            <label className="block text-base font-medium text-[var(--text-primary)] mb-2">Select Document Type *</label>
                            <select
                                value={documents.documentType}
                                onChange={(e) => setDocuments(prev => ({ ...prev, documentType: e.target.value }))}
                                className="w-full px-3 py-2 sm:px-4 sm:py-3 border border-[var(--field-border)] rounded-lg focus:ring-2 focus:ring-[var(--badge-success-fg)] focus:border-transparent bg-[var(--glass-bg-subtle)] text-[var(--text-primary)]"
                            >
                                <option value="">-- Select --</option>
                                <option value="aadhar">Aadhaar Card</option>
                                <option value="driving_license">Driving License</option>
                            </select>
                        </div>

                        {documents.documentType && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                                {/* Document Front Photo */}
                                <div>
                                    <label className="block text-base font-medium text-[var(--text-primary)] mb-2">
                                        {documents.documentType === 'aadhar' ? 'Aadhaar Front' : 'Driving License Front'} (JPG/JPEG) *
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="file"
                                            accept=".jpg,.jpeg"
                                            onChange={async (e) => {
                                                if (e.target.files && e.target.files[0]) {
                                                    await handleDocumentUpload('documentFrontPhoto', e.target.files[0]);
                                                }
                                            }}
                                            className="hidden"
                                            id="documentFront"
                                        />
                                        <label
                                            htmlFor="documentFront"
                                            className="flex flex-col items-center justify-center w-full h-24 sm:h-32 border-2 border-dashed border-[var(--field-border)] rounded-lg cursor-pointer hover:border-[var(--badge-success-border)] hover:bg-[var(--glass-bg)]"
                                        >
                                            <Upload className="w-6 h-6 sm:w-8 sm:h-8 text-[var(--text-muted)] mb-1 sm:mb-2" />
                                            <span className="text-[var(--text-primary)] text-base text-center px-2">
                                                {documents.documentFrontPhoto ? 'Change Photo' : 'Upload Photo'}
                                            </span>
                                        </label>
                                        {documents.documentFrontPhoto && (
                                            <img src={documents.documentFrontPhoto} alt="Document Front" className="mt-2 h-24 w-full object-cover rounded" />
                                        )}
                                    </div>
                                </div>

                                {/* Document Back Photo (Conditional for Aadhaar) */}
                                {documents.documentType === 'aadhar' && (
                                    <div>
                                        <label className="block text-base font-medium text-[var(--text-primary)] mb-2">Aadhaar Back (JPG/JPEG) *</label>
                                        <div className="relative">
                                            <input
                                                type="file"
                                                accept=".jpg,.jpeg"
                                                onChange={async (e) => {
                                                    if (e.target.files && e.target.files[0]) {
                                                        await handleDocumentUpload('documentBackPhoto', e.target.files[0]);
                                                    }
                                                }}
                                                className="hidden"
                                                id="documentBack"
                                            />
                                            <label
                                                htmlFor="documentBack"
                                                className="flex flex-col items-center justify-center w-full h-24 sm:h-32 border-2 border-dashed border-[var(--field-border)] rounded-lg cursor-pointer hover:border-[var(--badge-success-border)] hover:bg-[var(--glass-bg)]"
                                            >
                                                <Upload className="w-6 h-6 sm:w-8 sm:h-8 text-[var(--text-muted)] mb-1 sm:mb-2" />
                                                <span className="text-[var(--text-primary)] text-base text-center px-2">
                                                    {documents.documentBackPhoto ? 'Change Photo' : 'Upload Photo'}
                                                </span>
                                            </label>
                                            {documents.documentBackPhoto && (
                                                <img src={documents.documentBackPhoto} alt="Aadhaar Back" className="mt-2 h-24 w-full object-cover rounded" />
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Selfie Photo */}
                                <div>
                                    <label className="block text-base font-medium text-[var(--text-primary)] mb-2">Selfie (Camera, JPG/JPEG) *</label>
                                    <div className="relative">
                                        <input
                                            type="file"
                                            accept=".jpg,.jpeg"
                                            capture="user"
                                            onChange={async (e) => {
                                                if (e.target.files && e.target.files[0]) {
                                                    await handleDocumentUpload('selfiePhoto', e.target.files[0]);
                                                }
                                            }}
                                            className="hidden"
                                            id="selfie"
                                        />
                                        <label
                                            htmlFor="selfie"
                                            className="flex flex-col items-center justify-center w-full h-24 sm:h-32 border-2 border-dashed border-[var(--field-border)] rounded-lg cursor-pointer hover:border-[var(--badge-success-border)] hover:bg-[var(--glass-bg)]"
                                        >
                                            <Camera className="w-6 h-6 sm:w-8 sm:h-8 text-[var(--text-muted)] mb-1 sm:mb-2" />
                                            <span className="text-[var(--text-primary)] text-base text-center px-2">
                                                {documents.selfiePhoto ? 'Retake Selfie' : 'Take Selfie'}
                                            </span>
                                        </label>
                                        {documents.selfiePhoto && (
                                            <img src={documents.selfiePhoto} alt="Selfie" className="mt-2 h-24 w-full object-cover rounded" />
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                );
            default:
                return null;
        }
    };

  // ====== Render ======
  return (
    <DashboardLayout user={currentUser}>
      <div
        className="min-h-full px-4 py-5 sm:px-6 lg:px-8 lg:py-8"
      >
        <div className="mx-auto max-w-4xl">
                <section className="glass-panel overflow-hidden rounded-[2rem]">
                    <div className="rounded-t-[2rem] border-b border-[var(--divider)] bg-[var(--glass-bg-subtle)] px-5 py-5 text-center text-[var(--text-primary)] sm:px-6 lg:px-8">
                        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--badge-success-border)] bg-[var(--badge-success-bg)] px-3 py-1 text-sm font-semibold uppercase text-[var(--badge-success-fg)]">
                            <Sparkles className="h-3.5 w-3.5" />
                            KYC
                        </div>
                        <h1 className="mt-3 text-2xl font-bold tracking-tight text-[var(--text-primary)]">Complete Your KYC</h1>
                        <p className="mt-2 text-base text-[var(--text-primary)]">Fill in the details below to complete your KYC</p>
                    </div>

                    <div className="p-4 sm:p-8">
                    <StepIndicator />

                    <div className="min-h-80 sm:min-h-96">{renderCurrentStep()}</div>

                    <div className="flex flex-col sm:flex-row sm:justify-between gap-4 mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-[var(--field-border)]">
                        <button
                            onClick={handlePrevious}
                            disabled={currentStep === 1}
                            className="flex items-center justify-center px-4 py-2 sm:px-6 sm:py-3 bg-[var(--field-bg)] text-[var(--text-primary)] rounded-lg hover:bg-[var(--glass-bg-strong)] disabled:opacity-50 disabled:cursor-not-allowed text-base order-2 sm:order-1"
                        >
                            <ArrowLeft className="w-4 h-4 mr-2" /> Previous
                        </button>

                        {currentStep < 3 ? ( // Changed from 4 to 3
                            <button
                                onClick={handleNext}
                                className="order-1 flex items-center justify-center rounded-lg bg-[rgb(var(--ink-rgb))] px-4 py-2 text-base text-[var(--page-bg)] transition hover:bg-[rgb(var(--ink-rgb)/0.85)] sm:order-2 sm:px-6 sm:py-3"
                            >
                                Next <ArrowRight className="w-4 h-4 ml-2" />
                            </button>
                        ) : (
                            <button
                                onClick={handleFinish} // This now triggers confirmation popup
                                className="order-1 flex items-center justify-center rounded-lg bg-[rgb(var(--ink-rgb))] px-4 py-2 text-base text-[var(--page-bg)] transition hover:bg-[rgb(var(--ink-rgb)/0.85)] sm:order-2 sm:px-6 sm:py-3"
                            >
                                Finish <CheckCircle className="w-4 h-4 ml-2" />
                            </button>
                        )}
                    </div>
                    </div>
                </section>
        </div>
      </div>

            {/* Confirmation Popup */}
            {showConfirmationPopup && (
                <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center">
                    <div className="glass-panel rounded-lg p-6 w-full max-w-sm mx-4">
                        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Confirm Submission</h3>
                        <p className="text-base text-[var(--text-primary)] mb-6">Please review your details carefully. Are you sure you want to submit?</p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowConfirmationPopup(false)}
                                className="px-4 py-2 text-[var(--text-primary)] bg-[var(--field-bg)] hover:bg-[var(--glass-bg-strong)] rounded-lg text-base font-medium transition-colors"
                            >
                                No
                            </button>
                            <button
                                onClick={confirmSubmission}
                                className="rounded-lg bg-[rgb(var(--ink-rgb))] px-4 py-2 text-base font-medium text-[var(--page-bg)] transition-colors hover:bg-[rgb(var(--ink-rgb)/0.85)]"
                            >
                                Yes, Submit
                            </button>
                        </div>
                    </div>
                </div>
            )}
    </DashboardLayout>
    );
};

export default CompleteProfile;
