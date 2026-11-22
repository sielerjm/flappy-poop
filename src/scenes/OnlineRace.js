import '../phaserReady.js'; // first: Phaser exists before this module runs (plan 35, 1.2)
import { GAME_HEIGHT, FIELD, TUNING as T } from '../config.js';
import { fieldWidth, uiColumn, overButtonsLayout, overHit, canRestart, fitScale } from '../logic.js';
import { createMatch } from '../versus.js';
import { t, levelLabel } from '../i18n.js';
import { raceOutcome } from '../tournament.js';
import { ONLINE_HOST_KEY, RESUME_VERSION, countdownStep, createFieldFit, createRaceFeed, createRacePause, createRaceReferee, createRaceReporter, createWakeLock, levelSnap, localPhase, pauseOverlay, raceNetStats, raceReport, raceRoomItem, raceStartPlan, reportLine, rewindOnHeard, startSnap } from '../onlineRace.js';
import { racePhase } from '../online.js';
import { createOnlineFriends } from '../onlineFriends.js';
import { sfx, unlock } from '../sound.js';
import { createButton } from '../ui/button.js';

const STYLE = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center', stroke: '#5a2a44', strokeThickness: 12 };
const DOT = { good: 0x5ad15a, slow: 0xffd27a, paused: 0xffd27a, lost: 0xff5a6a };
const GREEN = '#7ee08a';
const NET_DOWN = new Set(['lost', 'offline', 'link', 'busy']);
const PILL_W = 280; // px, the opponent's card
const PINK = '#f8a0c8';
const GOLD = '#ffd700';
const GREY = '#c9b8dc';

/**
 * The online race (plan 39, 1.7a and 1.7b): the match host (item 39's interface,
 * tests/matchHost.test.js) for one local Play, launched as player 1 at the agreed field width
 * (item 14), centred on this device's canvas. The other seat is a remote feed (src/onlineRace.js)
 * written into match.slots[1] every frame, so Play's ghost and rival marker read it as they read the
 * other half in split screen. The 3-2-1-GO runs on the server clock to the room's GO time
 * (set_room_status's start_ms), so both devices start together. The opponent's pill (Preview C3)
 * shows their name, live score and the link's dot.
 * The level breaks (1.7b) follow the split-screen rules over the wire through the referee
 * (createRaceReferee): the host judges who crossed each line first (its verdict comes back as
 * Play.awardLevelFirst), both tap ready after the arrival beat, the host's GO starts the next level
 * on both devices at one server ms, and a ready taken back during the count calls it off. The run's
 * end waits for the final line's verdict, so both devices reach one raceOutcome from the same
 * numbers; the host then marks the room finished. A rematch (wantRematch, both asking) is the
 * room's next round: a new seed, and this scene restarted on it.
 * One field width (item 14, AUD-097): until GO both sides send their field width (createFieldFit),
 * and a width from the other side that moves the agreed one restarts this scene on it, so a phone
 * turned after the lobby opened still races on the same field as the other device.
 * Reload resume (2.3, D4): each level break keeps this side's level start (score, purse, beans,
 * probiotic, crashes, level wins) in the resume record (localStorage since 2.3b). After a reload the
 * panel rejoins the room and starts this scene rewound ({ resume }): Play at that level's start,
 * held under the pause overlay ('rewind') until this side's Ready, and a `rewind` on the wire until
 * its GO. The other side restarts at the lower of the two level starts, so both race that level
 * again from its first pair; the shared pause's count gives one GO.
 * 2.3b: the record is in localStorage with this page as its owner, beaten every
 * online.resume.beatMs from a window timer (Phaser's loop stops in a hidden tab), so a relaunched app
 * rejoins once the beat is stale; a page whose race another page took over (it was frozen past
 * staleMs) steps aside when it wakes: the transport closed without leaving the room, back to the
 * ready screen, whose 🌐 window says the race runs in another window.
 * 2.5: once the race is over both devices report it (finish_match through createRaceReporter, from
 * the numbers the outcome came from, in seat order); the results panel's line says whether it was
 * saved to the 🏅 and 🏆 boards, and if not, why. A race left mid-way is never reported.
 * Started by the tournament panel once the room is 'playing' with { net, lobby, plan, store }. 1.8
 * adds the results panel (Rematch | Leave); Tier 2 a peer leaving and the shared pause.
 */
export class OnlineRace extends Phaser.Scene {
  constructor() {
    super(ONLINE_HOST_KEY);
  }

  create(data) {
    this.initRace(data);
    const W = this.W;
    if (this.scale.width !== W || this.scale.height !== GAME_HEIGHT) this.scale.setGameSize(W, GAME_HEIGHT);
    const fieldW = this.fieldW;
    const fieldX = Math.floor((W - fieldW) / 4) * 2; // centred, on an even pixel
    this.fieldX = fieldX;
    this.locale = this.scene.get('Play')?.locale ?? 'en';

    this.scene.launch('Play', this.launchData());
    this.scene.bringToTop();

    const cx = fieldX + fieldW / 2;
    this.cx = cx;
    this.fieldX0 = fieldX; // where this scene's own HUD was laid out; a turn mid-race shifts it (onFieldResize)
    this.shiftX = 0;
    this.countText = this.add.text(cx, GAME_HEIGHT * 0.45, '', { ...STYLE, fontSize: '160px', strokeThickness: 16 }).setOrigin(0.5).setDepth(55).setVisible(false);
    // Item 14: a field narrowed to the other player's smaller screen says so under the count.
    const them = this.plan.names[1];
    this.fitText = this.add
      .text(cx, GAME_HEIGHT * 0.45 + 140, t(this.locale, 'onlineFitting').replace('{name}', them), { ...STYLE, fontSize: '30px', strokeThickness: 6, wordWrap: { width: fieldW - 60, useAdvancedWrap: true } })
      .setOrigin(0.5)
      .setDepth(55)
      .setVisible(fieldW < W);

    // The opponent's pill (Preview C3): top left of the field, under the level bar.
    const x = fieldX + uiColumn(fieldW, FIELD).x + 28;
    const y = T.hudScoreY;
    this.hud = {
      card: this.add.rectangle(x - 14, y - 34, PILL_W, 112, 0x1a0b14, 0.55).setOrigin(0, 0).setStrokeStyle(3, 0xe85e96, 0.8).setDepth(20),
      dot: this.add.circle(x + 10, y, 11, DOT.good).setStrokeStyle(3, 0x1a0b14).setDepth(21),
      name: this.add.text(x + 30, y, them, { ...STYLE, fontSize: '30px', color: '#f8a0c8', strokeThickness: 6, align: 'left' }).setOrigin(0, 0.5).setDepth(21),
      score: this.add.text(x + 30, y + 46, '0', { ...STYLE, fontSize: '48px', strokeThickness: 8, align: 'left' }).setOrigin(0, 0.5).setDepth(21),
      word: this.add.text(x + 30, y + 92, '', { ...STYLE, fontSize: '26px', strokeThickness: 5, align: 'left' }).setOrigin(0, 0.5).setDepth(21).setVisible(false),
      link: null,
    };
    // A long username shrinks to the card (Michael, 20 Nov): the card's width less the dot's column and a margin.
    this.hud.name.setScale(fitScale(this.hud.name.width, PILL_W - 14 - 30 - 12, 0));

    // Item 15: the wait in a break (ready) or at the finish (out first): a timer under the ready line,
    // then, after waitOfferMs, "<name> is taking a while" with Keep waiting | Leave.
    const by = GAME_HEIGHT * 0.4;
    this.waitText = this.add.text(cx, by + 178, '', { ...STYLE, fontSize: '30px', color: GREY, strokeThickness: 6 }).setOrigin(0.5).setDepth(30).setVisible(false);
    this.offerText = this.add.text(cx, by + 250, t(this.locale, 'onlineWaitLong').replace('{name}', them), { ...STYLE, fontSize: '32px', color: GOLD, strokeThickness: 6, wordWrap: { width: fieldW - 60, useAdvancedWrap: true } }).setOrigin(0.5).setDepth(30).setVisible(false);
    const bw = T.over.buttonWidth;
    const gap = 24;
    this.offerBoxes = {
      keep: { id: 'keep', x: cx - (bw + gap) / 2, y: by + 340, width: bw, height: T.over.buttonHeight },
      leave: { id: 'leave', x: cx + (bw + gap) / 2, y: by + 340, width: bw, height: T.over.buttonHeight },
    };
    this.keepButton = createButton(this, this.offerBoxes.keep, t(this.locale, 'onlineKeepWaiting'), { ...STYLE, fontSize: '34px', strokeThickness: 8 }, { depth: 30, fillAlpha: 0.85 }).setVisible(false);
    this.leaveButton = createButton(this, this.offerBoxes.leave, t(this.locale, 'onlineLeave'), { ...STYLE, fontSize: '34px', strokeThickness: 8 }, { depth: 30, fillAlpha: 0.85 }).setVisible(false);
    this.buildPauseOverlay(cx, fieldW);
    this.input.on('pointerdown', (pointer) => this.onPointer(pointer));
    // 2.1 / 2.2: a hidden page gets no frames, so its pause goes from the handler (the other side pauses one latency later).
    // 2.3b: a page that wakes first reads whether another page took its race over (onWake).
    this.onVisibility = () => this.onWake();
    globalThis.document?.addEventListener?.('visibilitychange', this.onVisibility);
    // 2.3b: the record's beat, on a window timer (Phaser's loop stops in a hidden tab; a 1 s timer still runs there).
    this.beatTimer = globalThis.setInterval?.(() => this.beatRecord(), T.online.resume.beatMs) ?? null;
    this.events.once('shutdown', () => {
      globalThis.document?.removeEventListener?.('visibilitychange', this.onVisibility);
      if (this.beatTimer !== null) globalThis.clearInterval?.(this.beatTimer);
      this.beatTimer = null;
      this.wake?.want(false);
      this.feed = null;
      this.referee = null;
      this.pause = null;
    });
  }

