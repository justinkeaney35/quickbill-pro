import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import { Zap, FileText, Users, Settings, CreditCard, PlusCircle, Download, Send, Eye, Mail, Lock, User, Building, X, DollarSign, ExternalLink, Copy, CheckCircle, TrendingUp } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, EmbeddedCheckout as StripeEmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';
import { usePlaidLink } from 'react-plaid-link';
import { authAPI, subscriptionsAPI, invoicesAPI, clientsAPI, connectAPI, payoutsAPI, plaidAPI } from './utils/api';
import ModernStripeOnboarding from './components/ModernStripeOnboarding';
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
  paymentLink?: string;
  sentAt?: string;
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

// Plaid Link Component
function PlaidLinkComponent({ 
  onSuccess, 
  onExit 
}: { 
  onSuccess: (publicToken: string, metadata: any) => void;
  onExit?: () => void;
}) {
  const [linkToken, setLinkToken] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const createLinkToken = async () => {
      try {
        console.log('Attempting to create Plaid link token...');
        const response = await plaidAPI.createLinkToken();
        console.log('Link token received:', response.link_token ? 'Success' : 'Failed');
        setLinkToken(response.link_token);
        setError('');
      } catch (error: any) {
        console.error('Failed to create Plaid link token:', error);
        const errorMessage = error.response?.data?.message || 
                           error.response?.data?.error || 
                           'Unable to initialize bank connection. Please try again later.';
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    createLinkToken();
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: (publicToken, metadata) => {
      console.log('Plaid Link success:', metadata.institution?.name);
      onSuccess(publicToken, metadata);
    },
    onExit: (err, metadata) => {
      console.log('Plaid Link exited:', err, metadata);
      if (onExit) onExit();
    },
  });

  if (loading) {
    return (
      <button className="plaid-link-btn" disabled>
        <div className="btn-loading">
          <div className="loading-spinner small"></div>
          Initializing...
        </div>
      </button>
    );
  }

  if (error) {
    return (
      <div className="plaid-error">
        <div className="error-message">
          <div className="error-icon">
            <X size={20} />
          </div>
          {error}
        </div>
        <button 
          className="retry-btn"
          onClick={() => window.location.reload()}
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!linkToken || !ready) {
    return (
      <button className="plaid-link-btn" disabled>
        <div className="btn-loading">
          <div className="loading-spinner small"></div>
          Preparing connection...
        </div>
      </button>
    );
  }

  return (
    <button className="plaid-link-btn" onClick={() => open()}>
      <Building className="icon" />
      Connect Bank Account
    </button>
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
                className={`nav-item ${activeTab === 'payouts' ? 'active' : ''}`}
                onClick={() => setActiveTab('payouts')}
              >
                <DollarSign size={20} />
                <span>Payouts</span>
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
            {activeTab === 'payouts' && user && <PayoutsTab user={user} />}
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
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showActions, setShowActions] = useState<string | null>(null);
  const [stripeConnected, setStripeConnected] = useState(false);
  const [loadingActions, setLoadingActions] = useState<{[key: string]: boolean}>({});

  const canCreateInvoice = (user.plan === 'free' && user.invoicesThisMonth < user.maxInvoices) || user.plan !== 'free';

  // Check Stripe Connect status
  useEffect(() => {
    const checkStripeStatus = async () => {
      try {
        const status = await connectAPI.getAccountStatus();
        setStripeConnected(status.status === 'active' && status.charges_enabled);
      } catch (error) {
        console.error('Failed to check Stripe status:', error);
      }
    };
    checkStripeStatus();
  }, []);

  const handleSendInvoice = async (invoice: Invoice) => {
    setLoadingActions(prev => ({ ...prev, [`send-${invoice.id}`]: true }));
    try {
      await invoicesAPI.sendEmail(invoice.id, { send_copy: true });
      // Update invoice status to sent
      setInvoices(prev => prev.map(inv => 
        inv.id === invoice.id 
          ? { ...inv, status: 'sent' as const, sentAt: new Date().toISOString() }
          : inv
      ));
      alert(`Invoice sent successfully to ${invoice.clientEmail}`);
    } catch (error: any) {
      console.error('Failed to send invoice:', error);
      const message = error.response?.data?.message || 'Failed to send invoice';
      alert(message);
    } finally {
      setLoadingActions(prev => ({ ...prev, [`send-${invoice.id}`]: false }));
    }
  };

  const handleCreatePaymentLink = async (invoice: Invoice) => {
    setLoadingActions(prev => ({ ...prev, [`link-${invoice.id}`]: true }));
    try {
      const result = await invoicesAPI.createPaymentLink(invoice.id);
      // Update invoice with payment link
      setInvoices(prev => prev.map(inv => 
        inv.id === invoice.id 
          ? { ...inv, paymentLink: result.payment_link }
          : inv
      ));
      // Copy link to clipboard
      navigator.clipboard.writeText(result.payment_link);
      alert('Payment link created and copied to clipboard!');
    } catch (error: any) {
      console.error('Failed to create payment link:', error);
      const message = error.response?.data?.message || 'Failed to create payment link';
      alert(message);
    } finally {
      setLoadingActions(prev => ({ ...prev, [`link-${invoice.id}`]: false }));
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return '#10b981';
      case 'sent': return '#3b82f6';
      case 'overdue': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  return (
    <div className="invoices-tab-container">
      <div className="invoices-header-new">
        <div className="header-main">
          <div className="header-text">
            <h1 className="page-title">Invoices</h1>
            <p className="page-subtitle">
              Create, manage, and track your invoices with integrated payments
            </p>
          </div>
          <div className="header-actions-new">
            <button 
              className="create-invoice-btn-new primary"
              onClick={() => setShowCreateForm(true)}
              disabled={!canCreateInvoice}
            >
              <PlusCircle size={18} />
              Create Invoice
            </button>
          </div>
        </div>
        
        {!stripeConnected && (
          <div className="stripe-notice-new">
            <div className="notice-content">
              <div className="notice-left">
                <div className="notice-icon-new">
                  <CreditCard size={24} />
                </div>
                <div className="notice-text">
                  <h3>Payment Processing Not Connected</h3>
                  <p>Setup payment collection to start accepting payments on your invoices</p>
                </div>
              </div>
              <button 
                className="setup-stripe-btn-new"
                onClick={() => setSelectedInvoice({ id: 'stripe-setup' } as Invoice)}
              >
Connect Payment Processing
              </button>
            </div>
          </div>
        )}
      </div>

      {!canCreateInvoice && (
        <div className="plan-limitation-new">
          <div className="limitation-content-new">
            <div className="limitation-left">
              <div className="limitation-icon-new">
                <TrendingUp size={24} />
              </div>
              <div className="limitation-text">
                <h3>Monthly Limit Reached</h3>
                <p>You've created {user.invoicesThisMonth} of {user.maxInvoices} invoices this month. Upgrade to continue.</p>
              </div>
            </div>
            <button className="upgrade-btn-new" onClick={() => window.location.hash = 'pricing'}>
              Upgrade Plan
            </button>
          </div>
        </div>
      )}

      {invoices.length === 0 ? (
        <div className="empty-state-new">
          <div className="empty-content">
            <div className="empty-icon-new">
              <FileText size={48} />
            </div>
            <h2 className="empty-title">No invoices yet</h2>
            <p className="empty-description">
              Create your first invoice to start getting paid faster with professional invoicing
            </p>
            <button 
              className="create-first-btn-new"
              onClick={() => setShowCreateForm(true)}
              disabled={!canCreateInvoice}
            >
              <PlusCircle size={20} />
              Create Your First Invoice
            </button>
          </div>
        </div>
      ) : (
        <div className="invoices-container">
          <div className="invoices-grid">
            {invoices.map(invoice => (
              <div key={invoice.id} className="invoice-card">
                <div className="card-header">
                  <div className="invoice-info">
                    <h3 className="invoice-number">#{invoice.invoiceNumber}</h3>
                    <div 
                      className="status-badge"
                      style={{ backgroundColor: getStatusColor(invoice.status) }}
                    >
                      {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                    </div>
                  </div>
                  <div className="invoice-amount">
                    {formatCurrency(invoice.total)}
                  </div>
                </div>

                <div className="card-body">
                  <div className="client-section">
                    <div className="client-avatar">
                      <User className="avatar-icon" />
                    </div>
                    <div className="client-details">
                      <h4>{invoice.clientName}</h4>
                      <p>{invoice.clientEmail}</p>
                    </div>
                  </div>

                  <div className="invoice-details">
                    <div className="detail-row">
                      <span className="label">Created:</span>
                      <span className="value">
                        {new Date(invoice.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="detail-row">
                      <span className="label">Due:</span>
                      <span className="value">
                        {new Date(invoice.dueDate).toLocaleDateString()}
                      </span>
                    </div>
                    {invoice.sentAt && (
                      <div className="detail-row">
                        <span className="label">Sent:</span>
                        <span className="value">
                          {new Date(invoice.sentAt).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="card-actions">
                  <button 
                    className="action-btn secondary"
                    onClick={() => setSelectedInvoice(invoice)}
                  >
                    <Eye className="btn-icon" />
                    View
                  </button>
                  
                  {stripeConnected && invoice.status !== 'paid' && (
                    <>
                      <button 
                        className="action-btn primary"
                        onClick={() => handleSendInvoice(invoice)}
                        disabled={loadingActions[`send-${invoice.id}`]}
                      >
                        {loadingActions[`send-${invoice.id}`] ? (
                          <div className="loading-spinner small" />
                        ) : (
                          <Send className="btn-icon" />
                        )}
                        {invoice.sentAt ? 'Resend' : 'Send'}
                      </button>
                      
                      <button 
                        className="action-btn secondary"
                        onClick={() => handleCreatePaymentLink(invoice)}
                        disabled={loadingActions[`link-${invoice.id}`]}
                      >
                        {loadingActions[`link-${invoice.id}`] ? (
                          <div className="loading-spinner small" />
                        ) : (
                          <CreditCard className="btn-icon" />
                        )}
                        {invoice.paymentLink ? 'Copy Link' : 'Payment Link'}
                      </button>
                    </>
                  )}
                  
                  {!stripeConnected && (
                    <button 
                      className="action-btn disabled"
                      title="Setup payment processing to enable payments"
                    >
                      <Lock className="btn-icon" />
                      Setup Required
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showCreateForm && (
        <CreateInvoiceModal 
          onClose={() => setShowCreateForm(false)} 
          clients={clients}
          onSave={async (invoiceData) => {
            try {
              const newInvoice = await invoicesAPI.create(invoiceData);
              setInvoices([newInvoice, ...invoices]);
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

      {selectedInvoice && selectedInvoice.id === 'stripe-setup' && (
        <ModernStripeOnboarding onClose={() => setSelectedInvoice(null)} />
      )}

      {selectedInvoice && selectedInvoice.id !== 'stripe-setup' && (
        <InvoiceViewModal 
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          onSend={() => handleSendInvoice(selectedInvoice)}
          onCreatePaymentLink={() => handleCreatePaymentLink(selectedInvoice)}
          stripeConnected={stripeConnected}
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
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    clientId: '',
    dueDate: '',
    notes: '',
    newClientMode: false,
    newClient: {
      name: '',
      email: '',
      address: '',
      phone: '',
      company: ''
    }
  });

  const [items, setItems] = useState<InvoiceItem[]>([
    { id: '1', description: '', quantity: 1, rate: 0, amount: 0 }
  ]);

  const [errors, setErrors] = useState<{[key: string]: string}>({});

  // Set default due date to 30 days from now
  useEffect(() => {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    setFormData(prev => ({
      ...prev,
      dueDate: thirtyDaysFromNow.toISOString().split('T')[0]
    }));
  }, []);

  const addItem = () => {
    setItems([...items, {
      id: Date.now().toString(),
      description: '',
      quantity: 1,
      rate: 0,
      amount: 0
    }]);
  };

  const removeItem = (id: string) => {
    if (items.length > 1) {
      setItems(items.filter(item => item.id !== id));
    }
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

  const validateStep = (step: number): boolean => {
    const newErrors: {[key: string]: string} = {};
    
    if (step === 1) {
      if (formData.newClientMode) {
        if (!formData.newClient.name.trim()) newErrors.newClientName = 'Name is required';
        if (!formData.newClient.email.trim()) newErrors.newClientEmail = 'Email is required';
        if (formData.newClient.email && !/\S+@\S+\.\S+/.test(formData.newClient.email)) {
          newErrors.newClientEmail = 'Please enter a valid email';
        }
      } else {
        if (!formData.clientId) newErrors.clientId = 'Please select a client';
      }
      if (!formData.dueDate) newErrors.dueDate = 'Due date is required';
    }
    
    if (step === 2) {
      const validItems = items.filter(item => item.description.trim());
      if (validItems.length === 0) newErrors.items = 'At least one item is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    setCurrentStep(currentStep - 1);
  };

  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const subtotal = total;
  const tax = 0;
  const selectedClient = clients.find(c => c.id === formData.clientId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateStep(1) || !validateStep(2)) {
      return;
    }

    const validItems = items.filter(item => item.description.trim());
    if (validItems.length === 0) {
      setErrors({ items: 'At least one item is required' });
      return;
    }

    const invoiceData = {
      clientId: formData.newClientMode ? 'new' : formData.clientId,
      newClient: formData.newClientMode ? formData.newClient : undefined,
      date: new Date().toISOString().split('T')[0],
      dueDate: formData.dueDate,
      items: validItems.map(item => ({
        description: item.description,
        quantity: item.quantity,
        rate: item.rate
      })),
      notes: formData.notes,
      taxRate: 0
    };

    onSave(invoiceData);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  return (
    <div className="modal-overlay">
      <div className="modal create-invoice-modal-new">
        <div className="modal-header">
          <div className="header-content">
            <h2>Create New Invoice</h2>
            <div className="step-indicator">
              <div className={`step ${currentStep >= 1 ? 'active' : ''}`}>
                <span className="step-number">1</span>
                <span className="step-label">Client & Date</span>
              </div>
              <div className={`step ${currentStep >= 2 ? 'active' : ''}`}>
                <span className="step-number">2</span>
                <span className="step-label">Items & Details</span>
              </div>
              <div className={`step ${currentStep >= 3 ? 'active' : ''}`}>
                <span className="step-number">3</span>
                <span className="step-label">Review</span>
              </div>
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          {currentStep === 1 && (
            <div className="step-content">
              <div className="section-header">
                <h3>Client Information</h3>
                <p>Select an existing client or add a new one</p>
              </div>

              <div className="client-selection">
                <div className="toggle-buttons">
                  <button
                    type="button"
                    className={`toggle-btn ${!formData.newClientMode ? 'active' : ''}`}
                    onClick={() => setFormData({...formData, newClientMode: false})}
                  >
                    <User className="btn-icon" />
                    Existing Client
                  </button>
                  <button
                    type="button"
                    className={`toggle-btn ${formData.newClientMode ? 'active' : ''}`}
                    onClick={() => setFormData({...formData, newClientMode: true})}
                  >
                    <PlusCircle className="btn-icon" />
                    New Client
                  </button>
                </div>

                {!formData.newClientMode ? (
                  <div className="form-group">
                    <label>Select Client *</label>
                    <select
                      value={formData.clientId}
                      onChange={(e) => setFormData({...formData, clientId: e.target.value})}
                      className={errors.clientId ? 'error' : ''}
                    >
                      <option value="">Choose a client...</option>
                      {clients.map(client => (
                        <option key={client.id} value={client.id}>
                          {client.name} - {client.email}
                        </option>
                      ))}
                    </select>
                    {errors.clientId && <span className="error-message">{errors.clientId}</span>}
                  </div>
                ) : (
                  <div className="new-client-form">
                    <div className="form-row">
                      <div className="form-group">
                        <label>Client Name *</label>
                        <input
                          type="text"
                          value={formData.newClient.name}
                          onChange={(e) => setFormData({
                            ...formData,
                            newClient: {...formData.newClient, name: e.target.value}
                          })}
                          placeholder="Enter client name"
                          className={errors.newClientName ? 'error' : ''}
                        />
                        {errors.newClientName && <span className="error-message">{errors.newClientName}</span>}
                      </div>
                      <div className="form-group">
                        <label>Email Address *</label>
                        <input
                          type="email"
                          value={formData.newClient.email}
                          onChange={(e) => setFormData({
                            ...formData,
                            newClient: {...formData.newClient, email: e.target.value}
                          })}
                          placeholder="client@example.com"
                          className={errors.newClientEmail ? 'error' : ''}
                        />
                        {errors.newClientEmail && <span className="error-message">{errors.newClientEmail}</span>}
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Company</label>
                        <input
                          type="text"
                          value={formData.newClient.company}
                          onChange={(e) => setFormData({
                            ...formData,
                            newClient: {...formData.newClient, company: e.target.value}
                          })}
                          placeholder="Company name (optional)"
                        />
                      </div>
                      <div className="form-group">
                        <label>Phone</label>
                        <input
                          type="tel"
                          value={formData.newClient.phone}
                          onChange={(e) => setFormData({
                            ...formData,
                            newClient: {...formData.newClient, phone: e.target.value}
                          })}
                          placeholder="Phone number (optional)"
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Address</label>
                      <textarea
                        value={formData.newClient.address}
                        onChange={(e) => setFormData({
                          ...formData,
                          newClient: {...formData.newClient, address: e.target.value}
                        })}
                        placeholder="Client address (optional)"
                        rows={3}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="section-divider"></div>

              <div className="section-header">
                <h3>Invoice Details</h3>
                <p>Set the due date and invoice terms</p>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Due Date *</label>
                  <input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({...formData, dueDate: e.target.value})}
                    className={errors.dueDate ? 'error' : ''}
                  />
                  {errors.dueDate && <span className="error-message">{errors.dueDate}</span>}
                </div>
                <div className="form-group">
                  <label>Issue Date</label>
                  <input
                    type="date"
                    value={new Date().toISOString().split('T')[0]}
                    disabled
                    className="disabled"
                  />
                  <small className="field-hint">Today's date will be used</small>
                </div>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="step-content">
              <div className="section-header">
                <h3>Invoice Items</h3>
                <p>Add the products or services you're billing for</p>
              </div>

              <div className="items-section-new">
                <div className="items-header">
                  <div className="header-cell description">Description</div>
                  <div className="header-cell quantity">Qty</div>
                  <div className="header-cell rate">Rate</div>
                  <div className="header-cell amount">Amount</div>
                  <div className="header-cell actions">Actions</div>
                </div>
                
                {items.map((item, index) => (
                  <div key={item.id} className="item-row-new">
                    <div className="item-cell description">
                      <input
                        type="text"
                        placeholder="Describe your service or product..."
                        value={item.description}
                        onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                        className="description-input-new"
                      />
                    </div>
                    <div className="item-cell quantity">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={item.quantity}
                        onChange={(e) => updateItem(item.id, 'quantity', Number(e.target.value))}
                        className="quantity-input-new"
                      />
                    </div>
                    <div className="item-cell rate">
                      <div className="currency-input-new">
                        <span className="currency-symbol">$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={item.rate > 0 ? item.rate : ''}
                          onChange={(e) => updateItem(item.id, 'rate', parseFloat(e.target.value) || 0)}
                          className="rate-input-new"
                        />
                      </div>
                    </div>
                    <div className="item-cell amount">
                      <span className="amount-display">{formatCurrency(item.amount)}</span>
                    </div>
                    <div className="item-cell actions">
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="remove-item-btn"
                          title="Remove item"
                        >
                          <X className="icon" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                
                {errors.items && <div className="error-message">{errors.items}</div>}
                
                <button type="button" onClick={addItem} className="add-item-btn-new">
                  <PlusCircle className="btn-icon" />
                  Add Another Item
                </button>
              </div>

              <div className="section-divider"></div>

              <div className="form-group">
                <label>Notes & Terms</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  placeholder="Add any additional notes, terms, or special instructions..."
                  rows={4}
                  className="notes-textarea"
                />
                <small className="field-hint">This will appear at the bottom of your invoice</small>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="step-content">
              <div className="section-header">
                <h3>Review Your Invoice</h3>
                <p>Double-check everything before creating your invoice</p>
              </div>

              <div className="review-section">
                <div className="review-card">
                  <h4>Client Information</h4>
                  {formData.newClientMode ? (
                    <div className="client-info">
                      <p><strong>{formData.newClient.name}</strong></p>
                      <p>{formData.newClient.email}</p>
                      {formData.newClient.company && <p>{formData.newClient.company}</p>}
                      {formData.newClient.address && <p>{formData.newClient.address}</p>}
                    </div>
                  ) : selectedClient ? (
                    <div className="client-info">
                      <p><strong>{selectedClient.name}</strong></p>
                      <p>{selectedClient.email}</p>
                      {selectedClient.company && <p>{selectedClient.company}</p>}
                      {selectedClient.address && <p>{selectedClient.address}</p>}
                    </div>
                  ) : null}
                </div>

                <div className="review-card">
                  <h4>Invoice Details</h4>
                  <div className="detail-row">
                    <span>Issue Date:</span>
                    <span>{new Date().toLocaleDateString()}</span>
                  </div>
                  <div className="detail-row">
                    <span>Due Date:</span>
                    <span>{new Date(formData.dueDate).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="review-card">
                  <h4>Items</h4>
                  <div className="items-summary">
                    {items.filter(item => item.description.trim()).map((item, index) => (
                      <div key={item.id} className="item-summary">
                        <div className="item-summary-main">
                          <span className="item-description">{item.description}</span>
                          <span className="item-amount">{formatCurrency(item.amount)}</span>
                        </div>
                        <div className="item-summary-details">
                          <span>{item.quantity} × {formatCurrency(item.rate)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="review-card total-card">
                  <div className="total-breakdown">
                    <div className="total-row">
                      <span>Subtotal:</span>
                      <span>{formatCurrency(subtotal)}</span>
                    </div>
                    <div className="total-row">
                      <span>Tax:</span>
                      <span>{formatCurrency(tax)}</span>
                    </div>
                    <div className="total-row final-total">
                      <span>Total:</span>
                      <span>{formatCurrency(total)}</span>
                    </div>
                  </div>
                </div>

                {formData.notes && (
                  <div className="review-card">
                    <h4>Notes</h4>
                    <p className="notes-preview">{formData.notes}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <div className="footer-actions">
            {currentStep > 1 && (
              <button type="button" onClick={prevStep} className="prev-btn">
                Back
              </button>
            )}
            <button type="button" onClick={onClose} className="cancel-btn">
              Cancel
            </button>
            {currentStep < 3 ? (
              <button type="button" onClick={nextStep} className="next-btn">
                Continue
              </button>
            ) : (
              <button type="button" onClick={handleSubmit} className="create-btn">
                <FileText className="btn-icon" />
                Create Invoice
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


// Invoice View Modal
function InvoiceViewModal({ 
  invoice, 
  onClose, 
  onSend, 
  onCreatePaymentLink, 
  stripeConnected 
}: { 
  invoice: Invoice;
  onClose: () => void;
  onSend: () => void;
  onCreatePaymentLink: () => void;
  stripeConnected: boolean;
}) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const copyPaymentLink = () => {
    if (invoice.paymentLink) {
      navigator.clipboard.writeText(invoice.paymentLink);
      alert('Payment link copied to clipboard!');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal invoice-view-modal">
        <div className="modal-header">
          <h2>Invoice #{invoice.invoiceNumber}</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        
        <div className="invoice-preview">
          <div className="invoice-header">
            <div className="invoice-title">
              <h1>Invoice</h1>
              <div className="invoice-meta">
                <span className="invoice-number">#{invoice.invoiceNumber}</span>
                <div 
                  className="status-badge"
                  style={{ 
                    backgroundColor: invoice.status === 'paid' ? '#10b981' : 
                                    invoice.status === 'sent' ? '#3b82f6' : 
                                    invoice.status === 'overdue' ? '#ef4444' : '#6b7280'
                  }}
                >
                  {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                </div>
              </div>
            </div>
            
            <div className="invoice-amount-large">
              {formatCurrency(invoice.total)}
            </div>
          </div>
          
          <div className="invoice-details-grid">
            <div className="bill-to">
              <h4>Bill To:</h4>
              <div className="client-info">
                <p className="client-name">{invoice.clientName}</p>
                <p className="client-email">{invoice.clientEmail}</p>
                <p className="client-address">{invoice.clientAddress}</p>
              </div>
            </div>
            
            <div className="invoice-dates">
              <h4>Invoice Details:</h4>
              <div className="date-info">
                <div className="date-row">
                  <span>Issue Date:</span>
                  <span>{new Date(invoice.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="date-row">
                  <span>Due Date:</span>
                  <span>{new Date(invoice.dueDate).toLocaleDateString()}</span>
                </div>
                {invoice.sentAt && (
                  <div className="date-row">
                    <span>Sent:</span>
                    <span>{new Date(invoice.sentAt).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="invoice-items">
            <h4>Items:</h4>
            <div className="items-table">
              <div className="items-header">
                <span>Description</span>
                <span>Qty</span>
                <span>Rate</span>
                <span>Amount</span>
              </div>
              {invoice.items.map((item, index) => (
                <div key={index} className="item-row">
                  <span>{item.description}</span>
                  <span>{item.quantity}</span>
                  <span>{formatCurrency(item.rate)}</span>
                  <span>{formatCurrency(item.amount)}</span>
                </div>
              ))}
              <div className="total-row">
                <span></span>
                <span></span>
                <span><strong>Total:</strong></span>
                <span><strong>{formatCurrency(invoice.total)}</strong></span>
              </div>
            </div>
          </div>
          
          {invoice.notes && (
            <div className="invoice-notes">
              <h4>Notes:</h4>
              <p>{invoice.notes}</p>
            </div>
          )}
          
          {invoice.paymentLink && (
            <div className="payment-link-section">
              <h4>Payment Link:</h4>
              <div className="payment-link-display">
                <input 
                  type="text" 
                  value={invoice.paymentLink} 
                  readOnly 
                  className="payment-link-input"
                />
                <button className="copy-link-btn" onClick={copyPaymentLink}>
                  <Copy className="btn-icon" />
                  Copy
                </button>
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-actions">
          <button className="secondary-btn" onClick={onClose}>
            Close
          </button>
          
          {stripeConnected && invoice.status !== 'paid' && (
            <>
              <button className="primary-btn" onClick={onSend}>
                <Send className="btn-icon" />
                {invoice.sentAt ? 'Resend Email' : 'Send Email'}
              </button>
              
              <button className="secondary-btn" onClick={onCreatePaymentLink}>
                <CreditCard className="btn-icon" />
                {invoice.paymentLink ? 'Regenerate Link' : 'Create Payment Link'}
              </button>
            </>
          )}
          
          {!stripeConnected && (
            <div className="setup-required">
              <Lock className="icon" />
              <span>Setup payment processing to enable payments</span>
            </div>
          )}
        </div>
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

// Payouts Tab
function PayoutsTab({ user }: { user: User }) {
  const [activeSubTab, setActiveSubTab] = useState('overview');
  const [payoutData, setPayoutData] = useState<{
    payouts: any[];
    balance: {
      pending: string;
      totalEarnings: string;
      totalPaidOut: string;
      platformFees: string;
    };
  } | null>(null);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPayoutData = async () => {
      try {
        const data = await payoutsAPI.getPayouts();
        setPayoutData(data);
      } catch (error) {
        console.error('Failed to load payout data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadPayoutData();
  }, []);

  if (loading) {
    return (
      <div className="payouts-tab">
        <div className="loading-spinner"></div>
        <p>Loading payout information...</p>
      </div>
    );
  }

  const renderOverviewTab = () => (
    <div className="payout-overview">
      <div className="payout-balance-grid">
        <div className="balance-card pending">
          <div className="balance-icon">
            <DollarSign className="icon" />
          </div>
          <div className="balance-info">
            <h3>Pending Balance</h3>
            <div className="balance-amount">${payoutData?.balance.pending || '0.00'}</div>
            <p>Available for next payout</p>
          </div>
        </div>

        <div className="balance-card earnings">
          <div className="balance-icon">
            <CreditCard className="icon" />
          </div>
          <div className="balance-info">
            <h3>Total Earnings</h3>
            <div className="balance-amount">${payoutData?.balance.totalEarnings || '0.00'}</div>
            <p>From paid invoices (after fees)</p>
          </div>
        </div>

        <div className="balance-card paid-out">
          <div className="balance-icon">
            <Send className="icon" />
          </div>
          <div className="balance-info">
            <h3>Total Paid Out</h3>
            <div className="balance-amount">${payoutData?.balance.totalPaidOut || '0.00'}</div>
            <p>Transferred to your bank</p>
          </div>
        </div>

        <div className="balance-card fees">
          <div className="balance-icon">
            <Building className="icon" />
          </div>
          <div className="balance-info">
            <h3>Platform Fees</h3>
            <div className="balance-amount">${payoutData?.balance.platformFees || '0.00'}</div>
            <p>3% processing fees</p>
          </div>
        </div>
      </div>

      <div className="payout-info-grid">
        <div className="info-card">
          <div className="info-header">
            <h3>Payout Schedule</h3>
            <div className="info-icon">
              <Settings className="icon" />
            </div>
          </div>
          <div className="info-list">
            <div className="info-item">
              <span className="label">Frequency:</span>
              <span className="value">Weekly (every Friday)</span>
            </div>
            <div className="info-item">
              <span className="label">Minimum:</span>
              <span className="value">$10.00</span>
            </div>
            <div className="info-item">
              <span className="label">Transfer Time:</span>
              <span className="value">2-3 business days</span>
            </div>
            <div className="info-item">
              <span className="label">Transfer Fee:</span>
              <span className="value">Free ACH transfers</span>
            </div>
          </div>
        </div>

        <div className="info-card">
          <div className="info-header">
            <h3>Fee Structure</h3>
            <div className="info-icon">
              <FileText className="icon" />
            </div>
          </div>
          <div className="info-list">
            <div className="info-item">
              <span className="label">Platform Fee:</span>
              <span className="value">3% per transaction</span>
            </div>
            <div className="info-item">
              <span className="label">Your Share:</span>
              <span className="value">97% per transaction</span>
            </div>
            <div className="info-item">
              <span className="label">Payout Fee:</span>
              <span className="value">$0.00</span>
            </div>
            <div className="info-item">
              <span className="label">Processing:</span>
              <span className="value">Automatic</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderHistoryTab = () => (
    <div className="payout-history-section">
      {payoutData && payoutData.payouts.length > 0 ? (
        <div className="payout-table-container">
          <div className="table-controls">
            <div className="table-search">
              <input type="text" placeholder="Search payouts..." className="search-input" />
            </div>
            <div className="table-filters">
              <select className="filter-select">
                <option value="all">All Status</option>
                <option value="completed">Completed</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          </div>
          
          <div className="payout-table">
            <div className="table-header">
              <div className="table-col">Date</div>
              <div className="table-col">Amount</div>
              <div className="table-col">Status</div>
              <div className="table-col">Arrival Date</div>
              <div className="table-col">Actions</div>
            </div>
            {payoutData.payouts.map((payout, index) => (
              <div key={index} className="table-row">
                <div className="table-col">
                  {new Date(payout.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                  })}
                </div>
                <div className="table-col amount">${parseFloat(payout.amount).toFixed(2)}</div>
                <div className="table-col">
                  <span className={`status-badge ${payout.status}`}>
                    {payout.status === 'completed' ? 'Completed' : 'Pending'}
                  </span>
                </div>
                <div className="table-col">
                  {payout.arrival_date 
                    ? new Date(payout.arrival_date).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })
                    : 'Processing'
                  }
                </div>
                <div className="table-col">
                  <button className="view-details-btn">
                    <Eye className="icon" />
                    View
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-icon">
            <DollarSign className="icon" />
          </div>
          <h3>No Payouts Yet</h3>
          <p>Your payout history will appear here once you start receiving payments on your invoices.</p>
          <Link to="/invoices" className="cta-button">
            <PlusCircle className="icon" />
            Create Your First Invoice
          </Link>
        </div>
      )}
    </div>
  );

  const renderSettingsTab = () => (
    <div className="payout-settings-section">
      <div className="settings-grid">
        <div className="settings-card">
          <div className="settings-header">
            <h3>Bank Account</h3>
            <div className="settings-icon">
              <Building className="icon" />
            </div>
          </div>
          <p>Manage your connected bank account for payouts</p>
          <div className="bank-info">
            <div className="bank-status connected">
              <span className="status-indicator"></span>
              <span>Bank account connected</span>
            </div>
            <button className="secondary-button">
              <Settings className="icon" />
              Update Bank Details
            </button>
          </div>
        </div>

        <div className="settings-card">
          <div className="settings-header">
            <h3>Notification Preferences</h3>
            <div className="settings-icon">
              <Mail className="icon" />
            </div>
          </div>
          <p>Choose how you want to be notified about payouts</p>
          <div className="notification-settings">
            <label className="checkbox-label">
              <input type="checkbox" defaultChecked />
              <span>Email notifications for payouts</span>
            </label>
            <label className="checkbox-label">
              <input type="checkbox" defaultChecked />
              <span>SMS notifications for large payouts</span>
            </label>
          </div>
        </div>

        <div className="settings-card">
          <div className="settings-header">
            <h3>Payout Schedule</h3>
            <div className="settings-icon">
              <Settings className="icon" />
            </div>
          </div>
          <p>Customize your payout frequency</p>
          <div className="schedule-options">
            <label className="radio-label">
              <input type="radio" name="schedule" value="weekly" defaultChecked />
              <span>Weekly (Recommended)</span>
            </label>
            <label className="radio-label">
              <input type="radio" name="schedule" value="monthly" />
              <span>Monthly</span>
            </label>
          </div>
        </div>

        <div className="settings-card">
          <div className="settings-header">
            <h3>Security</h3>
            <div className="settings-icon">
              <Lock className="icon" />
            </div>
          </div>
          <p>Security settings for your payout account</p>
          <div className="security-settings">
            <div className="security-item">
              <span>Two-factor authentication</span>
              <span className="status enabled">Enabled</span>
            </div>
            <div className="security-item">
              <span>Account verification</span>
              <span className="status verified">Verified</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="payouts-tab">
      <div className="tab-header">
        <h1>Earnings & Payouts</h1>
        <p className="tab-subtitle">Track your earnings and manage your payout preferences</p>
      </div>

      <div className="sub-tabs">
        <button 
          className={`sub-tab ${activeSubTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('overview')}
        >
          <DollarSign className="tab-icon" />
          Overview
        </button>
        <button 
          className={`sub-tab ${activeSubTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('history')}
        >
          <FileText className="tab-icon" />
          Payout History
        </button>
        <button 
          className={`sub-tab ${activeSubTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('settings')}
        >
          <Settings className="tab-icon" />
          Settings
        </button>
      </div>

      <div className="sub-tab-content">
        {activeSubTab === 'overview' && renderOverviewTab()}
        {activeSubTab === 'history' && renderHistoryTab()}
        {activeSubTab === 'settings' && renderSettingsTab()}
      </div>
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

  const [bankAccount, setBankAccount] = useState<{
    connected: boolean;
    account?: {
      name: string;
      type: string;
      institution: string;
      connected_at: string;
    };
  } | null>(null);

  const [plaidLoading, setPlaidLoading] = useState(false);

  // Load bank account status on component mount
  useEffect(() => {
    const loadBankAccountStatus = async () => {
      try {
        const accountInfo = await plaidAPI.getAccountInfo();
        setBankAccount(accountInfo);
      } catch (error) {
        console.error('Failed to load bank account status:', error);
      }
    };
    loadBankAccountStatus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (user) {
      setUser({...user, ...formData});
    }
  };

  const handlePlaidSuccess = async (publicToken: string, metadata: any) => {
    setPlaidLoading(true);
    try {
      const result = await plaidAPI.exchangePublicToken(publicToken, metadata);
      if (result.success) {
        // Refresh bank account status
        const accountInfo = await plaidAPI.getAccountInfo();
        setBankAccount(accountInfo);
        alert('Bank account connected successfully!');
      }
    } catch (error) {
      console.error('Failed to connect bank account:', error);
      alert('Failed to connect bank account. Please try again.');
    } finally {
      setPlaidLoading(false);
    }
  };

  const handleDisconnectBank = async () => {
    if (!window.confirm('Are you sure you want to disconnect your bank account?')) {
      return;
    }

    try {
      await plaidAPI.disconnect();
      setBankAccount({ connected: false });
      alert('Bank account disconnected successfully.');
    } catch (error) {
      console.error('Failed to disconnect bank account:', error);
      alert('Failed to disconnect bank account. Please try again.');
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
        <h2>Connect to Payment Processor</h2>
        <p>Connect your Stripe account to accept payments directly on your invoices with credit cards, debit cards, and bank transfers.</p>
        
        <div className="bank-account-status">
          {bankAccount ? (
            <>
              {!bankAccount.connected ? (
                <div className="bank-not-connected">
                  <div className="setup-header">
                    <div className="setup-icon">
                      <Building className="icon" />
                    </div>
                    <div className="setup-content">
                      <h3>Connect your bank account</h3>
                      <p>Securely link your bank account using Plaid to receive automatic weekly payouts from your invoices.</p>
                    </div>
                  </div>
                  
                  <div className="payout-benefits">
                    <div className="benefit-item">
                      <div className="benefit-icon">
                        <Lock className="icon" />
                      </div>
                      <span>Bank-grade 256-bit encryption</span>
                    </div>
                    <div className="benefit-item">
                      <div className="benefit-icon">
                        <CreditCard className="icon" />
                      </div>
                      <span>Automatic weekly payouts</span>
                    </div>
                    <div className="benefit-item">
                      <div className="benefit-icon">
                        <DollarSign className="icon" />
                      </div>
                      <span>No setup or transfer fees</span>
                    </div>
                    <div className="benefit-item">
                      <div className="benefit-icon">
                        <Send className="icon" />
                      </div>
                      <span>2-3 business day transfers</span>
                    </div>
                  </div>

                  <div className="plaid-connect-section">
                    {plaidLoading ? (
                      <button className="setup-payouts-btn" disabled>
                        <div className="loading-spinner small"></div>
                        Connecting...
                      </button>
                    ) : (
                      <PlaidLinkComponent 
                        onSuccess={handlePlaidSuccess}
                        onExit={() => console.log('Plaid Link closed')}
                      />
                    )}
                    <p className="plaid-disclaimer">
                      Powered by Plaid. Your banking information is never stored on our servers.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bank-connected">
                  <div className="bank-icon">
                    <CreditCard className="icon" />
                  </div>
                  <h3>Bank account connected</h3>
                  <p>Your bank account is securely connected and ready to receive payouts.</p>
                  
                  <div className="bank-details">
                    <div className="detail-row">
                      <span>Institution:</span>
                      <span className="value">{bankAccount.account?.institution}</span>
                    </div>
                    <div className="detail-row">
                      <span>Account:</span>
                      <span className="value">{bankAccount.account?.name} ({bankAccount.account?.type})</span>
                    </div>
                    <div className="detail-row">
                      <span>Connected:</span>
                      <span className="value">
                        {bankAccount.account?.connected_at 
                          ? new Date(bankAccount.account.connected_at).toLocaleDateString()
                          : 'Recently'
                        }
                      </span>
                    </div>
                    <div className="detail-row">
                      <span>Status:</span>
                      <span className="status-badge active">Active</span>
                    </div>
                  </div>

                  <div className="bank-actions">
                    <button 
                      className="disconnect-btn"
                      onClick={handleDisconnectBank}
                    >
                      <Settings className="icon" />
                      Disconnect Bank Account
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="bank-loading">
              <div className="loading-spinner"></div>
              <p>Loading bank account status...</p>
            </div>
          )}
        </div>
      </div>

      <div className="settings-section">
        <h2>Payment Processing</h2>
        <p>QuickBill Pro handles all payment processing for your invoices.</p>
        <div className="payment-info">
          <div className="info-item">
            <strong>Processing Fee:</strong> 3% per transaction
          </div>
          <div className="info-item">
            <strong>Payout Schedule:</strong> Weekly (Fridays)
          </div>
          <div className="info-item">
            <strong>Supported Methods:</strong> All major credit cards
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
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001/api'}/auth/resend-verification`, {
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
        const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001/api'}/auth/verify-email?token=${token}`);
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