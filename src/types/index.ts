export interface JobData {
  jobId: string;
  batchId?: string;
  filePath: string;
  originalName: string;
  dpi?: number;
}

export interface JobStatus {
  jobId: string;
  batchId?: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  originalName: string;
  format: 'pdf' | 'png';
  progress: number;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
  failedAt?: string;
  resultPath?: string;
  downloadUrl?: string;
  contentType?: string;
  filename?: string;
  fileCount?: number;
  error?: string;
}

export interface BatchStatus {
  batchId: string;
  status: 'queued' | 'processing' | 'completed' | 'partial' | 'failed';
  totalJobs: number;
  completed: number;
  failed: number;
  processing: number;
  queued: number;
  jobs: JobStatus[];
}

export interface HealthStatus {
  status: 'ok' | 'error';
  timestamp: string;
  services?: {
    gotenberg: 'up' | 'down';
    redis: 'up' | 'down';
    minio: 'up' | 'down';
  };
  message?: string;
}

export interface ConversionResult {
  jobId: string;
  status: string;
  resultPath: string;
  fileCount?: number;
}

export interface MinioMetadata {
  [key: string]: string | number | boolean;
}

