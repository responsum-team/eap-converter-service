import * as Minio from 'minio';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { v4 as uuidv4 } from 'uuid';
import { MinioMetadata } from '../types';
import { Readable } from 'stream';

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'minio';
const MINIO_PORT = parseInt(process.env.MINIO_PORT || '9000', 10);
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || 'minioadmin';
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || 'minioadmin';
const MINIO_USE_SSL = process.env.MINIO_USE_SSL === 'true';
const MINIO_BUCKET = process.env.MINIO_BUCKET || 'conversions';

class StorageService {
  private minioClient: Minio.Client | null = null;
  private readonly bucketName = MINIO_BUCKET;

  /**
   * Initialize MinIO client and ensure bucket exists
   */
  async initialize(): Promise<void> {
    try {
      this.minioClient = new Minio.Client({
        endPoint: MINIO_ENDPOINT,
        port: MINIO_PORT,
        useSSL: MINIO_USE_SSL,
        accessKey: MINIO_ACCESS_KEY,
        secretKey: MINIO_SECRET_KEY
      });

      // Check if bucket exists, create if not
      const bucketExists = await this.minioClient.bucketExists(this.bucketName);
      if (!bucketExists) {
        await this.minioClient.makeBucket(this.bucketName, 'us-east-1');
        console.log(`Created bucket: ${this.bucketName}`);
      } else {
        console.log(`Bucket ${this.bucketName} already exists`);
      }

      console.log('MinIO storage service initialized');
    } catch (error) {
      console.error('Failed to initialize MinIO:', error);
      throw error;
    }
  }

  /**
   * Check if MinIO is healthy
   */
  async checkHealth(): Promise<boolean> {
    try {
      if (!this.minioClient) {
        return false;
      }
      await this.minioClient.bucketExists(this.bucketName);
      return true;
    } catch (error) {
      console.error('MinIO health check failed:', error);
      return false;
    }
  }

  /**
   * Upload a file to MinIO
   * @param filePath - Local file path
   * @param objectName - Object name in MinIO
   * @param metadata - Optional metadata
   * @returns Object path in MinIO
   */
  async uploadFile(filePath: string, objectName: string | null = null, metadata: MinioMetadata = {}): Promise<string> {
    try {
      if (!this.minioClient) {
        throw new Error('MinIO client not initialized');
      }

      if (!objectName) {
        objectName = `${uuidv4()}/${path.basename(filePath)}`;
      }

      const fileStream = fs.createReadStream(filePath);
      const stats = await fs.promises.stat(filePath);

      await this.minioClient.putObject(
        this.bucketName,
        objectName,
        fileStream,
        stats.size,
        metadata
      );

      console.log(`Uploaded ${filePath} to ${this.bucketName}/${objectName}`);
      return objectName;
    } catch (error) {
      console.error('Error uploading file to MinIO:', error);
      throw error;
    }
  }

  /**
   * Upload multiple files and create a ZIP archive in MinIO
   * @param filePaths - Array of local file paths
   * @param zipName - Name for the ZIP file
   * @returns Object path in MinIO
   */
  async uploadFilesAsZip(filePaths: string[], zipName: string | null = null): Promise<string> {
    return new Promise(async (resolve, reject) => {
      try {
        if (!this.minioClient) {
          throw new Error('MinIO client not initialized');
        }

        if (!zipName) {
          zipName = `${uuidv4()}.zip`;
        }

        const archive = archiver('zip', {
          zlib: { level: 9 }
        });

        // Track upload
        const uploadPromise = new Promise<string>((resolveUpload, rejectUpload) => {
          const chunks: Buffer[] = [];
          
          archive.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
          });

          archive.on('end', async () => {
            try {
              if (!this.minioClient) {
                throw new Error('MinIO client not initialized');
              }

              const buffer = Buffer.concat(chunks);
              await this.minioClient.putObject(
                this.bucketName,
                zipName!,
                buffer,
                buffer.length,
                { 'Content-Type': 'application/zip' }
              );
              console.log(`Uploaded ZIP archive: ${zipName}`);
              resolveUpload(zipName!);
            } catch (err) {
              rejectUpload(err);
            }
          });

          archive.on('error', (err: Error) => {
            rejectUpload(err);
          });
        });

        // Add files to archive
        for (const filePath of filePaths) {
          const fileName = path.basename(filePath);
          archive.file(filePath, { name: fileName });
        }

        // Finalize archive
        await archive.finalize();

        const result = await uploadPromise;
        resolve(result);
      } catch (error) {
        console.error('Error creating and uploading ZIP:', error);
        reject(error);
      }
    });
  }

  /**
   * Download a file from MinIO
   * @param objectName - Object name in MinIO
   * @returns File stream
   */
  async downloadFile(objectName: string): Promise<Readable> {
    try {
      if (!this.minioClient) {
        throw new Error('MinIO client not initialized');
      }

      const stream = await this.minioClient.getObject(this.bucketName, objectName);
      return stream;
    } catch (error) {
      console.error('Error downloading file from MinIO:', error);
      throw error;
    }
  }

  /**
   * Get a presigned URL for downloading a file
   * @param objectName - Object name in MinIO
   * @param expirySeconds - URL expiry time in seconds (default 24 hours)
   * @returns Presigned URL
   */
  async getPresignedUrl(objectName: string, expirySeconds: number = 86400): Promise<string> {
    try {
      if (!this.minioClient) {
        throw new Error('MinIO client not initialized');
      }

      const url = await this.minioClient.presignedGetObject(
        this.bucketName,
        objectName,
        expirySeconds
      );
      return url;
    } catch (error) {
      console.error('Error generating presigned URL:', error);
      throw error;
    }
  }

  /**
   * Delete a file from MinIO
   * @param objectName - Object name in MinIO
   */
  async deleteFile(objectName: string): Promise<void> {
    try {
      if (!this.minioClient) {
        throw new Error('MinIO client not initialized');
      }

      await this.minioClient.removeObject(this.bucketName, objectName);
      console.log(`Deleted ${objectName} from MinIO`);
    } catch (error) {
      console.error('Error deleting file from MinIO:', error);
      throw error;
    }
  }

  /**
   * List files in a prefix
   * @param prefix - Object prefix
   * @returns List of objects
   */
  async listFiles(prefix: string = ''): Promise<Minio.BucketItem[]> {
    return new Promise((resolve, reject) => {
      if (!this.minioClient) {
        reject(new Error('MinIO client not initialized'));
        return;
      }

      const objects: Minio.BucketItem[] = [];
      const stream = this.minioClient.listObjects(this.bucketName, prefix, true);

      stream.on('data', (obj: Minio.BucketItem) => {
        objects.push(obj);
      });

      stream.on('end', () => {
        resolve(objects);
      });

      stream.on('error', (err: Error) => {
        reject(err);
      });
    });
  }
}

export default new StorageService();

