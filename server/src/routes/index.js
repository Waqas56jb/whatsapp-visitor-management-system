// Every API route. Each names the permission it needs (config/permissions.js); company routes run
// inside the signed-in user's company, so they only ever see that company's data. Platform
// routes (/platform/*) are for platform staff and never return a company's daily operations.
import { Router } from 'express';
import multer from 'multer';
import { adminLogin, impersonate, me } from '../controllers/authController.js';
import { changeOwnPassword, updateOwnProfile } from '../controllers/passwordController.js';
import * as company from '../controllers/companyController.js';
import * as platform from '../controllers/platformController.js';
import { closeHandover, getConversation, listConversations, replyToConversation } from '../controllers/conversationController.js';
import { createKnowledge, deleteKnowledge, importWebsite, listKnowledge, saveTraining, updateKnowledge, uploadKnowledge } from '../controllers/knowledgeController.js';
import { lookupPassEndpoint, publicPassEndpoint, validatePassEndpoint } from '../controllers/passController.js';
import { whatsappConnect, whatsappDisconnect, whatsappStatus } from '../controllers/whatsappController.js';
import { can } from '../config/permissions.js';
import { loginRateLimit, rateLimit, requireAuth, requireFeature, requirePermission } from '../middleware/auth.js';
import { cachedPlatformConfig, platformConfig } from '../services/platformConfig.js';

const knowledgeUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

const auth = requireAuth();
const allow = (permission) => [auth, requirePermission(permission)];
// Any one of several permissions.
const allowAny = (...permissions) => [
  auth,
  (req, res, next) => (permissions.some((p) => can(req.user.role, p)) ? next() : res.status(403).json({ error: 'Forbidden' })),
];

export const router = Router();

// ---------------------------------------------------------------- public
router.get('/health', (req, res) => res.json({ ok: true, service: 'whatsapp-vms' }));
router.get('/public/config', async (req, res) => {
  const config = await platformConfig();
  res.json({ platformName: config.platformName, supportEmail: config.supportEmail });
});
router.post('/auth/admin/login', loginRateLimit(() => cachedPlatformConfig().loginAttemptsPer15Min || 10), adminLogin);
// The visitor's pass page: only by the full token in the QR link.
router.get('/passes/info/:token', rateLimit({ max: 40 }), publicPassEndpoint);

// ---------------------------------------------------------------- every signed-in user
router.get('/auth/me', ...allow('account.self'), me);
router.post('/auth/admin/password', ...allow('account.self'), rateLimit({ max: 10 }), changeOwnPassword);
router.patch('/auth/profile', ...allow('account.self'), updateOwnProfile);

// ---------------------------------------------------------------- platform console
router.get('/platform/overview', ...allow('platform.dashboard'), platform.overview);
router.get('/platform/plans', ...allow('platform.companies.view'), platform.listPlans);
router.get('/platform/companies', ...allow('platform.companies.view'), platform.listCompanies);
router.post('/platform/companies', ...allow('platform.companies.manage'), platform.createCompany);
router.get('/platform/companies/:id', ...allow('platform.companies.view'), platform.getCompany);
router.patch('/platform/companies/:id', ...allow('platform.companies.manage'), platform.updateCompany);
router.patch('/platform/companies/:id/subscription', ...allow('platform.plans.manage'), platform.updateSubscription);
router.post('/platform/companies/:id/status', ...allow('platform.companies.manage'), platform.setCompanyStatus);
router.delete('/platform/companies/:id', ...allow('platform.companies.manage'), platform.deleteCompany);
router.get('/platform/companies/:id/export', ...allow('platform.companies.manage'), platform.exportCompany);
router.post('/platform/companies/:id/admins', ...allow('platform.companies.manage'), platform.appointCompanyAdmin);
router.post('/platform/companies/:id/admins/:adminId/password', ...allow('platform.companies.manage'), platform.resetCompanyAdminPassword);
router.patch('/platform/companies/:id/admins/:adminId', ...allow('platform.companies.manage'), platform.setCompanyAdminStatus);
router.post('/platform/companies/:id/impersonate', ...allow('platform.impersonate'), rateLimit({ max: 30 }), impersonate);
router.get('/platform/metering', ...allow('platform.metering.view'), platform.metering);
router.get('/platform/health', ...allow('platform.health.view'), platform.health);
router.get('/platform/announcements', ...allow('platform.announcements.manage'), platform.listAnnouncements);
router.post('/platform/announcements', ...allow('platform.announcements.manage'), platform.createAnnouncement);
router.post('/platform/announcements/:id/end', ...allow('platform.announcements.manage'), platform.endAnnouncement);
router.get('/platform/settings', ...allow('platform.settings.manage'), platform.getPlatformSettings);
router.put('/platform/settings', ...allow('platform.settings.manage'), platform.updatePlatformSettings);
router.get('/platform/team', ...allow('platform.team.manage'), platform.listTeam);
router.post('/platform/team', ...allow('platform.team.manage'), platform.createTeamMember);
router.patch('/platform/team/:id/role', ...allow('platform.team.manage'), platform.changeTeamRole);
router.patch('/platform/team/:id/status', ...allow('platform.team.manage'), platform.setTeamStatus);
router.delete('/platform/team/:id', ...allow('platform.team.manage'), platform.deleteTeamMember);
router.post('/platform/team/:id/password', ...allow('platform.team.manage'), platform.resetTeamPassword);
router.get('/platform/audit', ...allow('platform.audit.view'), platform.platformAudit);

