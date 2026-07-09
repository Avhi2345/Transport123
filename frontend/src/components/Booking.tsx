import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

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

interface BookingProps {
  trip: Trip;
  onBookingSuccess: (bookingRef: string) => void;
  onBack: () => void;
}

export const Booking: React.FC<BookingProps> = ({ trip, onBookingSuccess, onBack }) => {
  const [bookedSeats, setBookedSeats] = useState<string[]>([]);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [bookingType, setBookingType] = useState('instant'); // instant or request
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  // Passenger details per seat: { [seat]: { name: string, phone: string } }
  const [passengerDetails, setPassengerDetails] = useState<Record<string, { name: string; phone: string }>>({});

  const fetchSeatLayout = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get(`trips/${trip.id}/seats/`, {
        params: {
          from_stop: trip.matched_from_stop,
          to_stop: trip.matched_to_stop,
        },
      });
      setBookedSeats(response.data.booked_seats);
    } catch (err) {
      console.error(err);
      alert('Failed to load seat layout');
    } finally {
      setLoading(false);
    }
  }, [trip]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      await Promise.resolve();
      if (mounted) {
        fetchSeatLayout();
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [fetchSeatLayout]);

  const handleSeatClick = (seat: string) => {
    if (bookedSeats.includes(seat)) return; // Blocked

    if (selectedSeats.includes(seat)) {
      setSelectedSeats(selectedSeats.filter((s) => s !== seat));
      const newDetails = { ...passengerDetails };
      delete newDetails[seat];
      setPassengerDetails(newDetails);
    } else {
      setSelectedSeats([...selectedSeats, seat]);
      setPassengerDetails({
        ...passengerDetails,
        [seat]: { name: '', phone: '' },
      });
    }
  };

  const handleDetailChange = (seat: string, field: 'name' | 'phone', value: string) => {
    setPassengerDetails({
      ...passengerDetails,
      [seat]: {
        ...passengerDetails[seat],
        [field]: value,
      },
    });
  };

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedSeats.length === 0) {
      alert('Please select at least one seat');
      return;
    }

    setSubmitting(true);
    try {
      const response = await api.post('book/', {
        trip_id: trip.id,
        selected_seats: selectedSeats,
        booking_type: bookingType,
        from_stop: trip.matched_from_stop,
        to_stop: trip.matched_to_stop,
        seat_details: passengerDetails,
      });

      alert('Booking saved successfully!');
      onBookingSuccess(response.data.bookings.map((b: any) => b.booking_ref).join(','));
    } catch (err) {
      console.error(err);
      const errorMsg = (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'A booking conflict occurred. Some selected seats might have just been reserved.';
      alert(errorMsg);
      fetchSeatLayout(); // Refresh layout
    } finally {
      setSubmitting(false);
    }
  };

  // Render vehicle layout helper (2 rows, side driver Sumo/Traveller)
  const capacity = trip.vehicle_details.capacity;
  const seatNumbers = Array.from({ length: capacity }, (_, i) => String(i + 1));

  return (
    <div className={`animate-fade-in ${selectedSeats.length > 0 ? 'with-sticky-bottom' : ''}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '40px' }}>
      
      {/* Left: Seat Visual Layout */}
      <div className="glass-panel" style={{ padding: '30px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <button onClick={onBack} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', marginBottom: '20px', fontSize: '0.9rem' }}>
          ← Back to Search
        </button>

        <h3 style={{ marginBottom: '8px' }}>{trip.vehicle_details.name} Seat Map</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '32px' }}>Click on white seats to reserve</p>

        {loading ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>Loading layout...</div>
        ) : (
          <div className="seat-map-wrapper">
            
            {/* Steering Wheel / Front Driver indicator */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em' }}>DRIVER</div>
              <div className="steering-wheel" style={{ width: '24px', height: '24px', borderRadius: '50%', border: '4px double var(--text-muted)' }} />
            </div>

            {/* Visual Grid representing rows of seating */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px', justifyContent: 'center' }}>
              {seatNumbers.map((seat) => {
                const isBooked = bookedSeats.includes(seat);
                const isSelected = selectedSeats.includes(seat);
                
                let seatClass = 'seat-item available';
                if (isBooked) {
                  seatClass = 'seat-item booked';
                } else if (isSelected) {
                  seatClass = 'seat-item selected';
                }

                return (
                  <div
                    key={seat}
                    onClick={() => handleSeatClick(seat)}
                    className={seatClass}
                  >
                    {seat}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '20px', marginTop: '30px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '16px', height: '16px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)' }} />
            Available
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '16px', height: '16px', borderRadius: '4px', background: 'var(--accent-primary)' }} />
            Selected
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '16px', height: '16px', borderRadius: '4px', background: '#374151' }} />
            Booked
          </div>
        </div>
      </div>

      {/* Right: Booking Form Details */}
      <div className="glass-panel" style={{ padding: '30px' }}>
        <h3 className="gradient-text" style={{ fontSize: '1.5rem', marginBottom: '4px' }}>Complete Booking</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '24px' }}>Route: {trip.full_route}</p>

        {selectedSeats.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
            Select one or more seats on the grid layout to start.
          </div>
        ) : (
          <form onSubmit={handleBook}>
            <div style={{ maxHeight: '250px', overflowY: 'auto', paddingRight: '8px', marginBottom: '24px' }}>
              {selectedSeats.map((seat) => (
                <div key={seat} style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
                  <h4 style={{ color: 'var(--accent-primary)', fontSize: '1rem', marginBottom: '12px' }}>Passenger for Seat {seat}</h4>
                  
                  <div className="responsive-grid-2">
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>Full Name</label>
                      <input 
                        type="text" 
                        required 
                        value={passengerDetails[seat]?.name || ''} 
                        onChange={(e) => handleDetailChange(seat, 'name', e.target.value)} 
                        placeholder="John Doe"
                      />
                    </div>
                    
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>Phone Number</label>
                      <input 
                        type="tel" 
                        required 
                        value={passengerDetails[seat]?.phone || ''} 
                        onChange={(e) => handleDetailChange(seat, 'phone', e.target.value)} 
                        placeholder="10-digit mobile"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="form-group">
              <label>Confirmation Option</label>
              <select value={bookingType} onChange={(e) => setBookingType(e.target.value)}>
                <option value="instant">Instant Ticket (Payment Gate/QR)</option>
                <option value="request">Request (Reserve Seat, Pay Counter)</option>
              </select>
            </div>

            <div className="booking-checkout-container">
              <div style={{ width: '40px', height: '4px', background: 'var(--border-color)', borderRadius: '2px', margin: '0 auto 12px auto', display: 'none' }} className="mobile-grab-handle" />
              <div className="summary-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '1.1rem' }}>
                <span>Selected Seats</span>
                <strong>{selectedSeats.join(', ')}</strong>
              </div>
              <div className="amount-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', fontSize: '1.25rem' }}>
                <span>Total Amount</span>
                <strong className="gradient-text">₹{parseFloat(trip.segment_price) * selectedSeats.length}</strong>
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={submitting}>
                {submitting ? 'Reserving Seats...' : 'Book Ticket Now'}
              </button>
            </div>
          </form>
        )}
      </div>

    </div>
  );
};
