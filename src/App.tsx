import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import { Zap, FileText, Users, Settings, CreditCard, PlusCircle, Download, Send, Eye, Mail, Lock, User, Building, X } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, EmbeddedCheckout as StripeEmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';
import { authAPI, subscriptionsAPI, invoicesAPI, clientsAPI } from './utils/api';
import './App.css';

// Initialize Stripe
const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY || '');

// Types
interface Invoice {
  id: string;
  invoiceNumber: string;
  clientName: string;
  clientEmail: string;
  clientAddress: string;
  date: string;
  dueDate: string;
  items: InvoiceItem[];
  notes?: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  total: number;
  createdAt: string;
}

interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

interface Client {
  id: string;
  name: string;
  email: string;
  address: string;
  phone?: string;
  company?: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  company: string;
  plan: 'free' | 'starter' | 'pro' | 'business';
  invoicesThisMonth: number;
  maxInvoices: number;
}

// Embedded Checkout Component
function EmbeddedCheckout({ 
  plan, 
  onClose, 
  onSuccess 
}: { 
  plan: string; 
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [clientSecret, setClientSecret] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const createCheckoutSession = async () => {
      try {
        setLoading(true);
        const response = await subscriptionsAPI.createEmbeddedCheckout(plan);
        setClientSecret(response.clientSecret);
      } catch (error) {
        console.error('Failed to create checkout session:', error);
        setError('Failed to load checkout. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    createCheckoutSession();
  }, [plan]);

  if (loading) {
    return (
      <div className="modal-overlay">
        <div className="modal embedded-checkout-modal">
          <div className="modal-header">
            <h2>Loading Checkout...</h2>
            <button className="close-btn" onClick={onClose}>&times;</button>
          </div>
          <div className="checkout-loading">
            <div className="loading-spinner"></div>
            <p>Preparing your subscription checkout...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="modal-overlay">
        <div className="modal embedded-checkout-modal">
          <div className="modal-header">
            <h2>Checkout Error</h2>
            <button className="close-btn" onClick={onClose}>&times;</button>
          </div>
          <div className="checkout-error">
            <p>{error}</p>
            <button className="retry-btn" onClick={() => window.location.reload()}>
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal embedded-checkout-modal">
        <div className="modal-header">
          <h2>Complete Your Subscription</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="embedded-checkout-container">
          {clientSecret && (
            <EmbeddedCheckoutProvider
              stripe={stripePromise}
              options={{
                clientSecret,
                onComplete: () => {
                  onSuccess();
                }
              }}
            >
              <StripeEmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          )}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [invoices, setInvoices] = useState<Invoice[]>([]);

  const [clients, setClients] = useState<Client[]>([]);

  const [activeTab, setActiveTab] = useState('dashboard');

  const loadUserData = async () => {
    try {
      // Load invoices and clients from API
      const [invoicesData, clientsData] = await Promise.all([
        invoicesAPI.getAll(),
        clientsAPI.getAll()
      ]);
      setInvoices(invoicesData);
      setClients(clientsData);
    } catch (error) {
      console.error('Error loading user data:', error);
      // Keep empty arrays if API fails
      setInvoices([]);
      setClients([]);
    }
  };

  // Check for existing auth token on app load
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('quickbill_token');
      const userData = localStorage.getItem('quickbill_user');
      
      if (token && userData) {
        try {
          const parsedUser = JSON.parse(userData);
          setUser(parsedUser);
          setIsAuthenticated(true);
          // Load user's data if already authenticated
          await loadUserData();
        } catch (error) {
          localStorage.removeItem('quickbill_token');
          localStorage.removeItem('quickbill_user');
        }
      }
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  const handleLogin = async (userData: User, token: string) => {
    localStorage.setItem('quickbill_token', token);
    localStorage.setItem('quickbill_user', JSON.stringify(userData));
    setUser(userData);
    setIsAuthenticated(true);
    
    // Load user's data after login
    await loadUserData();
  };

  const handleLogout = () => {
    localStorage.removeItem('quickbill_token');
    localStorage.removeItem('quickbill_user');
    setUser(null);
    setIsAuthenticated(false);
    setActiveTab('dashboard');
    // Clear user data
    setInvoices([]);
    setClients([]);
  };

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <Zap className="loading-icon" />
          <h2>QuickBill Pro</h2>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Router>
        <Routes>
          <Route path="/signup" element={<SignupPage onLogin={handleLogin} />} />
          <Route path="/check-email" element={<CheckEmailPage />} />
          <Route path="/verify-email" element={<EmailVerificationPage />} />
          <Route path="/success" element={<SuccessPage />} />
          <Route path="/subscription-return" element={<SubscriptionReturnPage />} />
          <Route path="/*" element={<LoginPage onLogin={handleLogin} />} />
        </Routes>
      </Router>
    );
  }

  return (
    <Router>
      <div className="app">
        <header className="header">
          <div className="header-content">
            <div className="logo">
              <Zap className="logo-icon" />
              <span className="logo-text">QuickBill Pro</span>
            </div>
            <div className="user-info">
              <span className={`plan-badge plan-${user?.plan}`}>{user?.plan.toUpperCase()}</span>
              <span className="user-name">{user?.name}</span>
              <button className="logout-btn" onClick={handleLogout}>
                Logout
              </button>
            </div>
          </div>
        </header>

        <div className="main-container">
          <nav className="sidebar">
            <div className="nav-items">
              <button 
                className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
                onClick={() => setActiveTab('dashboard')}
              >
                <FileText size={20} />
                <span>Dashboard</span>
              </button>
              <button 
                className={`nav-item ${activeTab === 'invoices' ? 'active' : ''}`}
                onClick={() => setActiveTab('invoices')}
              >
                <FileText size={20} />
                <span>Invoices</span>
              </button>
              <button 
                className={`nav-item ${activeTab === 'clients' ? 'active' : ''}`}
                onClick={() => setActiveTab('clients')}
              >
                <Users size={20} />
                <span>Clients</span>
              </button>
              <button 
                className={`nav-item ${activeTab === 'pricing' ? 'active' : ''}`}
                onClick={() => setActiveTab('pricing')}
              >
                <CreditCard size={20} />
                <span>Pricing</span>
              </button>
              <button 
                className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
                onClick={() => setActiveTab('settings')}
              >
                <Settings size={20} />
                <span>Settings</span>
              </button>
            </div>
          </nav>

          <main className="content">
            {activeTab === 'dashboard' && user && <Dashboard user={user} invoices={invoices} />}
            {activeTab === 'invoices' && user && <InvoicesTab invoices={invoices} setInvoices={setInvoices} user={user} setUser={setUser} clients={clients} />}
            {activeTab === 'clients' && <ClientsTab clients={clients} setClients={setClients} />}
            {activeTab === 'pricing' && user && <PricingTab user={user} />}
            {activeTab === 'settings' && user && <SettingsTab user={user} setUser={setUser} />}
          </main>
        </div>
      </div>
    </Router>
  );
}

// Dashboard Component
function Dashboard({ user, invoices }: { user: User; invoices: Invoice[] }) {
  const totalRevenue = invoices
    .filter(inv => inv.status === 'paid')
    .reduce((sum, inv) => sum + inv.total, 0);
  
  const pendingAmount = invoices
    .filter(inv => inv.status === 'sent' || inv.status === 'overdue')
    .reduce((sum, inv) => sum + inv.total, 0);

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Welcome back, {user.name}</h1>
        <p>Here's what's happening with your invoices</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">${totalRevenue.toLocaleString()}</div>
          <div className="stat-label">Total Revenue</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">${pendingAmount.toLocaleString()}</div>
          <div className="stat-label">Pending Payment</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{invoices.length}</div>
          <div className="stat-label">Total Invoices</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{user.invoicesThisMonth}/{user.maxInvoices === -1 ? '∞' : user.maxInvoices}</div>
          <div className="stat-label">This Month ({user.plan})</div>
        </div>
      </div>

      <div className="recent-invoices">
        <h2>Recent Invoices</h2>
        <div className="invoice-list">
          {invoices.slice(0, 5).map(invoice => (
            <div key={invoice.id} className="invoice-item">
              <div className="invoice-info">
                <span className="invoice-number">{invoice.invoiceNumber}</span>
                <span className="client-name">{invoice.clientName}</span>
              </div>
              <div className="invoice-amount">${invoice.total.toLocaleString()}</div>
              <div className={`status-badge status-${invoice.status}`}>
                {invoice.status}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Invoices Tab Component
function InvoicesTab({ 
  invoices, 
  setInvoices, 
  user, 
  setUser,
  clients 
}: { 
  invoices: Invoice[]; 
  setInvoices: React.Dispatch<React.SetStateAction<Invoice[]>>;
  user: User;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  clients: Client[];
}) {
  const [showCreateForm, setShowCreateForm] = useState(false);

  const canCreateInvoice = (user.plan === 'free' && user.invoicesThisMonth < user.maxInvoices) || user.plan !== 'free';

  return (
    <div className="invoices-tab">
      <div className="tab-header">
        <h1>Invoices</h1>
        <button 
          className="create-btn"
          onClick={() => setShowCreateForm(true)}
          disabled={!canCreateInvoice}
        >
          <PlusCircle size={20} />
          Create Invoice
        </button>
      </div>

      {!canCreateInvoice && (
        <div className="upgrade-notice">
          You've reached your monthly limit ({user.invoicesThisMonth}/{user.maxInvoices}). <span className="upgrade-link" onClick={() => window.location.hash = 'pricing'}>Upgrade your plan</span> to create more invoices.
        </div>
      )}

      <div className="invoice-grid">
        {invoices.map(invoice => (
          <div key={invoice.id} className="invoice-card">
            <div className="invoice-card-header">
              <span className="invoice-number">{invoice.invoiceNumber}</span>
              <div className={`status-badge status-${invoice.status}`}>
                {invoice.status}
              </div>
            </div>
            <div className="invoice-card-body">
              <div className="client-info">
                <strong>{invoice.clientName}</strong>
                <p>{invoice.clientEmail}</p>
              </div>
              <div className="amount">
                ${invoice.total.toLocaleString()}
              </div>
              <div className="dates">
                <span>Due: {new Date(invoice.dueDate).toLocaleDateString()}</span>
              </div>
            </div>
            <div className="invoice-card-actions">
              <button className="action-btn">
                <Eye size={16} />
                View
              </button>
              <button className="action-btn">
                <Download size={16} />
                PDF
              </button>
              <button className="action-btn">
                <Send size={16} />
                Send
              </button>
            </div>
          </div>
        ))}
      </div>

      {showCreateForm && (
        <CreateInvoiceModal 
          onClose={() => setShowCreateForm(false)} 
          clients={clients}
          onSave={async (invoiceData) => {
            try {
              const newInvoice = await invoicesAPI.create(invoiceData);
              setInvoices([...invoices, newInvoice]);
              setShowCreateForm(false);
              // Update user's invoice count
              if (user) {
                setUser({
                  ...user,
                  invoicesThisMonth: user.invoicesThisMonth + 1
                });
              }
            } catch (error) {
              console.error('Error creating invoice:', error);
              alert('Failed to create invoice. Please try again.');
            }
          }}
        />
      )}
    </div>
  );
}

// Create Invoice Modal
function CreateInvoiceModal({ 
  onClose, 
  clients, 
  onSave 
}: { 
  onClose: () => void; 
  clients: Client[];
  onSave: (invoiceData: any) => void;
}) {
  const [formData, setFormData] = useState({
    clientId: '',
    dueDate: '',
    notes: ''
  });

  const [items, setItems] = useState<InvoiceItem[]>([
    { id: '1', description: '', quantity: 1, rate: 0, amount: 0 }
  ]);

  const addItem = () => {
    setItems([...items, {
      id: Date.now().toString(),
      description: '',
      quantity: 1,
      rate: 0,
      amount: 0
    }]);
  };

  const updateItem = (id: string, field: keyof InvoiceItem, value: any) => {
    setItems(items.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        if (field === 'quantity' || field === 'rate') {
          updated.amount = updated.quantity * updated.rate;
        }
        return updated;
      }
      return item;
    }));
  };

  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const selectedClient = clients.find(c => c.id === formData.clientId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient) return;

    const invoiceData = {
      clientId: formData.clientId,
      date: new Date().toISOString().split('T')[0],
      dueDate: formData.dueDate,
      items: items.filter(item => item.description.trim()).map(item => ({
        description: item.description,
        quantity: item.quantity,
        rate: item.rate
      })),
      notes: formData.notes,
      taxRate: 0
    };

    onSave(invoiceData);
  };

  return (
    <div className="modal-overlay">
      <div className="modal create-invoice-modal">
        <div className="modal-header">
          <h2>Create New Invoice</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-group">
              <label>Client</label>
              <select
                value={formData.clientId}
                onChange={(e) => setFormData({...formData, clientId: e.target.value})}
                required
              >
                <option value="">Select a client</option>
                {clients.map(client => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Due Date</label>
              <input
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({...formData, dueDate: e.target.value})}
                required
              />
            </div>
          </div>

          <div className="items-section">
            <h3>Invoice Items</h3>
            <div className="items-header">
              <span className="header-description">Description</span>
              <span className="header-qty">Qty</span>
              <span className="header-rate">Rate</span>
              <span className="header-amount">Amount</span>
            </div>
            {items.map(item => (
              <div key={item.id} className="item-row">
                <div className="item-field" data-label="Description">
                  <input
                    type="text"
                    placeholder="Description of service or product"
                    value={item.description}
                    onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                    className="description-input"
                  />
                </div>
                <div className="item-field qty-field" data-label="Quantity">
                  <input
                    type="number"
                    placeholder="1"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => updateItem(item.id, 'quantity', Number(e.target.value))}
                    className="qty-input"
                  />
                </div>
                <div className="item-field rate-field" data-label="Rate">
                  <div className="currency-input">
                    <span className="currency-symbol">$</span>
                    <input
                      type="text"
                      placeholder="0.00"
                      value={item.rate > 0 ? item.rate.toString() : ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        // Allow empty string, numbers, and one decimal point
                        if (value === '' || /^\d*\.?\d*$/.test(value)) {
                          const numValue = value === '' ? 0 : parseFloat(value);
                          updateItem(item.id, 'rate', isNaN(numValue) ? 0 : numValue);
                        }
                      }}
                      onBlur={(e) => {
                        // Format to 2 decimal places when user leaves the field
                        const value = parseFloat(e.target.value);
                        if (!isNaN(value) && value > 0) {
                          updateItem(item.id, 'rate', parseFloat(value.toFixed(2)));
                        }
                      }}
                      className="rate-input"
                    />
                  </div>
                </div>
                <div className="item-field amount-field" data-label="Amount">
                  <span className="amount">${item.amount.toFixed(2)}</span>
                </div>
              </div>
            ))}
            <button type="button" onClick={addItem} className="add-item-btn">
              Add Item
            </button>
          </div>

          <div className="form-group">
            <label>Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
              placeholder="Additional notes or terms..."
            />
          </div>

          <div className="total-section">
            <strong>Total: ${total.toFixed(2)}</strong>
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="cancel-btn">
              Cancel
            </button>
            <button type="submit" className="save-btn">
              Create Invoice
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Clients Tab
function ClientsTab({ 
  clients, 
  setClients 
}: { 
  clients: Client[]; 
  setClients: React.Dispatch<React.SetStateAction<Client[]>>;
}) {
  const [showCreateForm, setShowCreateForm] = useState(false);

  return (
    <div className="clients-tab">
      <div className="tab-header">
        <h1>Clients</h1>
        <button className="create-btn" onClick={() => setShowCreateForm(true)}>
          <PlusCircle size={20} />
          Add Client
        </button>
      </div>

      <div className="clients-grid">
        {clients.map(client => (
          <div key={client.id} className="client-card">
            <h3>{client.name}</h3>
            <p>{client.email}</p>
            {client.company && <p className="company">{client.company}</p>}
            <p className="address">{client.address}</p>
            {client.phone && <p className="phone">{client.phone}</p>}
          </div>
        ))}
      </div>

      {showCreateForm && (
        <CreateClientModal 
          onClose={() => setShowCreateForm(false)}
          onSave={async (clientData) => {
            try {
              const newClient = await clientsAPI.create(clientData);
              setClients([...clients, newClient]);
              setShowCreateForm(false);
            } catch (error) {
              console.error('Error creating client:', error);
              alert('Failed to create client. Please try again.');
            }
          }}
        />
      )}
    </div>
  );
}

// Create Client Modal
function CreateClientModal({ 
  onClose, 
  onSave 
}: { 
  onClose: () => void; 
  onSave: (clientData: any) => void;
}) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    address: '',
    phone: '',
    company: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h2>Add New Client</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              required
            />
          </div>

          <div className="form-group">
            <label>Email *</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              required
            />
          </div>

          <div className="form-group">
            <label>Company</label>
            <input
              type="text"
              value={formData.company}
              onChange={(e) => setFormData({...formData, company: e.target.value})}
            />
          </div>

          <div className="form-group">
            <label>Phone</label>
            <input
              type="text"
              value={formData.phone}
              onChange={(e) => setFormData({...formData, phone: e.target.value})}
            />
          </div>

          <div className="form-group">
            <label>Address *</label>
            <textarea
              value={formData.address}
              onChange={(e) => setFormData({...formData, address: e.target.value})}
              required
            />
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="cancel-btn">
              Cancel
            </button>
            <button type="submit" className="save-btn">
              Add Client
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Pricing Tab
function PricingTab({ user }: { user: User }) {
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [showEmbeddedCheckout, setShowEmbeddedCheckout] = useState<string | null>(null);

  const plans = [
    {
      name: 'Free',
      price: 0,
      invoices: 3,
      features: ['3 invoices per month', 'Basic templates', 'PDF export']
    },
    {
      name: 'Starter',
      price: 9,
      invoices: 50,
      features: ['50 invoices per month', 'Payment tracking', 'Email sending', 'Client management']
    },
    {
      name: 'Pro',
      price: 19,
      invoices: 'unlimited',
      features: ['Unlimited invoices', 'Recurring billing', 'Advanced reports', 'Custom branding']
    },
    {
      name: 'Business',
      price: 39,
      invoices: 'unlimited',
      features: ['Everything in Pro', 'Multi-user access', 'API access', 'Priority support']
    }
  ];

  const handleUpgrade = async (planName: string) => {
    if (planName === 'Free' || user.plan === planName.toLowerCase()) return;
    
    // Show embedded checkout instead of redirecting
    setShowEmbeddedCheckout(planName.toLowerCase());
  };

  const handleCheckoutSuccess = () => {
    setShowEmbeddedCheckout(null);
    // Refresh user data to show updated plan
    window.location.reload();
  };

  return (
    <div className="pricing-tab">
      <div className="pricing-header">
        <h1>Choose Your Plan</h1>
        <p>Select the perfect plan for your business needs</p>
      </div>

      <div className="pricing-grid">
        {plans.map(plan => (
          <div key={plan.name} className={`pricing-card ${user.plan === plan.name.toLowerCase() ? 'current' : ''}`}>
            <h3>{plan.name}</h3>
            <div className="price">
              <span className="currency">$</span>
              <span className="amount">{plan.price}</span>
              <span className="period">/month</span>
            </div>
            <div className="invoice-limit">
              {typeof plan.invoices === 'number' ? `${plan.invoices} invoices` : 'Unlimited invoices'}
            </div>
            <ul className="features">
              {plan.features.map(feature => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <button 
              className={`plan-btn ${user.plan === plan.name.toLowerCase() ? 'current' : ''}`}
              onClick={() => handleUpgrade(plan.name)}
              disabled={isLoading === plan.name || user.plan === plan.name.toLowerCase() || plan.name === 'Free'}
            >
              {isLoading === plan.name ? 'Processing...' : 
               user.plan === plan.name.toLowerCase() ? 'Current Plan' : 
               plan.name === 'Free' ? 'Free Plan' : 'Upgrade'}
            </button>
          </div>
        ))}
      </div>

      {showEmbeddedCheckout && (
        <EmbeddedCheckout
          plan={showEmbeddedCheckout}
          onClose={() => setShowEmbeddedCheckout(null)}
          onSuccess={handleCheckoutSuccess}
        />
      )}
    </div>
  );
}

// Settings Tab
function SettingsTab({ 
  user, 
  setUser 
}: { 
  user: User; 
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
}) {
  const [formData, setFormData] = useState({
    name: user.name,
    email: user.email,
    company: user.company
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (user) {
      setUser({...user, ...formData});
    }
  };

  return (
    <div className="settings-tab">
      <h1>Settings</h1>

      <div className="settings-section">
        <h2>Profile Information</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Full Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
            />
          </div>

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
            />
          </div>

          <div className="form-group">
            <label>Company</label>
            <input
              type="text"
              value={formData.company}
              onChange={(e) => setFormData({...formData, company: e.target.value})}
            />
          </div>

          <button type="submit" className="save-btn">
            Save Changes
          </button>
        </form>
      </div>

      <div className="settings-section">
        <h2>Payment Integration</h2>
        <div className="integration-status">
          <div className="integration-item">
            <span>Stripe</span>
            <span className="status disconnected">Not Connected</span>
            <button className="connect-btn">Connect</button>
          </div>
          <div className="integration-item">
            <span>PayPal</span>
            <span className="status disconnected">Not Connected</span>
            <button className="connect-btn">Connect</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Login Page Component
function LoginPage({ onLogin }: { onLogin: (userData: User, token: string) => void }) {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await authAPI.login(formData.email, formData.password);
      onLogin(response.user, response.token);
    } catch (error: any) {
      setError(error.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <div className="auth-logo">
            <Zap className="auth-logo-icon" />
            <span className="auth-logo-text">QuickBill Pro</span>
          </div>
          <h1>Welcome back</h1>
          <p>Sign in to your account to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && (
            <div className="auth-error">
              {error}
            </div>
          )}

          <div className="form-field">
            <label>Email Address</label>
            <div className="input-wrapper">
              <Mail className="input-icon" size={18} />
              <input
                type="email"
                placeholder="Enter your email"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                required
              />
            </div>
          </div>

          <div className="form-field">
            <label>Password</label>
            <div className="input-wrapper">
              <Lock className="input-icon" size={18} />
              <input
                type="password"
                placeholder="Enter your password"
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
                required
              />
            </div>
          </div>

          <button type="submit" className="auth-submit-btn" disabled={isLoading}>
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Don't have an account?{' '}
            <Link to="/signup" className="auth-link">
              Sign up for free
            </Link>
          </p>
        </div>
      </div>

      <div className="auth-features">
        <div className="feature-card">
          <FileText className="feature-icon" />
          <h3>Professional Invoices</h3>
          <p>Create beautiful, professional invoices in minutes</p>
        </div>
        <div className="feature-card">
          <Users className="feature-icon" />
          <h3>Client Management</h3>
          <p>Keep track of all your clients and their information</p>
        </div>
        <div className="feature-card">
          <CreditCard className="feature-icon" />
          <h3>Payment Tracking</h3>
          <p>Monitor payments and never lose track of what's owed</p>
        </div>
      </div>
    </div>
  );
}

// Password Strength Component
function PasswordStrength({ password }: { password: string }) {
  const checkStrength = (pwd: string) => {
    const requirements = {
      length: pwd.length >= 8,
      uppercase: /[A-Z]/.test(pwd),
      lowercase: /[a-z]/.test(pwd),
      number: /\d/.test(pwd),
      special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd)
    };

    const score = Object.values(requirements).filter(Boolean).length;
    const strength = score <= 2 ? 'weak' : score <= 4 ? 'medium' : 'strong';
    
    return { requirements, score, strength };
  };

  const { requirements, score, strength } = checkStrength(password);

  if (!password) return null;

  return (
    <div className="password-strength">
      <div className="strength-bar">
        <div className={`strength-fill strength-${strength}`} style={{ width: `${(score / 5) * 100}%` }}></div>
      </div>
      <div className="strength-text">
        Password strength: <span className={`strength-${strength}`}>{strength}</span>
      </div>
      <div className="requirements">
        <div className={requirements.length ? 'req-met' : 'req-unmet'}>
          {requirements.length ? '✓' : '○'} At least 8 characters
        </div>
        <div className={requirements.uppercase ? 'req-met' : 'req-unmet'}>
          {requirements.uppercase ? '✓' : '○'} One uppercase letter
        </div>
        <div className={requirements.lowercase ? 'req-met' : 'req-unmet'}>
          {requirements.lowercase ? '✓' : '○'} One lowercase letter
        </div>
        <div className={requirements.number ? 'req-met' : 'req-unmet'}>
          {requirements.number ? '✓' : '○'} One number
        </div>
        <div className={requirements.special ? 'req-met' : 'req-unmet'}>
          {requirements.special ? '✓' : '○'} One special character
        </div>
      </div>
    </div>
  );
}

// Signup Page Component
function SignupPage({ onLogin }: { onLogin: (userData: User, token: string) => void }) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    company: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const validatePassword = (password: string) => {
    const requirements = {
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /\d/.test(password),
      special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
    };
    return Object.values(requirements).every(Boolean);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    if (!validatePassword(formData.password)) {
      setError('Password must be at least 8 characters long and include uppercase, lowercase, number, and special character');
      setIsLoading(false);
      return;
    }

    try {
      const response = await authAPI.register(
        formData.name, 
        formData.email, 
        formData.password, 
        formData.company || undefined
      );
      // Redirect to check email page with email parameter
      window.location.href = `/check-email?email=${encodeURIComponent(formData.email)}`;
    } catch (error: any) {
      setError(error.response?.data?.error || 'Signup failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <div className="auth-logo">
            <Zap className="auth-logo-icon" />
            <span className="auth-logo-text">QuickBill Pro</span>
          </div>
          <h1>Create your account</h1>
          <p>Start invoicing like a pro today</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && (
            <div className="auth-error">
              {error}
            </div>
          )}
          {success && (
            <div className="auth-success">
              {success}
            </div>
          )}

          <div className="form-field">
            <label>Full Name</label>
            <div className="input-wrapper">
              <User className="input-icon" size={18} />
              <input
                type="text"
                placeholder="Enter your full name"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                required
              />
            </div>
          </div>

          <div className="form-field">
            <label>Email Address</label>
            <div className="input-wrapper">
              <Mail className="input-icon" size={18} />
              <input
                type="email"
                placeholder="Enter your email"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                required
              />
            </div>
          </div>

          <div className="form-field">
            <label>Company Name (Optional)</label>
            <div className="input-wrapper">
              <Building className="input-icon" size={18} />
              <input
                type="text"
                placeholder="Enter your company name"
                value={formData.company}
                onChange={(e) => setFormData({...formData, company: e.target.value})}
              />
            </div>
          </div>

          <div className="form-field">
            <label>Password</label>
            <div className="input-wrapper">
              <Lock className="input-icon" size={18} />
              <input
                type="password"
                placeholder="Create a password"
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
                required
              />
            </div>
            <PasswordStrength password={formData.password} />
          </div>

          <div className="form-field">
            <label>Confirm Password</label>
            <div className="input-wrapper">
              <Lock className="input-icon" size={18} />
              <input
                type="password"
                placeholder="Confirm your password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                required
              />
            </div>
          </div>

          <button type="submit" className="auth-submit-btn" disabled={isLoading}>
            {isLoading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Already have an account?{' '}
            <Link to="/" className="auth-link">
              Sign in here
            </Link>
          </p>
        </div>
      </div>

      <div className="auth-benefits">
        <div className="benefit-item">
          <span className="benefit-check">✓</span>
          <span>Free plan with 3 invoices per month</span>
        </div>
        <div className="benefit-item">
          <span className="benefit-check">✓</span>
          <span>Professional PDF invoice generation</span>
        </div>
        <div className="benefit-item">
          <span className="benefit-check">✓</span>
          <span>Client management system</span>
        </div>
        <div className="benefit-item">
          <span className="benefit-check">✓</span>
          <span>Payment tracking and reminders</span>
        </div>
        <div className="benefit-item">
          <span className="benefit-check">✓</span>
          <span>Upgrade anytime for unlimited invoices</span>
        </div>
      </div>
    </div>
  );
}

// Success Page Component
function SuccessPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionIdParam = urlParams.get('session_id');
    
    if (sessionIdParam) {
      setSessionId(sessionIdParam);
      setStatus('success');
      
      // Clear the URL parameters for a cleaner look
      window.history.replaceState({}, document.title, '/success');
    } else {
      setStatus('error');
    }
  }, []);

  if (status === 'loading') {
    return (
      <div className="success-page">
        <div className="success-content">
          <div className="loading-spinner"></div>
          <h2>Processing your subscription...</h2>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="success-page">
        <div className="success-content">
          <div className="error-icon">❌</div>
          <h2>Something went wrong</h2>
          <p>We couldn't find your subscription details. Please contact support if you believe this is an error.</p>
          <button 
            className="back-btn" 
            onClick={() => window.location.href = '/'}
          >
            Back to QuickBill Pro
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="success-page">
      <div className="success-content">
        <div className="success-icon">✅</div>
        <h1>Welcome to QuickBill Pro!</h1>
        <h2>Your subscription is now active</h2>
        <p>Thank you for upgrading! You now have access to all premium features.</p>
        
        <div className="success-features">
          <div className="feature-item">
            <span className="feature-icon">📄</span>
            <span>Unlimited invoice creation</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">👥</span>
            <span>Advanced client management</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">📊</span>
            <span>Detailed analytics and reporting</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">⚡</span>
            <span>Priority customer support</span>
          </div>
        </div>

        <div className="success-actions">
          <button 
            className="primary-btn" 
            onClick={() => window.location.href = '/'}
          >
            Start Creating Invoices
          </button>
          <button 
            className="secondary-btn" 
            onClick={() => window.location.href = '/'}
          >
            Go to Dashboard
          </button>
        </div>

        <div className="success-info">
          <p>
            <strong>Session ID:</strong> {sessionId}<br/>
            <strong>Next billing:</strong> 30 days from today<br/>
            <strong>Questions?</strong> Contact our support team anytime.
          </p>
        </div>
      </div>
    </div>
  );
}

// Subscription Return Page Component
function SubscriptionReturnPage() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    const checkSessionStatus = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const sessionIdParam = urlParams.get('session_id');
      
      if (sessionIdParam) {
        setSessionId(sessionIdParam);
        
        try {
          // Check with backend to verify session status
          const response = await subscriptionsAPI.getSessionStatus(sessionIdParam);
          
          if (response.status === 'complete') {
            setStatus('success');
            // Redirect to main app after a short delay
            setTimeout(() => {
              window.location.href = '/';
            }, 3000);
          } else {
            setStatus('error');
          }
        } catch (error) {
          console.error('Error checking session status:', error);
          setStatus('error');
        }
      } else {
        setStatus('error');
      }
    };

    checkSessionStatus();
  }, []);

  if (status === 'loading') {
    return (
      <div className="success-page">
        <div className="success-content">
          <div className="loading-spinner"></div>
          <h2>Processing your subscription...</h2>
          <p>Please wait while we confirm your payment.</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="success-page">
        <div className="success-content">
          <div className="error-icon">❌</div>
          <h2>Payment Processing Error</h2>
          <p>There was an issue processing your subscription. Please contact support if you believe this is an error.</p>
          <button 
            className="back-btn" 
            onClick={() => window.location.href = '/'}
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="success-page">
      <div className="success-content">
        <div className="success-icon">✅</div>
        <h1>Welcome to QuickBill Pro!</h1>
        <h2>Your subscription is now active</h2>
        <p>Thank you for upgrading! You now have access to all premium features.</p>
        
        <div className="success-features">
          <div className="feature-item">
            <span className="feature-icon">📄</span>
            <span>Unlimited invoice creation</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">👥</span>
            <span>Advanced client management</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">📊</span>
            <span>Detailed analytics and reporting</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">⚡</span>
            <span>Priority customer support</span>
          </div>
        </div>

        <div className="success-actions">
          <button 
            className="primary-btn" 
            onClick={() => window.location.href = '/'}
          >
            Go to Dashboard
          </button>
        </div>

        <div className="success-info">
          <p>
            <strong>Session ID:</strong> {sessionId}<br/>
            <strong>Next billing:</strong> 30 days from today<br/>
            Redirecting to dashboard in a few seconds...
          </p>
        </div>
      </div>
    </div>
  );
}

// Check Email Page Component
function CheckEmailPage() {
  const [email, setEmail] = useState('');
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const emailParam = urlParams.get('email');
    if (emailParam) {
      setEmail(emailParam);
    }
  }, []);

  const handleResendEmail = async () => {
    setResendStatus('sending');
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/auth/resend-verification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });
      
      if (response.ok) {
        setResendStatus('sent');
      } else {
        setResendStatus('error');
      }
    } catch (error) {
      console.error('Failed to resend verification email:', error);
      setResendStatus('error');
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <div className="auth-logo">
            <Zap className="auth-logo-icon" />
            <span className="auth-logo-text">QuickBill Pro</span>
          </div>
          <h1>Check Your Email</h1>
          <p>We've sent a verification link to your email address</p>
        </div>

        <div className="check-email-content">
          <div className="email-icon">📧</div>
          
          <div className="email-info">
            <h2>Verification Email Sent</h2>
            <p>We've sent a verification link to:</p>
            <div className="email-address">{email}</div>
          </div>

          <div className="email-instructions">
            <h3>What to do next:</h3>
            <ol>
              <li>Check your email inbox (and spam folder)</li>
              <li>Click the verification link in the email</li>
              <li>Return here to log in</li>
            </ol>
          </div>

          <div className="email-actions">
            <Link to="/" className="primary-btn">
              Go to Login
            </Link>
            
            <button 
              onClick={handleResendEmail}
              className="secondary-btn"
              disabled={resendStatus === 'sending'}
            >
              {resendStatus === 'sending' ? 'Sending...' : 
               resendStatus === 'sent' ? 'Email Sent!' : 
               'Resend Verification Email'}
            </button>
          </div>

          {resendStatus === 'sent' && (
            <div className="resend-success">
              ✅ Verification email sent again! Check your inbox.
            </div>
          )}

          {resendStatus === 'error' && (
            <div className="resend-error">
              ❌ Failed to resend email. Please try again later.
            </div>
          )}

          <div className="help-text">
            <p>
              Didn't receive the email? Check your spam folder or{' '}
              <Link to="/signup" className="auth-link">
                try signing up again
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Email Verification Page Component
function EmailVerificationPage() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const verifyEmail = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get('token');
      
      if (!token) {
        setStatus('error');
        setMessage('Invalid verification link. Please check your email for the correct link.');
        return;
      }

      try {
        const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/auth/verify-email?token=${token}`);
        const data = await response.json();
        
        if (response.ok) {
          setStatus('success');
          setMessage(data.message);
          // Redirect to login after 3 seconds
          setTimeout(() => {
            window.location.href = '/';
          }, 3000);
        } else {
          setStatus('error');
          setMessage(data.error || 'Verification failed. Please try again.');
        }
      } catch (error) {
        console.error('Email verification error:', error);
        setStatus('error');
        setMessage('Failed to verify email. Please try again later.');
      }
    };

    verifyEmail();
  }, []);

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <div className="auth-logo">
            <Zap className="auth-logo-icon" />
            <span className="auth-logo-text">QuickBill Pro</span>
          </div>
          <h1>Email Verification</h1>
        </div>

        <div className="verification-content">
          {status === 'loading' && (
            <>
              <div className="loading-spinner"></div>
              <p>Verifying your email address...</p>
            </>
          )}
          
          {status === 'success' && (
            <>
              <div className="success-icon">✅</div>
              <h2>Email Verified Successfully!</h2>
              <p>{message}</p>
              <p>You will be redirected to the login page in a few seconds...</p>
              <Link to="/" className="auth-link">
                Go to Login Now
              </Link>
            </>
          )}
          
          {status === 'error' && (
            <>
              <div className="error-icon">❌</div>
              <h2>Verification Failed</h2>
              <p>{message}</p>
              <Link to="/signup" className="auth-link">
                Back to Sign Up
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;