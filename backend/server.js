require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { PlaidApi, Configuration, PlaidEnvironments } = require('plaid');

const app = express();
const PORT = process.env.PORT || 3001;

// Database connection (PostgreSQL)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/quickbill_db'
});

// Plaid client configuration
let plaidClient = null;

if (process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET) {
  const plaidConfiguration = new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENVIRONMENT || 'sandbox'],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
        'PLAID-SECRET': process.env.PLAID_SECRET,
      },
    },
  });

  plaidClient = new PlaidApi(plaidConfiguration);
  console.log('Plaid client initialized successfully');
} else {
  console.warn('Plaid credentials not found. Plaid features will be disabled.');
}

// Middleware
app.use(helmet());
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'https://quickbillpro.net',
    'https://www.quickbillpro.net'
  ],
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json());

// Trust proxy for Railway
app.set('trust proxy', 1);

// Email transporter setup
let transporter;

const setupEmailTransporter = async () => {
  try {
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      // Use configured SMTP
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS.replace(/\s/g, '') // Remove any spaces from app password
        }
      });
      console.log('Using configured SMTP for email delivery');
      console.log('SMTP Host:', process.env.SMTP_HOST);
      console.log('SMTP User:', process.env.SMTP_USER);
      
      // Test the connection
      try {
        await transporter.verify();
        console.log('SMTP connection verified successfully');
      } catch (verifyError) {
        console.error('SMTP verification failed:', verifyError);
      }
    } else {
      // Use Ethereal Email for testing (creates test account automatically)
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });
      console.log('Using Ethereal Email for testing');
      console.log('Ethereal credentials:', { user: testAccount.user, pass: testAccount.pass });
    }
  } catch (error) {
    console.error('Email setup error:', error);
    console.warn('Email functionality will be limited. Please configure SMTP settings.');
    // Create a dummy transporter that provides user feedback
    transporter = {
      sendMail: async (mailOptions) => {
        console.log('Email not configured - would send:', {
          to: mailOptions.to,
          subject: mailOptions.subject,
          html: mailOptions.html?.substring(0, 200) + '...'
        });
        // Throw an error so the user knows emails aren't working
        throw new Error('Email not configured. Please contact administrator to set up SMTP settings.');
      }
    };
  }
};

// Initialize email on startup
setupEmailTransporter();

