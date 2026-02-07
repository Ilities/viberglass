import { test, expect } from '@playwright/test';
import {
  setupAWSTest,
  createTestProject,
  cleanupProject,
  uploadTestFileToS3,
  downloadFileFromS3,
  deleteFileFromS3,
} from '../fixtures/aws-setup';
import { v4 as uuidv4 } from 'uuid';

/**
 * End-to-end test: S3 file upload and download
 *
 * This test validates file storage integration:
 * 1. Upload file via API
 * 2. Verify file in S3
 * 3. Download file via API
 * 4. Verify content matches
 */
test.describe('S3 File Upload (AWS)', () => {
  let testContext;

  test.beforeAll(async () => {
    testContext = setupAWSTest();
  });

  test('should upload file to S3 and retrieve it', async ({ request }) => {
    const project = await createTestProject(request, testContext.tenantId);
    const bucketName = process.env.S3_BUCKET_NAME || 'viberglass-staging-uploads';
    let fileKey: string;

    try {
      // Step 1: Upload file via API
      console.log('Uploading file via API...');
      const fileContent = 'E2E Test File Content\nThis is a test file for S3 integration.';
      const fileName = `e2e-test-${uuidv4()}.txt`;

      const uploadResponse = await request.post(`/api/projects/${project.id}/files`, {
        multipart: {
          file: {
            name: fileName,
            mimeType: 'text/plain',
            buffer: Buffer.from(fileContent),
          },
          description: 'E2E test file',
        },
        headers: {
          'X-Tenant-Id': testContext.tenantId,
        },
      });

      expect(uploadResponse.ok()).toBeTruthy();
      const uploadResult = await uploadResponse.json();

      expect(uploadResult.key).toBeTruthy();
      expect(uploadResult.url).toBeTruthy();
      fileKey = uploadResult.key;

      // Step 2: Verify file exists in S3 directly
      console.log('Verifying file in S3...');
      const s3Content = await downloadFileFromS3(
        bucketName,
        fileKey,
        testContext.region
      );

      expect(s3Content).toBe(fileContent);

      // Step 3: Download file via API
      console.log('Downloading file via API...');
      const downloadResponse = await request.get(
        `/api/projects/${project.id}/files/${uploadResult.id}`,
        {
          headers: {
            'X-Tenant-Id': testContext.tenantId,
          },
        }
      );

      expect(downloadResponse.ok()).toBeTruthy();
      const downloadedContent = await downloadResponse.text();

      expect(downloadedContent).toBe(fileContent);

      // Step 4: Delete file via API
      console.log('Deleting file via API...');
      const deleteResponse = await request.delete(
        `/api/projects/${project.id}/files/${uploadResult.id}`,
        {
          headers: {
            'X-Tenant-Id': testContext.tenantId,
          },
        }
      );

      expect(deleteResponse.ok()).toBeTruthy();

      // Step 5: Verify file is deleted from S3
      await expect(async () => {
        await downloadFileFromS3(bucketName, fileKey, testContext.region);
      }).rejects.toThrow();

    } finally {
      // Cleanup
      if (fileKey) {
        try {
          await deleteFileFromS3(bucketName, fileKey, testContext.region);
        } catch (error) {
          // File already deleted, ignore
        }
      }
      await cleanupProject(request, project.id, testContext.tenantId);
    }
  });

  test('should handle large file upload', async ({ request }) => {
    const project = await createTestProject(request, testContext.tenantId);
    const bucketName = process.env.S3_BUCKET_NAME || 'viberglass-staging-uploads';
    let fileKey: string;

    try {
      // Create a 5MB file
      const largeFileContent = 'A'.repeat(5 * 1024 * 1024); // 5MB
      const fileName = `e2e-large-test-${uuidv4()}.txt`;

      console.log('Uploading large file (5MB)...');
      const uploadResponse = await request.post(`/api/projects/${project.id}/files`, {
        multipart: {
          file: {
            name: fileName,
            mimeType: 'text/plain',
            buffer: Buffer.from(largeFileContent),
          },
        },
        headers: {
          'X-Tenant-Id': testContext.tenantId,
        },
        timeout: 60000, // 60s timeout for large upload
      });

      expect(uploadResponse.ok()).toBeTruthy();
      const uploadResult = await uploadResponse.json();
      fileKey = uploadResult.key;

      // Verify file size in S3
      const s3Content = await downloadFileFromS3(
        bucketName,
        fileKey,
        testContext.region
      );

      expect(s3Content.length).toBe(largeFileContent.length);

    } finally {
      if (fileKey) {
        await deleteFileFromS3(bucketName, fileKey, testContext.region);
      }
      await cleanupProject(request, project.id, testContext.tenantId);
    }
  });

  test('should handle concurrent file uploads', async ({ request }) => {
    const project = await createTestProject(request, testContext.tenantId);
    const bucketName = process.env.S3_BUCKET_NAME || 'viberglass-staging-uploads';
    const fileKeys: string[] = [];

    try {
      // Upload 10 files concurrently
      const uploadPromises = [];
      for (let i = 0; i < 10; i++) {
        const fileContent = `E2E Test File ${i}`;
        const fileName = `e2e-concurrent-test-${i}-${uuidv4()}.txt`;

        uploadPromises.push(
          request.post(`/api/projects/${project.id}/files`, {
            multipart: {
              file: {
                name: fileName,
                mimeType: 'text/plain',
                buffer: Buffer.from(fileContent),
              },
            },
            headers: {
              'X-Tenant-Id': testContext.tenantId,
            },
          })
        );
      }

      console.log('Uploading 10 files concurrently...');
      const responses = await Promise.all(uploadPromises);

      // All uploads should succeed
      responses.forEach(response => {
        expect(response.ok()).toBeTruthy();
      });

      const results = await Promise.all(responses.map(r => r.json()));
      results.forEach(result => {
        expect(result.key).toBeTruthy();
        fileKeys.push(result.key);
      });

      // Verify all files exist in S3
      const verifyPromises = fileKeys.map(key =>
        downloadFileFromS3(bucketName, key, testContext.region)
      );

      const contents = await Promise.all(verifyPromises);
      expect(contents.length).toBe(10);

    } finally {
      // Cleanup all uploaded files
      await Promise.all(
        fileKeys.map(key =>
          deleteFileFromS3(bucketName, key, testContext.region).catch(() => {})
        )
      );
      await cleanupProject(request, project.id, testContext.tenantId);
    }
  });

  test('should reject file upload with invalid content type', async ({ request }) => {
    const project = await createTestProject(request, testContext.tenantId);

    try {
      // Try to upload executable file (should be rejected)
      const uploadResponse = await request.post(`/api/projects/${project.id}/files`, {
        multipart: {
          file: {
            name: 'malicious.exe',
            mimeType: 'application/x-msdownload',
            buffer: Buffer.from('FAKE EXECUTABLE'),
          },
        },
        headers: {
          'X-Tenant-Id': testContext.tenantId,
        },
      });

      expect(uploadResponse.status()).toBe(400);
      const error = await uploadResponse.json();
      expect(error.message).toContain('Invalid file type');

    } finally {
      await cleanupProject(request, project.id, testContext.tenantId);
    }
  });

  test('should enforce file size limits', async ({ request }) => {
    const project = await createTestProject(request, testContext.tenantId);

    try {
      // Try to upload file larger than limit (e.g., 100MB)
      const tooLargeContent = 'A'.repeat(101 * 1024 * 1024); // 101MB
      const fileName = `e2e-too-large-test-${uuidv4()}.txt`;

      console.log('Attempting to upload file exceeding size limit...');
      const uploadResponse = await request.post(`/api/projects/${project.id}/files`, {
        multipart: {
          file: {
            name: fileName,
            mimeType: 'text/plain',
            buffer: Buffer.from(tooLargeContent),
          },
        },
        headers: {
          'X-Tenant-Id': testContext.tenantId,
        },
        timeout: 120000, // 2 min timeout
      });

      expect(uploadResponse.status()).toBe(413);
      const error = await uploadResponse.json();
      expect(error.message).toContain('File too large');

    } finally {
      await cleanupProject(request, project.id, testContext.tenantId);
    }
  });
});
