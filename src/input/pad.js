import { padAction, stickNav } from '../logic.js';

/**
 * Bind a gamepad to a scene. Buttons arrive edge-triggered from Phaser's
 * Gamepad plugin ('down' once per press: holding A flaps once); RT is analog,
 * so its button threshold is lowered to t.gamepad.triggerThreshold on connect
 * (one fire per pull). Sticks are polled each scene update through stickNav:
 * one move per push, then key-repeat while held. Every event becomes a pad
 * action (padAction / stickNav) handed to onAction with the pad's index (a
 * versus match routes A / RT by it); the scene decides what it means
 * (Play.onPadAction via padIntent).
 *
 * Returns shims that feed onAction through the same path for the headless
 * smoke driver, which has no pad: padDown(index), padNav(dir).
 *
 * The plugin is null when the game config leaves input.gamepad off or the
 * browser has no Gamepad API; everything here is then a no-op.
 */
export function bindPad(scene, onAction, t) {
  const g = t.gamepad;
  const plugin = scene.input.gamepad ?? null;
  const primed = new WeakSet();
  const warned = new Set();

  const prime = (pad) => {
    if (!pad || primed.has(pad)) return;
    primed.add(pad);
    const trigger = pad.buttons?.[g.power];
    if (trigger) trigger.threshold = g.triggerThreshold;
    if (pad.mapping !== 'standard' && !warned.has(pad.id)) {
      warned.add(pad.id);
      console.warn(`Flappy Poop: gamepad "${pad.id}" reports mapping "${pad.mapping}", not "standard"; retune TUNING.gamepad if buttons land wrong`);
    }
  };

  const onDown = (pad, button) => {
    prime(pad);
    onAction(padAction(button.index, t), pad.index);
  };
  const onConnected = (pad) => prime(pad);

  let held = null; // the stick's current nav action, until it returns to centre
  let nextAt = 0; // scene time (ms) of the next repeat while held
  const onUpdate = (time) => {
    if (!plugin?.gamepads) return;
    let action = null;
    let index = 0; // the pad whose stick moved
    for (const pad of plugin.gamepads) {
      if (!pad) continue;
      prime(pad);
      action = stickNav(pad.leftStick.x, pad.leftStick.y, t) ?? stickNav(pad.rightStick.x, pad.rightStick.y, t);
      if (action) {
        index = pad.index;
        break;
      }
    }
    if (!action) {
      held = null;
      return;
    }
    if (action !== held) {
      held = action;
      nextAt = time + g.repeatDelayMs;
      onAction(action, index);
    } else if (time >= nextAt) {
      nextAt = time + g.repeatEveryMs;
      onAction(action, index);
    }
  };

  plugin?.on('down', onDown);
  plugin?.on('connected', onConnected);
  scene.events.on('update', onUpdate);

  const destroy = () => {
    plugin?.off('down', onDown);
    plugin?.off('connected', onConnected);
    scene.events.off('update', onUpdate);
  };
  scene.events.once('shutdown', destroy);

  return {
    /** Smoke shim: the same route a real button press takes; `padIndex` is which pad (a match claims pads by it). */
    padDown(index, padIndex = 0) {
      onAction(padAction(index, t), padIndex);
    },
    /** Smoke shim: the same route a d-pad or stick move takes. */
    padNav(dir, padIndex = 0) {
      onAction(`nav:${dir}`, padIndex);
    },
    destroy,
  };
}