  /**
   * The shared pause's overlay (2.2): a panel over the field with why the race stopped, each
   * player's ready mark, the time paused and Ready | Leave (Leave asks twice: it ends the race for
   * both, with no winner). The resume's 3-2-1 runs on countText with the panel down.
   */
  buildPauseOverlay(cx, fieldW) {
    const pw = Math.min(T.versus.resultPanelW, fieldW - 48);
    const py = GAME_HEIGHT * 0.45; // below the opponent's pill, which grows to y 228 with its word
    const top = py - 280;
    const left = cx - pw / 2 + 36;
    const right = cx + pw / 2 - 36;
    const bw = Math.min(T.over.buttonWidth, (pw - 72) / 2);
    const gap = 24;
    const [me, them] = this.plan.names;
    const row = (y, name) => ({
      name: this.add.text(left, y, name, { ...STYLE, fontSize: '34px', color: PINK, strokeThickness: 7, align: 'left' }).setOrigin(0, 0.5).setDepth(61),
      mark: this.add.text(right, y, '', { ...STYLE, fontSize: '32px', color: GREY, strokeThickness: 7, align: 'right' }).setOrigin(1, 0.5).setDepth(61),
    });
    const ui = {
      panel: this.add.rectangle(cx, py, pw, 560, 0x1a0b14, 0.97).setStrokeStyle(6, 0xe85e96).setDepth(60),
      title: this.add.text(cx, top + 70, '', { ...STYLE, fontSize: '52px' }).setOrigin(0.5).setDepth(61), // one line, shrunk to the panel (a long name)
      sub: this.add.text(cx, top + 136, '', { ...STYLE, fontSize: '28px', color: GREY, strokeThickness: 6, wordWrap: { width: pw - 60, useAdvancedWrap: true } }).setOrigin(0.5).setDepth(61),
      me: row(top + 214, `${me} ${t(this.locale, 'tournamentHostTag')}`),
      them: row(top + 274, them),
      clock: this.add.text(cx, top + 342, '', { ...STYLE, fontSize: '28px', color: GREY, strokeThickness: 6 }).setOrigin(0.5).setDepth(61),
      warn: this.add.text(cx, top + 512, '', { ...STYLE, fontSize: '26px', color: GOLD, strokeThickness: 6, wordWrap: { width: pw - 60, useAdvancedWrap: true } }).setOrigin(0.5).setDepth(61),
      boxes: {
        ready: { id: 'ready', x: cx - (bw + gap) / 2, y: top + 432, width: bw, height: T.over.buttonHeight },
        leave: { id: 'leave', x: cx + (bw + gap) / 2, y: top + 432, width: bw, height: T.over.buttonHeight },
        alone: { id: 'leave', x: cx, y: top + 432, width: bw, height: T.over.buttonHeight },
      },
      shown: null,
      titleW: pw - 60,
    };
    for (const r of [ui.me, ui.them]) r.name.setScale(fitScale(r.name.width, pw / 2 + 20, 0));
    ui.ready = createButton(this, ui.boxes.ready, t(this.locale, 'onlineReady'), { ...STYLE, fontSize: '36px', strokeThickness: 8 }, { depth: 61, fillAlpha: 0.9 });
    ui.leave = createButton(this, ui.boxes.leave, t(this.locale, 'onlineLeave'), { ...STYLE, fontSize: '36px', strokeThickness: 8 }, { depth: 61, fillAlpha: 0.9 });
    ui.leaveAlone = createButton(this, ui.boxes.alone, t(this.locale, 'onlineLeave'), { ...STYLE, fontSize: '36px', strokeThickness: 8 }, { depth: 61, fillAlpha: 0.9 });
    this.pauseUi = ui;
    this.showPauseOverlay(null);
  }

