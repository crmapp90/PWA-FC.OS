import { BaseEntity } from './index';

export interface ReportFilter {
  dateRange: {
    start: string; // ISO Date YYYY-MM-DD
    end: string;   // ISO Date YYYY-MM-DD
  };
  collectorId?: string; // 'ALL' or specific ID
  area?: string;        // 'ALL' or specific area
  risk?: string;        // 'ALL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
  priority?: string;    // 'ALL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
  customerStatus?: string; // 'ALL', 'PENDING', 'VISITED', 'PAID', 'PROMISED'
  recoveryRange?: {
    min?: number;
    max?: number;
  };
  searchQuery?: string;
  sortBy?: 'highest_recovery' | 'lowest_recovery' | 'highest_productivity' | 'newest' | 'oldest' | 'alphabetical';
}

export interface KPIMetrics {
  customersAssigned: number;
  customersVisited: number;
  visitSuccessRate: number;      // percentage
  visitFailureRate: number;      // percentage
  averageVisitDuration: number;  // seconds
  averageVisitsPerDay: number;
  ptpCreated: number;
  ptpFulfilled: number;
  ptpBroken: number;
  commitmentSuccessRate: number; // percentage
  paymentsRecorded: number;
  recoveryAmount: number;
  recoveryPercentage: number;     // against target
  outstandingReduction: number;
  averageRecoveryPerVisit: number;
  averageRecoveryPerCustomer: number;
  collectionProductivityScore: number; // 0 - 100
}

export interface TrendPoint {
  label: string; // e.g. "Mon", "Week 1", "01 Jul"
  recovery: number;
  visits: number;
  commitments: number;
  payments: number;
  productivity: number;
  outstanding: number;
  dpd: number;
  priorityRiskScore: number;
}

export interface PortfolioAnalysis {
  portfolioSize: number;
  outstandingBalance: number;
  customerStatusDistribution: Record<string, number>;
  priorityDistribution: Record<string, number>;
  riskDistribution: Record<string, number>;
  dpdDistribution: Record<string, number>; // buckets: 30, 60, 90, 90+
  recoveryDistribution: Record<string, number>; // by bucket or area
}

export interface AreaAnalysis {
  areaName: string;
  visitsCount: number;
  recoveryAmount: number;
  outstandingAmount: number;
  priorityLevel: string; // dominant priority
  commitmentSuccessRate: number;
}

export interface CollectorAnalysis {
  collectorId: string;
  collectorName: string;
  dailyProductivity: number;
  weeklyProductivity: number;
  monthlyProductivity: number;
  visitCount: number;
  recoveryCount: number;
  recoveryAmount: number;
  commitmentSuccessRate: number;
  efficiencyScore: number; // based on visit speed & accuracy
  recoveryScore: number;   // based on target achievement
  productivityScore: number;
}

export interface OperationalReportData {
  reportId: string;
  reportName: string;
  generatedAt: string;
  filters: ReportFilter;
  kpis: KPIMetrics;
  trends: TrendPoint[];
  portfolio: PortfolioAnalysis;
  areaAnalysis: AreaAnalysis[];
  collectorAnalysis: CollectorAnalysis[];
  activitySummary: {
    totalActivities: number;
    byType: Record<string, number>;
    recent: { timestamp: string; action: string; details: string; user: string }[];
  };
  syncSummary: {
    pendingSyncCount: number;
    syncedCount: number;
    failedCount: number;
    totalSyncItems: number;
  };
  auditSummary: {
    totalLogs: number;
    errorsCount: number;
    warningsCount: number;
    infoCount: number;
  };
}

export interface ReportSnapshot extends BaseEntity {
  title: string;
  description: string;
  reportType: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM';
  generatedTime: string;
  filters: ReportFilter;
  kpis: KPIMetrics;
  chartsMetadata: {
    trends: TrendPoint[];
    portfolio: {
      statusKeys: string[];
      statusValues: number[];
      priorityKeys: string[];
      priorityValues: number[];
      riskKeys: string[];
      riskValues: number[];
    };
    areas: { name: string; visits: number; recovery: number }[];
  };
  summary: {
    notes: string;
    productivityScore: number;
    totalRecovery: number;
  };
}

export interface ScheduledReportTask extends BaseEntity {
  title: string;
  reportType: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  recipients: string[]; // Email list or collector ID
  cronExpression: string;
  isActive: boolean;
  lastRunAt?: string;
  nextRunAt: string;
}
