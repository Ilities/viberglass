import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database';
import { BugReport, CreateBugReportRequest, UpdateBugReportRequest, MediaAsset } from '../models/BugReport';

export class BugReportService {
  
  async createBugReport(request: CreateBugReportRequest, screenshotAsset: MediaAsset, recordingAsset?: MediaAsset): Promise<BugReport> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const bugReportId = uuidv4();
      const timestamp = new Date();
      
      // Insert media assets
      const screenshotQuery = `
        INSERT INTO media_assets (id, filename, mime_type, size, url, uploaded_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `;
      await client.query(screenshotQuery, [
        screenshotAsset.id,
        screenshotAsset.filename,
        screenshotAsset.mimeType,
        screenshotAsset.size,
        screenshotAsset.url,
        screenshotAsset.uploadedAt
      ]);
      
      let recordingId = null;
      if (recordingAsset) {
        await client.query(screenshotQuery, [
          recordingAsset.id,
          recordingAsset.filename,
          recordingAsset.mimeType,
          recordingAsset.size,
          recordingAsset.url,
          recordingAsset.uploadedAt
        ]);
        recordingId = recordingAsset.id;
      }
      
      // Insert bug report
      const bugReportQuery = `
        INSERT INTO bug_reports (
          id, project_id, timestamp, title, description, severity, category,
          metadata, screenshot_id, recording_id, annotations, ticket_system,
          auto_fix_requested, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *
      `;
      
      const result = await client.query(bugReportQuery, [
        bugReportId,
        request.projectId,
        timestamp,
        request.title,
        request.description,
        request.severity,
        request.category,
        JSON.stringify(request.metadata),
        screenshotAsset.id,
        recordingId,
        JSON.stringify(request.annotations),
        request.ticketSystem,
        request.autoFixRequested,
        timestamp,
        timestamp
      ]);
      
      await client.query('COMMIT');
      
      const bugReport: BugReport = {
        id: result.rows[0].id,
        projectId: result.rows[0].project_id,
        timestamp: result.rows[0].timestamp,
        title: result.rows[0].title,
        description: result.rows[0].description,
        severity: result.rows[0].severity,
        category: result.rows[0].category,
        metadata: result.rows[0].metadata,
        screenshot: screenshotAsset,
        recording: recordingAsset,
        annotations: result.rows[0].annotations,
        ticketId: result.rows[0].ticket_id,
        ticketUrl: result.rows[0].ticket_url,
        ticketSystem: result.rows[0].ticket_system,
        autoFixRequested: result.rows[0].auto_fix_requested,
        autoFixStatus: result.rows[0].auto_fix_status,
        pullRequestUrl: result.rows[0].pull_request_url,
        createdAt: result.rows[0].created_at,
        updatedAt: result.rows[0].updated_at
      };
      
