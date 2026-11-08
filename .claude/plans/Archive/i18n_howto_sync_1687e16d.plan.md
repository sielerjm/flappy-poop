---
name: i18n howto sync
overview: Sync Chinese How-to / save / feedback strings and TRANSLATION_NOTES to your shortened English edits, keep “Kernels” How-to-only (zh name 玉米粒), leave shop/README/AGENTS on “coins”, and update the failing howto assertions.
todos:
  - id: zh-notes
    content: Update zh-Hans How-to/save strings + TRANSLATION_NOTES rows; commit
    status: pending
  - id: howto-tests
    content: Relax/retarget howto.test.js for Kernels + short mystery; run npm test; commit
    status: pending
  - id: docs-check
    content: Confirm README/AGENTS need no change; final status clean for touched files
    status: pending
isProject: false
---

# Plan: Sync How-to i18n after English edits

- Created: 2026-11-08
- Status: draft
- Baseline commit: `8d38932` on `main` (uncommitted: your `src/i18n.js` edits + unrelated dirty files; **do not touch** those other files)
- Whole-suite verification: `npm test`
- Decisions locked: How-to-only “Kernels”; shop / README / AGENTS keep “coins”; README / AGENTS stay detailed; zh How-to coin name = **玉米粒** (mirrors EN How-to rename while `shopCoins` stays 你的金币)

## Goal

Make `zh-Hans` and `TRANSLATION_NOTES.md` congruent with the new English How-to / save / feedback copy; fix `tests/howto.test.js` so the suite matches the shorter How-to (no longer requiring mystery-box coin odds in that overlay).

## Canonical English (user paste, 2026-11-08)

Treat the user’s pasted `STRINGS.en` as the frozen English source of truth for this task. **Do not rewrite English** during execution; only verify on-disk `en` matches that paste (including already-present `versusTapReady` / `versusReadyWaiting`). Keys that still need zh + notes work are only the shortened How-to / save ones below. Versus ready strings already have matching zh in the paste and rows in `TRANSLATION_NOTES.md` — leave them alone unless notes lag.

English deltas vs the previous long How-to (keep as-is):

- `itemCoinName` / `itemCoinDetail` — Kernels; purse + redeem in shop; tap 💰 between levels
- `itemMysteryDetail` — `Mystery boxes contain a random surprise item.`
- `itemLevelsDetail` — no speed / drifting-pipes clause; “next level”; “win!”
- `saveIntro` — enter username first, then copy/paste code
- `feedbackBody` — ASCII hyphen instead of em dash

## Step 1 — Congruent Chinese + notes table

**Change**

Replace these `zh-Hans` values in [`src/i18n.js`](src/i18n.js) with sense-matched shorts (exact wording may be polish-tweaked only if a native check flags tone; intent is locked):

| Key | New zh |
|---|---|
| `itemCoinName` | `玉米粒` |
| `itemCoinDetail` | `金黄的玉米粒。玉米粒会进入钱袋，可在商店兑换物品。关卡之间点击 💰 打开商店。` |
| `itemMysteryDetail` | `神秘盒子里装有随机惊喜道具。` |
| `itemLevelsDetail` | `肠道分成关卡：胃、十二指肠、空肠……一直到直肠。越过黑白格终点线即可过关；游戏会稍作停顿再进入下一关。通过直肠就赢了！顶部的进度条显示你走到了哪里。` |
| `saveIntro` | `输入用户名以保存它和你的最高分。复制存档码，即可在其他手机或浏览器保留你的名字和最高分。在那里粘贴即可载入。按“保存”可保存用户名。` |
| `feedbackBody` | unchanged (zh em dash is fine) |

Leave unchanged: `shopCoins` / shop rows (still 金币), all other How-to rows, versus keys, README, AGENTS, code identifiers (`coin`, `addCoins`, etc.).

Update [`TRANSLATION_NOTES.md`](TRANSLATION_NOTES.md) EN/ZH cells for those keys (and `feedbackBody` EN hyphen if listed) so they match `i18n.js`. Product-context blurb may keep full coin/mystery mechanics for translators.

**Verification:** on-disk `en` matches the paste for the listed keys; `grep` zh + notes show the new strings; `npm test -- tests/i18n.test.js` passes.

**Commit:** `fix(i18n): shorten How-to zh to match English Kernels/mystery/levels copy`

## Step 2 — Howto tests track shorter overlay

**Change** in [`tests/howto.test.js`](tests/howto.test.js):

- Drop assertion requiring `/5 coins/` in How-to blob (odds live in README, not How-to).
- Assert `Kernels` and short coin/shop phrasing (`purse` / `💰` / shop).
- Assert short mystery line (`random surprise` or equivalent).
- zh name check: `/玉米粒/` instead of `/金币/` for the How-to row (shop zh stays 金币 elsewhere).

**Verification:** `npm test -- tests/howto.test.js tests/i18n.test.js` then full `npm test`.

**Commit:** `test(howto): align How-to assertions with shortened Kernels copy`

## Step 3 — Docs closeout (orientation only where needed)

**Change:** No README / AGENTS rewrites (confirmed). If any orientation line wrongly claims How-to still lists box odds or “Coins” as the How-to row title, fix that one sentence only; otherwise skip.

**Verification:** `npm test` green; `git diff` limited to `src/i18n.js`, `TRANSLATION_NOTES.md`, `tests/howto.test.js` (+ optional one-liner doc fix).

**Commit:** only if a doc line changed; else Step 2 is the final commit.

## Out of scope

- Renaming shop / code / README “coins” → “kernels”
- Dumming down README / AGENTS spawn rules
- Version bump / changelog (copy polish, not a shipped feature note unless you ask)
- Unrelated dirty tree (`.claude/plans/…`, `ToiletFlush_Win.mp3`)
