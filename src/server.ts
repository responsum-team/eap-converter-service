import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
// import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer, { MulterError } from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import conversionService from './services/conversionService';
import queueService from './services/queueService';
import storageService from './services/storageService';
import dotenv from 'dotenv';
import azureJwtAuth from './middleware/azureJwtAuth';

// Load environment variables
dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '8080', 10);
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '52428800', 10); // 50MB default

// Middleware
// app.use(
//   helmet({
//     contentSecurityPolicy: false,
//     xDownloadOptions: false,
//   }),
// );
app.use(cors());
app.use(express.json());

// NOTE: authentication is applied per-route for upload endpoints to ensure multer doesn't run before auth
// (route-level middleware is applied for /convert/* endpoints)

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


// Healthcheck endpoint, replace with /health logic in future
app.get('/healthz', async (_req: Request, res: Response) => {
    return res.status(200).json({ status: 'ok' });
});

// Synchronous PDF conversion
app.post('/convert/pdf', azureJwtAuth, upload.single('file'), async (req: Request, res: Response): Promise<void> => {
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
    // Log deployed middleware file info to help verify correct image/version
    try {
      const deployedPath = '/app/dist/middleware/azureJwtAuth.js';
      const stat = await fs.stat(deployedPath).catch(() => null);
      if (stat) {
        console.log(`BUILD INFO: deployed ${deployedPath} size=${stat.size} mtime=${stat.mtime.toISOString()}`);
      } else {
        console.log(`BUILD INFO: ${deployedPath} not found in container filesystem`);
      }
    } catch (err) {
      console.log('BUILD INFO: error checking deployed middleware file', (err as Error).message);
    }

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
