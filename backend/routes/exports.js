import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { checkOwnerAccess, checkFeatureAccess } from '../middleware/rbac.js';
import exportService from '../services/exportService.js';
import fs from 'fs/promises';

const router = express.Router();

// Export bookings to CSV
router.post('/bookings/csv', 
  authenticateToken, 
  checkOwnerAccess,
  async (req, res) => {
    try {
      const filters = req.body.filters || {};
      
      const result = await exportService.exportBookingsCSV(req.effectiveUserId, filters);
      
      res.json({
        message: 'Bookings exported successfully',
        filename: result.filename,
        recordCount: result.recordCount,
        downloadUrl: `/api/exports/download/${result.filename}`
      });
    } catch (error) {
      console.error('Error exporting bookings CSV:', error);
      res.status(500).json({ 
        message: error.message || 'Failed to export bookings' 
      });
    }
  }
);

// Export customers to CSV
router.post('/customers/csv', 
  authenticateToken, 
  checkOwnerAccess,
  async (req, res) => {
    try {
      const filters = req.body.filters || {};
      
      const result = await exportService.exportCustomersCSV(req.effectiveUserId, filters);
      
      res.json({
        message: 'Customers exported successfully',
        filename: result.filename,
        recordCount: result.recordCount,
        downloadUrl: `/api/exports/download/${result.filename}`
      });
    } catch (error) {
      console.error('Error exporting customers CSV:', error);
      res.status(500).json({ 
        message: error.message || 'Failed to export customers' 
      });
    }
  }
);

// Export revenue data to CSV
router.post('/revenue/csv', 
  authenticateToken, 
  checkOwnerAccess,
  async (req, res) => {
    try {
      const filters = req.body.filters || {};
      
      const result = await exportService.exportRevenueCSV(req.effectiveUserId, filters);
      
      res.json({
        message: 'Revenue data exported successfully',
        filename: result.filename,
        recordCount: result.recordCount,
        totalRevenue: result.totalRevenue,
        totalBookings: result.totalBookings,
        downloadUrl: `/api/exports/download/${result.filename}`
      });
    } catch (error) {
      console.error('Error exporting revenue CSV:', error);
      res.status(500).json({ 
        message: error.message || 'Failed to export revenue data' 
      });
    }
  }
);

// Generate PDF report
router.post('/report/pdf', 
  authenticateToken, 
  checkOwnerAccess,
  checkFeatureAccess('basic_analytics'),
  async (req, res) => {
    try {
      const { reportType = 'comprehensive', filters = {} } = req.body;
      
      if (!['comprehensive', 'summary', 'detailed'].includes(reportType)) {
        return res.status(400).json({ 
          message: 'Invalid report type. Must be: comprehensive, summary, or detailed' 
        });
      }
      
      const result = await exportService.generatePDFReport(
        req.effectiveUserId, 
        reportType, 
        filters
      );
      
      res.json({
        message: 'PDF report generated successfully',
        filename: result.filename,
        reportType: result.reportType,
        downloadUrl: `/api/exports/download/${result.filename}`
      });
    } catch (error) {
      console.error('Error generating PDF report:', error);
      res.status(500).json({ 
        message: error.message || 'Failed to generate PDF report' 
      });
    }
  }
);

// Download exported file
router.get('/download/:filename', 
  authenticateToken, 
  checkOwnerAccess,
  async (req, res) => {
    try {
      const { filename } = req.params;
      
      // Security check: only allow alphanumeric, dots, dashes, underscores
      if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
        return res.status(400).json({ message: 'Invalid filename' });
      }
      
      const fileInfo = await exportService.getFileInfo(filename);
      
      // Set appropriate headers
      const ext = filename.split('.').pop().toLowerCase();
      let contentType = 'application/octet-stream';
      
      if (ext === 'csv') {
        contentType = 'text/csv';
      } else if (ext === 'pdf') {
        contentType = 'application/pdf';
      }
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', fileInfo.size);
      
      // Stream the file
      const fileData = await fs.readFile(fileInfo.filepath);
      res.send(fileData);
      
    } catch (error) {
      console.error('Error downloading file:', error);
      if (error.message === 'File not found') {
        res.status(404).json({ message: 'File not found or expired' });
      } else {
        res.status(500).json({ message: 'Failed to download file' });
      }
    }
  }
);

