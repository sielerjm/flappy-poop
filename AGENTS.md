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
a 5-pipe postbiotic 5 % (×2 already on), three beans 5 %, a skip to the end of the level 1 %, 5 coins 10 %,
10 coins 5 %, 15 coins 1 % (the coin draws come after skip in `MYSTERY_DRAWS`, so the older bands hold), else
fiber (33 %, `rollMystery`); a draw that cannot do anything (bean with a full bag, skip with the finish line out) becomes
fiber (`resolveMystery`). A skip scores every pair left in the level at the current multiplier (countdown
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
inventory over the beans (`inventoryRows`, `TUNING.hudInventory`: the rows shown stack from the top). Coins
last **one run**: `start()` empties the purse, nothing is saved, a single-player death empties it and clears
every power-up (`effects.clearPowerups`), and a two-player crash keeps `crashCoins` (90 %, rounded down) and
clears the power-ups. Pickups with no motion data pulse (`pulseStill` / `pulseScale`, `stillPulseScale`,
`items.stillPulse`), their circle body re-fitted each frame so the hitbox holds. The **shop** (`TUNING.shop`): in a level break a
💰 pill under the banner (`shopButtonLayout`; dimmed at 0 coins, the single-player hint then drops its
"· 💰 to shop") opens a panel of rows (`shopLayout`, `SHOP_ITEMS`) in the chrome column: fiber 1, one bean 6,
a super bean 16 (fills the bag to `superBeans`), a mystery box 5 (the plain draw table, `pairsLeft` 0 so a
skip becomes fiber). `buyBlocker` / `canBuy` grey a row the purse or the bag refuses; `Play.buyItem` spends
and applies it, and the reward animates in the paused break. A box bought from the panel (`shopBuy` passes
`reel`) spins the **slot machine** first (`spinReel` / `finishReel`, `TUNING.shop.reel`, `reelStrip` /
`reelProgress` / `REEL_FACES` / `mysteryFace`): the draw is resolved and paid at once, a window over the rows
scrolls the strip right to left on a cubic ease-out (`sfx.tick` per face, `sfx.reelStop` and a pop on landing),
holds `pauseMs`, then `openMystery(draw, …, { reveal: false })`; `shopBuy` refuses while it spins and
`closeShop` (so the level start too) finishes it early with the rising reveal. A postbiotic doubles a kernel
picked up (`collectItem` pays `effects.multiplier()`), never a box's coins or a level's. In a test run
(`testCoins`, single player) the purse is endless (`purseCoins` → Infinity, `countText` / `coinLabel` read ∞,
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
· segment / Tap to continue", the poop gliding to mid-height and bobbing, the
background crossfading to `levelColor(n, LEVEL_COLORS)`, Set2 colours cycling). A fart never carries the poop past
the line: crossing it cancels the power (`effects.cancelPower()`, `endPower()`),
so only the pairs actually passed have scored, and the break starts at once. A progress bar (`ui/levelBar.js`) fills one
step per pair. Each top score remembers its level. A signed
**user code** (`fp1.<payload>.<sig>`, the save code) carries a player's username
and best 6 scores between browsers via copy/paste (the save panel, opened by the
ready screen's user button); spec in `.claude/plans/Flappy Poop — Save Code Spec.md`. The code's
random `id` is also the leaderboard identity. **One player across devices** (2026-11-08):
a username belongs to the player holding it on the board (`submit_score` raises
'name taken'; the panel asks `name_available` first through `Play.checkNameAvailable`
and refuses the name with the user-code steps; the board cannot say → saved locally,
`saveNameOffline`; a refused sync sets `Play.boardNameTaken`, shown by the panel and
the 🏆 footer). Loading a code on a device that had its own player queues
`merge_players(pasted, old)` (`createMergeStore`, drained first by `syncLeaderboard`):
the board folds the rows and keeps the old id as an alias (`player_aliases`), so every
id resolves to one player. **The board's name wins** (2026-11-09): `syncLeaderboard` asks
`player_name` (`Play.fetchPlayerName`) and adopts it (`nameAction`, `Play.adoptBoardName`,
`showAdoptedName` in an open panel) unless the name is a rename typed on this device
(`createRenameStore`, flappyPoop.rename, set by the panel's store, cleared once a post
carries it, by Load and by Clear); the first `Play.create` of a page load syncs. **Scores flow down
too** (2026-11-11): after the name step `syncLeaderboard` runs `Play.pullBoardBests`, which reads the
player's two board rows (`Play.fetchBoardBests` → `fetchRank` off / on the toilet, aliases resolved) once
per page and id (Load and Clear ask again) and folds them into `save.top` (`mergeBoardBests`), so a
code or device that never played them catches up (the home button, the code and, via `showBoardScores`,
the Load's welcome line follow); a pulled row that is now the device's best of its kind is filed in
`submitStore`, so it is not posted back. The panel's **Clear** (`Play.signOut`, two taps inside
`saveClearConfirmMs`) forgets the player on the device only.
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
mid-run: a running run auto-pauses at that moment. Android home-screen installs are
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
only where two phone-width halves fit the window (`versusAvailable`: landscape, at least
`versus.minViewportH` css px tall; never in test mode), turns the start tap into a tournament (every
two-player session is one: the **Tournament** paragraph below; its races are the matches here). The Versus
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
smaller un-ready line. A tap while the
shared pause is on only lifts it. Each half shops in its own break (the panel is Play's, in its strip;
the other half plays on); a shopper is never ready, so the count cannot start under an open shop. The pause key / ⏸ / Menu toggle the
**shared pause** (`Versus.setPaused`, remembering which halves it paused so a break is never ended by
the other player; a respawning half's clock stops with it). Chrome decisions in a match read
`chromeState()` (the match's state, not the half's), so a finished or respawning half still pauses and
resumes the match. The match ends once **both** have cleared the rectum (the first one out waits under
"Made it out!" / "Waiting for P2…", `showEscapedBanner`); the result panel names the higher score
(`raceOutcome`, below) on a `versus.resultPanelW` (820 px) panel with each player's 🏁 level wins and 💀
count, and offers Continue | Bracket (the Tournament paragraph). A race records nothing: no best, no
save-code score, no 🏆 leaderboard. `Versus.rematch()` (same devices, new seed) has no button any more:
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
≤ 16 code points, clean words) or **Use my player** (`claimHost`, once, needs a username); the card's **?**
opens the help card (`view: 'help'`, Got it back to the lobby), its ✕ / Esc / the pad's B leaves for
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
of `tournament.minPostPlayers` (3, submit_tournament's floor) or more with any linked player (`postable`)
is queued once (`queueFinished`: `tournamentPayload(tour, newId())` with the host device's id into
`Play.tournamentQueue`, registry `posted` / `tournamentId`) and synced; a 2-player one is `posted: 'two'`
(the podium says it is not saved), an all-guest one `'none'`. The podium's line (`#tour-saved`,
`savedText`) follows the queue's outcome. Guests travel as `{ id: null, name: null }`.
`Play.syncLeaderboard` drains the queue after the merges and before the no-username return. The server
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
claimed at the start (`dailyStore`, `flappyPoop.daily`) and rewritten from `update()` as the score
moves; `endRun` makes it final and queues it (`dailyQueue`, `flappyPoop.dailyQueue`) without
touching the 🏆 list or best; `syncLeaderboard` finalises an *unfinished* record left by a reload
(never the run in flight) and `drainDaily` posts under the current name. Over shows the daily
result: date headline, the score as a link to the board's 🌞 tab, the rank read off
`daily_board` once the post settles, the countdown to 00:00 UTC, Share (the card, and the link as its message).
The server (`submit_daily_score`) takes today or yesterday (UTC), checks the day's level with its
own FNV-1a (`daily_level` = the client's `dailyLevel`), keeps the first post per player and day
('duplicate' after), and follows the score board's name claim.

**Player profiles and achievements** (👤, 2026-11-11, v0.14.0, plan `.claude/plans/Archive/08-user-stats.plan.md`):
every player has a **public** profile (`scenes/Stats.js`, chromeIntent `'stats'`), opened by the save
panel's 👤 Profile (own; disabled until a username is stored) or a name on any board
(`Leaderboard.linkName` → `Play.openStats({ name })`). A player with no username gets a **gate**
instead (`buildGate`: Create user opens the save panel; `Stats.refresh`, from `Play.setSaveState`,
turns it into the profile once a name is saved, and back on Clear).
**Counting:** `Play.endRun`'s single-player and Daily branches call `recordCareer`: `runDeltas`
(`src/achievements.js`) turns the run into counters (games / wins / sumScore / sumLevel / maxLevel
for single player, dailyGames for a Daily Dump, deaths / pipes / falls / closeCalls / farts / superFarts / the pickups
for both, pipes being the pairs flown that day in a Daily Dump;
`runFarts` / `runSuperFarts` from `activatePower`; `runFalls` once per drop past `fallLookVy` (`fallStarted`) and `runCloseCalls` when the near-miss clock starts in `tickScared`, both outside a fart, its grace and Invincible; `runCeilingHits` (☀️, set before `die()` when the poop ended on the ceiling) and `runBoxesBought` (🎰, `buyItem('mystery')`). Run facts for v0.16.0 badges: `closeCallsByLevel` → `closeShave` (💈, `levelCloseShave` on `levelPipes`), the same-draw streak in `openMystery` → `fourOfAKind` (🃏, `nextDrawStreak`), and from `careerStore.markRun` this device's `daysSinceLastRun` (🧱) and `winsLast7Days` (🏃). that wait in the career store (`createCareerStore`,
`flappyPoop.career`); test runs and match halves return before it. **Badges:** `evaluate` judges the
`ACHIEVEMENTS` catalog (run feats from a normal single-player run only; lifetime milestones on the
totals; time-boxed quests by UTC day) and `careerStore.unlock` records them with a claim; Over names
the run's (`runBadges`, "🏆 New: …"). `creditCareer` quietly credits the score and level badges the
saved top list already reaches (at boot and after `pullBoardBests`) and lifetime badges on the
totals. **Sync:** `drainCareer`, in `syncLeaderboard`'s named path after `drainDaily`, sends one batch
(`submit_counters`: the batch id is the receipt, so a lost reply resends the same batch; the answer is
the player's totals across every device, kept as `base` for that id), then the claims
(`claim_achievements`). `postCounters` / `claimBadges` / `fetchProfile` are Play methods so the smoke
stubs them. Clear empties the store; a Load forgets only `base`. **Server:** `player_counters` (one
jsonb of counters, `merge_counters`: sum, or the larger value for `max*` keys), `achievement_defs`
(windows of time-boxed quests only), `player_achievements`; `player_stats(id or board name)` is the
profile (no ids): single-player numbers (bestScore = the best score-board row), daily podiums ranked as `daily_board` ranks, medals, the
biggest rival (self-races ignored), counters, achievements. The game claims, the server checks the
id format and a quest's window (+2 days' grace): accepted risk ACC-001 like scores.

**Loading splash** (2026-11-12, v0.15.0, plan `.claude/plans/01-loading-screen.plan.md`): the page's front
door on every load, phone and desktop. `index.html`'s `#splash` (cream, the bobbing `poop.png` inside a
brown ring's track) paints at once; an inline `import('./src/splash.js')` placed **before** the Phaser
tag starts `startSplash` while Phaser is still downloading, so the note cards show during that wait
too. The ring **only fills**, every frame chasing `ringTarget` (a creep toward `splash.waitCap` during
the download, then Boot's progress, then full) at `ringStep`'s capped speed, so even a cached load
takes ~0.8 s and never jumps. A card (‹ card › in one row, Continue on the row below; every card's text
stacked in one grid cell, so the card is as tall as the tallest and never jumps) is a hint or a major
feature (`SPLASH_NOTES`: TIP or NEW, a picture, one line). The picture is the game's own sprite where
there is one (`art`: Boot's exact URL via `splashArtUrl`, all preloaded at start; a strip's frame 0 or a
square `crop`; the emoji if it fails), else the emoji; a note about something the profile counts wears
that badge's glyph via `achievementById`. Cards are dealt from a shuffled deck kept in `flappyPoop.splash`
(`nextNote`: a feature this device never showed comes first; every card once per cycle; a reshuffle
never repeats the last card; `splashPool` keeps the newest `splash.featureMax` features). The player
browses at any time (swipe or mouse drag, ‹ ›, ← →, the d-pad by its own `getGamepads` poll, since
Phaser's pad plugin is bound only in Play); the first browse stops the `hintMs` auto-advance. Boot
drives the ring (`load.on('progress', setSplashProgress)`) and its `create()` hands
`splashReady(() => scene.start('Play'))`: once the ring is full (or after a timer backstop, since rAF
stops in a hidden tab) Continue lights up and glows, and **Play starts only on its
release** (click, Enter / Space up, the pad's A up), since Play's keydown-SPACE flap repeats while held
and the pad plugin reports a held button. Any error in the splash removes it and starts the game.

It is deliberately small: plain ES modules, no bundler, no runtime npm
dependencies (one devDependency for the schema tests), Phaser 4 loaded from a CDN, deployed to GitHub Pages straight from
`main`. Keep it that way unless the game clearly outgrows it.

- Repo: `github.com/sielerjm/flappy-poop` (the pre-2026 "joke version" that used
  to live there was replaced wholesale; nothing from it survives).
- Engine: Phaser **4.2.1**, pinned by exact version in `index.html`.
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
                            measured against the ring by tests/html.test.js); an inline import() of
                            src/splash.js, then <script> for Phaser from jsDelivr,
                            then <script type=module src=src/main.js>.
manifest.webmanifest        PWA "Add to Home Screen" metadata (fullscreen, portrait).
package.json                `npm test`, `npm start`, `npm run push`; one devDependency,
                            @electric-sql/pglite (pinned; tests/schema.test.js), so
                            `npm install` once per checkout. The game loads none.
CREDITS.md                  Phaser + every assets/sfx/ file with a URL.

src/
  main.js                   new Phaser.Game(...): fieldWidth(window) x 1280 logical
                            field (720 on a phone, wider on desktop), Scale.FIT,
                            a debounced window resize (a phone rotation too) →
                            Play.onFieldResize() when the width would change,
                            roundPixels,
                            arcade physics (fixed 60 Hz step; ?perf=var steps by
                            each frame's delta for a phone A/B), ?perf attaches
                            ui/perfMeter.js, activePointers 2 (two thumbs in a
                            match), input.gamepad on (bound once, in
                            Play), scene order
                            [Boot, Play, new Play('PlayB'), Over, Versus, Settings,
                            About, HowTo, Changelog, Language, Feedback,
                            Leaderboard, Daily, Stats] ('PlayB' is the right half of a match,
                            launched only by Versus).
  config.js                 GAME_WIDTH / GAME_HEIGHT (the portrait field = the
                            chrome column), FIELD (height, minWidth, maxWidth,
                            resizeDebounceMs), the TUNING object (every
                            feel-related number lives here; poopXFrac = the
                            player's share of the width; prefill.leadGrowth /
                            sweepMs = the pre-fill's lead and sweep-in on a wide
                            field), and LEADERBOARD
                            (Supabase Data API URL + publishable key, both public
                            by design; timeout, limit = the Top 25, visibleRows = the
                            fifteen in the board's window, storage keys incl.
                            careerKey = flappyPoop.career, score cap),
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
                            pulse and the overlay scroll step. TUNING.splash = the
                            loading splash (hintMs, slideMs, fadeMs, swipePx,
                            featureMax, storageKey; the ring: ringEaseMs,
                            ringMaxPerSec, ringMinPerSec, ringFrameCapMs, waitCap,
                            waitHalfMs). TUNING.versus = the
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
  logic.js                  Pure functions, NO Phaser/DOM: field (fieldWidth,
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
                            howToSeenAt and hand: HANDS 'left' | 'right', the
                            bean button's side) + howToPromptDue, vibrate
                            helper, trayLayout, trayHit, readyLayout, readyHit,
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
                            MYSTERY_COINS, createEffects addCoins / spendCoins /
                            coins, SHOP_ITEMS, buyBlocker / canBuy, shopButtonLayout
                            / shopButtonHit, bracketButtonLayout (the 🏅 pill under
                            the 💰 in a race's shared level break), shopLayout / shopHit, chromeIntent's
                            shop / breaking args and 'shop' input; test mode:
                            isTestWord, testRunStart, nextTestLevel, TEST_POWERS,
                            settingsLayout (Settings panel + rows, taller with the
                            test section). Fully unit-tested.
  changelog.js              What's new data, NO Phaser/DOM: CHANGELOG (one entry per
                            version, newest first: version, date like LAST_UPDATED's
                            day, notes per locale), changelogEntry, changelogNotes
                            (bulleted block for a locale, English fallback).
  achievements.js           Achievements and lifetime counters (plan 08), NO
                            Phaser/DOM: ACHIEVEMENTS (id, kind 'run' / 'lifetime' /
                            'seasonal', glyph, title / desc i18n keys, n, counters,
                            from / to, check), runDeltas (one run's counters, capped
                            as submit_counters checks), addCounters (= the SQL's
                            merge_counters), cleanCounters, evaluate (newly earned
                            ids), windowOpen, progressOf, bestFacts (veteran
                            credit), openQuests, achievementById, isAchievementId;
                            v0.16.0: a run entry's `modes` (default single player),
                            IBS_WINS / WINDOW_DAYS / BREAK_DAYS / FOUR_OF_A_KIND,
                            levelCloseShave, winsInWindow, daysBetween,
                            nextDrawStreak. Fully unit-tested (tests/achievements.test.js).
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
                            coursePairStart / courseDistance (a pair's place on the
                            course; what a half's distance reads with a pair a given
                            lead ahead), VERSUS_EMOJI; createMatch's options
                            (levelPipes, names, tournament) ride a rematch. Fully unit-tested
                            (tests/versus.test.js).
  leaderboard.js            Shared leaderboard, NO Phaser/DOM: submitPlan / submitPlans
                            (pure: what to post; up to two rows per player, best
                            off and best on the toilet, via save.js bestByToilet),
                            createSubmitStore (flappyPoop.leaderboard: last
                            confirmed submit per kind, { off, on }), submitScore /
                            fetchTop / fetchRank(id, toilet) over the Supabase
                            REST API with an injected fetch, apikey header only,
                            4 s abort, false / null on any failure, never throws
                            (submitScore: { ok } or { ok: false, reason: 'nameTaken'
                            | 'other' }, request's errors flag reading the
                            PostgREST message). checkNameAvailable (true / false /
                            null), mergePlayers, createMergeStore
                            (flappyPoop.merges: queued { keep, merge } pairs until
                            the server confirms), fetchPlayerName (the board's name
                            or null), createRenameStore (flappyPoop.rename: a rename
                            typed here), nameAction ('adopt' / 'keep'). Tournaments:
                            submitTournament ('ok' / 'keep' / 'rejected': only the
                            server's own bracket refusal drops one), fetchTournamentBoard,
                            createTournamentQueue (flappyPoop.tournaments, capped;
                            drains joined per storage, outcomes for the podium).
                            Both queues sit on createPostQueue. Daily Dump:
                            createDailyStore (flappyPoop.daily: this device's
                            attempt, read back for the same day and player),
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
                            Writes go through the submit_score(), merge_players(),
                            submit_tournament(), submit_daily_score(),
                            submit_counters() and claim_achievements() SQL
                            functions.
                            Fully unit-tested with a fake fetch.
  share.js                  Game-over share, NO Phaser; navigator / document / URL
                            injected: shareMode ('share' when
                            canShare({ files }), else 'download'), shareScoreImage
                            (navigator.share called synchronously inside the tap;
                            AbortError = cancelled; other errors and no share sheet
                            → <a download> PNG; never rejects).
  splash.js                 The loading splash (plan 01). Pure, Node-safe:
                            SPLASH_NOTES (id, kind 'feature' | 'hint', glyph, i18n
                            key, art { file, frames | crop } on the sprite cards;
                            features newest first), splashArtUrl (Boot's URL),
                            ringTarget / ringStep (the ring), splashPool, nextNote (the
                            deck: unseen features first, every card once per cycle,
                            no repeat across a reshuffle, ids that left or joined
                            the pool handled), createBrowser (one load's history:
                            back / forward replay without drawing), swipeIntent,
                            createSplashStore (flappyPoop.splash, throw-guarded).
                            DOM, document / window injected: startSplash
                            (idempotent; the inline import or Boot, whichever is
                            first), setSplashProgress, splashReady(onContinue).
                            Fails open: an error removes the splash and starts the
                            game. tests/splash.test.js.
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
                            levelBannerText(locale, level, levels, { shop }),
                            coinLabel ("💰 12", locale-free).
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
    focus.js                createFocus(scene, t, { items, scrolled, onVertical }):
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
    levelBar.js             createLevelBar(): grey track, pipe-pink fill tweened
                            one step per pipe (levelProgress), LV n label, 🏁;
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
                            with the box cut out) for the "Load user" button.
    tray.js                 Phaser wrapper around trayLayout: leaderboard (🏆) /
                            mute / settings bottom-right, pause directly above the
                            cog, plus bottom-left info, language (🌐), feedback (💬).
                            Chrome taps use trayHit() in Play/Over, not GameObject
                            pointer handlers. Returns buttons (id → circle) for the
                            focus ring.
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
                            labelScale() for the smoke.
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
    tournamentPanel.js      Plain DOM panel over Versus, every two-player session's
                            front door: lobby (count, Paste code / Guest / Use my
                            player rows, ?, Start), seeding (until the first race:
                            pairs, ⠿ drag, ↑ / ↓, 🎲, Play, Abandon), bracket
                            (results, next match, Play, Abandon on two taps), peek
                            (read-only, from a level break's 🏅 pill), podium (New
                            tournament, Home), help. State in the registry
                            'tournament'; races start through Versus.restartWith;
                            results arrive on 'tournament-race' ({ then }: 'next'
                            races on, else the panel). tournamentPadAction walks its
                            buttons for a controller. ROUND_KEYS names the rounds.
    savePanel.js            Plain DOM panel over the canvas (a three-step intro,
                            Username field, read-only user code + Copy, Load
                            field, an outlined Clear beside the Save button that
                            stores the username and confirms "Username saved",
                            status line). claimName asks the board once per name
                            (blur and Save share the promise; Save is never
                            disabled, a disabled button would swallow the phone
                            tap that blurred the field): taken → refused with the
                            steps, unknown → saved with the offline note. Load
                            from another id → Play.queueMerge, "saveMerged". Clear
                            → warn, then Play.signOut on a second tap inside
                            saveClearConfirmMs.
                            Opened by the ready screen's user button, with
                            { focusName: true } while there is no username (caret
                            in the field at once). It stays open after Save so the
                            player sees their user code.
                            Disables game.input.keyboard while open so typing does
                            not flap. The test-mode word in Username: Save toggles
                            Play.setTestMode instead of renaming; blur never stores it. Copy calls clipboard.writeText inside the tap
                            handler (iOS); falls back to selecting the field.
                            👤 Profile (an outline button on its own row, disabled
                            with Clear until a username is stored): closes the panel,
                            then Play.openStats() (the own profile; over the 🌞
                            popup when it was under).
  scenes/
    Boot.js                 preload() gameplay PNGs (mystery.png as a 384 px
                            spritesheet; coin.png as a 106 px one) + the sfx MP3s (coin, coin-spend,
                            shop beside fart / fart-accelerate / level-up); create() makes the global
                            'mystery-spin' (mystery.frameMs) and 'coin-spin' (coin.frameMs)
                            anims, then hands splashReady() the start of Play: Play
                            starts on the splash's Continue. The loader's progress
                            fills the splash's ring.
    Play.js                 State machine: 'ready' -> 'playing' -> 'paused'/'dead'
                            (+ 'respawn' in a match: between a crash and its restart).
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
                            (profileButtonText(): "Load user" under a pulsing
                            createRectGlow halo until a name is set, then "name ·
                            best"; either way it opens the save panel, on the name
                            field while unnamed); any other tap starts); launch() swaps to the
                            plain poop frame and slides it to poopX over
                            launchSlideMs, then start(); extra taps during the
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
                            readyHit() routes taps (toilet, versus, howto, profile
                            → the save panel; anything else starts). getSaveState / setSaveState for the panel.
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
                            after the break starts); win() → showEscapedBanner
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
                            Versus.onJoinInput); P2 draws no tray, no ring, binds no
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
                            (versusOffered(): outside a match, not test mode,
                            versusAvailable; toggleVersus → registry 'versus',
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
                            testRunNotSaved line, no Share, Home alone at centre.
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
    Settings.js             Overlay (geometry from settingsLayout): sound, haptics (Android only), the
                            hand row (👈 pill 👉 from createToggle with glyphLeft, a
                            Zone over the row, a hint line; toggleHand →
                            Play.setHand, which moves the bean button on every
                            running Play instance), Reload game
                            (hardReloadGame(): re-fetches loaded scripts with
                            cache: 'reload', then location.replace with a fresh r=
                            query; picks up a push at once, works on home-screen
                            installs), About link, version. Tap outside the panel
                            closes (overlayOutsideHit), same as X. The panel is 860
                            px; in test mode 1240 px with the test section (start level ◀ ▶,
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
                            levels / controls / toilet / two players / tournament / Daily Dump rows,
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
                            the version line. refresh() redraws it after a save.
    (every overlay builds this.focus from pressable() items, ✕ first then its
                            rows, and calls focus.show(), which only shows under a
                            controller; About / HowTo / Changelog pass scrolled: sv and
                            onVertical so up / down scroll the text; Leaderboard
                            passes onVertical only, scrolling its rows band)
    Leaderboard.js          Overlay (🏆 tray button or T): awaits
                            Play.syncLeaderboard() (posts a pending best), then
                            fetchTop + fetchRank in parallel behind a Loading line.
                            Top 25 (LEADERBOARD.limit): rank · name · 🚽 · LV n ·
                            score rows in a band that shows visibleRows (15) at once
                            on a 640 × 1120 panel (the profile's size)
                            and scrolls (createScrollView over the band; title,
                            header, footer, version fixed), own row highlighted
                            by rank, footer = join hint (no username) / rankText
                            (off the board) / "not on the board yet". A generation
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
                            the board is on top); the – rows are not names. loadTags:
                            once the rows are in, one Play.fetchBoardTags (board_tags)
                            puts each name's tags (🔧 🎖️ 🆕, TAG_GLYPHS) after it; a
                            tagged name never shrinks below MIN_NAME_SCALE (0.45), so
                            a long name keeps only its first tag; a failed request
                            leaves the board untagged.
    Stats.js                Overlay (plan 08; chromeIntent 'stats': on its own, or
                            over the board or the 🌞 popup, closing back to it
                            without the lockout): a player's profile, launched by
                            Play.openStats with { name } (anyone's player_stats) or
                            nothing (the own: the career store, topped up by the
                            server when named; offline / unnamed notes). Sections in
                            a scroll view (statsLayout): Singleplayer, Daily Dump
                            podiums, Tournaments (medals, biggest rival), Career (a
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

assets/                     Contract PNGs + README.md (the art contract).
  README.md                 File name, pixel size, orientation rules. tests enforce it.
  poop.png poop-dead.png poop-stink1.png poop-stink2.png poop-falling.png
  poop-stink-falling1.png poop-stink-falling2.png poop-scared.png
  poop-stink-scared1.png poop-stink-scared2.png poop-fart.png
  poop-speech.png fiber.png probiotic.png postbiotic.png bacteria.png bean.png coin.png
                            (coin.png: the golden corn kernel's spin, 12 frames of
                            106x106 side by side (1272x106), loaded as a spritesheet;
                            postbiotic.png: HUD icon only, never spawned;
                            the falling frames: scared face + sweat marks for a
                            long drop, with / without stink lines; the scared
                            frames: the near-miss face after a close call with a
                            pipe, with / without stink lines)
  mystery.png               Mystery box spin: 8 frames of 384x384 side by side (3072x384),
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
  sfx/ToiletFlush_Win.mp3   The toilet flush when GO appears in a two-player countdown.

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
                            (jsonb counters, last_batch receipt) + merge_counters
                            (internal) + submit_counters (5 s per player, caps per
                            run: maxScore, lastLevel); achievement_defs (quest
                            windows, seeded in the file) + player_achievements +
                            claim_achievements (window + 2 days' grace, 50 a call,
                            300 a player); player_by_name (internal: the boards'
                            naming) and player_stats (anyone's profile, no ids);
                            fold_player merges counters and achievements. v0.16.0:
                            player_meta (joined_at, exact, dev; touch_player from
                            every write function, an inexact backfill) and
                            player_tags ('dev', 'og' before 1 Dec 2026, 'new' an exact
                            join in 7 days) for player_stats and board_tags (anon, 100
                            names); admin_set_dev (owner only, by name); 👑 dethroned
                            (add_server_counter from submit_score / submit_daily_score
                            when a post takes the board's #1 from another player),
                            refused in a client batch. Run by
                            hand in the SQL editor, never by any integration; it is
                            the source of truth for the backend. Apply it BEFORE
                            pushing a client that depends on new functions.
                            tests/schema.test.js runs it in PGlite (Postgres in
                            WebAssembly). PL/pgSQL gotcha: a bare CASE inside
                            `IF … THEN` ends the condition at its THEN; parenthesise.

tests/                      node --test (schema.test.js needs `npm install`: PGlite). Each file is self-describing:
  field.test.js             fieldWidth (phone, desktop, 2:1 cap, bad input, even),
                            uiColumn, poopX, the x0 shift of trayLayout /
                            levelBarLayout / readyLayout, hits on a shifted column,
                            pipeLeadPx, pipeLead (grows with the extra width),
                            prefillPairs (one edge pair on a phone; a wide field
                            filled from its lead to its edge), sweepOffset
                            (ends, midpoint, monotonic, fastest off the edge,
                            peak extra speed bound)
  html.test.js              index.html invariants (viewport, no scroll, pinned Phaser;
                            the splash's parts, ‹ card › then Continue, no spinner,
                            no words in its markup, the inline import before
                            Phaser, its colour tokens; poop.png's pixels, decoded,
                            stay 2 % inside the ring at both ends of the bob)
  splash.test.js            the splash's catalog (copy in every locale under the
                            100 / 50 character cap, one glyph per thing: badge glyphs,
                            no borrowed ones), the sprites (files Boot loads by that
                            path, the coin's frames, crops inside the image), the
                            ring (creep, monotonic, capped per frame, 0.6–1.1 s
                            empty to full), splashPool, the deck (features first and
                            NEW once, every card once per cycle, no repeat across a
                            reshuffle, pool changes), createBrowser, swipeIntent,
                            the store, the inert DOM part in Node
  assets.test.js            load.image / load.spritesheet / load.audio paths; README
                            sizes; a spritesheet is a whole number of frames; sfx credits;
                            the sound triangle: every tracked sfx file is loaded, every
                            credited one is tracked (git ls-files)
  logic.test.js             gap bounds, rng determinism, hasPassed, angle,
                            resumeFlapVelocity
  levels.test.js            level lengths / ends / levelFor table, final level,
                            per-level pipe spacing, levelSpeed cap (the level-3 cruise),
                            names + colours, levelProgress, lerpColor, gap + grace
                            sanity, levelBannerText, levelBarLayout, levelLabel
  state.test.js             retry lockout
  perf.test.js              the frame meter's pure parts: perfMode, the median period,
                            long frames blamed on the previous frame's tags, perfLines
  store.test.js             best-score store incl. throwing/missing storage
  settings.test.js          settings store (incl. hand) + vibrate helper
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
  feedback.test.js          issueUrl bug/feature templates; openExternalUrl paths;
                            feedback i18n keys
  i18n.test.js              catalog key parity, zh≠en (allowlist), TRANSLATION_NOTES
                            key coverage, scene English denylist, initialLocale
  share.test.js             shareMode branches, shareScoreImage (share
                            called synchronously, cancel, error → download, download
                            name + revoke, never rejects)
  over.test.js              overButtonsLayout (Share | Home inside the panel, Home
                            alone on a test run), overHit, shareCardLayout (inside
                            the frame, top-to-bottom order, rows inside the card)
  shareCard.test.js         drawShareCard on a fake 2D context (text order, tan frame
                            before the poop, icons + pipe cap slice, win line, text
                            max widths), renderShareCard blob / null paths
  overlay.test.js           overlayOutsideHit inside vs 1px outside HowTo/Settings panels
                            (plain and test-mode)
  testmode.test.js          isTestWord, testRunStart (levels, par score, clamping),
                            nextTestLevel wrap, TEST_POWERS, settingsLayout geometry
                            (incl. the hand row)
  hitbox.test.js            scaledCircleBody source radius/offset for 2x and 4x
  chrome.test.js            chromeIntent matrix across state x overlay x input
                            (incl. the Changelog over About, 'respawn' pausing like
                            'playing' and ignoring taps, the shop's open / close rows)
  shop.test.js              shopButtonLayout (under the banner hint, above the bean
                            button, clear of the tray and the break's poop), the
                            panel and its rows (inside the strips, apart, covering the
                            pill), shopButtonHit / shopHit, bracketButtonLayout (a row
                            under the 💰, above the bean button)
  gamepad.test.js           padAction (every knob, unmapped → null, a retuned layout),
                            stickNav deadzone / larger axis, focusStep wrapping,
                            focusRingLayout, padIntent matrix across top x state x
                            ring x action (+ the save-panel short-circuit, the
                            tournament panel's nav / A / B)
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
  smoke.test.js             logic.js imports and exports VERSION
  save.test.js              save codes: spec rows 1-10 (round trip, tamper, relabel,
                            v2 migration, merge, name rules, wrapped paste, empty
                            scores, throwing storage) + helper coverage, best 6,
                            the optional h (hand) key
  ready.test.js             readyLayout boxes inside the field, non-overlapping,
                            clear of the bobbing poop; readyHit centre / gap / profile
  serve.test.js             npm start points at tools/serve.py; bind + URL print;
                            the no-store handler
  leaderboard.test.js       LEADERBOARD config shape (limit 25, visibleRows 10); submitScore headers / body /
                            400 / throw / timeout; disabled config makes no request;
                            fetchTop parsing + order; fetchRank; submitPlan matrix
                            (name, id, cap, confirmed, rename, flag, id change);
                            submit store incl. throwing storage; submitTournament
                            (ok / keep / rejected), fetchTournamentBoard, the
                            tournament queue (cap, order, joined drains);
                            submitDailyScore's answer mapping, fetchDailyBoard;
                            the career store's batch / claim life cycle,
                            submitCounters, claimAchievements, fetchPlayerStats
  achievements.test.js      The catalog (ids, copy in every locale, every badge
                            earnable), evaluate (run badges from single player only),
                            runDeltas and its caps, addCounters = merge_counters,
                            quest windows, bestFacts, catalog ↔ achievement_defs
  daily.test.js             Daily Dump: the UTC day key and countdown, FNV-1a
                            vectors, seed / level stable and spread over 3–7,
                            dailyRunStart, the per-pair reward stream, the daily
                            store and queue, the result's date / rank / share words
  schema.test.js            db/schema.sql in PGlite, applied twice: anon reads no
                            tournament table; medals = placings() for 3–8 players
                            (the floor pinned to minPostPlayers);
                            300 legal brackets accepted, 16 forgeries rejected (no
                            receipt left); duplicate / 60 s pacing; guests; board
                            order and `me`; names; merge_players folds medals;
                            daily: the cap / level pins, client = server level over
                            a year, today / yesterday only, first post kept, the
                            name claim, the board (`me`, `total`), the day in UTC
                            under other session time zones, the fold, anon access
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

.github/ISSUE_TEMPLATE/     GitHub issue forms opened from Feedback (bug.yml,
                            feature.yml); config.yml allows blank issues.

tools/
  make_placeholders.py      Regenerates pipe / villi / ceiling / ground only (icons
                            moved to process_art.py); ceiling.png is the ground's
                            mirror (ceiling_strip), drawn by the game as its own
                            strip over the pipes; a cream backdrop from each
                            screen edge to BAR_FRAC of the shortest fringe tip
                            sits behind everything; fingers run off the
                            edges / behind the strips (villi_band min_frac) and
                            their lumen-side tips undulate (BACK_WAVE on the
                            fringes, FRONT_WAVE in the strips' TIP_ZONE). Must
                            not overwrite poop.png. Run only when you intend to.
  process_art.py            Crops assets/src/ drawings into 384x384 contract PNGs
                            (drawn at spriteDisplayScale 0.25 → 96 logical px);
                            the poop set (alive / dead / stink1 / stink2 / falling /
                            stink-falling1 / stink-falling2 / scared / stink-scared1 /
                            stink-scared2 / fart / speech) shares
                            one body scale and centre, stink / falling / fart /
                            speech on bigger squares; bean.png from Kidney_Bean.png,
                            postbiotic.png from Postbiotic.png, mystery-icon.png from
                            MysteryBox_Icon.png; process_sheet cuts MysteryBox.gif's
                            frames on one shared square into the mystery.png strip
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
  push.mjs                  npm run push: stamps LAST_UPDATED in src/logic.js with the
                            current local time, runs npm test, commits the stamp, pushes
                            main. Refuses a dirty tree or a non-main branch; --dry skips
                            commit + push.
  headless_check.mjs        npm run smoke [url] [--list] [--only=a,b]: the checks run in
                            named sections (SECTIONS, in run order, each printing its check
                            count); --list shows them; --only runs those plus what they
                            need (needs omitted = every earlier section; [] = passes alone,
                            set only once shown), skipping and never reordering; the
                            hermetic stubs, the boot wait and the leaderboard muzzle sit
                            outside every section. The boot wait goes through the loading
                            splash: a card shows, Continue lights up and glows, Play waits,
                            → changes the card, Space down alone does nothing, its release
                            continues; then the splash is gone and the ready screen did
                            not start a run. It launches headless Chrome (CHROME env
                            overrides the path), drives the running game over the
                            DevTools protocol through globalThis.__flappy, and fails
                            on a page exception, a stalled __flappy.loop.frame, or an
                            overlay that does not open / close. Covers every overlay in
                            OVERLAYS (tests/tools.test.js keeps that list equal to
                            main.js), a run start, leaderboard mid-run pause, and a
                            close-and-reopen race, plus the mystery box (level 3's
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
                            navigator.share, cancel, download fallback, Home), and
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
                            1800×1000 window and not in portrait, the lobby it opens
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
                            with no 🥉 and nothing saved, an all-guest one). The
                            viewport is pinned to 720x1280 before load
                            (Emulation.setDeviceMetricsOverride) so the rest is
                            the phone field; tapAt maps through the live
                            __flappy.scale size. The page's
                            navigator.getGamepads is stubbed to [] before load: a
                            pad paired to the machine is visible to headless Chrome
                            and its presses would otherwise reach the game.
                            Zero dependencies (fetch + WebSocket).

.claude/plans/              Pending build plans numbered in build order
                            (NN-name.plan.md), indexed by ROADMAP.md (order,
                            dependencies, open decisions), + living specs (e.g.
                            the Save Code Spec). A new plan takes the next free
                            number and a ROADMAP row; when Status is complete,
                            move it into Archive/ and mark its row.
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
   `assets/README.md`. Change a size only if you update that table AND the scene
   code that positions the sprite. `npm test` fails otherwise. The pipe image has
   its cap at the top and is flipped vertically for the top pipe; `villi.png`,
   `ceiling.png` and `ground.png` must tile horizontally. Player/item redraws go through
   `assets/src/` + `tools/process_art.py`.
4. **Phaser stays pinned.** `index.html` loads `phaser@4.2.1` from jsDelivr.
   Bump it by changing that one tag; `tests/html.test.js` only checks the pin is
   an exact version. Phaser is a global (`Phaser.Scene`, `Phaser.Game`), not an
   import.
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
   `localStorage` access. Go through `createBestStore()`,
   `createSettingsStore()`, `loadLocal()` / `saveLocal()` from `save.js`, or
   `createSubmitStore()` from `leaderboard.js`; never touch `localStorage`
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

## How to work on it

```bash
npm test          # every unit + audit test (~10 s); must pass before committing
node --test tests/items.test.js   # one file while iterating
npm run push      # stamp LAST_UPDATED = now, run tests, commit the stamp, push main
                  # (always push this way so the About overlay's "Updated" is the push time)
# In a browser, globalThis.__flappy is the Phaser.Game (debug / automation only):
#   __flappy.scene.getScene('Play').spawnPipePair()
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
uv run --with pillow python3 tools/process_art.py   # rebuild poop set / items / bean from assets/src/
uv run --with pillow python3 tools/make_placeholders.py   # pipe / villi / ceiling / ground only
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
- Network call → `src/leaderboard.js` only, with `fetch` injected and a timeout;
  tests pass a fake `fetch`. Never `await` a request inside a Phaser update
  loop; fire and forget from gameplay, `await` only in an overlay's `create()`.
- Backend change → edit `db/schema.sql`, run it by hand in the Supabase SQL
  editor, keep `LEADERBOARD.maxScore` and the schema's score cap in step.
- New achievement → one `ACHIEVEMENTS` entry in `src/achievements.js` (a new,
  permanent id) and its title (and, if no template fits, description) in both
  locales + `TRANSLATION_NOTES.md`. No SQL: any well-formed id is claimable.
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
- New loading-screen card → one `SPLASH_NOTES` entry in `src/splash.js` (a new,
  permanent id; a major feature goes at the top of the features, newest first,
  and the oldest beyond `splash.featureMax` drops out on its own) and its line in
  both locales + `TRANSLATION_NOTES.md`, at most 100 characters in English and 50
  in Chinese (‹ › beside the card leave ~22 a line on a 360 px phone). Its emoji is
  the badge's glyph when the profile counts the thing (`badge('<achievement id>')`),
  else the game's chrome glyph; `tests/splash.test.js` holds the table and refuses
  a glyph another badge means. A thing the game draws as a sprite also gets
  `art: { file }` (a file Boot loads; `frames` for a strip, `crop` when the art
  fills only part of its frame).
- New UI chrome → `src/ui/` (Phaser wrapper) with any pure layout helper in
  `src/logic.js`, positioned inside the chrome column (`this.col`: pass
  `col.width` as the width and `col.x` as the helper's `x0`, or add `col.x`
  to a fixed x). New world objects (things that scroll, full-screen shades)
  use `this.scale.width`. Text input belongs in a DOM panel like `src/ui/savePanel.js`,
  not Phaser UI.
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
- New smoke checks → inside the section they belong to in `tools/headless_check.mjs`.
  A new section → a `SECTIONS` entry (with `about`) and a `section()` call in the
  same order; leave `needs` out (it then runs after everything before it) until
  `--only=<it>` passes alone with the same checks as the full run.
- Multi-step work worth planning → a numbered markdown plan in `.claude/plans/`
  (next free `NN-`, `Created:` date inside) plus a row in `.claude/plans/ROADMAP.md`;
  when Status is complete, move it into `.claude/plans/Archive/` and mark the row.
- An audit of the repo, a zone or a feature → the `audit-repo` skill
  (`.claude/skills/audit-repo/SKILL.md`, local and untracked; example prompts in its
  `examples.md`). It is read-only: reports go to `.claude/audits/<date>/`, fixes only on Michael's word.
- Repo-wide conventions → this file. Player-facing docs → `README.md`.
- Locale copy review for LLMs → `TRANSLATION_NOTES.md` (keep in sync with `src/i18n.js`).
