import express from 'express';
import { ProjectDAO } from '../../persistence/project/ProjectDAO';
import { IntegrationConfigDAO } from '../../persistence/integrations/IntegrationConfigDAO';
import {
  validateCreateProject,
  validateIntegrationConfig,
  validateUpdateProject,
  validateUuidParam
} from '../middleware/validation';
import logger from '../../config/logger';
import { integrationRegistry } from '../../integrations/registry';
import type { IntegrationFieldDefinition as PluginFieldDefinition } from '../../integrations/plugin';
import type {
  AuthCredentials,
  ConfigureIntegrationRequest,
  IntegrationConfig,
  IntegrationSummary,
  TestIntegrationResponse,
  TicketSystem,
} from '@viberglass/types';
import { INTEGRATION_DESCRIPTIONS } from '@viberglass/types';

const router = express.Router();
const projectService = new ProjectDAO();
const integrationConfigDAO = new IntegrationConfigDAO();

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

// GET /api/projects - List all projects
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const projects = await projectService.listProjects(limit, offset);

    res.json({
      success: true,
      data: projects,
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
    res.json({ success: true, data: project });
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
    res.json({ success: true, data: project });
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
    res.json({ success: true, data: updatedProject });
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
        const integration = plugin.createIntegration(config as any);
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
