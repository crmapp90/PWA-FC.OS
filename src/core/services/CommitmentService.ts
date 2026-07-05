import { db, createBaseEntityFields } from '../database';
import { PromiseToPay, Customer, SyncQueueItem } from '../../types';
import { promiseToPayRepository, customerRepository, auditLogRepository } from '../repositories/ConcreteRepositories';
import { logger } from '../logger';
import { SyncQueueManager } from '../repositories/SyncQueueManager';

export interface CommitmentWithCustomer extends PromiseToPay {
  customerName?: string;
  customerAddress?: string;
  contractNumber?: string;
  area?: string;
  priorityLevel?: string;
  outstandingBalance?: number;
}

export class CommitmentService {
  /**
   * Helper to evaluate and update all active commitments' statuses based on dates
   * (e.g. mark as Overdue if past due date).
   */
  public static async evaluateCommitmentStatuses(): Promise<void> {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const allPromises = await db.promise_to_pay.toArray();
      const activePromises = allPromises.filter(p => p.status === 'Active' || p.status === 'Draft' || p.status === 'Due Today');

      for (const p of activePromises) {
        let newStatus: typeof p.status = p.status;
        
        if (p.status !== 'Completed' && p.status !== 'Cancelled' && p.status !== 'Broken') {
          if (p.dueDate === todayStr) {
            newStatus = 'Due Today';
          } else if (p.dueDate < todayStr) {
            newStatus = 'Overdue';
          } else {
            newStatus = 'Active';
          }
        }

        if (newStatus !== p.status) {
          await db.promise_to_pay.update(p.id, {
            status: newStatus,
            updatedAt: new Date().toISOString()
          });
          logger.info('CommitmentService', `Auto-evaluated status for PTP ${p.id}: ${p.status} -> ${newStatus}`);
          
          // Log status transition
          await auditLogRepository.insert({
            id: `AUDIT-AUTO-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
            level: 'INFO',
            tag: 'CommitmentService',
            timestamp: new Date().toISOString(),
            message: `Sistem memperbarui status janji bayar ${p.id} menjadi ${newStatus} secara otomatis.`,
            details: JSON.stringify({ commitmentId: p.id, oldStatus: p.status, newStatus })
          }, 'system');
        }
      }
    } catch (err) {
      logger.error('CommitmentService', 'Failed to evaluate commitment statuses', err);
    }
  }

  /**
   * Fetch all commitments with detailed customer information, filtering, and sorting
   */
  public static async getCommitmentsWithDetails(filters: {
    query?: string;
    status?: string;
    riskLevel?: string;
    priority?: string;
    area?: string;
    collectorId?: string;
    dueDate?: string;
    sortBy?: 'dueDate' | 'priority' | 'amount' | 'customerName' | 'newest' | 'oldest';
  } = {}): Promise<CommitmentWithCustomer[]> {
    try {
      // Evaluate first to ensure we display accurate statuses
      await this.evaluateCommitmentStatuses();

      const [promises, customers] = await Promise.all([
        db.promise_to_pay.toArray(),
        db.customers.toArray()
      ]);

      const customerMap = new Map<string, Customer>();
      customers.forEach(c => customerMap.set(c.id, c));

      // Combine and filter
      let results: CommitmentWithCustomer[] = promises.map(p => {
        const cust = customerMap.get(p.customerId);
        return {
          ...p,
          customerName: cust?.name || 'Debitur Tidak Dikenal',
          customerAddress: cust?.address || 'Alamat Tidak Ditemukan',
          contractNumber: cust?.contractNumber || '-',
          area: cust?.area || 'Lainnya',
          priorityLevel: cust?.priorityLevel || 'LOW',
          outstandingBalance: cust?.outstandingBalance || 0
        };
      });

      // Filter by Search Term (Customer Name, Contract Number, Date, Collector)
      if (filters.query) {
        const q = filters.query.toLowerCase();
        results = results.filter(r => 
          r.customerName?.toLowerCase().includes(q) ||
          r.contractNumber?.toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q) ||
          r.dueDate.includes(q) ||
          r.collectorId.toLowerCase().includes(q)
        );
      }

      // Filter by Status
      if (filters.status && filters.status !== 'ALL') {
        results = results.filter(r => r.status === filters.status);
      }

      // Filter by Risk Level
      if (filters.riskLevel && filters.riskLevel !== 'ALL') {
        results = results.filter(r => r.riskLevel === filters.riskLevel);
      }

      // Filter by Priority
      if (filters.priority && filters.priority !== 'ALL') {
        results = results.filter(r => r.priority === filters.priority);
      }

      // Filter by Area
      if (filters.area && filters.area !== 'ALL') {
        results = results.filter(r => r.area === filters.area);
      }

      // Filter by Collector
      if (filters.collectorId && filters.collectorId !== 'ALL') {
        results = results.filter(r => r.collectorId === filters.collectorId);
      }

      // Filter by Due Date
      if (filters.dueDate) {
        results = results.filter(r => r.dueDate === filters.dueDate);
      }

      // Sort
      const sortType = filters.sortBy || 'newest';
      results.sort((a, b) => {
        switch (sortType) {
          case 'dueDate':
            return a.dueDate.localeCompare(b.dueDate);
          case 'priority': {
            const prioWeight = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
            const weightA = prioWeight[a.priority] || 0;
            const weightB = prioWeight[b.priority] || 0;
            return weightB - weightA; // High priority first
          }
          case 'amount':
            return b.promisedAmount - a.promisedAmount; // High amount first
          case 'customerName':
            return (a.customerName || '').localeCompare(b.customerName || '');
          case 'oldest':
            return a.createdAt.localeCompare(b.createdAt);
          case 'newest':
          default:
            return b.createdAt.localeCompare(a.createdAt);
        }
      });

      return results;
    } catch (err) {
      logger.error('CommitmentService', 'Failed to retrieve commitment details', err);
      return [];
    }
  }

  /**
   * Creates a new commitment with strict business validations
   */
  public static async createCommitment(
    customerId: string,
    collectorId: string,
    data: {
      visitId?: string;
      dueDate: string;
      promisedAmount: number;
      expectedPaymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'OTHER';
      status?: 'Draft' | 'Active';
      priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
      reminderDate?: string;
      reminderTime?: string;
      followUpDate?: string;
      reason?: string;
      collectorNotes?: string;
      customerNotes?: string;
    }
  ): Promise<PromiseToPay> {
    const todayStr = new Date().toISOString().split('T')[0];

    // 1. Validation: Due Date cannot be in the past
    if (data.dueDate < todayStr) {
      throw new Error('TANGGAL_JATUH_TEMPO_LAMPAU: Tanggal janji bayar tidak boleh di masa lalu.');
    }

    // 2. Validation: Duplicate active commitment check
    const activePromises = await db.promise_to_pay
      .where('customerId')
      .equals(customerId)
      .toArray();
    
    const duplicate = activePromises.find(p => p.status === 'Active' || p.status === 'Due Today' || p.status === 'Draft');
    if (duplicate) {
      throw new Error(`KOMITMEN_GANDA: Debitur ini sudah memiliki janji bayar aktif (${duplicate.id}) yang jatuh tempo tanggal ${duplicate.dueDate}.`);
    }

    // Generates base fields and IDs
    const id = `PTP-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const baseFields = createBaseEntityFields(collectorId);

    const commitment: PromiseToPay = {
      id,
      ...baseFields,
      customerId,
      collectorId,
      // For backward compatibility:
      amount: data.promisedAmount,
      promiseDate: data.dueDate,
      notes: data.collectorNotes || '',

      // Rich commitment fields:
      visitId: data.visitId,
      commitmentDate: new Date().toISOString(),
      dueDate: data.dueDate,
      promisedAmount: data.promisedAmount,
      expectedPaymentMethod: data.expectedPaymentMethod,
      status: data.status || 'Active',
      priority: data.priority,
      reminderDate: data.reminderDate,
      reminderTime: data.reminderTime,
      followUpDate: data.followUpDate,
      riskLevel: data.riskLevel,
      reason: data.reason,
      collectorNotes: data.collectorNotes,
      customerNotes: data.customerNotes
    };

    try {
      await promiseToPayRepository.insert(commitment, collectorId);
      
      // Update customer status to PROMISED
      const customer = await db.customers.get(customerId);
      if (customer) {
        await db.customers.update(customerId, {
          status: 'PROMISED',
          updatedAt: new Date().toISOString()
        });
      }

      // Add audit log for creation
      await auditLogRepository.insert({
        id: `AUDIT-CREATE-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
        level: 'INFO',
        tag: 'CommitmentService',
        timestamp: new Date().toISOString(),
        message: `Janji Bayar baru dibuat: ${id} sebesar Rp ${data.promisedAmount.toLocaleString()} Jatuh Tempo ${data.dueDate}.`,
        details: JSON.stringify({ commitmentId: id, customerId, amount: data.promisedAmount })
      }, collectorId);

      logger.info('CommitmentService', `Commitment ${id} created successfully.`);

      // Enqueue commitment creation for cloud sync
      try {
        await SyncQueueManager.enqueue(
          'promise_to_pay',
          id,
          'CREATE',
          commitment,
          collectorId
        );
      } catch (syncErr) {
        logger.error('CommitmentService', `Failed to enqueue commitment creation for sync: ${id}`, syncErr);
      }

      return commitment;
    } catch (err) {
      logger.error('CommitmentService', 'Failed to create commitment', err);
      throw err;
    }
  }

  /**
   * Updates an existing commitment with audit logging
   */
  public static async updateCommitment(
    id: string,
    data: {
      dueDate?: string;
      promisedAmount?: number;
      expectedPaymentMethod?: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'OTHER';
      priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      riskLevel?: 'Low' | 'Medium' | 'High' | 'Critical';
      reminderDate?: string;
      reminderTime?: string;
      followUpDate?: string;
      reason?: string;
      collectorNotes?: string;
      customerNotes?: string;
    },
    collectorId: string
  ): Promise<PromiseToPay> {
    const ptp = await db.promise_to_pay.get(id);
    if (!ptp) {
      throw new Error(`Janji bayar dengan ID ${id} tidak ditemukan.`);
    }

    const todayStr = new Date().toISOString().split('T')[0];
    if (data.dueDate && data.dueDate < todayStr && ptp.status !== 'Completed' && ptp.status !== 'Cancelled') {
      throw new Error('TANGGAL_JATUH_TEMPO_LAMPAU: Tanggal janji bayar tidak boleh di masa lalu.');
    }

    const updatedFields: Partial<PromiseToPay> = {
      updatedAt: new Date().toISOString(),
      updatedBy: collectorId,
      // Rich fields
      dueDate: data.dueDate !== undefined ? data.dueDate : ptp.dueDate,
      promisedAmount: data.promisedAmount !== undefined ? data.promisedAmount : ptp.promisedAmount,
      expectedPaymentMethod: data.expectedPaymentMethod !== undefined ? data.expectedPaymentMethod : ptp.expectedPaymentMethod,
      priority: data.priority !== undefined ? data.priority : ptp.priority,
      riskLevel: data.riskLevel !== undefined ? data.riskLevel : ptp.riskLevel,
      reminderDate: data.reminderDate !== undefined ? data.reminderDate : ptp.reminderDate,
      reminderTime: data.reminderTime !== undefined ? data.reminderTime : ptp.reminderTime,
      followUpDate: data.followUpDate !== undefined ? data.followUpDate : ptp.followUpDate,
      reason: data.reason !== undefined ? data.reason : ptp.reason,
      collectorNotes: data.collectorNotes !== undefined ? data.collectorNotes : ptp.collectorNotes,
      customerNotes: data.customerNotes !== undefined ? data.customerNotes : ptp.customerNotes,

      // Backward compatibility mappings
      amount: data.promisedAmount !== undefined ? data.promisedAmount : ptp.amount,
      promiseDate: data.dueDate !== undefined ? data.dueDate : ptp.promiseDate,
      notes: data.collectorNotes !== undefined ? data.collectorNotes : ptp.notes
    };

    try {
      await promiseToPayRepository.update(id, updatedFields, collectorId);

      // Auditing
      await auditLogRepository.insert({
        id: `AUDIT-UPDATE-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
        level: 'INFO',
        tag: 'CommitmentService',
        timestamp: new Date().toISOString(),
        message: `Janji bayar ${id} diperbarui oleh kolektor ${collectorId}.`,
        details: JSON.stringify({ commitmentId: id, updatedFields })
      }, collectorId);

      logger.info('CommitmentService', `Commitment ${id} updated successfully.`);
      const resultObj = { ...ptp, ...updatedFields } as PromiseToPay;
      try {
        await SyncQueueManager.enqueue(
          'promise_to_pay',
          id,
          'UPDATE',
          resultObj,
          collectorId
        );
      } catch (syncErr) {
        logger.error('CommitmentService', `Failed to enqueue commitment update for sync: ${id}`, syncErr);
      }
      return resultObj;
    } catch (err) {
      logger.error('CommitmentService', `Failed to update commitment ${id}`, err);
      throw err;
    }
  }

  /**
   * Cancel a commitment
   */
  public static async cancelCommitment(id: string, notes: string, collectorId: string): Promise<void> {
    try {
      const ptp = await db.promise_to_pay.get(id);
      if (!ptp) throw new Error('Commitment not found');

      await promiseToPayRepository.update(id, {
        status: 'Cancelled',
        collectorNotes: notes || `Dibatalkan: ${ptp.collectorNotes}`,
        notes: notes || `Dibatalkan: ${ptp.notes}`,
        updatedAt: new Date().toISOString()
      }, collectorId);

      // Reset customer status if no other active commitments
      await this.resetCustomerStatusIfResolved(ptp.customerId);

      await auditLogRepository.insert({
        id: `AUDIT-CANCEL-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
        level: 'WARN',
        tag: 'CommitmentService',
        timestamp: new Date().toISOString(),
        message: `Janji Bayar ${id} dibatalkan oleh kolektor. Alasan: ${notes}`,
        details: JSON.stringify({ commitmentId: id, notes })
      }, collectorId);

      logger.info('CommitmentService', `Commitment ${id} marked as Cancelled.`);
      const updatedPtp = await db.promise_to_pay.get(id);
      if (updatedPtp) {
        try {
          await SyncQueueManager.enqueue(
            'promise_to_pay',
            id,
            'UPDATE',
            updatedPtp,
            collectorId
          );
        } catch (syncErr) {
          logger.error('CommitmentService', `Failed to enqueue commitment cancellation for sync: ${id}`, syncErr);
        }
      }
    } catch (err) {
      logger.error('CommitmentService', `Failed to cancel commitment ${id}`, err);
      throw err;
    }
  }

  /**
   * Fulfill/Complete a commitment
   */
  public static async fulfillCommitment(id: string, notes: string, collectorId: string): Promise<void> {
    try {
      const ptp = await db.promise_to_pay.get(id);
      if (!ptp) throw new Error('Commitment not found');

      await promiseToPayRepository.update(id, {
        status: 'Completed',
        collectorNotes: notes || `Diselesaikan: ${ptp.collectorNotes}`,
        notes: notes || `Diselesaikan: ${ptp.notes}`,
        updatedAt: new Date().toISOString()
      }, collectorId);

      // Reset customer status if no other active commitments
      await this.resetCustomerStatusIfResolved(ptp.customerId);

      await auditLogRepository.insert({
        id: `AUDIT-COMPLETE-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
        level: 'INFO',
        tag: 'CommitmentService',
        timestamp: new Date().toISOString(),
        message: `Janji Bayar ${id} diselesaikan/dipenuhi oleh kolektor. Catatan: ${notes}`,
        details: JSON.stringify({ commitmentId: id, notes })
      }, collectorId);

      logger.info('CommitmentService', `Commitment ${id} marked as Completed.`);
      const updatedPtp = await db.promise_to_pay.get(id);
      if (updatedPtp) {
        try {
          await SyncQueueManager.enqueue(
            'promise_to_pay',
            id,
            'UPDATE',
            updatedPtp,
            collectorId
          );
        } catch (syncErr) {
          logger.error('CommitmentService', `Failed to enqueue commitment fulfillment for sync: ${id}`, syncErr);
        }
      }
    } catch (err) {
      logger.error('CommitmentService', `Failed to complete commitment ${id}`, err);
      throw err;
    }
  }

  /**
   * Break / Fail a commitment manually
   */
  public static async breakCommitment(id: string, notes: string, collectorId: string): Promise<void> {
    try {
      const ptp = await db.promise_to_pay.get(id);
      if (!ptp) throw new Error('Commitment not found');

      await promiseToPayRepository.update(id, {
        status: 'Broken',
        collectorNotes: notes || `Gagal dipenuhi (Broken): ${ptp.collectorNotes}`,
        notes: notes || `Gagal dipenuhi (Broken): ${ptp.notes}`,
        updatedAt: new Date().toISOString()
      }, collectorId);

      await this.resetCustomerStatusIfResolved(ptp.customerId);

      await auditLogRepository.insert({
        id: `AUDIT-BROKEN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
        level: 'WARN',
        tag: 'CommitmentService',
        timestamp: new Date().toISOString(),
        message: `Janji Bayar ${id} ditandai gagal dipenuhi (Broken). Catatan: ${notes}`,
        details: JSON.stringify({ commitmentId: id, notes })
      }, collectorId);

      logger.info('CommitmentService', `Commitment ${id} marked as Broken.`);
      const updatedPtp = await db.promise_to_pay.get(id);
      if (updatedPtp) {
        try {
          await SyncQueueManager.enqueue(
            'promise_to_pay',
            id,
            'UPDATE',
            updatedPtp,
            collectorId
          );
        } catch (syncErr) {
          logger.error('CommitmentService', `Failed to enqueue commitment breach for sync: ${id}`, syncErr);
        }
      }
    } catch (err) {
      logger.error('CommitmentService', `Failed to break commitment ${id}`, err);
      throw err;
    }
  }

  /**
   * Reset Customer's operational status if they no longer have active promises
   */
  private static async resetCustomerStatusIfResolved(customerId: string): Promise<void> {
    const promises = await db.promise_to_pay.where('customerId').equals(customerId).toArray();
    const hasActive = promises.some(p => p.status === 'Active' || p.status === 'Due Today' || p.status === 'Draft');
    
    if (!hasActive) {
      const cust = await db.customers.get(customerId);
      if (cust) {
        // If there was a recent visit, mark VISITED, otherwise PENDING
        const visits = await db.visits.where('customerId').equals(customerId).toArray();
        const nextStatus = visits.length > 0 ? 'VISITED' : 'PENDING';
        
        await db.customers.update(customerId, {
          status: nextStatus,
          updatedAt: new Date().toISOString()
        });
        logger.info('CommitmentService', `Reset customer status for ${customerId} to ${nextStatus}`);
      }
    }
  }

  /**
   * Retrieve the chronological Reminder Queue ready for future notification triggers.
   */
  public static async getReminderQueue(): Promise<CommitmentWithCustomer[]> {
    try {
      const commitments = await this.getCommitmentsWithDetails();
      // Filter those with valid reminder dates/times, which are still active
      const reminderQueue = commitments.filter(c => 
        c.reminderDate && 
        (c.status === 'Active' || c.status === 'Due Today' || c.status === 'Draft' || c.status === 'Overdue')
      );

      // Sort by reminderDate and reminderTime
      reminderQueue.sort((a, b) => {
        const dateA = `${a.reminderDate}T${a.reminderTime || '00:00'}`;
        const dateB = `${b.reminderDate}T${b.reminderTime || '00:00'}`;
        return dateA.localeCompare(dateB);
      });

      return reminderQueue;
    } catch (err) {
      logger.error('CommitmentService', 'Failed to retrieve reminder queue', err);
      return [];
    }
  }

  /**
   * Retrieves commitments grouped or listed for Follow Up queues
   */
  public static async getFollowUpQueue(): Promise<{
    action: 'Support' | 'Call Customer' | 'Visit Again' | 'Send Reminder (Future)' | 'Escalate' | 'Close';
    commitments: CommitmentWithCustomer[];
  }[]> {
    try {
      const commitments = await this.getCommitmentsWithDetails();
      const activeCommitments = commitments.filter(c => 
        c.status === 'Active' || c.status === 'Due Today' || c.status === 'Overdue'
      );

      // Determine follow-up based on risk and status
      const groups: Record<string, CommitmentWithCustomer[]> = {
        'Support': [],
        'Call Customer': [],
        'Visit Again': [],
        'Send Reminder (Future)': [],
        'Escalate': [],
        'Close': []
      };

      activeCommitments.forEach(c => {
        if (c.status === 'Overdue' || c.riskLevel === 'Critical') {
          groups['Escalate'].push(c);
        } else if (c.riskLevel === 'High') {
          groups['Visit Again'].push(c);
        } else if (c.status === 'Due Today' || c.riskLevel === 'Medium') {
          groups['Call Customer'].push(c);
        } else if (c.reminderDate) {
          groups['Send Reminder (Future)'].push(c);
        } else {
          groups['Support'].push(c);
        }
      });

      return [
        { action: 'Escalate', commitments: groups['Escalate'] },
        { action: 'Visit Again', commitments: groups['Visit Again'] },
        { action: 'Call Customer', commitments: groups['Call Customer'] },
        { action: 'Send Reminder (Future)', commitments: groups['Send Reminder (Future)'] },
        { action: 'Support', commitments: groups['Support'] },
        { action: 'Close', commitments: groups['Close'] }
      ];
    } catch (err) {
      logger.error('CommitmentService', 'Failed to retrieve follow up queue', err);
      return [];
    }
  }

  /**
   * Build a detailed chronological timeline history of commitments for a customer
   */
  public static async getTimelineForCustomer(customerId: string): Promise<any[]> {
    try {
      const [promises, visits, payments] = await Promise.all([
        db.promise_to_pay.where('customerId').equals(customerId).toArray(),
        db.visits.where('customerId').equals(customerId).toArray(),
        db.payments.where('customerId').equals(customerId).toArray()
      ]);

      const timeline: any[] = [];

      // Add PTPs
      promises.forEach(p => {
        timeline.push({
          id: `ptp-${p.id}`,
          timestamp: p.createdAt,
          date: p.promiseDate,
          type: 'ptp',
          title: `Janji Bayar ${p.status === 'Completed' ? 'Selesai' : p.status === 'Cancelled' ? 'Dibatalkan' : p.status}`,
          subtitle: `PTP ID: ${p.id}`,
          notes: p.collectorNotes || p.notes,
          meta: {
            amount: p.promisedAmount || p.amount,
            status: p.status,
            dueDate: p.dueDate || p.promiseDate,
            riskLevel: p.riskLevel,
            paymentMethod: p.expectedPaymentMethod
          }
        });
      });

      // Add Visits
      visits.forEach(v => {
        timeline.push({
          id: `visit-${v.id}`,
          timestamp: v.createdAt,
          date: v.visitDate,
          type: 'visit',
          title: `Kunjungan Lapangan`,
          subtitle: `Visit ID: ${v.id} (${v.status})`,
          notes: v.notes,
          meta: {
            result: v.visitResult,
            duration: v.duration
          }
        });
      });

      // Add Payments
      payments.forEach(pay => {
        timeline.push({
          id: `pay-${pay.id}`,
          timestamp: pay.createdAt,
          date: pay.paymentDate,
          type: 'payment',
          title: `Pembayaran Berhasil`,
          subtitle: `Kuitansi: ${pay.receiptNumber}`,
          notes: `Pembayaran via ${pay.paymentMethod}`,
          meta: {
            amount: pay.amount,
            paymentMethod: pay.paymentMethod
          }
        });
      });

      // Sort timeline descending by timestamp
      timeline.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

      return timeline;
    } catch (err) {
      logger.error('CommitmentService', `Failed to build timeline for customer ${customerId}`, err);
      return [];
    }
  }

  /**
   * Massive mock seeding for scalability tests
   */
  public static async seedMassiveCommitments(count = 1000): Promise<number> {
    try {
      const customers = await db.customers.toArray();
      if (customers.length === 0) return 0;

      const baseFields = () => createBaseEntityFields('system');
      const mockPTPs: PromiseToPay[] = [];

      const expectedMethods: ('CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'OTHER')[] = ['CASH', 'BANK_TRANSFER', 'OTHER'];
      const statuses: ('Draft' | 'Active' | 'Due Today' | 'Overdue' | 'Completed' | 'Broken' | 'Cancelled')[] = [
        'Active', 'Completed', 'Broken', 'Overdue', 'Cancelled'
      ];
      const priorities: ('LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL')[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
      const risks: ('Low' | 'Medium' | 'High' | 'Critical')[] = ['Low', 'Medium', 'High', 'Critical'];

      logger.info('CommitmentService', `Starting seed of ${count} massive records...`);

      for (let i = 0; i < count; i++) {
        const cust = customers[i % customers.length];
        const status = statuses[i % statuses.length];
        const priority = priorities[i % priorities.length];
        const risk = risks[i % risks.length];
        const method = expectedMethods[i % expectedMethods.length];

        const id = `PTP-MASS-${100000 + i}`;
        
        // Due Date spread
        const dueDaysOffset = (i % 30) - 15; // -15 to +14 days
        const dueTime = new Date();
        dueTime.setDate(dueTime.getDate() + dueDaysOffset);
        const dueDate = dueTime.toISOString().split('T')[0];

        const promisedAmount = (Math.floor(Math.random() * 20) + 1) * 250000; // Rp 250k - 5M

        mockPTPs.push({
          id,
          ...baseFields(),
          customerId: cust.id,
          collectorId: 'COL-7729',
          amount: promisedAmount,
          promiseDate: dueDate,
          notes: `Data uji beban massal nomor #${i}.`,
          
          visitId: `VST-MASS-${100000 + i}`,
          commitmentDate: new Date().toISOString(),
          dueDate,
          promisedAmount,
          expectedPaymentMethod: method,
          status,
          priority,
          riskLevel: risk,
          reason: 'Kesulitan likuiditas jangka pendek.',
          collectorNotes: `Data uji beban massal nomor #${i}.`,
          customerNotes: 'Akan membayar tepat waktu.'
        });
      }

      await db.promise_to_pay.bulkAdd(mockPTPs);
      logger.info('CommitmentService', `Seeded ${count} commitments successfully.`);
      return count;
    } catch (err) {
      logger.error('CommitmentService', 'Failed to seed massive PTPs', err);
      throw err;
    }
  }
}
