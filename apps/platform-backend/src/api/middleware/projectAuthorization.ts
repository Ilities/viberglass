import { Request, Response, NextFunction } from "express";
import db from "../../persistence/config/database";

/**
 * Project Authorization Middleware
 *
 * Verifies that the authenticated user has access to the requested project.
 * This provides project-level isolation for multi-tenant deployments.
 *
 * Usage:
 *   router.get('/projects/:projectId', requireProjectAccess, handler);
 *
 * Requirements:
 *   - Must be used after authentication middleware (req.user must be set)
 *   - Project ID must be in req.params.projectId or req.body.project_id
 *
 * Security:
 *   - Prevents users from accessing projects they don't have access to
 *   - Critical for tenant isolation in hosted SaaS deployment
 */

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    tenant_id: string;
    role: string;
  };
  projectAccess?: {
    projectId: string;
    role: string;
  };
}

/**
 * Require that the user has access to the project
 *
 * Extracts project ID from params or body and verifies access
 */
export async function requireProjectAccess(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Ensure user is authenticated
    if (!req.user) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Authentication required",
      });
      return;
    }

    // Extract project ID from request
    const projectId =
      req.params.projectId ||
      req.params.project_id ||
      req.body.project_id ||
      req.query.project_id;

    if (!projectId) {
      res.status(400).json({
        error: "Bad Request",
        message: "Project ID is required",
      });
      return;
    }

    // Check if user has access to this project
    const userProject = await db
      .selectFrom("user_projects")
      .select(["project_id", "role"])
      .where("user_id", "=", req.user.id)
      .where("project_id", "=", projectId as string)
      .executeTakeFirst();

    if (!userProject) {
      res.status(403).json({
        error: "Forbidden",
        message: "You do not have access to this project",
      });
      return;
    }

    // Attach project access info to request for downstream handlers
    req.projectAccess = {
      projectId: projectId as string,
      role: userProject.role,
    };

    next();
  } catch (error) {
    console.error("Project authorization error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to verify project access",
    });
  }
}

/**
 * Require that the user has admin access to the project
 *
 * Use this for sensitive operations like project deletion, settings changes, etc.
 */
export async function requireProjectAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // First check basic project access
    await requireProjectAccess(req, res, () => {});

    // If previous middleware returned early, stop here
    if (res.headersSent) {
      return;
    }

    // Check if user has admin role on this project
    if (req.projectAccess?.role !== "admin") {
      res.status(403).json({
        error: "Forbidden",
        message: "Admin access required for this operation",
      });
      return;
    }

    next();
  } catch (error) {
    console.error("Project admin authorization error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to verify project admin access",
    });
  }
}

/**
 * Middleware for ticket routes that validates project access via ticket
 *
 * For routes like GET /tickets/:ticketId, we need to:
 * 1. Look up the ticket's project_id
 * 2. Verify the user has access to that project
 */
export async function requireTicketProjectAccess(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Ensure user is authenticated
    if (!req.user) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Authentication required",
      });
      return;
    }

    // Extract ticket ID from request
    const ticketId =
      req.params.ticketId || req.params.ticket_id || req.body.ticket_id;

    if (!ticketId) {
      res.status(400).json({
        error: "Bad Request",
        message: "Ticket ID is required",
      });
      return;
    }

    // Look up ticket's project
    const ticket = await db
      .selectFrom("tickets")
      .select("project_id")
      .where("id", "=", ticketId as string)
      .executeTakeFirst();

    if (!ticket) {
      res.status(404).json({
        error: "Not Found",
        message: "Ticket not found",
      });
      return;
    }

    // Check if user has access to the ticket's project
    const userProject = await db
      .selectFrom("user_projects")
      .select(["project_id", "role"])
      .where("user_id", "=", req.user.id)
      .where("project_id", "=", ticket.project_id)
      .executeTakeFirst();

    if (!userProject) {
      res.status(403).json({
        error: "Forbidden",
        message: "You do not have access to this ticket's project",
      });
      return;
    }

    // Attach project access info
    req.projectAccess = {
      projectId: ticket.project_id,
      role: userProject.role,
    };

    next();
  } catch (error) {
    console.error("Ticket project authorization error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to verify ticket project access",
    });
  }
}

/**
 * Helper function to check if a user has access to a project
 * (For use outside of middleware context)
 */
export async function userHasProjectAccess(
  userId: string,
  projectId: string,
): Promise<boolean> {
  const userProject = await db
    .selectFrom("user_projects")
    .select("id")
    .where("user_id", "=", userId)
    .where("project_id", "=", projectId)
    .executeTakeFirst();

  return !!userProject;
}

/**
 * Helper function to get all projects a user has access to
 */
export async function getUserProjects(
  userId: string,
): Promise<Array<{ project_id: string; role: string }>> {
  const userProjects = await db
    .selectFrom("user_projects")
    .select(["project_id", "role"])
    .where("user_id", "=", userId)
    .execute();

  return userProjects;
}
