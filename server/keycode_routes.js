/** KeyCODE Studio — Marketplace / Team / Analytics / Settings route module.
 *
 * This module is imported by server.js and mounted with mountRoutes(app, deps).
 * It deliberately does NOT import anything itself; all bindings (app, auth, etc.)
 * are passed in by the host so the route file stays agnostic and testable.
 *
 * Conventions (matching server.js):
 *  - success responses: { success: true, ... }
 *  - error responses:  { error: "..." }  + appropriate HTTP status
 *  - auth via req.user (set by auth middleware); admin via req.user.role === "admin"
 */
export function mountRoutes(app, {
  auth,
  crypto,
  sendEmail,
  createAuditLog,
  FRONTEND_URL,
  MarketplaceListing,
  MarketplaceOrder,
  Team,
  TeamMember,
  TeamInvite,
  User,
  Order,
  AIProject,
  AppState,
  Notification,
  defaultPreferences
}) {
  // ==================== MARKETPLACE ROUTES ====================

  // Public: list active marketplace listings
  app.get("/api/marketplace/list", async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
      const category = req.query.category || undefined;
      const search = req.query.search || undefined;
      const query = { status: "active" };
      if (category) query.category = category;
      if (search) query.title = { $regex: search, $options: "i" };

      const [listings, total] = await Promise.all([
        MarketplaceListing.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        MarketplaceListing.countDocuments(query)
      ]);

      res.json({
        success: true,
        listings,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Public: get a single marketplace listing by slug
  app.get("/api/marketplace/listings/:slug", async (req, res) => {
    try {
      const listing = await MarketplaceListing.findOne({ slug: req.params.slug, status: "active" }).lean();
      if (!listing) return res.status(404).json({ error: "Listing not found" });
      res.json({ success: true, listing });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Auth: purchase a marketplace listing
  app.post("/api/marketplace/purchase", auth, async (req, res) => {
    try {
      const { slug, quantity, notes } = req.body || {};
      if (!slug || !quantity) return res.status(400).json({ error: "slug and quantity are required" });
      const quantityNum = Math.max(1, parseInt(quantity) || 1);
      const listing = await MarketplaceListing.findOne({ slug, status: "active" });
      if (!listing) return res.status(404).json({ error: "Listing not found" });
      if (listing.stock > 0) {
        const reserved = await MarketplaceOrder.countDocuments({ listing: listing._id, status: { $in: ["pending", "paid"] } });
        if (reserved + quantityNum > listing.stock) {
          return res.status(400).json({ error: "Not enough stock available" });
        }
      }

      const total = listing.price * quantityNum;
      const order = await MarketplaceOrder.create({
        listing: listing._id,
        user: req.user._id,
        quantity: quantityNum,
        total,
        currency: listing.currency,
        status: "pending",
        notes: notes || ""
      });

      await createAuditLog({
        user: req.user._id,
        action: "marketplace_purchase",
        resource: "marketplace_order",
        resourceId: order._id.toString(),
        details: { listing: listing.slug, quantity: quantityNum, total },
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        status: "success"
      });

      res.status(201).json({ success: true, order });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Auth: user's marketplace orders
  app.get("/api/marketplace/my-orders", auth, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
      const query = { user: req.user._id };
      if (req.query.status) query.status = req.query.status;

      const [orders, total] = await Promise.all([
        MarketplaceOrder.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
          .populate("listing", "slug title price image category")
          .lean(),
        MarketplaceOrder.countDocuments(query)
      ]);

      res.json({ success: true, orders, total, page, totalPages: Math.ceil(total / limit) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ==================== TEAM ROUTES ====================

  // Auth: get the current user's team (and role)
  app.get("/api/teams/me", auth, async (req, res) => {
    try {
      const member = await TeamMember.findOne({ user: req.user._id, removedAt: { $exists: false } })
        .populate("team")
        .lean();
      if (!member) {
        return res.json({
          success: true,
          team: null,
          role: null,
          isOwner: false,
          membership: null
        });
      }
      const team = member.team || {};
      res.json({
        success: true,
        team,
        role: member.role,
        isOwner: team.owner?._id?.toString() === req.user._id.toString(),
        membership: member
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Auth: list teams the current user belongs to
  app.get("/api/teams", auth, async (req, res) => {
    try {
      const members = await TeamMember.find({ user: req.user._id, removedAt: { $exists: false } })
        .sort({ joinedAt: -1 })
        .populate("team")
        .lean();

      const teams = members.map(m => ({
        ...m.team,
        role: m.role,
        joinedAt: m.joinedAt
      }));

      res.json({ success: true, teams });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Auth: create a new team for the user
  app.post("/api/teams", auth, async (req, res) => {
    try {
      const { name, slug, description } = req.body || {};
      if (!name) return res.status(400).json({ error: "name is required" });
      const baseSlug = (slug || name).toLowerCase().replace(/[^a-z0-9-_]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
      let slugFinal = baseSlug || "team";
      const existing = await Team.findOne({ slug: slugFinal }).lean();
      if (existing) {
        slugFinal = baseSlug + "-" + Date.now().toString(36).slice(-4);
      }
      if (!slugFinal) return res.status(400).json({ error: "Could not generate a team slug" });

      const team = await Team.create({
        name, slug: slugFinal, description: description || "", owner: req.user._id
      });

      await TeamMember.create({ team: team._id, user: req.user._id, role: "owner" });

      await createAuditLog({
        user: req.user._id,
        action: "team_create",
        resource: "team",
        resourceId: team._id.toString(),
        details: { name, slug: slugFinal },
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        status: "success"
      });

      const populated = await Team.findById(team._id)
        .populate("owner", "name email")
        .lean();
      res.status(201).json({ success: true, team: populated });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Auth: send an invite to a team
  app.post("/api/teams/:teamId/invite", auth, async (req, res) => {
    try {
      const { email, role } = req.body || {};
      if (!email) return res.status(400).json({ error: "email is required" });
      const team = await Team.findById(req.params.teamId);
      if (!team) return res.status(404).json({ error: "Team not found" });
      const member = await TeamMember.findOne({ team: team._id, user: req.user._id, removedAt: { $exists: false } });
      if (!member) return res.status(403).json({ error: "Not a member of this team" });
      if (team.owner?._id?.toString() !== req.user._id.toString() && member.role !== "admin") {
        return res.status(403).json({ error: "Only the owner or admins can invite people" });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return res.status(400).json({ error: "Invalid email address" });
      }

      const maybeUser = await User.findOne({ email: email.trim().toLowerCase() }).lean().catch(() => null);
      const existingMember = maybeUser
        ? await TeamMember.findOne({ team: team._id, user: maybeUser._id, removedAt: { $exists: false } }).catch(() => null)
        : null;
      if (existingMember) return res.status(400).json({ error: "This user is already a member" });

      const token = crypto.randomBytes(16).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const invite = await TeamInvite.create({
        team: team._id,
        email: email.trim().toLowerCase(),
        invitedBy: req.user._id,
        role: role || "member",
        token,
        expiresAt
      });

      const acceptUrl = `${FRONTEND_URL}/#/team/invite/${token}`;
      try {
        await sendEmail({
          to: email.trim(),
          subject: `Invitation to join ${team.name}`,
          html: `<div style="max-width:600px;margin:0 auto;background:#111117;border-radius:12px;padding:28px;border:1px solid #1f1f2e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
            <div style="text-align:center;margin-bottom:20px;">
              <div style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-weight:bold;font-size:20px;padding:10px 20px;border-radius:8px;">KEYCODE</div>
            </div>
            <h2 style="color:#fff;margin:0 0 12px;">You're invited to join ${team.name}</h2>
            <p style="color:#9ca3af;margin:0 0 20px;line-height:1.6;">Someone invited you to join their team on KEYCODE Studio.</p>
            <p style="color:#9ca3af;margin:0 0 24px;">This link expires in 7 days.</p>
            <a href="${acceptUrl}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;margin-top:8px;">Accept Invitation</a>
            <p style="color:#6b7280;font-size:12px;margin-top:24px;text-align:center;">If you didn't expect this invitation, you can safely ignore it.</p>
          </div>`
        });
      } catch (emailErr) {
        console.error("[Team] Failed to send invite email:", emailErr.message);
      }

      await createAuditLog({
        user: req.user._id,
        action: "team_invite",
        resource: "team_invite",
        resourceId: invite._id.toString(),
        details: { teamId: team._id.toString(), email: email.trim(), role },
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        status: "success"
      });

      res.status(201).json({ success: true, invite: { id: invite._id, email: invite.email, role: invite.role, expiresAt: invite.expiresAt } });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Auth: list invites for the current user
  app.get("/api/teams/invites", auth, async (req, res) => {
    try {
      const invites = await TeamInvite.find({
        email: req.user.email,
        acceptedAt: { $exists: false },
        rejectedAt: { $exists: false },
        expiresAt: { $gte: new Date() }
      })
        .sort({ createdAt: -1 })
        .populate("team", "name slug description")
        .populate("invitedBy", "name email")
        .lean();

      res.json({ success: true, invites });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Auth: accept a team invite
  app.post("/api/teams/invites/:token/accept", auth, async (req, res) => {
    try {
      const invite = await TeamInvite.findOne({
        token: req.params.token,
        email: req.user.email,
        acceptedAt: { $exists: false },
        rejectedAt: { $exists: false },
        expiresAt: { $gte: new Date() }
      });
      if (!invite) return res.status(404).json({ error: "Invite not found or expired" });

      const team = await Team.findById(invite.team);
      if (!team) return res.status(404).json({ error: "Team not found" });

      const existingMember = await TeamMember.findOne({ team: team._id, user: req.user._id, removedAt: { $exists: false } });
      if (existingMember) return res.status(400).json({ error: "You are already a member of this team" });

      await TeamMember.create({ team: team._id, user: req.user._id, role: invite.role });
      invite.acceptedAt = new Date();
      await invite.save();

      await createAuditLog({
        user: req.user._id,
        action: "team_invite_accept",
        resource: "team_member",
        resourceId: team._id.toString(),
        details: { teamSlug: team.slug, role: invite.role },
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        status: "success"
      });

      res.json({ success: true, team: { _id: team._id, name: team.name, slug: team.slug } });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Auth: reject a team invite
  app.post("/api/teams/invites/:token/reject", auth, async (req, res) => {
    try {
      const invite = await TeamInvite.findOne({
        token: req.params.token,
        email: req.user.email,
        acceptedAt: { $exists: false },
        rejectedAt: { $exists: false }
      });
      if (!invite) return res.status(404).json({ error: "Invite not found" });

      invite.rejectedAt = new Date();
      await invite.save();

      await createAuditLog({
        user: req.user._id,
        action: "team_invite_reject",
        resource: "team_invite",
        resourceId: invite._id.toString(),
        details: { teamId: invite.team.toString() },
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        status: "success"
      });

      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Auth: list members of a team
  app.get("/api/teams/:teamId/members", auth, async (req, res) => {
    try {
      const team = await Team.findById(req.params.teamId);
      if (!team) return res.status(404).json({ error: "Team not found" });
      const member = await TeamMember.findOne({ team: team._id, user: req.user._id, removedAt: { $exists: false } });
      if (!member) return res.status(403).json({ error: "Not a member of this team" });

      const members = await TeamMember.find({ team: team._id, removedAt: { $exists: false } })
        .sort({ role: 1, joinedAt: -1 })
        .populate("user", "name email avatar role")
        .lean();

      res.json({ success: true, team: { _id: team._id, name: team.name, slug: team.slug }, members });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Auth: remove a member from a team
  app.delete("/api/teams/:teamId/members/:userId", auth, async (req, res) => {
    try {
      const team = await Team.findById(req.params.teamId);
      if (!team) return res.status(404).json({ error: "Team not found" });
      const requester = await TeamMember.findOne({ team: team._id, user: req.user._id, removedAt: { $exists: false } });
      if (!requester) return res.status(403).json({ error: "Not a member of this team" });
      if (team.owner?._id?.toString() !== req.user._id.toString() && requester.role !== "admin") {
        return res.status(403).json({ error: "Only the owner or admins can remove members" });
      }
      if (team.owner?._id?.toString() === req.params.userId) {
        return res.status(400).json({ error: "Cannot remove the team owner" });
      }
      if (team.owner?._id?.toString() === req.user._id.toString() && req.params.userId === req.user._id.toString()) {
        return res.status(400).json({ error: "You cannot remove yourself; leave the team to do that" });
      }

      await TeamMember.updateOne(
        { team: team._id, user: req.params.userId },
        { $set: { removedAt: new Date() } }
      );

      await createAuditLog({
        user: req.user._id,
        action: "team_member_remove",
        resource: "team_member",
        resourceId: req.params.userId,
        details: { teamId: team._id.toString() },
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        status: "success"
      });

      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ==================== ANALYTICS ROUTES ====================

  // Auth: user analytics overview (scoped to the user; admin can request ?scope=global)
  app.get("/api/analytics/overview", auth, async (req, res) => {
    try {
      const isAdmin = req.user.role === "admin";
      const scope = (req.query.scope || (isAdmin ? "global" : "user")).toLowerCase();
      const now = new Date();
      const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

      if (scope === "global" && isAdmin) {
        const [
          totalUsers,
          totalOrders,
          totalRevenue,
          ordersByStatus,
          monthlyRevenue,
          dailyOrders,
          topProjects
        ] = await Promise.all([
          User.countDocuments({ isActive: true }),
          Order.countDocuments({ user: req.user._id }),
          Order.aggregate([
            { $match: { user: req.user._id, paymentStatus: "paid" } },
            { $group: { _id: null, total: { $sum: "$total" } } }
          ]),
          Order.aggregate([
            { $match: { user: req.user._id } },
            { $group: { _id: "$status", count: { $sum: 1 } } }
          ]),
          Order.aggregate([
            { $match: { user: req.user._id, createdAt: { $gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) }, paymentStatus: "paid" } },
            { $group: { _id: { month: { $month: "$createdAt" }, year: { $year: "$createdAt" } }, revenue: { $sum: "$total" }, orders: { $sum: 1 } } },
            { $sort: { "_id.year": 1, "_id.month": 1 } }
          ]),
          Order.aggregate([
            { $match: { user: req.user._id, createdAt: { $gte: thirtyDaysAgo } } },
            { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, orders: { $sum: 1 }, revenue: { $sum: "$total" } } },
            { $sort: { _id: 1 } }
          ]),
          AIProject.aggregate([
            { $match: { userId: req.user._id } },
            { $group: { _id: "$projectType", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 6 }
          ])
        ]);

        return res.json({
          success: true,
          scope,
          overview: {
            totalUsers,
            totalOrders: totalOrders || 0,
            totalRevenue: (totalRevenue[0]?.total || 0),
            avgOrderValue: (totalOrders || 0) > 0
              ? Math.round(((totalRevenue[0]?.total || 0)) / (totalOrders || 1))
              : 0
          },
          ordersByStatus: Object.fromEntries((ordersByStatus || []).map(s => [s._id || "unknown", s.count])),
          monthlyRevenue: monthlyRevenue || [],
          dailyOrders: dailyOrders || [],
          projectBreakdown: Object.fromEntries((topProjects || []).map(p => [p._id || "unknown", p.count])),
          period: { from: thirtyDaysAgo.toISOString(), to: now.toISOString() }
        });
      }

      const [
        totalOrders,
        totalRevenue,
        completedOrders,
        pendingOrders,
        ordersByStatus,
        monthlyRevenue,
        dailyOrders,
        topProjects,
        recentActivity
      ] = await Promise.all([
        Order.countDocuments({ user: req.user._id }),
        Order.aggregate([
          { $match: { user: req.user._id, paymentStatus: "paid" } },
          { $group: { _id: null, total: { $sum: "$total" } } }
        ]),
        Order.countDocuments({ user: req.user._id, status: "completed" }),
        Order.countDocuments({ user: req.user._id, status: "pending" }),
        Order.aggregate([
          { $match: { user: req.user._id } },
          { $group: { _id: "$status", count: { $sum: 1 } } }
        ]),
        Order.aggregate([
          { $match: { user: req.user._id, createdAt: { $gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) }, paymentStatus: "paid" } },
          { $group: { _id: { month: { $month: "$createdAt" }, year: { $year: "$createdAt" } }, revenue: { $sum: "$total" }, orders: { $sum: 1 } } },
          { $sort: { "_id.year": 1, "_id.month": 1 } }
        ]),
        Order.aggregate([
          { $match: { user: req.user._id, createdAt: { $gte: thirtyDaysAgo } } },
          { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, orders: { $sum: 1 }, revenue: { $sum: "$total" } } },
          { $sort: { _id: 1 } }
        ]),
        AIProject.aggregate([
          { $match: { userId: req.user._id } },
          { $group: { _id: "$projectType", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 6 }
        ]),
        Order.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(8).select("total status paymentStatus projectType createdAt").lean()
      ]);

      const avgOrderValue = (totalOrders || 0) > 0
        ? Math.round(((totalRevenue[0]?.total || 0)) / (totalOrders || 1))
        : 0;

      res.json({
        success: true,
        scope: "user",
        overview: {
          totalOrders: totalOrders || 0,
          completedOrders,
          pendingOrders,
          totalRevenue: (totalRevenue[0]?.total || 0),
          avgOrderValue,
          totalProjects: (await AIProject.countDocuments({ userId: req.user._id })) || 0
        },
        ordersByStatus: Object.fromEntries((ordersByStatus || []).map(s => [s._id || "unknown", s.count])),
        monthlyRevenue: monthlyRevenue || [],
        dailyOrders: dailyOrders || [],
        projectBreakdown: Object.fromEntries((topProjects || []).map(p => [p._id || "unknown", p.count])),
        recentActivity: recentActivity,
        period: { from: thirtyDaysAgo.toISOString(), to: now.toISOString() }
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Auth: analytics projects breakdown
  app.get("/api/analytics/projects", auth, async (req, res) => {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const [byType, byStatus, recent, total] = await Promise.all([
        AIProject.aggregate([
          { $match: { userId: req.user._id } },
          { $group: { _id: "$projectType", count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ]),
        AIProject.aggregate([
          { $match: { userId: req.user._id } },
          { $group: { _id: "$status", count: { $sum: 1 } } }
        ]),
        AIProject.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(12).select("projectId title projectType status price createdAt").lean(),
        AIProject.countDocuments({ userId: req.user._id })
      ]);

      res.json({
        success: true,
        byType: Object.fromEntries((byType || []).map(p => [p._id || "unknown", p.count])),
        byStatus: Object.fromEntries((byStatus || []).map(p => [p._id || "unknown", p.count])),
        recent: recent || [],
        total: total || 0,
        period: { from: thirtyDaysAgo.toISOString(), to: new Date().toISOString() }
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Auth: analytics activity stream
  app.get("/api/analytics/activity", auth, async (req, res) => {
    try {
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
      const events = await Promise.all([
        AIProject.find({ userId: req.user._id })
          .sort({ updatedAt: -1 })
          .limit(limit)
          .select("projectId title projectType status price createdAt updatedAt").lean(),
        Order.find({ user: req.user._id })
          .sort({ createdAt: -1 })
          .limit(limit)
          .select("total status paymentStatus projectType createdAt").lean()
      ]);

      const combined = [];
      for (const p of events[0]) {
        combined.push({
          kind: "project",
          id: p.projectId,
          title: p.title || p.projectId,
          type: p.projectType || "web-app",
          status: p.status,
          price: p.price || 0,
          date: p.updatedAt || p.createdAt
        });
      }
      for (const o of events[1]) {
        combined.push({
          kind: "order",
          id: o._id.toString(),
          title: `Order #${o._id.toString().slice(-8).toUpperCase()}`,
          type: o.projectType || "general",
          status: o.status,
          price: o.total || 0,
          paid: o.paymentStatus === "paid",
          date: o.createdAt
        });
      }
      combined.sort((a, b) => new Date(b.date) - new Date(a.date));

      res.json({ success: true, events: combined.slice(0, limit), total: combined.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ==================== SETTINGS ROUTES ====================

  // Auth: get current user preferences
  app.get("/api/settings/preferences", auth, async (req, res) => {
    try {
      const pref = await AppState.findOne({ key: `preferences:${req.user._id.toString()}` }).lean();
      res.json({ success: true, preferences: pref ? pref.value : defaultPreferences() });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Auth: save user preferences
  app.put("/api/settings/preferences", auth, async (req, res) => {
    try {
      const prefs = req.body || {};
      const merged = { ...(defaultPreferences()), ...prefs };
      await AppState.findOneAndUpdate(
        { key: `preferences:${req.user._id.toString()}` },
        { value: merged, updatedAt: new Date() },
        { upsert: true, new: true }
      );

      await createAuditLog({
        user: req.user._id,
        action: "settings_update",
        resource: "preferences",
        details: Object.keys(prefs),
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        status: "success"
      });

      res.json({ success: true, preferences: merged });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Auth: get notification preferences
  app.get("/api/settings/notifications", auth, async (req, res) => {
    try {
      const pref = await AppState.findOne({ key: `preferences:${req.user._id.toString()}` }).lean();
      const notifications = pref?.value?.notifications || defaultPreferences().notifications;
      const unreadCount = await Notification.countDocuments({ user: req.user._id, read: false }).catch(() => 0);

      res.json({
        success: true,
        notifications,
        unreadCount,
        recent: await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(10).lean().catch(() => [])
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Auth: update notification preferences
  app.put("/api/settings/notifications", auth, async (req, res) => {
    try {
      const { notifications } = req.body || {};
      if (notifications && typeof notifications !== "object") {
        return res.status(400).json({ error: "notifications must be an object" });
      }
      const pref = await AppState.findOneAndUpdate(
        { key: `preferences:${req.user._id.toString()}` },
        { $set: { [`value.notifications`]: { ...(defaultPreferences().notifications), ...(notifications || {}) } }, $setOnInsert: { updatedAt: new Date() } },
        { upsert: true, new: true }
      ).lean();

      await createAuditLog({
        user: req.user._id,
        action: "settings_notifications_update",
        resource: "notifications",
        details: notifications || {},
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        status: "success"
      });

      res.json({ success: true, notifications: pref?.value?.notifications || defaultPreferences().notifications });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Auth: get user profile for settings panel (extended shape)
  app.get("/api/settings/profile", auth, async (req, res) => {
    try {
      const user = await User.findById(req.user._id).select("-password -otp -otpExpiry -twoFactorSecret").lean();
      const pref = await AppState.findOne({ key: `preferences:${req.user._id.toString()}` }).lean();
      res.json({
        success: true,
        profile: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone || "",
          role: user.role,
          emailVerified: Boolean(user.emailVerified),
          createdAt: user.createdAt,
          lastLogin: user.lastLogin,
          avatar: user.avatar || "",
          social: {
            github: user.github || "",
            twitter: user.twitter || "",
            linkedin: user.linkedin || "",
            website: user.website || "",
            instagram: user.instagram || "",
            youtube: user.youtube || ""
          }
        },
        preferences: pref ? pref.value : defaultPreferences()
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Auth: update profile fields via settings panel
  app.put("/api/settings/profile", auth, async (req, res) => {
    try {
      const { name, phone, avatar, social } = req.body || {};
      const updates = {};
      if (name !== undefined) {
        if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100) {
          return res.status(400).json({ error: "name must be between 2 and 100 characters" });
        }
        updates.name = name.trim();
      }
      if (phone !== undefined) updates.phone = phone ? String(phone).trim() : "";
      if (avatar !== undefined) updates.avatar = avatar ? String(avatar).trim() : "";
      if (social && typeof social === "object") {
        const allowedSocial = ["github", "twitter", "linkedin", "website", "instagram", "youtube"];
        for (const key of Object.keys(social)) {
          if (allowedSocial.includes(key)) {
            updates[key] = typeof social[key] === "string" ? social[key].trim().slice(0, 255) : "";
          }
        }
      }

      const updated = await User.findByIdAndUpdate(req.user._id, updates, { new: true })
        .select("-password -otp -otpExpiry -twoFactorSecret")
        .lean();

      res.json({ success: true, profile: updated });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Auth: refresh the authenticated user's lastLogin timestamp
  app.post("/api/settings/ping", auth, async (req, res) => {
    try {
      await User.findByIdAndUpdate(req.user._id, { lastLogin: new Date() });
      res.json({ success: true, ts: new Date().toISOString() });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}
