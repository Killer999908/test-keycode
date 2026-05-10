const express = require('express');
const router = express.Router();
const Milestone = require('../models/Milestone');
const Project = require('../models/Project');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

router.get('/', auth, async (req, res) => {
  try {
    const { project, status, page = 1, limit = 20 } = req.query;
    
    const query = {};
    
    if (req.user.role !== 'admin') {
      query.project = { $in: await Project.find({ client: req.user.userId }).distinct('_id') };
    }
    
    if (project) query.project = project;
    if (status) query.status = status;
    
    const milestones = await Milestone.find(query)
      .populate('project', 'name client status')
      .populate('order', 'orderNumber total')
      .sort({ order: 1, createdAt: 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await Milestone.countDocuments(query);
    
    res.json({
      milestones,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const milestone = await Milestone.findById(req.params.id)
      .populate('project', 'name description client status')
      .populate('order', 'orderNumber total depositPaid')
      .populate('files.uploadedBy', 'name avatar')
      .populate('notes.author', 'name avatar role');
    
    if (!milestone) {
      return res.status(404).json({ error: 'Milestone not found' });
    }
    
    res.json(milestone);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { project, order, title, description, dueDate, deliverables } = req.body;
    
    const milestone = await Milestone.create({
      project,
      order,
      title,
      description,
      dueDate,
      deliverables: deliverables || [{ title, completed: false }]
    });
    
    await milestone.populate('project', 'name client status');
    
    res.status(201).json(milestone);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const milestone = await Milestone.findById(req.params.id);
    
    if (!milestone) {
      return res.status(404).json({ error: 'Milestone not found' });
    }
    
    Object.assign(milestone, req.body);
    
    if (milestone.status === 'completed' && !milestone.completedAt) {
      milestone.completedAt = new Date();
    }
    
    if (milestone.status === 'approved' && !milestone.approvedAt) {
      milestone.approvedAt = new Date();
    }
    
    const totalDeliverables = milestone.deliverables.length;
    const completedDeliverables = milestone.deliverables.filter(d => d.completed).length;
    milestone.progress = totalDeliverables > 0 ? Math.round((completedDeliverables / totalDeliverables) * 100) : 0;
    
    await milestone.save();
    
    res.json(milestone);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/files', auth, async (req, res) => {
  try {
    const milestone = await Milestone.findById(req.params.id);
    
    if (!milestone) {
      return res.status(404).json({ error: 'Milestone not found' });
    }
    
    milestone.files.push({
      name: req.body.name,
      url: req.body.url,
      uploadedBy: req.user.userId
    });
    
    await milestone.save();
    
    res.json(milestone);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/notes', auth, async (req, res) => {
  try {
    const milestone = await Milestone.findById(req.params.id);
    
    if (!milestone) {
      return res.status(404).json({ error: 'Milestone not found' });
    }
    
    milestone.notes.push({
      text: req.body.text,
      author: req.user.userId
    });
    
    await milestone.save();
    await milestone.populate('notes.author', 'name avatar role');
    
    res.json(milestone);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', auth, admin, async (req, res) => {
  try {
    const milestone = await Milestone.findByIdAndDelete(req.params.id);
    
    if (!milestone) {
      return res.status(404).json({ error: 'Milestone not found' });
    }
    
    res.json({ message: 'Milestone deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/approve', auth, async (req, res) => {
  try {
    const milestone = await Milestone.findById(req.params.id);
    
    if (!milestone) {
      return res.status(404).json({ error: 'Milestone not found' });
    }
    
    milestone.status = 'approved';
    milestone.approvedAt = new Date();
    milestone.progress = 100;
    
    await milestone.save();
    
    res.json(milestone);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
