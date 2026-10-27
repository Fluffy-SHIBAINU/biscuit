import React from "react";

export default function Dog({ size = 76 }) {
  return (
    <svg role="img" aria-label="Biscuit" width={size} height={size} viewBox="0 0 72 72" fill="none">
      <path d="M17 24c-7 3-11 15-7 26 1.4 3.8 5.6 4.6 7.8 1.4L25 40 17 24z" fill="#7C4A03" />
      <path d="M55 24c7 3 11 15 7 26-1.4 3.8-5.6 4.6-7.8 1.4L47 40l8-16z" fill="#7C4A03" />
      <circle cx="36" cy="36" r="23" fill="#E7C98A" stroke="#7C4A03" strokeWidth="2" />
      <ellipse cx="36" cy="44" rx="12" ry="9" fill="#F6E7C6" />
      <circle cx="27.5" cy="32" r="2.8" fill="#0B1220" /><circle cx="44.5" cy="32" r="2.8" fill="#0B1220" />
      <path d="M31 41.5h10c0 3.2-2.2 5.5-5 5.5s-5-2.3-5-5.5z" fill="#0B1220" />
      <path d="M36 47v3.2M36 50.2c-1.8 2.2-4.4 2.4-6 .6M36 50.2c1.8 2.2 4.4 2.4 6 .6" stroke="#0B1220" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M19 55.5c6.5 4.5 27.5 4.5 34 0" stroke="#0E7490" strokeWidth="4.5" strokeLinecap="round" />
      <circle cx="36" cy="61" r="3" fill="#06B6D4" stroke="#0B1220" strokeWidth="1" />
    </svg>
  );
}
