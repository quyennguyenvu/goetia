import {
  LOCKED_ALLOWED_CHANNELS,
  type RendererInvoke,
  type RendererToMain,
  SHELL_ONLY_CHANNELS,
} from '../../shared/ipc';
import type { ServiceId } from '../../shared/types';

/** True when this sender is allowed to use this channel. Shell-only channels
 *  must come from the shell frame; service channels must come from the frame
 *  of the very service named in the payload. */
export function ipcSenderAllowed(opts: {
  channel: keyof RendererToMain | keyof RendererInvoke;
  fromShell: boolean;
  senderServiceId: ServiceId | null;
  payloadServiceId: ServiceId | undefined;
}): boolean {
  if (SHELL_ONLY_CHANNELS.has(opts.channel)) return opts.fromShell;
  if (opts.senderServiceId === null) return false;
  return opts.senderServiceId === opts.payloadServiceId;
}

/** True when this channel may still be served while the app is locked.
 *  Structural rather than a check repeated per handler: a channel added later
 *  is refused by default, which is the direction a mistake should fall. */
export function channelAllowedWhileLocked(
  channel: keyof RendererToMain | keyof RendererInvoke,
): boolean {
  return !SHELL_ONLY_CHANNELS.has(channel) || LOCKED_ALLOWED_CHANNELS.has(channel);
}
