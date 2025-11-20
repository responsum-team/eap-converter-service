import Queue, { Job } from 'bull';
import fs from 'fs/promises';
import path from 'path';
import conversionService from './services/conversionService';
import storageService from './services/storageService';
import queueService from './services/queueService';
import dotenv from 'dotenv';
import { JobData, ConversionResult } from './types';

dotenv.config();

const REDIS_HOST = process.env.REDIS_HOST || 'redis';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

// Queue configuration
const redisConfig = {
  redis: {
    host: REDIS_HOST,
    port: REDIS_PORT
  }
};

let pngQueue: Queue.Queue;
let pdfQueue: Queue.Queue;

/**
 * Process PNG conversion job
 */
async function processPNGConversion(job: Job<JobData>): Promise<ConversionResult> {
  const { jobId, filePath, originalName, dpi, batchId } = job.data;
  let pngFiles: string[] = [];

  try {
    console.log(`[Worker] Processing PNG job ${jobId}: ${originalName}`);

    // Update status to processing
    await queueService.updateJobStatus(jobId, {
      jobId,
      batchId,
      status: 'processing',
      originalName,
      format: 'png',
      progress: 10
    });

    // Convert to PNG
    job.progress(30);
    pngFiles = await conversionService.convertToPNG(filePath, originalName, dpi || 150);

    console.log(`[Worker] Generated ${pngFiles.length} PNG files for job ${jobId}`);

    // Upload to MinIO
    job.progress(60);
    let resultPath: string;
    let contentType: string;
    let filename: string;

    if (pngFiles.length === 1) {
      // Single file - upload directly
      const pngFile = pngFiles[0];
      const objectName = `${jobId}/${path.basename(pngFile)}`;
      resultPath = await storageService.uploadFile(pngFile, objectName);
      contentType = 'image/png';
      filename = path.basename(pngFile);
    } else {
      // Multiple files - create ZIP
      const zipName = `${jobId}/${path.basename(originalName, path.extname(originalName))}.zip`;
      resultPath = await storageService.uploadFilesAsZip(pngFiles, zipName);
      contentType = 'application/zip';
      filename = path.basename(zipName);
    }

    job.progress(90);

    // Get presigned URL for download
    const downloadUrl = await storageService.getPresignedUrl(resultPath, 86400); // 24 hours

    // Update status to completed
    await queueService.updateJobStatus(jobId, {
      jobId,
      batchId,
      status: 'completed',
      originalName,
      format: 'png',
      progress: 100,
      resultPath,
      downloadUrl,
      contentType,
      filename,
      fileCount: pngFiles.length,
      completedAt: new Date().toISOString()
    });

    console.log(`[Worker] Completed PNG job ${jobId}`);

    // Cleanup local files
    await cleanupFiles(filePath, pngFiles);

    return { jobId, status: 'completed', resultPath, fileCount: pngFiles.length };
  } catch (error) {
    console.error(`[Worker] Error processing PNG job ${jobId}:`, error);

    // Update status to failed
    await queueService.updateJobStatus(jobId, {
      jobId,
      batchId,
      status: 'failed',
      originalName,
      format: 'png',
      error: (error as Error).message,
      failedAt: new Date().toISOString()
    });

    // Cleanup on error
    await cleanupFiles(filePath, pngFiles);

    throw error;
  }
}

/**
 * Process PDF conversion job
 */
