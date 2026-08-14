import { MAX_SUMMONED } from '../../../../shared/welcome';
import Portal from '../Portal';
import SummonGauge from './SummonGauge';

interface Props {
  staged: number;
  label: string;
  disabled: boolean;
  dirty: boolean;
  atCap: boolean;
  onSummon(): void;
  onDiscard(): void;
}

/** The welcome hero, made permanent furniture: portal, wordmark, the cap
 *  gauge, and the actions — always in the same place at any board state. */
export default function HomeHero({
  staged,
  label,
  disabled,
  dirty,
  atCap,
  onSummon,
  onDiscard,
}: Props) {
  return (
    <aside
      data-testid="home-hero"
      className="relative flex w-[246px] flex-none flex-col items-center gap-2.5 overflow-hidden
        border-r border-border bg-bg-1 px-4 pb-3 pt-6"
    >
      {/* ember wash behind the whole column */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0
          bg-[radial-gradient(60%_40%_at_50%_8%,rgba(232,89,12,.15),transparent_70%)]"
      />
      <div className="relative">
        <div
          aria-hidden="true"
          className="hero-glow absolute -inset-3 rounded-full
            bg-[radial-gradient(circle,rgba(255,138,42,.30),transparent_68%)]"
        />
        <Portal className="relative h-14 w-14" />
      </div>
      <div className="relative text-center">
        <h1 className="text-lg font-semibold text-text-1">Goetia</h1>
        <p className="text-text-2">All your chats. Nothing else.</p>
      </div>
      <SummonGauge staged={staged} cap={MAX_SUMMONED} dirty={dirty} />
      <div className="relative flex w-full flex-col gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={onSummon}
          className="tabular w-full rounded-ctl bg-linear-to-br from-[#FFB43D] via-[#FF8A2A]
            to-[#F04E3E] px-4 py-2.5 font-semibold text-[#15181F]
            shadow-[0_0_12px_rgba(255,158,44,0.35)] transition-opacity duration-150
            enabled:hover:opacity-90 disabled:opacity-40 disabled:shadow-none"
        >
          {label}
        </button>
        {dirty && (
          <button
            type="button"
            onClick={onDiscard}
            className="w-full rounded-ctl border border-border bg-bg-2 px-4 py-2 text-text-1
              transition-colors duration-120 hover:border-accent"
          >
            Discard
          </button>
        )}
      </div>
      <p className="relative mt-auto pt-2 text-center text-[10px] leading-relaxed text-text-2">
        {atCap ? (
          <>
            Every seat taken — banish one
            <br />
            to make room for another
          </>
        ) : (
          <>
            Chat only · no feeds, no shops
            <br />
            Signs in once · idle chats sleep
          </>
        )}
        <br />
        ⌘/Ctrl 0 returns you here
      </p>
    </aside>
  );
}
