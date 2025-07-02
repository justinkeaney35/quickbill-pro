import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('quickbill_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle token expiration
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('quickbill_token');
      localStorage.removeItem('quickbill_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: async (email: string, password: string) => {
    const response = await api.post('/auth/login', { email, password });
    return response.data;
  },

  register: async (name: string, email: string, password: string, company?: string) => {
    const response = await api.post('/auth/register', { name, email, password, company });
    return response.data;
  },

  getProfile: async () => {
    const response = await api.get('/user/profile');
    return response.data;
  },

  updateProfile: async (data: { name: string; email: string; company?: string }) => {
    const response = await api.put('/user/profile', data);
    return response.data;
  },
};

// Clients API
export const clientsAPI = {
  getAll: async () => {
    const response = await api.get('/clients');
    return response.data;
  },

  create: async (clientData: {
    name: string;
    email: string;
    address: string;
    phone?: string;
    company?: string;
  }) => {
    const response = await api.post('/clients', clientData);
    return response.data;
  },

  update: async (id: string, clientData: {
    name: string;
    email: string;
    address: string;
    phone?: string;
    company?: string;
  }) => {
    const response = await api.put(`/clients/${id}`, clientData);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete(`/clients/${id}`);
    return response.data;
  },
};

// Invoices API
export const invoicesAPI = {
  getAll: async () => {
    const response = await api.get('/invoices');
    return response.data;
  },

  create: async (invoiceData: {
    clientId: string;
    date: string;
    dueDate: string;
    items: Array<{
      description: string;
      quantity: number;
      rate: number;
    }>;
    notes?: string;
    taxRate?: number;
  }) => {
    const response = await api.post('/invoices', invoiceData);
    return response.data;
  },

  updateStatus: async (id: string, status: string) => {
    const response = await api.patch(`/invoices/${id}/status`, { status });
    return response.data;
  },

  sendEmail: async (id: string, options?: { message?: string; send_copy?: boolean }) => {
    const response = await api.post(`/invoices/${id}/send`, options);
    return response.data;
  },

  createPaymentLink: async (id: string) => {
    const response = await api.post(`/invoices/${id}/create-payment-link`);
    return response.data;
  },

  getPublic: async (id: string) => {
    const response = await api.get(`/public/invoice/${id}`);
    return response.data;
  },
};

// Dashboard API
export const dashboardAPI = {
  getStats: async () => {
    const response = await api.get('/dashboard/stats');
    return response.data;
  },
};

// Subscriptions API
export const subscriptionsAPI = {
  createCheckout: async (plan: string) => {
    const response = await api.post('/subscriptions/create-checkout', { plan });
    return response.data;
  },

  createEmbeddedCheckout: async (plan: string) => {
    const response = await api.post('/subscriptions/create-embedded-checkout', { plan });
    return response.data;
  },

  getSessionStatus: async (sessionId: string) => {
    const response = await api.get(`/subscriptions/session-status/${sessionId}`);
    return response.data;
  },

  getStatus: async () => {
    const response = await api.get('/subscriptions/status');
    return response.data;
  },

  cancel: async () => {
    const response = await api.post('/subscriptions/cancel');
    return response.data;
  },
};

// Payments API
export const paymentsAPI = {
  createStripeIntent: async (invoiceId: string, amount: number) => {
    const response = await api.post('/payments/stripe/intent', { invoiceId, amount });
    return response.data;
  },

  createPayPalOrder: async (invoiceId: string, amount: number) => {
    const response = await api.post('/payments/paypal/create', { invoiceId, amount });
    return response.data;
  },
};

// Connect API (for payouts)
export const connectAPI = {
  createAccount: async () => {
    const response = await api.post('/connect/create-account');
    return response.data;
  },

  createAccountSession: async (accountId: string) => {
    const response = await api.post('/connect/account-session', { account: accountId });
    return response.data;
  },

  createAccountLink: async (accountId: string) => {
    const response = await api.post('/connect/create-account-link', { accountId });
    return response.data;
  },

  createEmbeddedOnboarding: async (accountId: string) => {
    const response = await api.post('/connect/create-embedded-onboarding', { accountId });
    return response.data;
  },

  updateBusinessInfo: async (accountId: string, businessInfo: {
    businessType: 'individual' | 'company';
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    companyName?: string;
    taxId?: string;
    dob?: { day: string; month: string; year: string };
    address?: {
      line1: string;
      line2?: string;
      city: string;
      state: string;
      postal_code: string;
    };
  }) => {
    const response = await api.post('/connect/update-business-info', { accountId, businessInfo });
    return response.data;
  },

  updateBankAccount: async (accountId: string, bankInfo: {
    routingNumber: string;
    accountNumber: string;
    accountHolderType: 'individual' | 'company';
  }) => {
    const response = await api.post('/connect/update-bank-account', { accountId, bankInfo });
    return response.data;
  },

  getAccountStatus: async () => {
    const response = await api.get('/connect/account-status');
    return response.data;
  },

  createAccountSession: async (accountId: string) => {
    const response = await api.post('/connect/account-session', { account: accountId });
    return response.data;
  },
};

// Payouts API
export const payoutsAPI = {
  getPayouts: async () => {
    const response = await api.get('/payouts');
    return response.data;
  },

  processPayouts: async () => {
    const response = await api.post('/admin/process-payouts');
    return response.data;
  },
};

// Plaid API
export const plaidAPI = {
  createLinkToken: async () => {
    const response = await api.post('/plaid/create-link-token');
    return response.data;
  },

  exchangePublicToken: async (publicToken: string, metadata: any) => {
    const response = await api.post('/plaid/exchange-public-token', {
      public_token: publicToken,
      metadata
    });
    return response.data;
  },

  getAccountInfo: async () => {
    const response = await api.get('/plaid/account-info');
    return response.data;
  },

  disconnect: async () => {
    const response = await api.delete('/plaid/disconnect');
    return response.data;
  },
};

// Health check
export const healthCheck = async () => {
  const response = await api.get('/health');
  return response.data;
};

export default api;