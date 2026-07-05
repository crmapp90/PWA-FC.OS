import { db, createBaseEntityFields } from '../database';
import { Visit, Customer, Attachment, SyncQueueItem } from '../../types';
import { visitRepository, customerRepository, attachmentRepository } from '../repositories/ConcreteRepositories';
import { SyncQueueManager } from '../repositories/SyncQueueManager';
import { logger } from '../logger';

/**
 * Image compressor utility to run client-side on Canvas
 */
export async function compressImage(base64Str: string, maxWidth = 600, maxHeight = 600, quality = 0.6): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64Str);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      const compressed = canvas.toDataURL('image/jpeg', quality);
      resolve(compressed);
    };
    img.onerror = () => {
      resolve(base64Str); // fallback to original on error
    };
  });
}

export interface VisitWithCustomer extends Visit {
  customerName?: string;
  customerAddress?: string;
  contractNumber?: string;
  area?: string;
  priorityLevel?: string;
}

export class VisitService {
  /**
   * Starts a field visit execution record.
   * Grabs location if available, otherwise initiates gracefully.
   */
  public static async startVisit(
    customerId: string,
    collectorId: string,
    gpsCoords?: { latitude: number; longitude: number; accuracy: number }
  ): Promise<Visit> {
    const now = new Date().toISOString();
    const id = `VST-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const baseFields = createBaseEntityFields(collectorId);

    const visitData: Visit = {
      id,
      ...baseFields,
      customerId,
      collectorId,
      visitDate: now.split('T')[0],
      status: 'CONTACT', // Default status, updated on finish
      notes: '',
      latitude: gpsCoords?.latitude || 0,
      longitude: gpsCoords?.longitude || 0,
      accuracy: gpsCoords?.accuracy || 0,
      
      // Sprint 5 fields
      startTime: now,
      visitStatus: 'STARTED',
      addressConfirmation: 'UNCONFIRMED',
      offlineStatus: 'OFFLINE',
    };

    try {
      await visitRepository.insert(visitData, collectorId);
      logger.info('VisitService', `Kunjungan berhasil dimulai: ID ${id} untuk debitur ${customerId}`);
      return visitData;
    } catch (err) {
      logger.error('VisitService', `Gagal memulai kunjungan untuk debitur ${customerId}`, err);
      throw err;
    }
  }

  /**
   * Finalizes/Ends a visit execution with operation details, attachments, signatures and notes.
   */
  public static async endVisit(
    visitId: string,
    data: {
      visitResult: Visit['visitResult'];
      addressConfirmation: Visit['addressConfirmation'];
      customerCondition?: string;
      status: Visit['status'];
      notes: string;
      collectorNotes?: string;
      nextAction: Visit['nextAction'];
      followUpDate?: string;
      photoUrls?: string[];
      voiceUrl?: string;
      signatureBase64?: string;
      gpsCoords?: { latitude: number; longitude: number; accuracy: number };
    },
    collectorId: string
  ): Promise<Visit> {
    const now = new Date().toISOString();
    const visit = await visitRepository.findById(visitId);
    if (!visit) {
      throw new Error(`Visit record ${visitId} not found.`);
    }

    // Calculate duration in seconds
    const startTimeStr = visit.startTime || visit.createdAt;
    const startTime = new Date(startTimeStr).getTime();
    const endTime = new Date(now).getTime();
    const duration = Math.max(1, Math.round((endTime - startTime) / 1000));

    // Compress photos
    const compressedPhotos: string[] = [];
    if (data.photoUrls && data.photoUrls.length > 0) {
      for (const photo of data.photoUrls) {
        try {
          const compressed = await compressImage(photo);
          compressedPhotos.push(compressed);
        } catch (e) {
          compressedPhotos.push(photo);
        }
      }
    }

    const updatedVisitFields: Partial<Visit> = {
      endTime: now,
      duration,
      visitStatus: 'COMPLETED',
      status: data.status,
      visitResult: data.visitResult,
      addressConfirmation: data.addressConfirmation,
      customerCondition: data.customerCondition || '',
      notes: data.notes,
      collectorNotes: data.collectorNotes || data.notes,
      nextAction: data.nextAction,
      followUpDate: data.followUpDate,
      photoUrls: compressedPhotos,
      photoUrl: compressedPhotos[0] || undefined,
      voiceUrl: data.voiceUrl,
      signatureBase64: data.signatureBase64,
      signatureStatus: data.signatureBase64 ? 'SIGNED' : 'UNSIGNED',
      attachmentCount: (compressedPhotos.length) + (data.voiceUrl ? 1 : 0) + (data.signatureBase64 ? 1 : 0),
      photoCount: compressedPhotos.length,
      voiceCount: data.voiceUrl ? 1 : 0,
      offlineStatus: 'OFFLINE',
      latitude: data.gpsCoords?.latitude || visit.latitude,
      longitude: data.gpsCoords?.longitude || visit.longitude,
      accuracy: data.gpsCoords?.accuracy || visit.accuracy,
    };

    try {
      // 1. Update visit record
      const updatedVisit = await visitRepository.update(visitId, updatedVisitFields, collectorId);

      // 2. Map visitResult to Customer Status
      let customerStatus: Customer['status'] = 'VISITED';
      if (data.visitResult === 'PAID' || data.visitResult === 'PARTIAL_PAYMENT') {
        customerStatus = 'PAID';
      } else if (data.visitResult === 'PROMISE_TO_PAY') {
        customerStatus = 'PROMISED';
      }

      // BR-06: Track consecutive "Tidak Ketemu" (CUSTOMER_NOT_HOME) visits
      const customer = await customerRepository.findById(visit.customerId);
      let missedCount = customer?.consecutiveMissedVisits || 0;
      if (data.visitResult === 'CUSTOMER_NOT_HOME') {
        missedCount += 1;
      } else {
        missedCount = 0; // Reset on any other result
      }
      const br06Alert = missedCount >= 3;

      // BR-01: Recompute priority (bump if PTP was broken or missed >= 3)
      let currentPriority = customer?.priorityLevel || 'MEDIUM';
      if (br06Alert) {
        const order = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
        const idx = order.indexOf(currentPriority);
        currentPriority = order[Math.min(idx + 1, order.length - 1)] as any;
        logger.warn('BR-06', `${visit.customerId}: 3x tidak ketemu berturut. Prioritas naik ke ${currentPriority}.`);
      }

      // Update customer record
      await customerRepository.update(visit.customerId, {
        status: customerStatus,
        lastVisitDate: now.split('T')[0],
        consecutiveMissedVisits: missedCount,
        priorityLevel: currentPriority as any,
        needsContactUpdate: br06Alert,
      } as any, collectorId);

      // 3. Save attachments to attachments table
      for (let i = 0; i < compressedPhotos.length; i++) {
        const attId = `ATT-P-${visitId}-${i}-${Date.now()}`;
        const attFields = createBaseEntityFields(collectorId);
        await attachmentRepository.insert({
          id: attId,
          ...attFields,
          entityType: 'visit',
          entityId: visitId,
          fileName: `visit_photo_${i + 1}.jpg`,
          fileType: 'image/jpeg',
          fileSize: Math.round(compressedPhotos[i].length * 0.75),
          fileUrlOrBase64: compressedPhotos[i],
        }, collectorId);
      }

      if (data.voiceUrl) {
        const attId = `ATT-V-${visitId}-${Date.now()}`;
        const attFields = createBaseEntityFields(collectorId);
        await attachmentRepository.insert({
          id: attId,
          ...attFields,
          entityType: 'visit',
          entityId: visitId,
          fileName: `visit_voice_${Date.now()}.mp3`,
          fileType: 'audio/mp3',
          fileSize: Math.round(data.voiceUrl.length * 0.75),
          fileUrlOrBase64: data.voiceUrl,
        }, collectorId);
      }

      if (data.signatureBase64) {
        const attId = `ATT-S-${visitId}-${Date.now()}`;
        const attFields = createBaseEntityFields(collectorId);
        await attachmentRepository.insert({
          id: attId,
          ...attFields,
          entityType: 'visit',
          entityId: visitId,
          fileName: `customer_signature_${Date.now()}.png`,
          fileType: 'image/png',
          fileSize: Math.round(data.signatureBase64.length * 0.75),
          fileUrlOrBase64: data.signatureBase64,
        }, collectorId);
      }

      // 4. Enqueue to Sync Queue
      await SyncQueueManager.enqueue(
        'visit',
        visitId,
        'CREATE',
        { ...updatedVisit, photoUrls: compressedPhotos, voiceUrl: data.voiceUrl, signatureBase64: data.signatureBase64 },
        collectorId
      );

      logger.info('VisitService', `Kunjungan ID ${visitId} berhasil diselesaikan offline dan dimasukkan antrean sinkron.`);
      return updatedVisit;
    } catch (err) {
      logger.error('VisitService', `Gagal menyelesaikan kunjungan ID ${visitId}`, err);
      throw err;
    }
  }

  /**
   * Retrieves visits with detailed filters, search queries, and sorting.
   */
  public static async getVisitsWithDetails(params: {
    query?: string;
    status?: string;
    visitResult?: string;
    date?: string;
    area?: string;
    collector?: string;
    priority?: string;
    sortBy?: 'newest' | 'oldest' | 'priority' | 'customerName' | 'followUpDate';
  }): Promise<VisitWithCustomer[]> {
    try {
      const allVisits = await visitRepository.findAll();
      const allCustomers = await customerRepository.findAll();

      // Create mapping for fast lookups
      const customerMap = new Map<string, Customer>();
      allCustomers.forEach(c => customerMap.set(c.id, c));

      // Map visits to detailed structures
      let results: VisitWithCustomer[] = allVisits.map(visit => {
        const cust = customerMap.get(visit.customerId);
        return {
          ...visit,
          customerName: cust?.name || 'Tidak Dikenal',
          customerAddress: cust?.address || '',
          contractNumber: cust?.contractNumber || '',
          area: cust?.area || '',
          priorityLevel: cust?.priorityLevel || 'LOW',
        };
      });

      // --- SEARCH ---
      if (params.query) {
        const q = params.query.toLowerCase().trim();
        results = results.filter(r => 
          r.customerName?.toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q) ||
          r.contractNumber?.toLowerCase().includes(q) ||
          r.collectorId.toLowerCase().includes(q) ||
          r.visitDate.includes(q)
        );
      }

      // --- FILTERS ---
      if (params.status) {
        results = results.filter(r => r.status === params.status || r.visitStatus === params.status);
      }
      if (params.visitResult) {
        results = results.filter(r => r.visitResult === params.visitResult);
      }
      if (params.date) {
        results = results.filter(r => r.visitDate === params.date);
      }
      if (params.area) {
        results = results.filter(r => r.area?.toLowerCase() === params.area?.toLowerCase());
      }
      if (params.collector) {
        results = results.filter(r => r.collectorId.toLowerCase() === params.collector?.toLowerCase());
      }
      if (params.priority) {
        results = results.filter(r => r.priorityLevel === params.priority);
      }

      // --- SORTING ---
      const priorityWeights: Record<string, number> = { 'CRITICAL': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
      
      const sort = params.sortBy || 'newest';
      results.sort((a, b) => {
        if (sort === 'newest') {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        if (sort === 'oldest') {
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        }
        if (sort === 'priority') {
          const wa = priorityWeights[a.priorityLevel || 'LOW'] || 0;
          const wb = priorityWeights[b.priorityLevel || 'LOW'] || 0;
          return wb - wa;
        }
        if (sort === 'customerName') {
          return (a.customerName || '').localeCompare(b.customerName || '');
        }
        if (sort === 'followUpDate') {
          if (!a.followUpDate) return 1;
          if (!b.followUpDate) return -1;
          return new Date(a.followUpDate).getTime() - new Date(b.followUpDate).getTime();
        }
        return 0;
      });

      return results;
    } catch (err) {
      logger.error('VisitService', 'Gagal memuat daftar kunjungan terfilter', err);
      return [];
    }
  }

  /**
   * Constructs timeline events chronologically for a specific customer.
   */
  public static async getTimelineForCustomer(customerId: string): Promise<any[]> {
    try {
      const visits = await visitRepository.findByCustomer(customerId);
      const timeline: any[] = [];

      // Add actual visits to timeline
      visits.forEach(v => {
        timeline.push({
          id: `TL-V-${v.id}`,
          type: 'visit',
          title: 'Kunjungan Lapangan',
          subtitle: `Oleh Kolektor: ${v.collectorId}`,
          status: v.visitStatus,
          result: v.visitResult || 'Kunjungan Dimulai',
          timestamp: v.startTime || v.createdAt,
          notes: v.notes || v.collectorNotes || 'Kunjungan teregistrasi',
          meta: {
            duration: v.duration,
            photoCount: v.photoCount || 0,
            voiceCount: v.voiceCount || 0,
            signatureStatus: v.signatureStatus,
            gps: v.latitude ? `${v.latitude.toFixed(5)}, ${v.longitude.toFixed(5)}` : null,
          }
        });

        // If paid, add a Payment Placeholder to timeline (as requested in specifications)
        if (v.visitResult === 'PAID' || v.visitResult === 'PARTIAL_PAYMENT') {
          timeline.push({
            id: `TL-P-${v.id}`,
            type: 'payment_placeholder',
            title: 'Pembayaran Diterima (Offline)',
            subtitle: `Siklus Verifikasi Kuitansi`,
            result: 'PAID',
            timestamp: v.endTime || v.createdAt,
            notes: `Pembayaran diproses offline dari hasil kunjungan. Status: Menunggu Sinkronisasi Aset.`,
            meta: {
              amount: 'Pembayaran Hasil Kunjungan',
              receiptNumber: `REC-OFFLINE-${v.id.substring(4, 9)}`,
            }
          });
        }

        // If promise to pay, add PTP Placeholder to timeline
        if (v.visitResult === 'PROMISE_TO_PAY') {
          timeline.push({
            id: `TL-PTP-${v.id}`,
            type: 'ptp_placeholder',
            title: 'Komitmen Janji Bayar (PTP)',
            subtitle: `Siklus Monitoring Janji Bayar`,
            result: 'PROMISED',
            timestamp: v.endTime || v.createdAt,
            notes: `Kolektor mencatat komitmen bayar tanggal: ${v.followUpDate || 'Tidak Ditentukan'}.`,
            meta: {
              followUpDate: v.followUpDate,
            }
          });
        }

        // If next action is Reminder, add Reminder Placeholder to timeline
        if (v.nextAction === 'REMINDER') {
          timeline.push({
            id: `TL-REM-${v.id}`,
            type: 'reminder_placeholder',
            title: 'Pengingat Dipasang',
            subtitle: 'Otomatisasi Tindak Lanjut',
            result: 'REMINDER',
            timestamp: v.endTime || v.createdAt,
            notes: `Sistem menjadwalkan pengingat penagihan pada tanggal: ${v.followUpDate || 'Tindak Lanjut Mendatang'}.`,
            meta: {
              actionDate: v.followUpDate
            }
          });
        }

        // Add Future Sync Placeholder if offline
        if (v.syncStatus === 'pending') {
          timeline.push({
            id: `TL-SYNC-${v.id}`,
            type: 'future_sync_placeholder',
            title: 'Sinkronisasi Cloud Tertunda',
            subtitle: 'Antrean Operasional Luring',
            result: 'PENDING_SYNC',
            timestamp: v.endTime || v.createdAt,
            notes: 'Data kunjungan tersimpan aman di perangkat. Transmisi nirkabel akan diproses saat jaringan terdeteksi.',
            meta: {}
          });
        }
      });

      // Sort timeline chronologically descending
      timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return timeline;
    } catch (e) {
      logger.error('VisitService', `Gagal membuat timeline debitur ${customerId}`, e);
      return [];
    }
  }

  /**
   * Generates mock operational Visit records for testing performance with massive collections.
   * Generates N visits bound to various customers.
   */
  public static async seedMassiveVisits(count = 50000): Promise<number> {
    try {
      logger.warn('VisitService', `Memulai pembuatan ${count} data kunjungan untuk tes performa...`);
      const customers = await customerRepository.findAll();
      if (customers.length === 0) {
        throw new Error('No customers found to bind mass visits to. Seed database first.');
      }

      const resultsList: Visit[] = [];
      const now = new Date();

      const results = ['CUSTOMER_MET', 'CUSTOMER_NOT_HOME', 'PROMISE_TO_PAY', 'PAID', 'REFUSED'] as const;
      const statuses = ['CONTACT', 'NO_CONTACT', 'BUSINESS_CLOSED', 'ADDRESS_NOT_FOUND'] as const;
      const actions = ['REVISIT', 'CALL', 'REMINDER', 'WAIT'] as const;

      for (let i = 0; i < count; i++) {
        const cust = customers[i % customers.length];
        const dayOffset = Math.floor(Math.random() * 30);
        const visitDate = new Date(now.getTime() - dayOffset * 24 * 60 * 60 * 1000).toISOString();
        
        const id = `VST-MASS-${i}`;
        const baseFields = createBaseEntityFields('COL-7729');
        
        resultsList.push({
          id,
          ...baseFields,
          customerId: cust.id,
          collectorId: 'COL-7729',
          visitDate: visitDate.split('T')[0],
          status: statuses[i % statuses.length],
          notes: `Catatan tes performa kunjungan ke-${i}`,
          latitude: -6.21462 + (Math.random() - 0.5) * 0.1,
          longitude: 106.84513 + (Math.random() - 0.5) * 0.1,
          accuracy: Math.floor(5 + Math.random() * 20),
          startTime: visitDate,
          endTime: new Date(new Date(visitDate).getTime() + 15 * 60 * 1000).toISOString(),
          duration: 900,
          visitResult: results[i % results.length],
          visitStatus: 'COMPLETED',
          addressConfirmation: 'CONFIRMED',
          customerCondition: 'Kondisi Debitur Stabil',
          nextAction: actions[i % actions.length],
          followUpDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          attachmentCount: 0,
          photoCount: 0,
          voiceCount: 0,
          signatureStatus: 'UNSIGNED',
          offlineStatus: 'OFFLINE',
          syncStatus: 'synced' // Mass test data is pre-marked as synced so it doesn't overload offline queue
        });

        // Write in chunks of 5000 for Dexie memory efficiency
        if (resultsList.length >= 5000) {
          await db.visits.bulkAdd(resultsList);
          resultsList.length = 0;
          logger.info('VisitService', `Telah menulis ${i + 1} data kunjungan...`);
        }
      }

      if (resultsList.length > 0) {
        await db.visits.bulkAdd(resultsList);
      }

      logger.info('VisitService', `Berhasil mengunggah ${count} data kunjungan tes performa.`);
      return count;
    } catch (e) {
      logger.error('VisitService', 'Gagal membuat data kunjungan massal', e);
      throw e;
    }
  }
}
