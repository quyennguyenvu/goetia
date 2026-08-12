import { Reorder } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { ServiceId } from '../../../shared/types';
import {
  buildDisabledPatch,
  byName,
  enabledKey,
  matchesQuery,
  summonDelta,
  summonLabel,
  summonOrder,
  welcomeSections,
} from '../../../shared/welcome';
import { useShell } from '../store';
import Portal from './Portal';
import { useTileReorder } from './useTileReorder';
import PickTile from './welcome/PickTile';
import ServiceBand from './welcome/ServiceBand';
import WelcomeIntro from './welcome/WelcomeIntro';

export default function Welcome() {
  const state = useShell((s) => s.state);
  const key = state ? enabledKey(state.services, state.settings.disabled) : '';
  // the same list welcomeSections produces for `summoned`, derived from the
  // same broadcast state — the hook has to run before the early return, so it
  // cannot read `sections`
  const reorder = useTileReorder(
    state
      ? state.services.filter((svc) => !state.settings.disabled[svc.id]).map((svc) => svc.id)
      : [],
    state ? state.services.map((svc) => svc.id) : [],
  );
  const [selected, setSelected] = useState<ReadonlySet<ServiceId>>(new Set());
  const [query, setQuery] = useState('');
  // read through a ref so the window listener is registered once instead of on
  // every keystroke, and never closes over a stale query
  const queryRef = useRef('');
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  // ⌘/Ctrl+F is the reflex for "find" — Home spends it on the unbound filter.
  // Nothing else on this surface searches, and the shell has no page-find.
  useEffect(() => {
    const onFind = (e: KeyboardEvent) => {
      if (e.key !== 'f' || !(e.metaKey || e.ctrlKey) || e.altKey) return;
      const s = useShell.getState().state;
      if (!s?.homeOpen && !s?.services.every((svc) => s.settings.disabled[svc.id])) return;
      if (s?.settingsOpen || s?.switcherOpen) return;
      const input = searchRef.current;
      if (!input) return;
      e.preventDefault();
      input.focus();
      input.select();
    };
    window.addEventListener('keydown', onFind);
    return () => window.removeEventListener('keydown', onFind);
  }, []);

  // Re-seed every time the screen becomes visible or the live set changes, so
  // a discarded edit never survives to the next visit. A fresh install has an
  // empty enabled set, which reproduces the original empty selection.
  useEffect(() => {
    setSelected(new Set(key ? (key.split(',') as ServiceId[]) : []));
    setQuery('');
  }, [key]);

  // Home is a place, not a modal — but Escape is the reflex. Guarded the way
  // SettingsView guards its own handler: only when nothing is layered on top,
  // and never when there is no service to go back to.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // first rung: an active filter is what Escape clears, before leaving
      if (queryRef.current) {
        setQuery('');
        return;
      }
      const s = useShell.getState().state;
      if (!s?.homeOpen || s.settingsOpen || s.switcherOpen) return;
      if (s.services.every((svc) => s.settings.disabled[svc.id])) return;
      window.goetia.send('home:setOpen', { open: false });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!state) return null;

  const toggle = (id: ServiceId) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const enabled = new Set<ServiceId>(
    state.services.filter((svc) => !state.settings.disabled[svc.id]).map((svc) => svc.id),
  );
  const order = state.services.map((svc) => svc.id);
  const named = byName(state.services);
  const { label, disabled } = summonLabel(summonDelta(order, enabled, selected), enabled.size > 0);

  // sections follow the LIVE enabled set; the tile glow follows `selected`.
  // Keeping the two axes independent is what stops a tile jumping out from
  // under the cursor when it is deselected.
  const byId = new Map(state.services.map((svc) => [svc.id, svc]));
  const sections = welcomeSections(order, enabled, named);
  const pick = (ids: ServiceId[]) =>
    ids.map((id) => byId.get(id)).filter((svc) => svc !== undefined);
  const fresh = sections.summoned.length === 0;

  // one patch, not a reorder followed by an update: settings:update already
  // resolves activation and rebuilds the app menu against `after.order`, so
  // splitting it would broadcast a frame where order and enablement disagree
  const summon = () =>
    window.goetia.send('settings:update', {
      disabled: buildDisabledPatch(order, selected),
      order: summonOrder(order, enabled, selected, named),
    });
  // the same reseed the screen does on every visit, under the user's thumb
  const dispel = () => setSelected(enabled);

  // First run splits its 780px band into nine equal columns (~75.8px each, which
  // still clears "Messenger" at 66px). The steady-state bands are as wide as the
  // board, where nine columns would strand the tiles far apart — they fill with
  // as many 76px tracks as fit instead. Both are left-aligned by construction.
  const tiles = (ids: ServiceId[], nineUp = false) => (
    <div className={`grid gap-2 ${nineUp ? 'grid-cols-9' : 'grid-cols-[repeat(auto-fill,76px)]'}`}>
      {pick(ids).map((svc) => (
        <PickTile
          key={svc.id}
          service={svc}
          on={selected.has(svc.id)}
          onToggle={() => toggle(svc.id)}
        />
      ))}
    </div>
  );

  // the same 76px auto-fill track as `tiles`; axis="xy" because the grid wraps
  // and a tile dragged to another row moves on both axes
  const summonedTiles = (
    <Reorder.Group
      as="div"
      axis="xy"
      {...reorder.groupProps}
      className="grid grid-cols-[repeat(auto-fill,76px)] gap-2"
    >
      {pick(reorder.shown).map((svc) => (
        <Reorder.Item
          key={svc.id}
          value={svc.id}
          as="div"
          className="relative min-w-0"
          // drop-shadow, not boxShadow: this wrapper is a rectangle and the
          // tile inside it is a squircle, so a box-shadow would halo the
          // wrapper's corners. drop-shadow follows the rendered alpha.
          whileDrag={{
            scale: 1.1,
            zIndex: 10,
            filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.45))',
          }}
          {...reorder.itemProps}
        >
          <PickTile
            service={svc}
            on={selected.has(svc.id)}
            grab
            onToggle={() => {
              if (reorder.consumeDrag()) return;
              toggle(svc.id);
            }}
          />
        </Reorder.Item>
      ))}
    </Reorder.Group>
  );
  const emptyLine = (text: string) => <p className="text-xs text-text-2 opacity-70">{text}</p>;

  const visibleUnbound = sections.unbound.filter((id) => {
    const svc = byId.get(id);
    return svc !== undefined && matchesQuery(svc.name, query);
  });

  // rides the label row, so filtering costs no vertical height. No autoFocus:
  // Home is a place, not a modal, and the tiles want the arrow keys.
  const search = (
    <span
      className="flex h-6 w-[168px] items-center gap-1.5 rounded-ctl border border-border bg-bg-2
        px-2 transition-colors duration-120 focus-within:border-accent focus-within:ring-1
        focus-within:ring-accent"
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        aria-hidden="true"
        className="flex-none opacity-80"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-4-4" />
      </svg>
      <input
        ref={searchRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Find a service"
        aria-label="Search unbound services"
        className="w-full min-w-0 bg-transparent normal-case tracking-normal text-text-1
          outline-none placeholder:text-text-2 placeholder:opacity-75"
      />
      {query && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => setQuery('')}
          className="flex-none text-text-2 hover:text-text-1"
        >
          ×
        </button>
      )}
    </span>
  );

  return (
    <div data-testid="welcome" className="flex min-h-0 flex-1 flex-col bg-bg-0">
      {fresh ? (
        <WelcomeIntro />
      ) : (
        <header className="flex h-14 flex-none items-center gap-3 border-b border-border bg-bg-1 px-6">
          <Portal className="h-[26px] w-[26px]" />
          <span className="font-semibold text-text-1">Goetia</span>
          <span className="text-text-2">All your chats. Nothing else.</span>
          <span className="tabular ml-auto text-xs text-text-2">
            {sections.summoned.length} of {state.services.length} summoned
          </span>
        </header>
      )}

      {/* the board: min-h-0 is what lets the bands shrink instead of the page grow */}
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 px-6 py-4">
        {!fresh && (
          // capped so a long summoned list can never crowd Unbound out
          <ServiceBand
            testid="welcome-section-summoned"
            label="Summoned"
            count={sections.summoned.length}
            className="max-h-[46%]"
          >
            {summonedTiles}
          </ServiceBand>
        )}
        <ServiceBand
          testid="welcome-section-unbound"
          label={fresh ? 'Choose your services' : 'Unbound'}
          count={sections.unbound.length}
          aside={sections.unbound.length > 0 ? search : undefined}
          // first run: line the band up with the three tip cards above it
          // (3 × 252px + 2 × gap-3 = 780px, = nine 76px tile columns inside)
          className={fresh ? 'mx-auto w-full max-w-[780px]' : undefined}
        >
          {sections.unbound.length === 0
            ? emptyLine('Every one is bound.')
            : visibleUnbound.length === 0
              ? emptyLine(`No service matches “${query}”.`)
              : tiles(visibleUnbound, fresh)}
        </ServiceBand>
      </div>

      <footer className="flex h-15 flex-none items-center gap-3 border-t border-border bg-bg-1 px-6">
        <span className="text-xs text-text-2">
          Pick at least one — come back here anytime with ⌘/Ctrl 0.
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={dispel}
            className="rounded-ctl border border-border bg-bg-2 px-4 py-2 text-text-1
              transition-colors duration-120 enabled:hover:border-accent disabled:opacity-40"
          >
            Dispel
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={summon}
            className="tabular rounded-ctl bg-linear-to-br from-[#FFB43D] via-[#FF8A2A] to-[#F04E3E]
              px-6 py-2 font-semibold text-[#15181F] shadow-[0_0_12px_rgba(255,158,44,0.35)]
              transition-opacity duration-150 enabled:hover:opacity-90 disabled:opacity-40
              disabled:shadow-none"
          >
            {label}
          </button>
        </div>
      </footer>
    </div>
  );
}