// Get list of available exports
router.get('/list', 
  authenticateToken, 
  checkOwnerAccess,
  async (req, res) => {
    try {
      // This would need to be implemented in exportService
      // For now, return empty list
      res.json({
        exports: [],
        message: 'Export history not implemented yet'
      });
    } catch (error) {
      console.error('Error fetching export list:', error);
      res.status(500).json({ message: 'Failed to fetch export list' });
    }
  }
);

// Get export templates/formats
router.get('/templates', authenticateToken, async (req, res) => {
  try {
    const templates = {
      csv: {
        bookings: {
          name: 'Bookings Export',
          description: 'Export all booking data with customer and service details',
          fields: [
            'date', 'time', 'customer', 'email', 'phone', 'service', 
            'duration', 'amount', 'status', 'paymentStatus', 'notes', 'rating'
          ]
        },
        customers: {
          name: 'Customers Export',
          description: 'Export customer data with booking statistics',
          fields: [
            'name', 'email', 'phone', 'address', 'totalBookings', 
            'totalSpent', 'avgRating', 'lastBooking', 'notes'
          ]
        },
        revenue: {
          name: 'Revenue Export',
          description: 'Export daily revenue and booking statistics',
          fields: [
            'date', 'revenue', 'bookings', 'averageBookingValue'
          ]
        }
      },
      pdf: {
        comprehensive: {
          name: 'Comprehensive Report',
          description: 'Complete business report with all metrics and analytics',
          sections: [
            'Summary Statistics', 'Recent Bookings', 'Top Services', 
            'Monthly Revenue Trend', 'Customer Analytics'
          ]
        },
        summary: {
          name: 'Summary Report',
          description: 'Quick overview of key business metrics',
          sections: [
            'Summary Statistics', 'Key Performance Indicators'
          ]
        },
        detailed: {
          name: 'Detailed Report',
          description: 'In-depth analysis with charts and recommendations',
          sections: [
            'Executive Summary', 'Detailed Analytics', 'Trends Analysis', 
            'Business Recommendations', 'Performance Metrics'
          ]
        }
      }
    };
    
    res.json(templates);
  } catch (error) {
    console.error('Error fetching export templates:', error);
    res.status(500).json({ message: 'Failed to fetch export templates' });
  }
});

// Clean up old exports (admin only)
router.post('/cleanup', 
  authenticateToken, 
  checkOwnerAccess,
  async (req, res) => {
    try {
      const { maxAgeHours = 24 } = req.body;
      
      await exportService.cleanupOldExports(maxAgeHours);
      
      res.json({
        message: `Cleaned up exports older than ${maxAgeHours} hours`
      });
    } catch (error) {
      console.error('Error cleaning up exports:', error);
      res.status(500).json({ message: 'Failed to cleanup old exports' });
    }
  }
);

// Get export analytics (for business plan users)
router.get('/analytics', 
  authenticateToken, 
  checkOwnerAccess,
  checkFeatureAccess('advanced_analytics'),
  async (req, res) => {
    try {
      // This would track export usage, popular formats, etc.
      const analytics = {
        totalExports: 0,
        popularFormats: {
          csv: 0,
          pdf: 0
        },
        exportsByType: {
          bookings: 0,
          customers: 0,
          revenue: 0,
          reports: 0
        },
        lastExport: null
      };
      
      res.json(analytics);
    } catch (error) {
      console.error('Error fetching export analytics:', error);
      res.status(500).json({ message: 'Failed to fetch export analytics' });
    }
  }
);

export default router;