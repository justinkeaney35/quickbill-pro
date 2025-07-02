import React, { useState, useEffect } from 'react';
import { 
  DollarSign, 
  TrendingUp, 
  Download, 
  Calendar,
  CreditCard,
  Send,
  Building,
  Settings,
  Filter,
  Search,
  Eye,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock,
  BarChart3
} from 'lucide-react';
import { payoutsAPI, connectAPI } from '../utils/api';

interface User {
  id: string;
  name: string;
  email: string;
  company: string;
  plan: 'free' | 'starter' | 'pro' | 'business';
  invoicesThisMonth: number;
  maxInvoices: number;
}

interface StripePayoutData {
  id: string;
  amount: number;
  currency: string;
  status: 'paid' | 'pending' | 'in_transit' | 'canceled' | 'failed';
  arrival_date: number;
  created: number;
  description?: string;
  failure_code?: string;
  failure_message?: string;
  method: 'standard' | 'instant';
  type: 'bank_account' | 'card';
}

interface PayoutAnalytics {
  totalAmount: number;
  totalCount: number;
  avgAmount: number;
  successRate: number;
  periodComparison: {
    amount: number;
    count: number;
    percentChange: number;
  };
  statusBreakdown: {
    paid: number;
    pending: number;
    failed: number;
  };
  monthlyTrend: Array<{
    month: string;
    amount: number;
    count: number;
  }>;
}

interface BalanceData {
  available: Array<{
    amount: number;
    currency: string;
  }>;
  pending: Array<{
    amount: number;
    currency: string;
  }>;
}

