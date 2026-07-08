import React from 'react';

interface LiveTrackingVisualProps {
  vehicleName: string;
  vehicleNumber: string;
  vehicleType: string;
  vehiclePhoto?: string | null;
  source: string;
  destination: string;
  driverName: string;
  driverContact: string;
  speed: number;
  nextStopName: string;
  nextStopDistance: string;
  eta: string;
  distanceCovered: string;
  totalDistance: string;
  statusText: string;
  statusColor: string;
  latitude: number;
  longitude: number;
  onBack?: () => void;
  onRefresh?: () => void;
}

export const LiveTrackingVisual: React.FC<LiveTrackingVisualProps> = ({
  vehicleName,
  vehicleNumber,
  vehicleType,
  vehiclePhoto,
  source,
  destination,
  driverName,
  driverContact,
  speed,
  nextStopName,
  nextStopDistance,
  eta,
  distanceCovered,
  totalDistance,
  statusText,
  statusColor,
  latitude,
  longitude,
  onBack,
  onRefresh
}) => {
  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '520px',
      borderRadius: '16px',
      overflow: 'hidden',
      border: '1px solid var(--border-color)',
      background: '#090d16',
      boxShadow: '0 12px 40px 0 rgba(0, 0, 0, 0.5)'
    }} className="animate-fade-in">
      
      {/* Header bar */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '56px',
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0 20px',
        zIndex: 20
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {onBack && (
            <button 
              onClick={onBack} 
              style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '5px' }}
              title="Back"
            >
              ←
            </button>
          )}
          <span style={{ fontWeight: 700, fontSize: '1.05rem', color: '#fff' }}>Live Tracking View</span>
        </div>
        {onRefresh && (
          <button 
            onClick={onRefresh}
            style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '5px' }}
            title="Refresh Map"
          >
            ↻
          </button>
        )}
      </div>

      {/* Map Background */}
      <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, zIndex: 1 }}>
        <iframe 
          title="Live GPS Tracking Map"
          width="100%" 
          height="100%" 
          style={{ border: 0, filter: 'invert(90%) hue-rotate(180deg) brightness(95%) contrast(90%)' }}
          src={`https://maps.google.com/maps?q=${latitude},${longitude}&z=12&output=embed`}
        />
      </div>

      {/* Floating Info Card (Left) */}
      <div style={{
        position: 'absolute',
        top: '76px',
        left: '20px',
        width: '280px',
        background: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(16px)',
        border: '1px solid var(--border-color)',
        borderRadius: '16px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        zIndex: 10,
        boxShadow: '0 8px 30px rgba(0,0,0,0.6)'
      }}>
        {/* Vehicle Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '50%',
            overflow: 'hidden',
            background: 'var(--bg-tertiary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid var(--border-color)'
          }}>
            {vehiclePhoto ? (
              <img src={vehiclePhoto} alt={vehicleName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: '1.5rem' }}>🚌</span>
            )}
          </div>
          <div>
            <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.95rem' }}>{vehicleNumber}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{vehicleName} ({vehicleType.toUpperCase()})</div>
          </div>
        </div>

        {/* Route Details */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>{source}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>➔</span>
            <span>{destination}</span>
          </div>
        </div>

        {/* Driver Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.8rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>DRIVER</div>
          <div style={{ fontWeight: 600, color: '#fff' }}>{driverName}</div>
          <div style={{ color: 'var(--text-muted)' }}>{driverContact}</div>
        </div>

        {/* Speed & Next Stop */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '15px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px', fontSize: '0.8rem' }}>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginBottom: '2px' }}>SPEED</div>
            <div style={{ fontWeight: 700, color: '#34d399', fontSize: '0.9rem' }}>{speed} km/h</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginBottom: '2px' }}>NEXT STOP</div>
            <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nextStopName}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>{nextStopDistance}</div>
          </div>
        </div>

        {/* ETA */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>ETA</span>
          <span style={{ fontWeight: 700, color: '#fff' }}>{eta}</span>
        </div>
      </div>

      {/* Floating Bottom Strip */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '20px',
        right: '20px',
        height: '60px',
        background: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(16px)',
        border: '1px solid var(--border-color)',
        borderRadius: '16px',
        padding: '0 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 10,
        boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
        gap: '15px'
      }}>
        <div style={{ display: 'flex', gap: '30px' }}>
          <div>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Distance Covered</span>
            <strong style={{ fontSize: '0.9rem', color: '#fff' }}>{distanceCovered}</strong>
          </div>
          <div>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Total Distance</span>
            <strong style={{ fontSize: '0.9rem', color: '#fff' }}>{totalDistance}</strong>
          </div>
          <div>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>ETA</span>
            <strong style={{ fontSize: '0.9rem', color: '#fff' }}>{eta}</strong>
          </div>
        </div>
        <div>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', textAlign: 'right' }}>Status</span>
          <strong style={{ fontSize: '0.9rem', color: statusColor }}>{statusText}</strong>
        </div>
      </div>

    </div>
  );
};
