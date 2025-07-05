import React, { useState, useEffect } from 'react';
import { Mail, Plus, Trash2, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';

interface EmailAccount {
  provider: string;
  email: string;
  created_at: string;
}

interface EmailSettingsProps {
  apiUrl: string;
  token: string;
}

const EmailSettings: React.FC<EmailSettingsProps> = ({ apiUrl, token }) => {
  const [emailAccounts, setEmailAccounts] = useState<EmailAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);

  useEffect(() => {
    fetchEmailAccounts();
  }, []);

  const fetchEmailAccounts = async () => {
    try {
      const response = await fetch(`${apiUrl}/user/email-accounts`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const accounts = await response.json();
        setEmailAccounts(accounts);
      } else {
        setError('Failed to fetch email accounts');
      }
    } catch (err) {
      setError('Error loading email accounts');
    } finally {
      setLoading(false);
    }
  };

  const connectProvider = async (provider: 'gmail' | 'outlook') => {
    try {
      setConnectingProvider(provider);
      const endpoint = provider === 'gmail' ? 'gmail' : 'outlook';
      
      const response = await fetch(`${apiUrl}/auth/${endpoint}/authorize`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const { authUrl } = await response.json();
        window.location.href = authUrl;
      } else {
        setError(`Failed to get ${provider} authorization URL`);
      }
    } catch (err) {
      setError(`Error connecting to ${provider}`);
    } finally {
      setConnectingProvider(null);
    }
  };

  const disconnectProvider = async (provider: string) => {
    try {
      const response = await fetch(`${apiUrl}/user/email-accounts/${provider}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        setEmailAccounts(accounts => accounts.filter(acc => acc.provider !== provider));
      } else {
        setError(`Failed to disconnect ${provider}`);
      }
    } catch (err) {
      setError(`Error disconnecting ${provider}`);
    }
  };

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'gmail':
        return '📧';
      case 'outlook':
        return '📮';
      default:
        return '✉️';
    }
  };

  const getProviderName = (provider: string) => {
    switch (provider) {
      case 'gmail':
        return 'Gmail / Google Workspace';
      case 'outlook':
        return 'Outlook / Office 365';
      default:
        return provider;
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="flex items-center space-x-3 mb-6">
          <Mail className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900">Email Settings</h2>
        </div>
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading email accounts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <div className="flex items-center space-x-3 mb-6">
        <Mail className="w-6 h-6 text-blue-600" />
        <h2 className="text-xl font-semibold text-gray-900">Email Settings</h2>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-400 rounded">
          <div className="flex">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <p className="ml-3 text-sm text-red-700">{error}</p>
            <button 
              onClick={() => setError(null)}
              className="ml-auto text-red-400 hover:text-red-600"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Info Banner */}
      <div className="mb-6 p-4 bg-blue-50 border-l-4 border-blue-400 rounded">
        <div className="flex">
          <CheckCircle className="w-5 h-5 text-blue-400 mt-0.5" />
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">Professional Email Sending</h3>
            <p className="text-sm text-blue-700 mt-1">
              Connect your business email account to send invoices from your actual business address 
              instead of a generic service email. Clients will recognize and trust emails from you!
            </p>
          </div>
        </div>
      </div>

      {/* Connected Accounts */}
      {emailAccounts.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Connected Email Accounts</h3>
          <div className="space-y-3">
            {emailAccounts.map((account) => (
              <div key={account.provider} className="flex items-center justify-between p-4 border rounded-lg bg-green-50 border-green-200">
                <div className="flex items-center space-x-3">
                  <span className="text-2xl">{getProviderIcon(account.provider)}</span>
                  <div>
                    <p className="font-medium text-gray-900">{account.email}</p>
                    <p className="text-sm text-gray-600">{getProviderName(account.provider)}</p>
                    <p className="text-xs text-gray-500">
                      Connected {new Date(account.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <button
                    onClick={() => disconnectProvider(account.provider)}
                    className="text-red-600 hover:text-red-800 p-1"
                    title="Disconnect account"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Connect New Accounts */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Connect Email Account</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Gmail Connect */}
          <button
            onClick={() => connectProvider('gmail')}
            disabled={connectingProvider === 'gmail' || emailAccounts.some(acc => acc.provider === 'gmail')}
            className="flex items-center justify-between p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center space-x-3">
              <span className="text-2xl">📧</span>
              <div className="text-left">
                <p className="font-medium text-gray-900">Gmail / Google Workspace</p>
                <p className="text-sm text-gray-600">Connect your Gmail or Google Workspace account</p>
              </div>
            </div>
            {connectingProvider === 'gmail' ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
            ) : emailAccounts.some(acc => acc.provider === 'gmail') ? (
              <CheckCircle className="w-5 h-5 text-green-600" />
            ) : (
              <Plus className="w-5 h-5 text-gray-400" />
            )}
          </button>

          {/* Outlook Connect */}
          <button
            onClick={() => connectProvider('outlook')}
            disabled={connectingProvider === 'outlook' || emailAccounts.some(acc => acc.provider === 'outlook')}
            className="flex items-center justify-between p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center space-x-3">
              <span className="text-2xl">📮</span>
              <div className="text-left">
                <p className="font-medium text-gray-900">Outlook / Office 365</p>
                <p className="text-sm text-gray-600">Connect your Outlook or Office 365 account</p>
              </div>
            </div>
            {connectingProvider === 'outlook' ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
            ) : emailAccounts.some(acc => acc.provider === 'outlook') ? (
              <CheckCircle className="w-5 h-5 text-green-600" />
            ) : (
              <Plus className="w-5 h-5 text-gray-400" />
            )}
          </button>
        </div>
      </div>

      {/* Help Text */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h4 className="font-medium text-gray-900 mb-2">How it works:</h4>
        <ol className="text-sm text-gray-600 space-y-1">
          <li>1. Click "Connect" for your email provider (Gmail or Outlook)</li>
          <li>2. Sign in to your email account and grant permissions</li>
          <li>3. Your invoices will now be sent from your business email address</li>
          <li>4. If connection fails, emails fall back to SMTP automatically</li>
        </ol>
      </div>
    </div>
  );
};

export default EmailSettings;