// What's new: one entry per shipped version, newest first. Pure data, Node-safe:
// the Changelog overlay renders it and tests/changelog.test.js keeps it honest
// (the first entry must be VERSION, so a bump without notes fails npm test and
// therefore npm run push). Dates are the push day, written like LAST_UPDATED.
// Work that shipped between two bumps is listed under the version it shipped as.

import { LOCALES } from './i18n.js';

export const CHANGELOG = [
  {
    version: '0.6.1',
    date: '7 Nov 2026',
    notes: {
      en: [
        'The probiotic / postbiotic icon beside its pipe count breathes gently while the count runs.',
        'In landscape (and on a desktop window) the bean button sits by your right thumb at the edge of the screen. A 👈 👉 row in Settings moves it to the left; your save code carries the choice.',
        'Resuming from a pause gives a gentle half-flap bounce instead of a full flap, so the poop no longer jumps into the pipe above.',
      ],
      'zh-Hans': [
        '益生菌 / 后生元图标在倒数期间会轻轻地一张一缩。',
        '横屏（以及电脑窗口）下，豆子按钮移到屏幕边缘、靠近右手拇指的位置。设置里新增 👈 👉 一行，可切换到左侧；你的存档码会记住这个选择。',
        '暂停后继续时只会轻轻弹起半次起飞的高度，而不是整次，便便不会再撞上上方的管道。',
      ],
    },
  },
  {
    version: '0.6.0',
    date: '7 Nov 2026',
    notes: {
      en: [
        'Two players: on a desktop or a tablet in landscape, a 👥 toggle under the toilet toggle starts a side-by-side race on the same course. Keyboard (W / Space and ↑ / Enter), controllers or a thumb on each half; the first death ends it and the higher score wins.',
        'In a race the other poop shows in your lumen as a faded ghost when it is near, and your progress bar marks where it is.',
        'A trailing player\'s mystery box helps: 10 pipes behind doubles the bean draws, 25 behind gives three beans at once.',
        'Two-player runs are not saved and never reach the leaderboard.',
        'How to play ends with a 🎮 Controls row: which buttons flap, fart and pause for one player and for two.',
      ],
      'zh-Hans': [
        '双人模式：在电脑或横屏平板上，如厕开关下方新增 👥 开关，可在同一条肠道上并排竞速。支持键盘（W / 空格 和 ↑ / 回车）、手柄，或各自点击自己的半边；一方出局即结束，得分高者获胜。',
        '竞速时，对手靠近你时会以半透明的影子出现在你的肠道里，进度条上也会标出对手的位置。',
        '落后的玩家会从神秘盒子获得帮助：落后 10 道管道时豆子的几率翻倍，落后 25 道时直接获得三颗豆子。',
        '双人模式的分数不会保存，也不会进入排行榜。',
        '玩法说明新增 🎮 操作方式一栏：单人和双人各用哪些按键起飞、放屁和暂停。',
      ],
    },
  },
  {
    version: '0.5.17',
    date: '7 Nov 2026',
    notes: {
      en: [
        'The scroll speed stops rising after level 3; levels 3 to 7 share one pace.',
        'From level 4 some pipe pairs drift slowly up and down, more of them and farther on later levels. The pair after a fart holds still.',
      ],
      'zh-Hans': [
        '滚动速度在第 3 关后不再增加；第 3 到 7 关保持同一节奏。',
        '从第 4 关起，有些管道会缓缓上下漂移，关卡越高漂移的管道越多、幅度越大。放屁后的第一道管道保持不动。',
      ],
    },
  },
  {
    version: '0.5.16',
    date: '7 Nov 2026',
    notes: {
      en: [
        'The top villi now pass in front of the pipes at pipe speed, like the floor; the poop cannot fly above them.',
        'Every version line says beta.',
        'This What\'s new page, from the Updated line in About.',
        'The leaderboard shows the top 25: scroll past the first ten.',
      ],
      'zh-Hans': [
        '顶部的绒毛现在像地面一样从管道前面以管道速度掠过；便便飞不到它们上面去。',
        '每处版本号后面都加上了“测试版”。',
        '新增这个“更新说明”页面，从“关于”里的“更新于”一行打开。',
        '排行榜显示前 25 名：滚动即可看到前十名之后的玩家。',
      ],
    },
  },
  {
    version: '0.5.15',
    date: '6 Nov 2026',
    notes: {
      en: ['The cream wall behind the villi fades only over its last sliver, so the colour stays solid elsewhere.'],
      'zh-Hans': ['绒毛后面的奶油色肠壁只在最靠近肠腔的一小段渐隐，其余部分保持实色。'],
    },
  },
  {
    version: '0.5.14',
    date: '6 Nov 2026',
    notes: {
      en: ['The cream wall behind the villi fades toward the open gut instead of ending on a hard line.'],
      'zh-Hans': ['绒毛后面的奶油色肠壁朝肠腔方向渐隐，不再以一条硬边结束。'],
    },
  },
  {
    version: '0.5.13',
    date: '6 Nov 2026',
    notes: {
      en: ['The back villi are a third shorter, so the middle of the gut stays clear.'],
      'zh-Hans': ['后排绒毛缩短了三分之一，肠道中部更加通畅。'],
    },
  },
  {
    version: '0.5.12',
    date: '6 Nov 2026',
    notes: {
      en: ['A cream wall behind the villi at the top and bottom; every villus tip reaches past its bar.'],
      'zh-Hans': ['顶部和底部的绒毛后面有了一道奶油色肠壁；每根绒毛的尖端都越过了它的横条。'],
    },
  },
  {
    version: '0.5.11',
    date: '6 Nov 2026',
    notes: {
      en: [
        'Controller support: A flaps, RT farts, Menu pauses, B backs out, the d-pad walks the buttons with a focus ring.',
        'Desktop gets a wider field with the first pipes already in view; rotating a phone mid-run pauses.',
        'A scared falling face on long drops, a new app icon, and villi that run off the screen edges with wavy tips.',
      ],
      'zh-Hans': [
        '支持手柄：A 拍翅，RT 放屁，Menu 暂停，B 返回，方向键配合焦点框在按钮间移动。',
        '桌面端视野更宽，开局就能看到前几根管道；游戏中旋转手机会暂停。',
        '长距离下落时露出惊恐表情，新的应用图标，绒毛延伸出屏幕边缘并带有起伏的尖端。',
      ],
    },
  },
  {
    version: '0.5.10',
    date: '3 Nov 2026',
    notes: {
      en: [
        'Levels: the gut comes in segments with a finish line, its own speed and colour, and a progress bar; clear the rectum to win.',
        'Fiber is worth +3, and eating it with a probiotic up makes a postbiotic that doubles your points for a while.',
        'Mystery boxes from level 3, a run summary on game over, score popups, and a Share button with a picture of your score.',
        'The leaderboard shows the level, with separate bests on and off the toilet; Reload game in Settings fetches the latest build.',
      ],
      'zh-Hans': [
        '关卡：肠道分成多段，各有终点线、速度、颜色和进度条；通过直肠即获胜。',
        '纤维值 +3；在益生菌生效时吃下它会生成后生元，让你的得分在一段时间内翻倍。',
        '第 3 关起出现神秘盒子，游戏结束有本局总结和得分弹窗，还有带得分图片的分享按钮。',
        '排行榜显示关卡，坐便与否分别记录最高分；设置里的“重新加载游戏”会获取最新版本。',
      ],
    },
  },
  {
    version: '0.5.9',
    date: '3 Nov 2026',
    notes: {
      en: ['Bad bacteria costs 3 points now that probiotics stack.'],
      'zh-Hans': ['既然益生菌可以叠加，坏细菌现在扣 3 分。'],
    },
  },
  {
    version: '0.5.8',
    date: '3 Nov 2026',
    notes: {
      en: ['Reload game link in Settings, so home-screen installs pick up a new build.'],
      'zh-Hans': ['设置里新增“重新加载游戏”链接，添加到主屏幕的版本也能更新。'],
    },
  },
  {
    version: '0.5.7',
    date: '3 Nov 2026',
    notes: {
      en: ['The bean power button sits in the middle of the tray and pulses with the glow.'],
      'zh-Hans': ['豆子能量按钮移到托盘中央，并随光晕一起脉动。'],
    },
  },
  {
    version: '0.5.6',
    date: '3 Nov 2026',
    notes: {
      en: ['The first pipe after a fart opens its gap at the height the poop floats.'],
      'zh-Hans': ['放屁结束后的第一根管道，缺口正好开在便便漂浮的高度。'],
    },
  },
  {
    version: '0.5.5',
    date: '3 Nov 2026',
    notes: {
      en: ['Pipes hold off late in a fart so the screen is clear when it ends.'],
      'zh-Hans': ['放屁快结束时暂停生成管道，结束时画面保持畅通。'],
    },
  },
  {
    version: '0.5.4',
    date: '3 Nov 2026',
    notes: {
      en: ['A fart floats the poop through the middle and clears the pipes ahead.'],
      'zh-Hans': ['放屁时便便漂浮在中间穿行，前方的管道会被清除。'],
    },
  },
  {
    version: '0.5.3',
    date: '3 Nov 2026',
    notes: {
      en: ['Probiotic pickups stack; a bacteria hit clears them all.'],
      'zh-Hans': ['益生菌可以叠加；撞上细菌会一次清空。'],
    },
  },
  {
    version: '0.5.2',
    date: '3 Nov 2026',
    notes: {
      en: ['A bigger speech-bubble poop on the ready screen; a bean is guaranteed by pipe 20.'],
      'zh-Hans': ['开始画面的气泡便便更大了；第 20 根管道前必定出现一颗豆子。'],
    },
  },
  {
    version: '0.5.1',
    date: '3 Nov 2026',
    notes: {
      en: ['The speech-bubble poop replaces the tap-to-flap button; single beans are rarer.'],
      'zh-Hans': ['带气泡的便便取代了“点击起飞”按钮；单颗豆子更稀有了。'],
    },
  },
  {
    version: '0.5.0',
    date: '3 Nov 2026',
    notes: {
      en: ['Beans bob between the pipes: eat one, then tap the poop to fart through the gut.'],
      'zh-Hans': ['豆子在管道之间上下漂浮：吃一颗，再点便便就能放屁冲过肠道。'],
    },
  },
  {
    version: '0.4.0',
    date: '3 Nov 2026',
    notes: {
      en: ['A toilet toggle on the ready screen; toilet scores get a 🚽 beside them.'],
      'zh-Hans': ['开始画面新增马桶开关；坐便得分旁会显示 🚽。'],
    },
  },
  {
    version: '0.3.3',
    date: '3 Nov 2026',
    notes: {
      en: ['The poop sits under the title, the buttons are reordered, and the start slides into play.'],
      'zh-Hans': ['便便位于标题下方，按钮重新排序，开始时滑入游戏。'],
    },
  },
  {
    version: '0.3.2',
    date: '3 Nov 2026',
    notes: {
      en: ['A profile button, a pipe row in How to play, and Settings without the music row.'],
      'zh-Hans': ['新增个人资料按钮，玩法说明里加入管道一行，设置里去掉了音乐一行。'],
    },
  },
  {
    version: '0.3.1',
    date: '3 Nov 2026',
    notes: {
      en: ['Button chrome, a Save / Load User button, a profile line, and a High scores overlay.'],
      'zh-Hans': ['按钮外观、“存档 / 载入用户”按钮、个人资料一行和最高分页面。'],
    },
  },
  {
    version: '0.3.0',
    date: '3 Nov 2026',
    notes: {
      en: ['Save codes: copy a code to keep your username and top scores, and load it on another device.'],
      'zh-Hans': ['存档码：复制一段代码保存用户名和最高分，可在其他设备上载入。'],
    },
  },
  {
    version: '0.2.8',
    date: '2 Nov 2026',
    notes: {
      en: ['Pipes and the background always cover the whole playfield.'],
      'zh-Hans': ['管道和背景始终覆盖整个游戏区域。'],
    },
  },
  {
    version: '0.2.7',
    date: '2 Nov 2026',
    notes: {
      en: ['Simplified Chinese with a language picker; a feedback button that opens GitHub issue forms.'],
      'zh-Hans': ['新增简体中文和语言选择；反馈按钮可打开 GitHub 问题表单。'],
    },
  },
  {
    version: '0.2.6',
    date: '2 Nov 2026',
    notes: {
      en: ['How to play mentions the iPhone Silent switch; tap outside a panel to close it.'],
      'zh-Hans': ['玩法说明提到了 iPhone 静音开关；点击面板外部即可关闭。'],
    },
  },
  {
    version: '0.2.5',
    date: '2 Nov 2026',
    notes: {
      en: ['Sharper player and item art, with hitboxes scaled to match.'],
      'zh-Hans': ['更清晰的角色和道具图像，碰撞范围同步缩放。'],
    },
  },
  {
    version: '0.2.4',
    date: '2 Nov 2026',
    notes: {
      en: ['How to play opens from About; an Updated stamp under the version.'],
      'zh-Hans': ['可从“关于”打开玩法说明；版本号下方显示更新时间。'],
    },
  },
  {
    version: '0.2.3',
    date: '2 Nov 2026',
    notes: {
      en: ['A How to play overlay; a small bounce on unpause; iOS audio fixes.'],
      'zh-Hans': ['新增玩法说明页面；取消暂停时轻轻弹起；修复 iOS 音频。'],
    },
  },
  {
    version: '0.2.2',
    date: '2 Nov 2026',
    notes: {
      en: ['Tray buttons respond where they are drawn; sound unlocks on the first tap on iOS.'],
      'zh-Hans': ['托盘按钮在绘制位置准确响应；iOS 上首次点击即可解锁声音。'],
    },
  },
  {
    version: '0.2.1',
    date: '2 Nov 2026',
    notes: {
      en: ['An About overlay; a paused run waits for a tap.'],
      'zh-Hans': ['新增“关于”页面；暂停的游戏等待点击后继续。'],
    },
  },
  {
    version: '0.2.0',
    date: '1 Nov 2026',
    notes: {
      en: ['Fiber, probiotic and bad bacteria pickups, the button tray, and credits.'],
      'zh-Hans': ['纤维、益生菌和坏细菌道具，按钮托盘和致谢。'],
    },
  },
  {
    version: '0.1.0',
    date: '1 Nov 2026',
    notes: {
      en: ['First playable: flap a poop through the gut.'],
      'zh-Hans': ['首个可玩版本：操控便便在肠道里拍翅飞行。'],
    },
  },
];

/** The entry for a version, or undefined. */
export function changelogEntry(version) {
  return CHANGELOG.find((e) => e.version === version);
}

/** One version's bullets as one block of text for a locale (English when the locale has none). */
export function changelogNotes(entry, locale) {
  const lines = entry.notes[LOCALES.includes(locale) ? locale : 'en'] ?? entry.notes.en;
  return lines.map((line) => `• ${line}`).join('\n');
}
