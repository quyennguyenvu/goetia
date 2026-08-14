const R = 44;
const CIRCUMFERENCE = 2 * Math.PI * R;

interface Props {
  /** the staged result — selected.size, not the live enabled count */
  staged: number;
  cap: number;
  dirty: boolean;
}

/** The cap made visible: an ember ring that fills as picks approach the cap.
 *  Previews the staged result, not the live one. Purely presentational. */
export default function SummonGauge({ staged, cap, dirty }: Props) {
  const frac = Math.min(1, staged / cap);
  const full = staged >= cap;
  const caption = full ? 'full' : dirty ? 'after summon' : 'summoned';
  return (
    <div data-testid="summon-gauge" className="relative h-[100px] w-[100px]">
      <svg width="100" height="100" viewBox="0 0 104 104" className="-rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id="gauge-arc" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFB43D" />
            <stop offset="1" stopColor="#F04E3E" />
          </linearGradient>
        </defs>
        <circle cx="52" cy="52" r={R} fill="none" stroke="var(--border)" strokeWidth="9" />
        <circle
          cx="52"
          cy="52"
          r={R}
          fill="none"
          stroke="url(#gauge-arc)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - frac)}
          className="transition-[stroke-dashoffset] duration-300 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tabular text-[19px] font-bold leading-none text-text-1">
          {staged}
          <span className="text-xs font-normal text-text-2"> / {cap}</span>
        </span>
        <span
          className={`text-[9px] uppercase tracking-wide ${full ? 'font-bold text-accent' : 'text-text-2'}`}
        >
          {caption}
        </span>
      </div>
    </div>
  );
}