// Email template function
function generateInvoiceHTML(invoice, items, paymentLink) {
  const itemsHTML = items.map(item => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${item.description}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.quantity}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">$${parseFloat(item.rate).toFixed(2)}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">$${parseFloat(item.amount).toFixed(2)}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Invoice #${invoice.invoice_number}</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #374151; background-color: #f9fafb; margin: 0; padding: 20px;">
      <div style="max-width: 800px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); overflow: hidden;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); color: white; padding: 40px 40px 30px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <h1 style="margin: 0; font-size: 28px; font-weight: 700;">Invoice</h1>
              <p style="margin: 8px 0 0; font-size: 18px; opacity: 0.9;">#${invoice.invoice_number}</p>
            </div>
            <div style="text-align: right;">
              <h2 style="margin: 0; font-size: 24px; font-weight: 600;">${invoice.user_company || invoice.user_name}</h2>
              <p style="margin: 8px 0 0; opacity: 0.9;">Powered by QuickBill Pro</p>
            </div>
          </div>
        </div>

        <!-- Invoice Details -->
        <div style="padding: 40px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px;">
            <div>
              <h3 style="margin: 0 0 16px; color: #1f2937; font-size: 18px;">Bill To:</h3>
              <div style="color: #6b7280;">
                <p style="margin: 0; font-weight: 600; color: #1f2937; font-size: 16px;">${invoice.client_name}</p>
                <p style="margin: 4px 0 0;">${invoice.client_email}</p>
                ${invoice.client_address ? `<p style="margin: 4px 0 0;">${invoice.client_address.replace(/\n/g, '<br>')}</p>` : ''}
              </div>
            </div>
            <div>
              <h3 style="margin: 0 0 16px; color: #1f2937; font-size: 18px;">Invoice Details:</h3>
              <div style="color: #6b7280;">
                <p style="margin: 0;"><strong>Issue Date:</strong> ${new Date(invoice.date).toLocaleDateString()}</p>
                <p style="margin: 4px 0 0;"><strong>Due Date:</strong> ${new Date(invoice.due_date).toLocaleDateString()}</p>
                <p style="margin: 4px 0 0;"><strong>Status:</strong> <span style="color: ${invoice.status === 'paid' ? '#10b981' : '#f59e0b'}; font-weight: 600; text-transform: capitalize;">${invoice.status}</span></p>
              </div>
            </div>
          </div>

          <!-- Items Table -->
          <table style="width: 100%; border-collapse: collapse; margin: 40px 0; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
            <thead>
              <tr style="background: #f9fafb;">
                <th style="padding: 16px 12px; text-align: left; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb;">Description</th>
                <th style="padding: 16px 12px; text-align: center; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb;">Qty</th>
                <th style="padding: 16px 12px; text-align: right; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb;">Rate</th>
                <th style="padding: 16px 12px; text-align: right; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHTML}
            </tbody>
            <tfoot>
              <tr style="background: #f9fafb;">
                <td colspan="3" style="padding: 16px 12px; text-align: right; font-weight: 600; color: #1f2937; border-top: 2px solid #e5e7eb;">Total:</td>
                <td style="padding: 16px 12px; text-align: right; font-weight: 700; color: #1f2937; font-size: 18px; border-top: 2px solid #e5e7eb;">$${parseFloat(invoice.total).toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>

          ${invoice.notes ? `
          <div style="margin: 40px 0;">
            <h3 style="margin: 0 0 16px; color: #1f2937; font-size: 18px;">Notes:</h3>
            <div style="background: #f9fafb; padding: 20px; border-radius: 8px; border-left: 4px solid #3b82f6;">
              <p style="margin: 0; color: #6b7280;">${invoice.notes.replace(/\n/g, '<br>')}</p>
            </div>
          </div>
          ` : ''}

          ${paymentLink ? `
          <!-- Payment Button -->
          <div style="text-align: center; margin: 40px 0;">
            <div style="background: #f0f9ff; padding: 30px; border-radius: 12px; border: 1px solid #e0f2fe;">
              <h3 style="margin: 0 0 16px; color: #1e40af; font-size: 20px;">Ready to Pay?</h3>
              <p style="margin: 0 0 24px; color: #6b7280;">Click the button below to pay this invoice securely with your credit card or bank account.</p>
              <a href="${paymentLink}" style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);">
                Pay Invoice - $${parseFloat(invoice.total).toFixed(2)}
              </a>
              <p style="margin: 16px 0 0; font-size: 12px; color: #9ca3af;">Powered by Stripe - Your payment information is secure</p>
            </div>
          </div>
          ` : ''}

          <!-- Footer -->
          <div style="margin-top: 40px; padding-top: 40px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 14px;">
            <p style="margin: 0;">Thank you for your business!</p>
            <p style="margin: 8px 0 0;">If you have any questions, please contact ${invoice.user_email}</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

// JWT middleware for authentication
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'quickbill_secret_key', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Database initialization (creates tables if they don't exist)
const initDatabase = async () => {
  try {
    // Create users table with basic structure first
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        company VARCHAR(255),
        plan VARCHAR(50) DEFAULT 'free',
        invoices_this_month INTEGER DEFAULT 0,
        max_invoices INTEGER DEFAULT 3,
        stripe_customer_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add new columns for email verification if they don't exist
    try {
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255)
      `);
      console.log('Added email verification columns to users table');
    } catch (alterError) {
      console.log('Email verification columns already exist or error adding them:', alterError.message);
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        address TEXT,
        phone VARCHAR(50),
        company VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
        invoice_number VARCHAR(50) NOT NULL,
        date DATE NOT NULL,
        due_date DATE NOT NULL,
        status VARCHAR(20) DEFAULT 'draft',
        subtotal DECIMAL(10,2) NOT NULL,
        tax_rate DECIMAL(5,2) DEFAULT 0,
        tax_amount DECIMAL(10,2) DEFAULT 0,
        total DECIMAL(10,2) NOT NULL,
        notes TEXT,
        payment_link TEXT,
        sent_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS invoice_items (
        id SERIAL PRIMARY KEY,
        invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
        description TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        rate DECIMAL(10,2) NOT NULL,
        amount DECIMAL(10,2) NOT NULL
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
        amount DECIMAL(10,2) NOT NULL,
        payment_method VARCHAR(50),
        stripe_payment_id VARCHAR(255),
        paypal_payment_id VARCHAR(255),
        status VARCHAR(20) DEFAULT 'pending',
        paid_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        stripe_subscription_id VARCHAR(255) UNIQUE,
        stripe_customer_id VARCHAR(255),
        plan VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'active',
        current_period_start TIMESTAMP,
        current_period_end TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS connect_accounts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
        stripe_account_id VARCHAR(255) UNIQUE NOT NULL,
        account_status VARCHAR(50) DEFAULT 'pending',
        details_submitted BOOLEAN DEFAULT false,
        charges_enabled BOOLEAN DEFAULT false,
        payouts_enabled BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add business_info column if it doesn't exist
    try {
      await pool.query(`
        ALTER TABLE connect_accounts 
        ADD COLUMN IF NOT EXISTS business_info JSONB
      `);
      console.log('Added business_info column to connect_accounts table');
    } catch (alterError) {
      console.log('business_info column already exists or error adding it:', alterError.message);
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS payouts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        stripe_transfer_id VARCHAR(255) UNIQUE,
        amount DECIMAL(10,2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'usd',
        status VARCHAR(50) DEFAULT 'pending',
        arrival_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS bank_accounts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
        plaid_access_token TEXT NOT NULL,
        plaid_item_id VARCHAR(255) NOT NULL,
        account_id VARCHAR(255) NOT NULL,
        account_name VARCHAR(255) NOT NULL,
        account_type VARCHAR(50) NOT NULL,
        institution_name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Database tables initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
};

// Initialize database on startup
initDatabase();

// AUTH ROUTES

// Verify email
app.get('/api/auth/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    console.log('Verification attempt with token:', token ? token.substring(0, 8) + '...' : 'null');

    if (!token) {
      console.log('No token provided');
      return res.status(400).json({ error: 'Verification token is required' });
    }

    // Find user with verification token
    const result = await pool.query(
      'SELECT id, email, email_verified FROM users WHERE verification_token = $1',
      [token]
    );

    console.log('Users found with token:', result.rows.length);

    if (result.rows.length === 0) {
      console.log('No user found with token');
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    const user = result.rows[0];
    console.log('User found:', user.email, 'Already verified:', user.email_verified);

    if (user.email_verified) {
      console.log('User already verified');
      return res.status(400).json({ error: 'Email is already verified' });
    }

    // Verify the email
    const updateResult = await pool.query(
      'UPDATE users SET email_verified = true, verification_token = NULL WHERE id = $1',
      [user.id]
    );

    console.log('Update successful, rows affected:', updateResult.rowCount);
    res.json({ message: 'Email verified successfully! You can now log in.' });

  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Resend verification email
app.post('/api/auth/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Find user
    const result = await pool.query('SELECT id, name, email, email_verified FROM users WHERE email = $1', [email]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    if (user.email_verified) {
      return res.status(400).json({ error: 'Email is already verified' });
    }

    // Generate new verification token
    const verificationToken = require('crypto').randomBytes(32).toString('hex');

    // Update user with new token
    await pool.query(
      'UPDATE users SET verification_token = $1 WHERE id = $2',
      [verificationToken, user.id]
    );

    // Send verification email
    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}`;
    
    const mailOptions = {
      from: process.env.FROM_EMAIL || 'noreply@quickbillpro.com',
      to: email,
      subject: 'QuickBill Pro - Verify your email address',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #4F46E5; margin: 0;">⚡ QuickBill Pro</h1>
            <p style="color: #6B7280; margin: 5px 0 0 0;">Professional Invoicing Made Simple</p>
          </div>
          
          <h2 style="color: #1F2937;">Hi ${user.name}!</h2>
          
          <p style="color: #374151; line-height: 1.6;">Please verify your email address to complete your registration and start using QuickBill Pro.</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" style="background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">Verify Email Address</a>
          </div>
          
          <p style="color: #6B7280; font-size: 14px; line-height: 1.6;">If the button doesn't work, copy and paste this link into your browser:<br>
          <a href="${verificationUrl}" style="color: #4F46E5;">${verificationUrl}</a></p>
          
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">
          
          <p style="color: #6B7280; font-size: 14px; text-align: center;">Need help? Contact us at support@quickbillpro.com</p>
        </div>
      `
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      console.log(`Verification email resent to ${email}`);
      
      // If using Ethereal, log the preview URL
      if (nodemailer.getTestMessageUrl(info)) {
        console.log('Email preview URL:', nodemailer.getTestMessageUrl(info));
      }

      res.json({ message: 'Verification email sent successfully!' });
    } catch (emailError) {
      console.error('Failed to resend verification email:', emailError);
      res.status(500).json({ error: 'Failed to send verification email. Please try again later.' });
    }

  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Register user
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, company } = req.body;

    // Validate password strength
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json({ 
        error: 'Password must be at least 8 characters long and contain uppercase, lowercase, number, and special character' 
      });
    }

    // Check if user already exists
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Generate verification token
    const verificationToken = require('crypto').randomBytes(32).toString('hex');

    // Create user
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash, company, verification_token, email_verified) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, email, company, plan, invoices_this_month, max_invoices, email_verified',
      [name, email, passwordHash, company, verificationToken, false]
    );

    const user = result.rows[0];

    // Send verification email
    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}`;
    
    const welcomeMailOptions = {
      from: process.env.FROM_EMAIL || 'noreply@quickbillpro.com',
      to: email,
      subject: 'Welcome to QuickBill Pro - Please verify your email',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #4F46E5; margin: 0;">⚡ QuickBill Pro</h1>
            <p style="color: #6B7280; margin: 5px 0 0 0;">Professional Invoicing Made Simple</p>
          </div>
          
          <h2 style="color: #1F2937;">Welcome ${name}!</h2>
          
          <p style="color: #374151; line-height: 1.6;">Thank you for joining QuickBill Pro! We're excited to help you streamline your invoicing process.</p>
          
          <div style="background: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #1F2937; margin: 0 0 10px 0;">Getting Started:</h3>
            <ul style="color: #374151; margin: 0; padding-left: 20px;">
              <li>Create and manage professional invoices</li>
              <li>Track payments and client information</li>
              <li>Accept payments with integrated Stripe</li>
              <li>Send invoices directly to your clients</li>
            </ul>
          </div>
          
          <p style="color: #374151; line-height: 1.6;">To get started, please verify your email address by clicking the button below:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" style="background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">Verify Email Address</a>
          </div>
          
          <p style="color: #6B7280; font-size: 14px; line-height: 1.6;">If the button doesn't work, copy and paste this link into your browser:<br>
          <a href="${verificationUrl}" style="color: #4F46E5;">${verificationUrl}</a></p>
          
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">
          
          <p style="color: #6B7280; font-size: 14px; text-align: center;">Need help? Contact us at support@quickbillpro.com</p>
        </div>
      `
    };

    try {
      const info = await transporter.sendMail(welcomeMailOptions);
      console.log(`Verification email sent to ${email}`);
      
      // If using Ethereal, log the preview URL
      if (nodemailer.getTestMessageUrl(info)) {
        console.log('Email preview URL:', nodemailer.getTestMessageUrl(info));
      }
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      // Still register the user but log the error
    }

    res.status(201).json({
      message: 'Registration successful! Please check your email to verify your account.',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        company: user.company,
        plan: user.plan,
        invoicesThisMonth: user.invoices_this_month,
        maxInvoices: user.max_invoices,
        emailVerified: user.email_verified
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login user
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Check if email is verified (required for all users)
    if (!user.email_verified) {
      return res.status(400).json({ 
        error: 'Please verify your email address before logging in. Check your inbox for the verification link.' 
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET || 'quickbill_secret_key',
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        company: user.company,
        plan: user.plan,
        invoicesThisMonth: user.invoices_this_month,
        maxInvoices: user.max_invoices
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// CLIENT ROUTES

// Get all clients for user
app.get('/api/clients', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM clients WHERE user_id = $1 ORDER BY name',
      [req.user.userId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get clients error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create new client
app.post('/api/clients', authenticateToken, async (req, res) => {
  try {
    const { name, email, address, phone, company } = req.body;

    const result = await pool.query(
      'INSERT INTO clients (user_id, name, email, address, phone, company) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [req.user.userId, name, email, address, phone, company]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create client error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update client
app.put('/api/clients/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, address, phone, company } = req.body;

    const result = await pool.query(
      'UPDATE clients SET name = $1, email = $2, address = $3, phone = $4, company = $5 WHERE id = $6 AND user_id = $7 RETURNING *',
      [name, email, address, phone, company, id, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update client error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete client
app.delete('/api/clients/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM clients WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json({ message: 'Client deleted successfully' });
  } catch (error) {
    console.error('Delete client error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// INVOICE ROUTES

// Get all invoices for user
app.get('/api/invoices', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT i.*, c.name as client_name, c.email as client_email, c.address as client_address
      FROM invoices i
      JOIN clients c ON i.client_id = c.id
      WHERE i.user_id = $1
      ORDER BY i.created_at DESC
    `, [req.user.userId]);

    // Get invoice items for each invoice
    const invoicesWithItems = await Promise.all(
      result.rows.map(async (invoice) => {
        const itemsResult = await pool.query(
          'SELECT * FROM invoice_items WHERE invoice_id = $1',
          [invoice.id]
        );
        return {
          ...invoice,
          items: itemsResult.rows
        };
      })
    );

    res.json(invoicesWithItems);
  } catch (error) {
    console.error('Get invoices error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create new invoice
app.post('/api/invoices', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const { clientId, newClient, date, dueDate, items, notes, taxRate = 0 } = req.body;
    
    console.log('Creating invoice with data:', {
      clientId,
      newClient: newClient ? { ...newClient, email: newClient.email } : null,
      itemsCount: items ? items.length : 0,
      date,
      dueDate
    });

    // Validate required fields
    if (!date || !dueDate || !items || !Array.isArray(items)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: 'Missing required fields: date, dueDate, and items are required',
        received: { date: !!date, dueDate: !!dueDate, items: Array.isArray(items) }
      });
    }

    // Check if user can create more invoices
    const userResult = await client.query(
      'SELECT plan, invoices_this_month, max_invoices FROM users WHERE id = $1',
      [req.user.userId]
    );
    
    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userResult.rows[0];
    if (user.plan === 'free' && user.invoices_this_month >= user.max_invoices) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Monthly invoice limit reached. Please upgrade your plan.' });
    }

    // Handle client creation or selection
    let finalClientId = clientId;
    let clientInfo = null;

    if (clientId === 'new' && newClient) {
      // Create new client
      console.log('Creating new client:', newClient.name, newClient.email);
      
      if (!newClient.name || !newClient.email) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'New client must have name and email' });
      }

      const newClientResult = await client.query(`
        INSERT INTO clients (user_id, name, email, address, phone, company)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [
        req.user.userId,
        newClient.name.trim(),
        newClient.email.trim(),
        newClient.address || '',
        newClient.phone || '',
        newClient.company || ''
      ]);
      
      finalClientId = newClientResult.rows[0].id;
      clientInfo = newClientResult.rows[0];
      console.log('New client created with ID:', finalClientId);
    } else if (clientId && clientId !== 'new') {
      // Use existing client
      const clientResult = await client.query('SELECT * FROM clients WHERE id = $1 AND user_id = $2', [clientId, req.user.userId]);
      
      if (clientResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Client not found or access denied' });
      }
      
      clientInfo = clientResult.rows[0];
      console.log('Using existing client ID:', finalClientId);
    } else {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Either clientId or newClient data must be provided' });
    }

    // Generate invoice number
    const invoiceCountResult = await client.query(
      'SELECT COUNT(*) FROM invoices WHERE user_id = $1',
      [req.user.userId]
    );
    const invoiceNumber = `INV-${String(parseInt(invoiceCountResult.rows[0].count) + 1).padStart(3, '0')}`;

    // Validate and calculate totals
    const validItems = items.filter(item => item.description && item.description.trim());
    
    if (validItems.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'At least one item with description is required' });
    }

    let subtotal = 0;
    for (const item of validItems) {
      const quantity = parseFloat(item.quantity) || 0;
      const rate = parseFloat(item.rate) || 0;
      
      if (quantity <= 0 || rate < 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Invalid item quantities or rates' });
      }
      
      subtotal += quantity * rate;
    }

    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;

    console.log('Creating invoice:', {
      invoiceNumber,
      clientId: finalClientId,
      subtotal,
      total,
      itemsCount: validItems.length
    });

    // Create invoice
    const invoiceResult = await client.query(`
      INSERT INTO invoices (user_id, client_id, invoice_number, date, due_date, status, subtotal, tax_rate, tax_amount, total, notes)
      VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7, $8, $9, $10)
      RETURNING *
    `, [req.user.userId, finalClientId, invoiceNumber, date, dueDate, subtotal, taxRate, taxAmount, total, notes || '']);

    const invoice = invoiceResult.rows[0];
    console.log('Invoice created with ID:', invoice.id);

    // Create invoice items
    const invoiceItems = [];
    for (const item of validItems) {
      const quantity = parseFloat(item.quantity);
      const rate = parseFloat(item.rate);
      const amount = quantity * rate;
      
      const itemResult = await client.query(
        'INSERT INTO invoice_items (invoice_id, description, quantity, rate, amount) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [invoice.id, item.description.trim(), quantity, rate, amount]
      );
      invoiceItems.push(itemResult.rows[0]);
    }

    console.log('Created', invoiceItems.length, 'invoice items');

    // Update user's invoice count
    await client.query(
      'UPDATE users SET invoices_this_month = invoices_this_month + 1 WHERE id = $1',
      [req.user.userId]
    );

    await client.query('COMMIT');

    const responseData = {
      ...invoice,
      items: invoiceItems,
      client_name: clientInfo.name,
      client_email: clientInfo.email,
      client_address: clientInfo.address
    };

    console.log('Invoice creation successful');
    res.status(201).json(responseData);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create invoice error:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail,
      constraint: error.constraint
    });
    
    // Provide more specific error messages
    if (error.code === '23505') { // Unique constraint violation
      return res.status(409).json({ error: 'Duplicate invoice number or client email' });
    }
    
    if (error.code === '23503') { // Foreign key constraint violation
      return res.status(400).json({ error: 'Invalid client or user reference' });
    }
    
    if (error.code === '23502') { // Not null constraint violation
      return res.status(400).json({ error: 'Missing required field: ' + error.column });
    }
    
    res.status(500).json({ 
      error: 'Failed to create invoice',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  } finally {
    client.release();
  }
});

// Update invoice status
app.patch('/api/invoices/:id/status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const result = await pool.query(
      'UPDATE invoices SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 RETURNING *',
      [status, id, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update invoice status error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// This endpoint is removed - using the more comprehensive version below around line 1956

// USER ROUTES

// Get user profile
app.get('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, company, plan, invoices_this_month, max_invoices FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user profile
app.put('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const { name, email, company } = req.body;

    const result = await pool.query(
      'UPDATE users SET name = $1, email = $2, company = $3 WHERE id = $4 RETURNING id, name, email, company, plan',
      [name, email, company, req.user.userId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// SUBSCRIPTION MANAGEMENT

// Create Stripe Checkout Session for subscription
app.post('/api/subscriptions/create-checkout', authenticateToken, async (req, res) => {
  try {
    const { plan } = req.body;
    
    // Plan pricing mapping
    const planPrices = {
      starter: { amount: 900, name: 'Starter Plan' }, // $9.00
      pro: { amount: 1900, name: 'Pro Plan' },        // $19.00
      business: { amount: 3900, name: 'Business Plan' } // $39.00
    };

    if (!planPrices[plan]) {
      return res.status(400).json({ error: 'Invalid plan selected' });
    }

    // Get user info
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.userId]);
    const user = userResult.rows[0];

    // Create or retrieve Stripe customer
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: {
          userId: user.id
        }
      });
      customerId = customer.id;
      
      // Update user with customer ID
      await pool.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customerId, user.id]);
    }

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `QuickBill Pro - ${planPrices[plan].name}`,
            description: 'Professional invoicing made simple'
          },
          unit_amount: planPrices[plan].amount,
          recurring: {
            interval: 'month'
          }
        },
        quantity: 1
      }],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/pricing`,
      metadata: {
        userId: user.id,
        plan: plan
      }
    });

    res.json({
      sessionId: session.id,
      url: session.url
    });

  } catch (error) {
    console.error('Stripe checkout creation error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Create Stripe Embedded Checkout Session for subscription
app.post('/api/subscriptions/create-embedded-checkout', authenticateToken, async (req, res) => {
  try {
    const { plan } = req.body;
    
    // Plan pricing mapping
    const planPrices = {
      starter: { amount: 900, name: 'Starter Plan' }, // $9.00
      pro: { amount: 1900, name: 'Pro Plan' },        // $19.00
      business: { amount: 3900, name: 'Business Plan' } // $39.00
    };

    if (!planPrices[plan]) {
      return res.status(400).json({ error: 'Invalid plan selected' });
    }

    // Get user info
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.userId]);
    const user = userResult.rows[0];

    // Create or retrieve Stripe customer
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: {
          userId: user.id
        }
      });
      customerId = customer.id;
      
      // Update user with customer ID
      await pool.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customerId, user.id]);
    }

    // Create Stripe Embedded Checkout Session
    const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded',
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `QuickBill Pro - ${planPrices[plan].name}`,
            description: 'Professional invoicing made simple'
          },
          unit_amount: planPrices[plan].amount,
          recurring: {
            interval: 'month'
          }
        },
        quantity: 1
      }],
      mode: 'subscription',
      return_url: `${process.env.FRONTEND_URL}/subscription-return?session_id={CHECKOUT_SESSION_ID}`,
      metadata: {
        userId: user.id,
        plan: plan
      }
    });

    res.json({
      clientSecret: session.client_secret
    });

  } catch (error) {
    console.error('Stripe embedded checkout creation error:', error);
    res.status(500).json({ error: 'Failed to create embedded checkout session' });
  }
});

