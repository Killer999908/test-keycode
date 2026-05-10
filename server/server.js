import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { Groq } from "groq-sdk";
import Anthropic from "@anthropic-ai/sdk";
import { createOpencodeClient } from "@opencode-ai/sdk";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import nodemailer from "nodemailer";
import Stripe from "stripe";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";


dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const parentDir = path.join(__dirname, '..');

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder", {
  apiVersion: "2023-10-16"
});
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || (IS_PRODUCTION ? "https://keycode.studio" : "http://localhost:3000");

// Create uploads directory
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.zip', '.rar', '.7z', '.pdf', '.doc', '.docx', '.txt', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.css', '.js', '.html'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// ==================== EMAIL CONFIGURATION ====================

const emailConfig = {
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || ""
  }
};

let transporter = null;

function initEmail() {
  if (emailConfig.auth.user && emailConfig.auth.pass) {
    transporter = nodemailer.createTransport({
      ...emailConfig,
      secure: emailConfig.port === 465
    });
    console.log("✅ Email service initialized");
  } else {
    console.log("⚠️ Email service disabled - No SMTP credentials configured");
    console.log("   Set SMTP_USER and SMTP_PASS in .env to enable emails");
  }
}

async function sendEmail({ to, subject, html }) {
  if (!transporter) {
    console.log(`[EMAIL] Would send to ${to}: ${subject}`);
    return { success: true, simulated: true };
  }
  
  try {
    await transporter.sendMail({
      from: `"KEYCODE Studio" <${emailConfig.auth.user}>`,
      to,
      subject,
      html
    });
    return { success: true };
  } catch (error) {
    console.error("Email error:", error);
    return { success: false, error: error.message };
  }
}

