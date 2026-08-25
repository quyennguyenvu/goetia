import { Reorder } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { ServiceId } from '../../../shared/types';
import {
  buildDisabledPatch,
  byName,
  capBlocked,
  commitOrder,
  enabledKey,
  followLiveOrder,
  MAX_SUMMONED,
  matchesQuery,
  summonDelta,
  summonLabel,
  welcomeSections,
} from '../../../shared/welcome';
import { useShell } from '../store';
import HomeHero from './welcome/HomeHero';
import PickTile from './welcome/PickTile';
import ServiceBand from './welcome/ServiceBand';

const DRAG_CURSOR = 'tile-dragging';

export default function Welcome() {
  const state = useShell((s) => s.state);
  const key = state ? enabledKey(state.services, state.settings.disabled) : '';
  // The board IS the edit: `staged` is the Summoned section, content and
  // order both. Nothing reaches main until the confirm commits the whole
  // edit — adds, removals and the new order — in one patch.
  const [staged, setStaged] = useState<ServiceId[]>([]);
  const [query, setQuery] = useState('');
  // read through a ref so the window listener is registered once instead of on
  // every keystroke, and never closes over a stale query
  const queryRef = useRef('');
  const searchRef = useRef<HTMLInputElement>(null);
  // a pointer drag does not suppress the trailing click the way HTML5 DnD
  // did; unswallowed, it would banish the tile that was just dragged
  const didDrag = useRef(false);
  useEffect(() => {
    queryRef.current = query;
  }, [query]);
  useEffect(() => () => document.body.classList.remove(DRAG_CURSOR), []);

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

  // Re-seed every time the screen becomes visible or the live membership
  // changes, so a discarded edit never survives to the next visit — but only
  // on membership: reseeding on order too would clobber a staged reorder the
  // moment anything else broadcasts. A fresh install reseeds to empty.
  // biome-ignore lint/correctness/useExhaustiveDependencies: key (membership) is the trigger; the order is read fresh from the store on purpose
  useEffect(() => {
    const s = useShell.getState().state;
    setStaged(
      s ? s.services.filter((svc) => !s.settings.disabled[svc.id]).map((svc) => svc.id) : [],
    );
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

  // Hoisted above the early return: the coordination effects need these on
  // every render, and hooks may not sit behind a conditional return.
  const liveSummoned = state
    ? state.services.filter((svc) => !state.settings.disabled[svc.id]).map((svc) => svc.id)
    : [];
  const liveKey = liveSummoned.join(',');
  // covers adds and removals too (the joins differ), so it doubles as `dirty`
  const orderChanged = staged.join(',') !== liveKey;

  // The rail reads this at drag end: a drop over a dirty board must ask first.
  useEffect(() => {
    useShell.getState().setHomeDirty(orderChanged);
  }, [orderChanged]);
  useEffect(() => () => useShell.getState().setHomeDirty(false), []);

  // The rail prompt's "Discard changes & reorder": the same reseed the
  // Discard button does, triggered from outside this component.
  const discardTick = useShell((s) => s.homeDiscardTick);
  const seenDiscard = useRef(discardTick);
  useEffect(() => {
    if (discardTick === seenDiscard.current) return;
    seenDiscard.current = discardTick;
    const s = useShell.getState().state;
    if (!s) return;
    setStaged(s.services.filter((svc) => !s.settings.disabled[svc.id]).map((svc) => svc.id));
  }, [discardTick]);

  // A rail drop while the board is clean lands here: follow the new live
  // order silently so the board mirrors the drag and no confirm lights up.
  // A dirty board is never clobbered — the rail prompt cleans it first.
  const prevLive = useRef(liveKey);
  // biome-ignore lint/correctness/useExhaustiveDependencies: liveKey is the trigger; liveSummoned is the array it was joined from
  useEffect(() => {
    const prev = prevLive.current;
    if (prev === liveKey) return;
    prevLive.current = liveKey;
    setStaged((cur) => followLiveOrder(cur, prev, liveSummoned));
  }, [liveKey]);

  if (!state) return null;

  const stagedSet = new Set(staged);
  const enabled = new Set<ServiceId>(liveSummoned);
  const order = state.services.map((svc) => svc.id);
  const named = byName(state.services);
  const delta = summonDelta(order, enabled, stagedSet);
  const { label, disabled } = summonLabel(delta, enabled.size > 0, orderChanged);
  const atCap = staged.length >= MAX_SUMMONED;

  const byId = new Map(state.services.map((svc) => [svc.id, svc]));
  const sections = welcomeSections(staged, named);
  const pick = (ids: ServiceId[]) =>
    ids.map((id) => byId.get(id)).filter((svc) => svc !== undefined);

  // one patch: adds, removals and the new order land together, so activation
  // and the app menu resolve against a single consistent frame
  const summon = () =>
    window.goetia.send('settings:update', {
      disabled: buildDisabledPatch(order, stagedSet),
      order: commitOrder(order, staged),
    });
  // the same reseed the screen does on every visit, under the user's thumb
  const discard = () => setStaged(liveSummoned);
  // PurgeConfirm owns the gate and the invoke; Home only poses the question.
  const askPurgeAll = () =>
    useShell.getState().setPurgeConfirm({ kind: 'all', count: state.services.length });

  const summonOne = (id: ServiceId) => setStaged([...staged, id]);
  const banishOne = (id: ServiceId) => setStaged(staged.filter((s) => s !== id));

  // No tile animation at all in Unbound: any transform inside the scroll
  // container — a cross-section fly, or even `layout` closing the gap a
  // moved tile left — momentarily extends the scrollable area and blinks
  // the scrollbar (2026-08-15, user decision). Moves land instantly; the
  // scrollbar appears only on genuine overflow.
  const unboundTiles = (ids: ServiceId[]) => (
    <div className="grid grid-cols-[repeat(auto-fill,76px)] gap-2">
      {pick(ids).map((svc) => (
        <PickTile
          key={svc.id}
          service={svc}
          on={false}
          capped={capBlocked(stagedSet, svc.id)}
          onToggle={() => summonOne(svc.id)}
        />
      ))}
    </div>
  );

  // single row by construction: the window's minWidth fits nine 76px tiles,
  // so the drag is x-only and the glow never hides behind a scrollbar
  const summonedTiles = (
    <Reorder.Group as="div" axis="x" values={staged} onReorder={setStaged} className="flex gap-2">
      {pick(sections.summoned).map((svc) => (
        <Reorder.Item
          key={svc.id}
          value={svc.id}
          as="div"
          className="relative w-[76px] flex-none"
          // drop-shadow, not boxShadow: this wrapper is a rectangle and the
          // tile inside it is a squircle, so a box-shadow would halo the
          // wrapper's corners. drop-shadow follows the rendered alpha.
          whileDrag={{
            scale: 1.1,
            zIndex: 10,
            filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.45))',
          }}
          onPointerDown={() => {
            didDrag.current = false;
          }}
          onDragStart={() => {
            didDrag.current = true;
            document.body.classList.add(DRAG_CURSOR);
          }}
          onDragEnd={() => {
            document.body.classList.remove(DRAG_CURSOR);
          }}
        >
          <PickTile
            service={svc}
            on
            onToggle={() => {
              if (didDrag.current) {
                didDrag.current = false;
                return;
              }
              banishOne(svc.id);
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
    <div data-testid="welcome" className="flex min-h-0 flex-1 bg-bg-0">
      <HomeHero
        staged={staged.length}
        label={label}
        disabled={disabled}
        dirty={orderChanged}
        atCap={atCap}
        onSummon={summon}
        onDiscard={discard}
        onPurgeAll={askPurgeAll}
      />

      {/* the board: min-h-0 is what lets the bands shrink instead of the page grow */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3.5 px-6 py-4">
        <ServiceBand
          testid="welcome-section-summoned"
          label="Summoned"
          count={sections.summoned.length}
          scroll={false}
        >
          {sections.summoned.length === 0
            ? emptyLine('Nothing summoned yet — pick from below.')
            : summonedTiles}
        </ServiceBand>
        <ServiceBand
          testid="welcome-section-unbound"
          label="Unbound"
          count={sections.unbound.length}
          aside={sections.unbound.length > 0 ? search : undefined}
          className="flex-1"
        >
          {sections.unbound.length === 0 ? (
            emptyLine('Every one is bound.')
          ) : visibleUnbound.length === 0 ? (
            emptyLine(`No service matches “${query}”.`)
          ) : (
            <div className="flex flex-col gap-2">
              {unboundTiles(visibleUnbound)}
              {atCap &&
                emptyLine(
                  `At ${MAX_SUMMONED} of ${MAX_SUMMONED} — unpick a summoned tile to make room.`,
                )}
            </div>
          )}
        </ServiceBand>
      </div>
    </div>
  );
}