      return bugReport;
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  async getBugReport(id: string): Promise<BugReport | null> {
    const client = await pool.connect();
    
    try {
      const query = `
        SELECT 
          br.*,
          s.filename as screenshot_filename,
          s.mime_type as screenshot_mime_type,
          s.size as screenshot_size,
          s.url as screenshot_url,
          s.uploaded_at as screenshot_uploaded_at,
          r.id as recording_id,
          r.filename as recording_filename,
          r.mime_type as recording_mime_type,
          r.size as recording_size,
          r.url as recording_url,
          r.uploaded_at as recording_uploaded_at
        FROM bug_reports br
        JOIN media_assets s ON br.screenshot_id = s.id
        LEFT JOIN media_assets r ON br.recording_id = r.id
        WHERE br.id = $1
      `;
      
      const result = await client.query(query, [id]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const row = result.rows[0];
      
      const screenshot: MediaAsset = {
        id: row.screenshot_id,
        filename: row.screenshot_filename,
        mimeType: row.screenshot_mime_type,
        size: row.screenshot_size,
        url: row.screenshot_url,
        uploadedAt: row.screenshot_uploaded_at
      };
      
      let recording: MediaAsset | undefined;
      if (row.recording_id) {
        recording = {
          id: row.recording_id,
          filename: row.recording_filename,
          mimeType: row.recording_mime_type,
          size: row.recording_size,
          url: row.recording_url,
          uploadedAt: row.recording_uploaded_at
        };
      }
      
      const bugReport: BugReport = {
        id: row.id,
        projectId: row.project_id,
        timestamp: row.timestamp,
        title: row.title,
        description: row.description,
        severity: row.severity,
        category: row.category,
        metadata: row.metadata,
        screenshot,
        recording,
        annotations: row.annotations,
        ticketId: row.ticket_id,
        ticketUrl: row.ticket_url,
        ticketSystem: row.ticket_system,
        autoFixRequested: row.auto_fix_requested,
        autoFixStatus: row.auto_fix_status,
        pullRequestUrl: row.pull_request_url,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
      
      return bugReport;
      
    } finally {
      client.release();
    }
  }
  
  async updateBugReport(id: string, updates: UpdateBugReportRequest): Promise<void> {
    const client = await pool.connect();
    
    try {
      const setClauses: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;
      
      if (updates.title !== undefined) {
        setClauses.push(`title = $${paramIndex++}`);
        values.push(updates.title);
      }
      
      if (updates.description !== undefined) {
        setClauses.push(`description = $${paramIndex++}`);
        values.push(updates.description);
      }
      
      if (updates.severity !== undefined) {
        setClauses.push(`severity = $${paramIndex++}`);
        values.push(updates.severity);
      }
      
      if (updates.category !== undefined) {
        setClauses.push(`category = $${paramIndex++}`);
        values.push(updates.category);
      }
      
      if (updates.ticketId !== undefined) {
        setClauses.push(`ticket_id = $${paramIndex++}`);
        values.push(updates.ticketId);
      }
      
      if (updates.ticketUrl !== undefined) {
        setClauses.push(`ticket_url = $${paramIndex++}`);
        values.push(updates.ticketUrl);
      }
      
      if (updates.autoFixStatus !== undefined) {
        setClauses.push(`auto_fix_status = $${paramIndex++}`);
        values.push(updates.autoFixStatus);
      }
      
      if (updates.pullRequestUrl !== undefined) {
        setClauses.push(`pull_request_url = $${paramIndex++}`);
        values.push(updates.pullRequestUrl);
      }
      
      if (setClauses.length === 0) {
        return;
      }
      
      setClauses.push(`updated_at = $${paramIndex++}`);
      values.push(new Date());
      values.push(id);
      
      const query = `
        UPDATE bug_reports
        SET ${setClauses.join(', ')}
        WHERE id = $${paramIndex}
      `;
      
      await client.query(query, values);
      
    } finally {
      client.release();
    }
  }
  
  async getBugReportsByProject(projectId: string, limit = 50, offset = 0): Promise<BugReport[]> {
    const client = await pool.connect();
    
    try {
      const query = `
        SELECT 
          br.*,
          s.filename as screenshot_filename,
          s.mime_type as screenshot_mime_type,
          s.size as screenshot_size,
          s.url as screenshot_url,
          s.uploaded_at as screenshot_uploaded_at,
          r.id as recording_id,
          r.filename as recording_filename,
          r.mime_type as recording_mime_type,
          r.size as recording_size,
          r.url as recording_url,
          r.uploaded_at as recording_uploaded_at
        FROM bug_reports br
        JOIN media_assets s ON br.screenshot_id = s.id
        LEFT JOIN media_assets r ON br.recording_id = r.id
        WHERE br.project_id = $1
        ORDER BY br.created_at DESC
        LIMIT $2 OFFSET $3
      `;
      
      const result = await client.query(query, [projectId, limit, offset]);
      
      return result.rows.map(row => {
        const screenshot: MediaAsset = {
          id: row.screenshot_id,
          filename: row.screenshot_filename,
          mimeType: row.screenshot_mime_type,
          size: row.screenshot_size,
          url: row.screenshot_url,
          uploadedAt: row.screenshot_uploaded_at
        };
        
        let recording: MediaAsset | undefined;
        if (row.recording_id) {
          recording = {
            id: row.recording_id,
            filename: row.recording_filename,
            mimeType: row.recording_mime_type,
            size: row.recording_size,
            url: row.recording_url,
            uploadedAt: row.recording_uploaded_at
          };
        }
        
        return {
          id: row.id,
          projectId: row.project_id,
          timestamp: row.timestamp,
          title: row.title,
          description: row.description,
          severity: row.severity,
          category: row.category,
          metadata: row.metadata,
          screenshot,
          recording,
          annotations: row.annotations,
          ticketId: row.ticket_id,
          ticketUrl: row.ticket_url,
          ticketSystem: row.ticket_system,
          autoFixRequested: row.auto_fix_requested,
          autoFixStatus: row.auto_fix_status,
          pullRequestUrl: row.pull_request_url,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };
      });
      
    } finally {
      client.release();
    }
  }
}