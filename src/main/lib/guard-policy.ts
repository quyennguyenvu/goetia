/** Whether the three guarded actions need a credential right now. One
 *  condition in one place: the setting alone is not enough, because with no
 *  passcode stored there is nothing to ask for. */
export function actionGuarded(opts: { guardActions: boolean; configured: boolean }): boolean {
  return opts.guardActions && opts.configured;
}
