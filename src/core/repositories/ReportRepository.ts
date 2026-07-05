import { db, createBaseEntityFields } from '../database';
import { Result } from '../../types';
import { ReportSnapshot, ScheduledReportTask } from '../../types/reports';
import { logger } from '../logger';

export class ReportRepository {
  /**
   * Retrieves all report snapshots sorted by generatedTime descending
   */
  public async getAllSnapshots(): Promise<ReportSnapshot[]> {
    try {
      const list = await db.report_snapshots
        .filter(s => !s.isDeleted)
        .toArray();
      return list.sort((a, b) => new Date(b.generatedTime).getTime() - new Date(a.generatedTime).getTime());
    } catch (err) {
      logger.error('ReportRepository', 'Failed to retrieve report snapshots', err);
      return [];
    }
  }

  /**
   * Retrieves a single report snapshot by ID
   */
  public async getSnapshot(id: string): Promise<ReportSnapshot | null> {
    try {
      const snap = await db.report_snapshots.get(id);
      return snap && !snap.isDeleted ? snap : null;
    } catch (err) {
      logger.error('ReportRepository', `Failed to retrieve snapshot ${id}`, err);
      return null;
    }
  }

  /**
   * Saves a new report snapshot or overwrites an existing one
   */
  public async saveSnapshot(snapshot: Omit<ReportSnapshot, 'uuid' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'isDeleted' | 'version' | 'syncStatus' | 'createdBy' | 'updatedBy'> & Partial<ReportSnapshot>): Promise<Result<boolean>> {
    try {
      const baseFields = createBaseEntityFields('system');
      const finalSnapshot: ReportSnapshot = {
        ...baseFields,
        ...snapshot,
        id: snapshot.id || 'SNAP-' + Math.random().toString(36).substring(2, 9).toUpperCase(),
      } as ReportSnapshot;

      await db.report_snapshots.put(finalSnapshot);
      logger.info('ReportRepository', `Saved snapshot: ${finalSnapshot.title}`);
      
      return { success: true, data: true, error: null };
    } catch (err: any) {
      logger.error('ReportRepository', 'Failed to save snapshot', err);
      return {
        success: false,
        data: null,
        error: { code: 'SAVE_FAILED', message: err.message || 'Unknown save failure' }
      };
    }
  }

  /**
   * Soft deletes a report snapshot
   */
  public async deleteSnapshot(id: string): Promise<Result<boolean>> {
    try {
      const snap = await db.report_snapshots.get(id);
      if (snap) {
        snap.isDeleted = true;
        snap.deletedAt = new Date().toISOString();
        await db.report_snapshots.put(snap);
        logger.info('ReportRepository', `Soft deleted snapshot: ${id}`);
      }
      return { success: true, data: true, error: null };
    } catch (err: any) {
      logger.error('ReportRepository', `Failed to delete snapshot ${id}`, err);
      return {
        success: false,
        data: null,
        error: { code: 'DELETE_FAILED', message: err.message || 'Unknown delete failure' }
      };
    }
  }

  /**
   * Retrieves all scheduled report foundations
   */
  public async getScheduledTasks(): Promise<ScheduledReportTask[]> {
    try {
      const list = await db.scheduled_reports
        .filter(t => !t.isDeleted)
        .toArray();
      return list;
    } catch (err) {
      logger.error('ReportRepository', 'Failed to retrieve scheduled report tasks', err);
      return [];
    }
  }

  /**
   * Saves a scheduled report task
   */
  public async saveScheduledTask(task: Omit<ScheduledReportTask, 'uuid' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'isDeleted' | 'version' | 'syncStatus' | 'createdBy' | 'updatedBy'> & Partial<ScheduledReportTask>): Promise<Result<boolean>> {
    try {
      const baseFields = createBaseEntityFields('system');
      const finalTask: ScheduledReportTask = {
        ...baseFields,
        ...task,
        id: task.id || 'SCH-' + Math.random().toString(36).substring(2, 9).toUpperCase(),
      } as ScheduledReportTask;

      await db.scheduled_reports.put(finalTask);
      logger.info('ReportRepository', `Saved scheduled report task: ${finalTask.title}`);
      return { success: true, data: true, error: null };
    } catch (err: any) {
      logger.error('ReportRepository', 'Failed to save scheduled report task', err);
      return {
        success: false,
        data: null,
        error: { code: 'SAVE_FAILED', message: err.message || 'Unknown save failure' }
      };
    }
  }
}

export const reportRepository = new ReportRepository();
