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
| saveClearNoteCards | Your 📚 cards on this device go too: back them up first in 📚 Education data. (plan 28, 3.1b: added to Clear's warning when this device has 📚 cards) | 这台设备上的 📚 卡片也会被清除：请先在“📚 教育数据”里备份。 |
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
| onlineLoadFailed | Couldn't load online play. Check your connection and try again. (plan 39, 0.2: shown in the tournament window when the 🌐 switch cannot load the online client, assets/vendor/supabase.js; play on this device still works) | 无法加载在线比赛。请检查网络后重试。 |
| onlineBack | Back (plan 39: back to the 🌐 window's first screen) | 返回 |
| onlineErrOffline | You're offline. Check your connection and try again. (plan 39: online play's status line, in the 🌐 window of the tournament window) | 你已离线，请检查网络后再试。 |
| onlineNeedName | Online races need a username. Pick one: it's the name your friend sees. (plan 39, 1.5b: the online sign-in side. A device links to the player's username; the first device is "paired" (trusted), later ones wait until a 6-digit pairing code from a paired device is typed on them. {n} is a number, {when} is today / {n} days ago, {time} a m:ss countdown) | 在线比赛需要用户名。选一个吧：朋友会看到这个名字。 |
| onlineNameNote | The same rules as the leaderboard: 4 to 16 characters, no spaces. It becomes your username everywhere. | 规则和排行榜一样：4到16个字符，不能有空格。它会成为你在所有地方的用户名。 |
| onlineNameSave | Save | 保存 |
| onlineNameTaken | That username belongs to another player. Pick another, or if it's yours, load your user code in the save panel first. | 这个用户名属于另一位玩家。请换一个；如果是你的，请先在存档面板里载入你的用户码。 |
| onlineConnecting | Connecting | 正在连接 |
| onlineSignInLimited | Too many new online players on this network right now (schools and phone networks share one). Try again in an hour. | 这个网络上的新在线玩家太多了（学校和手机网络常常共用一个）。请一小时后再试。 |
| onlineDisabled | Online races are switched off right now. Try again later. | 在线比赛暂时关闭，请稍后再试。 |
| onlineTooManyWaiting | Your player already has 3 devices waiting to be paired. Remove one from a paired device, then try again. | 你的玩家已有3台设备在等待配对。请在已配对的设备上移除一台，然后再试。 |
| onlineStorageBlocked | This browser blocks storage, so online play only lasts until you close this page. | 这个浏览器禁止存储，所以在线游戏只能持续到你关闭本页面。 |
| onlinePendingHome | This device isn't paired with your other devices yet. You can race by code; pair it in Devices. | 这台设备还没有和你的其他设备配对。你仍可以用房间码比赛；请在“设备”里配对。 |
| onlineDevices | 📱 Devices | 📱 设备 |
| onlineDevicesLead | Devices that use your player online | 在线使用你玩家的设备 |
| onlineThisDevice | This device | 这台设备 |
| onlineOtherDevice | Device {n} | 设备 {n} |
| onlinePaired | paired | 已配对 |
| onlineWaitingPair | waiting to pair | 等待配对 |
| onlineSeen | last online {when} | 最近在线：{when} |
| onlineLinked | added {when} | 添加于：{when} |
| onlineToday | today | 今天 |
| onlineDaysAgo | {n} days ago | {n}天前 |
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
| saveClearNoteOnline | It also signs this device out of online races. | 这也会让这台设备退出在线比赛。 |
| saveLoadedNoteOnline | This device left online races: turn 🌐 on again to race as this player. | 这台设备已退出在线比赛：再打开🌐即可用这个玩家比赛。 |
| onlineTitle | 🌐 ONLINE RACE (plan 39: the 🌐 online lobby in the tournament window: a two-player race between two devices joined by a 6-digit room code; {name} is the other player's username, {time} a m:ss countdown) | 🌐 在线比赛 |
| onlineSwitch | 🌐 Online | 🌐 在线 |
| onlineSwitchOffSub | Off: everyone plays on this screen | 关：大家在这块屏幕上一起玩 |
| onlineSwitchOnSub | On: race a friend on their own phone | 开：和朋友各用自己的手机比赛 |
| onlineForced | This screen is too narrow to split, so races here are online | 屏幕太窄无法分屏，只能在线比赛 |
| onlineLead | Race one friend on their own phone or computer | 和一位朋友比赛，对方用自己的手机或电脑 |
| onlineOpponentNone | Opponent | 对手 |
| onlineCreate | Create room | 创建房间 |
| onlineJoin | Join with code | 输入房间码加入 |
| onlineNote | Only your username is shared. No chat, no strangers: only someone with your code can join. | 只会显示你的用户名。没有聊天，也不会匹配陌生人：只有拿到你房间码的人才能加入。 |
| onlineCodeLead | Give your friend this code | 把这个房间码告诉朋友 |
| onlineCodeExpires | Code works for {time} | 房间码有效时间：{time} |
| onlineCodeExpired | That code expired. Here is a new one. (plan 39: the 🌐 lobby's status line; {name} is the other player's username) | 这个房间码过期了，这是新的房间码。 |
| onlineShare | Share | 分享 |
| onlineCopy | Copy | 复制 |
| onlineCopied | Code copied | 房间码已复制 |
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
| onlineErrBadCode | That's not a room code: codes are 6 digits and never start with 0 (plan 39: the 🌐 lobby's status line; {name} is the other player's username) | 这不是房间码：房间码是6位数字，第一位不是0 |
| onlineErrNoRoom | No room has that code. Check it with your friend. (plan 39: the 🌐 lobby's status line; {name} is the other player's username) | 没有这个房间码的房间，请和朋友核对一下。 |
| onlineErrRateLimited | Too many wrong codes. Wait a few minutes, then try again. (plan 39: the 🌐 lobby's status line; {name} is the other player's username) | 输错的房间码太多了，请等几分钟再试。 |
| onlineErrBusy | Online races are busy right now. Try again in a minute. (plan 39: the 🌐 lobby's status line; {name} is the other player's username) | 在线比赛现在太忙，请一分钟后再试。 |
| onlineUpdateYou | {name} has a newer version of the game. Reload this page to update, then join again. (plan 39: the 🌐 lobby's status line; {name} is the other player's username) | {name} 的游戏版本更新。请刷新本页面更新，然后重新加入。 |
| onlineUpdateThem | {name} needs to update: ask them to reload the page, then join again. (plan 39: the 🌐 lobby's status line; {name} is the other player's username) | {name} 需要更新：请对方刷新页面，然后重新加入。 |
| onlineDeclinedGuest | {name} didn't let you in. (plan 39: the 🌐 lobby's status line; {name} is the other player's username) | {name} 没有让你进来。 |
| onlineShareText | Race me in Flappy Poop: code {code} (plan 39, 1.6c: the share sheet's text from the host's Share button, followed by the game's link; {code} is the room code grouped, 482 913) | 来 Flappy Poop 和我比赛：房间码 {code} |
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
| splashTwoPlayer | On a wide screen, toggle 👥 to race friends two at a time, up to 8 players. | 在宽屏上打开 👥，和朋友两人一组比赛，最多 8 名玩家。 |
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
