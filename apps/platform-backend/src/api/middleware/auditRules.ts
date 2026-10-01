import type { Request } from "express";
import { changedFields, type AuditRule } from "./auditRequests";

// Which changes the audit log records, per router (phase-2-3-handover §2.9).
// Details are listed facts; request bodies carry passwords and secret values.

const bodyField = (req: Request, field: string): unknown => (req.body && typeof req.body === "object" ? req.body[field] : undefined);

export const SECRET_AUDIT: AuditRule[] = [
  { method: "POST", path: "/", action: "secret.created", targetType: "secret", details: (req) => ({ name: bodyField(req, "name") }) },
  { method: "PUT", path: "/:id", action: "secret.updated", targetType: "secret", targetParam: "id", details: changedFields },
  { method: "DELETE", path: "/:id", action: "secret.deleted", targetType: "secret", targetParam: "id" },
];

export const RUNNER_AUDIT: AuditRule[] = [
  { method: "POST", path: "/", action: "runner.created", targetType: "runner", details: (req) => ({ name: bodyField(req, "name") }) },
  { method: "PUT", path: "/:id", action: "runner.updated", targetType: "runner", targetParam: "id", details: changedFields },
  { method: "DELETE", path: "/:id", action: "runner.deleted", targetType: "runner", targetParam: "id" },
  { method: "POST", path: "/:id/start", action: "runner.started", targetType: "runner", targetParam: "id" },
  { method: "POST", path: "/:id/deactivate", action: "runner.stopped", targetType: "runner", targetParam: "id" },
  { method: "POST", path: "/:id/stop", action: "runner.stopped", targetType: "runner", targetParam: "id" },
  { method: "DELETE", path: "/:id/config-files/:fileType", action: "runner.updated", targetType: "runner", targetParam: "id", details: (req) => ({ removedFile: req.params.fileType }) },
];

const webhook = (direction: "inbound" | "outbound") => (): Record<string, unknown> => ({ direction });

export const CONNECTION_AUDIT: AuditRule[] = [
  { method: "POST", path: "/", action: "connection.created", targetType: "connection", details: (req) => ({ system: bodyField(req, "system") }) },
  { method: "PUT", path: "/:id", action: "connection.updated", targetType: "connection", targetParam: "id", details: changedFields },
  { method: "DELETE", path: "/:id", action: "connection.deleted", targetType: "connection", targetParam: "id" },
  { method: "POST", path: "/:id/credentials", action: "connection.credential_added", targetType: "connection", targetParam: "id", details: (req) => ({ name: bodyField(req, "name") }) },
  { method: "PUT", path: "/:id/credentials/:credentialId", action: "connection.credential_updated", targetType: "connection", targetParam: "id", details: changedFields },
  { method: "DELETE", path: "/:id/credentials/:credentialId", action: "connection.credential_removed", targetType: "connection", targetParam: "id" },
  { method: "POST", path: "/:id/webhooks/inbound", action: "connection.webhook_changed", targetType: "connection", targetParam: "id", details: webhook("inbound") },
  { method: "PUT", path: "/:id/webhooks/inbound/:configId", action: "connection.webhook_changed", targetType: "connection", targetParam: "id", details: webhook("inbound") },
  { method: "DELETE", path: "/:id/webhooks/inbound/:configId", action: "connection.webhook_changed", targetType: "connection", targetParam: "id", details: webhook("inbound") },
  { method: "POST", path: "/:id/webhooks/outbound", action: "connection.webhook_changed", targetType: "connection", targetParam: "id", details: webhook("outbound") },
  { method: "PUT", path: "/:id/webhooks/outbound/:configId", action: "connection.webhook_changed", targetType: "connection", targetParam: "id", details: webhook("outbound") },
  { method: "DELETE", path: "/:id/webhooks/outbound/:configId", action: "connection.webhook_changed", targetType: "connection", targetParam: "id", details: webhook("outbound") },
  { method: "POST", path: "/space/:projectId/link", action: "connection.linked", targetType: "connection", details: (req) => ({ spaceId: req.params.projectId, connectionId: bodyField(req, "integrationId") }) },
  { method: "DELETE", path: "/space/:projectId/link/:integrationId", action: "connection.unlinked", targetType: "connection", targetParam: "integrationId", details: (req) => ({ spaceId: req.params.projectId }) },
  { method: "PUT", path: "/space/:projectId/primary/:integrationId", action: "connection.made_primary", targetType: "connection", targetParam: "integrationId", details: (req) => ({ spaceId: req.params.projectId }) },
];

export const MEMBER_AUDIT: AuditRule[] = [
  { method: "POST", path: "/", action: "member.created", targetType: "member", details: (req) => ({ email: bodyField(req, "email"), role: bodyField(req, "role") }) },
  { method: "PATCH", path: "/:id/role", action: "member.role_changed", targetType: "member", targetParam: "id", details: (req) => ({ role: bodyField(req, "role") }) },
  { method: "POST", path: "/:id/deactivate", action: "member.deactivated", targetType: "member", targetParam: "id" },
  { method: "POST", path: "/:id/reactivate", action: "member.reactivated", targetType: "member", targetParam: "id" },
  { method: "POST", path: "/:id/reset-link", action: "member.reset_link_created", targetType: "member", targetParam: "id" },
];

export const INVITE_AUDIT: AuditRule[] = [
  {
    method: "POST",
    path: "/",
    action: "invite.created",
    targetType: "invite",
    details: (req) => ({ email: bodyField(req, "email"), role: bodyField(req, "role"), spaceIds: bodyField(req, "spaceIds") }),
  },
  { method: "DELETE", path: "/:id", action: "invite.revoked", targetType: "invite", targetParam: "id" },
];

export const SPACE_AUDIT: AuditRule[] = [
  { method: "PUT", path: "/:id", action: "space.updated", targetType: "space", targetParam: "id", details: changedFields },
  { method: "PUT", path: "/:projectId/scm-config", action: "space.updated", targetType: "space", targetParam: "projectId", details: () => ({ fields: ["repository"] }) },
  { method: "DELETE", path: "/:projectId/scm-config", action: "space.updated", targetType: "space", targetParam: "projectId", details: () => ({ fields: ["repository"] }) },
  { method: "DELETE", path: "/:id", action: "space.deleted", targetType: "space", targetParam: "id" },
  {
    method: "PUT",
    path: "/:id/members/:userId",
    action: "space.member_set",
    targetType: "space",
    targetParam: "id",
    details: (req) => ({ userId: req.params.userId, role: bodyField(req, "role") }),
  },
  { method: "DELETE", path: "/:id/members/:userId", action: "space.member_removed", targetType: "space", targetParam: "id", details: (req) => ({ userId: req.params.userId }) },
];
