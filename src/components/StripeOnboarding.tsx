import React, { useState } from 'react';
import { CreditCard, Check, CheckCircle } from 'lucide-react';
import { connectAPI } from '../utils/api';

interface StripeOnboardingProps {
  onClose: () => void;
}

export default function StripeOnboarding({ onClose }: StripeOnboardingProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [accountId, setAccountId] = useState<string>('');
  const [businessInfo, setBusinessInfo] = useState({
    businessType: 'individual' as 'individual' | 'company',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    companyName: '',
    taxId: '',
    dob: { day: '', month: '', year: '' },
    address: {
      line1: '',
      line2: '',
      city: '',
      state: '',
      postal_code: ''
    }
  });
  const [bankInfo, setBankInfo] = useState({
    routingNumber: '',
    accountNumber: '',
    accountHolderType: 'individual' as 'individual' | 'company'
  });

  const handleCreateAccount = async () => {
    setLoading(true);
    try {
      const result = await connectAPI.createAccount();
      setAccountId(result.accountId);
      setStep(2);
    } catch (error) {
      console.error('Account creation error:', error);
      alert('Failed to create account. Please try again.');
    }
    setLoading(false);
  };

  const handleBusinessInfoSubmit = async () => {
    setLoading(true);
    try {
      await connectAPI.updateBusinessInfo(accountId, businessInfo);
      setStep(3);
    } catch (error) {
      console.error('Business info error:', error);
      alert('Failed to update business information. Please try again.');
    }
    setLoading(false);
  };

  const handleBankInfoSubmit = async () => {
    setLoading(true);
    try {
      await connectAPI.updateBankAccount(accountId, bankInfo);
      alert('Stripe setup completed successfully!');
      onClose();
      window.location.reload(); // Refresh to update Connect status
    } catch (error) {
      console.error('Bank info error:', error);
      alert('Failed to add bank account. Please try again.');
    }
    setLoading(false);
  };

  return (
    <div className="modal-overlay">
      <div className="modal stripe-onboarding-modal">
        <div className="modal-header">
          <h2>Setup Payment Processing - Step {step} of 3</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        
        <div className="step-indicator">
          <div className={`step ${step >= 1 ? 'active' : ''}`}>1. Create Account</div>
          <div className={`step ${step >= 2 ? 'active' : ''}`}>2. Business Info</div>
          <div className={`step ${step >= 3 ? 'active' : ''}`}>3. Bank Account</div>
        </div>

        {step === 1 && (
          <div className="setup-content">
            <div className="setup-icon">
              <CreditCard className="icon" />
            </div>
            <h3>Create Your Payment Account</h3>
            <p>We'll create a secure Stripe Connect account for your business to accept payments.</p>
            
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
                <span>Secure payment processing</span>
              </div>
            </div>
            
            <button 
              className="stripe-connect-btn"
              onClick={handleCreateAccount}
              disabled={loading}
            >
              {loading ? 'Creating Account...' : 'Create Payment Account'}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="setup-content">
            <h3>Business Information</h3>
            <p>Tell us about your business to comply with payment regulations.</p>
            
            <div className="form-grid">
              <div className="form-group">
                <label>Business Type</label>
                <select 
                  value={businessInfo.businessType}
                  onChange={(e) => setBusinessInfo({...businessInfo, businessType: e.target.value as 'individual' | 'company'})}
                >
                  <option value="individual">Individual</option>
                  <option value="company">Company</option>
                </select>
              </div>

              {businessInfo.businessType === 'individual' ? (
                <>
                  <div className="form-group">
                    <label>First Name</label>
                    <input 
                      type="text"
                      value={businessInfo.firstName}
                      onChange={(e) => setBusinessInfo({...businessInfo, firstName: e.target.value})}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Last Name</label>
                    <input 
                      type="text"
                      value={businessInfo.lastName}
                      onChange={(e) => setBusinessInfo({...businessInfo, lastName: e.target.value})}
                      required
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="form-group">
                    <label>Company Name</label>
                    <input 
                      type="text"
                      value={businessInfo.companyName}
                      onChange={(e) => setBusinessInfo({...businessInfo, companyName: e.target.value})}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Tax ID (Optional)</label>
                    <input 
                      type="text"
                      value={businessInfo.taxId}
                      onChange={(e) => setBusinessInfo({...businessInfo, taxId: e.target.value})}
                    />
                  </div>
                </>
              )}

              <div className="form-group">
                <label>Email</label>
                <input 
                  type="email"
                  value={businessInfo.email}
                  onChange={(e) => setBusinessInfo({...businessInfo, email: e.target.value})}
                  required
                />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input 
                  type="tel"
                  value={businessInfo.phone}
                  onChange={(e) => setBusinessInfo({...businessInfo, phone: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label>Address Line 1</label>
                <input 
                  type="text"
                  value={businessInfo.address.line1}
                  onChange={(e) => setBusinessInfo({...businessInfo, address: {...businessInfo.address, line1: e.target.value}})}
                  required
                />
              </div>
              <div className="form-group">
                <label>City</label>
                <input 
                  type="text"
                  value={businessInfo.address.city}
                  onChange={(e) => setBusinessInfo({...businessInfo, address: {...businessInfo.address, city: e.target.value}})}
                  required
                />
              </div>
              <div className="form-group">
                <label>State</label>
                <input 
                  type="text"
                  value={businessInfo.address.state}
                  onChange={(e) => setBusinessInfo({...businessInfo, address: {...businessInfo.address, state: e.target.value}})}
                  required
                />
              </div>
              <div className="form-group">
                <label>ZIP Code</label>
                <input 
                  type="text"
                  value={businessInfo.address.postal_code}
                  onChange={(e) => setBusinessInfo({...businessInfo, address: {...businessInfo.address, postal_code: e.target.value}})}
                  required
                />
              </div>
            </div>
            
            <button 
              className="stripe-connect-btn"
              onClick={handleBusinessInfoSubmit}
              disabled={loading}
            >
              {loading ? 'Saving...' : 'Continue'}
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="setup-content">
            <h3>Bank Account Information</h3>
            <p>Add your bank account to receive payments.</p>
            
            <div className="form-grid">
              <div className="form-group">
                <label>Routing Number</label>
                <input 
                  type="text"
                  value={bankInfo.routingNumber}
                  onChange={(e) => setBankInfo({...bankInfo, routingNumber: e.target.value})}
                  placeholder="9 digits"
                  required
                />
              </div>
              <div className="form-group">
                <label>Account Number</label>
                <input 
                  type="text"
                  value={bankInfo.accountNumber}
                  onChange={(e) => setBankInfo({...bankInfo, accountNumber: e.target.value})}
                  required
                />
              </div>
              <div className="form-group">
                <label>Account Holder Type</label>
                <select 
                  value={bankInfo.accountHolderType}
                  onChange={(e) => setBankInfo({...bankInfo, accountHolderType: e.target.value as 'individual' | 'company'})}
                >
                  <option value="individual">Individual</option>
                  <option value="company">Company</option>
                </select>
              </div>
            </div>
            
            <button 
              className="stripe-connect-btn"
              onClick={handleBankInfoSubmit}
              disabled={loading}
            >
              {loading ? 'Setting up...' : 'Complete Setup'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}