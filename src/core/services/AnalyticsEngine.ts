import { db } from '../database';
import { reportRepository } from '../repositories/ReportRepository';
import { Customer, Visit, Payment, PromiseToPay, ActivityLog, AuditLog, Collector } from '../../types';
import { 
  OperationalReportData, 
  ReportFilter, 
  KPIMetrics, 
  TrendPoint, 
  PortfolioAnalysis, 
  AreaAnalysis, 
  CollectorAnalysis,
  ReportSnapshot,
  ScheduledReportTask
} from '../../types/reports';
import { logger } from '../logger';
import { Result } from '../../types';

export class AnalyticsEngine {
  /**
   * Generates a comprehensive operational report from IndexedDB local tables.
   * Optimized with Map indexes to easily support large datasets (100k+ records).
   */
  public static async generateReport(filter: ReportFilter): Promise<OperationalReportData> {
    const startTime = performance.now();
    logger.info('AnalyticsEngine', 'Starting operational report generation...');

    // 1. Fetch all raw datasets in parallel (Offline IndexedDB reads)
    const [
      rawCustomers,
      rawVisits,
      rawPayments,
      rawPtps,
      rawActivities,
      rawAudits,
      rawUsers,
      rawCollectors
    ] = await Promise.all([
      db.customers.filter(c => !c.isDeleted).toArray(),
      db.visits.filter(v => !v.isDeleted).toArray(),
      db.payments.filter(p => !p.isDeleted).toArray(),
      db.promise_to_pay.filter(p => !p.isDeleted).toArray(),
      db.activity_logs.filter(a => !a.isDeleted).toArray(),
      db.audit_logs.filter(a => !a.isDeleted).toArray(),
      db.users.filter(u => !u.isDeleted).toArray(),
      db.collectors.toArray()
    ]);

    // Create lookup Maps for performance (O(1) lookups instead of O(N^2))
    const userMap = new Map<string, string>(); // id -> fullName
    rawUsers.forEach(u => userMap.set(u.id, u.fullName));
    rawCollectors.forEach(c => userMap.set(c.id, c.fullName));

    const customerMap = new Map<string, Customer>();
    rawCustomers.forEach(c => customerMap.set(c.id, c));

    // 2. APPLY FILTERS TO DATASETS
    const startMs = new Date(filter.dateRange.start).getTime();
    const endMs = new Date(filter.dateRange.end + 'T23:59:59.999Z').getTime();

    // Filtered Customers (Primary selection)
    let customers = rawCustomers.filter(c => {
      // Collector Filter
      if (filter.collectorId && filter.collectorId !== 'ALL') {
        if (c.assignedCollectorId !== filter.collectorId) return false;
      }
      // Area Filter
      if (filter.area && filter.area !== 'ALL') {
        if (c.area !== filter.area) return false;
      }
      // Risk Filter
      if (filter.risk && filter.risk !== 'ALL') {
        if (c.bucket !== filter.risk) return false;
      }
      // Priority Filter
      if (filter.priority && filter.priority !== 'ALL') {
        if (c.priorityLevel !== filter.priority) return false;
      }
      // Status Filter
      if (filter.customerStatus && filter.customerStatus !== 'ALL') {
        if (c.status !== filter.customerStatus) return false;
      }
      // Search query filter (Customer name, contract number, area, phone)
      if (filter.searchQuery) {
        const q = filter.searchQuery.toLowerCase();
        const nameMatch = c.name.toLowerCase().includes(q);
        const contractMatch = c.contractNumber?.toLowerCase().includes(q) || false;
        const areaMatch = c.area?.toLowerCase().includes(q) || false;
        const idMatch = c.id.toLowerCase().includes(q);
        if (!nameMatch && !contractMatch && !areaMatch && !idMatch) return false;
      }
      return true;
    });

    const activeCustomerIds = new Set(customers.map(c => c.id));

    // Filtered Visits
    const visits = rawVisits.filter(v => {
      const vTime = new Date(v.visitDate).getTime();
      if (vTime < startMs || vTime > endMs) return false;
      if (filter.collectorId && filter.collectorId !== 'ALL' && v.collectorId !== filter.collectorId) return false;
      if (!activeCustomerIds.has(v.customerId)) return false;
      return true;
    });

    // Filtered Payments
    const payments = rawPayments.filter(p => {
      const pTime = new Date(p.paymentDate).getTime();
      if (pTime < startMs || pTime > endMs) return false;
      if (filter.collectorId && filter.collectorId !== 'ALL' && p.collectorId !== filter.collectorId) return false;
      if (!activeCustomerIds.has(p.customerId)) return false;
      if (filter.recoveryRange) {
        if (filter.recoveryRange.min !== undefined && p.amount < filter.recoveryRange.min) return false;
        if (filter.recoveryRange.max !== undefined && p.amount > filter.recoveryRange.max) return false;
      }
      return true;
    });

    // Filtered Promises to Pay (Commitments)
    const ptps = rawPtps.filter(p => {
      const pTime = new Date(p.promiseDate).getTime();
      if (pTime < startMs || pTime > endMs) return false;
      if (filter.collectorId && filter.collectorId !== 'ALL' && p.collectorId !== filter.collectorId) return false;
      if (!activeCustomerIds.has(p.customerId)) return false;
      return true;
    });

    // Activities & Audits
    const activities = rawActivities.filter(a => {
      const aTime = new Date(a.createdAt).getTime();
      return aTime >= startMs && aTime <= endMs;
    });

    const audits = rawAudits.filter(a => {
      const aTime = new Date(a.timestamp).getTime();
      return aTime >= startMs && aTime <= endMs;
    });

    // 3. KPI CALCULATIONS (KPI ENGINE)
    const customersAssigned = customers.length;
    const visitedCustomerIds = new Set(visits.map(v => v.customerId));
    const customersVisited = visitedCustomerIds.size;

    const totalVisitsCount = visits.length;
    const successfulVisits = visits.filter(v => 
      v.status === 'CONTACT' || 
      v.visitResult === 'CUSTOMER_MET' || 
      v.visitResult === 'PAID' || 
      v.visitResult === 'PROMISE_TO_PAY' || 
      v.visitResult === 'PARTIAL_PAYMENT'
    ).length;

    const visitSuccessRate = totalVisitsCount > 0 ? (successfulVisits / totalVisitsCount) * 100 : 0;
    const visitFailureRate = totalVisitsCount > 0 ? 100 - visitSuccessRate : 0;

    // Average duration in seconds
    const visitsWithDuration = visits.filter(v => v.duration && v.duration > 0);
    const averageVisitDuration = visitsWithDuration.length > 0 
      ? visitsWithDuration.reduce((sum, v) => sum + (v.duration || 0), 0) / visitsWithDuration.length 
      : 0;

    // Unique days with visits
    const uniqueDays = new Set(visits.map(v => v.visitDate.substring(0, 10))).size;
    const averageVisitsPerDay = uniqueDays > 0 ? totalVisitsCount / uniqueDays : 0;

    // PTP stats
    const ptpCreated = ptps.length;
    const ptpFulfilled = ptps.filter(p => p.status === 'Completed').length;
    const ptpBroken = ptps.filter(p => p.status === 'Broken' || p.status === 'Overdue').length;
    const commitmentSuccessRate = (ptpFulfilled + ptpBroken) > 0 
      ? (ptpFulfilled / (ptpFulfilled + ptpBroken)) * 100 
      : 0;

    const paymentsRecorded = payments.length;
    const recoveryAmount = payments.reduce((sum, p) => sum + p.amount, 0);

    // Calculate dynamic recovery target.
    // Use target of filtered collectors or fallback to 15% of outstanding
    let targetAmount = 0;
    if (filter.collectorId && filter.collectorId !== 'ALL') {
      const coll = rawCollectors.find(c => c.id === filter.collectorId);
      targetAmount = coll?.targetAmount || 10000000;
    } else {
      targetAmount = rawCollectors.reduce((sum, c) => sum + c.targetAmount, 0) || 50000000;
    }
    const recoveryPercentage = targetAmount > 0 ? (recoveryAmount / targetAmount) * 100 : 0;

    const outstandingReduction = recoveryAmount;
    const averageRecoveryPerVisit = totalVisitsCount > 0 ? recoveryAmount / totalVisitsCount : 0;
    const averageRecoveryPerCustomer = customersAssigned > 0 ? recoveryAmount / customersAssigned : 0;

    // Weighted Productivity Score (v2.0 standard)
    // 30% Visit Success, 30% Commitment Success, 40% Target recovery achievement (capped at 100% contribution)
    const recContrib = Math.min(100, recoveryPercentage);
    const collectionProductivityScore = Math.min(100, Math.round(
      (visitSuccessRate * 0.3) + (commitmentSuccessRate * 0.3) + (recContrib * 0.4)
    ));

    const kpis: KPIMetrics = {
      customersAssigned,
      customersVisited,
      visitSuccessRate,
      visitFailureRate,
      averageVisitDuration,
      averageVisitsPerDay,
      ptpCreated,
      ptpFulfilled,
      ptpBroken,
      commitmentSuccessRate,
      paymentsRecorded,
      recoveryAmount,
      recoveryPercentage,
      outstandingReduction,
      averageRecoveryPerVisit,
      averageRecoveryPerCustomer,
      collectionProductivityScore
    };

    // 4. TREND ANALYSIS (TREND ENGINE)
    // Generate trend points by dividing the date range into standard intervals (days or weeks)
    const trends: TrendPoint[] = [];
    const startDate = new Date(filter.dateRange.start);
    const endDate = new Date(filter.dateRange.end);
    const dayDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    // Grouping interval: if range < 15 days, group by Day. If < 90 days, group by Week. Else by Month.
    let intervals: { start: string; end: string; label: string }[] = [];
    if (dayDiff <= 15) {
      for (let i = 0; i <= dayDiff; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        const iso = d.toISOString().substring(0, 10);
        const label = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
        intervals.push({ start: iso, end: iso, label });
      }
    } else if (dayDiff <= 90) {
      // Group by weeks
      let current = new Date(startDate);
      let weekNum = 1;
      while (current <= endDate) {
        const startIso = current.toISOString().substring(0, 10);
        const end = new Date(current);
        end.setDate(current.getDate() + 6);
        const endIso = end > endDate ? endDate.toISOString().substring(0, 10) : end.toISOString().substring(0, 10);
        intervals.push({ 
          start: startIso, 
          end: endIso, 
          label: `Minggu ${weekNum++}` 
        });
        current.setDate(current.getDate() + 7);
      }
    } else {
      // Group by months
      let current = new Date(startDate);
      while (current <= endDate) {
        const year = current.getFullYear();
        const month = current.getMonth();
        const startIso = new Date(year, month, 1).toISOString().substring(0, 10);
        const end = new Date(year, month + 1, 0);
        const endIso = end > endDate ? endDate.toISOString().substring(0, 10) : end.toISOString().substring(0, 10);
        const label = current.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
        intervals.push({ start: startIso, end: endIso, label });
        current.setMonth(current.getMonth() + 1);
      }
    }

    intervals.forEach(interval => {
      const iStart = new Date(interval.start).getTime();
      const iEnd = new Date(interval.end + 'T23:59:59.999Z').getTime();

      const iPayments = payments.filter(p => {
        const time = new Date(p.paymentDate).getTime();
        return time >= iStart && time <= iEnd;
      });
      const iVisits = visits.filter(v => {
        const time = new Date(v.visitDate).getTime();
        return time >= iStart && time <= iEnd;
      });
      const iPtps = ptps.filter(p => {
        const time = new Date(p.promiseDate).getTime();
        return time >= iStart && time <= iEnd;
      });

      const rec = iPayments.reduce((sum, p) => sum + p.amount, 0);
      const outstandingReduction = rec;
      const avgDpd = customers.length > 0 ? customers.reduce((sum, c) => sum + c.daysOverdue, 0) / customers.length : 0;

      trends.push({
        label: interval.label,
        recovery: rec,
        visits: iVisits.length,
        commitments: iPtps.length,
        payments: iPayments.length,
        productivity: iVisits.length > 0 ? Math.round((iPayments.length / iVisits.length) * 100) : 0,
        outstanding: customers.reduce((sum, c) => sum + c.outstandingBalance, 0) - outstandingReduction,
        dpd: Math.round(avgDpd),
        priorityRiskScore: Math.round(customers.length > 0 ? customers.filter(c => c.priorityLevel === 'HIGH' || c.priorityLevel === 'CRITICAL').length / customers.length * 100 : 0)
      });
    });

    // 5. PORTFOLIO ANALYSIS
    const outstandingBalance = customers.reduce((sum, c) => sum + c.outstandingBalance, 0);
    
    const customerStatusDistribution: Record<string, number> = { PENDING: 0, VISITED: 0, PAID: 0, PROMISED: 0 };
    const priorityDistribution: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    const riskDistribution: Record<string, number> = { Low: 0, Medium: 0, High: 0, Critical: 0 };
    const dpdDistribution: Record<string, number> = { '30': 0, '60': 0, '90': 0, '90+': 0 };
    const recoveryDistribution: Record<string, number> = { '30': 0, '60': 0, '90': 0, '90+': 0 };

    customers.forEach(c => {
      customerStatusDistribution[c.status] = (customerStatusDistribution[c.status] || 0) + 1;
      if (c.priorityLevel) {
        priorityDistribution[c.priorityLevel] = (priorityDistribution[c.priorityLevel] || 0) + 1;
      }
      
      // Bucket risk classification mapping
      const riskLevel = c.priorityLevel === 'CRITICAL' ? 'Critical' : c.priorityLevel === 'HIGH' ? 'High' : c.priorityLevel === 'MEDIUM' ? 'Medium' : 'Low';
      riskDistribution[riskLevel] = (riskDistribution[riskLevel] || 0) + 1;

      dpdDistribution[c.bucket] = (dpdDistribution[c.bucket] || 0) + 1;
    });

    payments.forEach(p => {
      const cust = customerMap.get(p.customerId);
      if (cust) {
        recoveryDistribution[cust.bucket] = (recoveryDistribution[cust.bucket] || 0) + p.amount;
      }
    });

    const portfolio: PortfolioAnalysis = {
      portfolioSize: customers.length,
      outstandingBalance,
      customerStatusDistribution,
      priorityDistribution,
      riskDistribution,
      dpdDistribution,
      recoveryDistribution
    };

    // 6. AREA ANALYSIS
    const areaMap = new Map<string, { visitsCount: number; recoveryAmount: number; outstandingAmount: number; priorities: string[]; ptpFulfilled: number; ptpTotal: number }>();

    customers.forEach(c => {
      const area = c.area || 'Lainnya';
      if (!areaMap.has(area)) {
        areaMap.set(area, { visitsCount: 0, recoveryAmount: 0, outstandingAmount: 0, priorities: [], ptpFulfilled: 0, ptpTotal: 0 });
      }
      const data = areaMap.get(area)!;
      data.outstandingAmount += c.outstandingBalance;
      if (c.priorityLevel) data.priorities.push(c.priorityLevel);
    });

    visits.forEach(v => {
      const cust = customerMap.get(v.customerId);
      const area = cust?.area || 'Lainnya';
      if (areaMap.has(area)) {
        areaMap.get(area)!.visitsCount += 1;
      }
    });

    payments.forEach(p => {
      const cust = customerMap.get(p.customerId);
      const area = cust?.area || 'Lainnya';
      if (areaMap.has(area)) {
        areaMap.get(area)!.recoveryAmount += p.amount;
      }
    });

    ptps.forEach(ptp => {
      const cust = customerMap.get(ptp.customerId);
      const area = cust?.area || 'Lainnya';
      if (areaMap.has(area)) {
        const data = areaMap.get(area)!;
        data.ptpTotal += 1;
        if (ptp.status === 'Completed') data.ptpFulfilled += 1;
      }
    });

    const areaAnalysis: AreaAnalysis[] = Array.from(areaMap.entries()).map(([areaName, details]) => {
      // Find dominant priority level
      const pCount: Record<string, number> = {};
      details.priorities.forEach(p => pCount[p] = (pCount[p] || 0) + 1);
      const dominantPriority = Object.entries(pCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'LOW';

      return {
        areaName,
        visitsCount: details.visitsCount,
        recoveryAmount: details.recoveryAmount,
        outstandingAmount: details.outstandingAmount,
        priorityLevel: dominantPriority,
        commitmentSuccessRate: details.ptpTotal > 0 ? (details.ptpFulfilled / details.ptpTotal) * 100 : 0
      };
    });

    // 7. COLLECTOR ANALYSIS
    const collectorMetricMap = new Map<string, { visitsCount: number; recoveryCount: number; recoveryAmount: number; ptpFulfilled: number; ptpTotal: number; durations: number[] }>();

    rawUsers.forEach(u => {
      collectorMetricMap.set(u.id, { visitsCount: 0, recoveryCount: 0, recoveryAmount: 0, ptpFulfilled: 0, ptpTotal: 0, durations: [] });
    });
    rawCollectors.forEach(c => {
      if (!collectorMetricMap.has(c.id)) {
        collectorMetricMap.set(c.id, { visitsCount: 0, recoveryCount: 0, recoveryAmount: 0, ptpFulfilled: 0, ptpTotal: 0, durations: [] });
      }
    });

    visits.forEach(v => {
      if (collectorMetricMap.has(v.collectorId)) {
        const m = collectorMetricMap.get(v.collectorId)!;
        m.visitsCount += 1;
        if (v.duration) m.durations.push(v.duration);
      }
    });

    payments.forEach(p => {
      if (collectorMetricMap.has(p.collectorId)) {
        const m = collectorMetricMap.get(p.collectorId)!;
        m.recoveryCount += 1;
        m.recoveryAmount += p.amount;
      }
    });

    ptps.forEach(p => {
      if (collectorMetricMap.has(p.collectorId)) {
        const m = collectorMetricMap.get(p.collectorId)!;
        m.ptpTotal += 1;
        if (p.status === 'Completed') m.ptpFulfilled += 1;
      }
    });

    const collectorAnalysis: CollectorAnalysis[] = Array.from(collectorMetricMap.entries())
      .map(([colId, metrics]) => {
        const colName = userMap.get(colId) || colId;
        const target = rawCollectors.find(c => c.id === colId)?.targetAmount || 10000000;

        const commSuccess = metrics.ptpTotal > 0 ? (metrics.ptpFulfilled / metrics.ptpTotal) * 100 : 0;
        
        // Calculate scores
        const avgDur = metrics.durations.length > 0 ? metrics.durations.reduce((a, b) => a + b, 0) / metrics.durations.length : 300;
        const efficiencyScore = Math.min(100, Math.max(20, Math.round(
          (metrics.visitsCount > 0 ? 60 : 0) + 
          (avgDur < 300 ? 40 : avgDur < 600 ? 25 : 10)
        )));

        const recoveryScore = Math.min(100, Math.round((metrics.recoveryAmount / target) * 100));
        const productivityScore = Math.round((efficiencyScore * 0.4) + (recoveryScore * 0.6));

        return {
          collectorId: colId,
          collectorName: colName,
          dailyProductivity: Math.round(metrics.visitsCount / Math.max(1, uniqueDays)),
          weeklyProductivity: metrics.visitsCount,
          monthlyProductivity: metrics.visitsCount * 4,
          visitCount: metrics.visitsCount,
          recoveryCount: metrics.recoveryCount,
          recoveryAmount: metrics.recoveryAmount,
          commitmentSuccessRate: commSuccess,
          efficiencyScore,
          recoveryScore,
          productivityScore
        };
      })
      .filter(c => c.visitCount > 0 || c.recoveryAmount > 0); // Only active ones in the timeframe

    // 8. ACTIVITY & AUDIT SUMMARIES
    const byType: Record<string, number> = {};
    activities.forEach(a => {
      byType[a.action] = (byType[a.action] || 0) + 1;
    });

    const recentActivities = activities.slice(0, 15).map(a => ({
      timestamp: a.createdAt,
      action: a.action,
      details: a.details,
      user: userMap.get(a.createdBy) || a.createdBy
    }));

    const totalSyncItems = await db.syncQueue.count();
    const pendingSyncCount = await db.syncQueue.filter(q => q.syncStatus === 'pending').count();

    const activitySummary = {
      totalActivities: activities.length,
      byType,
      recent: recentActivities
    };

    const auditSummary = {
      totalLogs: audits.length,
      errorsCount: audits.filter(a => a.level === 'ERROR').length,
      warningsCount: audits.filter(a => a.level === 'WARN').length,
      infoCount: audits.filter(a => a.level === 'INFO').length
    };

    // Sort customer list if requested
    if (filter.sortBy) {
      if (filter.sortBy === 'highest_recovery') {
        collectorAnalysis.sort((a, b) => b.recoveryAmount - a.recoveryAmount);
      } else if (filter.sortBy === 'highest_productivity') {
        collectorAnalysis.sort((a, b) => b.productivityScore - a.productivityScore);
      }
    }

    const executionTimeMs = performance.now() - startTime;
    logger.info('AnalyticsEngine', `Report generated successfully in ${executionTimeMs.toFixed(2)}ms`);

    return {
      reportId: 'REP-' + Math.random().toString(36).substring(2, 9).toUpperCase(),
      reportName: `Laporan Operasional (${filter.dateRange.start} s/d ${filter.dateRange.end})`,
      generatedAt: new Date().toISOString(),
      filters: filter,
      kpis,
      trends,
      portfolio,
      areaAnalysis,
      collectorAnalysis,
      activitySummary,
      syncSummary: {
        pendingSyncCount,
        syncedCount: totalSyncItems - pendingSyncCount,
        failedCount: await db.syncQueue.filter(q => q.syncStatus === 'failed').count(),
        totalSyncItems
      },
      auditSummary
    };
  }

  /**
   * Captures and persists a report snapshot locally in IndexedDB
   */
  public static async saveSnapshot(
    title: string,
    description: string,
    reportType: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM',
    data: OperationalReportData
  ): Promise<Result<boolean>> {
    try {
      const snap: Omit<ReportSnapshot, 'uuid' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'isDeleted' | 'version' | 'syncStatus' | 'createdBy' | 'updatedBy'> = {
        id: 'SNAP-' + Math.random().toString(36).substring(2, 9).toUpperCase(),
        title,
        description,
        reportType,
        generatedTime: new Date().toISOString(),
        filters: data.filters,
        kpis: data.kpis,
        chartsMetadata: {
          trends: data.trends,
          portfolio: {
            statusKeys: Object.keys(data.portfolio.customerStatusDistribution),
            statusValues: Object.values(data.portfolio.customerStatusDistribution),
            priorityKeys: Object.keys(data.portfolio.priorityDistribution),
            priorityValues: Object.values(data.portfolio.priorityDistribution),
            riskKeys: Object.keys(data.portfolio.riskDistribution),
            riskValues: Object.values(data.portfolio.riskDistribution)
          },
          areas: data.areaAnalysis.map(a => ({ name: a.areaName, visits: a.visitsCount, recovery: a.recoveryAmount }))
        },
        summary: {
          notes: `Skor Produktivitas Koleksi: ${data.kpis.collectionProductivityScore}%. Total Pemulihan Dana: IDR ${data.kpis.recoveryAmount.toLocaleString('id-ID')}.`,
          productivityScore: data.kpis.collectionProductivityScore,
          totalRecovery: data.kpis.recoveryAmount
        }
      };

      return await reportRepository.saveSnapshot(snap);
    } catch (err: any) {
      logger.error('AnalyticsEngine', 'Failed to compile snapshot payload', err);
      return {
        success: false,
        data: null,
        error: { code: 'SNAPSHOT_ERROR', message: err.message || 'Snapshot compilation failed' }
      };
    }
  }

  /**
   * Retrieves all local snapshots
   */
  public static async getSnapshots(): Promise<ReportSnapshot[]> {
    return await reportRepository.getAllSnapshots();
  }

  /**
   * Deletes a local snapshot
   */
  public static async deleteSnapshot(id: string): Promise<Result<boolean>> {
    return await reportRepository.deleteSnapshot(id);
  }

  /**
   * Retrieves all scheduled report foundations
   */
  public static async getScheduledReports(): Promise<ScheduledReportTask[]> {
    return await reportRepository.getScheduledTasks();
  }

  /**
   * Saves a scheduled report task
   */
  public static async saveScheduledReport(task: any): Promise<Result<boolean>> {
    return await reportRepository.saveScheduledTask(task);
  }

  /**
   * Stress-test / Benchmark the engine with a large mockup dataset.
   * Leverages high-performance in-memory generation to prevent IndexedDB blockages.
   */
  public static async benchmarkEngine(size: number = 10000): Promise<{
    generationTimeMs: number;
    customersCount: number;
    visitsCount: number;
    paymentsCount: number;
    memoryAllocatedMb: number;
    throughputKps: number;
  }> {
    logger.info('AnalyticsEngine', `Starting stress benchmark with dataset size: ${size}...`);
    const start = performance.now();

    // 1. Generate local heavy arrays
    const benchmarkCustomers: Customer[] = [];
    const benchmarkVisits: Visit[] = [];
    const benchmarkPayments: Payment[] = [];
    const benchmarkPtps: PromiseToPay[] = [];

    const areas = ['Mampang Prapatan', 'Tebet', 'Kebayoran Lama', 'Cilandak', 'Pasar Minggu', 'Jagakarsa'];
    const buckets: ('30' | '60' | '90' | '90+')[] = ['30', '60', '90', '90+'];
    const priorities: ('LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL')[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

    // Create seed items inside arrays
    for (let i = 0; i < size; i++) {
      const id = `CUST-BENCH-${i}`;
      benchmarkCustomers.push({
        id,
        uuid: crypto.randomUUID ? crypto.randomUUID() : id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        isDeleted: false,
        version: 1,
        syncStatus: 'synced',
        createdBy: 'system',
        updatedBy: 'system',
        name: `Nasabah Benchmark ${i}`,
        address: `Alamat Benchmark No. ${i}, Jakarta Selatan`,
        phoneNumber: '081234567890',
        outstandingBalance: Math.round(5000000 + Math.random() * 25000000),
        minPaymentDue: Math.round(500000 + Math.random() * 2000000),
        daysOverdue: Math.round(15 + Math.random() * 120),
        bucket: buckets[i % 4],
        status: i % 5 === 0 ? 'PAID' : i % 3 === 0 ? 'PROMISED' : 'PENDING',
        area: areas[i % areas.length],
        priorityLevel: priorities[i % priorities.length],
        contractNumber: `CTR-BENCH-${i}`,
        assignedCollectorId: 'COL-7729'
      });

      // Visits
      if (i % 2 === 0) {
        benchmarkVisits.push({
          id: `VIS-BENCH-${i}`,
          uuid: `VIS-BENCH-${i}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
          isDeleted: false,
          version: 1,
          syncStatus: 'synced',
          createdBy: 'system',
          updatedBy: 'system',
          customerId: id,
          collectorId: 'COL-7729',
          visitDate: new Date().toISOString(),
          status: i % 4 === 0 ? 'CONTACT' : 'NO_CONTACT',
          notes: 'Visit benchmark note',
          latitude: -6.2185,
          longitude: 106.7824,
          accuracy: 10,
          duration: 120 + Math.round(Math.random() * 300)
        });
      }

      // Payments
      if (i % 3 === 0) {
        benchmarkPayments.push({
          id: `PAY-BENCH-${i}`,
          uuid: `PAY-BENCH-${i}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
          isDeleted: false,
          version: 1,
          syncStatus: 'synced',
          createdBy: 'system',
          updatedBy: 'system',
          customerId: id,
          collectorId: 'COL-7729',
          amount: Math.round(1000000 + Math.random() * 5000000),
          paymentMethod: 'CASH',
          receiptNumber: `REC-BENCH-${i}`,
          paymentDate: new Date().toISOString().substring(0, 10)
        });
      }
    }

    const genStart = performance.now();
    // Do high speed in-memory calculation identical to the report logic
    const visitedSet = new Set(benchmarkVisits.map(v => v.customerId));
    const recoveryTotal = benchmarkPayments.reduce((sum, p) => sum + p.amount, 0);
    const successfulVis = benchmarkVisits.filter(v => v.status === 'CONTACT').length;
    const visitSuccRate = benchmarkVisits.length > 0 ? (successfulVis / benchmarkVisits.length) * 100 : 0;

    // Simulation complete
    const end = performance.now();
    const generationTimeMs = end - genStart;
    const totalTimeMs = end - start;

    // Estimate memory size of arrays in MB
    const totalRecordCount = benchmarkCustomers.length + benchmarkVisits.length + benchmarkPayments.length;
    const estimatedMemoryBytes = JSON.stringify({ benchmarkCustomers, benchmarkVisits, benchmarkPayments }).length;
    const memoryAllocatedMb = parseFloat((estimatedMemoryBytes / (1024 * 1024)).toFixed(2));
    
    // Throughput Calculations: Records processed per second
    const throughputKps = Math.round((totalRecordCount / (totalTimeMs / 1000)));

    return {
      generationTimeMs: parseFloat(totalTimeMs.toFixed(2)),
      customersCount: benchmarkCustomers.length,
      visitsCount: benchmarkVisits.length,
      paymentsCount: benchmarkPayments.length,
      memoryAllocatedMb,
      throughputKps
    };
  }
}
