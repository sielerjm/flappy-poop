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
- **User code** / save code (用户码 / 存档码) = the `fp1.…` string players copy between devices. The home-screen user button reads **Sign in** (登录) until a username is set, then the name and best; it opens the panel titled **YOUR PLAYER** (你的玩家). Signed out the panel shows two buttons, **Sign in** (登录, paste a user code) and **Create user** (创建用户, pick a username), each on its own screen with **‹ Back** (‹ 返回); signed in it is the player's dashboard: **Username**, **Your user code** (你的用户码) with **Copy**, **Sign out** (退出登录) and **Merge players…** (合并玩家…), and a **(?)** card, **What's on this page** (这一页有什么) (plan 44, 2026-11-24). `{name}`, `{scores}`, `{n}`, `{score}`, `{level}`, `{date}` and `{other}` are placeholders filled at runtime; keep them verbatim.
- **One player across devices** (2026-11-08; plan 44, 2026-11-24): every browser has its own secret id; the leaderboard treats ids merged through a user code as one player (aliases). A **username belongs to the player holding it on the board**: typing a held name on a new browser is refused (`saveNameTaken`), and the way in is **Sign in** with the user code (`saveMerged`; a guest's scores on that device join the player: `saveGuestJoin`). **The board's name wins** (2026-11-09): a rename typed on one device reaches the others on their own; only a name typed on a device overrides the board. **Sign out** (退出登录, Clear before plan 44) opens a confirm with the code, then forgets the name, id and scores on this device only (`saveSignOutWarning`, `saveCleared`). **Merge players…** (合并玩家…) is the only way two players become one: both are shown side by side (这台设备 / 用户码), the player taps the one whose name stays (✓ 保留), then **Merge for good** (永久合并). "Sign in" and "Sign out" are the plain sense (登录 / 退出登录): there is no password, the user code is the player. `{name}` and `{other}` stay verbatim.
- **Leaderboard** (排行榜) = the shared online Top 25 behind the 🏆 tray button. Only players with a username are on it; `{score}` may carry a 🚽, `{rank}` / `{total}` are numbers. Keep the placeholders verbatim. The 🏆 · 🌞 · 🏅 tabs under the title switch it to today's **DAILY DUMP** board (每日一拉) or the **MEDAL BOARD** (奖牌榜): players ranked by 🥇, then 🥈, 🥉 and their **BEST RACE** (单场最佳: their best score in one tournament race, on the shorter tournament levels, so not comparable with the 🏆 score); `{events}` is how many tournaments they finished.
- **Tournament** (锦标赛, 🏅) = every two-player (👥) session: 2–8 players on one device, raced two at a time in a knockout bracket (赛程, **Bracket**): quarter-finals, semi-finals, a bronze match (铜牌赛) and the Final, then a podium (领奖台); two players race the Final alone (no bronze). Each row of the lobby is a pasted user code, a **Guest** (访客, a made-up English name such as JollyPlunger042, kept as is in Chinese), or **Use my player** (the host's own username). Before the first race the host can change who meets whom (drag, ↑ ↓, 🎲 **Shuffle** 重新抽签; a **bye** 轮空 goes straight through). **Abandon** ends it, saves nothing and goes back to the lobby. When the Final of 3 or more players is decided, players who joined with a user code (and the host's own player) get their medals (奖牌) on the **🏅 board** (🏅 榜, a tab of the leaderboard); the podium says whether that worked. Guests and two-player tournaments are never saved.
- **Username rules** (2026-11-10): a new username has 4–16 characters (at least 2 when it has Chinese, Japanese or Korean characters), no spaces, no emoji, and none of a short list of English rude words; the save panel says which rule a name broke (saveNameShort / Space / Emoji / Blocked / Long). Names chosen before the rules keep working. saveNameBlocked stays vague on purpose ("pick a different username").
- **Play again** (再玩一次) = the game-over button that starts the next run at once; **New personal best** (新的个人最佳) shows when a run beats every earlier score on this device.
- **Daily Dump** (每日一拉, 🌞) = the once-a-day challenge behind the 🌞 at the top of the home screen: everyone flies the same endless course that day (赛道, at one level, 关), with one try (一次机会); a new course starts at 00:00 UTC. The name is a pun (a "dump" is a poop); 每日一拉 keeps the joke ("one poop a day"). Its popup's button reads **Create user** (创建用户, no username yet), **Play** (开始), **See today's result** (查看今日成绩) or, in test mode, **Practice** (练习: never saved). `{level}` is a level label such as "LV 5" / "第5关", `{time}` a countdown hh:mm:ss, `{day}` a short date written by the browser for the locale ("10 Nov" / "11月10日"), `{rank}` / `{total}` / `{score}` numbers; keep them verbatim. The zh body text carries explicit line breaks so the game's wrap never starts a line with punctuation.
- **Two players** (双人模式) = the 👥 switch under the toilet toggle, offered only on a landscape screen wide enough for two halves (desktop, tablet). P1 is the left half, P2 the right; `{n}` is the player number, and `{name}` is "P1" / "P2" (versusPlayer) or, in a tournament race, the competitor's name. A crash does not end a two-player run (the poop is put back mid-screen). Levels start together: the first one over a finish line waits under **Waiting for {name}…** until the other arrives; then each player taps ready (**Tap when ready**, then **Ready! Waiting for {name}…** with a smaller **Tap again to un-ready** under it), and once both are ready a shared 3-2-1-GO starts the level as **GO!** appears (with a toilet flush). The match is decided on points once both players have cleared the last level, and the first one out waits under **Made it out!** / **Waiting for P{n}…**. Two-player runs never reach the leaderboard or the save code.
- **{daily}** (plan 17, Christmas) = a placeholder in the nine strings that name the Daily Dump's glyph (itemDailyDetail and its December version itemDailyDetailDec, itemLeaderboardDetail, dailyTitle, dailyBody and its December version dailyBodyDec, dailyNeedName, dailyBoardJoin, statsDaily). The game fills it with the 🌞, or in December with that visit's 🎅 (Santa, Mrs. Claus or Mx Claus, any skin tone). Keep `{daily}` verbatim in both columns, exactly where the 🌞 stood. The loading splash keeps its literal 🌞. "Happy Bowelidays!" (the pun on bowel and holidays) is an image in English for every locale; do not translate it.
- **Profile** (个人资料, 👤) and **achievements** (成就, 2026-11-11) = every player's public page: the save panel's 👤 Profile opens your own, a name on any board opens theirs. Sections: **Singleplayer** (单人模式), **Daily Dump** podiums (领奖台), **Tournaments** medals and **Biggest rival** (最大对手: the player they lost to most), **Career** (生涯: lifetime totals as emoji and numbers: #️⃣ pipes, 💨 farts, 🌈 super farts, 🥦 fiber, 💊 probiotics, ✨ postbiotics, 🦠 bacteria, 🫘 beans, 📦 boxes, 🟡 coins, 💀 deaths; a tap opens a card with a short note, `career*`) and **Achievements** (成就): badges (徽章) for a score or level in one run, for making it out, and lifetime milestones; some are time-limited **quests** that close on a date (`statsQuestOpen`). Badge titles are short puns, keep them playful rather than literal (e.g. 一泻千里 for Express Transit, 彩虹屁 for Rainbow Blast); the seven level badges reuse the gut-segment names. `{n}`, `{total}`, `{glyph}`, `{name}`, `{losses}`, `{meetings}`, `{day}` and `{badges}` are filled at runtime; keep them verbatim. The save panel's note now says scores, stats and achievements are all public (`saveLeaderboardNote`). Without a username a profile opens as a gate (`statsGateTitle` / `statsGateBody`) with **Create user** (创建用户, the 🌞 popup's string).
- **Education mode** (教育模式, 📚, plan 21) = quiz cards about the gut and its microbes, asked in level breaks (for coins) and after a crash (to keep flying). For everyone since 0.19.0 (plan 28): the 📚 switch on the home screen (off by default); the old unlock word typed as a username is still never stored as a name, and `eduWordRetired` says 📚 is on the home screen now. `eduIntroNotMedical` is the 📚 popup's line that the cards are not medical advice (医疗建议). The 📚 glyph is not translated. Card text lives in `src/questions.js`, not in this catalog; every live card has its `zh` version (plan 28, 2.1; terms in the card glossary below the items glossary), so a zh-Hans player sees the whole card in Chinese, and a pilot event's language (the game's) is the card's too. **Backup** (备份) and **restore** (恢复), plan 28 3.1b: the 💾 part of 📚 Education data (`eduBackup*`, `eduRestore*`) saves the cards as a file (文件) or as text (文本) and brings them back on this or another device; the cards (卡片) are the player's answered quiz cards. The explanation's Wikipedia links are English only: a Chinese explanation shows none, and keeps 📄 了解更多 (the paper's DOI). The quiz card (`quiz*`) names the gut segment with the `level.*` names, or **Gut microbes** (肠道微生物) for the general cards; `{source}` is a short citation such as "Martinsen et al. 2005" and stays as is. After a crash in an education run the same card is a **revive** (复活): `revive*` lines; ❤️ are the tries left, ⭐ the streak that wins back the coins and power-ups (金币和道具); `{n}` in `reviveChoice` is a number of questions. "Tap when ready" reuses `versusTapReady`.

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

## Card glossary (quiz cards, plan 28)

Every live card in `src/questions.js` has its `zh` version (2026-11-15). The cards use these terms; keep
new and edited cards consistent with them (and with the gut segments' `level.*` names: 胃, 十二指肠, 空肠,
回肠, 盲肠, 结肠, 直肠). Latin genus and species names stay Latin where Chinese has no common name; numbers
keep the English card's digits (the tests check the small numbers and years), large ones in 万 / 亿.

| English | Simplified Chinese |
|---|---|
| microbe(s); gut microbiome | 微生物；肠道微生物组 |
| microbial community; strain; species | 微生物群落 / 菌群；菌株；物种 |
| bacteria; archaea; fungi; viruses (in the gut); bacteriophage | 细菌；古菌；真菌；肠道里的病毒（never 肠道病毒: that is Enterovirus）；噬菌体 |
| small intestine; large intestine; upper small intestine | 小肠；大肠；小肠上段 |
| stomach acid; gastric juice | 胃酸；胃液 |
| bile; bile acids; secondary bile acids; bile salt hydrolase | 胆汁；胆汁酸；次级胆汁酸；胆盐水解酶 |
| fibre (dietary) | 膳食纤维（游戏里的道具仍是“纤维”） |
| short-chain fatty acids; acetate, propionate, butyrate | 短链脂肪酸；乙酸、丙酸、丁酸 |
| probiotic; prebiotic | 益生菌；益生元 |
| mucus (inner / outer layer) | 黏液（内层 / 外层） |
| anaerobes | 厌氧菌 |
| fermentation; hindgut fermenter | 发酵；后肠发酵动物 |
| Paneth cells; antimicrobial peptides; crypts | 潘氏细胞；抗菌肽；肠隐窝 |
| Peyer's patches; IgA; lymphoid tissue | 派尔集合淋巴结；IgA；淋巴组织 |
| ileocecal valve; ileostomy; villi | 回盲瓣；回肠造口；绒毛 |
| fecal microbiota transplant (always this term); donor stool | 粪菌移植；供体粪便 |
| H. pylori; C. difficile; Vibrio cholerae | 幽门螺杆菌；艰难梭菌；霍乱弧菌 |
| Bifidobacterium; Streptococcus; Saccharomyces; Candida | 双歧杆菌；链球菌；酵母属（Saccharomyces）；念珠菌属（Candida） |
| Methanobrevibacter smithii | 史氏甲烷短杆菌 |
| Bacillota (Firmicutes); Bacteroidota (Bacteroidetes) | 芽孢杆菌门（Bacillota，旧名厚壁菌门）；拟杆菌门（新旧同名，so give the Latin） |
| lactase; lactose; lactose intolerance; amylase; urease | 乳糖酶；乳糖；乳糖不耐受；淀粉酶；脲酶 |
| human milk oligosaccharides | 母乳低聚糖 |
| Bristol Stool Scale; stool form; transit (fast / slow) | 布里斯托大便分类法；大便性状；通过（快 / 慢） |
| vaginal birth; caesarean birth | 顺产；剖宫产 |

## Tone

Short, playful, clear. Fit a 720×1280 logical field; How to play / About body wrap at
~520 px with per-character wrap for Chinese. Prefer everyday words over clinical jargon.

## Full string table

| Key | English | Simplified Chinese |
|---|---|---|
| readyTitle | FLAPPY POOP | FLAPPY POOP |
| countdownSleeps | {n} sleeps till Christmas (plan 17: December 1 to 24, under the title; the Happy Bowelidays! image above it is English for every locale, so it has no row here) | 离圣诞节还有{n}晚 |
| countdownSleep | 1 sleep till Christmas | 离圣诞节还有1晚 |
| countdownChristmas | Merry Christmas! | 圣诞快乐！ |
| howToPlay | How to play | 玩法说明 |
| pauseTitle | PAUSED | 已暂停 |
| pauseHint | tap anywhere to resume game | 点击任意处继续游戏 |
| levelBanner | LEVEL {n} | 第 {n} 关 |
| levelContinue | Tap to continue | 点击继续 |
| levelGateTap | Tap 📚 to answer this break's cards before continuing. (plan 26, A2: a smaller line under "Tap to continue" once a tap at a level break was refused because the gate holds; plan 28, Stage 3b: the gate holds for the break's new cards too, up to the player's number, and at most 10 due cards, so "this break's cards", not "all cards"; it goes when they are answered) | 先点 📚 答完这次休息的卡片，才能继续。 |
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
| level.super | Challenge question (plan 34: the quiz card's header for a challenge question, the harder card offered by the bubble in an education run; also its name on the offer) | 挑战题 |
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
| skipSplash | Skip to home when loaded | 加载后直接进入主页 |
| skipSplashHint | No Continue tap on the loading screen | 加载页无需点“继续” |
| reloadGame | Reload game | 刷新游戏 |
| aboutLink | About | 关于 |
| testTitle | 🧪 TEST MODE | 🧪 测试模式 |
| testStartLevel | Start at | 开始于 |
| testPretendDate | Date | 日期 |
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
| itemDailyDetail | Tap the {daily} at the top of the home screen: one try a day on a course everyone shares, endless at the day's level, with no kernels. Your score goes on the {daily} board; a new course every day at 00:00 UTC. | 点首页顶部的{daily}：每天一次机会，所有人飞同一条赛道，按当天的关卡一直飞下去，没有玉米粒。分数记到{daily}榜上；每天UTC 00:00换新赛道。 |
| itemEducationName | Education mode | 教育模式 |
| itemEducationDetail | Turn on 📚 on the home screen: level breaks ask quiz cards about the gut and its microbes, and after a crash, right answers let you fly on. Cards you miss come back until you know them; right answers pay corn. Tap 📚 for how it works. | 在主屏幕打开 📚：关卡休息时会问关于肠道和肠道微生物的问题；撞到之后，答对就能继续飞。答错的卡片会再出现，直到你记住；答对能得玉米粒。点 📚 看玩法说明。 |
| itemSuperQName | Challenge question (plan 34: How to play's row after Education mode, shown with it) | 挑战题 |
| itemSuperQDetail | In 📚 mode, once a level: pop the ❓ bubble for a harder question. Right pays 10 to 22 🌽, wrong costs up to 5. Try it or decline. | 在 📚 模式下，每关一次：戳破 ❓ 泡泡会出一道更难的题。答对得 10 到 22 🌽，答错最多扣 5。可以挑战，也可以放弃。 |
| itemInfoName | About | 关于 |
| itemInfoDetail | The i button opens About: the credits, this guide and What's new (the update notes). Key: I. | i按钮打开“关于”：制作名单、本玩法说明和更新说明。按键：I。 |
| itemLanguageName | Language | 语言 |
| itemLanguageDetail | Switch between English and 简体中文. Key: L. | 在English和简体中文之间切换。按键：L。 |
| itemFeedbackName | Feedback | 反馈 |
| itemFeedbackDetail | Report a bug or suggest a feature on GitHub. Key: F. | 在GitHub上报告问题或提出功能建议。按键：F。 |
| itemLeaderboardName | Leaderboard | 排行榜 |
| itemLeaderboardDetail | The top 25 scores. Its {daily} tab has today's Daily Dump, its 🏅 tab the tournament medals. Tap a name to see that player's profile. Key: T. | 前25名的成绩。{daily}页是今天的每日一拉，🏅页是锦标赛奖牌榜。点名字可查看该玩家的资料。按键：T。 |
| itemSettingsName | Settings | 设置 |
| itemSettingsDetail | Sound, haptics (Android only), the bean button's side in landscape, skipping to home once the game has loaded, and Reload game to fetch the newest version. Key: S. | 音效、震动（仅限Android）、横屏时豆子按钮的位置、加载后直接进入主页，以及“刷新游戏”获取最新版本。按键：S。 |
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
| saveTitle | YOUR PLAYER | 你的玩家 |
| saveIntro | Save your scores and play as you on any device. | 保存分数，在任何设备上都能用你的玩家来玩。 |
| saveNameLabel | Username | 用户名 |
| saveNamePlaceholder | 4–16 characters | 4–16 个字符 |
| saveYourCode | Your user code | 你的用户码 |
| saveCopy | Copy | 复制 |
| saveCopied | Copied | 已复制 |
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
| quizRight | Right! | 答对了！ |
| quizRightCoins | Right! +{n} | 答对了！+{n} |
| superQOffer | You popped a challenge question. Answering the challenge question earns you {reward} corn kernels, but answering it incorrectly costs up to {penalty} corn kernels. Do you wish to try? (plan 34, round 2, Michael's sentence: the challenge question's offer, shown when the poop touches the ❓ bubble in an education run; {reward} is what a right answer pays, 10 to 22 by level; {penalty} the most a wrong one takes, 5, less when the purse holds less; the card comes only after Try) | 你戳破了一个挑战题泡泡！答对可以得到 {reward} 粒玉米粒，答错最多扣 {penalty} 粒玉米粒。要挑战吗？ |
| superQTry | Try it (the offer's green button that shows the card; Enter and Space press it too) | 挑战 |
| superQDecline | Decline (the offer's red button that closes it; the run flies on) | 放弃 |
| superQLost | Wrong. −{n} 🌽 (the verdict after a wrong challenge answer that cost corn) | 答错了。−{n} 🌽 |
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
| breakQuitDueSure | Quit ungraded? Tap again (the armed label while the break's gate holds, new cards included since plan 28's Stage 3b: quitting then ends the run with no grade. "Ungraded" is 不计成绩, as in the profile's 计分 rows) | 不计成绩结束？再点一次 |
| quizSkip | Skip · {n} 🌽 (plan 26, A2: the right button of an open card in a level break's quiz; it replaced Bury and the level skip. Every Skip costs {n} corn kernels, and the card waits until tomorrow, whatever its kind) | 跳过 · {n} 🌽 |
| quizSkipFree | Skip (the same button in a test run, where it is free) | 跳过 |
| quizSkipWarn | Skipping costs {n} 🌽, and this card waits until tomorrow. Tap Skip again. (the first Skip in a level break shows this in the verdict's place; later ones in that break skip at once; a new or practice card waits until tomorrow too since plan 28, Stage 3b (a due card has quizSkipWarnDue)) | 跳过要花 {n} 🌽，这张卡片会等到明天。再点一次“跳过”。 |
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
| streakNowLine | 🔥 Current streak = {n} (plan 34, round 2, Michael's wording: the last line of "Your cards" (the learning streak) and a line on the 🌞 Daily Dump card (the Daily Dump streak); {n} is a number of days, 0 included) | 🔥 当前连续 = {n} |
| quizCaughtUp | You're all caught up! New cards come with the next level, and old ones come back when they are due. (plan 28, Stage 3b: no daily cap, so no number) | 全部完成！下一关会有新卡片，旧卡片到期后会再出现。 |
| quizCaughtUpPerDay | You're all caught up! New cards come with the next level, up to {n} a day, and old ones come back when they are due. (shown in quizCaughtUp's place only while education.newPerDay is a number; {n} is it) | 全部完成！下一关会有新卡片（每天最多 {n} 张），旧卡片到期后会再出现。 |
| quizCaughtUpMoreOne | That's all this break asks! {n} more card is due: Keep practicing asks it now, or it waits for the next break. ({n} is 1: a due card past the gate's education.duePerBreak, plan 28, Stage 3b; "Keep practicing" names the button, quizKeepPracticing) | 这次休息的卡片答完了！还有 {n} 张到期的卡片：点“继续练习”现在回答，或者留到下次休息。 |
| quizCaughtUpMore | That's all this break asks! {n} more cards are due: Keep practicing asks them now, or they wait for the next break. ({n} is 2 or more; Chinese has one form for both) | 这次休息的卡片答完了！还有 {n} 张到期的卡片：点“继续练习”现在回答，或者留到下次休息。 |
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
| eduIntroNotMedical | The cards are about how the gut and its microbes work. They are not medical advice. | 这些卡片讲的是肠道和肠道微生物如何运作，不是医疗建议。 |
| eduWordRetired | 📚 Education mode is on the home screen for everyone now. | 📚 教育模式现在对所有人开放，就在主屏幕上。 |
| eduIntroHowTitle | How it works | 玩法 |
| eduIntroHowSummary | Answer cards at each level break and to come back from a crash. Right answers at a break earn 🌽 corn kernels. (plan 34: the line under "How it works" that always shows; Show reveals the full list) | 每次关卡休息时回答卡片，撞到后也靠答对卡片继续。休息时答对能赚 🌽 玉米粒。 |
| eduIntroHowLevels | Each level break asks new cards about the part of the gut you just flew through (as many as you choose below) and up to {n} cards due for review. Answer them before you fly on; a card you miss comes back until you get it right. (plan 28, Stage 3b: every break asks its cards; "below" is the New cards per level row; {n} is education.duePerBreak, 10) | 每次关卡休息时，会问你刚飞过的那段肠道的新卡片（数量在下面选），以及最多 {n} 张到期要复习的卡片。答完才能继续飞；答错的卡片会再出现，直到答对。 |
| eduIntroHowLevelsAll | Each level break asks new cards about the part of the gut you just flew through (as many as you choose below) and every card due for review. Answer them before you fly on; a card you miss comes back until you get it right. (eduIntroHowLevels' place while education.duePerBreak is null: no limit) | 每次关卡休息时，会问你刚飞过的那段肠道的新卡片（数量在下面选），以及所有到期要复习的卡片。答完才能继续飞；答错的卡片会再出现，直到答对。 |
| eduIntroHowRevive | Crash, and a card is your way back: ❤️ three tries to get one right, then ⭐ three in a row to win back your coins and power-ups. | 撞到了？答对卡片就能继续：❤️ 有三次机会答对一张，然后连续答对 ⭐ 三张，就能赢回金币和道具。 |
| eduIntroHowSkip | Stuck on a card at a break? Skip it for a few 🌽 (it waits until tomorrow), or quit the run. (plan 26, A2: Skip replaced Bury; plan 28, Stage 3b: every skipped card waits until tomorrow, new ones too) | 在休息时卡在一张卡片上？花几个 🌽 跳过它（它会等到明天），或者结束这一局。 |
| eduIntroHowCoins | Right answers in a level break earn you corn kernels, once per card a day: 3 for a new card, 2 for a card due for review, 1 for practice or a card you missed. Cards are automatically ordered to be shown right before you're likely to forget them. (plan 26 A2: Michael's wording, as written; plan 28, Stage 3b added the rates, his 16 Nov decision: education.breakCoins) | 在关卡休息时答对会得到玉米粒，每张卡片每天一次：新卡片 3 粒，到期复习的卡片 2 粒，练习或答错过的卡片 1 粒。卡片会自动排序，在你快要忘记之前出现。 |
| eduIntroChoices | Your choices (the heading over the start level and the new-card order) | 你的选择 |
| eduIntroChoicesSummary | Choose where you start and how new cards come up. (plan 34: the line under "Your choices" that always shows) | 选择从哪一关开始，以及新卡片怎么出现。 |
| eduIntroShow | Show (plan 28, 4.2: the link under "How it works" and "Your choices" while that section is hidden; an arrow ▾ follows it) | 显示 |
| eduIntroHide | Hide (plan 28, 4.2: the same link while the section shows; an arrow ▴ follows it) | 隐藏 |
| eduIntroShowHint | Press to show more information (plan 28, 4.2: the line beside "Show", in the same button, saying what a press does; "Press" fits a tap, a click and a controller's A) | 点击显示更多信息 |
| eduIntroHideHint | Press to hide information (plan 28, 4.2: the line beside "Hide", in the same button) | 点击隐藏信息 |
| eduIntroStart | Start at (◀ LV n ▶ follows: the level the next education run starts at) | 从这一关开始 |
| eduIntroStartLocked | Reach a level in an education run to start there next time. | 在教育模式中到达某一关后，下次就能从那里开始。 |
| eduIntroOrder | New cards (a heading over three choices: before, mixed in with, or after the cards due) | 新卡片 |
| eduOrderBefore | Before reviews | 先学新卡 |
| eduOrderMixed | Mixed in | 穿插 |
| eduOrderAfter | After reviews (the default) | 先复习 |
| eduOrderBeforeHint | New cards come first, then the missed and review cards. (plan 26 A2: the line under the three new-card buttons while "Before reviews" is pressed; plan 28, Stage 3b dropped "a level break waits for", since it waits for new cards too) | 新卡片先出现，然后是答错卡和待复习卡。 |
| eduOrderMixedHint | New cards are mixed in with the missed and review cards. (the same line while "Mixed in" is pressed) | 新卡片和答错卡、待复习卡穿插出现。 |
| eduOrderAfterHint | New cards come once the missed and review cards are answered. (the same line while "After reviews" is pressed) | 答完答错卡和待复习卡之后，才会出现新卡片。 |
| eduIntroPerDay | Up to {n} new cards a day. ({n} is education.newPerDay; shown only while it is a number: it is held off since plan 28, Stage 3b) | 每天最多 {n} 张新卡片。 |
| eduIntroPerLevel | New cards per level (plan 28, Stage 3b: the 📚 popup's heading over three choices, 3, 5 and All: how many new cards each level break asks a visit) | 每关新卡片 |
| eduPerLevelAll | All (the third choice under eduIntroPerLevel: every new card of the level; the other two are the numbers 3 and 5) | 全部 |
| eduPerLevelHint | Each level break asks up to {n} new cards. (the line under the choices while 3 or 5 is pressed; {n} is that number) | 每次关卡休息最多问 {n} 张新卡片。 |
| eduPerLevelAllHint | Each level break asks all its new cards. (the line under the choices while All is pressed) | 每次关卡休息会问这一关的所有新卡片。 |
| eduIntroDevice | Your data is stored locally on your device in the browser, not on our servers, unless you choose to share it. (plan 26 A2: Michael's wording plus "unless you choose to share it", his choice, since Share my grades and the tester pilot do send data; the 📚 Education data link follows) | 你的数据保存在这台设备的浏览器里，不在我们的服务器上，除非你选择分享。 |
| eduIntroKeep | The browser can erase it (clearing site data, or Safari after weeks without a visit), so add the game to your Home Screen and back up your cards now and then: (plan 28, 3.1b: after eduIntroDevice in the 📚 popup; the 📚 Education data link follows the colon) | 浏览器可能会清除它（清除网站数据，或 Safari 在几周未访问后），所以请把游戏添加到主屏幕，并不时备份你的卡片： |
| eduBackupTitle | 💾 Back up your cards | 💾 备份你的卡片 |
| eduBackupBody | Your cards live in this browser only, and the browser can erase them. Save a copy now and then, and restore it here or on another device. | 你的卡片只保存在这个浏览器里，浏览器可能会清除它们。请不时保存一份副本，可以在这里或另一台设备上恢复。 |
| eduBackupCount | {n} cards on this device. ({n}: the cards this device has answered) | 这台设备上有 {n} 张卡片。 |
| eduBackupNone | Nothing to back up yet: answer a card first. | 还没有可备份的内容：先答一张卡片吧。 |
| eduBackupSave | Back up my cards | 备份我的卡片 |
| eduBackupCopy | Copy as text | 复制为文本 |
| eduBackupShared | Backed up. | 已备份。 |
| eduBackupDownloaded | Saved to your downloads. (a mouse, or a browser whose share sheet takes no files) | 已保存到下载文件夹。 |
| eduBackupCancelled | Not backed up. (the share sheet closed) | 未备份。 |
| eduBackupFailed | Could not save a file here. Try Copy as text. | 这里无法保存文件。试试“复制为文本”。 |
| eduBackupCopied | Copied. Paste it somewhere safe, such as a note to yourself. | 已复制。请把它粘贴到安全的地方，比如给自己的备忘录。 |
| eduBackupCopyHere | Copy the text in the box below and keep it somewhere safe. | 请复制下面框里的文本，保存在安全的地方。 |
| eduRestoreFile | Restore from a file | 从文件恢复 |
| eduRestorePastePlaceholder | Or paste a backup here | 或在这里粘贴备份 |
| eduRestorePaste | Restore pasted text | 恢复粘贴的文本 |
| eduRestoreGoHome | Restore works on the home screen: close this and go home first. | 只能在主屏幕恢复：请先关闭这里，回到主屏幕。 |
| eduRestoreDone | Restored. New cards: {added}. Updated: {updated}. New badges: {badges}. ({added}, {updated}: cards; {badges}: education badges new to this device; counts after labels, so no plurals) | 已恢复。新卡片：{added}。已更新：{updated}。新徽章：{badges}。 |
| eduRestoreNothing | Nothing new: this device already has these cards. | 没有新内容：这台设备已经有这些卡片。 |
| eduRestoreProgress | Restored: no new cards, but your learning streak, levels or grades are brought up to date. (a restore that moved only the streak, the unlocked level or the graded runs) | 已恢复：没有新卡片，但你的学习连续天数、关卡或成绩已更新。 |
| eduRestoreSkipped | {n} cards in the backup could not be read. ({n}: cards in the file that did not pass the store's cleaning) | 备份中有 {n} 张卡片无法读取。 |
| eduRestoreVisitOnly | This browser is not saving data, so the restore lasts for this visit only. (blocked or full storage: the restore lives until a reload) | 这个浏览器不保存数据，所以这次恢复只在本次访问中有效。 |
| eduRestoreBad | That is not a Flappy Poop card backup. | 这不是 Flappy Poop 的卡片备份。 |
| eduRestoreNewer | This backup is from a newer version of the game. Reload the game, then try again. | 这个备份来自更新版本的游戏。请重新加载游戏后再试。 |
| eduRestoreTooBig | That file is too big to be a card backup. | 这个文件太大，不是卡片备份。 |
| eduIntroPlay | Play (starts an education run from the popup) | 开始 |
| eduIntroClose | Close | 关闭 |
| eduDataTitle | 📚 Education data | 📚 教育数据 |
| eduDataIntro | Education mode keeps your answers, grades and badges on this device. Nothing leaves it unless you choose to share below. | 教育模式的答题记录、成绩和徽章都保存在这台设备上。除非你在下面选择分享，否则不会离开设备。 |
| eduDataReport | Report a wrong card, a broken link, or an idea for a card | 报告卡片错误、链接失效，或提出新卡片的想法 |
| eduDataInvite | Sharing your grades and joining the tester data are by invitation. Type the invite code you were given, or open your invite link. | 分享成绩和参加测试者数据都需要邀请。请输入你收到的邀请码，或打开你的邀请链接。 |
| eduShareNeedInvite | Sharing is by invitation: type the invite code you were given above. | 分享需要邀请：请在上方输入你收到的邀请码。 |
| eduDataAdult | I am 18 or older | 我已年满 18 岁 |
| eduShareTitle | Share my grades | 分享我的成绩 |
| eduShareBody | Puts your username, your average grade, the number of graded runs and your education badges on the 📚 board, which every player can see. Your answers are not shared, and this is not research. Stopping deletes it from the board at once. | 把你的用户名、平均成绩、计分局数和教育徽章放到 📚 排行榜上，所有玩家都能看到。不会分享你的具体答题，这也不是研究。停止分享会立即从榜上删除。 |
| eduShareOn | Sharing is on. | 正在分享。 |
| eduShareOff | Sharing is off. | 未分享。 |
| eduShareStop | Stop sharing | 停止分享 |
| eduShareNeedName | Save a username first: tap the user button on the home screen. | 请先保存用户名：点首页的用户按钮。 |
| eduShareNeedAdult | Sharing is for adults: tick the box if you are 18 or older. | 仅限成年人分享：如果你已年满 18 岁，请勾选上面的选项。 |
| eduShareClosed | Sharing is not open yet. It opens soon. | 分享功能尚未开放，敬请期待。 |
| eduShareNameTaken | Another player holds this username. Pick another one, or sign in with your user code. | 这个用户名已被其他玩家使用。请换一个，或用你的用户码登录。 |
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
| saveClearNoteCards | Your 📚 cards on this device go too: back them up first in 📚 Education data. (plan 28, 3.1b: added to Clear's warning when this device has 📚 cards) | 这台设备上的 📚 卡片也会被清除：请先在“📚 教育数据”里备份。 |
| saveWelcome | Welcome back, {name} — {scores} | 欢迎回来，{name}——{scores} |
| saveWelcomeNoScores | Welcome back, {name} | 欢迎回来，{name} |
| saveNameRequired | Enter a username first (4–16 characters) | 请先输入用户名（4–16 个字符） |
| saveErrorDamaged | Save code is damaged or was edited | 存档码已损坏或被修改 |
| saveErrorUnrecognised | Unrecognised save code | 无法识别的存档码 |
| saveNameChecking | Checking the leaderboard… | 正在查询排行榜… |
| saveNameTaken | That username is taken. If it's yours, use Sign in with the code from the device where you set it. Otherwise pick another name. | 这个用户名已被使用。如果是你的，请点“登录”，粘贴设置它的那台设备上的用户码。否则请换一个名字。 |
| saveNameOffline | Username saved on this device (couldn't check the leaderboard) | 用户名已保存在此设备（无法连接排行榜核对） |
| saveCleared | Signed out: this device has no username now | 已退出：此设备现在没有用户名 |
| saveMerged | Welcome back, {name} — this device is now part of your player | 欢迎回来，{name}——这台设备现已并入你的玩家账号 |
| saveCreateUser | Create user | 创建用户 |
| saveSignIn | Sign in | 登录 |
| saveSignOut | Sign out | 退出登录 |
| saveBack | ‹ Back | ‹ 返回 |
| saveCodeNote | Keep it somewhere safe. It signs you in on other devices. | 把它存好。在其他设备上用它登录。 |
| saveSignOutWarning | Copy your code first. Without it, you can't sign back in. | 请先复制你的用户码。没有它，就无法再次登录。 |
| saveExplainTitle | Your user code | 你的用户码 |
| saveExplainBody | This code is your player. Keep it somewhere safe (a note, a message to yourself).<br>• New phone or computer? Tap Sign in there and paste it.<br>• Your scores and badges follow you.<br>• If you sign out, you need it to sign back in. | 这个码就是你的玩家。请把它存在安全的地方（备忘录、发给自己的消息）。<br>• 换了新手机或电脑？在那里点“登录”，粘贴它。<br>• 你的分数和徽章会跟着你。<br>• 退出登录后，需要它才能再次登录。 |
| saveCopyCode | Copy code | 复制用户码 |
| saveGotIt | Got it | 知道了 |
| saveHelpTitle | What's on this page | 这一页有什么 |
| saveHelpProfile | Your stats and badges. | 你的统计数据和徽章。 |
| saveHelpEdu | Your 📚 quiz cards: back them up, or share your grades on the 📚 board. | 你的 📚 答题卡片：备份它们，或在 📚 榜上分享你的成绩。 |
| saveHelpCode | This code is your player. Copy it and keep it safe; on another device, tap Sign in and paste it. | 这个码就是你的玩家。复制并存好；在其他设备上点“登录”，粘贴它。 |
| saveHelpName | Change your name here. It shows on the leaderboard. | 在这里改名字。它会显示在排行榜上。 |
| saveHelpSignOut | Takes your player off this device and unpairs it from online play. You need your code to sign back in. | 让你的玩家离开这台设备，并解除它的联机配对。需要用户码才能再次登录。 |
| saveHelpMerge | Made two players by mistake? Join them into one, for good. | 不小心建了两个玩家？把它们永久合成一个。 |
| saveCancel | Cancel | 取消 |
| saveMergeOpen | Merge players… | 合并玩家… |
| saveMergeConfirm | Merge for good | 永久合并 |
| saveMergePick | Tap the one whose name stays. Scores, medals and badges join together for good. | 点选要保留名字的那一个。分数、奖牌和徽章会永久合在一起。 |
| saveMergeCheck | Is this you on another device? If it's someone else, cancel and sign out instead. | 这是你在另一台设备上的玩家吗？如果是别人，请取消，然后退出登录。 |
| saveMergeOnline | 🌐 Online play may ask this device to pair again. | 🌐 联机游戏可能会要求这台设备重新配对。 |
| saveCardDevice | This device | 这台设备 |
| saveCardCode | Code | 用户码 |
| saveCardStays | ✓ stays | ✓ 保留 |
| saveCardBest | best {score} (level {level}) | 最高 {score}（第 {level} 关） |
| saveCardSaved | saved {date} | 保存于 {date} |
| saveCardNoScores | no scores yet | 还没有分数 |
| saveGuestJoin | This device's {n} scores join {name}. | 这台设备的 {n} 个分数会加入 {name}。 |
| saveGuestJoinOne | This device's score joins {name}. | 这台设备的分数会加入 {name}。 |
| saveGuestJoinOther | What this device holds joins {name}. | 这台设备上的内容会加入 {name}。 |
| saveSamePlayer | That's already you. | 这就是你。 |
| saveMergedInto | {other} is now part of {name}. | {other} 已并入 {name}。 |
| shareButton | Share | 分享 |
| shareCardPlay | Play: {url} | 来玩：{url} |
| testRunNotSaved | Test run — score not saved | 测试局——分数未保存 |
| runNotCounted | No pipe crossed: this run does not count | 一根管道都没穿过：本局不计入 |
| playAgain | Play again | 再玩一次 |
| newPersonalBest | 🎉 New personal best! | 🎉 新的个人最佳！ |
| scoresEmpty | No scores yet | 暂无分数 |
| leaderboardTitle | LEADERBOARD | 排行榜 |
| leaderboardLoading | Loading… | 加载中… |
| leaderboardOffline | Can't reach the leaderboard | 无法连接排行榜 |
| leaderboardJoin | Tap Sign in on the home screen to set a username and join | 在首页点“登录”设置用户名即可上榜 |
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
| loadUserButton | Sign in | 登录 |
| versusTitle | 2 PLAYERS | 双人模式 |
| versusPlayer | P{n} | 玩家{n} |
| versusJoinPrompt | press your flap button | 按下你的起飞键 |
| versusJoinReady | ready! | 准备好了！ |
| versusJoinHint | Keyboard: W / Space or ↑ / Enter · a controller · tap your half | 键盘：W / 空格 或 ↑ / 回车 · 手柄 · 点击你这一侧 |
| versusGo | GO! | 出发！ |
| versusWins | {name} WINS! | {name} 获胜！ |
| versusDraw | DRAW | 平局 |
| versusBoardLine | Named players' scores go to the 🏆 board (plan 39, 2.5: the split-screen results panel; a racer with a username, their own or a pasted save code, posts their race score to the 🏆 board, guests do not) | 有用户名的玩家，分数记到 🏆 榜上 |
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
| tournamentNeedName | Set a username first (Sign in on the home screen) | 请先设置用户名（首页的“登录”） |
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
| onlineHowTitle | How online races work (plan 39: the ? page's title while 🌐 is on) | 在线比赛怎么玩 |
| onlineHowBody | Race one friend on the same course, each on your own phone or computer. Only your username is shared.
To invite a friend: tap Create room, then send them the 6-digit code, or tap Share to send a link. When they ask to race, tap Let in. A friend in 🤝 Friends can get an Invite instead: they join straight in.
To join a friend: tap Join with code and type their code, or open their link. Then you both tap Ready, and the race starts after 3, 2, 1.
The race follows tournament rules: the higher score wins; a tie goes to fewer crashes, then more finish lines crossed first. Saved races go on the 🏅 and 🏆 boards. Rematch races again.
Tournaments: with 🌐 off (wide screens), 2 to 8 players race two at a time on this screen, knockout style, for the podium 🥇 🥈 🥉. (plan 39: one paragraph per line; the button words match onlineCreate, onlineShare, onlineLetIn, onlineJoin, friendInvite, onlineReady, onlineRematch) | 和一位朋友在同一条赛道上比赛，各用自己的手机或电脑。只会显示你的用户名。
邀请朋友：点“创建房间”，把 6 位数房间码发给对方，或点“分享”发送链接。对方想和你比赛时，点“让对方进来”。🤝 好友 里的朋友也可以直接点“邀请”：对方会直接加入。
加入朋友：点“输入房间码加入”并输入对方的房间码，或打开对方的链接。然后两人都点“准备”，倒数 3、2、1 后开始比赛。
比赛规则和锦标赛一样：得分高者胜；平分时撞得少的胜，再看谁率先过线的关卡更多。保存的比赛会记到 🏅 和 🏆 榜上。点“再来一局”可以再比一次。
锦标赛：关掉 🌐（宽屏才有），2 到 8 名玩家在这台设备上两两比赛，淘汰制，争夺领奖台 🥇 🥈 🥉。 |
| dailyTitle | {daily} DAILY DUMP | {daily} 每日一拉 |
| dailyToday | Today's course: {level} | 今日赛道：{level} |
| dailyBody | One try a day. Everyone flies the same course today, and it never ends: go as far as you can. No kernels, no shop. Compare scores on the {daily} leaderboard; a new course starts every day at midnight UTC. | 每天只有一次机会。
今天所有人飞同一条赛道，
而且没有尽头：能飞多远就飞多远。
没有玉米粒，也没有商店。
在{daily}排行榜上比分数；
每天UTC午夜换一条新赛道。 |
| dailyCreateUser | Create user | 创建用户 |
| dailyPlay | Play | 开始 |
| dailyChecking | Checking… | 检查中… |
| dailySeeResult | See today's result | 查看今日成绩 |
| dailyPractice | Practice | 练习 |
| dailyNeedName | Pick a username first: your score goes on the {daily} board under it. | 先取一个用户名：你的分数会以这个名字记到{daily}榜上。 |
| dailyPracticeNote | Test mode: practice runs are not saved and do not use up the day. | 测试模式：练习不会保存，也不会用掉今天的机会。 |
| dailyNext | Next Daily Dump in {time} | 下一次每日一拉：{time}后 |
| dailyOverTitle | DAILY DUMP · {day} | 每日一拉 · {day} |
| dailyRank | 🏆 #{rank} of {total} | 🏆 第{rank}名 / 共{total}人 |
| dailyRankLoading | Rank… | 排名… |
| dailyRankQueued | Posts when online | 联网后上传 |
| dailyRankNameTaken | Name taken | 名字已被占用 |
| dailyRankRejected | Not saved | 未保存 |
| dailyRankUnavailable | Rank unavailable | 暂无排名 |
| dailyNotCounted | No pipe crossed: not counted. / You can start it again today. (two lines; on Over after a Daily Dump that crossed no pipe, in the countdown's place: the day is still open, plan 48) | 一根管道都没穿过：本局不计入 / 今天还可以重新开始 |
| dailyTodaysBest | Today's best: {n} (December, plan 17: on the Daily popup and on Over after a December Daily, in the countdown's place; {n} is the score) | 今日最佳：{n} |
| dailyNewBest | New best today! (December, plan 17: on Over when a December Daily beats the day's best on this device) | 今日新纪录！ |
| adventFoundToday | Found today's gift! (December, plan 17, 2.6: on Over after a Daily Dump run that caught the day's Advent piece) | 找到了今天的礼物！ |
| stormAhead | Snowstorm ahead! (December, plan 17, 2.7: the banner one pipe pair before a Daily Dump run's snow storm, in the score's style under the popup rows; Gate A sheet 4b (a)) | 前方有暴风雪！ |
| adventFoundLate | Found a catch-up gift (Dec {d})! (2.6: on Over when the run caught an earlier day's piece; {d} is its day of December, 1 to 24) | 补到一份礼物（12月{d}日）！ |
| adventNoGift | No gift this run, play again (2.6: on Over after a December Daily run that offered a piece and ended without it) | 这局没有礼物，再来一局 |
| adventCount | 🧩 {n}/{total} (2.6: the pieces found so far; on the home screen under the 🎅, the Daily popup and Over; {total} is 24) | 🧩 {n}/{total} |
| adventOnTrack | 🧩 {n}/{total} · 🎄 on track (2.6: every piece out so far found, through 24 Dec: the decorated tree is in reach) | 🧩 {n}/{total} · 🎄 进度正好 |
| adventPlainOpen | 🧩 {n}/{total} · 🌲 by 31 Dec (2.6: 25 to 31 Dec, not all found: the plain tree is still open) | 🧩 {n}/{total} · 🌲 12月31日前 |
| adventDecorated | 🧩 {n}/{total} · 🎄 (2.6: all 24 found by 24 Dec) | 🧩 {n}/{total} · 🎄 |
| adventPlain | 🧩 {n}/{total} · 🌲 (2.6: all 24 found, the last after 24 Dec) | 🧩 {n}/{total} · 🌲 |
| dailyBodyDec | All December, play as often as you like: your best score of the day counts. Everyone flies the same course today, and it never ends: go as far as you can. No kernels, no shop. Compare scores on the {daily} leaderboard; a new course starts every day at midnight UTC. (dailyBody's December version, plan 17; the zh-Hans keeps dailyBody's six lines) | 十二月不限次数，只记当天最好成绩。 / 今天所有人飞同一条赛道， / 而且没有尽头：能飞多远就飞多远。 / 没有玉米粒，也没有商店。 / 在{daily}排行榜上比分数； / 每天UTC午夜换一条新赛道。 |
| itemDailyDetailDec | Tap the {daily} at the top of the home screen: a course everyone shares, endless at the day's level, with no kernels. All December, play it as often as you like: your best score of the day goes on the {daily} board. A new course every day at 00:00 UTC. (itemDailyDetail's December version, plan 17) | 点首页顶部的{daily}：所有人飞同一条赛道，按当天的关卡一直飞下去，没有玉米粒。整个十二月不限次数，当天的最好成绩记到{daily}榜上；每天UTC 00:00换新赛道。 |
| dailyBoardTitle | DAILY DUMP | 每日一拉 |
| dailyBoardEmpty | No one has played today's Daily Dump yet | 今天还没有人玩每日一拉 |
| dailyBoardJoin | Play today's Daily Dump from the {daily} on the home screen | 在首页点{daily}玩今天的每日一拉 |
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
| onlineLoadFailed | Couldn't load online play. Check your connection and try again. (plan 39, 0.2: shown in the tournament window when the 🌐 switch cannot load the online client, assets/vendor/supabase.js; play on this device still works) | 无法加载在线比赛。请检查网络后重试。 |
| onlineBack | Back (plan 39: back to the 🌐 window's first screen) | 返回 |
| onlineErrOffline | You're offline. Check your connection and try again. (plan 39: online play's status line, in the 🌐 window of the tournament window) | 你已离线，请检查网络后再试。 |
| onlineNeedName | Online races need a username. Pick one: it's the name your friend sees. (plan 39, 1.5b: the online sign-in side. A device links to the player's username; the first device is "paired" (trusted), later ones wait until a 6-digit pairing code from a paired device is typed on them. {n} is a number, {when} is today / {n} days ago, {time} a m:ss countdown) | 在线比赛需要用户名。选一个吧：朋友会看到这个名字。 |
| onlineNameNote | The same rules as the leaderboard: 4 to 16 characters, no spaces. It becomes your username everywhere. | 规则和排行榜一样：4到16个字符，不能有空格。它会成为你在所有地方的用户名。 |
| onlineNameSave | Save | 保存 |
| onlineNameTaken | That username belongs to another player. Pick another, or if it's yours, sign in with your user code first (Sign in on the home screen). | 这个用户名属于另一位玩家。请换一个；如果是你的，请先用你的用户码登录（首页的“登录”）。 |
| onlineConnecting | Connecting | 正在连接 |
| onlineSignInLimited | Too many new online players on this network right now (schools and phone networks share one). Try again in an hour. | 这个网络上的新在线玩家太多了（学校和手机网络常常共用一个）。请一小时后再试。 |
| onlineLinkLimited | This device has switched players too many times this hour. Try again in an hour. (plan 39, 5.2b: the server paces one device linking new players, 10 an hour) | 这台设备这一小时里换玩家的次数太多了。请一小时后再试。 |
| onlineDisabled | Online races are switched off right now. Try again later. | 在线比赛暂时关闭，请稍后再试。 |
| onlineTooManyWaiting | Your player already has 3 devices waiting to be paired, and all 3 are in a race. Try again once a race ends. (plan 39, 2.5: since 2.4e a fourth waiting device replaces the oldest, so this only comes when all three are racing) | 你的玩家已有3台设备在等待配对，而且都在比赛中。请等一场比赛结束后再试。 |
| onlineStorageBlocked | This browser blocks storage, so online play only lasts until you close this page. | 这个浏览器禁止存储，所以在线游戏只能持续到你关闭本页面。 |
| onlineDevices | 📱 Devices | 📱 设备 |
| onlineRaces | 🏁 Recent races (plan 39, 2.5: the 🌐 window's button beside 📱 Devices; your own saved online races) | 🏁 最近比赛 |
| onlineRacesLead | Your last online races (the Recent races view's heading) | 你最近的在线比赛 |
| onlineRacesNone | No saved races yet. Race a friend to start your list. | 还没有保存的比赛。和朋友比一场吧。 |
| onlineRacesPending | Pair this device to see your races. (a device waiting to be paired cannot read its player's race history) | 配对这台设备后，才能看到你的比赛。 |
| onlineRacesNote | Only you can see this list. (online pairings are private: they never show on the public profile) | 只有你能看到这个列表。 |
| onlineRival | Biggest online rival (the player you lost to most in online races; the line under it reuses statsRivalLine) | 在线最大对手 |
| onlineRaceWon | Won (a Recent races row: "Won 412–377", your score first) | 赢 |
| onlineRaceLost | Lost (a Recent races row) | 输 |
| onlineRaceDraw | Draw (a Recent races row: both scored the same, and every tiebreak too) | 平 |
| friendsButton | 🤝 Friends (the 🤝 Friends button on the 🌐 online home (a yellow badge beside it counts friend requests waiting for an answer, online mode only)) | 🤝 好友 |
| friendsLead | Players you raced and added (the Friends screen's lead line) | 和你比过赛、加了好友的玩家 |
| friendsList | Friends ({n}) (the Friends section heading; {n} is how many friends) | 好友（{n}） |
| friendsNone | No friends yet. Finish a saved race with someone, then add them below or on the results screen. (no friends yet (a friend can only come from a saved online race together: no search, by design)) | 还没有好友。和别人完成一场已保存的比赛，然后在下面或结果画面加对方为好友。 |
| friendsAskedYou | Asked to be your friend (section heading: players who asked to be your friend (Accept / Decline)) | 想加你为好友 |
| friendsYouAsked | Waiting for an answer (section heading: friend requests you sent that are not answered yet) | 等待对方回复 |
| friendsOpponents | Recent opponents (section heading: recent online opponents you could add) | 最近的对手 |
| friendsBlocked | Blocked ({n}) (the blocked list's toggle; {n} is how many players you blocked) | 已屏蔽（{n}） |
| friendsPending | Pair this device to see your friends. (a device that is not paired yet (📱 Devices) cannot see friends) | 配对这台设备后才能看到好友。 |
| friendsNote | Only your friends see whether you're online, and only while you're in 🌐 online. (the privacy line at the bottom of the Friends screen) | 只有你的好友能看到你是否在线，而且只在你打开 🌐 在线时。 |
| friendOnline | Online (a friend's state beside 🟢: in online mode, available) | 在线 |
| friendInGame | In a game (a friend's state beside 🟡: in an online race) | 比赛中 |
| friendOffline | Offline (a friend's state beside ⚪: anything else) | 离线 |
| friendAskedWhen | asked {when} (under a request's name; {when} is today / yesterday / N days ago) | {when}发来 |
| friendSentWhen | sent {when} (under a sent request; {when} as above) | {when}发出 |
| friendRacedWhen | raced {when} (under a recent opponent; {when} as above) | {when}比过 |
| friendAccept | Accept (button: accept a friend request) | 接受 |
| friendDecline | Decline (button: turn a friend request down) | 拒绝 |
| friendTakeBack | Take back (button: withdraw a friend request you sent) | 撤回 |
| friendAdd | Add friend (button: send a friend request to a recent opponent) | 加好友 |
| friendRemove | Remove (button: end a friendship (asks twice)) | 删除 |
| friendBlock | Block (button: block a player (asks twice)) | 屏蔽 |
| friendUnblock | Unblock (button: lift your own block) | 取消屏蔽 |
| friendRemoveConfirm | Tap Remove again to remove {name} from your friends (the first tap on Remove; {name} is the friend) | 再点一次“删除”，把 {name} 从好友中删除 |
| friendBlockConfirm | Tap Block again: {name} can't add you, and your races leave each other's lists (the first tap on Block; {name} is the player) | 再点一次“屏蔽”：{name} 不能再加你，你们的比赛也会从彼此的列表中消失 |
| friendAddedSent | Friend request sent to {name} (after Add friend; {name} is the player) | 已向 {name} 发送好友请求 |
| friendNowFriends | You and {name} are friends now (after Accept, or an Add that met their own request; {name} is the player) | 你和 {name} 成为好友了 |
| friendDeclined | You turned down {name}'s request (after Decline; {name} is the player) | 你拒绝了 {name} 的请求 |
| friendTookBack | Request to {name} taken back (after Take back; {name} is the player) | 已撤回给 {name} 的请求 |
| friendRemoved | {name} is no longer your friend (after Remove; {name} is the former friend) | {name} 已不再是你的好友 |
| friendBlocked | {name} is blocked (after Block; {name} is the player) | 已屏蔽 {name} |
| friendUnblocked | {name} is unblocked (after Unblock; {name} is the player) | 已取消屏蔽 {name} |
| friendNotEligible | You can only add players you've finished a saved race with. (the server refused a request (no saved race together, or a block: deliberately the same words)) | 只能加和你完成过已保存比赛的玩家。 |
| friendRateLimited | That's a lot of friend requests. Try again tomorrow. (too many requests in a day, or to one player in a week) | 好友请求太多了，明天再试吧。 |
| friendNoRequest | That request is no longer there. (the request was taken back or answered elsewhere) | 这个请求已经不在了。 |
| friendNoPeer | That player can't be found any more. (the player is gone (their device was removed, or two of their players were merged)) | 找不到这位玩家了。 |
| friendResultAdd | Add {name} as a friend (button on the online results panel after a saved race; {name} is the opponent) | 加 {name} 为好友 |
| friendResultIsFriend | {name} is your friend (the results panel when the opponent is already a friend; {name} is the opponent) | {name} 是你的好友 |
| friendResultPair | Pair this device to add friends from your next races (the results panel's friend line on a device waiting to pair: its race is saved, but only a race between two paired devices lets the players become friends, so pairing helps the next races, not this one) | 配对这台设备后，可以从之后的比赛中加好友 |
| friendInvite | Invite (the button on a 🟢 online friend's row on the Friends screen: sends them an invite to race (it lasts 2 minutes)) | 邀请 |
| inviteFromSub | ✉️ invites you to race (under a friend's name on the Friends screen while their invite is live (replaces the Online word)) | ✉️ 邀请你比赛 |
| inviteJoinLabel | Join {name}'s race (screen-reader label of the ✉️ button (a ring of the time left and m:ss); tapping it joins the friend's room; {name} is the friend) | 加入 {name} 的比赛 |
| inviteDeclineLabel | Turn down {name}'s invite (screen-reader label of the ✕ beside the ✉️; {name} is the friend) | 拒绝 {name} 的邀请 |
| inviteCodeLead | Invite sent. You can also give someone this code (the host's code screen after inviting a friend (the room code shows under it)) | 邀请已发出。你也可以把这个代码给别人 |
| inviteWaiting | Waiting for {name} to answer (the host's code screen while the invite is live (the friend's row above shows ✉️ and the time left); {name} is the friend) | 等待 {name} 回应 |
| inviteExpired | Your invite to {name} ran out. (the host's code screen once the 2 minutes are up; a Resend button follows) | 给 {name} 的邀请已过期。 |
| inviteDeclined | {name} can't play right now. (the host's code screen when the friend turned the invite down (worded softly on purpose); a Resend button follows) | {name} 现在不能玩。 |
| inviteResend | Resend (button on the host's code screen after an invite ran out or was turned down: sends it again in the same room) | 再次邀请 |
| inviteUnavailable | {name} can't be invited right now. (status line when the server refuses an invite (the friend left online mode, started a race, or is no longer a friend: deliberately one message for all)) | 现在不能邀请 {name}。 |
| inviteRateLimited | That's a lot of invites. Try again in a few minutes. (status line past the invite limits (5 a minute, 10 an hour to one friend, 100 a day)) | 邀请太多了，请过几分钟再试。 |
| inviteGone | That invite has ended. (status line on the Friends screen when tapping a friend's ✉️ fails because the invite ran out or was taken back) | 这个邀请已经结束了。 |
| onlineDevicesLead | Devices that use your player online | 在线使用你玩家的设备 |
| onlineThisDevice | This device | 这台设备 |
| onlineOtherDevice | Device {n} | 设备 {n} |
| onlinePaired | paired | 已配对 |
| onlineWaitingPair | waiting to pair | 等待配对 |
| onlineSeen | last online {when} | 最近在线：{when} |
| onlineLinked | added {when} | 添加于：{when} |
| onlineToday | today | 今天 |
| onlineDaysAgo | {n} days ago | {n}天前 |
| onlineYesterday | yesterday (plan 39, 2.5: one day ago, in 📱 Devices and 🏁 Recent races, instead of "1 days ago") | 昨天 |
| onlineRemove | Remove | 移除 |
| onlineRemoveConfirm | Tap Remove again: that device leaves online play and has to be paired again. | 再点一次“移除”：那台设备会退出在线游戏，需要重新配对。 |
| onlineRemoved | Device removed | 设备已移除 |
| onlineRemoveThis | Remove this device | 移除这台设备 |
| onlineRemoveThisConfirm | Tap again: this device leaves online play. Your username and scores stay. | 再点一次：这台设备会退出在线游戏。你的用户名和成绩都会保留。 |
| onlineRemovedThis | This device left online play | 这台设备已退出在线游戏 |
| onlinePairNew | Pair a new device | 配对新设备 |
| onlinePairCodeLead | Type this code on your new device, under 🌐 Online > 📱 Devices | 在新设备的“🌐 在线 > 📱 设备”里输入这个配对码 |
| onlinePairCodeExpires | Code works for {time} | 配对码有效时间：{time} |
| onlinePairCodeNote | Only type it on your own device. Never share it with anyone. | 只在你自己的设备上输入。不要告诉任何人。 |
| onlinePendingLead | This device is waiting to be paired | 这台设备正在等待配对 |
| onlineDemoted | Your player was used online on another device while this one was away. If that wasn't you, ask for a reset (Feedback). | 你不在这台设备上时，你的玩家在另一台设备上在线使用过。如果不是你，请（通过“反馈”）申请重置。 |
| onlinePairHow | On a device that's already paired, open 🌐 Online > 📱 Devices > Pair a new device, then type its code here. | 在已配对的设备上打开“🌐 在线 > 📱 设备 > 配对新设备”，然后在这里输入配对码。 |
| onlinePairGo | Pair | 配对 |
| onlinePairWrong | Wrong code. {n} tries left. | 配对码错误，还剩{n}次机会。 |
| onlinePairBurned | Too many wrong tries: that code stopped working. Make a new one on your paired device. | 错误次数太多，这个配对码已失效。请在已配对的设备上重新生成。 |
| onlinePairedOk | Paired ✓ | 已配对 ✓ |
| onlinePairNoCode | No pairing code is waiting. Make a new one on your paired device. | 没有等待中的配对码。请在已配对的设备上重新生成。 |
| onlineErrGeneric | Something went wrong online. Try again in a moment. (plan 39, 1.6a: any online error without its own message) | 在线功能出了点问题，请稍后再试。 |
| saveClearNoteOnline | This device also leaves online play. If you sign back in, you may need to pair it again from another of your devices. | 这台设备也会退出联机游戏。重新登录后，可能需要用你的另一台设备再次配对。 |
| saveLoadedNoteOnline | This device left online races: turn 🌐 on again to race as this player. | 这台设备已退出在线比赛：再打开🌐即可用这个玩家比赛。 |
| onlineTitle | 🌐 ONLINE RACE (plan 39: the 🌐 online lobby in the tournament window: a two-player race between two devices joined by a 6-digit room code; {name} is the other player's username, {time} a m:ss countdown) | 🌐 在线比赛 |
| onlineSwitch | 🌐 Online | 🌐 在线 |
| onlineSwitchOffSub | Off: everyone plays on this screen | 关：大家在这块屏幕上一起玩 |
| onlineSwitchOnSub | On: race a friend on their own phone | 开：和朋友各用自己的手机比赛 |
| onlineLead | Race one friend on their own phone or computer | 和一位朋友比赛，对方用自己的手机或电脑 |
| onlineOpponentNone | Opponent | 对手 |
| onlineCreate | Create room | 创建房间 |
| onlineJoin | Join with code | 输入房间码加入 |
| onlineNote | Only your username is shared. No chat, no strangers: only someone with your code can join. | 只会显示你的用户名。没有聊天，也不会匹配陌生人：只有拿到你房间码的人才能加入。 |
| onlineBetaNote | Online races are new, so you may hit a bug. Tap 💬 to report it. (plan 39: yellow, the last line of the online home; 💬 is the tray's Feedback button) | 在线比赛是新功能，可能会有问题。点 💬 告诉我们。 |
| onlineCodeLead | Give your friend this code | 把这个房间码告诉朋友 |
| onlineCodeExpires | Code works for {time} | 房间码有效时间：{time} |
| onlineCodeExpired | That code expired. Here is a new one. (plan 39: the 🌐 lobby's status line; {name} is the other player's username) | 这个房间码过期了，这是新的房间码。 |
| onlineShare | Share | 分享 |
| onlineCopy | Copy | 复制 |
| onlineCopied | Code copied | 房间码已复制 |
| onlineLinkExpired | This invite has expired. Ask your friend for a new one. (the join screen's status line when a race's share link (?join=) names a room that no longer takes a guest (the room was closed, ran out or is full)) | 这个邀请已过期，请朋友再发一个。 |
| onlineLinkCopied | Link copied (status line after Share on a device with no share sheet: the share text with the link that joins the room was copied) | 链接已复制 |
| onlineHostTag | (host) | （房主） |
| onlineWaitingOpponent | Waiting for opponent | 等待对手 |
| onlineCancel | Cancel | 取消 |
| onlineAsked | {name} wants to race | {name} 想和你比赛 |
| onlineLetIn | Let in | 让对方进来 |
| onlineDecline | Decline | 拒绝 |
| onlineDeclineNote | Decline gives you a new code, so the old one stops working | 拒绝后会换一个新房间码，旧的就不能用了 |
| onlineDeclinedHost | You declined {name}. Here is a new code. (plan 39: the 🌐 lobby's status line; {name} is the other player's username) | 你拒绝了 {name}，这是新的房间码。 |
| onlineLeftHost | {name} left. Here is a new code. (plan 39: the 🌐 lobby's status line; {name} is the other player's username) | {name} 离开了，这是新的房间码。 |
| onlineJoinLead | Type your friend's room code | 输入朋友的房间码 |
| onlineJoinGo | Join | 加入 |
| onlineKnocking | Waiting for {name} to let you in | 等待 {name} 让你进来 |
| onlineReadyLead | You vs {name}. Tap Ready when you are set. | 你对 {name}。准备好了就点“准备”。 |
| onlineReady | Ready | 准备 |
| onlineUnready | Not ready | 取消准备 |
| onlineIsReady | Ready ✓ | 已准备 ✓ |
| onlineNotReady | not ready | 未准备 |
| onlineLeave | Leave | 离开 |
| onlineStarting | Both ready: the race starts in 3… | 双方都准备好了：比赛3秒后开始… |
| onlineHudSlow | slow connection (plan 39, 1.7a: under the opponent's name in the online race's HUD when their messages arrive late; lower case, a small label) | 网络较慢 |
| onlineHudLost | reconnecting… (plan 39, 1.7a: under the opponent's name when their messages stopped arriving) | 正在重新连接… |
| onlineFitting | Fitting the screen to {name}'s (plan 39, 1.7a, item 14: under the online race's countdown when the field narrows to the other player's smaller screen; {name} is their username) | 正在按{name}的屏幕调整画面 |
| onlineWaitLong | {name} is taking a while (plan 39, 1.8, item 15: after 45 s of waiting on the other player, ready in a level break or out at the finish, above Keep waiting \| Leave; {name} is their username) | {name} 让你久等了 |
| onlineKeepWaiting | Keep waiting (plan 39, 1.8: the button that hides the Leave offer for another 45 s) | 继续等 |
| onlineRematchAsked | {name} wants a rematch (plan 39, 1.8: the online results panel's line when the other player tapped Rematch first) | {name} 想再来一局 |
| onlinePeerLeft | {name} left (plan 39, 1.8: the online results panel's line once the other player left; Rematch is greyed) | {name} 已离开 |
| onlineYouWin | YOU WIN! (plan 39, 1.6d / 1.8: the online results panel's headline on the winner's phone; capitals like versusWins) | 你赢了！ |
| onlineRematch | Rematch (plan 39, 1.6d / 1.8: the online results panel's button to race the same friend again; "Rematch ✓" once tapped) | 再来一局 |
| onlinePausedBy | {name} paused (plan 39, 2.2: the online pause overlay's title when the other player pressed pause or opened a menu; {name} is their username) | {name} 暂停了 |
| onlinePausedAway | {name} switched away (plan 39, 2.2: the pause overlay's title when the other player's app went to the background) | {name} 切出了游戏 |
| onlinePausedLost | {name} lost connection (plan 39, 2.2: the pause overlay's title when nothing arrives from the other player, or they are offline) | {name} 断线了 |
| onlinePausedOffline | You're offline (plan 39, 2.2: the pause overlay's title when this phone has no network) | 你的网络断开了 |
| onlinePausedLink | Reconnecting… (plan 39, 2.2: the pause overlay's title while this phone's link to the race drops and comes back) | 正在重新连接… |
| onlinePausedBusy | Server busy (plan 39, 2.2: the pause overlay's title when the online server refuses messages for a moment) | 服务器繁忙 |
| onlinePauseTap | Tap Ready when you are set (plan 39, 2.2: the line under the pause overlay's title; the race goes on after both tap Ready and a 3-2-1) | 准备好了就点“准备” |
| onlinePauseWaitNet | Waiting for your connection… (plan 39, 2.2: the line under the title while this phone is offline or reconnecting) | 等待网络恢复… |
| onlineLeaveSure | Leave? (plan 39, 2.2: the pause overlay's Leave button after one tap; a second tap leaves) | 确定离开？ |
| onlineLeaveWarn | Tap again to leave. The race ends for both of you, with no winner. (plan 39, 2.2: under the pause overlay's buttons after the first tap on Leave) | 再点一次就离开：比赛结束，双方都没有胜者。 |
| onlineNoWinner | No winner (plan 39, 2.2: the online results panel's headline when the other player left mid-race; the line under it is onlinePeerLeft) | 没有胜者 |
| onlineHudPaused | paused (plan 39, 2.2: under the opponent's name in the race's pill while they paused; lower case, like onlineHudSlow) | 已暂停 |
| onlineRewindTitle | Back to {level} (plan 39, 2.3: the pause overlay's title after a reload mid-race put both players back at the start of the level they were on; {level} is levelShort, "Level 3") | 回到{level} |
| onlineRewindTap | A reload put you both back at the start of this level. Tap Ready when you are set. (plan 39, 2.3: the line under onlineRewindTitle until this player taps Ready; then "Waiting for {name}…") | 页面重新载入，你们俩都回到本关开头。准备好了就点“准备”。 |
| onlineRejoining | Rejoining your race… (plan 39, 2.3: the 🌐 window's status line while a reloaded page asks the server for the race it was in) | 正在重新加入比赛… |
| onlineRaceOver | That race is over. (plan 39, 2.3: the 🌐 window's status line when a reloaded page's race has ended, or the server no longer seats this device in it) | 那场比赛已经结束了。 |
| onlineRaceElsewhere | Your race is running in another window. (plan 39, 2.3b: the 🌐 window's status line when another page of the game on this device is racing: a second tab, the game open in Safari and as the home-screen app at once, or this page after the other one took its race over; "window" means a tab or the app) | 你的比赛正在另一个窗口中进行。 |
| onlineErrBadCode | That's not a room code: codes are 6 digits and never start with 0 (plan 39: the 🌐 lobby's status line; {name} is the other player's username) | 这不是房间码：房间码是6位数字，第一位不是0 |
| onlineErrNoRoom | No room has that code. Check it with your friend. (plan 39: the 🌐 lobby's status line; {name} is the other player's username) | 没有这个房间码的房间，请和朋友核对一下。 |
| onlineErrInRace | This device is still in another race. Leave it there first, then try again. (plan 39, 1.8, item 46: Create or Join refused because this device is still seated in a race that never ended, for example in another tab) | 这台设备还在另一场比赛中，请先在那里离开，再试一次。 |
| onlineClosed | Online races are switched off for now. Try again later. (plan 39, 2.5: the server's off switch is on; Create, Join and a rematch say this) | 在线比赛暂时关闭了，请稍后再试。 |
| onlineSaving | Saving the race… (plan 39, 2.5: the online results panel, while this game reports the race to the server) | 正在保存比赛… |
| onlineSaveWaiting | Saving: waiting for {name}'s game… ({name}: the other player; both games report, and the first waits for the second) | 正在保存：等待{name}的游戏… |
| onlineSaved | Saved to the 🏅 and 🏆 boards (both games agreed: gold or silver on 🏅, each score on 🏆) | 已记到 🏅 和 🏆 榜上 |
| onlineSavedNotCounted | Saved to Recent races. Not on the boards: today's race limit is reached. (10 counted races a day per pair, 20 per player) | 已记入最近比赛。今天的上榜次数已满，不上榜。 |
| onlineSaveDisputed | Not saved: your two games saw different results | 未保存：两边的游戏看到的结果不一样 |
| onlineSaveRefused | Not saved: this race could not be checked (too short, or a score too high for its time) | 未保存：这场比赛无法核对 |
| onlineSaveLate | Not saved: {name}'s game did not report the race (after 30 s of waiting; a device that is not paired never reports) | 未保存：{name}的游戏没有提交这场比赛 |
| onlineSaveFailed | Couldn't save the race. Check your connection. (every resend lost, about a minute) | 比赛没能保存，请检查网络。 |
| onlineSaveLeft | Not saved: the race was left before the end (someone left mid-race: no winner, nothing saved) | 未保存：比赛没打完就有人离开了 |
| onlineDevOnLive | (Dev: this device is on the live project. A 🧪 test device cannot see its rooms.) (plan 39, item 43: added after onlineErrNoRoom on a developer's own machine only; players never see it) | （开发：本设备连接的是正式项目，🧪 测试设备看不到这里的房间。） |
| onlineDevOnTest | (Dev: this device is on the 🧪 test project. The other device must be on it too.) (plan 39, item 43: as onlineDevOnLive) | （开发：本设备连接的是 🧪 测试项目，另一台设备也必须连接测试项目。） |
| onlineErrRateLimited | Too many tries. Wait a few minutes, then try again. (plan 39: the 🌐 lobby's status line, for any of the room limits: wrong codes, too many joins, a room made or a guest declined too fast; 5.3) | 尝试次数太多了，请等几分钟再试。 |
| onlineErrTooSoon | A new race can start a minute after the last one began. Wait a moment, then try again. (plan 39, 5.2b: the 🌐 lobby's status line when the server refuses a Start; one race a minute from a host device) | 上一场比赛开始一分钟后才能开始新的比赛。请稍等，再试一次。 |
| onlineErrBusy | Online races are busy right now. Try again in a minute. (plan 39: the 🌐 lobby's status line; {name} is the other player's username) | 在线比赛现在太忙，请一分钟后再试。 |
| onlineUpdateYou | {name} has a newer version of the game. Reload this page to update, then join again. (plan 39: the 🌐 lobby's status line; {name} is the other player's username) | {name} 的游戏版本更新。请刷新本页面更新，然后重新加入。 |
| onlineUpdateThem | {name} needs to update: ask them to reload the page, then join again. (plan 39: the 🌐 lobby's status line; {name} is the other player's username) | {name} 需要更新：请对方刷新页面，然后重新加入。 |
| onlineDeclinedGuest | {name} didn't let you in. (plan 39: the 🌐 lobby's status line; {name} is the other player's username) | {name} 没有让你进来。 |
| onlineLeftGuest | {name} left the room. (plan 39, 1.6c: the guest's status line when the host left; {name} is the host's username) | {name} 离开了房间。 |
| onlineRoomClosed | The room closed. Ask your friend for a new code. (plan 39, 1.6c: the guest's status line when the room ran out or closed) | 房间已关闭。请向朋友要一个新的房间码。 |
| onlineUpdateBoth | Your games don't match. Both of you reload the page, then join again. (plan 39, 1.6c: the same app version with different race rules, so both reload) | 你们的游戏版本不一致。请双方都刷新页面，然后重新加入。 |
| onlineRetry | Try again (plan 39, 1.6c: the button under a refused online sign-in) | 重试 |
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
Card scheduling: FSRS by Open Spaced Repetition (MIT)
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
卡片复习安排：FSRS，Open Spaced Repetition（MIT）
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
| statsDaily | Daily Dump {daily} | 每日一拉 {daily} |
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
| splashFailed | Couldn't load. Tap to retry (plan 35: the splash when Phaser or the game's code could not load; the button reloads) | 加载失败，点按重试 |
| errorTitle | Something broke (plan 35: the error card's title) | 出错了 |
| errorBody | The game hit an error. Reload it, or keep playing and see if it holds. (outside a run) | 游戏遇到了一个错误。可以刷新游戏，也可以继续玩，看看还行不行。 |
| errorBodyRun | The game hit an error and paused your run. Reloading ends the run. | 游戏遇到了一个错误，已暂停本局。刷新游戏会结束本局。 |
| errorBodyDaily | The game hit an error and paused your run. Reloading ends today's Daily Dump attempt. | 游戏遇到了一个错误，已暂停本局。刷新游戏会结束今天的每日一拉。 |
| errorReport | A bug report (Feedback, key F) takes the error along, links removed. | 提交问题反馈（反馈，按键 F）时会附上这个错误，链接会被去掉。 |
| errorKeep | Keep playing (the card's second button; the first is reloadGame) | 继续玩 |
| splashProfile | Your profile shows your stats and achievements. Tap a name on the leaderboard to see theirs. | 你的个人资料会显示数据和成就。在排行榜上点名字，就能看别人的。 |
| splashEducation | Education mode: gut and microbe quiz cards at level breaks and after a crash. Turn on 📚 at home. (plan 36: quizzes at level breaks and after a crash; 撞到 = crash, the game’s word) | 教育模式：关卡之间和撞到之后回答肠道和微生物问题。在主页打开 📚。 |
| splashSuperQ | Challenge questions: a ❓ bubble once a level in 📚 runs. Right pays 10 to 22 🌽, wrong costs up to 5. (plan 34: a NEW card on the loading splash, at most 100 characters; plan 36: once a level, 10 to 22) | 挑战题：📚 模式每关一个 ❓ 泡泡。答对得 10 到 22 🌽，答错最多扣 5。 |
| splashStreaks | Streaks: play days in a row. Your streaks show on 🌞 and 📚, and on every player's profile. (plan 36: a NEW card again, id streaksAll, glyph 📅🔥; streaks show on every profile since 34.14) | 连续天数：连续几天玩。你的连续天数显示在 🌞 和 📚 上，也显示在每位玩家的个人资料里。 |
| splashDaily | Daily Dump: one try a day on the same course as everyone. | 每日一拉：每天一次机会，和所有人飞同一条赛道。 |
| splashOnline | Online races are here! Turn on 👥 and tap to start. With 🌐 on, race a friend on their own phone. (plan 39: a NEW card on the loading splash, dealt first; at most 100 characters) | 在线比赛来了！打开 👥 并点击开始。打开 🌐，就能和朋友各用自己的手机比赛。 |
| splashTournament | Tournaments: up to 8 players, one bracket, one device. | 锦标赛：最多 8 名玩家，一张对阵表，一台设备。 |
| splashShop | Spend corn kernels in the shop between levels. | 关卡之间可以在商店花掉玉米粒。 |
| splashFiber | Fiber is worth +3. Grab it between pipes. | 纤维 +3 分，在管道之间吃到它。 |
| splashBacteria | Bad bacteria cost 3 points. | 碰到有害细菌扣 3 分。 |
| splashProbiotic | A probiotic blocks one bad bacteria hit for 5 pipes. | 益生菌能挡住一次有害细菌，持续 5 道管道。 |
| splashPostbiotic | Eat fiber while a probiotic is up: pipes, fiber and kernels count ×2. | 益生菌生效时吃到纤维：管道、纤维和玉米粒都 ×2。 |
| splashBean | A bean charges a fart. You can carry three. | 一颗豆子可以充能一次放屁，最多带 3 颗。 |
| splashFart | Tap the poop or the bean button to fart past 5 pipes. Nothing can hurt you while you fart. | 点便便或豆子按钮放屁，冲过 5 道管道。放屁时什么都伤不了你。 |
| splashSuperFart | Three beans make a super fart: it rockets you past 20 pipes. | 集齐 3 颗豆子放超级屁：一口气冲过 20 道管道。 |
| splashMystery | Mystery boxes contain random objects with different probabilities. | 神秘盒子里装着随机道具，每种的概率不同。 |
| splashCoin | Corn kernels are coins. They last one run, so spend them. | 玉米粒就是金币，只在本局有效，记得花掉。 |
| splashToilet | Playing on the toilet? Turn on Toilet mode. The leaderboard keeps your best on and off the toilet. | 在马桶上玩？打开“如厕模式”。排行榜会分别记录你如厕和不如厕时的最高分。 |
| splashRectum | Level 7 is the rectum. Cross the finish line to 'make it out'. | 第 7 关是直肠。冲过终点线，就能“成功脱出”。 |
| splashLeaderboard | The leaderboard pages through all players, 25 a page. Tabs: 🌞 Daily Dump, 🏅 medals and 📚. (plan 36: pages of 25 and a fourth 📚 tab; “分页” = tabs here, as on the board) | 排行榜分页显示所有玩家，每页 25 名。分页：🌞 每日一拉、🏅 奖牌和 📚。 |
| splashTwoPlayer | Toggle 👥 to race friends: up to 8 on one wide screen, or one friend online. (plan 39: 👥 shows on phones too, where it opens 🌐) | 打开 👥 和朋友比赛：宽屏上最多 8 名玩家，或在线和一位朋友比赛。 |
| splashUserCode | Your user code moves your name, scores, profile and streaks to another device. | 用户码能把你的名字、分数、个人资料和连续天数带到另一台设备。 |
| splashController | You can play with a game controller: A flaps, RT farts, Menu pauses. (plan 36: A / RT / Menu as in How to play; 起飞 = flap, the game’s word) | 可以用游戏手柄来玩：A 起飞，RT 放屁，Menu 暂停。 |
| splashLowPower | Battery saver mode or low power mode can impact game performance. (plan 28, 4.7: a loading-screen tip for every device; Michael's words, general on purpose: Apple's name and Android's both) | 省电模式或低电量模式可能会影响游戏性能。 |
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
| achAdventTree | Christmas Tree 2026 (plan 17, 2.6b: the 🎄 badge, all 24 Advent gifts found by 24 Dec 2026) | 2026 圣诞树 |
| achDescAdventTree | Find all 24 Advent gifts by 24 Dec 2026 (catch-ups count) (gifts found on a later day than their own still count, if found by 24 Dec) | 2026年12月24日前找齐全部24份降临礼物（补领也算） |
| achAdventPine | Evergreen 2026 (2.6b: the 🌲 badge, all 24 found by 31 Dec 2026, the last after 24 Dec; one tree a player) | 2026 常青树 |
| achDescAdventPine | Find all 24 Advent gifts by 31 Dec 2026 | 2026年12月31日前找齐全部24份降临礼物 |
| achEduNerd | Nerd Alert | 学霸警报 |
| achEduPerfect | Full Marks | 满分 |
| achEduA | A Student | 优等生 |
| achEduB | B Student | 良好生 |
| achEduC | C's Get Degrees | 六十分万岁 |
| achEduDropOut | Drop Out | 退学 |
| achEduAngel | Angel Baby | 小天使 |
| achEduPhoenix | Phoenix | 凤凰 |
| achDescEduNerd | Make it out with every answer right and no cards left to review ({min} answers or more) (plan 34: one won run with no wrong answer that ends with nothing due, no missed card and no review; "make it out" is winning, flying out of the rectum) | 全部答对并通关，而且没有待复习的卡片（至少答 {min} 题） |
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
| statsStreakNow | 🔥 Current streak (plan 34: your own profile, under Singleplayer and under Daily Dump; the days in a row this device played that mode, alive while the last day is today or yesterday; the value is in days, waitDay / waitDays) | 🔥 当前连续 |
| statsStreakBest | ❤️‍🔥 Longest streak (the most such days in a row ever; same words as statsEduBest) | ❤️‍🔥 最长连续 |
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
