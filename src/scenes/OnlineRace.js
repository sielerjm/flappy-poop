import '../phaserReady.js'; // first: Phaser exists before this module runs (plan 35, 1.2)
import { GAME_HEIGHT, FIELD, TUNING as T } from '../config.js';
import { fieldWidth, uiColumn, overButtonsLayout, overHit, canRestart, fitScale } from '../logic.js';
import { createMatch } from '../versus.js';
import { t, levelLabel } from '../i18n.js';
import { raceOutcome } from '../tournament.js';
import { ONLINE_HOST_KEY, countdownStep, createFieldFit, createRaceFeed, createRaceReferee, raceRoomItem, raceStartPlan } from '../onlineRace.js';
import { racePhase } from '../online.js';
import { sfx, unlock } from '../sound.js';
import { createButton } from '../ui/button.js';

const STYLE = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center', stroke: '#5a2a44', strokeThickness: 12 };
const DOT = { good: 0x5ad15a, slow: 0xffd27a, lost: 0xff5a6a };
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
 * Started by the tournament panel once the room is 'playing' with { net, lobby, plan }. 1.8 adds
 * the results panel (Rematch | Leave); Tier 2 a peer leaving and the shared pause.
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
    this.locale = this.scene.get('Play')?.locale ?? 'en';

    this.scene.launch('Play', { player: 1, match: this.match, fieldW, fieldX, inventoryY0: T.online.inventoryY0 });
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
    this.input.on('pointerdown', (pointer) => this.onPointer(pointer));
    this.events.once('shutdown', () => {
      this.feed = null;
      this.referee = null;
    });
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
    this.lobby = data.lobby ?? null;
    this.plan = data.plan;
    this.match = createMatch(this.plan.seed, { names: this.plan.names });
    this.match.hostKey = ONLINE_HOST_KEY;
    this.match.status = 'countdown';
    this.levelStage = null; // 'count' during a level break's shared 3-2-1 (the host's go)
    this.levelBeat = false; // the local half's arrival beat has passed: its taps count, its hint shows
    this.levelShown = null; // the level count's step on countText
    this.goToken = 0; // bumped by each GO: only the latest GO's beat hides countText
    this.paused = false;
    this.outcome = null;
    this.finalSlots = null;
    this.countShown = null;
    this.restarting = false;
    this.waitSince = null; // server ms this side began waiting on the other (item 15), else null
    this.offerAt = null; // server ms the Leave offer shows (Keep waiting moves it on)
    this.tapFrame = -1; // the frame a tap pressed one of this scene's buttons: the break does not take it as a ready tap
    this.result = null; // the results panel's parts, once it shows
    this.peerLeft = false; // the other player left the room after the race
    const now = () => this.net.serverNow();
    const send = (event, fields) => this.net.send(event, fields);
    this.feed = createRaceFeed({ now, send, since: this.plan.startAt });
    this.referee = createRaceReferee({ seat: this.plan.seat, now, send, since: this.plan.startAt });
    this.W = fieldWidth(globalThis.innerWidth ?? 720, globalThis.innerHeight ?? 1280, FIELD);
    this.fit = createFieldFit({ mine: this.W, theirs: this.net.peer?.()?.width ?? null, heard: data.peer ?? null, now, send, until: this.plan.startAt });
    this.fieldW = this.fit.fieldW();
    this.refit = false; // the agreed width moved before GO: the race again on it (refitField)
  }

  /** The local half (slot 0); the remote seat has no scene (item 39: versusInput and otherHalf read null). */
  halfScene(i) {
    return i === 0 ? this.scene.get('Play') : null;
  }

  half() {
    return this.halfScene(0);
  }

  update() {
    if (!this.feed) return;
    this.net.pump?.();
    for (const item of this.net.take?.() ?? []) this.receive(item);
    if (this.refit) return this.refitField();
    const now = this.net.serverNow();
    if (this.match.status === 'countdown') {
      this.fit.tick();
      this.runCountdown(now);
    }
    const half = this.half();
    if (half && (this.match.status === 'playing' || this.match.status === 'over')) {
      this.referee.tick({ level: half.level, inBreak: Boolean(half.levelBreak) && half.state === 'paused', shopOpen: Boolean(half.shopOpen) });
      this.applyEffects();
      if (this.levelStage === 'count') this.showLevelCount(now);
      this.feed.tick(this.snapshot(half));
    }
    const remote = this.feed.slot();
    if (remote) Object.assign(this.match.slots[1], remote);
    this.refreshHud();
    this.refreshWait(now);
    this.checkOver();
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
    const shown = waiting && !half?.shopOpen; // the shop's panel over the break: nothing of this on top of it
    this.waitText.setVisible(shown);
    const offer = shown && now >= this.offerAt;
    this.offerText.setVisible(offer);
    this.keepButton.setVisible(offer);
    this.leaveButton.setVisible(offer);
  }

  /** A tap on this scene: the wait's Keep waiting | Leave, or the results panel's Rematch | Leave (after the lockout). */
  onPointer(pointer) {
    unlock();
    if (this.keepButton.visible) {
      const hit = overHit(pointer.x - (this.shiftX ?? 0), pointer.y, { share: this.offerBoxes.keep, home: this.offerBoxes.leave });
      if (hit) this.tapFrame = this.game.loop.frame;
      if (hit === 'keep') this.keepWaiting();
      else if (hit === 'leave') this.leave();
      return;
    }
    if (!this.panelLive()) return;
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
    if (this.peerLeft) return;
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
    const head = res.winner == null ? t(this.locale, 'versusDraw') : res.winner === 0 ? t(this.locale, 'onlineYouWin') : t(this.locale, 'versusWins').replace('{name}', them);
    this.add.text(cx, cy - 290, head, { ...STYLE, fontSize: '56px', color: GOLD, wordWrap: { width: pw - 60, useAdvancedWrap: true } }).setOrigin(0.5).setDepth(71);
    const tiebreak = { deaths: 'tournamentByDeaths', levelWins: 'tournamentByLevelWins', finalFirst: 'tournamentByFinalFirst' }[res.by];
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
    this.add.text(cx, cy + 160, t(this.locale, 'versusNotSaved'), { ...STYLE, fontSize: '24px', color: GOLD, strokeThickness: 6, wordWrap: { width: pw - 80, useAdvancedWrap: true } }).setOrigin(0.5).setDepth(71);
    const boxes = overButtonsLayout(cx, cy, T, { share: true });
    const rematch = createButton(this, boxes.share, t(this.locale, 'onlineRematch'), { ...STYLE, fontSize: '40px' }, { depth: 71 });
    createButton(this, boxes.home, t(this.locale, 'onlineLeave'), { ...STYLE, fontSize: '40px' }, { depth: 71 });
    const status = this.add.text(cx, cy + 345, '', { ...STYLE, fontSize: '30px', color: GREY, strokeThickness: 6, wordWrap: { width: pw - 60, useAdvancedWrap: true } }).setOrigin(0.5).setDepth(71);
    this.result = { boxes, rematch, status, openedAt: this.game.loop.time, shown: null };
    this.tweens.add({ targets: panel, scale: { from: 0.8, to: 1 }, duration: T.over.panelInMs, ease: 'Back.easeOut' });
    this.refreshResult();
  }

  /** The panel's Rematch label and its line: ✓ and "Waiting for <name>…" once asked, "<name> wants a rematch", "<name> left". */
  refreshResult() {
    const r = this.result;
    if (!r) return;
    const want = this.referee?.rematch() ?? { mine: false, theirs: false };
    const key = this.peerLeft ? 'left' : want.mine ? 'mine' : want.theirs ? 'theirs' : 'none';
    if (r.shown === key) return;
    r.shown = key;
    const them = this.plan.names[1];
    const line = { left: 'onlinePeerLeft', mine: 'versusWaiting', theirs: 'onlineRematchAsked', none: null }[key];
    r.status.setText(line ? t(this.locale, line).replace('{name}', them) : '').setColor(key === 'theirs' ? GOLD : key === 'left' ? '#ff8da8' : GREY);
    r.rematch.setText(key === 'mine' ? `${t(this.locale, 'onlineRematch')} ✓` : t(this.locale, 'onlineRematch')).setAlpha(key === 'left' ? 0.4 : 1).pulse(key === 'theirs');
  }

  /** One transport item: the ghost, the referee, and the room's confirmed race status for the lobby. */
  receive(item) {
    this.fit.receive(item);
    if (item?.kind === 'peer' && item.event === 'width' && this.match.status === 'countdown' && this.net.serverNow() < this.plan.startAt && this.fit.fieldW() !== this.fieldW) this.refit = true;
    this.feed.receive(item);
    this.referee.receive(item);
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
        if (e.mine && !this.feed.doneFixed()) this.half()?.awardLevelFirst?.({ final: e.final });
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
    const step = countdownStep(now, this.plan.startAt);
    if (step === null || step === this.countShown) return;
    const half = this.half();
    if (this.countShown === null) half?.launch({ hold: true }); // the poop slides into place under the first step shown
    this.countShown = step;
    this.showStep(step);
    if (step < 3) return;
    this.match.status = 'playing';
    this.fitText.setVisible(false);
    half?.startRace();
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
    const link = this.feed.link();
    if (link === this.hud.link) return;
    this.hud.link = link;
    this.hud.dot.setFillStyle(DOT[link]);
    const word = link === 'good' ? '' : t(this.locale, link === 'slow' ? 'onlineHudSlow' : 'onlineHudLost');
    this.hud.word.setText(word).setColor(link === 'slow' ? '#ffd27a' : '#ff8da8').setVisible(Boolean(word));
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

  /** This device's own pause (Tier 2 pauses both over the wire): only the local half. */
  setPaused(on) {
    if (this.match.status !== 'playing') return;
    const half = this.half();
    if (!half) return;
    if (on && (half.state === 'playing' || half.state === 'respawn')) {
      half.pausePlay();
      this.paused = true;
    } else if (!on && this.paused) {
      if (half.state === 'paused' && !half.levelBreak) half.resumePlay();
      this.paused = false;
    }
  }

  isPaused() {
    return this.paused;
  }

  togglePause() {
    this.setPaused(!this.paused);
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
    this.finalSlots = this.match.slots.map((slot) => ({ ...slot })); // the numbers the outcome came from, for the panel
    this.outcome = raceOutcome(this.finalSlots);
    if (this.plan.seat === 'host') this.lobby?.finish?.();
    this.refreshWait(this.net.serverNow());
    this.time?.delayedCall?.(T.deathToOverMs, () => this.showResult());
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
    this.scene.restart({ net: this.net, lobby: this.lobby, plan, peer });
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
    this.scene.restart({ net: this.net, lobby: this.lobby, plan: this.plan, peer: this.fit.peer() });
  }

  /** The pad's A on the results panel: Rematch (ask, or take it back). */
  onPadSelect() {
    if (this.panelLive()) this.toggleRematch();
  }

  /** The pad's B on the results panel: Leave. */
  onPadBack() {
    if (this.panelLive()) this.leave();
  }

  /** Back to single player: the room left, the transport closed, the canvas re-fitted, Play plain. */
  leave() {
    this.match.status = 'left';
    const { lobby, net } = this;
    Promise.resolve(lobby?.leave())
      .catch(() => {})
      .finally(() => net?.close?.());
    this.scene.stop('Play');
    const W = fieldWidth(globalThis.innerWidth, globalThis.innerHeight, FIELD);
    this.scale.setGameSize(W, GAME_HEIGHT);
    this.scene.start('Play', { player: 1, match: null });
  }
}
