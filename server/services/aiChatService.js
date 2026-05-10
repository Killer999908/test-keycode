import { Groq } from "groq-sdk";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY
});

const chatHistorySchema = new mongoose.Schema({
  sessionId: String,
  messages: [{ role: String, content: String }],
  requirements: {
    serviceType: String,
    pages: Number,
    features: [String],
    description: String,
    budget: String
  },
  estimatedPrice: Number,
  createdAt: { type: Date, default: Date.now }
});

const ChatHistory = mongoose.models.ChatHistory || mongoose.model("ChatHistory", chatHistorySchema);

const SYSTEM_PROMPT = `You are **Keycode AI**, a world-class professional web development consultant for a premium digital agency. Your role is to:

1. Greet clients warmly and professionally
2. Collect project requirements systematically:
   - Service type: Website, Web App, Mobile App, E-commerce, Custom Development, AI Integration
   - Number of pages/screens
   - Required features (SEO, Auth, Payment, Chat, CMS, API, Admin Dashboard, etc.)
   - Project description and specific needs
   - Budget range if mentioned

3. After gathering requirements, provide detailed price estimates

4. Be conversational, professional, and help clients make informed decisions

**PRICING GUIDE:**
- Basic Website: $200-500
- Business Website: $500-1000
- E-commerce Website: $900-2500
- Web Application: $500-2000
- Mobile App (iOS/Android): $1500-5000
- AI Integration: $2000-5000
- Custom Development: Starting $1000

**ADD-ON FEATURES:**
- SEO Optimization: +$150
- User Authentication: +$100
- Payment Integration: +$175
- Real-time Chat: +$100
- Admin Dashboard: +$150
- API Development: +$125
- CMS Integration: +$175
- Analytics Dashboard: +$100

Ask one question at a time. Be helpful and guide clients through their project planning.`;

const PRICING = {
  base: {
    website: 300,
    webapp: 800,
    mobileapp: 1500,
    ecommerce: 1000,
    custom: 1200,
    ai: 2000
  },
  perPage: 25,
  features: {
    ecommerce: 200,
    seo: 150,
    auth: 100,
    payment: 175,
    chat: 100,
    admin: 150,
    api: 125,
    cms: 175,
    analytics: 100
  }
};

function calculatePrice(requirements) {
  if (!requirements.serviceType) return null;
  
  let total = PRICING.base[requirements.serviceType] || 500;
  
  if (requirements.pages && requirements.pages > 3) {
    total += (requirements.pages - 3) * PRICING.perPage;
  }
  
  if (requirements.features) {
    requirements.features.forEach(f => {
      total += PRICING.features[f] || 0;
    });
  }
  
  return total;
}

export async function processMessage(sessionId, userMessage) {
  let history = await ChatHistory.findOne({ sessionId });
  
  if (!history) {
    history = new ChatHistory({
      sessionId,
      messages: [{ role: "system", content: SYSTEM_PROMPT }],
      requirements: {}
    });
  }
  
  history.messages.push({ role: "user", content: userMessage });
  
  let aiResponse;
  
  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: history.messages,
      max_tokens: 800,
      temperature: 0.7
    });
    
    aiResponse = completion.choices[0].message.content;
  } catch (err) {
    console.error("Groq API Error:", err.message);
    
    aiResponse = generateSmartResponse(userMessage, history.requirements);
  }
  
  history.messages.push({ role: "assistant", content: aiResponse });
  
  const updatedReqs = extractRequirements(history.messages, history.requirements);
  history.requirements = updatedReqs;
  
  const price = calculatePrice(updatedReqs);
  if (price) {
    history.estimatedPrice = price;
  }
  
  await history.save();
  
  return {
    response: aiResponse,
    requirements: updatedReqs,
    estimatedPrice: price
  };
}