async function processPDFConversion(job: Job<JobData>): Promise<ConversionResult> {
  const { jobId, filePath, originalName, batchId } = job.data;

  try {
    console.log(`[Worker] Processing PDF job ${jobId}: ${originalName}`);

    // Update status to processing
    await queueService.updateJobStatus(jobId, {
      jobId,
      batchId,
      status: 'processing',
      originalName,
      format: 'pdf',
      progress: 10
    });

    // Convert to PDF
    job.progress(30);
    const pdfBuffer = await conversionService.convertToPDF(filePath, originalName);

    console.log(`[Worker] Generated PDF for job ${jobId}`);

    // Save PDF temporarily
    job.progress(60);
    const pdfFilename = path.basename(originalName, path.extname(originalName)) + '.pdf';
    const pdfPath = path.join(path.dirname(filePath), `${jobId}_${pdfFilename}`);
    await fs.writeFile(pdfPath, pdfBuffer);

    // Upload to MinIO
    const objectName = `${jobId}/${pdfFilename}`;
    const resultPath = await storageService.uploadFile(pdfPath, objectName);

    job.progress(90);

    // Get presigned URL for download
    const downloadUrl = await storageService.getPresignedUrl(resultPath, 86400); // 24 hours

    // Update status to completed
    await queueService.updateJobStatus(jobId, {
      jobId,
      batchId,
      status: 'completed',
      originalName,
      format: 'pdf',
      progress: 100,
      resultPath,
      downloadUrl,
      contentType: 'application/pdf',
      filename: pdfFilename,
      completedAt: new Date().toISOString()
    });

    console.log(`[Worker] Completed PDF job ${jobId}`);

    // Cleanup local files
    await cleanupFiles(filePath, [pdfPath]);

    return { jobId, status: 'completed', resultPath };
  } catch (error) {
    console.error(`[Worker] Error processing PDF job ${jobId}:`, error);

    // Update status to failed
    await queueService.updateJobStatus(jobId, {
      jobId,
      batchId,
      status: 'failed',
      originalName,
      format: 'pdf',
      error: (error as Error).message,
      failedAt: new Date().toISOString()
    });

    // Cleanup on error
    await cleanupFiles(filePath, []);

    throw error;
  }
}

/**
 * Cleanup temporary files
 */
async function cleanupFiles(originalFile: string, additionalFiles: string[] = []): Promise<void> {
  const filesToDelete = [originalFile, ...additionalFiles].filter(Boolean);

  for (const file of filesToDelete) {
    try {
      await fs.unlink(file);
      console.log(`[Worker] Deleted temp file: ${file}`);
    } catch (error) {
      console.error(`[Worker] Error deleting ${file}:`, (error as Error).message);
    }
  }
}

/**
 * Start the worker
 */
async function startWorker(): Promise<void> {
  try {
    console.log('='.repeat(60));
    console.log('Document Conversion Worker Starting...');
    console.log('='.repeat(60));

    // Initialize services
    await storageService.initialize();
    await queueService.initialize();

    // Create queue processors
    pngQueue = new Queue('png-conversion', redisConfig);
    pdfQueue = new Queue('pdf-conversion', redisConfig);

    // Process PNG conversion jobs
    pngQueue.process(async (job: Job<JobData>) => {
      return await processPNGConversion(job);
    });

    // Process PDF conversion jobs
    pdfQueue.process(async (job: Job<JobData>) => {
      return await processPDFConversion(job);
    });

    // Queue event handlers
    pngQueue.on('completed', (job: Job, result: ConversionResult) => {
      console.log(`[PNG Queue] Job ${job.id} completed:`, result);
    });

    pngQueue.on('failed', (job: Job, err: Error) => {
      console.error(`[PNG Queue] Job ${job.id} failed:`, err.message);
    });

    pngQueue.on('stalled', (job: Job) => {
      console.warn(`[PNG Queue] Job ${job.id} stalled`);
    });

    pdfQueue.on('completed', (job: Job, result: ConversionResult) => {
      console.log(`[PDF Queue] Job ${job.id} completed:`, result);
    });

    pdfQueue.on('failed', (job: Job, err: Error) => {
      console.error(`[PDF Queue] Job ${job.id} failed:`, err.message);
    });

    pdfQueue.on('stalled', (job: Job) => {
      console.warn(`[PDF Queue] Job ${job.id} stalled`);
    });

    console.log('Worker is ready and listening for jobs...');
    console.log('Press Ctrl+C to stop');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('Failed to start worker:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown(): Promise<void> {
  console.log('\nShutting down worker...');
  
  try {
    if (pngQueue) {
      await pngQueue.close();
      console.log('PNG queue closed');
    }
    if (pdfQueue) {
      await pdfQueue.close();
      console.log('PDF queue closed');
    }
    await queueService.close();
    console.log('Worker shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start the worker
startWorker();

