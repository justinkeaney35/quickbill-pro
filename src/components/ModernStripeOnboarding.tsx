import React, { useState } from "react";
import { CreditCard, CheckCircle } from "lucide-react";
import { useStripeConnect } from "../hooks/useStripeConnect";
import {
  ConnectAccountOnboarding,
  ConnectComponentsProvider,
} from "@stripe/react-connect-js";
import { connectAPI } from "../utils/api";

interface ModernStripeOnboardingProps {
  onClose: () => void;
}

export default function ModernStripeOnboarding({ onClose }: ModernStripeOnboardingProps) {
  const [accountCreatePending, setAccountCreatePending] = useState(false);
  const [onboardingExited, setOnboardingExited] = useState(false);
  const [error, setError] = useState(false);
  const [connectedAccountId, setConnectedAccountId] = useState<string>();
  const stripeConnectInstance = useStripeConnect(connectedAccountId);

  const handleCreateAccount = async () => {
    setAccountCreatePending(true);
    setError(false);
    
    try {
      const response = await connectAPI.createAccount();
      const { account, error: apiError } = response;

      if (account) {
        setConnectedAccountId(account);
      }

      if (apiError) {
        setError(true);
      }
    } catch (err) {
      console.error('Account creation error:', err);
      setError(true);
    } finally {
      setAccountCreatePending(false);
    }
  };

  const handleOnboardingExit = () => {
    setOnboardingExited(true);
    // Refresh the page to update Connect status
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  };

  const handleEmbeddedError = (error: any) => {
    console.error('Stripe embedded component error:', error);
    setError(true);
  };

  return (
    <div className="modal-overlay">
      <div className="modal stripe-onboarding-modal">
        <div className="modal-header">
          <h2>Setup Payment Processing</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        
        <div className="setup-content">
          {!connectedAccountId && (
            <>
              <div className="setup-icon">
                <CreditCard className="icon" />
              </div>
              <h3>Ready to Start Accepting Payments?</h3>
              <p>Connect your payment processing account to start receiving payments directly on your invoices.</p>
              
              <div className="benefits-list">
                <div className="benefit-item">
                  <CheckCircle className="benefit-icon" />
                  <span>Accept credit cards and bank transfers</span>
                </div>
                <div className="benefit-item">
                  <CheckCircle className="benefit-icon" />
                  <span>Automatic payment notifications</span>
                </div>
                <div className="benefit-item">
                  <CheckCircle className="benefit-icon" />
                  <span>Secure PCI-compliant processing</span>
                </div>
                <div className="benefit-item">
                  <CheckCircle className="benefit-icon" />
                  <span>Instant payout setup</span>
                </div>
              </div>
            </>
          )}

          {connectedAccountId && !stripeConnectInstance && (
            <div className="loading-state">
              <h3>Loading Payment Setup...</h3>
              <p>Preparing your secure onboarding experience...</p>
            </div>
          )}

          {!accountCreatePending && !connectedAccountId && (
            <button 
              className="stripe-connect-btn"
              onClick={handleCreateAccount}
            >
              Get Started
            </button>
          )}

          {accountCreatePending && (
            <div className="loading-state">
              <p>Creating your payment account...</p>
            </div>
          )}

          {stripeConnectInstance && (
            <div className="embedded-onboarding">
              <ConnectComponentsProvider connectInstance={stripeConnectInstance}>
                <ConnectAccountOnboarding
                  onExit={handleOnboardingExit}
                />
              </ConnectComponentsProvider>
            </div>
          )}

          {error && (
            <div className="error-state">
              <p className="error-message">Something went wrong! Please try again.</p>
            </div>
          )}

          {onboardingExited && (
            <div className="success-state">
              <CheckCircle className="success-icon" />
              <h3>Setup Complete!</h3>
              <p>Your payment processing has been configured successfully.</p>
            </div>
          )}

          {connectedAccountId && (
            <div className="dev-info">
              <p><strong>Account ID:</strong> <code>{connectedAccountId}</code></p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}