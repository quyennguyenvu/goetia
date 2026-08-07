import '../portal.css';

/** The ember portal from the loading screen. loading.html carries its
 *  own inline copy (it must paint before any JS arrives) — keep both
 *  in sync. */
export default function Portal({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 96 96" aria-hidden="true">
      <defs>
        <linearGradient
          id="arcA"
          gradientUnits="userSpaceOnUse"
          x1="77.5"
          y1="42.8"
          x2="18.7"
          y2="54.2"
        >
          <stop offset="0" stopColor="#E23D28" />
          <stop offset="1" stopColor="#FF7A1F" />
        </linearGradient>
        <linearGradient
          id="arcB"
          gradientUnits="userSpaceOnUse"
          x1="18.7"
          y1="54.2"
          x2="53.2"
          y2="18.5"
        >
          <stop offset="0" stopColor="#FF7A1F" />
          <stop offset="1" stopColor="#FFD34D" />
        </linearGradient>
        <radialGradient id="coreg" cx="0.5" cy="0.42" r="0.75">
          <stop offset="0" stopColor="#FFF6CE" />
          <stop offset="0.35" stopColor="#FFCE5A" />
          <stop offset="0.7" stopColor="#FF9E2C" />
          <stop offset="1" stopColor="#F0663A" />
        </radialGradient>
        <filter id="soft" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
        <filter id="softer" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="5.5" />
        </filter>
      </defs>
      <g className="ring">
        <g filter="url(#soft)" opacity="0.5" fill="none" strokeLinecap="round">
          <path d="M77.55 42.79 A30 30 0 0 1 18.66 54.24" stroke="url(#arcA)" strokeWidth="12" />
          <path d="M18.66 54.24 A30 30 0 0 1 53.21 18.45" stroke="url(#arcB)" strokeWidth="12" />
        </g>
        <path
          d="M77.55 42.79 A30 30 0 0 1 18.66 54.24"
          fill="none"
          stroke="url(#arcA)"
          strokeWidth="6.5"
          strokeLinecap="round"
        />
        <path
          d="M18.66 54.24 A30 30 0 0 1 53.21 18.45"
          fill="none"
          stroke="url(#arcB)"
          strokeWidth="6.5"
          strokeLinecap="round"
        />
        <circle className="ember ember-1" cx="59.2" cy="20.2" r="3.4" fill="#FFD34D" />
        <circle className="ember ember-2" cx="67.3" cy="25" r="2.5" fill="#FFCB45" opacity="0.8" />
        <circle
          className="ember ember-3"
          cx="73.2"
          cy="31.7"
          r="1.8"
          fill="#FFC13D"
          opacity="0.55"
        />
      </g>
      <g className="core">
        <circle cx="48" cy="48" r="13" fill="#FF8A2A" opacity="0.45" filter="url(#softer)" />
        <circle cx="48" cy="48" r="7" fill="url(#coreg)" />
        <circle cx="48" cy="46.5" r="2.6" fill="#FFFBEA" opacity="0.95" />
      </g>
    </svg>
  );
}