function generateSmartResponse(message, requirements) {
  const msg = message.toLowerCase();
  
  if (msg.includes('price') || msg.includes('cost') || msg.includes('estimate') || msg.includes('how much')) {
    return `Based on your needs, here's our general pricing:\n\n🎯 **Starting Prices:**\n• Website: $300 - $2500\n• E-commerce: $1000 - $5000\n• Web App: $800 - $3000\n• Mobile App: $1500 - $8000\n• AI Integration: $2000+\n\nTo give you an exact estimate, please tell me:\n1. What type of project do you need?\n2. How many pages/screens?\n3. Any special features like payment, user login, etc.?`;
  }
  
  if (msg.includes('hello') || msg.includes('hi') || msg.includes('hey') || msg.includes('start')) {
    return `Hello! 👋 Welcome to **Keycode** - where innovation meets excellence.\n\nI'm your AI consultant here to help you build something amazing. Whether it's a stunning website, powerful app, or cutting-edge AI solution, I've got you covered.\n\nLet's start! What would you like to create today?\n\n💡 **Quick options:**\n• Website (Business, Portfolio, E-commerce)\n• Mobile App (iOS, Android)\n• Web Application\n• AI-Powered Solution`;
  }
  
  if (msg.includes('website') || msg.includes('web')) {
    return `Great choice! A website is essential for any business today.\n\nTo create the perfect website for you, I need to know:\n\n1️⃣ **Type:** Business site, Portfolio, or E-commerce?\n2️⃣ **Pages:** How many pages do you need? (Home, About, Services, Contact, etc.)\n3️⃣ **Features:** Any special requirements?\n   - SEO optimization\n   - Contact forms\n   - Blog section\n   - Gallery/Portfolio\n   - Live chat\n\nShare your vision with me!`;
  }
  
  if (msg.includes('mobile') || msg.includes('app')) {
    return `Exciting! Mobile apps can transform your business.\n\nTell me more about your app idea:\n\n📱 **Platform:** iOS, Android, or Both?\n📺 **Screens:** How many main screens/features?\n✨ **Key Features:**\n   - User authentication\n   - Push notifications\n   - Payment processing\n   - Real-time chat\n   - Camera/GPS access\n   - Social media integration\n\nWhat's your app concept?`;
  }
  
  if (msg.includes('ecommerce') || msg.includes('shop') || msg.includes('store') || msg.includes('selling')) {
    return `E-commerce is booming! Let me help you build a successful online store.\n\n🛒 **What we'll include:**\n• Beautiful product catalog\n• Shopping cart & wishlist\n• Secure checkout (Stripe/PayPal)\n• User accounts & order tracking\n• Admin dashboard\n• Inventory management\n\n1️⃣ How many products do you plan to sell?\n2️⃣ Do you need physical or digital products?\n3️⃣ Any specific features like subscriptions or auctions?\n\nLet's build your dream store!`;
  }
  
  if (msg.includes('ai') || msg.includes('machine learning') || msg.includes('chatbot')) {
    return `AI is the future! Let's incorporate intelligent automation into your project.\n\n🤖 **AI Services We Offer:**\n• AI Chatbots (customer support, sales)\n• Machine Learning models\n• Image/Video recognition\n• Natural Language Processing\n• Predictive analytics\n• Voice assistants\n• Recommendation systems\n\nWhat's your AI use case? Describe the problem you want to solve!`;
  }
  
  return `That's interesting! Let me help you turn that into reality.\n\nTo provide you with the best solution, please tell me:\n\n1️⃣ **Project Type:** What are you building?\n2️⃣ **Goal:** What should it accomplish?\n3️⃣ **Timeline:** When do you need it?\n4️⃣ **Budget:** What's your range?\n\nI'm here to make your vision come to life! 🚀`;
}

function extractRequirements(messages, current) {
  const text = messages.map(m => m.content).join(" ").toLowerCase();
  const reqs = { ...current };
  
  if (text.includes("ecommerce") || text.includes("e-commerce") || text.includes("online store")) {
    reqs.serviceType = "ecommerce";
  } else if (text.includes("mobile app")) {
    reqs.serviceType = "mobileapp";
  } else if (text.includes("web app") || text.includes("web application")) {
    reqs.serviceType = "webapp";
  } else if (text.includes("ai") || text.includes("machine learning") || text.includes("chatbot")) {
    reqs.serviceType = "ai";
  } else if (text.includes("website") || text.includes("landing page")) {
    reqs.serviceType = "website";
  }
  
  const pageMatch = text.match(/(\d+)\s*(pages?|screens?|features?)/);
  if (pageMatch) {
    reqs.pages = parseInt(pageMatch[1]);
  }
  
  const features = [];
  if (text.includes("seo")) features.push("seo");
  if (text.includes("payment") || text.includes("stripe") || text.includes("paypal")) features.push("payment");
  if (text.includes("auth") || text.includes("login") || text.includes("register")) features.push("auth");
  if (text.includes("chat") || text.includes("messaging")) features.push("chat");
  if (text.includes("admin") || text.includes("dashboard")) features.push("admin");
  if (text.includes("api")) features.push("api");
  if (text.includes("cms") || text.includes("content management")) features.push("cms");
  if (text.includes("analytics") || text.includes("tracking")) features.push("analytics");
  if (text.includes("ecommerce") || text.includes("cart") || text.includes("store")) features.push("ecommerce");
  
  if (features.length > 0) {
    reqs.features = [...new Set([...(reqs.features || []), ...features])];
  }
  
  return reqs;
}

export async function getSession(sessionId) {
  return await ChatHistory.findOne({ sessionId });
}

export async function resetSession(sessionId) {
  await ChatHistory.deleteOne({ sessionId });
}

export { ChatHistory, PRICING };
