import logger from "../../config/logger";
import { ClawTaskTemplateDAO } from "../../persistence/claw/ClawTaskTemplateDAO";
import { ProjectDAO } from "../../persistence/project/ProjectDAO";
import { ClankerDAO } from "../../persistence/clanker/ClankerDAO";
import type {
  ClawTaskTemplateSummary,
  CreateClawTaskTemplateRequest,
  UpdateClawTaskTemplateRequest,
} from "@viberglass/types";
import { ClawTaskTemplate } from "@viberglass/types";
import {
  ClawServiceError,
  CLAW_SERVICE_ERROR_CODE,
} from "../errors/ClawServiceError";

export class ClawTaskTemplateService {
  private templateDAO = new ClawTaskTemplateDAO();
  private projectDAO = new ProjectDAO();
  private clankerDAO = new ClankerDAO();

  async createTemplate(
    request: CreateClawTaskTemplateRequest,
  ): Promise<ClawTaskTemplate> {
    const project = await this.projectDAO.getProject(request.projectId);
    if (!project) {
      throw new ClawServiceError(
        CLAW_SERVICE_ERROR_CODE.PROJECT_NOT_FOUND,
        "Project not found",
      );
    }

    const clanker = await this.clankerDAO.getClanker(request.clankerId);
    if (!clanker) {
      throw new ClawServiceError(
        CLAW_SERVICE_ERROR_CODE.CLANKER_NOT_FOUND,
        "Clanker not found",
      );
    }

    const existingTemplate = await this.templateDAO.getTemplateByProjectAndName(
      request.projectId,
      request.name,
    );
    if (existingTemplate) {
      throw new ClawServiceError(
        CLAW_SERVICE_ERROR_CODE.INVALID_SCHEDULE_TYPE,
        "A template with this name already exists in this project",
      );
    }

    return this.templateDAO.createTemplate(request);
  }

  async getTemplate(id: string): Promise<ClawTaskTemplate> {
    const template = await this.templateDAO.getTemplate(id);
    if (!template) {
      throw new ClawServiceError(
        CLAW_SERVICE_ERROR_CODE.TEMPLATE_NOT_FOUND,
        "Task template not found",
      );
    }
    return template;
  }

  async listTemplates(
    limit = 50,
    offset = 0,
    projectId?: string,
  ): Promise<{ templates: ClawTaskTemplateSummary[]; total: number }> {
    if (projectId) {
      const project = await this.projectDAO.getProject(projectId);
      if (!project) {
        throw new ClawServiceError(
          CLAW_SERVICE_ERROR_CODE.PROJECT_NOT_FOUND,
          "Project not found",
        );
      }
    }

    const result = await this.templateDAO.getTemplatesWithFilters({
      limit,
      offset,
      projectId,
    });

    return {
      templates: result.templates.map((t) => ({
        id: t.id,
        projectId: t.projectId,
        name: t.name,
        description: t.description,
        clankerId: t.clankerId,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
      total: result.total,
    };
  }

  async updateTemplate(
    id: string,
    updates: UpdateClawTaskTemplateRequest,
  ): Promise<ClawTaskTemplate> {
    const template = await this.templateDAO.getTemplate(id);
    if (!template) {
      throw new ClawServiceError(
        CLAW_SERVICE_ERROR_CODE.TEMPLATE_NOT_FOUND,
        "Task template not found",
      );
    }

    if (updates.name && updates.name !== template.name) {
      const existingTemplate =
        await this.templateDAO.getTemplateByProjectAndName(
          template.projectId,
          updates.name,
        );
      if (existingTemplate && existingTemplate.id !== id) {
        throw new ClawServiceError(
          CLAW_SERVICE_ERROR_CODE.INVALID_SCHEDULE_TYPE,
          "A template with this name already exists in this project",
        );
      }
    }

    if (updates.clankerId) {
      const clanker = await this.clankerDAO.getClanker(updates.clankerId);
      if (!clanker) {
        throw new ClawServiceError(
          CLAW_SERVICE_ERROR_CODE.CLANKER_NOT_FOUND,
          "Clanker not found",
        );
      }
    }

    return this.templateDAO.updateTemplate(id, updates);
  }

  async deleteTemplate(id: string): Promise<void> {
    const template = await this.templateDAO.getTemplate(id);
    if (!template) {
      throw new ClawServiceError(
        CLAW_SERVICE_ERROR_CODE.TEMPLATE_NOT_FOUND,
        "Task template not found",
      );
    }

    // Note: The database cascade will delete associated schedules
    await this.templateDAO.deleteTemplate(id);

    logger.info("Claw task template deleted", { templateId: id });
  }
}
