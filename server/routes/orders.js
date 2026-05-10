const express = require('express');
const router = express.Router();
const { HostingPlan, Domain, AddonService, Order, User } = require('../models/Order');
const { auth, adminAuth } = require('../middleware/auth');
const crypto = require('crypto');

// Generate order number
function generateOrderNumber() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `KC-${timestamp}-${random}`;
}

// ============================================
// HOSTING PLANS
// ============================================

// Get all hosting plans
router.get('/hosting', async (req, res) => {
  try {
    const plans = await HostingPlan.find({ isActive: true }).sort({ order: 1 });
    res.json(plans);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single hosting plan
router.get('/hosting/:slug', async (req, res) => {
  try {
    const plan = await HostingPlan.findOne({ slug: req.params.slug, isActive: true });
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Create hosting plan
router.post('/hosting', adminAuth, async (req, res) => {
  try {
    const plan = new HostingPlan(req.body);
    plan.slug = req.body.name.toLowerCase().replace(/\s+/g, '-');
    await plan.save();
    res.status(201).json(plan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Update hosting plan
router.put('/hosting/:id', adminAuth, async (req, res) => {
  try {
    const plan = await HostingPlan.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// DOMAINS
// ============================================

// Get domain prices/TLDs
router.get('/domains', async (req, res) => {
  try {
    const domains = await Domain.find();
    res.json(domains);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check domain availability (simulated)
router.post('/domains/check', async (req, res) => {
  try {
    const { domain } = req.body;
    const tld = domain.split('.').pop();
    
    // Simulated availability check
    const isAvailable = !['google.com', 'facebook.com', 'twitter.com'].includes(domain.toLowerCase());
    
    const domainPrice = await Domain.findOne({ tld });
    const price = domainPrice ? domainPrice.price : 12.99;
    
    res.json({
      domain,
      available: isAvailable,
      price: isAvailable ? price : 0,
      message: isAvailable ? 'Domain is available!' : 'Domain is not available'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Add domain TLD
router.post('/domains', adminAuth, async (req, res) => {
  try {
    const domain = new Domain(req.body);
    await domain.save();
    res.status(201).json(domain);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ADDON SERVICES
// ============================================

// Get all addon services
router.get('/addons', async (req, res) => {
  try {
    const { category } = req.query;
    const filter = category ? { category, isActive: true } : { isActive: true };
    const addons = await AddonService.find(filter);
    res.json(addons);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single addon
router.get('/addons/:slug', async (req, res) => {
  try {
    const addon = await AddonService.findOne({ slug: req.params.slug, isActive: true });
    if (!addon) return res.status(404).json({ error: 'Addon not found' });
    res.json(addon);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Create addon
router.post('/addons', adminAuth, async (req, res) => {
  try {
    const addon = new AddonService(req.body);
    addon.slug = req.body.name.toLowerCase().replace(/\s+/g, '-');
    await addon.save();
    res.status(201).json(addon);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// CART & ORDERS
// ============================================

// Get user's cart (draft order)
router.get('/cart', auth, async (req, res) => {
  try {
    let cart = await Order.findOne({ user: req.user.id, status: 'draft' })
      .populate('items.hosting')
      .populate('items.addon');
    
    if (!cart) {
      cart = new Order({
        user: req.user.id,
        orderNumber: generateOrderNumber(),
        status: 'draft',
        items: []
      });
      await cart.save();
    }
    
    res.json(cart);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add item to cart
router.post('/cart/items', auth, async (req, res) => {
  try {
    const { type, itemId, quantity = 1, duration = 'yearly', config = {} } = req.body;
    
    let cart = await Order.findOne({ user: req.user.id, status: 'draft' });
    if (!cart) {
      cart = new Order({
        user: req.user.id,
        orderNumber: generateOrderNumber(),
        status: 'draft'
      });
    }
    
    let itemData = {};
    
    if (type === 'hosting') {
      const plan = await HostingPlan.findById(itemId);
      if (!plan) return res.status(404).json({ error: 'Hosting plan not found' });
      itemData = {
        type: 'hosting',
        name: plan.name,
        description: plan.description,
        price: duration === 'monthly' ? plan.price : plan.price * 10,
        quantity,
        duration,
        config: { planId: plan._id, ...config }
      };
    } else if (type === 'domain') {
      const price = config.price || 12.99;
      itemData = {
        type: 'domain',
        name: config.domain,
        description: `Domain registration (${duration})`,
        price: duration === 'yearly' ? price : price * 1.2,
        quantity,
        duration,
        config
      };
    } else if (type === 'addon') {
      const addon = await AddonService.findById(itemId);
      if (!addon) return res.status(404).json({ error: 'Addon not found' });
      itemData = {
        type: 'addon',
        name: addon.name,
        description: addon.description,
        price: addon.billingCycle === 'one-time' ? addon.price : addon.price * 12,
        quantity,
        duration: addon.billingCycle,
        config: { addonId: addon._id, ...config }
      };
    } else if (type === 'project') {
      itemData = {
        type: 'project',
        name: config.name,
        description: config.description,
        price: config.price,
        quantity,
        duration: 'one-time',
        config
      };
    }
    
    // Check if item already exists in cart
    const existingIndex = cart.items.findIndex(i => 
      i.type === type && i.config?.planId === itemData.config?.planId
    );
    
    if (existingIndex >= 0) {
      cart.items[existingIndex].quantity += quantity;
    } else {
      cart.items.push(itemData);
    }
    
    // Recalculate totals
    cart.subtotal = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    cart.total = cart.subtotal - cart.discount + cart.tax;
    
    await cart.save();
    res.json(cart);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update cart item
router.put('/cart/items/:itemId', auth, async (req, res) => {
  try {
    const { quantity, duration } = req.body;
    const cart = await Order.findOne({ user: req.user.id, status: 'draft' });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    
    const item = cart.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    
    if (quantity !== undefined) item.quantity = quantity;
    if (duration !== undefined) item.duration = duration;
    
    cart.subtotal = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    cart.total = cart.subtotal - cart.discount + cart.tax;
    
    await cart.save();
    res.json(cart);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove item from cart
router.delete('/cart/items/:itemId', auth, async (req, res) => {
  try {
    const cart = await Order.findOne({ user: req.user.id, status: 'draft' });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    
    cart.items.pull(req.params.itemId);
    cart.subtotal = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    cart.total = cart.subtotal - cart.discount + cart.tax;
    
    await cart.save();
    res.json(cart);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Apply discount code
router.post('/cart/discount', auth, async (req, res) => {
  try {
    const { code } = req.body;
    const cart = await Order.findOne({ user: req.user.id, status: 'draft' });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    
    // Simulated discount codes
    const discounts = {
      'WELCOME10': 10,
      'SAVE20': 20,
      'KEYCODE50': 50
    };
    
    const discountPercent = discounts[code.toUpperCase()] || 0;
    cart.discountCode = code.toUpperCase();
    cart.discount = (cart.subtotal * discountPercent) / 100;
    cart.total = cart.subtotal - cart.discount + cart.tax;
    
    await cart.save();
    res.json(cart);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// CHECKOUT
// ============================================

// Get checkout page data
router.get('/checkout', auth, async (req, res) => {
  try {
    const cart = await Order.findOne({ user: req.user.id, status: 'draft' })
      .populate('items.config.planId')
      .populate('items.config.addonId');
    
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }
    
    res.json({
      cart,
      user: await User.findById(req.user.id).select('-password'),
      availablePaymentMethods: ['card', 'paypal', 'bank_transfer', 'crypto']
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Process checkout
router.post('/checkout', auth, async (req, res) => {
  try {
    const { paymentMethod, projectDetails, billingCycle = 'yearly' } = req.body;
    
    let cart = await Order.findOne({ user: req.user.id, status: 'draft' });
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }
    
    // Update order details
    cart.paymentMethod = paymentMethod;
    cart.billingCycle = billingCycle;
    cart.status = 'pending';
    
    if (projectDetails) {
      cart.projectDetails = projectDetails;
    }
    
    // Set next billing date
    cart.nextBillingDate = new Date();
    cart.nextBillingDate.setFullYear(cart.nextBillingDate.getFullYear() + (billingCycle === 'monthly' ? 0 : 1));
    if (billingCycle === 'monthly') {
      cart.nextBillingDate.setMonth(cart.nextBillingDate.getMonth() + 1);
    }
    
    await cart.save();
    
    // Simulate payment processing
    if (paymentMethod !== 'none') {
      cart.paymentStatus = 'paid';
      cart.paymentDate = new Date();
      cart.paymentId = `PAY-${Date.now().toString(36).toUpperCase()}`;
      cart.status = 'processing';
      await cart.save();
      
      // Update user stats
      await User.findByIdAndUpdate(req.user.id, {
        $inc: { 'stats.totalOrders': 1, 'stats.totalSpent': cart.total }
      });
      
      // Create notification
      // await Notification.create({
      //   user: req.user.id,
      //   type: 'order',
      //   title: 'Order Confirmed',
      //   message: `Your order ${cart.orderNumber} has been confirmed!`,
      //   link: `/dashboard/orders/${cart._id}`
      // });
    }
    
    res.json({
      success: true,
      order: cart,
      message: paymentMethod === 'none' ? 'Quote requested' : 'Payment successful'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// USER ORDERS
// ============================================

// Get user's orders
router.get('/orders', auth, async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const filter = { user: req.user.id, status: { $ne: 'draft' } };
    if (status) filter.status = status;
    
    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await Order.countDocuments(filter);
    
    res.json({
      orders,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single order
router.get('/orders/:id', auth, async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, user: req.user.id })
      .populate('items.config.planId')
      .populate('items.config.addonId');
    
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ADMIN: ALL ORDERS
// ============================================

// Get all orders (admin)
router.get('/admin/orders', adminAuth, async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const filter = { status: { $ne: 'draft' } };
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { orderNumber: { $regex: search, $options: 'i' } },
        { 'projectDetails.name': { $regex: search, $options: 'i' } }
      ];
    }
    
    const orders = await Order.find(filter)
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await Order.countDocuments(filter);
    const stats = await Order.aggregate([
      { $match: { status: { $ne: 'draft' } } },
      { $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        totalRevenue: { $sum: '$total' },
        pendingOrders: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
        processingOrders: { $sum: { $cond: [{ $eq: ['$status', 'processing'] }, 1, 0] } }
      }}
    ]);
    
    res.json({
      orders,
      stats: stats[0] || { totalOrders: 0, totalRevenue: 0, pendingOrders: 0, processingOrders: 0 },
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update order status (admin)
router.put('/admin/orders/:id', adminAuth, async (req, res) => {
  try {
    const { status, adminNotes, timeline } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    
    if (status) order.status = status;
    if (adminNotes) order.adminNotes = adminNotes;
    if (timeline) order.timeline = { ...order.timeline, ...timeline };
    
    if (status === 'completed') {
      order.timeline.actualEnd = new Date();
    }
    
    await order.save();
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// SEED DATA
// ============================================

router.post('/seed', async (req, res) => {
  try {
    // Clear existing data
    await HostingPlan.deleteMany({});
    await Domain.deleteMany({});
    await AddonService.deleteMany({});
    
    // Seed hosting plans
    const hostingPlans = await HostingPlan.insertMany([
      {
        name: 'Starter',
        slug: 'starter',
        description: 'Perfect for small websites and blogs',
        price: 4.99,
        renewalPrice: 7.99,
        category: 'starter',
        order: 1,
        features: [
          { icon: 'fas fa-hdd', text: '10 GB SSD Storage' },
          { icon: 'fas fa-network-wired', text: 'Unlimited Bandwidth' },
          { icon: 'fas fa-database', text: '1 MySQL Database' },
          { icon: 'fas fa-envelope', text: '2 Email Accounts' },
          { icon: 'fas fa-lock', text: 'Free SSL Certificate' },
          { icon: 'fas fa-support', text: '24/7 Support' }
        ],
        specs: {
          storage: '10 GB SSD',
          bandwidth: 'Unlimited',
          databases: '1',
          emails: '2',
          ssl: true,
          support: '24/7 Live Chat'
        }
      },
      {
        name: 'Professional',
        slug: 'professional',
        description: 'Best for growing businesses',
        price: 9.99,
        renewalPrice: 14.99,
        category: 'professional',
        order: 2,
        features: [
          { icon: 'fas fa-hdd', text: '50 GB SSD Storage' },
          { icon: 'fas fa-network-wired', text: 'Unlimited Bandwidth' },
          { icon: 'fas fa-database', text: '10 MySQL Databases' },
          { icon: 'fas fa-envelope', text: '10 Email Accounts' },
          { icon: 'fas fa-lock', text: 'Free SSL Certificate' },
          { icon: 'fas fa-support', text: 'Priority Support' },
          { icon: 'fas fa-cloud', text: 'Daily Backups' },
          { icon: 'fas fa-rocket', text: 'Free CDN' }
        ],
        specs: {
          storage: '50 GB SSD',
          bandwidth: 'Unlimited',
          databases: '10',
          emails: '10',
          ssl: true,
          support: 'Priority 24/7'
        }
      },
      {
        name: 'Enterprise',
        slug: 'enterprise',
        description: 'For large scale applications',
        price: 19.99,
        renewalPrice: 29.99,
        category: 'enterprise',
        order: 3,
        features: [
          { icon: 'fas fa-hdd', text: '200 GB SSD Storage' },
          { icon: 'fas fa-network-wired', text: 'Unlimited Bandwidth' },
          { icon: 'fas fa-database', text: 'Unlimited Databases' },
          { icon: 'fas fa-envelope', text: 'Unlimited Emails' },
          { icon: 'fas fa-lock', text: 'Free SSL + Wildcard' },
          { icon: 'fas fa-headset', text: 'Dedicated Support' },
          { icon: 'fas fa-cloud', text: 'Real-time Backups' },
          { icon: 'fas fa-server', text: 'Dedicated IP' },
          { icon: 'fas fa-shield-alt', text: 'DDoS Protection' },
          { icon: 'fas fa-tachometer-alt', text: 'LiteSpeed Server' }
        ],
        specs: {
          storage: '200 GB SSD',
          bandwidth: 'Unlimited',
          databases: 'Unlimited',
          emails: 'Unlimited',
          ssl: true,
          support: 'Dedicated Account Manager'
        }
      }
    ]);
    
    // Seed domains
    const domains = await Domain.insertMany([
      { name: 'COM', tld: 'com', price: 12.99, renewalPrice: 15.99, isPopular: true },
      { name: 'NET', tld: 'net', price: 14.99, renewalPrice: 17.99 },
      { name: 'ORG', tld: 'org', price: 11.99, renewalPrice: 14.99 },
      { name: 'IO', tld: 'io', price: 39.99, renewalPrice: 49.99, isPopular: true },
      { name: 'CO', tld: 'co', price: 19.99, renewalPrice: 24.99 },
      { name: 'APP', tld: 'app', price: 14.99, renewalPrice: 17.99 },
      { name: 'DEV', tld: 'dev', price: 12.99, renewalPrice: 15.99 },
      { name: 'XYZ', tld: 'xyz', price: 1.99, renewalPrice: 9.99, isPopular: true },
      { name: 'ONLINE', tld: 'online', price: 2.99, renewalPrice: 9.99 },
      { name: 'SITE', tld: 'site', price: 2.99, renewalPrice: 9.99 }
    ]);
    
    // Seed addons
    const addons = await AddonService.insertMany([
      {
        name: 'Extra Email Accounts',
        slug: 'extra-emails',
        description: 'Add more professional email accounts',
        price: 1.99,
        billingCycle: 'monthly',
        category: 'development',
        features: ['5 Additional Email Accounts', 'Webmail Access', 'Spam Protection']
      },
      {
        name: 'Extra Storage (50GB)',
        slug: 'extra-storage',
        description: 'Need more space? Add 50GB SSD storage',
        price: 4.99,
        billingCycle: 'monthly',
        category: 'development',
        features: ['50 GB Additional Storage', 'Instant Provisioning']
      },
      {
        name: 'SSL Certificate',
        slug: 'ssl-cert',
        description: 'Secure your website with SSL',
        price: 49.99,
        billingCycle: 'yearly',
        category: 'security',
        features: ['256-bit Encryption', 'HTTPS Enabled', 'Trust Seal']
      },
      {
        name: 'SiteLock Security',
        slug: 'sitelock',
        description: 'Complete website security suite',
        price: 9.99,
        billingCycle: 'monthly',
        category: 'security',
        features: ['Malware Scanning', 'DDoS Protection', 'Firewall', 'Daily Backups']
      },
      {
        name: 'SEO Toolkit',
        slug: 'seo-toolkit',
        description: 'Boost your search rankings',
        price: 7.99,
        billingCycle: 'monthly',
        category: 'marketing',
        features: ['Keyword Research', 'SEO Analysis', 'Rank Tracking', 'Competitor Analysis']
      },
      {
        name: 'Email Marketing',
        slug: 'email-marketing',
        description: 'Powerful email campaigns',
        price: 14.99,
        billingCycle: 'monthly',
        category: 'marketing',
        features: ['10,000 Emails/Month', 'Templates', 'Automation', 'Analytics']
      },
      {
        name: 'Monthly Maintenance',
        slug: 'maintenance',
        description: 'We handle all updates and backups',
        price: 99.99,
        billingCycle: 'monthly',
        category: 'maintenance',
        features: ['Core Updates', 'Plugin Updates', 'Daily Backups', 'Security Monitoring']
      },
      {
        name: 'Speed Optimization',
        slug: 'speed-optimization',
        description: 'Make your site blazing fast',
        price: 149.99,
        billingCycle: 'one-time',
        category: 'development',
        features: ['Performance Audit', 'Image Optimization', 'Cache Setup', 'CDN Integration']
      }
    ]);
    
    res.json({
      message: 'Seed data created successfully',
      data: {
        hostingPlans: hostingPlans.length,
        domains: domains.length,
        addons: addons.length
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
