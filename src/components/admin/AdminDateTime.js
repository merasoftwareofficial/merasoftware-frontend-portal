import React from "react";

// One display policy for admin list timestamps. Values remain UTC in the API/database.
const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata",
});
const timeFormat = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata",
});

export default function AdminDateTime({ value, title }) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return <span className="text-sm text-slate-500">—</span>;
  }
  return (
    <time dateTime={date.toISOString()} title={title || "Indian Standard Time (IST)"} className="block whitespace-nowrap">
      <span className="block text-sm font-semibold text-slate-900">{dateFormat.format(date)}</span>
      <span className="mt-1 block text-xs text-slate-500">{timeFormat.format(date).toUpperCase()}</span>
    </time>
  );
}
