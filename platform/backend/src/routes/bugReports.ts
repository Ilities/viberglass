import express from 'express';
import { BugReportService } from '../services/BugReportService';
import { FileUploadService, upload } from '../services/FileUploadService';
import { 
  validateCreateBugReport, 
  validateUpdateBugReport, 
  validateUuidParam, 
  validateFileUploads 
} from '../middleware/validation';

const router = express.Router();
const bugReportService = new BugReportService();
const fileUploadService = new FileUploadService();

// POST /api/bug-reports - Create a new bug report
router.post('/', 
  upload.fields([
    { name: 'screenshot', maxCount: 1 },
    { name: 'recording', maxCount: 1 }
  ]),
  validateFileUploads,
  validateCreateBugReport,
  async (req, res) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const screenshotFile = files.screenshot[0];
      const recordingFile = files.recording ? files.recording[0] : undefined;

      // Upload screenshot
      const screenshotAsset = await fileUploadService.uploadScreenshot(screenshotFile);
      
      // Upload recording if present
      let recordingAsset;
      if (recordingFile) {
        recordingAsset = await fileUploadService.uploadRecording(recordingFile);
      }

      // Create bug report
      const bugReport = await bugReportService.createBugReport(
        req.body,
        screenshotAsset,
        recordingAsset
      );

      res.status(201).json({
        success: true,
        data: bugReport
      });

    } catch (error) {
      console.error('Error creating bug report:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to create bug report'
      });
    }
  }
);

// GET /api/bug-reports/:id - Get a specific bug report
router.get('/:id',
  validateUuidParam('id'),
  async (req, res) => {
    try {
      const bugReport = await bugReportService.getBugReport(req.params.id);
      
      if (!bugReport) {
        return res.status(404).json({
          error: 'Bug report not found'
        });
      }

      res.json({
        success: true,
        data: bugReport
      });

    } catch (error) {
      console.error('Error fetching bug report:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to fetch bug report'
      });
    }
  }
);

// PUT /api/bug-reports/:id - Update a bug report
router.put('/:id',
  validateUuidParam('id'),
  validateUpdateBugReport,
  async (req, res) => {
    try {
      // Check if bug report exists
      const existingBugReport = await bugReportService.getBugReport(req.params.id);
      
      if (!existingBugReport) {
        return res.status(404).json({
          error: 'Bug report not found'
        });
      }

      // Update bug report
      await bugReportService.updateBugReport(req.params.id, req.body);
      
      // Fetch updated bug report
      const updatedBugReport = await bugReportService.getBugReport(req.params.id);

      res.json({
        success: true,
        data: updatedBugReport
      });

    } catch (error) {
      console.error('Error updating bug report:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to update bug report'
      });
    }
  }
);

// GET /api/bug-reports - Get bug reports by project
router.get('/',
  async (req, res) => {
    try {
      const projectId = req.query.projectId as string;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      if (!projectId) {
        return res.status(400).json({
          error: 'projectId query parameter is required'
        });
      }

      // Validate projectId format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(projectId)) {
        return res.status(400).json({
          error: 'Invalid projectId format'
        });
      }

      const bugReports = await bugReportService.getBugReportsByProject(projectId, limit, offset);

      res.json({
        success: true,
        data: bugReports,
        pagination: {
          limit,
          offset,
          count: bugReports.length
        }
      });

    } catch (error) {
      console.error('Error fetching bug reports:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to fetch bug reports'
      });
    }
  }
);

// GET /api/bug-reports/:id/media/:mediaId/signed-url - Get signed URL for media access
router.get('/:id/media/:mediaId/signed-url',
  validateUuidParam('id'),
  validateUuidParam('mediaId'),
  async (req, res) => {
    try {
      const bugReport = await bugReportService.getBugReport(req.params.id);
      
      if (!bugReport) {
        return res.status(404).json({
          error: 'Bug report not found'
        });
      }

      const mediaId = req.params.mediaId;
      let mediaAsset;

      // Find the requested media asset
      if (bugReport.screenshot.id === mediaId) {
        mediaAsset = bugReport.screenshot;
      } else if (bugReport.recording && bugReport.recording.id === mediaId) {
        mediaAsset = bugReport.recording;
      } else {
        return res.status(404).json({
          error: 'Media asset not found'
        });
      }

      // Generate signed URL
      const key = fileUploadService.getKeyFromUrl(mediaAsset.url);
      const signedUrl = await fileUploadService.generateSignedUrl(key, 3600); // 1 hour expiry

      res.json({
        success: true,
        data: {
          signedUrl,
          expiresIn: 3600
        }
      });

    } catch (error) {
      console.error('Error generating signed URL:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to generate signed URL'
      });
    }
  }
);

export default router;