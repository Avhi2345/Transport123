import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

interface Vehicle {
  id: number;
  name: string;
  vehicle_number: string;
  vehicle_type: string;
  capacity: number;
  driver_name: string;
  driver_contact: string;
  is_active: boolean;
  rc_url?: string | null;
  vehicle_photo_url?: string | null;
  verification_status?: string | null;
}

interface OperatorProfile {
  id: number;
  user_id: number;
  operator_name: string;
  phone: string;
  address: string;
  upi_id: string;
  bank_details: string;
  verification_status: string;
  licence_url?: string | null;
  rc_url?: string | null;
  vehicle_photo_url?: string | null;
  admin_notes?: string | null;
  submitted_at?: string | null;
  user: {
    email: string;
    first_name: string;
    last_name: string;
  };
  vehicles: Vehicle[];
}

interface AdminDashboardProps {
  onBackToSearch: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBackToSearch }) => {
  const [profiles, setProfiles] = useState<OperatorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState<OperatorProfile | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'pending' | 'approved' | 'correction_requested'>('all');

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('operator/admin/profiles/');
      setProfiles(res.data);
      setSelectedProfile((currentSelected) => {
        if (!currentSelected) return null;
        const updated = res.data.find((p: OperatorProfile) => p.user_id === currentSelected.user_id);
        return updated || null;
      });
    } catch (err) {
      console.error(err);
      alert('Failed to fetch operator profiles for admin review');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      await Promise.resolve();
      if (mounted) {
        fetchProfiles();
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [fetchProfiles]);

  const handleReview = async (operatorId: number, status: 'approved' | 'correction_requested') => {
    if (status === 'correction_requested' && !notes.trim()) {
      alert('Please specify correction notes explaining what is wrong.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('operator/admin/review/', {
        operator_id: operatorId,
        status,
        admin_notes: status === 'correction_requested' ? notes : undefined
      });
      alert(`Operator account status successfully updated to: ${status}`);
      setNotes('');
      await fetchProfiles();
    } catch (err) {
      console.error(err);
      const error = err as { response?: { data?: { error?: string } }; message?: string };
      alert(`Review action failed: ${error.response?.data?.error || error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredProfiles = profiles.filter((p) => {
    if (activeFilter === 'all') return true;
    return p.verification_status === activeFilter;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return '#34d399';
      case 'pending': return '#fbbf24';
      case 'correction_requested': return '#f87171';
      default: return 'var(--text-muted)';
    }
  };

  const getDocFullUrl = (url?: string | null) => {
    if (!url) return '';
    return `${api.defaults.baseURL?.replace('/api/transport/', '')}${url}`;
  };

  return (
    <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '30px', paddingBottom: '40px' }}>
      
      {/* Header */}
      <div className="responsive-flex-header">
        <div>
          <h1 className="gradient-text" style={{ fontSize: '2.25rem', marginBottom: '4px' }}>Admin Review Board</h1>
          <p style={{ color: 'var(--text-muted)' }}>Compliance & Document Verification Dashboard</p>
        </div>
        <button onClick={onBackToSearch} className="btn btn-secondary btn-inline">
          ← Booking Terminal
        </button>
      </div>

      {/* Main Grid */}
      <div className="admin-split-layout">
        
        {/* Left Side: Profiles List */}
        <div className={`glass-panel admin-list-col ${selectedProfile ? 'hidden-mobile' : ''}`} style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Operators</h3>
            <button onClick={fetchProfiles} className="btn btn-secondary btn-inline" style={{ padding: '6px 12px', fontSize: '0.8rem', borderRadius: '6px' }}>
              Refresh
            </button>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
            {(['all', 'pending', 'approved', 'correction_requested'] as const).map((filter) => (
              <span
                key={filter}
                onClick={() => setActiveFilter(filter)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  background: activeFilter === filter ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                  color: activeFilter === filter ? '#fff' : 'var(--text-muted)'
                }}
              >
                {filter.replace('_', ' ')}
              </span>
            ))}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading operator profiles...</div>
          ) : filteredProfiles.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              No operator profiles found.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filteredProfiles.map((profile) => (
                <div
                  key={profile.user_id}
                  onClick={() => setSelectedProfile(profile)}
                  style={{
                    padding: '16px',
                    borderRadius: '10px',
                    border: '1px solid var(--border-color)',
                    background: selectedProfile?.user_id === profile.user_id ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.01)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', gap: '12px', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '0.95rem' }}>{profile.operator_name}</strong>
                    <span style={{
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      textTransform: 'uppercase',
                      color: getStatusColor(profile.verification_status),
                      background: 'rgba(255,255,255,0.02)',
                      border: `1px solid ${getStatusColor(profile.verification_status)}`
                    }}>
                      {profile.verification_status}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Email: {profile.user.email}
                  </div>
                  {profile.submitted_at && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Submitted: {new Date(profile.submitted_at).toLocaleString()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Side: Selected Profile Review Panel */}
        <div className={`admin-detail-col ${!selectedProfile ? 'hidden-mobile' : ''}`} style={{ flex: '1.5' }}>
          {selectedProfile ? (
            <div className="glass-panel" style={{ padding: '30px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              {/* Mobile Back Button */}
              <button 
                onClick={() => setSelectedProfile(null)} 
                className="btn btn-secondary admin-back-btn"
              >
                ← Back to Operators List
              </button>

              {/* Profile Details */}
              <div>
                <h3 className="gradient-text" style={{ fontSize: '1.5rem', marginBottom: '6px' }}>{selectedProfile.operator_name}</h3>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Status: </span>
                <span style={{ color: getStatusColor(selectedProfile.verification_status), fontWeight: 600, textTransform: 'uppercase', fontSize: '0.875rem' }}>
                  {selectedProfile.verification_status}
                </span>
                {selectedProfile.admin_notes && (
                  <p style={{ marginTop: '8px', padding: '10px', background: 'rgba(239,68,68,0.05)', borderRadius: '6px', color: '#f87171', fontSize: '0.85rem' }}>
                    <strong>Rejection Notes:</strong> {selectedProfile.admin_notes}
                  </p>
                )}
              </div>

              {/* Business Info */}
              <div className="business-info-grid" style={{ background: 'rgba(255,255,255,0.01)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                <div>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>Email Address</div>
                  <div>{selectedProfile.user.email}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>Phone Number</div>
                  <div>{selectedProfile.phone || 'N/A'}</div>
                </div>
                <div className="span-2">
                  <div style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>Business Address</div>
                  <div>{selectedProfile.address || 'N/A'}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>UPI ID</div>
                  <div style={{ color: 'var(--accent-primary)', fontWeight: 500 }}>{selectedProfile.upi_id || 'N/A'}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>Bank Credentials</div>
                  <div>{selectedProfile.bank_details || 'N/A'}</div>
                </div>
              </div>

              {/* Fleet Vehicles */}
              {selectedProfile.vehicles && selectedProfile.vehicles.length > 0 && (
                <div>
                  <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '14px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '6px' }}>Fleet Vehicles ({selectedProfile.vehicles.length})</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '20px' }}>
                    {selectedProfile.vehicles.map((vehicle) => (
                      <div key={vehicle.id} style={{ background: 'rgba(255,255,255,0.01)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '12px', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{vehicle.name} ({vehicle.vehicle_number})</span>
                          <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, background: (vehicle.verification_status || 'pending') === 'approved' ? 'rgba(16,185,129,0.1)' : (vehicle.verification_status || 'pending') === 'rejected' ? 'rgba(239,68,68,0.1)' : 'rgba(251,191,36,0.1)', color: (vehicle.verification_status || 'pending') === 'approved' ? '#34d399' : (vehicle.verification_status || 'pending') === 'rejected' ? '#f87171' : '#fbbf24' }}>
                              {(vehicle.verification_status || 'pending').toUpperCase()}
                            </span>
                            <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, background: vehicle.is_active ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)', color: vehicle.is_active ? '#34d399' : 'var(--text-muted)' }}>
                              {vehicle.is_active ? 'ACTIVE' : 'INACTIVE'}
                            </span>
                          </div>
                        </div>

                        <div className="responsive-grid-2" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '12px', gap: '10px' }}>
                          <div><strong>Type:</strong> <span style={{ textTransform: 'capitalize' }}>{vehicle.vehicle_type}</span></div>
                          <div><strong>Capacity:</strong> {vehicle.capacity} Seats</div>
                          <div><strong>Driver:</strong> {vehicle.driver_name}</div>
                          <div><strong>Driver Contact:</strong> {vehicle.driver_contact}</div>
                        </div>

                        {/* Document previews for individual vehicle */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px', marginTop: '10px', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '10px' }}>
                          <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>RC Document</div>
                            {vehicle.rc_url ? (
                              <a href={getDocFullUrl(vehicle.rc_url)} target="_blank" rel="noreferrer">
                                <img
                                  src={getDocFullUrl(vehicle.rc_url)}
                                  alt="RC Preview"
                                  style={{ width: '100%', maxHeight: '80px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                                />
                              </a>
                            ) : <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No RC uploaded</span>}
                          </div>
                          <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Vehicle Photo</div>
                            {vehicle.vehicle_photo_url ? (
                              <a href={getDocFullUrl(vehicle.vehicle_photo_url)} target="_blank" rel="noreferrer">
                                <img
                                  src={getDocFullUrl(vehicle.vehicle_photo_url)}
                                  alt="Vehicle Preview"
                                  style={{ width: '100%', maxHeight: '80px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                                />
                              </a>
                            ) : <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No Photo uploaded</span>}
                          </div>
                        </div>

                        {/* Admin Action for Vehicle */}
                        {(vehicle.verification_status || 'pending') !== 'approved' && (
                          <div style={{ display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'flex-end' }}>
                            <button
                              onClick={async () => {
                                try {
                                  await api.post('operator/admin/review-vehicle/', {
                                    vehicle_id: vehicle.id,
                                    status: 'approved'
                                  });
                                  alert('Vehicle approved successfully!');
                                  // Refresh profiles list and selection
                                  const response = await api.get('operator/admin/profiles/');
                                  setProfiles(response.data);
                                  const updatedProfile = response.data.find((p: any) => p.user_id === selectedProfile.user_id);
                                  if (updatedProfile) setSelectedProfile(updatedProfile);
                                } catch (err) {
                                  console.error(err);
                                  alert('Failed to approve vehicle');
                                }
                              }}
                              className="btn btn-primary btn-inline"
                              style={{ padding: '6px 12px', fontSize: '0.75rem', margin: 0, background: '#10b981', borderColor: '#10b981' }}
                            >
                              Approve Vehicle
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  await api.post('operator/admin/review-vehicle/', {
                                    vehicle_id: vehicle.id,
                                    status: 'rejected'
                                  });
                                  alert('Vehicle rejected successfully!');
                                  // Refresh profiles list and selection
                                  const response = await api.get('operator/admin/profiles/');
                                  setProfiles(response.data);
                                  const updatedProfile = response.data.find((p: any) => p.user_id === selectedProfile.user_id);
                                  if (updatedProfile) setSelectedProfile(updatedProfile);
                                } catch (err) {
                                  console.error(err);
                                  alert('Failed to reject vehicle');
                                }
                              }}
                              className="btn btn-secondary btn-inline"
                              style={{ padding: '6px 12px', fontSize: '0.75rem', margin: 0, color: '#f87171', borderColor: '#ef4444' }}
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Documents Lightbox/Previews */}
              <div>
                <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '12px' }}>Uploaded Verification Docs</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px' }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>Driving Licence</div>
                    {selectedProfile.licence_url ? (
                      <a href={getDocFullUrl(selectedProfile.licence_url)} target="_blank" rel="noreferrer">
                        <img
                          src={getDocFullUrl(selectedProfile.licence_url)}
                          alt="Licence Preview"
                          style={{ width: '100%', maxHeight: '110px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border-color)', cursor: 'zoom-in' }}
                        />
                      </a>
                    ) : <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Not Uploaded</span>}
                  </div>
                </div>
              </div>

              {/* Admin Actions */}
              {selectedProfile.verification_status === 'pending' && (
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <h4 style={{ fontSize: '1rem', fontWeight: 600 }}>Review Evaluation</h4>
                  
                  <div className="form-group">
                    <label>Correction Request Notes (Mandatory for rejection/correction requests)</label>
                    <textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="e.g. Please upload a higher resolution driving licence photo."
                      style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff', padding: '10px', fontSize: '0.875rem' }}
                    />
                  </div>

                  <div className="ticket-actions-flex">
                    <button
                      onClick={() => handleReview(selectedProfile.user_id, 'correction_requested')}
                      className="btn btn-secondary"
                      style={{ flex: 1, borderColor: '#ef4444', color: '#f87171' }}
                      disabled={submitting}
                    >
                      Request Correction
                    </button>
                    <button
                      onClick={() => handleReview(selectedProfile.user_id, 'approved')}
                      className="btn btn-primary"
                      style={{ flex: 1, background: '#10b981', border: 'none' }}
                      disabled={submitting}
                    >
                      {submitting ? 'Approving...' : 'Approve & Activate ✓'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="glass-panel" style={{ padding: '50px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Select an operator profile from the list to begin document review and verification.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
