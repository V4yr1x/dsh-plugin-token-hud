# Changelog

## 0.3.3

- Replaced the DSH whale mark with an original token-pulse icon drawn for this plugin.
- The inline icon is a clean 24×24 line mark; the plugin-manager icon is a matching blue/purple SVG tile.
- Removed all DeepSeek brand artwork and the separate brand-asset notice.

## 0.3.2

- Replaced the inline token glyph with the DeepSeek Harness whale mark, theme-colored through an alpha mask.
- Replaced the plugin-manager icon with the DSH application icon.
- Added a separate brand-asset notice: the whale mark is not covered by the MIT license.

## 0.3.1

- Moved details back into the sidebar footer flow instead of an absolute overlay, so the session list is no longer covered.
- Limited the expanded panel height and made it scroll internally; the sidebar list keeps its own scrolling area.
- Added an explicit close button in the details header.
- Replaced the per-digit `em` cell width with tabular `ch` width, removed the extra tracking, and reduced number weight/size for a cleaner native font appearance.

## 0.3.0

- Every key number now renders as an odometer: digits roll vertically when they change.
- Value changes flash amber when decreasing and blue when increasing.
- Details open as a floating panel anchored to the compact footer card, constrained to the sidebar width, so the workspace/chat column is not covered or resized.
- Closing the details panel by clicking outside or pressing Escape; opening/closing uses a short pop-in animation.
- Added digit/popover assertions to the smoke and live tests.

## 0.2.0

- Token total updates while the model streams, driven by `assistant/live-chunk`.
- Live output uses a CJK-aware character estimate until the provider `usage` chunk arrives, then switches to that request's exact buckets.
- A pulsing blue live indicator and `~` prefix distinguish live values from settled session totals.
- Balance refresh interval lowered to 60 seconds and re-read after each completed turn.
- Added `tests/live.mjs` for stream, usage, and settlement transitions.
- English translations for live states.

## 0.1.0

- Initial bottom-left sidebar HUD.
- Current-session `tokenUsage` and `contextPressure` display.
- DeepSeek account recharge balance, bonus balance, and locally observed daily spend.
- Expandable details, manual balance refresh, and persisted expanded state.
