// Every route of the single-organisation admin panel API. Roles are enforced here, on the server:
//   ANY_ROLE    = super_admin, admin, reception
//   STAFF       = super_admin, admin
//   SUPER_ADMIN = super_admin
import { Router } from 'express';
import multer from 'multer';
import { adminLogin } from '../controllers/authController.js';
import {
  approveVisit,
  blockHost,
  createHost,
  createVisit,
  deleteHost,
  exportReport,
  getDashboardStats,
  getReportsSummary,
  getSettings,
  getVisitor,
  listAudit,
  listHosts,
  listPasses,
  listTodayVisits,
  listVisitors,
  listVisits,
  rejectVisit,
  revokePass,
  unblockHost,
  updateHost,
  updateSettings,
} from '../controllers/adminController.js';
import { getConversation, listConversations } from '../controllers/conversationController.js';
import {
  createKnowledge,
  deleteKnowledge,
  importWebsite,
  listKnowledge,
  saveTraining,
  updateKnowledge,
  uploadKnowledge,
} from '../controllers/knowledgeController.js';
import { changeOwnPassword, me } from '../controllers/passwordController.js';
import { lookupPassEndpoint, publicPassEndpoint, validatePassEndpoint } from '../controllers/passController.js';
import {
  blockAdmin,
  changeAdminRole,
  createAdmin,
  deleteAdmin,
  listAdmins,
  resetAdminPassword,
  unblockAdmin,
} from '../controllers/subAdminController.js';
import { whatsappConnect, whatsappDisconnect, whatsappStatus } from '../controllers/whatsappController.js';
import { ANY_ROLE, STAFF, SUPER_ADMIN, loginRateLimit, rateLimit, requireAuth } from '../middleware/auth.js';

const knowledgeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

const anyRole = requireAuth(ANY_ROLE);
const staff = requireAuth(STAFF);
const superAdmin = requireAuth(SUPER_ADMIN);

export const router = Router();

// Public
router.get('/health', (req, res) => res.json({ ok: true, service: 'whatsapp-vms' }));
router.post('/auth/admin/login', loginRateLimit(), adminLogin);
// The visitor's pass page: only by the full token in the QR link.
router.get('/passes/info/:token', rateLimit({ max: 40 }), publicPassEndpoint);

// Every signed-in role
router.get('/auth/me', anyRole, me);
router.post('/auth/admin/password', anyRole, rateLimit({ max: 10 }), changeOwnPassword);
router.post('/passes/validate', anyRole, rateLimit({ max: 60 }), validatePassEndpoint);
router.get('/passes/info', anyRole, rateLimit({ max: 120 }), lookupPassEndpoint);
router.get('/visits/today', anyRole, listTodayVisits);

// Daily operations: super_admin and admin
router.get('/dashboard/stats', staff, getDashboardStats);
router.get('/visitors', staff, listVisitors);
router.get('/visitors/:id', staff, getVisitor);
router.get('/visits', staff, listVisits);
router.post('/visits', staff, createVisit);
router.patch('/visits/:id/approve', staff, approveVisit);
router.patch('/visits/:id/reject', staff, rejectVisit);
router.get('/passes', staff, listPasses);
router.post('/passes/:id/revoke', staff, revokePass);
router.get('/conversations', staff, listConversations);
router.get('/conversations/:phoneNumber', staff, getConversation);
router.get('/hosts', staff, listHosts);
router.post('/hosts', staff, createHost);
router.patch('/hosts/:id/block', staff, blockHost);
router.patch('/hosts/:id/unblock', staff, unblockHost);
router.patch('/hosts/:id', staff, updateHost);
router.delete('/hosts/:id', staff, deleteHost);
router.get('/knowledge', staff, listKnowledge);
router.put('/knowledge/training', staff, saveTraining);
router.post('/knowledge/upload', staff, knowledgeUpload.single('file'), uploadKnowledge);
router.post('/knowledge/website', staff, importWebsite);
router.post('/knowledge', staff, createKnowledge);
router.patch('/knowledge/:id', staff, updateKnowledge);
router.delete('/knowledge/:id', staff, deleteKnowledge);
router.get('/reports/summary', staff, getReportsSummary);
router.get('/reports/export', staff, exportReport);
router.get('/audit', staff, listAudit);
router.get('/settings', staff, getSettings);

// super_admin only: settings, the company WhatsApp number, sub-admins
router.put('/settings', superAdmin, updateSettings);
router.get('/settings/whatsapp', superAdmin, whatsappStatus);
router.post('/settings/whatsapp/connect', superAdmin, whatsappConnect);
router.post('/settings/whatsapp/disconnect', superAdmin, whatsappDisconnect);
router.get('/admins', superAdmin, listAdmins);
router.post('/admins', superAdmin, createAdmin);
router.patch('/admins/:id/role', superAdmin, changeAdminRole);
router.patch('/admins/:id/block', superAdmin, blockAdmin);
router.patch('/admins/:id/unblock', superAdmin, unblockAdmin);
router.delete('/admins/:id', superAdmin, deleteAdmin);
router.post('/admins/:id/password', superAdmin, resetAdminPassword);
