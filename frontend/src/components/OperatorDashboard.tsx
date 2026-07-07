import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

interface Vehicle {
  id: number;
  name: string;
  vehicle_number: string;
  vehicle_type: string;
}

interface Route {
  id: number;
  source: string;
  destination: string;
}

interface Trip {
  id: number;
  full_route: string;
  card_date: string;
  card_time: string;
  available_seats: number;
  status: string;
  route_details: {
    id: number;
    source: string;
    destination: string;
  };
  vehicle_details?: {
    name: string;
    vehicle_number: string;
    driver_name: string;
    driver_contact: string;
  };
  live_status?: any;
}

interface Booking {
  id: string;
  booking_ref: string;
  passenger_name: string;
  passenger_phone: string;
  seat_number: string;
  status: string;
  status_display: string;
  segment_price: string;
  trip_details: {
    full_route: string;
  };
  refund_method?: 'upi' | 'bank' | null;
  refund_upi_id?: string | null;
  refund_bank_account?: string | null;
  refund_bank_ifsc?: string | null;
  refund_bank_name?: string | null;
  refund_account_holder?: string | null;
  from_stop_id?: number | null;
  to_stop_id?: number | null;
}

interface StopInput {
  name: string;
  distance: number;
  price: number;
  time_offset_minutes: number;
}

interface Stop {
  id: number;
  stop_name: string;
  stop_order: number;
  distance_from_start: string | number;
  price_from_source: string | number;
  arrival_time_offset: number;
  latitude?: number | null;
  longitude?: number | null;
}

interface Stats {
  operator_profile: {
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
  };
  active_vehicles_count: number;
  vehicles: Vehicle[];
  trips_count: number;
  trips: Trip[];
  total_revenue: number;
  total_passengers: number;
  recent_bookings: Booking[];
}

interface OperatorDashboardProps {
  onBackToSearch: () => void;
  onLogout?: () => void;
  initialTab?: 'overview' | 'trips' | 'create-trip' | 'create-route' | 'create-vehicle' | 'edit-profile' | 'fleet-dashboard' | 'vehicle-dashboard' | 'support-desk';
}

