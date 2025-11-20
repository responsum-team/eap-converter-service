import Queue from 'bull';
import { createClient, RedisClientType } from 'redis';
import { JobData, JobStatus, BatchStatus } from '../types';

const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';
const REDIS_HOST = process.env.REDIS_HOST || 'redis';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

class QueueService {
  public pngQueue: Queue.Queue | null = null;
  public pdfQueue: Queue.Queue | null = null;
  private redisClient: RedisClientType | null = null;
  private readonly jobStatusPrefix = 'job:status:';
  private readonly batchPrefix = 'batch:';

  /**
   * Initialize queue service
   */
  async initialize(): Promise<void> {
    try {
      // Create Redis client for job status storage
      this.redisClient = createClient({
        url: REDIS_URL
      });

      this.redisClient.on('error', (err) => {
        console.error('Redis Client Error:', err);
      });

      await this.redisClient.connect();
      console.log('Connected to Redis');

      // Create Bull queues for job processing
      const redisConfig = {
        redis: {
          host: REDIS_HOST,
          port: REDIS_PORT
        }
      };

      this.pngQueue = new Queue('png-conversion', redisConfig);
      this.pdfQueue = new Queue('pdf-conversion', redisConfig);

      console.log('Queue service initialized');
    } catch (error) {
      console.error('Failed to initialize queue service:', error);
      throw error;
    }
  }

  /**
   * Check if Redis is healthy
   */
  async checkHealth(): Promise<boolean> {
    try {
      if (!this.redisClient) {
        return false;
      }
      await this.redisClient.ping();
      return true;
    } catch (error) {
      console.error('Redis health check failed:', error);
      return false;
    }
  }

  /**
   * Add a PNG conversion job to the queue
   */
  async addPNGConversionJob(jobData: JobData): Promise<void> {
    try {
      if (!this.pngQueue) {
        throw new Error('PNG queue not initialized');
      }

      const { jobId, batchId, filePath, originalName, dpi } = jobData;

      // Add job to Bull queue
      await this.pngQueue.add(
        {
          jobId,
          batchId,
          filePath,
          originalName,
          dpi
        },
        {
          jobId,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000
          }
        }
      );

      // Store initial job status
      await this.updateJobStatus(jobId, {
        jobId,
        batchId,
        status: 'queued',
        originalName,
        format: 'png',
        createdAt: new Date().toISOString(),
        progress: 0
      });

      console.log(`PNG conversion job ${jobId} queued`);
    } catch (error) {
      console.error('Error adding PNG conversion job:', error);
      throw error;
    }
  }

  /**
   * Add a PDF conversion job to the queue
   */
  async addPDFConversionJob(jobData: JobData): Promise<void> {
    try {
      if (!this.pdfQueue) {
        throw new Error('PDF queue not initialized');
      }

      const { jobId, batchId, filePath, originalName } = jobData;

      // Add job to Bull queue
      await this.pdfQueue.add(
        {
          jobId,
          batchId,
          filePath,
          originalName
        },
        {
          jobId,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000
          }
        }
      );

      // Store initial job status
      await this.updateJobStatus(jobId, {
        jobId,
        batchId,
        status: 'queued',
        originalName,
        format: 'pdf',
        createdAt: new Date().toISOString(),
        progress: 0
      });

      console.log(`PDF conversion job ${jobId} queued`);
    } catch (error) {
      console.error('Error adding PDF conversion job:', error);
      throw error;
    }
  }

  /**
   * Update job status in Redis
   */
  async updateJobStatus(jobId: string, statusData: Partial<JobStatus>): Promise<void> {
    try {
      if (!this.redisClient) {
        throw new Error('Redis client not initialized');
      }

      const key = `${this.jobStatusPrefix}${jobId}`;
      await this.redisClient.set(
        key,
        JSON.stringify({ ...statusData, updatedAt: new Date().toISOString() }),
        { EX: 86400 } // Expire after 24 hours
      );

      // If part of a batch, update batch reference
      if (statusData.batchId) {
        const batchKey = `${this.batchPrefix}${statusData.batchId}`;
        await this.redisClient.sAdd(batchKey, jobId);
        await this.redisClient.expire(batchKey, 86400);
      }
    } catch (error) {
      console.error('Error updating job status:', error);
      throw error;
    }
  }

  /**
   * Get job status from Redis
   */
  async getJobStatus(jobId: string): Promise<JobStatus | null> {
    try {
      if (!this.redisClient) {
        throw new Error('Redis client not initialized');
      }

      const key = `${this.jobStatusPrefix}${jobId}`;
      const statusJson = await this.redisClient.get(key);
      
      if (!statusJson) {
        return null;
      }

      return JSON.parse(statusJson) as JobStatus;
    } catch (error) {
      console.error('Error getting job status:', error);
      throw error;
    }
  }

  /**
   * Get batch status
   */
  async getBatchStatus(batchId: string): Promise<BatchStatus> {
    try {
      if (!this.redisClient) {
        throw new Error('Redis client not initialized');
      }

      const batchKey = `${this.batchPrefix}${batchId}`;
      const jobIds = await this.redisClient.sMembers(batchKey);

      if (!jobIds || jobIds.length === 0) {
        return { batchId, jobs: [], status: 'queued', totalJobs: 0, completed: 0, failed: 0, processing: 0, queued: 0 };
      }

      const jobs: JobStatus[] = [];
      for (const jobId of jobIds) {
        const jobStatus = await this.getJobStatus(jobId);
        if (jobStatus) {
          jobs.push(jobStatus);
        }
      }

      // Calculate overall batch status
      const statuses = jobs.map(j => j.status);
      let overallStatus: BatchStatus['status'] = 'completed';
      
      if (statuses.some(s => s === 'failed')) {
        overallStatus = 'partial';
      } else if (statuses.some(s => s === 'processing' || s === 'queued')) {
        overallStatus = 'processing';
      }

      return {
        batchId,
        status: overallStatus,
        totalJobs: jobs.length,
        completed: jobs.filter(j => j.status === 'completed').length,
        failed: jobs.filter(j => j.status === 'failed').length,
        processing: jobs.filter(j => j.status === 'processing').length,
        queued: jobs.filter(j => j.status === 'queued').length,
        jobs
      };
    } catch (error) {
      console.error('Error getting batch status:', error);
      throw error;
    }
  }

  /**
   * Close connections
   */
  async close(): Promise<void> {
    try {
      if (this.pngQueue) {
        await this.pngQueue.close();
      }
      if (this.pdfQueue) {
        await this.pdfQueue.close();
      }
      if (this.redisClient) {
        await this.redisClient.quit();
      }
      console.log('Queue service closed');
    } catch (error) {
      console.error('Error closing queue service:', error);
    }
  }
}

export default new QueueService();

