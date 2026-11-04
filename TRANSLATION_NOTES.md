# Translation notes — Flappy Poop (en ↔ zh-Hans)

Hand this file to an LLM (or a human reviewer) to check the Simplified Chinese UI.
Do **not** require reading `src/i18n.js`; the full table is below.

Draft and review may both be LLM-assisted. A native speaker pass before shipping to
GitHub Pages is still preferred.

## Product context

Flappy Poop is a gut-themed Flappy Bird clone for phone browsers (Phaser 4, no
bundler). A poop emoji flaps through intestinal-fold pipes. Pickups: fiber (+1),
probiotic (blocks one bacteria hit for 5 pipes; pickups stack), bad bacteria (−3, never kills).
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
- **User code** / save code (用户码 / 存档码) = the `fp1.…` string players copy between devices. The home-screen button is **Save / Load User**; the panel labels are **Username**, **Save user code**, **Load user code**, and a **Save** button at the bottom that stores the username. `{name}` and `{scores}` are placeholders filled at runtime; keep them verbatim.
- **Leaderboard** (排行榜) = the shared online Top 10 behind the 🏆 tray button. Only players with a username are on it; `{score}` may carry a 🚽, `{rank}` / `{total}` are numbers. Keep the placeholders verbatim.

## Glossary (items)

