const express = require('express');
const router = express.Router();
const BlogPost = require('../models/BlogPost');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

router.get('/', async (req, res) => {
  try {
    const { category, tag, search, page = 1, limit = 10, featured } = req.query;
    
    const query = { status: 'published' };
    
    if (category) query.category = category;
    if (tag) query.tags = { $in: [tag] };
    if (featured) query.featured = featured === 'true';
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { excerpt: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } }
      ];
    }
    
    const posts = await BlogPost.find(query)
      .populate('author', 'name avatar')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await BlogPost.countDocuments(query);
    
    res.json({
      posts,
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

router.get('/categories', async (req, res) => {
  try {
    const categories = await BlogPost.aggregate([
      { $match: { status: 'published' } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/tags', async (req, res) => {
  try {
    const tags = await BlogPost.aggregate([
      { $match: { status: 'published' } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]);
    res.json(tags);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/featured', async (req, res) => {
  try {
    const posts = await BlogPost.find({ status: 'published', featured: true })
      .populate('author', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(3);
    res.json(posts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:slug', async (req, res) => {
  try {
    const post = await BlogPost.findOneAndUpdate(
      { slug: req.params.slug, status: 'published' },
      { $inc: { views: 1 } },
      { new: true }
    ).populate('author', 'name avatar bio');
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    const relatedPosts = await BlogPost.find({
      _id: { $ne: post._id },
      status: 'published',
      $or: [
        { category: post.category },
        { tags: { $in: post.tags } }
      ]
    })
    .populate('author', 'name avatar')
    .limit(3);
    
    res.json({ post, relatedPosts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', auth, admin, async (req, res) => {
  try {
    const { title, slug, excerpt, content, coverImage, category, tags, status, readTime, featured, seo } = req.body;
    
    const post = await BlogPost.create({
      title,
      slug: slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      excerpt,
      content,
      coverImage,
      category,
      tags,
      author: req.user.userId,
      status,
      readTime,
      featured,
      seo
    });
    
    res.status(201).json(post);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', auth, admin, async (req, res) => {
  try {
    const post = await BlogPost.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    res.json(post);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', auth, admin, async (req, res) => {
  try {
    const post = await BlogPost.findByIdAndDelete(req.params.id);
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    res.json({ message: 'Post deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/comments', auth, async (req, res) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    post.comments.push({
      user: req.user.userId,
      text: req.body.text
    });
    
    await post.save();
    await post.populate('comments.user', 'name avatar');
    
    res.json(post);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/like', auth, async (req, res) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    const likeIndex = post.likes.indexOf(req.user.userId);
    
    if (likeIndex > -1) {
      post.likes.splice(likeIndex, 1);
    } else {
      post.likes.push(req.user.userId);
    }
    
    await post.save();
    
    res.json({ likes: post.likes.length, liked: likeIndex === -1 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
