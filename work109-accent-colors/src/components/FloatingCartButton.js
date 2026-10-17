import React, { useEffect, useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { useDraftOrders } from '../context/DraftOrdersContext';

const WIGGLE_INTERVAL_MS = 5000;
const WIGGLE_DURATION_MS = 700;

const FloatingCartButton = () => {
  const { draftOrders, openCartDrawer } = useDraftOrders();
  const [isWiggling, setIsWiggling] = useState(false);

  useEffect(() => {
    if (draftOrders.length === 0) return undefined;

    const interval = setInterval(() => {
      setIsWiggling(true);
      setTimeout(() => setIsWiggling(false), WIGGLE_DURATION_MS);
    }, WIGGLE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [draftOrders.length]);

  if (draftOrders.length === 0) return null;

  return (
    <button
      type="button"
      onClick={openCartDrawer}
      aria-label={`Open cart, ${draftOrders.length} item${draftOrders.length === 1 ? '' : 's'}`}
      className={`fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[rgb(var(--ink-rgb))] text-[var(--page-bg)] shadow-xl transition-transform hover:bg-[rgb(var(--ink-rgb)/0.85)] ${
        isWiggling ? 'animate-wiggle' : ''
      }`}
    >
      <ShoppingCart className="h-6 w-6" />
      <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white">
        {draftOrders.length}
      </span>
    </button>
  );
};

export default FloatingCartButton;
