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
💰 button under the banner opens it (fiber, one bean, a super fart that fills the bean bag, a
mystery box). 💰 is the coin glyph and is not translated; "💰 12" style labels need no strings.
The How to play row calls them **Kernels** (玉米粒) and keeps to a short line; the shop and the rest of
the UI keep **coins** (金币). The iPhone Silent-mode note is its own last How to play row, **Sound** (声音, shown with 🔊).
In two players each half shops in its own level break, and a shop open on either half holds the
shared start (the other player reads **Waiting for P{n}…** until it closes).
Test mode (测试模式): a developer sandbox turned on by typing a trigger word as the username. Its
Settings rows (start level as "Start at LV n", Invincible ON/OFF, power-up buttons, Exit) and its
messages are terse developer copy; test runs never save a score.
Game over has a Share button: the share sheet gets a picture card (GAME OVER, the poop, score,
pickup counts, and shareCardPlay's "Play: <link>" footer) plus shareText ({score} may carry a 🚽,
{level} is the short level label, {url} the game's link; keep every placeholder).
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
- Untranslated tokens (must appear across About strings): `Flappy Poop`, `Michael Sieler`, `Phaser 4.2.1`, `MacKaffee`, `Pixabay`, `fart sound effect (reed)`, `Tori Schummer`, version numbers.
- **Silent mode** = iPhone **hardware** ringer/silent switch → **静音模式** (not the in-game mute toggle).
- **Toilet mode** (如厕模式) = the ready-screen switch; scores from such runs carry a 🚽 (not translated).
- **User code** / save code (用户码 / 存档码) = the `fp1.…` string players copy between devices. The home-screen user button reads **Load user** (载入用户) until a username is set, then the name and best; it opens the panel titled **SAVE / LOAD USER**, whose labels are **Username**, **Save user code**, **Load user code**, and a **Save** button at the bottom that stores the username. `{name}` and `{scores}` are placeholders filled at runtime; keep them verbatim.
- **One player across devices** (2026-11-08): every browser has its own secret id; the leaderboard treats ids merged through a user code as one player (aliases). A **username belongs to the player holding it on the board**: typing a held name on a new browser is refused (`saveNameTaken`), and the way in is to paste the user code (`saveIntro` step 3, `saveMerged`). **The **board's name wins** (2026-11-09): a rename typed on one device reaches the others on their own (`saveIntro` step 4, 自动更新); only a name typed on a device overrides the board. **Clear** (清除) signs this device out after a second tap (`saveClearConfirm`, `saveCleared`): the name, id and scores are forgotten on the device only. "Sign out" is the plain sense (退出), not an account system. `{name}` stays verbatim.
- **Leaderboard** (排行榜) = the shared online Top 25 behind the 🏆 tray button. Only players with a username are on it; `{score}` may carry a 🚽, `{rank}` / `{total}` are numbers. Keep the placeholders verbatim.
- **Two players** (双人模式) = the 👥 switch under the toilet toggle, offered only on a landscape screen wide enough for two halves (desktop, tablet). P1 is the left half, P2 the right; `{n}` is the player number, and `{name}` is "P1" / "P2" (versusPlayer) or, in a tournament race, the competitor's name. A crash does not end a two-player run (the poop is put back mid-screen). Levels start together: the first one over a finish line waits under **Waiting for {name}…** until the other arrives; then each player taps ready (**Tap when ready**, then **Ready! Waiting for {name}…** with a smaller **Tap again to un-ready** under it), and once both are ready a shared 3-2-1-GO starts the level as **GO!** appears (with a toilet flush). The match is decided on points once both players have cleared the last level, and the first one out waits under **Made it out!** / **Waiting for P{n}…**. Two-player runs never reach the leaderboard or the save code.

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
| levelShopHint | Tap to continue · 💰 to shop | 点击继续 · 💰 进商店 |
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
| itemCoinDetail | A golden corn kernel. Kernels go into your purse and can be redeemed for items in the shop. Tap 💰 to open the shop in between levels. | 金黄的玉米粒。玉米粒会进入钱袋，可在商店兑换物品。关卡之间点击 💰 打开商店。 |
| itemMysteryName | Mystery box | 神秘盒子 |
| itemMysteryDetail | Mystery boxes contain a random surprise item. | 神秘盒子里装有随机惊喜道具。 |
| itemToiletName | On the toilet | 如厕模式 |
| itemToiletDetail | Playing on the toilet? Flip the switch under the poop on the home screen. Those scores get a 🚽 next to them. | 在马桶上玩？打开主界面便便下方的开关，这些分数旁会显示 🚽。 |
| itemLevelsName | Levels | 关卡 |
| itemControlsName | Controls | 操作方式 |
| itemControlsDetail | One player: tap or click to flap; the bean button (or the poop) farts. Keyboard: Space or ↑ flaps, B farts, P or Esc pauses. Controller: A flaps, RT farts, Menu pauses. Two players (the 👥 toggle): P1 flaps with W or Space and farts with E or Left Shift; P2 flaps with ↑ or Enter and farts with Right Shift or Numpad 0. A controller (A, RT) or a tap on your half works too. In a level break your fart button (B, RT, E…) opens and closes the 💰 shop. | 单人：点击起飞；按豆子按钮（或便便）放屁。键盘：空格或 ↑ 起飞，B 放屁，P 或 Esc 暂停。手柄：A 起飞，RT 放屁，Menu 暂停。双人模式（👥 开关）：玩家 1 用 W 或空格起飞、E 或左 Shift 放屁；玩家 2 用 ↑ 或回车起飞、右 Shift 或小键盘 0 放屁。也可以用手柄（A、RT）或点击你这一侧。过关休息时，放屁键（B、RT、E 等）可打开或关闭 💰 商店。 |
| itemSoundName | Sound | 声音 |
| itemSoundDetail | On iPhone, Silent mode mutes the game - turn it off to hear sound. | 在 iPhone 上，静音模式会让游戏无声——关闭静音即可听到声音。 |
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
| saveNamePlaceholder | 1–16 characters | 1–16 个字符 |
| saveYourCode | Save user code | 保存用户码 |
| saveCopy | Copy | 复制 |
| saveCopied | Copied | 已复制 |
| saveLoadLabel | Load user code | 载入用户码 |
| saveLoad | Load | 载入 |
| saveLoadPlaceholder | Paste a code | 粘贴存档码 |
| saveSave | Save | 保存 |
| saveNameSaved | Username saved | 用户名已保存 |
| testModeOn | Test mode on — scores won't be saved | 测试模式已开启——分数不会保存 |
| testModeOff | Test mode off | 测试模式已关闭 |
| saveWelcome | Welcome back, {name} — {scores} | 欢迎回来，{name}——{scores} |
| saveWelcomeNoScores | Welcome back, {name} | 欢迎回来，{name} |
| saveNameRequired | Enter a username first (1–16 characters) | 请先输入用户名（1–16 个字符） |
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
| shareText | I scored {score} on Flappy Poop ({level})! {url} | 我在 Flappy Poop 拿到了 {score} 分（{level}）！{url} |
| testRunNotSaved | Test run — score not saved | 测试局——分数未保存 |
| scoresEmpty | No scores yet | 暂无分数 |
| leaderboardTitle | LEADERBOARD | 排行榜 |
| leaderboardLoading | Loading… | 加载中… |
| leaderboardOffline | Can't reach the leaderboard | 无法连接排行榜 |
| leaderboardJoin | Tap Load user on the home screen to set a username and join | 在首页点“载入用户”设置用户名即可上榜 |
| leaderboardRank | Your best {score} is #{rank} of {total} | 你的最高分 {score} 排在第 {rank} 名（共 {total} 人） |
| leaderboardNotYet | Your best is not on the board yet | 你的最高分尚未上榜 |
| leaderboardNameTaken | Your username belongs to another player: tap your name on the home screen to fix it | 你的用户名属于另一位玩家：请在首页点你的名字处理 |
| leaderboardLevel | LV | 关卡 |
| saveLeaderboardNote | Your username and best score are shown on the public leaderboard | 你的用户名和最高分会显示在公开排行榜上 |
| loadUserButton | Load user | 载入用户 |
| versusTitle | 2 PLAYERS | 双人模式 |
| versusPlayer | P{n} | 玩家{n} |
| versusJoinPrompt | press your flap button | 按下你的起飞键 |
| versusJoinReady | ready! | 准备好了！ |
| versusJoinHint | Keyboard: W / Space or ↑ / Enter · a controller · tap your half | 键盘：W / 空格 或 ↑ / 回车 · 手柄 · 点击你这一侧 |
| versusGo | GO! | 出发！ |
| versusWins | {name} WINS! | {name} 获胜！ |
| versusDraw | DRAW | 平局 |
| versusRematch | Rematch | 再来一局 |
| versusNotSaved | Two-player runs are not saved | 双人模式的分数不会保存 |
| versusEscaped | Made it out! | 顺利排出！ |
| versusWaiting | Waiting for {name}… | 等待{name}… |
| versusTapReady | Tap when ready | 准备好了就点一下 |
| versusReadyWaiting | Ready! Waiting for {name}… | 已准备！等待{name}… |
| tournamentContinue | Continue | 继续 |
| tournamentByDeaths | Fewer crashes | 撞得更少 |
| tournamentByLevelWins | More finish lines first | 率先过线的关卡更多 |
| tournamentByFinalFirst | First across the line | 率先冲过终点线 |
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
Thanks to Tori Schummer for help with ideation
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
感谢 Tori Schummer 协助构思
灵感来自 Flappy Bird
```

## Reviewer checklist

1. Fluency: natural Simplified Chinese, not word-for-word awkwardness.
2. Glossary: 纤维 / 益生菌 / 后生元 / 有害细菌 / 神秘盒子 used consistently.
3. Silent mode: hardware 静音模式, not software mute.
4. Untranslated tokens still present in About.
5. Length: How to play body and About still readable in a 520 px wrap on a phone.
6. Pause / game over lines stay short (one or two lines).
