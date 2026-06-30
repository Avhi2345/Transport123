import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

interface TrackingData {
  id: number;
  trip_id: number;
  current_latitude: number;
  current_longitude: number;
  current_speed: number;
  delay_minutes: number;
  last_updated: string;
  is_active?: boolean;
  next_stop_id?: number | null;
}

interface BookingDetails {
  booking_ref: string;
  passenger_name: string;
  passenger_phone: string;
  passenger_email: string;
  seat_number: string;
  booking_type_display: string;
  status_display: string;
  status: string;
  price: string;
  qr_code_data: string;
  trip_details: {
    id: number;
    status: string;
    full_route: string;
    card_date: string;
    card_time: string;
    departure_datetime: string;
    vehicle_details: {
      name: string;
      vehicle_number: string;
      driver_name: string;
      driver_contact: string;
    };
    route_details?: {
      stops: Array<{
        id: number;
        stop_name: string;
        stop_order: number;
        distance_from_start: number;
        price_from_source: number;
        arrival_time_offset: number;
        latitude?: number | null;
        longitude?: number | null;
      }>;
    } | null;
  };
  from_stop_details?: {
    id: number;
    stop_name: string;
  };
  to_stop_details?: {
    id: number;
    stop_name: string;
  };
  refund_method?: 'upi' | 'bank' | null;
  refund_upi_id?: string | null;
  refund_bank_account?: string | null;
  refund_bank_ifsc?: string | null;
  refund_bank_name?: string | null;
  refund_account_holder?: string | null;
}

interface TicketProps {
  bookingRef: string;
  onBackToSearch: () => void;
}

