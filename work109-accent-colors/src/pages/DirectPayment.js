import React, { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import Context from '../context';
import SummaryApi from '../common';
import TriangleMazeLoader from '../components/TriangleMazeLoader';
import DashboardLayout from '../components/DashboardLayout';
import displayINRCurrency from '../helpers/displayCurrency';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import { goToCustomerReturn } from '../helpers/customerReturnNavigation';
import { getInstallmentPartText } from '../helpers/invoicePresentation';

const DirectPayment = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const context = useContext(Context);
  const user = useSelector((state) => state?.user?.user);
  const [loading, setLoading] = useState(false);
  const [paymentData, setPaymentData] = useState(null);
  const [remainingAmount, setRemainingAmount] = useState(0);
  const [showQR, setShowQR] = useState(false);
  const [transactionId, setTransactionId] = useState('');
  const [upiLink, setUpiLink] = useState('');
  const [verificationStatus, setVerificationStatus] = useState('');
  const [paymentProcessed, setPaymentProcessed] = useState(false);
  const [upiTransactionId, setUpiTransactionId] = useState('');
  // Add these additional states to DirectPayment component
  const [isPartialPayment, setIsPartialPayment] = useState(false);
  const [installmentNumber, setInstallmentNumber] = useState(1);
  const [remainingPayments, setRemainingPayments] = useState([]);
  const [isSubmittingVerification, setIsSubmittingVerification] = useState(false);

  useEffect(() => {
    // Get payment data from location state
    if (location.state?.paymentData) {
      const paymentData = location.state.paymentData;
      setPaymentData(paymentData);
      
      // Check if this is a partial payment
      if (paymentData.paymentOption === 'partial') {
        setIsPartialPayment(true);
        setInstallmentNumber(1); // First installment
        setRemainingPayments(paymentData.remainingPayments || []);
      }
      
      // Calculate if wallet balance is sufficient
      const paymentAmount = paymentData.currentPaymentAmount || paymentData.totalPrice;
      if (context.walletBalance < paymentAmount) {
        setRemainingAmount(paymentAmount - context.walletBalance);
      }
    } else {
      // A refresh/direct URL loses transient payment data. Return safely instead
      // of routing through root, which redirects every logged-in customer to Dashboard.
      toast.error('Payment information not found');
      goToCustomerReturn(navigate, location, '/order', { replace: true });
    }
    if (location.state?.retryPaymentId) {
      // This is a retry payment scenario
      const retryPaymentData = location.state.paymentData;
      
      // Populate the payment data from the rejected order
      setPaymentData(retryPaymentData);
      
      // Calculate if wallet balance is sufficient
      const paymentAmount = retryPaymentData.totalPrice;
      if (context.walletBalance < paymentAmount) {
        setRemainingAmount(paymentAmount - context.walletBalance);
      }
    }
  }, [location, navigate, context.walletBalance]);                                

  // Generate transaction ID
  const generateTransactionId = () => {
    // Use different prefixes to avoid collisions
  const prefix = isPartialPayment ? 'INST' : 'TXN';
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `${prefix}${timestamp}${random}`;
  };

  const handleBackToProductDetails = () => {
    // No need to remove sessionStorage here
    // Just navigate back, product details will load selections from sessionStorage
    goToCustomerReturn(navigate, location, '/order');
  };

  // Add this helper function at the top of your component
const calculateFeatureDiscount = (feature, totalDiscount, originalTotal) => {
    if (!paymentData.couponData || originalTotal === 0) return 0;
    
    const featureTotal = feature.sellingPrice * (feature.quantity || 1);
    // Calculate discount proportionally based on feature price relative to total
    const proportion = featureTotal / originalTotal;
    return Math.round(totalDiscount * proportion);
  };

  // Proceed with wallet payment
 // Proceed with wallet payment
const handleWalletPayment = async () => {
  if (!paymentData) return;
  
  try {
    setLoading(true);
    
    // Get the correct amount to charge
    const amountToCharge = paymentData.currentPaymentAmount || paymentData.totalPrice;
    
    // SCENARIO 1: If wallet has sufficient balance
    if (context.walletBalance >= amountToCharge) {
      console.log("Sufficient wallet balance. Creating transaction for admin approval.");
      
      // Generate transaction ID for wallet payment
      const txnId = generateTransactionId();
      
      // Create order first with pending status
  try {
    const createdOrder = await createOrder('wallet-pending');
    
    if (createdOrder && createdOrder.orderId) {
      // Create a transaction record for admin approval instead of directly deducting
      const requestBody = {
        transactionId: txnId,
        amount: amountToCharge,
        // Include both fields to satisfy the validation
        upiTransactionId: "WALLET-" + txnId, // Dummy UPI ID for wallet transactions
        paymentMethod: 'wallet',
        isInstallmentPayment: isPartialPayment || false,
        type: 'payment',
        orderId: createdOrder.orderId,
        installmentNumber: isPartialPayment ? installmentNumber : null,
        description: `Wallet payment for ${paymentData?.product?.serviceName}`
      };
      
      // Submit payment verification request
      const response = await fetch(SummaryApi.wallet.verifyPayment.url, {
        method: SummaryApi.wallet.verifyPayment.method,
        credentials: 'include',
        headers: {
          "Content-Type": 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Show success message for pending approval
        toast.success('Your payment has been submitted for approval');
        
        // Redirect to success page with pending message
        navigate('/dashboard', { 
          state: { 
            pendingApproval: true,
            message: "We have your payment and are checking it. Your project opens once it clears." 
          }
        });
      } else {
        toast.error(data.message || 'Payment submission failed');
      }
    }
  } catch (error) {
    console.error('Error processing payment:', error);
    toast.error('Error processing payment. Please try again.');
  }
}
    // SCENARIO 2: Partial wallet balance
    else if (context.walletBalance > 0) {
      console.log("Partial wallet balance. Need admin approval for both portions.");
      
      // Generate transaction IDs for both payment portions
      const walletTxnId = generateTransactionId() + "-W";
      const upiTxnId = generateTransactionId() + "-U";
      setTransactionId(upiTxnId); // For UPI QR code
      
      // Create order first with pending status
      try {
        console.log("Creating order with pending status...");
        const createdOrder = await createOrder('combined-pending');
        console.log("Order creation response:", createdOrder);
        
        if (createdOrder && createdOrder.orderId) {
          const orderId = createdOrder.orderId;
          
          // Create wallet portion transaction for admin approval
          const walletRequestBody = {
            transactionId: walletTxnId,
            amount: context.walletBalance,
            paymentMethod: 'wallet',
            isInstallmentPayment: isPartialPayment || false,
            type: 'payment',
            orderId: orderId,
            installmentNumber: isPartialPayment ? installmentNumber : null,
            isPartialInstallmentPayment: true,
            parentTransactionId: upiTxnId, // Link to the UPI transaction
            description: `Wallet portion (${displayINRCurrency(context.walletBalance)}) for ${paymentData?.product?.serviceName}`
          };
          
          // Submit wallet portion for admin approval
          await fetch(SummaryApi.wallet.verifyPayment.url, {
            method: SummaryApi.wallet.verifyPayment.method,
            credentials: 'include',
            headers: {
              "Content-Type": 'application/json'
            },
            body: JSON.stringify(walletRequestBody)
          });
          
          // Create UPI payment link for REMAINING amount
          const upiId = 'vacomputers.com@okhdfcbank';
          const payeeName = 'VA Computer';
          const upi = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(payeeName)}&am=${remainingAmount}&cu=INR&tn=${encodeURIComponent(`Order Payment - ${upiTxnId}`)}&tr=${upiTxnId}`;
          
          // Show QR code for remaining amount
          setUpiLink(upi);
          setShowQR(true);
        }
      } catch (error) {
        console.error('Error creating order:', error);
        toast.error('Error processing payment. Please try again.');
      }
    }
   // SCENARIO 3: No wallet balance at all
    else {
      console.log("No wallet balance. Showing QR for full payment.");
      
      // Generate QR for full amount
      const txnId = generateTransactionId();
      setTransactionId(txnId);
      
      // Create UPI payment link
      const upiId = 'vacomputers.com@okhdfcbank';
      const payeeName = 'VA Computer';
      const upi = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(payeeName)}&am=${amountToCharge}&cu=INR&tn=${encodeURIComponent(`Order Payment - ${txnId}`)}&tr=${txnId}`;
      
      setUpiLink(upi);
      setShowQR(true);
    }
  } catch (error) {
    console.error('Error processing payment:', error);
    toast.error('Payment processing failed');
  } finally {
    setLoading(false);
  }
};
  

 // Update the createOrder function
 const createOrder = async (paymentMethod = 'upi') => {
  try {
    console.log("Creating order with payment method:", paymentMethod);

    console.log("Payment Data:", {
      productId: paymentData.product._id,
      features: paymentData.selectedFeatures.map(f => ({
        id: f.id || f._id,
        name: f.name || f.serviceName
      }))
    });
    
    // Get payment option info
    const isPartialPayment = paymentData.paymentOption === 'partial';
    const currentPaymentAmount = paymentData.currentPaymentAmount || paymentData.totalPrice;
    
    // Calculate original total
    const originalTotal = paymentData.originalTotalPrice || (
      paymentData.product.sellingPrice +
      paymentData.selectedFeatures.reduce((sum, feature) =>
        sum + (feature.sellingPrice * (feature.quantity || 1)), 0)
    );
    
    // Calculate discount for main product
    const mainProductDiscount = paymentData.couponData ?
      calculateItemDiscount(
        paymentData.product.sellingPrice,
        originalTotal,
        paymentData.couponData.data.discountAmount
      ) : 0;
    
    // Create orderItems array starting with the main product
    const orderItems = [
      {
        id: paymentData.product._id,
        name: paymentData.product.serviceName,
        type: 'main',
        quantity: 1,
        originalPrice: paymentData.product.sellingPrice,
        finalPrice: paymentData.product.sellingPrice,
        additionalQuantity: 0
      }
    ];
    
    // Process features and add them to orderItems
    // Process additional features without individual discounts
if (paymentData.selectedFeatures && paymentData.selectedFeatures.length > 0) {
  paymentData.selectedFeatures.forEach(feature => {
    // Skip invalid features
    if (!feature) return;
    
    const featureId = feature.id || feature._id;
    if (!featureId) return;
    
    const featureName = feature.name || feature.serviceName || "Unknown Feature";
    const quantity = feature.quantity || 1;
    
    // Calculate base price without any discount
    let featurePrice;
    const isAddNewPage = featureName.toLowerCase().includes('add new page');
    
    if (isAddNewPage) {
      const additionalQuantity = Math.max(0, quantity - paymentData.product.totalPages);
      featurePrice = feature.sellingPrice * additionalQuantity;
    } else {
      featurePrice = feature.sellingPrice * quantity;
    }
    
    orderItems.push({
      id: featureId,
      name: featureName,
      type: 'feature',
      quantity: quantity,
      originalPrice: feature.sellingPrice,
      finalPrice: feature.sellingPrice, // No individual discount
      additionalQuantity: isAddNewPage ? Math.max(0, quantity - paymentData.product.totalPages) : 0
    });
  });
}
    
    // Calculate the actual price to charge for this installment
    let priceToCharge;
    if (isPartialPayment) {
      // For partial payment, use only the first installment amount (30%)
      priceToCharge = currentPaymentAmount;
    } else {
      // For full payment, use the full discounted price
      priceToCharge = paymentData.totalPrice; // Use the total price after discount
    }
    
    // Calculate installments if needed
    let installments = [];
    if (isPartialPayment) {
      // Create installment structure
      installments = [
        {
          installmentNumber: 1,
          percentage: 30,
          amount: currentPaymentAmount,
          paid: paymentMethod === 'wallet',
          paymentStatus: 'pending-approval', // Always pending-approval initially
          paidDate: paymentMethod === 'wallet' ? new Date() : null
        },
        {
          installmentNumber: 2,
          percentage: 30,
          amount: paymentData.totalPrice * 0.3,
          paid: false,
          paymentStatus: null, // Use null instead of 'none'
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        },
        {
          installmentNumber: 3,
          percentage: 40,
          amount: paymentData.totalPrice * 0.4,
          paid: false,
          paymentStatus: null, // Use null instead of 'none'
          dueDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
        }
      ];
    }
    
    // Create payment data object for the combined order
    const paymentRequestData = {
      productId: paymentData.product._id,
      quantity: 1,
      price: priceToCharge,
      originalPrice: originalTotal,
      couponApplied: paymentData.couponData?.data?.couponCode || null,
      discountAmount: originalTotal - paymentData.totalPrice,
      paymentMethod: paymentMethod,
      orderVisibility: 'pending-approval',
      paymentStatus: 'pending-approval',
      orderItems: orderItems,
      isCombinedOrder: true, // Flag this as a combined order
      selectedFeatures: paymentData.selectedFeatures,
      isRetryPayment: !!location.state?.retryPaymentId,
      previousOrderId: location.state?.retryPaymentId || null
    };
    
    // Add partial payment fields for installment payments
    if (isPartialPayment) {
      paymentRequestData.isPartialPayment = true;
      paymentRequestData.installmentNumber = 1;
      paymentRequestData.installmentAmount = currentPaymentAmount;
      paymentRequestData.totalAmount = paymentData.totalPrice;
      paymentRequestData.remainingAmount = paymentData.totalPrice - currentPaymentAmount;
      paymentRequestData.remainingPayments = paymentData.remainingPayments || [];
      paymentRequestData.installments = installments;
    }
    
    console.log("Sending combined order payment data:", paymentRequestData);
    
    // Create a single combined order with all items
    const orderResponse = await fetch(SummaryApi.createOrder.url, {
      method: SummaryApi.createOrder.method,
      credentials: 'include',
      headers: {
        "content-type": 'application/json'
      },
      body: JSON.stringify(paymentRequestData)
    });
    
    const orderData = await orderResponse.json();
    
    if (!orderData.success) {
      throw new Error(orderData.message || 'Failed to create order');
    }

    // Store the actual order ID
    const actualOrderId = orderData.data?._id || orderData.data?.orderId;
    
    // Return success with actual order ID - no need to create separate feature orders
    return {
      success: true,
      orderId: actualOrderId
    };
  } catch (error) {
    console.error('Error creating order:', error);
    throw error;
  }
};
  
  // Update the verifyPayment function
  const verifyPayment = async () => {
    if (!transactionId || !upiTransactionId.trim()) {
      setVerificationStatus('Please enter the payment reference from your UPI app');
      return;
    }
    
    try {
      setIsSubmittingVerification(true);
      setVerificationStatus('Sending your payment...');
  
      // Debug logs
      console.log("Payment data:", paymentData);
      console.log("User wallet balance:", context.walletBalance);
  
      // Calculate the correct payment amount
      const paymentAmount = remainingAmount || 
                           (paymentData?.currentPaymentAmount || paymentData?.totalPrice);
      
      console.log("Payment verification details:", {
        transactionId,
        calculatedAmount: paymentAmount,
        originalRemainingAmount: remainingAmount,
        upiTransactionId,
        isPartialPayment,
        installmentNumber
      });
      
      // Create order first to get the order ID
      let orderId = null;
      try {
        console.log("Creating order...");
        const createdOrder = await createOrder('upi');
        console.log("Order creation response:", createdOrder);
        
        if (createdOrder && createdOrder.orderId) {
          orderId = createdOrder.orderId;
          console.log('Created order with ID:', orderId);
        }
      } catch (error) {
        console.error('Error creating order:', error);
        setVerificationStatus('We could not start your order. Please try again, or contact support.');
        setLoading(false);
        return;
      }
      
      // Create wallet partial payment flag
      const isPartialWalletPayment = context.walletBalance > 0 && 
                                    context.walletBalance < paymentAmount;
      
      // Prepare request body with the correct parameter names
      const requestBody = {
        transactionId: transactionId,
        amount: Number(paymentAmount) || 1, // Fallback to 1 to avoid 0 amount
        upiTransactionId: upiTransactionId,
        isInstallmentPayment: isPartialPayment || false,
        type: isPartialPayment ? 'payment' : 'deposit',
        orderId: orderId,
        installmentNumber: isPartialPayment ? installmentNumber : null,
        description: isPartialPayment 
          ? `Installment #${installmentNumber} payment for ${paymentData?.product?.serviceName || 'Product'}`
          : 'Payment via UPI',
          isPartialInstallmentPayment: isPartialWalletPayment || false
      };
      
      console.log("Sending verification request:", requestBody);
      console.log("API URL:", SummaryApi.wallet.verifyPayment.url);
      console.log("API Method:", SummaryApi.wallet.verifyPayment.method);
      
      // Send request to verify payment
      const response = await fetch(SummaryApi.wallet.verifyPayment.url, {
        method: SummaryApi.wallet.verifyPayment.method,
        credentials: 'include',
        headers: {
          "Content-Type": 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      
      console.log("Raw response status:", response.status);
      const data = await response.json();
      console.log("Verification response:", data);
      
      if (data.success) {
        // Show appropriate success message
        setVerificationStatus('We have your payment. Your project starts once it clears, usually within 1-4 hours.');
        toast.success('Payment submitted successfully! We\'ll notify you once it\'s approved.');
        
        // Redirect to dashboard with pending flag
        setTimeout(() => {
          navigate('/dashboard', { 
            state: { 
              pendingApproval: true,
              message: "Your payment is being processed. Project details will be available after admin approval." 
            }
          });
        }, 3000);
        
        // Set payment processed flag
        setPaymentProcessed(true);
      } else {
        setVerificationStatus(data.message || 'We could not accept this payment. Please contact support.');
        setIsSubmittingVerification(false);
      }
    } catch (error) {
      console.error('Error verifying payment:', error);
      setVerificationStatus('Something went wrong. Please try again, or contact support.');
   setIsSubmittingVerification(false); // Stop loader on error
  }
  };

  const renderInstallmentInfo = () => {
    if (!isPartialPayment) return null;
    
    return (
      <div className="border-b pb-4 mb-4">
        {/* "Installment Information" named the data, not the thing. And the percentage
            beside the current installment was typed in as "(30%)" — live orders carry 30,
            40 and 50, so it was simply wrong for most of them. The share is already
            implied by the amount, which is right underneath. */}
        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Paying in parts</h3>

        <div className="mb-4 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-base font-medium text-[var(--text-primary)]">This payment</span>
            <span className="text-base font-semibold text-[var(--text-primary)]">{getInstallmentPartText(installmentNumber)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-base text-[var(--text-primary)]">You pay now</span>
            <span className="text-lg font-bold text-[var(--text-primary)]">
              ₹{paymentData.currentPaymentAmount.toLocaleString()}
            </span>
          </div>
        </div>

        <h4 className="text-base font-medium text-[var(--text-primary)] mb-2">Still to pay</h4>
        {remainingPayments.map((payment, index) => (
          <div key={index} className="flex justify-between items-center mb-2 text-sm text-[var(--text-primary)]">
            <span>{getInstallmentPartText(payment.installmentNumber)}</span>
            <span>₹{payment.amount.toLocaleString()}</span>
          </div>
        ))}

        <p className="text-sm text-[var(--text-primary)] mt-3">
          You will be notified when the next installment is due. Your project will progress as payments are made.
        </p>
      </div>
    );
  };

  const calculateItemDiscount = (itemPrice, totalPrice, totalDiscount) => {
    if (!totalDiscount || totalPrice === 0) return 0;
    const proportion = itemPrice / totalPrice;
    return Math.round(totalDiscount * proportion);
  };

  if (!paymentData) {
    return (
      <DashboardLayout user={user}>
        <div className="container mx-auto p-4 flex justify-center items-center min-h-screen">
          <TriangleMazeLoader />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout user={user}>
      <div
        className="min-h-full px-4 py-5 sm:px-6 lg:px-8 lg:py-8"
      >
      <div className="mx-auto max-w-3xl">
       {(loading || isSubmittingVerification) && (
      <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center">
        <TriangleMazeLoader />
      </div>
    )}



      <div className="overflow-hidden rounded-[2rem] border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] text-[var(--text-primary)] shadow-2xl">
        <div className="px-5 py-5 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">Payment Summary</h1>
        </div>

        <div className="bg-[var(--glass-bg)] p-6 text-[var(--text-primary)]">
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-4">{paymentData.product.serviceName}</h2>

          {/* Order Summary */}
          <div className="border-b pb-4 mb-4">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Order Summary</h3>
            
            {/* Main Product with discount */}
  <div className="flex justify-between items-center mb-2 text-base text-[var(--text-primary)]">
    <span>{paymentData.product.serviceName}</span>
    {paymentData.couponData ? (
      <div className="text-right">
        <span className="line-through text-[var(--text-primary)] mr-2">
          ₹{paymentData.product.sellingPrice.toLocaleString()}
        </span>
        <span>
          ₹{(paymentData.product.sellingPrice -
            calculateItemDiscount(
              paymentData.product.sellingPrice,
              paymentData.originalTotalPrice,
              paymentData.couponData.data.discountAmount
            )).toLocaleString()}
        </span>
      </div>
    ) : (
      <span>₹{paymentData.product.sellingPrice.toLocaleString()}</span>
    )}
  </div>

  {/* Selected Features with proper discounts */}
  {paymentData.selectedFeatures && paymentData.selectedFeatures.length > 0 && (
    <>
      <h4 className="text-base font-medium text-[var(--text-primary)] mt-3 mb-2">Selected Features</h4>

     {paymentData.selectedFeatures.map((feature, index) => {
  // Check if feature is valid
  if (!feature) {
    console.error("Feature is undefined");
    return null;
  }
  
  // Use name instead of serviceName (with fallback)
  const featureName = feature.name || feature.serviceName || "Unknown Feature";
  
  // For Add New Page, use additionalQuantity instead of quantity
  const isAddNewPage = featureName.toLowerCase().includes('add new page');
  
  // Get the correct quantity to display
  let displayQuantity;
  if (isAddNewPage) {
    // Show only the additional pages beyond the default
    displayQuantity = feature.additionalQuantity || 
                      Math.max(0, feature.quantity - paymentData.product.totalPages);
  } else {
    displayQuantity = feature.quantity || 1;
  }

  // Use the correct price calculation based on the feature type
  const originalPrice = isAddNewPage 
    ? feature.sellingPrice * displayQuantity 
    : feature.sellingPrice * (feature.quantity || 1);
  
  const itemDiscount = paymentData.couponData ? 
    calculateItemDiscount(
      originalPrice,
      paymentData.originalTotalPrice,
      paymentData.couponData.data.discountAmount
    ) : 0;
  const discountedPrice = originalPrice - itemDiscount;
  
  return (
    <div key={index} className="flex justify-between items-center mb-2 text-base text-[var(--text-primary)]">
      <div>
        <span>{featureName}</span>
        {isAddNewPage && displayQuantity > 0 && (
          <span className="text-sm ml-2">× {displayQuantity}</span>
        )}
        {!isAddNewPage && feature.quantity > 1 && (
          <span className="text-sm ml-2">× {feature.quantity}</span>
        )}
      </div>
      {itemDiscount > 0 ? (
        <div className="text-right">
          <span className="line-through mr-2">
            ₹{originalPrice.toLocaleString()}
          </span>
          <span>₹{discountedPrice.toLocaleString()}</span>
        </div>
      ) : (
        <span>₹{originalPrice.toLocaleString()}</span>
      )}
    </div>
  );
})}
    </>
  )}

  {/* Original Total Price (before coupon) */}
<div className="flex justify-between items-center mb-2 mt-4 pt-3 border-t border-[var(--field-border)] text-base text-[var(--text-primary)]">
  <span className="font-medium">Subtotal</span>
  <span className="line-through">₹{(paymentData.originalTotalPrice || 0).toLocaleString()}</span>
</div>

            {/* Coupon Discount - optional to show here since we're showing per-item */}
  {paymentData.couponData && (
    <div className="mb-2 flex items-center justify-between text-base text-[var(--badge-success-fg)]">
      <span>Coupon Discount ({paymentData.couponData.data.couponCode})</span>
      <span>-₹{paymentData.couponData.data.discountAmount.toLocaleString()}</span>
    </div>
  )}

  {/* Total */}
  <div className="flex justify-between items-center mt-4 pt-4 border-t border-[var(--field-border)]">
    <span className="text-lg font-semibold text-[var(--text-primary)]">Total Amount</span>
    <span className="text-xl font-bold text-[var(--text-primary)]">
      ₹{paymentData.totalPrice.toLocaleString()}
    </span>
  </div>
</div>

{renderInstallmentInfo()}

          {/* Payment Section */}
          <div>
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Payment Method</h3>

            {/* Wallet Balance */}
            <div className="flex justify-between items-center p-3 bg-[var(--field-bg)] rounded-lg mb-4">
              <div>
                <span className="text-base font-medium text-[var(--text-primary)]">Wallet Balance</span>
                <p className="text-sm text-[var(--text-primary)]">Available balance in your account</p>
              </div>
              <span className="text-base font-semibold text-[var(--text-primary)]">
                {displayINRCurrency(context.walletBalance)}
              </span>
            </div>

            {!showQR ? (
              <>
                {/* Payment Breakdown */}
                {remainingAmount > 0 && (
                  <div className="border-t border-[var(--field-border)] pt-4 mt-4">
                    <h4 className="text-base font-medium text-[var(--text-primary)] mb-2">Payment Breakdown</h4>

                    <div className="flex justify-between items-center mb-2 text-base text-[var(--text-primary)]">
                      <span>From Wallet</span>
                      <span>{displayINRCurrency(context.walletBalance)}</span>
                    </div>

                    <div className="flex justify-between items-center mb-2 text-base text-[var(--text-primary)]">
                      <span>Remaining Amount (via QR)</span>
                      <span>{displayINRCurrency(remainingAmount)}</span>
                    </div>
                  </div>
                )}

                {/* Payment Buttons */}
                <div className="flex justify-between mt-6">
                  <button
                    onClick={handleBackToProductDetails}
                    className="bg-[var(--field-bg)] text-[var(--text-primary)] px-6 py-3 rounded-lg text-base font-medium hover:bg-[var(--glass-bg-strong)] transition-colors"
                  >
                    Back
                  </button>

                  <button
                    onClick={handleWalletPayment}
                    disabled={loading}
                    className="rounded-lg bg-[rgb(var(--ink-rgb))] px-6 py-3 text-base font-medium text-[var(--page-bg)] transition-colors hover:bg-[rgb(var(--ink-rgb)/0.85)]"
                  >
                    {remainingAmount > 0
                      ? 'Pay with QR & Continue'
                      : 'Complete Payment'}
                  </button>
                </div>
              </>
            ) : (
              /* QR Code Payment */
              <div className="flex flex-col items-center mt-4">
              <h3 className="text-center text-lg font-semibold text-[var(--text-primary)] mb-3">
                Scan QR Code to Pay Remaining Amount
              </h3>

              {/* White in every theme on purpose — a QR code is read by a camera,
                  which expects dark modules on a white quiet zone. */}
              <div className="bg-white p-4 rounded-lg shadow-inner mb-4 inline-block">
                <QRCodeSVG value={upiLink} size={200} />
              </div>

              {/* <p className="text-center mb-2">Scan with any UPI app to pay {displayINRCurrency(remainingAmount)}</p> */}

              <div className="w-full mb-4">
                <label htmlFor="upiTransactionId" className="block text-base font-medium text-[var(--text-primary)] mb-2">
                  UPI Transaction ID:
                </label>
                <input
                  type="text"
                  id="upiTransactionId"
                  value={upiTransactionId}
                  onChange={(e) => setUpiTransactionId(e.target.value)}
                  className="w-full border border-[var(--field-border)] rounded-md p-2 text-base text-[var(--text-primary)]"
                  placeholder="Enter the transaction ID from your UPI app"
                  required
                />
                <p className="text-sm text-[var(--text-primary)] mt-1">
                  You will find this in your UPI app, under payment history.
                </p>
              </div>

               <button
      onClick={verifyPayment}
      disabled={loading || !upiTransactionId.trim() || isSubmittingVerification}
      className="w-full rounded-lg bg-[rgb(var(--ink-rgb))] px-6 py-2 text-base font-medium text-[var(--page-bg)] transition-colors hover:bg-[rgb(var(--ink-rgb)/0.85)] disabled:bg-[var(--glass-bg-strong)] disabled:text-[var(--text-muted)]"
    >
      {isSubmittingVerification ? 'Sending...' : (loading ? 'Checking...' : 'Send for checking')}
    </button>

              {verificationStatus && (
                <p className="mt-3 text-center text-base text-[var(--text-primary)]">
                  {verificationStatus}
                </p>
              )}
            </div>
            )}
          </div>
        </div>
      </div>
      </div>
      </div>
    </DashboardLayout>
  );
};

export default DirectPayment;
