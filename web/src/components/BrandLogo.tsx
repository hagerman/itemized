import React, { useId } from "react";

interface BrandLogoProps {
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ className = "h-8 w-8" }) => {
  const gradId = useId();
  return (
    <svg
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      data-testid="brand-logo"
      className={className}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#4338ca" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill={`url(#${gradId})`} />
      {/* Top face */}
      <path
        d="M256 102L386 177L256 252L126 177L256 102Z"
        fill="#ffffff"
        stroke="#ffffff"
        strokeWidth="12"
        strokeLinejoin="round"
      />
      {/* Subtle minimal package tape / item slit on top face */}
      <path
        d="M196 142L316 212"
        stroke={`url(#${gradId})`}
        strokeWidth="22"
        strokeLinecap="round"
      />
      {/* Left face */}
      <path
        d="M120 198L244 270V408L120 336V198Z"
        fill="#e0e7ff"
        fillOpacity="0.88"
        stroke="#e0e7ff"
        strokeOpacity="0.88"
        strokeWidth="12"
        strokeLinejoin="round"
      />
      {/* Right face */}
      <path
        d="M392 198L268 270V408L392 336V198Z"
        fill="#c7d2fe"
        fillOpacity="0.58"
        stroke="#c7d2fe"
        strokeOpacity="0.58"
        strokeWidth="12"
        strokeLinejoin="round"
      />
    </svg>
  );
};
