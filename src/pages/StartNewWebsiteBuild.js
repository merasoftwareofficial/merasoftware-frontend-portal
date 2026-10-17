import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  ArrowLeft,
  ArrowRight,
  IndianRupee,
  UserCog,
  Headset,
  Wand2,
  MessageSquareText,
  CheckCircle2,
  User,
  Mail,
  Phone,
  ShoppingCart,
  Newspaper,
  BookOpen,
  UtensilsCrossed,
  HelpCircle,
} from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';

const QUESTIONS = [
  {
    key: 'budget',
    eyebrow: 'Step 1 of 3',
    title: "What's your budget for this website?",
    subtitle: 'This helps us understand the scale of what you need.',
    options: [
      {
        value: 'range_5k_30k',
        icon: IndianRupee,
        title: '5,000 - 30,000',
        description: 'A focused website with the essentials.',
      },
      {
        value: 'range_30k_plus',
        icon: IndianRupee,
        title: '30,000 and above',
        description: 'A larger or more advanced website.',
      },
    ],
  },
  {
    key: 'websiteType',
    eyebrow: 'Step 2 of 2',
    title: 'What kind of website do you need?',
    subtitle: 'Pick the closest match — our team will confirm the details with you.',
    wideLastOption: true,
    options: [
      {
        value: 'ecommerce',
        icon: ShoppingCart,
        title: 'Ecommerce Website',
        description: 'For selling products online with cart and checkout.',
      },
      {
        value: 'blogging',
        icon: Newspaper,
        title: 'Blogging Website',
        description: 'For publishing articles and blog posts regularly.',
      },
      {
        value: 'journal',
        icon: BookOpen,
        title: 'Journal Website',
        description: 'For journals, magazines or research publications.',
      },
      {
        value: 'food_ordering',
        icon: UtensilsCrossed,
        title: 'Food Ordering Website',
        description: 'For restaurants and food ordering with delivery.',
      },
      {
        value: 'not_sure',
        icon: HelpCircle,
        title: "I'm not sure, contact me",
        description: 'Our team will reach out to understand your requirement and guide you.',
      },
    ],
  },
  {
    key: 'ownership',
    eyebrow: 'Step 2 of 3',
    title: 'Who will manage your content?',
    subtitle: 'Choose how you want to update text, images and pages after launch.',
    options: [
      {
        value: 'self_managed',
        icon: UserCog,
        title: "I'll manage content myself",
        description: 'You get admin panel access to update content anytime.',
        note: 'Dynamic website — build cost will be higher.',
      },
      {
        value: 'we_maintain',
        icon: Headset,
        title: 'MeraSoftware will maintain it for me',
        description: 'We handle all content updates for you.',
        note: 'Simpler website — build cost will be lower.',
      },
    ],
  },
  {
    key: 'path',
    eyebrow: 'Step 3 of 3',
    title: 'Do you want to customize your website project?',
    subtitle: 'Choose whichever way works best for you.',
    options: [
      {
        value: 'customize',
        icon: Wand2,
        title: 'I want to customize my website requirements by myself',
        note: "You'll get a form next where you can plan your website yourself.",
      },
      {
        value: 'request_us',
        icon: MessageSquareText,
        title: 'Contact me and plan the project for me',
        note: 'Our team will understand your requirement and prepare a project quotation for you.',
      },
    ],
  },
];

const BUDGET_LABELS = {
  range_5k_30k: '5,000 - 30,000',
  range_30k_plus: '30,000 and above',
};

const OWNERSHIP_LABELS = {
  self_managed: "I'll manage content myself",
  we_maintain: 'MeraSoftware will maintain it for me',
};

const WEBSITE_TYPE_LABELS = {
  ecommerce: 'Ecommerce Website',
  blogging: 'Blogging Website',
  journal: 'Journal Website',
  food_ordering: 'Food Ordering Website',
  not_sure: "Not sure yet",
};

