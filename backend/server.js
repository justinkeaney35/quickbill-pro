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

const app = express();
const PORT = process.env.PORT || 3001;

// Database connection (PostgreSQL)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/quickbill_db'
});

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
    // Create a dummy transporter that logs
    transporter = {
      sendMail: async (mailOptions) => {
        console.log('Email would be sent:', {
          to: mailOptions.to,
          subject: mailOptions.subject,
          html: mailOptions.html?.substring(0, 200) + '...'
        });
        return { messageId: 'dummy-' + Date.now() };
      }
    };
  }
};

// Initialize email on startup
setupEmailTransporter();

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

    if (!token) {
      return res.status(400).json({ error: 'Verification token is required' });
    }

    // Find user with verification token
    const result = await pool.query(
      'SELECT id, email, email_verified FROM users WHERE verification_token = $1',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    const user = result.rows[0];

    if (user.email_verified) {
      return res.status(400).json({ error: 'Email is already verified' });
    }

    // Verify the email
    await pool.query(
      'UPDATE users SET email_verified = true, verification_token = NULL WHERE id = $1',
      [user.id]
    );

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

    const { clientId, date, dueDate, items, notes, taxRate = 0 } = req.body;

    // Check if user can create more invoices
    const userResult = await client.query(
      'SELECT plan, invoices_this_month, max_invoices FROM users WHERE id = $1',
      [req.user.userId]
    );
    
    const user = userResult.rows[0];
    if (user.plan === 'free' && user.invoices_this_month >= user.max_invoices) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Monthly invoice limit reached. Please upgrade your plan.' });
    }

    // Generate invoice number
    const invoiceCountResult = await client.query(
      'SELECT COUNT(*) FROM invoices WHERE user_id = $1',
      [req.user.userId]
    );
    const invoiceNumber = `INV-${String(parseInt(invoiceCountResult.rows[0].count) + 1).padStart(3, '0')}`;

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.rate), 0);
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;

    // Create invoice
    const invoiceResult = await client.query(`
      INSERT INTO invoices (user_id, client_id, invoice_number, date, due_date, status, subtotal, tax_rate, tax_amount, total, notes)
      VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7, $8, $9, $10)
      RETURNING *
    `, [req.user.userId, clientId, invoiceNumber, date, dueDate, subtotal, taxRate, taxAmount, total, notes]);

    const invoice = invoiceResult.rows[0];

    // Create invoice items
    const invoiceItems = [];
    for (const item of items) {
      if (item.description.trim()) {
        const itemResult = await client.query(
          'INSERT INTO invoice_items (invoice_id, description, quantity, rate, amount) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          [invoice.id, item.description, item.quantity, item.rate, item.quantity * item.rate]
        );
        invoiceItems.push(itemResult.rows[0]);
      }
    }

    // Update user's invoice count
    await client.query(
      'UPDATE users SET invoices_this_month = invoices_this_month + 1 WHERE id = $1',
      [req.user.userId]
    );

    await client.query('COMMIT');

    // Get client info for response
    const clientResult = await pool.query('SELECT * FROM clients WHERE id = $1', [clientId]);
    const clientInfo = clientResult.rows[0];

    res.status(201).json({
      ...invoice,
      items: invoiceItems,
      client_name: clientInfo.name,
      client_email: clientInfo.email,
      client_address: clientInfo.address
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create invoice error:', error);
    res.status(500).json({ error: 'Server error' });
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

// Send invoice via email
app.post('/api/invoices/:id/send', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Get invoice details
    const invoiceResult = await pool.query(`
      SELECT i.*, c.name as client_name, c.email as client_email, u.name as user_name, u.company as user_company
      FROM invoices i
      JOIN clients c ON i.client_id = c.id
      JOIN users u ON i.user_id = u.id
      WHERE i.id = $1 AND i.user_id = $2
    `, [id, req.user.userId]);

    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoiceResult.rows[0];

    // Email configuration (placeholder)
    const mailOptions = {
      from: process.env.FROM_EMAIL || 'noreply@quickbillpro.com',
      to: invoice.client_email,
      subject: `Invoice ${invoice.invoice_number} from ${invoice.user_company || invoice.user_name}`,
      html: `
        <h2>Invoice ${invoice.invoice_number}</h2>
        <p>Dear ${invoice.client_name},</p>
        <p>Please find your invoice attached.</p>
        <p><strong>Amount Due: $${parseFloat(invoice.total).toFixed(2)}</strong></p>
        <p>Due Date: ${new Date(invoice.due_date).toLocaleDateString()}</p>
        <p>Thank you for your business!</p>
        <p>Best regards,<br>${invoice.user_name}<br>${invoice.user_company || ''}</p>
      `
    };

    // Send email (placeholder - will work when SMTP is configured)
    try {
      await transporter.sendMail(mailOptions);
      
      // Update invoice status to sent
      await pool.query(
        'UPDATE invoices SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['sent', id]
      );

      res.json({ message: 'Invoice sent successfully' });
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      res.status(500).json({ error: 'Failed to send email. Please configure SMTP settings.' });
    }

  } catch (error) {
    console.error('Send invoice error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

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

// PAYMENT INTEGRATION PLACEHOLDERS

// Create Stripe payment intent for invoices
app.post('/api/payments/stripe/intent', authenticateToken, async (req, res) => {
  try {
    const { invoiceId, amount } = req.body;
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: 'usd',
      metadata: { invoiceId }
    });

    res.json({
      clientSecret: paymentIntent.client_secret
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