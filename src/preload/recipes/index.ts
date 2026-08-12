import type { ServiceId } from '../../shared/types';
import discord from './discord';
import instagram from './instagram';
import messenger from './messenger';
import shopee from './shopee';
import slack from './slack';
import telegram from './telegram';
import tiktok from './tiktok';
import type { Recipe } from './types';
import whatsapp from './whatsapp';
import zalo from './zalo';

export const recipes: Record<ServiceId, Recipe> = {
  whatsapp,
  messenger,
  instagram,
  telegram,
  discord,
  zalo,
  tiktok,
  shopee,
  slack,
};
