import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer, { MulterError } from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import conversionService from './services/conversionService';
import queueService from './services/queueService';
import storageService from './services/storageService';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '8080', 10);
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '52428800', 10); // 50MB default

// Middleware
app.use(
  helmet({
    contentSecurityPolicy: false,
    xDownloadOptions: false,
  }),
);
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// File upload configuration
const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    const uploadDir = '/tmp/conversions';
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error as Error, uploadDir);
    }
  },
  filename: (_req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: MAX_FILE_SIZE
  },
  fileFilter: (_req, file, cb) => {
    const allowedExtensions = ['.docx', '.pptx', '.doc', '.ppt', '.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Allowed types: ${allowedExtensions.join(', ')}`));
    }
  }
});

// Health check endpoint
app.get('/health', async (_req: Request, res: Response) => {
  try {
    // Check dependencies
    const gotenbergHealth = await conversionService.checkHealth();
    const redisHealth = await queueService.checkHealth();
    const minioHealth = await storageService.checkHealth();

    const health = {
      status: 'ok' as const,
      timestamp: new Date().toISOString(),
      services: {
        gotenberg: gotenbergHealth ? ('up' as const) : ('down' as const),
        redis: redisHealth ? ('up' as const) : ('down' as const),
        minio: minioHealth ? ('up' as const) : ('down' as const)
      }
    };

    const allHealthy = gotenbergHealth && redisHealth && minioHealth;
    return res.status(allHealthy ? 200 : 503).json(health);
  } catch (error) {
    return res.status(503).json({
      status: 'error',
      message: (error as Error).message
    });
  }
});


// Healthcheck endpoint, replace with /health logic in future
app.get('/healthz', async (_req: Request, res: Response) => {
    return res.status(200).json({ status: 'ok' });
});

// Synchronous PDF conversion
app.post('/convert/pdf', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  let filePath: string | null = null;
  
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    filePath = req.file.path;
    console.log(`Converting ${req.file.originalname} to PDF...`);

    const pdfBuffer = await conversionService.convertToPDF(filePath, req.file.originalname);
    
    // Set response headers
    const outputFilename = path.basename(req.file.originalname, path.extname(req.file.originalname)) + '.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);
    res.setHeader('Content-Length', pdfBuffer.length.toString());
    
    res.send(pdfBuffer);
    
    console.log(`Successfully converted ${req.file.originalname} to PDF`);
  } catch (error) {
    console.error('PDF conversion error:', error);
    res.status(500).json({
      error: 'Conversion failed',
      message: (error as Error).message
    });
  } finally {
    // Cleanup uploaded file
    if (filePath) {
      try {
        await fs.unlink(filePath);
      } catch (err) {
        console.error('Error deleting temp file:', err);
      }
    }
  }
});

// Asynchronous PNG conversion
app.post('/convert/png', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const jobId = uuidv4();
    const dpi = parseInt(req.body.dpi, 10) || parseInt(process.env.PNG_DPI || '150', 10);

    console.log(`Queuing PNG conversion job ${jobId} for ${req.file.originalname}`);

    // Queue the job
    await queueService.addPNGConversionJob({
      jobId,
      filePath: req.file.path,
      originalName: req.file.originalname,
      dpi
    });

    res.status(202).json({
      jobId,
      status: 'queued',
      message: 'Conversion job queued successfully',
      statusUrl: `/jobs/${jobId}`
    });
  } catch (error) {
    console.error('Error queuing PNG conversion:', error);
    
    // Cleanup on error
    if (req.file && req.file.path) {
      try {
        await fs.unlink(req.file.path);
      } catch (err) {
        console.error('Error deleting temp file:', err);
      }
    }
    
    res.status(500).json({
      error: 'Failed to queue conversion job',
      message: (error as Error).message
    });
  }
});

