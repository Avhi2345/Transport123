import React, { useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { api } from '../services/api';

interface AuthProps {
  onAuthSuccess: () => void;
}

export const Auth: React.FC<AuthProps> = ({ onAuthSuccess }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('traveler'); // traveler or transport_operator
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showOTP, setShowOTP] = useState(false);
  const [otpCode, setOtpCode] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    if (isSignUp) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        setError('Please enter a valid email address.');
        setLoading(false);
        return;
      }
    }

    if (isSignUp && !showOTP) {
      try {
        await api.post('otp/send', { email });
        setShowOTP(true);
        setMessage(`Verification code sent! Please check your email inbox: ${email}.`);
      } catch (err: any) {
        const errorMsg = err.response?.data?.error || err.message || 'Failed to send OTP code. Please verify SMTP settings.';
        setError(errorMsg);
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      if (isSignUp) {
        // First verify the OTP
        try {
          await api.post('otp/verify', { email, otp: otpCode });
        } catch (otpErr: any) {
          const errorMsg = otpErr.response?.data?.error || otpErr.message || 'Invalid or expired OTP. Please try again.';
          setError(errorMsg);
          setLoading(false);
          return;
        }

        // OTP verified successfully, now register on Supabase
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              role,
            },
            emailRedirectTo: `${window.location.origin}/`,
          },
        });
        if (signUpError) throw signUpError;
        setMessage('Your email has been verified and registered successfully!');
        setShowOTP(false);
      } else {
        // Admin Mock Login
        if ((email.trim() === 'Abhi' || email.trim() === 'admin@gmail.com' || email.trim() === 'abhi@gmail.com') && password === 'Abhi@1234') {
          const mockSession = {
            access_token: 'mock-admin-token',
            user: {
              email: 'abhi@gmail.com',
              user_metadata: { role: 'admin' }
            }
          };
          localStorage.setItem('mock_admin_session', JSON.stringify(mockSession));
          onAuthSuccess();
          return;
        }

        // Operator Mock Login
        if ((email.trim() === 'Operator' || email.trim() === 'operator@gmail.com') && password === 'Operator@1234') {
          const mockSession = {
            access_token: 'mock-operator-token',
            user: {
              email: 'operator@gmail.com',
              user_metadata: { role: 'transport_operator' }
            }
          };
          localStorage.setItem('mock_admin_session', JSON.stringify(mockSession));
          onAuthSuccess();
          return;
        }

        // Traveler Mock Login
        if ((email.trim() === 'Traveler' || email.trim() === 'traveler@gmail.com') && password === 'Traveler@1234') {
          const mockSession = {
            access_token: 'mock-traveler-token',
            user: {
              email: 'traveler@gmail.com',
              user_metadata: { role: 'traveler' }
            }
          };
          localStorage.setItem('mock_admin_session', JSON.stringify(mockSession));
          onAuthSuccess();
          return;
        }

        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
        onAuthSuccess();
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Authentication failed';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="glass-panel animate-fade-in auth-card">
        <h2 style={{ marginBottom: '24px', textAlign: 'center' }} className="gradient-text">
          {showOTP ? 'Email OTP Verification' : isSignUp ? 'Create your Account' : 'Welcome Back'}
        </h2>
        
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

        {showOTP ? (
          <form onSubmit={handleAuth}>
            <div className="form-group">
              <label>Enter 6-Digit Email OTP</label>
              <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginBottom: '14px', lineHeight: '1.4' }}>
                We sent a 6-digit verification OTP to <strong>{email}</strong>. Please enter the code from the email to verify and complete your sign up.
              </p>
              <input 
                type="text" 
                required 
                maxLength={6}
                pattern="\d{6}"
                value={otpCode} 
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))} 
                placeholder="123456"
                style={{ textAlign: 'center', fontSize: '1.5rem', letterSpacing: '8px', fontWeight: 'bold' }}
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }} disabled={loading}>
              {loading ? 'Verifying...' : 'Verify OTP & Sign Up'}
            </button>

            <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '0.875rem' }}>
              <span 
                onClick={() => setShowOTP(false)} 
                style={{ color: 'var(--accent-primary)', cursor: 'pointer', fontWeight: 500 }}
              >
                ← Back to Details
              </span>
            </div>
          </form>
        ) : (
          <form onSubmit={handleAuth}>
            <div className="form-group">
              <label>{isSignUp ? 'Email Address' : 'Email Address / Username'}</label>
              <input 
                type={isSignUp ? 'email' : 'text'} 
                required 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                placeholder={isSignUp ? 'e.g. user@gmail.com' : 'name@example.com or username'}
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <input 
                type="password" 
                required 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                placeholder="••••••••"
              />
            </div>

            {isSignUp && (
              <div className="form-group">
                <label>Account Role</label>
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="traveler">Traveler / Passenger</option>
                  <option value="transport_operator">Transport Operator / Driver</option>
                </select>
              </div>
            )}

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }} disabled={loading}>
              {loading ? 'Processing...' : isSignUp ? 'Sign Up' : 'Sign In'}
            </button>
          </form>
        )}

        {!showOTP && (
          <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <span 
              onClick={() => setIsSignUp(!isSignUp)} 
              style={{ color: 'var(--accent-primary)', cursor: 'pointer', fontWeight: 500 }}
            >
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