| English | Simplified Chinese |
|---|---|
| Pipe | 管道 |
| Beans | 豆子 |
| Fiber | 纤维 |
| Probiotic | 益生菌 |
| Bad bacteria | 有害细菌 |

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
| levelShort | LV {n} | 第{n}关 |
| level.stomach | Stomach | 胃 |
| level.duodenum | Duodenum | 十二指肠 |
| level.jejunum | Jejunum | 空肠 |
| level.ileum | Ileum | 回肠 |
| level.caecum | Caecum | 盲肠 |
| level.colon | Colon | 结肠 |
| level.rectum | Rectum | 直肠 |
| gameOver | GAME OVER | 游戏结束 |
| scoreLabel | SCORE | 得分 |
| bestLabel | BEST | 最高 |
| tapToHome | tap to go home | 点击返回主界面 |
| settingsTitle | SETTINGS | 设置 |
| sound | Sound | 声音 |
| haptics | Haptics | 震动 |
| on | ON | 开 |
| off | OFF | 关 |
| hapticsHint | Android only — iPhone has no vibrate | 仅限 Android——iPhone 不支持震动 |
| reloadGame | Reload game | 刷新游戏 |
| aboutLink | About | 关于 |
| aboutTitle | ABOUT | 关于 |
| aboutName | Flappy Poop | Flappy Poop |
| aboutTagline | A gut-themed Flappy Bird clone. | 一款肠道主题的 Flappy Bird 克隆。 |
| aboutBlurb | The idea, game design, and all art were created by Michael Sieler. | 创意、游戏设计与全部美术均由 Michael Sieler 创作。 |
| aboutLlmNote | This game was coded with the assistance of an LLM. | 本游戏在 LLM 协助下编写。 |
| aboutCreditsTitle | Credits | 致谢 |
| aboutCredits | *(see block below)* | *(see block below)* |
| howToTitle | HOW TO PLAY | 玩法说明 |
| howToBody | Tap to flap. Hit a pipe, the ceiling, or the floor and the run ends. On iPhone, Silent mode mutes the game — turn it off to hear sound. | 点击起飞。撞到管道、天花板或地面则本局结束。在 iPhone 上，静音模式会让游戏无声——关闭静音即可听到声音。 |
| itemPipeName | Pipe | 管道 |
| itemPipeDetail | This is a pipe. Dodge the pipes for as long as possible. You gain 1 point for every pipe you dodge. | 这是管道。尽量长时间躲开管道。每躲过一道管道得 1 分。 |
| itemFiberName | Fiber | 纤维 |
| itemFiberDetail | +3 points. Bobs up and down between the pipes. | +3 分。在管道之间上下漂浮。 |
| itemProbioticName | Probiotic | 益生菌 |
| itemProbioticDetail | Protects you against bad bacteria for 5 pipes. Subsequent probiotics stack, but hitting a bad bacteria uses them all up. | 在 5 道管道内保护你不受有害细菌伤害。后续益生菌可叠加，但撞到有害细菌会全部用完。 |
| itemBacteriaName | Bad bacteria | 有害细菌 |
| itemBacteriaDetail | −3 points | −3 分 |
| itemBeanName | Beans | 豆子 |
| itemBeanDetail | Grab a bean, then press the bean button at the bottom (or your poop) to fart past the next 5 pipes: nothing can touch you. Beans stack to 3; fart with all three and you rocket past 20 in a rainbow glow. | 吃到豆子后，点击底部的豆子按钮（或便便）放屁冲过接下来的 5 道管道，期间什么都碰不到你。豆子最多可攒 3 颗；集齐 3 颗再放屁，就能顶着彩虹光芒一口气冲过 20 道管道。 |
| itemToiletName | On the toilet | 如厕模式 |
| itemToiletDetail | Playing on the toilet? Flip the switch under the poop on the home screen. Those scores get a 🚽 next to them. | 在马桶上玩？打开主界面便便下方的开关，这些分数旁会显示 🚽。 |
| itemLevelsName | Levels | 关卡 |
| itemLevelsDetail | The gut comes in levels: stomach, duodenum, jejunum and on. Pass a checkered finish line to clear one; the game pauses for a breather, then each level scrolls a little faster. The bar at the top shows how far you are. | 肠道分成关卡：胃、十二指肠、空肠……越过黑白格终点线即可过关；游戏会稍作停顿，之后每一关都会滚得更快一些。顶部的进度条显示你走到了哪里。 |
| updatedPrefix | Updated | 更新于 |
| languageTitle | Language | 语言 |
| langEnglish | English | English |
| langChinese | 简体中文 | 简体中文 |
| feedbackTitle | FEEDBACK | 反馈 |
| feedbackBody | Report a bug or suggest a feature. Opens GitHub in your browser — you need a GitHub account to submit. | 报告问题或提出功能建议。将在浏览器中打开 GitHub——提交需要 GitHub 账号。 |
| bugReport | Bug | 问题反馈 |
| featureRequest | Feature request | 功能建议 |
| feedbackLink | Bug or feature request? | 问题或功能建议？ |
| saveLoadButton | Save / Load User | 存档 / 载入用户 |
| saveTitle | SAVE / LOAD USER | 存档 / 载入用户 |
| saveIntro | Copy your code to keep your name and top scores on another phone or browser. Paste it there to load them. Press the Save button to save your username. | 复制存档码，即可在其他手机或浏览器保留你的名字和最高分。在那里粘贴即可载入。按“保存”可保存用户名。 |
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
| saveWelcome | Welcome back, {name} — {scores} | 欢迎回来，{name}——{scores} |
| saveWelcomeNoScores | Welcome back, {name} | 欢迎回来，{name} |
| saveNameRequired | Enter a username first (1–16 characters) | 请先输入用户名（1–16 个字符） |
| saveErrorDamaged | Save code is damaged or was edited | 存档码已损坏或被修改 |
| saveErrorUnrecognised | Unrecognised save code | 无法识别的存档码 |
| newTopHint | New high score! Press Save / Load User on the home screen to save it. | 新高分！在主界面点击“存档 / 载入用户”即可保存。 |
| scoresTitle | HIGH SCORES | 最高分 |
| scoresEmpty | No scores yet | 暂无分数 |
| leaderboardTitle | LEADERBOARD | 排行榜 |
| leaderboardLoading | Loading… | 加载中… |
| leaderboardOffline | Can't reach the leaderboard | 无法连接排行榜 |
| leaderboardJoin | Set a username in Save / Load User to join | 在“存档 / 载入用户”中设置用户名即可上榜 |
| leaderboardRank | Your best {score} is #{rank} of {total} | 你的最高分 {score} 排在第 {rank} 名（共 {total} 人） |
| leaderboardNotYet | Your best is not on the board yet | 你的最高分尚未上榜 |
| leaderboardLevel | LV | 关卡 |
| saveLeaderboardNote | Your username and best score are shown on the public leaderboard | 你的用户名和最高分会显示在公开排行榜上 |
| profilePrompt | Enter username | 输入用户名 |

### aboutCredits (English)

```
Code: JavaScript / Phaser 4.2.1 (MIT)
Art: Michael Sieler
Death fart: MacKaffee (Freesound / Pixabay)
Power fart: "fart sound effect (reed)" (Pixabay)
Thanks to Tori Schummer for help with ideation
Inspired by Flappy Bird
```

### aboutCredits (zh-Hans)

```
代码：JavaScript / Phaser 4.2.1（MIT）
美术：Michael Sieler
死亡屁声：MacKaffee（Freesound / Pixabay）
放屁冲刺音效："fart sound effect (reed)"（Pixabay）
感谢 Tori Schummer 协助构思
灵感来自 Flappy Bird
```

## Reviewer checklist

1. Fluency: natural Simplified Chinese, not word-for-word awkwardness.
2. Glossary: 纤维 / 益生菌 / 有害细菌 used consistently.
3. Silent mode: hardware 静音模式, not software mute.
4. Untranslated tokens still present in About.
5. Length: How to play body and About still readable in a 520 px wrap on a phone.
6. Pause / game over lines stay short (one or two lines).