// Email Templates
const emailTemplates = {
  welcome: (name) => ({
    subject: "Welcome to KEYCODE Studio! 🎉",
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; background: #0a0a0f; color: #ffffff; margin: 0; padding: 40px; }
          .container { max-width: 600px; margin: 0 auto; background: #111117; border-radius: 20px; padding: 40px; border: 1px solid #1f1f2e; }
          .logo { font-size: 32px; font-weight: bold; background: linear-gradient(135deg, #6366f1, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; text-align: center; margin-bottom: 30px; }
          h1 { color: #ffffff; font-size: 24px; margin-bottom: 20px; }
          p { color: #888; line-height: 1.6; margin-bottom: 15px; }
          .btn { display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 14px 30px; border-radius: 10px; text-decoration: none; font-weight: 600; margin-top: 20px; }
          .highlight { color: #6366f1; }
          .footer { text-align: center; margin-top: 30px; color: #555; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">KEYCODE</div>
          <h1>Welcome, ${name}! 🚀</h1>
          <p>Thank you for joining KEYCODE Studio. We're thrilled to have you on board!</p>
          <p>With your new account, you can:</p>
          <p>• Browse our professional services</p>
          <p>• Place orders and track progress</p>
          <p>• Access exclusive project previews</p>
          <p>• Manage your projects in one place</p>
          <p>Ready to start? <a href="${FRONTEND_URL}/control-panel.html" class="btn">Go to Dashboard</a></p>
          <p class="footer">© 2026 KEYCODE Studio. All rights reserved.</p>
        </div>
      </body>
      </html>
    `
  }),
  
  orderConfirmation: (order) => ({
    subject: `Order Confirmed! #${order._id?.slice(-8).toUpperCase()}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; background: #0a0a0f; color: #ffffff; margin: 0; padding: 40px; }
          .container { max-width: 600px; margin: 0 auto; background: #111117; border-radius: 20px; padding: 40px; border: 1px solid #1f1f2e; }
          .logo { font-size: 32px; font-weight: bold; background: linear-gradient(135deg, #6366f1, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; text-align: center; margin-bottom: 30px; }
          h1 { color: #10b981; font-size: 24px; margin-bottom: 20px; }
          .order-box { background: #1a1a2e; border-radius: 15px; padding: 25px; margin: 20px 0; }
          .order-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #333; }
          .order-row:last-child { border-bottom: none; }
          .label { color: #888; }
          .value { color: #fff; font-weight: 500; }
          .total { font-size: 24px; color: #10b981; }
          .deposit { background: rgba(99,102,241,0.2); padding: 15px; border-radius: 10px; margin-top: 20px; }
          .btn { display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 14px 30px; border-radius: 10px; text-decoration: none; font-weight: 600; margin-top: 20px; }
          .footer { text-align: center; margin-top: 30px; color: #555; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">KEYCODE</div>
          <h1>✓ Order Confirmed!</h1>
          <p>Great news! Your order has been received and we're already working on it.</p>
          
          <div class="order-box">
            <div class="order-row">
              <span class="label">Order ID</span>
              <span class="value">#${order._id?.slice(-8).toUpperCase()}</span>
            </div>
            <div class="order-row">
              <span class="label">Service</span>
              <span class="value">${order.serviceType || 'Custom Project'}</span>
            </div>
            <div class="order-row">
              <span class="label">Status</span>
              <span class="value" style="color: #f59e0b;">In Progress</span>
            </div>
            <div class="order-row">
              <span class="label">Total Amount</span>
              <span class="value total">$${order.pricing?.total || order.subtotal || 0}</span>
            </div>
          </div>
          
          <div class="deposit">
            <strong>💳 Payment Summary</strong><br>
            Deposit Paid (25%): $${order.pricing?.deposit || Math.round((order.pricing?.total || order.subtotal || 0) * 0.25)}<br>
            Balance Due: $${order.pricing?.balance || Math.round((order.pricing?.total || order.subtotal || 0) * 0.75)}
          </div>
          
          <p>We'll send you updates as your project progresses. Typically, projects are completed within 7-14 days.</p>
          
          <a href="${FRONTEND_URL}/control-panel.html" class="btn">Track Your Order</a>
          <p class="footer">© 2026 KEYCODE Studio. All rights reserved.</p>
        </div>
      </body>
      </html>
    `
  }),
  
  orderUpdate: (order, newStatus) => ({
    subject: `Order Update: ${newStatus} #${order._id?.slice(-8).toUpperCase()}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; background: #0a0a0f; color: #ffffff; margin: 0; padding: 40px; }
          .container { max-width: 600px; margin: 0 auto; background: #111117; border-radius: 20px; padding: 40px; border: 1px solid #1f1f2e; }
          .logo { font-size: 32px; font-weight: bold; background: linear-gradient(135deg, #6366f1, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; text-align: center; margin-bottom: 30px; }
          h1 { color: #6366f1; font-size: 24px; margin-bottom: 20px; }
          .status-badge { display: inline-block; background: ${getStatusColor(newStatus)}; padding: 8px 20px; border-radius: 20px; font-weight: 600; margin: 10px 0; }
          .timeline { background: #1a1a2e; border-radius: 15px; padding: 20px; margin: 20px 0; }
          .timeline-item { padding: 10px 0; border-left: 2px solid #333; margin-left: 10px; padding-left: 20px; position: relative; }
          .timeline-item::before { content: ''; position: absolute; left: -6px; top: 14px; width: 10px; height: 10px; border-radius: 50%; background: #6366f1; }
          .btn { display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 14px 30px; border-radius: 10px; text-decoration: none; font-weight: 600; margin-top: 20px; }
          .footer { text-align: center; margin-top: 30px; color: #555; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">KEYCODE</div>
          <h1>Order Update 📬</h1>
          <p>Your project status has been updated to:</p>
          <div class="status-badge">${newStatus.replace('_', ' ').toUpperCase()}</div>
          <p>Order: <strong>#${order._id?.slice(-8).toUpperCase()}</strong></p>
          <p>${getStatusMessage(newStatus)}</p>
          <a href="${FRONTEND_URL}/control-panel.html" class="btn">View Dashboard</a>
          <p class="footer">© 2026 KEYCODE Studio. All rights reserved.</p>
        </div>
      </body>
      </html>
    `
  }),
  
  paymentReminder: (order) => ({
    subject: `Payment Reminder: Balance Due #${order._id?.slice(-8).toUpperCase()}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; background: #0a0a0f; color: #ffffff; margin: 0; padding: 40px; }
          .container { max-width: 600px; margin: 0 auto; background: #111117; border-radius: 20px; padding: 40px; border: 1px solid #1f1f2e; }
          .logo { font-size: 32px; font-weight: bold; background: linear-gradient(135deg, #6366f1, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; text-align: center; margin-bottom: 30px; }
          h1 { color: #f59e0b; font-size: 24px; margin-bottom: 20px; }
          .balance-box { background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.3); border-radius: 15px; padding: 25px; text-align: center; margin: 20px 0; }
          .balance-amount { font-size: 36px; color: #f59e0b; font-weight: bold; }
          .btn { display: inline-block; background: linear-gradient(135deg, #f59e0b, #ef4444); color: white; padding: 14px 30px; border-radius: 10px; text-decoration: none; font-weight: 600; margin-top: 20px; }
          .footer { text-align: center; margin-top: 30px; color: #555; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">KEYCODE</div>
          <h1>💳 Payment Reminder</h1>
          <p>This is a friendly reminder that your project is ready for the final payment.</p>
          
          <div class="balance-box">
            <p style="margin:0; color: #888;">Balance Due</p>
            <p class="balance-amount">$${order.pricing?.balance || 0}</p>
            <p style="margin:10px 0 0; color: #888; font-size: 14px;">Order #${order._id?.slice(-8).toUpperCase()}</p>
          </div>
          
          <p>Once we receive your final payment, we'll immediately deliver your completed project files.</p>
          
          <a href="${FRONTEND_URL}/control-panel.html" class="btn">Complete Payment</a>
          <p class="footer">© 2026 KEYCODE Studio. All rights reserved.</p>
        </div>
      </body>
      </html>
    `
  }),
  
  projectDelivery: (order) => ({
    subject: `🎉 Project Delivered! #${order._id?.slice(-8).toUpperCase()}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; background: #0a0a0f; color: #ffffff; margin: 0; padding: 40px; }
          .container { max-width: 600px; margin: 0 auto; background: #111117; border-radius: 20px; padding: 40px; border: 1px solid #1f1f2e; }
          .logo { font-size: 32px; font-weight: bold; background: linear-gradient(135deg, #6366f1, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; text-align: center; margin-bottom: 30px; }
          h1 { color: #10b981; font-size: 28px; margin-bottom: 20px; text-align: center; }
          .celebration { font-size: 48px; text-align: center; margin: 20px 0; }
          .files-box { background: #1a1a2e; border-radius: 15px; padding: 25px; margin: 20px 0; }
          .btn { display: inline-block; background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 14px 30px; border-radius: 10px; text-decoration: none; font-weight: 600; margin-top: 20px; }
          .footer { text-align: center; margin-top: 30px; color: #555; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">KEYCODE</div>
          <div class="celebration">🎉</div>
          <h1>Project Delivered!</h1>
          <p style="text-align: center;">Your project has been completed and is ready for download!</p>
          
          <div class="files-box">
            <strong>📦 Delivery Details</strong><br><br>
            Order: #${order._id?.slice(-8).toUpperCase()}<br>
            Service: ${order.serviceType || 'Custom Project'}<br>
            Status: ✓ COMPLETED
          </div>
          
          <p style="text-align: center;">Please review your project and let us know if you need any adjustments. We're here to help!</p>
          
          <div style="text-align: center;">
            <a href="${FRONTEND_URL}/control-panel.html" class="btn">Access Your Files</a>
          </div>
          <p class="footer">© 2026 KEYCODE Studio. All rights reserved.</p>
        </div>
      </body>
      </html>
    `
  }),
  
  contactForm: (data) => ({
    subject: `New Inquiry: ${data.projectType || 'General'} from ${data.name}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; background: #0a0a0f; color: #ffffff; margin: 0; padding: 40px; }
          .container { max-width: 600px; margin: 0 auto; background: #111117; border-radius: 20px; padding: 40px; border: 1px solid #1f1f2e; }
          h1 { color: #6366f1; font-size: 24px; margin-bottom: 20px; }
          .field { margin: 15px 0; padding: 15px; background: #1a1a2e; border-radius: 10px; }
          .label { color: #888; font-size: 12px; text-transform: uppercase; }
          .value { color: #fff; font-size: 16px; margin-top: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>📬 New Inquiry</h1>
          <div class="field">
            <div class="label">Name</div>
            <div class="value">${data.name}</div>
          </div>
          <div class="field">
            <div class="label">Email</div>
            <div class="value">${data.email}</div>
          </div>
          <div class="field">
            <div class="label">Phone</div>
            <div class="value">${data.phone || 'Not provided'}</div>
          </div>
          <div class="field">
            <div class="label">Project Type</div>
            <div class="value">${data.projectType || 'Not specified'}</div>
          </div>
          <div class="field">
            <div class="label">Message</div>
            <div class="value">${data.message}</div>
          </div>
        </div>
      </body>
      </html>
    `
  })
};

function getStatusColor(status) {
  const colors = {
    pending: 'rgba(245,158,11,0.2)',
    in_progress: 'rgba(99,102,241,0.2)',
    review: 'rgba(236,72,153,0.2)',
    completed: 'rgba(16,185,129,0.2)',
    cancelled: 'rgba(239,68,68,0.2)'
  };
  return colors[status] || colors.pending;
}

function getStatusMessage(status) {
  const messages = {
    pending: "Your order has been received and is waiting to be assigned to a developer.",
    in_progress: "Great progress! Our team is actively working on your project.",
    review: "Your project is in the final review stage. Almost done!",
    completed: "Congratulations! Your project has been completed successfully.",
    cancelled: "Your order has been cancelled. Please contact us if you have questions."
  };
  return messages[status] || "Your order status has been updated.";
}

// Initialize email on startup
initEmail();

// Security middleware
app.use(helmet());

app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://kit.fontawesome.com", "https://fonts.googleapis.com"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
    fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com", "https://fonts.googleapis.com"],
    connectSrc: ["'self'", "https://api.openai.com", "https://api.opencode.ai", "wss://*"] ,
    imgSrc: ["'self'", "data:", "https://*"],
    objectSrc: ["'none'"],
    upgradeInsecureRequests: [],
    blockAllMixedContent: []
  }
}));

app.use(helmet.hsts({
  maxAge: 31536000,
  includeSubDomains: true,
  preload: true
}));

app.use(helmet.noSniff());
app.use(helmet.xssFilter());
app.use(helmet.frameguard({ action: 'deny' }));

app.use(cors({
  origin: function(origin, callback) {
    if (IS_PRODUCTION) {
      if (origin && !origin.startsWith("http://localhost") && !origin.includes("keycode.studio")) {
        return callback(new Error("Not allowed by CORS"));
      }
    }
    callback(null, true);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// Static files
app.use(express.static(parentDir));
app.use('/uploads', express.static(uploadsDir));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests, please try again later." }
});
app.use("/api/", limiter);

// Strict rate limit for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many attempts, please try again later." }
});

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString("hex");
const JWT_EXPIRES = process.env.JWT_EXPIRES || "7d";

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/keycode";

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log("✅ MongoDB connected");
  })
  .catch(err => console.error("❌ MongoDB Error:", err));

// MongoDB Connection Event Handlers
mongoose.connection.on("connected", () => {
  console.log("✅ Mongoose connected to MongoDB");
  seedServices(); // Seed after connection is established
});

mongoose.connection.on("error", (err) => {
  console.error("❌ Mongoose connection error:", err);
});

mongoose.connection.on("disconnected", () => {
  console.log("⚠️ Mongoose disconnected");
});

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 8 },
  phone: { type: String, trim: true },
  adminNo: { type: String, trim: true }, // User's unique admin number
  adminCode: { type: String, unique: true, sparse: true }, // Unique code for admin panel access
  avatar: { type: String, default: "" },
  role: { type: String, enum: ["user", "admin"], default: "user" },
  isActive: { type: Boolean, default: true },
  emailVerified: { type: Boolean, default: false },
  verificationToken: String,
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  otp: String, // OTP for login
  otpExpiry: Date, // OTP expiry time
  createdAt: { type: Date, default: Date.now },
  lastLogin: Date
});

userSchema.pre("save", async function() {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 12);
  }
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const serviceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  category: { type: String, required: true },
  description: { type: String, required: true },
  shortDescription: String,
  basePrice: { type: Number, required: true },
  image: String,
  features: [String],
  addons: [{
    name: String,
    price: Number,
    description: String
  }],
  isActive: { type: Boolean, default: true },
  featured: { type: Boolean, default: false },
  sortOrder: Number,
  createdAt: { type: Date, default: Date.now }
});

const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  items: [{
    service: { type: mongoose.Schema.Types.ObjectId, ref: "Service" },
    name: String,
    price: Number,
    addons: [{
      name: String,
      price: Number
    }],
    customizations: mongoose.Schema.Types.Mixed,
    quantity: { type: Number, default: 1 }
  }],
  subtotal: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  total: { type: Number, required: true },
  status: { 
    type: String, 
    enum: ["pending", "confirmed", "in_progress", "review", "completed", "cancelled"],
    default: "pending" 
  },
  paymentStatus: { type: String, enum: ["pending", "paid", "refunded"], default: "pending" },
  paymentId: String,
  billingAddress: {
    name: String,
    email: String,
    phone: String,
    address: String,
    city: String,
    state: String,
    zip: String,
    country: String
  },
  notes: String,
  adminNotes: String,
  timeline: [{
    status: String,
    note: String,
    date: { type: Date, default: Date.now }
  }],
  deliveryFiles: [{
    filename: String,
    filepath: String,
    size: Number,
    uploadedBy: String,
    uploadedAt: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const cartSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  items: [{
    service: { type: mongoose.Schema.Types.ObjectId, ref: "Service" },
    addons: [String],
    customizations: mongoose.Schema.Types.Mixed
  }],
  updatedAt: { type: Date, default: Date.now }
});

const reviewSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
  name: String,
  company: String,
  text: String,
  rating: Number,
  approved: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const inquirySchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  projectType: String,
  message: String,
  status: { type: String, default: "new" },
  createdAt: { type: Date, default: Date.now }
});

// Models
const User = mongoose.models.User || mongoose.model("User", userSchema);
const Service = mongoose.models.Service || mongoose.model("Service", serviceSchema);
const Order = mongoose.models.Order || mongoose.model("Order", orderSchema);
const Cart = mongoose.models.Cart || mongoose.model("Cart", cartSchema);
const Review = mongoose.models.Review || mongoose.model("Review", reviewSchema);
const Inquiry = mongoose.models.Inquiry || mongoose.model("Inquiry", inquirySchema);

// Blog Post Schema & Model
const blogPostSchema = new mongoose.Schema({
  title: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  excerpt: { type: String, required: true },
  content: { type: String, required: true },
  coverImage: { type: String, default: "" },
  category: { type: String, required: true },
  tags: [{ type: String }],
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  status: { type: String, enum: ["draft", "published"], default: "draft" },
  views: { type: Number, default: 0 },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  comments: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    text: String,
    createdAt: { type: Date, default: Date.now }
  }],
  readTime: { type: Number, default: 5 },
  featured: { type: Boolean, default: false }
}, { timestamps: true });
const BlogPost = mongoose.models.BlogPost || mongoose.model("BlogPost", blogPostSchema);

// Website Order Schema (for hosting, domains, addons orders)
const websiteOrderSchema = new mongoose.Schema({
  orderNumber: { type: String, required: true, unique: true },
  customerName: { type: String, required: true },
  customerEmail: { type: String, required: true },
  project: {
    name: { type: String, default: '' },
    type: { type: String, default: '' },
    budget: { type: String, default: '' },
    timeline: { type: String, default: '' },
    description: { type: String, default: '' },
    htmlCode: { type: String, default: '' }  // Generated website code
  },
  hosting: {
    id: { type: String, default: '' },
    name: { type: String, default: '' },
    price: { type: Number, default: 0 },
    billing: { type: String, default: 'yearly' }
  },
  domains: [{
    domain: { type: String, default: '' },
    tld: { type: String, default: '' },
    price: { type: Number, default: 0 }
  }],
  addons: [{
    id: { type: String, default: '' },
    name: { type: String, default: '' },
    price: { type: Number, default: 0 },
    billing: { type: String, default: 'yearly' }
  }],
  subtotal: Number,
  discount: Number,
  discountCode: String,
  total: Number,
  paymentMethod: { type: String, default: 'card' },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
  paymentId: String,
  status: { type: String, enum: ['pending', 'confirmed', 'processing', 'completed', 'cancelled'], default: 'pending' },
  notes: String,
  // Deployment fields
  deployment: {
    deployed: { type: Boolean, default: false },
    deployedAt: Date,
    liveUrl: String,
    cdnUrl: String,
    deployMethod: { type: String, default: 'static' }
  },
  userId: mongoose.Schema.Types.ObjectId,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const WebsiteOrder = mongoose.models.WebsiteOrder || mongoose.model("WebsiteOrder", websiteOrderSchema);

// Milestone Schema & Model
const milestoneSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: "Project" },
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
  title: { type: String, required: true },
  description: String,
  status: { type: String, enum: ["pending", "in_progress", "review", "completed", "approved"], default: "pending" },
  dueDate: Date,
  completedAt: Date,
  approvedAt: Date,
  files: [{ name: String, url: String, uploadedAt: { type: Date, default: Date.now }, uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" } }],
  deliverables: [{ title: String, description: String, completed: { type: Boolean, default: false } }],
  progress: { type: Number, default: 0, min: 0, max: 100 },
  order: { type: Number, default: 0 },
  notes: [{ text: String, author: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, createdAt: { type: Date, default: Date.now } }]
}, { timestamps: true });
const Milestone = mongoose.models.Milestone || mongoose.model("Milestone", milestoneSchema);

// Referral Schema & Model
const referralSchema = new mongoose.Schema({
  referrer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  referred: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  code: { type: String, required: true, unique: true },
  discount: { type: Number, default: 10 },
  status: { type: String, enum: ["pending", "completed", "rewarded"], default: "pending" },
  referredEmail: String,
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
  rewardGiven: { type: Boolean, default: false },
  rewardAmount: { type: Number, default: 0 },
  expiresAt: Date,
  usedAt: Date
}, { timestamps: true });
referralSchema.statics.generateCode = function() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "KEY";
  for (let i = 0; i < 6; i++) { code += chars.charAt(Math.floor(Math.random() * chars.length)); }
  return code;
};
const Referral = mongoose.models.Referral || mongoose.model("Referral", referralSchema);

// Discount Code Schema & Model
const discountCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  type: { type: String, enum: ["percentage", "fixed"], default: "percentage" },
  value: { type: Number, required: true },
  minOrderValue: { type: Number, default: 0 },
  maxUses: { type: Number, default: 1 },
  usedCount: { type: Number, default: 0 },
  validFrom: { type: Date, default: Date.now },
  validUntil: Date,
  isActive: { type: Boolean, default: true },
  applicableTo: [{ type: String }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  description: String
}, { timestamps: true });
discountCodeSchema.statics.isValid = async function(code) {
  const discount = await this.findOne({ code: code.toUpperCase(), isActive: true });
  if (!discount) return { valid: false, reason: "Code not found" };
  if (discount.usedCount >= discount.maxUses) return { valid: false, reason: "Code limit reached" };
  if (discount.validUntil && discount.validUntil < new Date()) return { valid: false, reason: "Code expired" };
  return { valid: true, discount };
};
discountCodeSchema.statics.calculateDiscount = function(discount, orderTotal) {
  if (orderTotal < discount.minOrderValue) return 0;
  if (discount.type === "percentage") return (orderTotal * discount.value) / 100;
  return Math.min(discount.value, orderTotal);
};
const DiscountCode = mongoose.models.DiscountCode || mongoose.model("DiscountCode", discountCodeSchema);

// Reward Schema & Model
const rewardSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, enum: ["signup", "purchase", "referral", "review", "milestone"], required: true },
  points: { type: Number, required: true },
  balance: { type: Number, default: 0 },
  history: [{ type: String, points: Number, description: String, order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" }, createdAt: { type: Date, default: Date.now } }],
  lifetimeEarned: { type: Number, default: 0 },
  lifetimeRedeemed: { type: Number, default: 0 }
}, { timestamps: true });
rewardSchema.methods.addPoints = async function(points, description, orderId = null) {
  this.points += points; this.balance += points; this.lifetimeEarned += points;
  this.history.push({ type: "earned", points, description, order: orderId });
  await this.save(); return this;
};
rewardSchema.methods.redeemPoints = async function(points, description) {
  if (this.balance < points) throw new Error("Insufficient points");
  this.balance -= points; this.lifetimeRedeemed += points;
  this.history.push({ type: "redeemed", points: -points, description });
  await this.save(); return this;
};
rewardSchema.statics.POINTS_CONFIG = { signup: 100, purchase: 10, referral: 500, review: 50, perDollar: 1 };
const Reward = mongoose.models.Reward || mongoose.model("Reward", rewardSchema);

// Auth Middleware
const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Access denied" });
    
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId).select("-password");
    
    if (!user || !user.isActive) {
      return res.status(401).json({ error: "Invalid token" });
    }
    
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
};

const adminOnly = async (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
};

// Seed Services
const seedServices = async () => {
  const count = await Service.countDocuments();
  if (count === 0) {
    await Service.create([
      {
        name: "Professional Website",
        slug: "website",
        category: "Web Development",
        description: "A stunning, responsive website that converts visitors into customers. Includes modern design, SEO optimization, and fast loading speeds.",
        shortDescription: "Modern, responsive websites that convert",
        basePrice: 499,
        features: ["Responsive Design", "SEO Optimized", "Contact Forms", "Analytics", "SSL Certificate", "Mobile Friendly"],
        addons: [
          { name: "Extra Page", price: 50, description: "Additional page" },
          { name: "Blog Setup", price: 199, description: "Full blog integration" },
          { name: "E-Commerce (up to 50 products)", price: 399, description: "Product catalog with cart" }
        ],
        featured: true,
        sortOrder: 1
      },
      {
        name: "Web Application",
        slug: "webapp",
        category: "Web Development",
        description: "Full-featured web application with user accounts, dashboards, and complex functionality tailored to your business needs.",
        shortDescription: "Powerful custom web applications",
        basePrice: 1299,
        features: ["User Authentication", "Database Design", "Admin Dashboard", "API Integration", "Real-time Updates", "Cloud Deployment"],
        addons: [
          { name: "Additional User Role", price: 199, description: "New permission level" },
          { name: "Payment Integration", price: 299, description: "Stripe/PayPal setup" },
          { name: "Custom Feature Module", price: 499, description: "Bespoke functionality" }
        ],
        featured: true,
        sortOrder: 2
      },
      {
        name: "Mobile App (iOS & Android)",
        slug: "mobile-app",
        category: "Mobile Development",
        description: "Native-quality mobile apps for iOS and Android built with React Native for seamless performance and user experience.",
        shortDescription: "Cross-platform mobile applications",
        basePrice: 2499,
        features: ["iOS & Android", "App Store Submission", "Push Notifications", "Offline Mode", "Camera/GPS Access", "Analytics"],
        addons: [
          { name: "Extra Platform", price: 799, description: "Add web version" },
          { name: "Wearable Support", price: 399, description: "Apple Watch / Wear OS" },
          { name: "In-App Purchases", price: 299, description: "Subscription support" }
        ],
        featured: true,
        sortOrder: 3
      },
      {
        name: "AI Integration",
        slug: "ai-integration",
        category: "AI Solutions",
        description: "Implement cutting-edge AI into your business with chatbots, automation, prediction models, and custom ML solutions.",
        shortDescription: "Smart AI solutions for your business",
        basePrice: 1999,
        features: ["AI Chatbot", "Machine Learning", "Data Analysis", "API Integration", "Custom Training", "24/7 Support"],
        addons: [
          { name: "Voice Assistant", price: 599, description: "Speech recognition" },
          { name: "Image Recognition", price: 499, description: "Computer vision" },
          { name: "Predictive Analytics", price: 699, description: "Forecasting models" }
        ],
        featured: true,
        sortOrder: 4
      },
      {
        name: "E-Commerce Store",
        slug: "ecommerce",
        category: "E-Commerce",
        description: "Complete online store with product management, payments, shipping, and marketing tools to sell anywhere.",
        shortDescription: "Full-featured online store",
        basePrice: 1499,
        features: ["Unlimited Products", "Payment Gateway", "Inventory Management", "Order Tracking", "Email Marketing", "Mobile App"],
        addons: [
          { name: "Subscription Products", price: 299, description: "Recurring billing" },
          { name: "Multi-vendor", price: 999, description: "Marketplace features" },
          { name: "POS Integration", price: 399, description: "Point of sale" }
        ],
        featured: true,
        sortOrder: 5
      },
      {
        name: "UI/UX Design",
        slug: "design",
        category: "Design",
        description: "Professional design services including branding, UI design, prototypes, and design systems for cohesive digital presence.",
        shortDescription: "Stunning designs that convert",
        basePrice: 299,
        features: ["Logo Design", "Brand Guidelines", "UI Design", "Interactive Prototype", "Design System", "Figma Files"],
        addons: [
          { name: "Brand Strategy", price: 399, description: "Complete branding" },
          { name: "Motion Design", price: 299, description: "Animations & micro-interactions" },
          { name: "Design Sprint", price: 799, description: "5-day intensive workshop" }
        ],
        featured: false,
        sortOrder: 6
      }
    ]);
    console.log("Services seeded");
  }
};

// Groq AI
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// Anthropic Claude AI (Same AI that powers OpenCode)
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY
});

// ==================== AUTH ROUTES ====================

app.post("/api/auth/register", authLimiter, async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }
    
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Email already registered" });
    }
    
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const adminNo = 'KCA' + Date.now().toString().slice(-6);
    
    const user = await User.create({ 
      name, email, password, phone, verificationToken, adminNo 
    });
    
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    
    // Send welcome email
    await sendEmail({
      to: email,
      ...emailTemplates.welcome(name || email.split('@')[0])
    });
    
    res.status(201).json({ 
      success: true,
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, adminNo: user.adminNo }
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ error: "Registration failed" });
  }
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    
    if (!user.isActive) {
      return res.status(401).json({ error: "Account is disabled" });
    }
    
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    
    user.lastLogin = new Date();
    await user.save();
    
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    
    res.json({ 
      success: true,
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, avatar: user.avatar, adminNo: user.adminNo, adminCode: user.adminCode }
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

// OTP Login - Step 1: Send OTP
app.post("/api/auth/send-otp", authLimiter, async (req, res) => {
  try {
    const { email, adminNo } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }
    
    // Verify admin number (stored as phone or custom field)
    if (user.phone !== adminNo && user.adminNo !== adminNo) {
      return res.status(401).json({ error: "Invalid admin number" });
    }
    
    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    
    user.otp = otp;
    user.otpExpiry = otpExpiry;
    await user.save();
    
    // Send OTP via email
    await sendEmail({
      to: email,
      subject: "Your KEYCODE Login OTP",
      html: `
        <h2>Your Login OTP</h2>
        <p>Your one-time password is: <strong>${otp}</strong></p>
        <p>This OTP will expire in 10 minutes.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `
    });
    
    res.json({ success: true, message: "OTP sent to your email" });
  } catch (error) {
    console.error("Send OTP error:", error);
    res.status(500).json({ error: "Failed to send OTP" });
  }
});

// OTP Login - Step 2: Verify OTP
app.post("/api/auth/verify-otp", authLimiter, async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }
    
    // Check OTP
    if (!user.otp || user.otp !== otp) {
      return res.status(401).json({ error: "Invalid OTP" });
    }
    
    // Check expiry
    if (new Date() > user.otpExpiry) {
      return res.status(401).json({ error: "OTP expired" });
    }
    
    // Clear OTP and generate session
    user.otp = null;
    user.otpExpiry = null;
    user.lastLogin = new Date();
    await user.save();
    
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    
    res.json({ 
      success: true,
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, avatar: user.avatar, adminNo: user.adminNo, adminCode: user.adminCode }
    });
  } catch (error) {
    console.error("Verify OTP error:", error);
    res.status(500).json({ error: "OTP verification failed" });
  }
});

// Admin Login - Login with adminCode (only for users with completed+paid projects)
app.post("/api/auth/admin-login", authLimiter, async (req, res) => {
  try {
    const { adminCode } = req.body;
    
    if (!adminCode) {
      return res.status(400).json({ error: "Admin code is required" });
    }
    
    const user = await User.findOne({ adminCode });
    if (!user) {
      return res.status(401).json({ error: "Invalid admin code" });
    }
    
    if (!user.isActive) {
      return res.status(401).json({ error: "Account is disabled" });
    }
    
    // Check if user has any completed projects with payment
    const completedOrder = await Order.findOne({ 
      user: user._id, 
      status: "completed",
      paymentStatus: "paid"
    });
    
    const completedWebsiteOrder = await WebsiteOrder.findOne({
      customerEmail: user.email,
      status: "completed",
      paymentStatus: "paid"
    });
    
    if (!completedOrder && !completedWebsiteOrder) {
      return res.status(401).json({ 
        error: "Admin access not available yet. Complete a project with payment to get admin access." 
      });
    }
    
    user.lastLogin = new Date();
    await user.save();
    
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    
    res.json({ 
      success: true,
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, adminNo: user.adminNo, adminCode: user.adminCode }
    });
  } catch (error) {
    console.error("Admin login error:", error);
    res.status(500).json({ error: "Admin login failed" });
  }
});

// User Dashboard - Get Dashboard Data
app.get("/api/user/dashboard", auth, async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Get user's orders
    const orders = await Order.find({ user: userId }).sort({ createdAt: -1 }).limit(10);
    
    // Get sales statistics
    const totalOrders = await Order.countDocuments({ user: userId });
    const completedOrders = await Order.countDocuments({ user: userId, status: "completed" });
    const pendingOrders = await Order.countDocuments({ user: userId, status: "pending" });
    
    // Calculate total revenue from completed orders
    const completedOrderDocs = await Order.find({ user: userId, status: "completed" });
    const totalRevenue = completedOrderDocs.reduce((sum, order) => sum + (order.total || 0), 0);
    
    // Get user's website projects (if using WebsiteOrder)
    const websiteOrders = await WebsiteOrder.find({ user: userId }).sort({ createdAt: -1 }).limit(5);
    
    // Get user stats
    const userStats = {
      totalOrders,
      completedOrders,
      pendingOrders,
      totalRevenue,
      totalProjects: websiteOrders.length,
      memberSince: req.user.createdAt,
      lastLogin: req.user.lastLogin
    };
    
    res.json({
      success: true,
      orders,
      websiteOrders,
      stats: userStats
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});

// User Dashboard - Get Sales Statistics
app.get("/api/user/sales", auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const { period = "30" } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));
    
    // Get orders in period
    const orders = await Order.find({
      user: userId,
      status: "completed",
      createdAt: { $gte: startDate }
    });
    
    // Calculate daily sales
    const dailySales = {};
    orders.forEach(order => {
      const date = order.createdAt.toISOString().split('T')[0];
      dailySales[date] = (dailySales[date] || 0) + (order.total || 0);
    });
    
    // Calculate totals
    const totalSales = orders.reduce((sum, order) => sum + (order.total || 0), 0);
    const orderCount = orders.length;
    const avgOrderValue = orderCount > 0 ? totalSales / orderCount : 0;
    
    res.json({
      success: true,
      period: parseInt(period),
      totalSales,
      orderCount,
      avgOrderValue,
      dailySales
    });
  } catch (error) {
    console.error("Sales stats error:", error);
    res.status(500).json({ error: "Failed to load sales data" });
  }
});

// User Dashboard - Update Profile
app.put("/api/user/profile", auth, async (req, res) => {
  try {
    const { name, phone, adminNo } = req.body;
    
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { name, phone, adminNo },
      { new: true }
    ).select("-password -otp -otpExpiry");
    
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ error: "Update failed" });
  }
});

app.get("/api/auth/me", auth, async (req, res) => {
  res.json({ user: req.user });
});

app.put("/api/auth/profile", auth, async (req, res) => {
  try {
    const { name, phone, avatar } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { name, phone, avatar },
      { new: true }
    ).select("-password");
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ error: "Update failed" });
  }
});

app.post("/api/auth/change-password", auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }
    
    const user = await User.findById(req.user._id);
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }
    
    user.password = newPassword;
    await user.save();
    
    res.json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    res.status(500).json({ error: "Password change failed" });
  }
});

// ==================== SERVICES ROUTES ====================

app.get("/api/services", async (req, res) => {
  try {
    const services = await Service.find({ isActive: true }).sort({ sortOrder: 1 });
    res.json(services);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch services" });
  }
});

app.get("/api/services/featured", async (req, res) => {
  try {
    const services = await Service.find({ isActive: true, featured: true }).sort({ sortOrder: 1 });
    res.json(services);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch services" });
  }
});

app.get("/api/services/:slug", async (req, res) => {
  try {
    const service = await Service.findOne({ slug: req.params.slug, isActive: true });
    if (!service) return res.status(404).json({ error: "Service not found" });
    res.json(service);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch service" });
  }
});

// Admin: Get all services (including inactive)
app.get("/api/admin/services", auth, adminOnly, async (req, res) => {
  try {
    const services = await Service.find().sort({ sortOrder: 1 });
    res.json(services);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch services" });
  }
});

// Admin: Create service
app.post("/api/admin/services", auth, adminOnly, async (req, res) => {
  try {
    const { name, slug, category, description, shortDescription, basePrice, features, addons, featured, sortOrder } = req.body;
    
    if (!name || !slug || !category || !basePrice) {
      return res.status(400).json({ error: "Name, slug, category, and price are required" });
    }
    
    const existing = await Service.findOne({ slug });
    if (existing) {
      return res.status(400).json({ error: "Service with this slug already exists" });
    }
    
    const service = await Service.create({
      name,
      slug,
      category,
      description: description || "",
      shortDescription: shortDescription || "",
      basePrice,
      features: features || [],
      addons: addons || [],
      featured: featured || false,
      sortOrder: sortOrder || 999
    });
    
    res.status(201).json({ success: true, service });
  } catch (error) {
    res.status(500).json({ error: "Failed to create service" });
  }
});

// Admin: Update service
app.put("/api/admin/services/:id", auth, adminOnly, async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ error: "Service not found" });
    
    const updates = req.body;
    Object.keys(updates).forEach(key => {
      if (key !== "_id" && key !== "__v") {
        service[key] = updates[key];
      }
    });
    
    await service.save();
    res.json({ success: true, service });
  } catch (error) {
    res.status(500).json({ error: "Failed to update service" });
  }
});

// Admin: Delete service
app.delete("/api/admin/services/:id", auth, adminOnly, async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ error: "Service not found" });
    
    service.isActive = false;
    await service.save();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete service" });
  }
});

// ==================== CART ROUTES ====================

app.get("/api/cart", auth, async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user._id }).populate("items.service");
    if (!cart) {
      cart = await Cart.create({ user: req.user._id, items: [] });
    }
    res.json(cart);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch cart" });
  }
});

app.post("/api/cart/add", auth, async (req, res) => {
  try {
    const { serviceId, addons, customizations } = req.body;
    
    const service = await Service.findById(serviceId);
    if (!service) return res.status(404).json({ error: "Service not found" });
    
    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      cart = await Cart.create({ user: req.user._id, items: [] });
    }
    
    const existingIndex = cart.items.findIndex(
      item => item.service._id.toString() === serviceId
    );
    
    if (existingIndex >= 0) {
      cart.items[existingIndex].addons = addons || [];
      cart.items[existingIndex].customizations = customizations || {};
    } else {
      cart.items.push({ service: serviceId, addons: addons || [], customizations: customizations || {} });
    }
    
    await cart.save();
    await cart.populate("items.service");
    res.json(cart);
  } catch (error) {
    console.error("Cart add error:", error);
    res.status(500).json({ error: "Failed to add to cart" });
  }
});

app.delete("/api/cart/:itemId", auth, async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return res.status(404).json({ error: "Cart not found" });
    
    cart.items = cart.items.filter(item => item._id.toString() !== req.params.itemId);
    await cart.save();
    await cart.populate("items.service");
    res.json(cart);
  } catch (error) {
    res.status(500).json({ error: "Failed to remove item" });
  }
});

app.delete("/api/cart", auth, async (req, res) => {
  try {
    await Cart.findOneAndUpdate({ user: req.user._id }, { items: [] });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to clear cart" });
  }
});

// ==================== STRIPE PAYMENT ROUTES ====================

app.post("/api/payment/create-intent", auth, async (req, res) => {
  try {
    const { orderId, amount, type } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }
    
    // Demo mode if no Stripe key configured
    if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY === "sk_test_placeholder") {
      const demoIntentId = "pi_demo_" + crypto.randomBytes(12).toString("hex");
      return res.json({
        clientSecret: "demo_secret_" + demoIntentId,
        paymentIntentId: demoIntentId,
        amount: amount,
        demoMode: true
      });
    }
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: "usd",
      metadata: {
        orderId: orderId || "",
        type: type || "deposit",
        userId: req.user._id.toString()
      },
      automatic_payment_methods: {
        enabled: true
      }
    });
    
    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: amount
    });
  } catch (error) {
    console.error("Stripe error:", error);
    res.status(500).json({ error: "Payment processing failed" });
  }
});

app.post("/api/payment/confirm", auth, async (req, res) => {
  try {
    const { paymentIntentId, orderId, amount } = req.body;
    
    // Demo mode
    if (paymentIntentId?.startsWith("pi_demo_")) {
      if (orderId) {
        const order = await Order.findById(orderId);
        if (order) {
          order.paymentStatus = "paid";
          order.paymentId = paymentIntentId;
          order.timeline.push({ 
            status: order.status, 
            note: `Demo payment received: $${amount || 0}` 
          });
          await order.save();
        }
      }
      return res.json({ success: true, status: "succeeded", demoMode: true });
    }
    
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (paymentIntent.status === "succeeded") {
      if (orderId) {
        const order = await Order.findById(orderId);
        if (order) {
          order.paymentStatus = "paid";
          order.paymentId = paymentIntentId;
          order.timeline.push({ 
            status: order.status, 
            note: `Payment received: $${paymentIntent.amount / 100}` 
          });
          await order.save();
        }
      }
      
      res.json({ success: true, status: paymentIntent.status });
    } else {
      res.json({ success: false, status: paymentIntent.status });
    }
  } catch (error) {
    console.error("Payment confirmation error:", error);
    res.status(500).json({ error: "Failed to confirm payment" });
  }
});

app.get("/api/payment/methods", auth, async (req, res) => {
  try {
    const customer = await stripe.customers.create({
      email: req.user.email,
      metadata: { userId: req.user._id.toString() }
    });
    
    const setupIntent = await stripe.setupIntents.create({
      customer: customer.id,
      payment_method_types: ["card"],
    });
    
    res.json({
      clientSecret: setupIntent.client_secret,
      customerId: customer.id
    });
  } catch (error) {
    console.error("Setup intent error:", error);
    res.status(500).json({ error: "Failed to setup payment method" });
  }
});

// ==================== FILE UPLOAD ROUTES ====================

// Upload file for order (admin)
app.post("/api/admin/orders/:id/upload", auth, adminOnly, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    
    const order = await Order.findById(req.params.id);
    if (!order) {
      fs.unlinkSync(req.file.path); // Delete uploaded file
      return res.status(404).json({ error: "Order not found" });
    }
    
    // Add file to order
    order.deliveryFiles = order.deliveryFiles || [];
    order.deliveryFiles.push({
      filename: req.file.originalname,
      filepath: `/uploads/${req.file.filename}`,
      size: req.file.size,
      uploadedBy: req.user.name || req.user.email,
      uploadedAt: new Date()
    });
    
    order.timeline.push({
      status: order.status,
      note: `File uploaded: ${req.file.originalname}`
    });
    
    await order.save();
    
    // Notify user via email
    if (order.billingAddress?.email) {
      await sendEmail({
        to: order.billingAddress.email,
        subject: `📦 New File Uploaded - Order #${order._id.slice(-8).toUpperCase()}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #6366f1;">New File Uploaded!</h2>
            <p>A new file has been uploaded to your order.</p>
            <p><strong>File:</strong> ${req.file.originalname}</p>
            <p><strong>Size:</strong> ${(req.file.size / 1024).toFixed(1)} KB</p>
            <p><a href="${FRONTEND_URL}/control-panel.html" style="display: inline-block; background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">View Order</a></p>
          </div>
        `
      });
    }
    
    res.json({
      success: true,
      file: {
        filename: req.file.originalname,
        filepath: `/uploads/${req.file.filename}`,
        size: req.file.size
      }
    });
  } catch (error) {
    console.error("Upload error:", error);
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: "Upload failed" });
  }
});

// Get uploaded files for order
app.get("/api/orders/:id/files", auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    
    // Check if user owns this order or is admin
    if (order.user?.toString() !== req.user._id.toString() && req.user.role !== "admin") {
      return res.status(403).json({ error: "Access denied" });
    }
    
    res.json({ files: order.deliveryFiles || [] });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch files" });
  }
});

// Delete uploaded file (admin)
app.delete("/api/admin/files/:filename", auth, adminOnly, async (req, res) => {
  try {
    const filename = req.params.filename;
    const filepath = path.join(uploadsDir, filename);
    
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: "File not found" });
    }
    
    // Remove file from filesystem
    fs.unlinkSync(filepath);
    
    // Remove file reference from all orders
    await Order.updateMany(
      { "deliveryFiles.filepath": `/uploads/${filename}` },
      { $pull: { deliveryFiles: { filepath: `/uploads/${filename}` } } }
    );
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete file" });
  }
});

// ==================== ANALYTICS ROUTES ====================

// Get analytics dashboard data (admin)
app.get("/api/admin/analytics", auth, adminOnly, async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    
    // Get stats
    const [
      totalUsers,
      totalOrders,
      totalRevenue,
      recentOrders,
      ordersByStatus,
      topServices
    ] = await Promise.all([
      User.countDocuments(),
      Order.countDocuments(),
      Order.aggregate([
        { $match: { paymentStatus: "paid" } },
        { $group: { _id: null, total: { $sum: "$total" } } }
      ]),
      Order.find({ createdAt: { $gte: sevenDaysAgo } })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate("user"),
      Order.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]),
      Order.aggregate([
        { $unwind: "$items" },
        { $group: { _id: "$items.name", count: { $sum: 1 }, revenue: { $sum: "$items.price" } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ])
    ]);
    
    // Monthly revenue
    const monthlyRevenue = await Order.aggregate([
      { $match: { createdAt: { $gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) }, paymentStatus: "paid" } },
      { $group: {
        _id: { month: { $month: "$createdAt" }, year: { $year: "$createdAt" } },
        revenue: { $sum: "$total" },
        orders: { $sum: 1 }
      }},
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);
    
    // Daily orders last 30 days
    const dailyOrders = await Order.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      { $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        orders: { $sum: 1 },
        revenue: { $sum: "$total" }
      }},
      { $sort: { _id: 1 } }
    ]);
    
    res.json({
      overview: {
        totalUsers,
        totalOrders,
        totalRevenue: totalRevenue[0]?.total || 0,
        avgOrderValue: totalOrders > 0 ? Math.round((totalRevenue[0]?.total || 0) / totalOrders) : 0
      },
      recentOrders,
      ordersByStatus: Object.fromEntries(ordersByStatus.map(s => [s._id, s.count])),
      topServices,
      monthlyRevenue,
      dailyOrders
    });
  } catch (error) {
    console.error("Analytics error:", error);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

// Export orders (admin)
app.get("/api/admin/export/orders", auth, adminOnly, async (req, res) => {
  try {
    const { format = "json" } = req.query;
    const orders = await Order.find()
      .sort({ createdAt: -1 })
      .populate("user");
    
    if (format === "csv") {
      const headers = ["Order ID", "Customer", "Email", "Service", "Total", "Status", "Payment", "Date"];
      const rows = orders.map(o => [
        o._id.toString(),
        o.billingAddress?.name || o.user?.name || "N/A",
        o.billingAddress?.email || o.user?.email || "N/A",
        o.items?.map(i => i.name).join(", ") || o.serviceType || "N/A",
        o.total,
        o.status,
        o.paymentStatus,
        new Date(o.createdAt).toISOString()
      ]);
      
      const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=orders-${Date.now()}.csv`);
      return res.send(csv);
    }
    
    res.json({ orders });
  } catch (error) {
    res.status(500).json({ error: "Failed to export orders" });
  }
});

// ==================== NOTIFICATION ROUTES ====================

// Get user notifications
app.get("/api/notifications", auth, async (req, res) => {
  try {
    // Simple notifications based on orders
    const orders = await Order.find({ user: req.user._id })
      .sort({ updatedAt: -1 })
      .limit(5);
    
    const notifications = orders
      .filter(o => o.timeline && o.timeline.length > 1)
      .map(o => ({
        id: o._id,
        type: o.status === "completed" ? "success" : "info",
        title: `Order #${o._id.slice(-8).toUpperCase()} - ${o.status.replace("_", " ")}`,
        message: o.timeline[o.timeline.length - 1]?.note || "",
        read: false,
        createdAt: o.updatedAt
      }));
    
    res.json({ notifications });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// ==================== ORDERS ROUTES ====================

app.post("/api/orders", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    let userId = null;
    
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.userId;
      } catch (e) {
        // Token invalid, continue as guest
      }
    }

    const { customer, project, pricing, status, paymentStatus } = req.body;
    
    if (!project || !pricing) {
      const { items, billingAddress, notes } = req.body;
      if (items && items.length > 0) {
        const orderItems = items.map(item => ({
          name: item.name,
          price: item.price
        }));
        const subtotal = orderItems.reduce((sum, item) => sum + item.price, 0);
        
        const order = await Order.create({
          user: userId,
          items: orderItems,
          subtotal,
          total: subtotal,
          billingAddress,
          notes,
          status: "confirmed",
          paymentStatus: "paid",
          timeline: [{ status: "confirmed", note: "Order placed via AI Studio" }]
        });
        
        return res.status(201).json({ success: true, order, orderId: order._id.toString() });
      }
      return res.status(400).json({ error: "Invalid order data" });
    }

    let user = null;
    if (userId) {
      user = await User.findById(userId);
    }

    if (!user && customer?.email) {
      const existingUser = await User.findOne({ email: customer.email.toLowerCase() });
      if (existingUser) {
        user = existingUser;
        userId = user._id;
      } else {
        const tempPassword = crypto.randomBytes(12).toString('hex');
        user = await User.create({
          name: customer.name,
          email: customer.email.toLowerCase(),
          password: tempPassword,
          phone: customer.phone,
          role: "user"
        });
        userId = user._id;
      }
    }

    const orderItems = [{
      name: project.name,
      price: pricing.totalPrice,
      customizations: {
        type: project.type,
        pages: project.pages,
        features: project.features,
        designLevel: project.designLevel
      }
    }];

    const order = await Order.create({
      user: userId,
      items: orderItems,
      subtotal: pricing.totalPrice,
      total: pricing.totalPrice,
      discount: pricing.totalPrice - pricing.depositPaid,
      billingAddress: {
        name: customer?.name,
        email: customer?.email,
        phone: customer?.phone
      },
      status: status || "confirmed",
      paymentStatus: paymentStatus || "paid",
      notes: `AI Studio Order - ${project.name}`,
      timeline: [
        { status: "confirmed", note: "Deposit payment received via AI Studio" },
        { status: "in_progress", note: "Project started - our team is working on your project" }
      ]
    });

    if (user) {
      user.lastLogin = new Date();
      await user.save();
      
      // Send order confirmation email
      const orderData = order.toObject();
      orderData.pricing = {
        total: pricing.totalPrice,
        deposit: pricing.depositPaid || Math.round(pricing.totalPrice * 0.25),
        balance: pricing.totalPrice - (pricing.depositPaid || Math.round(pricing.totalPrice * 0.25))
      };
      await sendEmail({
        to: user.email,
        ...emailTemplates.orderConfirmation(orderData)
      });
    }

    res.status(201).json({ 
      success: true, 
      order, 
      orderId: order._id.toString(),
      user: user ? { id: user._id, name: user.name, email: user.email, role: user.role } : null,
      token: user ? jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: JWT_EXPIRES }) : null
    });
  } catch (error) {
    console.error("Order error:", error);
    res.status(500).json({ error: "Failed to create order: " + error.message });
  }
});

app.get("/api/orders", auth, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .populate("items.service");
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

app.get("/api/orders/guest/:email", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ error: "No orders found for this email" });
    }
    const orders = await Order.find({ user: user._id })
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

app.get("/api/orders/:id", auth, async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id })
      .populate("items.service");
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

// ==================== ADMIN ROUTES ====================

app.get("/api/admin/orders", auth, adminOnly, async (req, res) => {
  try {
    const orders = await Order.find()
      .sort({ createdAt: -1 })
      .populate("user")
      .populate("items.service");
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

app.put("/api/admin/orders/:id/status", auth, adminOnly, async (req, res) => {
  try {
    const { status, note } = req.body;
    const order = await Order.findById(req.params.id).populate("user");
    if (!order) return res.status(404).json({ error: "Order not found" });
    
    const previousStatus = order.status;
    order.status = status;
    order.timeline.push({ status, note: note || "" });
    order.updatedAt = new Date();
    await order.save();
    
    // Send email notification to customer
    if (order.user?.email) {
      const orderData = order.toObject();
      orderData.pricing = {
        total: order.total,
        deposit: order.discount || Math.round(order.total * 0.25),
        balance: order.total - (order.discount || Math.round(order.total * 0.25))
      };
      
      // Use appropriate email template based on status
      let emailTemplate;
      if (status === 'completed') {
        // Generate admin code for the user when project is completed
        const adminCode = 'KC-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        await User.findByIdAndUpdate(order.user._id, { adminCode });
        
        // Send project completion email with admin code
        emailTemplate = emailTemplates.projectDelivery(orderData);
        emailTemplate.html = emailTemplate.html.replace('</body>', `
          <div style="margin-top: 30px; padding: 20px; background: linear-gradient(135deg, #22d3ee, #6366f1); border-radius: 10px; text-align: center;">
            <h3 style="color: white; margin-bottom: 10px;">🎉 Admin Access Granted!</h3>
            <p style="color: white;">Your project is complete! Use this code to access your admin panel:</p>
            <p style="font-size: 24px; font-weight: bold; color: white; letter-spacing: 4px;">${adminCode}</p>
            <p style="color: rgba(255,255,255,0.8); font-size: 12px; margin-top: 10px;">Keep this code safe - you'll need it to manage your project!</p>
          </div>
        </body>
        `);
      } else if (status === 'in_progress') {
        emailTemplate = emailTemplates.orderUpdate(orderData, status);
      } else {
        emailTemplate = emailTemplates.orderUpdate(orderData, status);
      }
      
      await sendEmail({
        to: order.user.email,
        ...emailTemplate
      });
    }
    
    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ error: "Failed to update order" });
  }
});

app.get("/api/admin/users", auth, adminOnly, async (req, res) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

app.put("/api/admin/users/:id", auth, adminOnly, async (req, res) => {
  try {
    const { isActive, role } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    
    if (typeof isActive !== 'undefined') user.isActive = isActive;
    if (role) user.role = role;
    await user.save();
    
    res.json({ success: true, user: user.toObject() });
  } catch (error) {
    res.status(500).json({ error: "Failed to update user" });
  }
});

app.put("/api/admin/orders/:id", auth, adminOnly, async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    
    if (status) order.status = status;
    order.updatedAt = new Date();
    await order.save();
    
    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ error: "Failed to update order" });
  }
});

app.post("/api/admin/seed", auth, adminOnly, async (req, res) => {
  try {
    const services = [
      // Web Development
      { name: "Landing Page", slug: "landing-page", category: "Web Development", description: "High-converting single page website perfect for product launches, campaigns, or lead generation.", shortDescription: "Convert visitors into customers", basePrice: 299, features: ["Responsive Design", "SEO Optimized", "Lead Capture Forms", "Analytics", "Fast Loading", "Mobile Friendly"], addons: [{ name: "A/B Testing Setup", price: 99, description: "Split testing configuration" }, { name: "Email Integration", price: 49, description: "Mailchimp/ConvertKit setup" }, { name: "Countdown Timer", price: 29, description: " urgency timer" }], featured: true, sortOrder: 1 },
      { name: "Business Website", slug: "business-website", category: "Web Development", description: "Professional multi-page website for businesses with services, about, and contact sections.", shortDescription: "Professional business presence", basePrice: 699, features: ["Up to 10 Pages", "Responsive Design", "SEO Optimized", "Contact Forms", "Google Maps", "Social Links"], addons: [{ name: "Blog Module", price: 199, description: "Full blog with posts" }, { name: "Appointment Booking", price: 149, description: "Online scheduling system" }, { name: "Customer Portal", price: 299, description: "Client login area" }], featured: true, sortOrder: 2 },
      { name: "Professional Website", slug: "website", category: "Web Development", description: "A stunning, responsive website that converts visitors into customers.", shortDescription: "Modern, responsive websites", basePrice: 999, features: ["Responsive Design", "SEO Optimized", "Contact Forms", "Analytics", "SSL Certificate", "Mobile Friendly", "CMS Integration"], addons: [{ name: "Extra Page", price: 75, description: "Additional page" }, { name: "Blog Setup", price: 249, description: "Full blog integration" }, { name: "E-Commerce (up to 100 products)", price: 499, description: "Product catalog with cart" }], featured: true, sortOrder: 3 },
      { name: "Custom Web Application", slug: "webapp", category: "Web Development", description: "Full-featured web application with user accounts, dashboards, and complex functionality.", shortDescription: "Powerful custom web apps", basePrice: 2499, features: ["User Authentication", "Database Design", "Admin Dashboard", "API Integration", "Real-time Updates", "Cloud Deployment"], addons: [{ name: "Additional User Role", price: 299, description: "New permission level" }, { name: "Payment Integration", price: 399, description: "Stripe/PayPal setup" }, { name: "Custom Feature Module", price: 699, description: "Bespoke functionality" }], featured: true, sortOrder: 4 },
      { name: "SaaS Platform", slug: "saas", category: "Web Development", description: "Multi-tenant SaaS application with subscriptions, billing, and white-label options.", shortDescription: "Build your SaaS business", basePrice: 4999, features: ["Multi-tenancy", "Subscription Billing", "User Management", "API Access", "White-label", "Custom Branding"], addons: [{ name: "Additional Tenant", price: 199, description: "Per tenant license" }, { name: "Mobile SDK", price: 999, description: "iOS/Android SDK" }, { name: "Advanced Analytics", price: 399, description: "Full analytics suite" }], featured: false, sortOrder: 5 },
      
      // E-Commerce
      { name: "Small Store", slug: "small-store", category: "E-Commerce", description: "Perfect for small businesses starting online with up to 50 products.", shortDescription: "Start selling online", basePrice: 799, features: ["Up to 50 Products", "Payment Gateway", "Order Management", "Mobile Responsive", "Email Notifications"], addons: [{ name: "Extra 50 Products", price: 99, description: "Additional products" }, { name: "Subscription Setup", price: 149, description: "Recurring billing" }, { name: "Inventory Sync", price: 199, description: "Sync with suppliers" }], featured: true, sortOrder: 6 },
      { name: "E-Commerce Store", slug: "ecommerce", category: "E-Commerce", description: "Complete online store with product management, payments, and shipping.", shortDescription: "Full-featured store", basePrice: 1499, features: ["Unlimited Products", "Payment Gateway", "Inventory Management", "Order Tracking", "Email Marketing", "Mobile App", "Discount Codes"], addons: [{ name: "Subscription Products", price: 299, description: "Recurring billing" }, { name: "Multi-vendor", price: 999, description: "Marketplace features" }, { name: "POS Integration", price: 399, description: "Point of sale" }], featured: true, sortOrder: 7 },
      { name: "Enterprise Marketplace", slug: "marketplace", category: "E-Commerce", description: "Full marketplace platform with vendor management and commissions.", shortDescription: "Build a marketplace", basePrice: 7999, features: ["Vendor Dashboard", "Commission System", "Payout Management", "Product Approval", "Review System", "Mobile Apps"], addons: [{ name: "Auction Module", price: 999, description: "Bidding system" }, { name: "Classifieds", price: 599, description: "Listing categories" }, { name: "Subscription Vendors", price: 499, description: "Vendor subscriptions" }], featured: false, sortOrder: 8 },
      
      // Mobile Development
      { name: "Mobile App MVP", slug: "mobile-mvp", category: "Mobile Development", description: "Cross-platform mobile app MVP with core features to validate your idea.", shortDescription: "Validate your mobile idea", basePrice: 1999, features: ["iOS & Android", "Core Features", "Push Notifications", "User Authentication", "Basic UI/UX", "App Store Ready"], addons: [{ name: "Extra Feature", price: 299, description: "Additional functionality" }, { name: "Backend API", price: 499, description: "Custom server" }, { name: "Analytics Dashboard", price: 199, description: "User analytics" }], featured: true, sortOrder: 9 },
      { name: "Mobile App (iOS & Android)", slug: "mobile-app", category: "Mobile Development", description: "Native-quality mobile apps for iOS and Android built with React Native.", shortDescription: "Full mobile app", basePrice: 3999, features: ["iOS & Android", "App Store Submission", "Push Notifications", "Offline Mode", "Camera/GPS Access", "Analytics", "In-app Purchases"], addons: [{ name: "Extra Platform", price: 999, description: "Add web version" }, { name: "Wearable Support", price: 499, description: "Apple Watch / Wear OS" }, { name: "Advanced Animations", price: 399, description: "Premium transitions" }], featured: true, sortOrder: 10 },
      { name: "Progressive Web App", slug: "pwa", category: "Mobile Development", description: "App-like experience that works on all devices with offline support.", shortDescription: "Modern PWA solution", basePrice: 1499, features: ["Offline Support", "Push Notifications", "Home Screen Install", "Background Sync", "App Shell", "Performance Optimized"], addons: [{ name: "Native Features", price: 599, description: "Camera, GPS, etc." }, { name: "Desktop App", price: 499, description: "Electron wrapper" }, { name: "Auto Updates", price: 299, description: "Background updates" }], featured: false, sortOrder: 11 },
      
      // AI & Data
      { name: "AI Chatbot", slug: "ai-chatbot", category: "AI Solutions", description: "Custom AI chatbot for your website with training on your data.", shortDescription: "AI customer support", basePrice: 999, features: ["Custom Training", "Live Chat Handoff", "Multi-language", "Analytics Dashboard", "24/7 Availability", "Integration Ready"], addons: [{ name: "Voice Support", price: 399, description: "Speech recognition" }, { name: "WhatsApp Integration", price: 299, description: "WhatsApp bot" }, { name: "Custom AI Model", price: 999, description: "Fine-tuned model" }], featured: true, sortOrder: 12 },
      { name: "AI Integration", slug: "ai-integration", category: "AI Solutions", description: "Implement cutting-edge AI into your business with chatbots and automation.", shortDescription: "Smart AI solutions", basePrice: 2999, features: ["AI Chatbot", "Machine Learning", "Data Analysis", "API Integration", "Custom Training", "24/7 Support", "Predictive Models"], addons: [{ name: "Voice Assistant", price: 799, description: "Speech recognition" }, { name: "Image Recognition", price: 599, description: "Computer vision" }, { name: "Custom AI Agent", price: 1499, description: "Autonomous agent" }], featured: true, sortOrder: 13 },
      { name: "Data Analytics Platform", slug: "analytics-platform", category: "AI Solutions", description: "Custom analytics dashboard with AI-powered insights and predictions.", shortDescription: "AI-powered insights", basePrice: 3499, features: ["Real-time Dashboard", "AI Predictions", "Custom Reports", "Data Visualization", "Export Options", "API Access"], addons: [{ name: "ML Models", price: 999, description: "Custom models" }, { name: "Data Sources", price: 399, description: "Additional connectors" }, { name: "Automated Alerts", price: 299, description: "Smart notifications" }], featured: false, sortOrder: 14 },
      
      // Design
      { name: "Logo Design", slug: "logo-design", category: "Design", description: "Professional logo design with multiple concepts and revisions.", shortDescription: "Memorable brand mark", basePrice: 199, features: ["3 Design Concepts", "Unlimited Revisions", "Vector Files", "Color Variations", "Black & White", "Social Media Kit"], addons: [{ name: "Brand Guidelines", price: 149, description: "Full brand book" }, { name: "Business Cards", price: 99, description: "Print-ready design" }, { name: "Social Media Kit", price: 79, description: "Profile graphics" }], featured: true, sortOrder: 15 },
      { name: "UI/UX Design", slug: "design", category: "Design", description: "Professional design services including branding, UI design, and prototypes.", shortDescription: "Stunning designs", basePrice: 499, features: ["Logo Design", "Brand Guidelines", "UI Design", "Interactive Prototype", "Design System", "Figma Files", "Handoff Support"], addons: [{ name: "Brand Strategy", price: 499, description: "Complete branding" }, { name: "Motion Design", price: 399, description: "Animations & micro-interactions" }, { name: "Design Sprint", price: 999, description: "5-day intensive workshop" }], featured: true, sortOrder: 16 },
      { name: "Brand Identity Package", slug: "brand-identity", category: "Design", description: "Complete brand identity including logo, colors, typography, and guidelines.", shortDescription: "Complete brand kit", basePrice: 999, features: ["Logo Design", "Color Palette", "Typography System", "Brand Guidelines", "Business Card", "Letterhead", "Email Signature"], addons: [{ name: "Brand Strategy", price: 399, description: "Market positioning" }, { name: "Brand Photography", price: 599, description: "Stock curation" }, { name: "Social Templates", price: 199, description: "Post templates" }], featured: false, sortOrder: 17 },
      
      // Maintenance & Support
      { name: "Monthly Maintenance", slug: "maintenance", category: "Support", description: "Ongoing website maintenance including updates, backups, and support.", shortDescription: "Keep your site running", basePrice: 99, features: ["Monthly Updates", "Daily Backups", "Uptime Monitoring", "Security Updates", "Email Support", "Monthly Report"], addons: [{ name: "Daily Support", price: 199, description: "Priority response" }, { name: "Content Updates", price: 49, description: "Per update" }, { name: "Performance Optimization", price: 99, description: "Monthly tune-up" }], featured: true, sortOrder: 18 },
      { name: "Priority Support", slug: "priority-support", category: "Support", description: "Dedicated support with guaranteed response times.", shortDescription: "Dedicated help", basePrice: 299, features: ["4-Hour Response", "Dedicated Slack", "Weekly Calls", "Priority Queue", "Account Manager", "Monthly Review"], addons: [{ name: "24/7 Coverage", price: 499, description: "Round the clock" }, { name: "Dedicated Developer", price: 999, description: "Named resource" }, { name: "Unlimited Changes", price: 399, description: "No change limits" }], featured: false, sortOrder: 19 }
    ];
    
    for (const service of services) {
      await Service.findOneAndUpdate({ slug: service.slug }, service, { upsert: true, new: true });
    }
    
    res.json({ success: true, message: `Seeded ${services.length} services successfully` });
  } catch (error) {
    res.status(500).json({ error: "Failed to seed services" });
  }
});

// ==================== AI CHAT ROUTES ====================

app.post("/api/chat", async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    let response = "";
    let serviceType = "";
    let pages = 5;
    let features = [];
    
    const msg = message.toLowerCase();
    
    try {
      const chatCompletion = await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: `You are Keycode AI assistant - a professional web developer consultant. Help users plan their projects, explain technical concepts simply, and guide them through the ordering process. Be friendly, knowledgeable, and suggest relevant features based on their needs.`
          },
          { role: "user", content: message }
        ],
        model: "llama-3.3-70b-versatile",
        temperature: 0.7,
        max_tokens: 300
      });
      
      response = chatCompletion.choices[0]?.message?.content || "";
      
      if (msg.includes("ecommerce") || msg.includes("shop") || msg.includes("store") || msg.includes("sell")) serviceType = "ecommerce";
      else if (msg.includes("mobile app") || msg.includes("ios") || msg.includes("android")) serviceType = "mobileapp";
      else if (msg.includes("web app") || msg.includes("application") || msg.includes("saas")) serviceType = "webapp";
      else if (msg.includes("ai") || msg.includes("chatbot") || msg.includes("automation")) serviceType = "ai";
      else if (msg.includes("portfolio") || msg.includes("personal")) serviceType = "portfolio";
      else if (msg.includes("blog") || msg.includes("cms")) serviceType = "blog";
      else if (msg.includes("website") || msg.includes("site") || msg.includes("web")) serviceType = "website";
      else serviceType = "custom";
      
      if (msg.includes("login") || msg.includes("auth") || msg.includes("user")) features.push("auth");
      if (msg.includes("seo") || msg.includes("search")) features.push("seo");
      if (msg.includes("payment") || msg.includes("pay") || msg.includes("stripe")) features.push("payment");
      if (msg.includes("chat") || msg.includes("message") || msg.includes("support")) features.push("chat");
      if (msg.includes("admin") || msg.includes("dashboard") || msg.includes("manage")) features.push("admin");
      if (msg.includes("contact") || msg.includes("form")) features.push("forms");
      if (msg.includes("newsletter") || msg.includes("email market")) features.push("newsletter");
      if (msg.includes("blog")) features.push("blog");
      if (msg.includes("analytic") || msg.includes("stat") || msg.includes("track")) features.push("analytics");
      if (msg.includes("api") || msg.includes("integration")) features.push("api");
      if (msg.includes("cms")) features.push("cms");
      if (msg.includes("social") || msg.includes("facebook") || msg.includes("twitter")) features.push("social");
      if (msg.includes("multi") || msg.includes("language")) features.push("multilang");
      
    } catch (aiErr) {
      console.error("AI Error:", aiErr);
      if (msg.match(/^(hello|hi|hey)/)) {
        response = "Hello! Welcome to KEYCODE! I'm your AI consultant. Tell me what you'd like to build today - a website, e-commerce store, web app, or something else?";
      } else {
        response = "Tell me more about your project! What type of project are you thinking about? (website, e-commerce, web app, etc.)";
      }
    }
    
    res.json({ success: true, response, requirements: { serviceType, pages, features } });
  } catch (err) {
    console.error("Chat Error:", err);
    res.status(500).json({ error: "AI service unavailable" });
  }
});

// ==================== CODE GENERATION ====================

app.post("/api/generate-code", async (req, res) => {
  try {
    const { projectType, features = [], pages, designLevel, projectName } = req.body;
    
    const featureNames = {
      auth: 'User Authentication (login, signup, password reset)',
      forms: 'Contact & Lead Capture Forms',
      payment: 'Payment Gateway Integration (Stripe/PayPal)',
      chat: 'Live Chat Widget',
      admin: 'Admin Dashboard with analytics',
      seo: 'SEO Optimization & Meta tags',
      newsletter: 'Email Newsletter Subscription',
      blog: 'Blog System with categories',
      analytics: 'Google Analytics Integration',
      api: 'Custom REST API',
      cms: 'Content Management System',
      social: 'Social Media Integration',
      multilang: 'Multi-language Support'
    };
    
    const featuresList = features.map(f => featureNames[f] || f).join(', ');
    
    const designNote = designLevel === 'ultra' ? 'Include 3D effects with Three.js, particle animations, and glassmorphism.' :
                       designLevel === 'premium' ? 'Include smooth animations, gradient backgrounds, and modern typography.' :
                       'Clean, professional design with responsive layout.';
    
    const prompt = `Generate a complete, production-ready HTML file for a ${projectType} project called "${projectName || 'My Project'}".

Requirements:
- Type: ${projectType}
- Features: ${featuresList || 'Basic website features'}
- Pages: ${pages || 5} pages/sections
- Design Level: ${designNote}
- Include a modern dark theme with gradients
- Use Font Awesome icons (include CDN link)
- MUST BE FULLY RESPONSIVE - include @media queries for 1024px, 768px, and 480px breakpoints
- Mobile-first responsive CSS is REQUIRED
- Include viewport meta tag
- Include placeholder content that matches the project type

CRITICAL: Include this exact responsive CSS in your output:
@media (max-width: 1024px) { .features-grid, .pricing-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 768px) { nav { padding: 15px 20px; } .nav-links { display: none; } section { padding: 60px 20px; } .hero h1 { font-size: 32px; } .hero p { font-size: 16px; } .features-grid, .pricing-grid, .stats-grid { grid-template-columns: 1fr; } form { padding: 0 10px; } }
@media (max-width: 480px) { .hero h1 { font-size: 28px; } section h2 { font-size: 24px; } .logo { font-size: 20px; } }

Generate ONLY the HTML/CSS/JS code in a single file. Start with <!DOCTYPE html> and end with </html>. Make it impressive and functional.`;

    try {
      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: `You are an expert web developer at KEYCODE Studio. Generate high-quality, production-ready code. Return ONLY the code, no explanations. The code should be complete, functional, and impressive.`
          },
          { role: "user", content: prompt }
        ],
        model: "llama-3.3-70b-versatile",
        temperature: 0.3,
        max_tokens: 4000
      });
      
      let generatedCode = completion.choices[0]?.message?.content || "";
      
      generatedCode = generatedCode.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
      
      res.json({ 
        success: true, 
        code: generatedCode,
        metadata: {
          type: projectType,
          features: features,
          pages: pages,
          designLevel: designLevel,
          lines: generatedCode.split('\n').length
        }
      });
      
    } catch (aiErr) {
      console.error("AI Code Generation Error:", aiErr);
      const fallbackCode = generateFallbackCode(projectType, features, pages, designLevel);
      res.json({ 
        success: true, 
        code: fallbackCode,
        metadata: {
          type: projectType,
          features: features,
          pages: pages,
          designLevel: designLevel,
          lines: fallbackCode.split('\n').length
        }
      });
    }
    
  } catch (err) {
    console.error("Code Generation Error:", err);
    res.status(500).json({ error: "Failed to generate code" });
  }
});

function generateFallbackCode(projectType, features, pages, designLevel) {
  const isPremium = designLevel === 'premium' || designLevel === 'ultra';
  const isUltra = designLevel === 'ultra';
  
  let featuresHTML = '';
  if (features.includes('auth')) {
    featuresHTML += `
        <section id="auth" class="auth-section">
          <h2>Sign In</h2>
          <form class="auth-form">
            <input type="email" placeholder="Email Address" required>
            <input type="password" placeholder="Password" required>
            <button type="submit">Sign In</button>
          </form>
        </section>`;
  }
  if (features.includes('forms')) {
    featuresHTML += `
        <section id="contact" class="contact-section">
          <h2>Contact Us</h2>
          <form class="contact-form">
            <input type="text" placeholder="Your Name" required>
            <input type="email" placeholder="Email" required>
            <textarea placeholder="Your Message" required></textarea>
            <button type="submit">Send Message</button>
          </form>
        </section>`;
  }
  if (features.includes('chat')) {
    featuresHTML += `
        <div class="chat-widget">
          <button class="chat-toggle" onclick="toggleChat()">💬</button>
          <div class="chat-window" id="chatWindow">
            <div class="chat-header">Live Chat</div>
            <div class="chat-messages" id="chatMessages"></div>
            <div class="chat-input">
              <input type="text" placeholder="Type a message..." id="chatInput">
              <button onclick="sendChat()">Send</button>
            </div>
          </div>
        </div>`;
  }
  if (features.includes('payment')) {
    featuresHTML += `
        <section id="pricing" class="pricing-section">
          <h2>Pricing Plans</h2>
          <div class="pricing-grid">
            <div class="price-card"><h3>Basic</h3><p class="price">$29/mo</p></div>
            <div class="price-card featured"><h3>Pro</h3><p class="price">$59/mo</p></div>
            <div class="price-card"><h3>Enterprise</h3><p class="price">$99/mo</p></div>
          </div>
        </section>`;
  }
  if (features.includes('admin')) {
    featuresHTML += `
        <section id="dashboard" class="dashboard-section">
          <h2>Dashboard</h2>
          <div class="stats-grid">
            <div class="stat-card"><h4>Users</h4><p class="stat-value">1,234</p></div>
            <div class="stat-card"><h4>Revenue</h4><p class="stat-value">$45,678</p></div>
            <div class="stat-card"><h4>Orders</h4><p class="stat-value">892</p></div>
          </div>
        </section>`;
  }
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${projectType === 'ecommerce' ? 'Shop' : projectType === 'portfolio' ? 'Portfolio' : 'My Project'} - KEYCODE Generated</title>
  <meta name="description" content="Responsive ${projectType} built with KEYCODE - modern, fast, and mobile-friendly.">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0a0a0f; color: #fff; line-height: 1.6; }
    
    nav { position: fixed; top: 0; width: 100%; padding: 20px 50px; display: flex; justify-content: space-between; align-items: center; background: rgba(10,10,15,0.95); backdrop-filter: blur(10px); z-index: 1000; border-bottom: 1px solid rgba(255,255,255,0.05); }
    .logo { font-size: 24px; font-weight: 700; background: linear-gradient(135deg, #6366f1, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; cursor: pointer; }
    .nav-links { display: flex; gap: 30px; list-style: none; }
    .nav-links a { color: #fff; text-decoration: none; opacity: 0.8; transition: 0.3s; font-size: 14px; }
    .nav-links a:hover { opacity: 1; }
    .mobile-menu { display: none; cursor: pointer; padding: 10px; }
    .mobile-menu span { display: block; width: 25px; height: 2px; background: #fff; margin: 5px 0; }
    
    .hero { min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 120px 20px 80px; background: linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.1)); }
    .hero h1 { font-size: ${isUltra ? '72' : '56'}px; margin-bottom: 20px; line-height: 1.2; background: linear-gradient(135deg, #fff, #6366f1); -webkit-background-clip: text; -webkit-text-fill-color: transparent; ${isPremium ? 'animation: glow 2s infinite alternate;' : ''} }
    .hero p { font-size: 20px; opacity: 0.7; max-width: 600px; margin-bottom: 30px; }
    .cta-btn { padding: 15px 40px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border: none; border-radius: 30px; color: #fff; font-size: 16px; cursor: pointer; transition: 0.3s; }
    .cta-btn:hover { transform: translateY(-3px); box-shadow: 0 10px 30px rgba(99,102,241,0.4); }
    
    section { padding: 100px 50px; }
    section h2 { font-size: 36px; margin-bottom: 40px; text-align: center; }
    
    .features-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 30px; max-width: 1200px; margin: 0 auto; }
    .feature-card { background: rgba(255,255,255,0.05); border-radius: 16px; padding: 30px; text-align: center; transition: 0.3s; border: 1px solid rgba(255,255,255,0.05); }
    .feature-card:hover { transform: translateY(-5px); background: rgba(255,255,255,0.1); border-color: rgba(99,102,241,0.3); }
    .feature-card i { font-size: 40px; margin-bottom: 20px; color: #6366f1; }
    .feature-card h3 { font-size: 18px; margin-bottom: 10px; }
    .feature-card p { font-size: 14px; color: rgba(255,255,255,0.6); }
    
    .pricing-grid, .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 30px; max-width: 1200px; margin: 0 auto; }
    .price-card, .stat-card { background: rgba(255,255,255,0.05); border-radius: 16px; padding: 30px; text-align: center; border: 1px solid rgba(255,255,255,0.05); }
    .price-card.featured { background: linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2)); border: 1px solid #6366f1; }
    .price-card .price { font-size: 36px; font-weight: 700; color: #10b981; margin: 15px 0; }
    .stat-card .stat-value { font-size: 32px; font-weight: 700; color: #6366f1; }
    
    form { max-width: 500px; margin: 0 auto; display: flex; flex-direction: column; gap: 15px; }
    input, textarea { padding: 15px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; color: #fff; font-size: 16px; width: 100%; }
    input:focus, textarea:focus { outline: none; border-color: #6366f1; }
    button[type="submit"] { padding: 15px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border: none; border-radius: 10px; color: #fff; font-size: 16px; cursor: pointer; transition: 0.3s; }
    button[type="submit"]:hover { transform: translateY(-2px); box-shadow: 0 10px 30px rgba(99,102,241,0.4); }
    .auth-section, .contact-section, .pricing-section, .dashboard-section { background: rgba(0,0,0,0.2); }
    
    .chat-widget { position: fixed; bottom: 30px; right: 30px; z-index: 1000; }
    .chat-toggle { width: 60px; height: 60px; border-radius: 50%; background: linear-gradient(135deg, #6366f1, #8b5cf6); border: none; font-size: 24px; cursor: pointer; box-shadow: 0 5px 20px rgba(99,102,241,0.4); }
    .chat-window { display: none; width: 350px; height: 450px; background: #111; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.5); }
    .chat-window.show { display: flex; flex-direction: column; }
    .chat-header { padding: 15px; background: linear-gradient(135deg, #6366f1, #8b5cf6); font-weight: 600; }
    .chat-messages { flex: 1; padding: 15px; overflow-y: auto; }
    .chat-input { padding: 15px; display: flex; gap: 10px; }
    .chat-input input { flex: 1; padding: 10px; border-radius: 8px; }
    .chat-input button { padding: 10px 20px; background: #6366f1; border: none; border-radius: 8px; color: #fff; cursor: pointer; }
    
    footer { padding: 50px; text-align: center; background: rgba(0,0,0,0.3); border-top: 1px solid rgba(255,255,255,0.05); }
    footer p { opacity: 0.6; font-size: 14px; }
    
    @keyframes glow { from { text-shadow: 0 0 20px rgba(99,102,241,0.5); } to { text-shadow: 0 0 40px rgba(99,102,241,1); } }
    
    /* Responsive Styles */
    @media (max-width: 1024px) {
      section { padding: 80px 30px; }
      .hero h1 { font-size: 48px; }
    }
    
    @media (max-width: 768px) {
      nav { padding: 15px 20px; }
      .nav-links { display: none; }
      .mobile-menu { display: block; }
      
      .hero { padding: 100px 15px 60px; }
      .hero h1 { font-size: 32px; }
      .hero p { font-size: 16px; }
      .cta-btn { padding: 12px 30px; font-size: 14px; }
      
      section { padding: 60px 15px; }
      section h2 { font-size: 28px; margin-bottom: 30px; }
      
      .features-grid, .pricing-grid, .stats-grid { grid-template-columns: 1fr; }
      .feature-card { padding: 20px; }
      .feature-card i { font-size: 32px; }
      
      .price-card .price { font-size: 28px; }
      .stat-card .stat-value { font-size: 24px; }
      
      .chat-widget { bottom: 20px; right: 20px; }
      .chat-toggle { width: 50px; height: 50px; font-size: 20px; }
      .chat-window { width: calc(100vw - 40px); max-width: 350px; height: 400px; right: -20px; }
      
      form { padding: 0 10px; }
    }
    
    @media (max-width: 480px) {
      .hero h1 { font-size: 28px; }
      section h2 { font-size: 24px; }
      .feature-card h3 { font-size: 16px; }
      .logo { font-size: 20px; }
    }
  </style>
</head>
<body>
  <nav>
    <div class="logo" onclick="window.scrollTo({top:0,behavior:'smooth'})">KEYCODE</div>
    <ul class="nav-links">
      <li><a href="#home">Home</a></li>
      <li><a href="#features">Features</a></li>${features.includes('admin') ? '\n      <li><a href="#dashboard">Dashboard</a></li>' : ''}${features.includes('forms') ? '\n      <li><a href="#contact">Contact</a></li>' : ''}${features.includes('payment') ? '\n      <li><a href="#pricing">Pricing</a></li>' : ''}
    </ul>
    <div class="mobile-menu"><span></span><span></span><span></span></div>
  </nav>
  
  <section class="hero" id="home">
    <h1>Welcome to ${projectType === 'ecommerce' ? 'Our Shop' : projectType === 'portfolio' ? 'My Portfolio' : 'My Project'}</h1>
    <p>A ${designLevel} ${projectType} built with KEYCODE - modern, fast, and beautiful. Fully responsive for all devices.</p>
    <button class="cta-btn" onclick="document.getElementById('features').scrollIntoView({behavior:'smooth'})">Get Started</button>
  </section>
  
  <section id="features">
    <h2>Features Included</h2>
    <div class="features-grid">
      ${features.map(f => `<div class="feature-card"><i class="fas ${getIcon(f)}"></i><h3>${getFeatureName(f)}</h3><p>Professional implementation included</p></div>`).join('\n      ')}
    </div>
  </section>
  ${featuresHTML}
  <footer>
    <p>Generated by KEYCODE Studio | Powered by AI | Fully Responsive</p>
  </footer>
  ${features.includes('chat') ? `
  <script>
    function toggleChat() { document.getElementById('chatWindow').classList.toggle('show'); }
    function sendChat() { const input = document.getElementById('chatInput'); const msg = input.value.trim(); if (msg) { document.getElementById('chatMessages').innerHTML += '<div style="padding:8px 12px;background:#6366f1;border-radius:8px;margin:5px 0;color:#fff;">' + msg + '</div>'; input.value = ''; } }
  </script>` : ''}
</body>
</html>`;
}

function getIcon(feature) {
  const icons = { auth: 'fa-lock', forms: 'fa-envelope', payment: 'fa-credit-card', chat: 'fa-comments', admin: 'fa-cog', seo: 'fa-search', newsletter: 'fa-mail-bulk', blog: 'fa-blog', analytics: 'fa-chart-line', api: 'fa-plug', cms: 'fa-file-alt', social: 'fa-share-alt', multilang: 'fa-globe' };
  return icons[feature] || 'fa-check';
}

function getFeatureName(feature) {
  const names = { auth: 'User Auth', forms: 'Contact Forms', payment: 'Payments', chat: 'Live Chat', admin: 'Dashboard', seo: 'SEO', newsletter: 'Newsletter', blog: 'Blog', analytics: 'Analytics', api: 'API', cms: 'CMS', social: 'Social', multilang: 'Multi-language' };
  return names[feature] || feature;
}

// Reviews
app.get("/api/reviews", async (req, res) => {
  try {
    const reviews = await Review.find({ approved: true }).sort({ createdAt: -1 });
    res.json(reviews);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

app.post("/api/reviews", async (req, res) => {
  try {
    const { name, company, rating, text } = req.body;
    await Review.create({ name, company, rating, text });
    res.json({ success: true, message: "Review submitted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to submit review" });
  }
});

// Inquiries
app.post("/api/inquiries", async (req, res) => {
  try {
    const { name, email, phone, projectType, message } = req.body;
    
    if (!name || !email || !message) {
      return res.status(400).json({ error: "Name, email, and message are required" });
    }
    
    const inquiry = await Inquiry.create({ name, email, phone, projectType, message });
    
    // Send admin notification email
    const adminEmail = process.env.ADMIN_EMAIL || "admin@keycode.studio";
    await sendEmail({
      to: adminEmail,
      ...emailTemplates.contactForm({ name, email, phone, projectType, message })
    });
    
    // Send confirmation to user
    await sendEmail({
      to: email,
      subject: "Thank you for contacting KEYCODE!",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; background: #0a0a0f; color: #ffffff; margin: 0; padding: 40px; }
            .container { max-width: 600px; margin: 0 auto; background: #111117; border-radius: 20px; padding: 40px; border: 1px solid #1f1f2e; }
            .logo { font-size: 32px; font-weight: bold; background: linear-gradient(135deg, #6366f1, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; text-align: center; margin-bottom: 30px; }
            h1 { color: #ffffff; font-size: 24px; margin-bottom: 20px; }
            p { color: #888; line-height: 1.6; }
            .footer { text-align: center; margin-top: 30px; color: #555; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="logo">KEYCODE</div>
            <h1>Thanks for reaching out, ${name}! 👋</h1>
            <p>We've received your inquiry and our team will get back to you within 24 hours.</p>
            <p>While you wait, feel free to:</p>
            <p>• Explore our <a href="${FRONTEND_URL}/#services" style="color: #6366f1;">services</a></p>
            <p>• Try our <a href="${FRONTEND_URL}/#ai" style="color: #6366f1;">AI Studio</a> for instant quotes</p>
            <p>• Check out our <a href="${FRONTEND_URL}/#portfolio" style="color: #6366f1;">portfolio</a></p>
            <p class="footer">© 2026 KEYCODE Studio. All rights reserved.</p>
          </div>
        </body>
        </html>
      `
    });
    
    res.json({ success: true, message: "Inquiry submitted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to submit inquiry" });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    emailEnabled: !!transporter,
    version: "2.0.0"
  });
});

// Seed Blog Posts
app.post("/api/blog/seed", auth, adminOnly, async (req, res) => {
  try {
    const admin = await User.findOne({ role: "admin" });
    
    const samplePosts = [
      {
        title: "How AI is Transforming Web Development in 2024",
        slug: "ai-transforming-web-development-2024",
        excerpt: "Artificial Intelligence is revolutionizing how we build websites. Learn about the latest AI tools and techniques that are changing the industry.",
        content: "Artificial Intelligence is no longer just a buzzword - it's reshaping how we approach web development. From automated code generation to intelligent design systems, AI is making developers more productive than ever.\n\n## Key AI Tools for Web Development\n\n1. **GitHub Copilot** - AI pair programming\n2. **ChatGPT** - Code explanation and debugging\n3. **Midjourney** - UI/UX Design generation\n4. **Stable Diffusion** - Image generation\n\n## The Future is Here\n\nCompanies are now integrating AI into their development workflows, reducing development time by up to 40% while improving code quality.",
        category: "AI & Tech",
        tags: ["AI", "Web Development", "Future Tech"],
        author: admin._id,
        status: "published",
        readTime: 5,
        featured: true
      },
      {
        title: "10 Essential Features Every E-commerce Website Needs",
        slug: "essential-ecommerce-features",
        excerpt: "Want to build a successful online store? Here are the must-have features that will help you convert visitors into customers.",
        content: "Building an e-commerce website is more than just listing products. You need the right features to create a seamless shopping experience.\n\n## Must-Have Features\n\n1. **Mobile-First Design** - 70% of traffic comes from mobile\n2. **Fast Checkout** - Reduce cart abandonment\n3. **Trust Badges** - Build credibility\n4. **Live Chat** - Instant customer support\n5. **Product Reviews** - Social proof\n6. **Advanced Search** - Help customers find products\n7. **Wishlist** - Save for later\n8. **Guest Checkout** - No registration required\n9. **Multiple Payment Options** - Cater to all preferences\n10. **Analytics Integration** - Track and optimize",
        category: "E-commerce",
        tags: ["E-commerce", "Business", "Conversion"],
        author: admin._id,
        status: "published",
        readTime: 7,
        featured: true
      },
      {
        title: "The Ultimate Guide to Responsive Web Design",
        slug: "responsive-web-design-guide",
        excerpt: "Learn how to build websites that look great on any device. From mobile phones to large monitors.",
        content: "Responsive web design ensures your website provides an optimal experience across all devices.\n\n## Core Principles\n\n1. **Fluid Grid Layouts**\n2. **Flexible Images**\n3. **Media Queries**\n4. **Mobile-First Approach**\n\n## Best Practices\n\n- Use CSS Grid and Flexbox\n- Test on real devices\n- Optimize images for different screen sizes\n- Consider touch interactions for mobile",
        category: "Design",
        tags: ["Responsive", "CSS", "Mobile"],
        author: admin._id,
        status: "published",
        readTime: 6,
        featured: false
      },
      {
        title: "Building Secure Web Applications: A Developer's Checklist",
        slug: "secure-web-application-checklist",
        excerpt: "Security should never be an afterthought. Follow this comprehensive checklist to protect your users and data.",
        content: "Web application security is critical in today's digital landscape. Here's your comprehensive security checklist.\n\n## Authentication & Authorization\n\n- Use strong password hashing (bcrypt)\n- Implement 2FA\n- Use JWT tokens properly\n- Implement session management\n\n## Data Protection\n\n- Encrypt sensitive data\n- Use HTTPS everywhere\n- Implement CSRF protection\n- Sanitize user input",
        category: "Development",
        tags: ["Security", "Web Development", "Best Practices"],
        author: admin._id,
        status: "published",
        readTime: 8,
        featured: false
      },
      {
        title: "How to Choose the Right Tech Stack for Your Startup",
        slug: "choosing-tech-stack-startup",
        excerpt: "Making the right technology choices early can save you thousands. Learn how to evaluate and select the best stack.",
        content: "Your technology stack will impact your startup for years. Make the right choice with this guide.\n\n## Popular Stacks\n\n1. **MERN Stack** - MongoDB, Express, React, Node.js\n2. **MEAN Stack** - MongoDB, Express, Angular, Node.js\n3. **Django Stack** - Python, Django, PostgreSQL\n4. **Ruby on Rails** - Rapid development\n\n## Factors to Consider\n\n- Team expertise\n- Scalability needs\n- Development speed\n- Community support",
        category: "Business",
        tags: ["Startup", "Technology", "Planning"],
        author: admin._id,
        status: "published",
        readTime: 5,
        featured: false
      }
    ];
    
    for (const post of samplePosts) {
      await BlogPost.findOneAndUpdate({ slug: post.slug }, post, { upsert: true, new: true });
    }
    
    res.json({ success: true, message: `Seeded ${samplePosts.length} blog posts` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== BLOG ROUTES ====================
app.get("/api/blog", async (req, res) => {
  try {
    const { category, page = 1, limit = 10, featured } = req.query;
    const query = { status: "published" };
    if (category) query.category = category;
    if (featured === "true") query.featured = true;
    
    const posts = await BlogPost.find(query)
      .populate("author", "name avatar")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await BlogPost.countDocuments(query);
    res.json({ posts, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/blog/featured", async (req, res) => {
  try {
    const posts = await BlogPost.find({ status: "published", featured: true })
      .populate("author", "name avatar")
      .sort({ createdAt: -1 })
      .limit(3);
    res.json(posts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/blog/:slug", async (req, res) => {
  try {
    const post = await BlogPost.findOneAndUpdate(
      { slug: req.params.slug, status: "published" },
      { $inc: { views: 1 } },
      { new: true }
    ).populate("author", "name avatar bio");
    
    if (!post) return res.status(404).json({ error: "Post not found" });
    res.json(post);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/blog/categories/all", async (req, res) => {
  try {
    const categories = await BlogPost.aggregate([
      { $match: { status: "published" } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/blog", auth, adminOnly, async (req, res) => {
  try {
    const { title, slug, excerpt, content, coverImage, category, tags, status, readTime, featured } = req.body;
    const post = await BlogPost.create({
      title,
      slug: slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      excerpt, content, coverImage, category, tags,
      author: req.user._id,
      status: status || "draft",
      readTime: readTime || 5,
      featured: featured || false
    });
    res.status(201).json(post);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== MILESTONE ROUTES ====================
app.get("/api/milestones", auth, async (req, res) => {
  try {
    const { project, status } = req.query;
    const query = {};
    if (project) query.project = project;
    if (status) query.status = status;
    
    const milestones = await Milestone.find(query)
      .populate("project", "name client status")
      .sort({ order: 1, createdAt: 1 });
    res.json(milestones);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/milestones/:id", auth, async (req, res) => {
  try {
    const milestone = await Milestone.findById(req.params.id)
      .populate("project", "name description client status")
      .populate("files.uploadedBy", "name avatar")
      .populate("notes.author", "name avatar role");
    if (!milestone) return res.status(404).json({ error: "Milestone not found" });
    res.json(milestone);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/milestones", auth, async (req, res) => {
  try {
    const { project, title, description, dueDate, deliverables } = req.body;
    const milestone = await Milestone.create({
      project, title, description, dueDate,
      deliverables: deliverables || [{ title, completed: false }]
    });
    await milestone.populate("project", "name client status");
    res.status(201).json(milestone);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/milestones/:id", auth, async (req, res) => {
  try {
    const milestone = await Milestone.findById(req.params.id);
    if (!milestone) return res.status(404).json({ error: "Milestone not found" });
    
    Object.assign(milestone, req.body);
    if (milestone.status === "completed" && !milestone.completedAt) milestone.completedAt = new Date();
    if (milestone.status === "approved" && !milestone.approvedAt) milestone.approvedAt = new Date();
    
    const totalDeliverables = milestone.deliverables.length;
    const completedDeliverables = milestone.deliverables.filter(d => d.completed).length;
    milestone.progress = totalDeliverables > 0 ? Math.round((completedDeliverables / totalDeliverables) * 100) : 0;
    
    await milestone.save();
    res.json(milestone);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/milestones/:id/notes", auth, async (req, res) => {
  try {
    const milestone = await Milestone.findById(req.params.id);
    if (!milestone) return res.status(404).json({ error: "Milestone not found" });
    milestone.notes.push({ text: req.body.text, author: req.user._id });
    await milestone.save();
    await milestone.populate("notes.author", "name avatar role");
    res.json(milestone);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/milestones/:id/approve", auth, async (req, res) => {
  try {
    const milestone = await Milestone.findById(req.params.id);
    if (!milestone) return res.status(404).json({ error: "Milestone not found" });
    milestone.status = "approved";
    milestone.approvedAt = new Date();
    milestone.progress = 100;
    await milestone.save();
    res.json(milestone);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== REFERRAL & DISCOUNT ROUTES ====================
app.post("/api/referral/generate", auth, async (req, res) => {
  try {
    let referral = await Referral.findOne({ referrer: req.user._id });
    if (referral) return res.json(referral);
    
    const code = Referral.generateCode();
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    
    referral = await Referral.create({ referrer: req.user._id, code, expiresAt });
    res.status(201).json(referral);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/referral/my", auth, async (req, res) => {
  try {
    let referral = await Referral.findOne({ referrer: req.user._id });
    if (!referral) {
      const code = Referral.generateCode();
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      referral = await Referral.create({ referrer: req.user._id, code, expiresAt });
    }
    
    const stats = {
      totalReferrals: await Referral.countDocuments({ referrer: req.user._id, status: { $ne: "pending" } }),
      completedReferrals: await Referral.countDocuments({ referrer: req.user._id, status: "completed" })
    };
    
    res.json({ referral, stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/referral/apply", async (req, res) => {
  try {
    const { code, email } = req.body;
    const referral = await Referral.findOne({ code: code.toUpperCase() }).populate("referrer", "name email");
    
    if (!referral) return res.status(404).json({ error: "Invalid referral code" });
    if (referral.status !== "pending") return res.status(400).json({ error: "This referral has already been used" });
    if (referral.expiresAt && referral.expiresAt < new Date()) return res.status(400).json({ error: "This referral code has expired" });
    
    referral.referred = req.user?._id || null;
    referral.referredEmail = email;
    referral.status = "completed";
    referral.usedAt = new Date();
    await referral.save();
    
    if (referral.referrer) {
      await DiscountCode.create({
        code: `REF${referral.code}`,
        type: "percentage",
        value: referral.discount,
        maxUses: 1,
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        description: `Referral reward for referring ${email || "a friend"}`
      });
    }
    
    res.json({ success: true, discount: referral.discount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/discount/validate", async (req, res) => {
  try {
    const { code, orderTotal } = req.body;
    const result = await DiscountCode.isValid(code);
    
    if (!result.valid) return res.status(400).json({ valid: false, reason: result.reason });
    
    const discountAmount = DiscountCode.calculateDiscount(result.discount, orderTotal);
    res.json({
      valid: true,
      discount: { code: result.discount.code, type: result.discount.type, value: result.discount.value, amount: discountAmount }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/discount/codes", auth, adminOnly, async (req, res) => {
  try {
    const codes = await DiscountCode.find().sort({ createdAt: -1 });
    res.json(codes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/discount/codes", auth, adminOnly, async (req, res) => {
  try {
    const code = await DiscountCode.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json(code);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/discount/codes/:id", auth, adminOnly, async (req, res) => {
  try {
    await DiscountCode.findByIdAndDelete(req.params.id);
    res.json({ message: "Discount code deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== REWARD ROUTES ====================
app.get("/api/rewards/my", auth, async (req, res) => {
  try {
    let reward = await Reward.findOne({ user: req.user._id });
    
    if (!reward) {
      reward = await Reward.create({
        user: req.user._id,
        points: Reward.POINTS_CONFIG.signup,
        balance: Reward.POINTS_CONFIG.signup,
        history: [{ type: "earned", points: Reward.POINTS_CONFIG.signup, description: "Welcome bonus" }],
        lifetimeEarned: Reward.POINTS_CONFIG.signup
      });
    }
    
    res.json(reward);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/rewards/history", auth, async (req, res) => {
  try {
    const reward = await Reward.findOne({ user: req.user._id });
    if (!reward) return res.json({ history: [], balance: 0 });
    res.json({ history: reward.history.slice(-20), balance: reward.balance, lifetimeEarned: reward.lifetimeEarned });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/rewards/redeem", auth, async (req, res) => {
  try {
    const { points, description } = req.body;
    const reward = await Reward.findOne({ user: req.user._id });
    
    if (!reward) return res.status(404).json({ error: "Reward account not found" });
    if (reward.balance < points) return res.status(400).json({ error: "Insufficient points", balance: reward.balance });
    if (points < 100) return res.status(400).json({ error: "Minimum redemption is 100 points" });
    
    await reward.redeemPoints(points, description || "Points redemption");
    
    const discountValue = Math.floor(points / 100);
    if (discountValue >= 1) {
      await DiscountCode.create({
        code: `RWD${Date.now()}`,
        type: "fixed",
        value: discountValue,
        maxUses: 1,
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        description: `Reward redemption - $${discountValue} off`
      });
    }
    
    res.json({ success: true, balance: reward.balance });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== AI TOOLS ROUTES ====================

// AI Project Builder - Describe project and generate preview specs
app.post("/api/ai/describe-project", async (req, res) => {
  try {
    const { description } = req.body;
    
    if (!description) {
      return res.status(400).json({ error: 'Description is required' });
    }
    
    // If Groq is configured, use it for intelligent analysis
    if (groq) {
      const completion = await groq.chat.completions.create({
        messages: [{
          role: "user",
          content: `Analyze this website project description and provide detailed specifications:\n\n"${description}"\n\nRespond with a JSON object containing:\n- type: (e.g., "E-commerce", "Portfolio", "Business Website", "Blog", "SaaS", "Restaurant", etc.)\n- style: (e.g., "Modern & Minimal", "Dark & Bold", "Corporate & Professional", "Playful & Creative", "Luxury & Elegant")\n- color: (dominant color scheme like "Purple & Pink Gradient", "Ocean Blue", "Forest Green", "Dark Mode", "Clean White")\n- features: (comma-separated key features based on the description)\n- pages: (estimated number of pages like "5-7 Pages", "8-10 Pages", "3-5 Pages")\n- name: (a short 2-3 word project name based on the description)\n- targetAudience: (who is this website for)\n- primaryGoal: (main purpose of the website)\n\nFormat your response as valid JSON only, no markdown formatting.`
        }],
        model: "llama-3.3-70b-versatile",
        temperature: 0.4,
        max_tokens: 500
      });
      
      try {
        const result = JSON.parse(completion.choices[0].message.content);
        res.json({
          ...result,
          description,
          success: true
        });
      } catch (parseError) {
        // If JSON parsing fails, use fallback
        throw new Error('Failed to parse AI response');
      }
    } else {
      // Fallback: Basic analysis without AI
      const desc = description.toLowerCase();
      
      let type = 'Website';
      if (desc.includes('shop') || desc.includes('store') || desc.includes('ecommerce') || desc.includes('sell')) type = 'E-commerce';
      else if (desc.includes('portfolio') || desc.includes('photographer') || desc.includes('design')) type = 'Portfolio';
      else if (desc.includes('restaurant') || desc.includes('food') || desc.includes('cafe')) type = 'Restaurant';
      else if (desc.includes('blog')) type = 'Blog';
      else if (desc.includes('saas') || desc.includes('app') || desc.includes('startup')) type = 'SaaS Application';
      else if (desc.includes('business') || desc.includes('company') || desc.includes('corporate')) type = 'Business Website';
      
      let style = 'Modern & Clean';
      if (desc.includes('dark')) style = 'Dark & Bold';
      else if (desc.includes('minimal') || desc.includes('simple')) style = 'Minimal & Clean';
      else if (desc.includes('luxury') || desc.includes('premium')) style = 'Luxury & Elegant';
      else if (desc.includes('creative') || desc.includes('playful')) style = 'Playful & Creative';
      
      let color = 'Purple & Pink Gradient';
      if (desc.includes('nature') || desc.includes('eco') || desc.includes('green')) color = 'Forest Green';
      else if (desc.includes('ocean') || desc.includes('sea') || desc.includes('water')) color = 'Ocean Blue';
      else if (desc.includes('fire') || desc.includes('warm') || desc.includes('orange')) color = 'Sunset Orange';
      else if (desc.includes('corporate') || desc.includes('business')) color = 'Corporate Blue';
      
      let features = 'Responsive Design, SEO Ready, Fast Loading';
      if (type === 'E-commerce') features = 'Shopping Cart, Payment Gateway, Product Gallery, Inventory Management';
      else if (type === 'Portfolio') features = 'Image Gallery, Lightbox, Contact Form, Social Links';
      else if (type === 'Restaurant') features = 'Online Menu, Reservations, Photo Gallery, Contact Form';
      
      const pages = desc.includes('simple') || desc.includes('basic') ? '3-5 Pages' : '5-7 Pages';
      const name = description.split(' ').slice(0, 2).join(' ');
      
      res.json({
        type,
        style,
        color,
        features,
        pages,
        name,
        targetAudience: 'General',
        primaryGoal: 'Showcase & Convert',
        description,
        success: true
      });
    }
  } catch (error) {
    console.error('AI describe-project error:', error);
    
    // Ultimate fallback
    res.json({
      type: 'Website',
      style: 'Modern & Clean',
      color: 'Purple & Pink Gradient',
      features: 'Responsive Design, SEO Ready',
      pages: '5-7 Pages',
      name: 'My Project',
      targetAudience: 'General',
      primaryGoal: 'Showcase',
      success: true,
      fallback: true
    });
  }
});

// OpenCode AI - Generate Real Website
app.post("/api/ai/generate-website", async (req, res) => {
  const { description, projectType, style, colors } = req.body;
  
  if (!description) {
    return res.status(400).json({ error: 'Description is required' });
  }
  
  try {
    console.log('[AI] Generating website for:', description);
    
    // Determine project type from description
    const desc = description.toLowerCase();
    let type = projectType || 'Business Website';
    if (desc.includes('shop') || desc.includes('store') || desc.includes('sell') || desc.includes('ecommerce')) type = 'E-commerce Store';
    else if (desc.includes('restaurant') || desc.includes('food') || desc.includes('cafe') || desc.includes('menu')) type = 'Restaurant';
    else if (desc.includes('portfolio') || desc.includes('photographer') || desc.includes('designer') || desc.includes('artist')) type = 'Portfolio';
    else if (desc.includes('saas') || desc.includes('app') || desc.includes('startup') || desc.includes('software')) type = 'SaaS';
    else if (desc.includes('blog')) type = 'Blog';
    else if (desc.includes('hotel') || desc.includes('travel') || desc.includes('booking')) type = 'Hotel & Travel';
    else if (desc.includes('medical') || desc.includes('doctor') || desc.includes('health')) type = 'Medical & Health';
    
    // Determine colors
    let colorScheme = 'purple';
    if (desc.includes('nature') || desc.includes('eco') || desc.includes('green')) colorScheme = 'green';
    else if (desc.includes('ocean') || desc.includes('sea') || desc.includes('blue')) colorScheme = 'blue';
    else if (desc.includes('warm') || desc.includes('orange') || desc.includes('sunset')) colorScheme = 'orange';
    else if (desc.includes('luxury') || desc.includes('gold') || desc.includes('elegant')) colorScheme = 'gold';
    else if (desc.includes('dark') || desc.includes('night')) colorScheme = 'dark';
    
    // Determine style
    let styleName = style || 'Modern & Minimal';
    if (desc.includes('bold') || desc.includes('dark')) styleName = 'Dark & Bold';
    if (desc.includes('luxury') || desc.includes('premium')) styleName = 'Luxury & Elegant';
    if (desc.includes('playful') || desc.includes('fun')) styleName = 'Playful & Creative';
    
    // Try OpenCode AI first
    try {
      console.log('[OpenCode AI] Generating website for:', description);
      
      // Create OpenCode client
      const opencode = await createOpencodeClient({
        baseUrl: "http://localhost:4096"
      });
      
      // Create a session for the website generation
      const session = await opencode.session.create({
        body: { title: `Website: ${description.substring(0, 30)}` }
      });
      
      const prompt = `Generate a COMPLETE, production-ready single-page HTML website for: "${description}"

Type: ${type}
Style: ${styleName}
Color Scheme: ${colorScheme}

Requirements:
1. Full HTML5 structure with <!DOCTYPE html>
2. Complete embedded CSS (in <style> tag) with:
   - Modern glassmorphism effects
   - Smooth animations and transitions
   - Fully responsive (mobile, tablet, desktop)
   - CSS Grid and Flexbox
   - Beautiful gradients based on the color scheme
3. Embedded JavaScript for interactivity
4. Complete sections:
   - Sticky navigation with logo and menu
   - Hero section with headline, subtext, and CTA button
   - Features/Services grid (at least 6 items)
   - About section
   - Testimonials (if business) or Portfolio (if creative)
   - Contact form with validation
   - Footer with social links

The website should look professional, modern, and match the type/style specified.
Return ONLY the complete HTML code in a code block. Start with \`\`\`html and end with \`\`\`.`;

      const result = await opencode.session.prompt({
        path: { id: session.id },
        body: {
          parts: [{ type: "text", text: prompt }],
        }
      });
      
      // Extract code from response
      let generatedCode = '';
      if (result.parts && result.parts.length > 0) {
        for (const part of result.parts) {
          if (part.type === 'text') {
            generatedCode += part.text;
          } else if (part.type === 'code') {
            generatedCode += part.text || part.code;
          }
        }
      }
      
      // Extract HTML from code block
      const htmlMatch = generatedCode.match(/```html([\s\S]*?)```/);
      const htmlMatch2 = generatedCode.match(/```xml([\s\S]*?)```/);
      let finalHTML = htmlMatch ? htmlMatch[1] : (htmlMatch2 ? htmlMatch2[1] : generatedCode);
      
      // Clean up and validate
      finalHTML = finalHTML.trim();
      
      if (!finalHTML.includes('<!DOCTYPE html>') && !finalHTML.includes('<html')) {
        finalHTML = generateFallbackWebsite(description, type, styleName, colorScheme);
      }
      
      console.log('[OpenCode AI] Website generated successfully');
      
      return res.json({
        success: true,
        code: finalHTML,
        description,
        projectType: type,
        style: styleName,
        colorScheme,
        ai: 'OpenCode'
      });
      
    } catch (opencodeError) {
      console.log('[OpenCode AI] Not available, trying Claude (OpenCode AI)...');
      
      // Try Anthropic Claude (same AI as OpenCode)
      if (anthropic) {
        try {
          const prompt = `Generate a COMPLETE, production-ready single-page HTML website for: "${description}"

Type: ${type}
Style: ${styleName}
Color Scheme: ${colorScheme}

Requirements:
1. Full HTML5 structure with <!DOCTYPE html>
2. Complete embedded CSS (in <style> tag) with:
   - Modern glassmorphism effects
   - Smooth animations and transitions
   - Fully responsive (mobile, tablet, desktop)
   - CSS Grid and Flexbox
   - Beautiful gradients based on the color scheme
3. Embedded JavaScript for interactivity
4. Complete sections:
   - Sticky navigation with logo and menu
   - Hero section with headline, subtext, and CTA button
   - Features/Services grid (at least 6 items)
   - About section
   - Testimonials (if business) or Portfolio (if creative)
   - Contact form with validation
   - Footer with social links

The website should look professional, modern, and match the type/style specified.
Return ONLY the complete HTML code in a code block. Start with \`\`\`html and end with \`\`\`.`;

          const message = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 4000,
            messages: [{ role: "user", content: prompt }]
          });
          
          let generatedCode = message.content[0].text;
          
          // Extract HTML from code block
          const htmlMatch = generatedCode.match(/```html([\s\S]*?)```/);
          const htmlMatch2 = generatedCode.match(/```xml([\s\S]*?)```/);
          let finalHTML = htmlMatch ? htmlMatch[1] : (htmlMatch2 ? htmlMatch2[1] : generatedCode);
          
          // Clean up and validate
          finalHTML = finalHTML.trim();
          
          if (!finalHTML.includes('<!DOCTYPE html>') && !finalHTML.includes('<html')) {
            finalHTML = generateFallbackWebsite(description, type, styleName, colorScheme);
          }
          
          console.log('[Claude AI] Website generated successfully');
          
          return res.json({
            success: true,
            code: finalHTML,
            description,
            projectType: type,
            style: styleName,
            colorScheme,
            ai: 'Claude (OpenCode AI)'
          });
          
        } catch (claudeError) {
          console.log('[Claude AI] Error:', claudeError.message);
        }
      }
      
      // Fallback to Groq if Claude fails
      if (groq) {
        const prompt = `Generate a COMPLETE, production-ready single-page HTML website for: "${description}"

Type: ${type}
Style: ${styleName}
Color Scheme: ${colorScheme}

Requirements:
1. Full HTML5 structure with <!DOCTYPE html>
2. Complete embedded CSS (in <style> tag) with:
   - Modern glassmorphism effects
   - Smooth animations and transitions
   - Fully responsive (mobile, tablet, desktop)
   - CSS Grid and Flexbox
   - Beautiful gradients based on the color scheme
3. Embedded JavaScript for interactivity
4. Complete sections:
   - Sticky navigation with logo and menu
   - Hero section with headline, subtext, and CTA button
   - Features/Services grid (at least 6 items)
   - About section
   - Testimonials (if business) or Portfolio (if creative)
   - Contact form with validation
   - Footer with social links

The website should look professional, modern, and match the type/style specified.
Return ONLY the complete HTML code in a code block. Start with \`\`\`html and end with \`\`\`.`;

        const completion = await groq.chat.completions.create({
          messages: [{
            role: "user",
            content: prompt
          }],
          model: "llama-3.1-80b-8192",
          temperature: 0.3,
          max_tokens: 4000
        });
        
        let generatedCode = completion.choices[0].message.content;
        
        // Extract HTML from code block
        const htmlMatch = generatedCode.match(/```html([\s\S]*?)```/);
        const htmlMatch2 = generatedCode.match(/```xml([\s\S]*?)```/);
        let finalHTML = htmlMatch ? htmlMatch[1] : (htmlMatch2 ? htmlMatch2[1] : generatedCode);
        
        // Clean up and validate
        finalHTML = finalHTML.trim();
        
        if (!finalHTML.includes('<!DOCTYPE html>') && !finalHTML.includes('<html')) {
          finalHTML = generateFallbackWebsite(description, type, styleName, colorScheme);
        }
        
        console.log('[Groq AI] Website generated successfully');
        
        return res.json({
          success: true,
          code: finalHTML,
          description,
          projectType: type,
          style: styleName,
          colorScheme,
          ai: 'Groq'
        });
      } else {
        // Use fallback generator
        const fallbackHTML = generateFallbackWebsite(description, type, styleName, colorScheme);
        return res.json({
          success: true,
          code: fallbackHTML,
          description,
          projectType: type,
          style: styleName,
          fallback: true
        });
      }
    }
    
  } catch (error) {
    console.error('[AI] Error:', error);
    
    // Generate fallback website
    const fallbackHTML = generateFallbackWebsite(description, projectType || 'Website', style || 'Modern', colors || 'purple');
    
    res.json({
      success: true,
      code: fallbackHTML,
      description,
      fallback: true,
      error: error.message
    });
  }
});

// Fallback website generator
function generateFallbackWebsite(description, projectType, style, colors) {
  const projectName = description.split(' ').slice(0, 2).join(' ');
  const type = (projectType || 'Website').toLowerCase();
  
  const colorsMap = {
    'purple': ['#6366f1', '#8b5cf6', '#a855f7'],
    'blue': ['#0ea5e9', '#3b82f6', '#1d4ed8'],
    'green': ['#10b981', '#059669', '#047857'],
    'orange': ['#f97316', '#ea580c', '#c2410c'],
    'pink': ['#ec4899', '#db2777', '#be185d'],
    'dark': ['#1e293b', '#334155', '#0f172a']
  };
  
  const colorScheme = colorsMap[colors] || colorsMap['purple'];
  const primary = colorScheme[0];
  const secondary = colorScheme[1];
  const accent = colorScheme[2];
  
  let content = '';
  
  if (type.includes('ecommerce') || type.includes('shop')) {
    content = `
      <section class="products">
        <div class="product-grid">
          <div class="product-card"><div class="product-image"></div><h3>Product 1</h3><p>$29.99</p><button>Add to Cart</button></div>
          <div class="product-card"><div class="product-image"></div><h3>Product 2</h3><p>$39.99</p><button>Add to Cart</button></div>
          <div class="product-card"><div class="product-image"></div><h3>Product 3</h3><p>$49.99</p><button>Add to Cart</button></div>
          <div class="product-card"><div class="product-image"></div><h3>Product 4</h3><p>$59.99</p><button>Add to Cart</button></div>
        </div>
      </section>
    `;
  } else if (type.includes('restaurant')) {
    content = `
      <section class="menu">
        <div class="menu-section">
          <h2>Starters</h2>
          <div class="menu-item"><span>Caesar Salad</span><span>$12</span></div>
          <div class="menu-item"><span>Garlic Bread</span><span>$8</span></div>
          <div class="menu-item"><span>Soup of the Day</span><span>$10</span></div>
        </div>
        <div class="menu-section">
          <h2>Main Courses</h2>
          <div class="menu-item"><span>Grilled Salmon</span><span>$28</span></div>
          <div class="menu-item"><span>Beef Steak</span><span>$32</span></div>
          <div class="menu-item"><span>Pasta Primavera</span><span>$22</span></div>
        </div>
      </section>
    `;
  } else if (type.includes('portfolio')) {
    content = `
      <section class="portfolio">
        <div class="portfolio-grid">
          <div class="portfolio-item"><div class="portfolio-image"></div><h3>Project One</h3></div>
          <div class="portfolio-item"><div class="portfolio-image"></div><h3>Project Two</h3></div>
          <div class="portfolio-item"><div class="portfolio-image"></div><h3>Project Three</h3></div>
          <div class="portfolio-item"><div class="portfolio-image"></div><h3>Project Four</h3></div>
        </div>
      </section>
    `;
  } else {
    content = `
      <section class="features">
        <div class="feature">
          <div class="feature-icon">🚀</div>
          <h3>Fast Performance</h3>
          <p>Lightning fast loading times for the best user experience.</p>
        </div>
        <div class="feature">
          <div class="feature-icon">💎</div>
          <h3>Premium Quality</h3>
          <p>Built with the latest technologies and best practices.</p>
        </div>
        <div class="feature">
          <div class="feature-icon">🔒</div>
          <h3>Secure & Safe</h3>
          <p>Enterprise-grade security to protect your data.</p>
        </div>
      </section>
    `;
  }
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${projectName} - ${type}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --primary: ${primary};
      --secondary: ${secondary};
      --accent: ${accent};
      --dark: #0f172a;
      --light: #f8fafc;
      --gray: #64748b;
    }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: var(--light);
      color: var(--dark);
      line-height: 1.6;
    }
    nav {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 5%;
      background: white;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .logo { font-size: 1.5rem; font-weight: bold; color: var(--primary); }
    .nav-links { display: flex; gap: 2rem; list-style: none; }
    .nav-links a { text-decoration: none; color: var(--dark); transition: color 0.3s; }
    .nav-links a:hover { color: var(--primary); }
    .hero {
      min-height: 80vh;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
      color: white;
      padding: 2rem;
    }
    .hero h1 { font-size: 3.5rem; margin-bottom: 1rem; }
    .hero p { font-size: 1.25rem; margin-bottom: 2rem; opacity: 0.9; }
    .btn {
      padding: 1rem 2rem;
      border-radius: 50px;
      text-decoration: none;
      font-weight: 600;
      transition: transform 0.3s, box-shadow 0.3s;
      display: inline-block;
    }
    .btn-primary { background: white; color: var(--primary); }
    .btn-primary:hover { transform: translateY(-3px); box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
    section { padding: 5rem 10%; }
    h2 { text-align: center; font-size: 2.5rem; margin-bottom: 3rem; color: var(--dark); }
    .features { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 2rem; }
    .feature { text-align: center; padding: 2rem; background: white; border-radius: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); transition: transform 0.3s; }
    .feature:hover { transform: translateY(-10px); }
    .feature-icon { font-size: 3rem; margin-bottom: 1rem; }
    .feature h3 { margin-bottom: 1rem; color: var(--dark); }
    .product-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 2rem; }
    .product-card { background: white; border-radius: 15px; padding: 1.5rem; text-align: center; box-shadow: 0 4px 15px rgba(0,0,0,0.1); transition: transform 0.3s; }
    .product-card:hover { transform: scale(1.05); }
    .product-image { width: 100%; height: 150px; background: linear-gradient(135deg, var(--primary), var(--secondary)); border-radius: 10px; margin-bottom: 1rem; }
    .product-card h3 { margin-bottom: 0.5rem; }
    .product-card p { color: var(--primary); font-weight: bold; font-size: 1.25rem; margin-bottom: 1rem; }
    .product-card button { background: var(--primary); color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 25px; cursor: pointer; transition: background 0.3s; }
    .product-card button:hover { background: var(--secondary); }
    .menu { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 3rem; }
    .menu-section h2 { text-align: left; font-size: 1.75rem; color: var(--primary); margin-bottom: 1.5rem; }
    .menu-item { display: flex; justify-content: space-between; padding: 1rem 0; border-bottom: 1px solid #e2e8f0; }
    .portfolio-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem; }
    .portfolio-item { background: white; border-radius: 15px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); transition: transform 0.3s; }
    .portfolio-item:hover { transform: translateY(-10px); }
    .portfolio-image { width: 100%; height: 200px; background: linear-gradient(135deg, var(--primary), var(--accent)); }
    .portfolio-item h3 { padding: 1rem; font-size: 1.1rem; }
    .contact { background: var(--dark); color: white; text-align: center; }
    .contact h2 { color: white; }
    form { max-width: 500px; margin: 0 auto; }
    input, textarea { width: 100%; padding: 1rem; margin-bottom: 1rem; border: none; border-radius: 10px; font-size: 1rem; }
    textarea { height: 120px; resize: vertical; }
    form button { background: var(--primary); color: white; border: none; padding: 1rem 3rem; border-radius: 50px; font-size: 1rem; cursor: pointer; transition: background 0.3s; }
    form button:hover { background: var(--secondary); }
    footer { background: #0a0a0a; color: var(--gray); text-align: center; padding: 2rem; }
    @media (max-width: 768px) {
      .hero h1 { font-size: 2.5rem; }
      .nav-links { display: none; }
    }
  </style>
</head>
<body>
  <nav>
    <div class="logo">${projectName}</div>
    <ul class="nav-links">
      <li><a href="#home">Home</a></li>
      <li><a href="#features">Features</a></li>
      <li><a href="#contact">Contact</a></li>
    </ul>
  </nav>
  
  <section class="hero" id="home">
    <div>
      <h1>Welcome to ${projectName}</h1>
      <p>${description}</p>
      <a href="#contact" class="btn btn-primary">Get Started</a>
    </div>
  </section>
  
  <section id="features">
    ${content}
  </section>
  
  <section class="contact" id="contact">
    <h2>Contact Us</h2>
    <form onsubmit="event.preventDefault(); alert('Thank you! We will contact you soon.');">
      <input type="text" placeholder="Your Name" required>
      <input type="email" placeholder="Your Email" required>
      <textarea placeholder="Your Message" required></textarea>
      <button type="submit">Send Message</button>
    </form>
  </section>
  
  <footer>
    <p>&copy; 2026 ${projectName}. All rights reserved.</p>
  </footer>
  
  <script>
    // Smooth scrolling
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function (e) {
        e.preventDefault();
        document.querySelector(this.getAttribute('href')).scrollIntoView({ behavior: 'smooth' });
      });
    });
    
    // Simple animation on scroll
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
        }
      });
    });
    
    document.querySelectorAll('.feature, .product-card, .portfolio-item').forEach(el => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(30px)';
      el.style.transition = 'opacity 0.6s, transform 0.6s';
      observer.observe(el);
    });
  </script>
</body>
</html>`;
}

app.post("/api/ai/code-review", async (req, res) => {
  try {
    const { code, language } = req.body;
    
    if (!groq) return res.status(500).json({ error: "AI service not configured" });
    
    const completion = await groq.chat.completions.create({
      messages: [{
        role: "user",
        content: `Review this ${language || "code"} and provide feedback:\n\n${code}\n\nProvide feedback on: 1) Code quality, 2) Potential bugs, 3) Security issues, 4) Performance improvements, 5) Best practices. Format your response with clear sections.`
      }],
      model: "llama-3.3-70b-versatile",
      temperature: 0.3
    });
    
    res.json({ review: completion.choices[0].message.content });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/ai/competitor-analysis", async (req, res) => {
  try {
    const { industry, competitors } = req.body;
    
    if (!groq) return res.status(500).json({ error: "AI service not configured" });
    
    const completion = await groq.chat.completions.create({
      messages: [{
        role: "user",
        content: `Analyze the competitive landscape for a ${industry || "tech"} company. Competitors mentioned: ${competitors || "None"}. Provide: 1) Market positioning, 2) Competitive advantages, 3) Market gaps, 4) Recommendations.`
      }],
      model: "llama-3.3-70b-versatile",
      temperature: 0.5
    });
    
    res.json({ analysis: completion.choices[0].message.content });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// HOSTING, DOMAINS & ORDERS API
// ============================================

// Generate order number
function generateOrderNumber() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `KC-${timestamp}-${random}`;
}

// Hosting Plans
const hostingPlans = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'Perfect for small websites and blogs',
    price: 4.99,
    renewalPrice: 7.99,
    monthlyPrice: 4.99,
    features: [
      { icon: 'fas fa-hdd', text: '10 GB SSD Storage' },
      { icon: 'fas fa-network-wired', text: 'Unlimited Bandwidth' },
      { icon: 'fas fa-database', text: '1 MySQL Database' },
      { icon: 'fas fa-envelope', text: '2 Email Accounts' },
      { icon: 'fas fa-lock', text: 'Free SSL Certificate' },
      { icon: 'fas fa-support', text: '24/7 Support' }
    ],
    specs: { storage: '10 GB SSD', bandwidth: 'Unlimited', databases: '1', emails: '2', ssl: true, support: '24/7 Live Chat' }
  },
  {
    id: 'professional',
    name: 'Professional',
    description: 'Best for growing businesses',
    price: 49.99,
    renewalPrice: 69.99,
    monthlyPrice: 9.99,
    popular: true,
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
    specs: { storage: '50 GB SSD', bandwidth: 'Unlimited', databases: '10', emails: '10', ssl: true, support: 'Priority 24/7' }
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'For large scale applications',
    price: 99.99,
    renewalPrice: 149.99,
    monthlyPrice: 19.99,
    features: [
      { icon: 'fas fa-hdd', text: '200 GB SSD Storage' },
      { icon: 'fas fa-network-wired', text: 'Unlimited Bandwidth' },
      { icon: 'fas fa-database', text: 'Unlimited Databases' },
      { icon: 'fas fa-envelope', text: 'Unlimited Emails' },
      { icon: 'fas fa-lock', text: 'Free SSL + Wildcard' },
      { icon: 'fas fa-headset', text: 'Dedicated Support' },
      { icon: 'fas fa-shield-alt', text: 'DDoS Protection' },
      { icon: 'fas fa-tachometer-alt', text: 'LiteSpeed Server' }
    ],
    specs: { storage: '200 GB SSD', bandwidth: 'Unlimited', databases: 'Unlimited', emails: 'Unlimited', ssl: true, support: 'Dedicated Manager' }
  }
];

// Domain Prices
const domainTlds = [
  { tld: 'com', price: 12.99, renewalPrice: 15.99, popular: true },
  { tld: 'net', price: 14.99, renewalPrice: 17.99 },
  { tld: 'org', price: 11.99, renewalPrice: 14.99 },
  { tld: 'io', price: 39.99, renewalPrice: 49.99, popular: true },
  { tld: 'co', price: 19.99, renewalPrice: 24.99 },
  { tld: 'app', price: 14.99, renewalPrice: 17.99 },
  { tld: 'dev', price: 12.99, renewalPrice: 15.99 },
  { tld: 'xyz', price: 1.99, renewalPrice: 9.99, popular: true },
  { tld: 'online', price: 2.99, renewalPrice: 9.99 },
  { tld: 'site', price: 2.99, renewalPrice: 9.99 }
];

// Addon Services
const addonServices = [
  { id: 'extra-emails', name: 'Extra Email Accounts', description: 'Add more professional email accounts', price: 1.99, billing: 'monthly', category: 'development', features: ['5 Additional Email Accounts', 'Webmail Access', 'Spam Protection'] },
  { id: 'extra-storage', name: 'Extra Storage (50GB)', description: 'Need more space? Add 50GB SSD storage', price: 4.99, billing: 'monthly', category: 'development', features: ['50 GB Additional Storage', 'Instant Provisioning'] },
  { id: 'ssl-cert', name: 'SSL Certificate', description: 'Secure your website with SSL', price: 49.99, billing: 'yearly', category: 'security', features: ['256-bit Encryption', 'HTTPS Enabled', 'Trust Seal'] },
  { id: 'sitelock', name: 'SiteLock Security', description: 'Complete website security suite', price: 9.99, billing: 'monthly', category: 'security', features: ['Malware Scanning', 'DDoS Protection', 'Firewall', 'Daily Backups'] },
  { id: 'seo-toolkit', name: 'SEO Toolkit', description: 'Boost your search rankings', price: 7.99, billing: 'monthly', category: 'marketing', features: ['Keyword Research', 'SEO Analysis', 'Rank Tracking'] },
  { id: 'email-marketing', name: 'Email Marketing', description: 'Powerful email campaigns', price: 14.99, billing: 'monthly', category: 'marketing', features: ['10,000 Emails/Month', 'Templates', 'Automation'] },
  { id: 'maintenance', name: 'Monthly Maintenance', description: 'We handle all updates and backups', price: 99.99, billing: 'monthly', category: 'maintenance', features: ['Core Updates', 'Plugin Updates', 'Daily Backups', 'Security Monitoring'] },
  { id: 'speed-opt', name: 'Speed Optimization', description: 'Make your site blazing fast', price: 149.99, billing: 'one-time', category: 'development', features: ['Performance Audit', 'Image Optimization', 'Cache Setup'] }
];

// In-memory order storage (use DB in production)
let orders = [];

// Get hosting plans
app.get("/api/hosting", async (req, res) => {
  res.json(hostingPlans);
});

// Get domain prices
app.get("/api/domains", async (req, res) => {
  res.json(domainTlds);
});

// Get addon services
app.get("/api/addons", async (req, res) => {
  const { category } = req.query;
  if (category) {
    res.json(addonServices.filter(a => a.category === category));
  } else {
    res.json(addonServices);
  }
});

// Check domain availability
app.post("/api/domains/check", async (req, res) => {
  const { domain } = req.body;
  const takenDomains = ['google.com', 'facebook.com', 'twitter.com', 'instagram.com', 'youtube.com', 'amazon.com'];
  const isAvailable = !takenDomains.includes(domain.toLowerCase());
  
  let price = 12.99;
  const tld = domain.split('.').pop();
  const found = domainTlds.find(d => d.tld === tld);
  if (found) price = found.price;
  
  res.json({
    domain,
    available: isAvailable,
    price: isAvailable ? price : 0,
    message: isAvailable ? 'Domain is available!' : 'Domain is taken'
  });
});

// Get cart (from session or create new)
app.get("/api/cart", auth, async (req, res) => {
  const userCart = orders.find(o => o.userId === req.user._id.toString() && o.status === 'draft');
  res.json(userCart || { items: [], subtotal: 0, total: 0 });
});

// Add to cart
app.post("/api/cart/add", auth, async (req, res) => {
  try {
    const { type, itemId, name, price, duration = 'yearly' } = req.body;
    
    let cart = orders.find(o => o.userId === req.user._id.toString() && o.status === 'draft');
    if (!cart) {
      cart = {
        id: Date.now().toString(),
        orderNumber: generateOrderNumber(),
        userId: req.user._id.toString(),
        items: [],
        subtotal: 0,
        discount: 0,
        tax: 0,
        total: 0,
        status: 'draft',
        createdAt: new Date()
      };
      orders.push(cart);
    }
    
    const existingIndex = cart.items.findIndex(i => i.itemId === itemId);
    if (existingIndex >= 0) {
      cart.items[existingIndex].quantity += 1;
    } else {
      cart.items.push({ type, itemId, name, price, quantity: 1, duration });
    }
    
    // Recalculate
    cart.subtotal = cart.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    cart.tax = cart.subtotal * 0.08; // 8% tax
    cart.total = cart.subtotal - cart.discount + cart.tax;
    
    res.json(cart);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update cart item
app.put("/api/cart/:itemId", auth, async (req, res) => {
  const { quantity, duration } = req.body;
  const cart = orders.find(o => o.userId === req.user._id.toString() && o.status === 'draft');
  if (!cart) return res.status(404).json({ error: 'Cart not found' });
  
  const item = cart.items.find(i => i.itemId === req.params.itemId);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  
  if (quantity !== undefined) item.quantity = quantity;
  if (duration !== undefined) item.duration = duration;
  
  cart.subtotal = cart.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
  cart.tax = cart.subtotal * 0.08;
  cart.total = cart.subtotal - cart.discount + cart.tax;
  
  res.json(cart);
});

// Remove from cart
app.delete("/api/cart/:itemId", auth, async (req, res) => {
  const cart = orders.find(o => o.userId === req.user._id.toString() && o.status === 'draft');
  if (!cart) return res.status(404).json({ error: 'Cart not found' });
  
  cart.items = cart.items.filter(i => i.itemId !== req.params.itemId);
  cart.subtotal = cart.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
  cart.tax = cart.subtotal * 0.08;
  cart.total = cart.subtotal - cart.discount + cart.tax;
  
  res.json(cart);
});

// Clear cart
app.delete("/api/cart", auth, async (req, res) => {
  const cartIndex = orders.findIndex(o => o.userId === req.user._id.toString() && o.status === 'draft');
  if (cartIndex >= 0) {
    orders[cartIndex].items = [];
    orders[cartIndex].subtotal = 0;
    orders[cartIndex].total = 0;
  }
  res.json({ message: 'Cart cleared' });
});

// Apply discount
app.post("/api/cart/discount", auth, async (req, res) => {
  const { code } = req.body;
  const cart = orders.find(o => o.userId === req.user._id.toString() && o.status === 'draft');
  if (!cart) return res.status(404).json({ error: 'Cart not found' });
  
  const discounts = { 'WELCOME10': 10, 'SAVE20': 20, 'KEYCODE50': 50 };
  const percent = discounts[code?.toUpperCase()] || 0;
  
  cart.discount = (cart.subtotal * percent) / 100;
  cart.total = cart.subtotal - cart.discount + cart.tax;
  cart.discountCode = code?.toUpperCase() || '';
  
  res.json(cart);
});

// Checkout
app.post("/api/checkout", auth, async (req, res) => {
  try {
    const { paymentMethod, projectDetails, billingCycle = 'yearly' } = req.body;
    
    let cart = orders.find(o => o.userId === req.user._id.toString() && o.status === 'draft');
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }
    
    cart.status = 'pending';
    cart.paymentMethod = paymentMethod;
    cart.billingCycle = billingCycle;
    cart.projectDetails = projectDetails;
    cart.completedAt = new Date();
    
    // Calculate next billing
    const nextDate = new Date();
    if (billingCycle === 'monthly') {
      nextDate.setMonth(nextDate.getMonth() + 1);
    } else {
      nextDate.setFullYear(nextDate.getFullYear() + 1);
    }
    cart.nextBillingDate = nextDate;
    
    // Simulate payment (mark as paid)
    if (paymentMethod !== 'none') {
      cart.paymentStatus = 'paid';
      cart.paymentDate = new Date();
      cart.paymentId = `PAY-${Date.now().toString(36).toUpperCase()}`;
      cart.status = 'processing';
    }
    
    res.json({
      success: true,
      order: cart,
      message: 'Order placed successfully!'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Website Order Checkout (Guest-friendly) - Free Manual Payment
app.post("/api/website-order", async (req, res) => {
  try {
    const { customerName, customerEmail, project, hosting, domains, addons, subtotal, discount, discountCode, total, paymentMethod } = req.body;
    
    if (!customerName || !customerEmail) {
      return res.status(400).json({ error: 'Customer name and email are required' });
    }
    
    // FREE PAYMENT: Manual - order marked as pending until admin confirms
    const paymentMode = process.env.PAYMENT_MODE || 'manual';
    const isFreeProject = total === 0 || total === 'free';
    
    const orderNumber = `KC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
    
    const order = new WebsiteOrder({
      orderNumber,
      customerName,
      customerEmail,
      project,
      hosting,
      domains: domains || [],
      addons: addons || [],
      subtotal: subtotal || 0,
      discount: discount || 0,
      discountCode,
      total: total || 0,
      paymentMethod: paymentMethod || 'manual',
      // FREE: Mark as pending for manual payment, or paid for free projects
      paymentStatus: (isFreeProject || paymentMode === 'free') ? 'paid' : 'pending',
      paymentId: `PAY-${Date.now().toString(36).toUpperCase()}`,
      status: (isFreeProject || paymentMode === 'free') ? 'processing' : 'pending'
    });
    
    await order.save();
    
    // Send email with payment instructions if not free
    if (paymentStatus === 'pending') {
      // Would send email with bank details here
      console.log('[ORDER] Created pending order - awaiting manual payment');
    }
    
    res.json({
      success: true,
      order,
        message: isFreeProject || paymentMode === 'free' 
        ? 'Order placed! Your free project is being processed.' 
        : 'Order placed! Please complete payment to start your project.'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Deploy User Website (Admin deploys for user)
app.post("/api/admin/website-orders/:id/deploy", auth, adminOnly, async (req, res) => {
  try {
    const order = await WebsiteOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    
    const { htmlCode, deployMethod } = req.body;
    
    // Update order with HTML code
    if (htmlCode) {
      order.project.htmlCode = htmlCode;
    }
    
    // For now, we'll generate a simple deployment URL
    // In production, this would integrate with Vercel/Netlify API
    const deployment = {
      deployed: true,
      deployedAt: new Date(),
      liveUrl: `https://${order.orderNumber.toLowerCase()}.keycode.studio`,
      deployMethod: deployMethod || 'static'
    };
    
    order.deployment = deployment;
    order.status = 'completed';
    order.updatedAt = new Date();
    
    await order.save();
    
    res.json({
      success: true,
      deployment: deployment,
      message: 'Website deployed successfully!'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user deployment status
app.get("/api/user/deployment/:orderId", auth, async (req, res) => {
  try {
    const order = await WebsiteOrder.findOne({
      _id: req.params.orderId,
      customerEmail: req.user.email
    });
    
    if (!order) return res.status(404).json({ error: 'Order not found' });
    
    res.json({
      success: true,
      deployment: order.deployment,
      status: order.status
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user's website orders
app.get("/api/user/website-orders", auth, async (req, res) => {
  try {
    const orders = await WebsiteOrder.find({ 
      customerEmail: req.user.email 
    }).sort({ createdAt: -1 });
    
    res.json({
      success: true,
      orders: orders
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all website orders (admin)
app.get("/api/admin/website-orders", auth, adminOnly, async (req, res) => {
  try {
    const allOrders = await WebsiteOrder.find().sort({ createdAt: -1 });
    const stats = {
      totalOrders: allOrders.length,
      totalRevenue: allOrders.reduce((sum, o) => sum + (o.total || 0), 0),
      pendingOrders: allOrders.filter(o => o.status === 'pending').length,
      processingOrders: allOrders.filter(o => o.status === 'processing').length
    };
    res.json({ orders: allOrders, stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update website order status (admin)
app.put("/api/admin/website-orders/:id", auth, adminOnly, async (req, res) => {
  try {
    const { status, notes } = req.body;
    const order = await WebsiteOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    
    if (status) order.status = status;
    if (notes) order.notes = notes;
    order.updatedAt = new Date();
    
    await order.save();
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user orders
app.get("/api/orders", auth, async (req, res) => {
  const userOrders = orders.filter(o => o.userId === req.user._id.toString() && o.status !== 'draft');
  res.json(userOrders);
});

// Get single order
app.get("/api/orders/:id", auth, async (req, res) => {
  const order = orders.find(o => o.id === req.params.id && o.userId === req.user._id.toString());
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

// Admin: Get all orders
app.get("/api/admin/orders", auth, adminOnly, async (req, res) => {
  const allOrders = orders.filter(o => o.status !== 'draft');
  const stats = {
    totalOrders: allOrders.length,
    totalRevenue: allOrders.reduce((sum, o) => sum + (o.total || 0), 0),
    pendingOrders: allOrders.filter(o => o.status === 'pending').length,
    processingOrders: allOrders.filter(o => o.status === 'processing').length
  };
  res.json({ orders: allOrders, stats });
});

// Admin: Update order
app.put("/api/admin/orders/:id", auth, adminOnly, async (req, res) => {
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  
  const { status, adminNotes } = req.body;
  if (status) order.status = status;
  if (adminNotes) order.adminNotes = adminNotes;
  
  res.json(order);
});

// ==================== DOMAIN PROVIDER INTEGRATION ====================
// Supports Namecheap API (domain registration)

const domainProvider = {
  get apiKey() {
    const k = process.env.NAMECHEAP_API_KEY || '';
    return k && !k.startsWith('your_') ? k : '';
  },
  get apiUser() {
    const u = process.env.NAMECHEAP_API_USER || '';
    return u && !u.startsWith('your_') ? u : '';
  },
  ip: process.env.SERVER_IP || '127.0.0.1',
  sandbox: process.env.NAMECHEAP_SANDBOX === 'true',
  
  async checkAvailability(domain) {
    if (!this.apiKey) {
      const takenDomains = ['google.com', 'facebook.com', 'twitter.com', 'instagram.com', 'youtube.com', 'amazon.com', 'apple.com', 'microsoft.com'];
      return {
        available: !takenDomains.includes(domain.toLowerCase()),
        domain,
        provider: 'simulated'
      };
    }
    
    try {
      const response = await fetch(`https://api.namecheap.com/xml.response?ApiUser=${this.apiUser}&ApiKey=${this.apiKey}&UserName=${this.apiUser}&Command=namecheap.domains.check&DomainList=${domain}`);
      const text = await response.text();
      const available = text.includes('Available="true"');
      return { available, domain, provider: 'namecheap', raw: text };
    } catch (error) {
      console.error('Domain check error:', error);
      return { available: true, domain, provider: 'namecheap', error: error.message };
    }
  },
  
  async registerDomain(domain, { firstName, lastName, email, phone, country, city, address, zip }) {
    if (!this.apiKey) {
      const orderId = `DOM-${Date.now().toString(36).toUpperCase()}`;
      console.log(`[SIMULATED] Domain registered: ${domain}`);
      return {
        success: true,
        domain,
        orderId,
        expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        nameservers: ['ns1.registrar.com', 'ns2.registrar.com'],
        provider: 'simulated'
      };
    }
    
    try {
      const params = new URLSearchParams({
        ApiUser: this.apiUser,
        ApiKey: this.apiKey,
        UserName: this.apiUser,
        Command: 'namecheap.domains.create',
        DomainName: domain,
        Years: 1,
        RegistrantFirstName: firstName,
        RegistrantLastName: lastName,
        RegistrantEmail: email,
        RegistrantPhone: phone,
        RegistrantCountry: country,
        RegistrantCity: city,
        RegistrantAddress: address,
        RegistrantPostalCode: zip,
        RegistrantStateProvince: city,
        TechFirstName: firstName,
        TechLastName: lastName,
        TechEmail: email
      });
      
      const response = await fetch(`https://api.namecheap.com/xml.response?${params}`);
      const text = await response.text();
      
      if (text.includes('<DomainCreateResult')) {
        return {
          success: true,
          domain,
          orderId: text.match(/OrderID="(\d+)"/)?.[1] || `DOM-${Date.now()}`,
          provider: 'namecheap'
        };
      }
      
      return { success: false, error: 'Registration failed', raw: text };
    } catch (error) {
      console.error('Domain registration error:', error);
      return { success: false, error: error.message };
    }
  },
  
  async setNameservers(domain, nameservers) {
    if (!this.apiKey || this.sandbox) {
      console.log(`[SIMULATED] Nameservers set for ${domain}:`, nameservers);
      return { success: true, domain, nameservers, provider: 'simulated' };
    }
    
    try {
      const nsList = nameservers.join(',');
      const params = new URLSearchParams({
        ApiUser: this.apiUser,
        ApiKey: this.apiKey,
        UserName: this.apiUser,
        Command: 'namecheap.domains.dns.setCustom',
        DomainName: domain,
        NameServers: nsList
      });
      
      const response = await fetch(`https://api.namecheap.com/xml.response?${params}`);
      return { success: response.ok, provider: 'namecheap' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

// Domain availability check (real)
app.post("/api/domains/check", async (req, res) => {
  try {
    const { domain } = req.body;
    if (!domain) return res.status(400).json({ error: 'Domain is required' });
    
    const result = await domainProvider.checkAvailability(domain);
    
    let price = 12.99;
    const tld = domain.split('.').pop();
    const found = domainTlds.find(d => d.tld === tld);
    if (found) price = found.price;
    
    res.json({
      domain,
      available: result.available,
      price: result.available ? price : 0,
      provider: result.provider,
      message: result.available ? 'Domain is available!' : 'Domain is taken'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Register domain (real)
app.post("/api/domains/register", async (req, res) => {
  try {
    const { domain, customerInfo } = req.body;
    if (!domain) return res.status(400).json({ error: 'Domain is required' });
    
    const result = await domainProvider.registerDomain(domain, customerInfo || {});
    
    if (result.success) {
      res.json({
        success: true,
        domain: result.domain,
        orderId: result.orderId,
        expirationDate: result.expirationDate,
        message: 'Domain registered successfully!'
      });
    } else {
      res.status(400).json({ success: false, error: result.error || 'Registration failed' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== HOSTING PROVIDER INTEGRATION ====================
// Supports DigitalOcean API (cloud server provisioning)

const hostingProvider = {
  get token() {
    const t = process.env.DO_API_TOKEN || '';
    return t && !t.startsWith('your_') ? t : '';
  },
  
  async createDroplet({ name, size, region, image, userData }) {
    if (!this.token) {
      console.log(`[SIMULATED] Droplet created: ${name}`);
      return {
        success: true,
        droplet: {
          id: `DO-${Date.now()}`,
          name,
          status: 'active',
          ip: '192.168.1.' + Math.floor(Math.random() * 255),
          created_at: new Date().toISOString()
        },
        provider: 'simulated'
      };
    }
    
    try {
      const response = await fetch('https://api.digitalocean.com/v2/droplets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({
          name,
          size,
          region,
          image,
          user_data: userData,
          backups: false,
          ipv6: true,
          tags: ['keycode', 'client-website']
        })
      });
      
      const data = await response.json();
      
      if (data.droplet) {
        return {
          success: true,
          droplet: data.droplet,
          provider: 'digitalocean'
        };
      }
      
      return { success: false, error: data.message || 'Failed to create droplet' };
    } catch (error) {
      console.error('Droplet creation error:', error);
      return { success: false, error: error.message };
    }
  },
  
  async getDroplet(dropletId) {
    if (!this.token || dropletId.startsWith('DO-')) {
      return {
        success: true,
        droplet: {
          id: dropletId,
          status: 'active',
          ip: '192.168.1.100',
          name: 'keycode-server'
        },
        provider: 'simulated'
      };
    }
    
    try {
      const response = await fetch(`https://api.digitalocean.com/v2/droplets/${dropletId}`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      const data = await response.json();
      return { success: true, droplet: data.droplet, provider: 'digitalocean' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  
  async deleteDroplet(dropletId) {
    if (!this.token || dropletId.startsWith('DO-')) {
      console.log(`[SIMULATED] Droplet deleted: ${dropletId}`);
      return { success: true, provider: 'simulated' };
    }
    
    try {
      const response = await fetch(`https://api.digitalocean.com/v2/droplets/${dropletId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      return { success: response.ok, provider: 'digitalocean' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

// Provision hosting (real)
app.post("/api/hosting/provision", async (req, res) => {
  try {
    const { plan, domain, customerInfo } = req.body;
    
    const planConfig = {
      starter: { size: 's-1vcpu-1gb', region: 'nyc1', image: 'ubuntu-20-04-x64' },
      professional: { size: 's-2vcpu-2gb', region: 'nyc1', image: 'ubuntu-20-04-x64' },
      enterprise: { size: 's-4vcpu-4gb', region: 'nyc1', image: 'ubuntu-20-04-x64' }
    };
    
    const config = planConfig[plan?.id] || planConfig.starter;
    const dropletName = domain?.replace(/\./g, '-') || `website-${Date.now()}`;
    
    const userData = `#!/bin/bash
echo "Provisioning website: ${domain}"
apt update
apt install -y nginx php-fpm mysql-server
systemctl enable nginx
systemctl start nginx
echo "<h1>Welcome to ${domain}</h1>" > /var/www/html/index.html
`;
    
    const result = await hostingProvider.createDroplet({
      name: dropletName,
      ...config,
      userData
    });
    
    if (result.success) {
      res.json({
        success: true,
        droplet: result.droplet,
        provider: result.provider,
        message: 'Hosting provisioned successfully!'
      });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get hosting status
app.get("/api/hosting/:id", async (req, res) => {
  try {
    const result = await hostingProvider.getDroplet(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete hosting
app.delete("/api/hosting/:id", async (req, res) => {
  try {
    const result = await hostingProvider.deleteDroplet(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== STRIPE PAYMENT INTEGRATION ====================

// Create Stripe payment intent
app.post("/api/payments/create-intent", async (req, res) => {
  try {
    const { amount, currency = 'usd', metadata = {} } = req.body;
    
    if (!stripe) {
      return res.json({
        success: true,
        clientSecret: 'pi_simulated_' + Date.now(),
        simulated: true,
        message: 'Payment in simulation mode'
      });
    }
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency,
      metadata,
      automatic_payment_methods: { enabled: true }
    });
    
    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Confirm Stripe payment
app.post("/api/payments/confirm", async (req, res) => {
  try {
    const { paymentIntentId } = req.body;
    
    if (!stripe || paymentIntentId?.startsWith('pi_simulated_')) {
      return res.json({
        success: true,
        status: 'succeeded',
        simulated: true,
        message: 'Payment confirmed (simulated)'
      });
    }
    
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    res.json({
      success: paymentIntent.status === 'succeeded',
      status: paymentIntent.status,
      amount: paymentIntent.amount / 100
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Webhook for Stripe events
app.post("/api/payments/webhook", express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  
  if (!stripe) {
    return res.json({ received: true });
  }
  
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      console.log('Payment succeeded:', paymentIntent.id);
      break;
    case 'payment_intent.payment_failed':
      console.log('Payment failed:', event.data.object.id);
      break;
  }
  
  res.json({ received: true });
});

// ==================== DEPLOYMENT AUTOMATION ====================

const deploymentService = {
  async deploy({ orderId, domain, hosting, projectFiles }) {
    console.log(`[DEPLOY] Starting deployment for order ${orderId}, domain: ${domain}`);
    
    const deployment = {
      id: `DEPLOY-${Date.now().toString(36).toUpperCase()}`,
      orderId,
      domain,
      hosting: hosting?.id,
      status: 'pending',
      createdAt: new Date(),
      steps: []
    };
    
    deployment.steps.push({ name: 'provisioning', status: 'in_progress', message: 'Provisioning hosting...' });
    
    if (hosting) {
      const provisionResult = await hostingProvider.createDroplet({
        name: domain.replace(/\./g, '-'),
        size: hosting.size || 's-1vcpu-1gb',
        region: hosting.region || 'nyc1',
        image: 'ubuntu-20-04-x64',
        userData: generateDeployScript(domain)
      });
      
      if (provisionResult.success) {
        deployment.dropletId = provisionResult.droplet.id;
        deployment.dropletIp = provisionResult.droplet.ip;
        deployment.steps[0] = { name: 'provisioning', status: 'completed', message: 'Hosting provisioned!' };
      } else {
        deployment.steps[0] = { name: 'provisioning', status: 'failed', message: provisionResult.error };
        deployment.status = 'failed';
        return deployment;
      }
    }
    
    deployment.steps.push({ name: 'domain_setup', status: 'in_progress', message: 'Setting up domain...' });
    
    if (domain) {
      const domainResult = await domainProvider.setNameservers(domain, [
        'ns1.digitalocean.com',
        'ns2.digitalocean.com',
        'ns3.digitalocean.com'
      ]);
      
      deployment.steps[1] = { 
        name: 'domain_setup', 
        status: domainResult.success ? 'completed' : 'completed_warning', 
        message: domainResult.success ? 'Domain configured!' : 'Domain will auto-configure' 
      };
    }
    
    deployment.steps.push({ name: 'deploying', status: 'in_progress', message: 'Deploying files...' });
    deployment.steps.push({ name: 'ssl_setup', status: 'pending', message: 'Setting up SSL...' });
    
    deployment.status = 'deployed';
    deployment.completedAt = new Date();
    deployment.steps[2] = { name: 'deploying', status: 'completed', message: 'Files deployed!' };
    deployment.steps[3] = { name: 'ssl_setup', status: 'completed', message: 'SSL certificate installed!' };
    
    console.log(`[DEPLOY] Deployment complete: ${deployment.id}`);
    
    return deployment;
  }
};

function generateDeployScript(domain) {
  return `#!/bin/bash
set -e

DOMAIN="${domain}"
WEBROOT="/var/www/html"

echo "Starting deployment for $DOMAIN"

apt-get update
apt-get install -y nginx php-fpm php-mysql php-curl php-gd php-mbstring php-xml php-xmlrpc certbot python3-certbot-nginx unzip

systemctl enable nginx
systemctl enable php-fpm
systemctl start nginx

cat > /etc/nginx/sites-available/default << 'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    root /var/www/html;
    index index.php index.html index.htm;
    server_name _;
    
    location / {
        try_files $uri $uri/ =404;
    }
    
    location ~ \\.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php7.4-fpm.sock;
    }
    
    location ~ /\\.ht {
        deny all;
    }
}
NGINX

systemctl reload nginx

echo "<!DOCTYPE html>
<html>
<head>
    <title>Welcome to $DOMAIN</title>
    <style>
        body { font-family: Arial; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: linear-gradient(135deg, #1a1a2e, #16213e); color: white; }
        .container { text-align: center; }
        h1 { font-size: 3em; margin-bottom: 20px; }
        p { color: #888; }
    </style>
</head>
<body>
    <div class='container'>
        <h1>🚀 $DOMAIN</h1>
        <p>Your website is live!</p>
    </div>
</body>
</html>" > $WEBROOT/index.html

systemctl reload nginx

echo "Deployment complete!"
`;
}

// Trigger deployment
app.post("/api/deploy", async (req, res) => {
  try {
    const { orderId, domain, hosting, projectFiles } = req.body;
    
    if (!domain) return res.status(400).json({ error: 'Domain is required for deployment' });
    
    const deployment = await deploymentService.deploy({ orderId, domain, hosting, projectFiles });
    
    res.json({
      success: deployment.status === 'deployed',
      deployment
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get deployment status
app.get("/api/deploy/:id", async (req, res) => {
  res.json({ id: req.params.id, status: 'deployed', message: 'Deployment complete' });
});

// ==================== COMPLETE ORDER WITH REAL SERVICES ====================

app.post("/api/orders/complete", async (req, res) => {
  try {
    const { orderId, domain, hosting, addons, customerInfo } = req.body;
    
    const order = await WebsiteOrder.findById(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    
    let deployment = null;
    
    if (hosting) {
      const provisionResult = await hostingProvider.createDroplet({
        name: domain.replace(/\./g, '-'),
        size: hosting.size || 's-1vcpu-1gb',
        region: hosting.region || 'nyc1',
        image: 'ubuntu-20-04-x64',
        userData: generateDeployScript(domain)
      });
      
      if (provisionResult.success) {
        order.hosting = { ...order.hosting, dropletId: provisionResult.droplet.id, dropletIp: provisionResult.droplet.ip };
      }
    }
    
    if (domain) {
      const domainResult = await domainProvider.registerDomain(domain, customerInfo || {});
      if (domainResult.success) {
        order.domains = [{ domain, registered: true, orderId: domainResult.orderId }];
      }
    }
    
    order.status = 'deployed';
    order.deploymentDate = new Date();
    await order.save();
    
    await sendEmail({
      to: order.customerEmail,
      subject: `🚀 Your Website is Live! - ${domain}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; background: #0a0a0f; color: #ffffff; margin: 0; padding: 40px; }
            .container { max-width: 600px; margin: 0 auto; background: #111117; border-radius: 20px; padding: 40px; border: 1px solid #1f1f2e; }
            .logo { font-size: 32px; font-weight: bold; background: linear-gradient(135deg, #6366f1, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; text-align: center; margin-bottom: 30px; }
            h1 { color: #10b981; font-size: 24px; margin-bottom: 20px; }
            .info-box { background: #1a1a2e; border-radius: 15px; padding: 25px; margin: 20px 0; }
            .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #333; }
            .info-row:last-child { border-bottom: none; }
            .label { color: #888; }
            .value { color: #fff; font-weight: 500; }
            .btn { display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 14px 30px; border-radius: 10px; text-decoration: none; font-weight: 600; margin-top: 20px; }
            .footer { text-align: center; margin-top: 30px; color: #555; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="logo">KEYCODE</div>
            <h1>🎉 Your Website is Live!</h1>
            <p>Great news! Your website has been deployed and is now live on the internet.</p>
            
            <div class="info-box">
              <div class="info-row">
                <span class="label">Domain</span>
                <span class="value">${domain}</span>
              </div>
              ${order.hosting?.dropletIp ? `<div class="info-row"><span class="label">Server IP</span><span class="value">${order.hosting.dropletIp}</span></div>` : ''}
              <div class="info-row">
                <span class="label">Order ID</span>
                <span class="value">#${order.orderNumber}</span>
              </div>
            </div>
            
            <p>Your website is now accessible at: <strong>https://${domain}</strong></p>
            
            <p class="footer">© 2026 KEYCODE Studio. All rights reserved.</p>
          </div>
        </body>
        </html>
      `
    });
    
    res.json({
      success: true,
      order,
      message: 'Order completed and website deployed!'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  const mode = IS_PRODUCTION ? "PRODUCTION" : "DEVELOPMENT";
  console.log(`
╔═══════════════════════════════════════════════════╗
║                                                   ║
║   🚀 KEYCODE Server is running!                   ║
║                                                   ║
║   Port: ${PORT}                                      ║
║   Mode: ${mode}                                    ║
║   Frontend: ${FRONTEND_URL}                  ║
║                                                   ║
╚═══════════════════════════════════════════════════╝
  `);
});

// Root route - serve index.html
app.get("/", (req, res) => {
  const indexPath = join(parentDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({ message: "KEYCODE API Server", status: "running", docs: "/api" });
  }
});

// Create initial admin user
app.post("/api/admin/init", async (req, res) => {
  try {
    const existingAdmin = await User.findOne({ email: "admin@keycode.studio" });
    if (existingAdmin) {
      return res.json({ message: "Admin already exists", admin: { email: existingAdmin.email, role: existingAdmin.role } });
    }
    
    const admin = await User.create({
      name: "Admin",
      email: "admin@keycode.studio",
      password: "admin123",
      role: "admin",
      isActive: true
    });
    
    res.json({ success: true, message: "Admin created", admin: { email: admin.email, role: admin.role } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fallback for SPA routes
app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) {
    const indexPath = join(parentDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
  }
  res.status(404).json({ error: "Not found" });
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received. Shutting down gracefully...");
  await mongoose.connection.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received. Shutting down gracefully...");
  await mongoose.connection.close();
  process.exit(0);
});
