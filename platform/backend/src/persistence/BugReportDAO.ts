import { v4 as uuidv4 } from 'uuid';
import db from './config/database';
import { BugReport, CreateBugReportRequest, UpdateBugReportRequest, MediaAsset } from '../models/BugReport';

export class BugReportDAO {
  async createBugReport(
    request: CreateBugReportRequest,
    screenshotAsset: MediaAsset,
    recordingAsset?: MediaAsset
  ): Promise<BugReport> {
    return await db.transaction().execute(async (trx) => {
      const bugReportId = uuidv4();
      const timestamp = new Date();

      // Insert screenshot media asset
      await trx
        .insertInto('media_assets')
        .values({
          id: screenshotAsset.id,
          filename: screenshotAsset.filename,
          mime_type: screenshotAsset.mimeType,
          size: screenshotAsset.size,
          url: screenshotAsset.url,
          uploaded_at: screenshotAsset.uploadedAt,
        })
        .execute();

      // Insert recording if provided
      if (recordingAsset) {
        await trx
          .insertInto('media_assets')
          .values({
            id: recordingAsset.id,
            filename: recordingAsset.filename,
            mime_type: recordingAsset.mimeType,
            size: recordingAsset.size,
            url: recordingAsset.url,
            uploaded_at: recordingAsset.uploadedAt,
          })
          .execute();
      }

      // Insert bug report
      const result = await trx
        .insertInto('bug_reports')
        .values({
          id: bugReportId,
          project_id: request.projectId,
          timestamp: timestamp,
          title: request.title,
          description: request.description,
          severity: request.severity,
          category: request.category,
          metadata: JSON.stringify(request.metadata),
          screenshot_id: screenshotAsset.id,
          recording_id: recordingAsset?.id || null,
          annotations: JSON.stringify(request.annotations),
          ticket_system: request.ticketSystem,
          auto_fix_requested: request.autoFixRequested,
          created_at: timestamp,
          updated_at: timestamp,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      const toISOString = (date: Date | string): string =>
        date instanceof Date ? date.toISOString() : date;

      return {
        id: result.id,
        projectId: result.project_id,
        timestamp: toISOString(result.timestamp),
        title: result.title,
        description: result.description,
        severity: result.severity as any,
        category: result.category,
        metadata: result.metadata as any,
        screenshot: {
          ...screenshotAsset,
          uploadedAt: toISOString(screenshotAsset.uploadedAt as any),
        },
        recording: recordingAsset ? {
          ...recordingAsset,
          uploadedAt: toISOString(recordingAsset.uploadedAt as any),
        } : undefined,
        annotations: result.annotations as any,
        ticketId: result.ticket_id || undefined,
        ticketUrl: result.ticket_url|| undefined,
        ticketSystem: result.ticket_system as any,
        autoFixRequested: result.auto_fix_requested,
        autoFixStatus: result.auto_fix_status as any,
        pullRequestUrl: result.pull_request_url|| undefined,
        createdAt: toISOString(result.created_at),
        updatedAt: toISOString(result.updated_at),
      };
    });
  }

  async getBugReport(id: string): Promise<BugReport | null> {
    const row = await db
      .selectFrom('bug_reports as br')
      .innerJoin('media_assets as s', 'br.screenshot_id', 's.id')
      .leftJoin('media_assets as r', 'br.recording_id', 'r.id')
      .select([
        'br.id',
        'br.project_id',
        'br.timestamp',
        'br.title',
        'br.description',
        'br.severity',
        'br.category',
        'br.metadata',
        'br.annotations',
        'br.ticket_id',
        'br.ticket_url',
        'br.ticket_system',
        'br.auto_fix_requested',
        'br.auto_fix_status',
        'br.pull_request_url',
        'br.created_at',
        'br.updated_at',
        's.id as screenshot_id',
        's.filename as screenshot_filename',
        's.mime_type as screenshot_mime_type',
        's.size as screenshot_size',
        's.url as screenshot_url',
        's.uploaded_at as screenshot_uploaded_at',
        'r.id as recording_id',
        'r.filename as recording_filename',
        'r.mime_type as recording_mime_type',
        'r.size as recording_size',
        'r.url as recording_url',
        'r.uploaded_at as recording_uploaded_at',
      ])
      .where('br.id', '=', id)
      .executeTakeFirst();

    if (!row) return null;

    return this.mapRowToBugReport(row);
  }

  async updateBugReport(id: string, updates: UpdateBugReportRequest): Promise<void> {
    await db
      .updateTable('bug_reports')
      .set({
        title: updates.title,
        description: updates.description,
        severity: updates.severity,
        category: updates.category,
        ticket_id: updates.ticketId,
        ticket_url: updates.ticketUrl,
        auto_fix_status: updates.autoFixStatus,
        pull_request_url: updates.pullRequestUrl,
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .execute();
  }

  async getBugReportsByProject(projectId: string, limit = 50, offset = 0): Promise<BugReport[]> {
    const rows = await db
      .selectFrom('bug_reports as br')
      .innerJoin('media_assets as s', 'br.screenshot_id', 's.id')
      .leftJoin('media_assets as r', 'br.recording_id', 'r.id')
      .select([
        'br.id',
        'br.project_id',
        'br.timestamp',
        'br.title',
        'br.description',
        'br.severity',
        'br.category',
        'br.metadata',
        'br.annotations',
        'br.ticket_id',
        'br.ticket_url',
        'br.ticket_system',
        'br.auto_fix_requested',
        'br.auto_fix_status',
        'br.pull_request_url',
        'br.created_at',
        'br.updated_at',
        's.id as screenshot_id',
        's.filename as screenshot_filename',
        's.mime_type as screenshot_mime_type',
        's.size as screenshot_size',
        's.url as screenshot_url',
        's.uploaded_at as screenshot_uploaded_at',
        'r.id as recording_id',
        'r.filename as recording_filename',
        'r.mime_type as recording_mime_type',
        'r.size as recording_size',
        'r.url as recording_url',
        'r.uploaded_at as recording_uploaded_at',
      ])
      .where('br.project_id', '=', projectId)
      .orderBy('br.created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    return rows.map((row) => this.mapRowToBugReport(row));
  }

  private toISOString(date: Date | string): string {
    return date instanceof Date ? date.toISOString() : date;
  }

  private mapRowToBugReport(row: any): BugReport {
    const screenshot: MediaAsset = {
      id: row.screenshot_id,
      filename: row.screenshot_filename,
      mimeType: row.screenshot_mime_type,
      size: Number(row.screenshot_size),
      url: row.screenshot_url,
      uploadedAt: this.toISOString(row.screenshot_uploaded_at),
    };

    let recording: MediaAsset | undefined;
    if (row.recording_id) {
      recording = {
        id: row.recording_id,
        filename: row.recording_filename,
        mimeType: row.recording_mime_type,
        size: Number(row.recording_size),
        url: row.recording_url,
        uploadedAt: this.toISOString(row.recording_uploaded_at),
      };
    }

    return {
      id: row.id,
      projectId: row.project_id,
      timestamp: this.toISOString(row.timestamp),
      title: row.title,
      description: row.description,
      severity: row.severity,
      category: row.category,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      screenshot,
      recording,
      annotations: typeof row.annotations === 'string' ? JSON.parse(row.annotations) : row.annotations,
      ticketId: row.ticket_id,
      ticketUrl: row.ticket_url,
      ticketSystem: row.ticket_system,
      autoFixRequested: row.auto_fix_requested,
      autoFixStatus: row.auto_fix_status,
      pullRequestUrl: row.pull_request_url,
      createdAt: this.toISOString(row.created_at),
      updatedAt: this.toISOString(row.updated_at),
    };
  }
}