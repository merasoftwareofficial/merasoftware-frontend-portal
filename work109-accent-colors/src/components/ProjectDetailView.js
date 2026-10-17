import React, { useState } from 'react';
import Surface from './Surface';
import GlassButton from './GlassButton';
import { ArrowLeft, HelpCircle, Minus, Plus } from 'lucide-react';

const isAddNewPageFeature = (feature) => {
  const name = feature && typeof feature === 'object' ? feature.serviceName || feature.text : feature;
  return typeof name === 'string' && name.toLowerCase().includes('add new page');
};

const CATEGORY_LABEL = {
  standard_websites: 'Standard Website',
  dynamic_websites: 'Dynamic Website',
  cloud_software_development: 'Cloud Software',
  app_development: 'App Development',
};

const SectionHeading = ({ children }) => (
  <h2 className="border-b border-[var(--glass-border)] pb-2 text-xl font-bold text-[var(--text-primary)]">
    {children}
  </h2>
);

const InfoTooltip = ({ text }) => {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        aria-label="More info"
        className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
      >
        <HelpCircle className="h-5 w-5" />
      </button>
      {open && (
        <span className="absolute bottom-full left-1/2 z-10 mb-2 w-60 -translate-x-1/2 rounded-lg bg-[var(--menu-bg)] px-3 py-2 text-sm font-normal leading-5 text-[var(--text-primary)] shadow-lg">
          {text}
        </span>
      )}
    </span>
  );
};