const QUESTIONS_BY_KEY = QUESTIONS.reduce((acc, q) => {
  acc[q.key] = q;
  return acc;
}, {});

const StartNewWebsiteBuild = () => {
  const navigate = useNavigate();
  const user = useSelector((state) => state?.user?.user);

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [direction, setDirection] = useState('forward');
  const [transitioning, setTransitioning] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [contactDetails, setContactDetails] = useState({ name: '', email: '', phone: '' });

  useEffect(() => {
    if (submitted) {
      setContactDetails({
        name: user?.name || '',
        email: user?.email || '',
        phone: user?.phone || '',
      });
    }
  }, [submitted, user]);

  const handleContactChange = (e) => {
    const { name, value } = e.target;
    setContactDetails((prev) => ({ ...prev, [name]: value }));
  };

  const flowKeys =
    answers.budget === 'range_30k_plus'
      ? ['budget', 'websiteType']
      : ['budget', 'ownership', 'path'];

  const goToStep = (nextStep, dir) => {
    setDirection(dir);
    setTransitioning(true);
    setTimeout(() => {
      setStep(nextStep);
      setTransitioning(false);
    }, 220);
  };

  const handleSelect = (questionKey, value) => {
    const nextAnswers = { ...answers, [questionKey]: value };
    setAnswers(nextAnswers);

    if (questionKey === 'websiteType') {
      goToStep(step, 'forward');
      setTimeout(() => setSubmitted(true), 220);
      return;
    }

    if (questionKey === 'path') {
      if (value === 'customize') {
        // Derive the primary project category from the flow answers (Phase 1: 5k-30k branch only).
        // "I'll manage content myself" => dynamic website; "MeraSoftware will maintain it" => static website.
        const projectCategory =
          nextAnswers.ownership === 'self_managed' ? 'dynamic_websites' : 'standard_websites';
        setTimeout(() => {
          navigate('/start-new-project/build/new_website/customize', {
            state: {
              budget: nextAnswers.budget,
              ownership: nextAnswers.ownership,
              projectCategory,
            },
          });
        }, 220);
        return;
      }
      goToStep(step, 'forward');
      setTimeout(() => setSubmitted(true), 220);
      return;
    }

    goToStep(step + 1, 'forward');
  };

  const handleBack = () => {
    // Contact/summary screen par hain to pehle usse hatao — user apne pichle
    // question (websiteType / path) par wapas aaye, shuruaat mein nahi.
    if (submitted) {
      setSubmitted(false);
      return;
    }
    if (step === 0) {
      navigate('/start-new-project');
      return;
    }
    goToStep(step - 1, 'back');
  };

  const currentQuestion = QUESTIONS_BY_KEY[flowKeys[step]];

  const animationClass = transitioning
    ? direction === 'forward'
      ? 'animate-[slideOutLeft_0.2s_ease-in_both]'
      : 'animate-[slideOutRight_0.2s_ease-in_both]'
    : 'animate-[fadeSlideUp_0.4s_ease-out_both]';

  return (
    <DashboardLayout user={user}>
      <div
        className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-4 py-10 sm:px-6 lg:px-8 lg:py-14"
      >
        <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />

        <div className="relative mx-auto max-w-6xl">
          <div className="relative flex items-center justify-center">
            <button
              type="button"
              onClick={handleBack}
              className="absolute left-0 inline-flex items-center gap-2 rounded-xl border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] px-5 py-3 text-lg font-medium text-[var(--text-primary)] shadow-[var(--card-shadow)] backdrop-blur-2xl transition-all duration-300 hover:border-[var(--accent-soft-border)] hover:bg-[var(--glass-bg-strong)]"
            >
              <ArrowLeft className="h-5 w-5" strokeWidth={2} />
              Back
            </button>
            <span className="inline-flex items-center rounded-full border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] px-4 py-1.5 text-sm font-medium text-[var(--text-primary)] shadow-[var(--card-shadow)] backdrop-blur-2xl">
              New Website Project
            </span>
          </div>

          {!submitted && (
            <div className="mt-8 flex items-center justify-center gap-2">
              {flowKeys.map((key, i) => (
                <div
                  key={key}
                  className={`h-1.5 rounded-full transition-all duration-500 ${
                    i === step
                      ? 'w-10 bg-[var(--accent-soft-fg)]'
                      : i < step
                      ? 'w-6 bg-[var(--accent-soft-border)]'
                      : 'w-6 bg-[var(--glass-bg-strong)]'
                  }`}
                />
              ))}
            </div>
          )}

          {!submitted ? (
            <div key={currentQuestion.key} className={`mt-8 ${animationClass}`}>
              <div className="text-center">
                <span className="inline-flex items-center rounded-full border border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] px-3 py-1 text-xs font-medium text-[var(--accent-soft-fg)]">
                  {currentQuestion.eyebrow}
                </span>
                <h1 className="mt-4 text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">
                  {currentQuestion.title}
                </h1>
                <p className="mx-auto mt-3 max-w-xl text-base text-[var(--text-secondary)]">
                  {currentQuestion.subtitle}
                </p>
              </div>

              <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
                {currentQuestion.options.map((option, index) => {
                  const Icon = option.icon;
                  const isWide =
                    currentQuestion.wideLastOption &&
                    index === currentQuestion.options.length - 1;
                  return (
                    <div
                      key={option.value}
                      style={{ animationDelay: `${index * 90}ms` }}
                      className={`animate-[fadeSlideUp_0.5s_ease-out_both] ${isWide ? 'sm:col-span-2' : ''}`}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelect(currentQuestion.key, option.value)}
                        className="group relative w-full overflow-hidden rounded-3xl border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] p-6 text-left shadow-[var(--card-shadow)] backdrop-blur-2xl backdrop-saturate-150 transition-all duration-300 hover:-translate-y-1.5 hover:border-[var(--accent-soft-border)] hover:bg-[var(--glass-bg-strong)] hover:shadow-[0_24px_48px_rgb(var(--accent-500)/0.28)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-soft-fg)]"
                      >
                        <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-[var(--glass-sheen)] to-transparent" />
                        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[var(--accent-soft-bg)] opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100" />
                        <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-[var(--glass-border)] transition-all duration-300 group-hover:ring-[var(--accent-soft-border)]" />

                        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-md transition-colors duration-300 group-hover:border-[var(--accent-soft-border)] group-hover:bg-[var(--accent-soft-bg)]">
                          <Icon className="h-7 w-7 text-[var(--text-primary)] transition-colors duration-300 group-hover:text-[var(--accent-soft-fg)]" strokeWidth={1.75} />
                        </div>

                        <h3 className="relative mt-5 text-xl font-semibold text-[var(--text-primary)]">
                          {option.title}
                        </h3>
                        {option.description && (
                          <p className="relative mt-2 text-base leading-relaxed text-[var(--text-secondary)]">
                            {option.description}
                          </p>
                        )}

                        <div className="relative mt-5 inline-flex items-center gap-2 rounded-xl border border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] px-4 py-2 text-base font-medium text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-md transition-all duration-300 group-hover:gap-3 group-hover:border-[var(--accent-soft-border)] group-hover:bg-[var(--glass-bg-strong)]">
                          Select
                          <ArrowRight className="h-4 w-4" strokeWidth={2} />
                        </div>
                      </button>

                      {option.note && (
                        <p className="mt-3 px-1 text-center text-lg text-[var(--text-primary)]">
                          {option.note}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="mt-10 animate-[fadeSlideUp_0.5s_ease-out_both]">
              <div className="relative overflow-hidden rounded-3xl border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] p-8 text-center shadow-[var(--card-shadow)] backdrop-blur-2xl backdrop-saturate-150 sm:p-10">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-[var(--glass-sheen)] to-transparent" />

                <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--badge-success-border)] bg-[var(--badge-success-bg)] backdrop-blur-md">
                  <CheckCircle2 className="h-9 w-9 text-[var(--badge-success-fg)]" strokeWidth={1.75} />
                </div>

                <h2 className="relative mt-5 text-2xl font-bold text-[var(--text-primary)]">
                  Your requirement is ready to submit
                </h2>
                <p className="relative mx-auto mt-2 max-w-md text-base text-[var(--text-secondary)]">
                  Our team will review this and set up the best project for you.
                </p>

                <div className="relative mt-8 divide-y divide-[var(--divider)] rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] text-left">
                  <div className="flex items-center justify-between px-5 py-3">
                    <span className="text-base text-[var(--text-secondary)]">Budget</span>
                    <span className="text-base font-medium text-[var(--text-primary)]">
                      {BUDGET_LABELS[answers.budget]}
                    </span>
                  </div>
                  {answers.websiteType && (
                    <div className="flex items-center justify-between px-5 py-3">
                      <span className="text-base text-[var(--text-secondary)]">Website type</span>
                      <span className="text-base font-medium text-[var(--text-primary)]">
                        {WEBSITE_TYPE_LABELS[answers.websiteType]}
                      </span>
                    </div>
                  )}
                  {answers.ownership && (
                    <div className="flex items-center justify-between px-5 py-3">
                      <span className="text-base text-[var(--text-secondary)]">Content management</span>
                      <span className="text-base font-medium text-[var(--text-primary)]">
                        {OWNERSHIP_LABELS[answers.ownership]}
                      </span>
                    </div>
                  )}
                </div>

                <div className="relative mt-6 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-6 text-left">
                  <p className="text-base text-[var(--text-secondary)]">
                    This request will be submitted under your name. You can edit these details below.
                  </p>

                  <div className="mt-5 space-y-5">
                    <label className="block">
                      <span className="mb-2 flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]">
                        <User size={16} className="text-[var(--text-muted)]" /> Full name
                      </span>
                      <input
                        name="name"
                        value={contactDetails.name}
                        onChange={handleContactChange}
                        className="w-full border-0 border-b border-[var(--glass-border-strong)] bg-transparent px-0 py-2 text-base text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-soft-fg)] focus:ring-0"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-2 flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]">
                        <Mail size={16} className="text-[var(--text-muted)]" /> Email address
                      </span>
                      <input
                        name="email"
                        value={contactDetails.email}
                        readOnly
                        className="w-full border-0 border-b border-[var(--glass-border)] bg-transparent px-0 py-2 text-base text-[var(--text-primary)] outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-2 flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]">
                        <Phone size={16} className="text-[var(--text-muted)]" /> Phone number
                      </span>
                      <input
                        name="phone"
                        type="tel"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={contactDetails.phone}
                        onChange={handleContactChange}
                        className="w-full border-0 border-b border-[var(--glass-border-strong)] bg-transparent px-0 py-2 text-base text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-soft-fg)] focus:ring-0"
                      />
                    </label>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {}}
                  className="relative mt-8 inline-flex items-center gap-2 rounded-xl border border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] px-6 py-3 text-base font-medium text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-md transition-all duration-300 hover:gap-3 hover:border-[var(--accent-soft-border)] hover:bg-[var(--glass-bg-strong)]"
                >
                  Submit Request
                  <ArrowRight className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideOutLeft {
          from { opacity: 1; transform: translateX(0); }
          to { opacity: 0; transform: translateX(-24px); }
        }
        @keyframes slideOutRight {
          from { opacity: 1; transform: translateX(0); }
          to { opacity: 0; transform: translateX(24px); }
        }
      `}</style>
    </DashboardLayout>
  );
};

export default StartNewWebsiteBuild;