// Get checkout session status for embedded checkout
app.get('/api/subscriptions/session-status/:sessionId', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    res.json({
      status: session.status,
      customer_email: session.customer_details?.email,
      payment_status: session.payment_status
    });

  } catch (error) {
    console.error('Get session status error:', error);
    res.status(500).json({ error: 'Failed to get session status' });
  }
});

// Handle Stripe webhooks
app.post('/api/webhooks/stripe', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        const userId = session.metadata.userId;
        const plan = session.metadata.plan;
        
        // Get subscription details
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        
        // Update user plan and create subscription record
        await pool.query('BEGIN');
        
        // Update user plan and limits
        const planLimits = {
          starter: 50,
          pro: -1, // unlimited
          business: -1 // unlimited
        };
        
        await pool.query(
          'UPDATE users SET plan = $1, max_invoices = $2, stripe_customer_id = $3 WHERE id = $4',
          [plan, planLimits[plan], session.customer, userId]
        );
        
        // Create subscription record
        await pool.query(`
          INSERT INTO subscriptions (user_id, stripe_subscription_id, stripe_customer_id, plan, status, current_period_start, current_period_end)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (stripe_subscription_id) DO UPDATE SET
            status = $5,
            current_period_start = $6,
            current_period_end = $7,
            updated_at = CURRENT_TIMESTAMP
        `, [
          userId,
          subscription.id,
          subscription.customer,
          plan,
          subscription.status,
          new Date(subscription.current_period_start * 1000),
          new Date(subscription.current_period_end * 1000)
        ]);
        
        await pool.query('COMMIT');
        
        console.log(`Subscription activated for user ${userId}, plan: ${plan}`);
        break;

      case 'invoice.payment_succeeded':
        console.log('Payment succeeded:', event.data.object.id);
        break;

      case 'customer.subscription.deleted':
        const deletedSub = event.data.object;
        
        // Downgrade user to free plan
        await pool.query(`
          UPDATE users SET plan = 'free', max_invoices = 3 
          WHERE stripe_customer_id = $1
        `, [deletedSub.customer]);
        
        // Update subscription status
        await pool.query(`
          UPDATE subscriptions SET status = 'canceled', updated_at = CURRENT_TIMESTAMP
          WHERE stripe_subscription_id = $1
        `, [deletedSub.id]);
        
        console.log(`Subscription canceled for customer ${deletedSub.customer}`);
        break;

      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;
        const invoiceId = paymentIntent.metadata.invoiceId;
        
        if (invoiceId) {
          // Mark invoice as paid
          await pool.query(
            'UPDATE invoices SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            ['paid', invoiceId]
          );
          
          console.log(`Invoice ${invoiceId} marked as paid via payment intent ${paymentIntent.id}`);
        }
        break;

      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.json({received: true});

  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Get user subscription status
app.get('/api/subscriptions/status', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, u.plan, u.max_invoices 
      FROM subscriptions s
      RIGHT JOIN users u ON s.user_id = u.id
      WHERE u.id = $1
      ORDER BY s.created_at DESC
      LIMIT 1
    `, [req.user.userId]);

    const subscription = result.rows[0];
    res.json({
      plan: subscription.plan,
      maxInvoices: subscription.max_invoices,
      subscriptionStatus: subscription.status || null,
      currentPeriodEnd: subscription.current_period_end || null
    });

  } catch (error) {
    console.error('Get subscription status error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Cancel subscription
app.post('/api/subscriptions/cancel', authenticateToken, async (req, res) => {
  try {
    const subResult = await pool.query(`
      SELECT stripe_subscription_id FROM subscriptions 
      WHERE user_id = $1 AND status = 'active'
      ORDER BY created_at DESC LIMIT 1
    `, [req.user.userId]);

    if (subResult.rows.length === 0) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    const stripeSubId = subResult.rows[0].stripe_subscription_id;
    
    // Cancel at period end
    await stripe.subscriptions.update(stripeSubId, {
      cancel_at_period_end: true
    });

    res.json({ message: 'Subscription will be canceled at the end of current period' });

  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

// STRIPE CONNECT ROUTES

// Debug endpoint to check user data and configuration
app.get('/api/connect/debug', authenticateToken, async (req, res) => {
  try {
    console.log('Debug Connect for user:', req.user.userId);
    
    // Get user details
    const userResult = await pool.query('SELECT id, name, email, company FROM users WHERE id = $1', [req.user.userId]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userResult.rows[0];
    
    // Check existing Connect account
    const existingAccount = await pool.query(
      'SELECT stripe_account_id, account_status FROM connect_accounts WHERE user_id = $1',
      [req.user.userId]
    );
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValidEmail = emailRegex.test(user.email);
    
    const debugInfo = {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        company: user.company,
        emailValid: isValidEmail
      },
      existingAccount: existingAccount.rows.length > 0 ? existingAccount.rows[0] : null,
      configuration: {
        stripeConfigured: !!process.env.STRIPE_SECRET_KEY,
        nodeEnv: process.env.NODE_ENV,
        frontendUrl: process.env.FRONTEND_URL
      },
      timestamp: new Date().toISOString()
    };
    
    res.json(debugInfo);
    
  } catch (error) {
    console.error('Debug Connect error:', error);
    res.status(500).json({ 
      error: 'Debug failed', 
      details: error.message 
    });
  }
});

// Create Connect account for user
app.post('/api/connect/create-account', authenticateToken, async (req, res) => {
  try {
    console.log('Creating Connect account for user:', req.user.userId);
    
    // Check if user already has a Connect account
    const existingAccount = await pool.query(
      'SELECT stripe_account_id, account_status FROM connect_accounts WHERE user_id = $1',
      [req.user.userId]
    );

    if (existingAccount.rows.length > 0) {
      const accountId = existingAccount.rows[0].stripe_account_id;
      console.log('Account already exists:', accountId);
      
      // Verify account still exists in Stripe
      try {
        const stripeAccount = await stripe.accounts.retrieve(accountId);
        return res.json({ 
          accountId: accountId,
          status: stripeAccount.details_submitted ? 'active' : 'pending',
          message: 'Account already exists' 
        });
      } catch (stripeError) {
        console.log('Stripe account not found, creating new one');
        await pool.query('DELETE FROM connect_accounts WHERE user_id = $1', [req.user.userId]);
      }
    }

    // Get user details
    const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [req.user.userId]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userResult.rows[0];

    // Create Stripe Express account
    const account = await stripe.accounts.create({
      type: 'express',
      email: user.email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: {
        user_id: req.user.userId.toString(),
        platform: 'quickbill_pro'
      }
    });

    console.log('Created Stripe account:', account.id);

    // Save account to database
    await pool.query(`
      INSERT INTO connect_accounts (user_id, stripe_account_id, account_status)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id) DO UPDATE SET 
        stripe_account_id = $2, 
        account_status = $3,
        updated_at = CURRENT_TIMESTAMP
    `, [req.user.userId, account.id, 'pending']);

    console.log('Connect account saved to database');

    res.json({ 
      accountId: account.id,
      message: 'Connect account created successfully' 
    });

  } catch (error) {
    console.error('Create Connect account error:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      type: error.type,
      decline_code: error.decline_code,
      param: error.param
    });
    
    // Provide more specific error messages based on Stripe error types
    if (error.type === 'StripeInvalidRequestError') {
      let errorMessage = 'Invalid request to payment processor';
      
      if (error.message.includes('email')) {
        errorMessage = 'Email address is invalid or already in use';
      } else if (error.message.includes('country')) {
        errorMessage = 'Country not supported for payment processing';
      } else if (error.message.includes('capabilities')) {
        errorMessage = 'Payment capabilities not available';
      } else if (error.message.includes('business_type')) {
        errorMessage = 'Business type configuration error';
      }
      
      return res.status(400).json({ 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
    
    if (error.type === 'StripeRateLimitError') {
      return res.status(429).json({ error: 'Too many requests. Please try again in a moment.' });
    }
    
    if (error.code === '23505') { // PostgreSQL unique constraint violation
      return res.status(409).json({ error: 'Account already exists for this user' });
    }
    
    res.status(500).json({ 
      error: 'Failed to create payment account',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Please contact support if this persists'
    });
  }
});

// Create account link for Express onboarding
app.post('/api/connect/create-account-link', authenticateToken, async (req, res) => {
  try {
    const { accountId } = req.body;

    if (!accountId) {
      return res.status(400).json({ error: 'Account ID is required' });
    }

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    
    // Create account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${baseUrl}/invoices?stripe_refresh=true`,
      return_url: `${baseUrl}/invoices?stripe_success=true`,
      type: 'account_onboarding',
    });

    res.json({ url: accountLink.url });

  } catch (error) {
    console.error('Create account link error:', error);
    res.status(500).json({ error: 'Failed to create account link' });
  }
});

