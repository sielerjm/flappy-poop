# AGENTS.md — project context for humans and AI agents

Read this first. It says what Flappy Poop is, where things live, which rules the
code depends on, and how to check your work. `README.md` is the player/maintainer
guide; this file is the map for anyone changing the code.

## What this is

Flappy Poop is a Flappy Bird clone for phone browsers: a poop emoji flaps through
the gut dodging pink intestinal-fold pipes. One point per pipe pair passed; fiber
is +3 (it sits between pipe pairs like a bean), bad bacteria is −3 (floor 0; never before level 2, pair 5), and a probiotic blocks one bacteria hit for
5 pipes (pickups stack; a hit clears the stack). Fiber eaten while a probiotic is up makes a
**postbiotic** (`effects.applyFiber`): pipes and fiber score × `items.postbioticMultiplier` (2) until
the probiotic countdown ends, fart pipes included; another probiotic extends it, a hit ends it. A
**mystery box** (`TUNING.mystery`, spinning spritesheet) opens into one reward: probiotic 20 %, one bean 20 %,
a 5-pipe postbiotic 5 % (×2 already on), three beans 5 %, 5 coins 10 %, 10 coins 5 %, 15 coins 1 %, else
fiber (34 %, `rollMystery`; no box holds the 🏁 skip since plan 28, 4.6, its 1 % went to fiber); a draw that cannot
do anything (bean with a full bag) becomes fiber (`resolveMystery`). Test mode keeps the 🏁 (Settings' power-up
row, `grantTest('skip')`; greyed in a level break): it scores every pair left in the level at the current multiplier (countdown
paused, like a fart), clears what is ahead and brings the finish line in from the right edge. The first
box is guaranteed after one of level 3's first four pairs (`scriptedMysteryPair`, so before pipe 5); on every
later pair boxes roll at half fiber's weight (`mysteryRolls`). On level 3 they hold still midway between two
gaps; from level 4 they bob at half fiber's speed (`mysteryMoves`). **Coins** (`coin.png`, a golden corn
kernel: 12 spin frames of 106 px drawn at `coin.displayPx` 53 with a `coin.radius` hitbox, spinning in the
field at `coin.frameMs` 100 ('coin-spin'), frame 0 wherever it is shown still) are not in the item roll:
from level 2 an extra coin fills a band slot nothing else took (`course.coin(n)` at `coin.chance`, its own
stream in both modes), and every level carries **one guaranteed kernel**
(`Play.armKernel` from `course.kernelPair(level)`: level 1's waits `coin.firstAfterPipePx` past its last pair
at that pair's gap, still; from level 2 it takes its pair's band slot, or the next pair's without a box or
bean, or past the last pipe; `clearFieldAhead` re-arms it when a respawn clears it untaken). A coin or a
box's coin draw goes into the purse (`effects.addCoins`, `Coin_Pickup.mp3`), shown in the top-left
inventory over the beans (`inventoryRows`, `TUNING.hudInventory`: the rows shown stack from the top; in an online race they start at `TUNING.online.inventoryY0`, below the opponent's pill). Coins
last **one run**: `start()` empties the purse, nothing is saved, a single-player death empties it and clears
every power-up (`effects.clearPowerups`), and a two-player crash keeps `crashCoins` (90 %, rounded down) and
clears the power-ups. Pickups with no motion data pulse (`pulseStill` / `pulseScale`, `stillPulseScale`,
`items.stillPulse`), their circle body re-fitted each frame so the hitbox holds. The **shop** (`TUNING.shop`): in a level break a
pill under the banner (`shopButtonLayout`: y 800 in a one-player break, under the poop at mid-height, plan 28 5.1; a
match half's, `{ match }`, at y 720, with the 🏅 Bracket pill a row under it; it reads "Shop" beside the corn kernel with no number since
plan 26's A2 (`shopPill`; the HUD shows the purse), `createButton`'s `icon`, and these notes and the
code's comments still call it the 💰 pill; dimmed at 0 coins; the break's hint never names it) opens a
panel of rows (`shopLayout`, `SHOP_ITEMS`) in the chrome column: fiber 1, one bean 6,
a super bean 16 (fills the bag to `superBeans`), a mystery box 5 (the plain draw table, `pairsLeft` 0 so a
skip becomes fiber). `buyBlocker` / `canBuy` grey a row the purse or the bag refuses; `Play.buyItem` spends
and applies it, and the reward animates in the paused break. A box bought from the panel (`shopBuy` passes
`reel`) spins the **slot machine** first (`spinReel` / `finishReel`, `TUNING.shop.reel`, `reelStrip` /
`reelProgress` / `REEL_FACES` / `mysteryFace`): the draw is resolved and paid at once, a window over the rows
scrolls the strip right to left on a cubic ease-out (`sfx.tick` per face, `sfx.reelStop` and a pop on landing),
holds `pauseMs`, then `openMystery(draw, …, { reveal: false })`; `shopBuy` refuses while it spins and
`closeShop` (so the level start too) finishes it early with the rising reveal. A postbiotic doubles a kernel
picked up (`collectItem` pays `effects.multiplier()`), never a box's coins or a level's. In a test run
(`testCoins`, single player) the purse is endless (`purseCoins` → Infinity, `countText` reads ∞,
`buyItem` spends nothing) and `setTestMode(false)` empties it. ✕, a tap outside the panel, Esc / P / B and
the power input (B key, RT, a versus power key) close it (`chromeIntent` `closeShop`, arming the resume
lockout); closing never continues the level. The game-over panel shows `collected.coin` beside the pipes
(the share card does not). Level 1 is
scripted (probiotic at pair 3, fiber after 4 and 7, a bean after 9) and its fiber and bean hold still midway
between the two gaps; from level 2 they bob and a bean rolls per pair
(15 % per pair to pipe 20 with one guaranteed by guaranteeScore, 6 % after);
beans stack to maxBeans (3); one charges a fart power (stink lines + glow; tap the poop
or the bean button) that plays `fart_accelerate.mp3`, ramps the scroll speed up and
down so five pipes pass in `beans.normalPowerMs` (2.5 s; the clip fades out over `normalFadeMs` and is
cut, `fartDuration` / `fartVolumeFrac`), or superPipes = 20 over the whole clip with superBeans = 3 held,
under a rainbow glow, floats the poop on a ±15° undulating wave, and cannot die; items pass
through it and the probiotic countdown pauses. A normal fart spends one bean (the rest stay in the bag, up to maxBeans); a super fart spends all three. Hit a pipe, the ceiling, or the floor and the run ends (dead-poop
face). Best score and settings are kept in `localStorage`. The run is cut into
**levels** by pipe pairs passed (`pipesPassed`, fart pipes included; score never):
level n is `levels.pipes[n − 1]` (10, 25, then 50 each); ends at 10, 35, 85, 135,
185, 235, 285. Level 7 (rectum, `levels.lastLevel`) is the last: crossing its finish
line wins the run (`win()`, Over headline "YOU MADE IT OUT!", score saved at level 7).
Pipe spacing is `pipeSpacing(level)`: `pipeSpacingPx` (412) from
`levels.spacingRefLevel` (3) on, scaled by the speed ratio on the slower levels
before it (487 px on level 1, 446 on level 2); speed is
`levelSpeed()` (275 + 25 per level, capped at `levels.maxSpeed` 325 = level 3's speed, so
levels 3+ share one cruise and later difficulty is content), applied when the break ends; the gap
is `levelGap()` (`gapHeight` × `levels.gapScale[level − 1]`: 1.1, 1.05, then 1). **Moving pipes:** from
`pipeMove.fromLevel` (4) a share of the pairs (`pipeMove.chance` and `ampPx` per level) bob their gap
centre on a sine whose average vertical speed rises linearly (`speedPx` 20 px/s on L4, + `speedStepPx`
20 per level; `pipeMoveParams` derives each row's period: 6 / 4 / 4 / 4 s), resting `pipeMove.holdMs`
(300) at each end: `gapBobY`'s `holdMs` freezes the sine's time at its peaks, added to the cycle, so the
swing's speed (and `pipeMoveShiftPx`) is unchanged. A moving pair wears a
lighter pink (`pipe-moving`, painted once by `createLightTexture` in `ui/pipeShade.js` at
`pipeMove.lightenFrac`): `rollPipeMove` at spawn (after the item and bean
draws; never for the centred pair after a fart; amplitude clamped into `gapBounds`), `gapBobY` in
`update()` moving both columns, a probiotic / bacteria in that pair riding the gap centre (`bob: 'pair'`).
`pipeMoveShiftPx` is the gap's shift during one column crossing; `tests/tuning.test.js` keeps every
row under three quarters of the poop's clearance (and every period ≥ 4 s) so the motion alone can
never clip a centred poop. One spacing after a level's last pair a checkered finish
line (generated texture, plain Image) scrolls in and no pair follows it outside a
fart; crossing it (any level but the last) bumps `level`, plays `NewLevel.mp3` (`sfx.levelUp` blip if the
sample is missing), and pauses the run as the
level break (`levelBreak`, the normal `'paused'` state with its own banner "LEVEL n
· segment / Tap to continue", the poop gliding to mid-height in every break: `levels.breakPoopY` in a normal
one-player run (plan 28, 5.1: Michael, 16 Nov; the banner sits higher, at `eduBreakLayout`'s `titleY`, as an education
run's, and the 💰 pill under the poop at y 800; a match half's stays at y 720), `levels.eduBreakPoopY` in an education run (plan 28, 1.1), and
`GAME_HEIGHT / 2` in a match half (its banner at 40% of the height, as before), and bobbing; the bean
button hides while it lasts, and the purse, the beans and the 📚 / 🧪 badge draw above the pause
shade at full brightness (`breakHud`); the
background crossfading to `levelColor(n, LEVEL_COLORS)`, Set2 colours cycling). A fart never carries the poop past
the line: crossing it cancels the power (`effects.cancelPower()`, `endPower()`),
so only the pairs actually passed have scored, and the break starts at once. A progress bar (`ui/levelBar.js`) fills one
step per pair. Each top score remembers its level. A signed
**user code** (`fp1.<payload>.<sig>`, the save code) carries a player's username
and best 6 scores between browsers via copy/paste (the save panel, opened by the
ready screen's user button); spec in `docs/save-code-spec.md`. The code's
random `id` is also the leaderboard identity. **One player across devices** (2026-11-08):
a username belongs to the player holding it on the board (`submit_score` raises
'name taken'; the panel asks `name_available` first through `Play.checkNameAvailable`
and refuses the name with the Sign in steps; the board cannot say → saved locally,
`saveNameOffline`; a refused sync sets `Play.boardNameTaken`, shown by the panel and
the 🏆 footer). **Sign in, Sign out, Merge players…** (plan 44, 0.29.0; the save panel's words, replacing Load and Clear).
Signed out, the panel shows only **Sign in** and **Create user**, each with its own screen and ‹ Back. Sign in
pastes a code: a preview card from the code alone (no server call), a line for a guest's progress, then one
tap. A guest's progress joins the code's player: the code's state wins, `queueMerge(code id, guest id)`
(`createMergeStore`, drained first by `syncLeaderboard`). The board folds the rows and keeps the guest id as
an alias (`player_aliases`), so every id resolves to one player. Create user saves the username and shows the
code popup (`save-explain`) before the dashboard. Signed in, **Sign out** opens an inline confirm (the code
with its own Copy, then Clear's notes: cards, 📚 sharing, pilot, 🌐) and then `Play.signOut`, which forgets
what Clear forgot and leaves online play as Clear did (`unlink_online_player`, only on a device that holds
a session). **Merge players…** pastes a second code and shows both cards; a tap picks the one whose name
stays, this device's by default. This device kept: `merge_players(device id, code id)`, the id and name of
the device with the scores unioned, `noteRename(device name)` so the next post carries the name even when the
kept id has no board row yet, and `Play.forgetBoardCache` so the folded player's bests, totals and days are
pulled on this page. The code kept: exactly the old Load (`merge(before, pasted)`, `forgetRename`,
`queueMerge(code id, device id)`). This player's own code in Merge says "That's already you." and writes
nothing. **Online play follows seniority, not the pick:** `fold_player` gives the online name and trust to
the player whose trusted device went online first. With this device kept, the id does not change, so the
session stays (no `onlineLeave`) and the next 🌐 open reads the trust, which the fold may have set to
pending (pair again). When the code's player is senior, the kept player's devices become pending and the
friends swap to the senior side. The client sees only this device's session, so the Merge confirm's
🌐 line (`saveMergeOnline`) shows only while this device holds an online session. The schema comments in
`db/schema.sql` (about 107 and 1379-1381) still say the pasted code is kept; they stay as they are, since an
edit means a restamp. **The board's name wins** (2026-11-09): `syncLeaderboard` asks
`player_name` (`Play.fetchPlayerName`) and adopts it (`nameAction`, `Play.adoptBoardName`,
`showAdoptedName` in an open panel) unless the name is a rename typed on this device
(`createRenameStore`, flappyPoop.rename, set by the panel's store, cleared once a post
carries it, by Sign in and by Sign out); the first `Play.create` of a page load syncs. **Scores flow down
too** (2026-11-11): after the name step `syncLeaderboard` runs `Play.pullBoardBests`, which reads the
player's two board rows (`Play.fetchBoardBests` → `fetchRank` off / on the toilet, aliases resolved) once
per page and id (Sign in, Sign out and a Merge keeping this device ask again: `Play.forgetBoardCache`) and folds them into `save.top` (`mergeBoardBests`), so a
code or device that never played them catches up (the home button, the code and, via `showBoardScores`,
the Sign in's welcome line follow); a pulled row that is now the device's best of its kind is filed in
`submitStore`, so it is not posted back. **Sign out** forgets the player on the device only (the confirm
replaced Clear's two taps; `saveClearConfirmMs` now serves only the tournament's Abandon and the level break's Quit).
**Test mode** is a session-only sandbox: typing either of `TEST_MODE.words` (`pooptest` or `testpoop`, any
case) as the username and pressing Save toggles it (a trigger word is never stored as a name, so it can
never relabel the player's leaderboard row). Settings then grows a test section:
start level for the next run (`testRunStart`: the pairs before it passed, a par score), Invincible (on by
default; pipes, ceiling and floor cannot kill), power-up buttons (`grantTest` → `openMystery`) and Exit.
A test run (`runIsTest`, latched for the whole run) records nothing: no legacy best, top list or
leaderboard sync, and Over says so. A 🧪 badge shows while it is on.

It is a side project by Michael Sieler (gut-microbiome researcher), hence the
theme. The logical field is 1280 px tall and as wide as the window's aspect asks,
from a phone portrait (720, `GAME_WIDTH`) to 2:1 (`FIELD`, `fieldWidth()`), so a
desktop window fills sideways; the world (background, pipes, items, dimmers) spans
the whole width, the chrome (tray, level bar, HUD, ready buttons) keeps its phone
layout in a centred 720 px column (`uiColumn()`), and the poop sits at
`poopXFrac` (25 %) of the width (`poopX()`). The width is fitted on every Play
(re)start (`applyFieldSize`); a window resize or a phone rotation re-fits at once on
the ready screen and otherwise after Home (`onFieldResize` → `update()`), never
mid-run: a running run auto-pauses at that moment. While an online race runs, a resize
goes to `OnlineRace.onFieldResize` instead, which re-fits the canvas around the same field with no
pause (a guest turning to landscape keeps its field by design; commit 11321ac). Android home-screen installs are
portrait-locked by the manifest (iOS ignores that), by choice. A run start,
the end of a level break and the end of a fart pre-fill the field (`prefillPipes`,
`prefillPairs`): the first pair `pipeLead` ahead (the phone's `pipeLeadPx`, 668 px, plus
`prefill.leadGrowth` of the width beyond a phone's, so on a wide field the first pipes
settle a little past the middle: a buffer before the poop reaches them), then one per
spacing to the edge (a phone keeps its one edge spawn); a skip's finish line gets the
same lead. On a wide field
the pre-filled stretch does not pop in: it sweeps in from the right edge over
`prefill.sweepMs` (`sweepOffset`: quadratic ease-out, fastest off the edge and braking
to the level's scroll speed by about the field's middle, fading from transparent),
settling exactly where the pre-fill put it.
**Two players** (`src/versus.js`, `scenes/Versus.js`): a 👥 toggle under the toilet toggle, offered
on phones too (plan 39 D2; never in test mode, never inside a match), turns the start tap into a tournament (every
two-player session is one: the **Tournament** paragraph below; its races are the matches here). The toggle
shows through `Play.versusOffered()` (outside a match, not test mode; no longer gated on `splitFits`);
`launch()` with 👥 starts Versus where `Play.splitFits()` (= `versusAvailable`: landscape, at least
`versus.minViewportH` css px tall), else opens the 🌐 window over Play (`Play.openVersusWindow`, no
Versus behind it, 🌐 locked on). Over a running Versus the local lobby gets a 🌐 row, off. A match half reaches its host only through `Play.versusHost()`, which looks up
`matchHostKey(match)` (`match.hostKey`, else `'Versus'`); `createMatch` stores no key, so every split-screen
match and tournament race is Versus's. Each split-screen half shows its player's name on a pink-edged pill at the
bottom of the half, above the tray, for the whole match (`Play.nameLabel` on `Play.nameBox`, shrunk to clear P1's
pause button; only when the match has no `hostKey`, as the online race names its opponent in its own HUD). The Versus
scene sets the canvas to two half-window fields (`versusLayout`, capped at `FIELD.maxWidth / 2` each),
launches `Play` as P1 on the left strip and `PlayB` (a second Play instance) as P2 on the right (each
`Play.init` gets `{ player, match, fieldW, fieldX }` and a camera viewport), and sits above both. The
join screen claims a slot per device (`claimDevice`: a tap takes its own half, a keyboard group
(`versus.keys`: W / Space + E / Left Shift, ↑ / Enter + Right Shift / Numpad 0) or a pad the first free
slot), then counts 3-2-1-GO: the halves slide their poops into place under the "3" (`Play.launch({ hold
})`) and **GO starts the race** in that frame (`Versus.go` → `Play.startRace`) with a toilet flush
(`Versus.flush`, `ToiletFlush_Win.mp3`); GO stays up one beat. A player's flap within
`versus.startBoost.windowMs` of GO (`armStartBoost` / `tryStartBoost`, only from the chrome 'flap' action,
never the launch's own flap) scrolls that half `distancePx` (two poops) further over `durationMs`
(`boostPeakMul` on `fartMul`'s surge) with the fart face; a fart, a respawn or the run's end cancel it. Both halves run one **shared course**
(`createCourse(seed, this.tune, { shared: true })`: every draw per pair and purpose, the pair number standing
in for the score gates, beans spawning into a full bag), while each player's mystery **draws** come
from their own stream (`rngDraw`) on the **catch-up** table (`catchUpTier` / `catchUpDraws`: 10–24
pipes behind doubles the bean draws, 25+ forces bean3 = a super fart ready). Each half publishes its
slot every frame (`publishSlot`: score, pipes, level, distance, y, angle, frame, alpha; the distance is
the half's place on the course: the scroll, re-anchored at the end of every re-fill and after a skip by
`rebaseDistance` on `courseDistance`, since a fart, a respawn, a skip or a re-fill's fixed lead would
otherwise drift it from the pipes) and shows the other as a faded **ghost** in its lumen at the
distance gap (`ghostPlacement`) and as a
**marker** on its level bar (`rivalMarker`). A crash never ends a match run: it is a **respawn**
(`startRespawn` / `tickRespawn` / `endRespawn` on `respawnPose`, state `'respawn'`): the half's world
halts, the score loses `versus.scoring.deathPenaltyPerLevel` × level (floored at 0, the −N popup), the
slot counts the crash, the poop tumbles, everything not yet credited is cleared, it glides back to
mid-screen, blinks, and plays on with the next pair at mid-height. The **first** over each finish line
(the rectum's too) earns `versus.scoring.levelClearBonus` and its popup; the second gets neither. Every finish line also pays `levelClearCoins` (the level's number, + 3
without a crash in it in a match only: `Play.crashesThisLevel`; single player gets the number alone). One
claimer decides both: `Versus.claimLevelFinish(half)` (from `Play.onFinishCrossed`) is true for the first
half over the current level's line (`levelFirst`, cleared by `beginLevel`), which also wins the level:
`slot.levelWins`, 🏁 on the result panel. Levels start together through a **ready check**: each
half's taps (once its own arrival beat's timer has fired, `Versus.onLevelReached(half)` → `levelBeats`;
never `time.now` against the arrival stamp, since Phaser's smoothed delta lets a timer run ahead of the
raw clock after a frame hitch) toggle that
player's ready (`Versus.onLevelTap(half)`, `readyHalves`; hints "Tap when ready" / "Ready! Waiting for
P2…" with "Tap again to un-ready" under it, the 💰 hidden while ready); both ready runs the match-start
3-2-1-GO (`startLevelCount` → `runCountdown`, holding while an overlay is open), a tap during it un-readies
that player and cancels it (`cancelLevelCount`, a token), and GO's `beginLevel` ends both breaks in the same
frame (the flush and the start boost again). The break's tap prompt, single player's too, breathes under a
white glow copy (`Play.syncLevelHint` each frame on `hintPulse`, `TUNING.hintPulse`); `levelSubHint` is the
smaller line under it: a match's un-ready line, or in one player the education gate's line after a refused
tap (`levelGateTap`, plan 26 A2; `refreshLevelBanner` sets its text, `syncLevelHint` its visibility; it
wraps). A tap while the
shared pause is on only lifts it. Each half shops in its own break (the panel is Play's, in its strip;
the other half plays on); a shopper is never ready, so the count cannot start under an open shop. The pause key / ⏸ / Menu toggle the
**shared pause** (`Versus.setPaused`, remembering which halves it paused so a break is never ended by
the other player; a respawning half's clock stops with it). Chrome decisions in a match read
`chromeState()` (the match's state, not the half's), so a finished or respawning half still pauses and
resumes the match. The match ends once **both** have cleared the rectum (the first one out waits under
"Made it out!" / "Waiting for P2…", `showEscapedBanner`; once the match is over the second finisher's half drops the waiting line, and `Versus.onRunEnded` redraws both halves, so both read only "Made it out!"; plan 35, 4.3, tests/versusEnd.test.js); the result panel names the higher score
(`raceOutcome`, below) on a `versus.resultPanelW` (820 px) panel with each player's 🏁 level wins and 💀
count, and offers Continue | Bracket (the Tournament paragraph). A race adds nothing to a best, the
save-code score or the career, but it posts (plan 39, 2.5): a two-player tournament to 🏅 (the Tournament
paragraph) and every split-screen race its linked racers' scores to 🏆 (`racePosts`, below). `Versus.rematch()` (same devices, new seed) has no button any more:
the smoke restarts a match through it.

**Tournament** (🏅, `src/tournament.js`, `src/tournamentNames.js`, `ui/tournamentPanel.js`; 2026-11-09,
Release A; one mode with two players since 0.13.0, 2026-11-10): **every two-player session is a
tournament** of `TUNING.tournament.minPlayers`–`maxPlayers` (2–8). The 👥 start brings Versus a plain match,
which is the **lobby** (`match.status` `'lobby'`: the join screen hidden, `openTournament()` the next
tick, no claims); the panel is plain DOM over Versus, and the race's join screen keeps only **Bracket**
(`joinButtonsLayout`: one box at the right half's edge, P1's tray owning the left half). **Lobby**: the
count (− / +, new rows rolled as Guests, so Start is one tap) and a row per player: a pasted user code
(`claimFromCode`: `importCode` with a storage that keeps nothing and an empty local player, so the host's
save is never read or written; one row per player id), a **Guest** (`rollGuestName`: AdjectiveNoun###,
≤ 16 code points, clean words) or **Use my player** (`claimHost`, once, needs a username); a player with a username opens the lobby already
as row 1 (`tournamentPanel.js` makes it as that button does), else two Guests; the card's **?**
opens the help card (`view: 'help'`, Got it back to the lobby; with 🌐 on it reads `onlineHowTitle` / `onlineHowBody`, how to invite and join first, then a line on tournaments, else `tournamentHowTitle` / `tournamentHowBody`; the online home shows **?** too, a room screen does not, since the help view holds the poll's re-render), its ✕ / Esc / the pad's B leaves for
single player (a paste field closes first). The lobby rows outlive the panel (module state), so the next
👥 session starts with the last players. **Start** draws a seeded World Cup bracket (`createTournament`
→ `buildBracket(players, order)`: 2, 4 or 8 slots, byes at most one per first-round pair on a fixed
pattern, settled at once; queue order round one, semis, bronze, Final; 3 players race a semi and the
Final, the semi loser third; 2 players race the Final alone, no bronze, `placings().bronze` null) into the
game registry (`'tournament'`: `{ tour, matchId }`), so it survives the Versus restarts between races.
**Seeding** (`tour.order`: the players filling the non-bye first-round slots in order; `seedSlots` lays
them out with null byes): while `canReseed` (no race recorded) the bracket view is the seeding view, a
card per first-round pair, every player with a ⠿ handle and ↑ / ↓; `reseed(tour, from, to)` swaps two
seeds and rebuilds (pure; the bye pattern holds, so the server's bracket check still passes), a drag
(pointer events followed on the window, `setPointerCapture` in a try, the row under the pointer marked
`.drop`) swaps the dragged seed with the one it lands on, 🎲 is `reshuffle`. After the first race the
view is the match list with the next match. **Play** restarts Versus (`restartWith`) on
`createMatch(seed, { levelPipes: tournament.levelPipes, names, tournament: { round, matchId } })`: the
halves run on the shorter table (`Play.tune` = `withLevelPipes(T, match.levelPipes)`, 10 / 25 / 35 / 35 /
35 / 35 / 50 = 225 pairs, two players too; every level-length helper in Play takes `this.tune`, never bare
`T`, guarded by `tests/scenes.test.js`), the join title is the round, `versusName` puts the competitors'
names where "P1 / P2" go, and Bracket there opens the bracket (nothing recorded: the race has not run).
**Mid-race**: once both halves wait at the same line with no count and no shop (`Versus.bothInBreak`),
each half shows a **🏅 Bracket** pill one row under its 💰 (`bracketButtonLayout`; `Play.bracketButtonShown`
/ `refreshBracketButton`, refreshed with the 💰 and by Versus on each arrival and the count; on P1's ring
after the 💰: while P1's ring shows, a pad's A presses the ringed button instead of going to the half as a
flap or ready tap, `Play.onPadAction`'s `ringPress`); its tap opens the panel's **peek** view
(`Versus.openPeek` → `view: 'peek'`: the match list without a "next" line, since that is the race being run;
Back to the race, ✕) and is never a ready tap; `Versus.overlayOpen` counts the panel, so a count holds
under it. The result panel decides by `raceOutcome` (score, fewer crashes, more 🏁, then
`slot.finalFirst`, set by `claimLevelFinish` on the final level; never a draw once both finish), shows
how, and offers **Continue** | **Bracket**: both `Versus.continueTournament(then)` (once per race,
`handedOff`, and only from the shown panel past `retryLockoutMs`: Esc / B / A in the `deathToOverMs`
beat before it do nothing) emit `'tournament-race'` on `game.events` with `{ then, outcome, slots }` (the
outcome fixed in `onRunEnded`, reset in `create()`: the scene object outlives restarts); the panel's
`onRace` records it with `recordResult` only while `matchId` is set (a second press records nothing),
then `then` `'next'` starts the next race at once (`startRace(game)`: the panel is closed, so it takes the
game, not `ctx`) and anything else, or the Final, opens the bracket or the **podium** (`placings`: 🥇 🥈,
🥉 from 3 players; New tournament with the same players, Home). Before 0.13.0 only Continue recorded:
Bracket on the result panel left the race open and Play raced it again. **Abandon** (two taps) clears the
registry and restarts Versus on a plain match, i.e. the lobby, with the same players; nothing is saved.
**Controller**: while the panel is open `padIntent` (`tournamentPanelOpen`) sends nav, A and B to it
(`{ do: 'panel', action }` → `tournamentPadAction`; Y still mutes, the run buttons wait), ahead of a
match's own A / RT routing: the d-pad moves a gold ring (`button.pad`) over the visible, enabled buttons
by `focusNearest` on their rects (else `focusStep`), the first press lands it on the view's primary
button (`data-primary`: Start, Play, Back, Home, Got it), A clicks it, B is Esc; a pointer press hides it;
after ↑ / ↓ it follows the moved player; Start moves it to Play. A paste field needs a keyboard (Guest and
Use my player cover a pad-only setup). The card takes focus when nothing inside has it (`holdFocus`), so
Esc reaches the panel after a mouse open. With every session a tournament, `versusTitle` ("2 PLAYERS"),
`versusDraw` and the `versusPlayer` fallback are reachable only in principle (a race always has a round,
names and a `finalFirst` half); they stay as safe fallbacks. **The 🏅 medal board** (Release B, 2026-11-09): "Use my player"
gives the host's player its id (`hostSave` → `ensureId`). When `onRace` records the Final, a tournament
of `tournament.minPostPlayers` (2 since plan 39, 2.5; submit_tournament's floor) or more with any linked player (`postable`)
is queued once (`queueFinished`: `tournamentPayload(tour, newId())` with the host device's id into
`Play.tournamentQueue`, registry `posted` / `tournamentId`) and synced; an all-guest one is `posted: 'none'`.
**Two players** (plan 39, 2.4b, 2.5): `submit_tournament` accepts 2 players, who race a lone final, gold and
silver (a draw earns none); the client's `minPostPlayers` is 2, so they post like any other tournament
(`posted: 'two'` and `tournamentSaveTwo` are gone). **Race scores to 🏆** (2.5, Michael's call 8): every
split-screen race queues each linked racer's score with that racer's half's run summary behind it (2.8: `racePosts(tour, matchId, slots, runs)` in
src/tournament.js gives each entry its `run`; `Versus.continueTournament` hands `runs` beside the slots; `Play.queueRacePosts` queues the run first under the racer's id, `queueRaceRun`, then the post naming it by `runId`; tests/raceRun.test.js; see Run summaries below; `tournamentPanel.queueRacePosts` from `onRace`; `createRacePostQueue` in
src/leaderboard.js over `LEADERBOARD.racePostsKey` 'flappyPoop.racePosts'; `Play.racePostQueue` is
drained in `syncLeaderboard` right after the tournament queue through `Play.postRace` (2.7, AUD-106): under
the board's current name for that player, read just before the post (`fetchBoardName` in src/leaderboard.js:
the name, '' for no rows, null when the board cannot say, and then the post waits); the entry's name, or this
device's for its own player, only for a player with no rows. `submitScore`'s reason 'refused' (the server's
"bad …") and 'nameTaken' drop the entry; offline or rate limited keep it. tests/racePostName.test.js). The versus result panel names it in `versusBoardLine`.
**Online reports** (2.5): at `checkOver` both devices send the race to `finish_match`
(`raceReport` in src/onlineRace.js: seat order host, guest, whole numbers, telemetry =
`raceNetStats(net.stats(), netBase)` + `pause.stats()` under finish_match's 13 keys (2.7, AUD-110: each
transport counter less its value at the round's start, kept through a re-fit or rewind restart, taken again
in a rematch's round; the RTT keys as measured, an unmeasured key left out); `createRaceReporter`: one call
at a time, asks again every `TUNING.online.report.pollMs` while the answer is 'playing', `polls` times, then
every `slowPollMs`, until `waitMs` (the other device's whole resend window, tied by a test, AUD-109), then 'late'; a lost answer is
resent after each `retryMs`; 'no match' once; no 'pending' phase (3.8: the server no longer raises 'not trusted', 3.7, so a waiting device races by code and its races are saved and counted on the boards; an old 'not trusted' answer fails like any refusal; friends, 🏁 Recent races, 📱 Devices, history and status stay for paired devices); `reportLine` maps the state to the
results panel's line). `OnlineRace.startReport` / `refreshResult` drive it; a race left mid-way
(abandoned) is never reported. The 🌐 window's **🏁 Recent races** (beside 📱 Devices; paired devices only,
not on the Profile) comes from `onlineAccount.races()` (`online_history`, `historyRows`; the
`onlineAccountViews` 'races' view; "yesterday" for one day ago). 'online closed' is `onlineClosed` in the
lobby's `ERROR_KEYS`. tests/onlineReport.test.js, tests/racePosts.test.js.
**A counted online race** (`finish_match`, see the online schema) adds 🏅 gold / silver / event / best and
a 🏆 post at the last level through `board_post` (`submit_score`'s post, now shared), backed by a
server-made `run_log` row of mode `race`; no tournament receipt and no matchup, so online pairings stay
off the public rival line. The podium's line (`#tour-saved`,
`savedText`) follows the queue's outcome. Guests travel as `{ id: null, name: null }`.
`Play.syncLeaderboard` drains the queue after the merges and before the no-username return. Every queue
(runs, Daily, career, 📚 board, pilot answers, tournaments, split-screen race scores) also goes again when the browser fires `online`
and when the page is shown after a hide of `LEADERBOARD.resyncHiddenMs` (30 s) or longer, not only at boot
and game over (plan 35, 1.4): `createResync` (`src/logic.js`) lets one `syncLeaderboard` run at a time,
a trigger during a send joins it, and it never rejects. `Play.resyncOnline` and `resyncVisibility` wire it
(`this.resync ??=`, one guard per scene object so a restart keeps a send in flight; the `online`
listener leaves with the scene); a half of a match neither times a hide nor sends. The server
(`submit_tournament`) re-checks the bracket round by round, derives the medals, keeps a receipt per
tournament id (a resend is 'duplicate') and paces one per host per 60 s; stats feed `tournament_board`,
the 🏅 tab of the Leaderboard overlay; races between two linked players become `tournament_matchups`
rows for the owner's head-to-head analysis (no role can read them; a profile shows only each
player's biggest rival, by name, through `player_stats`).

**Daily Dump** (🌞, 2026-11-10, plan `.claude/plans/Archive/2026-11-10-daily-dump.md`): once per UTC
day every player flies the same endless course. The ready screen's 🌞 (`readyLayout.daily`, top
centre on the ?'s row; it breathes under a halo until today is played, `Play.refreshDailyPrompt`)
opens the `Daily` overlay, whose one button follows the player: Create user (the save panel opens
over it; `Play.setSaveState` redraws it), Play (`Play.startDaily`), See today's result
(`Play.showDailyResult`), or Practice in test mode (a test run: never claimed or posted). One play
per player, not per device: before offering Play (and once per page load and day for the glow),
`Play.checkDailyOnServer` reads the caller's own row off `daily_board`; a score posted from another
device becomes this device's final attempt ("Checking…" meanwhile; offline it falls back to Play,
and the server still keeps only the first post). A daily
run (`runIsDaily`, latched in `start()` like `runIsTest`) builds `createCourse(dailySeed(day),
tune, { shared: true })` at `dailyLevel(day)` (3–7, `TUNING.daily`) with `dailyRunStart` (that
level's pairs, score 0) and never leaves the level: no finish line (the spawn branch and the
pre-fill stop), a box's skip and coin draws open as fiber (`dailyDraw`), no kernel or rolled coin,
`takeCoins` refuses, "🌞 LV n" (`dailyHud`) in place of the level bar. A box's reward comes from
its pair's own stream (`course.reward(pair)`), so it is the same for everyone. The attempt is
claimed at the start (`claimDailyAttempt`, split out of `start`; `dailyStore`, `flappyPoop.daily`) and
rewritten from `update()` as the score moves; `endRun` makes it final and queues it (`dailyQueue`,
`flappyPoop.dailyQueue`) without touching the 🏆 list or best; `syncLeaderboard` finalises an
*unfinished* record left by a reload (never the run in flight) and `drainDaily` posts under the current
name. A run that crosses no pipe is no attempt (plan 48, calls D and G): `endRun` releases the record
before its sync (`dailyStore.release(day, playerId)`: only that player's unfinished record for the day
with 0 pipes), posts no 🌞 score and counts no career; `finishAbandonedDaily` releases an unfinished
0-pipe record (a reload before the first pipe) instead of finalizing, posting and stubbing it, and never
finalizes one. `dailyStore.spent(day, playerId)` (final, or pipes above 0) backs `dailyPlayedToday` and
"See today's result". Over shows the daily result: date headline, the score as a link to the board's 🌞 tab, the rank read off
`daily_board` once the post settles, the countdown to 00:00 UTC, Share (the card, and the link as its message).
A Daily Dump that crossed no pipe (plan 48, call H, option a) instead offers Play again, which starts
today's Daily Dump again (Over sets the registry flag `playAgain` to 'daily'; `Play.startAgain(kind)`
starts it only while the popup would offer it: a username and the day not used), leaves the rank cell
blank (no board lookup) and shows `dailyNotCounted` in the countdown's place.
The server (`submit_daily_score`) takes today or yesterday (UTC), checks the day's level with its
own FNV-1a (`daily_level` = the client's `dailyLevel`), keeps the first post per player and day
('duplicate' after), and follows the score board's name claim.

**Player profiles and achievements** (👤, 2026-11-11, v0.14.0, plan `.claude/plans/Archive/08-user-stats.plan.md`):
every player has a **public** profile (`scenes/Stats.js`, chromeIntent `'stats'`), opened by the save
panel's 👤 Profile (own; disabled until a username is stored) or a name on any board
(`Leaderboard.linkName` → `Play.openStats({ name })`). A player with no username gets a **gate**
instead (`buildGate`: Create user opens the save panel; `Stats.refresh`, from `Play.setSaveState`,
turns it into the profile once a name is saved, and back on Sign out).
**Counting:** `Play.endRun`'s single-player and Daily branches call `recordCareer`: `runDeltas`
(`src/achievements.js`) turns the run into counters (games / wins / sumScore / sumLevel / maxLevel
for single player, dailyGames for a Daily Dump, deaths / pipes / falls / closeCalls / farts / superFarts / the pickups
for both, pipes being the pairs flown that day in a Daily Dump;
`runFarts` / `runSuperFarts` from `activatePower`; `runFalls` once per drop past `fallLookVy` (`fallStarted`) and `runCloseCalls` when the near-miss clock starts in `tickScared`, both outside a fart, its grace and Invincible; `runCeilingHits` (☀️, set before `die()` when the poop ended on the ceiling) and `runBoxesBought` (🎰, `buyItem('mystery')`). Run facts for v0.16.0 badges: `closeCallsByLevel` → `closeShave` (💈, `levelCloseShave` on `levelPipes`), the same-draw streak in `openMystery` → `fourOfAKind` (🃏, `nextDrawStreak`), and from `careerStore.markRun` this device's `daysSinceLastRun` (🧱) and `winsLast7Days` (🏃). that wait in the career store (`createCareerStore`,
`flappyPoop.career`); test runs and match halves return before it. **No pipe, no count** (plan 48, call A:
pipes, not score; a Daily Dump's pipes are the pairs flown that day): `countsAsRun` (`src/achievements.js`)
is false for a single-player or Daily run that crossed no pipe, and `Play.recordCareer` then returns before
`markRun`, `addRun`, the Singleplayer streak and the badges; `Play.endRun` sets `runNotCounted` and, for single
player, skips the best, the top list and the career. `runDeltas` is unchanged. Over shows `runNotCounted`
under the cells (tests/zeroRun.test.js). **Badges:** `evaluate` judges the
`ACHIEVEMENTS` catalog (run feats from a normal single-player run only; lifetime milestones on the
totals; time-boxed quests by UTC day) and `careerStore.unlock` records them with a claim; Over names
the run's (`runBadges`, "🏆 New: …"). `creditCareer` quietly credits the score and level badges the
saved top list already reaches (at boot and after `pullBoardBests`) and lifetime badges on the
totals. **Sync:** `drainCareer`, in `syncLeaderboard`'s named path after `drainDaily`, sends one batch
(`submit_counters`: the batch id is the receipt, so a lost reply resends the same batch; the answer is
the player's totals across every device, kept as `base` for that id), then the claims
(`claim_achievements`). `postCounters` / `claimBadges` / `fetchProfile` are Play methods so the smoke
stubs them. Sign out empties the store; a Sign in forgets only `base`. **Server:** `player_counters` (one
jsonb of counters, `merge_counters`: sum, or the larger value for `max*` keys), `achievement_defs`
(windows of time-boxed quests only), `player_achievements`; `player_stats(id or board name)` is the
profile (no ids): single-player numbers (bestScore = the best score-board row), daily podiums ranked as `daily_board` ranks, medals, the
biggest rival (self-races ignored), counters, achievements. The game claims, the server checks the
id format and a quest's window (+2 days' grace): accepted risk ACC-001 like scores.

**Run summaries** (plan 30): every single-player and Daily run (never a test run or an education run) keeps a summary, as numbers, in `src/runStats.js` (`createRunStats`: preallocated, no
allocation per frame, flap or press). Play feeds it through `statCall` (the first error switches it
off for the rest of the run): `start` (begin), `update` (frame), `doFlap` (each flap, with what stood
behind it: the module-private press stamp set by the input listeners through `withInput`, read with
`pressFacts`: a real browser event marked isTrusted, recent, once per press; the launch and GO flaps
pass `internal`), the listeners (press, release), pipes, falls, close calls, the death, levels and a
level picked at a break (skip), the break, the shop, pauses. `endRun` queues the row
(`queueRunSummary` → `createRunQueue`, `flappyPoop.runQueue`, 50, never dropping the run behind a best
not yet posted); `finishAbandonedDaily` queues a short stub row (`stubRow`) for a record with a pipe crossed, none for a 0-pipe one (plan 48: a run that is not counted still sends its summary, call E, and the sync still runs). **Sync:** `drainRuns` runs
before `drainDaily` in both of `syncLeaderboard`'s paths (`submitRuns`, up to 20 per player id); a 🏆
or 🌞 post whose run is still queued after a paced send waits (`postWaits`, `waitsForRun`, at most
`runWaitSyncs` syncs). The row's fields are `RUN_DATA_KEYS`, equal to `run_data_keys()` in
`db/schema.sql` (tests/runStats.test.js). **Server:** `run_log` (owner-only, 90 days), `submit_runs`
(void; a row it cannot store is counted in `run_rejects`), and the moderation calls below. **Mode
`race`** (plan 39, 2.4b) joins `single` and `daily`: a device may send one, and the server writes one
per racer of a counted online race (`online_count_race`, from the agreed numbers; it replaces a row a
device wrote first under that run id). `post_must_hold`, `post_run`, `hold_run` and `release_run`
treat `race` like `single`; `streak_days` still counts `single` only.
**Race halves** (plan 39, 2.8): a split-screen race's half keeps a summary of mode `race` (`Play.runSummaryMode`; off the toilet), never an online race's half, a test run, an education run or a guest's half. `Play.endRun` closes it at the finish line (`endRunSummary`) onto its slot's `run`; `Play.queueRacePosts` queues each linked racer's run under that racer's id (`queueRaceRun`, kept in the run queue while its post waits: `runBehindUnposted`) and then the post naming it (`runId`, kept by `normalizeRacePost`). `syncLeaderboard` runs `drainRuns` once before the race post drain while any race post waits (`submit_runs` takes one batch per player per 5 s, so never twice); `postRace` waits for its run like a 🏆 post (`postWaits` 'r:<id>', up to `runWaitSyncs`). Each press counts in the half it belongs to: `onPointerDown` / `onPointerUp` (`localPointer`, the pointer's `downX`), `onFlapKey` / `onFlapKeyUp` (single player only), `versusInput` (a key group's flap key, a pad's A or RT), `onVersusKeyUp`, `onPadPress`.

**Loading splash** (2026-11-12, v0.15.0, plan `.claude/plans/Archive/01-loading-screen.plan.md`): the page's front
door on every load, phone and desktop. `index.html`'s `#splash` (cream, the bobbing `poop.png` inside a
brown ring's track) paints at once; an inline `import('./src/splash.js')` placed **before** the Phaser
tag starts `startSplash` while Phaser is still downloading, so the note cards show during that wait
too. The ring **only fills**, every frame chasing `ringTarget` (a creep toward `splash.waitCap` during
the download, then Boot's progress, then full) at `ringStep`'s capped speed, so a slow load never jumps. A
cached load (Boot ready within `TUNING.splash.ringCachedMs`, 1500, of the splash starting:
`ringCachedLoad`) fills at `ringStep(..., fast)`'s flat `ringFastPerSec` (3.4 ring / s), empty to full in
about 300 ms (plan 35, 2.5). A card (‹ card › in one row, Continue on the row below; every card's text
stacked in one grid cell, so the card is as tall as the tallest and never jumps) is a hint or a major
feature (`SPLASH_NOTES`: TIP or NEW, a picture, one line). The picture is the game's own sprite where
there is one (`art`: Boot's exact URL via `splashArtUrl`, all preloaded at start; a strip's frame 0 or a
square `crop`; the emoji if it fails), else the emoji; a note about something the profile counts wears
that badge's glyph via `achievementById` (the hints include 🔋 battery saver / low power mode, for every
device: plan 28, 4.7). Cards are dealt from a shuffled deck kept in `flappyPoop.splash`
(`nextNote`: a feature this device never showed comes first; every card once per cycle; a reshuffle
never repeats the last card; `splashPool` keeps the newest `splash.featureMax` features; the newest are 🌐 online races (plan 39, `online`, 24 Nov: dealt first as NEW; it aged 👤 profile out), 📅🔥 day streaks (plan 36: reworded for streaks on every profile and dealt as NEW again under the id `streaksAll`, it was `streaks`), ❓ challenge questions, plan 34, then 📚 education, plan 28; the ❓ card leaves the pool with education). The player
browses at any time (swipe or mouse drag, ‹ ›, ← →, the d-pad by its own `getGamepads` poll, since
Phaser's pad plugin is bound only in Play); the first browse stops the `hintMs` auto-advance. Boot
drives the ring (`load.on('progress', setSplashProgress)`) and its `create()` hands
`splashReady(() => scene.start('Play'))`: once the ring is full (or after a timer backstop, since rAF
stops in a hidden tab) Continue lights up and glows, and **Play starts only on its
release** (click, Enter / Space up, the pad's A up), since Play's keydown-SPACE flap repeats while held
and the pad plugin reports a held button. With the **`skipSplash` setting** on (Settings "Skip to home when loaded"; off by
default; plan 35, 4.2) Continue presses itself the moment it lights (`skipWanted(storage)`, read from the settings
store then, so a change counts from the next load; the full ring still shows, and the failed splash never skips). The
splash's tap never unlocked iOS sound (`Play.flap` does), so skipping loses nothing. Plan 01's rule that Continue
stays on every load holds unless the player turned that on. Any error in the splash removes it and starts the game.
Held-key flaps stay in split screen and single player; an **online race drops a key's auto-repeat** (flap, Ready, P
and Esc: Play's `onlineRepeat(event)`, plan 39 5.2b, AUD-149 / AUD-144), tests/raceRun.test.js, tests/runStamp.test.js.

**Service worker** (plan 35, Stage 3, 0.29.0): `sw.js` at the root, scope the game's folder
(`registration.scope`). It gives an offline launch, and a launch more than 10 minutes after the last
(GitHub Pages' `max-age=600`) no longer revalidates every module and asset one by one; only index.html
goes to the network. About 4.7 MB per build in Cache Storage. Its page side is `src/swClient.js`.
- **Stamp.** `npm run push` writes `BUILD` and `FILES` into `sw.js` (`tools/sw_stamp.mjs`): `FILES` pairs
  every URL exactly as the page asks for it with the SHA-256 of its bytes: index.html, every module
  (`?h=<content hash>`, through the import map `index.html` also gets), art and sounds (`?v=<VERSION>`),
  the vendored Phaser (`?v=4.2.1`) and supabase-js. Icons and the manifest stay out. An unstamped
  `sw.js` (the committed one) answers nothing and clears its caches. A `?h=` URL's bytes never change,
  so a cached copy is right for any build, and an unchanged module keeps its URL across pushes.
- **Cache.** One build per `BUILD` in Cache Storage as `flappy-poop-<BUILD>`. Install stores every file
  hash-checked, copying an identical entry from the previous build's cache instead of downloading it;
  a mismatch (a stale HTTP or CDN copy) is retried once past the HTTP cache (`cache: 'reload'`), and a
  second one fails the install: the old worker stays, the console logs "build … not installed", and the
  next launch tries again. Activate keeps the previous build's cache (a page still running that build
  gets its own files), deletes older ones and never deletes a cache it did not name (`flappy-poop-`
  prefix only), then claims the open pages.
- **What it answers.** index.html: network first (`cache: 'no-cache'`, 3 s), else this build's cached copy,
  so a push shows on the next launch. A listed file: this build's cache, then the previous build's, then the
  network; nothing is written at fetch time. A `cache: 'reload'`, `'no-cache'` or `'no-store'` request
  (Reload) goes to the network first. It does **not** answer, and the browser fetches as if there were no
  worker: anything cross-origin (Supabase REST and auth, the realtime `wss:`, the Phaser CDN), a non-GET, a
  Range request, a path outside the scope, a `?nosw` navigation and any URL not in `FILES`. A cache fault
  falls back to `fetch(request)`. Offline, the CDN tag fails at once and the trap loads the cached vendored
  Phaser (on a stalled connection, after its 6 s wait, as before).
- **Registration** (`registerWorker`, `swMode` in `src/logic.js`). Play registers it once per page load,
  when its lazy sounds are in (`Play.loadLazyAudio`), so the install never competes with the cold load,
  then calls `registration.update()` once: `register()` with an unchanged script checks nothing, Chrome
  skipped its own navigation check in `tools/sw_check.mjs`, and Safari checks at each launch. An update
  installs in the background and takes over at once, but the running page keeps its build; the next launch
  runs the new one. There is no update prompt (Michael's call). Never on a local host (`localHost`,
  shared with the debug handle: localhost, `*.localhost`, `*.local`, 127.x, `::1`, private ranges) unless
  the URL has `?sw`; `main.js` (`stopWorkerIfAsked`) removes this scope's worker and our caches for `?nosw`
  anywhere and on a local host without `?sw`.
- **Reload** (`hardReloadGame`, Settings, the error card, the failed splash). When the page answers from the
  network, it unregisters this scope's worker and deletes our caches, then navigates, so Reload is a clean
  network load and a player's way out of a bad cache; the worker returns after Play's lazy sounds. When
  the page does not answer, it keeps both and reloads through the cache, so Reload never strands a player
  offline. All inside the existing 3 s budget.
- **Kill switch.** Copy `tools/sw-off.js` over `sw.js` and push; the stamp leaves it alone (the
  `FLAPPY_SW_OFF` marker). Browsers fetch `sw.js` past the old worker, so it reaches each online player at
  their next launch even if the old fetch handler is broken. It never claims a page, so there is no reload
  loop. Players can add `?nosw` themselves.
- **Known behaviors.** Between pushes the committed `sw.js` and `index.html` are unstamped or carry the
  last push's stamp; harmless locally, since `tools/serve.py` ignores queries and no worker runs on a local
  host, but not on a deploy (new module bytes behind old `?h=` URLs), so `tools/git-hooks/pre-push`
  refuses a plain push of main with a stale stamp (see "Before a push").
  Chrome holds an update check started offline for about a minute, and jobs behind it wait; harmless, since
  an online launch runs the newest build from the network. Art changed under the same name still needs a
  `VERSION` bump (art URLs carry `?v=`, not a hash). A browser without import maps (Safari before 16.4)
  loads the bare modules from the network: nothing breaks, the module speed-up is lost.
- Checked by `tests/sw.test.js`, `tests/swStamp.test.js`, `tests/swClient.test.js`, and in a real browser
  by `node tools/sw_check.mjs`.

**Education mode** (📚, 2026-11-13, v0.16.1, plan `.claude/plans/21-education.plan.md`: the tester
build, its playtest polish and Stage 3, "tester-complete"; the old plans 22 and 23 are merged into
it). **For everyone since plan 28 (0.19.0):** no unlock word; every device has the 📚 switch while
`EDUCATION.enabled` (the off switch: false hides 📚, its tab, its profile sections and Education data for
everyone, one change and a push, except that a device holding a pilot consent or sharing still opens
Education data, so Withdraw and Stop sharing stay reachable: `Play.eduDataReachable`, AUD-037; `Play.educationAvailable()`, read each time, `eduAvailable` standing in
for it in tests). The old word (`EDUCATION.words`, `poopschool`) typed as a username is still never stored
as a name: the save panel says 📚 is on the home screen for everyone (`eduWordRetired`). Turning 📚 on asks
the browser to keep the site's storage (`navigator.storage.persist`), once a page load (the registry's
`storagePersistAsked`). The settings keep `eduInvited` (the device's invitation flag, above) and drop the
old `eduUnlocked`: a stored `eduUnlocked` other than true turns a stored `education: true` off once, as a
locked device's hidden 📚 was (`normalizeSettings`). The ready screen offers the
📚 switch (settings `education`, remembered, off by default) under 🚽, in the 👥 slot on a phone; on a wide window the
three switches pack into 64 px boxes (`readyLayout({ versus, education })`, y 808 / 874 / 940); 👥 and
📚 switch each other off. `refreshReadySwitches` re-lays them in place when test mode
changes (stable `switchBoxes` for the focus ring); a gold count on the 📚 is the cards due (`dueCount`).
The 📚 glyph and that count are a box of their own inside the switch's (`readyLayout`'s
`educationInfo`, which `readyHit` looks at first): a tap there, or A on its ring item, opens **"Your cards"**
(`Play.toggleEduCard` on the `eduCard` info card; plan 21's card, back on the glyph in plan 26's A2 at Michael's
word): the three count lines (`countLines`, his wording), the cards seen of all and "🔥 Current streak = n" (the
learning streak, `Play.streakNow('study')`; plan 34, round 2: the line on what the gold number counts went at
Michael's word, Preview H); the 📚 popup's own "Your cards" list ends the same way; any tap, key or pad press closes it and no run starts. A tap, Space, Esc, P (or ⏸, the pad's Menu)
and the pad's A press nothing under it; another chrome key (S, I, L…) closes it and then does its own thing
(`handleChrome`; P since AUD-027). It never opens under the 📚 popup: `openEduIntro` drops a press still down
on the glyph (`eduCardPress`), and `toggleEduCard` refuses while the popup is open (AUD-034). Turning the switch
on opens nothing since that step. **The 📚 popup** (plan 26: `ui/eduIntroPanel.js`, `Play.openEduIntro`) is a
DOM panel with the beta note, a line that the cards are not medical advice (`eduIntroNotMedical`, plan 28), how the mode works, the player's cards (the cards not
seen yet, the missed ones due, the reviews due over every deck: `cardCounts`; how many have been seen:
`masteryByDeck`; then "🔥 Current streak = n", the learning streak, since plan 34's round 2, which also took out
the line on what the gold number counts: `Play.eduIntroInfo`), the start
level (◀ LV n ▶ while a later level is unlocked; no start-level row at all in test mode, whose run starts at
its own level: `eduIntroInfo().testMode`, plan 26 A2), where new cards go
(`setEduNewOrder`; under the three buttons a line says what the pressed one does, `ORDERS` in the
panel, plan 26 A2), **new cards per level** (plan 28, Stage 3b: 3 / 5 / All, 5 pressed by default, how
many new cards a level break asks a visit: `setEduNewPerLevel`, settings `eduNewPerLevel`, `PER_LEVEL`
in the panel, with a line under the buttons: "Each level break asks up to n new cards."), **Show / Hide**
(plan 28, 4.2, Michael's ask: one button under "How it works" and one under "Your choices", its word with an
arrow and a line beside it saying what a press does, "Hide ▴ Press to hide information" / "Show ▾ Press to show
more information"; the section's body hidden, the choice remembered on this device: `setEduIntroHidden`,
settings `eduShowHow` / `eduShowChoices` since plan 34 (false = folded, the default: each section has a summary line that
always shows, `eduIntroHowSummary` / `eduIntroChoicesSummary`, Michael at Preview F; the keys were `eduHideHow` /
`eduHideChoices`, held false in every stored record, so a new default could not reach those players), not in the backup;
the device line and its link always show), the daily cap
while it is a number (held off since Stage 3b), a line that the data stays in this browser, not on the game's
servers, unless the player chooses to share it, with a link to 📚 Education data, and Close | Play
(`startFromEduIntro`: 📚 on, the audio unlocked, then `launch({ intro: false })`; not a tap, which would open the
popup again). **It opens at every start from the ready screen with 📚 on** (plan 26, A2: Michael asked): a tap,
Space, ↑ and the pad's A all reach `launch()` with no options, and `launch` opens the popup instead of starting
(`openEduIntro` says whether it opened; one that cannot open never blocks the run). Play again (`solo`), a Daily
Dump and a match half go straight in. The game's keyboard is off under it; the popup's own keys (`onKey`, acting
on logic.js's pure `eduIntroKey`, tested in Node: AUD-032): Esc closes, and with the card focused Enter presses
Play and Space does nothing; a held key's repeats and the release of a key pressed before it opened (the Space
that started it) are swallowed, on a focused button too, so it never flashes past. A focused button keeps its own
Enter / Space, and keeps the focus when its choice redraws the popup (`render`), so a second Enter on ▶ steps
again instead of pressing Play (AUD-026).
A click in its first `retryLockoutMs` is dropped (one capture listener on the panel: the second tap of a quick
double tap must not land on Close or Play; the pad's A presses with `click()` too). Focus starts on the card; in
pad mode the ring is drawn on Play but only a d-pad move focuses a button. A controller walks its buttons with a
gold ring (`eduIntroPadAction` through padIntent's `'panel'`), Esc, ✕, Close and B close it, and a restart of
Play takes it down (a click on its Play after that does nothing). From the glyph it opens on the release of the
pointer that pressed it (one press is armed at a time, so a second thumb or a cancelled touch does not open it
twice: plan 25); that is "Your cards" since plan 26's A2, and nothing under it is pressed. The rest of the
switch still toggles.
A run with 📚 on latches `runIsEducation` (never a Daily Dump), shows 📚 in the HUD, and at its end
records nothing on a board or in the career (`endRun`: no best, top list, career counters or career
badges; the sync that follows sends only what was already queued, such as a tester's answers and the
📚 board's grades: plan 25); its own badges and average grade are kept on the device
(`recordEducation`, below) and leave it only when the player shares them on the 📚 board (below).
With test mode on as well it is a test run too: no card progress, badge or revive is saved, and
nothing is saved while test mode is on even when it was turned on after the run started (the
game-over screen's profile, then the save panel; `setTestMode` also latches a one-player revive).
**Cards** (`src/questions.js`, 70 placeholder cards in the level and general decks plus 21 challenge cards (plan 34, deck `super`), audits in `src/questionAudits.js`, the audit tool
`tools/audit_questions.mjs`) are scheduled per device by **FSRS-6** (plan 26: `src/fsrs.js`, the
formulas ported from py-fsrs (MIT) with its default weights, `TUNING.education.fsrs`; `src/education.js`;
store `flappyPoop.eduSrs`, wiped by Clear), as in Anki but with no learning steps: a card with no
record is **new**; a right answer puts it in **review**, due when its recall chance falls to
`fsrs.retention` (whole days, at least 1, at most `maxDays`; right on first sight is always good:
2 days); a wrong one makes it **missed**, due at once until answered right. A **practice** card (a
review not due yet, offered once nothing is counted) answered right leaves the schedule alone. An
SM-2 record from before plan 26 is converted as it is read (`fromSm2`). **The daily cap is held off**
(plan 28, Stage 3b): `education.newPerDay` is `null`, so `newAllowance` gives Infinity and the 📚
popup leaves out its "Up to n new cards a day" line; a number turns it back on (new cards a local
day, breaks and revives together: the cards first seen since local midnight, plus the new ones a quiz
showed unsaved; past it a revive asks a due card, else practice). **A break's new cards** are its
own (`breakDecks`, `breakDeckOf`): the cleared segment's deck and one general card, the live general
cards going one to a break in gut order (the segment their id names, then id: ST-10 stomach, JE-06
duodenum, JE-08 jejunum, JE-09 ileum, IL-10 caecum, CO-02 colon; the seventh, RE-09, to the rectum,
which has no break, so the bonus quiz and revives ask it), derived from the cards so `questions.js`
needs no field. A revive still offers every general card, at `generalShare`. The day's skipped ids
(`skipped`: `quizNext` and `quizCounts` both pass `buriedIdsOn`) keep a new card among them out of the
counts and the picks, as they keep a practice card out of practice. A break's tie-breaks (`near`) put
its own cards first. With a cap turned back on, the caught-up line says it (`caughtUpText`). Settings' **`eduNewOrder`** puts new cards after the due ones (the
default), mixed in by their share, or before them, in a break's own quiz and a revive (`pickCard`'s
`order`; the bonus quiz keeps new first). A **test run** saves no answers, so what is due would never
clear: its quizzes walk the level's deck in id order instead (`pickCard` context `'browse'`; the cards
shown are kept for the page load in the registry's `testQuizShown`), so skipping to a level shows that
level's cards. **The quiz card** (`scenes/Quiz.js`, overlay id `quiz`): Play owns the cards (`quizNext`
→ `pickCard`, `quizAnswer` → `gradeFor` / `schedule` / `eduStore`), the scene only shows them: three
options (every wrapped Text on the card wraps through `cjkWrap`, its wordWrap.callback: text with Chinese by `wrapCjk`, the rest by Phaser's advanced wrap, which breaks only at spaces; plan 28, 2.1; tap, keys 1–3, the ring: for `retryLockoutMs` after the quiz moves the ring itself, on a card, an answer or
"caught up", an A does nothing, `ringLocked` / `padItem`, so a quick double A never lands on what the ring jumped to;
plan 28, 1.4), ✓ / ✗, the verdict, under it when the card comes back ("Next review: in 2
days", "Next review: again soon" after a miss: `nextWaitText`, `Quiz.showNextWait`, from `quizAnswer`'s
`dueAt`; none in a test run), the explanation (at once after a wrong answer,
which holds Next `explainMinMs`; behind "Why?" after a right one; its source only once audited), the
card's id in a corner. **The explanation's links** (plan 26): 1–3 words of each card's English
explanation link to English Wikipedia (`CARD_LINKS`, `cardLinks`, `wikiUrl`): drawn word by word
(`renderExplain`, richText's `layoutRich`), underlined in blue with a tap box each; "📄 Learn more 🔗"
under it opens the card's first reference with a DOI (`REFERENCE_DOIS`, `cardLearnMoreUrl`). They open
in a new tab only (`openLink` → `openUrl`), are not ring items (as the 🚩), and are drafted for
Michael's review. **The id ends in 🚩 and is a link** (`openReport`): on its release it opens
GitHub's card report form in a new tab with the card's code in the title and the form's fields
(`issueUrl('card')`, `.github/ISSUE_TEMPLATE/education.yml`: plan 28 replaced card.yml with one education form, its kinds a wrong card, an unclear explanation, a broken link, an idea, something else, label `education`; the Education data panel links it too, `issueUrl('education')`); never a same-tab navigation, which would lose
the run, and not on the controller ring (a pad press cannot open a tab). **Its rows**, as Michael drew
them (plan 26): a full-width Why on top, then two buttons whose right one is the way forward (Next
Card, Fly on, Go for it, End run) and whose left one is the way out (End Review in a break; Quit or
the choice's Fly on in a revive), then the numbers on the card's bottom row. **Caught up**: with
nothing counted left, a break's or the bonus quiz stops at the first practice card: "You're all
caught up!" with End Review and **Keep practicing** (`Quiz.practicing`: practice cards from then on,
leaving the schedule alone, and paying as any card does: once a day); with nothing at all, End Review alone.
A break's quiz stops the same way at the first due card past its gate (`pickCard`'s `beyond`; plan 28,
Stage 3b): the line then says how many more are due (`Play.quizMoreDue`, `caughtUpText`'s `more`:
"That's all this break asks! n more cards are due…"), and Keep practicing asks them, as due cards
(scheduled, and underlined as none of the three counts), before any practice card. **The purse**
(plan 26): in a break, "🌽 n" under the ✕ (`refreshPurse`), popping as right answers pay, with a soft glow behind it that lights at
each payment and fades out (`glowPurse`, `TUNING.education.purseGlow`; plan 28, 1.2: never for a purse that stays or shrinks),
its kernel (a sprite since plan 34) spinning `purseGlow.spinTurns` quick turns inside the fade ('coin-spin-quick' from Boot,
`purseSpinRate`), then resting on frame 0. Enter /
Space press only the way forward (and End Review on "All caught up" when it is alone), never Quit,
and nothing on an open card (so never Skip): Space is the flap key. **Its sounds**: a book opens with the
quiz (`book-open`), a page turns for each next card (`book-flip`), the book shuts when it is left
(`book-close`); a wrong answer plays `sfx.hazard`; a right one that pays nothing (a revive, the bonus
quiz, a card that paid today) plays `sfx.score`, and one that pays (a break's) makes the coin's sound alone (`takeCoins`); the
answer that wins everything back plays `sparkle` in the ding's place. **Level break** (plan 25 laid it
out, plan 26 to Michael's sketch, its A2 to his checklist, plan 28 1.1 to his 15 Nov note: `eduBreakLayout` in
logic.js): the banner higher (`titleY`); the level choice (below) on ⏸'s row, centred; right above it, **[🌽 Shop]
[📚 Review] [Quit] on one row**, 216 px each, 12 apart (the level Skip ▸ is gone); the three numbers under Review, inside its width, on a dark rounded chip (`chip`,
`Play.quizCountChip`: their tap box and ring item). The shop pill is drawn once at its box
(`createButton`), so `Play.placeShopPill` moves that same box object in place at a run's start (into the
row for an education run, centred otherwise: the ring and the tap test hold it) and draws the pill again.
The poop bobs at mid-height (`levels.eduBreakPoopY`), between the banner and the row; UI may cover it. A language change mid-break
(`applyLocale`) redraws the row and the level choice's label with the banner (AUD-031). The **📚 Review** pill
(`quizButtonShown`; chromeIntent's `'quiz'` input, only in an education run's break) opens the break's
quiz, which asks missed cards, then due reviews (the least remembered first), then the cards missed
in this break (`Play.breakMissed`, asked again as missed until answered right; the one just shown
waits), then new cards of the segment just cleared (and its general card), then practice (`pickCard`'s
`dueFirst`; the bonus quiz keeps new first). A counted card always comes before practice, whatever the
recent gap holds. A right answer in a break pays `education.breakCoins` by why the card was asked
(plan 28, Stage 3b: a new card 3, a due review 2, a card practiced early 1, a missed card answered
right 1; `takeCoins`), **once per card a
local day**, practice included (plan 26, A2: the store's `paid` { day, ids }, written through
`eduStore.answer(id, record, { paidDay })`, read with `paidOn`; a test run keeps no record, so every right
answer pays there). A card already paid today pays nothing more, even missed on purpose and then answered
right; `quizAnswer` returns `paidToday`, and the card shows "🌽 already earned today" (`quizPaidToday`,
`Quiz.paidNote`) small and muted beside "Right!", on the verdict's row, so the card grows no taller. A
wrong answer never costs corn or points. The shop's prices are `eduShopPrices(level)` (`Play.shopPrices`; `buyBlocker` takes
`prices`), at the highest level the run has reached (`runTopLevel`, plan 26 A2, Michael's choice; a Skip's
`buryPrice` too), so going back to an easy level never makes them cheaper. **What is waiting**, as in Anki (`cardCounts`: new, missed (a miss of this break
included) and review cards a quiz can still ask now; `Play.quizCounts`): three numbers in blue, red
and green on the chip under Review (`ui/countLine.js`; none in a test run; a tap, or A on
their ring item, opens "Waiting in this quiz": `toggleBreakCounts`, `countLines`, on the same card, closed the
same way: a tap, Esc or P never continues the break under it, AUD-027), and on the card
`5 + 2 + 8` on its bottom row, under its buttons, the card on show counted and its kind
underlined (`refreshCounts`; no line in a test run); a tap on the card's numbers opens the same lines
(`Quiz.toggleCountsCard`). **The gate** (`breakGated`, `gateHolds`): every level break of an education run
(plan 26; before it, only a break into a level not yet unlocked) holds while any of its three numbers
is above 0: `resumePlay` keeps the break. Since plan 28's Stage 3b **every break asks its cards**, within
two limits (`Play.breakLimits`, passed to `pickCard` and `cardCounts` by `quizNext` and `quizCounts`
for a break's own quiz): **new cards**, up to the N the player chose for a visit (settings
`eduNewPerLevel`: 3, 5 or 'all', 5 by default; `breakNewAsked` counts the new cards asked or skipped),
the level's other new cards waiting for the next visit; and **due cards** from any level, up to
`education.duePerBreak` (10; `breakDueAsked` counts the stored ones asked or skipped), the most
urgent first, the rest asked under Keep practicing. A card missed in the break (`breakMissed`) holds
the gate whatever the limits, and its retry takes neither. `startLevelBreak` zeroes both counts. A
revive and the bonus quiz keep no limit. The hint still reads "Tap to continue" (plan 26, A2:
every break's, as Michael asked) but holds still while the gate holds, since a tap there only explains:
a refused continue (a tap, Space, ↑, Esc, P, ⏸ or the pad) sets `gateTapped`, and the smaller line
under it says "Tap 📚 to answer this break's cards before continuing." until the gate opens or the break ends.
`refreshGate` reads the gate into `breakGate` once per break event (`breakGated` reads the store, so
never per frame); `refreshLevelBanner` and `refreshQuizButton` both call it, so the level choice never
reads a gate from before the quiz closed (AUD-025). Review pulses. **Skip** (plan 26, A2; it replaced Bury and the
level Skip ▸): an open card in a break's quiz shows "Skip · n 🌽" in its right slot (`Quiz.offerSkip`;
"Skip" alone and free in a test run, which saves nothing); after an answer that slot is Next Card. Every
Skip costs `buryPrice()` (`education.buryCoinsPerLevel` × the level just cleared) and moves on
(`Play.skipCard`); a due card (missed in this break, or a stored record due now: `cardDue`) also goes to
tomorrow (`eduStore.bury` until `skipUntil`: `buryMs`, 24 h, or the next local midnight when that is later,
so a skip in the first hour of a 25-hour day is not due again that date; AUD-029), leaves `breakMissed` and so
the gate, and counts toward
`buryPerDay` (3) a local day; a practice card's schedule is left as it was, but it joins the day's
skipped ids (`eduStore.skipPractice`, uncounted; AUD-028), and a new card joins them too
(`eduStore.skipNew`, uncounted; plan 28, Stage 3b), so no quiz offers it that day, and takes one of the
break's N, only when the store took the Skip (AUD-089); `Play.breakSkipped` (reset with `breakNewAsked`)
keeps the break's skipped new cards, and `breakQuizOptions({ limits, skipped })` adds them to `skipped`, so
a local midnight inside the break cannot free one to take a second of the N and a second Skip (AUD-088,
on AUD-058's one set); neither has a daily limit. A stored due card's Skip takes one of the gate's `duePerBreak`.
`skipBlocker` says what stops it ('none': not an education break, a match; 'cap'; 'coins'): a blocked
Skip shows dimmed (`button.dim`) and a press says why in the verdict's place. The first paid Skip in a
break warns there and holds Skip for `explainMinMs` (`Play.quizSkipWarned`, cleared when a break
starts); later ones skip at once. Skip ignores every press for `retryLockoutMs` after its card appears
(`Quiz.cardShownAt`), since it sits where Next Card was, and Enter / Space never press it (`primary`
does nothing on an open card). The day's skipped cards, due, practice and new, are kept by id (`buried.ids`;
`buriedIdsOn`; `buried.n` counts only the due ones), and `pickCard`'s `skipped` leaves them out of
practice that day, and out of the new cards (`cardCounts` takes the same ids). A skip is no answer: no tally, no pilot
event. A revive and the bonus quiz have none. **Quit**: Quit takes two taps and ends the run, graded as a normal end
when the gate is open and something was answered; while the gate holds (new cards included since plan
28's Stage 3b, Michael's call), or with nothing answered, it counts as
quitting the run (`breakGaveUp`: ungraded, and 🏳️ with nothing answered; plan 26, A2). It reads Quit
either way; armed it reads "Quit? Tap again", or "Quit ungraded? Tap again" while the gate holds
(`breakQuitDueSure`), and an armed Quit ends with its break (`startLevelBreak` and `endLevelBreak` clear
`breakQuitArmedAt`; plan 27), so a level cleared within the confirm time never opens a break armed. The armed Quit is dimmed and ignores a second tap for
`education.explainMinMs` (`Play.breakQuitHeld()`, as the revive's Quit; the 4 s confirm time is unchanged; plan 35, 4.6), so a
double tap never passes the warning. **The level choice** (plan 26, A2: Michael's image 12): once the gate is open
(`breakGate`: nothing left that the break asks), never in a test run (or with test mode on) or a match, **[◀] LV n [▶]** shows on ⏸'s row, centred
(`eduBreakLayout`'s `levelDown` / `levelLabel` / `levelUp`, `levelStrip` swallowing the tap; ring items `levelDown`,
`levelUp`). ◀ ▶ cycle 1 … the higher of the next level and `unlockedLevel`, wrapping (`stepBreakLevel` →
`nextEduStartLevel`; `breakLevelPick`, null for the next level). During the break only the preview follows it
(`breakShownLevel`: the banner's title, the bar's label with an empty fill, `fadeBackground(level)`); the quiz,
the tally, the shop and Skip keep reading the run's level. It is dropped, the preview going back, when it
stops being offered (the gate back after a miss, test mode on: `refreshQuizButton` → `dropLevelPick`). On
continue, `endLevelBreak` unlocks the next level as always, then `applyLevelPick`: the run goes on from the
chosen level's first pair (`testRunStart(pick, this.tune)`), forward or back, both pipe counters reset
together (the finish line needs `pipesSpawned` to equal the level's end), pipes still on the field counted
as passed; the score and the bean guarantee are left alone, `runSkipped` makes the run not full, and a
replayed level plays and pays as that level always does. **Start level**: with a later level
unlocked, the 📚 popup's ◀ LV n ▶ sets it (settings `eduStartLevel`; on the ready screen's 📚 row
until plan 26); the run starts there through `testRunStart`. 💯 and the 🤓 streak
count only **full** runs (`eduRunFacts`' `full`: from level 1, nothing skipped, won). **The run's
tally** (`runQuiz`, built by `tallyAnswer` with one row per level) sits in the card's top row
(`✅ right ❌ wrong`, once the run has an answer); a tap on it, or A on the ring, opens "This run", one
line per level (`tallyLines`), as an info card over the quiz (`toggleRunCard`): any tap, Esc or B closes
it, the quiz's keys do nothing under it, and a question left waiting is marked interrupted, as it is
under any other overlay (F, What's new: `Quiz.update` checks the card is the top overlay) and when the
page is hidden or the window loses focus. The bonus
quiz's answers are tallied too, in the last level's row (plan 26; see "A won run waits"). **Crash**
(`die` → `startEduRevive`): the coins and power-ups go (`effects.snapshot`, kept in `reviveLost`), the
world halts as in a match respawn (`startRespawn` / `endRespawn` keep their match parts behind
`if (this.match)`), and `respawnHold` (`'quiz'`) stops `tickRespawn` at the end of the tumble while the
**revive quiz** runs (`reviveStep` through `Play.reviveEvent`): ❤️ × `education.strikes` misses end the
run (`reviveDone` → `endRun`, the field untouched); the first right answer revives, and when the crash
took something the player may go for ⭐ × `restoreStreak` in a row to get it all back
(`effects.restore`; the choice shows Why on top, as any right answer does, and says how on its own
line under the verdict and the wait, `Quiz.choiceLine`, with the explanation opening under it: plan
26 A2, Michael's image 8); **Quit** ends it ("Give up" until plan 26's A2; the method `Quiz.giveUp`, the
`'giveUp'` event and `gaveUp` keep the name), and only before a right answer (`reviveStep` takes it in
`'strikes'` alone). On every card its first press only warns, in the verdict's place, that the run
and its progress would be lost (`reviveQuitWarn`), arms the button ("Quit? Tap again", `quitArmed`)
and holds it for `education.explainMinMs`, as Next is held after a miss; the next press on that card
quits, and the next card starts unarmed, so no single press ends a run. Esc / B do
nothing. Once Quit or Return has started closing the quiz
(`finishing`), no key or second thumb answers. A revive's card ignores pointer taps for
`retryLockoutMs` after it opens (`tapLocked`: a flap tap landing as it appears must not answer or give
up; the keys are not locked, and the ring waits after each of its jumps, as on every card). The quiz is the pause: `autoPause` does
nothing under it, and a revive already decided is settled, never asked again (`reviveSettled`). **The
field refills under the card** at the first right answer, the moment the revive is certain
(`prepareRevive` → `clearFieldAhead` + `refillAfterRespawn`; a game over comes before any right answer
and so still shows the crash); `scrollSpeed()` is 0 through a respawn, so the refilled pairs stand
still, and a wide field's pairs sweep in (`tickSweep`). At a level's end (every pair passed) a finish
line no farther than the first-pair lead stays, else it is placed at that lead (`reviveFinishKept`,
`finishLeadShift`). A revive costs `education.revivePenaltyPerLevel` × level (`scoreAfterDeath` /
`scorePopup` take the per-level amount); **Fly on goes straight on**: the poop stands at mid-height and
blinks for `education.reviveBlinkMs` (`standRevived`, `respawnBlinkStart`), with no glide and no "Tap
when ready". A revive's way forward glows. **Badges and the average grade** (`EDU_ACHIEVEMENTS` in
`src/achievements.js`, their own list: never in `ACHIEVEMENTS`, never claimed on the server): 🤓 Nerd
Alert (plan 34, Michael: one won, graded run with no wrong answer that ends caught up, nothing due: `eduRunFacts`'
`won` and `caughtUp`, `Play.eduCaughtUp`, judged at the win and after each bonus answer, kept in `pending`; a card
missed in this run's challenge question never blocks it; until plan 34 it was 10 perfect full runs in a row, and
`perfectStreak` is still counted but no badge reads it), 💯 Full Marks, 🅰️ / 🅱️ / 📜 (90 %, 80 to under 90, 70 to
under 80), 🏳️ Drop Out (a Quit with nothing answered: a revive's, or the break's), 👼 / 🐦‍🔥 (100 / 1000 revives). A run is
graded from `education.badgeMinAnswers` answers and only when it did not end on a Quit that counts
(`gaveUp`; `eduRunFacts`: a quit run earns no grade badge, adds nothing to the average and leaves the 🤓
streak alone, so 💯 needs a won run); the education store keeps the counters
(`revives`, `perfectStreak`, `gradedRuns`, `gradeSum`) and the badges with the cards, and the average
grade is the mean of the graded runs' grades (`averageGrade`). **Over**, on an education panel (the
other panels are untouched): ‼️ 😢 are the grid's third row, as everywhere; the tally is the bottom
row (plan 26, Michael's image 9), three cells (❔ answered, ✅ right, ❌ wrong; a tap on one opens "This
run") under the coins with `eduNotSaved` under it, a row apart, and the run's education badges on a
line between the coins and that row on a lost run, or under the tally on a won one (plan 28, 3.2)
(`overCellsLayout({ education, badge, won })`, `overEduLines`); no Share. Its buttons are one row,
Home | Play again side by side where Play again sits on other panels (`overButtonsLayout({ pair })`;
Play again glows `over.pairGlowPx`, clear of Home), so a lost run's band is the tall one
(`overBandLayout({ tall })`) and nothing scrolls. A won run offers 📚 Quiz centred a row above the pair
(`bonus`; `openBonus` → `Quiz('bonus')`, the rectum's questions, no coins); its band is the short one,
so the tally row stays in view (with a badge too: plan 28, 3.2) and the badge line and the note start
below the band's bottom, whole, where it scrolls (by drag, wheel, or the controller's 'lines' stop:
AUD-049). **A won run waits** (plan 26): its bonus answers are part of it (the tally's last
level row, the grade), so `endRun` keeps it in the education store as `pending` ({ tally, full, caughtUp, at }: caughtUp since plan 34;
`setPending`, updated by each bonus answer) and shows the badges it would earn so far
(`eduPreviewBadges`, `countersAfterRun`); closing the bonus quiz draws the panel again
(`refreshOverEducation`). It is recorded once, from its final tally, when the panel is left (Home and
Play again restart Play: `finishPendingEducation` in `create`, then a sync) or at the next page load;
nothing reaches the 📚 board before. A lost run is recorded at once. Under test mode a bonus answer
counts nowhere. Your own **profile** (while education is available) ends with a 📚 Education section: the
average grade, the graded runs, and (plan 26 A2, Michael's checklist; your own profile only, never shared)
🔥 Learning streak, ❤️‍🔥 Longest streak and Highest level unlocked (`eduProfileRows`, `Stats.eduView`), then the
eight badges. **Learning streaks**: a local day on which at least one card was answered and saved in an
education run (any quiz; never a test run or under test mode) is a study day; `quizAnswer`'s one write
(`eduStore.answer(id, record, { studyDay })`) moves the store's `study` { day, streak, best } by
`nextStudyStreak` (the same day or the day before changes nothing and the stored day stays, the next day
adds one, a gap starts over and keeps the best; a stored day more than a day ahead is a clock error, so the
streak starts again at 1 on the real day, the best kept: plan 27, Michael's call, so a clock once set ahead
no longer freezes it until that date), and `studyStreakNow` reads it (0 once a day is missed, or while the
stored day is more than a day ahead). Day
gaps come from the date keys (`localDayKey`), never from milliseconds. Since plan 34 the rules live in
`src/streak.js` (`nextDayStreak`, `dayStreakNow`, `cleanDayStreak`; `nextStudyStreak` / `studyStreakNow` are
education's names for them), shared with the day streaks below.
**Day streaks** (plan 34, Michael): `createStreakStore` (`flappyPoop.streaks`, src/leaderboard.js) keeps a
Singleplayer and a Daily Dump streak on the device: never sent, not in the backup, cleared by Sign out and by a Sign in
(`forgetRename`, finish plan F2: the device may now be another player; the sync the Sign in starts refills them for
the loaded code). They count the days played on any device with the save code (34.13, Michael:
"Daily and Singleplayer", "any device"): once per page load, a named device's sync (`pullPlayDays`, after
`drainDaily`; the registry's `playDaysFor`) asks the server's `play_days` with this device's IANA time zone and folds
the days in (`streakStore.merge`, `mergeDayStreak`: the run of days in a row ending on the latest day, the best
never lowered, a day more than one ahead of today left out; the server's `singleBest` is the floor of the
Singleplayer best, so a Sign in or a new device shows the Longest everyone sees). The server counts by its own clock
(`streak_days`, 34.14 and Checkpoint 34c): Daily Dump course days from `daily_scores` alone (since 10 Nov 2026,
kept; it takes a day only on that day or the next), and a Singleplayer day as the local day of the run's
`ended_at + clock_offset_ms`, for a row that arrived within 48 hours of it and has `data.pipes` above 0 or no `pipes`
key (plan 48, call S; schema stamp df6e05322d54da82; a row that came later, one with no end
time and a held run count for no day; the log starts with 0.19.1, 15 Nov 2026, and keeps 90 days). So the streaks
of players from before 0.24.0 come back too. Offline, nothing changes and the next sync asks again; a merge that
lands on a later sync forgets `playDaysFor`, so the next sync asks again too. Every profile shows them (34.14, Michael: "Users should be
able to see everyone's streaks", "Store time zone"): your own from the device store (`Stats.streakView`), another
player's from `player_stats`' `streaks` (`cleanStreaks`; `day_streak` over `streak_days`, Singleplayer in the time
zone `play_days` keeps in `player_meta.tz`, its best never below `player_meta.single_best`, which `play_days` keeps past
the run log's 90 days and raises only in a zone that has stood for a week, `player_meta.tz_at`; `known_tz` takes
IANA Area/Location names and UTC only; `play_days` writes the row only when something changed). A one-player run that is neither education nor test counts the local day it
ends on (`recordCareer('single')`, at the game over) only once it crossed a pipe (plan 48); a Daily Dump
counts its course's UTC day at the run's first pipe (`saveDailyAttempt`, once a run, `this.daily.counted`; no longer at the claim; a practice Daily counts nothing). Every
profile shows 🔥 Current streak and ❤️‍🔥 Longest streak under Singleplayer and under Daily Dump
(`streakProfileRows`; yours from `Stats.streakView`, another player's from the server, above); the ready screen shows a small orange number at the 🌞's bottom right
(the Daily Dump streak) and at the 📚's (the learning streak, under the gold due count), while the streak is alive
and nothing at 0 (`refreshStreakMarks`, `TUNING.streakMarkPx`; both inside their buttons' hit boxes). The 🌞 card
says "🔥 Current streak = n" (0 included) in its note's place, under the four pictures, while its button reads Play,
Checking… or See today's result; with no username or in test mode the note keeps that place (plan 34, round 2).
The subscripts, the 🌞 card's line and both "Your cards" lists read `Play.streakNow(kind)`; the profile's rows
(`Stats.streakView`, `Stats.eduView`) read the same stores with the same day keys and `studyStreakNow`.
**Challenge questions** (plan 34, Michael; code names `superQ` / deck `super` / item `question`, since plan 33's
💪 Challenge mode holds `challenge`): once a level in a 📚 run, while an unmet challenge card is left
(`pickSuperCard`), a ❓ bubble (`assets/question.png`, a see-through placeholder, drawn at
`education.superQ.displayPx` with a `radiusPx` hitbox) rides the band slot after the pair `course.superQPair`
picks (its own stream, `COURSE_SALT.superQ`; never a level's first or last `edgePairs`, level 1's scripted pairs
or the guaranteed box's pair: `armSuperQ` at the start and each level). Its pair and the next open at the same
height and hold still (the next pair's gap and both pairs' moves are still rolled, then dropped, so the course
dropped; `superQStill`: the bubble's pair re-orders its own draws, `gapY(n + 1)` first, which nobody can see, since a
one-player course is random per run and the Daily and matches never arm a bubble; with no bubble armed every pair draws
as before plan 34, tests/superQuestionSpawn.test.js), and it floats `bobPx` on a sine (`floatY`, bob 'float'). It takes the slot
before a box, bean, rolled item or kernel (the kernel moves on). Taken, flown past (`update`'s backstop opens it
when it reaches the poop's x, unless a fart flies through) or farted through, it is gone for the level; a
revive that clears it brings it back on the next pair that can carry it (`clearFieldAhead`). Touched,
`offerSuperQ` holds the run (state paused, physics and effects paused; `superQHold`: `chromeState` reports
playing, so no PAUSED banner, tray row or "?"; `resumePlay` and `autoPause` do nothing) and opens the Quiz in mode
'super', and the bubble pops (`Bubble_Pop.mp3`, Michael's sound; the offer plays no book opening over it,
`Quiz.openingSound`). The offer (plan 34, round 2, Michael) is a 640 × 640 card of its own (`offerRect`, its
`offerTitle` and `offerText`; the full card's header, question and run tally wait for the card, and `placeCorner`
moves the ✕ and the purse): the bubble on a disc of the level's colour, "Challenge question", his sentence ("You
popped a challenge question. Answering the challenge question earns you {reward} corn kernels, but answering it
incorrectly costs up to {penalty} corn kernels. Do you wish to try?", with `superQReward` = rewardBase +
rewardPerLevel × level, 10 to 22, and `education.superQ.penalty`; what a wrong answer takes is `superQPenalty`,
the whole purse if less), then a red Decline | a green Try it (`declineBtn` / `tryBtn`, the answers' own fills).
✕ and Esc decline; no tap or key for retryLockoutMs (`offerLocked`); after it Enter / Space press Try it, but a
held key's repeats do not, and the controller's ring starts on Try it (AUD-068: `try` and `decline` lead the
ring's list). Try puts the full card back (`hideOffer`). After Try the card can only be answered (`closable` false: no ✕, Skip or End Review).
`superQAnswer` saves it as a first sight (right: review later; wrong: missed, due now, so it holds the next
gate) with a study day, pays or charges the purse, and stays out of `runQuiz`, the grade, 💯, 🤓 and the pilot's
events (the server takes break, revive and bonus contexts only; RESEARCH.md says so: once a challenge card is in the bank,
its answers in a level break, after a crash or in the bonus quiz are sent like any card's); a test run saves nothing.
Fly on (held after a miss) closes it and `endSuperQ` resumes with half a flap and at least `beans.graceMs`. The 21
challenge cards (`SQ-01`…, deck `super`; Michael reviews them, `.claude/plans/Archive/34-super-cards-review.md`) are never
a quiz's new card (`inScope`, `chooseCard`'s fresh pool, `browseCard`, `breakDecks`), count in `masteryByDeck`
once met, and come back at any level once in the bank.
**Backup and restore** (plan 28, 3.1b): the cards live in this browser only, so the top of 📚 Education
data, for everyone, is **💾 Back up your cards**. Back up my cards hands a file
`flappy-poop-cards-YYYY-MM-DD.json` (`educationBackup`: the cards, counters, badges, the unlocked level,
the learning streak, the new-card order, start level and new cards per level; never an id, code, sharing state, invitation or
consent) to the share sheet inside the tap on a touch screen (`shareFile`; no text beside it, which can
hide "Save to Files" on iOS), else downloads it; Copy as text puts the same JSON on the clipboard.
Restore takes a file or pasted text (`EDUCATION.backupMaxBytes`, 1 MB, at most) and merges it
(`readEducationBackup`, `mergeEducation`): only on the home screen (`Play.canRestoreEducation`); when it
changed something, the backup's new-card order, start level and new cards per level (plan 28, Stage 3b)
where this device still has the defaults (`restoredSettings`); the 📚 switch never carried, nothing sent;
restored runs never reach the 📚 board: a restore adds nothing to the counters the board and the badges
read, and a longer history goes into `history`, for display only (`shownCounters`; under the share
paragraph below). A
restore into a browser that is not saving says it lasts for this visit only. Clear's warning adds that
the cards go too (`saveClearNoteCards`, where 📚 Education data opens; its notes join without a space in
zh-Hans: AUD-052), and the 📚 popup says the browser can erase them
(`eduIntroKeep`). With the off switch set, the part is reachable only where the panel is (a device that
joined or shares).
**What leaves the device, and only by choice** (plan 21, Stage 3b): the **📚 Education data** panel
(`src/ui/eduDataPanel.js`, a DOM panel like the user panel; from a button in the user panel shown
while the mode is available, the 📚 board's footer and the profile's row; `Play.openEduData`). **Both
parts are by invitation** (plan 28, 2.4): one "Invite code" field at the top serves them; a player not
yet invited sees a note and the field, and the parts show once a code is typed or the player is invited
(the device's settings flag `eduInvited`, set by a share the server took, never by a join; never the code),
shares, or has joined. **An invite link** `…/?invite=<code>` is read once by `main.js`
(`inviteFromSearch`), taken out of the address bar at once (`withoutInvite`, `history.replaceState`) and
handed through the registry (`pendingInvite`) to the first ready screen, which opens the panel with the
code filled in (`Play.openPendingInvite`). The code then waits in the registry (`inviteLink`: this page
load's memory, never storage) and `Play.openEduData` fills it into every opening of the panel until
`startEduShare` or `joinResearch` succeeds (AUD-090: a nameless invitee closes the panel to save a name);
a code typed by hand still goes with the close (AUD-046). On the server, `share_education`'s fourth argument `p_invite`
must hash to `education_settings.invite_hash` (the pilot's code) for a player who is not a 🔧 dev, not
invited (`player_meta.edu_invited`), not a pilot participant and not already on the board ('needs
invite', its own line); every share the server takes marks the player invited, and an invited player
joins the pilot without it. Joining writes nothing outside the pilot's own tables (no `player_meta` row,
no mark: AUD-040), so Withdraw and the purge leave only what RESEARCH.md names. An "I
am 18 or older" box is asked every time and never remembered. **Share my grades** puts the player's
name, average grade, graded-run count and education badges on the **📚 board**
(`Play.startEduShare` / `stopEduShare`; `share_education` / `unshare_education` in `db/schema.sql`,
closed to all but 🔧 devs until the owner runs `admin_set_education_open(true)`). The device's
record stays the education store's; `createEduShareStore` (`flappyPoop.eduShare`) remembers the
round of sharing the server named (`shared_at`) and what the board already has, and
`Play.drainEduShare` (after the career in `syncLeaderboard`) sends what is new, at most 50 runs a
batch, of the record as `boardRecord` gives it: its counters, the graded runs played on this device
(plan 28, 3.1a; the Checkpoint 3 audit, AUD-047). A restore never adds runs to them: another device's
longer history goes into the record's `history`, which only what the player sees reads
(`shownCounters`: the profile's average and runs; the backup file). So restored runs never reach the
board, also from a tab still running an older version or after a rollback (an older client drops
`history` and keeps and sends the counters), while restored badges do (the server joins them and keeps
the earlier day). The 📚 tab's "runs still needed" line reads the same count. `'restart'` (another round: sharing was stopped and started elsewhere) takes the server's
round and sends the whole record again; `'not shared'` turns sharing off here; a rename goes through
`rename_education`, which never adds a player. Stop sharing deletes the row and stays on until the
server has done so. A batch resent after a lost reply is never counted twice: the server keeps each
row's newest 64 batch ids (`recent_batches`, on `player_counters` too), so a resend is answered with
the totals even after another device sent in between. With nothing new to send, a device sends one
empty batch per page load (a probe; the registry's `eduRoundProbed`, set once the server answered),
so it learns of a round started on another device. The share store remembers the last round it sent
into, even after sharing is turned off, so turning it off and on, or two syncs both told to restart,
never send a round's runs twice. A badge day the server finds out of range (a device with a wrong
clock) is stored as today. A 📚 name belongs to one player: `name_blocked` counts the 📚 board's
rows, and sharing or a rename refuses a name another player holds on any board (since plan 25 a
🌞-only or 🏅-only name is likewise one player's on every board). Share and rename wait 5 s per
player (`'too soon'`, read as offline), and a fold takes both players' 📚 locks. The board is a fourth leaderboard tab while education is available
(`leaderboardLayout({ tabs })`, `Leaderboard.showEducation`, `education_board`: from
`education.boardMinRuns` graded runs, by average grade); a sharing player's profile carries
`education` for anyone (`player_stats`), drawn while education is available. **🔬 Tester data** (the
pilot; the notice is `RESEARCH.md`, its version `EDUCATION.consentVersion`): an invited adult joins
with the invite code (`Play.joinResearch`; `enrol_research` checks its SHA-256 and the code is kept
nowhere), after which `quizAnswer` records each answer as an event (`src/research.js`:
`answerEvent`, whose fields are exactly the server's list; `createConsentStore`
`flappyPoop.eduConsent`; `createResearchQueue` `flappyPoop.researchQueue`), never in a test run and
only under the current notice; `Play.drainResearch` sends them early in the sync, username or not
(`submit_research_events`, under a random research id, never the player id). The consent keeps the
player id it joined with (`Play.researchConsent()`, `researchPlayerId()`), so its answers and a
Withdraw still find the participant after a Sign in merges that id away, and the participation's start
(`since`: the server's `joined_at`, set once when the participant is made): a device whose `since`
is not the participant's (a withdrawal and a new join elsewhere) is told `'not enrolled'` and stops.
A join empties the queue, so nothing recorded under an older notice goes out; a re-join keeps the
participant's phase, so `admin_purge_phase` still removes them. Under an older notice the panel
offers Join and Withdraw both (`eduPilotStale`). Withdraw
(`leaveResearch`, `delete_research`) deletes the participant and their answers. 🔬 shows beside 📚
in the HUD while answers are recorded. The pilot tests the tools: its answers are never analysed
and are purged before any later phase (`admin_purge_phase`). Clear forgets the sharing and the
consent on the device and warns that what was sent stays until Stop sharing / Withdraw. The
education, consent, queue and share stores are each one JSON value through `createJsonStore`
(`src/store.js`): another tab's Clear holds at once, and storage that is full or throws keeps this
page load's answers in memory; while its last write is behind, a store still reads storage, and
storage that moved on since the failure (another tab wrote, or Cleared) is taken, this load's unsaved
value dropped, never written over it (AUD-087).
Still to come (plan 21): the privacy foundation (delete account, export, the age question, a
privacy notice), the public release (audited cards only), the research beta and the study.

It is deliberately small: plain ES modules, no bundler, no runtime npm
dependencies (one devDependency for the schema tests), Phaser 4 loaded from a CDN (with a vendored fallback), the Supabase client vendored and loaded only for online play (plan 39), deployed to GitHub Pages straight from
`main`. Keep it that way unless the game clearly outgrows it.

- Repo: `github.com/sielerjm/flappy-poop` (the pre-2026 "joke version" that used
  to live there was replaced wholesale; nothing from it survives).
- Engine: Phaser **4.2.1**, pinned by exact version in `index.html` and in `assets/vendor/phaser.min.js`.
- Runtime: any modern mobile/desktop browser. Tests need Node 22+ (built-in
  `node --test`). `tools/` needs Python 3 + Pillow for art scripts
  (`uv run --with pillow python3 tools/process_art.py` works without installing it).

## Repo map

```
index.html                  Entry page. Viewport/touch CSS; the loading splash's
                            markup (#splash: ring, poop, #splash-note card, ‹ ›,
                            #splash-continue; no words, they come from i18n.js) and
                            CSS (colour tokens on #splash, data-theme for a themed
                            skin, the ‹ card › row, the .texts grid stack, the
                            48 px .art box, bob / slide / Continue's glow, a
                            landscape row, reduced motion; the poop's box is
                            measured against the ring by tests/html.test.js); first of all an
                            inline trap (window.__flappyBoot: the last uncaught error, the
                            Phaser loader, an inline import() of src/splash.js; plan 35,
                            1.1 and 1.2; run in Node by tests/support/bootTrap.js; a script
                            marked data-own-error, the online client's, reports its own load
                            failure, so the trap shows no card for it), then an
                            async <script> for Phaser from jsDelivr (after 6 s or on error
                            the trap loads assets/vendor/phaser.min.js instead; neither:
                            the splash says it could not load), then
                            <script type=module src=src/main.js>. Six
                            <link rel=modulepreload> tags (main, config, logic, i18n,
                            Boot, Play) start those downloads at once (plan 35, 2.4). The
                            main tag and the hrefs are bare in the tree; `npm run push`
                            writes an import map (every module at its ?h= content hash)
                            and the same ?h= into them (plan 35, 3.1; tools/sw_stamp.mjs),
                            and a preload only helps when its href is exactly the URL
                            the import uses. tests/html.test.js checks they agree with the map.
sw.js                       The service worker, a classic script at the root (plan 35, 3.1;
                            "Service worker"). BUILD and FILES are stamped by npm run push;
                            committed unstamped. tests/sw.test.js.
manifest.webmanifest        PWA "Add to Home Screen" metadata (fullscreen, portrait).
package.json                `npm test`, `npm start`, `npm run push`; "license" is the SPDX id
                            PolyForm-Noncommercial-1.0.0 (MIT until plan 28); one devDependency,
                            @electric-sql/pglite (pinned; tests/schema.test.js), so
                            `npm install` once per checkout. The game loads none.
CREDITS.md                  Phaser + every assets/sfx/ file with a URL.
LICENSE                     The code's license: PolyForm Noncommercial 1.0.0, fetched from
                            the PolyForm project (byte-identical to its 1.0.0 tag) under a
                            Required Notice line and a pointer to LICENSE-CONTENT.md (plan 28,
                            1.6). Never edit the license text itself.
LICENSE-CONTENT.md          What else is under which terms: the quiz cards (src/questions.js)
                            CC BY-NC-SA 4.0; art, characters, name, logo all rights reserved;
                            third-party parts under their own (CREDITS.md).
CONTRIBUTING.md             Reports welcome; outside code, art or card changes need a
                            contributor agreement first (so the author can relicense).

assets/vendor/
  phaser.min.js             The vendored copy of Phaser 4.2.1, the same build as the CDN tag;
                            loaded only when the CDN fails or stalls. Bump it with the tag.
  supabase.js               @supabase/supabase-js 2.119.0's official UMD browser bundle
                            (dist/umd/supabase.js, byte for byte; 219,856 bytes, 56 KB
                            gzipped; sets the global `supabase`). Loaded only by
                            src/supabaseLoader.js, on entering online play (🌐); never at
                            boot, no CDN copy. Plan 39, 0.2.
  supabase.LICENSE.txt      Its MIT notice, from the same package.

src/
  phaserReady.js            `await globalThis.__flappyBoot?.phaser`: main.js and every scene
                            import it first, so no `extends Phaser.Scene` or `new Phaser.Game`
                            runs before Phaser exists (a module waits on its imports' top-level
                            await). In Node it resolves at once. tests/phaserFallback.test.js.
  swClient.js               The worker's page side (plan 35, 3.1): registerWorker (Play, once
                            per page load, after the lazy sounds) and stopWorkerIfAsked (main.js,
                            first thing). The decisions are in logic.js (swMode, localHost,
                            workerScope, removeWorker). tests/swClient.test.js.
  supabaseLoader.js         loadSupabase(): appends one <script data-own-error> for
                            assets/vendor/supabase.js?v=<SUPABASE_JS_VERSION> on the first
                            call and resolves with window.supabase; an error, a stall (15 s)
                            or a file with no createClient rejects with messageKey
                            onlineLoadFailed, removes the tag and lets the next call retry.
                            Only src/onlineNet.js (plan 39, 1.4) may call it.
                            tests/supabaseLoader.test.js pins the version and the file's hash.
  main.js                   new Phaser.Game(...): fieldWidth(window) x 1280 logical
                            field (720 on a phone, wider on desktop), Scale.FIT,
                            a debounced window resize (a phone rotation too) →
                            Play.onFieldResize() when the width would change (while a
                            race runs, OnlineRace.onFieldResize: it re-fits the canvas
                            around the same field, no pause),
                            ?join=<code> (plan 39, 4.3) the same way (joinCodeFromSearch,
                            withoutJoin) into the registry's pendingJoin, which
                            Play.openPendingJoin opens in the 🌐 window on the first
                            ready screen with no match;
                            ?invite=<code> read once (inviteFromSearch), taken out
                            of the address bar at once (withoutInvite,
                            history.replaceState) and handed to Play through the
                            registry's pendingInvite (plan 28, 2.4; Play then
                            keeps it as inviteLink until a share or join, AUD-090),
                            roundPixels,
                            arcade physics (fixed 60 Hz step; ?perf=var steps by
                            each frame's delta for a phone A/B), ?perf attaches
                            ui/perfMeter.js, activePointers 2 (two thumbs in a
                            match), input.gamepad on (bound once, in
                            Play), scene order
                            [Boot, Play, new Play('PlayB'), Over, Versus, Settings,
                            About, HowTo, Changelog, Language, Feedback,
                            Leaderboard, Daily, Stats, Quiz] ('PlayB' is the right half of a match,
                            launched only by Versus).
  config.js                 LEADERBOARD.resyncHiddenMs (30000; plan 35, 1.4), GAME_WIDTH / GAME_HEIGHT (the portrait field = the
                            chrome column), FIELD (height, minWidth, maxWidth,
                            resizeDebounceMs), the TUNING object (every
                            feel-related number lives here; poopXFrac = the
                            player's share of the width; prefill.leadGrowth /
                            sweepMs = the pre-fill's lead and sweep-in on a wide
                            field), and LEADERBOARD
                            (Supabase Data API URL + publishable key, both public
                            by design; timeout, limit = a page of 25 places (pages
                            since plan 28, 5.2), visibleRows = the fourteen in the
                            board's window (the ‹ › row under them), storage keys incl.
                            careerKey = flappyPoop.career, streaksKey =
                            flappyPoop.streaks (plan 34), onlineSessionKey =
                            flappyPoop.onlineSession (plan 39; a bearer secret, never
                            exported or sent elsewhere), onlineTrustKey =
                            flappyPoop.onlineTrust (plan 39, 1.6a), onlineRaceKey =
                            flappyPoop.onlineRace (plan 39, 1.8: the room code of the
                            race this device is in, '.test' added on the test project),
                            onlineResumeKey = flappyPoop.onlineResume (2.3: the
                            resume record, localStorage since 2.3b, '.test' likewise),
                            onlineTabKey = flappyPoop.onlineTab (2.3b: this page's
                            tab id, sessionStorage, one key for both projects),
                            score cap),
                            LEVELS (gut segment name keys, in order), LEVEL_COLORS
                            (Set2 backgrounds, cycling) and BACKGROUND (overlay
                            layers: key + parallax), TEST_MODE (trigger words,
                            default Invincible). TUNING.hudProbioticPulse = the
                            HUD icon's breath; resumeFlapScale = the resume
                            bounce's share of a flap; beans.buttonEdgeMarginPx =
                            the bean button's inset by a thumb on a wide field.
                            TUNING.pipeMove = moving pairs
                            (fromLevel, per-level chance / ampPx / periodMs rows). TUNING.gamepad = the pad's
                            standard-mapping button indices (A / B / Y / RT /
                            Menu / d-pad), RT threshold, stick deadzone + repeat;
                            TUNING.focus = the focus ring's geometry, fill alpha,
                            pulse and the overlay scroll step. TUNING.education = Education
                            mode (plans 21, 22): grade thresholds, fsrs (FSRS-6's 21
                            weights, retention, maxDays; plan 26), minGap, generalShare, strikes, restoreStreak,
                            reviveBlinkMs (the blink after Fly on), badgeMinAnswers
                            (answers a run needs to be graded),
                            priceScale, masteredDays, explainMinMs, breakCoins
                            (by kind: new, review, practice, missed; plan 28, Stage 3b),
                            newPerDay (new cards a local day; null: held off, plan 28,
                            Stage 3b), buryCoinsPerLevel,
                            buryPerDay and buryMs (Skip's price, its daily cap for
                            due cards, its least wait: skipUntil), duePerBreak (the
                            stored due cards one break's gate asks; plan 28, Stage
                            3b), newPerLevelChoices and newPerLevelDefault (the 📚
                            popup's 3 / 5 / All and the one pressed until the
                            player chooses; settings eduNewPerLevel), boardMinRuns
                            (graded runs before the 📚 board lists a player),
                            revivePenaltyPerLevel. EDUCATION.enabled = the off switch
                            (plan 28); EDUCATION.words = the old unlock word (poopschool),
                            still refused as a name; EDUCATION.backupMaxBytes = the
                            largest backup a restore reads (plan 28, 3.1b). TUNING.splash = the
                            loading splash (hintMs, slideMs, fadeMs, swipePx,
                            featureMax, storageKey; the ring: ringEaseMs,
                            ringMaxPerSec, ringMinPerSec, ringFrameCapMs, waitCap,
                            waitHalfMs; ringFastPerSec 3.4 and ringCachedMs 1500, the
                            cached-load fill, plan 35, 2.5). TUNING.versus = the
                            two-player knobs: minViewportH (the gate), keys (the
                            two keyboard groups), countdownMs, ghostRangePx /
                            ghostAlpha / ghostFadeMs, barRivalPx / barRivalAlpha,
                            dividerPx, catchUp (superBehind, beanBehindMin,
                            beanOddsMul), scoring (deathPenaltyPerLevel,
                            levelClearBonus: the first over a line only),
                            levelSyncDelayMs (the beat after both
                            reach a line before a tap can start the next level),
                            respawn (crashMs, glideMs,
                            blinkMs, blinkCycles, blinkAlpha).
                            Pure data, Node-safe.
  logic.js                  Pure functions, NO Phaser/DOM: createResync (plan 35, 1.4: send(),
                            one at a time; online() sends, hidden() / shown() send after a hide
                            of LEADERBOARD.resyncHiddenMs; never rejects; tests/resync.test.js),
                            eachChild (plan 35, 1.3: walk a
                            Phaser group's children on a copy, since destroy() splices the live
                            array and a plain for-of skips the next child; Play walks its
                            pipes, items and beans through it; tests/eachChild.test.js),
                            errorReportText, errorCardContext, loopStalled (the error card), Chinese line breaking
                            (cjkUnits, wrapCjk; plan 28, 2.1), the invite link
                            (inviteFromSearch, withoutInvite: one pattern for both,
                            AUD-038), field (fieldWidth,
                            uiColumn, poopX, pipeLeadPx, pipeLead, prefillPairs,
                            sweepOffset;
                            trayLayout /
                            levelBarLayout / readyLayout take a
                            trailing x0 = the column's left edge; readyLayout takes
                            { versus } for the 👥 box; it also returns the 🌞 daily
                            box), rng, createCourse / mixSeed (course.reward(n): a
                            box's reward stream, per pair when shared), the Daily
                            Dump's utcDayKey / msUntilUtcMidnight / countdownText /
                            fnv1a32 / dailySeed / dailyLevel / dailyRunStart
                            (every random draw a run makes behind one object: one
                            stream in single player, exposed as course.rng for the
                            pickup-time mystery draw and the smoke's forced rolls;
                            per pair and purpose in a match's shared course;
                            tests/course.test.js), gap placement,
                            scoring (pipePoints, scorePopup, multiplierLayout),
                            items (rollItem, hazardsAllowed, bandItemsMove,
                            bandMidY, tutorialSpawn), beans (rollBean, beanSpawnX, beanY,
                            beanAngle, bobY, gapBobAmplitude, gapBobY,
                            poopTapHit; beanButtonLayout(width, height, t, {
                            colWidth, hand, match }): centred, or by the hand's
                            thumb at beans.buttonEdgeMarginPx from the edge of a
                            field wider than the column outside a match;
                            beanButtonHit's circle is twice the
                            drawn button), poopFrame (the live poop's texture
                            key: plain / stink frame, or the falling faces at
                            fallLookVy px/s down; `scared` wins with the near-miss
                            face, poop-scared or poop-stink-scared1/2), pipeClearance
                            (px from the poop's circle to a pipe's rect), fart envelope (pipeSpacing,
                            fartPeakMul, fartMul, fartRemainingDistance), fartFloat
                            (wave + tilt), moving pipes (pipeMoveParams,
                            pipeMoveAmplitude, pipeMoveShiftPx, rollPipeMove), hsvToRgb / rainbowHue, glowAlphaAt /
                            glowStops, sprite angle, VERSION (bump it when art
                            under an existing file name changes: Boot's ?v=; every
                            bump needs a CHANGELOG entry), versionText(locale,
                            version) = the "v0.5.16 beta" line every overlay shows, retry
                            lockout, levels (levelPipes, levelEnd, levelFor, isFinalLevel,
                            levelSpeed, levelColor, levelProgress,
                            levelBarLayout, lerpColor),
                            best-score store, settings store (incl. locale,
                            howToSeenAt, skipSplash (plan 35, 4.2; off by default) and hand: HANDS 'left' | 'right', the
                            bean button's side; eduStartLevel 1 … levels.lastLevel,
                            plan 25;
                            eduNewOrder after / mixed / before, plan 26;
                            eduNewPerLevel 3 / 5 / 'all', EDU_NEW_PER_LEVEL, plan 28
                            Stage 3b; eduShowHow / eduShowChoices, only true
                            shows (the 📚 popup's Show / Hide, plan 28, 4.2; folded
                            by default since plan 34);
                            reviveGiveUpWarned is gone since plan 26's A2) +
                            howToPromptDue, vibrate helper, trayLayout, trayHit,
                            readyLayout (plan 25's ◀ level ▶ stepper boxes went to
                            the 📚 popup in plan 26), readyHit, nextEduStartLevel (wraps within
                            the levels unlocked), eduIntroKey (the 📚 popup's
                            keys; AUD-032),
                            eduBreakLayout (an education
                            break, plan 26 and its A2: the banner's titleY, Shop |
                            Review | Quit on one row, the numbers' chip under
                            Review, the level choice's ◀ LV n ▶ on ⏸'s row; plan 28),
                            LAST_UPDATED, issueUrl, openExternalUrl, chromeIntent
                            (inputs incl. 'changelog'; a Changelog over About closes
                            back to About without the lockout),
                            overlayOutsideHit, clampScroll, scaledCircleBody; gamepad:
                            padAction (button index → action), stickNav, focusNearest
                            (spatial: the nearest item in a direction, straight
                            ahead beating a diagonal), focusStep (list order,
                            wrapping: the fallback), focusRingLayout, padIntent
                            (the pad's state matrix beside chromeIntent: what A / B /
                            RT / Menu / Y / nav do on Play, Over, an overlay or the
                            versus join / result screen: versusSelect / versusBack;
                            the tournament panel open: 'panel');
                            rollMystery(rng, t, draws) takes an optional draw table
                            (the versus catch-up); coins and the shop: BAND_ITEMS,
                            MYSTERY_COINS, createEffects restoreLevel (2.3: back to a
                            level's start as snapshot() kept it, the purse set where a
                            revive's restore() adds; bag capped, no postbiotic without a
                            probiotic, a running fart gone), addCoins / spendCoins /
                            coins, SHOP_ITEMS, buyBlocker / canBuy, shopButtonLayout
                            / shopButtonHit, bracketButtonLayout (the 🏅 pill under
                            the 💰 in a race's shared level break), shopLayout / shopHit, chromeIntent's
                            shop / breaking args and 'shop' input; test mode:
                            isTestWord, testRunStart, nextTestLevel, TEST_POWERS,
                            settingsLayout (Settings panel 1010 px + rows, taller with the
                            test section, 1240). Fully unit-tested.
  changelog.js              What's new data, NO Phaser/DOM: CHANGELOG (one entry per
                            version, newest first: version, date like LAST_UPDATED's
                            day, notes per locale), changelogEntry, changelogNotes
                            (bulleted block for a locale, English fallback).
  achievements.js           Achievements and lifetime counters (plan 08), NO
                            Phaser/DOM: ACHIEVEMENTS (id, kind 'run' / 'lifetime' /
                            'seasonal', glyph, title / desc i18n keys, n, counters,
                            from / to, check), countsAsRun (plan 48: a run that
                            crossed no pipe is not counted), runDeltas (one run's counters, capped
                            as submit_counters checks), addCounters (= the SQL's
                            merge_counters), cleanCounters, evaluate (newly earned
                            ids), windowOpen, progressOf, bestFacts (veteran
                            credit), openQuests, achievementById, isAchievementId;
                            EDU_ACHIEVEMENTS (plan 22: the eight education badges,
                            their own list with edu_ ids, kept on the device and
                            never claimed), eduRunFacts (a run's tally → answered,
                            right, graded, grade, perfect, gaveUp, full, and since
                            plan 34 won and caughtUp; GRADE_MAX, 10000 = 100 %, the
                            one scale the stores and the share store use),
                            nextPerfectStreak (the perfect-run streak, still counted,
                            no longer 🤓's: 🤓 is one won, caught-up perfect run since
                            plan 34), averageGrade (the mean of the graded runs);
                            v0.16.0: a run entry's `modes` (default single player),
                            IBS_WINS / WINDOW_DAYS / BREAK_DAYS / FOUR_OF_A_KIND,
                            levelCloseShave, winsInWindow, daysBetween,
                            nextDrawStreak. Fully unit-tested (tests/achievements.test.js).
  fsrs.js                   FSRS-6's maths (plan 26), NO imports: FSRS_W (the 21
                            default weights), GRADE_NUM, retrievability,
                            initStability / initDifficulty, nextDifficulty,
                            shortTermStability (a second answer the same day),
                            nextStability (recall or lapse), nextIntervalDays. Ported
                            from py-fsrs (MIT, its notice in the header); checked
                            against py-fsrs's own test results (tests/fsrs.test.js).
  education.js              Education mode's scheduler and local store (plan 21), NO
                            Phaser/DOM: gradeFor (wrong = again; right on first sight
                            = good; later easy / good / hard by response time,
                            TUNING.education.grade), schedule (FSRS-6, no learning
                            steps: new → review or missed; a practice right answer
                            leaves the schedule alone), cardRetrievability, pickCard
                            (break: the cleared segment's new cards and its one
                            general card (breakDecks / breakDeckOf: gut order, plan
                            28, Stage 3b), then missed, then due reviews (least
                            remembered first), then practice; revive: missed, due
                            reviews, new from the decks up to the level, practice;
                            a buried missed card is never picked; never a card of
                            the session or a retired one; the last minGap wait;
                            a break's two limits, plan 28 Stage 3b: newLeft caps
                            its new cards, dueLeft the stored due cards its gate
                            asks, the most urgent first, this break's misses on
                            top; past dueLeft the other due cards come marked
                            beyond, before practice; cardCounts counts the same),
                            a test run's 'browse' pick walks the level's deck in id
                            order, then general, then the other decks, cards not yet
                            shown first),
                            shuffleOptions, reviveStart / reviveStep (strikes →
                            choice → streak → revived / restored / over; giveUp marks
                            gaveUp), reviveSettled, newTally / tallyAnswer (the
                            run's answers in all and per level),
                            cardCounts (what a quiz can still ask now: new, missed
                            and review, by pickCard's filters; context 'break',
                            'revive' or 'all'; the pill's and the card's numbers;
                            a break's own quiz passes dueFirst with its misses and
                            limits, Play.breakQuizOptions, the same set pickCard
                            gets: without dueFirst neither `missed` nor dueLeft
                            applies; a limit is floored, never below 0; AUD-058),
                            eduShopPrices (base × priceScale per level), masteryByDeck
                            (per deck: seen, mastered, total; "Your cards" sums it),
                            plan 25: pickCard's dueFirst and missed (a level break's
                            own order; counted cards before practice), cardCounts'
                            missed, unlockLevel / unlockedLevel, bury / buriedOn
                            (plan 26 A2: buried keeps the day's ids, buriedIdsOn,
                            pickCard's skipped; skipPractice adds a practice card's
                            uncounted, AUD-028; skipNew a new card's, plan 28
                            Stage 3b),
                            localDayKey, skipUntil (a due Skip's wait; AUD-029);
                            plan 26: NEW_ORDERS and pickCard's order,
                            newAllowance and localDayStart (the daily new-card cap,
                            which cardCounts' new respects too; held off since plan
                            28, Stage 3b: Infinity while newPerDay is null);
                            createEduStore (LEADERBOARD.eduKey = flappyPoop.eduSrs:
                            each card's record and the last cards shown, and (plan
                            22) the education counters and badges: addRevive,
                            endRun(facts), unlock(ids, day); plan 26 A2: answer's
                            paidDay and the paid { day, ids } record, paidOn;
                            studyDay and the study { day, streak, best } record,
                            nextStudyStreak / studyStreakNow; plan 28, 3.1a: the
                            history { gradedRuns, gradeSum } record, a restore's longer
                            history, display only (kept while longer than the counters,
                            grown by endRun; AUD-047), and restore(backup,
                            { today }): one merge and write, { added, updated, badges,
                            changed, saved }); the backup (plan 28, 3.1a):
                            educationBackup (a fixed list of fields: cards, counters,
                            badges, unlockedLevel, study, and the eduNewOrder,
                            eduStartLevel and eduNewPerLevel settings (the last since
                            plan 28, Stage 3b; a 0.20 file reads as 5); never an id, code, sharing state,
                            invitation, consent, recent, paid, buried or pending; its
                            counters are shownCounters), readEducationBackup (the text around the
                            outermost { … } ignored; cleaned as the store cleans; only
                            the game's education badges, AUD-051; 'unrecognised' /
                            'newer' / 'tooBig'), mergeEducation (a
                            card's later schedule wins, reviewedAt then lastAt, a record
                            dated over a day ahead never (AUD-048), a card skipped here today keeping
                            its wait; the counters this device's, revives the larger,
                            the longer history's grade pair into history; badges at
                            the earlier day, the higher level,
                            learning streaks joined as spans; twice changes nothing),
                            boardRecord (what the 📚 board is sent: the counters'
                            runs, never a history, and every badge), shownCounters
                            (what the player sees: a longer history's runs and grades),
                            restoredSettings (plan 28, 3.1b: the backup's order,
                            start level and, since Stage 3b, new cards per level
                            where this device has the defaults), NEW_PER_LEVEL
                            (TUNING.education.newPerLevelChoices, as logic.js's
                            EDU_NEW_PER_LEVEL), dueCount
                            (the 📚 switch's count), cardText (zh-Hans when a card has
                            it) / optionText, cardSource (short citations: "Martinsen
                            et al. 2005"), EDUCATION_EMOJI. Fully unit-tested
                            (tests/education.test.js).
  runStats.js               One run's summary as numbers (plan 30), NO Phaser/DOM:
                            createRunStats (begin, frame, level, pipe, skip, fall,
                            closeCall, death, flap, press, release, breakStart /
                            breakEnd, shopOpen / shopBuy, pause / resume, end → the
                            row submit_runs takes), stubRow, RUN_DATA_KEYS (=
                            run_data_keys() in db/schema.sql). Preallocated: nothing
                            called while a run flies allocates (tests/runStats.test.js).
  research.js               The education tester pilot's client (plan 21), NO
                            Phaser/DOM: answerEvent (one quiz answer as a flat
                            record; EVENT_FIELDS is the server's list of known
                            fields, pinned by tests/research.test.js), cleanEvent,
                            tuningVersion (a fingerprint of TUNING.education),
                            createConsentStore (flappyPoop.eduConsent: version,
                            phase, at, the player id it joined with and since, the
                            participation's start; never the invite code), createResearchQueue
                            (flappyPoop.researchQueue: pending events and one batch
                            in flight). Nothing here runs unless a tester joined.
  questions.js              Education mode's question bank (plan 21), NO
                            Phaser/DOM: LEVEL_DECKS (the LEVELS keys) and DECKS
                            (those, then 'general', then 'super': plan 34's 21
                            challenge questions, SQ-01…),
                            CARDS ({ id, deck, q, answer, wrong: [w1, w2], explain,
                            refs, retired?, zh }; every live card has its zh
                            { q, answer, wrong, explain } since plan 28 (2.1; terms in
                            TRANSLATION_NOTES' card glossary; zh is outside the audit
                            hash); ids permanent, a wrong card is
                            retired, never deleted), REFERENCES (numbered sources);
                            plan 26: CARD_LINKS (card id → 1–3 { term, title }: the
                            explanation's Wikipedia words) and REFERENCE_DOIS (number
                            → DOI, Crossref-matched), outside a card's audit hash.
                            The source of truth for the cards since 12 Nov; 70
                            placeholder cards and 21 challenge cards (plan 34), all
                            unaudited. tests/questions.test.js.
  richText.js               Text with links in it (plan 26), NO Phaser/DOM: linkSpans
                            (the first whole-word occurrence of each term) and
                            layoutRich (greedy word wrap into centred lines of parts,
                            from a measure the scene passes), so the quiz can draw
                            each link underlined with a tap box. tests/richText.test.js.
  questionAudits.js         Who checked which card, and when: QUESTION_AUDITS
                            ({ id: { by, on, hash, note? } }, written by
                            tools/audit_questions.mjs between its BEGIN / END lines),
                            cardHash (FNV-1a over the English facts: q, options,
                            explain, refs; not deck, retired or zh), auditState
                            ('audited' while the hash matches, 'stale' after an
                            edit, 'unaudited'). A stale audit fails the tests.
  tournament.js             Tournament (🏅) logic, NO Phaser/DOM: createTournament
                            (seeded 2-, 4- or 8-slot bracket, byes; buildBracket
                            from tour.order), seedSlots / canReseed / reseed (swap
                            two seeds, pure) / reshuffle, matchPlayers, nextMatch,
                            recordResult, isDone, placings (bronze null for two),
                            raceOutcome (score, crashes, 🏁, first across the final
                            line), linkedCount / postable (3+ players and someone
                            linked) / tournamentPayload, and the lobby claims
                            claimFromCode (in memory only) / claimHost. Fully
                            unit-tested.
  tournamentNames.js        Guest names: GUEST_WORDS (clean, short) and
                            rollGuestName (AdjectiveNoun###, rerolled on a clash).
  versus.js                 Two-player match logic, NO Phaser/DOM: versusAvailable
                            (landscape + minViewportH), versusLayout (two half-window
                            fields, capped at maxWidth / 2), joinButtonsLayout (the
                            join screen's Bracket box), createMatch / resetMatch
                            (the smoke's rematch) / slotTemplate, keyGroup / sameDevice / claimDevice /
                            allClaimed / deviceLabel (the join screen), ghostPlacement
                            (scaled by the other's alpha, 0 once ended), rivalMarker,
                            catchUpTier / catchUpDraws, matchResult (score, fewer
                            deaths, draw), respawnPose (the crash →
                            glide → blink → done timeline, pure in elapsed ms),
                            respawnBlinkStart (the clock with only so much blinking
                            left: an education revive skips the glide),
                            coursePairStart / courseDistance (a pair's place on the
                            course; what a half's distance reads with a pair a given
                            lead ahead), matchHostKey (the scene key that hosts a
                            match: match.hostKey, else 'Versus'), VERSUS_EMOJI;
                            createMatch's options (levelPipes, names, tournament)
                            ride a rematch. Fully unit-tested
                            (tests/versus.test.js).
  online.js                 Online race (🌐, plan 39) pure parts, NO Phaser/DOM/network:
                            ONLINE_EVENTS (the client events on room:<code>, never the
                            server's guest / answer / left / status) with createSender
                            (seq, server time t, session sid), parseMessage (every field
                            typed and bounded, extras dropped) and createInbox (state
                            only newer, other events once in any order, a reload's new
                            sid retires the old); protocolVersion (fnv1a32 of the
                            events, the race tuning and a shared-course probe; derived)
                            and compareVersions (the older app updates);
                            presencePayload / parsePresence (join-time only);
                            agreedWidth (the smaller field, item 14); formatCode /
                            parseCode ('482 913', full-width digits, no leading zero);
                            createClock (lowest round trip of TUNING.online.clock.samples,
                            re-sync each resyncMs); createGhostTrack (a slot for
                            ghostPlacement / rivalMarker / raceOutcome, extrapolated
                            under gravity, a flap replayed exactly, corrections
                            smoothed or snapped) and shouldSendPos (keyframes mid-run);
                            roomInit / roomStep / codeExpiresAt / racePhase (the lobby's
                            room over RPC results and server events); createNetSim and
                            NETSIM_PROFILES (latency, jitter, loss, reorder; the fake
                            transport and ?netsim); SERVER_EVENTS, verifiedRoomAction
                            (a server event name is a hint, confirmed with room_state)
                            and netsimProfile (?netsim, dev hosts only). Knobs in
                            TUNING.online (clock, net, ...). 2.3: the `rewind` event
                            { round, level, at } and the pause reason `rewind`; roomStep's
                            `rejoin` action (room_state's answer for the race this device
                            still sits in: only a playing race, this device's seat).
                            4.2: roomStep's `invited` (accept_invite's answer: this device is the
                            guest and the room is 'ready' at once, no code, no Let in) and
                            `renew` (a Resend kept the host's open room: its changedAt moves).
                            4.3: joinLink(code) (SHARE.url + ?join=<code>), joinCodeFromSearch
                            (the first join parameter that holds a room code) and withoutJoin
                            (the address without it, the rest of the query and the hash kept).
                            tests/online.test.js.
  onlineInvites.js          Online race (🌐, plan 39, 4.2) invites on the client, NO Phaser/DOM:
                            inviteRow (a row taken only whole), inviteLeftMs, ringShare (the
                            share of the span left) and mmss, each from the server's `sent_at`
                            and `expires_at` alone: there is no client INVITE_TTL, so nothing
                            drifts from what the server checks. incomingRows (invite_list's live
                            incoming, one per friend), topicEvent (the topic's two events,
                            `invite` and `invite_update`, parsed or dropped), inviteErrorKey
                            (the error words) and createInvites({ rpc, now }): load() (the
                            topic comes only from invite_list, never built from the save's id),
                            onEvent, prune (expiry), count, accept and decline. Shown, read and
                            subscribed only in online mode (the beat's rule).
                            tests/onlineInvites.test.js.
  onlineNet.js              Online race (🌐, plan 39) transport for one page:
                            createOnlineNet(deps) and ONLINE_RPCS. Nothing loads until
                            signIn() / warm(); the only caller of loadSupabase(). Anonymous
                            sign-in (no user data), a stored session reused under
                            LEADERBOARD.onlineSessionKey (pageStorage() when storage
                            throws), autoRefreshToken off and its own token ticker.
                            rpc(fn, args) for ONLINE_RPCS only, with a timeout, as
                            { ok, data } or { ok: false, error }. syncClock / pump /
                            serverNow feed createClock. openRoom(code, ...) joins one
                            private channel room:<code> after a refresh; send() only
                            while joined; take() returns what arrived (peer, room,
                            presence, channel); error, cap and rejoin rules follow the
                            0.3 spike. close() keeps the session, signOut() is local. close() counts
                            calls: a first load or sign-in still out at a close starts no ticker,
                            socket or clock (AUD-145). signIn({ create: false }) reuses a
                            stored session only (Sign out and Sign in; AUD-146).
                            ?netsim delays and drops received messages. Per-frame calls
                            are synchronous. Knobs in TUNING.online.net. Callers: the
                            sign-in side, src/onlineAccount.js, and the lobby,
                            src/onlineLobby.js. onlineProjectConfig({ search, hostname,
                            optIn, storage }) picks the project (returns { config, test,
                            param, dev }): the live one, or on a
                            dev host (debugHandleAllowed) the test project `?onlinetest=
                            <code>` stored in this browser (encodeDevProject /
                            devProjectFrom; `=off` forgets it) under its own session and
                            trust keys (DEV_PROJECT_KEY). ONLINE_RPCS includes finish_match
                            and online_history, plus friend_list, send_friend_request,
                            respond_friend_request, remove_friend, block_user and
                            unblock_user (3.1), online_beat and friend_statuses (3.2), send_invite, invite_list,
                            accept_invite, decline_invite and cancel_invite (4.1); the server's plain messages include
                            'online closed', 'no match', 'bad result' and 'bad peer'.
                            beacon(fn, args) (3.3): an online function as a keepalive POST to the Data API with
                            the session's token, never awaited, false when nothing can send it; ONLINE_RPCS
                            functions only. The token guard test's one exception (pagehide's online_beat(false)).
                            It sends the token the client refreshed to (`session` follows TOKEN_REFRESHED) and
                            nothing on an expired one (T3-review AUD-112).
                            4.2: openTopic(topic) joins the player's own topic that invite_list names
                            (private, no presence, no self; only 'user:' and 32 hex), queues
                            { kind: 'user', event: 'invite' | 'invite_update' | 'joined' | 'closed' }
                            (every join, a rejoin too, queues 'joined': the panel reads invite_list
                            again); closeTopic() and topicState() ('none' / 'joining' / 'joined').
                            close() closes it, and so does the race's hand-off.
                            T4-review AUD-127: lease() (each 🌐 window at startOnline, each race at
                            initRace takes one) returns a release that closes the transport only if no
                            later lease was taken, so a window opened while leave_room answers keeps it.
                            tests/onlineNet.test.js, tests/onlineDevProject.test.js.
  onlineAccount.js          Online race (🌐, plan 39, 1.6a) the sign-in side on top of
                            createOnlineNet, NO Phaser/DOM: enter (sign in, link the
                            device), claim (a new name under the board's rules), devices,
                            remove, pairCode, pair and leave (unlink, then signOut()),
                            each as { ok, … } or { ok: false, errorKey } (an i18n key
                            the screens show; item 35's sign-in errors incl. rate
                            limited); races() (2.5: online_history → historyRows, the
                            🏁 Recent races). leave() signs in with create: false, so a
                            dead stored session is not replaced by a new user only to sign out.
                            tests/onlineAccount.test.js.
  onlineLobby.js            Online race (🌐, plan 39, 1.6c) the lobby controller, NO
                            Phaser/DOM: createOnlineLobby({ net, name, width, onBothReady })
                            runs one room from Create / Join to both Ready over roomStep,
                            fed only RPC results and { kind: 'room' } items. A guest
                            leaving or the code running out makes a new code; Decline
                            moves the channel to the answer's new code; `ready` at
                            LOBBY_LEVEL 1, newest wins; the peer's presence is version
                            checked (who must reload). Messages are i18n keys; the panel
                            polls poll(). roomItem(item) feeds a room item in; finish() and
                            rematch() are host only (set_room_status 'finished', then
                            'playing' again with a new seed, round + 1); start() shares
                            its code with rematch. A refused Start reads onlineErrTooSoon
                            (the server's race-a-minute pacing), a paced link onlineLinkLimited.
                            The join keypad (ui/tournamentPanel.js keypadKey) drops a repeated Enter (one join, AUD-142);
                            digits and Backspace still repeat. Item 46: createOnlineLobby({ memory })
                            (get / set / clear of the race's room code, the panel's
                            raceMemory over LEADERBOARD.onlineRaceKey): remember() at the
                            hand-off, and a code still there at creation, or before a
                            Create / Join, is left first (leave_room; they wait for it);
                            the code is cleared only once a leave_room returns ok or
                            'no room', so an offline leave keeps it (AUD-096),
                            since a reload mid-race leaves the room 'playing' and the
                            server refuses a seated device a new room ('in a race', up to
                            6 h; message onlineErrInRace). 2.3: createOnlineLobby({
                            resume }) skips that leave on entry (the resume record
                            is the race to rejoin; 2.3b: the panel's raceMemory hides the
                            code while another page's record is live) and
                            notice(key) puts one status line on the lobby (2.3b:
                            `onlineRaceElsewhere`); rejoin(record) asks room_state:
                            playing → the channel opens as this seat first
                            (net.openRoom(code, { seat })) and only then roomStep's
                            `rejoin` makes the room this seat's (the panel's poll never
                            hands off a race whose join can still fail), then handOffRace's
                            hand-off with a resume plan; a failed open leaves the lobby
                            idle, removes the channel, keeps the record, leaves nothing
                            (2.7, AUD-108); no room, finished or abandoned → { over }
                            (code and record forgotten, "That race is over."); offline or
                            a refused channel keeps both and never leaves the room.
                            4.2: createOnlineLobby({ onUser }) hands the player's topic's items on to
                            the panel; invite(peer, name) (the Friends row's Invite and Resend:
                            send_invite makes the room or keeps the open one, 'renew'; only when
                            canInvite() holds: no room or an open one we host), inviteUpdate (a
                            friend's no shows 'declined', a cancel drops it, an accept reads
                            room_state), acceptInvite(accept) (the 'invited' step, then the
                            channel opens as the guest's) and inviteLeftMs. state.invite is
                            { invite, peer, name, sentAt, expiresAt, status }. 4.3: joinCode(code,
                            { link }) joins a share link's code; a room gone reads
                            'onlineLinkExpired', the code kept on the join screen.
                            T4-review AUD-124: invite and acceptInvite set Connecting (screen 'busy')
                            before a remembered stale leave. AUD-126: a cancelled accept leaves the
                            seat it was given. AUD-129: a cancelled Resend leaves a room the late
                            answer made, unless it is the one leave() already left.
                            tests/onlineLobby.test.js, tests/onlineJoinLink.test.js.
  onlineFriends.js          Online race (🌐, plan 39, 3.3) friends, NO Phaser/DOM: createOnlineFriends
                            ({ rpc, max }) over friend_list, friend_statuses and online_history:
                            the lists (requests to answer, friends sorted online, in a game,
                            offline, then by name; requests sent; Blocked), the recent
                            opponents (TUNING.online.status.opponents, not yet friends, asked
                            or blocked; a race with no peer handle is left out), offer(name)
                            for the results panel, ask / accept / decline / take back /
                            remove / block / unblock, each as { ok, ... } or { ok: false,
                            errorKey }. createStatusBeat({ rpc, beacon, beatMs }): the device's
                            online_beat; start() (beats at once, then every beatMs from a
                            window setInterval; a 'not trusted' answer stops it quietly),
                            stop() (online_beat(false) at once; { quiet: true } sends
                            nothing), hide() (pagehide: the keepalive beacon) and show()
                            (pageshow from the back-forward cache: beats again).
                            tests/onlineFriends.test.js.
  onlineRace.js             Online race (🌐, plan 39, 1.7a, 1.7b) per-frame rules, NO
                            Phaser/DOM/timers: raceStartPlan (room → seed, names, seat,
                            agreed width, round), countdownStep, localPhase, linkQuality,
                            createRaceFeed({ now, send, since }) (what goes on the wire from
                            the local half and the other seat rebuilt from what arrives; at most one
                            `flap` per TUNING.online.flapMinMs (200 ms): faster taps fold
                            into one sent at the window's end with the poop's state then,
                            dropped if the run is not flying (AUD-144);
                            `since` drops messages stamped before this round's GO; the
                            run's end is fixed once (doneFixed()), its pos and done go
                            each frame until the transport takes done (doneSent(),
                            AUD-098), and no award is taken once it is fixed;
                            its link dot reads good while the peer's newest message says it
                            waits in a break or has finished, silence counts only mid-run),
                            createRaceReferee({ seat, now, send, since }): first over each
                            line on server time (a guest's `finish` claim, which carries
                            the time it crossed as `at`, still on the wire wins a near
                            tie; it goes again at once after a refused send and every
                            TUNING.online.race.claimResendMs until the line settles
                            (verdictWaitMs); the host answers a repeat with its verdict,
                            at most once per half a claimResendMs (AUD-147), and a guest that
                            knows the verdict claims nothing; the host answers a guest's pause
                            word with a resume at most once per half a heartbeatMs; the host takes its own line after
                            TUNING.online.race.firstGraceMs with no earlier claim), one
                            `first` per line; `ready` marks keyed by the level they start,
                            resent every readyResendMs; both ready and the host in its break
                            with the shop shut → the host's `go` with startAt = now +
                            countLeadMs + 3 × versus.countdownMs; a ready taken back more
                            than cancelMarginMs before GO calls the count off (`go` with
                            cancel: true; later taps do nothing); a side still in its break
                            that sees the other's pos running that level begins at once;
                            both `rematch` asks → the host's app calls the lobby's rematch
                            (a standing ask repeats every readyResendMs).
                            createFieldFit({ mine, theirs, heard, now, send, until })
                            (item 14, AUD-097): from the race's start to its GO each
                            side sends `width` (with `heard`: whether it has the other's) every
                            widthResendMs only until it hears the other's, then goes quiet and
                            answers only a width whose `heard` is false, at most one per
                            widthResendMs (AUD-143: a rewound race waiting for Ready sends
                            none; a width carried over a restart sets the field but does not
                            count as heard); the newest heard
                            replaces the presence width; agreedWidth of the two is
                            fieldW(); receive() is true when it moved; peer() the
                            newest heard; nothing is sent from GO on.
                            raceRoomItem (only the confirmed status 'playing' / 'finished'
                            reaches the lobby; a leave or abandoned room goes to the shared
                            pause instead, which ends the race with no winner, 2.2).
                            createRacePause({ seat, now, send, present, since, round })
                            (plan 39, 2.1): the shared pause. Either device's trigger
                            pauses both; both Ready and the host's resume count restart
                            both at one server ms; a disconnect never ends a race, only
                            the room's confirmed leave or abandon. createRaceReferee's
                            tick takes `held`: no count starts, a running one is called
                            off before GO, the grace and the verdict wait stand still.
                            The feed holds the ghost for it (2.2): hold(at) stands it at
                            `at` (or where the other side's first `pause` message says it
                            stopped), release(after) lets go at the first ghost message
                            stamped at or after `after`, heardT() is the newest ghost
                            message's server time, again() sends the run's end once more
                            (the other side came back and may have missed it).
                            pauseOverlay(state, { midRun }) (pure): the overlay's i18n keys
                            from the machine's state(): null while live or over,
                            { count: true } in the resume's 3-2-1, else title (this side's
                            link first, then the other's, then PAUSED), sub, each player's
                            row and the Ready button (null while this side's link is down,
                            and when no tap is needed: in a break or before GO).
                            raceReport / raceNetStats / createRaceReporter / reportLine (2.5): the
                            finish_match report and its results-panel line (the Tournament
                            paragraph, "Online reports").
                            createWakeLock(nav) (item 16): want(true) keeps the screen on
                            (one lock, asked again after a resume), want(false) lets go,
                            refused quietly where unsupported; held().
                            Knobs in TUNING.online.race and TUNING.online.pause (silenceMs,
                            heartbeatMs, leaveConfirmMs 4000: Leave's second tap).
                            2.3 (reload resume): createResumeStore (the record in
                            localStorage since 2.3b; blocked storage keeps nothing, never
                            throws), parseResume (whole or null, version RESUME_VERSION 2:
                            owner + beat, no older than
                            TUNING.online.resume.maxAgeMs), resumePlan(record, room), levelSnap
                            / startSnap (a level's start, sanitized / level 1's), rewindOnHeard
                            (the lower of the two level starts); the feed's and the referee's
                            floor(at) drops what the other side sent before its restart; the
                            pause machine's own reason `rewind`, cleared by its Ready.
                            2.3b (app restart, a second page): resumeOwner({ record, tab,
                            wall }) → 'mine' / 'live' (another owner beat within
                            online.resume.staleMs 5000) / 'free' (no beat, a beat ahead
                            of the clock, or stale) / null; the store gains owner(),
                            claim(), beat(), holder() and never writes over or clears
                            another page's live record (set → false); pageTab (this page's
                            id in sessionStorage, marked closed on pagehide so a duplicated
                            tab, which copies sessionStorage, takes a new one). Knobs
                            online.resume.beatMs 1000 and staleMs 5000.
                            tests/onlineRace.test.js, tests/onlinePause.test.js,
                            tests/onlineResume.test.js.
  leaderboard.js            Shared leaderboard, NO Phaser/DOM (plan 39, 2.5 adds
                            createRacePostQueue over LEADERBOARD.racePostsKey; plan 34 adds
                            createStreakStore and STREAK_KINDS: flappyPoop.streaks,
                            the Singleplayer and Daily Dump day streaks, never
                            sent; merge folds in fetchPlayDays' days, 34.13):
                            submitPlan / submitPlans
                            (pure: what to post; up to two rows per player, best
                            off and best on the toilet, via save.js bestByToilet),
                            createSubmitStore (flappyPoop.leaderboard: last
                            confirmed submit per kind, { off, on }), submitScore /
                            fetchTop / fetchRank(id, toilet) over the Supabase
                            REST API with an injected fetch, apikey header only,
                            4 s abort, false / null on any failure, never throws
                            (submitScore: { ok } or { ok: false, reason: 'nameTaken'
                            | 'refused' | 'other' }, request's errors flag reading the
                            PostgREST message). checkNameAvailable (true / false /
                            null), mergePlayers, createMergeStore
                            (flappyPoop.merges: queued { keep, merge } pairs until
                            the server confirms), fetchPlayerName (the board's name
                            or null), fetchBoardName (the name, '' for no rows, null when
                            it cannot say: Play.postRace's read), createRenameStore (flappyPoop.rename: a rename
                            typed here), nameAction ('adopt' / 'keep'). Tournaments:
                            submitTournament ('ok' / 'keep' / 'rejected': only the
                            server's own bracket refusal drops one), fetchTournamentBoard,
                            createTournamentQueue (flappyPoop.tournaments, capped;
                            drains joined per storage, outcomes for the podium).
                            Both queues sit on createPostQueue. Daily Dump:
                            createDailyStore (flappyPoop.daily: this device's
                            attempt, read back for the same day and player;
                            release drops an unfinished 0-pipe record, spent is
                            final or pipes above 0; plan 48),
                            createDailyQueue (flappyPoop.dailyQueue, one entry per
                            player and day, outcome 'nameTaken' kept),
                            submitDailyScore ('ok' / 'keep' / 'rejected' /
                            'nameTaken'), fetchDailyBoard (rows with me and total).
                            Profiles (plan 08): createCareerStore (flappyPoop.career:
                            pending counters, one batch in flight resent until
                            confirmed, the server's totals per player id, unlocks and
                            claims), submitCounters ({ status: 'ok', totals } / 'keep'
                            / 'rejected'), claimAchievements ({ stored, closed } /
                            'rejected' / null), fetchPlayerStats({ id } or { name }:
                            the profile, { found: false }, or null).
                            Run summaries (plan 30): createRunQueue
                            (flappyPoop.runQueue: { playerId, row }, add / remove /
                            claim, pins), submitRuns ('ok' / 'rateLimited' /
                            'rejected' / 'offline'), waitsForRun; fetchTop({ playerId })
                            asks score_board, the table read as its fallback.
                            Pages (plan 28, 5.2): fetchTop, fetchDailyBoard,
                            fetchTournamentBoard and fetchEducationBoard take
                            opts.offset (p_offset only past page 1, so page 1 asks
                            as before; the table read's offset=); withOwnRows(rows,
                            ranks, name, limit, offset) splices only an own rank on
                            the page; boardPage(rows, { offset, limit }) splits a
                            ranked board's answer: the page's rows (the caller's only
                            on its own page), mine (the caller's row, wherever it
                            is: the footer), last (no page follows). Plan 35, 4.5:
                            opts.peek makes a fetcher ask limit + 1 (p_limit 26; the
                            server caps at 100); boardPage reads the row at place
                            offset + limit + 1 (ranks are row_number), drops it, and
                            calls the page last when none came back; 🏆 (no ranks) is
                            last when rawRows.length <= limit. 🌞 and 📚 keep their total.
                            The 📚 board (plan 21): createEduShareStore
                            (flappyPoop.eduShare: on, the round sharedAt, the name
                            last sent, what was sent, one batch in flight, and the
                            last round it sent into, kept so a round never starts
                            over (restart into it does nothing);
                            beginBatch(record, makeId) works out what is new, 50 runs
                            a batch), shareEducation ({ status: 'ok', sharedAt } /
                            'closed' / 'needsInvite' (plan 28; a code over 200
                            characters is refused here) / 'notAdult' / 'nameTaken' /
                            'rejected' / 'offline'; 0.18.0's client reads 'needs
                            invite' as offline), renameEducation, unshareEducation (true /
                            null), submitEducationGrades ('ok' / 'restart' with
                            sharedAt / 'notShared' / 'rejected' / 'keep'; an empty
                            batch is the round probe),
                            fetchEducationBoard; normalizeProfile keeps a cleaned
                            `education`. The tester pilot: enrolResearch (the phase
                            and since), submitResearchEvents(playerId, batch,
                            events, since) ('ok' / 'notEnrolled' / 'rejected'
                            / 'keep'), deleteResearch.
                            Writes go through the submit_score(), merge_players(),
                            submit_tournament(), submit_daily_score(),
                            submit_counters(), claim_achievements(), the 📚 board's
                            and the pilot's SQL functions.
                            Fully unit-tested with a fake fetch.
  share.js                  Sharing a file, NO Phaser; navigator / document / URL
                            injected: shareMode ('share' when
                            canShare({ files }), else 'download'), shareFile
                            (navigator.share called synchronously inside the tap,
                            with the file and only the title / text given; AbortError
                            = cancelled, never a download; other errors and no share
                            sheet → <a download>; useSheet false always downloads;
                            never rejects; plan 28, 3.1b), shareScoreImage (the
                            game-over PNG with its title and text: shareFile).
  splash.js                 The loading splash (plan 01). Pure, Node-safe:
                            SPLASH_NOTES (id, kind 'feature' | 'hint', glyph, i18n
                            key, art { file, frames | crop } on the sprite cards;
                            features newest first), splashArtUrl (Boot's URL),
                            ringTarget / ringStep (the ring; `fast` = a cached load) /
                            ringCachedLoad (plan 35, 2.5), splashPool, nextNote (the
                            deck: unseen features first, every card once per cycle,
                            no repeat across a reshuffle, ids that left or joined
                            the pool handled), createBrowser (one load's history:
                            back / forward replay without drawing), swipeIntent,
                            createSplashStore (flappyPoop.splash, throw-guarded).
                            DOM, document / window injected: startSplash
                            (idempotent; the inline import or Boot, whichever is
                            first), setSplashProgress, splashReady(onContinue), skipWanted(storage)
                            (plan 35, 4.2: the skipSplash setting, read when Continue lights).
                            Fails open: an error removes the splash and starts the
                            game. tests/splash.test.js.
  streak.js                 Day streaks (plan 34), NO Phaser, no imports: dayNumber,
                            nextDayStreak (the same day or the day before changes
                            nothing, the next day adds one, a gap or a clock error
                            starts at 1 with the best kept), dayStreakNow (0 after
                            a missed day), cleanDayStreak, mergeDayStreak and
                            dayKeyOf (34.13: days played on any device folded into
                            a record; never lowers the best). The learning streak
                            (education.js) and the Singleplayer and Daily Dump
                            streaks (leaderboard.js's createStreakStore) use it.
  store.js                  createJsonStore(storage, key, clean) (plan 24), NO
                            Phaser, no imports: one JSON value in browser storage,
                            the pattern the education stores share (education.js,
                            research.js, leaderboard.js's share store). Storage that
                            can be read is the truth (another tab's Clear shows at
                            once); a missing key or broken entry reads as empty;
                            memory serves only when storage throws or is full, for
                            this page load. saved() (plan 28, 3.1a): whether the value
                            outlives this page load (false with no storage, after a
                            failed write, while reads throw, or on pageStorage(),
                            blocked storage's stand-in). While unsaved it still reads
                            storage; a value other than the one held at the failure is
                            another writer's and wins (AUD-087). tests/jsonStore.test.js.
  save.js                   Save codes, NO Phaser/DOM. checkNewName (the save
                            panel only): a new username is 4–16 code points (2+
                            with CJK), no whitespace, emoji or NAME_BLOCKED word;
                            the name already saved always passes (legacy names).
                            validateName (1–16, every other path) is unchanged;
                            the server's rules are unchanged too. loadLocal / saveLocal
                            (flappyPoop.save, schema 3: top entries { score,
                            toilet, level }; schema 1 numbers and schema 2 still
                            load at level 1; MAX_TOP = 6), recordScore(state,
                            score, { toilet, level }),
                            merge, mergeBoardBests (the board's rows into top),
                            topScores (the numbers; tests read it), formatScore ("🚽 41"),
                            profileLine, exportCode / importCode (HMAC-SHA256,
                            v1 payload {i, n, s, p, [l], [h], t}; p = optional toilet
                            flags; h = 'l' only for a left-handed player, handed
                            back as `hand` beside the state, never in SaveState;
                            via Web Crypto, else sha256.js where crypto.subtle is
                            missing, e.g. a plain-http LAN page; 16-byte tag,
                            base64url), PARSERS per wire version, SECRET constant
                            (permanent). Fully unit-tested.
  sha256.js                 sha256 / hmacSha256 in plain JS, NO imports: save.js's
                            signer when the page has no Web Crypto (browsers give
                            crypto.subtle only to https and localhost). Pinned by
                            FIPS / RFC 4231 vectors and parity with Node's HMAC.
  i18n.js                   en / zh-Hans string catalog, t(), initialLocale,
                            howToItems, pauseBannerText, metaFontSize, welcomeText,
                            levelBannerText(locale, level, levels) ("Tap to
                            continue" in every break since plan 26's A2),
                            eduProfileRows (your own profile's learning streaks and
                            highest level unlocked, plan 26 A2),
                            countText (a coin count beside the corn kernel: "12", or
                            ∞ for a test run's purse; locale-free).
                            Player copy lives here (not in logic.js). See
                            TRANSLATION_NOTES.md.
  sound.js                  WebAudio synth blips + setMuted/isMuted/attachGame.
                            setMuted also sets game.sound.mute (the MP3 samples).
                            unlock() must run from a user gesture: create,
                            silent-prime, resume() the AudioContext, and
                            game.sound.unlock(). Blips wait until running.
  input/
    pad.js                  bindPad(scene, onAction, t): Phaser Gamepad plugin →
                            pad actions. Edge-triggered 'down' (holding A flaps
                            once), RT threshold lowered on connect, sticks polled
                            on the scene update with key-repeat, a console warning
                            on a non-standard mapping; every action is handed on with
                            the pad's index (a match routes A / RT to the half that
                            claimed that pad); returns padDown(index, padIndex) /
                            padNav(dir, padIndex) shims for the smoke driver. Only
                            Play binds (P1 in a match; P2 never).
  ui/
    errorCard.js            The error card (plan 35, 1.1), a DOM panel (panelFrameCss): main.js
                            installs it as __flappyBoot's handler. Mid-run it pauses the run and
                            offers Reload or Keep playing (errorCardContext: 'run', 'daily' where
                            Reload would end today's attempt, 'menu' shows at once). An unhandled
                            rejection shows it only when the frame loop has stopped (loopStalled).
                            tests/errorCard.test.js.
    focus.js                createFocus(scene, t, { items, scrolled, onVertical }):
                            (an item's optional rect() is its resting place, walked
                            and drawn in place of obj's live bounds: a tray button
                            mid-slide, plan 28, 4.3)
                            the controller focus ring, a pulsing pink rounded
                            outline (Graphics, depth 1000) around one item of a
                            scene over a faint white fill (focus.fillAlpha) that
                            is moved in the display list to sit directly under
                            the focused object (same depth; a box item: just
                            under createButton's depth; a Zone: no fill), so the
                            button's art draws over it; a nav press moves to the
                            nearest visible item in that direction (focusNearest)
                            and falls back to the list order (focusStep, wrapping)
                            when nothing lies that way; the ring rings one item of a
                            scene; items are { id, obj | box, activate, visible?,
                            scrolled? }, pressable(id, obj) wraps a Game Object
                            whose own pointerdown is the press. Shows only in
                            controller mode (registry padMode: set by a pad press,
                            cleared by the scene's next pointerdown), so touch and
                            mouse never see it. scrolled items are ringed by a
                            second Graphics the scroll camera alone renders.
    finish.js               createFinishTexture(): black / white checkered
                            canvas texture for the finish line.
    pipeShade.js            createLightTexture(): a lighter copy of a texture
                            (white laid over its own pixels): 'pipe-moving', the
                            moving pairs' pink.
    levelBar.js             createLevelBar(): a dark-brown track with a thin dark
                            outline (barTrackColor, barOutlineColor / Px), the fill in
                            the level's own colour (setColor; Play.refreshLevelBar
                            passes levelColor raw, no white blended in: plan 28, 4.4)
                            tweened one step per pipe (levelProgress), LV n label (the
                            level's colour on the track, white on the fill), 🏁;
                            geometry from levelBarLayout(). setRival(marker) /
                            rival(): the other player's marker in a match (a small
                            faded poop at rivalMarker's share; gold at the 🏁 a level
                            ahead, grey at the start behind).
    perfMeter.js            The frame meter, debug only (?perf / ?perf=var, perfMode):
                            a DOM <pre> over the canvas (no texture upload, survives
                            Play's restarts) redrawn every perf.refreshMs from
                            createFrameStats / perfLines (logic.js): the display's
                            period (median raw delta), script ms, and per run
                            (perfRunStart at launch) long frames blamed on the
                            previous frame's PERF_TAGS (perfMark: pipe, spawn,
                            pickup, daily), the worst frame and the share of frames
                            whose physics stepped 0 or 2+ times (perfSteps from
                            Play.update). Also globalThis.__flappyPerf.
    glow.js                 createGlow(): white radial-gradient canvas texture
                            (solid core, outer glowFadeFrac fading to 0, from
                            glowStops) as an Image behind the poop; tinted for
                            the rainbow, alpha / scale tweened by Play.
                            createRectGlow(): rounded-rect halo (canvas shadow
                            with the box cut out) for the home user button's "Sign in" prompt.
    tray.js                 Phaser wrapper around trayLayout: leaderboard (🏆) /
                            mute / settings bottom-right, pause directly above the
                            cog, plus bottom-left info, language (🌐), feedback (💬).
                            Chrome taps use trayHit() in Play/Over, not GameObject
                            pointer handlers. Returns buttons (id → circle) for the
                            focus ring, and setRowShown / rowShown (plan 28, 4.3): the
                            bottom row slides down off the field (trayRowSlideMs) and
                            back; ⏸ stays; restBounds(id) gives a button's resting
                            rect (the ring's rect()). Play.syncChrome drives it every
                            frame, on pausePlay / resumePlay and before each tap, pad
                            action and ring move (frames may lag), by logic.js's
                            chromeShown: the
                            row on the home screen, in a pause, in a level break and
                            at game over, down while flying (the launch, a respawn, a
                            match's countdown and race); a tap where it was flaps.
                            The ready screen's ? keeps its box (readyLayout.howto,
                            with the 🌞 on its row, below the progress bar by
                            readyTopRowGapPx) and also shows in a pause and a level
                            break (depth 30, above the shade), never under a quiz or
                            at game over, never in a match. Over's tray slides in.
    shareCard.js            The share image, NO Phaser: drawShareCard(ctx, layout,
                            data, images) paints the 1080x1350 card with Canvas 2D
                            (dark fill, pink frame, GAME OVER or the gold win line,
                            the happy poop in a tan level-1 frame, score · level,
                            fiber / probiotic / postbiotic over bacteria / bean /
                            mystery-icon, the pipe cap ×n, the Play: link);
                            renderShareCard() draws it on a fresh canvas and
                            resolves canvas.toBlob's PNG or null (never rejects).
    button.js               createButton(): Graphics rounded rect + centred text
                            for the ready-screen boxes from readyLayout. No pointer
                            handlers; Play resolves taps with readyHit(). pulse(on)
                            breathes the label around its fitted scale (the ? and
                            the user button while their prompts are due).
                            labelScale() for the smoke. `icon` ({ key, frame, px }):
                            an image left of the label, the pair centred (the shop
                            pill's corn kernel); iconShown for the smoke.
    coinText.js             createCoinText(scene, x, y, style, { align, px, depth }):
                            text, the corn kernel ('coin', frame 0), text, on one
                            line anchored left, centre or right; set(before, after),
                            setIcon(on), setAlpha, width, destroy. The shop's purse
                            line and prices ("Bag full" with no kernel).
    countLine.js            createCountLine(scene, x, y, { style, px, sep, glyph,
                            depth, maxWidth }): education's three card counts on one
                            line, new / missed / review in COUNT_COLORS (blue,
                            red, green), an optional leading glyph, shrunk to
                            maxWidth; set(counts, underline) underlines one count
                            in its colour. The 📚 pill ("📚 5 · 2 · 8") and the quiz
                            card ("5 + 2 + 8").
    toggle.js               createToggle(scene, box, { on, glyph, glyphLeft }): the toilet switch
                            (pill track, knob tween, 🚽 alpha) from readyLayout().toilet,
                            with glyph 👥 the two-player switch from
                            readyLayout().versus, and with glyphLeft 👈 / glyph 👉
                            Settings' hand row (the off-side glyph lit) from
                            settingsLayout().hand; setOn(). No pointer handlers.
    overlayStack.js         The overlay stack: OVERLAY_SCENES (chromeIntent id →
                            scene key), activeOverlays() bottom to top by scene
                            order, isTopOverlay() (every overlay's Esc / ✕ / close()
                            guard, so one Esc closes only the top panel),
                            hasOverlayUnder(), and openChangelog() for the version
                            lines. Play.chromeArgs and padTop read the top from it.
    infoCard.js             createInfoCard(scene, { x, y, width }, { ownCamera, depth,
                            onShow, onHide }): the explanation card (a dim, an emoji or
                            a texture, a title, lines, ✕; a release anywhere closes
                            it). The profile puts it on its own camera above its
                            scroll band; Over at a depth above the ring.
    scrollView.js           createScrollView(): second camera clipped to a panel
                            interior, drag / wheel via clampScroll(), thumb, link()
                            that fires on pointerup only when moved < 12 px; offset,
                            scrollBy, scrollTo and addScrolled for the focus ring;
                            ignore(objs) and setEnabled(on) for a layer above the band.
                            Used by HowTo and About.
    tabs.js                 createTabs(scene, box, { glyphs, index }): the
                            leaderboard's 🏆 · 🌞 · 🏅 row (a track, a pill that
                            slides behind the chosen glyph); nearestTab(x, xs) picks
                            the tab under a tap. Purely visual, like createToggle.
    pager.js                createPager(scene, { x, y, gap, width, height, onTurn }):
                            a board's ‹ 26-50 › row (plan 28, 5.2), two rounded
                            arrows over zones (the tap boxes and the ring's 'prev' /
                            'next'), set({ prev, next, label }) greys an arrow, which
                            then ignores taps and A; pageRangeText(offset, count,
                            limit) is the label ("26-50", a short last page "51-60").
    tournamentPanel.js      Plain DOM panel over Versus (or over Play: its versus()
                            lookup returns the Versus scene only while it runs,
                            game.scene.isActive('Versus'), as Phaser keeps a stopped
                            scene's object; over Play, ✕ / Esc only close it; there the 🌐 view is forced
                            on, over Play's 👥 start where two halves do not fit),
                            every two-player session's front door: lobby (count, Paste code / Guest / Use my
                            player rows, ?, Start), seeding (until the first race:
                            pairs, ⠿ drag, ↑ / ↓, 🎲, Play, Abandon), bracket
                            (results, next match, Play, Abandon on two taps), peek
                            (read-only, from a level break's 🏅 pill), podium (New
                            tournament, Home), help. State in the registry
                            'tournament'; races start through Versus.restartWith;
                            results arrive on 'tournament-race' ({ then }: 'next'
                            races on, else the panel). tournamentPadAction walks its
                            buttons for a controller. ROUND_KEYS names the rounds.
                            4.2: loadInvites (invite_list on entering 🌐, on Friends and when the
                            topic joins again, then net.openTopic), onUserItem, sendInvite,
                            acceptInvite, declineInvite; closeTopic at the race hand-off.
                            T4-review: stopOnline closes the topic at once (AUD-127) and the transport
                            through the window's lease (startOnline takes it; the hand-off clears it);
                            sendInvite and acceptInvite draw Connecting after the call starts (AUD-124);
                            the home's badge tick reads invite_list again when topicState() is 'none'
                            (AUD-130); none is read while a resume record is rejoined, and rejoinRace
                            reads it when the race is over (AUD-131); a ?join= code is joined once a
                            stale race is found over, dropped if it could not be reached or another
                            window still races (AUD-128).
                            4.3: openTournamentPanel's `join` option (a share link's code) is kept
                            through the sign-in, a name chosen first and a Retry, and joined once
                            linked (joinFromLink); Share without a share sheet copies its text
                            ('onlineLinkCopied'). shareCode calls share() and writeText inside the
                            tap; with neither (a page that is not a secure context, such as a phone
                            on the Mac's LAN address) copyInTap copies through a hidden textarea and
                            execCommand('copy'), and with no way to copy the text itself shows on the
                            status line (Michael's phone check, 22 Nov: the buttons did nothing there).
                            The 🌐 view (plan 39, 1.6c): mounts onlineAccountViews and
                            onlineLobbyViews, pre-warms the transport on entering,
                            polls the lobby, leaves the room and closes online play on
                            every exit; ✕ in an online view goes back to the online home;
                            the keypad takes typed digits and a paste. 2.3: startLobby
                            reads the resume record, makes the lobby with `resume`
                            and calls lobby.rejoin(record) (status "Rejoining your
                            race…"); the record waits through the sign-in and link
                            screens; the panel hands every race the store. 2.3b: mine
                            or free → claim() first, then rejoin; live (another page
                            has the race) → no rejoin, no leave, lobby.notice(
                            'onlineRaceElsewhere') and one lookAgain after staleMs
                            (ctx.timers, cleared by stopOnline) that claims and rejoins
                            if the lobby is still idle; raceMemory().get() hides
                            item 46's code while the record is live, so a Create or
                            Join there never leaves the other page's race.
                            3.3: the online home gains 🤝 Friends (onlineFriendsViews); once linked, and
                            after pairing (onPaired, only with 🌐 on, 3.6), Play.onlineStatusBeat() starts; leaving online
                            mode stops it (online_beat(false)) unless the race took over (o.handed);
                            stopOnline stops ctx.play.onlineStatusBeatRef, a beat that exists (AUD-122), and builds none.
                            T3-review: a link answering after 🌐 was switched off starts nothing (AUD-113);
                            a window showing the race another page runs does not beat (that page does: one
                            device, one row), and starts when lookAgain claims the race (AUD-114).
                            The only caller of the beat's start() in src/ (tests/onlineFriends.test.js guards it).
                            tests/onlinePanel.test.js.
    panelFrame.js           The frame every DOM window shares (plan 28, 4.1):
                            panelFrameCss(id, { width }) gives the backdrop (fixed
                            over the page, padded by the screen's safe area,
                            max(16px, env(safe-area-inset-*)), as the splash) and
                            the card's size (min(92vw, width), never past the
                            padded box: it scrolls inside; never in vh, which an
                            iPhone Home Screen app counts over the whole screen, so
                            a 90vh card ran its ✕ under the clock). eduIntroPanel,
                            eduDataPanel, savePanel and tournamentPanel put it first
                            in their CSS.
    onlineAccountViews.js   Online race (🌐, plan 39, 1.6a) the sign-in side's screens
                            (Preview B): name claim, linking, devices, pairing code,
                            pair, errors. Plain DOM over onlineAccount.js's results;
                            tournamentPanel's 🌐 view mounts them (1.6c). keypad(): the code
                            boxes keep one height empty or typed, so the keys never move on
                            the first digit (item 70, N9); a press redraws the keypad, so the
                            pressed key carries `hit` (light pink) for KEY_FLASH_MS (150 ms)
                            after it (st.hit; item 70, N10).
                            tests/onlineAccountViews.test.js.
    onlineLobbyViews.js     Online race (🌐, plan 39, 1.6c) the lobby's screens (Preview A):
                            home, Connecting, host code with countdown and Share / Copy,
                            asked, keypad, knock, ready. Plain DOM over onlineLobby's
                            state. On a dev host ui.project ('live' / 'test', from
                            Play.onlineProjectName(), null on the real site) adds
                            onlineDevOnLive / onlineDevOnTest to the no-room error.
                            Both ready shows onlineStarting (the panel's onBothReady starts
                            the race, 1.7a). 4.2: the host's invite line ("Waiting for <name>
                            to answer", m:ss) with Resend after a no or the two minutes. 4.3:
                            Share sends joinLink(code) alone, no line before it (item 70, N1);
                            Copy copies the code alone. The 🌐 row locked on (a screen too
                            narrow to split) reads onlineSwitchOnSub, with no line saying why
                            (item 70, N4). The home ends with a yellow onlineBetaNote
                            (#tour-beta, `note warn`: online is new, 💬 reports a bug; 24 Nov);
                            `.note + .share` spaces the safety note off Recent races | Devices.
                            tests/onlineLobbyViews.test.js.
    onlineFriendsViews.js   Online race (🌐, plan 39, 3.3, Preview G) the 🤝 Friends button
                            with its badge (requests waiting; online mode only) and the
                            Friends screen: requests (Accept | Decline), friends with a
                            dot and a word, requests sent (Take back), Recent opponents
                            (only a ⋯), Blocked (Unblock); a row's ⋯ holds Remove, Block
                            and, on an opponent, Add friend; Remove and Block ask twice.
                            3.6: tournamentPanel's accountUi() has mark(), a guard taken when a call goes
                            out (same online object, still on, no help/peek view, same screen key
                            `${st.view}|${lobby screen}`); openFriends, run(), openDevices, openRaces
                            and onPair draw only while it holds; openFriends returns true when it drew;
                            a refused Friends action reads the lists again before its error line (AUD-116).
                            pollFriends and refreshBadge are the panel's timers' reads.
                            4.2: Invite on a 🟢 friend's row; a friend who invited you comes
                            first with their ✉️ (a ring of the time left and m:ss, redrawn in place
                            once a second by inviteTick) and ✕ to turn it down; a row wraps its
                            buttons under the name (`.slot.fr`) when the name does not fit, so a
                            long name never clips the time; ✉️ n beside the 🤝 Friends button.
                            Plain DOM over onlineFriends and onlineInvites.
                            tests/onlineFriendsPanel.test.js, tests/onlineInvitesPanel.test.js.
    savePanel.js            Plain DOM panel over the canvas (plan 44: one 420 px card).
                            Signed out: the title, an intro line, Sign in (save-have-btn)
                            and Create user (save-new-btn), each opening its own screen
                            with ‹ Back (save-back). Sign in: the paste field, a preview
                            card parsed from the code alone, the guest line, Sign in
                            (save-load-btn); a guest's progress joins the code's player
                            via Play.queueMerge. Create user: the username field and
                            button, then the code popup (save-explain, Copy code, Got it).
                            Signed in: the name and best, 👤 Profile and 📚, the code with
                            Copy, the username (a rename, saved on blur), Sign out
                            (save-clear-btn) and Merge players…, and a (?) button
                            (save-help-btn) for "What's on this page". Sign out: an inline
                            confirm with the code, Clear's notes (cards, 📚 sharing, pilot
                            consent, an older notice's, 🌐) and Cancel, then Play.signOut.
                            Merge players…: both cards, a tap picks the one that stays (this
                            device by default); this device kept → merge_players(device,
                            code) + noteRename + Play.forgetBoardCache; the code kept → the
                            old Load; this player's own code → "That's already you."
                            Sign out and Merge steps hide the rest of the dashboard.
                            claimName asks the board once per name (blur and Create user
                            share the promise; the button is never disabled, a disabled
                            button would swallow the phone tap that blurred the field):
                            taken → refused with the Sign in steps, unknown → saved with
                            the offline note. The fields are type="search" with
                            autocomplete="off" and the password-manager opt-outs
                            (NO_AUTOFILL). A 📚 Education data button beside Profile,
                            shown only while education mode is available (refreshClear:
                            Play.educationAvailable()), closes this panel and opens
                            ui/eduDataPanel.js; closing 👤 Profile (Play.openStats(target,
                            { onClose })) or 📚 Education data (openEduData({ onClose }))
                            from here opens the dashboard again. Opened by the ready
                            screen's user button without focusName; the Daily Dump's and
                            the profile's Create user buttons pass { focusName: true } and
                            land on the Create user screen with the caret in the field.
                            Disables game.input.keyboard while open so typing does not
                            flap. The test-mode word in the username field toggles
                            Play.setTestMode instead of renaming; blur never stores it.
                            Copy calls clipboard.writeText inside the tap handler (iOS);
                            falls back to selecting the field.
                            tests/savePanelStates.test.js (the states, Sign in, Sign out),
                            tests/savePanelMerge.test.js (Merge players…).
    eduIntroPanel.js        The 📚 popup (plan 26): plain DOM, built like
                            eduDataPanel.js; opened at every start from the ready
                            screen with 📚 on (plan 26 A2: Play.launch). The beta
                            note, how the mode works, the player's cards, the start
                            level (◀ LV n ▶; none in test mode), the new-card
                            order with a line for the pressed one (ORDERS), new
                            cards per level (3 / 5 / All, PER_LEVEL, with its line;
                            plan 28, Stage 3b), the daily cap while it is a number,
                            the data line (eduIntroDevice, then
                            eduIntroKeep: the browser can erase the cards, so add the
                            game to the Home Screen and back up; plan 28, 3.1b; no
                            space between them in zh-Hans) with a link to 📚
                            Education data, Close | Play. Clicks wait retryLockoutMs after it
                            opens (canRestart); its keys (onKey on logic.js's
                            eduIntroKey: Enter presses Play from the card, repeats
                            and a key held from before swallowed); focus on the
                            card, and on a button kept across a redraw (AUD-026).
                            A controller ring over its buttons
                            (eduIntroPadAction), Esc / B close; Play's shutdown
                            closes it.
    eduDataPanel.js         Plain DOM panel (plan 21, Stage 3b), built like
                            savePanel.js, from the user panel's 📚 Education data
                            button, the 📚 board's footer or the profile's row: the
                            one place a player chooses what of their education
                            record leaves the device. First, for everyone (plan 28,
                            3.1b): 💾 Back up your cards (#edu-backup-*: the card
                            count; Back up my cards, shareFile inside the tap, the
                            share sheet on a coarse pointer, else a download, waiting
                            while a sheet is open; Copy as text, to the clipboard or
                            into the box; Restore from a file (#edu-restore-input,
                            1 MB at most, reset after each pick) or pasted text
                            (#edu-restore-text, no autocorrect; a keystroke moves
                            only its button), through Play.restoreEducation, only
                            while Play.canRestoreEducation (the home screen, no
                            match), else disabled with eduRestoreGoHome; its own
                            status line; a share, copy or file read that ends after
                            the panel closed is dropped (one session per opening)). By invitation (plan 28): the
                            invite note and one "Invite code" field (#edu-invite-code,
                            filled by an invite link: openEduDataPanel's invite) above
                            both parts, which show once invited or a code is typed.
                            An "I am 18 or older" box
                            (unticked on every open, needed to share or join), Share
                            my grades (Play.startEduShare / stopEduShare; each
                            refusal its own line) and 🔬 Tester data: the notice's
                            link and Join (shown unless joined under the current
                            notice), and Withdraw and delete my data,
                            shown whenever the device holds a consent, an older
                            notice's included (the state line then reads
                            eduPilotStale): Play.joinResearch / leaveResearch /
                            researchConsent. Keyboard off and the pad ignored while
                            open (padIntent's savePanelOpen); the card takes focus
                            on open (tabindex -1), so Esc closes it with no click
                            first. openEduDataPanel({ game, play, locale, onClose }),
                            closeEduDataPanel, isEduDataPanelOpen. onClose(changed)
                            lets the board and the profile reload when sharing
                            changed.
  scenes/
    Boot.js                 preload() gameplay PNGs (mystery.png as a 192 px
                            spritesheet; coin.png as a 106 px one) + the sfx MP3s every run
                            needs (coin, coin-spend, shop, fart / fart-accelerate /
                            level-up); book-open / book-flip / book-close, sparkle,
                            bubble-pop and flush are not loaded here but by Play.loadLazyAudio
                            (plan 35, 2.3); create() makes the global
                            'mystery-spin' (mystery.frameMs) and 'coin-spin' (coin.frameMs)
                            anims, then hands splashReady() the start of Play: Play
                            starts on the splash's Continue. The loader's progress
                            fills the splash's ring.
    Play.js                 State machine: 'ready' -> 'playing' -> 'paused'/'dead'
                            (loadLazyAudio, once per create() on the scene's first 'render':
                            loads the six sounds Boot skips that are still missing, with
                            this.load.start(), one load at a time across Play and PlayB via
                            the registry's 'lazyAudio', cleared on the loader's complete or
                            the scene's shutdown; every use checks cache.audio.exists, so
                            playSample falls back to its synth and the flush is guarded in
                            Versus and OnlineRace; tests/lazyAudio.test.js)
                            (+ 'respawn' in a match, between a crash and its restart,
                            and in an education run, from a crash through its revive
                            quiz).
                            The constructor takes the scene key ('Play'; 'PlayB' is
                            the second instance for a match's right half); init(data)
                            reads { player, match, fieldW, fieldX } (nothing in
                            single player). create() starts with applyFieldSize()
                            (setGameSize to fieldWidth(window) if it changed; a
                            match half skips it and sets its camera viewport to its
                            strip instead), then W = this.fieldW (the canvas, or
                            the half's strip: the only this.scale.width read outside
                            the fit, tests/scenes.test.js), this.col = uiColumn(W),
                            this.poopX = poopX(W): the world (background rect + tileSprites
                            at tile scale minWidth / texture width, pipe / item /
                            bean / finish spawns at W, pause shade, banners) uses
                            W; the chrome (tray, level bar, ready boxes, test
                            badge, bean HUD, probiotic HUD's right edge) uses col.
                            onFieldResize() sets fieldResizeWanted and autoPauses
                            a running run; update() restarts the scene once
                            canRefitField() (ready, not launching, no overlay /
                            Over / save panel).
                            prefillPipes() (start, endLevelBreak, endPower; a
                            no-op while finishSpawned: a fart cut at the line
                            leaves the break's own pre-fill to fill the next
                            level) spawns prefillPairs' pairs through spawnPipePair(shift) /
                            spawnBandItem(kind, stillY, shift) (shift = px left of
                            the edge spawn), stops at levelEnd, and sets
                            distanceSinceSpawn so the cadence resumes one spacing
                            after the last pair; skipToFinish passes the same
                            shift to spawnFinishLine(shift). On a wide field
                            prefillPipes tags the new objects (data 'sweep' =
                            { baseX }, alpha 0, velocity 0, x += o0 = edge − first
                            pair) and sets this.sweep; update() drives x = baseX −
                            scrolled + dx and alpha from sweepOffset until done →
                            endSweep() (snap to baseX − scrolled, alpha 1, untag,
                            applyScroll). applyScroll skips tagged objects;
                            activatePower, skipToFinish and endRun call endSweep()
                            first.
                            Never read GAME_WIDTH in a scene (tests/scenes.test.js).
                            Spawns pipes and items, tray, auto-pause, haptics, dies,
                            then launches Over as an overlay scene. Tray / keyboard
                            go through chromeIntent. The top overlay is the one
                            launched or brought to top last (ui/overlayStack.js).
                            Opening Settings, About, HowTo, Changelog, Language,
                            Feedback, or Leaderboard while playing pauses;
                            closing them does not resume. Unpause applies
                            resumeFlapVelocity (resumeFlapScale × a flap, 0.5) as
                            a recovery bounce, none during a fart. Pause banner is two centered lines
                            from i18n. Locale via getLocale / applyLocale. Holds the
                            SaveState (loadLocal on create, seeded once from the
                            legacy best); die() records the score (endRun) and
                            launches Over (showOver). Ready screen (readyLayout: a round "?" in the
                            top-right (howto; under a pulsing createGlow halo while
                            howToPromptDue(settings, LAST_UPDATED), i.e. until this
                            build is acknowledged by opening How to play or dying),
                            title, poop spot wearing poop-speech.png's "TAP TO
                            FLAP!" bubble, toilet toggle, and the user button
                            (profileButtonText(): "Sign in" under a pulsing
                            createRectGlow halo until a name is set, then "name ·
                            best"; either way it opens the save panel, on the name
                            field while unnamed); any other tap starts); launch() swaps to the
                            plain poop frame and slides it to poopX over
                            launchSlideMs (700), or againSlideMs (350) on Over's
                            Play again (launch({ solo }); plan 35, 4.1), then
                            start(); extra taps during the
                            slide are ignored (launching flag). Toilet mode:
                            this.toilet from the registry (session-only), toggle
                            under tap to flap, 🚽 HUD left of the score while
                            playing, passed to recordScore and Over. Score popups
                            (scorePopup() in logic.js, TUNING.popup), two reused
                            texts: showPipePopup(mult) is the quick white "+1"
                            ("+2" under a postbiotic) on every pair, restarted by
                            the next pipe; showScorePopup(kind, mult) fades "+3" /
                            "−3" after fiber or an unshielded bacteria hit. The
                            ones showing stack oldest first on popup.rowY
                            (popupOrder + popupSlots(); enqueuePopup puts a new or
                            restarted one underneath, dequeuePopup on fade-out and
                            layoutPopups slide the rest up over popup.shiftMs).
                            Postbiotic: refreshProbioticHud swaps probioticIcon to
                            the 'postbiotic' texture (the icon sits in the
                            probioticHud container, which setProbioticPulse
                            breathes on hudProbioticPulse while the count runs;
                            paused with the run, scale 1 once spent) and setMultiplierBadge() shows
                            the "×2" at multiplierLayout() (TUNING.postbiotic) in
                            two layers: multGlow (text shadow + padding, alpha
                            pulse) under the crisp, shadowless multText, which
                            follows its scale. collectItem counts postbiotic starts
                            (applyFiber() true) in this.collected.postbiotic. All
                            popup / badge tweens pause with the run. Beans: group
                            spawned in spawnPipePair (rollBean with beanSpawned for
                            the one-per-run guarantee, halfway to the next pair), bobbed in update() from per-bean elapsed ms;
                            moving pairs: the top pipe carries { move, elapsed, mate, gapH }
                            from rollPipeMove and update() places both columns (gapBobY),
                            frozen while paused;
                            collectBean → effects.addBean (up to maxBeans; holdingBean
                            = bag full or farting); setCharged() alternates
                            stink frames through refreshPoopLook() + pulses this.glow
                            and the bean button in the tray centre slot
                            (beanButtonLayout with beanButtonOpts(): the
                            settings' hand puts it by a thumb on a wide field,
                            a match half keeps the centre; applyHand() re-places
                            it, getHand / setHand serve Settings and the save
                            panel; same period). refreshPoopLook()
                            (poopFrame: charged, stinkFrame, body vy) also runs
                            every playing frame outside a fart, so a drop at
                            fallLookVy or faster wears poop-falling (or
                            poop-stink-falling1/2 while charged) until the next
                            flap; tickScared (same frames) holds the near-miss face
                            (poop-scared, or poop-stink-scared1/2 while charged) for
                            scaredHoldMs after a pipe's body comes within
                            scaredNearPx of the hitbox, never while the poop cannot
                            be hurt (grace, test Invincible);
                            startLevelBreak, win() and a respawn zero scaredMs and
                            call it once so the
                            break glide / the win never keep the scared face;
                            die's poop-dead and the fart frame are untouched;
                            applyRainbow() each frame recolours glow + button disc
                            with superBeans held and makes the glow a rainbow halo
                            during a super fart (poop art never tinted); a
                            tap on the poop (poopTapHit) or the button
                            (beanButtonHit) calls activatePower(): fart texture,
                            alpha tween, fart_accelerate clip, effects.activatePower
                            (fartDuration: the clip with superBeans held for
                            superPipes, else beans.normalPowerMs for powerPipes,
                            the clip faded by fartVolumeFrac and cut in endPower /
                            stopFartSound → fartPeak), scrollMul from fartMul() each
                            frame via applyScroll(); fartFloat() drives y + angle
                            (glide to mid-height, then the wave with ±waveTiltDeg;
                            gravity off, doFlap ignored); collectItem ignores items
                            while farting; spawnHeldByFart() stops pipe
                            spawning once fartRemainingDistance() < pipeClearDistance()
                            so the screen is clear at the end; endPower() restores
                            gravity and spawns the next pair at the right edge with
                            its gap at mid-screen (centreNextGap → centredGapY),
                            graceLeftMs blocks die(). Pipes spawn by scrolled distance (pipeSpacing(level),
                            px), not a timer. Items: level 1 is scripted
                            (tutorialSpawn / levels.tutorial pair → kind map:
                            probiotic 3, fiber 4 and 7, bean 9, nothing else, no
                            bacteria); from level 2 rollItem per pair, bacteria
                            only once hazardsAllowed(pipesSpawned) (level 2 pair 5);
                            fiber → spawnBandItem (halfway to the next pair,
                            bobY on items.fiberPeriodMs, yields to a bean rolled
                            for the same pair). Below items.bandMoveFromLevel
                            fiber and beans hold still at bandMidY of this gap
                            and the next one, which is pre-rolled into
                            this.nextGapY (cleared wherever centreNextGap is
                            set); probiotic / bacteria →
                            spawnGapItem (depth −1 under the pipes; from
                            items.moveFromLevel they sweep the gap with gapBobY /
                            gapBobAmplitude). Mystery boxes take the band spot like
                            fiber: the guaranteed first box rides after
                            this.mysteryPair (scriptedMysteryPair in start(), one of
                            level 3's first four pairs; it owns that spot, no bean);
                            after it rollItem gets { mystery:
                            mysteryRolls(pipesSpawned, mysteryPair) }. Boxes hold
                            still at bandMidY before mystery.moveFromLevel (4) and
                            bob on mystery.periodMs from it (mysteryMoves). Every box plays
                            'mystery-spin'; setBoxSpin pauses / resumes it with the
                            run. collectItem → openMystery(resolveMystery(
                            rollMystery(rng))): fiber and probiotic reuse
                            eatFiber / takeProbiotic (shared with the plain
                            pickups), postbiotic = effects.applyPostbiotic,
                            beans = addBean × MYSTERY_BEANS, skip = skipToFinish
                            (skipPairs × pipePoints at the multiplier, pipes /
                            items / beans ahead of the poop destroyed, the rest
                            marked passed, pipesPassed = pipesSpawned = levelEnd,
                            spawnFinishLine, gold flash and "+N"); revealMystery
                            then raises the drawn icon (🏁 for a skip, "×3"
                            beside the bean) out of the box over mystery.revealMs.
                            openMystery takes the draw directly so the smoke can
                            force one. this.collected counts pickups for Over's
                            summary rows (a box's reward also counts as its own
                            kind). Spawn slots: at levelEnd(level)
                            pairs the slot is the finish line (spawnFinishLine),
                            then nothing until the break ends unless a fart runs;
                            onFinishCrossed → win() on the final level (endRun():
                            state 'dead', score recorded; showOver(won)), else
                            startLevelBreak (pausePlay with
                            levelBreak, setPauseBanner shows levelTitle/levelHint,
                            breakGlide + breakBob, fadeBackground), cutting a
                            running fart first (cancelPower + endPower);
                            resumePlay → endLevelBreak (applyLevel, grace,
                            centreNextGap). Background = bgColor rectangle (depth
                            −20) under bgLayers tileSprites (depth −10+) from
                            BACKGROUND.layers; the ceiling and ground strips are
                            tileSprites at depth 5 (over the pipes) scrolled at full
                            pipe speed, and the poop dies at their edges
                            (ceilingHeight + poopRadius, GAME_HEIGHT − groundHeight −
                            poopRadius; gapBounds keeps gapMargin inside both);
                            levelBar above the score. Nothing here reads time.now;
                            readyHit() routes taps (toilet, versus, education, the
                            📚 glyph → "Your cards" (toggleEduCard; plan 26 A2),
                            howto, profile → the save panel; anything else
                            starts, and a start with 📚 on opens the 📚 popup
                            first: launch → openEduIntro). getSaveState / setSaveState for the panel.
                            Test mode: registry testMode / testStartLevel /
                            testInvincible (session, like toilet); isTestMode,
                            setTestMode, testSettings / setTestSettings,
                            testInvincible (die() and the ceiling / floor clamp
                            treat it like grace; the clamp, clampToPlayArea in
                            logic.js, stops only motion further into a strip, so a
                            flap from the floor keeps its lift), grantTest(draw) (resolveMystery +
                            openMystery, then pauseEffects() if paused); start()
                            seeds level / pipes / score / beanSpawned from
                            testRunStart; runIsTest latches per run and endRun()
                            records nothing for it; testBadge (refreshTestBadge).
                            pausePlay / resumePlay share pauseEffects / resumeEffects.
                            Gamepad: this.pad = bindPad(...) is the game's one
                            binding (this scene is never paused; overlays and Over
                            run on top of it). onPadAction → padTop (the topmost
                            overlay, else Over, else Play) → padIntent → the same
                            handler a tap / key uses: 'tap' = flap(), power =
                            activatePower, mute / pause / resume = handleChrome,
                            closeTop = the overlay's close(), retry = Over.retry(),
                            activate / move / hideRing = that scene's focus ring;
                            a nav press mid-run pauses and rings ⏸ (pauseAndFocus).
                            this.focus rings the tray in screen order, then the
                            ready screen's toilet toggle and ? (box items visible
                            only while 'ready' and not launching; Save / Load and
                            the profile button are off the ring on purpose: they
                            need the keyboard); launch and resumePlay hide it.
                            padDown / padNav are the smoke shims.
                            Versus half: this.course = createCourse(seed, T, { shared })
                            replaces every this.rng read (gapY / item / bean /
                            pipeMove / phase / itemY / spinFrame by pair number;
                            mysteryPair at start); this.rngDraw (per player) rolls
                            the mystery draw on catchUpDraws(catchUpTier(behind))
                            in collectItem; this.distance (its place on the course:
                            the scroll, re-anchored by rebaseDistance at the end of
                            every prefillPipes and after skipToFinish, from the next
                            pair due to spawn or the level's finish line);
                            publishSlot() every frame; refreshGhost (this.ghost at
                            depth 9.5 from ghostPlacement; a live ghost follows its
                            alpha, an ended one fades over ghostFadeMs) and refreshRival
                            (levelBar.setRival on a level / pair change); a match
                            records nothing: endRun reports to Versus.onRunEnded;
                            showOver is a no-op. die() in a match → startRespawn
                            (state 'respawn', the world halted, scoreAfterDeath +
                            the 'death' popup, slot.deaths, setCharged off), then
                            tickRespawn every frame on respawnPose (the tumble under
                            physics with deathTween; the first glide frame clears
                            the field ahead with hasPassed, drops pipesSpawned back
                            to pipesPassed and a finish line ahead; the glide and
                            blinks drive y / angle / alpha) and endRespawn (grace,
                            centreNextGap + prefillPipes like endPower, re-charged).
                            pausePlay accepts 'respawn' (respawnPaused) and
                            resumePlay returns to it without the bounce; autoPause
                            too. onFinishCrossed adds levelClearBonus when
                            Versus.claimLevelFinish says it is first (the popup
                            after the break starts); it passes the host's
                            claimLevelFinish { level: the level just cleared, final }
                            (Versus ignores it). takeLevelClearBonus() is the shared
                            bonus; awardLevelFirst({ final }) is the online race's late
                            verdict (levelWins + 1, the bonus, the popup, finalFirst on
                            the final line, publishSlot; OnlineRace does not call it for
                            the final line once the other side's slot holds finalFirst,
                            2.3). Reload resume (2.3):
                            init takes `resume`, start() begins at that level's first pair
                            with the kept numbers (effects.restoreLevel), resumeSnapshot()
                            gives a level's start, raceResumeStore() builds the store
                            (browserStorage() with raceTab(), this page's tab id, once
                            per page load: registry raceTab), openPendingRace(again)
                            (in create, once per page load: registry raceRejoinOffered)
                            opens the 🌐 window when a record is there; a live record
                            (another page's) opens nothing and is looked at once more
                            after staleMs (registry raceRejoinLooked); a page that
                            stepped aside (registry raceSteppedAside) opens it even on
                            a live record, once, to show why. win() → showEscapedBanner
                            (levelTitle / levelHint, no shade; applyLocale keeps it).
                            chromeState() / overlayPause(): chromeArgs and
                            onPadAction read the match's state ('paused' in this
                            half's own break or under the shared pause, 'playing'
                            while any half is live) so a finished or respawning half
                            still drives the match; flap() lets a finished half
                            through to its tray and the resume tap. Input:
                            localPointer() shifts a pointer into the half and drops
                            the other half's; keyboard events are read by P1 alone
                            (onVersusKey → keyGroup) and routed with pads by
                            versusInput() to the half whose device it is (a
                            join-screen input claims a slot through
                            Versus.onJoinInput; a host with no second local half,
                            halfScene(1) null as in the online race, gets every device
                            sent to its one half); P2 draws no tray, no ring, binds no
                            keys and no pad. handleChrome('pause' / 'esc') toggles
                            the shared pause (Versus.togglePause); pauseRun() /
                            autoPause forward to it; a 'resume' tap (and a pad's B)
                            lifts the shared pause when it is on, else (a half in its
                            level break) toggles that player's ready through
                            Versus.onLevelTap: a match half's break ends only on the
                            shared count (beginLevel, from Versus). onFinishCrossed
                            pays levelClearCoins (crashesThisLevel, reset at each
                            level start, +1 per respawn).
                            Coins and the shop: takeCoins (purse, collected.coin,
                            refreshCoinHud, the coin sample), refreshInventory (coin
                            and bean rows by inventoryRows), clearPowerups (die in
                            single player with the purse emptied; startRespawn with
                            crashCoins), pulseStill / pulseScale (still pickups and
                            still beans breathe, body re-fitted), armKernel /
                            markKernel / spawnStillCoin (the level's guaranteed
                            kernel; collectItem reads its flag before destroy),
                            giveBeans, playSample
                            (a sample or its synth fallback), buyItem(id, opts);
                            shopOpen / shop, refreshShopButton / shopButtonShown
                            (the 💰 pill, depth 27), openShop / refreshShop /
                            shopBuy / closeShop (panel 27, texts 28-29, the reveal
                            29.5 and running while paused: revealMystery { depth,
                            run }); flap() routes an open shop's taps (✕, a row, the
                            panel, outside → handleChrome('tap') → closeShop) before
                            the power tap; activatePower in a break toggles the shop;
                            handleChrome's match pause shortcut skips an open shop;
                            endRun / start / endLevelBreak close it; the ring walks
                            the 💰, ✕ and the rows (shop, shopClose, shop:<id>).
                            onFinishCrossed reports Versus.onLevelReached(this);
                            refreshLevelBanner shows a match break's ready state
                            ("Tap when ready" / "Ready! Waiting for P{n}…";
                            applyLocale keeps it), shopButtonShown hides the 💰
                            while ready or counting, setPauseBanner
                            keeps the shade off there, and setLevelHintVisible hides
                            the hint through the beat and the count. The
                            ready screen's 👥 toggle
                            (versusOffered(): outside a match, not test mode, phones
                            included; splitFits() = versusAvailable; a 👥 start where
                            it is false opens the 🌐 window over Play via openVersusWindow;
                            versusHost() reaches the match through matchHostKey;
                            toggleVersus → registry 'versus',
                            session-only) makes launch() scene.start('Versus')
                            instead of sliding the poop; a match half hides the
                            ready UI and starts with the plain face.
    Versus.js               The two-player match, above the two Play halves and
                            below the overlays (bringToTop after launching them):
                            create({ match }) lays the halves out (versusLayout),
                            resizes the canvas, launches Play (P1) and PlayB (P2)
                            with their strips, draws the divider, the join screen
                            (title, P1 / P2 prompts → device badges, hint, Bracket),
                            the countdown text and the shared PAUSED banner. Status
                            lobby (a plain match: the tournament panel over it) |
                            join → countdown → playing → over (→ left). onJoinInput
                            claims (claimDevice; a tap that pressed Bracket is not a
                            claim), startCountdown runs runCountdown (3-2-1-GO on
                            timers, never synchronously: a rematch starts it inside
                            create(); it stops on a restart or a status change and,
                            for a level, holds while an overlay is open, then repeats
                            the step for a full beat). Its GO step runs onGo in the
                            same frame (flush(), the GO text hidden one beat later
                            by goToken): go() → each half's startRace() (the halves
                            slid in under the "3" through onStart → launch({ hold })),
                            beginLevel() for a level. claimLevelFinish(half): the
                            first over this level's line (levelFirst, cleared by
                            beginLevel) gets slot.levelWins and the +25.
                            The ready check: onLevelReached(half) notes its arrival
                            (levelArrivals, the first winning the level; its hint
                            hidden until its levelSyncDelayMs timer fires: levelBeats,
                            beatPassed), onLevelTap(half) toggles readyHalves, both
                            ready → startLevelCount (levelStage 'count', a token
                            runCountdown's `alive` reads) → beginLevel (both
                            Play.beginLevel in one call, the ready set cleared; a
                            hidden tab pauses at once); a tap during the count →
                            cancelLevelCount. isReady(half), refreshReady (hints and
                            💰 pills), onShopChanged refreshes them.
                            setPaused(on) pauses every
                            playing or respawning half and remembers them
                            (pausedHalves), resumes only those; togglePause for the
                            pause key; anyLive() for chromeState. onRunEnded waits
                            for both slots to end (the first finisher waits under its
                            own banner), then shows the result panel after
                            deathToOverMs: raceOutcome headline (and how, past the
                            score), both scores / level / pipes / 🏁 / 💀, the
                            not-saved line, Continue | Bracket on overButtonsLayout's
                            row with a focus ring. rematch() (no button: the smoke's)
                            restarts the scene with resetMatch (devices
                            kept, new seed); leave() stops both halves, re-fits the
                            canvas to the window and starts Play with explicit data
                            (a start without data keeps the last launch data).
                            onPadSelect / onPadBack are the pad's A / B here
                            (padIntent 'versus'); Esc = back (not while the panel is
                            up: it has its own). Tournament: openTournament(view)
                            opens the panel (the lobby, bracket, podium, 'help',
                            'peek'); the round as the title, names via versusName;
                            primary → continueTournament('next'), home() on the
                            result panel → continueTournament('bracket'), on the
                            join screen the bracket; bothInBreak / openPeek for
                            the 🏅 pill; restartWith(match) starts the next race or
                            the lobby after Abandon.
    OnlineRace.js           Online race (🌐, plan 39, 1.7a, 1.7b) the match host for one
                            local Play as player 1 (matchHostKey 'OnlineRace'); the other
                            seat is a remote feed in match.slots[1]. initRace(data) holds
                            the race's state apart from drawing (tests start there) and
                            sets match.hostKey and the field: W (this device's width) and
                            fieldW from createFieldFit. Until GO a width that moves the
                            agreed one restarts the scene on the same plan (refitField;
                            the newest width rides along as data.peer, also into a
                            rematch); nothing after GO (AUD-097). 3-2-1-GO on the server clock. Host
                            interface: claimLevelFinish(half, { level, final }) records the
                            crossing with the referee and returns false (the verdict comes
                            back as Play.awardLevelFirst); onLevelReached hides the hint for
                            versus.levelSyncDelayMs (the arrival beat), then "Tap when
                            ready"; onLevelTap toggles ready over the wire; isReady;
                            levelStage 'count' during the shared count; GO calls
                            Play.beginLevel (an overlay or hidden tab pauses the local half
                            only; the shared pause below pauses both). The run's done is held until the final
                            line is settled (the referee's settled()), so both devices
                            compute raceOutcome from the same numbers; checkOver needs this
                            side's done sent and the other's heard, then the host's app calls
                            lobby.finish(). wantRematch(on) (1.8's button) and checkRematch:
                            the room playing a later round restarts the scene on
                            raceStartPlan (which carries `round`).
                            1.8: the results panel when the race ends (Rematch | Leave,
                            A and B on a pad; the rematch line: waiting for the other, the
                            other asking, the other gone; the numbers are copied at the
                            end); the wait timer while ready in a break or out at the
                            finish, and after TUNING.online.race.waitOfferMs "<name> is
                            taking a while" with Keep waiting (starts it over) | Leave
                            (item 15; hidden under the shop); the opponent's pill fits a
                            long name, and the break card has no fit line. The purse and
                            beans sit below the opponent's pill: the scene passes
                            TUNING.online.inventoryY0 to Play as launch data
                            `inventoryY0` (Play.half.inventoryY0, third argument of
                            inventoryRows).
                            2.2: the shared pause (createRacePause, wired). Host methods:
                            setPaused(on) is this side's `menu` reason (the pause key, ⏸,
                            a pad's Menu, an overlay opening; off only when Play's tap
                            lands while paused); a tap while paused is Ready
                            (toggleReady); isPaused() is the machine frozen (paused or
                            counting to the resume). pauseLocal() feeds the machine each
                            frame and on visibilitychange; the machine's effects: pause
                            freezes the local half mid-run and holds the ghost, resume
                            starts the 3-2-1 on server time, back resends the run's end
                            (feed.again()), abandoned ends the race. The referee is held
                            while it lasts, and a pause before GO holds the opening GO
                            (the resume's GO starts the race). The overlay: why it
                            stopped, each player's mark, the time paused, Ready | Leave;
                            Leave asks twice within online.pause.leaveConfirmMs, then
                            ends the race for both. The abandoned race (the room's
                            confirmed left / abandoned): results panel "No winner" with
                            Leave only, no finish, no rematch. The opponent's pill gains
                            a `paused` state (amber dot, "paused"). A wake lock is held
                            while the race plays.
                            2.3: a reload mid-race rejoins and both race the current level
                            again from its start. keepLevel stores level N's start (the
                            Play.resumeSnapshot()) in each level break once line N-1 is
                            settled and again as the shop spends, into the resume
                            record. 2.3b: the racing page `holds` the record once its own
                            write went through and beats it every online.resume.beatMs
                            from a window setInterval (Phaser's loop pauses in a hidden
                            tab); lostSeat() (top of update, onWake, the beat) sees
                            another page's record and stepAside()s: net.close() with
                            no leave_room, Play started plain, the record left to the
                            new owner. forgetRecord() does the clears. pauseOverBreak() (a
                            host method; Versus's is false): the shared pause over this
                            device's level break, so Play's 💰 pill neither shows nor opens
                            and an open shop sells nothing under the overlay (item 70, N3).
                            A rewound scene (data.resume) launches Play at that
                            level (launchData), holds under the pause overlay until this
                            side's Ready (own reason `rewind`), sends `rewind` every
                            online.pause.heartbeatMs until its GO and agrees its field
                            width until then (fitUntil). The other side, on `rewind`,
                            raises its feed's and referee's floor to the sender's restart
                            and restarts at the lower of the two levels (rewindOnHeard;
                            nothing for another room round or a stale rewind; a side whose
                            run has ended sends its fixed pos and done again, feed.again(),
                            so after the rewound side's restart, 2.7, AUD-107). The shared pause's count gives one GO. The
                            record is gone at the race's end, abandoned, Leave, this
                            side's own finish.
                            3.3: the results panel's friend offer (loadFriendOffer,
                            drawFriendOffer, tapAddFriend: a button "Add <name> as a friend"
                            under Rematch | Leave, tap or click only; a line once asked, made
                            friends or already friends), read once the report is agreed
                            (saved); on a waiting device (its friend reads 'not trusted', or a refused tap says so) the line friendResultPair (3.8: "Pair this device to add friends..."); hidden for a blocked player or a null peer. The beat
                            is kept through the hand-off from the 🌐 window; stepAside() stops
                            it quietly (the other page beats), Leave after a race stops it.
                            T4-review AUD-127: initRace takes a lease on the transport; Leave's late
                            close goes through it.
                            tests/onlineRaceScene.test.js.
    Over.js                 Game-over panel (score, run summary of fiber / probiotic / postbiotic over bacteria / bean / mystery box (mystery-icon.png) over ‼️ long falls / 😢 close calls (data.falls / closeCalls; ×– for a stored Daily result), pipes crossed, then Share | Home on one row from overButtonsLayout and, on a normal or test run, a glowing Play again under them, the panel lifted over.againLiftPx so it clears the ⏸) with a
                            tap lockout (openedAt = game.loop.time: a relaunched
                            scene's this.time.now is stale) and its own tray (mute
                            still works). makeShareCard() at create (not on a
                            test run): renderShareCard (ui/shareCard.js) from the
                            loaded textures' source images, shareCardLayout(T),
                            the panel's headline / score line / counts / pipes and
                            shareCardFooter(); its toBlob PNG becomes
                            this.shareFile (a File) and Share shows. A Daily Dump
                            (data.daily: day, level, playerId, practice, sync, view)
                            gets the date headline, its score as overHit's 'score'
                            box (the board's 🌞 tab), the rank in the coin cell
                            (loadDailyRank after daily.sync: the queue's outcome,
                            else its row off daily_board; the card is drawn again
                            with it) and the countdown in the test note's slot.
                            Today's result from the popup sits on a 'dead' Play
                            (Play.showDailyResult), as any game over does. A
                            full-field zone at Over's bottom is the top of the
                            input stack: no tap under the panel reaches Play.
                            Play again (overButtonsLayout 'again', not on a Daily
                            Dump; the panel grows over.againPanelGrowPx downward)
                            sets the one-shot registry 'playAgain' and goes home;
                            Play's create() clears it and launch({ solo }) starts
                            a one-player run. data.personalBest (Play.endRun: above
                            every earlier score) shows the gold newPersonalBest
                            line, never on the card.
                            pointerdown on Share marks it pressed (no home);
                            pointerup over it runs shareRun() → shareScoreImage
                            with the card and SHARE.url as the only text. { test: true }: the gold
                            testRunNotSaved line, no Share, Home alone at centre
                            (a test run with 📚 on is an education panel: below).
                            With { won: true } the headline is the gold runWon text.
                            retry(pointer) is a method (the pad's A calls it with no
                            pointer); this.focus rings Home, Share (once the card
                            exists) and the tray, shown as the buttons fade in under
                            a controller; tray and focus are nulled on shutdown.
                            Summary cells (overCellsLayout, T.over.cellRowsY / cellW
                            / cellH; the coin cell is the rank link in a Daily Dump)
                            explain themselves: a release over the cell it was
                            pressed on opens the shared card (ui/infoCard.js: its
                            icon, a career note, "This run: n") past the death-tap
                            lockout; with a card up the next tap, B
                            (Play.onPadAction), a nav press, Space or Home only
                            closes it (closeCard). The cells ring after the buttons.
                            The summary band (plan 22; overBandLayout, T.over.band):
                            the cells and the lines under them are on a
                            createScrollView between the score line and the buttons;
                            the buttons, halo and tray are made first and stay on
                            the main camera, the card is on a camera of its own.
                            Inside the band nothing fires on the press: a tap
                            (released within 12 px) opens the cell or rank link
                            under it (hitAt, at the band's scroll) and on empty
                            space goes home; a drag or the wheel only scrolls. It
                            scrolls only when a line runs past its bottom: a won
                            education run (below). { education } (the run's tally):
                            an education panel (plan 21, E5). Its bottom row of
                            cells, under the coins, is the tally (eduAnswered /
                            eduRight / eduWrong: ❔ ✅ ❌), and a tap on one opens
                            "This run" (tallyLines) in the card; ‼️ 😢 are the third
                            row, as on every panel; the eduNote under the tally, a
                            badge line between the coins and that row
                            (overEduLines; its badges are looked up in
                            EDU_ACHIEVEMENTS too); on a won run the ❔ ✅ ❌ row stays
                            in view and the badge line goes below it, under the fold
                            (over.eduLinesY's wonBadge; plan 28, 3.2). Buttons: Home | Play again side
                            by side (overButtonsLayout { pair }; the glow's key is
                            over-pair-halo, over.pairGlowPx), no Share; a lost
                            run's band is the tall one (overBandLayout { tall }) and
                            holds everything; a won run has the 📚 bonus button
                            centred above the pair (buttons.bonus, openBonus) and
                            the short band, which scrolls to the rows below it: by
                            drag, wheel, or the controller's ring, which has one stop
                            ('lines') over the lines below the fold, reached by down
                            from the bottom row of cells (AUD-049).
    Settings.js             Overlay (geometry from settingsLayout): sound, haptics (Android only), the
                            hand row (👈 pill 👉 from createToggle with glyphLeft, a
                            Zone over the row, a hint line; toggleHand →
                            Play.setHand, which moves the bean button on every
                            running Play instance), Reload game
                            (hardReloadGame(): re-fetches loaded scripts with
                            cache: 'reload', then location.replace with a fresh r=
                            query; picks up a push at once, works on home-screen
                            installs; when the page itself answers from the network it
                            first removes this scope's service worker and our caches,
                            else keeps both: see "Service worker"), About link, version. Tap outside the panel
                            closes (overlayOutsideHit), same as X. The panel is 1010
                            px (plan 35, 4.2: the "Skip to home when loaded" row and its hint, the label fitted by fitScale); in test mode 1240 px with the test section (start level ◀ ▶,
                            Invincible, TEST_POWERS buttons live only while a test run
                            is paused, Exit → setTestMode(false) + scene.restart()).
    About.js                Overlay: How to play + feedback links, then the
                            engine/art/sound credits, author and LLM note, version
                            and Updated last; longer than its panel, it scrolls
                            (both fart clips), How to play + feedback links,
                            the version and "Updated LAST_UPDATED" under it both link to
                            Changelog (What's new), inside
                            createScrollView(). Tap outside the panel closes.
                            Wrapped text uses useAdvancedWrap for CJK.
    HowTo.js                Overlay: flap rules plus pipe / fiber / probiotic /
                            postbiotic / bacteria / bean / mystery box (mystery-icon) /
                            levels / controls / toilet / two players / tournament / Daily Dump / 📚 education (plan 28) rows,
                            then one row per tray button left to right (ⓘ 🌐 💬 🏆 🔊 ⚙;
                            the 🔊 Sound row also carries the iPhone Silent-mode note)
                            (howToItems; the pipe icon is a cropped cap slice, the rows
                            from levels on are emoji: EMOJI_ROWS) and a feedback link, inside createScrollView(). Ready-screen How
                            to play is readyHit()'s 'howto' box, so it does not start a run.
                            Opened from About, X/Esc/tap-outside closes HowTo and
                            About together. useAdvancedWrap on body text.
    Changelog.js            Overlay (What's new): one version's notes from
                            src/changelog.js (the latest, or create({ version })
                            after a link's scene.restart), then a link per other
                            version ("Latest · " on the newest), inside
                            createScrollView(). Opened from About's Updated line or
                            any overlay's version line (chromeIntent 'changelog',
                            ui/overlayStack.js openChangelog); ✕ / Esc / B / tap
                            outside return to the overlay underneath.
    Language.js             Overlay: English / 简体中文 picker (🌐 or L).
    Feedback.js             Overlay: Bug / Feature request chooser (💬, F, or links
                            from About/HowTo). Buttons open GitHub issue forms via
                            issueUrl() + openExternalUrl(); closing leaves any
                            parent overlay open.
    Daily.js                Overlay (the ready screen's 🌞; chromeIntent 'daily' from
                            the ready screen only): what the Daily Dump is, today's
                            level, one button by mode() (Create user / Play / See
                            today's result / Practice), the countdown once played,
                            the version line; streakLine ("🔥 Current streak = n",
                            Play.streakNow('daily'); plan 34, round 2) in the note's
                            place unless a note shows. refresh() redraws it after a save.
    (every overlay builds this.focus from pressable() items, ✕ first then its
                            rows (the Quiz is the exception: the challenge offer's Try it and
                            Decline lead, the ✕ last; AUD-068), and calls focus.show(), which only shows under a
                            controller; About / HowTo / Changelog pass scrolled: sv and
                            onVertical so up / down scroll the text; Leaderboard
                            passes onVertical only, scrolling its rows band)
    Leaderboard.js          Overlay (🏆 tray button or T): awaits
                            Play.syncLeaderboard() (posts a pending best), then
                            fetchTop + fetchRank in parallel behind a Loading line.
                            Pages of 25 places (LEADERBOARD.limit): rank · name · 🚽 · LV n ·
                            score rows in a band that shows visibleRows (14) at once
                            on a 640 × 1120 panel (the profile's size)
                            and scrolls (createScrollView over the band; title,
                            header, footer, version fixed), own row highlighted
                            by rank, footer = join hint (no username) / rankText
                            (each own row, on every page) / "not on the board yet". A generation
                            counter drops loads from a closed instance. The 🏆 · 🌞 · 🏅
                            tabs under the title (createTabs, the row a pressable
                            zone: a tap picks the nearest glyph, the pad's A the next
                            tab; leaderboardLayout) restart it on another board without
                            a second sync: 🌞 today's Daily Dump (fetchDailyBoard: the
                            date and level in the header, rank · name · score, footer
                            dailyYouText / posts when online / how to play) or the 🏅
                            medal board (fetchTournamentBoard: rank · name · 🥇 🥈 🥉 ·
                            best race, the caller pink and appended below the top,
                            footer medalYouText); registry 'leaderboardTab' ('scores' |
                            'daily' | 'medals') keeps the choice for the session (a
                            daily result's score link sets 'daily'). linkName: every
                            name on the three boards opens that player's profile
                            over the board (sv.link: a tap, not a drag; only while
                            the board is on top); the – rows are not names.
                            A fourth tab, 📚 ('education'), only when
                            Play.educationAvailable() (tabList; leaderboardLayout takes
                            the tab count): showEducation draws rank, name, grade
                            and runs from Play.fetchEduBoard; the footer is the
                            player's rank (eduYouText), the graded runs still
                            missing, or a link to the Education data panel
                            (footerAction; the scene restarts when sharing changed
                            there).
                            Pages (plan 28, 5.2; Michael's answers, 16 Nov): every
                            board in pages of 25. The ‹ 26-50 › row (ui/pager.js at
                            leaderboardLayout's pager) is pinned under the band, on
                            the main camera (fixed), never scrolled; ‹ greyed on
                            page 1, › until the page is in and on the last page
                            (pageDone: fewer rows than a page, or the board's total
                            reached). ‹ ›, keyboard ← → and the ring (left from the
                            tabs reaches ‹, right goes on to ›; A presses) call
                            turnPage: a restart on the page before or after
                            (nextPage, read once in create; no second sync; the ring
                            kept on the arrow), so every open and every tab switch
                            starts at page 1. Each board asks with the page's offset
                            (this.offset); the own rows are pink on their own page
                            only; the footer gives the player's place on every page
                            (🏆 too, at any rank), its first line's top under the
                            arrows (footerTop) so a second line grows down, and
                            setFooter shrinks a longer one (both places and the
                            name note) to fit above the version line; – rows fill
                            page 1 only. A board of exactly 25, 50, … no longer offers an
                            empty page (plan 35, 4.5; see the fetchers' opts.peek).
                            Known edge: on 🏆's
                            table-read fallback a hidden or held player's spliced
                            row pushes one place off page 1 (score_board answers
                            their own view, so this needs score_board to fail).
    Stats.js                Overlay (plan 08; chromeIntent 'stats': on its own, or
                            over the board or the 🌞 popup, closing back to it
                            without the lockout): a player's profile, launched by
                            Play.openStats with { name } (anyone's player_stats) or
                            nothing (the own: the career store, topped up by the
                            server when named; offline / unnamed notes). Sections in
                            a scroll view (statsLayout): Singleplayer, Daily Dump
                            podiums, Tournaments (medals, biggest rival), 📚 Education
                            while education is available (eduView; your own adds the learning
                            streaks and the highest level unlocked: plan 26 A2), Career (a
                            glyph grid of the 13 counters, CAREER, five to a row), Achievements
                            (earned, then the rest dimmed with lifetime progress; for
                            others only open quests). Every cell is a zone (sv.link)
                            whose tap opens the explanation card (toggleCard /
                            explain): on a camera of its own added after the band's,
                            so it draws on top and takes taps first; a release
                            anywhere, ✕, Esc, A or B close it, and the band ignores
                            drags meanwhile (scrollView.setEnabled). The ring is
                            rebuilt with the cells once the profile is in and moved
                            by navigate(): left / right in list order, up / down to
                            the nearest cell (focusNearest over cells only), ✕ above
                            the first row (scrolls to the top). Tags (view.tags, TAGS: 🔧 🎖️ 🆕) lead the Achievements grid, each a card. No username: the gate
                            (buildGate) instead; refresh() restarts it either way.
                            The 📚 Education section (education available): your own
                            has an "On the 📚 board" row (Shared / Not shared) that
                            opens the Education data panel, follows the server's
                            answer both ways (Play.noteEduShared), and a Tester
                            pilot row while joined; another player's shows only
                            what they share (sharedEduView: grade, runs, earned
                            badges).
                            Your own profile, while education is available, ends with a
                            📚 Education section (plan 22; eduView, from this device's
                            education store): the average grade, the graded runs,
                            and the eight education badges (eduBadgeItems) with
                            progress on the education counters. The badge grid is one
                            function (badgeGrid) used for both lists.
    Quiz.js                 Overlay (plan 21; chromeIntent 'quiz' in an education
                            run's level break, Play.openQuiz otherwise): the 📚 quiz
                            card, 640 × 1160. Mode 'super' (plan 34): the challenge
                            question's offer (showOffer, round 2: a 640 × 640 card,
                            offerRect / offerTitle / offerText, Michael's sentence,
                            the bubble on the level's colour, a red Decline and a
                            green Try it (makeButton's look), the ring and Enter /
                            Space on Try it (AUD-068), nothing for retryLockoutMs:
                            offerLocked, close() included; hideOffer on Try; no
                            book opening, openingSound), then
                            one card that can only be answered (closable), the
                            verdict and Fly on (superStep); the purse shows.
                            Modes 'break' (coins), 'revive' (after a
                            crash: ❤️ strikes, the ⭐ choice and streak, Quit (warned on
                            every card: giveUp, quitArmed); it
                            cannot be closed and ends itself, finish; its card
                            ignores pointer taps for retryLockoutMs, tapLocked) and
                            'bonus' (a won run's rectum questions from Over). The
                            top row: the card's id ending in 🚩 (setCardId; a link
                            to the card report, openReport / openUrl, new tab only),
                            the run's tally (refreshTally; toggleRunCard opens "This
                            run", an info card), and ✕ or a revive's ❤️ / ⭐. Above
                            the bottom buttons, the count line (refreshCounts:
                            Play.quizCounts on ui/countLine.js, the kind of the card
                            on show underlined). Play owns the cards (quizNext, quizAnswer,
                            reviveEvent / reviveGrant); its shutdown calls
                            Play.onQuizClosed(mode). Options are drawn boxes with
                            wrapped text (not createButton). Three button slots by
                            position take a label and an action per step (set / hold /
                            holdFor, whose timer set / setShown / hold drop, so an old
                            hold never releases a new one; press): topBtn (Why, full
                            width), leftBtn (the way out: End Review, Quit, the
                            choice's Fly on) and rightBtn
                            (the way forward, which Enter / Space press and which
                            glows in a revive: halo, refreshHalo). sample() plays
                            the book sounds through Play.playSample; choose() the
                            answer's (no ding for an answer that paid a coin).
                            preview(card, right, { state }) lays any card out
                            answered wrong or right for the smoke's fit check
                            (fits(): the last text ends above the buttons under it);
                            `state` (plan 26 A2, a revive's card, run over all cards
                            in both languages in education-revive): 'quit' with
                            Quit's warning, 'choice' the ⭐ choice over Why,
                            'choiceWhy' with Why open.

assets/                     Contract PNGs + README.md (the art contract).
  README.md                 File name, pixel size, orientation rules. tests enforce it.
  poop.png poop-dead.png poop-stink1.png poop-stink2.png poop-falling.png
  poop-stink-falling1.png poop-stink-falling2.png poop-scared.png
  poop-stink-scared1.png poop-stink-scared2.png poop-fart.png
  poop-speech.png fiber.png probiotic.png postbiotic.png bacteria.png bean.png coin.png
                            (coin.png: the golden corn kernel's spin, 12 frames of
                            106x106 side by side (1272x106), loaded as a spritesheet;
                            the rest are 2x their drawn size (plan 35, 2.1): the poop
                            set and the items 192 px, drawn at spriteDisplayScale 0.5
                            (96 logical px); stink 358, falling 268, fart 438, speech
                            510; question.png 230 (2x superQ.displayPx 115);
                            postbiotic.png: HUD icon only, never spawned;
                            the falling frames: scared face + sweat marks for a
                            long drop, with / without stink lines; the scared
                            frames: the near-miss face after a close call with a
                            pipe, with / without stink lines)
  mystery.png               Mystery box spin: 8 frames of 192x192 side by side (1536x192),
                            loaded as a spritesheet; mystery-icon.png is its static view
                            for the game-over summary and How to play (never spawned).
  pipe.png villi.png ceiling.png ground.png
                            (villi.png: transparent overlay over the level colour with
                            the back fringes; ceiling.png / ground.png: the front rows,
                            mirrors of each other, drawn over the pipes; art contract
                            in assets/README.md "Background layers")
  icon-192.png icon-512.png apple-touch-icon.png
                            App icons from src/FlappyPoopAppArt.png (process_art.py
                            process_icons): the two manifest / favicon icons keep the
                            drawing inside the central 80 % (maskable safe zone) on
                            the art's own tan; the Apple touch icon is full bleed.
  src/                      Original drawings; not in the size table.
  sfx/fart.mp3              Death sample.
  sfx/fart_accelerate.mp3   Fart power-up clip; its duration is a super fart's length (a normal fart is 2.5 s, the clip faded out).
  sfx/NewLevel.mp3          Level-up chime at the finish line.
  sfx/Coin_Pickup.mp3       A coin picked up, or a box paying coins.
  sfx/Coin_Spend.mp3        A shop purchase.
  sfx/ShopOpenClose.mp3     The shop opening and closing.
  sfx/ToiletFlush_Win.mp3   (lazy, plan 35, 2.3) The toilet flush when GO appears in a two-player countdown.
  sfx/Book_Open.mp3         (lazy) An education quiz opening.
  sfx/Book_PageTurn.mp3     (lazy) Each next question of an education quiz.
  sfx/Book_Close.mp3        (lazy) An education quiz being left.
  sfx/Sparkle_Restore.mp3   (lazy) A revive's full streak winning everything back.
  sfx/Bubble_Pop.mp3        (lazy) The poop touching a challenge question's ❓ bubble (the offer opens on it, with no book sound).

db/schema.sql               Supabase schema: scores table (player_id = save-code id,
                            name, score, toilet, updated_at), RLS + a column grant
                            that hides player_id; player_aliases (old id → the id it
                            was merged into; no role may read it) with
                            resolve_player(); name_key() (lower(btrim)) and the
                            claim rule name_blocked(); submit_score() (resolves the
                            id, advisory lock on the name key, 'name taken', max
                            score, toilet flag follows the score, 5 s rate limit,
                            renames all of the player's rows); name_available();
                            merge_players() (fold_player: max per kind, the kept
                            name, aliases); player_rank(); player_name() (the board's
                            name for an id, aliases resolved); admin_merge_name /
                            admin_merge_all_duplicates for the owner only.
                            Tournaments (🏅): tournaments (receipts), tournament_stats,
                            tournament_matchups (no role reads any of them; a
                            profile's biggest rival is derived from the matchups);
                            submit_tournament(host, payload) (receipt under a host
                            lock → 'duplicate'; 60 s per host; per-round bracket
                            checks; medals derived; names from scores, else the
                            code's unless name_blocked → 'Player'); tournament_board
                            (gold, silver, bronze, best; `me`); fold_player folds
                            medals and re-points matchups and receipts. Daily Dump
                            (🌞): daily_scores (one row per player and UTC day, no
                            role reads it); fnv1a32 / daily_level (internal, = the
                            client's dailyLevel); submit_daily_score (today or
                            yesterday in UTC via `now() at time zone 'utc'`, the
                            day's level, the name claim, the first post kept →
                            'duplicate'); daily_board (a day's top, `me`, `total`);
                            fold_player moves daily rows (the kept row wins a
                            shared day). Profiles (plan 08): player_counters
                            (jsonb counters, last_batch receipt; recent_batches, the
                            newest 64, since plan 24) + merge_counters
                            (internal) + submit_counters (5 s per player, caps per
                            run: maxScore, lastLevel); achievement_defs (quest
                            windows, seeded in the file) + player_achievements +
                            claim_achievements (window + 2 days' grace, 50 a call,
                            300 a player); player_by_name (internal: the boards'
                            naming) and player_stats (anyone's profile, no ids);
                            fold_player merges counters and achievements (and both
                            rows' receipts). v0.16.0:
                            player_meta (joined_at, exact, dev; touch_player from
                            every write function, an inexact backfill) and
                            player_tags ('dev', 'og' before 1 Dec 2026, 'new' an exact
                            join in 7 days) for player_stats (board_tags, anon, 100 names, stays on
                            the server unused: tags show on profiles only); admin_set_dev (owner only, by name); 👑 dethroned
                            (add_server_counter from submit_score / submit_daily_score
                            when a post takes the board's #1 from another player),
                            refused in a client batch. Plan 30: the 🏆 level is 1 to
                            TUNING.levels.lastLevel (submit_score, the CHECK; the
                            client caps too, levelOf); achievement_catalog()
                            (internal, = the ACHIEVEMENTS ids) gates
                            claim_achievements; owner-only admin_flag_player /
                            admin_unflag_player / admin_flagged hide a player
                            (scores.hidden, no anon grant, read by anon_read;
                            player_meta.hidden_at, hidden_note; player_hidden()
                            internal): every board, count and lookup by name leaves
                            them out for everyone else, their own views (by id,
                            and each board's caller row) stay as they were, a merge
                            keeps them hidden, nothing is deleted. Plan 30, Stage 2:
                            run_log / run_rejects / submit_runs (run summaries,
                            owner-only, 90 days but held rows and a hidden player's);
                            admin_runs(name); hold_run / release_run (owner-only):
                            a held run's post is kept in held_scores and answered and
                            paced as one that raised nothing, and a best it already set
                            steps back (score_steps); board_settings.require_run holds
                            a raise with no run too; post_must_hold / post_run match a
                            post to its run by content; own_best / board_rows give the
                            caller's own views their held bests (player_rank,
                            player_stats by id, daily_board's me, score_board). Mode
                            'race' (2.4b) is a run_log mode beside single / daily, treated
                            as single by those. The run
                            tables sit before submit_score in the file (a SQL
                            function's body is checked when it is made). Plan 21 (2026-11-13): the 📚
                            board (education_settings: board_open, invite_hash,
                            phase; education_public: one row per sharing player;
                            share_education (by invitation since plan 28: p_invite,
                            player_meta.edu_invited, 'needs invite'), submit_education_grades with the
                            shared_at round and 'restart', rename_education,
                            unshare_education, education_board; player_stats gains
                            `education`; admin_set_education_open, owner only) and
                            the tester pilot (research_participants, the one place
                            a player id meets a research id; research_responses,
                            answers under the research id; enrol_research with the
                            invite's SHA-256, submit_research_events with the known
                            fields only, delete_research; admin_set_invite (16 to
                            200 of A-Z a-z 0-9 - . _ ~ +, so it works typed and in
                            a link: AUD-041), admin_purge_phase and four
                            security_invoker views, owner only). fold_player moves
                            a shared row or a participant; two shared rows start a
                            new, empty round. Plan 24: education_public keeps the
                            newest 64 batch ids (recent_batches) as receipts; an
                            empty batch is a probe ('restart' or the totals,
                            nothing written); a badge day after tomorrow or before
                            2000 is stored as today; name_blocked (plpgsql) counts
                            the 📚 rows, and share / rename refuse a name another
                            player holds on any board; research_participants.joined_at
                            is the participation's token (submit_research_events'
                            p_since; another participation → 'not enrolled');
                            enrol_research keeps the first phase. Plan 25: the file
                            stops first on Postgres < 15; since_ms is clamped;
                            fold_player takes both players' education: locks and the
                            📚 functions lock through education_lock (resolved again
                            under the lock); share / rename wait 5 s per player
                            (education_paced, player_meta.edu_named_at); name_blocked
                            also counts other players' 🌞 / 🏅 names when they have
                            no score row (never 'Player'), and submit_daily_score
                            renames the player's earlier days. play_days (anon,
                            plan 34, 34.13): a player's Daily Dump course days and
                            Singleplayer local days (in the time zone sent), from
                            daily_scores and run_log, by their own id, days only;
                            34.14: it keeps a known zone in player_meta.tz (tz_at:
                            when it changed) and the longest Singleplayer streak in
                            player_meta.single_best (raised once the zone has stood
                            a week; sent back as singleBest), and player_stats
                            returns everyone's streaks (day_streak, streak_days
                            (a 'single' day needs pipes above 0 or no pipes key,
                            plan 48),
                            known_tz: internal); fold_player keeps either player's
                            zone and the larger single_best.
                            schema_version()
                            (anon) is the file's stamp: `npm run schema:stamp`
                            after an edit (a test fails on a stale one), `npm run
                            schema:check` reads the live one. Run by
                            hand in the SQL editor, never by any integration; it is
                            the source of truth for the backend. Apply it BEFORE
                            pushing a client that depends on new functions (npm run
                            push refuses until the live stamp is this file's).
                            tests/schema.test.js runs it in PGlite (Postgres in
                            WebAssembly), on an empty database and over
                            tests/fixtures/schema-applied.sql (refreshed only by `npm run push`).
                            Online play (plan 39): online_profiles / online_players /
                            online_pairings (devices linked to a resolved player; M1 device
                            trust, Michael's call of 19 Nov; fold_player's merge gives
                            trust to a side with a device trusted and seen in 7 days:
                            exactly one such side keeps it and the other side's devices
                            drop to pending and its pairing code goes (AUD-094); both,
                            the side whose trusted device linked first; neither, every
                            device keeps its trust, M1's 7-day residual), rooms /
                            join_attempts / online_secret, and two policies on
                            realtime.messages for `room:<code>`; PGlite boots with
                            tools/supabase_stubs.mjs's auth and realtime stand-ins.
                            Online races (plan 39, 2.4a-2.4e; the schema reaches main ahead
                            of Tier 2's client): `matches` (one row per race, minted by
                            set_room_status('playing'); rooms.match_id points at the race
                            running; readable by no role, kept as the players' history).
                            finish_match(code, round, result): any seated device, paired
                            or waiting (3.7: no 'not trusted'); each reports both seats'
                            numbers and its trust as reported lands in matches.host_trusted
                            / guest_trusted (true paired, false waiting, null unreported;
                            later pairing, demotion or removal changes nothing); the race ends agreed (equal reports), disputed
                            (different), refused (shorter than 180 s from GO, c_min_race_s,
                            or a score above 200 + 4 a second) or abandoned (a leave or
                            an abandon before any seat reported, or still playing 6 h
                            after GO; an abandoned race with no report is deleted after
                            a day). counted = agreed, two
                            different players, at most 10 counted races per pair and 20 per
                            player in 24 h; a counted race feeds the 🏅 / 🏆 boards
                            (online_count_race, board_post) and run_log mode 'race'. Each
                            seat's numbers-only telemetry is kept (host_stats / guest_stats,
                            a key list, owner's eyes). online_history(): the owner's online
                            rival line and last races, paired devices only, no ids
                            (online_races is its internal helper; the public profile's rival
                            counts split-screen races only). Off switch: online_settings
                            (one row), admin_set_online_open(bool), owner only; closed means
                            'online closed' on the room functions, a race running keeps going.
                            Rematch pacing: set_room_status('playing') waits 60 s from the
                            last GO ('rate limited'), and (5.2b, AUD-137) a host device
                            starts one race a minute across rooms (index matches_host_uid);
                            housekeeping deletes refused, disputed and abandoned races 30
                            days old, agreed ones stay. Item 68 pacing (5.2b): join_room
                            paces seated joins, c_device_oks a device and c_ip_oks an IP in
                            10 minutes (AUD-136); answer_guest refuses a decline within 2 s
                            of its code's minting ('rate limited'); link_online_player
                            paces links of a player the device was not linked to, c_links
                            (10) an hour, in online_links (RLS on, no grant, kept an hour;
                            a refresh of its own player never; AUD-138); server_now is
                            security definer, and a test holds every online function to
                            definer with search_path = '' (AUD-141). Races follow trust in a merge: a side
                            that loses trust in fold_player leaves its races under the id
                            folded away; when nobody loses trust every race moves; seat, self-
                            race and history checks compare resolved ids. M1 rule 6 (2.4e): a
                            fourth waiting device replaces the waiting device seen longest ago
                            (removed as Remove removes one), never a paired device or one
                            seated in a race; 'too many devices waiting' now means all three
                            are racing. tests/schemaOnline.test.js.
                            Friends (3.1, tests/schemaFriends.test.js): tables friendships,
                            blocks, friend_asks and online_trust, readable by no role, keyed
                            on resolved player ids. A device names another player only by a
                            peer handle (online_peer: per viewer, from the pepper; no player
                            id leaves the server), found only among the viewer's agreed-race
                            opponents (both seats paired as reported, 3.7), friendship rows and own blocks (online_peer_find). No
                            online function may find a player by a name or search (the guard
                            test). friend_list, send_friend_request, respond_friend_request,
                            remove_friend, block_user, unblock_user: trusted device only
                            ('bad peer' for a malformed handle). Eligible = an agreed race
                            with both seats paired as reported (host_trusted and
                            guest_trusted, 3.7; a waiting device's race is saved and
                            counted, never a friendship) under both current ids, no block either way, neither hidden
                            (friend_eligible, at every ask). A merge moves friend data
                            following trust, as it moves races (online_fold_friends), and
                            the online name follows trust. A made-up player merged with a
                            stolen id brings the owner none of its friends while the owner's
                            side keeps trust; under M1's accepted residual (the made-up side
                            linked first, or the owner was away 7 days or has no device) its
                            friends land on the owner's id (accepted, 22 Nov). Merge
                            seniority is online_trust.since (the first trusted link, kept
                            through a Clear: for good while the player has races or friends,
                            else 90 days from the last link).
                            online_trust.seen_at is the last link by any device, stamped on
                            every link; online_cleanup drops a row 90 days after it when the
                            player has no device, agreed race, friendship or block.
                            online_history() adds `peer` to the rival line and each race;
                            it is null on a race a merge left under an old opponent id
                            (online_peer_shown: the handle only when online_peer_find finds
                            that player), and on a race with a waiting seat (3.7), so the client shows no Add friend or Block there.
                            Status (3.2, tests/schemaStatus.test.js): online_beats, one row
                            per device (uid, at), readable by no role, gone with the device's
                            link. online_beat(p_here): a trusted device's heartbeat, nothing
                            written within 5 s of the last; false deletes it (a leave).
                            friend_statuses(): { friends: [{ peer, name, state }] }, state
                            online | in_game | offline, friends as friend_list, no ids.
                            Internal online_state: in_game = a trusted device with a beat
                            under 60 s old in a room 'playing', online = such a beat, else
                            offline. No shared channel (it would list everyone online).
                            Invites (4.1, tests/schemaInvites.test.js): the invites table (id, from_uid the
                            sending device and its room's host, from_player, to_player, room_code, status
                            pending | accepted | declined | cancelled, sent_at, expires_at; 'expired' is never
                            stored; from_uid goes null when the device's user is deleted, so the rows still
                            count for the caps), readable by no role. For a paired device only (authenticated; 'not
                            signed in', 'not linked', 'not trusted'). send_invite(p_peer) -> { ok, invite,
                            code, sent_at, expires_at } or { ok: false, error: 'unavailable' | 'rate limited' }
                            (raises 'bad peer', 'in a race', 'online closed', 'busy'); invite_list() ->
                            { incoming, outgoing, topic } (peer, name, sent_at, expires_at, outgoing adds
                            status; topic is the player's own Realtime topic);
                            accept_invite(p_invite) -> { ok, code, status: 'ready', host_name } or
                            { ok: false, error: 'expired' }; decline_invite and cancel_invite -> { ok: true }
                            whatever the id. Times in ms, no ids. Who: an accepted friend, no hide, no block,
                            reading 'online' in online_state; anything else is the same 'unavailable'. Caps:
                            5 a minute and 100 a day per player, 10 an hour to one friend. The invite belongs
                            to the sending device's room (its open one, kept on a resend, else one made with
                            source 'invite'); one live invite per sending device and per pair. Live is read
                            every time (online_invite_live): pending, before expires_at (INVITE_TTL, 2 minutes,
                            stored on the row, one server constant c_ttl, no client mirror), its room open
                            under that device, the device beating within 60 s, the two still friends; so an
                            unfriend, block, merge or lost beat ends it at once and reads 'expired'. Accept
                            seats the friend's device and the room goes straight to 'ready' (no code, no join
                            cap, no Let in). Delivery on the player's own topic (online_user_topic: 'user:'
                            and 32 hex of sha256 of the pepper and the resolved player id, never the id, so a
                            device whose save holds a merged-away id still hears its player's invites; given
                            only by invite_list): online_can lets that player's paired devices read it and
                            nobody write it (only the server's realtime.send), so a waiting device reads
                            nothing. Events: `invite` to the friend; `invite_update`
                            { invite, status } to both players on accept, decline or cancel. online_unseat
                            (every leave path) and join_room (a code guest taking the seat) end the device's
                            invites and tell both players. Nothing is sent on expiry. online_cleanup drops
                            invites 2 days old. rooms.source takes 'invite'.
                            PL/pgSQL gotcha: a bare CASE inside
                            `IF … THEN` ends the condition at its THEN; parenthesise.

tests/                      node --test (schema.test.js, schemaOnline.test.js, schemaFriends.test.js, schemaStatus.test.js, schemaInvites.test.js, pilot.test.js,
                            eduBoardSync.test.js and schemaCheck.test.js need `npm install`: PGlite). Each file is self-describing:
  field.test.js             fieldWidth (phone, desktop, 2:1 cap, bad input, even),
                            uiColumn, poopX, the x0 shift of trayLayout /
                            levelBarLayout / readyLayout, hits on a shifted column,
                            pipeLeadPx, pipeLead (grows with the extra width),
                            prefillPairs (one edge pair on a phone; a wide field
                            filled from its lead to its edge), sweepOffset
                            (ends, midpoint, monotonic, fastest off the edge,
                            peak extra speed bound)
  errorCard.test.js         The error card (plan 35, 1.1): context by run state, the pause,
                            Reload / Keep playing, one card at a time, rejections only on a
                            stalled loop, errorReportText (links stripped), the bug form
  phaserFallback.test.js    Phaser's loader (plan 35, 1.2), the trap run on a fake window: CDN
                            ok, failed or stalled → vendored copy, neither → the splash's
                            failed state and a retry; the pin: one CDN tag and the vendored
                            copy, both 4.2.1 and the same build (the main tag may carry the push's ?h=)
  eachChild.test.js         eachChild (plan 35, 1.3): walks a copy, skips a child an earlier
                            turn destroyed; guards that Play walks its groups through it
  html.test.js              index.html invariants (viewport, no scroll, pinned Phaser;
                            the splash's parts, ‹ card › then Continue, no spinner,
                            no words in its markup, the inline import before
                            Phaser, its colour tokens, the six modulepreload links, none
                            twice (plan 35, 2.4), and that the main tag and the preload hrefs
                            agree with the import map (bare in the tree, ?h= after a push;
                            the map comes before every script: plan 35, 3.1); poop.png's pixels, decoded,
                            stay 2 % inside the ring at both ends of the bob)
  splash.test.js            the splash's catalog (copy in every locale under the
                            100 / 50 character cap, one glyph per thing: badge glyphs,
                            no borrowed ones), the sprites (files Boot loads by that
                            path, the coin's frames, crops inside the image), the
                            ring (creep, monotonic, capped per frame, 0.6–1.1 s
                            empty to full; ringFast and ringCachedLoad, ~300 ms), splashPool, the deck (features first and
                            NEW once, every card once per cycle, no repeat across a
                            reshuffle, pool changes), createBrowser, swipeIntent,
                            the store, the inert DOM part in Node
  assets.test.js            load.image / load.spritesheet / load.audio paths; README
                            sizes; the sprite art exported at 2x its drawn size (plan 35,
                            2.1); a spritesheet is a whole number of frames; sfx credits;
                            the sound triangle: every tracked sfx file is loaded, every
                            credited one is tracked (git ls-files)
  logic.test.js             gap bounds, rng determinism, hasPassed, angle,
                            resumeFlapVelocity
  levels.test.js            level lengths / ends / levelFor table, final level,
                            per-level pipe spacing, levelSpeed cap (the level-3 cruise),
                            names + colours, levelProgress, lerpColor, gap + grace
                            sanity, levelBannerText, levelBarLayout, levelLabel; plan
                            28, 4.4: every level colour on the bar's track at 3:1 or more
                            (WCAG), refreshLevelBar giving the raw level colour
  state.test.js             retry lockout
  perf.test.js              the frame meter's pure parts: perfMode, the median period,
                            long frames blamed on the previous frame's tags, perfLines
  streaks.test.js           Day streaks (plan 34): the shared rules, the streak store
                            (its key, junk, a refused write), recordCareer and
                            countDailyStreak counting days, signOut clearing it,
                            the profile rows, refreshStreakMarks, the subscripts'
                            spots inside the 🌞 and 📚 hit boxes; another player's
                            profile carrying their streaks; a Sign in clearing them
  zeroRun.test.js           plan 48: a run that crosses no pipe is not counted
                            (countsAsRun, recordCareer, endRun's runNotCounted), an
                            empty Daily Dump gives back its attempt (release, spent,
                            finishAbandonedDaily), the streak day at the first pipe,
                            Play.startAgain (Over's Play again after an empty
                            Daily Dump); Over's note itself is checked by the
                            smoke's daily and streaks sections
  playDays.test.js          The day streaks from the server (plan 34, 34.13, 34.14,
                            Checkpoint 34c; plan 48 call S: a 0-pipe row gives no
                            Singleplayer day): play_days and player_stats' streaks in
                            PGlite (the sources, the server's clock and its 48 hours,
                            time zones, aliases, the 400 cap, tz and single_best, a
                            zone taken back, no rewrite), fetchPlayDays,
                            mergeDayStreak, the store's merge with its floor,
                            Play.pullPlayDays, a late merge asking again
  store.test.js             best-score store incl. throwing/missing storage
  playAgain.test.js         plan 35, 4.1: TUNING.againSlideMs is 350 and launchSlideMs 700; only Play.launch({ solo }) (Over's Play again) slides over againSlideMs
  versusEnd.test.js         plan 35, 4.3: the second finisher's half never reads "Waiting for P1…" once the match is over; both halves redrawn
  settings.test.js          settings store (incl. skipSplash, plan 35 4.2; incl. hand; a set() storage refused kept
                            for the page load and shared by the stores over it,
                            AUD-030) + vibrate helper; plan 28 Stage 3b:
                            eduNewPerLevel (3, 5, 'all'; 5 by default); plan 28, 4.2:
                            eduShowHow / eduShowChoices (plan 34: false by default,
                            only true shows, the old eduHide* keys dropped)
  sound.test.js             sfx keys, mute, Node import
  tray.test.js              trayHeight / trayLayout geometry including info + lang +
                            feedback; trayHit centre hits vs miss in the tray gap;
                            the bean button centred in portrait, by either thumb on
                            a wide field, centred in a match half
  pipeMove.test.js          pipeMoveParams rows, pipeMoveAmplitude clamp, pipeMoveShiftPx,
                            rollPipeMove (no draw below fromLevel, centred pair, seeded share ≈ chance),
                            the linear speed step, every row's shift under ¾ of the clearance
  items.test.js             rollItem, itemGapY, scoreAfterItem, deathPenalty /
                            scoreAfterDeath (floor) + the death and levelClear
                            popups, probiotic inventory
                            (paused during the fart), postbiotic multiplier (fiber
                            with a probiotic up, countdown, extend, hit, fart),
                            pipe / item popups, popupSlots stack, postbiotic
                            start count, bean stacking to maxBeans,
                            normal vs super fart, fart envelope integrals; mystery
                            box: the roll at half fiber (only with { mystery }),
                            mysteryRolls only after the first box's pair,
                            mysteryMoves from level 4, scriptedMysteryPair in level
                            3's first four pairs, rollMystery bands and frequencies,
                            resolveMystery fallbacks, skipPairs, applyPostbiotic,
                            the gold skip popup; coins: the roll's coin share (half a
                            box's, no flag needed), BAND_ITEMS, MYSTERY_COINS, the
                            purse, buyBlocker / canBuy
  fart.test.js              fartFloat (glide, wave band, tilt sign vs direction),
                            hsvToRgb, rainbowHue, wave stays inside the play area
  tuning.test.js            item / fartVolume / beans sanity bounds (normal and
                            super fart peaks), popup rows, postbiotic badge, the
                            HUD icon pulse under the gap to its count, the resume
                            bounce scale in (0, 1), the
                            mystery block (levels, half fiber's weight and speed,
                            the locked draw table with the coin draws), coins (half
                            a box's weight, the locked shop prices, the volumes,
                            the purse row clear of the bean row)
  about.test.js             About copy (both locales) names author, LLM, Phaser, JS, sound;
                            LAST_UPDATED has a year and a time; versionText carries
                            the version and the beta tag in both locales
  changelog.test.js         CHANGELOG[0] is VERSION (a bump without notes fails the
                            suite and so npm run push), newest first, dated, notes
                            in every locale and translated; changelogEntry / Notes
  howto.test.js             HOW_TO copy, pause banner, the ready screen's ? box
                            (readyLayout().howto geometry, readyHit)
  feedback.test.js          issueUrl bug / feature templates (a bug form takes the last
                            caught error, URLs stripped: errorReportText) and the card report
                            (the code in the title and the form's fields, which
                            education.yml declares); openExternalUrl paths; feedback
                            i18n keys
  i18n.test.js              catalog key parity, zh≠en (allowlist), TRANSLATION_NOTES
                            key coverage, scene English denylist, initialLocale;
                            plan 26 A2: the wait line, the count lines, the popup's
                            words, eduProfileRows; plan 28 Stage 3b: caughtUpText
                            (the cap held off, a cap back on, the due cards past
                            the gate), the corn line's numbers from breakCoins
                            (AUD-060), the help line's duePerBreak
  share.test.js             shareMode branches, shareScoreImage (share
                            called synchronously, cancel, error → download, download
                            name + revoke, never rejects); shareFile (the file alone,
                            useSheet false, a cancel never a download; plan 28, 3.1b)
  eduBackupPanel.test.js    plan 28, 3.1b, in the fake DOM: the 💾 part for a player
                            not invited, Back up reaching navigator.share inside the
                            tap with a JSON file and no text (a second tap waits), a
                            cancel, a download (no file sheet, a mouse), Copy as text
                            with and without a clipboard, restore from text and from
                            a file (1 MB, the input reset), the errors, a restore that
                            lasts for the visit only, restore disabled off the home
                            screen; Play's eduBackupText / canRestoreEducation /
                            restoreEducation (settings only at the defaults, the 📚
                            switch not carried); Clear's cards note
  over.test.js              overButtonsLayout (Share | Home inside the panel, Home
                            alone on a test run), overHit, overBandLayout (the summary
                            band between the score and the buttons, every cell in it,
                            which lines fit), the education panel (Home | Play again
                            side by side, the glow clear of Home and inside the
                            panel, the bonus button over the pair, the tally row,
                            overEduLines: a lost run's rows all in its band, a won
                            run's never cut by it), the other panels unchanged,
                            shareCardLayout (inside
                            the frame, top-to-bottom order, rows inside the card)
  shareCard.test.js         drawShareCard on a fake 2D context (text order, tan frame
                            before the poop, icons + pipe cap slice, win line, text
                            max widths), renderShareCard blob / null paths
  overlay.test.js           overlayOutsideHit inside vs 1px outside HowTo/Settings panels
                            (plain and test-mode); leaderboardLayout (the tabs, the
                            window's rows; plan 28 5.2: 14 rows, the pager row under
                            them inside the panel, the footer's top under it and two
                            lines above the version)
  testmode.test.js          isTestWord, testRunStart (levels, par score, clamping),
                            nextTestLevel wrap, TEST_POWERS, settingsLayout geometry
                            (incl. the hand row)
  hitbox.test.js            scaledCircleBody source radius/offset for 2x and 4x; the art's 2x
                            scale (plan 35, 2.1)
  chromeShown.test.js       which chrome shows (plan 28, 4.3): chromeShown for one
                            player and a match, the ? / 🌞 row clear of the progress
                            bar, Play.syncChrome acting once per change
  chrome.test.js            chromeIntent matrix across state x overlay x input
                            (incl. the Changelog over About, 'respawn' pausing like
                            'playing' and ignoring taps, the shop's open / close rows)
  shop.test.js              shopButtonLayout (under both banners' hints, above the bean
                            button, clear of the tray and the break's poop; plan 28
                            5.1: y 800 under the mid-height bob, a match half's at
                            y 720), the
                            panel and its rows (inside the strips, apart, covering the
                            pill), shopButtonHit / shopHit, bracketButtonLayout (a row
                            under a match half's 💰, above the bean button), eduBreakLayout
                            (plan 26 A2: one row, the chip under Review, clear of the
                            poop, ⏸ and the tray; plan 27: on every field width 720
                            to 2560, with uiColumn and poopX as Play places them)
  gamepad.test.js           padAction (every knob, unmapped → null, a retuned layout),
                            stickNav deadzone / larger axis, focusStep wrapping,
                            focusRingLayout, padIntent matrix across top x state x
                            ring x action (+ the save-panel short-circuit, the
                            tournament panel's nav / A / B)
  matchHost.test.js         The match host interface: matchHostKey (match.hostKey, else
                            'Versus'), Play.versusHost, the host member list checked
                            against Play's source and Versus, the tournament panel over
                            Play, launch's two routes, splitFits vs versusOffered.
  versus.test.js            TUNING.versus sanity (gate, ghost, disjoint key groups,
                            catch-up tiers), versusAvailable, versusLayout (= the wide
                            field's width, the maxWidth / 2 cap), createMatch /
                            resetMatch, keyGroup, claimDevice (touch takes its half,
                            keys / pads the first free slot, refusals), deviceLabel,
                            ghostPlacement (gap, edge, range, the other's blink,
                            ended), rivalMarker, matchResult (score, fewer deaths,
                            draw; pipes never decide), respawnPose (phase boundaries,
                            the glide from the fall to mid-screen and the nearest
                            whole turn, the blink's triangle wave, done, purity),
                            coursePairStart / courseDistance (level spacings, a
                            line one spacing after its level's last pair, the same
                            place read from any pair, −pipeLead at the start), the
                            scoring / respawn / level-sync knobs, catchUpTier at 9 / 10 / 24
                            / 25, catchUpDraws + rollMystery on the doubled and
                            super tables, the 👥 ready box, padIntent on the versus
                            top
  course.test.js            mixSeed; a single-player course equals a hand-rolled
                            single stream in Play's order (course.rng swappable); a
                            shared course is the same for two players whatever their
                            score or bag, per pair (order-independent), differs by
                            seed, takes the pair number for the score gates, lets
                            beans spawn into a full bag, rolls moving pipes from
                            pipeMove.fromLevel
  lazyAudio.test.js         plan 35, 2.3: Boot loads none of the six lazy sounds, Play
                            loads the missing ones once per create() on the first render,
                            one load at a time across Play and PlayB (registry 'lazyAudio')
  smoke.test.js             logic.js imports and exports VERSION
  save.test.js              save codes: spec rows 1-10 (round trip, tamper, relabel,
                            v2 migration, merge, name rules, wrapped paste, empty
                            scores, throwing storage) + helper coverage, best 6,
                            the optional h (hand) key
  ready.test.js             readyLayout boxes inside the field, non-overlapping,
                            clear of the bobbing poop; readyHit centre / gap / profile;
                            the 📚 glyph's box (educationInfo: thumb-sized, clear of
                            the track, hit before the switch)
  serve.test.js             npm start points at tools/serve.py; bind + URL print;
                            the no-store handler
  leaderboard.test.js       LEADERBOARD config shape (limit 25, visibleRows 14); submitScore headers / body /
                            400 / throw / timeout; disabled config makes no request;
                            fetchTop parsing + order; fetchRank; submitPlan matrix
                            (name, id, cap, confirmed, rename, flag, id change);
                            submit store incl. throwing storage; submitTournament
                            (ok / keep / rejected), fetchTournamentBoard, the
                            tournament queue (cap, order, joined drains);
                            submitDailyScore's answer mapping, fetchDailyBoard;
                            the career store's batch / claim life cycle,
                            submitCounters, claimAchievements, fetchPlayerStats;
                            plan 28 5.2: the four fetchers' p_offset (page 1's
                            requests unchanged, the table read's offset=),
                            withOwnRows per page, boardPage (the page, mine, last), opts.peek's limit + 1 (plan 35 4.5)
  nerdAlert.test.js         🤓 Nerd Alert's rule since plan 34: won, perfect, caught
                            up (eduCaughtUp), graded, any start level; the pending
                            run's caughtUp, moved by bonus answers
  achievements.test.js      The catalog (ids, copy in every locale, every badge
                            earnable), evaluate (run badges from single player only),
                            runDeltas and its caps, addCounters = merge_counters,
                            quest windows, bestFacts, catalog ↔ achievement_defs
  daily.test.js             Daily Dump: the UTC day key and countdown, FNV-1a
                            vectors, seed / level stable and spread over 3–7,
                            dailyRunStart, the per-pair reward stream, the daily
                            store and queue, the result's date / rank / share words
  schema.test.js            db/schema.sql in PGlite, applied twice: anon reads no
                            tournament table; medals = placings() for 2–8 players (2: a lone
                            final, gold and silver)
                            (the floor pinned to minPostPlayers);
                            300 legal brackets accepted, 16 forgeries rejected (no
                            receipt left); duplicate / 60 s pacing; guests; board
                            order and `me`; names; merge_players folds medals;
                            daily: the cap / level pins, client = server level over
                            a year, today / yesterday only, first post kept, the
                            name claim, the board (`me`, `total`), the day in UTC
                            under other session time zones, the fold, anon access;
                            the 📚 board (closed until opened, adults only, the name
                            claim, batches and their receipt, 'restart', the board's
                            order and minimum, rename, unshare, the fold) and the
                            pilot (the invite code, events under a research id with
                            no player id, malformed batches, withdrawal, the owner's
                            views, a purge, the fold). Run under Supabase's default
                            grants (every new table and function open to anon unless
                            revoked), so a missing revoke or RLS fails. Plan 24: the
                            stamp is current and anon reads it; the header lists
                            exactly anon's functions; the upgrade (the fixture's
                            schema holding rows of every kind, then this file twice:
                            every row and old call answers as before); recent
                            receipts on both tables; the probe; badge days clamped;
                            the 📚 name rule; the participation token and the kept
                            phase. Plan 25: the Postgres guard, since_ms clamped,
                            the fold's 📚 locks (pg_locks), the 5 s share pace, the
                            🌞 / 🏅 name rule (and old duplicates through the upgrade).
                            Plan 28 5.2: the four boards' pages (p_offset last,
                            default 0; the caller flagged on its page and appended
                            on others; a hidden player left out; one signature each,
                            anon only; the named call without p_offset)
  schemaOnline.test.js      The online part of db/schema.sql in PGlite, a device acting through
                            request.jwt.claims and the authenticated role: linking, trust and
                            pairing, the name claim both ways, rooms, caps, the channel
                            policies, housekeeping; plan 39, 2.4: matches, finish_match
                            (agreed / disputed / refused / abandoned, the bounds and caps,
                            telemetry; 3.7: a waiting device's report, each seat's trust
                            as reported), online_history, the off switch, rematch pacing,
                            races following trust in a merge, the fourth waiting device
                            (2.4e), the boards' posts and race runs; 5.2b: the pacing of
                            join_room, answer_guest, set_room_status and link_online_player,
                            the 30-day race cleanup, every online function definer
  schemaFriends.test.js     Plan 39, 3.1 in PGlite: friends, blocks, peer handles (per viewer,
                            no ids out), eligibility (3.7: both seats paired as reported), merges of friend data following trust,
                            AUD-103 seniority (online_trust.since), the upgrade backfill, the
                            guard against finding a player by a name or search, a dead handle
                            (null peer), the 90-day trust cleanup, the 3.1-paste upgrade
  schemaStatus.test.js      Plan 39, 3.2 in PGlite: online_beat (trusted only, 5 s write gap,
                            a leave deletes), friend_statuses (states, order, friends only, no
                            ids), in_game from a room 'playing', the 60 s fresh window
  schemaInvites.test.js     Plan 39, 4.1 in PGlite: send_invite (who may be invited, the caps, one live
                            invite per device and pair, a resend keeps the room), accept (ready, no code),
                            decline and cancel, expiry read live (TTL, room, beat, friendship), the
                            player's own topic (a handle, its policy, a merged-away id), online_unseat and
                            join_room ending invites, the caps surviving an unlink, the two-day cleanup,
                            the undo line's restore list, no role reads the table
  runLog.test.js            submit_runs and run_log in PGlite as anon: owner-only, rejects
                            counted, a resend stored once, 5 s pacing, 90-day purge, the
                            merge; plan 39: mode 'race' accepted and treated like single
  onlineLiveCheck.test.js   tools/online_live_check.mjs: the target guard, the arguments,
                            how a channel answer is read and its 14 steps
  online.test.js            src/online.js: the protocol and its validation, stale and
                            reordered messages, the derived version, codes, the clock,
                            the ghost against a 60 Hz sender over every netsim profile
                            (and 2 Hz vs 5 Hz keyframes, item 25), the field width pairs (5.2b: quiet once heard),
                            the room state machine
  onlineNet.test.js         src/onlineNet.js: a fake client on a virtual clock (sign-in,
                            stored and dead sessions, RPC errors, the clock, join, caps,
                            rejoin, presence limits, verified room events; 5.2b: a close while the first
                            load is out, signIn({ create: false })), and the real
                            vendored bundle on a fake fetch (online RPCs carry the Bearer
                            token; leaderboard, daily and tournament calls never do)
  onlineFriends.test.js     src/onlineFriends.js: the lists and their sort, the opponents (a
                            null peer, blocked, asked), offer(), ask / accept / block errors,
                            createStatusBeat (start, stop quiet and loud, hide, show, 'not
                            trusted', one timer), beatMs under half of the schema's c_fresh
  onlineInvites.test.js     src/onlineInvites.js (4.2): rows taken whole, the ring and m:ss from the
                            server's times, one incoming per friend, the topic's events, the error
                            words, load / accept / decline / expiry
  onlineInvitesPanel.test.js src/ui/onlineFriendsViews.js and tournamentPanel's ✉️ on
                            tests/support/panelDom.js: invite_list once linked, the topic it names,
                            ✉️ n on 🤝 Friends, the inviting friend first, Invite, accept, ✕,
                            Resend, nothing outside online mode, closed at the hand-off
  onlineJoinLink.test.js    the share link (4.3): joinLink, joinCodeFromSearch, withoutJoin, the
                            panel's `join` kept through sign-in, name and Retry, a gone room's
                            'onlineLinkExpired', Share's copy fallback
  onlineFriendsPanel.test.js src/ui/onlineFriendsViews.js and tournamentPanel's Friends
                            screen on tests/support/panelDom.js: the button and badge, each
                            section, ⋯ with Remove / Block asking twice, polls, an
                            opponent's row with only its ⋯ (Add friend inside), the not-paired screen, the beat (on at
                            link; off on ✕; a waiting device's stops itself; kept through the
                            race hand-off), and 3.6's hold/release harness: a call that
                            answers after the screen changed draws nothing, a refused action
                            reads the lists again, onPaired beats only with 🌐 on (18 tests)
  onlineAccount.test.js     src/onlineAccount.js: enter / claim / devices / remove /
                            pairCode / pair / leave on a fake net, every error key
  onlineAccountViews.test.js src/ui/onlineAccountViews.js: each screen, its errors and
                            strings
  onlineLobby.test.js       src/onlineLobby.js: create / join / ask / answer / ready on a
                            fake net, auto new codes, Decline's new code, the version check,
                            finish / rematch / roomItem; rejoin (resume skips the leave on
                            entry; over, offline and a refused channel keep the room;
                            notice)
  onlineLobbyViews.test.js  src/ui/onlineLobbyViews.js: each screen and its strings
  onlineReport.test.js      src/onlineRace.js's raceReport, createRaceReporter, reportLine
                            (2.5); the onlineAccount races() / historyRows view
  racePosts.test.js         tournament.js racePosts, leaderboard.js createRacePostQueue and
                            the drain order after the tournament queue (2.5)
  raceRun.test.js           a split-screen race's half summary (mode race), its run queued
                            under the racer's id before its post, the early drainRuns, postRace's
                            wait (plan 39, 2.8)
  racePostName.test.js      Play.postRace end to end on PGlite: a race post never changes a
                            player's board name (an old pasted code, a kept roster after a
                            rename, require_run's held post) (2.7, AUD-106)
  onlineEndedRejoin.test.js two real OnlineRace scenes on a 40 ms link: an ended side answers
                            a rewound peer that rejoined inside its dead socket's presence
                            linger; both seats, two sequences, plus two controls (2.7, AUD-107)
  onlineRace.test.js        src/onlineRace.js: start plan, countdown, the feed, the referee
                            (first on server time, the ready count, a ready taken back,
                            the rematch ask, the held referee; 5.2b AUD-143, AUD-144, AUD-147: the flap ceiling,
                            the answer rules, the quiet width), raceRoomItem; two simulated peers racing
                            through a level break to the end; pauseOverlay, createWakeLock, the
                            feed's hold / release / again
  onlinePause.test.js       src/onlineRace.js's createRacePause: two devices with the real
                            sender, inbox and feed on a simulated link (airplane mode, a
                            hidden tab, silence, presence, a one-way break, a lost resume
                            or cancel, solo after the other's end, stats; the feed's ghost hold;
                            a guest reloading on a new session at its saved round, both held
                            until Ready, one GO)
  onlineResume.test.js      2.3: the rewind event and reason, rejoin, effects.restoreLevel,
                            levelSnap, rewindOnHeard, the record (v2) and its store, resumePlan,
                            the floors, the rewind hold, the overlay; resumeOwner, the
                            store across two pages, pageTab, the knobs and keys
  onlineRaceScene.test.js   scenes/OnlineRace.js's wiring on a stand-in Play and a fake
                            transport (initRace, the host interface, the final line's
                            hold, the rematch restart, the pause host methods, the overlay
                            and Leave's double tap, the abandoned panel, the pill's paused
                            state, a pause before GO; a rewound scene, keepLevel, the other
                            side's restart, the final-line guard; the beat, stepping aside
                            on a frame / the wake / the beat, a reload keeping the owner,
                            Play's store and tab id, openPendingRace); Play's onFinishCrossed line and
                            awardLevelFirst
  onlinePanel.test.js       tournamentPanel's 🌐 view on tests/support/panelDom.js: mounts,
                            forced over Play, exits leave the room, keypad; the rejoin
                            (record read, lobby made with resume, the store handed on);
                            a live record (no rejoin, no leave, the line, one look again;
                            the look finding it free), a relaunch's stale record, Create
                            beside a live race
  onlineDevProject.test.js  onlineProjectConfig and ?onlinetest: dev hosts only, own keys,
                            off, blocked storage
  onlineSignOut.test.js     Sign out and a Sign in as another player leave online play only on
                            a device holding a session (Play.onlineSessionHeld /
                            onlineLeave); otherwise no client load
  savePanelStates.test.js   plan 44, the save panel in a fake DOM: signed out (Sign in | Create user,
                            ‹ Back), the Sign in preview and guest line, Create user and its code
                            popup, the dashboard, the (?) card, the Sign out confirm and its notes
  savePanelMerge.test.js    plan 44, Merge players…: both cards, the pick, this device kept
                            (merge_players(device, code), noteRename, forgetBoardCache), the code
                            kept (the old Load), "That's already you.", the 🌐 line only with a session
  schemaCheck.test.js       tools/schema_check.mjs: the stamp (blanked, idempotent),
                            the one read-only live call (an injected fetch), each
                            state it reports (current, fixture, other, none,
                            unreachable), push going ahead only on current and then
                            copying the fixture, the push's order (pushSteps: the
                            fixture before npm test), and the pasted comparison query
                            run in PGlite over the fixture
  push.test.js              tools/push.mjs run for real in a temp copy (stub git and
                            npm on PATH, the live check against a local server, never
                            Supabase): a push tests the committed tree then commits
                            and pushes; failing tests, a first push with no fixture,
                            an interrupt that reaches only the push, a dry run and
                            --no-schema-check each leave the tree as they should
                            (AUD-050); the 'sw' step stamps index.html and sw.js after
                            LAST_UPDATED, a BUILD for another VERSION refuses and puts the
                            tree back, --dry writes nothing
  sw.test.js                sw.js and tools/sw-off.js in node:vm with fake caches, fetch and
                            clients (plan 35, 3.1): early returns (cross-origin, non-GET,
                            Range, websocket, outside scope, ?nosw, unlisted), index.html
                            network first then the cached copy (a failure, a 404 or 500, past
                            3 s), a listed file from this build, then the previous build, then
                            the network, install (hash check, copy from the previous build, one
                            retry, a failed install), activate (keeps the previous build, never
                            deletes a cache it did not name), a throwing cache, unstamped
  swStamp.test.js           tools/sw_stamp.mjs on a temp copy of the tree: byte-identical
                            output for the same tree, one changed module gives a new BUILD and
                            only its own ?h=, a VERSION bump new ?v= URLs, every module in the
                            map and FILES, every asset the code names listed with its query,
                            an untracked stamped file refused, --check-if-stamped (AUD-155, 156)
  swClient.test.js          src/swClient.js and logic.js's worker parts: localHost, swMode (?sw,
                            ?nosw), workerScope, removeWorker (only this scope's worker, only
                            flappy-poop-* caches), registerWorker (once per page, one update()),
                            hardReloadGame with the network up, down and a hung unregister
  fsrs.test.js              src/fsrs.js against py-fsrs's test_review_card and
                            test_memo_state (on a harness with py-fsrs's learning
                            steps), the default weights, and properties over random
                            histories (S > 0, D in [1, 10], easy ≥ good ≥ hard, a
                            right answer never lowers S, a lapse never raises it)
  education.test.js         src/education.js: gradeFor (first sight = good), FSRS
                            schedule (new, the game sequence, missed, practice, the
                            365-day cap), the SM-2 records' conversion, pickCard in each context
                            (break, revive, browse) and its exclusions, cardCounts ==
                            what pickCard hands out, reviveStep (strikes, the choice,
                            the streak, Quit ('giveUp') only in strikes), reviveSettled,
                            tallyAnswer, eduShopPrices (rounded up), masteryByDeck
                            (retired cards out), createEduStore (records, badges, the
                            average, Clear on the same instance), dueCount, cardText.
                            Plan 25: a break's own order, counted cards before early
                            reviews, missed counts, the drain test with any recent gap,
                            unlockLevel, bury and the local day; plan 26 A2: the paid
                            record, the study record and the streak helpers (same
                            day, next day, a gap, the day before, month and year
                            ends; plan 27: a clock set ahead, the clock toggled);
                            plan 27: skipPractice (AUD-028); plan 28 Stage 3b:
                            skipNew, breakDecks (gut order, wrap, a retired card),
                            a break's scope, newAllowance held off, skipped new
                            cards, a break's two limits (the drain under newLeft /
                            dueLeft, beyond before practice, the most urgent first,
                            whole limits, counts and picks with the same options;
                            AUD-056, AUD-058)
  eduDays.test.js           Education's local days with TZ pinned to
                            America/Los_Angeles in its own process (plan 27):
                            skipUntil on the fall-back, spring and a normal day,
                            and Play's Skip on the fall-back day (AUD-029); pay once
                            a day across a local midnight inside one break (AUD-035)
  eduGateFuzz.test.js       plan 28 Stage 3b (audit 2026-11-16, AUD-056): a level
                            break's gate driven as Play and the quiz do, seeded
                            (answers, misses, the three Skips with the day's cap,
                            quizzes reopened, the clock, retired cards, N 3 / 5 /
                            all, duePerBreak 0 / 1 / 3 / 10 / none): the gate holds
                            exactly while a counted card is left; the counts are the
                            picks, kind by kind
  eduIntroPanel.test.js     the 📚 popup in a fake DOM (audit 2026-11-16, AUD-061,
                            AUD-063): New cards per level (pressed, its line, a
                            click stored, the focus kept, both languages), the click
                            lockout, the help line's duePerBreak, the per-day line
                            only with a cap, a close at a restart that does not call
                            back into the scene; its style takes the shared frame
                            (plan 28, 4.1); Show / Hide (4.2: each toggle's word and
                            its line in one button, a press stored once with the focus
                            kept, a reopen keeping it, the ring skipping a hidden
                            section, both languages)
  panelFrame.test.js        the DOM windows' shared frame (plan 28, 4.1): the safe-area
                            padding on four sides, the card never past the padded box
                            and never in vh, the width cap; a source check that the
                            four panels take it and no src/ui file keeps a vh card or
                            its own full-page backdrop
  cjkWrap.test.js           cjkUnits / wrapCjk (plan 28, 2.1): Chinese breaks between characters, a
                            number or Latin word whole, no line starting with "，" or ending with "“", a
                            name's dot and a dash never split, the text kept whole; Quiz's cjkWrap callback.
  superCards.test.js        The challenge cards (plan 34, deck super): 21 on their own
                            sources, never a quiz's new card, back like any due card
                            once met, masteryByDeck, pickSuperCard
  superQuestion.test.js     The challenge question (plan 34): tuning, reward and
                            penalty, floatY, course.superQPair (inside the level, its
                            own stream), armSuperQ, offerSuperQ and the hold, the
                            answer (saved, paid or charged, outside the tally and the
                            pilot), endSuperQ, a revive's re-arm, the Quiz offer
                            (lockout, Try, no way out) and the answer's verdicts
  questions.test.js         src/questions.js: decks, ids, a question and three
                            different options per card, text limits, a complete zh version on every live
                            card (trimmed, three different options, the Chinese limits, the small numbers
                            and years kept; plan 28), references cited and existing, enough live
                            cards per deck; plan 26: CARD_LINKS (1–3 per live card,
                            every term linked in its explanation, Wikipedia URLs)
                            and REFERENCE_DOIS (DOI shape, known references, Learn
                            more exactly when one exists); src/questionAudits.js (no stale audit,
                            cardHash, auditState); tools/audit_questions.mjs
  playEducation.test.js     Play's education rules in Node (tests/support/scenes.js):
                            a match half never latches education; 👥 / 📚 exclusion,
                            two tabs included; a test run saves no card and records
                            no event; 🔬 never in a test run; the revive's own
                            penalty; drainEduShare never rejects and follows 'rejected'
                            / 'not shared' / a rename answered false. Plan 25: an
                            education run's end syncs (a test run's does not); test
                            mode turned on after the start saves nothing; the 📚
                            glyph opens ("Your cards" again since plan 26's A2) on its
                            own pointer's release; a break's misses
                            asked again; the gate (every break
                            since plan 26); Quit (grading both ways).
                            Plan 26 A2: Skip (every kind of card, the cap on due
                            cards, the gate, a test run free, none outside a break),
                            Skip ▸ gone; a wrong
                            answer costs nothing; every card pays once a local day,
                            practice included; a test run pays every right answer;
                            the gate's line; the shop pill's place; the level
                            choice (steps, wrap, dropped, applied forward and back,
                            not full) and the top-level prices; the popup at each
                            start (launch: popup or run, by start); plan 28 Stage
                            3b: the gate (N new cards a visit, duePerBreak due
                            cards, a miss here on top; none in a test run, a match
                            or test mode), what a break counts (answers, retries,
                            each Skip, a quiz reopened), corn by kind, a beyond
                            card optional, Quit with new cards left, the level
                            choice reading the gate again (AUD-057), the 📚 count
                            never redrawn on a destroyed text (AUD-063); plan 28
                            5.1: every one-player break's poop at mid-height and
                            its banner at eduBreakLayout's titleY (a match's at
                            40%), a match half's pill at y 720
  pilot.test.js             the tester pilot end to end: Play's pilot methods, the
                            real stores and leaderboard.js calls and the real save and
                            education data panels, against db/schema.sql through
                            tests/support/postgrest.js: Sign in then Withdraw (merge
                            before or after), two devices, a new participation, the
                            queue emptied on join, the kept phase, an older notice
                            (Withdraw offered, nothing recorded or sent), an offline
                            Withdraw, Clear, the old unlock word never saved as a name (eduWordRetired)
  eduBoardSync.test.js      the 📚 board's sync end to end through the same stand-in:
                            a resend after another device's batch, a resend never
                            moving another player, the round probe, a merge of two
                            sharers, a wrong clock's badge day, sharing off then on,
                            two syncs both told to restart, the share store's rounds;
                            plan 28, 3.1a: a restored backup's runs never reach the
                            board (5 shared, a restore, 2 played: 7, not 12), and a
                            fold where one id restored the other's backup
  eduBackup.test.js         plan 28, 3.1a: the backup's fields (nothing that names the
                            player or the device), reading one back, every merge rule,
                            history (the cap, endRun, a restore; an older client's
                            write and sync sending only this device's runs and the 🤓
                            streak not restored: AUD-047), boardRecord, the
                            share store after a restore (before and after Stop then
                            Share), store.restore's summary and saved (blocked, full,
                            no storage)
  cornSpin.test.js          The quiz purse's corn spin (plan 34): purseSpinRate within
                            the glow's fade, coin-spin-quick, a sprite purse, the
                            spin on a payment, none on a Skip, stopped in a revive
  quiz.test.js              Quiz's rules in Node: a card under another overlay is
                            interrupted, nothing answered once the quiz is finishing,
                            the 🚩 never navigates the game's tab, tapLocked, the
                            numbers' explainer (plan 25); plan 26: the next wait,
                            caught up with Keep practicing, the purse; plan 26 A2:
                            Quit's warning on every card, holdFor's timer, the break's armed Quit held (breakQuitHeld, plan 35 4.6), the
                            ⭐ choice's own line, the already-earned note, Skip
                            (price, warning, lockout, keys, why it is dimmed); plan
                            28 Stage 3b: the stop before a due card past the gate
                            (more, Keep practicing, no count underlined)
  richText.test.js          src/richText.js: linkSpans (whole words, overlaps,
                            missing terms) and layoutRich (greedy wrap, centred
                            lines, parts that add up, links across a break)
  blockedStorage.test.js    Every read of localStorage throwing: src/ never touches it
                            outside the store; plan 35, 1.5 adds that the 📚 switch holds
                            across Play's restarts (a new store reads it back)
  jsonStore.test.js         src/store.js and the stores on it: storage is the truth,
                            a broken entry reads as empty, memory when storage throws
                            or is full, another tab's Clear holds, and a tab behind on a
                            failed write takes the other tab's newer one (AUD-087)
  resync.test.js            createResync (two triggers send once, a failed send is retried,
                            the 30 s gap, online and a show together) and Play's resyncOnline /
                            resyncVisibility in and out of a match, the wiring
  privacy.test.js           no local-only path tracked (meta/, .claude/plans/,
                            Claude outputs/, row dumps) and no player id from
                            meta/db-backups in a tracked
                            file (failures name a fingerprint, never the id);
                            tools/privacy_scan.mjs's helpers
  sha256.test.js            sha256 / hmacSha256 against FIPS and RFC 4231 vectors and
                            Node's crypto; user codes sign and load without
                            crypto.subtle (plain http)
  tournamentLobby.test.js   the tournament lobby's opening rows: a player with a username
                            is row 1, none gives two guests
  tournament.test.js        src/tournament.js: brackets for 2–8 players, races and
                            byes, the bronze match, recordResult's refusals, seeding
                            (reseed, reshuffle, the lock), raceOutcome, the code
                            claim, the race's own level table, tournamentPayload
  tournamentNames.test.js   guest names: the word lists, every name fits a username,
                            rollGuestName (seeded, rerolled in the lobby)
  support/                  not test files (the glob is tests/**/*.test.js): bootTrap.js
                            (index.html's inline trap on a fake window and document, its one
                            import() a call to `importSplash`), scenes.js
                            (a scene in Node: Object.create(Scene.prototype), sinks,
                            fakeStorage, registry), postgrest.js (a PostgREST stand-in
                            over PGlite that answers only LEADERBOARD.dataApi, with
                            Supabase's roles and default grants), dom.js (a fake DOM
                            for the DOM panels; appendChild, remove, files, href and
                            download since plan 28, 3.1b), panelDom.js (the DOM the 🌐 view
                            tests need on top of it, plan 39, 1.6c)
  fixtures/schema-applied.sql  db/schema.sql as last applied to the live database
                            (main's b497a0c until the next apply); the upgrade test
                            starts from it. Never edited by hand: npm run push copies
                            db/schema.sql over it once the live stamp matches, before
                            it runs the tests
  research.test.js          src/research.js: answerEvent's fields (exactly the
                            server's list in db/schema.sql), cleanEvent, the consent
                            store, the queue; RESEARCH.md names every field and the
                            consent version, and holds no email address
  scenes.test.js            no scene method is named after a Phaser.Scene property
                            (add, load, input, time, render, …): such a method is
                            shadowed by the plugin and throws inside create(), which
                            freezes the game loop. Node never runs scenes, so this is
                            the only place to catch it. Also: no scene / ui module
                            reads GAME_WIDTH (the field is this.scale.width), and
                            Play.js reads this.scale.width only to fit the field (its
                            world is this.fieldW: a half of the canvas in a match).
  tools.test.js             npm run smoke points at headless_check.mjs; its OVERLAYS
                            (Boot, Play, new Play('PlayB'), Over and Versus excluded)
                            map equals the overlay scenes registered in main.js; its
                            SECTIONS (unique, described, needs pointing backwards) match
                            the file's section() calls in order; the gamepad stub precedes
                            the page load and the leaderboard muzzle sits unwrapped between
                            the run and farts sections (so every --only subset is muzzled);
                            parseArgs / expandOnly
  orphans.test.js           the orphan audit, sources read as text (comments stripped;
                            tests never count as a use): every src/ export is used by src/
                            or tools/, every config knob is read in src/, every UI string
                            key is named outside the catalog, every texture Boot loads is
                            drawn, every overlay is in ui/overlayStack.js
                            OVERLAY_SCENES (which chromeArgs / padTop read) and
                            launched. Kept-on-purpose items sit in its allowlists with a
                            reason (ALLOWED_EXPORTS: the test hooks); an entry that stops
                            being true fails; self-tests prove each scanner can fail

.github/ISSUE_TEMPLATE/     GitHub issue forms: bug.yml and feature.yml opened from
                            Feedback; education.yml (plan 28: a card report, a broken link, an idea; label `education`) from the
                            🚩 on an education quiz card, which fills in its card-id
                            and version fields; config.yml allows blank issues.

tools/
  make_placeholders.py      Regenerates pipe / villi / ceiling / ground, and plan 34's
                            question.png (the challenge bubble, 230 px, a see-through
                            placeholder, line widths scaled from the 384 px look) only while it is missing (icons
                            moved to process_art.py); ceiling.png is the ground's
                            mirror (ceiling_strip), drawn by the game as its own
                            strip over the pipes; a cream backdrop from each
                            screen edge to BAR_FRAC of the shortest fringe tip
                            sits behind everything; fingers run off the
                            edges / behind the strips (villi_band min_frac) and
                            their lumen-side tips undulate (BACK_WAVE on the
                            fringes, FRONT_WAVE in the strips' TIP_ZONE). Must
                            not overwrite poop.png. Run only when you intend to.
  process_art.py            Crops assets/src/ drawings into 192x192 contract PNGs (SIZE 192;
                            drawn at spriteDisplayScale 0.5 → 96 logical px, art at 2x);
                            runs oxipng -o 4 --strip safe after Pillow's optimized save
                            when oxipng is installed;
                            the poop set (alive / dead / stink1 / stink2 / falling /
                            stink-falling1 / stink-falling2 / scared / stink-scared1 /
                            stink-scared2 / fart / speech) shares
                            one body scale and centre, stink / falling / fart /
                            speech on bigger squares; bean.png from Kidney_Bean.png,
                            postbiotic.png from Postbiotic.png, mystery-icon.png from
                            MysteryBox_Icon.png; process_sheet cuts MysteryBox.gif's
                            frames on one shared square into the mystery.png strip (192 px frames)
                            and CornKernel.gif's into the coin.png strip (106 px frames);
                            process_icons cuts icon-192 / icon-512 (padded to the
                            maskable safe zone) and apple-touch-icon (full bleed)
                            from FlappyPoopAppArt.png.
                            Arcade circles use scaledCircleBody (Phaser source pixels).
  serve.py                  npm start: bind 0.0.0.0:8000, print laptop + phone URLs;
                            NoStoreHandler sends Cache-Control: no-store on every
                            response so a reload never serves a mix of cached and
                            fresh ES modules (an old scene with a new config.js
                            once looked like a broken leaderboard). Pages caches
                            ~10 min: Settings → Reload game there.
  push.mjs                  npm run push: asks the live database for schema_version()
                            (tools/schema_check.mjs, one read-only call) and stops
                            unless it is this db/schema.sql's stamp; stamps
                            LAST_UPDATED in src/logic.js with the current local time,
                            copies db/schema.sql over tests/fixtures/schema-applied.sql
                            when they differ, then runs npm test on that tree, the one
                            it commits (plan 28, 3.0: the order is pushSteps in
                            schema_check.mjs); a failed or interrupted test run (a
                            signal while npm test runs is remembered, then the run
                            fails: AUD-050) puts the stamp and the fixture back and
                            exits. Right after the stamp, an 'sw' step (pushSteps) runs tools/sw_stamp.mjs
                            (writeStamp, then checkStamp); a problem puts the tree back and exits.
                            It commits src/logic.js, index.html and sw.js (and the fixture) and pushes main. Refuses a
                            dirty tree or a non-main branch; --dry skips commit +
                            push and puts the stamp and the fixture back (the tree as
                            it was); --no-schema-check skips the live check and leaves
                            the fixture. tests/push.test.js runs it in a temp copy
                            with stub git and npm and a local stamp server.
  sw_stamp.mjs              The service worker's stamp (plan 35, 3.1), written by npm run push
                            right after LAST_UPDATED: index.html's import map (every module at
                            src/<path>.js?h=<first 10 hex of its SHA-256>, after the charset meta,
                            before every script) and the ?h= on the main tag and the modulepreload
                            hrefs; sw.js's BUILD (<VERSION>-<10 hex>) and FILES (URL as the page
                            asks for it, SHA-256). checkStamp refuses a BUILD for another VERSION,
                            a module or asset the code names but FILES lacks, a stale hash, and a
                            stamped file git does not track (untrackedPaths: push commits tracked
                            files only, so it would 404 at install; judged only for a root that is
                            the top of a git work tree; AUD-155). isStamped tells a stamped tree.
                            An sw.js holding FLAPPY_SW_OFF is left alone. node tools/sw_stamp.mjs
                            [--check] [--check-if-stamped] [--root=DIR] (the second passes an unstamped
                            tree, and holds a stamped one to --check). tests/swStamp.test.js.
  git-hooks/pre-push        Tracked, installed by hand: cp tools/git-hooks/pre-push
                            .git/hooks/pre-push (like the local pre-commit). Refuses a plain
                            git push of main when the stamp is stale (--check-if-stamped); npm run
                            push restamps first, so it passes; an unstamped tree passes;
                            --no-verify bypasses (AUD-156).
  sw-off.js                 The kill switch: copy it over sw.js and push (see "Service worker").
                            Deletes flappy-poop-* caches, unregisters itself, reloads its pages.
  sw_check.mjs              node tools/sw_check.mjs: the worker in a real browser, 50 checks. It
                            stamps its own temp copy of the tree, serves it on 127.0.0.1:8036 (open
                            with ?sw) and starts its own headless Chrome with the jsDelivr CDN and
                            *.supabase.co unresolvable. Covers registration after the lazy sounds,
                            an offline launch, a same-VERSION push, a VERSION bump, Reload online
                            and offline, ?nosw, the kill switch, and that no cross-origin request
                            passes through the worker. Run it, like the smoke, through smoke-runner
                            after its pgrep wait for another headless_check.mjs.
  schema_check.mjs          npm run schema:check: which db/schema.sql the live database
                            last ran (its schema_version(), one read-only call): this
                            file, the fixture's (this file has changes to apply),
                            another, or none yet. --query [--detail] prints a
                            read-only query for Supabase's SQL editor and the value it
                            shows when the live database holds the fixture's schema
                            (for a database with no stamp yet). npm run schema:stamp
                            (--stamp) rewrites the stamp after an edit.
  privacy_scan.mjs          Where a player id or username appears (plan 21, P1): the
                            working tree (ignored files too: meta/db-backups,
                            .claude/plans), every commit (git log --all -S), and with
                            --issues GitHub Issues (sends the term to GitHub). Prints
                            file:line / commit locations and a sha256 fingerprint, never
                            the id, name or lines. Read a secret from stdin (`-`). Exit 1
                            on a hit. tests/privacy.test.js uses its helpers
                            (forbiddenPaths: the paths git must never track; its
                            folders in any case at the root, AUD-035).
  audit_questions.mjs       The question bank's audits (plan 21): list (unaudited and
                            stale cards), report [--out=f] (a markdown review sheet:
                            the checklist, every card with its status and hash, the
                            references and who cites them), mark <ids> --by="Name"
                            [--note=…] [--on=YYYY-MM-DD], unmark <ids>. mark / unmark
                            rewrite only src/questionAudits.js's block and read it back.
  supabase_stubs.mjs        The one PGlite preamble: roles with Supabase's default privileges,
                            and the auth / realtime stand-ins. Every PGlite boot uses it;
                            schema_check.mjs imports it lazily so push.mjs needs no more files.
  online_test_link.mjs      Prints the ?onlinetest phone link for a test project from an env
                            file (plan 39, 1.6c); the repo never holds a project's URL or key.
  online_live_check.mjs     The live check of the online schema (plan 39): --env <file> for a test
                            project, --live for the live project after the paste. Throwaway ids start
                            CHECK_ID_PREFIX ('chk39'); TEARDOWN_SQL also deletes their matches,
                            online_trust and online_profiles rows and is printed at every end,
                            a pass included (AUD-140). Step 8 waits DECLINE_WAIT_MS (2.5 s)
                            after minting before it declines, past answer_guest's 2 s decline
                            pacing (AUD-136; plan 39, 5.3b). Four anonymous
                            sessions, fourteen PASS/FAIL lines (line 12: friends and status; line 13:
                            invites; line 14: teardown; a test project expects 13 of 14, live 14 of 14); each session unlinks itself; never a
                            secret key. tests/onlineLiveCheck.test.js covers it.
  headless_check.mjs        npm run smoke [url] [--list] [--only=a,b]: the checks run in
                            named sections (SECTIONS, in run order, each printing its check
                            count); --list shows them; --only runs those plus what they
                            need (needs omitted = every earlier section; [] = passes alone,
                            set only once shown), skipping and never reordering; the
                            hermetic stubs, the boot wait and the leaderboard muzzle sit
                            outside every section, and so does startEducationRun (plan 26
                            A2): every education section starts its runs through it (a
                            settled ready screen, a start, the 📚 popup's Play once its
                            click lockout is over; a check fails when the run is not an
                            education run, or 📚 was on and no popup opened: AUD-035). The boot wait goes through the loading
                            splash: a card shows, Continue lights up and glows, Play waits,
                            → changes the card, Space down alone does nothing, its release
                            continues; then the splash is gone and the ready screen did
                            not start a run. It launches headless Chrome (CHROME env
                            overrides the path), drives the running game over the
                            DevTools protocol through globalThis.__flappy (opted in
                            before load, so any --url works; waitOver() waits for the Over
                            scene, the game-clock delay then a poll of 5 s at most, instead
                            of a fixed time after a death: AUD-148), and fails
                            on a page exception, a stalled __flappy.loop.frame, or an
                            overlay that does not open / close. Covers every overlay in
                            OVERLAYS (tests/tools.test.js keeps that list equal to
                            main.js), a run start, leaderboard mid-run pause, and a
                            close-and-reopen race, the six lazy sounds loading after Play's first frame
                            (plan 35, 2.3), plus the mystery box (level 3's
                            still first box, a still rolled level-3 box, a bobbing
                            level-4 box, the spin pausing, forced draws,
                            the full-bag fallback, and a skip into level 4's break), coins
                            (a rolled coin bobbing like fiber, the purse and its HUD row,
                            the coin draws, buyItem with a full bag, level 1's
                            kernel past its last pair at half size, a later level's
                            kernel deferred past a bean and brought back after a
                            respawn's clear, fiber for 1, the coin row over the
                            bean row and the stacking, a still fiber pulsing with
                            its hitbox held, a single-player death clearing coins
                            and power-ups with Over counting the coins, an empty
                            purse at Home and in the next run, a match crash
                            keeping 90 % of the coins and clearing the power-ups),
                            the shop (the 💰 pill and hint, rows bought by real taps, a
                            greyed row, the reveal over the panel while paused, ✕, a tap
                            outside without continuing, the super bean filling the bag,
                            RT, the controller ring, the empty purse at level 4's break),
                            and
                            test mode (trigger word, start level, Invincible, Settings
                            power-ups, nothing recorded, Exit latch, normal run after;
                            a test run's Over has no Share), and the game-over share
                            (no save hint, the 1080x1350 share card and its pixels:
                            dark fill, pink frame, tan poop frame with the poop; a
                            real tap on Share through a stubbed
                            navigator.share, cancel, download fallback, Home; a real
                            click on Play again reaches 'playing' in at least
                            againSlideMs and under launchSlideMs, plan 35, 4.1), and
                            the controller through Play.padDown / padNav (plugin
                            wiring, A / Menu / B / RT / Y, an overlay under A and B,
                            the save panel, the tray ring, the game-over ring and
                            Share, every overlay's ring, Settings / Language /
                            Feedback / About through the ring), and the wide field
                            (a 1800x1000 viewport re-fits the ready screen to 2304
                            px: world widths, column chrome, poop at 25 %, right-
                            edge spawns, the pre-fill at a run start / fart end /
                            skip and its sweep-in (edge + invisible + unpowered,
                            mid-sweep, settled opaque at exact spacing), a super
                            fart carried over the finish line (no pairs during
                            the break, one pre-fill after it),
                            centred Settings closed by a click on the
                            wide world, a mid-run resize deferred until Home; the
                            phone field's pre-fill is one edge pair; a phone
                            rotation: portrait 720 → landscape cap → back, a
                            mid-run rotation pauses in the old field and re-fits
                            at Home), and two players (A: the 👥 toggle on a
                            1800×1000 window, and in portrait the 🌐 window over
                            Play (locked on, no run; plan 39, 1.6c), the lobby it opens
                            (two guests, Start ready), a race's join screen with its
                            two halves and cameras, claims and refusals, the
                            countdown, five identical pairs on both halves, inputs
                            routed by device, leaving, the pad's B in the lobby, the
                            flag ignored in portrait; B: the shared pause, the first one over a
                            level's line waiting (+25 and its popup, "Waiting for
                            P2…" with no shade; Settings from the break pauses the
                            other half; its tap and a pad's B do not end the break,
                            Menu / B pause and lift the other; P1 shopping while P2
                            plays on, P2's strip never reaching P1's shop, B closing
                            it), the other's arrival
                            (no +25 and no popup for the second, its coins paid;
                            hints hidden through the beat, a tap then ignored), "Tap
                            when ready" on both with no count until both are ready
                            (pulsing under its glow; "Tap again to un-ready" while
                            ready), P1's open
                            shop holding the start ("Waiting for P1…" on P2, its tap
                            ignored, P1's power key closing the shop), P2's tap
                            starting the count, Settings holding it, GO starting
                            level 2 on both as it shows, with equal distances and
                            each ghost on the other's poop, the catch-up draws at
                            15 / 30 / 0 behind, a crash as a respawn (the −N popup,
                            the halted world, the cleared field and finish line, the
                            glide, a shared pause mid-blink, Settings mid-respawn,
                            the restart with grace and a centred pair, the 0 floor),
                            the first finisher waiting under its banner while its
                            tray / tap / d-pad still pause and resume the other, the
                            end when both are out with no Over and nothing recorded,
                            the panel's 💀 and 🏁 rows (P1 first out wins on its
                            +25), rematches (Versus.rematch) for the fewer-crashes
                            tiebreak (P2 pinned 25 higher), the tournament table,
                            named races decided on 🏁 and then the final line,
                            Continue handing the race on; C: the ghost at the distance
                            gap with the live face, level, past the range, the rival
                            marker, the crash face and blink on the ghost, P2's
                            distance against its real next pair after a respawn
                            and after a fart, the fade-out once the other's run
                            ends; lobbyToRace / leaveVersus enter and leave them),
                            the tournament (the lobby and its help, a 3-player
                            roster, the pad's ring and A / B in the panel, seeding
                            by ↓, 🎲 and a real mouse drag, the 🏅 pill only once
                            both wait at a line and its read-only peek, Bracket on
                            a result panel recording the race, Continue to the
                            podium and the 🏅 queue / post, Continue straight into
                            the next race, Abandon to the lobby, a 2-player Final
                            with no 🥉 and nothing saved, an all-guest one; each 🏆 post is backed by its half's run, 2.8). The
                            viewport is pinned to 720x1280 before load
                            (Emulation.setDeviceMetricsOverride) so the rest is
                            the phone field; tapAt maps through the live
                            __flappy.scale size. The page's
                            navigator.getGamepads is stubbed to [] before load: a
                            pad paired to the machine is visible to headless Chrome
                            and its presses would otherwise reach the game.
                            The education sections (plan 21, last, each putting the
                            device back): education-unlock (📚 for everyone, the old word refused, the off switch,
                            the three switches, nothing recorded), education-quiz (the
                            pill, answers by tap / key / pad, coins, every card's fit
                            both ways, the buttons and keys, the counts on the pill
                            and the card, the tally and its "This run" card, the 🚩,
                            the sounds, which wait up to 5 s for the lazy quiz sounds, the level's prices), education-revive (every
                            revive path: the pause, the refill under the card, Fly
                            on, a level's end, a wide field, a test run's quiz),
                            education-over (the tally, the bonus quiz, the badges
                            and the profile's section, the scroll band, the 📚
                            board's sending, Clear), education-share (the Education
                            data panel, the 📚 tab, the profiles' sections, the
                            tester pilot: join, record, send, withdraw; the
                            invitation, and Enter in the invite field joining
                            nothing), education-backup (plan 28, 3.1b: Back up with
                            the share sheet stubbed, the file restored twice, the
                            cards deleted and restored with 0 runs for the 📚 board,
                            375 px, restore off over a paused run, Clear's cards
                            note), then blocked-storage (every read of
                            localStorage throwing: the game still starts and plays)
                            and invite-link (a page loaded with ?invite= opens the
                            panel with the code, the address cleaned, the code filled again
                            when the panel reopens after a close), run-stats
                            (plan 30; part 4, 2.8: a split-screen race through Chrome's own input,
                            a race summary per half, each press in its own half's), streaks (plan 34: a day counted by a run and
                            by a Daily, the 🌞 / 📚 numbers, the profile rows, Clear)
                            and education-superq (plan 34: the bubble between two
                            equal still pairs, its float, flown past, the hold, the
                            lockout incl. Esc, Decline, Try, a right and a wrong
                            answer, the art on a second offer). The 📚
                            board's and the pilot's calls are stubbed at boot
                            (globalThis.__edu / __eduAnswer), like the career's.
                            OVERLAYS lists Quiz; NEEDS_RUN keeps the ready-screen
                            overlay loops off it. Plan 35's skip-splash (4.2: the setting off then on, Continue pressed by itself, the failed splash not) and its other sections: phaser-fallback
                            (the page reloaded with the CDN blocked, then stalled, boots from
                            assets/vendor/; both blocked, the splash reads Couldn't load and a
                            tap reloads; then back on the CDN) and error-card (an error thrown
                            in a frame shows the card, mid-run pausing the run first; Keep
                            playing restarts a stopped loop; the bug form carries the error
                            with no links; a rejection while the loop runs is only kept).
                            Plan 39's online-client: nothing of assets/vendor/supabase.js
                            asked for since the boot; blocked, loadSupabase() rejects with
                            onlineLoadFailed and no card; unblocked, one same-origin request
                            at the pin gives supabase.createClient. Plan 35's resync
                            (after online-client), the live board blocked: two online
                            events in a row sync once, the next after it settles syncs
                            again; a show syncs after a 31 s hide, not a 1 s one; a
                            restart keeps the one guard and leaves one online listener.
                            Plan 39's online-race (last; no network): the real OnlineRace
                            scene against a scripted guest with its own referee and a 40 ms
                            link: the purse under the opponent's pill, the wait timer and
                            Keep waiting, the shared count and GO, one outcome on both, the
                            results panel, Rematch's states and round 2, Leave back to
                            single player; 31 checks, the last three on the results panel's real Add as a
                            friend button (3.6).
                            Plan 39's online-reload: the guest's reload restarts the race at
                            level 2's start; then a real page reload with a stand-in
                            transport: the 🌐 window rejoins, the race is back rewound, both
                            Ready, one GO, level 2 from its first pair with the kept numbers,
                            the end, the record gone. 2.3b adds a relaunch (the tab id
                            gone, the record's beat a minute old: the window rejoins, the
                            record is this page's and beaten every second) and a takeover
                            (another page's fresh record: this page steps aside, the
                            transport closed, no leave_room).
                            Plan 39's online-friends (3.3, 17 checks): the 🌐 home's 🤝 Friends and its
                            badge, the Friends screen's sections and ⋯, Add friend, and the beat on a stand-in
                            transport.
                            Plan 39's online-invites (4.2): on a 320 phone and a stand-in transport, invite_list
                            and its topic, ✉️ n on 🤝 Friends, the inviting friend first with a 16-character
                            name (the buttons wrap inside the row), accept to the guest's ready screen, Invite,
                            the wait, a no and Resend in the same room. Plan 39's online-join-link (4.3): the
                            real page opened at ?join= takes the code out of the address, opens 🌐, keeps it
                            through a failed sign-in, joins on Retry; a gone room says the link expired.
                            Full smoke: 44 sections, 1002 checks.
                            Zero dependencies (fetch + WebSocket).

docs/                       Living specs kept with the code: save-code-spec.md (the
                            user code, fp1.<payload>.<sig>), finish-divider.svg.
.claude/plans/              Pending build plans numbered in build order
                            (NN-name.plan.md), indexed by ROADMAP.md (order,
                            dependencies, open decisions). Local only: gitignored and
                            untracked since 12 Nov (plan 21, P1), because plans can
                            quote players; tests/privacy.test.js keeps it so. A new
                            plan takes the next free number and a ROADMAP row; when
                            Status is complete, move it into Archive/ and mark its row.
                            Each plan opens with a Progress (resume here) roadmap,
                            updated and timestamped at every sub-task.
.claude/plans/Archive/      Completed build plans (historical record + decision
                            log). Don't edit archived plans.
.claude/skills/audit-repo/   The repo audit procedure as a Claude skill (/audit-repo):
                            SKILL.md (phases, hard rules), zones.md (which zone owns
                            which file: add new src/ files there), prompts.md,
                            report-format.md, follow-up.md, examples.md. Local
                            only: untracked, so a fresh clone does not have it.
.claude/audits/             ACCEPTED.md (accepted risks, kept across audits) and one
                            dated folder per audit (report, findings, repro tests).
                            Written by the audit's lead only; untracked until
                            Michael decides.
meta/                       Local-only project notes and reports (gitignored;
                            never commit).
Claude outputs/             Michael's private hand-over notes (gitignored; never
                            commit, and never edit, move or delete what is in it).
```

## Rules the code depends on

1. **Phaser-free logic stays in `src/logic.js`** (and save-code logic in
   `src/save.js`). Anything that can be a pure function (maths, state
   decisions, storage adapters) goes there with a test.
   Scenes in `src/scenes/` and `src/ui/` are thin wrappers that call it. This is
   what makes the game testable in Node, where Phaser cannot run.
2. **Tune numbers in `src/config.js`, never inline.** Scenes import `TUNING as T`.
   If you add a feel-related constant, add it to `TUNING` with a short comment
   and units (px, px/s, ms).
3. **Respect the art contract.** Asset file names and sizes are fixed by
   `assets/README.md` (art at 2x its drawn size since plan 35, 2.1; the audio re-encode recipe is there too). Change a size only if you update that table AND the scene
   code that positions the sprite. `npm test` fails otherwise. The pipe image has
   its cap at the top and is flipped vertically for the top pipe; `villi.png`,
   `ceiling.png` and `ground.png` must tile horizontally. Player/item redraws go through
   `assets/src/` + `tools/process_art.py`.
4. **Phaser stays pinned.** `index.html` loads `phaser@4.2.1` from jsDelivr in one
   async tag, and `assets/vendor/phaser.min.js` is the same build, loaded when the CDN
   fails or stalls. Bump both together (the tag, the file, the `?v=` on its URL);
   `tests/phaserFallback.test.js` checks both are the same exact version and that
   `tests/html.test.js`'s one-tag pin holds. Phaser is a global (`Phaser.Scene`, `Phaser.Game`), not an
   import. The online client (plan 39) is pinned too and lazy: `assets/vendor/supabase.js` is the
   official UMD bundle of `@supabase/supabase-js` at `SUPABASE_JS_VERSION` (`src/supabaseLoader.js`),
   byte for byte; bump the constant, the file and the hash in `tests/supabaseLoader.test.js`
   together. Nothing at boot names it, it has no CDN copy, and only `src/onlineNet.js` loads it.
5. **No build step, no runtime dependencies.** The site is served as-is from the repo
   root by GitHub Pages. Don't add a bundler, TypeScript, or npm packages without
   a strong reason; if you do, the deploy story has to change too. The one
   devDependency (PGlite, pinned exactly) only runs db/schema.sql in tests.
6. **Mobile first.** The phone portrait layout is the design; a desktop window
   only widens the world around it (the chrome column stays the phone layout).
   Scenes never read `GAME_WIDTH`: the world uses `this.scale.width` (Play: `this.fieldW`,
   its strip of the canvas in a two-player match), the chrome
   `uiColumn()` (`tests/scenes.test.js` enforces both). Touch is the primary input (`pointerdown`); keyboard
   (Space / Up / M / P / Esc / S / I / L / F / B / T; in a match the two groups of
   `TUNING.versus.keys`) and the gamepad (A / B / Y /
   RT / Menu / d-pad, `src/input/pad.js`) are conveniences that must produce the
   same intents a tap does, through `chromeIntent` / `padIntent`; the focus ring
   is the only controller-only UI and must never show without a pad press. Keep `touch-action: none`,
   the viewport meta, and the WebAudio unlock-on-gesture. Wrapped UI text that
   can show Chinese must set `useAdvancedWrap: true`. Test on a real phone
   when you touch input, scaling, audio, or locale.
7. **Storage can throw.** Private-mode Safari and blocked storage throw on
   `localStorage` access, reading the property itself included: get it only through `browserStorage()`
   (`src/store.js`: when the read throws, this page load's in-memory `pageStorage()`, so every store keeps what
   it was told until a reload, across Play's restarts too; null where there is none, as in Node;
   `tests/blockedStorage.test.js` fails on any other mention in `src/`, and the smoke's `blocked-storage`
   section boots, plays a run and restarts with the getter throwing; plan 28, 1.3). Go through `createBestStore()`,
   `createSettingsStore()` (on `createJsonStore()` since AUD-030, one per storage object and key, so a
   set() storage refuses is kept for this page load and every scene's store reads it; two tabs: a store
   behind on a failed write takes storage once another tab changed it, AUD-087), `loadLocal()` /
   `saveLocal()` from `save.js`, or
   `createSubmitStore()` from `leaderboard.js`; a new store of one JSON value
   is built on `createJsonStore()` (`src/store.js`). Never touch `localStorage`
   directly in scenes.
8. **Player-facing copy is multi-locale.** Change UI strings only in
   `src/i18n.js` for **every** locale (`en` and `zh-Hans`), update matching
   rows in `TRANSLATION_NOTES.md`, and do not hardcode English in scenes.
   If a string must stay identical across locales (brand, language names),
   add its key to the allowlist in `tests/i18n.test.js`. `npm test` fails
   when a locale or the notes file lags; run it before every commit and push.
9. **Share inside the tap.** `navigator.share()` needs transient user activation,
   which iOS Safari grants only during the tap itself and which touch gives on
   pointer-up, not pointer-down. Make the file before the tap (Over draws the
   share card as it opens) and call `shareScoreImage()` straight from the
   `pointerup` handler: no `await`, timer, or fetch before it.
10. **Never commit player data** (plan 21, P1). A player id is a bearer secret
   (anyone holding one can post and rename as that player), and usernames are
   personal data. Tests use synthetic ids (`TestPlayerAAAAAAAAAAAA`); plans,
   database dumps (`meta/`, `*_rows.sql`) and audit notes stay local.
   `tests/privacy.test.js` fails on a tracked file under `meta/`,
   `.claude/plans/` or `Claude outputs/` (Michael's private hand-over notes,
   gitignored: plan 26, A2), a row dump, or a tracked file holding an id from
   `meta/db-backups`; `node tools/privacy_scan.mjs -` finds every copy of one.

## How to work on it

```bash
npm test          # every unit + audit test (~30 s); must pass before committing
node --test tests/items.test.js   # one file while iterating
npm run push      # check the live schema is db/schema.sql, stamp LAST_UPDATED = now, stamp the
                  # service worker (index.html's import map, sw.js's BUILD and FILES), copy
                  # the schema to the test fixture, run tests, commit, push main
                  # (always push this way so the About overlay's "Updated" is the push time)
npm run schema:stamp   # after editing db/schema.sql (a test fails on a stale stamp)
npm run schema:check   # which db/schema.sql the live database has (one read-only call);
                       # -- --query prints a query to paste in Supabase's SQL editor instead
# In a browser, globalThis.__flappy is the Phaser.Game (debug / automation only):
#   __flappy.scene.getScene('Play').spawnPipePair()
#   It exists on localhost, *.local and private-network addresses (the LAN URL below), not on
#   the live site; a driver aimed elsewhere sets globalThis.__flappyDebug = true before the
#   page's scripts run (Page.addScriptToEvaluateOnNewDocument), as the smoke does
#   (debugHandleAllowed in src/logic.js, on the same localHost() rule the service worker uses).
npm start         # tools/serve.py: http://localhost:8000 plus a printed
                  # http://<LAN-IP>:8000 for a phone on the same Wi-Fi
                  # (localhost on the phone is the phone, not the laptop; user
                  # codes work there too: plain http has no Web Crypto, so save.js
                  # signs with sha256.js)
# Test mode: type pooptest or testpoop as the username + Save (again to leave; a reload also
#   leaves). Settings then has start level, Invincible, power-ups; nothing is saved.
# Frame meter: add ?perf to the URL (the LAN one on a phone) for a live line of frame
#   rate, long frames and what they followed, and physics steps ≠ 1; ?perf=var does the same
#   with a variable physics step, to A/B the fixed one (plan 20). Debug only; numbers also on
#   globalThis.__flappyPerf.summary().
npm run smoke     # with npm start running: headless Chrome drives the real game
                  # (needs Google Chrome; CHROME=/path overrides), ~3 min.
npm run smoke -- --list            # the sections and what each needs
npm run smoke -- --only=wide,pad   # just those (plus what they need)
node tools/sw_check.mjs   # the service worker in its own headless Chrome (see "Service worker")
uv run --with pillow python3 tools/process_art.py   # rebuild poop set / items / bean from assets/src/
uv run --with pillow python3 tools/make_placeholders.py   # pipe / villi / ceiling / ground; question.png only if missing
```

When to run what:

| You are | Run |
|---|---|
| iterating on pure logic | `node --test tests/<area>.test.js` |
| about to commit anything | `npm test` (it includes the orphan audit) |
| iterating on a scene, `src/ui/*` or `src/sound.js` | `npm run smoke -- --only=<the sections you touched>` |
| done with scene / UI / sound work, before a push | the full `npm run smoke` |
| changing touch, scaling, audio or locale | ask Michael for a phone check |

Scene behaviour (physics, rendering, audio) cannot be verified in Node. When you
change `src/scenes/*` or `src/sound.js`, run the full `npm run smoke` before you
call it done (it catches exceptions inside scenes and a dead game loop, which
`node --check` cannot), then say so and ask for a phone check for touch, scaling,
and audio; don't report those as tested. A subset is for iterating: it skips
sections, so it never stands in for the full run.
Never name a scene method after a Phaser.Scene property (`load`, `add`, `input`,
`time`, `render`, …): `tests/scenes.test.js` enforces this.

Before a push (the 2026-11-15-c audit's open item; `npm run push` does the stamping, you do the thinking):

- Did client storage or a cache format change (a `flappyPoop.*` key, a save or backup shape, an
  IndexedDB or Cache Storage name)? Then write down what a client on the old build does with the new
  data, and what the new build does with the old, before you push. Players keep both for months.
- The service worker is stamped by the push itself (`tools/sw_stamp.mjs`); never edit `BUILD`,
  `FILES` or the import map by hand. A push that refuses says which file is missing, stale or untracked.
- A plain `git push` of main with a stale stamp is refused by `tools/git-hooks/pre-push` once you have
  copied it to `.git/hooks/pre-push`; use `npm run push`, which restamps first. `--no-verify` bypasses it.
- To pull the worker from every player: copy `tools/sw-off.js` over `sw.js` and push. To bring it
  back, restore `sw.js` from git and push.
- Art or a sound changed under an existing name needs a `VERSION` bump (their URLs carry `?v=`, not
  a hash), or a cached page keeps the old file.
- Run the full `npm run smoke` and `node tools/sw_check.mjs` (both through the smoke runner's
  `pgrep` wait when another session may be running one), then `npm run push`.

Commits follow `type(scope): summary` (`feat`, `fix`, `docs`, `chore`, `test`, `tune`,
`refactor`); a step of a plan adds `step n/N` to the scope. Keep it.

## Where to put new things

- New game mechanic → pure parts in `src/logic.js` + test in `tests/`, wiring in
  `src/scenes/Play.js`, knobs in `src/config.js`.
- New art → gameplay sprites via `assets/src/` + `tools/process_art.py` + a row
  in `assets/README.md` + `load.image()` (or `load.spritesheet()` for an
  animated GIF, cut by `process_sheet`) in `src/scenes/Boot.js`. A new poop
  face goes in the poop-set loop there (same body box as `Poop_Emoji_Alive.png`)
  and in `poopFrame()` if the game picks it. App icons: replace
  `assets/src/FlappyPoopAppArt.png` and re-run the script. Remaining
  placeholders still go through `make_placeholders.py`, which must not overwrite
  `poop.png`.
- New sound → a `blip()` preset in `src/sound.js`, **or** a file in `assets/sfx/`
  plus a `CREDITS.md` row with a URL plus `this.load.audio()` in Boot.
- New scene → `src/scenes/`, register in the `scene:` array in `src/main.js`.
  An overlay also needs an entry in `OVERLAY_SCENES` (`src/ui/overlayStack.js`,
  which `Play.chromeArgs` and `Play.padTop` read), an `isTopOverlay(this)` guard
  in its `close()`, a version line that calls `openChangelog(this)`, a `case` in
  `Play.applyChrome`, rows in `tests/chrome.test.js`, an entry in `OVERLAYS` in
  `tools/headless_check.mjs` (the smoke opens every overlay), and a `this.focus`
  ring built from `pressable()` items (✕ first) with `focus.show()` so a
  controller can walk it. A scene that is not an overlay (Versus, the second
  Play instance) is instead excluded from the overlay list in `tests/tools.test.js`.
- Version bump (`VERSION` in `src/logic.js`) → a new first entry in
  `src/changelog.js` with the date and 1–5 bullets in both locales (the What's
  new page; `tests/changelog.test.js` fails the suite, and so `npm run push`,
  without it).
- New pad button or action → a knob in `TUNING.gamepad`, a row in `padAction`
  and `padIntent` (+ `tests/gamepad.test.js`), a `case` in `Play.onPadAction`
  that calls an existing handler (it receives the pad's index too). Never bind the
  Gamepad plugin in another scene: Play's binding sees every press and routes it
  to the scene on top, or to the half that claimed the pad in a match. (The one
  exception is the loading splash: it polls `navigator.getGamepads()` itself,
  before Play exists, and stops the moment Continue starts Play.)
- Two-player rule or knob → pure parts in `src/versus.js` (+ `tests/versus.test.js`),
  a knob in `TUNING.versus`, wiring in `scenes/Versus.js` (the match) or `Play.js`
  (a half); anything random a run spawns goes through the course (`createCourse`),
  never a fresh `Math.random` / `createRng` in Play, or the halves drift apart.
- A new call from Play to its match → through `versusHost()`; add the member to
  `tests/matchHost.test.js`'s host list and implement it on every host (Versus; plan 39's
  online race from 1.7a).
- Network call → `src/leaderboard.js` only, with `fetch` injected and a timeout;
  tests pass a fake `fetch`. Never `await` a request inside a Phaser update
  loop; fire and forget from gameplay, `await` only in an overlay's `create()`.
- Online race (🌐, plan 39) → decisions in `src/online.js` (pure: time comes in as
  arguments, + `tests/online.test.js`), knobs in `TUNING.online`. The transport
  (the Supabase client, channels, presence, the online RPCs with the Bearer token)
  lives only in `src/onlineNet.js` (1.4), injected into its callers and never
  awaited in `update`: a frame sends and reads what has arrived, nothing more.
  A new client event goes in `ONLINE_EVENTS` (which moves `protocolVersion`, so
  older clients are told to update) and never reuses a server event name.
  A new online function goes in `ONLINE_RPCS` as well as the schema header
  (`tests/onlineNet.test.js` keeps them equal). Friends (3.1) name another player only by
  a peer handle (`peer` in `online_history()` and `friend_list()`), never an id or a name. The client (3.3) lives in `src/onlineFriends.js` and `src/ui/onlineFriendsViews.js` (`TUNING.online.status`: `beatMs` 20 s, tied below half of the schema's `c_fresh` by a test; `pollMs` 10 s; `badgeMs` 30 s; `opponents` 5). The status beat (`Play.onlineStatusBeat()`, once per page; pagehide sends `online_beat(false)` through `onlineNet.beacon`, pageshow beats again) starts on link in the 🌐 window and after pairing, and stops with `online_beat(false)` on 🌐 off, ✕ and Leave after a race; it is quiet on stepping aside and on Sign out / Sign in and is kept through the race hand-off. It never runs outside online mode: `tests/onlineFriends.test.js` checks that `tournamentPanel.js` is the only caller. The results panel offers Add as a friend only once the report is agreed. The 39 friend strings (`friendsButton` to `friendResultPair`) carry rows in `TRANSLATION_NOTES.md`. The server's event names on
  `room:<code>` are hints: the transport confirms them with `room_state`, since a
  seated peer can broadcast those names too.
  The sign-in side (enter, claim, devices, pairing, leave) lives in
  `src/onlineAccount.js` (`tests/onlineAccount.test.js`); `Play.onlineAccount`
  builds it once, and `Play.onlineSessionHeld` / `Play.onlineLeave` ask and end it.
  Sign out and a Sign in as another player leave online play only on a device that holds
  a session (no client load otherwise: `tests/onlineSignOut.test.js`). A newly
  claimed online name is stored the save panel's way only after the link succeeds.
  Invites (4.2, `src/onlineInvites.js`) show only in online mode, as the beat does. Every time comes
  from the server's `sent_at` / `expires_at` (no client INVITE_TTL), and the player's topic only from
  `invite_list`'s `topic`, never built from the save's id (`tests/onlineInvites.test.js`,
  `tests/onlineInvitesPanel.test.js`); `onlineNet.closeTopic()` runs with `close()`, when the player leaves online mode (at once, not
  when `leave_room` answers; T4-review AUD-127) and at the race's hand-off. Invite and Resend are offered only when `lobby.canInvite()` holds. A share link (4.3) is
  `?join=<code>`, read once in `main.js` and taken out of the address (`tests/onlineJoinLink.test.js`);
  it makes no server call of its own, so a closed room reads 'onlineLinkExpired'. The 14 strings of 4.2
  and 4.3 (`friendInvite` to `inviteGone`, `onlineLinkExpired`, `onlineLinkCopied`) carry rows in
  `TRANSLATION_NOTES.md`.
  The lobby (`src/onlineLobby.js`, mounted by the 🌐 view of `ui/tournamentPanel.js`) feeds
  `roomStep` only RPC results and `{ kind: 'room' }` items, never a peer's own events. Lobby
  ready is the `ready` event with level 1 (`LOBBY_LEVEL`), newest wins by t / seq.
  `onBothReady` starts the race: the host's `start()` calls `set_room_status('playing')`; `finish()` (host only,
  once) sets 'finished'; `rematch()` (host only: finish first if still playing, then 'playing' again, a new
  seed, round + 1).
  The online race (1.7a, 1.7b): decisions in `src/onlineRace.js` (no Phaser, no timers: time and `send` come in;
  tests/onlineRace.test.js races two simulated peers through a level break to the end), wiring in
  `scenes/OnlineRace.js` (tests/onlineRaceScene.test.js). The host is the one arbiter
  (`createRaceReferee`): `first` (one per line) and `go` are its word, judged on server time. Knobs in
  `TUNING.online.race` (not part of `protocolVersion`; `waitOfferMs` is item 15's offer, `TUNING.online.inventoryY0`
  the purse rows' start below the opponent's pill; `claimResendMs` and `widthResendMs` are the
  resends of a guest's claim and of the field width). The `go` event's `cancel` flag, `finish`'s `at` and
  `width` (sent from the race's start to GO) are in `ONLINE_EVENTS`, so they moved `protocolVersion`.
  The shared pause (2.1) lives in `createRacePause` (knobs `TUNING.online.pause`); its events `pause` and
  `resume` are in `ONLINE_EVENTS`, so they moved `protocolVersion`. It calls no `set_room_status` (a playing
  room is never expired). 2.2 wires it into `scenes/OnlineRace.js` (the overlay, Ready, Leave, the abandoned
  panel; `online.pause.leaveConfirmMs` is Leave's second-tap window); its orphans allowlist entry is gone.
  Reload resume (2.3, D4; `tests/onlineResume.test.js`): no schema change, `room_state` finds the seat by auth
  uid and the stored session keeps it. Each level break keeps this side's level start (`Play.resumeSnapshot()`,
  `OnlineRace.keepLevel`) in the resume record, localStorage under `LEADERBOARD.onlineResumeKey`
  (`createResumeStore`, `parseResume`: version 2, 6 h; 2.3b). After a reload `Play.openPendingRace()` opens the 🌐
  window once per page load; its lobby rejoins through `room_state` (the channel opened as that seat first, then `roomStep`'s `rejoin`,
  never a leave; a failed open leaves nothing, AUD-108) and hands the race to `OnlineRace` rewound. The `rewind` event and pause reason
  (both moved `protocolVersion`): the rewound side holds under the pause overlay until its Ready; the other
  side raises its feed's and referee's floor to the sender's restart and restarts at the lower of the two level
  starts (a side whose run has ended answers each rewind of this round with its fixed pos and done again,
  `feed.again()`, AUD-107); the shared pause's count gives one GO. A host replaying the last level takes no final-line award the
  other side already holds. A race that is over is forgotten ("That race is over."). Not covered: a reload
  after this side's own finish (no record, so item 46's leave applies and the other side sees "left: no
  winner" if still racing). A reload just before a line's verdict rewinds both one level further.
  App restart and a second page (2.3b; no schema change, no new event): the record carries `owner` (a page's
  tab id, `pageTab` in sessionStorage under `LEADERBOARD.onlineTabKey`, marked closed on `pagehide` so a
  duplicated tab takes a new id) and `beat` (wall ms). `resumeOwner` says 'mine', 'live' (another owner beat
  within `online.resume.staleMs` 5000) or 'free'. The racing page beats it every `online.resume.beatMs` 1000
  from a window timer. A relaunched app finds its old record free and rejoins; a live record is neither
  rejoined nor left (item 46's code is hidden, `lobby.notice('onlineRaceElsewhere')`) and is looked at once
  more after staleMs. A page whose record another page took steps aside: `net.close()`, no `leave_room`.
  Residuals are in the plan's item 55 (a frozen page under staleMs keeps its seat; blocked localStorage
  resumes nothing).
  The tournament panel's hand-off (`handOffRace`, 1.8) remembers the room (`lobby.remember()`), and over a
  running Versus (🌐 switched on in its lobby) marks the match `left` and stops Versus and PlayB so only the
  race draws (not `Versus.leave()`, which starts a plain Play). From 2.5 both devices report the race's end
  to `finish_match` (`createRaceReporter`, see the Tournament paragraph's online reports). The smoke's `online-race` section drives the real scene against a
  scripted guest in the page (a break, the end and its report, a rematch, a Leave; no network).
  `?onlinetest=<code>` (`onlineProjectConfig`) works on dev hosts only, keeps its own session
  and trust keys, and the repo never holds a test project's URL or key
  (`tools/online_test_link.mjs` builds the link from an env file).
- Backend change → edit `db/schema.sql`, `npm run schema:stamp`, list a new anon
  function and its undo line in the file's header (a new argument on an existing function: add it
  last with a default, `drop function if exists` the old signature just before `create`, and move its
  grants, so a call never finds two; plan 28 5.2's board pages did this), run it by hand in the Supabase
  SQL editor before `npm run push` (which checks), keep `LEADERBOARD.maxScore` and
  the schema's score cap in step, and `TUNING.levels.lastLevel` and the 🏆 level cap
  (1 to 7) too (tests/leaderboard.test.js checks both). An **online** function (plan 39) is
  granted to `authenticated` and revoked from `public, anon` (one `revoke … from public, anon;` plus
  `grant  execute … to authenticated;` pair), is `security definer` with `set search_path = ''` and
  qualified names, checks `auth.uid()` first, and is listed in the header's `--   * online name(...)`
  list (tests/schema.test.js checks the anon and online lists against the grant lines;
  tests/schemaOnline.test.js checks the privileges; `finish_match` and `online_history` follow this rule; no online function may take a name or search to find a player, which tests/schemaFriends.test.js guards; friend functions and online_beat are for a trusted device (tests/schemaStatus.test.js) and their tables are readable by no role; so are the invite functions and their table (tests/schemaInvites.test.js)). A failure the server counts is returned as
  `{ ok: false, error }`, because a raise would roll the count back. The game's anon functions stay
  revoked from authenticated (a session token sent to one is refused).
- New achievement → one `ACHIEVEMENTS` entry in `src/achievements.js` (a new,
  permanent id) and its title (and, if no template fits, description) in both
  locales + `TRANSLATION_NOTES.md`, plus its id in `achievement_catalog()` in
  `db/schema.sql` (tests/achievements.test.js keeps the two equal) and a run of the file
  in Supabase before `npm run push`: the server stores only ids it lists (a quest row in
  `achievement_defs` counts too). A claim it does not know is ignored, not refused, and
  stays queued on the device until the schema has it.
- Time-boxed quest → the same with `from` / `to` (UTC days), plus its row in the
  `achievement_defs` seed in `db/schema.sql` (tests/achievements.test.js checks they
  agree) and a run of the file in Supabase; a VERSION bump and a changelog bullet
  announce it. A `kind: 'seasonal'` entry's `check(facts, totals)` may take a Daily
  Dump run's facts (`mode: 'daily'`).
- New lifetime counter → a key in `runDeltas` (+ its glyph in `Stats.js`'s CAREER
  grid if players should see it). No SQL: the server stores whatever keys come.
- Server-only counter (one the server counts, like 👑 `dethroned`) → count it with
  `add_server_counter` inside the SQL function that sees it happen, refuse the key in
  `submit_counters`, and add its glyph to CAREER; never put it in `runDeltas`.
- A game dev's 🔧 → `select public.admin_set_dev('<username>', true);` in the SQL editor.
- New field in the run summary → its key in `RUN_DATA_KEYS` (`src/runStats.js`) and in `run_data_keys()`
  (`db/schema.sql`), same place in both; apply the schema before pushing the client (submit_runs
  refuses a row with a key it does not know).
- Hold one run (its best leaves the board for others; nothing is deleted) → `select public.hold_run('<player
  id>', '<run id>');`, undo with `release_run`; `select * from public.admin_runs('<username>');` lists a
  player's runs. `select public.admin_set_require_run(true);` holds a raise with no run behind it too.
- Hide a player (in place of deleting their rows) → `select public.admin_flag_player('<username>', '<note>');`;
  undo with `admin_unflag_player('<username>')`; `select * from public.admin_flagged();` lists who is
  hidden. Their own device sees its rows as before; the 🏆 board splices their own rows in at
  their rank (withOwnRows).
- New loading-screen card → one `SPLASH_NOTES` entry in `src/splash.js` (a new,
  permanent id; a major feature goes at the top of the features, newest first,
  and the oldest beyond `splash.featureMax` drops out on its own) and its line in
  both locales + `TRANSLATION_NOTES.md`, at most 100 characters in English and 50
  in Chinese (‹ › beside the card leave ~22 a line on a 360 px phone). Its emoji is
  the badge's glyph when the profile counts the thing (`badge('<achievement id>')`),
  else the game's chrome glyph; `tests/splash.test.js` holds the table and refuses
  a glyph another badge means (whole glyphs: the streak card pairs 📅🔥, Michael's call,
  plan 36; an emoji box widens for a pair, `.art[data-kind="glyph"]` in index.html). To
  show a reworded feature as NEW again, give it a new id (plan 36's `streaksAll`). A thing the game draws as a sprite also gets
  `art: { file }` (a file Boot loads; `frames` for a strip, `crop` when the art
  fills only part of its frame).
- New UI chrome → `src/ui/` (Phaser wrapper) with any pure layout helper in
  `src/logic.js`, positioned inside the chrome column (`this.col`: pass
  `col.width` as the width and `col.x` as the helper's `x0`, or add `col.x`
  to a fixed x). New world objects (things that scroll, full-screen shades)
  use `this.scale.width`. Text input belongs in a DOM panel like `src/ui/savePanel.js`,
  not Phaser UI. A DOM panel takes its backdrop and card size from `panelFrameCss`
  (`src/ui/panelFrame.js`): padded by the screen's safe area, never sized in `vh`.
- Save-code wire format change → bump `CURRENT_VERSION` in `src/save.js`, add
  `parseVN` to `PARSERS`, never delete an old parser, never change `SECRET`. An
  optional key with a default (`p`, `l`, `h`) joins the current version without a
  bump (spec rule 5): write it only when it differs from the default so older
  codes stay byte-identical, and update the spec's payload table.
- New UI string → both locales in `src/i18n.js` + a row in `TRANSLATION_NOTES.md`
  (+ allowlist in `tests/i18n.test.js` only if intentionally identical). Scenes
  call `t(locale, key)`; never hardcode player English.
- Code, a knob, a string or a texture kept although nothing uses it (a test hook,
  say) → a one-line reason in the matching allowlist in `tests/orphans.test.js`;
  otherwise delete it. The audit fails on anything unused and unexplained.
- A file the game loads that is new (a module under `src/`, art, a sound, a vendored script) → nothing
  to list by hand: `tools/sw_stamp.mjs` finds modules and the assets the code names, and the push
  refuses when one is missing from `FILES`. A new kind of loaded file the stamp cannot see → teach
  `tools/sw_stamp.mjs` and add a case to `tests/swStamp.test.js`.
- New smoke checks → inside the section they belong to in `tools/headless_check.mjs`.
  A new section → a `SECTIONS` entry (with `about`) and a `section()` call in the
  same order; leave `needs` out (it then runs after everything before it) until
  `--only=<it>` passes alone with the same checks as the full run.
- Multi-step work worth planning → a numbered markdown plan in `.claude/plans/`
  (next free `NN-`, `Created:` date inside) plus a row in `.claude/plans/ROADMAP.md`;
  when Status is complete, move it into `.claude/plans/Archive/` and mark the row.
  Every plan opens with `## Progress (resume here)`: Now / Next / Left / Updated lines
  and a step table with an estimate, start, finish and time taken per sub-task. Update
  it when each sub-task starts and ends and before every stop (checkpoint, hand-off,
  failure, session end), with times from the clock (`date`), never guessed. Each
  step also gets a tier and a `Route` (model, effort, and whether it runs in the main
  session or a named agent in `.claude/agents/`). Full format, the tier table and the
  session rules: the Conventions in `.claude/plans/ROADMAP.md`.
- An audit of the repo, a zone or a feature → the `audit-repo` skill
  (`.claude/skills/audit-repo/SKILL.md`, local and untracked; example prompts in its
  `examples.md`). It is read-only: reports go to `.claude/audits/<date>/`, fixes only on Michael's word.
- Repo-wide conventions → this file. Player-facing docs → `README.md`.
- Locale copy review for LLMs → `TRANSLATION_NOTES.md` (keep in sync with `src/i18n.js`).
