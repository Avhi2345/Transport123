import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

interface UserProfileModalProps {
  userRole: string;
  email: string;
  onClose: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ userRole, email, onClose }) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [upiId, setUpiId] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [prefRefundMethod, setPrefRefundMethod] = useState<'upi' | 'bank' | ''>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    api.get('profile/')
      .then((res) => {
        if (mounted) {
          setFirstName(res.data.first_name || '');
          setLastName(res.data.last_name || '');
          setPhone(res.data.phone || '');
          setUpiId(res.data.upi_id || '');
          setBankAccount(res.data.bank_account || '');
          setBankIfsc(res.data.bank_ifsc || '');
          setBankName(res.data.bank_name || '');
          setAccountHolder(res.data.account_holder || '');
          if (res.data.upi_id) {
            setPrefRefundMethod('upi');
          } else if (res.data.bank_account) {
            setPrefRefundMethod('bank');
          } else {
            setPrefRefundMethod('');
          }
        }
      })
      .catch((err) => {
        console.error('Failed to load profile details', err);
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api.put('profile/', {
        first_name: firstName,
        last_name: lastName,
        phone,
        upi_id: prefRefundMethod === 'upi' ? upiId : null,
        bank_account: prefRefundMethod === 'bank' ? bankAccount : null,
        bank_ifsc: prefRefundMethod === 'bank' ? bankIfsc : null,
        bank_name: prefRefundMethod === 'bank' ? bankName : null,
        account_holder: prefRefundMethod === 'bank' ? accountHolder : null,
      });
      setMessage('Profile updated successfully!');
      setTimeout(() => onClose(), 1200);
    } catch (err) {
      console.error(err);
      const error = err as { response?: { data?: { error?: string } }; message?: string };
      setError(error.response?.data?.error || error.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="glass-panel animate-fade-in modal-card">
        <button 
          onClick={onClose} 
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: '1.25rem',
            cursor: 'pointer',
            padding: '4px',
            lineHeight: 1
          }}
        >
          ✕
        </button>
        <h3 className="gradient-text" style={{ fontSize: '1.50rem', marginBottom: '6px', textAlign: 'center', fontWeight: 600 }}>User Profile</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.825rem', textAlign: 'center', marginBottom: '24px' }}>
          View and update your personal details
        </p>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', color: '#f87171', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        {message && (
          <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', color: '#34d399', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.875rem' }}>
            {message}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>Loading profile...</div>
        ) : (
          <form onSubmit={handleSave}>
            <div className="form-group">
              <label>Email Address</label>
              <input type="text" readOnly disabled value={email} style={{ opacity: 0.6, cursor: 'not-allowed' }} />
            </div>

            <div className="form-group">
              <label>Account Role</label>
              <input type="text" readOnly disabled value={userRole === 'admin' ? 'Administrator' : 'Traveler'} style={{ opacity: 0.6, cursor: 'not-allowed', textTransform: 'capitalize' }} />
            </div>

            <div className="responsive-grid-2">
              <div className="form-group">
                <label>First Name</label>
                <input 
                  type="text" 
                  value={firstName} 
                  onChange={(e) => setFirstName(e.target.value)} 
                  placeholder="First name"
                />
              </div>
              <div className="form-group">
                <label>Last Name</label>
                <input 
                  type="text" 
                  value={lastName} 
                  onChange={(e) => setLastName(e.target.value)} 
                  placeholder="Last name"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Phone Number</label>
              <input 
                type="text" 
                value={phone} 
                onChange={(e) => setPhone(e.target.value)} 
                placeholder="Phone number"
              />
            </div>

            <div style={{ marginTop: '20px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px' }}>
              <h4 style={{ fontSize: '0.95rem', marginBottom: '12px', fontWeight: 600, color: 'var(--accent-primary)' }}>Refund Payment Settings</h4>
              
              <div className="form-group">
                <label>Preferred Refund Method</label>
                <select 
                  value={prefRefundMethod} 
                  onChange={(e) => setPrefRefundMethod(e.target.value as 'upi' | 'bank' | '')}
                >
                  <option value="">Not Configured</option>
                  <option value="upi">UPI ID (GooglePay, PhonePe, etc.)</option>
                  <option value="bank">Direct Bank Transfer</option>
                </select>
              </div>

              {prefRefundMethod === 'upi' && (
                <div className="form-group animate-fade-in">
                  <label>UPI ID (e.g. username@bank)</label>
                  <input 
                    type="text" 
                    value={upiId} 
                    onChange={(e) => setUpiId(e.target.value)} 
                    placeholder="e.g. name@upi"
                  />
                </div>
              )}

              {prefRefundMethod === 'bank' && (
                <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '15px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Account Holder Name</label>
                    <input 
                      type="text" 
                      value={accountHolder} 
                      onChange={(e) => setAccountHolder(e.target.value)} 
                      placeholder="Holder Name"
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Bank Account Number</label>
                    <input 
                      type="text" 
                      value={bankAccount} 
                      onChange={(e) => setBankAccount(e.target.value)} 
                      placeholder="Account Number"
                    />
                  </div>
                  <div className="responsive-grid-2">
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>IFSC Code</label>
                      <input 
                        type="text" 
                        value={bankIfsc} 
                        onChange={(e) => setBankIfsc(e.target.value)} 
                        placeholder="IFSC Code"
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>Bank Name</label>
                      <input 
                        type="text" 
                        value={bankName} 
                        onChange={(e) => setBankName(e.target.value)} 
                        placeholder="Bank Name"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }} disabled={saving}>
              {saving ? 'Saving changes...' : 'Save Details'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
