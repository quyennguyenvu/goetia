import { type RendererToMain, SHELL_ONLY_CHANNELS } from '../../shared/ipc';
import type { ServiceId } from '../../shared/types';

/** True when this sender is allowed to use this channel. Shell-only channels
 *  must come from the shell frame; service channels must come from the frame
 *  of the very service named in the payload. */
export function ipcSenderAllowed(opts: {
  channel: keyof RendererToMain;
  fromShell: boolean;
  senderServiceId: ServiceId | null;
  payloadServiceId: ServiceId | undefined;
}): boolean {
  if (SHELL_ONLY_CHANNELS.has(opts.channel)) return opts.fromShell;
  if (opts.senderServiceId === null) return false;
  return opts.senderServiceId === opts.payloadServiceId;
}
