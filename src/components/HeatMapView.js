import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Circle, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import './HeatMapView.css';

const monthsArr = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const HeatMapControls = ({
  years,
  selectedYear,
  setSelectedYear,
  viewType,
  setViewType,
  selectedMonth,
  setSelectedMonth
}) => {
  return (
    <div className="controls">
      <div className="view-toggle">
        <button 
          className={`toggle-button ${viewType === 'yearly' ? 'active' : ''}`}
          onClick={() => {
            setViewType('yearly');
            setSelectedMonth(null);
          }}
        >
          Yearly View
        </button>
        <button 
          className={`toggle-button ${viewType === 'monthly' ? 'active' : ''}`}
          onClick={() => {
            setViewType('monthly');
            setSelectedMonth(0);
          }}
        >
          Monthly View
        </button>
      </div>

      <select 
        value={selectedYear || ''} 
        onChange={(e) => setSelectedYear(Number(e.target.value))}
        className="year-select"
      >
        {years.map(year => (
          <option key={year} value={year}>{year}</option>
        ))}
      </select>

      {viewType === 'monthly' && (
        <select
          value={selectedMonth ?? 0}
          onChange={(e) => setSelectedMonth(Number(e.target.value))}
          className="month-select"
        >
          {monthsArr.map((month, index) => (
            <option key={index} value={index}>{month}</option>
          ))}
        </select>
      )}
    </div>
  );
};

const LocationMarker = React.memo(({ location }) => {
  const getColor = (intensity) => {
    const r = 255;
    const g = Math.floor(255 * (1 - intensity));
    return `rgb(${r}, ${g}, 0)`;
  };

  const getRadius = (intensity, count) => {
    const baseRadius = 20000;
    const countFactor = Math.log10(count + 1) * 10000;
    return (baseRadius + countFactor) * intensity;
  };

  if (!location.lat || !location.lng) return null;

  return (
    <Circle
      center={[location.lat, location.lng]}
      radius={getRadius(location.intensity, location.count)}
      pathOptions={{
        fillColor: getColor(location.intensity),
        fillOpacity: 0.6,
        color: getColor(location.intensity),
        weight: 1
      }}
    >
      <Popup>
        <div className="location-popup">
          <h4>{location.city}</h4>
          <p>Flights: {location.count}</p>
          <p>Duration: {Math.round(location.totalDuration / 60)} hours</p>
          <p>Distance: {Math.round(location.totalDistance / 1000)} km</p>
        </div>
      </Popup>
    </Circle>
  );
});

const HeatMapView = () => {
  const [locationData, setLocationData] = useState([]);
  const [selectedYear, setSelectedYear] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewType, setViewType] = useState('yearly');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const fetchLocationData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch('/api/location-stats');
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch location data');
        }
        
        const data = await response.json();
        if (!Array.isArray(data) || data.length === 0) {
          throw new Error('No location data available');
        }
        
        setLocationData(data);
        setSelectedYear(Math.max(...data.map(d => d.year)));
        setRetryCount(0); // Reset retry count on success
      } catch (err) {
        console.error('Error fetching location data:', err);
        setError(err.message);
        
        // Implement retry logic
        if (retryCount < 3) {
          setTimeout(() => {
            setRetryCount(prev => prev + 1);
          }, 5000); // Retry after 5 seconds
        }
      } finally {
        setLoading(false);
      }
    };

    fetchLocationData();
  }, [retryCount]); // Retry when retryCount changes

  const currentLocations = useMemo(() => {
    if (!selectedYear) return [];
    
    const yearData = locationData.find(d => d.year === selectedYear);
    if (!yearData) return [];

    if (viewType === 'yearly') {
      return yearData.locations;
    } else if (viewType === 'monthly' && selectedMonth !== null) {
      const monthData = yearData.months.find(m => m.month === selectedMonth);
      return monthData ? monthData.locations : [];
    }
    return [];
  }, [locationData, selectedYear, selectedMonth, viewType]);

  if (loading) {
    return (
      <div className="loading">
        Loading location data...
        {retryCount > 0 && <p>Retry attempt {retryCount}/3</p>}
      </div>
    );
  }

  if (error) {
    return (
      <div className="error">
        <p>Error: {error}</p>
        {retryCount < 3 && <p>Retrying... ({retryCount}/3)</p>}
        <button 
          onClick={() => setRetryCount(prev => prev + 1)}
          className="retry-button"
        >
          Retry Now
        </button>
      </div>
    );
  }

  const years = locationData.map(d => d.year).sort((a, b) => b - a);

  return (
    <div className="heat-map-container">
      <HeatMapControls 
        years={years}
        selectedYear={selectedYear}
        setSelectedYear={setSelectedYear}
        viewType={viewType}
        setViewType={setViewType}
        selectedMonth={selectedMonth}
        setSelectedMonth={setSelectedMonth}
      />
      
      <div className="map-container">
        <MapContainer
          center={[39.8283, -98.5795]}
          zoom={4}
          style={{ height: '600px', width: '100%' }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          {currentLocations.map((location, index) => (
            <LocationMarker
              key={`${location.city}-${index}`}
              location={location}
            />
          ))}
        </MapContainer>
      </div>

      <div className="stats-summary">
        <h3>
          {viewType === 'yearly'
            ? `${selectedYear} Summary`
            : `${monthsArr[selectedMonth]} ${selectedYear} Summary`}
        </h3>
        <div className="stats-grid">
          {currentLocations.map(location => (
            <div key={location.city} className="stat-card">
              <h4>{location.city}</h4>
              <div className="stat-details">
                <div className="stat-item">
                  <span className="stat-label">Flights:</span>
                  <span className="stat-value">{location.count}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Total Duration:</span>
                  <span className="stat-value">{Math.round(location.totalDuration / 60)} hours</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Total Distance:</span>
                  <span className="stat-value">{Math.round(location.totalDistance / 1000)} km</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HeatMapView;
