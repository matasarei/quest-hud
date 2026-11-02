#!/usr/bin/env bash
# Every /quest-hud: command is a skill file the mod answers. Each must exist, say
# what it does in the / menu, and stay out of the model's list: without
# disable-model-invocation its description would reach the context in every
# session, and "nothing added to the context" would no longer be true.
set -u
here="$(cd "$(dirname "$0")" && pwd)"
skills="$here/../skills"
failed=0

fail() {
  echo "FAIL $1"
  failed=1
}

# The frontmatter's lines: what lies between the first two --- lines.
frontmatter() {
  awk 'NR == 1 && $0 == "---" { inside = 1; next } inside && $0 == "---" { exit } inside { print }' "$1"
}

for name in status pane statusline help; do
  [ -f "$skills/$name/SKILL.md" ] || fail "$name: no skills/$name/SKILL.md"
done

for file in "$skills"/*/SKILL.md; do
  name="$(basename "$(dirname "$file")")"
  front="$(frontmatter "$file")"
  grep -qx "name: $name" <<< "$front" || fail "$name: its name is not $name"
  grep -q '^description: .' <<< "$front" || fail "$name: no description"
  grep -qx 'disable-model-invocation: true' <<< "$front" || fail "$name: the model can invoke it"
  [ "$failed" -eq 0 ] && echo "ok   $name"
done

exit "$failed"
