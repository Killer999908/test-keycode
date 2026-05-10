const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const File = require('../models/File');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/html', 'text/css', 'text/javascript',
    'application/json',
    'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
    'video/mp4', 'video/webm', 'video/quicktime'
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 }
});

router.post('/upload', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const file = new File({
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      path: req.file.path,
      url: `/uploads/${req.file.filename}`,
      uploadedBy: req.user.userId,
      project: req.body.project,
      milestone: req.body.milestone,
      order: req.body.order,
      type: req.body.type,
      category: req.body.category,
      description: req.body.description,
      isPublic: req.body.isPublic === 'true'
    });
    
    await file.save();
    
    res.status(201).json(file);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/upload/multiple', auth, upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    
    const files = await Promise.all(req.files.map(async (file) => {
      const fileDoc = new File({
        filename: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        path: file.path,
        url: `/uploads/${file.filename}`,
        uploadedBy: req.user.userId,
        project: req.body.project,
        milestone: req.body.milestone,
        order: req.body.order,
        category: req.body.category
      });
      await fileDoc.save();
      return fileDoc;
    }));
    
    res.status(201).json(files);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const { project, milestone, order, category, type, page = 1, limit = 50 } = req.query;
    
    const query = {};
    
    if (req.user.role !== 'admin') {
      query.uploadedBy = req.user.userId;
    }
    
    if (project) query.project = project;
    if (milestone) query.milestone = milestone;
    if (order) query.order = order;
    if (category) query.category = category;
    if (type) query.type = type;
    
    const files = await File.find(query)
      .populate('uploadedBy', 'name avatar')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await File.countDocuments(query);
    
    res.json({
      files,
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
    const file = await File.findById(req.params.id)
      .populate('uploadedBy', 'name avatar');
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    res.json(file);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/download', auth, async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    if (!file.isPublic && file.uploadedBy.toString() !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (!fs.existsSync(file.path)) {
      return res.status(404).json({ error: 'File not found on server' });
    }
    
    res.download(file.path, file.originalName);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    if (file.uploadedBy.toString() !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    await file.deleteFile();
    
    res.json({ message: 'File deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
