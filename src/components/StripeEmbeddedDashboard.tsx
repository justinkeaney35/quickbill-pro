import React, { useState, useEffect } from 'react';
import { loadConnectAndInitialize } from '@stripe/connect-js';
import {
  ConnectComponentsProvider,
  ConnectPayments,
  ConnectPayouts,
  ConnectBalances,
  ConnectAccountManagement,
  ConnectNotificationBanner,
  ConnectDocuments,
} from '@stripe/react-connect-js';
import { 
  CreditCard, 
  DollarSign, 
  TrendingUp, 
  Settings, 
  Bell, 
  FileText,
  Loader,
  AlertCircle
} from 'lucide-react';

interface StripeEmbeddedDashboardProps {
  onClose: () => void;
  connectedAccountId: string;
  fullPage?: boolean;
}

type TabType = 'payments' | 'payouts' | 'balances' | 'documents' | 'settings';

interface Tab {
  id: TabType;
  label: string;
  icon: React.ReactNode;
  description: string;
}

export default function StripeEmbeddedDashboard({ 
  onClose, 
  connectedAccountId,
  fullPage = false
}: StripeEmbeddedDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabType>('payments');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [stripeConnectInstance, setStripeConnectInstance] = useState<any>(null);

  const tabs: Tab[] = [
    {
      id: 'payments',
      label: 'Payments',
      icon: <CreditCard size={20} />,
      description: 'View and manage all your payments'
    },
    {
      id: 'balances',
      label: 'Balances',
      icon: <DollarSign size={20} />,
      description: 'Check your current balance and pending funds'
    },
    {
      id: 'payouts',
      label: 'Payouts',
      icon: <TrendingUp size={20} />,
      description: 'Track payouts to your bank account'
    },
    {
      id: 'documents',
      label: 'Documents',
      icon: <FileText size={20} />,
      description: 'Access important tax and legal documents'
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <Settings size={20} />,
      description: 'Manage your account settings'
    }
  ];

  useEffect(() => {
    const initializeStripeConnect = async () => {
      try {
        console.log('Initializing Stripe Connect for account:', connectedAccountId);
        
        // Create account session once
        const response = await fetch(`${process.env.REACT_APP_API_URL}/api/connect/account-session`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('quickbill_token')}`
          },
          body: JSON.stringify({ account: connectedAccountId })
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error('Account session API error:', errorData);
          throw new Error(errorData.error || 'Failed to create account session');
        }

        const { client_secret } = await response.json();
        console.log('Account session created successfully');

        // Store client secret and use it for fetchClientSecret
        const fetchClientSecret = async () => {
          console.log('Returning stored client secret');
          return client_secret;
        };

        const instance = await loadConnectAndInitialize({
          publishableKey: process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY!,
          fetchClientSecret: fetchClientSecret,
          appearance: {
            overlays: 'dialog',
            variables: {
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              colorPrimary: '#667eea',
              colorBackground: '#ffffff',
              colorText: '#1a202c',
              colorDanger: '#e53e3e',
              spacingUnit: '6px',
              borderRadius: '8px',
            },
          },
          locale: 'en-US',
        });

        console.log('Stripe Connect instance initialized successfully');
        setStripeConnectInstance(instance);
        setLoading(false);
      } catch (err: any) {
        console.error('Error initializing Stripe Connect:', err);
        setError(err.message || 'Failed to initialize dashboard');
        setLoading(false);
      }
    };

    if (connectedAccountId) {
      initializeStripeConnect();
    }
  }, [connectedAccountId]);

  const handleTabChange = (tabId: TabType) => {
    setActiveTab(tabId);
  };

  const renderTabContent = () => {
    if (!stripeConnectInstance) return null;

    const commonProps = {
      onLoadError: (error: any) => {
        console.error(`${error.elementTagName} failed to load:`, error.error);
      },
      onLoaderStart: () => {
        console.log('Component started loading');
      }
    };

    switch (activeTab) {
      case 'payments':
        return <ConnectPayments {...commonProps} />;
      case 'balances':
        return <ConnectBalances {...commonProps} />;
      case 'payouts':
        return <ConnectPayouts {...commonProps} />;
      case 'documents':
        return <ConnectDocuments {...commonProps} />;
      case 'settings':
        return <ConnectAccountManagement {...commonProps} />;
      default:
        return <ConnectPayments {...commonProps} />;
    }
  };

  if (loading) {
    const content = (
      <div className="loading-container">
        <Loader className="loading-spinner" size={40} />
        <h3>Loading Dashboard...</h3>
        <p>Initializing your Stripe payment dashboard</p>
      </div>
    );

    if (fullPage) {
      return <div className="stripe-dashboard-fullpage">{content}</div>;
    }
    
    return (
      <div className="stripe-dashboard-overlay">
        <div className="stripe-dashboard-modal">{content}</div>
      </div>
    );
  }

  if (error) {
    const content = (
      <div className="error-container">
        <AlertCircle className="error-icon" size={40} />
        <h3>Dashboard Error</h3>
        <p>{error}</p>
        <div className="error-actions">
          {!fullPage && (
            <button onClick={onClose} className="secondary-btn">
              Close
            </button>
          )}
          <button 
            onClick={() => {
              setError('');
              setLoading(true);
              // Retry initialization
              const retryInit = async () => {
                try {
                  const response = await fetch(`${process.env.REACT_APP_API_URL}/api/connect/account-session`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${localStorage.getItem('quickbill_token')}`
                    },
                    body: JSON.stringify({ account: connectedAccountId })
                  });

                  if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to create account session');
                  }

                  const { client_secret } = await response.json();
                  const fetchClientSecret = async () => client_secret;

                  const instance = await loadConnectAndInitialize({
                    publishableKey: process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY!,
                    fetchClientSecret: fetchClientSecret,
                    appearance: {
                      overlays: 'dialog',
                      variables: {
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                        colorPrimary: '#667eea',
                        colorBackground: '#ffffff',
                        colorText: '#1a202c',
                        colorDanger: '#e53e3e',
                        spacingUnit: '6px',
                        borderRadius: '8px',
                      },
                    },
                    locale: 'en-US',
                  });

                  setStripeConnectInstance(instance);
                  setLoading(false);
                } catch (err: any) {
                  console.error('Retry failed:', err);
                  setError(err.message || 'Failed to initialize dashboard');
                  setLoading(false);
                }
              };
              retryInit();
            }} 
            className="primary-btn"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );

    if (fullPage) {
      return <div className="stripe-dashboard-fullpage">{content}</div>;
    }

    return (
      <div className="stripe-dashboard-overlay">
        <div className="stripe-dashboard-modal">{content}</div>
      </div>
    );
  }

  const dashboardContent = (
    <>
      {!fullPage && (
        <div className="dashboard-header">
          <div className="header-content">
            <h2>Payment Dashboard</h2>
            <p>Manage your payments, payouts, and account settings</p>
          </div>
          <button onClick={onClose} className="close-btn">
            ×
          </button>
        </div>
      )}

      <ConnectComponentsProvider connectInstance={stripeConnectInstance}>
        <ConnectNotificationBanner />
        
        <div className="dashboard-content">
          <div className="dashboard-sidebar">
            <nav className="dashboard-nav">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`nav-tab ${activeTab === tab.id ? 'active' : ''}`}
                >
                  <div className="tab-icon">{tab.icon}</div>
                  <div className="tab-content">
                    <span className="tab-label">{tab.label}</span>
                    <span className="tab-description">{tab.description}</span>
                  </div>
                </button>
              ))}
            </nav>
          </div>

          <div className="dashboard-main">
            <div className="tab-header">
              <div className="tab-info">
                <h3>{tabs.find(tab => tab.id === activeTab)?.label}</h3>
                <p>{tabs.find(tab => tab.id === activeTab)?.description}</p>
              </div>
            </div>
            
            <div className="embedded-component-container">
              {renderTabContent()}
            </div>
          </div>
        </div>
      </ConnectComponentsProvider>
    </>
  );

  if (fullPage) {
    return <div className="stripe-dashboard-fullpage">{dashboardContent}</div>;
  }

  return (
    <div className="stripe-dashboard-overlay">
      <div className="stripe-dashboard-modal">{dashboardContent}</div>
    </div>
  );
}