// ---------------------------------------------------------------- company console
router.get('/dashboard', ...allow('company.dashboard'), company.dashboard);
router.get('/visitors', ...allow('visitors.view'), company.listVisitors);
router.get('/visitors/:id', ...allow('visitors.view'), company.getVisitor);
router.get('/visits/today', ...allowAny('visits.view', 'gate.use'), company.listTodayVisits);
router.get('/visits', ...allow('visits.view'), company.listVisits);
router.post('/visits', ...allow('visits.create'), company.createVisit);
router.get('/visits/:id', ...allow('visits.view'), company.getVisit);
router.patch('/visits/:id/approve', ...allow('visits.decide'), company.approveVisit);
router.patch('/visits/:id/reject', ...allow('visits.decide'), company.rejectVisit);
router.patch('/visits/:id/flag', ...allow('visits.flag'), company.flagVisit);
router.post('/visits/:id/checkout', ...allow('gate.use'), company.checkOut);
router.get('/gate/traffic', ...allow('gate.use'), company.gateTraffic);
router.post('/passes/validate', ...allow('gate.use'), rateLimit({ max: 120 }), validatePassEndpoint);
router.get('/passes/info', ...allow('gate.use'), rateLimit({ max: 240 }), lookupPassEndpoint);
router.get('/passes', ...allow('passes.view'), company.listPasses);
router.post('/passes/:id/revoke', ...allow('passes.revoke'), company.revokePass);
router.get('/documents/:id', ...allowAny('visits.view', 'gate.use'), company.getDocument);

router.get('/conversations', ...allow('conversations.view'), listConversations);
router.get('/conversations/:phoneNumber', ...allow('conversations.view'), getConversation);
router.post('/conversations/:phoneNumber/reply', ...allow('conversations.reply'), rateLimit({ max: 120 }), replyToConversation);
router.post('/conversations/:phoneNumber/close', ...allow('conversations.reply'), closeHandover);

router.get('/hosts', ...allow('hosts.view'), company.listHosts);
router.post('/hosts', ...allow('hosts.manage'), company.createHost);
router.patch('/hosts/:id/block', ...allow('hosts.manage'), (req, res) => company.setHostStatus(req, res, 'blocked'));
router.patch('/hosts/:id/unblock', ...allow('hosts.manage'), (req, res) => company.setHostStatus(req, res, 'active'));
router.patch('/hosts/:id', ...allow('hosts.manage'), company.updateHost);
router.delete('/hosts/:id', ...allow('hosts.manage'), company.deleteHost);

router.get('/feedback', ...allow('feedback.view'), company.listFeedback);
router.patch('/feedback/:id', ...allow('feedback.manage'), company.updateFeedback);
router.get('/service-requests', ...allow('service.view'), company.listServiceRequests);
router.patch('/service-requests/:id', ...allow('service.manage'), company.updateServiceRequest);

router.get('/knowledge', ...allow('knowledge.manage'), listKnowledge);
router.put('/knowledge/training', ...allow('knowledge.manage'), saveTraining);
router.post('/knowledge/upload', ...allow('knowledge.manage'), knowledgeUpload.single('file'), uploadKnowledge);
router.post('/knowledge/website', ...allow('knowledge.manage'), importWebsite);
router.post('/knowledge', ...allow('knowledge.manage'), createKnowledge);
router.patch('/knowledge/:id', ...allow('knowledge.manage'), updateKnowledge);
router.delete('/knowledge/:id', ...allow('knowledge.manage'), deleteKnowledge);

router.get('/reports/summary', ...allow('reports.view'), company.reportSummary);
router.get('/reports/export', ...allow('reports.view'), company.exportReport);
router.get('/reports/pdf', ...allow('reports.view'), requireFeature('reports_pdf'), company.exportReportPdf);
router.get('/audit', ...allow('audit.view'), company.listAudit);

router.get('/staff', ...allow('staff.manage'), company.listStaff);
router.post('/staff', ...allow('staff.manage'), company.createStaff);
router.patch('/staff/:id', ...allow('staff.manage'), company.updateStaff);
router.delete('/staff/:id', ...allow('staff.manage'), company.deleteStaff);
router.post('/staff/:id/password', ...allow('staff.manage'), company.resetStaffPassword);

router.get('/plan', ...allow('settings.view'), company.planUsage);
router.get('/settings', ...allow('settings.view'), company.getSettings);
router.put('/settings', ...allow('settings.manage'), company.updateSettings);
router.put('/settings/branding', ...allow('settings.manage'), company.updateBranding);
router.post('/settings/slack/test', ...allow('settings.manage'), rateLimit({ max: 10 }), company.testSlackWebhook);
router.get('/settings/whatsapp', ...allow('whatsapp.manage'), whatsappStatus);
router.post('/settings/whatsapp/connect', ...allow('whatsapp.manage'), whatsappConnect);
router.post('/settings/whatsapp/disconnect', ...allow('whatsapp.manage'), whatsappDisconnect);
