const express = require('express');
const router = express.Router();
const Referral = require('../models/Referral');
const DiscountCode = require('../models/DiscountCode');
const Reward = require('../models/Reward');
const User = require('../models/User');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

router.post('/referral/generate', auth, async (req, res) => {
  try {
    let referral = await Referral.findOne({ referrer: req.user.userId });
    
    if (referral) {
      return res.json(referral);
    }
    
    const code = Referral.generateCode();
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    
    referral = await Referral.create({
      referrer: req.user.userId,
      code,
      expiresAt
    });
    
    res.status(201).json(referral);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/referral/my', auth, async (req, res) => {
  try {
    let referral = await Referral.findOne({ referrer: req.user.userId });
    
    if (!referral) {
      const code = Referral.generateCode();
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      
      referral = await Referral.create({
        referrer: req.user.userId,
        code,
        expiresAt
      });
    }
    
    const stats = {
      totalReferrals: await Referral.countDocuments({ referrer: req.user.userId, status: { $ne: 'pending' } }),
      completedReferrals: await Referral.countDocuments({ referrer: req.user.userId, status: 'completed' }),
      rewardedReferrals: await Referral.countDocuments({ referrer: req.user.userId, rewardGiven: true })
    };
    
    res.json({ referral, stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/referral/apply', async (req, res) => {
  try {
    const { code, email } = req.body;
    
    const referral = await Referral.findOne({ code: code.toUpperCase() })
      .populate('referrer', 'name email');
    
    if (!referral) {
      return res.status(404).json({ error: 'Invalid referral code' });
    }
    
    if (referral.status !== 'pending') {
      return res.status(400).json({ error: 'This referral has already been used' });
    }
    
    if (referral.referrer._id.toString() === req.user?.userId) {
      return res.status(400).json({ error: 'You cannot refer yourself' });
    }
    
    if (referral.expiresAt && referral.expiresAt < new Date()) {
      return res.status(400).json({ error: 'This referral code has expired' });
    }
    
    referral.referred = req.user?.userId || null;
    referral.referredEmail = email;
    referral.status = 'completed';
    referral.usedAt = new Date();
    await referral.save();
    
    if (referral.referrer) {
      await DiscountCode.create({
        code: `REF${referral.code}`,
        type: 'percentage',
        value: referral.discount,
        maxUses: 1,
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        description: `Referral reward for referring ${email || 'a friend'}`
      });
      
      let reward = await Reward.findOne({ user: referral.referrer._id });
      if (!reward) {
        reward = await Reward.create({ user: referral.referrer._id });
      }
      await reward.addPoints(Reward.POINTS_CONFIG.referral, `Referral bonus for ${email || 'a new user'}`);
      
      referral.status = 'rewarded';
      referral.rewardGiven = true;
      referral.rewardAmount = referral.discount;
      await referral.save();
    }
    
    res.json({ success: true, discount: referral.discount, message: 'Referral applied successfully!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/referral/leaderboard', async (req, res) => {
  try {
    const leaderboard = await Referral.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: '$referrer', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $project: { _id: 1, count: 1, name: { $concat: [{ $substrCP: ['$user.name', 0, 1] }, '***', { $substrCP: ['$user.name', -1, 1] }] } } }
    ]);
    
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/discount/validate', async (req, res) => {
  try {
    const { code, orderTotal } = req.body;
    
    const result = await DiscountCode.isValid(code);
    
    if (!result.valid) {
      return res.status(400).json({ valid: false, reason: result.reason });
    }
    
    const discountAmount = DiscountCode.calculateDiscount(result.discount, orderTotal);
    
    res.json({
      valid: true,
      discount: {
        code: result.discount.code,
        type: result.discount.type,
        value: result.discount.value,
        amount: discountAmount,
        remainingUses: result.discount.maxUses - result.discount.usedCount
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/discount/apply', auth, async (req, res) => {
  try {
    const { code, orderId } = req.body;
    
    const result = await DiscountCode.isValid(code);
    
    if (!result.valid) {
      return res.status(400).json({ valid: false, reason: result.reason });
    }
    
    result.discount.usedCount += 1;
    result.discount.markModified('usedCount');
    await result.discount.save();
    
    res.json({ success: true, message: 'Discount applied' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/discount/codes', auth, admin, async (req, res) => {
  try {
    const codes = await DiscountCode.find()
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });
    
    res.json(codes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/discount/codes', auth, admin, async (req, res) => {
  try {
    const code = await DiscountCode.create({
      ...req.body,
      createdBy: req.user.userId
    });
    
    res.status(201).json(code);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/discount/codes/:id', auth, admin, async (req, res) => {
  try {
    const code = await DiscountCode.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!code) {
      return res.status(404).json({ error: 'Discount code not found' });
    }
    
    res.json(code);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/discount/codes/:id', auth, admin, async (req, res) => {
  try {
    const code = await DiscountCode.findByIdAndDelete(req.params.id);
    
    if (!code) {
      return res.status(404).json({ error: 'Discount code not found' });
    }
    
    res.json({ message: 'Discount code deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
