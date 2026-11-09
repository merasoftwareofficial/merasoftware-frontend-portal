import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Clock } from 'lucide-react';
import Surface from './Surface';
import GlassButton from './GlassButton';
import { installmentName } from '../helpers/projectInstallments';

const PaymentAlert = ({
  installmentNumber,
  installment,
  installmentCount,
  amount,
  projectId,
  progress,
  paymentStatus,
  onClick
}) => {
  const navigate = useNavigate();
 
  const handleMakePayment = () => {
    if (onClick) {
      onClick();
    } else {
      navigate(`/installment-payment/${projectId}/${installmentNumber}`);
    }
  };

  // The name comes from the installment itself (helpers/projectInstallments.js).
  const getInstallmentName = (number) => installmentName(installment || { installmentNumber: number }, installmentCount);
  
  // Both states are real statuses — a payment being verified, and a payment
  // that is due — so colour belongs here. What did not belong was the SHAPE:
  // opaque `bg-blue-50` / `bg-amber-50` fills, which ignore the theme entirely.
  // Against the dark page that fill measures 18.5:1 — it opened as a lit slab.
  // And blue is not in the portal palette at all.
  //
  // The button was `bg-amber-600` with `text-[var(--text-primary)]`: 5.60:1 in
  // light but 3.04:1 in dark, because --text-primary goes near-white there.
  const meta = paymentStatus === 'pending-approval'
    ? {
        tone: 'pending',
        Icon: Clock,
        title: 'Payment Verification Pending',
        body: `Your ${getInstallmentName(installmentNumber)} payment is being verified. This process usually takes 1-4 hours. Project development will continue once your payment is approved.`,
        action: false,
      }
    : {
        tone: 'pending',
        Icon: AlertCircle,
        title: `${getInstallmentName(installmentNumber)} Payment Due`,
        body: `Your project has reached ${Math.round(progress)}% completion. Further progress requires payment of \u20B9${amount.toLocaleString()}. Please make the payment to continue development.`,
        action: true,
      };

  return (
    <Surface tone="subtle" radius="panel" className="mb-6 p-4">
      <div className="flex items-start gap-3">
        <span className="badge badge-pending mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
          <meta.Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">{meta.title}</h3>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">{meta.body}</p>
          {meta.action && (
            <GlassButton variant="primary" onClick={handleMakePayment} className="mt-4">
              Make Payment Now
            </GlassButton>
          )}
        </div>
      </div>
    </Surface>
  );
};

export default PaymentAlert;