// Batch conversion
app.post('/convert/batch', upload.array('files', 10), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      res.status(400).json({ error: 'No files uploaded' });
      return;
    }

    const batchId = uuidv4();
    const format = req.body.format || 'pdf'; // pdf or png
    const dpi = parseInt(req.body.dpi, 10) || parseInt(process.env.PNG_DPI || '150', 10);

    console.log(`Queuing batch conversion ${batchId} with ${req.files.length} files`);

    const jobs = [];
    for (const file of req.files) {
      const jobId = uuidv4();
      
      if (format === 'png') {
        await queueService.addPNGConversionJob({
          jobId,
          batchId,
          filePath: file.path,
          originalName: file.originalname,
          dpi
        });
      } else {
        await queueService.addPDFConversionJob({
          jobId,
          batchId,
          filePath: file.path,
          originalName: file.originalname
        });
      }

      jobs.push({
        jobId,
        filename: file.originalname,
        status: 'queued'
      });
    }

    res.status(202).json({
      batchId,
      status: 'queued',
      jobs,
      message: `${jobs.length} conversion jobs queued successfully`,
      statusUrl: `/jobs/batch/${batchId}`
    });
  } catch (error) {
    console.error('Error queuing batch conversion:', error);
    
    // Cleanup on error
    if (req.files && Array.isArray(req.files)) {
      for (const file of req.files) {
        try {
          await fs.unlink(file.path);
        } catch (err) {
          console.error('Error deleting temp file:', err);
        }
      }
    }
    
    res.status(500).json({
      error: 'Failed to queue batch conversion',
      message: (error as Error).message
    });
  }
});

// Get job status
app.get('/jobs/:jobId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { jobId } = req.params;
    const jobStatus = await queueService.getJobStatus(jobId);

    if (!jobStatus) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    res.json(jobStatus);
  } catch (error) {
    console.error('Error getting job status:', error);
    res.status(500).json({
      error: 'Failed to get job status',
      message: (error as Error).message
    });
  }
});

// Get batch status
app.get('/jobs/batch/:batchId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { batchId } = req.params;
    const batchStatus = await queueService.getBatchStatus(batchId);

    if (!batchStatus || batchStatus.jobs.length === 0) {
      res.status(404).json({ error: 'Batch not found' });
      return;
    }

    res.json(batchStatus);
  } catch (error) {
    console.error('Error getting batch status:', error);
    res.status(500).json({
      error: 'Failed to get batch status',
      message: (error as Error).message
    });
  }
});

// Download job results
app.get('/jobs/:jobId/download', async (req: Request, res: Response): Promise<void> => {
  try {
    const { jobId } = req.params;
    const jobStatus = await queueService.getJobStatus(jobId);

    if (!jobStatus) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    if (jobStatus.status !== 'completed') {
      res.status(400).json({
        error: 'Job not completed',
        status: jobStatus.status
      });
      return;
    }

    if (!jobStatus.resultPath) {
      res.status(500).json({ error: 'Result path not found' });
      return;
    }

    // Download from MinIO and stream to client
    const downloadStream = await storageService.downloadFile(jobStatus.resultPath);
    
    res.setHeader('Content-Type', jobStatus.contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${jobStatus.filename}"`);
    
    downloadStream.pipe(res);
  } catch (error) {
    console.error('Error downloading job result:', error);
    res.status(500).json({
      error: 'Failed to download result',
      message: (error as Error).message
    });
  }
});

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction): void => {
  console.error('Error:', err);
  
  if (err instanceof MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({
        error: 'File too large',
        message: `Maximum file size is ${MAX_FILE_SIZE / 1024 / 1024}MB`
      });
      return;
    }
    res.status(400).json({
      error: 'File upload error',
      message: err.message
    });
    return;
  }
  
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// 404 handler
app.use((_req: Request, res: Response): void => {
  res.status(404).json({
    error: 'Not found',
    message: 'The requested endpoint does not exist'
  });
});

// Start server
async function startServer(): Promise<void> {
  try {
    // Initialize services
    await storageService.initialize();
    await queueService.initialize();
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Document Conversion API Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await queueService.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await queueService.close();
  process.exit(0);
});

startServer();

