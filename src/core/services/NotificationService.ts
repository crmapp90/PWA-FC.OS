/**
 * NotificationService.ts — Real browser Push Notification for PTP reminders
 * Uses Notification API + scheduled checks via setInterval
 */

import { db } from '../database';
import { logger } from '../logger';

const NOTIF_INTERVAL_MS = 60 * 1000; // Check every 60 seconds
let intervalId: ReturnType<typeof setInterval> | null = null;

export const NotificationService = {
  /** Request browser notification permission */
  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      logger.warn('Notification', 'Browser tidak mendukung notifikasi');
      return false;
    }
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;

    const result = await Notification.requestPermission();
    logger.info('Notification', `Permission result: ${result}`);
    return result === 'granted';
  },

  /** Show a browser notification */
  showNotification(title: string, body: string, tag?: string) {
    if (Notification.permission !== 'granted') return;
    try {
      const notif = new Notification(title, {
        body,
        tag: tag || 'fcos-notif',
        icon: '/icon.svg',
        badge: '/icon.svg',
        requireInteraction: true, // Stay until dismissed — important for field
      });
      notif.onclick = () => { window.focus(); notif.close(); };
      logger.info('Notification', `Shown: "${title}"`);
    } catch (err) {
      logger.error('Notification', 'Failed to show notification', err);
    }
  },

  /** Check for PTP reminders due today or overdue */
  async checkPTPReminders() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const allPTP = await db.promise_to_pay
        .where('status').anyOf(['Active', 'Due Today', 'Overdue'])
        .toArray();

      const overdue = allPTP.filter(p => {
        if (!p.promiseDate) return false;
        const pd = p.promiseDate.split('T')[0];
        return pd <= today && !p.isDeleted;
      });

      if (overdue.length === 0) return;

      // Get customer names for notification
      const customerIds = [...new Set(overdue.map(p => p.customerId))];
      const customers = await Promise.all(
        customerIds.map(id => db.customers.get(id))
      );
      const customerMap = new Map(customers.filter(Boolean).map(c => [c!.id, c!]));

      if (overdue.length === 1) {
        const ptp = overdue[0];
        const customer = customerMap.get(ptp.customerId);
        const name = customer?.name || 'Debitur';
        const amount = new Intl.NumberFormat('id-ID').format(ptp.amount || 0);
        NotificationService.showNotification(
          `⚠️ Janji Bayar Jatuh Tempo`,
          `${name} — Rp${amount} harus ditindaklanjuti sekarang`,
          `ptp-${ptp.id}`
        );
      } else {
        NotificationService.showNotification(
          `⚠️ ${overdue.length} Janji Bayar Jatuh Tempo`,
          `Segera tindaklanjuti janji bayar yang sudah melewati tanggal`,
          'ptp-batch'
        );
      }
    } catch (err) {
      logger.error('Notification', 'PTP check failed', err);
    }
  },

  /** BR-07: Check if it's past 14:00 and target < 50% */
  async checkTargetWarning(collectorId: string) {
    try {
      const hour = new Date().getHours();
      if (hour < 14) return; // Only trigger from 14:00 onwards

      const collector = await db.collectors.get(collectorId);
      if (!collector) return;

      const target = collector.targetAmount || 0;
      if (target <= 0) return;

      // Sum payments today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const payments = await db.payments
        .where('paymentDate').aboveOrEqual(todayStart.toISOString())
        .toArray();
      const collected = payments
        .filter(p => p.collectorId === collectorId && !p.isDeleted)
        .reduce((sum, p) => sum + (p.amount || 0), 0);

      const pct = target > 0 ? (collected / target) : 0;
      if (pct < 0.5) {
        const targetFmt = new Intl.NumberFormat('id-ID').format(target);
        const collectedFmt = new Intl.NumberFormat('id-ID').format(collected);
        NotificationService.showNotification(
          `🎯 Target Harian Belum 50%`,
          `Realisasi Rp${collectedFmt} dari target Rp${targetFmt}. Masih ada waktu!`,
          'target-warning'
        );
        logger.warn('BR-07', `Target warning: ${Math.round(pct * 100)}% at ${hour}:00`);
      }
    } catch (err) {
      logger.error('Notification', 'Target check failed', err);
    }
  },

  /** Start background scheduler */
  startScheduler(collectorId: string) {
    if (intervalId) return; // already running
    logger.info('Notification', 'Reminder scheduler started (60s interval)');
    // Run immediately then every minute
    NotificationService.checkPTPReminders();
    NotificationService.checkTargetWarning(collectorId);
    intervalId = setInterval(() => {
      NotificationService.checkPTPReminders();
      NotificationService.checkTargetWarning(collectorId);
    }, NOTIF_INTERVAL_MS);
  },

  stopScheduler() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
      logger.info('Notification', 'Reminder scheduler stopped');
    }
  },
};
