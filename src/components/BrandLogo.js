import React from "react";
import { BRAND_LOGO, WEBSITE_URL } from "../helpers/brand";

/**
 * The website's logo, linking to the website's homepage — the same as the website's own admin
 * panel (merasoftware/src/components/admin-layout.tsx). `onDark` picks the file made for
 * navy/dark backgrounds. Sized by height; the width follows the artwork's own proportions.
 */
const BrandLogo = ({ onDark = false, className = "h-8 sm:h-9", linked = true }) => {
  const image = (
    <img
      src={onDark ? BRAND_LOGO.dark : BRAND_LOGO.light}
      alt={BRAND_LOGO.alt}
      width={BRAND_LOGO.width}
      height={BRAND_LOGO.height}
      className={`block w-auto max-w-none ${className}`}
    />
  );
  if (!linked) return image;
  return (
    <a href={WEBSITE_URL} className="flex shrink-0 items-center" aria-label="Mera Software website">
      {image}
    </a>
  );
};

export default BrandLogo;
