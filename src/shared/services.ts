import type { ServiceId, ServiceMeta } from './types';

export const SERVICES: ServiceMeta[] = [
  // messenger.com redirects logged-in users into facebook.com — target Messages directly
  {
    id: 'messenger',
    name: 'Messenger',
    url: 'https://www.facebook.com/messages/',
    color: '#0084FF',
  },
  { id: 'telegram', name: 'Telegram', url: 'https://web.telegram.org/k/', color: '#26A5E4' },
  { id: 'zalo', name: 'Zalo', url: 'https://chat.zalo.me/', color: '#0068FF' },
  { id: 'whatsapp', name: 'WhatsApp', url: 'https://web.whatsapp.com/', color: '#25D366' },
  { id: 'discord', name: 'Discord', url: 'https://discord.com/channels/@me', color: '#5865F2' },
];

export function serviceById(id: ServiceId): ServiceMeta {
  const svc = SERVICES.find((s) => s.id === id);
  if (!svc) throw new Error(`unknown service: ${id}`);
  return svc;
}
