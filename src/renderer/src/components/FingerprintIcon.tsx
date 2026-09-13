/** Touch ID, drawn rather than spelled. Shared by the lock screen's chooser
 *  and the action confirms, so the gesture reads the same in both. */
export default function FingerprintIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 11.5v3a10 10 0 0 1-.7 3.7" />
      <path d="M8.7 20.3A12.5 12.5 0 0 0 9.5 15v-3.2a2.5 2.5 0 0 1 5 0V15c0 1.2-.1 2.4-.4 3.5" />
      <path d="M6.1 17.8A10 10 0 0 0 6.6 14v-2.2a5.4 5.4 0 0 1 10.8 0V14c0 .7 0 1.4-.1 2.1" />
      <path d="M3.9 13.6v-1.8a8.1 8.1 0 0 1 4-7" />
      <path d="M20.1 12.7v-.9a8.1 8.1 0 0 0-9.8-7.9" />
    </svg>
  );
}
