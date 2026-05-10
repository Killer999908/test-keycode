const mongoose = require('mongoose');

const hostingPlanSchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  description: String,
  price: { type: Number, required: true },
  renewalPrice: { type: Number, required: true },
  features: [{
    icon: String,
    text: String
  }],
  specs: {
    storage: String,
    bandwidth: String,
    databases: String,
    emails: String,
    ssl: { type: Boolean, default: true },
    support: String
  },
  category: { type: String, enum: ['starter', 'professional', 'enterprise'], default: 'starter' },
  isActive: { type: Boolean, default: true },
  order: { type: Number, default: 0 }
}, { timestamps: true });

const domainSchema = new mongoose.Schema({
  name: { type: String, required: true },
  tld: { type: String, required: true },
  price: { type: Number, required: true },
  renewalPrice: { type: Number, required: true },
  isAvailable: { type: Boolean, default: true },
  isPopular: { type: Boolean, default: false }
}, { timestamps: true });

const addonServiceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  description: String,
  price: { type: Number, required: true },
  billingCycle: { type: String, enum: ['monthly', 'yearly', 'one-time'], default: 'monthly' },
  category: { type: String, enum: ['security', 'marketing', 'development', 'maintenance'], required: true },
  features: [String],
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

const orderItemSchema = new mongoose.Schema({
  type: { type: String, enum: ['hosting', 'domain', 'addon', 'project'], required: true },
  name: String,
  description: String,
  price: { type: Number, required: true },
  quantity: { type: Number, default: 1 },
  duration: { type: String, enum: ['monthly', 'yearly', 'one-time'], default: 'yearly' },
  config: mongoose.Schema.Types.Mixed
}, { _id: true });

const orderSchema = new mongoose.Schema({
  orderNumber: { type: String, required: unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [orderItemSchema],
  subtotal: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  discountCode: String,
  tax: { type: Number, default: 0 },
  total: { type: Number, required: true },
  currency: { type: String, default: 'USD' },
  status: { 
    type: String, 
    enum: ['draft', 'pending', 'paid', 'processing', 'completed', 'cancelled', 'refunded'], 
    default: 'draft' 
  },
  paymentMethod: { type: String, enum: ['card', 'paypal', 'bank', 'crypto', 'none'], default: 'none' },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
  paymentId: String,
  paymentDate: Date,
  billingCycle: { type: String, enum: ['monthly', 'yearly'], default: 'yearly' },
  nextBillingDate: Date,
  notes: String,
  adminNotes: String,
  projectDetails: {
    name: String,
    type: String,
    description: String,
    requirements: String,
    deadline: Date
  },
  timeline: {
    startDate: Date,
    estimatedEnd: Date,
    actualEnd: Date,
    milestones: [{
      title: String,
      description: String,
      dueDate: Date,
      completed: { type: Boolean, default: false },
      completedAt: Date
    }]
  },
  domainDetails: {
    domain: String,
    registrar: String,
    nameservers: [String],
    autoRenew: { type: Boolean, default: true }
  },
  hostingDetails: {
    plan: String,
    server: String,
    cpanel: String,
    ftp: String,
    database: String
  }
}, { timestamps: true });

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: String,
  company: String,
  avatar: String,
  role: { type: String, enum: ['user', 'admin', 'superadmin'], default: 'user' },
  isVerified: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  lastLogin: Date,
  addresses: [{
    type: { type: String, enum: ['billing', 'shipping'] },
    street: String,
    city: String,
    state: String,
    country: String,
    zip: String
  }],
  paymentMethods: [{
    type: { type: String, enum: ['card', 'paypal', 'bank'] },
    last4: String,
    brand: String,
    expiry: String,
    isDefault: { type: Boolean, default: false }
  }],
  preferences: {
    currency: { type: String, default: 'USD' },
    language: { type: String, default: 'en' },
    notifications: { type: Boolean, default: true }
  },
  stats: {
    totalOrders: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    activeProjects: { type: Number, default: 0 }
  }
}, { timestamps: true });

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['order', 'payment', 'project', 'system', 'support'], required: true },
  title: String,
  message: String,
  isRead: { type: Boolean, default: false },
  link: String,
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'low' }
}, { timestamps: true });

module.exports = {
  HostingPlan: mongoose.model('HostingPlan', hostingPlanSchema),
  Domain: mongoose.model('Domain', domainSchema),
  AddonService: mongoose.model('AddonService', addonServiceSchema),
  Order: mongoose.model('Order', orderSchema),
  User: mongoose.model('User', userSchema),
  Notification: mongoose.model('Notification', notificationSchema)
};
