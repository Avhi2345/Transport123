import React, { useState } from 'react';
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
  status: string;
  departure_datetime: string;
  vehicle_details: {
    name: string;
    vehicle_type: string;
    vehicle_number: string;
    capacity: number;
  };
}

interface SearchProps {
  onSelectTrip: (trip: Trip) => void;
  onGoToDashboard: () => void;
  isOperator: boolean;
}

export const Search: React.FC<SearchProps> = ({ onSelectTrip, onGoToDashboard, isOperator }) => {
  const [source, setSource] = useState('');
  const [destination, setDestination] = useState('');
  const [date, setDate] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Filter states
  const [filterType, setFilterType] = useState<'all' | 'running' | 'tomorrow' | 'date'>('all');
  const [filterDate, setFilterDate] = useState('');

  const getLocalDateString = (offsetDays = 0) => {
    const d = new Date();
    if (offsetDays !== 0) {
      d.setDate(d.getDate() + offsetDays);
    }
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getTripLocalDateString = (departureDatetime: string) => {
    const d = new Date(departureDatetime);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSearched(true);
    // Reset filters on new search
    setFilterType('all');
    setFilterDate('');
    try {
      const response = await api.get('trips/search/', {
        params: {
          source,
          destination,
          date: date || undefined,
          vehicle_type: vehicleType || undefined,
        },
      });
      setTrips(response.data);
    } catch (err) {
      console.error(err);
      alert('Failed to search trips. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Perform client-side filtering on retrieved trips
  const filteredTrips = trips.filter((trip) => {
    if (filterType === 'all') {
      return true;
    }
    if (filterType === 'running') {
      return trip.status === 'departed';
    }
    if (filterType === 'tomorrow') {
      return getTripLocalDateString(trip.departure_datetime) === getLocalDateString(1);
    }
    if (filterType === 'date') {
      if (!filterDate) return true; // default to showing all if no date selected yet
      return getTripLocalDateString(trip.departure_datetime) === filterDate;
    }
    return true;
  });

  return (
    <div className="animate-fade-in">
      <div className="responsive-flex-header">
        <div>
          <h1 className="gradient-text" style={{ fontSize: '2.5rem', marginBottom: '8px' }}>Find Your Adventure</h1>
          <p style={{ color: 'var(--text-muted)' }}>Explore North-East India with reliable local transport</p>
        </div>
        {isOperator && (
          <button onClick={onGoToDashboard} className="btn btn-secondary btn-inline">
            Go to Operator Dashboard
          </button>
        )}
      </div>

      <div className="glass-panel" style={{ padding: '30px', marginBottom: '40px' }}>
        <form onSubmit={handleSearch} className="search-form-grid">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>From</label>
            <input 
              type="text" 
              required 
              value={source} 
              onChange={(e) => setSource(e.target.value)} 
              placeholder="e.g. Guwahati"
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>To</label>
            <input 
              type="text" 
              required 
              value={destination} 
              onChange={(e) => setDestination(e.target.value)} 
              placeholder="e.g. Shillong"
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Date (Optional)</label>
            <input 
              type="date" 
              value={date} 
              min={getLocalDateString()}
              onChange={(e) => setDate(e.target.value)} 
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Vehicle Type</label>
            <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}>
              <option value="">Any Vehicle</option>
              <option value="sumo">Tata Sumo</option>
              <option value="traveller">Force Traveller</option>
              <option value="bus">Bus</option>
              <option value="taxi">Local Taxi</option>
            </select>
          </div>

          <button type="submit" className="btn btn-primary" style={{ height: '48px' }}>
            {loading ? 'Searching...' : 'Search Rides'}
          </button>
        </form>
      </div>

      {/* Advanced Filter Bar for Search Results */}
      {searched && !loading && trips.length > 0 && (
        <div className="glass-panel animate-fade-in" style={{ padding: '20px', marginBottom: '30px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button 
                onClick={() => setFilterType('all')} 
                className={`btn ${filterType === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '8px 16px', fontSize: '0.875rem' }}
              >
                All Options ({trips.length})
              </button>
              <button 
                onClick={() => setFilterType('running')} 
                className={`btn ${filterType === 'running' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '8px 16px', fontSize: '0.875rem' }}
              >
                Running Now ({trips.filter(t => t.status === 'departed').length})
              </button>
              <button 
                onClick={() => setFilterType('tomorrow')} 
                className={`btn ${filterType === 'tomorrow' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '8px 16px', fontSize: '0.875rem' }}
              >
                Available Tomorrow ({trips.filter(t => getTripLocalDateString(t.departure_datetime) === getLocalDateString(1)).length})
              </button>
              <button 
                onClick={() => setFilterType('date')} 
                className={`btn ${filterType === 'date' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '8px 16px', fontSize: '0.875rem' }}
              >
                Choose Date {filterDate && `(${filterDate})`}
              </button>
            </div>
            
            {filterType === 'date' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }} className="animate-fade-in">
                <label style={{ margin: 0, whiteSpace: 'nowrap' }}>Choose Date:</label>
                <input 
                  type="date" 
                  min={getLocalDateString()} 
                  value={filterDate} 
                  onChange={(e) => setFilterDate(e.target.value)} 
                  style={{ padding: '6px 12px', width: 'auto', fontSize: '0.875rem' }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          Finding available vehicles...
        </div>
      ) : trips.length > 0 ? (
        filteredTrips.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
            {filteredTrips.map((trip) => (
              <div key={trip.id} className="glass-panel trip-card hover-lift responsive-trip-card">
                <div className="trip-card-info">
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' }}>
                    <span style={{ background: 'var(--bg-tertiary)', color: 'var(--accent-primary)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>
                      {trip.vehicle_details.vehicle_type}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{trip.vehicle_details.vehicle_number}</span>
                    {trip.status === 'departed' && (
                      <span className="animate-pulse" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid #10b981', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34d399', display: 'inline-block' }}></span>
                        Running Now
                      </span>
                    )}
                  </div>
                  <h3 style={{ fontSize: '1.25rem', marginBottom: '4px' }}>{trip.full_route}</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                    {trip.vehicle_details.name} • Depart: <strong>{trip.card_time}</strong> ({trip.card_date})
                  </p>
                </div>

                <div className="trip-card-actions-wrapper">
                  <div className="trip-card-meta-row">
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent-primary)' }}>
                      ₹{trip.segment_price}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: trip.available_seats > 3 ? '#34d399' : '#f87171' }}>
                      {trip.available_seats} seats remaining
                    </div>
                  </div>
                  <button onClick={() => onSelectTrip(trip)} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.875rem' }}>
                    Select Seats
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            No trips found matching the selected filter options.
          </div>
        )
      ) : searched ? (
        <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          No trips found matching your route.
        </div>
      ) : null}
    </div>
  );
};
