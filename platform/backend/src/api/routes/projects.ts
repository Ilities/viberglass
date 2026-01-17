import express from 'express';
import { ProjectDAO } from '../../persistence/project/ProjectDAO';
import {
  validateCreateProject,
  validateUpdateProject,
  validateUuidParam
} from '../middleware/validation';

const router = express.Router();
const projectService = new ProjectDAO();

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
    console.error('Error fetching projects:', error);
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
    console.error('Error fetching project:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/projects - Create a new project
router.post('/', validateCreateProject, async (req, res) => {
  try {
    const project = await projectService.createProject(req.body);
    res.status(201).json({ success: true, data: project });
  } catch (error) {
    console.error('Error creating project:', error);
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
    console.error('Error fetching project:', error);
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
    console.error('Error updating project:', error);
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
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;