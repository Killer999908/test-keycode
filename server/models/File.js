const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const fileSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  originalName: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  path: { type: String, required: true },
  url: String,
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  milestone: { type: mongoose.Schema.Types.ObjectId, ref: 'Milestone' },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  type: { 
    type: String, 
    enum: ['document', 'image', 'video', 'archive', 'other'],
    default: 'other' 
  },
  category: { 
    type: String, 
    enum: ['source_code', 'design', 'content', 'asset', 'deliverable', 'feedback', 'other'],
    default: 'other' 
  },
  description: String,
  isPublic: { type: Boolean, default: false }
}, { timestamps: true });

fileSchema.methods.getFileType = function() {
  const ext = path.extname(this.originalName).toLowerCase();
  const types = {
    '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.gif': 'image', '.webp': 'image', '.svg': 'image',
    '.mp4': 'video', '.webm': 'video', '.mov': 'video', '.avi': 'video',
    '.zip': 'archive', '.rar': 'archive', '.7z': 'archive', '.tar': 'archive', '.gz': 'archive',
    '.pdf': 'document', '.doc': 'document', '.docx': 'document', '.txt': 'document', '.xls': 'document', '.xlsx': 'document',
    '.html': 'document', '.css': 'document', '.js': 'document', '.json': 'document'
  };
  return types[ext] || 'other';
};

fileSchema.virtual('downloadUrl').get(function() {
  return `/api/files/${this._id}/download`;
});

fileSchema.methods.deleteFile = async function() {
  try {
    if (fs.existsSync(this.path)) {
      fs.unlinkSync(this.path);
    }
    await this.deleteOne();
    return true;
  } catch (error) {
    console.error('Error deleting file:', error);
    return false;
  }
};

fileSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('File', fileSchema);
