/** The passkey store's limits. Shared: main enforces them, the renderer and
 *  the prompts quote them. */
export const PASSKEY_CAP = 50;
/** account names and display names are clamped to one row */
export const PASSKEY_TEXT_MAX = 120;
/** the account chooser lists this many, most recently used first */
export const PASSKEY_CHOOSER_MAX = 4;
