#!/usr/bin/env bash
# Quest HUD for sessions where mods do not run: the classic statusLine command.
# Reads the status-line JSON on stdin and prints the HP and MP bars on one line:
#   ♥▰▰▰▰▰▰▱▱▱▱ 62% ✦▰▰▰▰▰▰▱▱▱▱ 59%
# HP is what is left of the 7-day window (absent without a subscription), MP
# what is left of the context window (full until the first response fills it).
# HP is green, yellow below 40% and red below 20%; MP is blue. The thresholds are
# hpTone()'s in src/meters.ts, kept here since this file is copied out on its own,
# and the 256-colour codes are the nearest to the mod's own colours.
# With --all, the 5-hour window used and the session's cost follow, as ⚡43% ◉$4.29:
# this file is copied out on its own, so the mod's bars option cannot reach it.
# Setup: /quest-hud:statusline in a session where the mod runs, or the README.

if ! command -v jq >/dev/null 2>&1; then
  echo "quest-hud: needs jq"
  exit 0
fi

all=false
if [ "${1:-}" = "--all" ]; then
  all=true
fi

jq -r --arg esc $'\033' --argjson all "$all" '
  def clamp: if . < 0 then 0 elif . > 100 then 100 else . end;
  def left: (100 - .) | clamp | round;
  def bar: (. / 10 | round) as $full
    | ([range(0; $full)] | map("▰") | join("")) + ([range($full; 10)] | map("▱") | join(""));

  def paint($code): "\($esc)[38;5;\($code)m\(.)\($esc)[0m";
  def hpcode: if . < 20 then 203 elif . < 40 then 221 else 78 end;
  def money: (. * 100 | round) as $cents
    | "\($cents / 100 | floor).\($cents % 100 | if . < 10 then "0\(.)" else "\(.)" end)";

  [ (.rate_limits.seven_day.used_percentage // null
      | if . == null then empty else left | hpcode as $code | "♥\(bar) \(.)%" | paint($code) end),
    (.context_window.used_percentage // 0
      | left | "✦\(bar) \(.)%" | paint(69)),
    (if $all then (.rate_limits.five_hour.used_percentage // null
      | if . == null then empty else "⚡\(round)%" | paint(215) end) else empty end),
    (if $all then (.cost.total_cost_usd // null
      | if . == null or . < 0 then empty else "◉$\(money)" | paint(221) end) else empty end)
  ] | join(" ")
' 2>/dev/null || true