export default function EnhancedPayoutsTab({ user }: { user: User }) {
  const [activeSubTab, setActiveSubTab] = useState('overview');
  const [period, setPeriod] = useState('30d');
  const [stripePayouts, setStripePayouts] = useState<StripePayoutData[]>([]);
  const [analytics, setAnalytics] = useState<PayoutAnalytics | null>(null);
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stripeConnected, setStripeConnected] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    initializePayoutsTab();
  }, [period]);

  const initializePayoutsTab = async () => {
    try {
      console.log('Initializing payouts tab...');
      setLoading(true);
      setError('');

      // First check Stripe connection
      console.log('Checking Stripe connection...');
      const response = await connectAPI.getAccountStatus();
      console.log('Stripe connection response:', response);
      
      const isConnected = response.status === 'active' && response.details_submitted;
      console.log('Stripe connected:', isConnected);
      setStripeConnected(isConnected);

      if (isConnected) {
        console.log('Loading payout data...');
        // Load payout data if connected
        const [payoutsData, analyticsData] = await Promise.all([
          payoutsAPI.getStripePayouts(),
          payoutsAPI.getPayoutAnalytics(period)
        ]);

        console.log('Payouts data:', payoutsData);
        console.log('Analytics data:', analyticsData);

        setStripePayouts(payoutsData.payouts || []);
        setBalance(payoutsData.balance || null);
        setAnalytics(analyticsData);
      }
      console.log('Payouts tab initialization complete');
    } catch (error: any) {
      console.error('Failed to initialize payouts tab:', error);
      setError(error.message || 'Failed to load payout data');
      setStripeConnected(false);
    } finally {
      setLoading(false);
    }
  };

  const loadPayoutData = async () => {
    if (!stripeConnected) {
      await initializePayoutsTab();
      return;
    }
    
    try {
      setLoading(true);
      setError('');

      const [payoutsData, analyticsData] = await Promise.all([
        payoutsAPI.getStripePayouts(),
        payoutsAPI.getPayoutAnalytics(period)
      ]);

      setStripePayouts(payoutsData.payouts || []);
      setBalance(payoutsData.balance || null);
      setAnalytics(analyticsData);
    } catch (error: any) {
      console.error('Failed to load payout data:', error);
      setError(error.message || 'Failed to load payout data');
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async () => {
    setRefreshing(true);
    await initializePayoutsTab();
    setRefreshing(false);
  };

  const handleExport = async (format: 'csv' | 'pdf') => {
    try {
      const blob = await payoutsAPI.exportPayouts(format, period);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payouts-${period}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const formatCurrency = (amount: number, currency: string = 'usd') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100); // Stripe amounts are in cents
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid':
        return <CheckCircle className="status-icon success" size={16} />;
      case 'pending':
      case 'in_transit':
        return <Clock className="status-icon pending" size={16} />;
      case 'failed':
      case 'canceled':
        return <AlertCircle className="status-icon error" size={16} />;
      default:
        return <Clock className="status-icon" size={16} />;
    }
  };

  if (!stripeConnected) {
    return (
      <div className="payouts-tab">
        <div className="stripe-setup-required">
          <div className="setup-card">
            <div className="setup-icon">
              <TrendingUp size={48} />
            </div>
            <h2>Connect Stripe to View Payouts</h2>
            <p>
              Connect your Stripe account to access detailed payout information, 
              analytics, and export capabilities.
            </p>
            <button 
              className="connect-stripe-btn primary"
              onClick={() => window.location.href = '#payments'}
            >
              <CreditCard size={20} />
              Go to Payments Tab to Connect
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="payouts-tab">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading payout information...</p>
        </div>
      </div>
    );
  }

  const renderOverviewTab = () => (
    <div className="enhanced-payout-overview">
      {/* Period Selection and Actions */}
      <div className="overview-header">
        <div className="period-selector">
          <select 
            value={period} 
            onChange={(e) => setPeriod(e.target.value)}
            className="period-select"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="1y">Last year</option>
          </select>
        </div>
        <div className="overview-actions">
          <button 
            onClick={refreshData}
            disabled={refreshing}
            className="refresh-btn secondary"
          >
            <RefreshCw size={16} className={refreshing ? 'spinning' : ''} />
            Refresh
          </button>
          <button 
            onClick={() => handleExport('csv')}
            className="export-btn secondary"
          >
            <Download size={16} />
            Export CSV
          </button>
          <button 
            onClick={() => handleExport('pdf')}
            className="export-btn secondary"
          >
            <Download size={16} />
            Export PDF
          </button>
        </div>
      </div>

      {/* Enhanced Balance Cards */}
      <div className="enhanced-balance-grid">
        <div className="balance-card available">
          <div className="balance-icon">
            <DollarSign className="icon" />
          </div>
          <div className="balance-info">
            <h3>Available Balance</h3>
            <div className="balance-amount">
              {balance?.available?.[0] 
                ? formatCurrency(balance.available[0].amount, balance.available[0].currency)
                : '$0.00'
              }
            </div>
            <p>Ready for payout</p>
          </div>
        </div>

        <div className="balance-card pending">
          <div className="balance-icon">
            <Clock className="icon" />
          </div>
          <div className="balance-info">
            <h3>Pending Balance</h3>
            <div className="balance-amount">
              {balance?.pending?.[0] 
                ? formatCurrency(balance.pending[0].amount, balance.pending[0].currency)
                : '$0.00'
              }
            </div>
            <p>Processing payments</p>
          </div>
        </div>

        <div className="balance-card total">
          <div className="balance-icon">
            <TrendingUp className="icon" />
          </div>
          <div className="balance-info">
            <h3>Total Payouts</h3>
            <div className="balance-amount">
              {analytics ? formatCurrency(analytics.totalAmount, 'usd') : '$0.00'}
            </div>
            <p>{analytics?.totalCount || 0} transactions</p>
            {analytics?.periodComparison && (
              <div className={`trend ${analytics.periodComparison.percentChange >= 0 ? 'positive' : 'negative'}`}>
                {analytics.periodComparison.percentChange >= 0 ? '+' : ''}
                {analytics.periodComparison.percentChange.toFixed(1)}% vs previous period
              </div>
            )}
          </div>
        </div>

        <div className="balance-card success-rate">
          <div className="balance-icon">
            <BarChart3 className="icon" />
          </div>
          <div className="balance-info">
            <h3>Success Rate</h3>
            <div className="balance-amount">
              {analytics ? `${analytics.successRate.toFixed(1)}%` : '0%'}
            </div>
            <p>Successful payouts</p>
          </div>
        </div>
      </div>

      {/* Analytics Summary */}
      {analytics && (
        <div className="analytics-summary">
          <div className="summary-card">
            <h3>Period Summary</h3>
            <div className="summary-stats">
              <div className="stat">
                <span className="label">Average Amount:</span>
                <span className="value">{formatCurrency(analytics.avgAmount, 'usd')}</span>
              </div>
              <div className="stat">
                <span className="label">Total Transactions:</span>
                <span className="value">{analytics.totalCount}</span>
              </div>
              <div className="stat">
                <span className="label">Successful:</span>
                <span className="value">{analytics.statusBreakdown.paid}</span>
              </div>
              <div className="stat">
                <span className="label">Pending:</span>
                <span className="value">{analytics.statusBreakdown.pending}</span>
              </div>
              <div className="stat">
                <span className="label">Failed:</span>
                <span className="value">{analytics.statusBreakdown.failed}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderHistoryTab = () => (
    <div className="enhanced-payout-history">
      <div className="history-header">
        <div className="history-filters">
          <div className="search-box">
            <Search size={16} />
            <input 
              type="text" 
              placeholder="Search payouts..." 
              className="search-input"
            />
          </div>
          <select className="status-filter">
            <option value="">All Statuses</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="in_transit">In Transit</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <div className="history-actions">
          <button 
            onClick={() => handleExport('csv')}
            className="export-btn secondary"
          >
            <Download size={16} />
            Export
          </button>
        </div>
      </div>

      <div className="payout-table-container">
        <table className="payout-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Method</th>
              <th>Arrival Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {stripePayouts.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty-state">
                  <div className="empty-content">
                    <Send size={48} />
                    <h3>No payouts yet</h3>
                    <p>Your payouts will appear here once you start receiving payments.</p>
                  </div>
                </td>
              </tr>
            ) : (
              stripePayouts.map((payout) => (
                <tr key={payout.id} className="payout-row">
                  <td>{formatDate(payout.created)}</td>
                  <td className="amount-cell">
                    {formatCurrency(payout.amount, payout.currency)}
                  </td>
                  <td className="status-cell">
                    <div className="status-badge">
                      {getStatusIcon(payout.status)}
                      <span className={`status-text ${payout.status}`}>
                        {payout.status.replace('_', ' ')}
                      </span>
                    </div>
                  </td>
                  <td className="method-cell">
                    <span className={`method-badge ${payout.type}`}>
                      {payout.type === 'bank_account' ? 'Bank Transfer' : 'Card'}
                    </span>
                  </td>
                  <td>{formatDate(payout.arrival_date)}</td>
                  <td className="actions-cell">
                    <button className="view-btn">
                      <Eye size={14} />
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderSettingsTab = () => (
    <div className="payout-settings">
      <div className="settings-section">
        <h3>Payout Schedule</h3>
        <p>Configure how and when you receive payouts from Stripe.</p>
        <button className="stripe-settings-btn">
          <ExternalLink size={16} />
          Manage in Stripe Dashboard
        </button>
      </div>

      <div className="settings-section">
        <h3>Bank Account</h3>
        <p>Update your bank account information for payouts.</p>
        <button className="stripe-settings-btn">
          <ExternalLink size={16} />
          Update Bank Account
        </button>
      </div>

      <div className="settings-section">
        <h3>Notifications</h3>
        <p>Get notified about payout status changes.</p>
        <div className="notification-options">
          <label className="checkbox-label">
            <input type="checkbox" defaultChecked />
            Email notifications for successful payouts
          </label>
          <label className="checkbox-label">
            <input type="checkbox" defaultChecked />
            Email notifications for failed payouts
          </label>
        </div>
      </div>
    </div>
  );

  return (
    <div className="enhanced-payouts-tab">
      {error && (
        <div className="error-banner">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button onClick={() => setError('')} className="dismiss-btn">×</button>
        </div>
      )}

      <div className="tab-header">
        <div className="header-content">
          <h1>Payouts</h1>
          <p>Track your Stripe payouts and analytics</p>
        </div>
        <div className="tab-nav">
          <button 
            className={`tab-btn ${activeSubTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('overview')}
          >
            <BarChart3 size={16} />
            Overview
          </button>
          <button 
            className={`tab-btn ${activeSubTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('history')}
          >
            <Calendar size={16} />
            History
          </button>
          <button 
            className={`tab-btn ${activeSubTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('settings')}
          >
            <Settings size={16} />
            Settings
          </button>
        </div>
      </div>

      <div className="tab-content">
        {activeSubTab === 'overview' && renderOverviewTab()}
        {activeSubTab === 'history' && renderHistoryTab()}
        {activeSubTab === 'settings' && renderSettingsTab()}
      </div>
    </div>
  );
}