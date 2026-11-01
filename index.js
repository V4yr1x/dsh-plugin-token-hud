/**
 * Host half of the Token HUD bundle.
 *
 * Everything the widget reads is already exposed by the authenticated Client
 * connection: Session projections for `tokenUsage` / `contextPressure`, and the
 * Account Remote namespace for wallet balances. The bundle therefore needs no
 * Host service, route, timer, model call, or credential access of its own.
 */
export function apply() {}
