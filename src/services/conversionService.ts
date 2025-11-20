import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

const GOTENBERG_URL = process.env.GOTENBERG_URL || 'http://gotenberg:3000';
const PNG_DPI = parseInt(process.env.PNG_DPI || '150', 10);

class ConversionService {
  /**
   * Check if Gotenberg is healthy
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await axios.get(`${GOTENBERG_URL}/health`, {
        timeout: 5000
      });
      return response.status === 200;
    } catch (error) {
      console.error('Gotenberg health check failed:', (error as Error).message);
      return false;
    }
  }

  /**
   * Convert a document to PDF using Gotenberg
   * @param filePath - Path to the input file
   * @param originalName - Original filename
   * @returns PDF buffer
   */
  async convertToPDF(filePath: string, originalName: string): Promise<Buffer> {
    try {
      const form = new FormData();
      form.append('files', fs.createReadStream(filePath), originalName);

      const response = await axios.post(
        `${GOTENBERG_URL}/forms/libreoffice/convert`,
        form,
        {
          headers: form.getHeaders(),
          responseType: 'arraybuffer',
          timeout: 300000, // 5 minutes
          maxBodyLength: Infinity,
          maxContentLength: Infinity
        }
      );

      if (response.status === 200) {
        return Buffer.from(response.data);
      } else {
        throw new Error(`Gotenberg returned status ${response.status}`);
      }
    } catch (error) {
      console.error('Error converting to PDF:', (error as Error).message);
      if (axios.isAxiosError(error) && error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data?.toString());
      }
      throw new Error(`PDF conversion failed: ${(error as Error).message}`);
    }
  }

  /**
   * Convert PDF to PNG images using pdftoppm
   * @param pdfPath - Path to the PDF file
   * @param outputPrefix - Output filename prefix
   * @param dpi - DPI for PNG output
   * @returns Array of PNG file paths
   */
  async convertPDFtoPNG(pdfPath: string, outputPrefix: string, dpi: number = PNG_DPI): Promise<string[]> {
    try {
      const outputDir = path.dirname(pdfPath);
      const outputBasename = path.basename(outputPrefix, path.extname(outputPrefix));
      const outputPath = path.join(outputDir, outputBasename);

      // Use pdftoppm to convert PDF to PNG
      const command = `pdftoppm -png -r ${dpi} "${pdfPath}" "${outputPath}"`;
      
      console.log(`Executing: ${command}`);
      const { stderr } = await execAsync(command);
      
      if (stderr) {
        console.warn('pdftoppm stderr:', stderr);
      }

      // Find all generated PNG files
      const files = await fs.promises.readdir(outputDir);
      const pngFiles = files
        .filter(f => f.startsWith(outputBasename) && f.endsWith('.png'))
        .map(f => path.join(outputDir, f))
        .sort();

      if (pngFiles.length === 0) {
        throw new Error('No PNG files were generated');
      }

      console.log(`Generated ${pngFiles.length} PNG files`);
      return pngFiles;
    } catch (error) {
      console.error('Error converting PDF to PNG:', error);
      throw new Error(`PNG conversion failed: ${(error as Error).message}`);
    }
  }

  /**
   * Convert document directly to PNG (via PDF intermediate)
   * @param filePath - Path to the input file
   * @param originalName - Original filename
   * @param dpi - DPI for PNG output
   * @returns Array of PNG file paths
   */
  async convertToPNG(filePath: string, originalName: string, dpi: number = PNG_DPI): Promise<string[]> {
    let pdfPath: string | null = null;
    
    try {
      // First convert to PDF
      console.log(`Converting ${originalName} to PDF...`);
      const pdfBuffer = await this.convertToPDF(filePath, originalName);
      
      // Save PDF temporarily
      const pdfFilename = path.basename(originalName, path.extname(originalName)) + '.pdf';
      pdfPath = path.join(path.dirname(filePath), pdfFilename);
      await fs.promises.writeFile(pdfPath, pdfBuffer);
      
      // Convert PDF to PNG
      console.log(`Converting PDF to PNG at ${dpi} DPI...`);
      const outputPrefix = path.basename(originalName, path.extname(originalName));
      const pngFiles = await this.convertPDFtoPNG(pdfPath, outputPrefix, dpi);
      
      return pngFiles;
    } catch (error) {
      console.error('Error in convertToPNG:', error);
      throw error;
    } finally {
      // Cleanup temporary PDF
      if (pdfPath) {
        try {
          await fs.promises.unlink(pdfPath);
        } catch (err) {
          console.error('Error deleting temp PDF:', err);
        }
      }
    }
  }
}

export default new ConversionService();

