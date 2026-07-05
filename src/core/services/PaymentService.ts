import { db, createBaseEntityFields } from '../database';
import { Payment, Customer, PromiseToPay, Attachment } from '../../types';
import { paymentRepository, customerRepository, auditLogRepository, promiseToPayRepository, attachmentRepository } from '../repositories/ConcreteRepositories';
import { logger } from '../logger';
import { SyncQueueManager } from '../repositories/SyncQueueManager';

export interface PaymentWithCustomer extends Payment {
  customerName?: string;
  customerAddress?: string;
  contractNumber?: string;
  area?: string;
  priorityLevel?: string;
  collectorName?: string;
}

export interface PortfolioSummary {
  recoveredAmount: number;
  remainingOutstanding: number;
  recoveryPercentage: number;
  paymentCount: number;
  activeCount: number;
  cancelledCount: number;
  byMethod: Record<string, number>;
  byStatus: Record<string, number>;
}

export class PaymentService {
  /**
   * Retrieves all payments with customer details, searching, filtering, and sorting.
   * Optimized for offline performance with indexing.
   */
  public static async getPaymentsWithDetails(filters: {
    query?: string;
    paymentDate?: string;
    collectorId?: string;
    status?: string;
    paymentMethod?: string;
    amountMin?: number;
    amountMax?: number;
    sortBy?: 'newest' | 'oldest' | 'largest' | 'smallest' | 'customerName';
  } = {}): Promise<PaymentWithCustomer[]> {
    try {
      const [payments, customers, users] = await Promise.all([
        db.payments.toArray(),
        db.customers.toArray(),
        db.users.toArray()
      ]);

      const customerMap = new Map<string, Customer>();
      customers.forEach(c => customerMap.set(c.id, c));

      const collectorMap = new Map<string, string>();
      users.forEach(u => collectorMap.set(u.id, u.fullName));

      let results: PaymentWithCustomer[] = payments.map(p => {
        const cust = customerMap.get(p.customerId);
        return {
          ...p,
          customerName: cust?.name || 'Debitur Tidak Dikenal',
          customerAddress: cust?.address || 'Alamat Tidak Ditemukan',
          contractNumber: cust?.contractNumber || '-',
          area: cust?.area || 'Lainnya',
          priorityLevel: cust?.priorityLevel || 'LOW',
          collectorName: collectorMap.get(p.collectorId) || p.collectorId
        };
      });

      // Filter by Search Term (Customer Name, Contract/Account Number, Receipt Number, Reference Number, Collector Name)
      if (filters.query) {
        const q = filters.query.toLowerCase();
        results = results.filter(r => 
          r.customerName?.toLowerCase().includes(q) ||
          r.contractNumber?.toLowerCase().includes(q) ||
          r.receiptNumber?.toLowerCase().includes(q) ||
          (r.referenceNumber && r.referenceNumber.toLowerCase().includes(q)) ||
          r.collectorName?.toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q)
        );
      }

      // Filter by Payment Date (YYYY-MM-DD)
      if (filters.paymentDate) {
        results = results.filter(r => r.paymentDate === filters.paymentDate);
      }

      // Filter by Collector
      if (filters.collectorId && filters.collectorId !== 'ALL') {
        results = results.filter(r => r.collectorId === filters.collectorId);
      }

      // Filter by Status
      if (filters.status && filters.status !== 'ALL') {
        results = results.filter(r => r.status === filters.status);
      }

      // Filter by Payment Method
      if (filters.paymentMethod && filters.paymentMethod !== 'ALL') {
        results = results.filter(r => r.paymentMethod === filters.paymentMethod);
      }

      // Filter by Amount Range
      if (filters.amountMin !== undefined) {
        results = results.filter(r => r.amount >= filters.amountMin!);
      }
      if (filters.amountMax !== undefined) {
        results = results.filter(r => r.amount <= filters.amountMax!);
      }

      // Sorting Engine
      const sortType = filters.sortBy || 'newest';
      results.sort((a, b) => {
        switch (sortType) {
          case 'largest':
            return b.amount - a.amount;
          case 'smallest':
            return a.amount - b.amount;
          case 'customerName':
            return (a.customerName || '').localeCompare(b.customerName || '');
          case 'oldest':
            return a.paymentDate.localeCompare(b.paymentDate) || a.createdAt.localeCompare(b.createdAt);
          case 'newest':
          default:
            return b.paymentDate.localeCompare(a.paymentDate) || b.createdAt.localeCompare(a.createdAt);
        }
      });

      return results;
    } catch (err) {
      logger.error('PaymentService', 'Failed to retrieve payment details', err);
      return [];
    }
  }

  /**
   * Records a new offline payment and automatically processes downstream recovery rules:
   * 1. Validates input bounds (no negatives, no duplicates, no overflow).
   * 2. Recalculates outstanding balance on the customer.
   * 3. Adjusts portfolio totals on the active collector.
   * 4. Updates any matching promise/commitment status.
   * 5. Appends a timeline audit log entry.
   */
  public static async recordPayment(
    customerId: string,
    collectorId: string,
    data: {
      amount: number;
      paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'TRANSFER' | 'VIRTUAL_ACCOUNT' | 'QRIS' | 'OTHER';
      visitId?: string;
      commitmentId?: string;
      collectorNotes?: string;
      customerNotes?: string;
      signatureBase64?: string;
      photoUrl?: string;
      evidenceCount?: number;
      referenceNumber?: string;
      receiptNumber?: string;
      paymentDate?: string;
      paymentTime?: string;
    }
  ): Promise<Payment> {
    const todayStr = new Date().toISOString().split('T')[0];
    const timeStr = new Date().toTimeString().split(' ')[0].substring(0, 5);

    // 1. Business Validation: Negative or zero amounts
    if (data.amount <= 0) {
      throw new Error('NOMINAL_NEGATIF: Nominal pembayaran harus lebih besar dari Rp 0.');
    }

    // 2. Fetch Customer
    const customer = await db.customers.get(customerId);
    if (!customer) {
      throw new Error('DEBITUR_TIDAK_DITEMUKAN: Debitur yang dipilih tidak ditemukan di basis data lokal.');
    }

    // 3. Business Validation: Outstanding overflow (payment exceeds current outstanding)
    if (data.amount > customer.outstandingBalance) {
      throw new Error(`OVERFLOW_SALDO: Nominal pembayaran (Rp ${data.amount.toLocaleString()}) melebihi total tunggakan debitur (Rp ${customer.outstandingBalance.toLocaleString()}).`);
    }

    // 4. Duplicate Check: Prevent duplicate payment records within short timeframe
    const recentPayments = await db.payments
      .where('customerId')
      .equals(customerId)
      .and(p => p.amount === data.amount && p.paymentDate === (data.paymentDate || todayStr) && p.isDeleted === false)
      .toArray();

    if (recentPayments.length > 0) {
      // Throw duplicate payment error
      throw new Error('DUPLIKASI_TRANSAKSI: Transaksi dengan nominal dan tanggal yang sama sudah tercatat untuk debitur ini.');
    }

    // 5. Generate operational receipts and reference numbers
    const finalReceipt = data.receiptNumber || `REC-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const finalReference = data.referenceNumber || `REF-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

    // 6. Calculate Remaining Outstanding
    const remainingOutstanding = customer.outstandingBalance - data.amount;

    // 7. Initialize standard Entity fields
    const baseFields = createBaseEntityFields(collectorId);
    const paymentId = `PAY-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const newPayment: Payment = {
      id: paymentId,
      ...baseFields,
      customerId,
      collectorId,
      amount: data.amount,
      paymentMethod: data.paymentMethod,
      receiptNumber: finalReceipt,
      signatureBase64: data.signatureBase64 || '',
      photoUrl: data.photoUrl || '',
      paymentDate: data.paymentDate || todayStr,
      paymentTime: data.paymentTime || timeStr,
      visitId: data.visitId || '',
      commitmentId: data.commitmentId || '',
      remainingOutstanding,
      installmentNumber: customer.daysOverdue > 0 ? Math.ceil(customer.daysOverdue / 30) : 1,
      referenceNumber: finalReference,
      evidenceCount: data.evidenceCount || (data.photoUrl || data.signatureBase64 ? 1 : 0),
      collectorNotes: data.collectorNotes || '',
      customerNotes: data.customerNotes || '',
      status: 'Recorded', // Default status upon offline recording
    };

    // 8. Execute Atomically in Transaction
    await db.transaction('rw', [db.payments, db.customers, db.promise_to_pay, db.collectors, db.audit_logs], async () => {
      // Insert Payment
      await db.payments.add(newPayment);

      // Update Customer Status & Portfolio metrics
      const previousOutstanding = customer.outstandingBalance;
      const newStatus = remainingOutstanding === 0 ? 'PAID' : 'VISITED';
      
      await db.customers.update(customerId, {
        outstandingBalance: remainingOutstanding,
        status: newStatus,
        lastPaymentDate: newPayment.paymentDate,
        lastContactDate: newPayment.paymentDate,
        updatedAt: new Date().toISOString()
      });

      // Update Collector Portfolio Target
      const activeCollector = await db.collectors.get(collectorId);
      if (activeCollector) {
        await db.collectors.update(collectorId, {
          collectedAmount: (activeCollector.collectedAmount || 0) + data.amount
        });
      }

      // If Commitment is connected, mark as completed
      if (data.commitmentId) {
        const ptp = await db.promise_to_pay.get(data.commitmentId);
        if (ptp) {
          await db.promise_to_pay.update(data.commitmentId, {
            status: 'Completed',
            updatedAt: new Date().toISOString()
          });

          // Audit Log for commitment fulfillment
          await db.audit_logs.add({
            ...createBaseEntityFields(collectorId),
            id: `AUDIT-PTP-${Date.now()}`,
            level: 'INFO',
            tag: 'PaymentService',
            timestamp: new Date().toISOString(),
            message: `Janji Bayar ${data.commitmentId} untuk debitur ${customer.name} berhasil dipenuhi melalui pembayaran ${paymentId}.`,
            details: JSON.stringify({ commitmentId: data.commitmentId, paymentId, amount: data.amount })
          });
        }
      }

      // Append Customer History & Central System Timeline
      await db.audit_logs.add({
        ...createBaseEntityFields(collectorId),
        id: `AUDIT-PAY-${Date.now()}`,
        level: 'INFO',
        tag: 'PaymentService',
        timestamp: new Date().toISOString(),
        message: `Pembayaran tunai/non-tunai Rp ${data.amount.toLocaleString()} berhasil dicatat untuk debitur ${customer.name}. Sisa outstanding: Rp ${remainingOutstanding.toLocaleString()}.`,
        details: JSON.stringify({
          paymentId,
          customerId,
          collectorId,
          amount: data.amount,
          previousOutstanding,
          remainingOutstanding,
          receiptNumber: finalReceipt
        })
      });
    });

    // Enqueue payment creation for cloud sync
    try {
      await SyncQueueManager.enqueue(
        'payment',
        paymentId,
        'CREATE',
        newPayment,
        collectorId
      );
    } catch (syncErr) {
      logger.error('PaymentService', `Failed to enqueue payment creation for sync: ${paymentId}`, syncErr);
    }

    return newPayment;
  }

  /**
   * Modifies an existing payment record and automatically recalibrates:
   * 1. Customer outstanding balance (correctly reversing the old amount and applying the new one).
   * 2. Collector portfolio collection volume.
   * 3. Downstream timeline logging.
   */
  public static async editPayment(
    paymentId: string,
    updatedData: {
      amount: number;
      paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'TRANSFER' | 'VIRTUAL_ACCOUNT' | 'QRIS' | 'OTHER';
      collectorNotes?: string;
      customerNotes?: string;
      referenceNumber?: string;
      receiptNumber?: string;
      paymentDate?: string;
      paymentTime?: string;
    },
    collectorId: string
  ): Promise<Payment> {
    const originalPayment = await db.payments.get(paymentId);
    if (!originalPayment) {
      throw new Error('TRANSAKSI_TIDAK_DITEMUKAN: Bukti pembayaran tidak ditemukan.');
    }

    if (originalPayment.status === 'Cancelled') {
      throw new Error('TRANSAKSI_BATAL: Transaksi yang sudah dibatalkan tidak dapat diubah kembali.');
    }

    if (updatedData.amount <= 0) {
      throw new Error('NOMINAL_NEGATIF: Nominal pembayaran harus lebih besar dari Rp 0.');
    }

    const customer = await db.customers.get(originalPayment.customerId);
    if (!customer) {
      throw new Error('DEBITUR_TIDAK_DITEMUKAN: Debitur untuk pembayaran ini tidak ditemukan.');
    }

    // Recalculate hypothetical outstanding if we reverse the original payment
    const baseOutstanding = customer.outstandingBalance + originalPayment.amount;

    if (updatedData.amount > baseOutstanding) {
      throw new Error(`OVERFLOW_SALDO: Nominal pembayaran baru (Rp ${updatedData.amount.toLocaleString()}) melebihi batas sisa tunggakan debitur (Rp ${baseOutstanding.toLocaleString()}).`);
    }

    const newRemaining = baseOutstanding - updatedData.amount;

    await db.transaction('rw', [db.payments, db.customers, db.collectors, db.audit_logs], async () => {
      // 1. Update Payment Record
      await db.payments.update(paymentId, {
        amount: updatedData.amount,
        paymentMethod: updatedData.paymentMethod,
        receiptNumber: updatedData.receiptNumber || originalPayment.receiptNumber,
        referenceNumber: updatedData.referenceNumber || originalPayment.referenceNumber,
        paymentDate: updatedData.paymentDate || originalPayment.paymentDate,
        paymentTime: updatedData.paymentTime || originalPayment.paymentTime,
        collectorNotes: updatedData.collectorNotes || originalPayment.collectorNotes,
        customerNotes: updatedData.customerNotes || originalPayment.customerNotes,
        remainingOutstanding: newRemaining,
        updatedAt: new Date().toISOString()
      });

      // 2. Adjust Customer Outstanding
      const newStatus = newRemaining === 0 ? 'PAID' : 'VISITED';
      await db.customers.update(originalPayment.customerId, {
        outstandingBalance: newRemaining,
        status: newStatus,
        updatedAt: new Date().toISOString()
      });

      // 3. Adjust Collector Metrics
      const activeCollector = await db.collectors.get(originalPayment.collectorId);
      if (activeCollector) {
        const adjustment = updatedData.amount - originalPayment.amount;
        await db.collectors.update(originalPayment.collectorId, {
          collectedAmount: (activeCollector.collectedAmount || 0) + adjustment
        });
      }

      // 4. Record Audit
      await db.audit_logs.add({
        ...createBaseEntityFields(collectorId),
        id: `AUDIT-EDIT-${Date.now()}`,
        level: 'INFO',
        tag: 'PaymentService',
        timestamp: new Date().toISOString(),
        message: `Kolektor mengubah rincian pembayaran ${paymentId} (Dari Rp ${originalPayment.amount.toLocaleString()} menjadi Rp ${updatedData.amount.toLocaleString()}).`,
        details: JSON.stringify({
          paymentId,
          customerId: originalPayment.customerId,
          oldAmount: originalPayment.amount,
          newAmount: updatedData.amount,
          previousOutstanding: customer.outstandingBalance,
          newOutstanding: newRemaining
        })
      });
    });

    const updatedPayment = (await db.payments.get(paymentId))!;

    // Enqueue payment update for cloud sync
    try {
      await SyncQueueManager.enqueue(
        'payment',
        paymentId,
        'UPDATE',
        updatedPayment,
        collectorId
      );
    } catch (syncErr) {
      logger.error('PaymentService', `Failed to enqueue payment update for sync: ${paymentId}`, syncErr);
    }

    return updatedPayment;
  }

  /**
   * Cancels a payment, safely restoring the customer outstanding and adjusting collector metrics.
   */
  public static async cancelPayment(
    paymentId: string,
    notes: string,
    collectorId: string
  ): Promise<void> {
    const payment = await db.payments.get(paymentId);
    if (!payment) {
      throw new Error('TRANSAKSI_TIDAK_DITEMUKAN: Bukti pembayaran tidak ditemukan.');
    }

    if (payment.status === 'Cancelled') {
      throw new Error('TRANSAKSI_SUDAH_BATAL: Transaksi ini sudah berstatus batal.');
    }

    const customer = await db.customers.get(payment.customerId);
    if (!customer) {
      throw new Error('DEBITUR_TIDAK_DITEMUKAN: Debitur untuk pembayaran ini tidak ditemukan.');
    }

    await db.transaction('rw', [db.payments, db.customers, db.promise_to_pay, db.collectors, db.audit_logs], async () => {
      // 1. Update status to Cancelled
      await db.payments.update(paymentId, {
        status: 'Cancelled',
        collectorNotes: payment.collectorNotes ? `${payment.collectorNotes}\n[BATAL: ${notes}]` : `[BATAL: ${notes}]`,
        updatedAt: new Date().toISOString()
      });

      // 2. Restore customer outstanding balance
      const restoredOutstanding = customer.outstandingBalance + payment.amount;
      const restoredStatus = restoredOutstanding > 0 ? 'VISITED' : 'PAID';
      
      await db.customers.update(payment.customerId, {
        outstandingBalance: restoredOutstanding,
        status: restoredStatus,
        updatedAt: new Date().toISOString()
      });

      // 3. Deduct Collector collected amount
      const collector = await db.collectors.get(payment.collectorId);
      if (collector) {
        await db.collectors.update(payment.collectorId, {
          collectedAmount: Math.max(0, (collector.collectedAmount || 0) - payment.amount)
        });
      }

      // 4. If commitment was completed, revert it
      if (payment.commitmentId) {
        await db.promise_to_pay.update(payment.commitmentId, {
          status: 'Active',
          updatedAt: new Date().toISOString()
        });
      }

      // 5. Append Timeline
      await db.audit_logs.add({
        ...createBaseEntityFields(collectorId),
        id: `AUDIT-CANCEL-${Date.now()}`,
        level: 'WARN',
        tag: 'PaymentService',
        timestamp: new Date().toISOString(),
        message: `Pembayaran ${paymentId} senilai Rp ${payment.amount.toLocaleString()} dibatalkan oleh kolektor. Saldo tunggakan debitur ${customer.name} dipulihkan.`,
        details: JSON.stringify({ paymentId, customerId: payment.customerId, restoredAmount: payment.amount, reason: notes })
      });
    });

    // Enqueue payment update (cancellation status) for cloud sync
    const cancelledPayment = await db.payments.get(paymentId);
    if (cancelledPayment) {
      try {
        await SyncQueueManager.enqueue(
          'payment',
          paymentId,
          'UPDATE',
          cancelledPayment,
          collectorId
        );
      } catch (syncErr) {
        logger.error('PaymentService', `Failed to enqueue payment cancellation for sync: ${paymentId}`, syncErr);
      }
    }
  }

  /**
   * Retrieves summary performance metrics for recovery of a collector.
   */
  public static async getPortfolioSummary(collectorId: string): Promise<PortfolioSummary> {
    try {
      const [payments, customers, collector] = await Promise.all([
        db.payments.where('collectorId').equals(collectorId).toArray(),
        db.customers.toArray(), // Portfolio size
        db.collectors.get(collectorId)
      ]);

      const activePayments = payments.filter(p => p.status !== 'Cancelled');
      const recoveredAmount = activePayments.reduce((sum, p) => sum + p.amount, 0);
      const remainingOutstanding = customers.reduce((sum, c) => sum + c.outstandingBalance, 0);

      // Grouping by Payment Method
      const byMethod: Record<string, number> = {};
      activePayments.forEach(p => {
        byMethod[p.paymentMethod] = (byMethod[p.paymentMethod] || 0) + p.amount;
      });

      // Grouping by Status
      const byStatus: Record<string, number> = {};
      payments.forEach(p => {
        byStatus[p.status || 'Recorded'] = (byStatus[p.status || 'Recorded'] || 0) + 1;
      });

      const totalTarget = collector?.targetAmount || 50000000;
      const recoveryPercentage = totalTarget > 0 ? (recoveredAmount / totalTarget) * 100 : 0;

      return {
        recoveredAmount,
        remainingOutstanding,
        recoveryPercentage,
        paymentCount: payments.length,
        activeCount: activePayments.length,
        cancelledCount: payments.filter(p => p.status === 'Cancelled').length,
        byMethod,
        byStatus
      };
    } catch (err) {
      logger.error('PaymentService', 'Failed to generate portfolio summary', err);
      return {
        recoveredAmount: 0,
        remainingOutstanding: 0,
        recoveryPercentage: 0,
        paymentCount: 0,
        activeCount: 0,
        cancelledCount: 0,
        byMethod: {},
        byStatus: {}
      };
    }
  }

  /**
   * Massive Database Seeding of up to 50,000+ payments.
   * Utilizes high-speed transactional batch insertions via Dexie bulkAdd.
   */
  public static async seedMassivePayments(count: number): Promise<number> {
    try {
      const customers = await db.customers.toArray();
      if (customers.length === 0) {
        throw new Error('SEED_ERROR: Silakan buat minimal satu debitur terlebih dahulu.');
      }

      const firstCollector = await db.collectors.toCollection().first(); const collectorId = firstCollector?.id || '';
      const methods: ('CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'TRANSFER' | 'VIRTUAL_ACCOUNT' | 'QRIS' | 'OTHER')[] = 
        ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'TRANSFER', 'VIRTUAL_ACCOUNT', 'QRIS', 'OTHER'];
      const statuses: ('Draft' | 'Recorded' | 'Verified' | 'Cancelled' | 'Pending Sync')[] = 
        ['Recorded', 'Verified', 'Draft', 'Pending Sync'];

      const batchSize = 5000;
      let generated = 0;
      const now = new Date();

      logger.info('PaymentService', `Starting massive seeding of ${count} payments...`);

      for (let i = 0; i < count; i += batchSize) {
        const currentBatchLimit = Math.min(batchSize, count - i);
        const paymentsBatch: Payment[] = [];

        for (let j = 0; j < currentBatchLimit; j++) {
          const index = i + j;
          const customer = customers[index % customers.length];
          const method = methods[index % methods.length];
          const status = statuses[index % statuses.length];
          
          const amount = Math.floor(100000 + Math.random() * 500000);
          
          const seedDate = new Date(now.getTime() - (index % 30) * 24 * 60 * 60 * 1000);
          const dateStr = seedDate.toISOString().split('T')[0];
          const timeStr = seedDate.toTimeString().split(' ')[0].substring(0, 5);

          const payId = `PAY-SEED-${index}-${Date.now()}`;
          const baseFields = createBaseEntityFields(collectorId);

          paymentsBatch.push({
            id: payId,
            ...baseFields,
            customerId: customer.id,
            collectorId,
            amount,
            paymentMethod: method,
            receiptNumber: `REC-SEED-${1000000 + index}`,
            referenceNumber: `REF-SEED-${1000000 + index}`,
            paymentDate: dateStr,
            paymentTime: timeStr,
            signatureBase64: 'SEED_DATA_MOCK_SIGNATURE',
            photoUrl: '',
            remainingOutstanding: Math.max(0, customer.outstandingBalance - amount),
            installmentNumber: 1,
            evidenceCount: 1,
            collectorNotes: `Pembayaran simulasi beban uji nomor #${index}`,
            customerNotes: 'Simulasi pelunasan.',
            status: status
          });
        }

        await db.payments.bulkAdd(paymentsBatch);
        generated += paymentsBatch.length;
        logger.info('PaymentService', `Batch seeded: ${generated}/${count}`);
      }

      // Recalculate collector summary in setting / logs
      const activeSum = await db.payments
        .where('collectorId')
        .equals(collectorId)
        .and(p => p.status !== 'Cancelled')
        .toArray();
      const totalCollected = activeSum.reduce((sum, p) => sum + p.amount, 0);

      await db.collectors.update(collectorId, {
        collectedAmount: totalCollected
      });

      await db.audit_logs.add({
        ...createBaseEntityFields(collectorId),
        id: `AUDIT-SEED-${Date.now()}`,
        level: 'INFO',
        tag: 'PaymentService',
        timestamp: new Date().toISOString(),
        message: `Sistem berhasil mensimulasikan ${count} data pelunasan pembayaran dalam basis data lokal.`,
        details: JSON.stringify({ count, totalCollected })
      });

      return generated;
    } catch (err) {
      logger.error('PaymentService', 'Massive seeding failed', err);
      throw err;
    }
  }

  /**
   * Saves local evidence/attachment metadata linked to a payment.
   */
  public static async attachEvidence(
    paymentId: string,
    fileName: string,
    fileType: string,
    fileSize: number,
    base64Payload: string,
    collectorId: string
  ): Promise<Attachment> {
    const payment = await db.payments.get(paymentId);
    if (!payment) {
      throw new Error('PAYMENT_NOT_FOUND: Pembayaran tidak ditemukan untuk melampirkan berkas.');
    }

    const baseFields = createBaseEntityFields(collectorId);
    const attachmentId = `ATT-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const newAttachment: Attachment = {
      id: attachmentId,
      ...baseFields,
      entityType: 'payment',
      entityId: paymentId,
      fileName,
      fileType,
      fileSize,
      fileUrlOrBase64: base64Payload
    };

    await db.transaction('rw', [db.attachments, db.payments], async () => {
      await db.attachments.add(newAttachment);
      
      const currentCount = payment.evidenceCount || 0;
      await db.payments.update(paymentId, {
        evidenceCount: currentCount + 1,
        updatedAt: new Date().toISOString()
      });
    });

    return newAttachment;
  }
}