export const Ticket: React.FC<TicketProps> = ({ bookingRef, onBackToSearch }) => {
  const [bookingsList, setBookingsList] = useState<BookingDetails[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState(false);
  const [trackingData, setTrackingData] = useState<TrackingData | null>(null);
  const [trackingError, setTrackingError] = useState<string>('');
  const [showMap, setShowMap] = useState<boolean>(false);

  const booking = bookingsList[activeIdx] || null;

  // Refund & Cancellation states
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [refundMethod, setRefundMethod] = useState<'upi' | 'bank'>('upi');
  const [refundUpi, setRefundUpi] = useState('');
  const [refundAccount, setRefundAccount] = useState('');
  const [refundIfsc, setRefundIfsc] = useState('');
  const [refundBankName, setRefundBankName] = useState('');
  const [refundHolder, setRefundHolder] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const fetchBookingDetails = useCallback(async () => {
    setLoading(true);
    try {
      const refs = bookingRef.split(',').map((r: string) => r.trim()).filter(Boolean);
      const fetched: BookingDetails[] = [];
      for (const ref of refs) {
        const response = await api.get(`bookings/${ref}/`);
        fetched.push(response.data);
      }
      setBookingsList(fetched);
      setActiveIdx(0);
      setTrackingData(null); // Clear tracking data on reload
    } catch (err) {
      console.error(err);
      alert('Failed to retrieve ticket details');
    } finally {
      setLoading(false);
    }
  }, [bookingRef]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      await Promise.resolve();
      if (mounted) {
        fetchBookingDetails();
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [fetchBookingDetails]);

  useEffect(() => {
    if (showCancelForm) {
      api.get('profile/')
        .then((res) => {
          if (res.data.upi_id) {
            setRefundMethod('upi');
            setRefundUpi(res.data.upi_id);
          } else if (res.data.bank_account) {
            setRefundMethod('bank');
            setRefundAccount(res.data.bank_account || '');
            setRefundIfsc(res.data.bank_ifsc || '');
            setRefundBankName(res.data.bank_name || '');
            setRefundHolder(res.data.account_holder || (res.data.first_name + ' ' + res.data.last_name).trim() || '');
          } else {
            setRefundHolder((res.data.first_name + ' ' + res.data.last_name).trim() || '');
          }
        })
        .catch((err) => {
          console.error('Failed to load profile details for pre-filling cancellation form:', err);
        });
    }
  }, [showCancelForm]);

  useEffect(() => {
    if (!booking || booking.trip_details.status !== 'departed') {
      return;
    }

    const fetchTracking = async () => {
      try {
        const res = await api.get(`trips/${booking.trip_details.id}/tracking/`);
        setTrackingData(res.data);
        setTrackingError('');
      } catch (err) {
        console.error('Failed to retrieve live location', err);
        const errorMsg = (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Live tracking not active yet.';
        setTrackingError(errorMsg);
      }
    };

    fetchTracking();
    const interval = setInterval(fetchTracking, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [booking]);

  const handleDownloadPDF = () => {
    if (!booking) return;
    const url = `${api.defaults.baseURL}bookings/${booking.booking_ref}/pdf/`;
    window.open(url, '_blank');
  };

  const handleResendEmail = async () => {
    if (!booking) return;
    setResending(true);
    try {
      await api.post(`bookings/${booking.booking_ref}/resend/`);
      alert('Confirmation email resent successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to resend confirmation email. Make sure SMTP environment variables are configured.');
    } finally {
      setResending(false);
    }
  };

  const handleCancelBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!booking) return;

    if (!window.confirm("Are you sure you want to cancel this booking and request a refund?")) {
      return;
    }

    setCancelling(true);
    try {
      const payload: Record<string, string> = { refund_method: refundMethod };
      if (refundMethod === 'upi') {
        payload.refund_upi_id = refundUpi;
      } else {
        payload.refund_bank_account = refundAccount;
        payload.refund_bank_ifsc = refundIfsc;
        payload.refund_bank_name = refundBankName;
        payload.refund_account_holder = refundHolder;
      }

      const response = await api.post(`bookings/${booking.booking_ref}/cancel/`, payload);
      alert('Booking cancelled successfully and refund details registered!');
      const updatedList = [...bookingsList];
      updatedList[activeIdx] = response.data.booking;
      setBookingsList(updatedList);
      setShowCancelForm(false);
    } catch (err) {
      console.error(err);
      const errorMsg = (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Failed to cancel booking. Please try again.';
      alert(errorMsg);
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '40px' }}>Loading your ticket details...</div>;
  }

  if (!booking) {
    return <div style={{ textAlign: 'center', padding: '40px' }}>Ticket not found.</div>;
  }

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(booking.qr_code_data)}`;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0', width: '100%' }}>
      
      {bookingsList.length > 1 && (
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap', justifyContent: 'center', width: '100%', maxWidth: '600px' }}>
          {bookingsList.map((b, idx) => (
            <button 
              key={b.booking_ref}
              onClick={() => {
                setActiveIdx(idx);
                setTrackingData(null);
                setTrackingError('');
              }}
              className={`btn ${activeIdx === idx ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '8px 16px', fontSize: '0.85rem', flex: '1 1 auto', minWidth: '120px' }}
            >
              Ticket {idx + 1} (Seat {b.seat_number})
            </button>
          ))}
        </div>
      )}

      <div className="glass-panel" style={{ width: '100%', maxWidth: '600px', overflow: 'hidden', borderRadius: '24px' }}>
        
        {/* Ticket Header */}
        <div style={{ background: 'linear-gradient(135deg, var(--bg-tertiary) 0%, #0d1527 100%)', padding: '30px', borderBottom: '2px dashed var(--border-color)', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ fontWeight: 700, fontSize: '1.25rem', letterSpacing: '1px', color: 'var(--accent-primary)' }}>NE EXPLORE TICKET</span>
            <span className={`status-pill ${booking.status}`}>
              {booking.status_display}
            </span>
          </div>

          <h2 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '6px' }}>{booking.trip_details.full_route}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Departure: {booking.trip_details.card_date} • {booking.trip_details.card_time}
          </p>

          {/* Ticket styling cutouts */}
          <div style={{ position: 'absolute', bottom: '-10px', left: '-10px', width: '20px', height: '20px', borderRadius: '50%', background: 'var(--bg-primary)' }} />
          <div style={{ position: 'absolute', bottom: '-10px', right: '-10px', width: '20px', height: '20px', borderRadius: '50%', background: 'var(--bg-primary)' }} />
        </div>

        {/* Ticket Body */}
        <div style={{ padding: '30px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px', alignItems: 'center' }}>
          
          {/* Details Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Booking ID</span>
              <div style={{ fontWeight: 600, fontSize: '1.15rem' }}>{booking.booking_ref}</div>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Passenger</span>
              <div style={{ fontWeight: 500 }}>{booking.passenger_name}</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{booking.passenger_phone}</div>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Seat / Type</span>
              <div style={{ fontWeight: 600 }}>Seat {booking.seat_number} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({booking.booking_type_display})</span></div>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Vehicle / Driver</span>
              <div style={{ fontSize: '0.9rem' }}>{booking.trip_details.vehicle_details.name} ({booking.trip_details.vehicle_details.vehicle_number})</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Driver: {booking.trip_details.vehicle_details.driver_name} ({booking.trip_details.vehicle_details.driver_contact})</div>
            </div>

            {booking.from_stop_details && booking.to_stop_details && (
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Boarding & Dropping</span>
                <div style={{ fontSize: '0.875rem' }}>
                  {booking.from_stop_details.stop_name} → {booking.to_stop_details.stop_name}
                </div>
              </div>
            )}
          </div>

          {/* QR Code Section */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
            <img src={qrUrl} alt="Booking verification QR" style={{ border: '4px solid white', borderRadius: '8px', width: '150px', height: '150px' }} />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>Scan to check-in on boarding</span>
          </div>

        </div>

        {/* Ticket Footer */}
        <div style={{ padding: '0 30px 30px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div className="ticket-actions-flex">
            <button onClick={handleDownloadPDF} className="btn btn-primary" style={{ flex: 1 }}>
              Download PDF E-Ticket
            </button>
            <button onClick={handleResendEmail} className="btn btn-secondary" style={{ flex: 1 }} disabled={resending}>
              {resending ? 'Resending...' : 'Resend Email'}
            </button>
          </div>
          {booking.status !== 'cancelled' && booking.status !== 'rejected' && (
            <button 
              onClick={() => setShowCancelForm(true)} 
              className="btn btn-secondary" 
              style={{ width: '100%', borderColor: '#ef4444', color: '#f87171', background: 'rgba(239, 68, 68, 0.03)' }}
            >
              Cancel Booking & Request Refund
            </button>
          )}
          <button onClick={onBackToSearch} className="btn btn-secondary" style={{ width: '100%' }}>
            Back to Search
          </button>
        </div>

      </div>

      {booking.status === 'cancelled' && booking.refund_method && (
        <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '600px', marginTop: '24px', padding: '30px', borderLeft: '4px solid #ef4444' }}>
          <h4 style={{ color: '#f87171', marginBottom: '10px', fontSize: '1.1rem' }}>Refund Request Registered</h4>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
            This booking has been cancelled. The operator will process a refund of <strong>₹{booking.price}</strong> to the account details specified below:
          </p>
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', fontSize: '0.9rem' }}>
            {booking.refund_method === 'upi' ? (
              <div>
                <strong>Refund Type:</strong> UPI <br/>
                <strong>UPI ID:</strong> {booking.refund_upi_id}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div><strong>Refund Type:</strong> Bank Transfer</div>
                <div><strong>Holder Name:</strong> {booking.refund_account_holder}</div>
                <div><strong>Bank Name:</strong> {booking.refund_bank_name}</div>
                <div><strong>Account No:</strong> {booking.refund_bank_account}</div>
                <div><strong>IFSC Code:</strong> {booking.refund_bank_ifsc}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {showCancelForm && (
        <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '600px', marginTop: '24px', padding: '30px' }}>
          <h3 className="gradient-text" style={{ fontSize: '1.4rem', marginBottom: '20px' }}>Refund Settlement Details</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px' }}>
            Please select your preferred refund payment method and provide accurate details.
          </p>

          <form onSubmit={handleCancelBooking}>
            <div className="form-group">
              <label>Select Refund Method</label>
              <select 
                value={refundMethod} 
                onChange={(e) => setRefundMethod(e.target.value as 'upi' | 'bank')}
              >
                <option value="upi">UPI ID (GPay, PhonePe, Paytm, etc.)</option>
                <option value="bank">Direct Bank Transfer</option>
              </select>
            </div>

            {refundMethod === 'upi' ? (
              <div className="form-group animate-fade-in">
                <label>UPI ID (e.g. username@bank)</label>
                <input 
                  type="text" 
                  required 
                  value={refundUpi} 
                  onChange={(e) => setRefundUpi(e.target.value)} 
                  placeholder="e.g. name@upi"
                />
              </div>
            ) : (
              <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Account Holder Name</label>
                  <input 
                    type="text" 
                    required 
                    value={refundHolder} 
                    onChange={(e) => setRefundHolder(e.target.value)} 
                    placeholder="Holder Name"
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Bank Account Number</label>
                  <input 
                    type="text" 
                    required 
                    value={refundAccount} 
                    onChange={(e) => setRefundAccount(e.target.value)} 
                    placeholder="Account Number"
                  />
                </div>
                <div className="responsive-grid-2">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>IFSC Code</label>
                    <input 
                      type="text" 
                      required 
                      value={refundIfsc} 
                      onChange={(e) => setRefundIfsc(e.target.value)} 
                      placeholder="IFSC Code"
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Bank Name</label>
                    <input 
                      type="text" 
                      required 
                      value={refundBankName} 
                      onChange={(e) => setRefundBankName(e.target.value)} 
                      placeholder="Bank Name"
                    />
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '15px', marginTop: '24px' }}>
              <button type="submit" className="btn btn-primary" style={{ flex: 1, background: '#ef4444', color: '#fff' }} disabled={cancelling}>
                {cancelling ? 'Cancelling...' : 'Confirm Ticket Cancel'}
              </button>
              <button type="button" onClick={() => setShowCancelForm(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                Go Back
              </button>
            </div>
          </form>
        </div>
      )}

          {booking.trip_details.status === 'departed' && (
        <div className="glass-panel" style={{ width: '100%', maxWidth: '600px', marginTop: '24px', padding: '30px', background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.02) 0%, rgba(16, 24, 40, 0.8) 100%)', border: '1px solid rgba(6, 182, 212, 0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 className="gradient-text" style={{ fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="pulse-indicator" style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#06b6d4', display: 'inline-block' }} />
              Live Transit Tracking
            </h3>
            <span style={{ fontSize: '0.8rem', color: '#06b6d4', padding: '3px 8px', borderRadius: '4px', background: 'rgba(6,182,212,0.1)', fontWeight: 600 }}>IN TRANSIT</span>
          </div>

          {trackingData ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Live Status Header Summary */}
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                <div className="responsive-grid-2" style={{ gap: '15px' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Status Summary</span>
                    <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-main)', marginTop: '4px' }}>
                      {(() => {
                        const stops = booking.trip_details.route_details?.stops || [];
                        const nextStopId = trackingData.next_stop_id;
                        const nextStopIdx = stops.findIndex(s => s.id === nextStopId);
                        
                        if (nextStopIdx === 0) {
                          return `Preparing to depart from ${stops[0].stop_name}`;
                        } else if (nextStopIdx > 0) {
                          const prevStop = stops[nextStopIdx - 1];
                          const nextStop = stops[nextStopIdx];
                          return `En route to ${nextStop.stop_name} (passed ${prevStop.stop_name})`;
                        } else if (nextStopId === null && stops.length > 0) {
                          return `Approaching ${stops[stops.length - 1].stop_name} / Destination`;
                        }
                        return "Bus is active on route";
                      })()}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Delay & Speed</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                      <span style={{ fontSize: '1.05rem', fontWeight: 600, color: trackingData.delay_minutes > 0 ? '#ef4444' : '#10b981' }}>
                        {trackingData.delay_minutes > 0 ? `+${trackingData.delay_minutes} mins delay` : 'On Time'}
                      </span>
                      {trackingData.current_speed > 0 && (
                        <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                          • {trackingData.current_speed} km/h
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '12px', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <span>Vehicle: {booking.trip_details.vehicle_details?.name} ({booking.trip_details.vehicle_details?.vehicle_number})</span>
                  <span>Signal: {new Date(trackingData.last_updated).toLocaleTimeString()}</span>
                </div>
              </div>

              {/* Vertical Stoppage Stepper */}
              <div style={{ display: 'flex', flexDirection: 'column', paddingLeft: '8px', margin: '10px 0' }}>
                {(() => {
                  const stops = booking.trip_details.route_details?.stops || [];
                  const nextStopId = trackingData.next_stop_id;
                  const nextStopIdx = stops.findIndex(s => s.id === nextStopId);
                  const departureTime = new Date(booking.trip_details.departure_datetime);

                  return stops.map((stop, idx) => {
                    const isBoarding = stop.id === booking.from_stop_details?.id;
                    const isDropOff = stop.id === booking.to_stop_details?.id;

                    // Compute stop state
                    let isPassed = false;
                    let isActive = false;
                    
                    if (nextStopIdx !== -1) {
                      if (idx < nextStopIdx) {
                        isPassed = true;
                      } else if (idx === nextStopIdx) {
                        isActive = true;
                      }
                    } else {
                      isPassed = true;
                    }

                    // Times
                    const scheduledTime = new Date(departureTime.getTime() + (stop.arrival_time_offset || 0) * 60 * 1000);
                    const estimatedTime = new Date(scheduledTime.getTime() + (trackingData.delay_minutes || 0) * 60 * 1000);
                    
                    const timeFormatOptions: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: true };
                    const scheduledStr = scheduledTime.toLocaleTimeString('en-US', timeFormatOptions);
                    const estimatedStr = estimatedTime.toLocaleTimeString('en-US', timeFormatOptions);

                    return (
                      <div key={stop.id} style={{ display: 'flex', position: 'relative', minHeight: '65px', paddingBottom: idx < stops.length - 1 ? '16px' : '0' }}>
                        {/* Connecting Line */}
                        {idx < stops.length - 1 && (
                          <div style={{ 
                            position: 'absolute', 
                            left: '11px', 
                            top: '24px', 
                            bottom: '0', 
                            width: '2px', 
                            background: isPassed ? '#10b981' : (isActive ? 'linear-gradient(to bottom, #06b6d4, var(--border-color))' : 'var(--border-color)'),
                            zIndex: 1
                          }} />
                        )}

                        {/* Node circle */}
                        <div style={{ 
                          width: '24px', 
                          height: '24px', 
                          borderRadius: '50%', 
                          background: isPassed ? '#10b981' : (isActive ? '#0a0f18' : '#27272a'), 
                          border: `2px solid ${isPassed ? '#10b981' : (isActive ? '#06b6d4' : '#4b5563')}`,
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          marginRight: '16px', 
                          zIndex: 2,
                          boxShadow: isActive ? '0 0 10px rgba(6, 182, 212, 0.4)' : 'none',
                          color: '#fff',
                          fontSize: '0.7rem',
                          fontWeight: 'bold'
                        }}>
                          {isPassed ? '✓' : (isActive ? '🚌' : idx + 1)}
                        </div>

                        {/* Stop details */}
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ fontWeight: 600, color: isActive ? '#06b6d4' : 'var(--text-main)', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {stop.stop_name}
                              {isBoarding && (
                                <span style={{ fontSize: '0.7rem', color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(16,185,129,0.2)', fontWeight: 600 }}>
                                  YOUR BOARDING
                                </span>
                              )}
                              {isDropOff && (
                                <span style={{ fontSize: '0.7rem', color: '#f87171', background: 'rgba(239,68,68,0.08)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(239,68,68,0.15)', fontWeight: 600 }}>
                                  YOUR DROP-OFF
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                              Distance: {stop.distance_from_start} km
                            </div>
                          </div>

                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 600, color: trackingData.delay_minutes > 0 ? '#f87171' : '#10b981', fontSize: '0.9rem' }}>
                              {estimatedStr}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textDecoration: trackingData.delay_minutes > 0 ? 'line-through' : 'none' }}>
                              Sch: {scheduledStr}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Map collapsible drawer */}
              <div style={{ marginTop: '5px' }}>
                <button 
                  onClick={() => setShowMap(!showMap)} 
                  className="btn btn-secondary btn-inline" 
                  style={{ width: '100%', padding: '10px', fontSize: '0.85rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
                >
                  🗺️ {showMap ? 'Hide Map View' : 'Show Map View'}
                </button>
                {showMap && (
                  <div className="animate-fade-in" style={{ borderRadius: '12px', overflow: 'hidden', height: '220px', border: '1px solid var(--border-color)', position: 'relative', marginTop: '12px' }}>
                    <iframe 
                      title="Live Location Map"
                      width="100%" 
                      height="100%" 
                      style={{ border: 0, filter: 'invert(90%) hue-rotate(180deg) brightness(95%) contrast(90%)' }}
                      src={`https://maps.google.com/maps?q=${trackingData.current_latitude},${trackingData.current_longitude}&z=13&output=embed`}
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px', fontSize: '0.9rem' }}>
              {trackingError || 'Connecting to vehicle GPS stream...'}
            </div>
          )}
        </div>
      )}

    </div>
  );
};
