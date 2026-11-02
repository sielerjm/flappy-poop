# Translation notes — Flappy Poop (en ↔ zh-Hans)

Hand this file to an LLM (or a human reviewer) to check the Simplified Chinese UI.
Do **not** require reading `src/i18n.js`; the full table is below.

Draft and review may both be LLM-assisted. A native speaker pass before shipping to
GitHub Pages is still preferred.

## Product context

Flappy Poop is a gut-themed Flappy Bird clone for phone browsers (Phaser 4, no
bundler). A poop emoji flaps through intestinal-fold pipes. Pickups: fiber (+1),
probiotic (blocks one bacteria hit for 5 pipes), bad bacteria (−2, never kills).
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
- Untranslated tokens (must appear in both About bodies): `Flappy Poop`, `Michael Sieler`, `Phaser 4.2.1`, `MacKaffee`, version numbers.
- **Silent mode** = iPhone **hardware** ringer/silent switch → **静音模式** (not the in-game mute toggle).

## Glossary (items)

| English | Simplified Chinese |
|---|---|
| Fiber | 纤维 |
| Probiotic | 益生菌 |
| Bad bacteria | 有害细菌 |

Keep these three consistent everywhere (How to play rows, future copy).

## Tone

Short, playful, clear. Fit a 360×640 logical field; How to play / About body wrap at
~260 px with per-character wrap for Chinese. Prefer everyday words over clinical jargon.

## Full string table

| Key | English | Simplified Chinese |
|---|---|---|
| readyTitle | FLAPPY POOP | FLAPPY POOP |
| howToPlay | How to play | 玩法说明 |
| tapToFlap | tap to flap | 点击飞扑 |
| pauseTitle | PAUSED | 已暂停 |
| pauseHint | tap anywhere to resume game | 点击任意处继续游戏 |
| gameOver | GAME OVER | 游戏结束 |
| scoreLabel | SCORE | 得分 |
| bestLabel | BEST | 最高 |
| tapToRetry | tap to retry | 点击重试 |
| settingsTitle | SETTINGS | 设置 |
| sound | Sound | 声音 |
| haptics | Haptics | 震动 |
| on | ON | 开 |
| off | OFF | 关 |
| hapticsHint | Android only — iPhone has no vibrate | 仅 Android — iPhone 无法震动 |
| musicComingSoon | Music   coming soon | 音乐   即将推出 |
| aboutLink | About | 关于 |
| aboutTitle | ABOUT | 关于 |
| aboutBody | *(see block below)* | *(see block below)* |
| howToTitle | HOW TO PLAY | 玩法说明 |
| howToBody | Tap to flap. Pass a pipe pair for a point. Hit a pipe, the ceiling, or the floor and the run ends. On iPhone, Silent mode mutes the game — turn it off to hear sound. | 点击飞扑。穿过一对管道得一分。撞到管道、天花板或地面则本局结束。在 iPhone 上，静音模式会让游戏无声——关闭静音即可听到声音。 |
| itemFiberName | Fiber | 纤维 |
| itemFiberDetail | +1 point | +1 分 |
| itemProbioticName | Probiotic | 益生菌 |
| itemProbioticDetail | Blocks one bacteria hit for 5 pipes | 可抵挡一次有害细菌，持续 5 根管道 |
| itemBacteriaName | Bad bacteria | 有害细菌 |
| itemBacteriaDetail | −2 points (score never below 0). Does not kill. | −2 分（分数不低于 0）。不会致死。 |
| updatedPrefix | Updated | 更新于 |
| languageTitle | Language | 语言 |
| langEnglish | English | English |
| langChinese | 简体中文 | 简体中文 |

### aboutBody (English)

```
Flappy Poop

A gut-themed Flappy Bird clone.

This game was coded with the assistance of an LLM. The idea, game design, and all art are by Michael Sieler.

Credits
Code: JavaScript (ES modules) on Phaser 4.2.1 (MIT)
Art: Michael Sieler
Sound: "fart" by MacKaffee (Freesound / Pixabay)
Inspired by Flappy Bird
```

### aboutBody (zh-Hans)

```
Flappy Poop

一款肠道主题的 Flappy Bird 克隆。

本游戏在 LLM 协助下编写。创意、游戏设计与全部美术由 Michael Sieler 完成。

致谢
代码：JavaScript（ES 模块）与 Phaser 4.2.1（MIT）
美术：Michael Sieler
音效："fart" by MacKaffee（Freesound / Pixabay）
灵感来自 Flappy Bird
```

## Reviewer checklist

1. Fluency: natural Simplified Chinese, not word-for-word awkwardness.
2. Glossary: 纤维 / 益生菌 / 有害细菌 used consistently.
3. Silent mode: hardware 静音模式, not software mute.
4. Untranslated tokens still present in About.
5. Length: How to play body and About still readable in a 260 px wrap on a phone.
6. Pause / game over lines stay short (one or two lines).
