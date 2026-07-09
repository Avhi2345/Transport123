import React, { useState, useEffect, useRef } from 'react';

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraAngle, setCameraAngle] = useState(-45);
  const [cameraPitch, setCameraPitch] = useState(40);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragStart) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    setCameraAngle(prev => prev + dx * 0.4);
    setCameraPitch(prev => Math.min(80, Math.max(15, prev - dy * 0.4)));
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setDragStart(null);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      setDragStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!dragStart) return;
    const dx = e.touches[0].clientX - dragStart.x;
    const dy = e.touches[0].clientY - dragStart.y;
    setCameraAngle(prev => prev + dx * 0.4);
    setCameraPitch(prev => Math.min(80, Math.max(15, prev - dy * 0.4)));
    setDragStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animFrame: number;
    let time = 0;

    // Route Waypoints for 3D drawing
    const ROUTE_WAYPOINTS = [
      { lat: 26.1445, lng: 91.7362, name: "Guwahati" },
      { lat: 26.1158, lng: 91.8211, name: "Khanapara" },
      { lat: 26.0610, lng: 91.8710, name: "Byrnihat" },
      { lat: 25.9015, lng: 91.8812, name: "Nongpoh" },
      { lat: 25.6482, lng: 91.8920, name: "Umiam Lake" },
      { lat: 25.5788, lng: 91.8833, name: "Shillong" }
    ];

    const minLat = 25.5;
    const maxLat = 26.2;
    const minLng = 91.7;
    const maxLng = 91.95;

    const getLocalCoords = (lLatitude: number, lLongitude: number) => {
      // Scale coordinates to fit our 3D local coordinate space (-140 to 140)
      const x = ((lLongitude - minLng) / (maxLng - minLng)) * 280 - 140;
      // y depth axis (invert so north is deep)
      const y = -(((lLatitude - minLat) / (maxLat - minLat)) * 280 - 140);
      return { x, y };
    };

    const render = () => {
      time += 1;
      
      // Auto resize logic
      if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
      }

      const w = canvas.width;
      const h = canvas.height;

      // 3D Perspective Projection
      const project = (x3d: number, y3d: number, z3d: number) => {
        // Rotate around Y axis (Yaw)
        const radYaw = (cameraAngle * Math.PI) / 180;
        const rx = x3d * Math.cos(radYaw) - y3d * Math.sin(radYaw);
        const ry = x3d * Math.sin(radYaw) + y3d * Math.cos(radYaw);
        
        // Rotate around X axis (Pitch)
        const radPitch = (cameraPitch * Math.PI) / 180;
        const transX = rx;
        const transY = ry * Math.cos(radPitch) - z3d * Math.sin(radPitch);
        const transZ = ry * Math.sin(radPitch) + z3d * Math.cos(radPitch) + 340; // 340 distance
        
        const fov = 480;
        const scale = fov / Math.max(10, transZ);
        const screenX = w / 2 + transX * scale;
        const screenY = h / 2 + transY * scale;
        return { x: screenX, y: screenY, scale };
      };

      // Draw beautiful space background
      ctx.fillStyle = '#060a12';
      ctx.fillRect(0, 0, w, h);

      // Draw faint coordinate grids
      ctx.strokeStyle = 'rgba(37, 99, 235, 0.05)';
      ctx.lineWidth = 1;
      for (let gridY = -160; gridY <= 160; gridY += 40) {
        ctx.beginPath();
        const pStart = project(-160, gridY, 0);
        const pEnd = project(160, gridY, 0);
        ctx.moveTo(pStart.x, pStart.y);
        ctx.lineTo(pEnd.x, pEnd.y);
        ctx.stroke();
      }
      for (let gridX = -160; gridX <= 160; gridX += 40) {
        ctx.beginPath();
        const pStart = project(gridX, -160, 0);
        const pEnd = project(gridX, 160, 0);
        ctx.moveTo(pStart.x, pStart.y);
        ctx.lineTo(pEnd.x, pEnd.y);
        ctx.stroke();
      }

      // Draw 3D Mountains / Topography
      const peaks = [
        { x: -130, y: -70, h: 50, color: 'rgba(99, 102, 241, 0.12)' },
        { x: -100, y: 110, h: 40, color: 'rgba(99, 102, 241, 0.1)' },
        { x: 120, y: -120, h: 65, color: 'rgba(99, 102, 241, 0.14)' },
        { x: 140, y: 30, h: 45, color: 'rgba(99, 102, 241, 0.08)' },
        { x: 60, y: 140, h: 35, color: 'rgba(99, 102, 241, 0.09)' }
      ];

      peaks.forEach(p => {
        const basePoints = [
          project(p.x - 30, p.y - 30, 0),
          project(p.x + 30, p.y - 30, 0),
          project(p.x + 30, p.y + 30, 0),
          project(p.x - 30, p.y + 30, 0)
        ];
        const tip = project(p.x, p.y, p.h);

        // Face 1
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(basePoints[0].x, basePoints[0].y);
        ctx.lineTo(basePoints[1].x, basePoints[1].y);
        ctx.lineTo(tip.x, tip.y);
        ctx.closePath();
        ctx.fill();

        // Face 2 (light highlight)
        ctx.fillStyle = 'rgba(255,255,255,0.015)';
        ctx.beginPath();
        ctx.moveTo(basePoints[1].x, basePoints[1].y);
        ctx.lineTo(basePoints[2].x, basePoints[2].y);
        ctx.lineTo(tip.x, tip.y);
        ctx.closePath();
        ctx.fill();
      });

      // Draw Umiam Lake (glowing waterbody)
      ctx.fillStyle = 'rgba(37, 99, 235, 0.18)';
      ctx.strokeStyle = 'rgba(96, 165, 250, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const lakeCenter = { x: 70, y: -45 };
      for (let i = 0; i <= 16; i++) {
        const angle = (i * 2 * Math.PI) / 16;
        const r = 24 + Math.sin(angle * 4) * 6;
        const lx = lakeCenter.x + r * Math.cos(angle);
        const ly = lakeCenter.y + r * Math.sin(angle);
        const p = project(lx, ly, 0);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Draw Guwahati -> Shillong Route Path
      ctx.beginPath();
      ROUTE_WAYPOINTS.forEach((wp, idx) => {
        const local = getLocalCoords(wp.lat, wp.lng);
        const p = project(local.x, local.y, 0);
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.shadowColor = 'rgba(37, 99, 235, 0.75)';
      ctx.shadowBlur = 8;
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.shadowBlur = 0; // reset shadow

      // Draw Waypoints
      ROUTE_WAYPOINTS.forEach(wp => {
        const local = getLocalCoords(wp.lat, wp.lng);
        const pGround = project(local.x, local.y, 0);
        
        // Pulse aura
        const pulseRadius = 6 + (time % 50) * 0.2;
        const pulseOpacity = 1 - (time % 50) / 50;
        ctx.strokeStyle = `rgba(59, 130, 246, ${pulseOpacity * 0.7})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(pGround.x, pGround.y, pulseRadius * pGround.scale * 0.04, 0, 2 * Math.PI);
        ctx.stroke();

        // Pin vertical bounce line
        const bounce = Math.sin(time * 0.04 + local.x * 0.05) * 3;
        const pPin = project(local.x, local.y, 14 + bounce);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pGround.x, pGround.y);
        ctx.lineTo(pPin.x, pPin.y);
        ctx.stroke();

        // Pin Head
        ctx.fillStyle = wp.name === "Nongpoh" ? '#fbbf24' : '#3b82f6';
        ctx.beginPath();
        ctx.arc(pPin.x, pPin.y, 4 * pPin.scale * 0.05, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Label
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 9px sans-serif';
        ctx.fillText(wp.name, pPin.x + 8, pPin.y + 3);
      });

      // Draw live bus on the road
      const busLocal = getLocalCoords(latitude, longitude);
      const busGround = project(busLocal.x, busLocal.y, 0);

      // Pulsing green ground shadow
      const radGrad = ctx.createRadialGradient(
        busGround.x, busGround.y, 1,
        busGround.x, busGround.y, 16 * busGround.scale * 0.04
      );
      radGrad.addColorStop(0, 'rgba(16, 185, 129, 0.45)');
      radGrad.addColorStop(1, 'rgba(16, 185, 129, 0)');
      ctx.fillStyle = radGrad;
      ctx.beginPath();
      ctx.arc(busGround.x, busGround.y, 16 * busGround.scale * 0.04, 0, 2 * Math.PI);
      ctx.fill();

      // Bus levitation
      const busZ = 10 + Math.sin(time * 0.08) * 1.5;
      const busHeight = 7;
      
      // Draw 3D Cuboid for Bus
      const heading = -45 * Math.PI / 180; // Oriented along route direction
      const len = 10;
      const wid = 5.5;
      
      const dx_len = len * Math.cos(heading);
      const dy_len = len * Math.sin(heading);
      const dx_wid = wid * Math.cos(heading + Math.PI/2);
      const dy_wid = wid * Math.sin(heading + Math.PI/2);

      const corners = [
        // Bottom 4 corners
        project(busLocal.x - dx_len/2 - dx_wid/2, busLocal.y - dy_len/2 - dy_wid/2, busZ),
        project(busLocal.x + dx_len/2 - dx_wid/2, busLocal.y + dy_len/2 - dy_wid/2, busZ),
        project(busLocal.x + dx_len/2 + dx_wid/2, busLocal.y + dy_len/2 + dy_wid/2, busZ),
        project(busLocal.x - dx_len/2 + dx_wid/2, busLocal.y - dy_len/2 + dy_wid/2, busZ),
        // Top 4 corners
        project(busLocal.x - dx_len/2 - dx_wid/2, busLocal.y - dy_len/2 - dy_wid/2, busZ + busHeight),
        project(busLocal.x + dx_len/2 - dx_wid/2, busLocal.y + dy_len/2 - dy_wid/2, busZ + busHeight),
        project(busLocal.x + dx_len/2 + dx_wid/2, busLocal.y + dy_len/2 + dy_wid/2, busZ + busHeight),
        project(busLocal.x - dx_len/2 + dx_wid/2, busLocal.y - dy_len/2 + dy_wid/2, busZ + busHeight)
      ];

      // Side Face 1 (Emerald main)
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      ctx.lineTo(corners[1].x, corners[1].y);
      ctx.lineTo(corners[5].x, corners[5].y);
      ctx.lineTo(corners[4].x, corners[4].y);
      ctx.closePath();
      ctx.fill();

      // Side Face 2 (Darker contrast)
      ctx.fillStyle = '#059669';
      ctx.beginPath();
      ctx.moveTo(corners[1].x, corners[1].y);
      ctx.lineTo(corners[2].x, corners[2].y);
      ctx.lineTo(corners[6].x, corners[6].y);
      ctx.lineTo(corners[5].x, corners[5].y);
      ctx.closePath();
      ctx.fill();

      // Top Face (Bright highlight)
      ctx.fillStyle = '#34d399';
      ctx.beginPath();
      ctx.moveTo(corners[4].x, corners[4].y);
      ctx.lineTo(corners[5].x, corners[5].y);
      ctx.lineTo(corners[6].x, corners[6].y);
      ctx.lineTo(corners[7].x, corners[7].y);
      ctx.closePath();
      ctx.fill();

      // Windshield & Windows
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const winStart = project(busLocal.x - dx_len/3, busLocal.y - dy_len/3, busZ + busHeight/2);
      const winEnd = project(busLocal.x + dx_len/3, busLocal.y + dy_len/3, busZ + busHeight/2);
      ctx.moveTo(winStart.x, winStart.y);
      ctx.lineTo(winEnd.x, winEnd.y);
      ctx.stroke();

      animFrame = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animFrame);
    };
  }, [latitude, longitude, cameraAngle, cameraPitch]);

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

      {/* 3D Map Canvas Background */}
      <canvas 
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleMouseUp}
        style={{ 
          width: '100%', 
          height: '100%', 
          position: 'absolute', 
          top: 0, 
          left: 0, 
          zIndex: 1, 
          cursor: dragStart ? 'grabbing' : 'grab' 
        }}
      />
      
      {/* Tilted Perspective Helper Badge */}
      <div style={{
        position: 'absolute',
        top: '76px',
        right: '20px',
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        padding: '6px 12px',
        fontSize: '0.75rem',
        color: '#fff',
        zIndex: 10,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      }}>
        <span>🖱️ Drag / Swipe to rotate 3D Map</span>
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
