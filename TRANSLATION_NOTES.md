# Translation notes — Flappy Poop (en ↔ zh-Hans)

Hand this file to an LLM (or a human reviewer) to check the Simplified Chinese UI.
Do **not** require reading `src/i18n.js`; the full table is below.

Draft and review may both be LLM-assisted. A native speaker pass before shipping to
GitHub Pages is still preferred.

## Product context

Flappy Poop ("The #1 game to play while going #2!") is a gut-themed Flappy Bird clone for phone browsers (Phaser 4, no
bundler). A poop emoji flaps through intestinal-fold pipes. Pickups: fiber (+3),
probiotic (blocks one bacteria hit for 5 pipes; pickups stack), bad bacteria (−3, never kills).
Postbiotic (后生元): fiber eaten while a probiotic is active; pipes and fiber score ×2 until the
probiotic runs out, and kernels picked up count twice (never a box's coins). It is a state shown in the HUD, not a pickup.
Mystery box (神秘盒子): the first is guaranteed before pipe 5 of level 3, then more roll by chance;
still on level 3, bobbing from level 4.
It opens into a random reward (fiber, probiotic, one or three beans, a 5-pipe postbiotic,
5 / 10 / 15 coins, or a skip to the end of the level).
Coins (金币): golden corn kernels, one on every level (on level 1 just past the last pipe) and more
between the pipes from level 2 (or out of a mystery box), kept in a purse for the run (a death empties it)
and spent in the **shop** (商店) at the level break: the
button under the banner opens it (fiber, one bean, a super fart that fills the bean bag, a
mystery box). Coins are drawn as the corn kernel with a count (the shop button, the purse line, the
prices, the quiz's "Right! +1"), so those labels need no strings. Only the level break's hint still
names the shop with 💰 ("💰 to shop"), which is not translated.
The How to play row calls them **Kernels** (玉米粒) and keeps to a short line; the shop and the rest of
the UI keep **coins** (金币). The iPhone Silent-mode note is its own last How to play row, **Sound** (声音, shown with 🔊).
In two players each half shops in its own level break, and a shop open on either half holds the
shared start (the other player reads **Waiting for P{n}…** until it closes).
Test mode (测试模式): a developer sandbox turned on by typing a trigger word as the username. Its
Settings rows (start level as "Start at LV n", Invincible ON/OFF, power-up buttons, Exit) and its
messages are terse developer copy; test runs never save a score.
Game over has a Share button: the share sheet gets a picture card (GAME OVER, the poop, score,
pickup counts, and shareCardPlay's "Play: <link>" footer); the message under it is only the game's
link (nothing to translate).
Loading splash (the cream screen while the game downloads): one note card at a time under the
progress ring, a picture (the game's sprite, or an emoji) then one short line, labelled **TIP** (小提示)
for a hint or **NEW** (新功能) for a major feature, with ‹ › beside the card. The player swipes through
them, then presses **Continue** (继续). Keep cards short: at most 100 characters in English and 50 in
Chinese (a test checks); the card is as tall as the longest one.
Education badges (plan 22; shown on the game-over line and in the profile's 📚 Education section,
on devices where education mode is unlocked): eight badges with playful school titles. Four are
puns the Chinese drafts only approximate, so **check these four**: Nerd Alert (学霸警报: 学霸 is
the admiring word for a top student), C's Get Degrees (六十分万岁, the student saying that a bare
pass is enough), Drop Out (退学: quitting school, here quitting a run without one answer), and
Angel Baby (小天使: revived, so back from the dead). A run is **graded** (计分) only with at least
`{min}` answers; "Graded runs" (计分局数) counts those, and "Average grade" (平均成绩) is their mean.
Author / designer / artist: Michael Sieler. Side project, short playful copy — not
formal medical language.

## Locale rules

| Code | Language | Role |
|---|---|---|
| `en` | English | Default stored value; catalog source of truth |
| `zh-Hans` | Simplified Chinese | Second locale |

- First run with **no** stored `locale`: if `navigator.language` starts with `zh`, use `zh-Hans`; else `en`. Then persist.
- Once the player picks a language in the 🌐 panel, the stored value always wins.
- Brand title **Flappy Poop** stays Latin in both locales.
- Untranslated tokens (must appear across About strings): `Flappy Poop`, `Michael Sieler`, `Phaser 4.2.1`, `MacKaffee`, `Pixabay`, `fart sound effect (reed)`, `Tori Schummer`, `Niklas Werner`, version numbers.
- **Silent mode** = iPhone **hardware** ringer/silent switch → **静音模式** (not the in-game mute toggle).
- **Toilet mode** (如厕模式) = the ready-screen switch; scores from such runs carry a 🚽 (not translated).
- **User code** / save code (用户码 / 存档码) = the `fp1.…` string players copy between devices. The home-screen user button reads **Load user** (载入用户) until a username is set, then the name and best; it opens the panel titled **SAVE / LOAD USER**, whose labels are **Username**, **Save user code**, **Load user code**, and a **Save** button at the bottom that stores the username. `{name}` and `{scores}` are placeholders filled at runtime; keep them verbatim.
- **One player across devices** (2026-11-08): every browser has its own secret id; the leaderboard treats ids merged through a user code as one player (aliases). A **username belongs to the player holding it on the board**: typing a held name on a new browser is refused (`saveNameTaken`), and the way in is to paste the user code (`saveIntro` step 3, `saveMerged`). **The **board's name wins** (2026-11-09): a rename typed on one device reaches the others on their own (`saveIntro` step 4, 自动更新); only a name typed on a device overrides the board. **Clear** (清除) signs this device out after a second tap (`saveClearConfirm`, `saveCleared`): the name, id and scores are forgotten on the device only. "Sign out" is the plain sense (退出), not an account system. `{name}` stays verbatim.
- **Leaderboard** (排行榜) = the shared online Top 25 behind the 🏆 tray button. Only players with a username are on it; `{score}` may carry a 🚽, `{rank}` / `{total}` are numbers. Keep the placeholders verbatim. The 🏆 · 🌞 · 🏅 tabs under the title switch it to today's **DAILY DUMP** board (每日一拉) or the **MEDAL BOARD** (奖牌榜): players ranked by 🥇, then 🥈, 🥉 and their **BEST RACE** (单场最佳: their best score in one tournament race, on the shorter tournament levels, so not comparable with the 🏆 score); `{events}` is how many tournaments they finished.
- **Tournament** (锦标赛, 🏅) = every two-player (👥) session: 2–8 players on one device, raced two at a time in a knockout bracket (赛程, **Bracket**): quarter-finals, semi-finals, a bronze match (铜牌赛) and the Final, then a podium (领奖台); two players race the Final alone (no bronze). Each row of the lobby is a pasted user code, a **Guest** (访客, a made-up English name such as JollyPlunger042, kept as is in Chinese), or **Use my player** (the host's own username). Before the first race the host can change who meets whom (drag, ↑ ↓, 🎲 **Shuffle** 重新抽签; a **bye** 轮空 goes straight through). **Abandon** ends it, saves nothing and goes back to the lobby. When the Final of 3 or more players is decided, players who joined with a user code (and the host's own player) get their medals (奖牌) on the **🏅 board** (🏅 榜, a tab of the leaderboard); the podium says whether that worked. Guests and two-player tournaments are never saved.
- **Username rules** (2026-11-10): a new username has 4–16 characters (at least 2 when it has Chinese, Japanese or Korean characters), no spaces, no emoji, and none of a short list of English rude words; the save panel says which rule a name broke (saveNameShort / Space / Emoji / Blocked / Long). Names chosen before the rules keep working. saveNameBlocked stays vague on purpose ("pick a different username").
- **Play again** (再玩一次) = the game-over button that starts the next run at once; **New personal best** (新的个人最佳) shows when a run beats every earlier score on this device.
- **Daily Dump** (每日一拉, 🌞) = the once-a-day challenge behind the 🌞 at the top of the home screen: everyone flies the same endless course that day (赛道, at one level, 关), with one try (一次机会); a new course starts at 00:00 UTC. The name is a pun (a "dump" is a poop); 每日一拉 keeps the joke ("one poop a day"). Its popup's button reads **Create user** (创建用户, no username yet), **Play** (开始), **See today's result** (查看今日成绩) or, in test mode, **Practice** (练习: never saved). `{level}` is a level label such as "LV 5" / "第5关", `{time}` a countdown hh:mm:ss, `{day}` a short date written by the browser for the locale ("10 Nov" / "11月10日"), `{rank}` / `{total}` / `{score}` numbers; keep them verbatim. The zh body text carries explicit line breaks so the game's wrap never starts a line with punctuation.
- **Two players** (双人模式) = the 👥 switch under the toilet toggle, offered only on a landscape screen wide enough for two halves (desktop, tablet). P1 is the left half, P2 the right; `{n}` is the player number, and `{name}` is "P1" / "P2" (versusPlayer) or, in a tournament race, the competitor's name. A crash does not end a two-player run (the poop is put back mid-screen). Levels start together: the first one over a finish line waits under **Waiting for {name}…** until the other arrives; then each player taps ready (**Tap when ready**, then **Ready! Waiting for {name}…** with a smaller **Tap again to un-ready** under it), and once both are ready a shared 3-2-1-GO starts the level as **GO!** appears (with a toilet flush). The match is decided on points once both players have cleared the last level, and the first one out waits under **Made it out!** / **Waiting for P{n}…**. Two-player runs never reach the leaderboard or the save code.
- **Profile** (个人资料, 👤) and **achievements** (成就, 2026-11-11) = every player's public page: the save panel's 👤 Profile opens your own, a name on any board opens theirs. Sections: **Singleplayer** (单人模式), **Daily Dump** podiums (领奖台), **Tournaments** medals and **Biggest rival** (最大对手: the player they lost to most), **Career** (生涯: lifetime totals as emoji and numbers: #️⃣ pipes, 💨 farts, 🌈 super farts, 🥦 fiber, 💊 probiotics, ✨ postbiotics, 🦠 bacteria, 🫘 beans, 📦 boxes, 🟡 coins, 💀 deaths; a tap opens a card with a short note, `career*`) and **Achievements** (成就): badges (徽章) for a score or level in one run, for making it out, and lifetime milestones; some are time-limited **quests** that close on a date (`statsQuestOpen`). Badge titles are short puns, keep them playful rather than literal (e.g. 一泻千里 for Express Transit, 彩虹屁 for Rainbow Blast); the seven level badges reuse the gut-segment names. `{n}`, `{total}`, `{glyph}`, `{name}`, `{losses}`, `{meetings}`, `{day}` and `{badges}` are filled at runtime; keep them verbatim. The save panel's note now says scores, stats and achievements are all public (`saveLeaderboardNote`). Without a username a profile opens as a gate (`statsGateTitle` / `statsGateBody`) with **Create user** (创建用户, the 🌞 popup's string).
- **Education mode** (教育模式, 📚, plan 21) = quiz cards about the gut and its microbes, asked in level breaks (for coins) and after a crash (to keep flying). Before its public release it is unlocked by typing a word as the username in the save panel (like test mode), never stored as a name; `eduUnlocked` / `eduLocked` say which way it went. The 📚 glyph is not translated. Card text lives in `src/questions.js`, not in this catalog, and is English only until a card gets its `zh` version: a zh-Hans player sees the card in English (the quiz chrome around it is translated), and a pilot event records the game's language, not the card's. The quiz card (`quiz*`) names the gut segment with the `level.*` names, or **Gut microbes** (肠道微生物) for the general cards; `{source}` is a short citation such as "Martinsen et al. 2005" and stays as is. After a crash in an education run the same card is a **revive** (复活): `revive*` lines; ❤️ are the tries left, ⭐ the streak that wins back the coins and power-ups (金币和道具); `{n}` in `reviveChoice` is a number of questions. "Tap when ready" reuses `versusTapReady`.

## Glossary (items)

| English | Simplified Chinese |
|---|---|
| Pipe | 管道 |
| Beans | 豆子 |
| Fiber | 纤维 |
| Probiotic | 益生菌 |
| Postbiotic | 后生元 |
| Bad bacteria | 有害细菌 |
| Mystery box | 神秘盒子 |
| Coin | 金币 |
| Shop | 商店 |

Keep these consistent everywhere (How to play rows, future copy).

## Tone

Short, playful, clear. Fit a 720×1280 logical field; How to play / About body wrap at
~520 px with per-character wrap for Chinese. Prefer everyday words over clinical jargon.

## Full string table

| Key | English | Simplified Chinese |
|---|---|---|
| readyTitle | FLAPPY POOP | FLAPPY POOP |
| howToPlay | How to play | 玩法说明 |
| pauseTitle | PAUSED | 已暂停 |
| pauseHint | tap anywhere to resume game | 点击任意处继续游戏 |
| levelBanner | LEVEL {n} | 第 {n} 关 |
| levelContinue | Tap to continue | 点击继续 |
| levelGateTap | Tap 📚 to review all cards before continuing. (plan 26, A2: a smaller line under "Tap to continue" once a tap at a level break was refused because missed or review cards are due; it goes when they are answered) | 先点 📚 复习完所有卡片，才能继续。 |
| shopPill | Shop (plan 26, A2: the level break's shop button, beside the corn kernel, with no number: the HUD shows the purse. The panel's own title is shopTitle, SHOP) | 商店 |
| shopTitle | SHOP | 商店 |
| shopCoins | Your coins | 你的金币 |
| shopFiber | Fiber · +3 points | 纤维 · +3 分 |
| shopBean | One bean | 一颗豆子 |
| shopSuperBean | Super fart · fills the bag | 超级屁 · 装满豆袋 |
| shopMystery | Mystery box | 神秘盒子 |
| shopFull | Bag full | 豆袋已满 |
| levelShort | LV {n} | 第{n}关 |
| level.stomach | Stomach | 胃 |
| level.duodenum | Duodenum | 十二指肠 |
| level.jejunum | Jejunum | 空肠 |
| level.ileum | Ileum | 回肠 |
| level.caecum | Caecum | 盲肠 |
| level.colon | Colon | 结肠 |
| level.rectum | Rectum | 直肠 |
| gameOver | GAME OVER | 游戏结束 |
| runWon | YOU MADE IT OUT! | 顺利排出！ |
| scoreLabel | SCORE | 得分 |
| tapToHome | Home | 返回主页 |
| settingsTitle | SETTINGS | 设置 |
| sound | Sound | 声音 |
| haptics | Haptics | 震动 |
| on | ON | 开 |
| off | OFF | 关 |
| hapticsHint | Android only — iPhone has no vibrate | 仅限 Android——iPhone 不支持震动 |
| handHint | Bean button side in landscape | 横屏时豆子按钮的位置 |
| reloadGame | Reload game | 刷新游戏 |
| aboutLink | About | 关于 |
| testTitle | 🧪 TEST MODE | 🧪 测试模式 |
| testStartLevel | Start at | 开始于 |
| invincible | Invincible | 无敌 |
| testExit | Exit test mode | 退出测试模式 |
| aboutTitle | ABOUT | 关于 |
| aboutName | Flappy Poop | Flappy Poop |
| aboutTagline | The #1 game to play while going #2! | 上大号时必玩的头号游戏！ |
| aboutBlurb | The idea, game design, and all art were created by Michael Sieler. | 创意、游戏设计与全部美术均由 Michael Sieler 创作。 |
| aboutLlmNote | This game was coded with the assistance of an LLM. | 本游戏在 LLM 协助下编写。 |
| aboutCreditsTitle | Credits | 致谢 |
| aboutCredits | *(see block below)* | *(see block below)* |
| howToTitle | HOW TO PLAY | 玩法说明 |
| howToBody | Tap to flap. Hit a pipe, the ceiling, or the floor and the run ends. | 点击起飞。撞到管道、天花板或地面则本局结束。 |
| itemPipeName | Pipe | 管道 |
| itemPipeDetail | This is a pipe. Dodge the pipes for as long as possible. You gain 1 point for every pipe you dodge. From level 4 some pairs drift slowly up and down. | 这是管道。尽量长时间躲开管道。每躲过一道管道得 1 分。从第 4 关起，有些管道会缓缓上下漂移。 |
| itemFiberName | Fiber | 纤维 |
| itemFiberDetail | +3 points. Waits between the pipes; from level 2 it bobs up and down. | +3 分。停在管道之间；从第 2 关起会上下漂浮。 |
| itemProbioticName | Probiotic | 益生菌 |
| itemProbioticDetail | Protects you against bad bacteria for 5 pipes. Subsequent probiotics stack, but hitting a bad bacteria uses them all up. Eat a fiber while it is active to make a postbiotic. From level 3 it moves up and down in the gap. | 在 5 道管道内保护你不受有害细菌伤害。后续益生菌可叠加，但撞到有害细菌会全部用完。生效期间吃到纤维会变成后生元。从第 3 关起它会在管道口之间上下移动。 |
| itemPostbioticName | Postbiotic | 后生元 |
| itemPostbioticDetail | Eat fiber while a probiotic is active and it turns into a postbiotic: every pipe and fiber is worth double (×2) until the probiotic runs out, and every kernel you pick up counts twice. Another probiotic keeps it going; a bad bacteria hit ends it. | 在益生菌生效期间吃到纤维，就会变成后生元：在益生菌结束前，每道管道和每个纤维都得双倍分数（×2），拾取的每粒玉米粒也算两粒。再吃到益生菌可延长时间；撞到有害细菌则立即结束。 |
| itemBacteriaName | Bad bacteria | 有害细菌 |
| itemBacteriaDetail | −3 points. From level 3 it moves up and down in the gap. | −3 分。从第 3 关起它会在管道口之间上下移动。 |
| itemBeanName | Beans | 豆子 |
| itemBeanDetail | Grab a bean, then press the bean button at the bottom (or your poop) to fart past the next 5 pipes: nothing can touch you. A normal fart uses one bean; you can carry 3, and with all three the fart rockets you past 20 in a rainbow glow. | 吃到豆子后，点击底部的豆子按钮（或便便）放屁冲过接下来的 5 道管道，期间什么都碰不到你。普通放屁只用一颗豆子；最多可攒 3 颗，集齐 3 颗再放屁，就能顶着彩虹光芒一口气冲过 20 道管道。 |
| itemCoinName | Kernels | 玉米粒 |
| itemCoinDetail | A golden corn kernel. Kernels go into your purse and can be redeemed for items in the shop. Tap the kernel button under the banner to open the shop in between levels. | 金黄的玉米粒。玉米粒会进入钱袋，可在商店兑换物品。关卡之间点击横幅下方的玉米粒按钮打开商店。 |
| itemMysteryName | Mystery box | 神秘盒子 |
| itemMysteryDetail | Mystery boxes contain a random surprise item. | 神秘盒子里装有随机惊喜道具。 |
| itemToiletName | On the toilet | 如厕模式 |
| itemToiletDetail | Playing on the toilet? Flip the switch under the poop on the home screen. Those scores get a 🚽 next to them. | 在马桶上玩？打开主界面便便下方的开关，这些分数旁会显示 🚽。 |
| itemLevelsName | Levels | 关卡 |
| itemControlsName | Controls | 操作方式 |
| itemControlsDetail | One player: tap or click to flap; the bean button (or the poop) farts. Keyboard: Space or ↑ flaps, B farts, P or Esc pauses. Controller: A flaps, RT farts, Menu pauses. Two players (the 👥 toggle): P1 flaps with W or Space and farts with E or Left Shift; P2 flaps with ↑ or Enter and farts with Right Shift or Numpad 0. A controller (A, RT) or a tap on your half works too. In a level break your fart button (B, RT, E…) opens and closes the shop. | 单人：点击起飞；按豆子按钮（或便便）放屁。键盘：空格或 ↑ 起飞，B 放屁，P 或 Esc 暂停。手柄：A 起飞，RT 放屁，Menu 暂停。双人模式（👥 开关）：玩家 1 用 W 或空格起飞、E 或左 Shift 放屁；玩家 2 用 ↑ 或回车起飞、右 Shift 或小键盘 0 放屁。也可以用手柄（A、RT）或点击你这一侧。过关休息时，放屁键（B、RT、E 等）可打开或关闭商店。 |
| itemTwoPlayerName | Two players | 双人模式 |
| itemTwoPlayerDetail | On a wide screen, flip the 👥 switch under the toilet one and race friends side by side on the same course, two at a time. A crash costs points, not the race; first over each finish line gets +25, and the higher score wins. | 在宽屏上，打开马桶开关下方的👥开关，和朋友两两在同一条赛道上并排比赛。撞到只会扣分，不会输掉比赛；率先冲过每条终点线得25分，最后分高者胜。 |
| itemTournamentName | Tournament | 锦标赛 |
| itemTournamentDetail | Every two-player session is a tournament for 2 to 8 players: two race one Final, more play a knockout bracket you can arrange before the first race. The winners take the podium (🥉 from 3 players); with 3 or more players, those who joined with their user code keep their medals on the 🏅 board. | 双人模式总是锦标赛，支持2到8名玩家：两人只比一场决赛，更多玩家进行淘汰赛，第一场比赛前可以调整对阵。胜者登上领奖台（3名或以上玩家时才有🥉）；3名或以上玩家时，用用户码加入的玩家奖牌会记到🏅榜上。 |
| itemDailyName | Daily Dump | 每日一拉 |
| itemDailyDetail | Tap the 🌞 at the top of the home screen: one try a day on a course everyone shares, endless at the day's level, with no kernels. Your score goes on the 🌞 board; a new course every day at 00:00 UTC. | 点首页顶部的🌞：每天一次机会，所有人飞同一条赛道，按当天的关卡一直飞下去，没有玉米粒。分数记到🌞榜上；每天UTC 00:00换新赛道。 |
| itemInfoName | About | 关于 |
| itemInfoDetail | The i button opens About: the credits, this guide and What's new (the update notes). Key: I. | i按钮打开“关于”：制作名单、本玩法说明和更新说明。按键：I。 |
| itemLanguageName | Language | 语言 |
| itemLanguageDetail | Switch between English and 简体中文. Key: L. | 在English和简体中文之间切换。按键：L。 |
| itemFeedbackName | Feedback | 反馈 |
| itemFeedbackDetail | Report a bug or suggest a feature on GitHub. Key: F. | 在GitHub上报告问题或提出功能建议。按键：F。 |
| itemLeaderboardName | Leaderboard | 排行榜 |
| itemLeaderboardDetail | The top 25 scores. Its 🌞 tab has today's Daily Dump, its 🏅 tab the tournament medals. Tap a name to see that player's profile. Key: T. | 前25名的成绩。🌞页是今天的每日一拉，🏅页是锦标赛奖牌榜。点名字可查看该玩家的资料。按键：T。 |
| itemSettingsName | Settings | 设置 |
| itemSettingsDetail | Sound, haptics (Android only), the bean button's side in landscape, and Reload game to fetch the newest version. Key: S. | 音效、震动（仅限Android）、横屏时豆子按钮的位置，以及“刷新游戏”获取最新版本。按键：S。 |
| itemSoundName | Sound | 声音 |
| itemSoundDetail | Mute or unmute the game. Key: M. On iPhone, Silent mode mutes the game - turn it off to hear sound. | 静音或取消静音。按键：M。 iPhone需关闭静音模式才有声音。 |
| itemLevelsDetail | The gut comes in levels: stomach, duodenum, jejunum and on, down to the rectum. Pass a checkered finish line to clear one; the game pauses for a breather before the next level. Clear the rectum and you win! The bar at the top shows how far you are. | 肠道分成关卡：胃、十二指肠、空肠……一直到直肠。越过黑白格终点线即可过关；游戏会稍作停顿再进入下一关。通过直肠就赢了！顶部的进度条显示你走到了哪里。 |
| updatedPrefix | Updated | 更新于 |
| versionLine | v{version} beta | v{version} 测试版 |
| changelogTitle | WHAT'S NEW | 更新说明 |
| changelogLatest | Latest | 最新版本 |
| changelogPrevious | Previous updates | 历史更新 |
| languageTitle | Language | 语言 |
| langEnglish | English | English |
| langChinese | 简体中文 | 简体中文 |
| feedbackTitle | FEEDBACK | 反馈 |
| feedbackBody | Report a bug or suggest a feature. Opens GitHub in your browser - you need a GitHub account to submit. | 报告问题或提出功能建议。将在浏览器中打开 GitHub——提交需要 GitHub 账号。 |
| bugReport | Bug | 问题反馈 |
| featureRequest | Feature request | 功能建议 |
| feedbackLink | Bug or feature request? | 问题或功能建议？ |
| saveTitle | SAVE / LOAD USER | 存档 / 载入用户 |
| saveIntro | 1. Pick a username and press Save.
2. Copy your user code and keep it somewhere safe (a note, a message to yourself).
3. On another phone or browser, paste it under Load user code: your name and scores follow you, and the leaderboard joins both into one player.
4. To change your username, type a new one and press Save. Devices and browsers that use your user code update to the new name automatically. | 1. 输入用户名并按“保存”。
2. 复制你的用户码，保存在安全的地方（备忘录、发给自己的消息）。
3. 在其他手机或浏览器上，把它粘贴到“载入用户码”：你的名字和分数会跟着你，排行榜也会把两边合并为同一位玩家。
4. 要更改用户名，输入新名字并按“保存”。使用你用户码的其他设备和浏览器会自动更新为新名字。 |
| saveNameLabel | Username | 用户名 |
| saveNamePlaceholder | 4–16 characters | 4–16 个字符 |
| saveYourCode | Save user code | 保存用户码 |
| saveCopy | Copy | 复制 |
| saveCopied | Copied | 已复制 |
| saveLoadLabel | Load user code | 载入用户码 |
| saveLoad | Load | 载入 |
| saveLoadPlaceholder | Paste a code | 粘贴存档码 |
| saveSave | Save | 保存 |
| saveNameSaved | Username saved | 用户名已保存 |
| saveNameShort | Usernames need at least 4 characters (2 in Chinese, Japanese or Korean) | 用户名至少需要4个字符（中文、日文或韩文至少2个） |
| saveNameSpace | Usernames cannot have spaces | 用户名不能包含空格 |
| saveNameEmoji | Usernames cannot have emoji | 用户名不能包含表情符号 |
| saveNameBlocked | Please pick a different username | 请换一个用户名 |
| saveNameLong | Usernames can have at most 16 characters | 用户名最多16个字符 |
| testModeOn | Test mode on — scores won't be saved | 测试模式已开启——分数不会保存 |
| testModeOff | Test mode off | 测试模式已关闭 |
| eduUnlocked | Education mode unlocked: 📚 is on the home screen | 教育模式已解锁：主屏幕上出现了 📚 |
| eduLocked | Education mode locked | 教育模式已锁定 |
| quizRight | Right! | 答对了！ |
| quizRightCoins | Right! +{n} | 答对了！+{n} |
| quizPaidToday | 🌽 already earned today (plan 26, A2: small and muted beside "Right!" when a right answer pays nothing because this card already paid today; each card pays once a local day) | 🌽 今天已经得过了 |
| quizNextSoon | Next review: again soon (plan 26: under the verdict after a wrong answer: the card is due again at once; "review" added in its A2, Michael's wording) | 下次复习：很快 |
| quizNextIn | Next review: in {t} (plan 26: under the verdict, when the card comes back; {t} is one of the wait* strings below) | 下次复习：{t}后 |
| waitMin | {n} min | {n} 分钟 |
| waitHours | {n} h | {n} 小时 |
| waitDay | 1 day | 1 天 |
| waitDays | {n} days | {n} 天 |
| waitMonth | 1 month | 1 个月 |
| waitMonths | {n} months | {n} 个月 |
| waitYear | 1 year | 1 年 |
| waitYears | {n} years | {n} 年 |
| quizPill | Quiz (the won game-over panel's 📚 bonus button) | 答题 |
| reviewPill | Review (an education level break's 📚 button, plan 25: the numbers sit under it) | 复习 |
| breakQuit | Quit (ends the run at a level break; plan 26, A2: the one word for it, cards due or not. "Give up" is gone everywhere: Michael found it too negative) | 结束 |
| breakQuitSure | Quit? Tap again (the first tap arms it for a few seconds; shown when nothing is due, so the run ends as a normal one) | 结束？再点一次 |
| breakQuitDueSure | Quit ungraded? Tap again (the armed label while missed or review cards are still due: quitting then ends the run with no grade. "Ungraded" is 不计成绩, as in the profile's 计分 rows) | 不计成绩结束？再点一次 |
| quizSkip | Skip · {n} 🌽 (plan 26, A2: the right button of an open card in a level break's quiz; it replaced Bury and the level skip. Every Skip costs {n} corn kernels; a missed or review card also waits until tomorrow) | 跳过 · {n} 🌽 |
| quizSkipFree | Skip (the same button in a test run, where it is free) | 跳过 |
| quizSkipWarn | Skipping costs {n} 🌽. Tap Skip again. (the first Skip in a level break shows this in the verdict's place; later ones in that break skip at once) | 跳过要花 {n} 🌽。再点一次“跳过”。 |
| quizSkipWarnDue | Skipping costs {n} 🌽 and sends this card to tomorrow. Tap Skip again. (the same, for a missed or review card) | 跳过要花 {n} 🌽，这张卡片会推到明天。再点一次“跳过”。 |
| quizSkipNoCoins | Skipping costs {n} 🌽: not enough corn yet. (a press on a dimmed Skip when the purse is short) | 跳过要花 {n} 🌽：玉米粒还不够。 |
| quizSkipCap | You have skipped {n} due cards today: answer this one, or come back tomorrow. ({n} is education.buryPerDay, 3; a press on a dimmed Skip on a missed or review card once the day's are used) | 今天已经跳过 {n} 张到期的卡片：答这一张，或者明天再来。 |
| quizWrong | Not quite: the right answer has a ✓ | 不太对：正确答案标有 ✓ |
| quizWhy | Why? | 为什么？ |
| quizNext | Next Card (plan 26, Michael's word: the quiz card's way forward, bottom row right) | 下一张 |
| quizReturn | End Review (plan 26, Michael's word: the quiz card's way out in a break or the bonus quiz, bottom row left; it closes the quiz) | 结束复习 |
| quizKeepPracticing | Keep practicing (plan 26: on "You're all caught up!", asks cards that are not due yet; since plan 26's A2 a right answer in a level break pays once per card a local day, as every card does (nothing in the bonus quiz), and leaves the schedule alone; a wrong one moves it as usual) | 继续练习 |
| quizStatsTitle | This run | 本局 |
| eduCardsTitle | Your cards | 你的卡片 |
| quizCountsTitle | Waiting in this quiz (the title of the card a tap on a quiz card's numbers opens: the 🔵 🔴 🟢 lines with this quiz's counts) | 本次答题还剩 |
| eduCardsNew | 🔵 {n} new (not seen yet) | 🔵 {n} 张新卡（还没见过） |
| eduCardsMissed | 🔴 {n} missed (due now) (plan 26 A2, Michael's wording: a card answered wrong and not yet right since; it is due again at once and asked until it is right, as Anki's relearning cards; red, as Anki shows them) | 🔴 {n} 张答错（现在到期） |
| eduCardsReview | 🟢 {n} to review (due today) (plan 26 A2: Michael wrote "due soon" and chose "due today" when told the number counts only cards due now, which hold a break's gate) | 🟢 {n} 张待复习（今天到期） |
| eduCardsSeen | 👁️ Seen {n} of {total} cards | 👁️ 已见过 {n} / {total} 张卡片 |
| eduCardsDue | The number on 📚 = # of cards to review (Michael's wording, 13 Nov: the gold number counts missed + to review; # stands for that number) | 📚 上的数字 = 待复习的卡片数 |
| quizCaughtUp | You're all caught up! New cards come with the next level, up to {n} a day, and old ones come back when they are due. ({n} is education.newPerDay, plan 26) | 全部完成！下一关会有新卡片（每天最多 {n} 张），旧卡片到期后会再出现。 |
| quizGeneral | Gut microbes | 肠道微生物 |
| quizSource | Source: {source} | 来源：{source} |
| quizLearnMore | 📄 Learn more 🔗 (plan 26: under a quiz card's explanation; opens the card's first reference, by its DOI, in a new tab) | 📄 了解更多 🔗 |
| reviveHeader | Crashed! Answer to fly on | 撞到了！答对继续飞 |
| reviveStreakHeader | Win back your coins and power-ups | 赢回金币和道具 |
| reviveBack | Right! You're back in. | 答对了！可以继续飞了。 |
| reviveChoice | Answer {n} more in a row to win back your coins and power-ups. | 再连续答对 {n} 题，赢回金币和道具。 |
| reviveContinue | Fly on | 继续飞 |
| reviveStreakGo | Go for it | 试试看 |
| reviveRestored | All back: coins and power-ups! | 金币和道具全部找回！ |
| reviveStreakMiss | Missed, but you're still back in. | 没答对，但你仍可继续飞。 |
| reviveOver | Out of tries: game over. | 机会用完了：游戏结束。 |
| reviveEnd | End run | 结束本局 |
| reviveQuit | Quit (a revive's way out before the first right answer; it was "Give up" until plan 26's A2) | 结束 |
| reviveQuitSure | Quit? Tap again (the button's label after its first press on a card) | 结束？再点一次 |
| reviveQuitWarn | Quitting ends this run, and its progress is lost. Tap Quit again to end it. (plan 26, A2: shown on the first press of Quit on every card of a revive, in the verdict's place; the button is then held a moment) | 结束会终止这一局，本局的进度也会丢失。再点一次“结束”即可。 |
| reviveFree | No questions left: you're back in. | 没有题了：可以继续飞了。 |
| eduNotSaved | Education runs are not on the 🏆 boards | 教育模式的成绩不上 🏆 排行榜 |
| saveEduData | 📚 Education data | 📚 教育数据 |
| eduIntroTitle | 📚 Education mode (plan 26: the popup the 📚 switch and glyph open) | 📚 教育模式 |
| eduIntroBeta | Beta: the cards are still being checked. If one looks wrong, tap the 🚩 by its code to tell us. | 测试版：卡片仍在核对中。如果发现有误，请点卡片编号旁的 🚩 告诉我们。 |
| eduIntroHowTitle | How it works | 玩法 |
| eduIntroHowLevels | Each level break asks cards about the part of the gut you just flew through. Cards you missed, and cards due for review, must be answered right before you fly on. | 每次关卡休息时，会问你刚飞过的那段肠道的卡片。答错的卡片和到期要复习的卡片，答对之后才能继续飞。 |
| eduIntroHowRevive | Crash, and a card is your way back: ❤️ three tries to get one right, then ⭐ three in a row to win back your coins and power-ups. | 撞到了？答对卡片就能继续：❤️ 有三次机会答对一张，然后连续答对 ⭐ 三张，就能赢回金币和道具。 |
| eduIntroHowSkip | Stuck on a card at a break? Skip it for a few 🌽 (a missed or review card waits until tomorrow), or quit the run. (plan 26, A2: Skip replaced Bury) | 在休息时卡在一张卡片上？花几个 🌽 跳过它（答错卡和待复习卡会推到明天），或者结束这一局。 |
| eduIntroHowCoins | Right answers in a level break earn you corn kernels. Cards are automatically ordered to be shown right before you're likely to forget them. (plan 26 A2: Michael's wording, as written) | 在关卡休息时答对会得到玉米粒。卡片会自动排序，在你快要忘记之前出现。 |
| eduIntroChoices | Your choices (the heading over the start level and the new-card order) | 你的选择 |
| eduIntroStart | Start at (◀ LV n ▶ follows: the level the next education run starts at) | 从这一关开始 |
| eduIntroStartLocked | Reach a level in an education run to start there next time. | 在教育模式中到达某一关后，下次就能从那里开始。 |
| eduIntroOrder | New cards (a heading over three choices: before, mixed in with, or after the cards due) | 新卡片 |
| eduOrderBefore | Before reviews | 先学新卡 |
| eduOrderMixed | Mixed in | 穿插 |
| eduOrderAfter | After reviews (the default) | 先复习 |
| eduOrderBeforeHint | New cards come first, before the missed and review cards a level break waits for. (plan 26 A2: the line under the three new-card buttons while "Before reviews" is pressed; a level break holds until its missed and review cards are answered) | 新卡片先出现，排在关卡休息要等你答完的答错卡和待复习卡之前。 |
| eduOrderMixedHint | New cards are mixed in with the missed and review cards. (the same line while "Mixed in" is pressed) | 新卡片和答错卡、待复习卡穿插出现。 |
| eduOrderAfterHint | New cards come once the missed and review cards are answered. (the same line while "After reviews" is pressed) | 答完答错卡和待复习卡之后，才会出现新卡片。 |
| eduIntroPerDay | Up to {n} new cards a day. ({n} is education.newPerDay) | 每天最多 {n} 张新卡片。 |
| eduIntroDevice | Your data is stored locally on your device in the browser, not on our servers, unless you choose to share it. (plan 26 A2: Michael's wording plus "unless you choose to share it", his choice, since Share my grades and the tester pilot do send data; the 📚 Education data link follows) | 你的数据保存在这台设备的浏览器里，不在我们的服务器上，除非你选择分享。 |
| eduIntroPlay | Play (starts an education run from the popup) | 开始 |
| eduIntroClose | Close | 关闭 |
| eduDataTitle | 📚 Education data | 📚 教育数据 |
| eduDataIntro | Education mode keeps your answers, grades and badges on this device. Nothing leaves it unless you choose to share below. | 教育模式的答题记录、成绩和徽章都保存在这台设备上。除非你在下面选择分享，否则不会离开设备。 |
| eduDataAdult | I am 18 or older | 我已年满 18 岁 |
| eduShareTitle | Share my grades | 分享我的成绩 |
| eduShareBody | Puts your username, your average grade, the number of graded runs and your education badges on the 📚 board, where players with education mode can see them. Your answers are not shared, and this is not research. Stopping deletes it from the board at once. | 把你的用户名、平均成绩、计分局数和教育徽章放到 📚 排行榜上，开启教育模式的玩家都能看到。不会分享你的具体答题，这也不是研究。停止分享会立即从榜上删除。 |
| eduShareOn | Sharing is on. | 正在分享。 |
| eduShareOff | Sharing is off. | 未分享。 |
| eduShareStop | Stop sharing | 停止分享 |
| eduShareNeedName | Save a username first: tap the user button on the home screen. | 请先保存用户名：点首页的用户按钮。 |
| eduShareNeedAdult | Sharing is for adults: tick the box if you are 18 or older. | 仅限成年人分享：如果你已年满 18 岁，请勾选上面的选项。 |
| eduShareClosed | Sharing is not open yet. It opens soon. | 分享功能尚未开放，敬请期待。 |
| eduShareNameTaken | Another player holds this username. Pick another one, or load your user code. | 这个用户名已被其他玩家使用。请换一个，或载入你的用户码。 |
| eduShareOffline | Couldn't reach the board. Try again in a moment. | 无法连接排行榜，请稍后再试。 |
| eduShareStarted | Your grades are going to the 📚 board. | 你的成绩正在上传到 📚 排行榜。 |
| eduShareStopped | Sharing stopped: your grades are off the board. | 已停止分享：你的成绩已从榜上删除。 |
| eduShareStopOffline | Couldn't reach the board, so your grades are still on it. Try again. | 无法连接排行榜，你的成绩仍在榜上。请再试一次。 |
| eduBoardTitle | EDUCATION | 教育榜 |
| eduBoardGrade | Grade | 成绩 |
| eduBoardRuns | Runs | 局数 |
| eduBoardEmpty | No grades shared yet | 还没有人分享成绩 |
| eduBoardYou | You: #{rank} of {total} · {grade} % | 你：第{rank}名 / 共{total}人 · {grade} % |
| eduBoardShare | Share my grades to join › | 分享我的成绩即可上榜 › |
| eduBoardMore | {n} more graded runs to appear on the board | 再完成 {n} 局计分局即可上榜 |
| eduBoardQueued | Your grades are on their way to the board | 你的成绩正在上传 |
| statsEduShared | On the 📚 board | 在 📚 榜上 |
| statsEduSharedOn | Shared › | 已分享 › |
| statsEduSharedOff | Not shared › | 未分享 › |
| eduPilotTitle | 🔬 Tester data | 🔬 测试数据 |
| eduPilotBody | For invited testers. This tests the tools only: no research is being done with it. Your answers are not analysed, and they are deleted before any study starts. If you join, each answer you give in education mode is sent (the card, what you picked, right or wrong, how long it took) under a random id, never your username. | 仅限受邀测试者。这只是在测试工具：不会用它做任何研究。你的答题不会被分析，并会在任何研究开始前删除。加入后，你在教育模式里的每次答题（哪张卡片、你选了什么、对或错、用时多久）都会以随机编号发送，绝不带你的用户名。 |
| eduPilotMore | What is collected, and how to withdraw | 收集哪些内容，以及如何退出 |
| eduPilotCode | Invite code | 邀请码 |
| eduPilotJoin | Join | 加入 |
| eduPilotOn | You are in the tester pilot. | 你已加入测试。 |
| eduPilotOff | You are not in the tester pilot. | 你未加入测试。 |
| eduPilotStale | The notice changed: join again to keep sending, or withdraw. | 测试说明已更新：重新加入以继续发送，或退出。 |
| eduPilotLeave | Withdraw and delete my data | 退出并删除我的数据 |
| eduPilotNeedAdult | The pilot is for adults: tick the box if you are 18 or older. | 测试仅限成年人：如果你已年满 18 岁，请勾选上面的选项。 |
| eduPilotNeedCode | Type the invite code you were given. | 请输入你收到的邀请码。 |
| eduPilotBadCode | That code is not right. | 邀请码不正确。 |
| eduPilotClosed | The pilot is not open at the moment. | 测试目前未开放。 |
| eduPilotOffline | Couldn't reach the server. Try again in a moment. | 无法连接服务器，请稍后再试。 |
| eduPilotJoined | You are in: answers you give from now on are sent. | 已加入：从现在起你的答题会被发送。 |
| eduPilotLeft | Withdrawn: your answers were deleted from the server. | 已退出：你的答题已从服务器删除。 |
| eduPilotLeaveOffline | Couldn't reach the server, so your answers are still there. Try again. | 无法连接服务器，你的答题仍在服务器上。请再试一次。 |
| eduPilotEnded | The server no longer has you in the pilot: this device stopped sending. | 服务器上已没有你的测试记录：此设备已停止发送。 |
| statsEduPilot | Tester pilot | 测试计划 |
| statsEduPilotOn | Joined › | 已加入 › |
| saveClearNoteShared | Your shared grades stay on the 📚 board until you stop sharing in 📚 Education data. | 你分享的成绩会留在 📚 榜上，除非先在“📚 教育数据”里停止分享。 |
| saveClearNotePilot | The answers you sent as a tester stay on the server until you withdraw in 📚 Education data. | 你作为测试者发送的答题会留在服务器上，除非先在“📚 教育数据”里退出测试。 |
| saveWelcome | Welcome back, {name} — {scores} | 欢迎回来，{name}——{scores} |
| saveWelcomeNoScores | Welcome back, {name} | 欢迎回来，{name} |
| saveNameRequired | Enter a username first (4–16 characters) | 请先输入用户名（4–16 个字符） |
| saveErrorDamaged | Save code is damaged or was edited | 存档码已损坏或被修改 |
| saveErrorUnrecognised | Unrecognised save code | 无法识别的存档码 |
| saveNameChecking | Checking the leaderboard… | 正在查询排行榜… |
| saveNameTaken | That username is taken. If it's yours, copy your user code on the device where you set it and paste it here under Load user code. Otherwise pick another name. | 这个用户名已被使用。如果是你的，请在设置它的那台设备上复制用户码，然后粘贴到这里的“载入用户码”。否则请换一个名字。 |
| saveNameOffline | Username saved on this device (couldn't check the leaderboard) | 用户名已保存在此设备（无法连接排行榜核对） |
| saveClear | Clear | 清除 |
| saveClearConfirm | Copy your user code first: without it this username and its scores can't come back. Tap Clear again to sign out. | 请先复制你的用户码：没有它，这个用户名和分数就找不回来了。再点一次“清除”即可退出。 |
| saveCleared | Signed out: this device has no username now | 已退出：此设备现在没有用户名 |
| saveMerged | Welcome back, {name} — this device is now part of your player | 欢迎回来，{name}——这台设备现已并入你的玩家账号 |
| shareButton | Share | 分享 |
| shareCardPlay | Play: {url} | 来玩：{url} |
| testRunNotSaved | Test run — score not saved | 测试局——分数未保存 |
| playAgain | Play again | 再玩一次 |
| newPersonalBest | 🎉 New personal best! | 🎉 新的个人最佳！ |
| scoresEmpty | No scores yet | 暂无分数 |
| leaderboardTitle | LEADERBOARD | 排行榜 |
| leaderboardLoading | Loading… | 加载中… |
| leaderboardOffline | Can't reach the leaderboard | 无法连接排行榜 |
| leaderboardJoin | Tap Load user on the home screen to set a username and join | 在首页点“载入用户”设置用户名即可上榜 |
| leaderboardRank | Your best {score} is #{rank} of {total} | 你的最高分 {score} 排在第 {rank} 名（共 {total} 人） |
| leaderboardNotYet | Your best is not on the board yet | 你的最高分尚未上榜 |
| leaderboardNameTaken | Your username belongs to another player: tap your name on the home screen to fix it | 你的用户名属于另一位玩家：请在首页点你的名字处理 |
| leaderboardLevel | LV | 关卡 |
| medalBoardTitle | MEDAL BOARD | 奖牌榜 |
| medalBoardBest | BEST RACE | 单场最佳 |
| medalBoardEmpty | No medals yet: finish a tournament to start the board | 还没有奖牌：完成一届锦标赛就能上榜 |
| medalBoardJoin | Join a tournament with your user code to get on this board | 用你的用户码参加锦标赛，就能上这个榜 |
| medalBoardYou | You: #{rank} · {events} tournaments | 你：第 {rank} 名 · 参赛 {events} 届 |
| saveLeaderboardNote | Your username, scores, stats and achievements are public | 你的用户名、成绩、统计数据和成就都是公开的 |
| loadUserButton | Load user | 载入用户 |
| versusTitle | 2 PLAYERS | 双人模式 |
| versusPlayer | P{n} | 玩家{n} |
| versusJoinPrompt | press your flap button | 按下你的起飞键 |
| versusJoinReady | ready! | 准备好了！ |
| versusJoinHint | Keyboard: W / Space or ↑ / Enter · a controller · tap your half | 键盘：W / 空格 或 ↑ / 回车 · 手柄 · 点击你这一侧 |
| versusGo | GO! | 出发！ |
| versusWins | {name} WINS! | {name} 获胜！ |
| versusDraw | DRAW | 平局 |
| versusNotSaved | Races are not saved to the 🏆 board | 比赛分数不会记到 🏆 榜上 |
| versusEscaped | Made it out! | 顺利排出！ |
| versusWaiting | Waiting for {name}… | 等待{name}… |
| versusTapReady | Tap when ready | 准备好了就点一下 |
| versusReadyWaiting | Ready! Waiting for {name}… | 已准备！等待{name}… |
| tournamentContinue | Continue | 继续 |
| tournamentByDeaths | Fewer crashes | 撞得更少 |
| tournamentByLevelWins | More finish lines first | 率先过线的关卡更多 |
| tournamentByFinalFirst | First across the line | 率先冲过终点线 |
| tournamentTitle | 🏅 TOURNAMENT | 🏅 锦标赛 |
| tournamentPlayers | Players | 人数 |
| tournamentPaste | Paste code | 粘贴用户码 |
| tournamentGuest | Guest | 访客 |
| tournamentMe | Use my player | 用我的玩家 |
| tournamentAdd | Add | 添加 |
| tournamentStart | Start | 开始 |
| tournamentDuplicate | That player already has a spot | 这位玩家已经在名单里了 |
| tournamentNeedName | Set a username first (Load user on the home screen) | 请先设置用户名（首页的“载入用户”） |
| tournamentGuestTag | (guest) | （访客） |
| tournamentHostTag | (you) | （我） |
| tournamentVs | vs | 对 |
| tournamentPlay | Play | 开赛 |
| tournamentAbandon | Abandon | 放弃 |
| tournamentAbandonConfirm | Tap Abandon again to end the tournament: nothing is saved | 再点一次“放弃”结束锦标赛：不会保存任何结果 |
| tournamentQuarter | QUARTER-FINAL | 四分之一决赛 |
| tournamentSemi | SEMI-FINAL | 半决赛 |
| tournamentBronze | BRONZE MATCH | 铜牌赛 |
| tournamentFinal | FINAL | 决赛 |
| tournamentPodium | PODIUM | 领奖台 |
| tournamentNew | New tournament | 再来一届 |
| tournamentBracket | Bracket | 赛程 |
| tournamentHowTitle | How a tournament works | 锦标赛怎么玩 |
| tournamentHowBody | 2 to 8 players race two at a time on this screen, knockout style: win to move on. Two players race one Final.
Add each player by pasting their user code, as a guest, or with your own player. Before the first race, drag a player, use ↑ ↓ or 🎲 to choose who meets whom.
Races are shorter than a normal run. The higher score wins; a tie goes to fewer crashes, then more finish lines crossed first, then whoever crossed the last line first. When both players wait at a finish line, 🏅 Bracket shows the draw.
The winners take the podium 🥇 🥈 (and 🥉 from 3 players). With 3 or more players, those who joined with their user code get their medals on the 🏅 board; guests aren't saved. | 2 到 8 名玩家在这台设备上两两比赛，淘汰制：赢了才能晋级。两名玩家只比一场决赛。
添加玩家：粘贴他们的用户码、选“访客”，或“用我的玩家”。第一场比赛前，拖动玩家、用 ↑ ↓ 或 🎲 决定谁对谁。
每场比赛比平常短。得分高者胜；平分时撞得少的胜，再看谁率先过线的关卡更多，最后看谁先冲过最后一条终点线。两人都在终点线等候时，点 🏅 赛程 可查看对阵。
胜者登上领奖台 🥇 🥈（3 名或以上玩家时还有 🥉）。3 名或以上玩家时，用用户码加入的玩家，奖牌会记到 🏅 榜上；访客不会保存。 |
| tournamentGotIt | Got it | 知道了 |
| dailyTitle | 🌞 DAILY DUMP | 🌞 每日一拉 |
| dailyToday | Today's course: {level} | 今日赛道：{level} |
| dailyBody | One try a day. Everyone flies the same course today, and it never ends: go as far as you can. No kernels, no shop. Compare scores on the 🌞 leaderboard; a new course starts every day at midnight UTC. | 每天只有一次机会。
今天所有人飞同一条赛道，
而且没有尽头：能飞多远就飞多远。
没有玉米粒，也没有商店。
在🌞排行榜上比分数；
每天UTC午夜换一条新赛道。 |
| dailyCreateUser | Create user | 创建用户 |
| dailyPlay | Play | 开始 |
| dailyChecking | Checking… | 检查中… |
| dailySeeResult | See today's result | 查看今日成绩 |
| dailyPractice | Practice | 练习 |
| dailyNeedName | Pick a username first: your score goes on the 🌞 board under it. | 先取一个用户名：你的分数会以这个名字记到🌞榜上。 |
| dailyPracticeNote | Test mode: practice runs are not saved and do not use up the day. | 测试模式：练习不会保存，也不会用掉今天的机会。 |
| dailyNext | Next Daily Dump in {time} | 下一次每日一拉：{time}后 |
| dailyOverTitle | DAILY DUMP · {day} | 每日一拉 · {day} |
| dailyRank | 🏆 #{rank} of {total} | 🏆 第{rank}名 / 共{total}人 |
| dailyRankLoading | Rank… | 排名… |
| dailyRankQueued | Posts when online | 联网后上传 |
| dailyRankNameTaken | Name taken | 名字已被占用 |
| dailyRankRejected | Not saved | 未保存 |
| dailyRankUnavailable | Rank unavailable | 暂无排名 |
| dailyBoardTitle | DAILY DUMP | 每日一拉 |
| dailyBoardEmpty | No one has played today's Daily Dump yet | 今天还没有人玩每日一拉 |
| dailyBoardJoin | Play today's Daily Dump from the 🌞 on the home screen | 在首页点🌞玩今天的每日一拉 |
| dailyBoardYou | You: #{rank} of {total} · {score} | 你：第{rank}名 / 共{total}人 · {score} |
| tournamentSaving | Saving medals… | 正在保存奖牌… |
| tournamentSaveSent | Medals saved to the 🏅 board | 奖牌已记到 🏅 榜 |
| tournamentSaveLater | Medals saved on this device: they post when you're online | 奖牌已存在本设备：联网后自动上传 |
| tournamentSaveRejected | Couldn't save this tournament's medals | 无法保存这届锦标赛的奖牌 |
| tournamentSaveNone | No one joined with a user code: no medals to save | 没有人用用户码加入：没有奖牌要保存 |
| tournamentSeedHint | Drag a player or use ↑ ↓ to choose who meets whom | 拖动玩家或用 ↑ ↓ 决定谁对谁 |
| tournamentShuffle | 🎲 Shuffle | 🎲 重新抽签 |
| tournamentMoveUp | Move up | 上移 |
| tournamentMoveDown | Move down | 下移 |
| tournamentBye | bye: goes straight through | 轮空：直接晋级 |
| tournamentBack | Back to the race | 回到比赛 |
| tournamentBracketPill | 🏅 Bracket | 🏅 赛程 |
| tournamentSaveTwo | Two-player tournaments aren't saved to the 🏅 board | 双人锦标赛不会记到 🏅 榜上 |
| versusUnreadyHint | Tap again to un-ready | 再点一次可取消准备 |

### aboutCredits (English)

```
Code: JavaScript / Phaser 4.2.1 (MIT)
Art: Michael Sieler
Death fart: MacKaffee (Freesound / Pixabay)
Power fart: "fart sound effect (reed)" (Pixabay)
New level: "Shine 11" by BenKirb (Pixabay)
Coin: "Drop Coin" by freesound_gamestudio (Pixabay)
Purchase: "Coin Drop" by Universfield (Pixabay)
Shop: "Money Bag" by PhilSavlem (Pixabay)
Thanks to Tori Schummer and Niklas Werner for help with ideation and testing
Inspired by Flappy Bird
```

### aboutCredits (zh-Hans)

```
代码：JavaScript / Phaser 4.2.1（MIT）
美术：Michael Sieler
死亡屁声：MacKaffee（Freesound / Pixabay）
放屁冲刺音效："fart sound effect (reed)"（Pixabay）
新关卡音效："Shine 11"，BenKirb（Pixabay）
金币音效："Drop Coin"，freesound_gamestudio（Pixabay）
购买音效："Coin Drop"，Universfield（Pixabay）
商店音效："Money Bag"，PhilSavlem（Pixabay）
感谢 Tori Schummer 和 Niklas Werner 协助构思和测试
灵感来自 Flappy Bird
```
| achScore10 | Tiny Plop | 小小一坨 |
| achScore100 | Century Stool | 百分便便 |
| achScore250 | On a Roll | 势如破竹 |
| achScore500 | Express Transit | 一泻千里 |
| achScore1000 | Royal Flush | 王者冲水 |
| achWin | Made It Out | 成功脱出 |
| achToiletWin | Porcelain Throne | 马桶王座 |
| achGames | Regular | 规律达人 |
| achDeaths | Thousand Flushes | 千次冲走 |
| achFarts | Windbreaker | 放屁大王 |
| achSuperFarts | Rainbow Blast | 彩虹屁 |
| achFiber | Fiber Fanatic | 纤维狂热 |
| achProbiotic | Probiotic Pro | 益生菌达人 |
| achPostbiotic | Postbiotic Alchemist | 后生元炼金师 |
| achBacteria | Germ Magnet | 细菌磁铁 |
| achBeans | Bean Counter | 数豆达人 |
| achMystery | Unboxer | 开箱达人 |
| achCoins | Corn Hoarder | 玉米囤囤 |
| achDescScore | Score {n} in one run | 单局得分达到 {n} |
| achDescLevel | Reach level {n} in one run | 单局到达第 {n} 关 |
| achDescWin | Clear the rectum and make it out | 通过直肠，成功脱出 |
| achDescToiletWin | Make it out with toilet mode on | 开启马桶模式并成功脱出 |
| achDescGames | Play {n} runs (Daily Dumps count) | 游玩 {n} 局（每日一拉也算） |
| achDescDeaths | Crash {n} times | 撞毁 {n} 次 |
| achDescFarts | Fart {n} times | 放屁 {n} 次 |
| achDescSuperFarts | Fire {n} super farts | 放出 {n} 次超级屁 |
| achDescCollect | Collect {n} {glyph} | 收集 {n} 个 {glyph} |
| achDescBacteria | Bump into {n} 🦠 | 碰到 {n} 个 🦠 |
| achDescPostbiotic | Make {n} postbiotics ✨ | 制造 {n} 次后生元 ✨ |
| achDescMystery | Open {n} mystery boxes 📦 | 打开 {n} 个神秘盒子 📦 |
| overBadges | 🏆 New: {badges} | 🏆 新成就：{badges} |
| overBadgesMore | +{n} | 等另外 {n} 个 |
| statsSingle | Singleplayer | 单人模式 |
| statsGames | Games played | 游玩局数 |
| statsWins | Made it out | 成功脱出 |
| statsMaxLevel | Highest level | 最高关卡 |
| statsAvgLevel | Average level | 平均关卡 |
| statsAvgScore | Average score | 平均得分 |
| statsDaily | Daily Dump 🌞 | 每日一拉 🌞 |
| statsDumps | Daily Dumps played | 参加次数 |
| statsPodiums | Podiums | 领奖台 |
| statsTournament | Tournaments 🏅 | 锦标赛 🏅 |
| statsEvents | Tournaments played | 参赛次数 |
| statsMedals | Medals | 奖牌 |
| statsRival | Biggest rival | 最大对手 |
| statsRivalLine | {name} · lost {losses} of {meetings} | {name} · {meetings} 场输 {losses} 场 |
| statsCareer | Career | 生涯 |
| statsAchievements | Achievements {n} / {total} | 成就 {n} / {total} |
| statsAchievementsOther | Achievements ({n}) | 成就（{n}） |
| statsNoBadges | No achievements yet | 还没有成就 |
| statsTapBadge | Tap an emoji or a badge to see what it is | 点击表情或徽章查看说明 |
| statsEarned | earned {day} | 获得于 {day} |
| statsQuestOpen | open until {day} | 截止 {day} |
| statsNotFound | No stats for {name} yet | 还没有 {name} 的数据 |
| statsOfflineOwn | Offline: this device's numbers only | 离线：只显示本设备的数据 |
| saveProfile | 👤 Profile | 👤 个人资料 |
| statsBestScore | Highest score | 最高分 |
| careerPipes | Number of pipes passed | 穿过的管道数 |
| careerFarts | Every bean power you fired, super farts included | 放屁次数（超级屁也算） |
| careerSuperFarts | Super farts (three beans in the bag) | 超级屁（攒满三颗豆子） |
| careerFiber | Fiber eaten | 吃到的纤维 |
| careerProbiotic | Probiotics picked up | 拿到的益生菌 |
| careerPostbiotic | Postbiotic (Probiotic + Fiber) | 后生元（益生菌 + 纤维） |
| careerBacteria | Bad bacteria bumped into | 碰到的有害细菌 |
| careerBean | Beans collected | 收集的豆子 |
| careerMystery | Mystery boxes opened | 打开的神秘盒子 |
| careerCoin | Corn kernels (coins) | 玉米粒（金币） |
| careerDeaths | Deaths | 死亡次数 |
| statsCardTotal | Total: {n} | 累计：{n} |
| statsGateTitle | Profiles 👤 | 个人资料 👤 |
| statsGateBody | Create a user to see profiles: stats, medals and achievements. Your runs are already counting. | 创建用户即可查看个人资料：统计、奖牌和成就。你的每一局已经在计数了。 |
| splashTip | TIP | 小提示 |
| splashNew | NEW | 新功能 |
| splashLoading | Loading… | 加载中… |
| splashContinue | Continue | 继续 |
| splashPrev | Previous card | 上一张 |
| splashNext | Next card | 下一张 |
| splashProfile | Your profile shows your stats and achievements. Tap a name on the leaderboard to see theirs. | 你的个人资料会显示数据和成就。在排行榜上点名字，就能看别人的。 |
| splashDaily | Daily Dump: one try a day on the same course as everyone. | 每日一拉：每天一次机会，和所有人飞同一条赛道。 |
| splashTournament | Tournaments: up to 8 players, one bracket, one device. | 锦标赛：最多 8 名玩家，一张对阵表，一台设备。 |
| splashShop | Spend corn kernels in the shop between levels. | 关卡之间可以在商店花掉玉米粒。 |
| splashFiber | Fiber is worth +3. Grab it between pipes. | 纤维 +3 分，在管道之间吃到它。 |
| splashBacteria | Bad bacteria cost 3 points. | 碰到有害细菌扣 3 分。 |
| splashProbiotic | A probiotic blocks one bad bacteria hit for 5 pipes. | 益生菌能挡住一次有害细菌，持续 5 道管道。 |
| splashPostbiotic | Eat fiber while a probiotic is up: pipes and fiber score ×2. | 益生菌生效时吃到纤维：管道和纤维得分 ×2。 |
| splashBean | A bean charges a fart. You can carry three. | 一颗豆子可以充能一次放屁，最多带 3 颗。 |
| splashFart | Tap the poop or the bean button to fart past 5 pipes. | 点便便或豆子按钮放屁，冲过 5 道管道。 |
| splashSuperFart | Three beans make a super fart: 20 pipes, and you cannot die. | 集齐 3 颗豆子放超级屁：冲过 20 道管道，而且不会死。 |
| splashMystery | Mystery boxes contain random objects with different probabilities. | 神秘盒子里装着随机道具，每种的概率不同。 |
| splashCoin | Corn kernels are coins. They last one run, so spend them. | 玉米粒就是金币，只在本局有效，记得花掉。 |
| splashToilet | Playing on the toilet? Turn on Toilet mode. The leaderboard keeps your best on and off the toilet. | 在马桶上玩？打开“如厕模式”。排行榜会分别记录你如厕和不如厕时的最高分。 |
| splashRectum | Level 7 is the rectum. Cross the finish line to 'make it out'. | 第 7 关是直肠。冲过终点线，就能“成功脱出”。 |
| splashLeaderboard | The leaderboard shows the Top 25, with tabs for the Daily Dump 🌞 and tournaments 🏅. | 排行榜显示前 25 名，还有每日一拉 🌞 和锦标赛 🏅 两个分页。 |
| splashTwoPlayer | Toggle 👥 on to play multiplayer mode up to 8 players. | 打开 👥 开关，就能玩多人模式，最多 8 名玩家。 |
| splashUserCode | Your user code moves your name and scores to another phone. | 用户码能把你的名字和分数带到另一部手机上。 |
| splashController | On desktop, you can play with a game controller. | 在电脑上，可以用游戏手柄来玩。 |
| careerFalls | Long falls | 长距离下坠 |
| careerCloseCalls | Close calls | 擦身而过 |
| overCardRun | This run: {n} | 本局：{n} |
| achSkyDiver | Sky Diver | 高空跳伞 |
| achCloseShave | Close Shave | 千钧一发 |
| achIbs | IBS | 肠易激 |
| achConstipated | Constipated | 便秘 |
| achIcarus | Icarus | 伊卡洛斯 |
| achFourOfAKind | Four of a Kind | 四条 |
| achGambling | Let's Go Gambling | 来赌一把 |
| achDescFalls | Free fall {n} times | 自由落体 {n} 次 |
| achDescCloseShave | In one level, have as many close calls as it has pipes | 在一关里擦身而过的次数达到这一关的管道数 |
| achDescIbs | Make it out more than 21 times in 7 days | 7 天内成功脱出超过 21 次 |
| achDescConstipated | Play again after a week-long break | 隔了一周以上再玩一局 |
| achDescCeiling | Hit the ceiling {n} times | 撞到顶部 {n} 次 |
| achDescFourOfAKind | Open four mystery boxes in a row with the same reward | 连续 4 个神秘盒子开出同样的奖励 |
| achDescBoxesBought | Buy {n} mystery boxes in the shop | 在商店买 {n} 个神秘盒子 |
| achEduNerd | Nerd Alert | 学霸警报 |
| achEduPerfect | Full Marks | 满分 |
| achEduA | A Student | 优等生 |
| achEduB | B Student | 良好生 |
| achEduC | C's Get Degrees | 六十分万岁 |
| achEduDropOut | Drop Out | 退学 |
| achEduAngel | Angel Baby | 小天使 |
| achEduPhoenix | Phoenix | 凤凰 |
| achDescEduNerd | Get {n} perfect runs in a row, each a win from level 1 ({min} answers or more) | 连续 {n} 局全部答对，每局都从第 1 关打到通关（至少答 {min} 题） |
| achDescEduPerfect | Answer everything right in a run you win from level 1 ({min} answers or more; plan 25: a run started later or skipped ahead does not count) | 从第 1 关打到通关，全部答对（至少答 {min} 题） |
| achDescEduA | Get 90% or more right in one run ({min} answers or more, without quitting) | 一局答对 90% 以上（至少答 {min} 题，中途结束不算） |
| achDescEduB | Get 80–89% right in one run ({min} answers or more, without quitting) | 一局答对 80–89%（至少答 {min} 题，中途结束不算） |
| achDescEduC | Get 70–79% right in one run ({min} answers or more, without quitting) | 一局答对 70–79%（至少答 {min} 题，中途结束不算） |
| achDescEduDropOut | Quit a run without answering a single question (a revive's Quit, or the break's Quit, with no card answered) | 一题没答就结束这一局 |
| achDescEduRevives | Revive yourself {n} times in education mode | 在教育模式中复活 {n} 次 |
| statsEducation | 📚 Education {n} / {total} | 📚 教育 {n} / {total} |
| statsEduGrade | Average grade | 平均成绩 |
| statsEduRuns | Graded runs | 计分局数 |
| statsEduStreak | 🔥 Learning streak (plan 26, A2: your own profile's 📚 section; the local days in a row with at least one card answered in an education run; the value is in days, waitDay / waitDays) | 🔥 连续学习 |
| statsEduBest | ❤️‍🔥 Longest streak (the most such days in a row ever) | ❤️‍🔥 最长连续 |
| statsEduLevel | Highest level unlocked (the highest level an education run has continued into, which a run may start at; not the single-player "Highest level", statsMaxLevel, which counts levels reached) | 已解锁的最高关卡 |
| careerDethroned | Dethroned: took 1st place from someone | 夺冠：从别人手里抢下第一名 |
| tagDev | Game dev | 游戏开发者 |
| tagDevDesc | Makes Flappy Poop | Flappy Poop 的开发者 |
| tagOg | First month | 元老 |
| tagOgDesc | Played in the game's first month, November 2026 | 2026 年 11 月，游戏第一个月就来玩了 |
| tagNew | New player | 新玩家 |
| tagNewDesc | Joined in the last 7 days | 最近 7 天内加入 |

## Reviewer checklist

1. Fluency: natural Simplified Chinese, not word-for-word awkwardness.
2. Glossary: 纤维 / 益生菌 / 后生元 / 有害细菌 / 神秘盒子 used consistently.
3. Silent mode: hardware 静音模式, not software mute.
4. Untranslated tokens still present in About.
5. Length: How to play body and About still readable in a 520 px wrap on a phone.
6. Pause / game over lines stay short (one or two lines).
