# 📧 Email Configuration Guide for QuickBill Pro

Your invoice email functionality is **fully implemented** but needs proper email configuration to work in production. Here are your options:

## 🚀 Quick Start (Testing)

Your app automatically uses **Ethereal Email** for testing when no SMTP is configured. Check your backend console logs for:
- 📧 Ethereal credentials
- 🔗 Preview URLs to view sent emails

## 📋 Option 1: Gmail SMTP (Recommended for Development)

### Step 1: Enable 2-Factor Authentication
1. Go to your Google Account settings
2. Enable 2-Factor Authentication

### Step 2: Generate App Password
1. Go to Google Account > Security > App passwords
2. Generate a new app password for "Mail"
3. Copy the 16-character password

### Step 3: Set Environment Variables
Add these to your `.env` file or Railway/Vercel environment:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-gmail@gmail.com
SMTP_PASS=your-16-char-app-password
FROM_EMAIL=your-gmail@gmail.com
```

## 📋 Option 2: Professional Email Services

### SendGrid (Recommended for Production)
```env
SENDGRID_API_KEY=your-sendgrid-api-key
FROM_EMAIL=noreply@yourdomain.com
```

### Mailgun
```env
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=postmaster@mg.yourdomain.com
SMTP_PASS=your-mailgun-password
FROM_EMAIL=noreply@yourdomain.com
```

### AWS SES
```env
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_USER=your-ses-access-key
SMTP_PASS=your-ses-secret-key
FROM_EMAIL=noreply@yourdomain.com
```

## 🔧 Deployment Configuration

### Railway
1. Go to your Railway project
2. Click on **Variables** tab
3. Add the environment variables above

### Vercel
1. Go to your Vercel project settings
2. Click on **Environment Variables**
3. Add the variables for Production, Preview, and Development

## ✅ Testing Email Configuration

### Method 1: Check Backend Logs
Look for these messages when your app starts:
- ✅ "SMTP connection verified successfully" (configured)
- 🧪 "Using Ethereal Email for testing" (test mode)

### Method 2: Use Built-in Test Endpoint
Send a POST request to test email:
```bash
curl -X POST https://your-api.railway.app/api/admin/test-email \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"to": "test@example.com"}'
```

### Method 3: Check Email Status
```bash
curl https://your-api.railway.app/api/admin/email-status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 🐛 Troubleshooting

### Common Issues

1. **"Email not configured" error**
   - Check environment variables are set correctly
   - Restart your app after adding variables

2. **Gmail "Invalid credentials"**
   - Ensure 2FA is enabled
   - Use App Password, not regular password
   - Remove spaces from app password

3. **"SMTP verification failed"**
   - Check SMTP host and port
   - Verify credentials
   - Check firewall/network restrictions

4. **Emails not reaching inbox**
   - Check spam folder
   - Verify FROM_EMAIL domain
   - Consider using professional email service

### Debug Steps

1. Check backend console for email setup messages
2. Use the test email endpoint
3. Try sending an actual invoice email
4. Check server logs for detailed error messages

## 🎯 Current Status

Your QuickBill Pro app includes:
- ✅ Complete email sending functionality
- ✅ Professional HTML email templates
- ✅ Stripe payment link integration
- ✅ Copy-to-sender functionality
- ✅ Automatic test email fallback
- ✅ Email testing endpoints

**Next Steps:**
1. Choose an email provider from the options above
2. Set environment variables
3. Restart your application
4. Test with the built-in email test endpoint
5. Send your first invoice! 🚀

## 📞 Need Help?

If you encounter issues:
1. Check the backend console logs
2. Use the email status endpoint to diagnose configuration
3. Start with Gmail for quick testing
4. Move to professional service for production

Your email functionality is ready to go - it just needs the right configuration! 🎉

## 🔐 OAuth2 Business Email Authentication (NEW!)

**Now supports sending invoices from individual business email addresses!**

### Benefits:
- ✅ **Invoices sent from actual business emails** (john@company.com vs noreply@quickbill.com)
- ✅ **Clients recognize the sender** (better response rates)
- ✅ **Secure OAuth2 authentication** (no password storage)
- ✅ **Automatic token refresh** (no maintenance needed)

### Setup Steps:

#### For Gmail/Google Workspace:
1. **Google Cloud Console Setup:**
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create a new project or select existing
   - Enable Gmail API in Library
   - Go to Credentials → Create OAuth 2.0 Client ID
   - Add authorized redirect URI: `your-domain.com/api/auth/google/callback`

2. **Environment Variables:**
   ```env
   GOOGLE_CLIENT_ID=your-google-client-id
   GOOGLE_CLIENT_SECRET=your-google-client-secret
   GOOGLE_REDIRECT_URI=https://your-api.railway.app/api/auth/google/callback
   ```

#### For Outlook/Microsoft 365:
1. **Azure App Registration:**
   - Go to [Azure Portal](https://portal.azure.com)
   - Azure Active Directory → App registrations → New registration
   - Add redirect URI: `your-domain.com/api/auth/microsoft/callback`
   - API permissions → Add Microsoft Graph → Mail.Send + User.Read
   - Grant admin consent

2. **Environment Variables:**
   ```env
   MICROSOFT_CLIENT_ID=your-microsoft-client-id
   MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret
   MICROSOFT_REDIRECT_URI=https://your-api.railway.app/api/auth/microsoft/callback
   ```

### How It Works:
1. **User connects email** in dashboard (one-time setup)
2. **OAuth2 authentication** redirects to Google/Microsoft
3. **Tokens stored securely** in your database
4. **Invoices sent from business email** automatically
5. **Falls back to SMTP** if OAuth2 fails

### API Endpoints Added:
- `GET /api/auth/gmail/authorize` - Start Gmail connection
- `GET /api/auth/outlook/authorize` - Start Outlook connection  
- `GET /api/user/email-accounts` - View connected accounts
- `DELETE /api/user/email-accounts/:provider` - Disconnect account

**This is a game-changer for professional invoicing!** 🚀