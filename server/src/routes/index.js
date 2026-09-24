import { Router } from 'express';
import { adminLogin, clientLogin } from '../controllers/authController.js';
import {
  approveVisit,
  blockAccount,
  blockHost,
  createAccount,
  createHost,
  createPublicVisit,
  createVisit,
  deleteAccount,
  deleteHost,
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
  unblockAccount,
  unblockHost,
  updateHost,
  updateSettings,
} from '../controllers/adminController.js';
import {
  getConversation,
  listConversations,
  listHostConversations,
} from '../controllers/conversationController.js';
import { hostAgentChat } from '../controllers/agentController.js';
import {
  createKnowledge,
  deleteKnowledge,
  listKnowledge,
  saveTraining,
  updateKnowledge,
} from '../controllers/knowledgeController.js';
import {
  hostWhatsAppConnect,
  hostWhatsAppDisconnect,
  hostWhatsAppStatus,
} from '../controllers/hostWhatsAppController.js';
import {
  createCompanyHost,
  deleteCompanyHost,
  hostApprove,
  hostDashboard,
  hostHistory,
  hostNotifications,
  hostPasses,
  hostProfile,
  hostReject,
  hostVisits,
  listCompanyHosts,
  updateCompanyHost,
} from '../controllers/hostController.js';
import { rateLimit, requireAuth } from '../middleware/auth.js';
import { lookupPassEndpoint, validatePassEndpoint } from '../controllers/passController.js';
import { whatsappQr, whatsappStatus } from '../controllers/whatsappController.js';

export const router = Router();

router.get('/health', (req, res) => res.json({ ok: true, service: 'whatsapp-vms' }));

router.get('/whatsapp/status', whatsappStatus);
router.get('/whatsapp/qr', whatsappQr);

router.post('/auth/admin/login', adminLogin);
router.post('/auth/client/login', clientLogin);
router.post('/visits/public', rateLimit({ max: 30 }), createPublicVisit);
router.post('/passes/validate', rateLimit({ max: 20 }), validatePassEndpoint);
router.get('/passes/info', rateLimit({ max: 40 }), lookupPassEndpoint);
router.get('/passes/info/:token', rateLimit({ max: 40 }), lookupPassEndpoint);

router.get('/dashboard/stats', requireAuth('admin'), getDashboardStats);
router.get('/visitors', requireAuth('admin'), listVisitors);
router.get('/visitors/:id', requireAuth('admin'), getVisitor);
router.get('/visits', requireAuth('admin'), listVisits);
router.post('/visits', requireAuth('admin'), createVisit);
router.patch('/visits/:id/approve', requireAuth('admin', 'host'), approveVisit);
router.patch('/visits/:id/reject', requireAuth('admin', 'host'), rejectVisit);
router.get('/passes', requireAuth('admin'), listPasses);
router.post('/passes/:id/revoke', requireAuth('admin'), revokePass);
router.get('/conversations', requireAuth('admin'), listConversations);
router.get('/conversations/:phoneNumber', requireAuth('admin', 'host'), getConversation);
router.get('/hosts', requireAuth('admin'), listHosts);
router.post('/hosts', requireAuth('admin'), createHost);
router.patch('/hosts/:id/block', requireAuth('admin'), blockHost);
router.patch('/hosts/:id/unblock', requireAuth('admin'), unblockHost);
router.patch('/hosts/:id', requireAuth('admin'), updateHost);
router.delete('/hosts/:id', requireAuth('admin'), deleteHost);
router.get('/accounts', requireAuth('admin'), listAccounts);
router.post('/accounts', requireAuth('admin'), createAccount);
router.patch('/accounts/:id/toggle', requireAuth('admin'), toggleAccount);
router.patch('/accounts/:id/block', requireAuth('admin'), blockAccount);
router.patch('/accounts/:id/unblock', requireAuth('admin'), unblockAccount);
router.delete('/accounts/:id', requireAuth('admin'), deleteAccount);
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
router.get('/host/staff', requireAuth('host'), listCompanyHosts);
router.post('/host/staff', requireAuth('host'), createCompanyHost);
router.patch('/host/staff/:id', requireAuth('host'), updateCompanyHost);
router.delete('/host/staff/:id', requireAuth('host'), deleteCompanyHost);
router.get('/host/conversations', requireAuth('host'), listHostConversations);
router.post('/host/agent', requireAuth('host'), rateLimit({ max: 40 }), hostAgentChat);
router.get('/host/whatsapp/status', requireAuth('host'), hostWhatsAppStatus);
router.post('/host/whatsapp/connect', requireAuth('host'), hostWhatsAppConnect);
router.post('/host/whatsapp/disconnect', requireAuth('host'), hostWhatsAppDisconnect);
router.get('/host/knowledge', requireAuth('host'), listKnowledge);
router.put('/host/knowledge/training', requireAuth('host'), saveTraining);
router.post('/host/knowledge', requireAuth('host'), createKnowledge);
router.patch('/host/knowledge/:id', requireAuth('host'), updateKnowledge);
router.delete('/host/knowledge/:id', requireAuth('host'), deleteKnowledge);
