import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './services/supabaseClient';
import { Auth } from './components/Auth';
import { Search } from './components/Search';
import { Booking } from './components/Booking';
import { Ticket } from './components/Ticket';
import { OperatorDashboard } from './components/OperatorDashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { UserProfileModal } from './components/UserProfileModal';
import type { Session } from '@supabase/supabase-js';

interface UserProfile {
  email: string;
  role: string;
}

interface Trip {
  id: number;
  full_route: string;
  card_date: string;
  card_time: string;
  available_seats: number;
  availability_percentage: number;
  segment_price: string;
  matched_from_stop: number;
  matched_to_stop: number;
  vehicle_details: {
    name: string;
    vehicle_type: string;
    vehicle_number: string;
    capacity: number;
  };
}

export const App: React.FC = () => {
  const [session, setSession] = useState<Session | null>(() => {
    const mockSessionStr = localStorage.getItem('mock_admin_session');
    if (mockSessionStr) {
      try {
        return JSON.parse(mockSessionStr);
      } catch {
        return null;
      }
    }
    return null;
  });
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
    const mockSessionStr = localStorage.getItem('mock_admin_session');
    if (mockSessionStr) {
      try {
        const mockSession = JSON.parse(mockSessionStr);
        const role = mockSession.user.user_metadata?.role || 'admin';
        return { email: mockSession.user.email, role };
      } catch {
        return null;
      }
    }
    return null;
  });
  const [loading, setLoading] = useState(() => {
    return !localStorage.getItem('mock_admin_session');
  });

  // Application routing views
  const [currentView, setCurrentView] = useState<'search' | 'booking' | 'ticket' | 'dashboard' | 'admin-dashboard'>(() => {
    const mockSessionStr = localStorage.getItem('mock_admin_session');
    if (mockSessionStr) {
      try {
        const mockSession = JSON.parse(mockSessionStr);
        const role = mockSession.user.user_metadata?.role || 'admin';
        if (role === 'transport_operator') return 'dashboard';
        if (role === 'admin') return 'admin-dashboard';
      } catch {
        // fallback
      }
    }
    return 'search';
  });
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [selectedBookingRef, setSelectedBookingRef] = useState<string>('');

  // Custom states for Operator Tab and Profile Modal
  const [operatorTab, setOperatorTab] = useState<'overview' | 'trips' | 'create-trip' | 'create-route' | 'create-vehicle' | 'edit-profile'>('overview');
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const extractProfile = useCallback((sessionObj: Session | null) => {
    if (sessionObj?.user) {
      const email = sessionObj.user.email || '';
      const role = (sessionObj.user.user_metadata?.role as string) || 'traveler';
      setUserProfile({ email, role });
      if (role === 'transport_operator') {
        setCurrentView('dashboard');
      } else if (role === 'admin') {
        setCurrentView('admin-dashboard');
      }
    } else {
      setUserProfile(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // Check initial session
    if (localStorage.getItem('mock_admin_session')) {
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      extractProfile(session);
    });

    // Listen to auth state transitions
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (localStorage.getItem('mock_admin_session')) return; // ignore if mock session is active
      setSession(session);
      extractProfile(session);
      if (!session) {
        setCurrentView('search');
      }
    });

    return () => subscription.unsubscribe();
  }, [extractProfile]);

  useEffect(() => {
    const loginTimeStr = localStorage.getItem('session_login_time');
    if (session && loginTimeStr) {
      const loginTime = parseInt(loginTimeStr, 10);
      const now = Date.now();
      if (now - loginTime > 24 * 60 * 60 * 1000) {
        handleSignOut();
        alert('Your session has expired (24 hours limit). Please sign in again.');
      }
    }
  }, [session]);



  const handleSignOut = async () => {
    localStorage.removeItem('session_login_time');
    if (localStorage.getItem('mock_admin_session')) {
      localStorage.removeItem('mock_admin_session');
      setSession(null);
      setUserProfile(null);
      setCurrentView('search');
      return;
    }
    await supabase.auth.signOut();
  };

  const handleProfileClick = () => {
    const isOp = userProfile?.role === 'transport_operator';
    if (isOp) {
      setOperatorTab('edit-profile');
      setCurrentView('dashboard');
    } else {
      setShowProfileModal(true);
    }
  };

  const handleSelectTrip = (trip: Trip) => {
    setSelectedTrip(trip);
    setCurrentView('booking');
  };

  const handleBookingSuccess = (bookingRef: string) => {
    setSelectedBookingRef(bookingRef);
    setCurrentView('ticket');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'var(--text-muted)' }}>
        Loading NE Explore...
      </div>
    );
  }

  // If not signed in, show Auth Screen
  if (!session) {
    return (
      <div className="auth-page-fullscreen">
        {/* Logo overlay on top of animated background */}
        <div className="auth-logo-overlay">
          <a href="#" className="logo" style={{ color: '#ffffff', fontSize: '1.5rem', letterSpacing: '-0.03em', fontWeight: 800, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.4rem' }}>🚌</span> NE Explore
          </a>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginTop: '4px' }}>India's Trusted Transport Platform</p>
        </div>
        <Auth onAuthSuccess={() => {
          localStorage.setItem('session_login_time', Date.now().toString());
          const mockSessionStr = localStorage.getItem('mock_admin_session');
          if (mockSessionStr) {
            const mockSession = JSON.parse(mockSessionStr);
            setSession(mockSession);
            const role = mockSession.user.user_metadata?.role || 'admin';
            setUserProfile({ email: mockSession.user.email, role });
            if (role === 'transport_operator') {
              setCurrentView('dashboard');
            } else if (role === 'admin') {
              setCurrentView('admin-dashboard');
            } else {
              setSelectedBookingRef('my-bookings');
              setCurrentView('ticket');
            }
          } else {
            supabase.auth.getSession().then(({ data: { session: sess } }) => {
              if (sess?.user) {
                const role = sess.user.user_metadata?.role || 'traveler';
                setUserProfile({ email: sess.user.email || '', role });
                if (role === 'transport_operator') {
                  setCurrentView('dashboard');
                } else if (role === 'admin') {
                  setCurrentView('admin-dashboard');
                } else {
                  setSelectedBookingRef('my-bookings');
                  setCurrentView('ticket');
                }
              }
            });
          }
        }} />
      </div>
    );
  }


  const isOperator = userProfile?.role === 'transport_operator';

  return (
    <div className="app-container">
      
      {/* App Header */}
      <header className="app-header" style={{ display: 'flex', flexDirection: 'column', gap: mobileMenuOpen ? '20px' : '0px', marginBottom: '40px' }}>
        
        {/* Header Top Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <a href="#" onClick={() => { setCurrentView('search'); setMobileMenuOpen(false); }} className="logo gradient-text">NE Explore</a>
          
          {/* Desktop Navigation */}
          <div className="desktop-nav">
            {userProfile?.role === 'traveler' && (
              <button 
                onClick={() => {
                  setSelectedBookingRef('my-bookings');
                  setCurrentView('ticket');
                }} 
                className="btn btn-secondary btn-inline" 
                style={{ padding: '8px 16px', fontSize: '0.85rem' }}
              >
                My Bookings
              </button>
            )}
            {userProfile?.role === 'admin' && (
              <button 
                onClick={() => setCurrentView(currentView === 'admin-dashboard' ? 'search' : 'admin-dashboard')} 
                className="btn btn-secondary btn-inline" 
                style={{ padding: '8px 16px', fontSize: '0.85rem', borderColor: 'var(--accent-secondary)', color: 'var(--accent-secondary)' }}
              >
                {currentView === 'admin-dashboard' ? 'Booking Console' : 'Admin Reviews'}
              </button>
            )}
            <div 
              onClick={handleProfileClick}
              style={{ textAlign: 'right', fontSize: '0.85rem', cursor: 'pointer', userSelect: 'none' }}
              title="Click to view/edit profile"
              className="profile-trigger"
            >
              <div style={{ color: 'var(--text-main)', fontWeight: 500 }}>{userProfile?.email}</div>
              <div style={{ color: 'var(--accent-primary)', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 600 }}>
                {userProfile?.role === 'admin' ? 'Administrator' : isOperator ? 'Fleet Operator' : 'Traveler'}
              </div>
            </div>
            <button onClick={handleSignOut} className="btn btn-secondary btn-inline" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
              Sign Out
            </button>
          </div>

          {/* Mobile Navigation Trigger */}
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)} 
            className="mobile-menu-btn"
            aria-label="Toggle navigation menu"
            style={{ margin: 0 }}
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>

        {/* Mobile Navigation Overlay Menu */}
        <div className={`mobile-menu-overlay ${mobileMenuOpen ? 'open' : ''}`}>
          <div 
            onClick={() => { handleProfileClick(); setMobileMenuOpen(false); }}
            style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '12px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', cursor: 'pointer', border: '1px solid var(--border-color)' }}
          >
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Signed in as</div>
            <div style={{ color: 'var(--text-main)', fontWeight: 600, fontSize: '0.95rem', wordBreak: 'break-all' }}>{userProfile?.email}</div>
            <div style={{ color: 'var(--accent-primary)', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 700, marginTop: '4px' }}>
              {userProfile?.role === 'admin' ? 'Administrator' : isOperator ? 'Fleet Operator' : 'Traveler'}
            </div>
          </div>

          {userProfile?.role === 'traveler' && (
            <button 
              onClick={() => {
                setSelectedBookingRef('my-bookings');
                setCurrentView('ticket');
                setMobileMenuOpen(false);
              }} 
              className="btn btn-secondary"
            >
              My Bookings
            </button>
          )}

          {userProfile?.role === 'admin' && (
            <button 
              onClick={() => { setCurrentView(currentView === 'admin-dashboard' ? 'search' : 'admin-dashboard'); setMobileMenuOpen(false); }} 
              className="btn btn-secondary" 
              style={{ borderColor: 'var(--accent-secondary)', color: 'var(--accent-secondary)' }}
            >
              {currentView === 'admin-dashboard' ? 'Booking Console' : 'Admin Reviews'}
            </button>
          )}

          <button onClick={() => { handleSignOut(); setMobileMenuOpen(false); }} className="btn btn-secondary">
            Sign Out
          </button>
        </div>
      </header>

      {/* View router */}
      {currentView === 'search' && (
        <Search 
          onSelectTrip={handleSelectTrip} 
          onGoToDashboard={() => {
            setOperatorTab('overview');
            setCurrentView('dashboard');
          }}
          isOperator={isOperator}
        />
      )}

      {currentView === 'booking' && selectedTrip && (
        <Booking 
          trip={selectedTrip} 
          onBookingSuccess={handleBookingSuccess} 
          onBack={() => setCurrentView('search')}
        />
      )}

      {currentView === 'ticket' && selectedBookingRef && (
        <Ticket 
          bookingRef={selectedBookingRef} 
          onBackToSearch={() => setCurrentView('search')}
        />
      )}

      {isOperator && (
        <div style={{ display: currentView === 'dashboard' ? 'block' : 'none' }}>
          <OperatorDashboard 
            onBackToSearch={() => setCurrentView('search')}
            initialTab={operatorTab}
          />
        </div>
      )}

      {currentView === 'admin-dashboard' && userProfile?.role === 'admin' && (
        <AdminDashboard 
          onBackToSearch={() => setCurrentView('search')}
        />
      )}

      {/* User Profile Modal */}
      {showProfileModal && userProfile && (
        <UserProfileModal
          userRole={userProfile.role}
          email={userProfile.email}
          onClose={() => setShowProfileModal(false)}
        />
      )}

    </div>
  );
};

export default App;
