/**
 * Feedback Utilities for Outdoor Field Operations
 * Combines Tactile (Haptic/Vibration) and Multi-Sensoric Audio feedback.
 */

import { logger } from '../../core/logger';

/**
 * Triggers a short physical haptic vibration if supported by the device.
 * @param pattern duration in ms or vibration pattern array
 */
export function triggerHaptic(pattern: number | number[] = 60) {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(pattern);
      logger.debug('Feedback', `Triggered haptic vibration pattern: ${JSON.stringify(pattern)}`);
    }
  } catch (e) {
    logger.warn('Feedback', 'Haptic feedback not supported or blocked by sandbox/iframe constraints', e);
  }
}

/**
 * Plays a soft, professional synthetic digital double-chime (success signal).
 * Crafted entirely using the standard browser Web Audio API. No external file required.
 */
export function playSuccessChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    
    // First high note
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
    gain1.gain.setValueAtTime(0.08, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    
    osc1.start();
    osc1.stop(ctx.currentTime + 0.35);

    // Second higher note, slightly delayed
    setTimeout(() => {
      try {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1320, ctx.currentTime); // E6 note
        gain2.gain.setValueAtTime(0.08, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
        
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        
        osc2.start();
        osc2.stop(ctx.currentTime + 0.5);
      } catch (_) {}
    }, 120);

    logger.debug('Feedback', 'Played professional success synthesizer chime.');
  } catch (e) {
    logger.warn('Feedback', 'Audio feedback failed or blocked by autoplay browser policy', e);
  }
}

/**
 * Plays a tiny, warm tactile click or lock-in micro sound.
 */
export function playConfirmSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5 note
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // Slide up to A5
    
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.18);
  } catch (_) {}
}
