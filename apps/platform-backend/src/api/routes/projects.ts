import express from 'express';
import { ProjectDAO } from '../../persistence/project/ProjectDAO';
import { ProjectConfig } from '../../models/PMIntegration';
import { ProjectScmConfigDAO } from '../../persistence/project/ProjectScmConfigDAO';
import { IntegrationConfigDAO } from '../../persistence/integrations/IntegrationConfigDAO';
import { ProjectIntegrationLinkDAO } from '../../persistence/integrations/ProjectIntegrationLinkDAO';
import { IntegrationDAO } from '../../persistence/integrations/IntegrationDAO';
import { SecretDAO } from '../../persistence/secret/SecretDAO';
import { IntegrationCredentialDAO } from '../../persistence/integrations/IntegrationCredentialDAO';
import {
  validateCreateProject,
  validateIntegrationConfig,
  validateProjectScmConfig,
  validateUpdateProject,
  validateUuidParam
} from '../middleware/validation';
import { requireAuth } from '../middleware/authentication';
import logger from '../../config/logger';
import { integrationRegistry } from '../../integrations/TicketingIntegrationRegistry';
import type { IntegrationFieldDefinition as PluginFieldDefinition } from '../../integrations/plugin';
import type {
  AuthCredentials,
  ConfigureIntegrationRequest,
  IntegrationConfig,
  IntegrationSummary,
  TestIntegrationResponse,
  TicketSystem,
  UpsertProjectScmConfigRequest,
} from '@viberglass/types';
import { INTEGRATION_DESCRIPTIONS } from '@viberglass/types';

const router = express.Router();
const projectService = new ProjectDAO();
const projectScmConfigDAO = new ProjectScmConfigDAO();
const integrationConfigDAO = new IntegrationConfigDAO();
const projectIntegrationLinkDAO = new ProjectIntegrationLinkDAO();
const integrationDAO = new IntegrationDAO();
const secretDAO = new SecretDAO();
const integrationCredentialDAO = new IntegrationCredentialDAO();

router.use(requireAuth);

const buildIntegrationSummary = (
  plugin: ReturnType<typeof integrationRegistry.get>,
  config: IntegrationConfig | null
): IntegrationSummary => {
  if (!plugin) {
    throw new Error('Integration plugin not found');
  }

  const status = plugin.status ?? 'ready';
  const configStatus =
    status === 'stub' ? 'stub' : config ? 'configured' : 'not_configured';

  return {
    id: plugin.id,
    label: plugin.label,
    category: plugin.category,
    description: INTEGRATION_DESCRIPTIONS[plugin.id] || plugin.label,
    authTypes: plugin.authTypes,
    configFields: plugin.configFields,
    supports: plugin.supports,
    status,
    configStatus,
    configuredAt: config?.createdAt,
  };
};

