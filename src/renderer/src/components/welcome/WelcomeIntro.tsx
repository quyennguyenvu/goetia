import type React from 'react';
import Portal from '../Portal';

function ChatIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a8 8 0 0 1-8 8H4l2.5-3A8 8 0 1 1 21 12Z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5Z" />
    </svg>
  );
}

function Tip({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    // 252px × 3 + two 12px gaps = 780px, the width the tile band needs for nine
    // 76px columns — the two are sized together or the alignment drifts
    <div className="w-[252px] rounded-modal border border-border bg-bg-1 px-4 py-3">
      <p className="flex items-center gap-2 font-semibold text-text-1">
        <span className="text-accent">{icon}</span>
        {title}
      </p>
      <p className="mt-1 text-text-2">{body}</p>
    </div>
  );
}

/** First run only. The tips are onboarding: they earn their space once, and
 *  reclaiming it is what gives the steady-state board room to spare. */
export default function WelcomeIntro() {
  return (
    <div
      data-testid="welcome-intro"
      className="flex flex-none flex-col items-center gap-3.5 px-10 pb-1 pt-6"
    >
      <Portal className="h-24 w-24" />
      <div className="text-center">
        <h1 className="text-xl font-semibold text-text-1">Welcome to Goetia</h1>
        <p className="mt-1 text-text-2">All your chats. Nothing else.</p>
      </div>
      {/* The tips yield to the tiles the moment both no longer fit: below this
          height the intro would squeeze the picker under one full row. Picking
          services is the job here; the pitch is what gives way. */}
      <div className="flex flex-wrap justify-center gap-3 [@media(max-height:760px)]:hidden">
        <Tip
          icon={<ChatIcon />}
          title="Chat only"
          body="No feeds, no shops. Reload (⌘/Ctrl R) returns to the chat."
        />
        <Tip
          icon={<LockIcon />}
          title="Stays signed in"
          body="Each service keeps its own session. Sign in once."
        />
        <Tip
          icon={<MoonIcon />}
          title="Quiet & light"
          body="Only messages for you get a count. Idle chats sleep."
        />
      </div>
    </div>
  );
}
