import { Hono } from 'hono';
import { cors } from 'hono/cors';
import authRoutes from './routes/auth';
import bookingRoutes from './routes/bookings';
import roomRoutes from './routes/rooms';
import queueRoutes from './routes/queues';
import maintenanceRoutes from './routes/maintenance';
import passwordResetRoutes from './routes/password-reset';
import holidayRoutes from './routes/holidays';
import adminUserRoutes from './routes/admin/users';
import adminBookingRoutes from './routes/admin/bookings';
import adminHolidayRoutes from './routes/admin/holidays';
import adminReportRoutes from './routes/admin/reports';
import adminPasswordRequestsRoutes from './routes/admin/password-requests';

const app = new Hono();

// Middleware
app.use('*', cors({
  origin: '*',
  credentials: true,
}));

// API Routes
app.route('/api/auth', authRoutes);
app.route('/api/rooms', roomRoutes);
app.route('/api/bookings', bookingRoutes);
app.route('/api/queues', queueRoutes);
app.route('/api/maintenance', maintenanceRoutes);
app.route('/api/forgot-password', passwordResetRoutes);
app.route('/api/holidays', holidayRoutes);
app.route('/api/admin/users', adminUserRoutes);
app.route('/api/admin/bookings', adminBookingRoutes);
app.route('/api/admin/holidays', adminHolidayRoutes);
app.route('/api/admin/reports', adminReportRoutes);
app.route('/api/admin/password-requests', adminPasswordRequestsRoutes);

// Fallback - SPA-style redirect
app.get('*', async (c) => {
  return c.redirect('/login.html');
});

// Netlify Functions handler
export default async (req, context) => {
  return app.fetch(req);
};
