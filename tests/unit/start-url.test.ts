import { describe, expect, it } from 'vitest';
import { startUrl } from '../../src/main/lib/start-url';
import { serviceById } from '../../src/shared/services';

describe('startUrl', () => {
  it('slack starts on the email-first onboarding, once', () => {
    const slack = serviceById('slack');
    expect(startUrl(slack, false)).toBe('https://slack.com/get-started');
    expect(startUrl(slack, true)).toBe('https://app.slack.com/client');
  });

  it('services without a firstRunUrl always start on their chat url', () => {
    const discord = serviceById('discord');
    expect(startUrl(discord, false)).toBe(discord.url);
    expect(startUrl(discord, true)).toBe(discord.url);
  });
});
