const mongoose = require('mongoose');

const milestoneSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  title: { type: String, required: true },
  description: String,
  status: { 
    type: String, 
    enum: ['pending', 'in_progress', 'review', 'completed', 'approved'],
    default: 'pending' 
  },
  dueDate: Date,
  completedAt: Date,
  approvedAt: Date,
  files: [{
    name: String,
    url: String,
    uploadedAt: { type: Date, default: Date.now }
  }],
  deliverables: [{
    title: String,
    description: String,
    completed: { type: Boolean, default: false }
  }],
  progress: { type: Number, default: 0, min: 0, max: 100 },
  order: { type: Number, default: 0 },
  notes: [{
    text: String,
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

module.exports = mongoose.model('Milestone', milestoneSchema);
