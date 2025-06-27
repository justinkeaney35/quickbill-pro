#!/bin/bash

# QuickBill Pro Deployment Script

echo "🚀 Starting QuickBill Pro Deployment..."

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo "📦 Initializing Git repository..."
    git init
    git add .
    git commit -m "Initial commit - QuickBill Pro with Stripe Embedded Checkout"
    echo "✅ Git repository initialized"
else
    echo "📝 Adding changes to Git..."
    git add .
    git commit -m "Update: Deployment configuration and Stripe embedded checkout"
    echo "✅ Changes committed"
fi

echo ""
echo "🎯 Next Steps:"
echo "1. Push to GitHub:"
echo "   git remote add origin https://github.com/YOURUSERNAME/quickbill-pro.git"
echo "   git branch -M main" 
echo "   git push -u origin main"
echo ""
echo "2. Deploy Backend to Railway:"
echo "   - Go to railway.app"
echo "   - Create new project from GitHub repo"
echo "   - Select 'backend' folder"
echo "   - Add environment variables from backend/.env.production"
echo ""
echo "3. Deploy Frontend to Vercel:"
echo "   - Go to vercel.com"
echo "   - Create new project from GitHub repo" 
echo "   - Select 'frontend' folder"
echo "   - Add environment variables from frontend/.env.production"
echo ""
echo "4. Update URLs:"
echo "   - Update FRONTEND_URL in Railway to your Vercel domain"
echo "   - Update REACT_APP_API_URL in Vercel to your Railway domain"
echo ""
echo "📖 See DEPLOYMENT.md for detailed instructions"
echo ""
echo "🎉 QuickBill Pro is ready for deployment!"