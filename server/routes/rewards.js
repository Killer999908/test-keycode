const express = require('express');
const router = express.Router();
const Reward = require('../models/Reward');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

router.get('/my', auth, async (req, res) => {
  try {
    let reward = await Reward.findOne({ user: req.user.userId });
    
    if (!reward) {
      reward = await Reward.create({
        user: req.user.userId,
        points: Reward.POINTS_CONFIG.signup,
        balance: Reward.POINTS_CONFIG.signup,
        history: [{
          type: 'earned',
          points: Reward.POINTS_CONFIG.signup,
          description: 'Welcome bonus for joining KEYCODE'
        }],
        lifetimeEarned: Reward.POINTS_CONFIG.signup
      });
    }
    
    res.json(reward);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/history', auth, async (req, res) => {
  try {
    const reward = await Reward.findOne({ user: req.user.userId });
    
    if (!reward) {
      return res.json({ history: [], balance: 0 });
    }
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const startIndex = (page - 1) * limit;
    
    res.json({
      history: reward.history.slice(startIndex, startIndex + limit),
      balance: reward.balance,
      lifetimeEarned: reward.lifetimeEarned,
      lifetimeRedeemed: reward.lifetimeRedeemed,
      total: reward.history.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/redeem', auth, async (req, res) => {
  try {
    const { points, description } = req.body;
    
    const reward = await Reward.findOne({ user: req.user.userId });
    
    if (!reward) {
      return res.status(404).json({ error: 'Reward account not found' });
    }
    
    if (reward.balance < points) {
      return res.status(400).json({ error: 'Insufficient points', balance: reward.balance });
    }
    
    if (points < 100) {
      return res.status(400).json({ error: 'Minimum redemption is 100 points' });
    }
    
    await reward.redeemPoints(points, description || 'Points redemption');
    
    if (points >= 500) {
      const discountValue = Math.floor(points / 100);
      const discount = require('../models/DiscountCode');
      await discount.create({
        code: `RWD${Date.now()}`,
        type: 'fixed',
        value: discountValue,
        maxUses: 1,
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        description: `Reward redemption - $${discountValue} off`
      });
      
      return res.json({ 
        success: true, 
        message: `Redeemed for $${discountValue} discount code!`,
        balance: reward.balance,
        discountCode: true
      });
    }
    
    res.json({ success: true, balance: reward.balance });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/purchase/:orderId', auth, async (req, res) => {
  try {
    const reward = await Reward.findOne({ user: req.user.userId });
    
    if (!reward) {
      return res.status(404).json({ error: 'Reward account not found' });
    }
    
    const orderTotal = req.body.orderTotal || 0;
    const earnedPoints = Reward.POINTS_CONFIG.purchase + Math.floor(orderTotal * Reward.POINTS_CONFIG.perDollar);
    
    await reward.addPoints(earnedPoints, `Purchase bonus`, req.params.orderId);
    
    res.json({ success: true, pointsEarned: earnedPoints, balance: reward.balance });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/review/:projectId', auth, async (req, res) => {
  try {
    let reward = await Reward.findOne({ user: req.user.userId });
    
    if (!reward) {
      reward = await Reward.create({ user: req.user.userId });
    }
    
    await reward.addPoints(Reward.POINTS_CONFIG.review, 'Review bonus', req.params.projectId);
    
    res.json({ success: true, pointsEarned: Reward.POINTS_CONFIG.review, balance: reward.balance });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/leaderboard', async (req, res) => {
  try {
    const leaderboard = await Reward.find()
      .sort({ lifetimeEarned: -1 })
      .limit(20)
      .populate('user', 'name avatar');
    
    const formatted = leaderboard.map((r, i) => ({
      rank: i + 1,
      name: r.user.name.charAt(0) + '***' + r.user.name.charAt(-1),
      points: r.lifetimeEarned,
      avatar: r.user.avatar
    }));
    
    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats', auth, async (req, res) => {
  try {
    const reward = await Reward.findOne({ user: req.user.userId });
    
    if (!reward) {
      return res.json({
        balance: 0,
        lifetimeEarned: 0,
        lifetimeRedeemed: 0,
        totalActions: 0,
        recentActivity: []
      });
    }
    
    const stats = {
      balance: reward.balance,
      lifetimeEarned: reward.lifetimeEarned,
      lifetimeRedeemed: reward.lifetimeRedeemed,
      totalActions: reward.history.length,
      recentActivity: reward.history.slice(-5).reverse()
    };
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
