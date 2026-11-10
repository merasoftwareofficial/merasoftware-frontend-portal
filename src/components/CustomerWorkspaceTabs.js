import React from 'react';

const CustomerWorkspaceTabs = ({ tabs, activeTab, onChange, ariaLabel = 'Workspace sections', variant = 'default' }) => {
  const isInline = variant === 'inline';

  return (
    <div
      className={
        isInline
          ? ''
          : 'border-b border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-5 backdrop-blur-xl backdrop-saturate-150 sm:px-6'
      }
    >
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="flex flex-wrap gap-x-4 sm:flex-nowrap sm:gap-6 sm:overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.id)}
              className={[
                'relative -mb-px inline-flex shrink-0 cursor-pointer items-center justify-center border-b-2 px-1 py-2.5 text-sm font-semibold transition sm:py-4 sm:text-base',
                isActive
                  ? 'border-accent-text text-accent-text'
                  : 'border-transparent text-[var(--text-secondary)] hover:border-[var(--glass-border-strong)] hover:text-[var(--text-primary)]',
              ].join(' ')}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default CustomerWorkspaceTabs;