// Create embedded onboarding session (keeps users on your site)
app.post('/api/connect/create-embedded-onboarding', authenticateToken, async (req, res) => {
  try {
    const { accountId } = req.body;

    if (!accountId) {
      return res.status(400).json({ error: 'Account ID is required' });
    }

    // Create account session for embedded onboarding
    const accountSession = await stripe.accountSessions.create({
      account: accountId,
      components: {
        account_onboarding: { enabled: true },
      },
    });

    res.json({ 
      client_secret: accountSession.client_secret,
      account_id: accountId
    });

  } catch (error) {
    console.error('Create embedded onboarding error:', error);
    res.status(500).json({ 
      error: 'Failed to create embedded onboarding session',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});


// Update Connect account with business information
app.post('/api/connect/update-business-info', authenticateToken, async (req, res) => {
  try {
    const { accountId, businessInfo } = req.body;
    
    console.log('Updating business info for account:', accountId);
    console.log('Business info received:', JSON.stringify(businessInfo, null, 2));
    
    if (!accountId) {
      return res.status(400).json({ error: 'Account ID is required' });
    }

    // Get current account to check what can be updated
    const currentAccount = await stripe.accounts.retrieve(accountId);
    console.log('Current account status:', {
      id: currentAccount.id,
      business_type: currentAccount.business_type,
      details_submitted: currentAccount.details_submitted,
      charges_enabled: currentAccount.charges_enabled
    });

    // For new accounts that haven't submitted details yet, we can update more fields
    if (!currentAccount.details_submitted) {
      
      // Only try to update if business type isn't already set
      const updateData = {};
      
      if (!currentAccount.business_type && businessInfo.businessType) {
        updateData.business_type = businessInfo.businessType;
      }

      console.log('Minimal update data:', JSON.stringify(updateData, null, 2));

      if (Object.keys(updateData).length > 0) {
        await stripe.accounts.update(accountId, updateData);
        console.log('Business type updated successfully');
      }

      // Store the business info in our database for later use
      await pool.query(`
        UPDATE connect_accounts 
        SET business_info = $1, updated_at = CURRENT_TIMESTAMP
        WHERE stripe_account_id = $2
      `, [JSON.stringify(businessInfo), accountId]);

      console.log('Business info stored in database');
    }
    
    res.json({ 
      success: true,
      account_id: accountId,
      message: 'Business information saved successfully'
    });

  } catch (error) {
    console.error('Update business info error:', {
      message: error.message,
      type: error.type,
      code: error.code,
      param: error.param,
      stack: error.stack
    });
    
    res.status(500).json({ 
      error: 'Failed to save business information',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Please contact support'
    });
  }
});

// Update Connect account with bank account information
app.post('/api/connect/update-bank-account', authenticateToken, async (req, res) => {
  try {
    const { accountId, bankInfo } = req.body;
    
    if (!accountId) {
      return res.status(400).json({ error: 'Account ID is required' });
    }

    // Create external account (bank account) for payouts
    const externalAccount = await stripe.accounts.createExternalAccount(accountId, {
      external_account: {
        object: 'bank_account',
        country: 'US',
        currency: 'usd',
        routing_number: bankInfo.routingNumber,
        account_number: bankInfo.accountNumber,
        account_holder_type: bankInfo.accountHolderType || 'individual'
      }
    });
    
    res.json({ 
      success: true,
      external_account_id: externalAccount.id,
      message: 'Bank account added successfully'
    });

  } catch (error) {
    console.error('Update bank account error:', error);
    res.status(500).json({ 
      error: 'Failed to add bank account',
      details: error.message
    });
  }
});

// Get Connect account status
app.get('/api/connect/account-status', authenticateToken, async (req, res) => {
  try {
    const accountResult = await pool.query(
      'SELECT * FROM connect_accounts WHERE user_id = $1',
      [req.user.userId]
    );

    if (accountResult.rows.length === 0) {
      return res.json({ status: 'not_created' });
    }

    const dbAccount = accountResult.rows[0];
    
    // Get latest status from Stripe
    const stripeAccount = await stripe.accounts.retrieve(dbAccount.stripe_account_id);

    // Update database with latest status
    await pool.query(`
      UPDATE connect_accounts 
      SET account_status = $1, details_submitted = $2, charges_enabled = $3, payouts_enabled = $4, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $5
    `, [
      stripeAccount.details_submitted ? 'active' : 'pending',
      stripeAccount.details_submitted,
      stripeAccount.charges_enabled,
      stripeAccount.payouts_enabled,
      req.user.userId
    ]);

    res.json({
      status: stripeAccount.details_submitted ? 'active' : 'pending',
      accountId: dbAccount.stripe_account_id,
      details_submitted: stripeAccount.details_submitted,
      charges_enabled: stripeAccount.charges_enabled,
      payouts_enabled: stripeAccount.payouts_enabled,
      requirements: stripeAccount.requirements
    });

  } catch (error) {
    console.error('Get account status error:', error);
    res.status(500).json({ error: 'Failed to get account status' });
  }
});

// INVOICE PAYMENT PROCESSING ROUTES

// Create payment link for invoice (requires Stripe Connect account)
app.post('/api/invoices/:id/create-payment-link', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Get invoice details
    const invoiceResult = await pool.query(`
      SELECT i.*, u.id as user_id 
      FROM invoices i 
      JOIN users u ON i.user_id = u.id 
      WHERE i.id = $1 AND i.user_id = $2
    `, [id, req.user.userId]);

    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoiceResult.rows[0];

    // Check if user has Stripe Connect account
    const connectResult = await pool.query(
      'SELECT stripe_account_id, account_status FROM connect_accounts WHERE user_id = $1',
      [req.user.userId]
    );

    if (connectResult.rows.length === 0 || connectResult.rows[0].account_status !== 'active') {
      return res.status(400).json({ 
        error: 'Stripe account required',
        message: 'Please complete your Stripe setup to accept payments'
      });
    }

    const stripeAccountId = connectResult.rows[0].stripe_account_id;

    // Create payment link through Stripe Connect
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Invoice #${invoice.invoice_number}`,
              description: `Payment for invoice from ${invoice.user_name || 'QuickBill Pro user'}`,
            },
            unit_amount: Math.round(invoice.total * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      metadata: {
        invoice_id: invoice.id,
        user_id: req.user.userId,
        platform: 'quickbill_pro'
      },
      after_completion: {
        type: 'redirect',
        redirect: {
          url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/invoice-paid?invoice=${invoice.id}`
        }
      }
    }, {
      stripeAccount: stripeAccountId
    });

    // Update invoice with payment link
    await pool.query(
      'UPDATE invoices SET payment_link = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [paymentLink.url, invoice.id]
    );

    res.json({
      payment_link: paymentLink.url,
      public_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/pay/${invoice.id}`,
      message: 'Payment link created successfully'
    });

  } catch (error) {
    console.error('Create payment link error:', error);
    res.status(500).json({ error: 'Failed to create payment link' });
  }
});

// Send invoice via email
app.post('/api/invoices/:id/send', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { message, send_copy } = req.body;

    // Get invoice with all details
    const invoiceResult = await pool.query(`
      SELECT 
        i.*,
        c.name as client_name,
        c.email as client_email,
        u.name as user_name,
        u.email as user_email,
        u.company as user_company
      FROM invoices i
      JOIN clients c ON i.client_id = c.id
      JOIN users u ON i.user_id = u.id
      WHERE i.id = $1 AND i.user_id = $2
    `, [id, req.user.userId]);

    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoiceResult.rows[0];

    // Get invoice items
    const itemsResult = await pool.query(
      'SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY id',
      [id]
    );

    const items = itemsResult.rows;

    // Create payment link if it doesn't exist
    let paymentLink = invoice.payment_link;
    if (!paymentLink) {
      // Auto-create payment link
      const connectResult = await pool.query(
        'SELECT stripe_account_id, account_status FROM connect_accounts WHERE user_id = $1',
        [req.user.userId]
      );

      if (connectResult.rows.length > 0 && connectResult.rows[0].account_status === 'active') {
        const stripeAccountId = connectResult.rows[0].stripe_account_id;

        const paymentLinkObj = await stripe.paymentLinks.create({
          line_items: [
            {
              price_data: {
                currency: 'usd',
                product_data: {
                  name: `Invoice #${invoice.invoice_number}`,
                  description: `Payment for invoice from ${invoice.user_name || invoice.user_company}`,
                },
                unit_amount: Math.round(invoice.total * 100),
              },
              quantity: 1,
            },
          ],
          metadata: {
            invoice_id: invoice.id,
            user_id: req.user.userId,
            platform: 'quickbill_pro'
          },
          after_completion: {
            type: 'redirect',
            redirect: {
              url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/invoice-paid?invoice=${invoice.id}`
            }
          }
        }, {
          stripeAccount: stripeAccountId
        });

        paymentLink = paymentLinkObj.url;

        // Update invoice with payment link
        await pool.query(
          'UPDATE invoices SET payment_link = $1 WHERE id = $2',
          [paymentLink, invoice.id]
        );
      }
    }

    // Generate invoice HTML
    const invoiceHTML = generateInvoiceHTML(invoice, items, paymentLink);

    // Send email to client
    const mailOptions = {
      from: process.env.FROM_EMAIL || 'noreply@quickbillpro.com',
      to: invoice.client_email,
      subject: `Invoice #${invoice.invoice_number} from ${invoice.user_company || invoice.user_name}`,
      html: invoiceHTML,
      replyTo: invoice.user_email
    };

    await transporter.sendMail(mailOptions);

    // Send copy to user if requested
    if (send_copy) {
      const copyMailOptions = {
        ...mailOptions,
        to: invoice.user_email,
        subject: `Copy: Invoice #${invoice.invoice_number} sent to ${invoice.client_name}`
      };
      await transporter.sendMail(copyMailOptions);
    }

    // Update invoice status to sent
    await pool.query(
      'UPDATE invoices SET status = $1, sent_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['sent', invoice.id]
    );

    res.json({ 
      message: 'Invoice sent successfully',
      sent_to: invoice.client_email,
      copy_sent: send_copy
    });

  } catch (error) {
    console.error('Send invoice error:', error);
    res.status(500).json({ error: 'Failed to send invoice' });
  }
});

// PUBLIC INVOICE PAYMENT ROUTES

// Get public invoice details (no auth required)
app.get('/api/public/invoice/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get invoice with client and user details
    const invoiceResult = await pool.query(`
      SELECT 
        i.*,
        c.name as client_name,
        c.email as client_email,
        u.name as user_name,
        u.company as user_company
      FROM invoices i
      JOIN clients c ON i.client_id = c.id
      JOIN users u ON i.user_id = u.id
      WHERE i.id = $1
    `, [id]);

    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoiceResult.rows[0];

    // Get invoice items
    const itemsResult = await pool.query(
      'SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY id',
      [id]
    );

    res.json({
      ...invoice,
      items: itemsResult.rows
    });

  } catch (error) {
    console.error('Get public invoice error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create payment intent for public invoice payment
app.post('/api/public/invoice/:id/pay', async (req, res) => {
  try {
    const { id } = req.params;
    const { email } = req.body;

    // Get invoice details
    const invoiceResult = await pool.query(`
      SELECT 
        i.*,
        u.name as user_name,
        u.email as user_email,
        u.id as user_id
      FROM invoices i
      JOIN users u ON i.user_id = u.id
      WHERE i.id = $1
    `, [id]);

    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoiceResult.rows[0];

    if (invoice.status === 'paid') {
      return res.status(400).json({ error: 'Invoice is already paid' });
    }

    // Check if user has Connect account
    const connectResult = await pool.query(
      'SELECT stripe_account_id FROM connect_accounts WHERE user_id = $1 AND account_status = $2',
      [invoice.user_id, 'active']
    );

    const amount = parseFloat(invoice.total);
    const platformFeeAmount = Math.round(amount * 100 * 0.03); // 3% platform fee
    const totalAmount = Math.round(amount * 100);

    let paymentIntentData = {
      amount: totalAmount,
      currency: 'usd',
      metadata: { 
        invoiceId: id,
        userId: invoice.user_id,
        userEmail: invoice.user_email,
        paymentType: 'public_invoice'
      },
      description: `Invoice ${invoice.invoice_number} from ${invoice.user_name}`,
      receipt_email: email
    };

    // If user has Connect account, use application fee
    if (connectResult.rows.length > 0) {
      paymentIntentData = {
        ...paymentIntentData,
        application_fee_amount: platformFeeAmount,
        transfer_data: {
          destination: connectResult.rows[0].stripe_account_id,
        }
      };
    }
    
    const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);

    res.json({
      clientSecret: paymentIntent.client_secret,
      amount: amount.toFixed(2),
      hasConnectAccount: connectResult.rows.length > 0
    });

  } catch (error) {
    console.error('Public invoice payment error:', error);
    res.status(500).json({ error: 'Failed to create payment' });
  }
});

// PAYOUT SYSTEM

// Process automatic payouts for all eligible users
app.post('/api/admin/process-payouts', async (req, res) => {
  try {
    console.log('Starting automatic payout processing...');

    // Get all users with active Connect accounts and pending balances
    const usersResult = await pool.query(`
      SELECT u.id, u.email, u.name, ca.stripe_account_id, ca.payouts_enabled
      FROM users u
      JOIN connect_accounts ca ON u.id = ca.user_id
      WHERE ca.account_status = 'active' AND ca.payouts_enabled = true
    `);

    const users = usersResult.rows;
    console.log(`Found ${users.length} users eligible for payouts`);

    let payoutsProcessed = 0;
    let totalAmount = 0;

    for (const user of users) {
      try {
        // Calculate user's pending balance from recent invoices
        const balanceResult = await pool.query(`
          SELECT SUM(total * 0.97) as pending_balance  -- 97% after 3% platform fee
          FROM invoices 
          WHERE user_id = $1 
            AND status = 'paid' 
            AND id NOT IN (
              SELECT DISTINCT invoice_id 
              FROM payouts 
              WHERE user_id = $1 AND status = 'completed'
            )
        `, [user.id]);

        const pendingBalance = parseFloat(balanceResult.rows[0].pending_balance || 0);
        
        // Only process payouts for amounts >= $10
        if (pendingBalance >= 10) {
          // Create transfer to user's Connect account
          const transfer = await stripe.transfers.create({
            amount: Math.round(pendingBalance * 100), // Convert to cents
            currency: 'usd',
            destination: user.stripe_account_id,
            description: `Weekly payout for ${user.name} (${user.email})`,
            metadata: {
              user_id: user.id,
              payout_type: 'automatic_weekly'
            }
          });

          // Record payout in database
          await pool.query(`
            INSERT INTO payouts (user_id, stripe_transfer_id, amount, status, arrival_date)
            VALUES ($1, $2, $3, $4, $5)
          `, [
            user.id, 
            transfer.id, 
            pendingBalance, 
            'completed',
            new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) // 2 days from now
          ]);

          payoutsProcessed++;
          totalAmount += pendingBalance;

          console.log(`Processed payout for ${user.email}: $${pendingBalance.toFixed(2)}`);
        } else {
          console.log(`Skipping payout for ${user.email}: balance too low ($${pendingBalance.toFixed(2)})`);
        }

      } catch (userError) {
        console.error(`Failed to process payout for user ${user.id}:`, userError);
      }
    }

    res.json({
      message: 'Payout processing completed',
      payoutsProcessed,
      totalAmount: totalAmount.toFixed(2)
    });

  } catch (error) {
    console.error('Payout processing error:', error);
    res.status(500).json({ error: 'Failed to process payouts' });
  }
});

// PLAID ROUTES FOR BANK ACCOUNT LINKING

// Check Plaid configuration status
app.get('/api/plaid/status', (req, res) => {
  const isConfigured = !!(plaidClient && process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
  
  res.json({
    configured: isConfigured,
    environment: process.env.PLAID_ENVIRONMENT || 'sandbox',
    message: isConfigured 
      ? 'Plaid is properly configured' 
      : 'Plaid credentials not found. Please set PLAID_CLIENT_ID and PLAID_SECRET environment variables.'
  });
});

// Create Plaid Link token
app.post('/api/plaid/create-link-token', authenticateToken, async (req, res) => {
  try {
    if (!plaidClient) {
      console.error('Plaid client not initialized');
      return res.status(500).json({ 
        error: 'Plaid integration not configured',
        message: 'Bank account linking is temporarily unavailable. Please contact support.'
      });
    }

    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.userId]);
    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const configs = {
      user: {
        client_user_id: user.id.toString(),
      },
      client_name: 'QuickBill Pro',
      products: ['auth'],
      country_codes: ['US'],
      language: 'en',
      webhook: `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/plaid/webhook`,
      account_filters: {
        depository: {
          account_type: ['checking', 'savings'],
        },
      },
    };

    console.log('Creating Plaid link token for user:', user.id);
    const response = await plaidClient.linkTokenCreate(configs);
    console.log('Plaid link token created successfully');
    
    res.json({ link_token: response.data.link_token });

  } catch (error) {
    console.error('Create link token error:', error);
    console.error('Error details:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to create link token',
      message: 'Unable to initialize bank account connection. Please try again later.'
    });
  }
});

// Exchange public token for access token and get account info
app.post('/api/plaid/exchange-public-token', authenticateToken, async (req, res) => {
  try {
    const { public_token, metadata } = req.body;

    // Exchange public token for access token
    const exchangeRequest = {
      public_token: public_token,
    };

    const exchangeResponse = await plaidClient.itemPublicTokenExchange(exchangeRequest);
    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;

    // Get account information
    const accountsRequest = {
      access_token: accessToken,
    };

    const accountsResponse = await plaidClient.accountsGet(accountsRequest);
    const accounts = accountsResponse.data.accounts;

    // Find the selected account (usually the first checking account)
    const selectedAccount = accounts.find(account => 
      account.subtype === 'checking' || account.subtype === 'savings'
    ) || accounts[0];

    if (!selectedAccount) {
      return res.status(400).json({ error: 'No suitable account found' });
    }

    // Get account and routing numbers
    const authRequest = {
      access_token: accessToken,
    };

    const authResponse = await plaidClient.authGet(authRequest);
    const authAccount = authResponse.data.accounts.find(acc => acc.account_id === selectedAccount.account_id);

    if (!authAccount || !authAccount.account_id) {
      return res.status(400).json({ error: 'Unable to retrieve account details' });
    }

    // Store bank account information in database
    await pool.query(`
      INSERT INTO bank_accounts (user_id, plaid_access_token, plaid_item_id, account_id, account_name, account_type, institution_name)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (user_id) DO UPDATE SET
        plaid_access_token = $2,
        plaid_item_id = $3,
        account_id = $4,
        account_name = $5,
        account_type = $6,
        institution_name = $7,
        updated_at = CURRENT_TIMESTAMP
    `, [
      req.user.userId,
      accessToken,
      itemId,
      selectedAccount.account_id,
      selectedAccount.name,
      selectedAccount.subtype,
      metadata.institution?.name || 'Unknown Bank'
    ]);

    res.json({
      success: true,
      account: {
        id: selectedAccount.account_id,
        name: selectedAccount.name,
        type: selectedAccount.subtype,
        institution: metadata.institution?.name || 'Unknown Bank',
        mask: selectedAccount.mask
      }
    });

  } catch (error) {
    console.error('Exchange public token error:', error);
    res.status(500).json({ error: 'Failed to link bank account' });
  }
});

// Get connected bank account info
app.get('/api/plaid/account-info', authenticateToken, async (req, res) => {
  try {
    const bankAccountResult = await pool.query(
      'SELECT * FROM bank_accounts WHERE user_id = $1',
      [req.user.userId]
    );

    if (bankAccountResult.rows.length === 0) {
      return res.json({ connected: false });
    }

    const bankAccount = bankAccountResult.rows[0];
    
    res.json({
      connected: true,
      account: {
        name: bankAccount.account_name,
        type: bankAccount.account_type,
        institution: bankAccount.institution_name,
        connected_at: bankAccount.created_at
      }
    });

  } catch (error) {
    console.error('Get account info error:', error);
    res.status(500).json({ error: 'Failed to get account info' });
  }
});

// Remove connected bank account
app.delete('/api/plaid/disconnect', authenticateToken, async (req, res) => {
  try {
    // Get bank account info first
    const bankAccountResult = await pool.query(
      'SELECT plaid_access_token FROM bank_accounts WHERE user_id = $1',
      [req.user.userId]
    );

    if (bankAccountResult.rows.length > 0) {
      // Remove the item from Plaid (optional but recommended)
      try {
        const removeRequest = {
          access_token: bankAccountResult.rows[0].plaid_access_token,
        };
        await plaidClient.itemRemove(removeRequest);
      } catch (plaidError) {
        console.warn('Failed to remove item from Plaid:', plaidError);
        // Continue with database removal even if Plaid removal fails
      }
    }

    // Remove from database
    await pool.query('DELETE FROM bank_accounts WHERE user_id = $1', [req.user.userId]);

    res.json({ success: true, message: 'Bank account disconnected successfully' });

  } catch (error) {
    console.error('Disconnect bank account error:', error);
    res.status(500).json({ error: 'Failed to disconnect bank account' });
  }
});

// Plaid webhook endpoint
app.post('/api/plaid/webhook', async (req, res) => {
  try {
    const { webhook_type, webhook_code, item_id } = req.body;

    console.log('Plaid webhook received:', { webhook_type, webhook_code, item_id });

    // Handle different webhook types
    switch (webhook_type) {
      case 'ITEM':
        if (webhook_code === 'ERROR') {
          // Handle item errors (e.g., expired credentials)
          console.log('Plaid item error for item:', item_id);
          // You might want to notify the user or update the database
        }
        break;
      
      case 'AUTH':
        if (webhook_code === 'AUTOMATICALLY_VERIFIED') {
          console.log('Account automatically verified for item:', item_id);
        }
        break;
      
      default:
        console.log('Unhandled webhook type:', webhook_type);
    }

    res.json({ received: true });

  } catch (error) {
    console.error('Plaid webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Get user's payout history and pending balance
app.get('/api/payouts', authenticateToken, async (req, res) => {
  try {
    // Get payout history
    const payoutsResult = await pool.query(`
      SELECT * FROM payouts 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT 20
    `, [req.user.userId]);

    // Calculate pending balance
    const balanceResult = await pool.query(`
      SELECT 
        COALESCE(SUM(total), 0) as total_invoiced,
        COALESCE(SUM(total * 0.97), 0) as total_earnings,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN total * 0.97 ELSE 0 END), 0) as total_paid_earnings
      FROM invoices 
      WHERE user_id = $1
    `, [req.user.userId]);

    const paidOutResult = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) as total_paid_out
      FROM payouts 
      WHERE user_id = $1 AND status = 'completed'
    `, [req.user.userId]);

    const stats = balanceResult.rows[0];
    const totalPaidOut = parseFloat(paidOutResult.rows[0].total_paid_out || 0);
    const pendingBalance = parseFloat(stats.total_paid_earnings) - totalPaidOut;

    res.json({
      payouts: payoutsResult.rows,
      balance: {
        pending: Math.max(0, pendingBalance).toFixed(2),
        totalEarnings: parseFloat(stats.total_paid_earnings).toFixed(2),
        totalPaidOut: totalPaidOut.toFixed(2),
        platformFees: (parseFloat(stats.total_invoiced) * 0.03).toFixed(2)
      }
    });

  } catch (error) {
    console.error('Get payouts error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// PAYMENT INTEGRATION PLACEHOLDERS

// Create Stripe payment intent for invoices (Connect-enabled)
app.post('/api/payments/stripe/intent', authenticateToken, async (req, res) => {
  try {
    const { invoiceId, amount } = req.body;

    // Get invoice and user details
    const invoiceResult = await pool.query(`
      SELECT i.*, u.name as user_name, u.email as user_email
      FROM invoices i
      JOIN users u ON i.user_id = u.id
      WHERE i.id = $1 AND i.user_id = $2
    `, [invoiceId, req.user.userId]);

    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoiceResult.rows[0];

    // Check if user has Connect account
    const connectResult = await pool.query(
      'SELECT stripe_account_id FROM connect_accounts WHERE user_id = $1 AND account_status = $2',
      [req.user.userId, 'active']
    );

    const platformFeeAmount = Math.round(amount * 100 * 0.03); // 3% platform fee
    const totalAmount = Math.round(amount * 100);

    let paymentIntentData = {
      amount: totalAmount,
      currency: 'usd',
      metadata: { 
        invoiceId,
        userId: req.user.userId,
        userEmail: invoice.user_email
      },
      description: `Payment for invoice ${invoice.invoice_number} from ${invoice.user_name}`,
      receipt_email: undefined // Will be set by client
    };

    // If user has Connect account, use application fee
    if (connectResult.rows.length > 0) {
      paymentIntentData = {
        ...paymentIntentData,
        application_fee_amount: platformFeeAmount,
        transfer_data: {
          destination: connectResult.rows[0].stripe_account_id,
        },
        metadata: {
          ...paymentIntentData.metadata,
          platform_fee: (platformFeeAmount / 100).toFixed(2),
          user_receives: ((totalAmount - platformFeeAmount) / 100).toFixed(2)
        }
      };
    }
    
    const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);

    res.json({
      clientSecret: paymentIntent.client_secret,
      platformFee: (platformFeeAmount / 100).toFixed(2),
      userReceives: ((totalAmount - platformFeeAmount) / 100).toFixed(2),
      hasConnectAccount: connectResult.rows.length > 0
    });

  } catch (error) {
    console.error('Stripe payment intent error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// PayPal payment placeholder
app.post('/api/payments/paypal/create', authenticateToken, async (req, res) => {
  try {
    const { invoiceId, amount } = req.body;
    
    // Placeholder for PayPal integration
    res.json({
      paypalOrderId: 'placeholder_paypal_order',
      message: 'PayPal integration placeholder - provide your PayPal API credentials to enable'
    });
  } catch (error) {
    console.error('PayPal payment creation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DASHBOARD ANALYTICS

// Get dashboard stats
app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_invoices,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_invoices,
        COUNT(CASE WHEN status = 'sent' OR status = 'overdue' THEN 1 END) as pending_invoices,
        COUNT(CASE WHEN status = 'overdue' THEN 1 END) as overdue_invoices,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN status = 'sent' OR status = 'overdue' THEN total ELSE 0 END), 0) as pending_amount
      FROM invoices 
      WHERE user_id = $1
    `, [req.user.userId]);

    res.json(statsResult.rows[0]);
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'QuickBill Pro API is running',
    timestamp: new Date().toISOString()
  });
});

// Temporary cleanup endpoint - remove after use
app.delete('/api/admin/cleanup-user/:email', async (req, res) => {
  try {
    const { email } = req.params;
    
    // Delete user and all related data
    const result = await pool.query('DELETE FROM users WHERE email = $1 RETURNING email', [email]);
    
    if (result.rows.length > 0) {
      res.json({ message: `User ${email} deleted successfully` });
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  } catch (error) {
    console.error('User deletion error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.listen(PORT, () => {
  console.log(`QuickBill Pro API server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});