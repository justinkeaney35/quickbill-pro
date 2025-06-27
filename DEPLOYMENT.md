# QuickBill Pro Deployment Guide

## Prerequisites
- GitHub account
- Vercel account (free)
- Railway account (free)

## Deployment Steps

### 1. Push to GitHub
```bash
# Initialize git repository
git init
git add .
git commit -m "Initial commit - QuickBill Pro"

# Create GitHub repository and push
git remote add origin https://github.com/yourusername/quickbill-pro.git
git branch -M main
git push -u origin main
```

### 2. Deploy Backend to Railway

1. Go to [railway.app](https://railway.app)
2. Sign up/login with GitHub
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your repository
5. Choose the `backend` folder as root directory
6. Add environment variables:

```
DATABASE_URL=postgresql://postgres:password@localhost:5432/quickbill_db (Railway will provide)
JWT_SECRET=your_super_secure_random_string_here
NODE_ENV=production
STRIPE_PUBLISHABLE_KEY=pk_test_51Rehl9Gb9LLbQg43XMoVXt7cxGvPbv6hNURnyScNcCpWtmWXFFDiDJuckv9vt4dIvcJR32LsGHiOpqDWt6gZKkY200vMucBa9T
STRIPE_SECRET_KEY=sk_test_51Rehl9Gb9LLbQg43z3qWMdsut7xJ51s7ykx8XkzMRvsqQg51dDJT4yEKwH9aihwZPidtwc9JVufeaGEMygWyzlqN00r2UMGK2I
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
FRONTEND_URL=https://your-app.vercel.app
```

7. Railway will automatically provide PostgreSQL database
8. Note your Railway backend URL (e.g., `https://quickbill-backend.railway.app`)

### 3. Deploy Frontend to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Sign up/login with GitHub
3. Click "New Project" → Import your GitHub repository
4. Choose the `frontend` folder as root directory
5. Add environment variables:

```
REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_51Rehl9Gb9LLbQg43XMoVXt7cxGvPbv6hNURnyScNcCpWtmWXFFDiDJuckv9vt4dIvcJR32LsGHiOpqDWt6gZKkY200vMucBa9T
REACT_APP_API_URL=https://your-backend.railway.app/api
```

6. Deploy and note your Vercel frontend URL

### 4. Update Environment Variables

After both deployments:

1. **Update Railway backend** `FRONTEND_URL` to your Vercel domain
2. **Update Vercel frontend** `REACT_APP_API_URL` to your Railway domain
3. Redeploy both if needed

### 5. Configure Stripe Webhooks

1. Go to Stripe Dashboard → Webhooks
2. Add endpoint: `https://your-backend.railway.app/api/webhooks/stripe`
3. Select events: `checkout.session.completed`, `invoice.payment_succeeded`, `customer.subscription.deleted`
4. Copy webhook secret and update `STRIPE_WEBHOOK_SECRET` in Railway

## Custom Domain Setup

### Option 1: Vercel Custom Domain
1. In Vercel project settings → Domains
2. Add your custom domain
3. Follow DNS instructions
4. Update `FRONTEND_URL` in Railway

### Option 2: Cloudflare + Custom Domain
1. Add domain to Cloudflare
2. Set up page rules for SPA routing
3. Configure DNS to point to Vercel

## Environment Variables Checklist

### Backend (Railway)
- [x] DATABASE_URL (auto-provided)
- [x] JWT_SECRET
- [x] NODE_ENV=production
- [x] STRIPE_SECRET_KEY
- [x] STRIPE_WEBHOOK_SECRET
- [x] FRONTEND_URL

### Frontend (Vercel)
- [x] REACT_APP_STRIPE_PUBLISHABLE_KEY
- [x] REACT_APP_API_URL

## Post-Deployment Testing

1. Visit your Vercel frontend URL
2. Test user registration and login
3. Test invoice creation
4. Test subscription upgrade flow
5. Verify Stripe webhooks are working

## Monitoring

- **Railway**: Monitor backend logs and metrics
- **Vercel**: Monitor frontend analytics and performance
- **Stripe**: Monitor payments and webhooks in dashboard

## Support

After deployment, your QuickBill Pro will be live and ready for users!

Frontend: `https://your-app.vercel.app`
Backend: `https://your-backend.railway.app`