  /**
   * The race's state apart from what it draws (tests/onlineRaceScene.test.js starts here): this
   * round's match, named for this host every round (item 39: resetMatch would drop the key), the
   * feed and referee, which drop anything stamped before this round's GO, and the field: this
   * device's width now (W) and the one both race on (fieldW, from the field fit; `data.peer` is
   * the newest width heard, kept over a re-fit or a rematch).
   */
  initRace(data) {
    this.net = data.net;
    // T4-review AUD-127: the race's hold on the shared transport; Leave's late close is skipped if a 🌐
    // window opened after it took one (onlineNet.lease).
    this.release = this.net?.lease?.() ?? null;
    this.lobby = data.lobby ?? null;
    this.plan = data.plan;
    this.store = data.store ?? null; // the tab's resume record (2.3)
    // 2.3, D4: { level, levels, pauseRound, by, floor } restarts this race rewound at that level's
    // start (a reload, the other side's rewind, a re-fit while rewound); levels are the level starts
    // kept so far (only those up to it).
    const resume = data.resume ?? null;
    this.levels = { 1: startSnap() };
    for (const [k, v] of Object.entries(resume?.levels ?? {})) {
      const snap = levelSnap(v);
      if (snap && String(snap.level) === k && snap.level <= resume.level) this.levels[k] = snap;
    }
    this.rewound = resume && this.levels[resume.level] ? { level: resume.level, by: resume.by === 'them' ? 'them' : 'me' } : null;
    this.rewindHeld = Boolean(this.rewound); // the pause's 'rewind' until this side's Ready
    this.restartAt = this.net.serverNow();
    this.rewindSentAt = null;
    this.rewindOut = true;
    this.rewindSince = -Infinity; // this side's GO out of its last rewind: a rewind stamped before it is stale
    this.floorAt = this.rewound ? Math.max(this.restartAt, Number.isFinite(resume.floor) ? resume.floor : -Infinity) : this.plan.startAt;
    this.fitUntil = this.rewound ? Infinity : this.plan.startAt; // a rewound race agrees its width until its own GO
    this.savedKey = null;
    this.holds = false; // 2.3b: the record is this page's (written by it, not cleared since)
    this.aside = false; // 2.3b: another page took the race over; this one stepped aside
    this.ownEnd = false;
    this.match = createMatch(this.plan.seed, { names: this.plan.names });
    if (this.rewound) {
      const snap = this.levels[this.rewound.level];
      Object.assign(this.match.slots[0], { level: snap.level, score: snap.score, deaths: snap.deaths, levelWins: snap.levelWins });
    }
    this.match.hostKey = ONLINE_HOST_KEY;
    this.match.status = 'countdown';
    this.levelStage = null; // 'count' during a level break's shared 3-2-1 (the host's go)
    this.levelBeat = false; // the local half's arrival beat has passed: its taps count, its hint shows
    this.levelShown = null; // the level count's step on countText
    this.goToken = 0; // bumped by each GO: only the latest GO's beat hides countText
    this.outcome = null;
    this.finalSlots = null;
    this.countShown = null;
    this.restarting = false;
    this.waitSince = null; // server ms this side began waiting on the other (item 15), else null
    this.offerAt = null; // server ms the Leave offer shows (Keep waiting moves it on)
    this.tapFrame = -1; // the frame a tap pressed one of this scene's buttons: the break does not take it as a ready tap
    this.result = null; // the results panel's parts, once it shows
    this.reporter = null; // 2.5: this side's finish_match report, from the race's end
    this.friendOffer = null; // 3.3: the results panel's Add as friend, once the race is saved: { phase, peer }
    this.peerLeft = false; // the other player left the room after the race
    // 2.7, AUD-110: the transport's numbers at this round's start, kept through a restart inside the
    // round (a re-fit, a rewind) and taken again by a rematch's round, so the report is this race's own.
    const round = this.plan.round ?? 0;
    this.netBase = data.netBase?.round === round ? data.netBase : { ...(this.net.stats?.() ?? {}), round };
    const now = () => this.net.serverNow();
    const send = (event, fields) => this.net.send(event, fields);
    this.feed = createRaceFeed({ now, send, since: this.floorAt });
    this.referee = createRaceReferee({ seat: this.plan.seat, now, send, since: this.floorAt });
    // 2.2: the shared pause (2.1's machine). menuHeld is this side's pause key or an overlay's pause
    // until a tap says Ready; halfHeld says the machine paused the local half mid-run.
    this.pause = createRacePause({ seat: this.plan.seat, now, send, present: this.net.peer?.() != null, round: resume?.pauseRound ?? data.pauseRound ?? 0 });
    this.menuHeld = false;
    this.halfHeld = false;
    this.pauseCount = null; // the resume's GO while its 3-2-1 runs
    this.pauseShown = null; // the resume count's step on countText
    this.abandoned = null; // { seat } once the room says the race was abandoned (no winner)
    this.leaveArmedAt = null; // the overlay's Leave was tapped once (game ms)
    this.wake ??= createWakeLock();
    this.W = fieldWidth(globalThis.innerWidth ?? 720, globalThis.innerHeight ?? 1280, FIELD);
    this.fit = createFieldFit({ mine: this.W, theirs: this.net.peer?.()?.width ?? null, heard: data.peer ?? null, now, send, until: this.fitUntil });
    this.fieldW = this.fit.fieldW();
    this.refit = false; // the agreed width moved before GO: the race again on it (refitField)
    this.persist();
  }

  /**
   * The resume record (2.3): this race's room, round and seat, the pause round and each level start
   * kept; written when it changes, as this page's (2.3b: the store stamps the owner and the beat, and
   * writes nothing over another page's live record).
   */
  persist() {
    if (!this.store || this.aside || this.ownEnd || this.match.status === 'over' || this.match.status === 'left') return;
    const code = this.lobby?.state?.room?.code ?? null;
    const record = { v: RESUME_VERSION, code, round: this.plan.round ?? 0, seat: this.plan.seat, pauseRound: this.pause?.state().round ?? 0, levels: this.levels, wall: Date.now() };
    const key = JSON.stringify([record.code, record.round, record.seat, record.pauseRound, record.levels]);
    if (key === this.savedKey) return;
    if (this.store.set(record) === false) return;
    this.savedKey = key;
    this.holds = true;
  }

  /** The record goes (the race over, abandoned or left, or this side's run ended): this page holds nothing from here. */
  forgetRecord() {
    this.store?.clear();
    this.holds = false;
  }

  /**
   * 2.3b: the beat (every online.resume.beatMs, from a window timer) while this page holds the
   * record; another page's record there means it took the race over: step aside. A record gone
   * from under it (cleared elsewhere) is written again.
   */
  beatRecord() {
    if (!this.store || !this.holds || this.aside) return;
    const who = this.store.beat?.() ?? 'mine';
    if (who === 'taken') this.stepAside();
    else if (who === 'none') {
      this.savedKey = null;
      this.persist();
    }
  }

  /** 2.3b: before this page pumps or sends (each frame, a wake): true once another page holds its race (it steps aside). */
  lostSeat() {
    if (this.aside) return true;
    if (!this.holds || this.store?.holder?.() !== 'taken') return false;
    this.stepAside();
    return true;
  }

  /** 2.3b: visibilitychange (a hidden page gets no frames): the seat first, then the shared pause. */
  onWake() {
    if (this.lostSeat()) return;
    this.tickPause();
  }

  /**
   * 2.3b: another page took this race over while this one was frozen (a relaunch found its beat
   * stale). Not a Leave: the room is not left (that would end the race for both) and the record is
   * the new owner's; the transport closes (the other device already follows the newer session, item
   * 34), and the ready screen's 🌐 window says the race runs in another window (Play.openPendingRace).
   */
  stepAside() {
    if (this.aside) return;
    this.aside = true;
    this.holds = false;
    this.match.status = 'left';
    this.wake?.want(false);
    try {
      this.net?.close?.();
    } catch {}
    this.statusBeat()?.stop({ quiet: true }); // 3.3: this device races on in the other page, which beats for it
    this.scene.stop('Play');
    this.scale.setGameSize(fieldWidth(globalThis.innerWidth ?? 720, globalThis.innerHeight ?? 1280, FIELD), GAME_HEIGHT);
    this.registry?.set?.('raceSteppedAside', true);
    this.scene.start('Play', { player: 1, match: null });
  }

  /** The highest level start kept. */
  topLevel() {
    return Math.max(...Object.keys(this.levels).map(Number));
  }

  /**
   * 2.3: this side's level start for a rewind, in each level break once the line before it is
   * settled (its +25 and level win in), again as the shop spends, into the tab's record. Once this
   * side's run has ended the record goes: a reload after the finish does not resume (item 46's
   * leave on the next entry applies).
   */
  keepLevel(half) {
    if (this.feed.doneFixed()) {
      if (!this.ownEnd) {
        this.ownEnd = true;
        this.forgetRecord();
      }
      return;
    }
    if (!half.levelBreak || half.state !== 'paused' || !(half.level > 1) || !this.referee.settled(half.level - 1)) return;
    const snap = levelSnap(half.resumeSnapshot?.());
    if (!snap || snap.level !== half.level) return;
    this.levels[snap.level] = snap;
    this.persist();
  }

  /** 2.3: a rewound race says so (its level, its restart time) until its GO: every heartbeat, at once again after a refused send. */
  sendRewind(now) {
    if (!this.rewound) return;
    if (this.rewindSentAt !== null && this.rewindOut && now - this.rewindSentAt < T.online.pause.heartbeatMs) return;
    this.rewindSentAt = now;
    this.rewindOut = this.net.send('rewind', { round: this.plan.round ?? 0, level: this.rewound.level, at: this.restartAt }) !== false;
  }

  /**
   * 2.3: the other side's race restarted at a level's start (its reload, or its answer to this
   * side's rewind). What it sent before that restart is dropped from now on, and this side restarts
   * at the lower of the two level starts (rewindOnHeard), unless it waits there already or its own
   * run is over. A side whose run is over answers instead (2.7, AUD-107): its fixed pos and done go
   * again on the next tick, so after the rewound side's restart and inside its floor. That side
   * missed them (its page died, and a rejoin inside the dead socket's presence linger is no `back`
   * here), and without them it would wait under its rewind for ever and its Leave would abandon a
   * race this side finished. Once per rewind heard: the rewind goes every heartbeat until its GO, so
   * a lost answer goes again.
   */
  onRewind(msg) {
    if (this.restarting || (this.match.status !== 'countdown' && this.match.status !== 'playing')) return;
    if (Number.isFinite(msg?.at)) {
      this.feed.floor(msg.at);
      this.referee.floor(msg.at);
      this.floorAt = Math.max(this.floorAt, msg.at);
    }
    if (this.feed.doneFixed()) {
      if (msg?.round === (this.plan.round ?? 0)) this.feed.again();
      return;
    }
    const level = rewindOnHeard({ msg, round: this.plan.round ?? 0, rewound: this.rewound?.level ?? null, top: this.topLevel(), since: this.rewindSince, ended: false });
    if (level !== null) this.rewindTo(level, 'them');
  }

