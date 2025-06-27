# 🚀 QuickBill Pro

Professional invoice generator with Stripe embedded checkout for subscription billing.

![QuickBill Pro](https://img.shields.io/badge/QuickBill-Pro-blue?style=for-the-badge)
![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react)
![Node.js](https://img.shields.io/badge/Node.js-18-339933?style=for-the-badge&logo=node.js)
![TypeScript](https://img.shields.io/badge/TypeScript-4.9-3178C6?style=for-the-badge&logo=typescript)
![Stripe](https://img.shields.io/badge/Stripe-Embedded-635BFF?style=for-the-badge&logo=stripe)

## ✨ Features

### 🏢 **Business Management**
- **Client Management** - Add, edit, and organize your clients
- **Invoice Creation** - Professional PDF invoices with custom branding  
- **Payment Tracking** - Monitor paid, pending, and overdue invoices
- **Dashboard Analytics** - Revenue tracking and business insights

### 💳 **Subscription Billing**
- **Embedded Stripe Checkout** - Seamless payment experience (no redirects!)
- **Multiple Plans** - Free, Starter ($9), Pro ($19), Business ($39)
- **Automatic Upgrades** - Instant plan activation via webhooks
- **Usage Limits** - Free: 3 invoices, Paid: Unlimited

### 🔐 **Authentication & Security**
- **JWT Authentication** - Secure user sessions
- **Password Encryption** - bcrypt hashing
- **Protected Routes** - Role-based access control
- **CORS Protection** - Secure API endpoints

### 🎨 **Modern UI/UX**
- **Responsive Design** - Works on all devices
- **Professional Branding** - Lightning bolt logo and modern styling
- **Loading States** - Smooth user experience
- **Error Handling** - Graceful error management

## 🛠️ Tech Stack

### Frontend
- **React 18** with TypeScript
- **React Router** for navigation
- **Stripe React Components** for embedded checkout
- **Lucide React** for icons
- **Axios** for API calls

### Backend
- **Node.js** with Express
- **PostgreSQL** database
- **Stripe API** for payments
- **JWT** for authentication
- **Nodemailer** for email sending

### Infrastructure
- **Docker** for containerization
- **Vercel** for frontend hosting
- **Railway** for backend hosting
- **GitHub Actions** for CI/CD

## 🚀 Quick Start

### Development
```bash
# Clone repository
git clone https://github.com/yourusername/quickbill-pro.git
cd quickbill-pro

# Start with Docker
docker-compose up

# Or start manually
cd backend && npm install && npm start
cd frontend && npm install && npm start
```

### Production Deployment
```bash
# Run deployment script
./deploy.sh

# Follow instructions in DEPLOYMENT.md
```

## 📊 Business Model

QuickBill Pro generates revenue through subscription plans:

| Plan | Price | Invoices | Features |
|------|-------|----------|----------|
| Free | $0/mo | 3/month | Basic templates, PDF export |
| Starter | $9/mo | 50/month | Payment tracking, Email sending |
| Pro | $19/mo | Unlimited | Recurring billing, Reports, Branding |
| Business | $39/mo | Unlimited | Multi-user, API access, Priority support |

## 🔧 Configuration

### Environment Variables

**Backend (Railway)**:
```env
DATABASE_URL=postgresql://...
JWT_SECRET=your_secret_key
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
FRONTEND_URL=https://your-app.vercel.app
```

**Frontend (Vercel)**:
```env
REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_...
REACT_APP_API_URL=https://your-backend.railway.app/api
```

## 📈 Revenue Potential

With just **100 paid subscribers**:
- 50 Starter plans × $9 = **$450/month**
- 30 Pro plans × $19 = **$570/month**  
- 20 Business plans × $39 = **$780/month**
- **Total: $1,800/month** 💰

## 🎯 Marketing Strategy

1. **Content Marketing** - Blog about invoicing best practices
2. **SEO Optimization** - Target "invoice generator" keywords
3. **Social Media** - Share invoice templates and tips
4. **Referral Program** - Reward users for referrals
5. **Free Trial** - Convert free users to paid plans

## 🔒 Security Features

- **Environment Variables** - Sensitive data protection
- **CORS Configuration** - Cross-origin request security  
- **JWT Tokens** - Secure authentication
- **Input Validation** - SQL injection prevention
- **Rate Limiting** - API abuse protection

## 📱 Mobile Responsive

QuickBill Pro works perfectly on:
- 📱 **Mobile phones** (iPhone, Android)
- 📱 **Tablets** (iPad, Android tablets)  
- 💻 **Desktop** (Windows, Mac, Linux)
- 🌐 **All modern browsers**

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- 📧 **Email**: support@quickbillpro.com
- 💬 **Discord**: [Join our community](https://discord.gg/quickbillpro)
- 📚 **Documentation**: [docs.quickbillpro.com](https://docs.quickbillpro.com)
- 🐛 **Issues**: [GitHub Issues](https://github.com/yourusername/quickbill-pro/issues)

---

**Made with ⚡ by QuickBill Pro Team**

*Professional invoicing made simple.*