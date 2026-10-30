# Белое Безмолвие — project rules (DirtyG)

The game "Белое Безмолвие" is built with the DirtyG pipeline. The agent leads the user step by step
from idea to release; the user decides taste and direction and plays often.

The project is self-contained: the rules live in this file, the module API contract in
`CONTRACT.md` (read it before writing any file), and the defect/verification log in
`RESCUE.md` (what was broken, how it was fixed, how it was checked).

## Start of every session
1. Read `CONTRACT.md` (file rules, tick priorities, prohibitions) and the latest section
   of `RESCUE.md` (recent defects, verification method, known limitations).
2. What is recorded on disk (CONTRACT.md, RESCUE.md, git history) is already decided: do not
   ask again and do not rebuild it. Trust the disk more than context memory.

If you are a subagent with a task from the lead — work on the task and return the contract
from your role. Do not rewrite the shared docs (this file, CONTRACT.md): propose the change
to the lead instead.

## Game first
- Effort and tokens go into the game itself: gameplay, feel, assets, levels, sound, story.
- Tests — only where a bug silently breaks the game: economy and damage formulas, saves,
  determinism, a bug that came back a second time. No UI tests, no coverage for coverage's sake.
- Documents — short one-line decision records. No README essays and no code docs.
- The main check is a CAPTURE frame you looked at yourself, and the user's playtest.
- Several steps in a row went into tests, docs or tools — return to the game.
- This is a game, not a tech demo: a goal, menu, progression, sound, story, win and loss. At
  a playtest the first question is "is it fun?".

## Questions to the user
- Ask only for decisions (taste, scale, direction, money, accounts, publishing) and
  only via `AskUserQuestion`: 1–4 questions, 2–4 options, the recommended one first
  marked "(Recommended)", "you decide" is always available.
- Find out facts (files, installed software, APIs, documentation) yourself.
- Record the decision as a one-line note in the commit that implements it (what and why).
- "Always do it this way" / "I don't like X" — record it the same way: a one-line decision
  note in the commit; it stays part of this game's rules. A rule about how to work with the
  user in any game goes into this file, never into this game's taste.

## Git
- Commit at every step (a decision, closed gates, a locked mechanic). The lead reviews the
  diff and commits; subagents never commit, push or stash.
- Never push or publish unless the user asked for it.
- Subagents that change files work in a git worktree (`isolation: "worktree"`).
  The lead reviews the diff, merges one at a time and checks the game after each merge.
  `.claude/worktrees/` must be in .gitignore.
- Live Blender (blender-mcp) and the engine editor via MCP — main session only.
  Subagents work headless.

## Commands and code
- Verified commands (RUN/TEST/BUILD/CAPTURE) live in `scripts/`; take them from there,
  don't make them up. A command changed — update this list:
  - RUN: `node scripts/serve.mjs 3000` — the user sees the game at http://localhost:3000.
  - TEST: `node scripts/bootcheck.mjs http://localhost:3000` (boot validation),
    `node scripts/probe2.mjs http://localhost:3000 qa` (E2E smoke).
  - BUILD: `python3 scripts/build.py` — rebuild `index.html` after adding files.
  - CAPTURE: `node scripts/shots.mjs`, `node scripts/shots_responsive.mjs` (frames in
    `download/`), responsive audit: `node scripts/resp_check.mjs`.
- The code standard is `CONTRACT.md` (ES5 IIFE + `WS.def`, tick priorities, no CDN):
  tuning parameters in data files, simple architecture with nothing "for the future".
- Studio roles live in `.claude/agents/`: game-designer, art-director, tech-artist,
  gameplay-programmer, level-designer, sound-designer, narrative-designer, qa-tester.

## Do not touch
- Never rewrite the shared rule docs (this file, CONTRACT.md) to fit a local change —
  propose the edit to the lead; accepted edits show up in git history.
- The fix log in `RESCUE.md` is append-only: new sections, no rewriting of old ones.