  /** What a restart carries to stay rewound (2.3): the level, the level starts up to it, the pause round, who started it, the floor. */
  rewindData(level, by) {
    const levels = {};
    for (const [k, v] of Object.entries(this.levels)) if (Number(k) <= level) levels[k] = v;
    return { level, levels, pauseRound: this.pause.state().round, by, floor: this.floorAt };
  }

  /** 2.3: this race again from `level`'s start, rewound (the same room, round and seed). */
  rewindTo(level, by) {
    if (this.restarting) return;
    this.restarting = true;
    this.match.status = 'left';
    this.scene.stop('Play');
    this.scene.restart({ net: this.net, lobby: this.lobby, plan: this.plan, peer: this.fit.peer(), store: this.store, resume: this.rewindData(level, by), netBase: this.netBase });
  }

  /** Play's launch data: player 1 on this match at the agreed field, the purse below the pill; a rewound race's level start (2.3). */
  launchData() {
    const fieldX = this.fieldX ?? Math.floor((this.W - this.fieldW) / 4) * 2;
    return { player: 1, match: this.match, fieldW: this.fieldW, fieldX, inventoryY0: T.online.inventoryY0, resume: this.rewound ? this.levels[this.rewound.level] : null };
  }

  /** The local half (slot 0); the remote seat has no scene (item 39: versusInput and otherHalf read null). */
  halfScene(i) {
    return i === 0 ? this.scene.get('Play') : null;
  }

  half() {
    return this.halfScene(0);
  }

  update() {
    if (!this.feed || this.lostSeat()) return; // 2.3b: a page that lost its race to another page sends nothing
    this.net.pump?.();
    for (const item of this.net.take?.() ?? []) {
      this.receive(item);
      if (this.restarting) return; // a rewind restarts the race (2.3)
    }
    if (this.refit) return this.refitField();
    const now = this.net.serverNow();
    this.tickPause();
    if (this.match.status === 'countdown') {
      this.fit.tick();
      this.runCountdown(now); // first: a GO this frame clears `rewound`, so no rewind leaves after it (T2-review)
      this.sendRewind(now);
    }
    const half = this.half();
    if (half && (this.match.status === 'playing' || this.match.status === 'over')) {
      this.referee.tick({ level: half.level, inBreak: Boolean(half.levelBreak) && half.state === 'paused', shopOpen: Boolean(half.shopOpen), held: this.pause.frozen() });
      this.applyEffects();
      if (this.levelStage === 'count') this.showLevelCount(now);
      this.feed.tick(this.snapshot(half));
      this.keepLevel(half);
    }
    const remote = this.feed.slot();
    if (remote) Object.assign(this.match.slots[1], remote);
    if (this.pauseCount !== null) this.showPauseCount(now);
    this.refreshPause(now);
    this.refreshHud();
    this.refreshWait(now);
    this.checkOver();
    this.reporter?.tick();
    this.refreshResult();
    this.checkRematch();
  }

  /**
   * Item 15: this side waits on the other, ready in a break or out at the finish. The timer counts
   * from the start of the wait; after waitOfferMs the offer shows (Keep waiting moves it on by as
   * much again). Hidden while the shop is open.
   */
  waitingOn(half = this.half()) {
    if (!half || this.match.status !== 'playing') return false;
    if (half.levelBreak && half.state === 'paused') return this.levelStage !== 'count' && this.referee.isReady(half.level);
    return Boolean(this.match.slots[0].ended && !this.match.slots[1].ended);
  }

