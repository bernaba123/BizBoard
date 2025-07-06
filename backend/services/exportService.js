import createCsvWriter from 'csv-writer';
import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Booking from '../models/Booking.js';
import Customer from '../models/Customer.js';
import Service from '../models/Service.js';
import Subscription from '../models/Subscription.js';

class ExportService {
  constructor() {
    this.exportDir = path.join(process.cwd(), 'exports');
    this.ensureExportDirectory();
  }

  async ensureExportDirectory() {
    try {
      await fs.access(this.exportDir);
    } catch (error) {
      await fs.mkdir(this.exportDir, { recursive: true });
    }
  }

  // Export bookings to CSV
  async exportBookingsCSV(userId, filters = {}) {
    try {
      const user = await User.findById(userId);
      if (!user) throw new Error('User not found');

      // Build query
      const query = { userId };
      if (filters.startDate && filters.endDate) {
        query.date = {
          $gte: new Date(filters.startDate),
          $lte: new Date(filters.endDate)
        };
      }
      if (filters.status) {
        query.status = filters.status;
      }
      if (filters.paymentStatus) {
        query.paymentStatus = filters.paymentStatus;
      }

      const bookings = await Booking.find(query)
        .populate('customerId', 'name email phone')
        .populate('serviceId', 'name price')
        .sort({ date: -1 });

      const filename = `bookings_${user.businessName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
      const filepath = path.join(this.exportDir, filename);

      const csvWriter = createCsvWriter({
        path: filepath,
        header: [
          { id: 'date', title: 'Date' },
          { id: 'time', title: 'Time' },
          { id: 'customer', title: 'Customer' },
          { id: 'email', title: 'Email' },
          { id: 'phone', title: 'Phone' },
          { id: 'service', title: 'Service' },
          { id: 'duration', title: 'Duration (min)' },
          { id: 'amount', title: 'Amount' },
          { id: 'status', title: 'Status' },
          { id: 'paymentStatus', title: 'Payment Status' },
          { id: 'paymentMethod', title: 'Payment Method' },
          { id: 'notes', title: 'Notes' },
          { id: 'rating', title: 'Rating' },
          { id: 'createdAt', title: 'Created At' }
        ]
      });

      const records = bookings.map(booking => ({
        date: new Date(booking.date).toLocaleDateString(),
        time: booking.time,
        customer: booking.customerId?.name || 'N/A',
        email: booking.customerId?.email || 'N/A',
        phone: booking.customerId?.phone || 'N/A',
        service: booking.serviceId?.name || 'N/A',
        duration: booking.duration,
        amount: booking.totalAmount,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        paymentMethod: booking.paymentMethod,
        notes: booking.notes || '',
        rating: booking.rating || '',
        createdAt: booking.createdAt.toLocaleDateString()
      }));

      await csvWriter.writeRecords(records);

      return {
        filename,
        filepath,
        recordCount: records.length
      };

    } catch (error) {
      console.error('Error exporting bookings CSV:', error);
      throw new Error('Failed to export bookings');
    }
  }

  // Export customers to CSV
  async exportCustomersCSV(userId, filters = {}) {
    try {
      const user = await User.findById(userId);
      if (!user) throw new Error('User not found');

      const query = { userId };
      if (filters.startDate && filters.endDate) {
        query.createdAt = {
          $gte: new Date(filters.startDate),
          $lte: new Date(filters.endDate)
        };
      }

      const customers = await Customer.find(query).sort({ createdAt: -1 });

      // Get booking stats for each customer
      const customersWithStats = await Promise.all(
        customers.map(async (customer) => {
          const bookingStats = await Booking.aggregate([
            { $match: { customerId: customer._id } },
            {
              $group: {
                _id: null,
                totalBookings: { $sum: 1 },
                totalSpent: { $sum: '$totalAmount' },
                lastBooking: { $max: '$date' },
                avgRating: { $avg: '$rating' }
              }
            }
          ]);

          const stats = bookingStats[0] || {
            totalBookings: 0,
            totalSpent: 0,
            lastBooking: null,
            avgRating: null
          };

          return {
            ...customer.toObject(),
            ...stats
          };
        })
      );

      const filename = `customers_${user.businessName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
      const filepath = path.join(this.exportDir, filename);

      const csvWriter = createCsvWriter({
        path: filepath,
        header: [
          { id: 'name', title: 'Name' },
          { id: 'email', title: 'Email' },
          { id: 'phone', title: 'Phone' },
          { id: 'address', title: 'Address' },
          { id: 'totalBookings', title: 'Total Bookings' },
          { id: 'totalSpent', title: 'Total Spent' },
          { id: 'avgRating', title: 'Average Rating' },
          { id: 'lastBooking', title: 'Last Booking' },
          { id: 'notes', title: 'Notes' },
          { id: 'createdAt', title: 'Created At' }
        ]
      });

      const records = customersWithStats.map(customer => ({
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address || '',
        totalBookings: customer.totalBookings,
        totalSpent: customer.totalSpent.toFixed(2),
        avgRating: customer.avgRating ? customer.avgRating.toFixed(1) : '',
        lastBooking: customer.lastBooking ? new Date(customer.lastBooking).toLocaleDateString() : '',
        notes: customer.notes || '',
        createdAt: customer.createdAt.toLocaleDateString()
      }));

      await csvWriter.writeRecords(records);

      return {
        filename,
        filepath,
        recordCount: records.length
      };

    } catch (error) {
      console.error('Error exporting customers CSV:', error);
      throw new Error('Failed to export customers');
    }
  }

  // Export revenue report to CSV
  async exportRevenueCSV(userId, filters = {}) {
    try {
      const user = await User.findById(userId);
      if (!user) throw new Error('User not found');

      const startDate = filters.startDate ? new Date(filters.startDate) : new Date(new Date().getFullYear(), 0, 1);
      const endDate = filters.endDate ? new Date(filters.endDate) : new Date();

      const revenueData = await Booking.aggregate([
        {
          $match: {
            userId: user._id,
            date: { $gte: startDate, $lte: endDate },
            paymentStatus: 'paid'
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$date' },
              month: { $month: '$date' },
              day: { $dayOfMonth: '$date' }
            },
            dailyRevenue: { $sum: '$totalAmount' },
            bookingCount: { $sum: 1 }
          }
        },
        {
          $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
        }
      ]);

      const filename = `revenue_${user.businessName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
      const filepath = path.join(this.exportDir, filename);

      const csvWriter = createCsvWriter({
        path: filepath,
        header: [
          { id: 'date', title: 'Date' },
          { id: 'revenue', title: 'Revenue' },
          { id: 'bookings', title: 'Bookings' },
          { id: 'averageBookingValue', title: 'Average Booking Value' }
        ]
      });

      const records = revenueData.map(item => ({
        date: `${item._id.year}-${item._id.month.toString().padStart(2, '0')}-${item._id.day.toString().padStart(2, '0')}`,
        revenue: item.dailyRevenue.toFixed(2),
        bookings: item.bookingCount,
        averageBookingValue: (item.dailyRevenue / item.bookingCount).toFixed(2)
      }));

      await csvWriter.writeRecords(records);

      return {
        filename,
        filepath,
        recordCount: records.length,
        totalRevenue: revenueData.reduce((sum, item) => sum + item.dailyRevenue, 0),
        totalBookings: revenueData.reduce((sum, item) => sum + item.bookingCount, 0)
      };

    } catch (error) {
      console.error('Error exporting revenue CSV:', error);
      throw new Error('Failed to export revenue data');
    }
  }

  // Generate comprehensive PDF report
  async generatePDFReport(userId, reportType = 'comprehensive', filters = {}) {
    try {
      const user = await User.findById(userId);
      if (!user) throw new Error('User not found');

      const reportData = await this.generateReportData(userId, filters);
      const html = await this.generateReportHTML(user, reportData, reportType);

      const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });

      const filename = `${reportType}_report_${user.businessName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      const filepath = path.join(this.exportDir, filename);

      await page.pdf({
        path: filepath,
        format: 'A4',
        printBackground: true,
        margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' }
      });

      await browser.close();

      return {
        filename,
        filepath,
        reportType
      };

    } catch (error) {
      console.error('Error generating PDF report:', error);
      throw new Error('Failed to generate PDF report');
    }
  }

  // Generate report data
  async generateReportData(userId, filters = {}) {
    const startDate = filters.startDate ? new Date(filters.startDate) : new Date(new Date().getFullYear(), 0, 1);
    const endDate = filters.endDate ? new Date(filters.endDate) : new Date();

    // Summary statistics
    const totalBookings = await Booking.countDocuments({
      userId,
      date: { $gte: startDate, $lte: endDate }
    });

    const totalRevenue = await Booking.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          date: { $gte: startDate, $lte: endDate },
          paymentStatus: 'paid'
        }
      },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);

    const totalCustomers = await Customer.countDocuments({ userId });

    // Recent bookings
    const recentBookings = await Booking.find({
      userId,
      date: { $gte: startDate, $lte: endDate }
    })
      .populate('customerId', 'name email')
      .populate('serviceId', 'name')
      .sort({ date: -1 })
      .limit(10);

    // Top services
    const topServices = await Booking.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$serviceId',
          count: { $sum: 1 },
          revenue: { $sum: '$totalAmount' }
        }
      },
      {
        $lookup: {
          from: 'services',
          localField: '_id',
          foreignField: '_id',
          as: 'service'
        }
      },
      { $unwind: '$service' },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    // Monthly revenue trend
    const monthlyRevenue = await Booking.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          date: { $gte: startDate, $lte: endDate },
          paymentStatus: 'paid'
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' }
          },
          revenue: { $sum: '$totalAmount' },
          bookings: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    return {
      summary: {
        totalBookings,
        totalRevenue: totalRevenue[0]?.total || 0,
        totalCustomers,
        averageBookingValue: totalBookings > 0 ? (totalRevenue[0]?.total || 0) / totalBookings : 0
      },
      recentBookings,
      topServices,
      monthlyRevenue,
      reportPeriod: {
        startDate: startDate.toLocaleDateString(),
        endDate: endDate.toLocaleDateString()
      }
    };
  }

  // Generate HTML for PDF report
  async generateReportHTML(user, data, reportType) {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report - ${user.businessName}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; color: #333; }
            .header { text-align: center; border-bottom: 3px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px; }
            .header h1 { color: #2563eb; margin: 0; }
            .header p { color: #666; margin: 5px 0; }
            .summary { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 30px; }
            .summary-card { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; }
            .summary-card h3 { margin: 0; color: #2563eb; font-size: 24px; }
            .summary-card p { margin: 5px 0 0 0; color: #666; }
            .section { margin-bottom: 30px; }
            .section h2 { color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
            th { background: #f8f9fa; font-weight: 600; color: #374151; }
            tr:hover { background: #f9fafb; }
            .status { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; }
            .status.completed { background: #d1fae5; color: #065f46; }
            .status.confirmed { background: #dbeafe; color: #1e40af; }
            .status.pending { background: #fef3c7; color: #92400e; }
            .status.cancelled { background: #fee2e2; color: #991b1b; }
            .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${user.businessName}</h1>
            <p>${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Business Report</p>
            <p>Period: ${data.reportPeriod.startDate} - ${data.reportPeriod.endDate}</p>
            <p>Generated on: ${new Date().toLocaleDateString()}</p>
          </div>

          <div class="summary">
            <div class="summary-card">
              <h3>${data.summary.totalBookings}</h3>
              <p>Total Bookings</p>
            </div>
            <div class="summary-card">
              <h3>$${data.summary.totalRevenue.toFixed(2)}</h3>
              <p>Total Revenue</p>
            </div>
            <div class="summary-card">
              <h3>${data.summary.totalCustomers}</h3>
              <p>Total Customers</p>
            </div>
            <div class="summary-card">
              <h3>$${data.summary.averageBookingValue.toFixed(2)}</h3>
              <p>Avg. Booking Value</p>
            </div>
          </div>

          <div class="section">
            <h2>Recent Bookings</h2>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Customer</th>
                  <th>Service</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${data.recentBookings.map(booking => `
                  <tr>
                    <td>${new Date(booking.date).toLocaleDateString()}</td>
                    <td>${booking.time}</td>
                    <td>${booking.customerId?.name || 'N/A'}</td>
                    <td>${booking.serviceId?.name || 'N/A'}</td>
                    <td>$${booking.totalAmount.toFixed(2)}</td>
                    <td><span class="status ${booking.status}">${booking.status}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <div class="section">
            <h2>Top Services</h2>
            <table>
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Bookings</th>
                  <th>Revenue</th>
                  <th>Avg. Value</th>
                </tr>
              </thead>
              <tbody>
                ${data.topServices.map(service => `
                  <tr>
                    <td>${service.service.name}</td>
                    <td>${service.count}</td>
                    <td>$${service.revenue.toFixed(2)}</td>
                    <td>$${(service.revenue / service.count).toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <div class="section">
            <h2>Monthly Revenue Trend</h2>
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Revenue</th>
                  <th>Bookings</th>
                  <th>Avg. Value</th>
                </tr>
              </thead>
              <tbody>
                ${data.monthlyRevenue.map(month => {
                  const monthName = new Date(month._id.year, month._id.month - 1).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
                  return `
                    <tr>
                      <td>${monthName}</td>
                      <td>$${month.revenue.toFixed(2)}</td>
                      <td>${month.bookings}</td>
                      <td>$${(month.revenue / month.bookings).toFixed(2)}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>

          <div class="footer">
            <p>Generated by BizBoard - Business Management Platform</p>
            <p>This report contains confidential business information</p>
          </div>
        </body>
      </html>
    `;
  }

  // Clean up old export files
  async cleanupOldExports(maxAgeHours = 24) {
    try {
      const files = await fs.readdir(this.exportDir);
      const now = Date.now();
      const maxAge = maxAgeHours * 60 * 60 * 1000;

      for (const file of files) {
        const filepath = path.join(this.exportDir, file);
        const stats = await fs.stat(filepath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          await fs.unlink(filepath);
          console.log(`Cleaned up old export file: ${file}`);
        }
      }
    } catch (error) {
      console.error('Error cleaning up export files:', error);
    }
  }

  // Get file download info
  async getFileInfo(filename) {
    const filepath = path.join(this.exportDir, filename);
    
    try {
      const stats = await fs.stat(filepath);
      return {
        filename,
        filepath,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime
      };
    } catch (error) {
      throw new Error('File not found');
    }
  }
}

export default new ExportService();