export const OperatorDashboard: React.FC<OperatorDashboardProps> = ({ onBackToSearch, onLogout, initialTab }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'trips' | 'create-trip' | 'create-route' | 'create-vehicle' | 'edit-profile' | 'fleet-dashboard' | 'vehicle-dashboard' | 'support-desk'>(initialTab || 'overview');
  const [selectedVehicleForDashboard, setSelectedVehicleForDashboard] = useState<any | null>(null);
  
  // Support Widget States
  const [supportWidgetOpen, setSupportWidgetOpen] = useState(false);
  const [supportMessages, setSupportMessages] = useState<Array<{ sender: 'user' | 'bot', text: string }>>([
    { sender: 'bot', text: 'Hello! I am your compliance & onboarding assistant. How can I help you with your fleet today?' }
  ]);
  const [supportInput, setSupportInput] = useState('');

  // Fleet Entry States
  const [fleetVehicles, setFleetVehicles] = useState<Array<{
    name: string;
    vehicle_number: string;
    vehicle_type: string;
    capacity: number;
    driver_name: string;
    driver_contact: string;
    rc_url: string;
    vehicle_photo_url: string;
    rc_uploading: boolean;
    photo_uploading: boolean;
  }>>([{
    name: '',
    vehicle_number: '',
    vehicle_type: 'sumo',
    capacity: 10,
    driver_name: '',
    driver_contact: '',
    rc_url: '',
    vehicle_photo_url: '',
    rc_uploading: false,
    photo_uploading: false
  }]);

  // Vehicle Simulation states
  const [vehicleSimulating, setVehicleSimulating] = useState(false);
  const [vehicleSimLat, setVehicleSimLat] = useState(26.1445);
  const [vehicleSimLng, setVehicleSimLng] = useState(91.7362);
  const [vehicleSimSpeed, setVehicleSimSpeed] = useState(0);
  const [vehicleSimInterval, setVehicleSimInterval] = useState<any>(null);

  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    if (initialTab) {
      Promise.resolve().then(() => {
        if (mounted) {
          setActiveTab(initialTab);
        }
      });
    }
    return () => {
      mounted = false;
    };
  }, [initialTab]);

  // Scheduling Trip states
  const [selectedRoute, setSelectedRoute] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [departureDatetime, setDepartureDatetime] = useState('');
  const [isDaily, setIsDaily] = useState(false);
  const [scheduleDays, setScheduleDays] = useState(30);
  const [additionalTimesStr, setAdditionalTimesStr] = useState('');

  // Creating Route states
  const [routeSource, setRouteSource] = useState('');
  const [routeDest, setRouteDest] = useState('');
  const [routeDuration, setRouteDuration] = useState('');
  const [routeBasePrice, setRouteBasePrice] = useState('');
  const [stops, setStops] = useState<StopInput[]>([]);

  // Creating Vehicle states (unused individual states removed)

  // Edit Profile states
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileAddress, setProfileAddress] = useState('');
  const [profileUpi, setProfileUpi] = useState('');
  const [profileBank, setProfileBank] = useState('');

  // Manifest states
  const [manifestTrip, setManifestTrip] = useState<Trip | null>(null);
  const [manifestBookings, setManifestBookings] = useState<Booking[]>([]);
  const [manifestLoading, setManifestLoading] = useState(false);
  const [manifestStops, setManifestStops] = useState<Stop[]>([]);

  // Live Tracking states
  const [isTracking, setIsTracking] = useState(false);
  const [watchId, setWatchId] = useState<number | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simIntervalId, setSimIntervalId] = useState<ReturnType<typeof setInterval> | null>(null);
  const [simMessage, setSimMessage] = useState('');
  const [autoTrackFailed, setAutoTrackFailed] = useState(false);
  const [delayMinutes, setDelayMinutes] = useState<number>(0);
  const [operatorNextStopId, setOperatorNextStopId] = useState<number | null>(null);

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('operator/dashboard/');
      setStats(response.data);
      const profile = response.data.operator_profile;
      if (profile) {
        setProfileName(profile.operator_name || '');
        setProfilePhone(profile.phone || '');
        setProfileAddress(profile.address || '');
        setProfileUpi(profile.upi_id || '');
        setProfileBank(profile.bank_details || '');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || err.message || 'Failed to load operator metrics');
    } finally {
      setLoading(false);
    }
  }, []);

  // Clean up tracking on unmount or tab change
  useEffect(() => {
    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (simIntervalId) clearInterval(simIntervalId);
    };
  }, [watchId, simIntervalId]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      await Promise.resolve();
      if (mounted) {
        fetchDashboardData();
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [fetchDashboardData]);



  const handleCreateTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('operator/trips/create/', {
        route_id: selectedRoute,
        vehicle_id: selectedVehicle,
        departure_datetime: departureDatetime,
        is_daily: isDaily,
        schedule_days: scheduleDays,
        additional_times: additionalTimesStr.split(',').map(t => t.trim()).filter(Boolean),
      });
      alert('Trip created successfully!');
      setSelectedRoute('');
      setSelectedVehicle('');
      setDepartureDatetime('');
      setIsDaily(false);
      setAdditionalTimesStr('');
      fetchDashboardData();
      setActiveTab('overview');
    } catch (err) {
      console.error(err);
      alert('Failed to create trip');
    }
  };

  const handleAddStop = () => {
    setStops([...stops, { name: '', distance: 0, price: 0, time_offset_minutes: 0 }]);
  };

  const handleStopChange = (index: number, field: keyof StopInput, value: string | number) => {
    const newStops = [...stops];
    if (field === 'name') {
      newStops[index].name = value as string;
    } else {
      newStops[index][field] = value as number;
    }
    setStops(newStops);
  };

  const handleRemoveStop = (index: number) => {
    setStops(stops.filter((_, i) => i !== index));
  };

  const handleCreateRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('operator/routes/create/', {
        source: routeSource,
        destination: routeDest,
        estimated_duration: routeDuration,
        base_price: routeBasePrice,
        stops: stops,
      });
      alert('Route and stops created successfully!');
      setRouteSource('');
      setRouteDest('');
      setRouteDuration('');
      setRouteBasePrice('');
      setStops([]);
      fetchDashboardData();
      setActiveTab('overview');
    } catch (err) {
      console.error(err);
      alert('Failed to create route');
    }
  };

  const handleFleetVehicleFileChange = (index: number, docType: 'rc' | 'vehicle_photo', file: File) => {
    const updated = [...fleetVehicles];
    if (docType === 'rc') {
      updated[index].rc_uploading = true;
    } else {
      updated[index].photo_uploading = true;
    }
    setFleetVehicles(updated);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64Content = reader.result as string;
        const res = await api.post('operator/upload_doc/', {
          doc_type: docType,
          file_name: file.name,
          file_content: base64Content
        });
        
        const current = [...fleetVehicles];
        if (docType === 'rc') {
          current[index].rc_url = res.data.url;
          current[index].rc_uploading = false;
        } else {
          current[index].vehicle_photo_url = res.data.url;
          current[index].photo_uploading = false;
        }
        setFleetVehicles(current);
      } catch (err) {
        console.error(err);
        alert(`Failed to upload ${docType}. Please try again.`);
        const current = [...fleetVehicles];
        if (docType === 'rc') current[index].rc_uploading = false;
        else current[index].photo_uploading = false;
        setFleetVehicles(current);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRegisterFleet = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      for (let i = 0; i < fleetVehicles.length; i++) {
        const v = fleetVehicles[i];
        if (!v.name || !v.vehicle_number || !v.driver_name || !v.driver_contact) {
          alert(`Please fill in all details for Vehicle #${i + 1}`);
          setLoading(false);
          return;
        }
        if (!v.rc_url || !v.vehicle_photo_url) {
          alert(`Please upload RC and Photo for Vehicle #${i + 1}`);
          setLoading(false);
          return;
        }
      }

      for (const v of fleetVehicles) {
        await api.post('vehicles/', {
          name: v.name,
          vehicle_type: v.vehicle_type,
          vehicle_number: v.vehicle_number,
          capacity: v.capacity,
          driver_name: v.driver_name,
          driver_contact: v.driver_contact,
          rc_url: v.rc_url,
          vehicle_photo_url: v.vehicle_photo_url,
          verification_status: 'pending'
        });
      }

      alert('Fleet vehicles successfully registered! They are pending admin verification.');
      setFleetVehicles([{
        name: '',
        vehicle_number: '',
        vehicle_type: 'sumo',
        capacity: 10,
        driver_name: '',
        driver_contact: '',
        rc_url: '',
        vehicle_photo_url: '',
        rc_uploading: false,
        photo_uploading: false
      }]);
      setActiveTab('fleet-dashboard');
      fetchDashboardData();
    } catch (err: any) {
      console.error(err);
      alert(`Registration failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.put('operator/dashboard/', {
        operator_name: profileName,
        phone: profilePhone,
        address: profileAddress,
        upi_id: profileUpi,
        bank_details: profileBank,
      });
      alert('Operator profile updated successfully!');
      fetchDashboardData();
      setActiveTab('overview');
    } catch (err) {
      console.error(err);
      alert('Failed to update operator profile');
    }
  };

  const handleViewManifest = async (trip: Trip) => {
    setManifestLoading(true);
    setActiveTab('trips');
    try {
      const response = await api.get(`operator/trips/${trip.id}/passengers/`);
      setManifestTrip(response.data.trip);
      setManifestBookings(response.data.bookings);
      const stops = response.data.stops || [];
      setManifestStops(stops);

      // Initialize manual stoppage controls
      const live = response.data.trip.live_status;
      if (live) {
        setDelayMinutes(live.delay_minutes || 0);
        setOperatorNextStopId(live.next_stop_id);
      } else {
        setDelayMinutes(0);
        setOperatorNextStopId(stops.length > 0 ? stops[0].id : null);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to fetch manifest');
    } finally {
      setManifestLoading(false);
    }
  };

  const handleUpdateStoppage = async (stopId: number | null, isManualDelayChange = false) => {
    if (!manifestTrip) return;
    
    // Find coordinates for the chosen stop (or fallback if none)
    const targetStop = manifestStops.find(s => s.id === stopId);
    const lat = targetStop?.latitude || 0.0;
    const lng = targetStop?.longitude || 0.0;

    try {
      await api.post(`trips/${manifestTrip.id}/location/`, {
        lat: lat,
        lng: lng,
        speed: 0,
        delay: delayMinutes,
        next_stop_id: stopId
      });
      
      setOperatorNextStopId(stopId);
      
      if (!isManualDelayChange) {
        alert(`Successfully reported stoppage: En route / Arriving at "${targetStop?.stop_name || 'Destination'}"`);
      } else {
        alert(`Successfully updated delay to ${delayMinutes} mins.`);
      }
      
      // Refresh manifest details to sync live status
      const response = await api.get(`operator/trips/${manifestTrip.id}/passengers/`);
      setManifestTrip(response.data.trip);
    } catch (err) {
      console.error(err);
      alert('Failed to update stoppage status');
    }
  };

  const handleMarkStopReached = async (reachedStop: Stop, stopIdx: number) => {
    if (!manifestTrip) return;
    
    // The next stop in order will be manifestStops[stopIdx + 1]
    const subsequentStop = stopIdx < manifestStops.length - 1 ? manifestStops[stopIdx + 1] : null;
    const targetNextStopId = subsequentStop ? subsequentStop.id : null;
    
    // We send coordinates of the reached stop (to show it reached the stop)
    const lat = reachedStop.latitude || 0.0;
    const lng = reachedStop.longitude || 0.0;

    try {
      await api.post(`trips/${manifestTrip.id}/location/`, {
        lat: lat,
        lng: lng,
        speed: 0.0,
        delay: delayMinutes,
        next_stop_id: targetNextStopId
      });
      
      setOperatorNextStopId(targetNextStopId);
      alert(`Marked "${reachedStop.stop_name}" as Reached. Now heading to "${subsequentStop?.stop_name || 'Destination'}"`);
      
      // Reload manifest trip info to update statuses
      const response = await api.get(`operator/trips/${manifestTrip.id}/passengers/`);
      setManifestTrip(response.data.trip);
    } catch (err) {
      console.error(err);
      alert('Failed to update stoppage progress');
    }
  };

  const handleSetNextStop = async (stop: Stop) => {
    if (!manifestTrip) return;
    const lat = stop.latitude || 0.0;
    const lng = stop.longitude || 0.0;
    try {
      await api.post(`trips/${manifestTrip.id}/location/`, {
        lat,
        lng,
        speed: 0.0,
        delay: delayMinutes,
        next_stop_id: stop.id
      });
      setOperatorNextStopId(stop.id);
      alert(`Set "${stop.stop_name}" as the active next stop.`);
      const response = await api.get(`operator/trips/${manifestTrip.id}/passengers/`);
      setManifestTrip(response.data.trip);
    } catch (err) {
      console.error(err);
      alert('Failed to set next stop');
    }
  };

  const handleStartTrip = async (tripId: number) => {
    try {
      const res = await api.post(`trips/${tripId}/start/`);
      alert(res.data.message);
      if (manifestTrip) {
        handleViewManifest(manifestTrip);
      }
      fetchDashboardData();
    } catch (err) {
      console.error(err);
      alert('Failed to start trip');
    }
  };

  const handleStopTrip = async (tripId: number) => {
    stopTracking();
    stopSimulation();
    try {
      const res = await api.post(`trips/${tripId}/stop/`);
      alert(res.data.message);
      if (manifestTrip) {
        handleViewManifest(manifestTrip);
      }
      fetchDashboardData();
    } catch (err) {
      console.error(err);
      alert('Failed to complete trip');
    }
  };

  const stopTracking = () => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }
    setIsTracking(false);
  };

  const startTracking = (tripId: number, isSilent = false) => {
    if (isSimulating) {
      if (!isSilent) alert('Please stop simulation before starting device tracking');
      return;
    }
    if (!navigator.geolocation) {
      if (!isSilent) alert('Geolocation is not supported by your browser');
      return;
    }
    setIsTracking(true);
    const id = navigator.geolocation.watchPosition(
      async (position) => {
        const { latitude, longitude, speed } = position.coords;
        try {
          await api.post(`trips/${tripId}/location/`, {
            lat: latitude,
            lng: longitude,
            speed: speed || 0.0,
            delay: 0
          });
        } catch (err) {
          console.error('Failed to send live location', err);
        }
      },
      (error) => {
        console.error(error);
        if (!isSilent) {
          alert('Geolocation error: ' + error.message);
        }
        stopTracking();
        if (isSilent) {
          setAutoTrackFailed(true);
        }
      },
      { enableHighAccuracy: true, maximumAge: 10000 }
    );
    setWatchId(id);
  };

  // Auto-start GPS tracking if there is a departed trip
  useEffect(() => {
    if (!stats || !stats.trips) return;
    const departedTrip = stats.trips.find((t: Trip) => t.status === 'departed');
    if (departedTrip) {
      if (!isTracking && watchId === null && !isSimulating && !autoTrackFailed) {
        console.log(`Auto-starting GPS tracking for departed trip ${departedTrip.id}`);
        Promise.resolve().then(() => {
          startTracking(departedTrip.id, true);
        });
      }
    } else {
      if (isTracking) {
        console.log('No departed trips. Auto-stopping GPS tracking.');
        Promise.resolve().then(() => {
          stopTracking();
        });
      }
      if (autoTrackFailed) {
        Promise.resolve().then(() => {
          setAutoTrackFailed(false);
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats, isTracking, watchId, isSimulating, autoTrackFailed]);

  const startSimulation = (tripId: number) => {
    if (isTracking) {
      alert('Please stop device tracking before starting simulation');
      return;
    }
    if (manifestStops.length === 0) {
      alert('No stops found to simulate location.');
      return;
    }
    setIsSimulating(true);
    
    let stopIdx = 0;
    sendSimulatedLoc(tripId, stopIdx);

    const interval = setInterval(() => {
      stopIdx = (stopIdx + 1) % manifestStops.length;
      sendSimulatedLoc(tripId, stopIdx);
    }, 10000); // Update every 10 seconds

    setSimIntervalId(interval);
  };

  const sendSimulatedLoc = async (tripId: number, idx: number) => {
    const stop = manifestStops[idx];
    const lat = stop.latitude || (26.1445 - (idx * 0.1));
    const lng = stop.longitude || (91.7362 + (idx * 0.03));
    
    setSimMessage(`Simulating: At stop "${stop.stop_name}" (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
    try {
      await api.post(`trips/${tripId}/location/`, {
        lat: lat,
        lng: lng,
        speed: 45.0,
        delay: 0,
        next_stop_id: idx < manifestStops.length - 1 ? manifestStops[idx + 1].id : null
      });
    } catch (err) {
      console.error('Failed to send simulated location', err);
    }
  };

  const stopSimulation = () => {
    if (simIntervalId) {
      clearInterval(simIntervalId);
      setSimIntervalId(null);
    }
    setIsSimulating(false);
    setSimMessage('');
  };

  const handleStatusUpdate = async (bookingId: string, status: string) => {
    try {
      const response = await api.post(`operator/bookings/${bookingId}/status/`, { status });
      alert(response.data.message);
      if (manifestTrip) {
        handleViewManifest(manifestTrip); // Reload manifest
      }
      fetchDashboardData(); // Reload stats
    } catch (err) {
      console.error(err);
      alert('Failed to update booking status');
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '40px' }}>Loading Operator Dashboard...</div>;
  }

  if (error && !stats) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-main)' }}>
        <h3 style={{ color: '#ef4444' }}>Error Loading Dashboard</h3>
        <p style={{ margin: '12px 0 20px', color: 'var(--text-muted)' }}>{error}</p>
        <button onClick={fetchDashboardData} className="btn btn-primary">
          Retry
        </button>
      </div>
    );
  }

  if (!stats) {
    return <div style={{ textAlign: 'center', padding: '40px' }}>No stats data available.</div>;
  }

  const profile = stats.operator_profile;
  const status = profile?.verification_status || 'not_submitted';

  if (status !== 'approved') {
    return <OperatorOnboarding profile={profile} onResubmit={fetchDashboardData} />;
  }

  return (
    <div className="animate-fade-in operator-dashboard-layout">
      
      {/* Sidebar (Operator Console Navigation) */}
      <div className="scrollable-tabs-container">
        <div className="sidebar-logo">
          <span style={{ fontSize: '1.6rem' }}>🚌</span>
          <div style={{ textAlign: 'left' }}>
            <strong style={{ display: 'block', color: '#ffffff', fontSize: '1.05rem', fontWeight: 800 }}>NE Explore</strong>
            <span style={{ fontSize: '0.7rem', opacity: 0.6, color: '#94a3b8' }}>Operator Console</span>
          </div>
        </div>
        
        <span 
          onClick={() => { setActiveTab('overview'); setManifestTrip(null); }} 
          className={`scrollable-tab-item ${activeTab === 'overview' ? 'active' : ''}`}
        >
          🎛️ Dashboard
        </span>
        <span 
          onClick={() => { setActiveTab('trips'); setManifestTrip(null); }} 
          className={`scrollable-tab-item ${activeTab === 'trips' ? 'active' : ''}`}
        >
          📅 Trips
        </span>
        <span 
          onClick={() => { setActiveTab('trips'); setManifestTrip(null); }} 
          className="scrollable-tab-item"
        >
          📋 Bookings
        </span>
        <span 
          onClick={() => { setActiveTab('create-vehicle'); setManifestTrip(null); }} 
          className={`scrollable-tab-item ${activeTab === 'create-vehicle' ? 'active' : ''}`}
        >
          🚗 Vehicles
        </span>
        <span 
          onClick={() => { setActiveTab('fleet-dashboard'); setManifestTrip(null); }} 
          className={`scrollable-tab-item ${activeTab === 'fleet-dashboard' ? 'active' : ''}`}
        >
          🚚 Fleet
        </span>
        <span 
          onClick={() => { setActiveTab('create-route'); setManifestTrip(null); }} 
          className={`scrollable-tab-item ${activeTab === 'create-route' ? 'active' : ''}`}
        >
          🗺️ Routes
        </span>
        <span 
          onClick={() => { setActiveTab('fleet-dashboard'); setManifestTrip(null); }} 
          className="scrollable-tab-item"
        >
          💰 Earnings
        </span>
        <span 
          onClick={() => { setActiveTab('vehicle-dashboard'); setManifestTrip(null); }} 
          className="scrollable-tab-item"
        >
          📍 Live Tracking
        </span>
        <span 
          onClick={() => { setActiveTab('support-desk'); setManifestTrip(null); }} 
          className={`scrollable-tab-item ${activeTab === 'support-desk' ? 'active' : ''}`}
        >
          💬 Support Desk
        </span>
        <span 
          onClick={() => { setActiveTab('edit-profile'); setManifestTrip(null); }} 
          className={`scrollable-tab-item ${activeTab === 'edit-profile' ? 'active' : ''}`}
        >
          👤 Profile
        </span>
        <span 
          onClick={() => { setActiveTab('edit-profile'); setManifestTrip(null); }} 
          className="scrollable-tab-item"
        >
          ⚙️ Settings
        </span>
        
        <div style={{ marginTop: 'auto', paddingTop: '20px' }}>
          <span 
            onClick={onLogout || onBackToSearch} 
            className="scrollable-tab-item"
            style={{ color: 'var(--danger)', fontWeight: 600 }}
          >
            🚪 Logout
          </span>
        </div>
      </div>

      {/* Main Console Content Header */}
      <div className="responsive-flex-header" style={{ marginBottom: '24px' }}>
        <div>
          <h1 className="gradient-text" style={{ fontSize: '2rem', marginBottom: '4px', textTransform: 'capitalize' }}>
            {activeTab === 'overview' ? 'Dashboard' : 
             activeTab === 'create-vehicle' ? 'Vehicles' :
             activeTab === 'fleet-dashboard' ? 'Fleet' :
             activeTab === 'create-route' ? 'Routes' :
             activeTab === 'vehicle-dashboard' ? 'Live Tracking' :
             activeTab === 'edit-profile' ? 'Profile' :
             activeTab.replace('-', ' ')}
          </h1>
        </div>
        
        <div className="dashboard-header-right">
          {/* Notifications bell icon buttons */}
          <button className="dashboard-header-icon-btn" aria-label="Notifications">
            🔔
            <span className="badge-dot"></span>
          </button>
          
          <button className="dashboard-header-icon-btn" aria-label="Direct messages">
            💬
            <span className="badge-dot"></span>
          </button>

          {/* User profile avatar badge matching picture details */}
          <div className="dashboard-user-profile-badge">
            <img 
              src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=150" 
              alt="Operator Profile" 
            />
            <div className="user-meta">
              <div className="name">{stats.operator_profile.operator_name || 'North East Travels'}</div>
              <div className="role">Operator</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Contents */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* First Row: Welcome banner + Metrics */}
          <div className="responsive-grid-5">
            
            {/* Welcome banner */}
            <div className="glass-panel dashboard-welcome-card">
              <div className="banner-text">
                <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#0369a1', fontWeight: 600 }}>Welcome back,</h3>
                <h3 style={{ margin: '4px 0 12px 0', fontSize: '1.45rem', fontWeight: 800, color: '#0369a1' }}>{stats.operator_profile.operator_name || 'North East Travels'}</h3>
                <span className="banner-badge">
                  <span>✓</span> Verified Operator
                </span>
              </div>
              <img 
                className="banner-bus-img" 
                src="https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?q=80&w=300" 
                alt="NE Explore Blue Bus" 
              />
            </div>

            {/* Metrics cards */}
            <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px' }}>Total Revenue</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-main)' }}>₹ {stats.total_revenue > 0 ? stats.total_revenue.toLocaleString() : '12,45,000'}</div>
              </div>
              <div style={{ color: '#10b981', fontSize: '0.75rem', fontWeight: 600, marginTop: '8px' }}>
                ▲ +12.5% <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>from last month</span>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px' }}>Total Bookings</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>{stats.total_passengers > 0 ? stats.total_passengers : '1,234'}</div>
              </div>
              <div style={{ color: '#10b981', fontSize: '0.75rem', fontWeight: 600, marginTop: '8px' }}>
                ▲ +8.2% <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>from last month</span>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px' }}>Active Vehicles</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>{stats.active_vehicles_count > 0 ? stats.active_vehicles_count : '23'}</div>
              </div>
              <div style={{ color: '#10b981', fontSize: '0.75rem', fontWeight: 600, marginTop: '8px' }}>
                ▲ +2 <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>this week</span>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px' }}>Trips Today</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>{stats.trips_count > 0 ? stats.trips_count : '45'}</div>
              </div>
              <div style={{ color: 'var(--accent-primary)', fontSize: '0.75rem', fontWeight: 600, marginTop: '8px' }}>
                On 12 Routes
              </div>
            </div>

          </div>

          {/* Second Row: Earnings Line Chart & Bookings Donut Chart */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '24px' }} className="responsive-grid-2">
            
            {/* Earnings Overview Line Chart */}
            <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 600 }}>Earnings Overview</h3>
                <select style={{ padding: '6px 12px', width: 'auto', fontSize: '0.8rem', background: 'var(--bg-tertiary)' }} defaultValue="month">
                  <option value="month">This Month</option>
                  <option value="week">This Week</option>
                  <option value="year">This Year</option>
                </select>
              </div>
              
              {/* SVG Line Chart representing the earnings path curve */}
              <div style={{ width: '100%', height: '200px', display: 'flex', alignItems: 'flex-end', position: 'relative', paddingLeft: '40px', paddingBottom: '20px' }}>
                
                {/* Y-Axis labels */}
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'right', width: '30px' }}>
                  <div>₹1.5L</div>
                  <div>₹1.0L</div>
                  <div>₹50K</div>
                  <div>0</div>
                </div>

                {/* SVG Curves */}
                <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 500 160" preserveAspectRatio="none">
                  {/* Grid Lines */}
                  <line x1="0" y1="0" x2="500" y2="0" stroke="rgba(0,0,0,0.05)" strokeWidth="1" />
                  <line x1="0" y1="53" x2="500" y2="53" stroke="rgba(0,0,0,0.05)" strokeWidth="1" />
                  <line x1="0" y1="106" x2="500" y2="106" stroke="rgba(0,0,0,0.05)" strokeWidth="1" />
                  <line x1="0" y1="160" x2="500" y2="160" stroke="rgba(0,0,0,0.1)" strokeWidth="1" />

                  {/* Gradient fill path */}
                  <path 
                    d="M 0 130 C 50 110, 70 120, 100 95 C 130 70, 170 85, 200 65 C 230 45, 270 110, 300 95 C 330 80, 370 70, 400 45 C 430 20, 470 30, 500 25 L 500 160 L 0 160 Z"
                    fill="url(#chart-gradient)"
                    opacity="0.15"
                  />
                  {/* Stroke path line */}
                  <path 
                    d="M 0 130 C 50 110, 70 120, 100 95 C 130 70, 170 85, 200 65 C 230 45, 270 110, 300 95 C 330 80, 370 70, 400 45 C 430 20, 470 30, 500 25"
                    fill="none"
                    stroke="var(--accent-primary)"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />

                  {/* Defs definition for gradient area color fill */}
                  <defs>
                    <linearGradient id="chart-gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent-primary)" />
                      <stop offset="100%" stopColor="transparent" />
                    </linearGradient>
                  </defs>
                </svg>

                {/* X-Axis labels */}
                <div style={{ position: 'absolute', bottom: 0, left: '40px', right: 0, display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <span>1 May</span>
                  <span>5 May</span>
                  <span>10 May</span>
                  <span>15 May</span>
                  <span>20 May</span>
                  <span>25 May</span>
                  <span>30 May</span>
                </div>
              </div>
            </div>

            {/* Bookings Overview Donut Chart */}
            <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '16px' }}>Bookings Overview</h3>
              
              <div className="donut-container">
                {/* SVG Circular Donut Progress Ring */}
                <div style={{ position: 'relative', width: '120px', height: '120px', flexShrink: 0 }}>
                  <svg width="120" height="120" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth="12" />
                    <circle 
                      cx="60" 
                      cy="60" 
                      r="50" 
                      fill="none" 
                      stroke="var(--accent-primary)" 
                      strokeWidth="12" 
                      strokeDasharray="314" 
                      strokeDashoffset="66" // 79% confirmed progress
                      strokeLinecap="round"
                      transform="rotate(-90 60 60)"
                    />
                    <circle 
                      cx="60" 
                      cy="60" 
                      r="50" 
                      fill="none" 
                      stroke="#94a3b8" 
                      strokeWidth="12" 
                      strokeDasharray="314" 
                      strokeDashoffset="273" // 13% cancelled progress
                      strokeLinecap="round"
                      transform="rotate(194 60 60)"
                    />
                    <circle 
                      cx="60" 
                      cy="60" 
                      r="50" 
                      fill="none" 
                      stroke="#fbbf24" 
                      strokeWidth="12" 
                      strokeDasharray="314" 
                      strokeDashoffset="288" // 8% pending progress
                      strokeLinecap="round"
                      transform="rotate(241 60 60)"
                    />
                  </svg>
                  {/* Center Text inside Donut chart */}
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total</span>
                    <strong style={{ fontSize: '1.2rem', fontWeight: 700 }}>1,234</strong>
                  </div>
                </div>

                {/* Donut Chart Legend list details */}
                <div className="donut-legend-list">
                  <div className="donut-legend-item">
                    <div className="donut-legend-label">
                      <span className="donut-legend-dot" style={{ background: 'var(--accent-primary)' }}></span>
                      <span>Confirmed</span>
                    </div>
                    <span className="donut-legend-value">976 (79%)</span>
                  </div>
                  
                  <div className="donut-legend-item">
                    <div className="donut-legend-label">
                      <span className="donut-legend-dot" style={{ background: '#94a3b8' }}></span>
                      <span>Cancelled</span>
                    </div>
                    <span className="donut-legend-value">166 (13%)</span>
                  </div>

                  <div className="donut-legend-item">
                    <div className="donut-legend-label">
                      <span className="donut-legend-dot" style={{ background: '#fbbf24' }}></span>
                      <span>Pending</span>
                    </div>
                    <span className="donut-legend-value">102 (8%)</span>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Third Row: Recent Bookings Table & Live Vehicles Map */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '24px' }} className="responsive-grid-2">
            
            {/* Recent Bookings Table Card */}
            <div className="glass-panel" style={{ padding: '24px', overflowX: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 600 }}>Recent Bookings</h3>
                <span onClick={() => setActiveTab('trips')} style={{ color: 'var(--accent-primary)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                  View All
                </span>
              </div>

              <table className="responsive-table" style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid var(--border-color)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '10px 8px', textAlign: 'left' }}>PNR</th>
                    <th style={{ padding: '10px 8px', textAlign: 'left' }}>Passenger</th>
                    <th style={{ padding: '10px 8px', textAlign: 'left' }}>Route</th>
                    <th style={{ padding: '10px 8px', textAlign: 'left' }}>Date</th>
                    <th style={{ padding: '10px 8px', textAlign: 'left' }}>Seat(s)</th>
                    <th style={{ padding: '10px 8px', textAlign: 'left' }}>Amount</th>
                    <th style={{ padding: '10px 8px', textAlign: 'left' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td data-label="PNR" style={{ padding: '12px 8px' }}>NET23456</td>
                    <td data-label="Passenger" style={{ padding: '12px 8px' }}><strong>Rohit Sharma</strong></td>
                    <td data-label="Route" style={{ padding: '12px 8px' }}>Guwahati ➔ Shillong</td>
                    <td data-label="Date" style={{ padding: '12px 8px' }}>20 May 2025</td>
                    <td data-label="Seat(s)" style={{ padding: '12px 8px', fontWeight: 600 }}>A1, A2</td>
                    <td data-label="Amount" style={{ padding: '12px 8px', color: 'var(--accent-primary)', fontWeight: 600 }}>₹1,200</td>
                    <td data-label="Status" style={{ padding: '12px 8px' }}>
                      <span className="status-pill approved" style={{ fontSize: '0.65rem', padding: '2px 8px' }}>Confirmed</span>
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td data-label="PNR" style={{ padding: '12px 8px' }}>NET23457</td>
                    <td data-label="Passenger" style={{ padding: '12px 8px' }}><strong>Priya Das</strong></td>
                    <td data-label="Route" style={{ padding: '12px 8px' }}>Jorhat ➔ Dibrugarh</td>
                    <td data-label="Date" style={{ padding: '12px 8px' }}>20 May 2025</td>
                    <td data-label="Seat(s)" style={{ padding: '12px 8px', fontWeight: 600 }}>B3</td>
                    <td data-label="Amount" style={{ padding: '12px 8px', color: 'var(--accent-primary)', fontWeight: 600 }}>₹700</td>
                    <td data-label="Status" style={{ padding: '12px 8px' }}>
                      <span className="status-pill approved" style={{ fontSize: '0.65rem', padding: '2px 8px' }}>Confirmed</span>
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td data-label="PNR" style={{ padding: '12px 8px' }}>NET23458</td>
                    <td data-label="Passenger" style={{ padding: '12px 8px' }}><strong>Amit Singh</strong></td>
                    <td data-label="Route" style={{ padding: '12px 8px' }}>Tezpur ➔ Guwahati</td>
                    <td data-label="Date" style={{ padding: '12px 8px' }}>20 May 2025</td>
                    <td data-label="Seat(s)" style={{ padding: '12px 8px', fontWeight: 600 }}>C1, C2</td>
                    <td data-label="Amount" style={{ padding: '12px 8px', color: 'var(--accent-primary)', fontWeight: 600 }}>₹1,000</td>
                    <td data-label="Status" style={{ padding: '12px 8px' }}>
                      <span className="status-pill pending" style={{ fontSize: '0.65rem', padding: '2px 8px' }}>Pending</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Live Vehicles map card */}
            <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 600 }}>Live Vehicles</h3>
                <span onClick={() => { setActiveTab('vehicle-dashboard'); setSelectedVehicleForDashboard(stats.vehicles[0] || null); }} style={{ color: 'var(--accent-primary)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                  View All
                </span>
              </div>
              
              <div style={{ height: '160px', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                <iframe 
                  title="Live Location Map Overview"
                  width="100%" 
                  height="100%" 
                  style={{ border: 0 }}
                  src="https://maps.google.com/maps?q=Shillong&z=10&output=embed"
                />
              </div>
            </div>

          </div>

        </div>
      )}

      {activeTab === 'trips' && (
        <div className="glass-panel" style={{ padding: '30px' }}>
          {manifestTrip ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 className="gradient-text" style={{ fontSize: '1.5rem' }}>Passenger Manifest: {manifestTrip.full_route}</h3>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Depart: {manifestTrip.card_date} • {manifestTrip.card_time}</span>
              </div>

              {/* Trip Controls and Tracking Panel */}
              <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '15px' }}>
                  <div>
                    <h4 style={{ margin: '0 0 4px 0', fontSize: '1.1rem' }}>Trip Status: 
                      <span style={{ 
                        marginLeft: '8px', 
                        padding: '4px 10px', 
                        borderRadius: '12px', 
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        background: manifestTrip.status === 'departed' ? 'rgba(16,185,129,0.15)' : manifestTrip.status === 'completed' ? 'rgba(59,130,246,0.15)' : 'rgba(245,158,11,0.15)',
                        color: manifestTrip.status === 'departed' ? '#10b981' : manifestTrip.status === 'completed' ? '#3b82f6' : '#f59e0b'
                      }}>
                        {manifestTrip.status.toUpperCase()}
                      </span>
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      Vehicle: {manifestTrip.vehicle_details?.name} ({manifestTrip.vehicle_details?.vehicle_number}) • Driver: {manifestTrip.vehicle_details?.driver_name}
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {manifestTrip.status === 'scheduled' && (
                      <button 
                        onClick={() => handleStartTrip(manifestTrip.id)} 
                        className="btn btn-primary"
                        style={{ padding: '8px 16px', fontSize: '0.9rem' }}
                      >
                        🚀 Depart / Start Trip
                      </button>
                    )}

                    {manifestTrip.status === 'departed' && (
                      <>
                        {!isTracking ? (
                          <button 
                            onClick={() => {
                              setAutoTrackFailed(false);
                              startTracking(manifestTrip.id, false);
                            }} 
                            className="btn btn-primary"
                            style={{ padding: '8px 16px', fontSize: '0.9rem', background: '#10b981' }}
                          >
                            📡 Enable Live GPS
                          </button>
                        ) : (
                          <button 
                            onClick={stopTracking} 
                            className="btn btn-secondary"
                            style={{ padding: '8px 16px', fontSize: '0.9rem', color: '#ef4444', borderColor: '#ef4444' }}
                          >
                            📴 Stop GPS Sharing
                          </button>
                        )}

                        {!isSimulating ? (
                          <button 
                            onClick={() => startSimulation(manifestTrip.id)} 
                            className="btn btn-secondary"
                            style={{ padding: '8px 16px', fontSize: '0.9rem' }}
                          >
                            🗺️ Simulate Location Updates
                          </button>
                        ) : (
                          <button 
                            onClick={stopSimulation} 
                            className="btn btn-secondary"
                            style={{ padding: '8px 16px', fontSize: '0.9rem', color: '#f59e0b', borderColor: '#f59e0b' }}
                          >
                            ⏹️ Stop Simulation
                          </button>
                        )}

                        <button 
                          onClick={() => handleStopTrip(manifestTrip.id)} 
                          className="btn btn-secondary"
                          style={{ padding: '8px 16px', fontSize: '0.9rem', background: 'rgba(239,68,68,0.1)', border: 'none', color: '#f87171' }}
                        >
                          🏁 Complete Trip
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {(isTracking || isSimulating) && (
                  <div style={{ marginTop: '15px', padding: '10px 14px', background: 'rgba(16,185,129,0.05)', borderRadius: '8px', border: '1px solid rgba(16,185,129,0.2)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div className="pulse-indicator" style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
                    <span style={{ fontWeight: 500, color: '#34d399' }}>
                      {isTracking ? 'Device GPS tracking active. Sending coordinates every few seconds...' : simMessage}
                    </span>
                  </div>
                )}
              </div>

              {/* Driver Stoppage Control Panel */}
              {manifestTrip.status === 'departed' && manifestStops.length > 0 && (
                <div className="glass-panel animate-fade-in" style={{ padding: '24px', marginBottom: '30px', background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.03) 0%, rgba(16, 24, 40, 0.9) 100%)', border: '1px solid rgba(6, 182, 212, 0.15)' }}>
                  <h4 className="gradient-text" style={{ fontSize: '1.2rem', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    🚦 Driver Stoppage & Passenger Boarding Control
                  </h4>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                    Update your progress manually. Passenger tracking will update instantly with estimated arrival times based on your current stop and reported delay.
                  </p>

                  {/* Delay control */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '24px', flexWrap: 'wrap', background: 'rgba(255,255,255,0.02)', padding: '15px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Report delay (minutes)</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input 
                          type="number" 
                          value={delayMinutes} 
                          onChange={(e) => setDelayMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                          style={{ width: '90px', padding: '8px 12px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.95rem' }} 
                        />
                        <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>mins delay</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleUpdateStoppage(operatorNextStopId, true)}
                      className="btn btn-secondary btn-inline"
                      style={{ height: '38px', alignSelf: 'flex-end', fontSize: '0.85rem', width: 'auto' }}
                    >
                      💾 Update Delay
                    </button>
                  </div>

                  {/* Stops timeline */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {manifestStops.map((stop, idx) => {
                      // Compute passenger counts
                      const waitingCount = manifestBookings.filter(b => b.from_stop_id === stop.id && b.status !== 'cancelled' && b.status !== 'rejected').length;
                      const droppingCount = manifestBookings.filter(b => b.to_stop_id === stop.id && b.status !== 'cancelled' && b.status !== 'rejected').length;

                      // Determine stop state relative to the operatorNextStopId
                      const nextStopIdx = manifestStops.findIndex(s => s.id === operatorNextStopId);
                      
                      let isPassed = false;
                      let isActive = false;

                      if (nextStopIdx !== -1) {
                        if (idx < nextStopIdx) {
                          isPassed = true;
                        } else if (idx === nextStopIdx) {
                          isActive = true;
                        }
                      }

                      return (
                        <div 
                          key={stop.id} 
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'space-between', 
                            padding: '12px 16px', 
                            borderRadius: '10px', 
                            background: isActive ? 'rgba(6, 182, 212, 0.08)' : 'rgba(255,255,255,0.01)',
                            border: `1px solid ${isActive ? 'rgba(6, 182, 212, 0.3)' : 'var(--border-color)'}`,
                            opacity: isPassed ? 0.6 : 1,
                            transition: 'all 0.3s ease'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                              <div style={{ 
                                width: '22px', 
                                height: '22px', 
                                borderRadius: '50%', 
                                background: isPassed ? '#10b981' : isActive ? 'var(--accent-secondary)' : '#4b5563', 
                                border: isActive ? '4px solid rgba(6, 182, 212, 0.3)' : 'none',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.75rem',
                                color: '#fff',
                                fontWeight: 'bold',
                                boxShadow: isActive ? '0 0 10px rgba(6,182,212,0.5)' : 'none'
                              }}>
                                {isPassed ? '✓' : idx + 1}
                              </div>
                            </div>

                            <div>
                              <div style={{ fontWeight: 600, color: isActive ? 'var(--accent-secondary)' : 'var(--text-main)' }}>
                                {stop.stop_name}
                                {isActive && <span style={{ marginLeft: '8px', fontSize: '0.7rem', background: 'rgba(6, 182, 212, 0.2)', color: 'var(--accent-secondary)', padding: '2px 6px', borderRadius: '4px' }}>NEXT STOP</span>}
                              </div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', gap: '15px', marginTop: '4px' }}>
                                <span>Distance: {stop.distance_from_start} km</span>
                                <span>Offset: +{stop.arrival_time_offset} mins</span>
                              </div>
                            </div>
                          </div>

                          {/* Waiting Passengers and Actions */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                            {/* Passenger board/drop stats */}
                            <div style={{ display: 'flex', gap: '8px' }}>
                              {waitingCount > 0 && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(16,185,129,0.1)', color: '#34d399', padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, border: '1px solid rgba(16,185,129,0.2)' }}>
                                  🧑‍🤝‍🧑 {waitingCount} boarding
                                </span>
                              )}
                              {droppingCount > 0 && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(239,68,68,0.08)', color: '#f87171', padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, border: '1px solid rgba(239,68,68,0.15)' }}>
                                  🛑 {droppingCount} dropping
                                </span>
                              )}
                              {waitingCount === 0 && droppingCount === 0 && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No boarders/droppers</span>
                              )}
                            </div>

                            {/* Action buttons */}
                            <div style={{ display: 'flex', gap: '5px' }}>
                              {isActive ? (
                                <button
                                  onClick={() => handleMarkStopReached(stop, idx)}
                                  className="btn btn-primary btn-inline"
                                  style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', boxShadow: 'none', width: 'auto' }}
                                >
                                  👉 Reached Stop
                                </button>
                              ) : (
                                !isPassed && (
                                  <button
                                    onClick={() => handleSetNextStop(stop)}
                                    className="btn btn-secondary btn-inline"
                                    style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'rgba(255,255,255,0.02)', width: 'auto' }}
                                  >
                                    Set Next
                                  </button>
                                )
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {manifestLoading ? (
                <div>Loading passengers...</div>
              ) : manifestBookings.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table className="responsive-table">
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '12px 8px' }}>Seat</th>
                        <th style={{ padding: '12px 8px' }}>Passenger Name</th>
                        <th style={{ padding: '12px 8px' }}>Phone</th>
                        <th style={{ padding: '12px 8px' }}>Booking Ref</th>
                        <th style={{ padding: '12px 8px' }}>Price</th>
                        <th style={{ padding: '12px 8px' }}>Status</th>
                        <th style={{ padding: '12px 8px', textAlign: 'center' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {manifestBookings.map((b) => (
                        <tr key={b.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td data-label="Seat" style={{ padding: '16px 8px', fontWeight: 600, color: 'var(--accent-primary)' }}>{b.seat_number}</td>
                          <td data-label="Passenger" style={{ padding: '16px 8px' }}>
                            <div>{b.passenger_name}</div>
                            {b.status === 'cancelled' && b.refund_method && (
                              <div style={{ fontSize: '0.75rem', color: '#fbbf24', marginTop: '4px', padding: '6px', background: 'rgba(245,158,11,0.05)', borderRadius: '4px', border: '1px solid rgba(245,158,11,0.15)', whiteSpace: 'normal', maxWidth: '280px' }}>
                                ⚠️ <strong>Refund Details:</strong> {b.refund_method === 'upi' ? `UPI: ${b.refund_upi_id}` : `Bank: ${b.refund_account_holder} | A/C: ${b.refund_bank_account} | IFSC: ${b.refund_bank_ifsc} | Bank: ${b.refund_bank_name}`}
                              </div>
                            )}
                          </td>
                          <td data-label="Phone" style={{ padding: '16px 8px' }}>{b.passenger_phone}</td>
                          <td data-label="Booking Ref" style={{ padding: '16px 8px' }}>{b.booking_ref}</td>
                          <td data-label="Price" style={{ padding: '16px 8px' }}>₹{b.segment_price}</td>
                          <td data-label="Status" style={{ padding: '16px 8px' }}>
                            <span style={{ fontSize: '0.8rem', padding: '4px 8px', borderRadius: '4px', background: b.status === 'approved' || b.status === 'paid' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: b.status === 'approved' || b.status === 'paid' ? '#34d399' : '#f87171' }}>
                              {b.status_display}
                            </span>
                          </td>
                          <td data-label="Actions" style={{ padding: '16px 8px', display: 'flex', gap: '8px', justifyContent: 'center' }}>
                            {b.status === 'pending' && (
                              <>
                                <button onClick={() => handleStatusUpdate(b.id, 'approved')} className="btn btn-primary" style={{ padding: '4px 8px', fontSize: '0.75rem' }}>
                                  Approve
                                </button>
                                <button onClick={() => handleStatusUpdate(b.id, 'rejected')} className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem', background: 'rgba(239,68,68,0.1)', border: 'none', color: '#f87171' }}>
                                  Reject
                                </button>
                              </>
                            )}
                            {b.status === 'approved' && (
                              <button onClick={() => handleStatusUpdate(b.id, 'paid')} className="btn btn-primary" style={{ padding: '4px 8px', fontSize: '0.75rem', background: '#059669' }}>
                                Collect Cash
                              </button>
                            )}
                            {b.status !== 'cancelled' && b.status !== 'rejected' && (
                              <button onClick={() => handleStatusUpdate(b.id, 'cancelled')} className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }}>
                                Cancel
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>No seats reserved yet for this trip.</div>
              )}
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>
              Please select a trip from the <strong>Fleet Overview</strong> departures list to display the passenger manifest.
            </div>
          )}
        </div>
      )}

      {activeTab === 'create-trip' && (
        <div className="glass-panel" style={{ padding: '30px', maxWidth: '600px', margin: '0 auto' }}>
          <h3 className="gradient-text" style={{ fontSize: '1.5rem', marginBottom: '20px' }}>Schedule A New Trip</h3>
          
          <form onSubmit={handleCreateTrip}>
            <div className="form-group">
              <label>Select Route</label>
              <select required value={selectedRoute} onChange={(e) => setSelectedRoute(e.target.value)}>
                <option value="">-- Choose Route --</option>
                {stats.trips.reduce((acc: Route[], t: Trip) => {
                  if (!acc.find(r => r.id === t.route_details.id)) {
                    acc.push({ id: t.route_details.id, source: t.route_details.source, destination: t.route_details.destination });
                  }
                  return acc;
                }, []).map((r: Route) => (
                  <option key={r.id} value={r.id}>{r.source} to {r.destination}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Select Vehicle</label>
              <select required value={selectedVehicle} onChange={(e) => setSelectedVehicle(e.target.value)}>
                <option value="">-- Choose Vehicle --</option>
                {stats.vehicles.map((v: Vehicle) => (
                  <option key={v.id} value={v.id}>{v.name} ({v.vehicle_number})</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>First Departure Date & Time</label>
              <input 
                type="datetime-local" 
                required 
                value={departureDatetime} 
                onChange={(e) => setDepartureDatetime(e.target.value)} 
              />
            </div>

            <div className="form-group">
              <label>Additional Daily Times (Optional, comma-separated e.g. "11:00, 15:30")</label>
              <input 
                type="text" 
                value={additionalTimesStr} 
                onChange={(e) => setAdditionalTimesStr(e.target.value)} 
                placeholder="e.g. 11:00, 15:30"
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <input 
                type="checkbox" 
                id="isDaily" 
                checked={isDaily} 
                onChange={(e) => setIsDaily(e.target.checked)} 
                style={{ width: 'auto' }}
              />
              <label htmlFor="isDaily" style={{ margin: 0, cursor: 'pointer' }}>Schedule Daily Recurring Trips</label>
            </div>

            {isDaily && (
              <div className="form-group">
                <label>Number of Days (Daily Schedule)</label>
                <input 
                  type="number" 
                  min="1" 
                  max="90" 
                  value={scheduleDays} 
                  onChange={(e) => setScheduleDays(parseInt(e.target.value))} 
                />
              </div>
            )}

            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
              Generate Scheduled Trip(s)
            </button>
          </form>
        </div>
      )}

      {activeTab === 'create-route' && (
        <div className="glass-panel" style={{ padding: '30px', maxWidth: '750px', margin: '0 auto' }}>
          <h3 className="gradient-text" style={{ fontSize: '1.5rem', marginBottom: '20px' }}>Create Route & Stops</h3>
          
          <form onSubmit={handleCreateRoute}>
            <div className="responsive-grid-2">
              <div className="form-group">
                <label>Source City</label>
                <input 
                  type="text" 
                  required 
                  value={routeSource} 
                  onChange={(e) => setRouteSource(e.target.value)} 
                  placeholder="e.g. Guwahati"
                />
              </div>
              <div className="form-group">
                <label>Destination City</label>
                <input 
                  type="text" 
                  required 
                  value={routeDest} 
                  onChange={(e) => setRouteDest(e.target.value)} 
                  placeholder="e.g. Shillong"
                />
              </div>
            </div>

            <div className="responsive-grid-2">
              <div className="form-group">
                <label>Estimated Total Duration (e.g. 3 hours)</label>
                <input 
                  type="text" 
                  required 
                  value={routeDuration} 
                  onChange={(e) => setRouteDuration(e.target.value)} 
                  placeholder="3h 30m"
                />
              </div>
              <div className="form-group">
                <label>Base Price (Full Route Cost)</label>
                <input 
                  type="number" 
                  required 
                  value={routeBasePrice} 
                  onChange={(e) => setRouteBasePrice(e.target.value)} 
                  placeholder="600"
                />
              </div>
            </div>

            {/* Dynamic Stop adding */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px', marginTop: '10px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h4>Intermediate Transit Stops</h4>
                <button type="button" onClick={handleAddStop} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                  + Add Transit Stop
                </button>
              </div>

              {stops.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {stops.map((stop, idx) => (
                    <div key={idx} className="stops-row-grid" style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '10px' }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Stop Name</label>
                        <input 
                          type="text" 
                          required 
                          value={stop.name} 
                          onChange={(e) => handleStopChange(idx, 'name', e.target.value)} 
                          placeholder="Stop name"
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Distance (km)</label>
                        <input 
                          type="number" 
                          required 
                          value={stop.distance} 
                          onChange={(e) => handleStopChange(idx, 'distance', parseFloat(e.target.value))} 
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Price from Src</label>
                        <input 
                          type="number" 
                          required 
                          value={stop.price} 
                          onChange={(e) => handleStopChange(idx, 'price', parseFloat(e.target.value))} 
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Offset (min)</label>
                        <input 
                          type="number" 
                          required 
                          value={stop.time_offset_minutes} 
                          onChange={(e) => handleStopChange(idx, 'time_offset_minutes', parseInt(e.target.value))} 
                        />
                      </div>
                      <button type="button" onClick={() => handleRemoveStop(idx)} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '1.25rem', cursor: 'pointer', paddingBottom: '10px' }}>
                        🗑
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textAlign: 'center', padding: '16px 0' }}>No intermediate stops added yet. Full route bookings only.</p>
              )}
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
              Create Route & Stops
            </button>
          </form>
        </div>
      )}

      {activeTab === 'create-vehicle' && (
        <div className="glass-panel" style={{ padding: '30px', maxWidth: '850px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div>
              <h3 className="gradient-text" style={{ fontSize: '1.75rem', marginBottom: '4px' }}>Fleet Registration (Fleet Entry)</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Register multiple vehicles dynamically under your account</p>
            </div>
            <button 
              type="button" 
              onClick={() => setFleetVehicles([...fleetVehicles, {
                name: '', vehicle_number: '', vehicle_type: 'sumo', capacity: 10,
                driver_name: '', driver_contact: '', rc_url: '', vehicle_photo_url: '',
                rc_uploading: false, photo_uploading: false
              }])}
              className="btn btn-secondary btn-inline"
              style={{ padding: '8px 16px', fontSize: '0.85rem' }}
            >
              ➕ Add Another Vehicle
            </button>
          </div>

          <form onSubmit={handleRegisterFleet} style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            {fleetVehicles.map((vehicle, idx) => (
              <div key={idx} style={{ background: 'rgba(255, 255, 255, 0.01)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px', position: 'relative' }} className="hover-lift animate-fade-in">
                {fleetVehicles.length > 1 && (
                  <button 
                    type="button" 
                    onClick={() => setFleetVehicles(fleetVehicles.filter((_, i) => i !== idx))}
                    style={{ position: 'absolute', top: '16px', right: '16px', background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', border: '1px solid #ef4444', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer' }}
                  >
                    Remove
                  </button>
                )}
                
                <h4 style={{ fontSize: '1rem', color: 'var(--accent-primary)', marginBottom: '16px', fontWeight: 600 }}>Vehicle #{idx + 1}</h4>
                
                <div className="responsive-grid-2" style={{ gap: '15px', marginBottom: '15px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Vehicle Name (e.g. Silver Sumo)</label>
                    <input 
                      type="text" 
                      required 
                      value={vehicle.name} 
                      onChange={(e) => {
                        const updated = [...fleetVehicles];
                        updated[idx].name = e.target.value;
                        setFleetVehicles(updated);
                      }} 
                      placeholder="Enter vehicle name"
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Vehicle Number (Unique)</label>
                    <input 
                      type="text" 
                      required 
                      value={vehicle.vehicle_number} 
                      onChange={(e) => {
                        const updated = [...fleetVehicles];
                        updated[idx].vehicle_number = e.target.value;
                        setFleetVehicles(updated);
                      }} 
                      placeholder="e.g. ML-05-9999"
                    />
                  </div>
                </div>

                <div className="responsive-grid-2" style={{ gap: '15px', marginBottom: '15px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Vehicle Type</label>
                    <select 
                      value={vehicle.vehicle_type} 
                      onChange={(e) => {
                        const updated = [...fleetVehicles];
                        updated[idx].vehicle_type = e.target.value;
                        setFleetVehicles(updated);
                      }}
                    >
                      <option value="sumo">Tata Sumo</option>
                      <option value="traveller">Force Traveller</option>
                      <option value="bus">Bus</option>
                      <option value="taxi">Local Taxi</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Seating Capacity</label>
                    <input 
                      type="number" 
                      min="1" 
                      max="50" 
                      required 
                      value={vehicle.capacity} 
                      onChange={(e) => {
                        const updated = [...fleetVehicles];
                        updated[idx].capacity = parseInt(e.target.value) || 10;
                        setFleetVehicles(updated);
                      }} 
                    />
                  </div>
                </div>

                <div className="responsive-grid-2" style={{ gap: '15px', marginBottom: '15px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Driver Name</label>
                    <input 
                      type="text" 
                      required 
                      value={vehicle.driver_name} 
                      onChange={(e) => {
                        const updated = [...fleetVehicles];
                        updated[idx].driver_name = e.target.value;
                        setFleetVehicles(updated);
                      }} 
                      placeholder="Driver name"
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Driver Contact Number</label>
                    <input 
                      type="text" 
                      required 
                      value={vehicle.driver_contact} 
                      onChange={(e) => {
                        const updated = [...fleetVehicles];
                        updated[idx].driver_contact = e.target.value;
                        setFleetVehicles(updated);
                      }} 
                      placeholder="10-digit number"
                    />
                  </div>
                </div>

                {/* Documents Upload Section */}
                <div className="responsive-grid-2" style={{ gap: '20px', marginTop: '16px', background: 'rgba(255,255,255,0.01)', padding: '16px', borderRadius: '12px', border: '1px dashed var(--border-color)' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ color: 'var(--text-main)', fontWeight: 500 }}>RC Document (PDF/Image)</label>
                    <input 
                      type="file" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFleetVehicleFileChange(idx, 'rc', file);
                      }}
                      style={{ padding: '6px 0', fontSize: '0.8rem' }}
                    />
                    {vehicle.rc_uploading && <span style={{ fontSize: '0.75rem', color: 'var(--accent-secondary)' }}>Uploading RC...</span>}
                    {vehicle.rc_url && <span style={{ fontSize: '0.75rem', color: '#34d399' }}>✓ RC Uploaded successfully</span>}
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ color: 'var(--text-main)', fontWeight: 500 }}>Vehicle Photo (Exterior)</label>
                    <input 
                      type="file" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFleetVehicleFileChange(idx, 'vehicle_photo', file);
                      }}
                      style={{ padding: '6px 0', fontSize: '0.8rem' }}
                    />
                    {vehicle.photo_uploading && <span style={{ fontSize: '0.75rem', color: 'var(--accent-secondary)' }}>Uploading Photo...</span>}
                    {vehicle.vehicle_photo_url && <span style={{ fontSize: '0.75rem', color: '#34d399' }}>✓ Photo Uploaded successfully</span>}
                  </div>
                </div>

              </div>
            ))}

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }} disabled={loading}>
              {loading ? 'Registering Fleet...' : `Register Fleet (${fleetVehicles.length} Vehicles) →`}
            </button>
          </form>
        </div>
      )}

      {activeTab === 'fleet-dashboard' && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          
          {/* KPI Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '8px' }}>Total Fleet Vehicles</div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent-primary)' }}>{stats.vehicles.length}</div>
            </div>
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '8px' }}>Active Vehicles</div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#34d399' }}>
                {stats.vehicles.filter((v: any) => v.is_active && v.verification_status === 'approved').length}
              </div>
            </div>
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '8px' }}>Pending Approvals</div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#fbbf24' }}>
                {stats.vehicles.filter((v: any) => v.verification_status === 'pending').length}
              </div>
            </div>
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '8px' }}>Total Revenue</div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent-secondary)' }}>₹{stats.total_revenue}</div>
            </div>
          </div>

          {/* Revenue Analytics per Vehicle */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '16px', fontWeight: 600 }}>Revenue Analytics by Vehicle</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {stats.vehicles.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '10px' }}>No vehicles registered yet.</div>
              ) : (
                stats.vehicles.map((v: any, idx: number) => {
                  // Distribute earnings mockingly or compute
                  const vehicleEarnings = Math.max(0, Math.round((stats.total_revenue * (idx === 0 ? 0.6 : idx === 1 ? 0.3 : 0.1))));
                  const maxEarnings = stats.total_revenue || 1;
                  const percentage = Math.round((vehicleEarnings / maxEarnings) * 100);
                  
                  return (
                    <div key={v.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                        <span><strong>{v.name}</strong> ({v.vehicle_number})</span>
                        <span>₹{vehicleEarnings} ({percentage}%)</span>
                      </div>
                      <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${percentage}%`, background: 'var(--accent-primary)', borderRadius: '4px' }}></div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Vehicles List / Grid */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Fleet Management Directory</h3>
              <button 
                onClick={() => setActiveTab('create-vehicle')} 
                className="btn btn-primary btn-inline" 
                style={{ padding: '6px 14px', fontSize: '0.8rem', borderRadius: '6px' }}
              >
                ➕ Fleet Entry
              </button>
            </div>

            {stats.vehicles.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>No vehicles registered yet. Go to Fleet Entry to add your vehicles.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                {stats.vehicles.map((vehicle: any) => (
                  <div 
                    key={vehicle.id} 
                    style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
                    className="hover-lift"
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <span style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', background: 'var(--bg-tertiary)', color: 'var(--accent-primary)', textTransform: 'uppercase', fontWeight: 600 }}>
                          {vehicle.vehicle_type}
                        </span>
                        
                        <div style={{ display: 'flex', gap: '5px' }}>
                          <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, background: vehicle.verification_status === 'approved' ? 'rgba(16,185,129,0.1)' : vehicle.verification_status === 'pending' ? 'rgba(251,191,36,0.1)' : 'rgba(239,68,68,0.1)', color: vehicle.verification_status === 'approved' ? '#34d399' : vehicle.verification_status === 'pending' ? '#fbbf24' : '#f87171' }}>
                            {vehicle.verification_status.toUpperCase()}
                          </span>
                          <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, background: vehicle.is_active ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)', color: vehicle.is_active ? '#34d399' : 'var(--text-muted)' }}>
                            {vehicle.is_active ? 'ACTIVE' : 'INACTIVE'}
                          </span>
                        </div>
                      </div>

                      <h4 style={{ fontSize: '1.1rem', marginBottom: '4px', color: 'var(--text-main)' }}>{vehicle.name}</h4>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '12px' }}>Plate: <strong>{vehicle.vehicle_number}</strong></p>

                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '10px', marginBottom: '16px' }}>
                        <div>👤 <strong>Driver:</strong> {vehicle.driver_name}</div>
                        <div>📞 <strong>Contact:</strong> {vehicle.driver_contact}</div>
                        <div>👥 <strong>Capacity:</strong> {vehicle.capacity} Seats</div>
                      </div>
                    </div>

                    <button 
                      onClick={() => {
                        setSelectedVehicleForDashboard(vehicle);
                        setActiveTab('vehicle-dashboard');
                      }}
                      className="btn btn-secondary" 
                      style={{ width: '100%', padding: '8px 0', fontSize: '0.8rem', borderRadius: '8px' }}
                    >
                      Console & Tracking →
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'vehicle-dashboard' && selectedVehicleForDashboard && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '16px 24px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <div>
              <span 
                onClick={() => {
                  // Stop simulations on back
                  if (vehicleSimulating) {
                    clearInterval(vehicleSimInterval);
                    setVehicleSimulating(false);
                  }
                  setActiveTab('fleet-dashboard');
                  setSelectedVehicleForDashboard(null);
                }} 
                style={{ cursor: 'pointer', color: 'var(--accent-primary)', fontSize: '0.85rem', fontWeight: 500, display: 'inline-block', marginBottom: '4px' }}
              >
                ← Back to Fleet Dashboard
              </span>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
                {selectedVehicleForDashboard.name} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 400 }}>({selectedVehicleForDashboard.vehicle_number})</span>
              </h2>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Device Status:</span>
              <button 
                onClick={async () => {
                  const newActiveState = !selectedVehicleForDashboard.is_active;
                  try {
                    // Update locally and simulate save
                    setSelectedVehicleForDashboard({
                      ...selectedVehicleForDashboard,
                      is_active: newActiveState
                    });
                    
                    // Update state list
                    if (stats) {
                      const updatedVehicles = stats.vehicles.map((v: any) => 
                        v.id === selectedVehicleForDashboard.id ? { ...v, is_active: newActiveState } : v
                      );
                      setStats({ ...stats, vehicles: updatedVehicles });
                    }
                  } catch (err) {
                    console.error(err);
                  }
                }}
                className="btn btn-secondary btn-inline" 
                style={{ 
                  padding: '6px 12px', 
                  fontSize: '0.75rem', 
                  background: selectedVehicleForDashboard.is_active ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', 
                  color: selectedVehicleForDashboard.is_active ? '#34d399' : '#f87171',
                  borderColor: selectedVehicleForDashboard.is_active ? '#10b981' : '#ef4444',
                  margin: 0
                }}
              >
                {selectedVehicleForDashboard.is_active ? '🟢 ONLINE' : '🔴 OFFLINE'}
              </button>
            </div>
          </div>

          {/* Grid Control Board */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
            
            {/* Left: GPS Simulation */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '1.15rem', marginBottom: '16px', fontWeight: 600, color: 'var(--accent-primary)' }}>📍 Live GPS & Tracking Simulator</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '8px', fontFamily: 'monospace', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div>🛰️ <strong>GPS Signal:</strong> {selectedVehicleForDashboard.is_active ? 'CONNECTED' : 'DISCONNECTED'}</div>
                  <div>🌐 <strong>Latitude:</strong> {vehicleSimulating ? vehicleSimLat.toFixed(6) : '26.144500'}</div>
                  <div>🌐 <strong>Longitude:</strong> {vehicleSimulating ? vehicleSimLng.toFixed(6) : '91.736200'}</div>
                  <div>⚡ <strong>Current Speed:</strong> {vehicleSimulating ? vehicleSimSpeed : '0'} km/h</div>
                  <div>🛣️ <strong>Current Segment:</strong> Guwahati ➔ Nongpoh (Route Stop #1)</div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  {!vehicleSimulating ? (
                    <button 
                      onClick={() => {
                        if (!selectedVehicleForDashboard.is_active) {
                          alert('Please toggle the vehicle device status to ONLINE first.');
                          return;
                        }
                        setVehicleSimulating(true);
                        setVehicleSimSpeed(45);
                        const interval = setInterval(() => {
                          setVehicleSimLat(prev => prev + (Math.random() - 0.5) * 0.001);
                          setVehicleSimLng(prev => prev + (Math.random() - 0.5) * 0.001);
                          setVehicleSimSpeed(() => Math.round(40 + Math.random() * 25));
                        }, 3000);
                        setVehicleSimInterval(interval);
                      }}
                      className="btn btn-primary" 
                      style={{ flex: 1, padding: '10px', fontSize: '0.8rem', margin: 0 }}
                    >
                      🚀 Start Route Tracking
                    </button>
                  ) : (
                    <button 
                      onClick={() => {
                        clearInterval(vehicleSimInterval);
                        setVehicleSimulating(false);
                        setVehicleSimSpeed(0);
                      }}
                      className="btn btn-secondary" 
                      style={{ flex: 1, padding: '10px', fontSize: '0.8rem', margin: 0, borderColor: '#ef4444', color: '#f87171' }}
                    >
                      ⏹️ Stop Tracking
                    </button>
                  )}
                </div>

                {/* Delay Control */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Trip Delay Manager</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Notify passengers in real-time</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button 
                      onClick={() => setDelayMinutes(p => Math.max(0, p - 5))} 
                      className="btn btn-secondary" 
                      style={{ padding: '4px 10px', margin: 0, fontSize: '0.8rem' }}
                    >
                      -
                    </button>
                    <span style={{ fontSize: '0.9rem', fontWeight: 'bold', minWidth: '40px', textAlign: 'center', color: delayMinutes > 0 ? '#fbbf24' : 'var(--text-main)' }}>
                      {delayMinutes}m
                    </span>
                    <button 
                      onClick={() => setDelayMinutes(p => p + 5)} 
                      className="btn btn-secondary" 
                      style={{ padding: '4px 10px', margin: 0, fontSize: '0.8rem' }}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Passenger Manifest List */}
            <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ fontSize: '1.15rem', marginBottom: '16px', fontWeight: 600, color: 'var(--accent-secondary)' }}>👥 Passenger Manifest</h3>
              
              <div style={{ overflowX: 'auto', flex: 1 }}>
                <table className="responsive-table" style={{ fontSize: '0.8rem', width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <th style={{ padding: '8px 4px' }}>Name</th>
                      <th style={{ padding: '8px 4px' }}>Seat</th>
                      <th style={{ padding: '8px 4px' }}>Route</th>
                      <th style={{ padding: '8px 4px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Mocked/Real Booking Passenger manifest */}
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '8px 4px' }}><strong>Kashyap Abhijeet</strong><br/><span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>+91 98765 43210</span></td>
                      <td style={{ padding: '8px 4px' }}>Seat 3</td>
                      <td style={{ padding: '8px 4px' }}>Guwahati ➔ Shillong</td>
                      <td style={{ padding: '8px 4px', color: '#34d399' }}>PAID</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '8px 4px' }}><strong>Sachin Kumar</strong><br/><span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>+91 99887 76655</span></td>
                      <td style={{ padding: '8px 4px' }}>Seat 4</td>
                      <td style={{ padding: '8px 4px' }}>Nongpoh ➔ Shillong</td>
                      <td style={{ padding: '8px 4px', color: '#fbbf24' }}>CONFIRMED</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Bottom Grid: Analytics & Documents */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
            {/* Analytics */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '1.15rem', marginBottom: '16px', fontWeight: 600 }}>📊 Performance Analytics</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div style={{ background: 'rgba(255,255,255,0.01)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>On-Time Rate</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#34d399' }}>98.2%</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.01)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Operator Rating</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#fbbf24' }}>★ 4.90</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.01)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Trips Completed</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>42</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.01)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Daily Earnings</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#34d399' }}>₹3,450</div>
                </div>
              </div>
            </div>

            {/* Documents */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '1.15rem', marginBottom: '16px', fontWeight: 600 }}>📄 Vehicle Registration Documents</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Registration Certificate (RC)</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Uploaded on vehicle creation</div>
                  </div>
                  {selectedVehicleForDashboard.rc_url ? (
                    <a 
                      href={`${api.defaults.baseURL?.replace('/api/transport/', '')}${selectedVehicleForDashboard.rc_url}`} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="btn btn-secondary btn-inline" 
                      style={{ padding: '6px 12px', fontSize: '0.75rem', margin: 0 }}
                    >
                      View RC File
                    </a>
                  ) : (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No document</span>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Vehicle Photo</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Exterior vehicle verification</div>
                  </div>
                  {selectedVehicleForDashboard.vehicle_photo_url ? (
                    <a 
                      href={`${api.defaults.baseURL?.replace('/api/transport/', '')}${selectedVehicleForDashboard.vehicle_photo_url}`} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="btn btn-secondary btn-inline" 
                      style={{ padding: '6px 12px', fontSize: '0.75rem', margin: 0 }}
                    >
                      View Photo
                    </a>
                  ) : (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No photo</span>
                  )}
                </div>
              </div>
            </div>
          </div>

        </div>
      )}

      {activeTab === 'edit-profile' && (
        <div className="glass-panel" style={{ padding: '30px', maxWidth: '600px', margin: '0 auto' }}>
          <h3 className="gradient-text" style={{ fontSize: '1.5rem', marginBottom: '20px' }}>Operator Profile Settings</h3>
          
          <form onSubmit={handleUpdateProfile}>
            <div className="form-group">
              <label>Operator Agency Name</label>
              <input 
                type="text" 
                required 
                value={profileName} 
                onChange={(e) => setProfileName(e.target.value)} 
                placeholder="Enter transport agency name"
              />
            </div>

            <div className="form-group">
              <label>Contact Phone Number</label>
              <input 
                type="text" 
                value={profilePhone} 
                onChange={(e) => setProfilePhone(e.target.value)} 
                placeholder="Enter contact number"
              />
            </div>

            <div className="form-group">
              <label>Business Address</label>
              <textarea 
                rows={3} 
                value={profileAddress} 
                onChange={(e) => setProfileAddress(e.target.value)} 
                placeholder="Enter business location address"
              />
            </div>

            <div className="form-group">
              <label>UPI ID (for ticket payments)</label>
              <input 
                type="text" 
                value={profileUpi} 
                onChange={(e) => setProfileUpi(e.target.value)} 
                placeholder="e.g. name@upi"
              />
            </div>

            <div className="form-group">
              <label>Bank Account Details (Alternate payment option)</label>
              <textarea 
                rows={3} 
                value={profileBank} 
                onChange={(e) => setProfileBank(e.target.value)} 
                placeholder="e.g. Account Number, IFSC Code, Bank Name"
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
              Save Profile Settings
            </button>
          </form>
        </div>
      )}

      {activeTab === 'support-desk' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 className="gradient-text" style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '16px' }}>Help Center & Chat Support</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '24px' }}>
              Welcome to the NE Explore Support Desk. Access self-help resources, book an onboarding agent, or chat with our automated assistant.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '24px' }} className="responsive-grid-2">
              {/* Help Center FAQs */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h4 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '8px' }}>Frequently Asked Questions</h4>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {[
                    { q: 'How do I upload vehicle RC and photos?', a: 'Go to Fleet Dashboard, select "Fleet Entry", and upload your vehicle documents (RC PDF/image and exterior photo). Admin reviews typically take 1-2 hours.' },
                    { q: 'How long does operator profile approval take?', a: 'Admin evaluation and verification of operator profiles generally completes within 24 hours of submission.' },
                    { q: 'How do I receive payments?', a: 'Earnings are disbursed directly to your bank account or UPI ID. Make sure to configure your refund and payout credentials in the Profile tab.' },
                    { q: 'How does live GPS tracking work?', a: 'On your Vehicle Dashboard, select a vehicle, click "Console" under active tracking, and click "Start GPS Simulation" or enable live device uploads.' }
                  ].map((faq, i) => (
                    <details key={i} style={{ background: 'rgba(255, 255, 255, 0.01)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px' }}>
                      <summary style={{ fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', outline: 'none', userSelect: 'none' }}>
                        {faq.q}
                      </summary>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.825rem', marginTop: '8px', lineHeight: '1.4' }}>
                        {faq.a}
                      </p>
                    </details>
                  ))}
                </div>

                {/* Book an Agent Form */}
                <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                  <h4 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '12px' }}>Book an Agent</h4>
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    alert('Request submitted! An onboarding assistant will contact you within 15 minutes.');
                  }} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div className="responsive-grid-2" style={{ gap: '12px' }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label style={{ fontSize: '0.75rem' }}>Name</label>
                        <input type="text" placeholder="Your Name" required defaultValue={stats?.operator_profile?.operator_name || ''} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label style={{ fontSize: '0.75rem' }}>Phone Number</label>
                        <input type="text" placeholder="10-digit number" required defaultValue={stats?.operator_profile?.phone || ''} />
                      </div>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.75rem' }}>Query Topic</label>
                      <select required>
                        <option value="onboarding">Fleet Onboarding Help</option>
                        <option value="verification">Verification Issue</option>
                        <option value="payments">Earning & Payouts</option>
                        <option value="gps">GPS & Tracking Issue</option>
                      </select>
                    </div>
                    <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                      Schedule Call Now
                    </button>
                  </form>
                </div>
              </div>

              {/* Chat Support Interface */}
              <div className="glass-panel" style={{ padding: '16px', height: '450px', display: 'flex', flexDirection: 'column', background: 'rgba(16, 24, 40, 0.92)' }}>
                <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', marginBottom: '12px' }}>
                  <strong style={{ fontSize: '0.9rem' }}>Chat Support Assistant</strong>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Automated assistant for quick compliance queries</div>
                </div>
                
                {/* Chat Message History */}
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px', marginBottom: '12px' }}>
                  {supportMessages.map((m, i) => (
                    <div key={i} style={{
                      alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start',
                      background: m.sender === 'user' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.06)',
                      color: '#ffffff',
                      padding: '8px 12px',
                      borderRadius: '10px',
                      fontSize: '0.8rem',
                      maxWidth: '85%'
                    }}>
                      {m.text}
                    </div>
                  ))}
                </div>

                {/* Chat Input form */}
                <form onSubmit={(e) => {
                  e.preventDefault();
                  if (!supportInput.trim()) return;
                  const text = supportInput;
                  setSupportInput('');
                  setSupportMessages(prev => [...prev, { sender: 'user', text }]);
                  setTimeout(() => {
                    setSupportMessages(prev => [...prev, {
                      sender: 'bot',
                      text: `Thank you. A support representative has received your request: "${text}". We will assist you shortly.`
                    }]);
                  }, 800);
                }} style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={supportInput}
                    onChange={(e) => setSupportInput(e.target.value)}
                    placeholder="Type a message..."
                    style={{ flex: 1, padding: '8px 12px', fontSize: '0.85rem' }}
                  />
                  <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                    Send
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Floating Support Chat Widget */}
      <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 1000, fontFamily: 'var(--font-main, sans-serif)' }}>
        {!supportWidgetOpen ? (
          <button 
            onClick={() => setSupportWidgetOpen(true)}
            style={{ 
              background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)', 
              color: '#ffffff', 
              border: 'none', 
              borderRadius: '50px', 
              padding: '12px 24px', 
              fontSize: '0.9rem', 
              fontWeight: 600, 
              cursor: 'pointer', 
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.3)', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              transition: 'transform 0.2s ease, box-shadow 0.2s ease'
            }}
            className="hover-lift"
          >
            <span>💬 Need Help?</span>
          </button>
        ) : (
          <div 
            className="glass-panel animate-fade-in" 
            style={{ 
              width: '350px', 
              height: '450px', 
              display: 'flex', 
              flexDirection: 'column', 
              boxShadow: '0 12px 40px rgba(0, 0, 0, 0.4)', 
              borderRadius: '16px', 
              border: '1px solid var(--border-color)', 
              overflow: 'hidden', 
              background: 'rgba(16, 24, 40, 0.92)',
              backdropFilter: 'blur(20px)'
            }}
          >
            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)', padding: '16px', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>Operator Support Agent</div>
                <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>Active • Setup Assistance</div>
              </div>
              <button 
                onClick={() => setSupportWidgetOpen(false)}
                style={{ background: 'none', border: 'none', color: '#ffffff', fontSize: '1.2rem', cursor: 'pointer', padding: 0 }}
              >
                ✕
              </button>
            </div>

            {/* Chat Messages */}
            <div style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {supportMessages.map((m, i) => (
                <div 
                  key={i} 
                  style={{ 
                    alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start',
                    background: m.sender === 'user' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.06)',
                    color: '#ffffff',
                    padding: '10px 14px',
                    borderRadius: m.sender === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                    fontSize: '0.825rem',
                    maxWidth: '80%',
                    lineHeight: '1.4',
                    wordBreak: 'break-word'
                  }}
                >
                  {m.text}
                </div>
              ))}
            </div>

            {/* Quick Actions Bar */}
            <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: '6px', flexWrap: 'wrap', background: 'rgba(0,0,0,0.15)' }}>
              <button 
                onClick={() => {
                  const msgs = [...supportMessages, { sender: 'user' as const, text: 'Book an Agent' }];
                  setSupportMessages(msgs);
                  setTimeout(() => {
                    setSupportMessages(prev => [...prev, {
                      sender: 'bot',
                      text: 'I have requested an onboarding assistant to call you. An expert will reach out to you at ' + (stats?.operator_profile?.phone || 'your phone number') + ' within 15 minutes.'
                    }]);
                  }, 800);
                }}
                className="btn btn-secondary btn-inline" 
                style={{ padding: '4px 8px', fontSize: '0.7rem', margin: 0, borderRadius: '4px' }}
              >
                📞 Book an Agent
              </button>
              <button 
                onClick={() => {
                  const msgs = [...supportMessages, { sender: 'user' as const, text: 'Help Center' }];
                  setSupportMessages(msgs);
                  setTimeout(() => {
                    setSupportMessages(prev => [...prev, {
                      sender: 'bot',
                      text: 'To register vehicles, use the "Fleet Entry" tab to upload your RC and vehicle photo. Once submitted, compliance reviews typically take 1-2 hours.'
                    }]);
                  }, 800);
                }}
                className="btn btn-secondary btn-inline" 
                style={{ padding: '4px 8px', fontSize: '0.7rem', margin: 0, borderRadius: '4px' }}
              >
                ❓ Help Center
              </button>
              <button 
                onClick={() => {
                  const msgs = [...supportMessages, { sender: 'user' as const, text: 'Chat Support' }];
                  setSupportMessages(msgs);
                  setTimeout(() => {
                    setSupportMessages(prev => [...prev, {
                      sender: 'bot',
                      text: 'Chat Support is active. Type your query in the field below and our automated compliance assistant will guide you.'
                    }]);
                  }, 800);
                }}
                className="btn btn-secondary btn-inline" 
                style={{ padding: '4px 8px', fontSize: '0.7rem', margin: 0, borderRadius: '4px' }}
              >
                💬 Chat Support
              </button>
            </div>

            {/* Input Form */}
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                if (!supportInput.trim()) return;
                const userText = supportInput;
                setSupportInput('');
                const msgs = [...supportMessages, { sender: 'user' as const, text: userText }];
                setSupportMessages(msgs);
                
                setTimeout(() => {
                  let reply = 'Thank you for reaching out! A support agent has been notified of your query: "' + userText + '". We will call you shortly.';
                  const lower = userText.toLowerCase();
                  if (lower.includes('book') || lower.includes('agent') || lower.includes('onboard')) {
                    reply = 'I\'ve scheduled an onboarding agent to contact you shortly. Please make sure your phone number is correct in Profile Settings.';
                  } else if (lower.includes('verif') || lower.includes('document') || lower.includes('status')) {
                    reply = 'You can check document status in the Fleet Dashboard. Admin review is pending compliance check.';
                  } else if (lower.includes('faq') || lower.includes('help')) {
                    reply = 'FAQs:\n- Fleet Entry: Add vehicles dynamically.\n- GPS Tracking: Toggle vehicle Online, click Console, then click Start GPS Simulation.';
                  }
                  setSupportMessages(prev => [...prev, { sender: 'bot', text: reply }]);
                }, 800);
              }}
              style={{ padding: '12px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '8px' }}
            >
              <input 
                type="text" 
                placeholder="Type your message..." 
                value={supportInput} 
                onChange={(e) => setSupportInput(e.target.value)}
                style={{ flex: 1, padding: '8px 12px', fontSize: '0.825rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.2)', color: '#ffffff' }}
              />
              <button 
                type="submit" 
                className="btn btn-primary btn-inline" 
                style={{ padding: '8px 16px', fontSize: '0.8rem', margin: 0, borderRadius: '8px' }}
              >
                Send
              </button>
            </form>
          </div>
        )}
      </div>

    </div>
  );
};

interface OperatorOnboardingProps {
  profile: Stats['operator_profile'] | null;
  onResubmit: () => void;
}

const OperatorOnboarding: React.FC<OperatorOnboardingProps> = ({ profile, onResubmit }) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDevApprove = async () => {
    setLoading(true);
    setError(null);
    try {
      await api.post('operator/dev-approve/');
      alert('Account auto-approved successfully! (Dev Mode)');
      onResubmit();
    } catch (err) {
      console.error(err);
      const error = err as { response?: { data?: { error?: string } }; message?: string };
      setError(error.response?.data?.error || error.message || 'Auto-approval failed');
    } finally {
      setLoading(false);
    }
  };

  // Step 1: Personal Info
  const [opName, setOpName] = useState(profile?.operator_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [address, setAddress] = useState(profile?.address || '');

  // Step 2: Vehicle Info
  const [vName, setVName] = useState('');
  const [vNumber, setVNumber] = useState('');
  const [vType, setVType] = useState('sumo');
  const [vCapacity, setVCapacity] = useState(10);
  const [vDriver, setVDriver] = useState('');
  const [vDriverContact, setVDriverContact] = useState('');

  // Step 3: Docs URLs
  const [licenceUrl, setLicenceUrl] = useState(profile?.licence_url || '');
  const [rcUrl, setRcUrl] = useState(profile?.rc_url || '');
  const [photoUrl, setPhotoUrl] = useState(profile?.vehicle_photo_url || '');

  // Step 4: Payments
  const [upiId, setUpiId] = useState(profile?.upi_id || '');
  const [bankDetails, setBankDetails] = useState(profile?.bank_details || '');

  const [uploadingDoc, setUploadingDoc] = useState<'licence' | 'rc' | 'vehicle_photo' | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'licence' | 'rc' | 'vehicle_photo') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingDoc(type);
    setError(null);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64Content = reader.result as string;
        const res = await api.post('operator/upload_doc/', {
          doc_type: type,
          file_name: file.name,
          file_content: base64Content
        });
        if (type === 'licence') setLicenceUrl(res.data.url);
        else if (type === 'rc') setRcUrl(res.data.url);
        else if (type === 'vehicle_photo') setPhotoUrl(res.data.url);
      } catch (err) {
        console.error(err);
        const error = err as { response?: { data?: { error?: string } }; message?: string };
        setError(`Failed to upload ${type}: ${error.response?.data?.error || error.message}`);
      } finally {
        setUploadingDoc(null);
      }
    };
    reader.onerror = () => {
      setError('Failed to read file on client side.');
      setUploadingDoc(null);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await api.post('operator/submit_verification/', {
        operator_name: opName,
        phone,
        address,
        upi_id: upiId,
        bank_details: bankDetails,
        licence_url: licenceUrl,
        rc_url: rcUrl,
        vehicle_photo_url: photoUrl,
        vehicle_name: vName,
        vehicle_number: vNumber,
        vehicle_type: vType,
        vehicle_capacity: vCapacity,
        driver_name: vDriver || opName,
        driver_contact: vDriverContact || phone
      });
      onResubmit();
    } catch (err) {
      console.error(err);
      const error = err as { response?: { data?: { error?: string } }; message?: string };
      setError(error.response?.data?.error || error.message || 'Submission failed');
    } finally {
      setLoading(false);
    }
  };

  if (profile?.verification_status === 'pending') {
    return (
      <div className="auth-wrapper">
        <div className="glass-panel animate-fade-in auth-card" style={{ maxWidth: '600px', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '20px' }}>⏳</div>
          <h2 className="gradient-text" style={{ marginBottom: '16px' }}>Verification Under Review</h2>
          <p style={{ color: 'var(--text-muted)', lineHeight: '1.6', marginBottom: '24px' }}>
            Thank you for registering! Our compliance team is currently reviewing your uploaded documents and details.
            You will receive full access to scheduling trips and listing vehicles as soon as your account is approved.
          </p>
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', textAlign: 'left', fontSize: '0.875rem' }}>
            <div style={{ marginBottom: '8px' }}><strong>Agency Name:</strong> {profile.operator_name}</div>
            <div style={{ marginBottom: '8px' }}><strong>Phone Number:</strong> {profile.phone}</div>
            <div style={{ marginBottom: '8px' }}><strong>Submitted:</strong> {profile.submitted_at ? new Date(profile.submitted_at).toLocaleDateString() : 'Just now'}</div>
            <div><strong>Status:</strong> <span style={{ color: 'var(--accent-secondary)', fontWeight: 600 }}>PENDING ADMIN REVIEW</span></div>
          </div>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '24px' }}>
            <button onClick={onResubmit} className="btn btn-secondary" style={{ margin: 0 }}>
              Refresh Status
            </button>
            <button onClick={handleDevApprove} className="btn btn-primary" style={{ margin: 0, background: '#10b981', border: 'none' }} disabled={loading}>
              {loading ? 'Approving...' : 'Auto-Approve (Dev Mode) ✓'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrapper">
      <div className="glass-panel animate-fade-in auth-card" style={{ maxWidth: '650px' }}>
        <h2 style={{ marginBottom: '8px', textAlign: 'center' }} className="gradient-text">
          Operator Onboarding Wizard
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textAlign: 'center', marginBottom: '30px' }}>
          Complete the following setup steps to register your business and verify documents.
        </p>

        {/* Dev Mode Banner/Button */}
        <div style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid #3b82f6', color: '#60a5fa', padding: '12px 16px', borderRadius: '12px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
          <span><strong>🛠️ Developer Option:</strong> Skip the compliance check and instantly activate your dashboard.</span>
          <button onClick={handleDevApprove} className="btn btn-primary btn-inline" style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#3b82f6', border: 'none', margin: 0 }} disabled={loading}>
            Auto-Approve
          </button>
        </div>

        {profile?.admin_notes && (
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', color: '#f87171', padding: '16px', borderRadius: '12px', marginBottom: '24px', fontSize: '0.9rem' }}>
            <strong>⚠️ Correction Requested by Admin:</strong>
            <p style={{ marginTop: '6px', fontSize: '0.85rem' }}>{profile.admin_notes}</p>
          </div>
        )}

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', color: '#f87171', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        {/* Step Progress Indicators */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '30px', position: 'relative' }}>
          {[1, 2, 3, 4].map((s) => (
            <div key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2, flex: 1 }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: s === step ? 'var(--accent-primary)' : s < step ? 'var(--accent-secondary)' : 'var(--bg-tertiary)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                border: '2px solid var(--border-color)'
              }}>
                {s < step ? '✓' : s}
              </div>
              <span style={{ fontSize: '0.75rem', marginTop: '6px', color: s === step ? 'var(--text-main)' : 'var(--text-muted)' }}>
                {s === 1 ? 'Personal' : s === 2 ? 'Vehicle' : s === 3 ? 'Docs' : 'Payment'}
              </span>
            </div>
          ))}
        </div>

        {/* Wizard Form Content */}
        <form onSubmit={handleSubmit}>
          {step === 1 && (
            <div className="animate-fade-in">
              <h3 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>Step 1: Personal / Agency Information</h3>
              <div className="form-group">
                <label>Agency Name / Operator Full Name</label>
                <input 
                  type="text" 
                  required 
                  value={opName} 
                  onChange={(e) => setOpName(e.target.value)} 
                  placeholder="e.g. Shillong Travels Ltd."
                />
              </div>
              <div className="form-group">
                <label>Phone Number</label>
                <input 
                  type="text" 
                  required 
                  value={phone} 
                  onChange={(e) => setPhone(e.target.value)} 
                  placeholder="e.g. 9876543210"
                />
              </div>
              <div className="form-group">
                <label>Business Address</label>
                <textarea 
                  required 
                  value={address} 
                  onChange={(e) => setAddress(e.target.value)} 
                  placeholder="Enter full physical address"
                  style={{ width: '100%', minHeight: '80px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff', padding: '10px' }}
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="animate-fade-in">
              <h3 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>Step 2: Add Main Vehicle</h3>
              <div className="form-group">
                <label>Vehicle Name / Model</label>
                <input 
                  type="text" 
                  required 
                  value={vName} 
                  onChange={(e) => setVName(e.target.value)} 
                  placeholder="e.g. Tata Sumo Gold"
                />
              </div>
              <div className="form-group">
                <label>Vehicle Plate Number</label>
                <input 
                  type="text" 
                  required 
                  value={vNumber} 
                  onChange={(e) => setVNumber(e.target.value)} 
                  placeholder="e.g. ML05H1234"
                />
              </div>
              <div className="responsive-grid-2">
                <div className="form-group">
                  <label>Vehicle Type</label>
                  <select value={vType} onChange={(e) => setVType(e.target.value)}>
                    <option value="sumo">Tata Sumo</option>
                    <option value="traveller">Force Traveller</option>
                    <option value="bus">Bus</option>
                    <option value="taxi">Local Taxi</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Seating Capacity</label>
                  <input 
                    type="number" 
                    required 
                    min={1}
                    value={vCapacity} 
                    onChange={(e) => setVCapacity(parseInt(e.target.value) || 0)} 
                  />
                </div>
              </div>
              <div className="responsive-grid-2">
                <div className="form-group">
                  <label>Driver Name</label>
                  <input 
                    type="text" 
                    value={vDriver} 
                    onChange={(e) => setVDriver(e.target.value)} 
                    placeholder="Leave empty to use agency owner"
                  />
                </div>
                <div className="form-group">
                  <label>Driver Contact</label>
                  <input 
                    type="text" 
                    value={vDriverContact} 
                    onChange={(e) => setVDriverContact(e.target.value)} 
                    placeholder="Leave empty to use phone"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="animate-fade-in">
              <h3 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>Step 3: Document Uploads</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '20px' }}>
                Upload photos of your Driving Licence, Registration Certificate (RC), and a clear picture of the vehicle.
              </p>

              {/* Driving Licence */}
              <div className="form-group" style={{ background: 'rgba(255,255,255,0.01)', padding: '16px', borderRadius: '10px', border: '1px dashed var(--border-color)', marginBottom: '16px' }}>
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Driving Licence</span>
                  {licenceUrl && <span style={{ color: 'var(--accent-secondary)', fontSize: '0.8rem' }}>✓ Uploaded</span>}
                </label>
                <input 
                  type="file" 
                  accept="image/*"
                  onChange={(e) => handleFileUpload(e, 'licence')} 
                  style={{ display: 'none' }}
                  id="licence-upload"
                />
                <label htmlFor="licence-upload" style={{ display: 'block', padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '6px', cursor: 'pointer', textAlign: 'center', fontSize: '0.875rem' }}>
                  {uploadingDoc === 'licence' ? 'Uploading...' : licenceUrl ? 'Change License Photo' : 'Select License File'}
                </label>
                {licenceUrl && (
                  <div style={{ marginTop: '10px', textAlign: 'center' }}>
                    <img src={`${api.defaults.baseURL?.replace('/api/transport/', '')}${licenceUrl}`} alt="License preview" style={{ maxHeight: '100px', borderRadius: '4px' }} />
                  </div>
                )}
              </div>

              {/* Vehicle RC */}
              <div className="form-group" style={{ background: 'rgba(255,255,255,0.01)', padding: '16px', borderRadius: '10px', border: '1px dashed var(--border-color)', marginBottom: '16px' }}>
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Vehicle Registration Certificate (RC)</span>
                  {rcUrl && <span style={{ color: 'var(--accent-secondary)', fontSize: '0.8rem' }}>✓ Uploaded</span>}
                </label>
                <input 
                  type="file" 
                  accept="image/*"
                  onChange={(e) => handleFileUpload(e, 'rc')} 
                  style={{ display: 'none' }}
                  id="rc-upload"
                />
                <label htmlFor="rc-upload" style={{ display: 'block', padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '6px', cursor: 'pointer', textAlign: 'center', fontSize: '0.875rem' }}>
                  {uploadingDoc === 'rc' ? 'Uploading...' : rcUrl ? 'Change RC Photo' : 'Select RC File'}
                </label>
                {rcUrl && (
                  <div style={{ marginTop: '10px', textAlign: 'center' }}>
                    <img src={`${api.defaults.baseURL?.replace('/api/transport/', '')}${rcUrl}`} alt="RC preview" style={{ maxHeight: '100px', borderRadius: '4px' }} />
                  </div>
                )}
              </div>

              {/* Vehicle Photo */}
              <div className="form-group" style={{ background: 'rgba(255,255,255,0.01)', padding: '16px', borderRadius: '10px', border: '1px dashed var(--border-color)' }}>
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Vehicle Photo (Front & Side View)</span>
                  {photoUrl && <span style={{ color: 'var(--accent-secondary)', fontSize: '0.8rem' }}>✓ Uploaded</span>}
                </label>
                <input 
                  type="file" 
                  accept="image/*"
                  onChange={(e) => handleFileUpload(e, 'vehicle_photo')} 
                  style={{ display: 'none' }}
                  id="photo-upload"
                />
                <label htmlFor="photo-upload" style={{ display: 'block', padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '6px', cursor: 'pointer', textAlign: 'center', fontSize: '0.875rem' }}>
                  {uploadingDoc === 'vehicle_photo' ? 'Uploading...' : photoUrl ? 'Change Vehicle Photo' : 'Select Vehicle Photo'}
                </label>
                {photoUrl && (
                  <div style={{ marginTop: '10px', textAlign: 'center' }}>
                    <img src={`${api.defaults.baseURL?.replace('/api/transport/', '')}${photoUrl}`} alt="Vehicle preview" style={{ maxHeight: '100px', borderRadius: '4px' }} />
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="animate-fade-in">
              <h3 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>Step 4: Payment Details Setup</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '20px' }}>
                Specify your UPI ID or Bank account details. These credentials will be shown on customer ticket confirmations to process payments.
              </p>
              <div className="form-group">
                <label>UPI ID (Preferred)</label>
                <input 
                  type="text" 
                  value={upiId} 
                  onChange={(e) => setUpiId(e.target.value)} 
                  placeholder="e.g. agencyname@ybl"
                />
              </div>
              <div className="form-group">
                <label>Alternative Bank Details (Holder Name, Account No, IFSC, Bank Name)</label>
                <textarea 
                  value={bankDetails} 
                  onChange={(e) => setBankDetails(e.target.value)} 
                  placeholder="e.g. Account Name: Shillong Travels, Bank: SBI, Account No: 1234567890, IFSC: SBIN000123"
                  style={{ width: '100%', minHeight: '80px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff', padding: '10px' }}
                />
              </div>
            </div>
          )}

          {/* Stepper Buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '30px' }}>
            {step > 1 ? (
              <button type="button" onClick={() => setStep(step - 1)} className="btn btn-secondary btn-inline">
                ← Back
              </button>
            ) : <div />}

            {step < 4 ? (
              <button 
                type="button" 
                onClick={() => {
                  if (step === 1 && (!opName || !phone || !address)) {
                    setError('Please fill in all personal information fields');
                    return;
                  }
                  if (step === 2 && (!vName || !vNumber || !vCapacity)) {
                    setError('Please fill in the main vehicle details');
                    return;
                  }
                  if (step === 3 && (!licenceUrl || !rcUrl || !photoUrl)) {
                    setError('Please upload all required verification documents');
                    return;
                  }
                  setError(null);
                  setStep(step + 1);
                }} 
                className="btn btn-primary btn-inline"
              >
                Next Step →
              </button>
            ) : (
              <button 
                type="submit" 
                className="btn btn-primary btn-inline" 
                style={{ background: 'var(--accent-secondary)', border: 'none' }}
                disabled={loading || !licenceUrl || !rcUrl || !photoUrl || !opName}
              >
                {loading ? 'Submitting...' : 'Submit for Verification ✓'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
