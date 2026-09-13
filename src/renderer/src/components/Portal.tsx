import '../portal.css';

const VIEW = '0 0 96 96';

/** The ember portal from the loading screen. loading.html carries its
 *  own inline copy (it must paint before any JS arrives) — keep both
 *  in sync. Each moving part is its own layer (see portal.css); the
 *  embers carry no opacity of their own because the drift keyframes own
 *  it, as they always did. */
export default function Portal({ className }: { className: string }) {
  return (
    <div className={`portal ${className}`} aria-hidden="true">
      <div className="portal-layer ring">
        <svg viewBox={VIEW} aria-hidden="true">
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
            <filter id="soft" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="3.2" />
            </filter>
          </defs>
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
        </svg>
        <div className="portal-layer ember ember-1">
          <svg viewBox={VIEW} aria-hidden="true">
            <circle cx="59.2" cy="20.2" r="3.4" fill="#FFD34D" />
          </svg>
        </div>
        <div className="portal-layer ember ember-2">
          <svg viewBox={VIEW} aria-hidden="true">
            <circle cx="67.3" cy="25" r="2.5" fill="#FFCB45" />
          </svg>
        </div>
        <div className="portal-layer ember ember-3">
          <svg viewBox={VIEW} aria-hidden="true">
            <circle cx="73.2" cy="31.7" r="1.8" fill="#FFC13D" />
          </svg>
        </div>
      </div>
      <div className="portal-layer core">
        <svg viewBox={VIEW} aria-hidden="true">
          <defs>
            <radialGradient id="coreg" cx="0.5" cy="0.42" r="0.75">
              <stop offset="0" stopColor="#FFF6CE" />
              <stop offset="0.35" stopColor="#FFCE5A" />
              <stop offset="0.7" stopColor="#FF9E2C" />
              <stop offset="1" stopColor="#F0663A" />
            </radialGradient>
            <filter id="softer" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="5.5" />
            </filter>
          </defs>
          <circle cx="48" cy="48" r="13" fill="#FF8A2A" opacity="0.45" filter="url(#softer)" />
          <circle cx="48" cy="48" r="7" fill="url(#coreg)" />
          <circle cx="48" cy="46.5" r="2.6" fill="#FFFBEA" opacity="0.95" />
        </svg>
      </div>
    </div>
  );
}
