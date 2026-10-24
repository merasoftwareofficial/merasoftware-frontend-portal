import React, { useEffect, useState } from 'react';
import SummaryApi from '../common';

// The backend owns the country list and validates the number; this only collects it.
// If the list cannot load, India stays available so the form never blocks.
const FALLBACK = [{ code: '+91', label: 'India', digits: 10 }];

const PhoneInput = ({ countryCode, phone, onChange, className = '' }) => {
  const [countries, setCountries] = useState(FALLBACK);
  useEffect(() => {
    let active = true;
    fetch(SummaryApi.phoneCountries.url)
      .then(response => response.json())
      .then(result => { if (active && result.success && result.data?.length) setCountries(result.data); })
      .catch(() => {});
    return () => { active = false; };
  }, []);
  const selected = countries.find(row => row.code === countryCode) || countries[0];
  return (
    <div>
      <label className="block text-gray-600 font-medium mb-1">Mobile number</label>
      <div className="flex gap-2">
        <select
          aria-label="Country code"
          value={selected.code}
          onChange={event => onChange({ countryCode: event.target.value, phone })}
          className={`border border-gray-300 rounded-md px-2 py-2 ${className}`}
        >
          {countries.map(row => <option key={row.code} value={row.code}>{row.label} ({row.code})</option>)}
        </select>
        <input
          type="tel"
          inputMode="numeric"
          aria-label="Mobile number"
          value={phone}
          onChange={event => onChange({ countryCode: selected.code, phone: event.target.value.replace(/[^\d\s-]/g, '') })}
          required
          placeholder={`${selected.digits}-digit number`}
          className={`w-full border border-gray-300 rounded-md px-4 py-2 ${className}`}
        />
      </div>
    </div>
  );
};

export default PhoneInput;
