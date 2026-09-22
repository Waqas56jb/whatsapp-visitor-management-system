import { Router } from 'express';
import { adminLogin, clientLogin } from '../controllers/authController.js';
import {
  approveVisit,
  createAccount,
  createHost,
  createPublicVisit,
  createVisit,
  exportReport,
  getDashboardStats,
  getSettings,
  getVisitor,
  listAccounts,
  listAudit,
  listHosts,
  listPasses,
  listVisitors,
  listVisits,
  rejectVisit,
  revokePass,
  getReportsSummary,
  toggleAccount,
  updateHost,
  updateSettings,
} from '../controllers/adminController.js';
import {
  hostApprove,
  hostDashboard,
  hostHistory,
  hostNotifications,
  hostPasses,
  hostProfile,
  hostReject,
  hostVisits,
} from '../controllers/hostController.js';
import { rateLimit, requireAuth } from '../middleware/auth.js';
import { verifyWebhook, receiveWebhook } from '../whatsapp/webhook.js';
import { validatePassEndpoint } from '../controllers/passController.js';

export const router = Router();

router.get('/health', (req, res) => res.json({ ok: true, service: 'whatsapp-vms' }));

router.get('/whatsapp/webhook', verifyWebhook);
router.post('/whatsapp/webhook', receiveWebhook);

router.post('/auth/admin/login', adminLogin);
router.post('/auth/client/login', clientLogin);
router.post('/visits/public', rateLimit({ max: 30 }), createPublicVisit);
router.post('/passes/validate', rateLimit({ max: 20 }), validatePassEndpoint);

router.get('/dashboard/stats', requireAuth('admin'), getDashboardStats);
router.get('/visitors', requireAuth('admin'), listVisitors);
router.get('/visitors/:id', requireAuth('admin'), getVisitor);
router.get('/visits', requireAuth('admin'), listVisits);
router.post('/visits', requireAuth('admin'), createVisit);
router.patch('/visits/:id/approve', requireAuth('admin', 'host'), approveVisit);
router.patch('/visits/:id/reject', requireAuth('admin', 'host'), rejectVisit);
router.get('/passes', requireAuth('admin'), listPasses);
router.post('/passes/:id/revoke', requireAuth('admin'), revokePass);
router.get('/hosts', requireAuth('admin'), listHosts);
router.post('/hosts', requireAuth('admin'), createHost);
router.patch('/hosts/:id', requireAuth('admin'), updateHost);
router.get('/accounts', requireAuth('admin'), listAccounts);
router.post('/accounts', requireAuth('admin'), createAccount);
router.patch('/accounts/:id/toggle', requireAuth('admin'), toggleAccount);
router.get('/reports/summary', requireAuth('admin'), getReportsSummary);
router.get('/reports/export', requireAuth('admin'), exportReport);
router.get('/audit', requireAuth('admin'), listAudit);
router.get('/settings', requireAuth('admin'), getSettings);
router.put('/settings', requireAuth('admin'), updateSettings);

router.get('/host/dashboard', requireAuth('host'), hostDashboard);
router.get('/host/visits', requireAuth('host'), hostVisits);
router.patch('/host/visits/:id/approve', requireAuth('host'), hostApprove);
router.patch('/host/visits/:id/reject', requireAuth('host'), hostReject);
router.get('/host/passes', requireAuth('host'), hostPasses);
router.get('/host/history', requireAuth('host'), hostHistory);
router.get('/host/notifications', requireAuth('host'), hostNotifications);
router.get('/host/profile', requireAuth('host'), hostProfile);
