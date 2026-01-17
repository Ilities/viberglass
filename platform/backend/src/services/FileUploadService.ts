import AWS from 'aws-sdk';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { MediaAsset } from '../models/BugReport';

// Configure AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1',
});

const bucketName = process.env.AWS_S3_BUCKET || 'vibug-media';

// Configure multer for memory storage
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/webm',
      'video/quicktime'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images and videos are allowed.'));
    }
  }
});

export class FileUploadService {
  
  async uploadFile(file: Express.Multer.File, prefix: string = 'uploads'): Promise<MediaAsset> {
    const fileId = uuidv4();
    const fileExtension = this.getFileExtension(file.originalname);
    const filename = `${fileId}${fileExtension}`;
    const key = `${prefix}/${filename}`;
    
    const uploadParams: AWS.S3.PutObjectRequest = {
      Bucket: bucketName,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: 'private', // Files are private by default
      Metadata: {
        originalName: file.originalname,
        uploadedAt: new Date().toISOString(),
      }
    };
    
    try {
      const result = await s3.upload(uploadParams).promise();
      
      const mediaAsset: MediaAsset = {
        id: fileId,
        filename: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        url: result.Location,
        uploadedAt: new Date()
      };
      
      return mediaAsset;
      
    } catch (error) {
      console.error('Error uploading file to S3:', error);
      throw new Error('Failed to upload file');
    }
  }
  
  async uploadScreenshot(file: Express.Multer.File): Promise<MediaAsset> {
    return this.uploadFile(file, 'screenshots');
  }
  
  async uploadRecording(file: Express.Multer.File): Promise<MediaAsset> {
    return this.uploadFile(file, 'recordings');
  }
  
  async generateSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const params = {
      Bucket: bucketName,
      Key: key,
      Expires: expiresIn
    };
    
    try {
      return await s3.getSignedUrlPromise('getObject', params);
    } catch (error) {
      console.error('Error generating signed URL:', error);
      throw new Error('Failed to generate signed URL');
    }
  }
  
  async deleteFile(key: string): Promise<void> {
    const params = {
      Bucket: bucketName,
      Key: key
    };
    
    try {
      await s3.deleteObject(params).promise();
    } catch (error) {
      console.error('Error deleting file from S3:', error);
      throw new Error('Failed to delete file');
    }
  }
  
  private getFileExtension(filename: string): string {
    const lastDotIndex = filename.lastIndexOf('.');
    return lastDotIndex > -1 ? filename.substring(lastDotIndex) : '';
  }
  
  getKeyFromUrl(url: string): string {
    // Extract key from S3 URL
    const urlParts = url.split('/');
    const bucketIndex = urlParts.indexOf(bucketName);
    if (bucketIndex > -1 && bucketIndex < urlParts.length - 1) {
      return urlParts.slice(bucketIndex + 1).join('/');
    }
    throw new Error('Invalid S3 URL');
  }
}