const mapConfigRecord = (
  projectId: string,
  integrationId: TicketSystem,
  record: { config: { authType: string; values: Record<string, unknown> }; createdAt: Date; updatedAt: Date }
): IntegrationConfig => {
  return {
    projectId,
    integrationId,
    authType: record.config.authType as IntegrationConfig['authType'],
    values: record.config.values ?? {},
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
};

const isMissingRequiredField = (
  field: PluginFieldDefinition,
  value: unknown
): boolean => {
  if (value === null || value === undefined) return true;

  switch (field.type) {
    case 'boolean':
      return typeof value !== 'boolean';
    case 'number':
      return typeof value !== 'number' || Number.isNaN(value);
    case 'multiselect':
      return !Array.isArray(value) || value.length === 0;
    case 'string':
    case 'select':
    case 'secret':
    default:
      return String(value).trim().length === 0;
  }
};

const normalizeOptionalString = (value?: string | null): string | null => {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Phase 2: Enrich project with derived ticket system from primaryTicketingIntegrationId
 * This function resolves the ticketing system name from the primary integration
 * when the deprecated ticketSystem field is not set or needs to be overridden.
 */
async function enrichProjectWithDerivedTicketSystem(project: ProjectConfig): Promise<ProjectConfig> {
  // If we have a primaryTicketingIntegrationId, derive the ticketSystem from it
  if (project.primaryTicketingIntegrationId) {
    try {
      const integration = await integrationDAO.getIntegration(project.primaryTicketingIntegrationId);
      if (integration) {
        // Override the deprecated ticketSystem with the integration system
        return {
          ...project,
          ticketSystem: integration.system,
        };
      }
    } catch (error) {
      logger.warn('Failed to resolve ticket system from primary integration', {
        projectId: project.id,
        primaryTicketingIntegrationId: project.primaryTicketingIntegrationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return project;
}

/**
 * Phase 2: Enrich multiple projects with derived ticket systems
 */
async function enrichProjectsWithDerivedTicketSystems(projects: ProjectConfig[]): Promise<ProjectConfig[]> {
  return Promise.all(projects.map(enrichProjectWithDerivedTicketSystem));
}

// GET /api/projects - List all projects
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const projects = await projectService.listProjects(limit, offset);
    
    // Phase 2: Enrich projects with derived ticket systems from primary integrations
    const enrichedProjects = await enrichProjectsWithDerivedTicketSystems(projects);

    res.json({
      success: true,
      data: enrichedProjects,
      pagination: { limit, offset, count: projects.length }
    });
  } catch (error) {
    logger.error('Error fetching projects', { error: error instanceof Error ? error.message : error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/projects/by-name/:name - Get a project by name
router.get('/by-name/:name', async (req, res) => {
  try {
    const project = await projectService.findByName(req.params.name);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Phase 2: Enrich project with derived ticket system from primary integration
    const enrichedProject = await enrichProjectWithDerivedTicketSystem(project);
    
    res.json({ success: true, data: enrichedProject });
  } catch (error) {
    logger.error('Error fetching project', { error: error instanceof Error ? error.message : error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/projects - Create a new project
router.post('/', validateCreateProject, async (req, res) => {
  try {
    const project = await projectService.createProject(req.body);
    res.status(201).json({ success: true, data: project });
  } catch (error) {
    logger.error('Error creating project', { error: error instanceof Error ? error.message : error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/projects/:id - Get a specific project
router.get('/:id', validateUuidParam('id'), async (req, res) => {
  try {
    const project = await projectService.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Phase 2: Enrich project with derived ticket system from primary integration
    const enrichedProject = await enrichProjectWithDerivedTicketSystem(project);
    
    res.json({ success: true, data: enrichedProject });
  } catch (error) {
    logger.error('Error fetching project', { error: error instanceof Error ? error.message : error });
    res.status(500).json({ error: 'Internal server error' });
  }
});


// PUT /api/projects/:id - Update a project
router.put('/:id', validateUuidParam('id'), validateUpdateProject, async (req, res) => {
  try {
    const project = await projectService.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const updatedProject = await projectService.updateProject(req.params.id, req.body);
    
    // Phase 2: Enrich project with derived ticket system from primary integration
    const enrichedProject = await enrichProjectWithDerivedTicketSystem(updatedProject);
    
    res.json({ success: true, data: enrichedProject });
  } catch (error) {
    logger.error('Error updating project', { error: error instanceof Error ? error.message : error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/projects/:id - Delete a project
router.delete('/:id', validateUuidParam('id'), async (req, res) => {
  try {
    const project = await projectService.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await projectService.deleteProject(req.params.id);
    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting project', { error: error instanceof Error ? error.message : error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:projectId/scm-config', validateUuidParam('projectId'), async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await projectService.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const scmConfig = await projectScmConfigDAO.getByProjectId(projectId);
    if (!scmConfig) {
      return res.status(404).json({ error: 'SCM configuration not found' });
    }

    res.json({ success: true, data: scmConfig });
  } catch (error) {
    logger.error('Error fetching project SCM config', {
      error: error instanceof Error ? error.message : error,
      projectId: req.params.projectId,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put(
  '/:projectId/scm-config',
  validateUuidParam('projectId'),
  validateProjectScmConfig,
  async (req, res) => {
    try {
      const { projectId } = req.params;
      const project = await projectService.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const body = req.body as UpsertProjectScmConfigRequest;
      const integration = await integrationDAO.getIntegration(body.integrationId);
      if (!integration) {
        return res.status(404).json({ error: 'Integration not found' });
      }

      const plugin = integrationRegistry.get(integration.system);
      if (!plugin || plugin.category !== 'scm') {
        return res.status(400).json({
          error: 'Integration must be an SCM integration',
        });
      }

      const isLinked = await projectIntegrationLinkDAO.isLinked(projectId, body.integrationId);
      if (!isLinked) {
        return res.status(409).json({
          error: 'Integration must be linked to this project before use as SCM',
        });
      }

      if (body.credentialSecretId) {
        const secret = await secretDAO.getSecret(body.credentialSecretId);
        if (!secret) {
          return res.status(404).json({ error: 'SCM credential secret not found' });
        }
      }

      // Validate integration credential if provided
      if (body.integrationCredentialId) {
        const credential = await integrationCredentialDAO.getById(body.integrationCredentialId);
        if (!credential) {
          return res.status(404).json({ error: 'Integration credential not found' });
        }
        if (credential.integrationId !== body.integrationId) {
          return res.status(400).json({
            error: 'Integration credential does not belong to the selected integration',
          });
        }
      }

      const saved = await projectScmConfigDAO.upsertByProjectId(projectId, {
        integrationId: body.integrationId,
        sourceRepository: body.sourceRepository.trim(),
        baseBranch: body.baseBranch?.trim() || 'main',
        pullRequestRepository: normalizeOptionalString(body.pullRequestRepository),
        pullRequestBaseBranch: normalizeOptionalString(body.pullRequestBaseBranch),
        branchNameTemplate: normalizeOptionalString(body.branchNameTemplate),
        credentialSecretId: body.credentialSecretId ?? null,
        integrationCredentialId: body.integrationCredentialId ?? null,
      });

      res.json({ success: true, data: saved });
    } catch (error) {
      logger.error('Error saving project SCM config', {
        error: error instanceof Error ? error.message : error,
        projectId: req.params.projectId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.delete('/:projectId/scm-config', validateUuidParam('projectId'), async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await projectService.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const deleted = await projectScmConfigDAO.deleteByProjectId(projectId);
    if (!deleted) {
      return res.status(404).json({ error: 'SCM configuration not found' });
    }

    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting project SCM config', {
      error: error instanceof Error ? error.message : error,
      projectId: req.params.projectId,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Integration configuration endpoints
router.get('/:projectId/integrations', async (req, res) => {
  try {
    const projectId = req.params.projectId;
    const configs = await integrationConfigDAO.listConfigs(projectId);
    const configMap = new Map(
      configs.map((record) => [
        record.system,
        mapConfigRecord(projectId, record.system, record),
      ])
    );

    const integrations = integrationRegistry.list().map((plugin) =>
      buildIntegrationSummary(plugin, configMap.get(plugin.id) ?? null)
    );

    res.json({ success: true, data: integrations });
  } catch (error) {
    logger.error('Error fetching integrations', {
      error: error instanceof Error ? error.message : error,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:projectId/integrations/:integrationId', async (req, res) => {
  try {
    const { projectId, integrationId } = req.params;
    const plugin = integrationRegistry.get(integrationId as TicketSystem);

    if (!plugin) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    const record = await integrationConfigDAO.getConfig(
      projectId,
      integrationId as TicketSystem
    );

    if (!record) {
      return res.status(404).json({ error: 'Integration configuration not found' });
    }

    res.json({
      success: true,
      data: mapConfigRecord(projectId, integrationId as TicketSystem, record),
    });
  } catch (error) {
    logger.error('Error fetching integration config', {
      error: error instanceof Error ? error.message : error,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put(
  '/:projectId/integrations/:integrationId',
  validateIntegrationConfig,
  async (req, res) => {
    try {
      const { projectId, integrationId } = req.params;
      const plugin = integrationRegistry.get(integrationId as TicketSystem);

      if (!plugin) {
        return res.status(404).json({ error: 'Integration not found' });
      }

      if (plugin.status === 'stub') {
        return res.status(400).json({ error: 'Integration is not available yet' });
      }

      const body = req.body as ConfigureIntegrationRequest;
      const values = body.values || {};

      const missing = plugin.configFields
        .filter((field) => field.required)
        .filter((field) => isMissingRequiredField(field, values[field.key]))
        .map((field) => field.key);

      if (missing.length > 0) {
        return res.status(400).json({
          error: 'Missing required fields',
          details: missing.map((field) => ({
            field,
            message: 'This field is required',
          })),
        });
      }

      const record = await integrationConfigDAO.upsertConfig(
        projectId,
        integrationId as TicketSystem,
        { authType: body.authType, values }
      );

      res.json({
        success: true,
        data: mapConfigRecord(projectId, integrationId as TicketSystem, record),
      });
    } catch (error) {
      logger.error('Error saving integration config', {
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.post(
  '/:projectId/integrations/:integrationId/test',
  validateIntegrationConfig,
  async (req, res) => {
    try {
      const { integrationId } = req.params;
      const plugin = integrationRegistry.get(integrationId as TicketSystem);

      if (!plugin) {
        return res.status(404).json({ error: 'Integration not found' });
      }

      if (plugin.status === 'stub') {
        return res.status(400).json({ error: 'Integration is not available yet' });
      }

      const body = req.body as ConfigureIntegrationRequest;
      const config = {
        type: body.authType,
        ...body.values,
      } as AuthCredentials & Record<string, unknown>;

      try {
        const integration = plugin.createIntegration(config);
        await integration.authenticate(config);

        const response: TestIntegrationResponse = {
          success: true,
          message: 'Connection successful',
        };

        return res.json({ success: true, data: response });
      } catch (error) {
        const response: TestIntegrationResponse = {
          success: false,
          message:
            error instanceof Error ? error.message : 'Failed to authenticate integration',
        };

        return res.json({ success: true, data: response });
      }
    } catch (error) {
      logger.error('Error testing integration config', {
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.delete('/:projectId/integrations/:integrationId', async (req, res) => {
  try {
    const { projectId, integrationId } = req.params;
    const plugin = integrationRegistry.get(integrationId as TicketSystem);

    if (!plugin) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    const deleted = await integrationConfigDAO.deleteConfig(
      projectId,
      integrationId as TicketSystem
    );

    if (!deleted) {
      return res.status(404).json({ error: 'Integration configuration not found' });
    }

    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting integration config', {
      error: error instanceof Error ? error.message : error,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
