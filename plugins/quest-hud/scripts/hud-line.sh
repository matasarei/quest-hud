#!/usr/bin/env bash
# Quest HUD for sessions where mods do not run: the classic statusLine command.
# Reads the status-line JSON on stdin and prints the HP and MP bars on one line:
#   ♥▰▰▰▰▰▰▱▱▱▱ 62% ✦▰▰▰▰▰▰▱▱▱▱ 59%
# HP is what is left of the 7-day window (absent without a subscription), MP
# what is left of the context window (— until the first response).
# Setup: /hud statusline in a session where the mod runs, or the README.

if ! command -v jq >/dev/null 2>&1; then
  echo "quest-hud: needs jq"
  exit 0
fi

jq -r '
  def clamp: if . < 0 then 0 elif . > 100 then 100 else . end;
  def left: (100 - .) | clamp | round;
  def bar: (. / 10 | round) as $full
    | ([range(0; $full)] | map("▰") | join("")) + ([range($full; 10)] | map("▱") | join(""));

  [ (.rate_limits.seven_day.used_percentage // null
      | if . == null then empty else left | "♥\(bar) \(.)%" end),
    (.context_window.used_percentage // null
      | if . == null then "✦ —" else left | "✦\(bar) \(.)%" end)
  ] | join(" ")
' 2>/dev/null || true