  refreshWait(now) {
    const half = this.half();
    const waiting = this.waitingOn(half);
    if (!waiting) this.waitSince = this.offerAt = null;
    else if (this.waitSince === null) {
      this.waitSince = now;
      this.offerAt = now + T.online.race.waitOfferMs;
    }
    if (!this.waitText) return; // initRace alone (the scene tests): nothing drawn
    const secs = waiting ? Math.floor((now - this.waitSince) / 1000) : 0;
    const label = waiting ? `⏱ ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : '';
    if (this.waitText.text !== label) this.waitText.setText(label);
    const shown = waiting && !half?.shopOpen && !this.pause?.frozen(); // the shop's panel or the pause overlay over the break: nothing of this on top of it
    this.waitText.setVisible(shown);
    const offer = shown && now >= this.offerAt;
    this.offerText.setVisible(offer);
    this.keepButton.setVisible(offer);
    this.leaveButton.setVisible(offer);
  }

  /** A tap on this scene: the wait's Keep waiting | Leave, or the results panel's Rematch | Leave (after the lockout). */
  onPointer(pointer) {
    unlock();
    if (this.pauseUi?.panel.visible) {
      const ui = this.pauseUi;
      const boxes = ui.ready.visible ? { share: ui.boxes.ready, home: ui.boxes.leave } : { share: null, home: ui.boxes.alone };
      const hit = overHit(pointer.x - (this.shiftX ?? 0), pointer.y, boxes);
      if (!hit) return; // a tap elsewhere: Play's chrome takes it (Ready, setPaused(false))
      this.tapFrame = this.game.loop.frame;
      if (hit === 'ready') this.toggleReady();
      else this.tapLeave();
      return;
    }
    if (this.keepButton.visible) {
      const hit = overHit(pointer.x - (this.shiftX ?? 0), pointer.y, { share: this.offerBoxes.keep, home: this.offerBoxes.leave });
      if (hit) this.tapFrame = this.game.loop.frame;
      if (hit === 'keep') this.keepWaiting();
      else if (hit === 'leave') this.leave();
      return;
    }
    if (!this.panelLive()) return;
    if (this.result.friend?.visible && overHit(pointer.x - (this.shiftX ?? 0), pointer.y, { share: this.result.friendBox })) {
      this.tapAddFriend();
      return;
    }
    const hit = overHit(pointer.x - (this.shiftX ?? 0), pointer.y, this.result.boxes);
    if (hit === 'share') this.toggleRematch();
    else if (hit === 'home') this.leave();
  }

  /** Keep waiting: the offer goes for another waitOfferMs (the timer keeps counting). */
  keepWaiting() {
    this.offerAt = this.net.serverNow() + T.online.race.waitOfferMs;
  }

  /** The panel's lockout has passed (a flap mashed into the race's end must not press Rematch or Leave). */
  panelLive() {
    return Boolean(this.result) && canRestart(this.result.openedAt, this.game.loop.time, T.retryLockoutMs);
  }

  /** Rematch on the panel: ask, or take the ask back; nothing once the other player left. */
  toggleRematch() {
    if (this.peerLeft || this.abandoned) return;
    this.wantRematch(!this.referee.rematch().mine);
  }

  /**
   * The results panel (Preview C4), a beat after the race is over: who won (raceOutcome, the
   * split-screen rules, D3), each player's numbers, Rematch | Leave, and under them the rematch's
   * state: waiting for the other, the other asking, or the other gone.
   */
  showResult() {
    if (this.result || !this.sys.isActive() || this.match.status !== 'over') return;
    const W = this.scale.width;
    const cx = this.cx ?? W / 2; // the field's centre as laid out (a turn mid-race shifts the camera, not the coordinates)
    const cy = GAME_HEIGHT / 2;
    const pw = Math.min(T.versus.resultPanelW, W - 24);
    const slots = this.finalSlots ?? this.match.slots;
    const res = this.outcome ?? raceOutcome(slots);
    const [me, them] = this.plan.names;
    const panel = this.add.rectangle(cx, cy + 30, pw, 820, 0x1a0b14, 0.9).setStrokeStyle(8, 0xe85e96).setDepth(70);
    const head = this.abandoned ? t(this.locale, 'onlineNoWinner') : res.winner == null ? t(this.locale, 'versusDraw') : res.winner === 0 ? t(this.locale, 'onlineYouWin') : t(this.locale, 'versusWins').replace('{name}', them);
    this.add.text(cx, cy - 290, head, { ...STYLE, fontSize: '56px', color: GOLD, wordWrap: { width: pw - 60, useAdvancedWrap: true } }).setOrigin(0.5).setDepth(71);
    const tiebreak = this.abandoned ? null : { deaths: 'tournamentByDeaths', levelWins: 'tournamentByLevelWins', finalFirst: 'tournamentByFinalFirst' }[res.by];
    if (tiebreak) this.add.text(cx, cy - 238, t(this.locale, tiebreak), { ...STYLE, fontSize: '26px', color: GREY, strokeThickness: 6 }).setOrigin(0.5).setDepth(71);
    slots.forEach((slot, i) => {
      const x = cx + (i === 0 ? -1 : 1) * (pw / 4);
      this.add.text(x, cy - 190, i === 0 ? `${me} ${t(this.locale, 'tournamentHostTag')}` : them, { ...STYLE, fontSize: '34px', color: PINK, strokeThickness: 8, wordWrap: { width: pw / 2 - 24, useAdvancedWrap: true } }).setOrigin(0.5).setDepth(71);
      this.add.text(x, cy - 110, String(slot.score ?? 0), { ...STYLE, fontSize: '72px' }).setOrigin(0.5).setDepth(71);
      this.add.text(x, cy - 40, levelLabel(this.locale, slot.level ?? 1), { ...STYLE, fontSize: '30px', color: GREY, strokeThickness: 8 }).setOrigin(0.5).setDepth(71);
      this.add.image(x - 46, cy + 20, 'pipe').setOrigin(0.5, 80 / 1280).setCrop(0, 0, 128, 160).setScale(40 / 128).setDepth(71);
      this.add.text(x - 14, cy + 20, `×${slot.pipesPassed ?? 0}`, { ...STYLE, fontSize: '34px', color: GREY, strokeThickness: 8 }).setOrigin(0, 0.5).setDepth(71);
      this.add.text(x - 70, cy + 90, `🏁 ×${slot.levelWins ?? 0}`, { ...STYLE, fontSize: '32px', color: GREY, strokeThickness: 8 }).setOrigin(0.5).setDepth(71);
      this.add.text(x + 70, cy + 90, `💀 ×${slot.deaths ?? 0}`, { ...STYLE, fontSize: '32px', color: GREY, strokeThickness: 8 }).setOrigin(0.5).setDepth(71);
    });
    const saved = this.add.text(cx, cy + 160, '', { ...STYLE, fontSize: '24px', color: GOLD, strokeThickness: 6, wordWrap: { width: pw - 80, useAdvancedWrap: true } }).setOrigin(0.5).setDepth(71);
    const boxes = overButtonsLayout(cx, cy, T, { share: !this.abandoned }); // abandoned: Leave alone, no rematch
    const rematch = this.abandoned ? null : createButton(this, boxes.share, t(this.locale, 'onlineRematch'), { ...STYLE, fontSize: '40px' }, { depth: 71 });
    createButton(this, boxes.home, t(this.locale, 'onlineLeave'), { ...STYLE, fontSize: '40px' }, { depth: 71 });
    const status = this.add.text(cx, cy + 420, '', { ...STYLE, fontSize: '26px', color: GREY, strokeThickness: 6, wordWrap: { width: pw - 60, useAdvancedWrap: true } }).setOrigin(0.5).setDepth(71);
    // 3.3: Add <name> as a friend, once the race is saved (the server's eligibility: an agreed race).
    const friendBox = { id: 'friend', x: cx, y: cy + 366, width: pw - 120, height: 52 }; // clear of Rematch | Leave (Preview G, Michael 22 Nov)
    const friend = createButton(this, friendBox, '', { ...STYLE, fontSize: '28px', strokeThickness: 6 }, { depth: 71, fillAlpha: 0.85 }).setVisible(false);
    const friendLine = this.add.text(cx, cy + 366, '', { ...STYLE, fontSize: '26px', color: GREY, strokeThickness: 6, wordWrap: { width: pw - 60, useAdvancedWrap: true } }).setOrigin(0.5).setDepth(71);
    this.result = { boxes, rematch, status, saved, friend, friendBox, friendLine, friendShown: null, openedAt: this.game.loop.time, shown: null, savedShown: null };
    this.tweens.add({ targets: panel, scale: { from: 0.8, to: 1 }, duration: T.over.panelInMs, ease: 'Back.easeOut' });
    this.refreshResult();
  }

  /** The panel's Rematch label and its line: ✓ and "Waiting for <name>…" once asked, "<name> wants a rematch", "<name> left". */
  refreshResult() {
    const r = this.result;
    if (!r) return;
    // 2.5: the report's line (saving, saved to the boards, not saved and why).
    const save = reportLine(this.reporter?.state() ?? null, { abandoned: Boolean(this.abandoned) });
    const savedKey = save ? `${save.key}:${save.kind}` : '';
    if (r.saved && r.savedShown !== savedKey) {
      r.savedShown = savedKey;
      r.saved.setText(save ? t(this.locale, save.key).replace('{name}', this.plan.names[1]) : '').setColor(save?.kind === 'ok' ? GREEN : save?.kind === 'no' ? '#ff8da8' : GOLD);
    }
    if (save?.key === 'onlineSaved' || save?.key === 'onlineSavedNotCounted') this.loadFriendOffer();
    this.drawFriendOffer();
    const want = this.referee?.rematch() ?? { mine: false, theirs: false };
    const key = this.peerLeft || this.abandoned ? 'left' : want.mine ? 'mine' : want.theirs ? 'theirs' : 'none';
    if (r.shown === key) return;
    r.shown = key;
    const them = this.plan.names[1];
    const line = { left: 'onlinePeerLeft', mine: 'versusWaiting', theirs: 'onlineRematchAsked', none: null }[key];
    r.status.setText(line ? t(this.locale, line).replace('{name}', them) : '').setColor(key === 'theirs' ? GOLD : key === 'left' ? '#ff8da8' : GREY);
    r.rematch?.setText(key === 'mine' ? `${t(this.locale, 'onlineRematch')} ✓` : t(this.locale, 'onlineRematch')).setAlpha(key === 'left' ? 0.4 : 1).pulse(key === 'theirs');
  }

  /**
   * 3.3: the results panel's friend offer, read once the race is saved: friend_list and
   * online_history give the opponent's handle and what they are to this player. Nothing shows for a
   * blocked player, a race with no handle (item 59) or a failed read.
   */
  loadFriendOffer() {
    if (this.friendOffer || typeof this.net?.rpc !== 'function') return;
    const offer = { phase: 'loading', peer: null, key: null };
    this.friendOffer = offer;
    this.friends ??= createOnlineFriends({ rpc: (fn, args) => this.net.rpc(fn, args) });
    this.friends
      .offer(this.plan.names[1])
      .then((r) => {
        if (this.friendOffer !== offer) return;
        if (!r.ok && r.pending) offer.phase = 'pair'; // a device waiting to pair (3.8, AUD-117)
        else if (!r.ok || !r.peer) offer.phase = 'none';
        else offer.phase = { none: 'add', incoming: 'add', asked: 'asked', friend: 'friend', blocked: 'none' }[r.relation] ?? 'none';
        offer.peer = r.peer ?? null;
      })
      .catch(() => {
        if (this.friendOffer === offer) offer.phase = 'none';
      });
  }

  /** The offer's button or its line, redrawn when its phase changes. */
  drawFriendOffer() {
    const r = this.result;
    const o = this.friendOffer;
    if (!r?.friend) return;
    const key = o ? `${o.phase}:${o.key ?? ''}` : '';
    if (r.friendShown === key) return;
    r.friendShown = key;
    const them = this.plan.names[1];
    const button = o?.phase === 'add' || o?.phase === 'sending';
    r.friend.setVisible(button);
    if (button) r.friend.setText(t(this.locale, 'friendResultAdd').replace('{name}', them)).setAlpha(o.phase === 'sending' ? 0.5 : 1);
    const line = { asked: 'friendAddedSent', friend: 'friendResultIsFriend', now: 'friendNowFriends', pair: 'friendResultPair', error: o?.key }[o?.phase] ?? null;
    r.friendLine.setText(line ? t(this.locale, line).replace('{name}', them) : '').setColor(o?.phase === 'error' ? '#ff8da8' : o?.phase === 'now' || o?.phase === 'friend' ? GREEN : GREY);
  }

  /** The offer's tap: the ask (a crossed one accepts at once). */
  tapAddFriend() {
    const o = this.friendOffer;
    if (o?.phase !== 'add' || !o.peer) return;
    o.phase = 'sending';
    this.friends.ask(o.peer).then((r) => {
      if (this.friendOffer !== o) return;
      if (r.ok) o.phase = r.status === 'accepted' ? 'now' : 'asked';
      else if (r.pending) o.phase = 'pair';
      else {
        o.phase = 'error';
        o.key = r.errorKey;
      }
    });
  }

  /** One transport item: the ghost, the referee, and the room's confirmed race status for the lobby. */
  receive(item) {
    this.fit.receive(item);
    if (item?.kind === 'peer' && item.event === 'width' && this.match.status === 'countdown' && this.net.serverNow() < this.fitUntil && this.fit.fieldW() !== this.fieldW) this.refit = true;
    this.feed.receive(item);
    this.referee.receive(item);
    if (this.match.status === 'countdown' || this.match.status === 'playing') this.pause.receive(item);
    if (item?.kind === 'peer' && item.event === 'rewind') this.onRewind(item.msg);
    if (raceRoomItem(item)) this.lobby?.roomItem?.(item);
    else if (this.match.status === 'over' && item?.kind === 'room' && (item.action?.type === 'left' || item.action?.type === 'status')) this.peerLeft = true; // after the race: the room closed under the other player's Leave
  }

  /**
   * The local half as the feed sends it. Its run's end is held back until the final line's verdict
   * is in: the done carries the +25 and finalFirst, and nothing about this side changes after it.
   */
  snapshot(half) {
    const s = half.raceSnapshot();
    return s.ended && !this.referee.settled(s.level) ? { ...s, ended: false } : s;
  }

  /** The referee's effects: a line's verdict, the level count, its take-back, GO, the host's rematch. */
  applyEffects() {
    for (const e of this.referee.drain()) {
      if (e.type === 'first') {
        // One final line (2.3): a host that replays the last level after a reload has a fresh referee,
        // so it never takes the final line once the other side's run holds it.
        if (e.mine && !this.feed.doneFixed() && !(e.final && this.match.slots[1]?.finalFirst)) this.half()?.awardLevelFirst?.({ final: e.final });
      } else if (e.type === 'count') {
        this.levelStage = 'count';
        this.levelShown = null;
        this.refreshReady();
      } else if (e.type === 'cancel') {
        this.levelStage = null;
        this.levelShown = null;
        this.goToken += 1;
        this.countText.setVisible(false);
        this.refreshReady();
      } else if (e.type === 'begin') {
        this.beginLevel();
      } else if (e.type === 'rematch') {
        this.lobby?.rematch?.();
      }
    }
  }

  /** 3, 2, 1, GO on the server clock (countdownStep): the slide-in with the 3, the run at GO. */
  runCountdown(now) {
    if (this.pause.frozen()) return; // a pause before GO holds the opening GO: the resume's GO starts the race
    const step = countdownStep(now, this.plan.startAt);
    if (step === null || step === this.countShown) return;
    const half = this.half();
    if (this.countShown === null) half?.launch({ hold: true }); // the poop slides into place under the first step shown
    this.countShown = step;
    this.showStep(step);
    if (step < 3) return;
    this.match.status = 'playing';
    if (this.rewound) {
      this.rewound = null; // flying again from the level's start (2.3)
      this.rewindHeld = false;
      this.rewindSince = now;
    }
    this.fitText.setVisible(false);
    half?.startRace();
    this.wake.want(true);
  }

  /** A level break's 3-2-1 to the host's GO (the GO itself is beginLevel's). */
  showLevelCount(now) {
    const c = this.referee.count();
    const step = c ? countdownStep(now, c.startAt) : null;
    if (step === null || step >= 3 || step === this.levelShown) return;
    this.levelShown = step;
    this.showStep(step);
  }

  /** One count step on countText (0-2: 3, 2, 1 with the blip; 3: GO with the flush, up one more beat). */
  showStep(i) {
    const steps = ['3', '2', '1', t(this.locale, 'versusGo')];
    this.countText.setText(steps[i]).setVisible(true).setScale(1.3);
    this.tweens.add({ targets: this.countText, scale: 1, duration: T.versus.countdownMs * 0.6, ease: 'Back.easeOut' });
    if (i < 3) {
      sfx.score();
      return;
    }
    if (this.cache.audio.exists('flush')) this.sound.play('flush', { volume: T.flushVolume });
    else sfx.score();
    const token = ++this.goToken;
    this.time.delayedCall(T.versus.countdownMs, () => {
      if (this.sys.isActive() && this.goToken === token) this.countText.setVisible(false);
    });
  }

  /**
   * GO at a level break (the host's startAt, or late: the other side is already flying this level):
   * the local half leaves its break (Play.beginLevel). An overlay or a hidden tab pauses it at once
   * (the other side's clock runs on; Tier 2 pauses both).
   */
  beginLevel() {
    this.levelStage = null;
    this.levelShown = null;
    this.levelBeat = false;
    this.half()?.beginLevel();
    this.showStep(3);
    if (globalThis.document?.hidden || this.overlayOpen()) this.setPaused(true);
  }

  /** An overlay (Settings, About, …) is up over the race. */
  overlayOpen() {
    return Boolean(this.half()?.chromeArgs?.('tap')?.overlay);
  }

  /** The level break's hint and 💰 pill for the ready state (hidden through the arrival beat and the count). */
  refreshReady() {
    const half = this.half();
    if (!half?.levelBreak) return;
    half.refreshLevelBanner();
    half.setLevelHintVisible(this.levelStage !== 'count' && this.levelBeat);
    half.refreshShopButton?.();
  }

  /** The pill: the other player's live score and the link's dot, with its word when slow or lost (never colour alone). */
  refreshHud() {
    const slot = this.match.slots[1];
    const score = String(slot.score ?? 0);
    if (this.hud.score.text !== score) this.hud.score.setText(score);
    const link = this.pillLink();
    if (link === this.hud.link) return;
    this.hud.link = link;
    this.hud.dot.setFillStyle(DOT[link]);
    const word = link === 'good' ? '' : t(this.locale, { slow: 'onlineHudSlow', paused: 'onlineHudPaused', lost: 'onlineHudLost' }[link]);
    this.hud.word.setText(word).setColor(link === 'lost' ? '#ff8da8' : '#ffd27a').setVisible(Boolean(word));
    this.hud.card.setSize(PILL_W, word ? 146 : 112);
  }

  /**
   * main.js, after a window resize or a phone turn settled on a new field width (Michael's phone
   * check, 21 Nov: turned back to portrait mid-race, the canvas stayed landscape-sized and Safari
   * shrank it). The field keeps its width for the whole race (both devices race one course; Tier 2
   * re-fits at a break), but the canvas follows the screen, never narrower than the field (then the
   * browser letterboxes it), with the field centred again: the half's camera and tap offset move to
   * it, and this scene's own HUD moves by scrolling its camera (taps on its buttons follow,
   * shiftX). Nothing pauses: pausing one side would cost it ground while the other races on.
   */
  onFieldResize(want = fieldWidth(globalThis.innerWidth, globalThis.innerHeight, FIELD)) {
    const W = Math.max(want, this.fieldW);
    if (W !== this.scale.width) this.scale.setGameSize(W, GAME_HEIGHT);
    const fieldX = Math.floor((W - this.fieldW) / 4) * 2;
    this.shiftX = fieldX - this.fieldX0;
    this.cameras.main.setSize(W, GAME_HEIGHT);
    this.cameras.main.setScroll(-this.shiftX, 0);
    const half = this.half();
    if (half?.half) {
      half.half.fieldX = fieldX;
      half.fieldX = fieldX;
      half.cameras.main.setViewport(fieldX, 0, this.fieldW, GAME_HEIGHT);
    }
  }

  /** The room's race phase on the server clock ('countdown' / 'racing'), for the smoke and Tier 2. */
  racePhase() {
    return racePhase(this.lobby?.state?.room, this.net.serverNow());
  }

  // --- the host interface (item 39) ---------------------------------------------------------------

  onJoinInput() {}

  /**
   * The local half crossed a line (Play.onFinishCrossed names it: { level, final }). The referee
   * records it on server time; the host's verdict comes back as Play.awardLevelFirst, so nobody takes
   * the +25 here.
   */
  claimLevelFinish(half, line = {}) {
    if (this.match.status !== 'playing' || half !== this.half() || !Number.isInteger(line.level)) return false;
    this.referee.crossed({ level: line.level, final: Boolean(line.final), distance: half.distance ?? 0 });
    return false;
  }

  /**
   * The local half reached a level's line: its break banner, the hint hidden for levelSyncDelayMs
   * (the arrival flap must not count as a ready tap, as in split screen), then "Tap when ready".
   */
  onLevelReached(half) {
    if (this.match.status !== 'playing' || half !== this.half()) return;
    this.levelBeat = false;
    half.refreshLevelBanner();
    half.setLevelHintVisible(false);
    half.refreshShopButton?.();
    const match = this.match;
    this.time.delayedCall(T.versus.levelSyncDelayMs, () => {
      if (!this.sys.isActive() || this.match !== match || match.status !== 'playing' || !half.levelBreak) return;
      this.levelBeat = true;
      this.refreshReady();
    });
  }

  /**
   * A tap in the level break (Play.applyChrome 'resume'): after the arrival beat it toggles this
   * player's ready over the wire; during the count it takes it back (the referee refuses that within
   * cancelMarginMs of GO, and the host's own take-back calls the count off at once).
   */
  onLevelTap(half) {
    if (this.match.status !== 'playing' || half !== this.half()) return;
    if (!half.levelBreak || half.state !== 'paused' || half.shopOpen || !this.levelBeat) return;
    if (this.tapFrame === this.game?.loop?.frame) return; // that tap pressed Keep waiting or Leave
    if (!this.referee.setReady(half.level, !this.referee.isReady(half.level))) return;
    this.applyEffects();
    this.refreshReady();
  }

  isReady(half) {
    return Boolean(half && half === this.half() && this.referee?.isReady(half.level));
  }

  /** No tournament online, so no 🏅 pill. */
  bothInBreak() {
    return false;
  }

  openPeek() {}

  onShopChanged() {
    this.half()?.refreshLevelBanner?.();
  }

  /**
   * The pause key, ⏸, the pad's Menu or an overlay opening (Play.pauseRun): this side's `menu`
   * reason, which pauses both (2.2). Off is Play's tap while the race is paused (applyChrome
   * 'resume'): that tap says Ready, unless it pressed one of the overlay's buttons.
   */
  setPaused(on) {
    if (!this.pause || (this.match.status !== 'playing' && this.match.status !== 'countdown')) return;
    if (on) {
      this.menuHeld = true;
      this.tickPause();
    } else if (this.tapFrame !== this.game?.loop?.frame) {
      this.toggleReady();
    }
  }

  /** The race is held by the shared pause (paused or counting to its resume). */
  isPaused() {
    return Boolean(this.pause?.frozen());
  }

  togglePause() {
    if (this.isPaused()) this.toggleReady();
    else this.setPaused(true);
  }

  /** This side's local state for the pause machine (2.1's `local`), every frame and on visibilitychange. */
  pauseLocal() {
    const half = this.half();
    const live = this.match.status === 'playing';
    return {
      phase: live && half?.raceSnapshot ? localPhase(half.raceSnapshot()) : null,
      hidden: globalThis.document?.hidden === true,
      offline: globalThis.navigator?.onLine === false,
      channel: this.net.channelState?.() ?? 'joined',
      menu: this.menuHeld || this.overlayOpen(),
      rewind: this.rewindHeld && this.match.status === 'countdown',
    };
  }

  /** Tick the shared pause and act on what it says (before the referee, which it holds). */
  tickPause() {
    if (!this.pause || (this.match.status !== 'playing' && this.match.status !== 'countdown')) return;
    this.pause.tick(this.pauseLocal());
    this.applyPause();
  }

  /**
   * The pause machine's effects: pause freezes the local half mid-run and stands the ghost where
   * the other side stopped; count runs the resume's 3-2-1; cancel takes it down; resume lets the
   * half go (a pause before GO lets runCountdown start the race) and the ghost go at the other
   * side's first message after it; back sends the run's end again; abandoned ends the race with
   * no winner.
   */
  applyPause() {
    const half = this.half();
    for (const e of this.pause.drain()) {
      if (e.type === 'pause') {
        this.leaveArmedAt = null;
        if (this.match.status === 'playing' && (half?.state === 'playing' || half?.state === 'respawn')) {
          half.pausePlay();
          this.halfHeld = true;
        }
        const s = this.pause.state();
        if (!s.solo) this.feed.hold(s.theirs === 'lost' ? (this.feed.heardT() ?? this.net.serverNow()) : this.net.serverNow());
        this.countText.setVisible(false);
        this.wake.want(false);
      } else if (e.type === 'count') {
        this.pauseCount = e.startAt;
        this.pauseShown = null;
      } else if (e.type === 'cancel') {
        this.pauseCount = null;
        this.pauseShown = null;
        this.goToken += 1;
        this.countText?.setVisible(false);
      } else if (e.type === 'resume') {
        const counted = this.pauseCount !== null;
        this.pauseCount = null;
        this.pauseShown = null;
        this.menuHeld = false;
        this.leaveArmedAt = null;
        this.feed.release(this.net.serverNow());
        if (this.halfHeld && half?.state === 'paused' && !half.levelBreak) half.resumePlay();
        this.halfHeld = false;
        if (counted && this.match.status === 'playing') this.showStep(3);
        if (this.match.status === 'playing') this.wake.want(true);
        this.persist(); // the pause round moved
      } else if (e.type === 'back') {
        this.feed.again();
      } else if (e.type === 'abandoned') {
        this.onAbandoned(e.seat);
      }
    }
  }

  /** The room says the race was abandoned (the other side left mid-race): over, no winner, Leave only. */
  onAbandoned(seat) {
    if (this.match.status !== 'playing' && this.match.status !== 'countdown') return;
    const half = this.half();
    if (half?.state === 'playing' || half?.state === 'respawn') half.pausePlay();
    this.abandoned = { seat: seat ?? null };
    this.match.status = 'over';
    this.forgetRecord();
    this.pauseCount = null;
    this.countText?.setVisible(false);
    this.finalSlots = this.match.slots.map((slot) => ({ ...slot }));
    this.outcome = { winner: null, by: null };
    this.wake.want(false);
    this.refreshWait(this.net.serverNow());
    this.time?.delayedCall?.(T.deathToOverMs, () => this.showResult());
  }

  /** Ready on the pause overlay (its button, a tap anywhere, the pause key): say it, or take it back. */
  toggleReady() {
    const s = this.pause?.state();
    if (!s || s.phase === 'live' || s.phase === 'over') return;
    if (s.ready.mine) {
      this.pause.setReady(false);
    } else {
      this.menuHeld = false;
      this.rewindHeld = false;
      this.pause.tick(this.pauseLocal());
      this.pause.setReady(true);
    }
    this.applyPause();
  }

  /** Leave on the pause overlay: the first tap asks (it ends the race for both), the second leaves. */
  tapLeave() {
    const at = this.game.loop.time;
    if (this.leaveArmedAt !== null && at - this.leaveArmedAt < T.online.pause.leaveConfirmMs) return this.leave();
    this.leaveArmedAt = at;
  }

  /** The resume's 3-2-1 on countText (its GO is the resume effect's). */
  showPauseCount(now) {
    const step = countdownStep(now, this.pauseCount);
    if (step === null || step >= 3 || step === this.pauseShown) return;
    this.pauseShown = step;
    this.showStep(step);
  }

  /** The overlay from the machine's state, redrawn only when what it says changes (the clock each second). */
  refreshPause(now) {
    if (!this.pauseUi) return;
    const s = this.pause && (this.match.status === 'playing' || this.match.status === 'countdown') ? this.pause.state() : null;
    const midRun = this.halfHeld;
    const view = pauseOverlay(s, { midRun, rewind: this.rewound });
    const armed = this.leaveArmedAt !== null && this.game.loop.time - this.leaveArmedAt < T.online.pause.leaveConfirmMs;
    if (!armed) this.leaveArmedAt = null;
    const secs = view && !view.count && s.since !== null ? Math.max(0, Math.floor((now - s.since) / 1000)) : 0;
    const key = view ? JSON.stringify([view, secs, armed, this.half()?.shopOpen]) : null;
    if (key === this.pauseUi.shown) return;
    this.pauseUi.shown = key;
    this.showPauseOverlay(view, { secs, armed });
  }

  showPauseOverlay(view, { secs = 0, armed = false } = {}) {
    const ui = this.pauseUi;
    const on = Boolean(view && !view.count);
    for (const o of [ui.panel, ui.title, ui.sub, ui.me.name, ui.me.mark, ui.clock]) o.setVisible(on);
    ui.them.name.setVisible(on && view.theirs !== null);
    ui.them.mark.setVisible(on && view.theirs !== null);
    ui.ready.setVisible(on && view.ready !== null);
    ui.leave.setVisible(on && view.ready !== null);
    ui.leaveAlone.setVisible(on && view.ready === null);
    ui.warn.setVisible(on && armed);
    if (!on) return;
    const them = this.plan.names[1];
    const level = this.rewound ? levelLabel(this.locale, this.rewound.level) : '';
    const say = (k) => t(this.locale, k).replace('{name}', them).replace('{level}', level);
    ui.title.setText(say(view.title)).setScale(1);
    ui.title.setScale(fitScale(ui.title.width, ui.titleW, 0));
    ui.sub.setText(say(view.sub));
    const mark = (r, k) => r.mark.setText(say(k)).setColor(k === 'onlineIsReady' ? GREEN : k === 'onlineHudLost' ? '#ff8da8' : GREY);
    mark(ui.me, view.mine);
    if (view.theirs) mark(ui.them, view.theirs);
    ui.clock.setText(`⏱ ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);
    if (view.ready) ui.ready.setText(say(view.ready));
    for (const b of [ui.leave, ui.leaveAlone]) b.setText(t(this.locale, armed ? 'onlineLeaveSure' : 'onlineLeave'));
    ui.warn.setText(t(this.locale, 'onlineLeaveWarn'));
  }

  /** The pill's dot: the feed's link, or while the race is paused, what the pause machine knows of the other side. */
  pillLink() {
    const s = this.pause && this.match.status === 'playing' ? this.pause.state() : null;
    if (!s || s.phase === 'live' || s.phase === 'over' || s.solo) return this.feed.link();
    if (NET_DOWN.has(s.theirs) || NET_DOWN.has(s.mine)) return 'lost';
    return s.theirs === 'menu' || s.theirs === 'away' ? 'paused' : 'good';
  }

  anyLive() {
    const half = this.half();
    return half?.state === 'playing' || half?.state === 'respawn';
  }

  /** The local run ended (Play.endRun): the race may be over (checkOver). */
  onRunEnded() {
    this.checkOver();
  }

  /**
   * Both runs out, this side's done sent (its final line settled) and the other's heard: the race is
   * over, with one raceOutcome (1.8 shows it, with Leave). The host's app marks the room finished,
   * so a rematch can follow.
   */
  checkOver() {
    if (this.match.status !== 'playing') return;
    const [mine, theirs] = this.match.slots;
    if (!mine.ended || !this.feed?.doneSent() || !theirs.ended) return;
    this.match.status = 'over';
    this.forgetRecord();
    this.finalSlots = this.match.slots.map((slot) => ({ ...slot })); // the numbers the outcome came from, for the panel
    this.outcome = raceOutcome(this.finalSlots);
    this.wake?.want(false);
    if (this.plan.seat === 'host') this.lobby?.finish?.();
    this.startReport();
    this.refreshWait(this.net.serverNow());
    this.time?.delayedCall?.(T.deathToOverMs, () => this.showResult());
  }

  /**
   * 2.5: report the race (finish_match) from the numbers the outcome came from, in seat order, with
   * this side's numbers-only telemetry; both devices report, and the panel's line follows the answer.
   */
  startReport() {
    const code = this.lobby?.state?.room?.code ?? null;
    if (this.reporter || !code || typeof this.net.rpc !== 'function') return;
    const stats = { ...raceNetStats(this.net.stats?.(), this.netBase), ...(this.pause?.stats?.() ?? {}) };
    const result = raceReport({ seat: this.plan.seat, finalSlots: this.finalSlots, stats });
    this.reporter = createRaceReporter({ rpc: (fn, args) => this.net.rpc(fn, args), code, round: this.plan.round ?? 0, result, now: () => Date.now() });
  }

  /** Rematch (1.8's button, the smoke): this side's ask, after the race; the host's app starts the next round once both ask. */
  wantRematch(on = true) {
    if (this.match.status !== 'over') return;
    this.referee.wantRematch(on);
  }

  /** The room is playing a later round (the rematch, confirmed by the server): this scene again on its seed and GO. */
  checkRematch() {
    const room = this.lobby?.state?.room;
    if (this.restarting || room?.phase !== 'playing' || !(room.round > (this.plan.round ?? 0))) return;
    const peer = this.fit.peer();
    const plan = raceStartPlan(room, { mine: fieldWidth(globalThis.innerWidth ?? 720, globalThis.innerHeight ?? 1280, FIELD), theirs: peer?.width ?? this.net.peer?.()?.width ?? null });
    if (!plan) return;
    this.restarting = true;
    this.match.status = 'left';
    this.scene.stop('Play');
    this.scene.restart({ net: this.net, lobby: this.lobby, plan, peer, store: this.store, netBase: this.netBase }); // a new round: initRace takes a new base
  }

  /**
   * AUD-097: before GO the other side's width moved the agreed one (its phone turned after the
   * lobby opened, or its join-time width was stale): the race again on the same plan, its seed and
   * GO, at the agreed width; the newest width heard rides along.
   */
  refitField() {
    if (this.restarting) return;
    this.restarting = true;
    this.match.status = 'left';
    this.scene.stop('Play');
    this.scene.restart({ net: this.net, lobby: this.lobby, plan: this.plan, peer: this.fit.peer(), store: this.store, resume: this.rewound ? this.rewindData(this.rewound.level, this.rewound.by) : undefined, netBase: this.netBase });
  }

  /** The pad's A on the results panel: Rematch (ask, or take it back). */
  onPadSelect() {
    if (this.panelLive()) this.toggleRematch();
  }

  /** The pad's B on the results panel: Leave. */
  onPadBack() {
    if (this.panelLive()) this.leave();
  }

  /** 3.3: the page's status beat (Play.onlineStatusBeat), if this page has one; never made here. */
  statusBeat() {
    return this.scene?.get?.('Play')?.onlineStatusBeatRef ?? null;
  }

  /** Back to single player: the room left, the transport closed, the canvas re-fitted, Play plain. */
  leave() {
    this.match.status = 'left';
    this.wake?.want(false);
    this.statusBeat()?.stop(); // 3.3: out of online mode: friends see offline at once
    this.forgetRecord();
    const { lobby, net } = this;
    const release = this.release ?? (() => net?.close?.());
    this.release = null;
    Promise.resolve(lobby?.leave())
      .catch(() => {})
      .finally(release);
    this.scene.stop('Play');
    const W = fieldWidth(globalThis.innerWidth, globalThis.innerHeight, FIELD);
    this.scale.setGameSize(W, GAME_HEIGHT);
    this.scene.start('Play', { player: 1, match: null });
  }
}