const ProjectDetailView = ({ project, onBack, onProceedWithPayment, onProceedWithoutPayment }) => {
  const categoryLabel = CATEGORY_LABEL[project.category] || 'Project';
  const description = project.formattedDescriptions?.[0]?.content || '';
  const perfectFor = project.perfectFor || [];
  const packageIncludes = project.packageIncludes || [];
  const allAdditionalFeatures = project.additionalFeaturesData || [];
  const totalPages = project.totalPages || 0;

  const addPageFeature = allAdditionalFeatures.find(isAddNewPageFeature);
  const additionalFeatures = allAdditionalFeatures.filter((feature) => !isAddNewPageFeature(feature));

  const [selectedFeatures, setSelectedFeatures] = useState([]);
  const [pageQuantity, setPageQuantity] = useState(totalPages);

  const toggleFeature = (featureId) => {
    setSelectedFeatures((current) =>
      current.includes(featureId) ? current.filter((id) => id !== featureId) : [...current, featureId]
    );
  };

  const extraPages = Math.max(0, pageQuantity - totalPages);
  const extraPagesCost = addPageFeature ? extraPages * (addPageFeature.sellingPrice || 0) : 0;

  const handleProceed = (callback) => {
    const pageSelection = addPageFeature
      ? {
          featureId: addPageFeature._id,
          quantity: pageQuantity,
          extraPages,
          extraCost: extraPagesCost,
          pricePerPage: addPageFeature.sellingPrice || 0,
        }
      : null;
    callback?.(selectedFeatures, pageSelection);
  };

  return (
    <Surface as="article" radius="lg" className="overflow-hidden">
      {/* Title + Type (no price) */}
      <div className="border-b border-[var(--divider)] bg-[var(--glass-bg-subtle)] px-5 py-5 text-[var(--text-primary)] sm:px-6 lg:px-8">
        <GlassButton onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </GlassButton>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          {project.serviceName}
          {totalPages > 0 && (
            <span className="ml-2 text-lg font-medium text-[var(--text-secondary)]">({totalPages} pages)</span>
          )}
        </h1>
        <p className="mt-2 text-base font-medium text-[var(--text-primary)]">{categoryLabel}</p>
        {/* text-emerald-300 measured 1.46:1 on the light panel (11.43:1 on the
            dark one, which is why it read as fine). This is a package name, not
            a status, so it takes no colour at all. */}
        {project.category === 'dynamic_websites' && packageIncludes[0] && (
          <p className="mt-1 text-base font-semibold text-[var(--text-primary)]">{packageIncludes[0]}</p>
        )}
      </div>

      <div className="space-y-8 px-5 py-6 sm:px-8 sm:py-8">
        {/* 1. Description */}
        {description && (
          <section>
            <SectionHeading>What is this project?</SectionHeading>
            <div
              className="prose prose-lg mt-3 max-w-none text-base leading-7 text-[var(--text-primary)]"
              dangerouslySetInnerHTML={{ __html: description }}
            />
          </section>
        )}

        {/* 2. Who is it for */}
        {perfectFor.length > 0 && (
          <section>
            <SectionHeading>Who Is This For?</SectionHeading>
            <div className="mt-3 flex flex-wrap gap-2">
              {perfectFor.map((item, index) => {
                const text = item && typeof item === 'object' ? item.text : item;
                return (
                  <span
                    key={text || index}
                    className="rounded-full bg-[var(--glass-bg-strong)] px-3.5 py-1.5 text-sm font-medium text-[var(--text-primary)]"
                  >
                    {text}
                  </span>
                );
              })}
            </div>
          </section>
        )}

        {/* 3. What's included */}
        {packageIncludes.length > 0 && (
          <section>
            <div className="flex items-center">
              <SectionHeading>What You Get</SectionHeading>
              <InfoTooltip text="These are the standard items already included in this project at no extra cost." />
            </div>
            <ul className="mt-3 space-y-2">
              {packageIncludes.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-base text-[var(--text-primary)]">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--text-muted)]" />
                  {item}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 4. Add-on features (customize) */}
        {(additionalFeatures.length > 0 || addPageFeature) && (
          <section>
            <div className="flex items-center">
              <SectionHeading>Add More to Your Project</SectionHeading>
              <InfoTooltip text="Optional. Select any extra feature you want added — you can change this before you proceed." />
            </div>

            {/* Selection used to be `border-emerald-500 bg-emerald-50/60` — an
                opaque light fill, so on the dark card it was a lit patch (6.63:1)
                and on the light card it was invisible (1.00:1). The state now
                reads from the border + ring, which works on both grounds. */}
            {addPageFeature && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--badge-success-border)] bg-[var(--badge-success-bg)] px-4 py-3.5 ring-1 ring-[var(--badge-success-border)]">
                <div>
                  <p className="text-base font-semibold text-[var(--text-primary)]">Add More Pages</p>
                  <p className="mt-0.5 text-sm text-[var(--text-primary)]">
                    Includes {totalPages} page{totalPages === 1 ? '' : 's'}
                  </p>
                  {extraPages > 0 && (
                    <p className="mt-1 text-sm text-[var(--text-primary)]">
                      +{extraPages} extra page{extraPages === 1 ? '' : 's'} — {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(extraPagesCost)}
                    </p>
                  )}
                  <p className="mt-1 text-sm text-[var(--text-primary)]">
                    {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(addPageFeature.sellingPrice || 0)} per additional page
                  </p>
                </div>

                <div className="flex items-center gap-3 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => setPageQuantity((current) => Math.max(totalPages, current - 1))}
                    disabled={pageQuantity <= totalPages}
                    aria-label="Remove a page"
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-primary)] transition hover:bg-[var(--glass-bg-hover)] disabled:cursor-not-allowed disabled:text-[var(--text-secondary)]"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-8 text-center text-base font-bold text-[var(--text-primary)]">{pageQuantity}</span>
                  <button
                    type="button"
                    onClick={() => setPageQuantity((current) => current + 1)}
                    aria-label="Add a page"
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-primary)] transition hover:bg-[var(--glass-bg-hover)]"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {additionalFeatures.map((feature, index) => {
                const featureId = (feature && typeof feature === 'object' ? feature._id || feature.text : feature) || index;
                const featureLabel = feature && typeof feature === 'object' ? feature.serviceName || feature.text : feature;
                const featurePrice = feature && typeof feature === 'object' ? feature.sellingPrice : undefined;
                const isChecked = selectedFeatures.includes(featureId);
                return (
                  <label
                    key={featureId}
                    className={`flex cursor-pointer items-start justify-between gap-3 rounded-2xl border px-4 py-3.5 transition ${
                      isChecked
                        ? 'border-[var(--badge-success-border)] bg-[var(--badge-success-bg)] ring-1 ring-[var(--badge-success-border)]'
                        : 'border-[var(--glass-border)] bg-[var(--glass-bg)] hover:border-[var(--glass-border-strong)] hover:bg-[var(--glass-bg-hover)]'
                    }`}
                  >
                    <div>
                      <span className="text-base font-semibold text-[var(--text-primary)]">{featureLabel}</span>
                      {featurePrice > 0 && (
                        <p className="mt-1 text-sm text-[var(--text-primary)]">+ {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(featurePrice)}</p>
                      )}
                    </div>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleFeature(featureId)}
                      className="mt-1 h-5 w-5 shrink-0 rounded border-[var(--glass-border-strong)] text-[var(--badge-success-fg)] focus:ring-[var(--badge-success-border)]"
                    />
                  </label>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {/* 5. Proceed actions */}
      <div className="border-t border-[var(--glass-border)] px-5 py-6 sm:px-8 sm:py-8">
        <div className="flex flex-col gap-3 sm:flex-row">
          <GlassButton
            variant="primary"
            size="lg"
            onClick={() => handleProceed(onProceedWithPayment)}
            className="w-full sm:flex-1"
          >
            Add to Cart
          </GlassButton>
          <GlassButton
            size="lg"
            onClick={() => handleProceed(onProceedWithoutPayment)}
            className="w-full sm:flex-1"
          >
            Submit Project Request (Without Payment)
          </GlassButton>
        </div>
        <p className="mt-3 text-sm text-[var(--text-primary)]">
          Without payment: your project request is submitted and our team will contact you shortly.
        </p>
      </div>
    </Surface>
  );
};

export default ProjectDetailView;
