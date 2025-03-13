import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import './App.css';

const API_CONFIG = {
  FLIGHTS_ENDPOINT: '/api/flights',
  VEHICLES_ENDPOINT: '/api/vehicles',
  headers: {
    'Accept': 'application/json'
  }
};

// Add this before the App component
const styles = `
.yearly-stats-container {
  padding: 20px;
  margin: 20px;
  background: #ffffff;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
  margin-top: 20px;
}

.stat-card {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 20px;
  transition: transform 0.2s;
}

.stat-card:hover {
  transform: translateY(-5px);
}

.stat-card h3 {
  margin: 0 0 15px 0;
  color: #2c3e50;
  font-size: 1.5rem;
}

.stat-details {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stat-label {
  color: #6c757d;
}

.stat-value {
  font-weight: bold;
  color: #2c3e50;
}

.loading {
  text-align: center;
  padding: 20px;
  color: #6c757d;
}

.error {
  text-align: center;
  padding: 20px;
  color: #dc3545;
}

.stats-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.stats-controls {
  display: flex;
  gap: 10px;
}

.metric-select {
  padding: 8px;
  border-radius: 4px;
  border: 1px solid #ddd;
}

.toggle-stats-btn {
  padding: 8px 16px;
  background: #6c757d;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.toggle-stats-btn:hover {
  background: #5a6268;
}

.total-stats-summary {
  margin-bottom: 20px;
}

.total-stat-card {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
}

.total-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-top: 10px;
}

.total-stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.total-stat-item span {
  color: #6c757d;
  margin-bottom: 5px;
}

.total-stat-item strong {
  font-size: 1.5rem;
  color: #2c3e50;
}

.chart-container {
  background: white;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.analytics-container {
  padding: 20px;
}

.analytics-toggle {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-bottom: 20px;
}

.monthly-stats-container {
  padding: 20px;
  background: #ffffff;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.year-select {
  padding: 8px;
  border-radius: 4px;
  border: 1px solid #ddd;
  margin-right: 10px;
}

.toggle-button {
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  background: #f8f9fa;
  cursor: pointer;
  transition: all 0.2s;
}

.toggle-button.active {
  background: #007bff;
  color: white;
}

.toggle-button:hover {
  background: ${props => props.active ? '#0056b3' : '#e9ecef'};
}
`;

// Add these utility functions
const formatHours = (minutes) => {
  const hours = minutes / 60;
  return hours.toFixed(1);
};

const formatDurationDisplay = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);
  return `${hours}h ${remainingMinutes}m`;
};

const YearlyStats = () => {
  const [yearlyStats, setYearlyStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState('year');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedMetric, setSelectedMetric] = useState('totalFlights');
  const [showAllStats, setShowAllStats] = useState(false);

  useEffect(() => {
    const fetchYearlyStats = async () => {
      try {
        // In development, use the proxy defined in package.json
        const baseUrl = process.env.NODE_ENV === 'development' ? '' : '';
        const response = await fetch(`${baseUrl}/api/yearly-stats`);
        if (!response.ok) {
          throw new Error('Failed to fetch yearly statistics');
        }
        const data = await response.json();
        
        // Calculate additional metrics
        const enhancedData = data.map(stat => ({
          ...stat,
          flightsPerVehicle: (stat.totalFlights / stat.uniqueVehicles).toFixed(1),
          hoursPerVehicle: (stat.totalMinutes / 60 / stat.uniqueVehicles).toFixed(1),
          averageFlightDuration: (stat.totalMinutes / stat.totalFlights).toFixed(1)
        }));
        
        setYearlyStats(enhancedData);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchYearlyStats();
  }, []);

  const sortData = (data, field, order) => {
    return [...data].sort((a, b) => {
      if (order === 'asc') {
        return a[field] - b[field];
      }
      return b[field] - a[field];
    });
  };

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const getTotalStats = () => {
    return yearlyStats.reduce((acc, stat) => ({
      totalFlights: acc.totalFlights + stat.totalFlights,
      totalMinutes: acc.totalMinutes + stat.totalMinutes,
      uniqueVehicles: Math.max(acc.uniqueVehicles, stat.uniqueVehicles)
    }), { totalFlights: 0, totalMinutes: 0, uniqueVehicles: 0 });
  };

  if (loading) return <div className="loading">Loading yearly statistics...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  const sortedStats = sortData(yearlyStats, sortBy, sortOrder);
  const totals = getTotalStats();

  return (
    <div className="yearly-stats-container">
      <div className="stats-header">
        <h2>Yearly Statistics</h2>
        <div className="stats-controls">
          <select 
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value)}
            className="metric-select"
          >
            <option value="totalFlights">Total Flights</option>
            <option value="totalMinutes">Flight Hours</option>
            <option value="uniqueVehicles">Unique Vehicles</option>
            <option value="flightsPerVehicle">Flights per Vehicle</option>
          </select>
          <button 
            onClick={() => setShowAllStats(!showAllStats)}
            className="toggle-stats-btn"
          >
            {showAllStats ? 'Show Less' : 'Show All Stats'}
          </button>
        </div>
      </div>

      <div className="total-stats-summary">
        <div className="total-stat-card">
          <h3>All-Time Statistics</h3>
          <div className="total-stats-grid">
            <div className="total-stat-item">
              <span>Total Flights</span>
              <strong>{totals.totalFlights}</strong>
            </div>
            <div className="total-stat-item">
              <span>Flight Hours</span>
              <strong>{formatHours(totals.totalMinutes)}h</strong>
            </div>
            <div className="total-stat-item">
              <span>Max Active Vehicles</span>
              <strong>{totals.uniqueVehicles}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="chart-container">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={sortedStats}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="year" />
            <YAxis />
            <Tooltip 
              formatter={(value, name) => {
                if (name === 'Flight Hours') return `${formatHours(value)}h`;
                return value;
              }}
            />
            <Legend />
            <Bar 
              dataKey={selectedMetric === 'totalMinutes' ? 'totalMinutes' : selectedMetric}
              name={selectedMetric === 'totalMinutes' ? 'Flight Hours' : selectedMetric === 'totalFlights' ? 'Total Flights' : 'Unique Vehicles'}
              fill="#8884d8" 
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="stats-grid">
        {sortedStats.map(stat => (
          <div key={stat.year} className="stat-card">
            <h3>{stat.year}</h3>
            <div className="stat-details">
              <div className="stat-item">
                <span className="stat-label">Total Flights:</span>
                <span className="stat-value">{stat.totalFlights}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Flight Hours:</span>
                <span className="stat-value">{formatHours(stat.totalMinutes)}h</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Unique Vehicles:</span>
                <span className="stat-value">{stat.uniqueVehicles}</span>
              </div>
              {showAllStats && (
                <>
                  <div className="stat-item">
                    <span className="stat-label">Flights per Vehicle:</span>
                    <span className="stat-value">{stat.flightsPerVehicle}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Hours per Vehicle:</span>
                    <span className="stat-value">{stat.hoursPerVehicle}h</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Avg Flight Duration:</span>
                    <span className="stat-value">{formatDurationDisplay(stat.averageFlightDuration)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const MonthlyStats = () => {
  const [monthlyStats, setMonthlyStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMetric, setSelectedMetric] = useState('totalFlights');
  const [availableYears, setAvailableYears] = useState([]);

  useEffect(() => {
    const fetchMonthlyStats = async () => {
      try {
        const response = await fetch('/api/flights');
        if (!response.ok) {
          throw new Error('Failed to fetch flight data');
        }
        const data = await response.json();
        const flights = data.items || [];

        // Get all available years first
        const years = new Set(flights.map(flight => new Date(flight.date).getFullYear()));
        const sortedYears = Array.from(years).sort((a, b) => b - a); // Sort descending
        setAvailableYears(sortedYears);

        // If no year is selected, use the most recent year
        if (!selectedYear || !sortedYears.includes(selectedYear)) {
          setSelectedYear(sortedYears[0]);
        }

        // Process flights into monthly statistics
        const monthlyData = flights.reduce((acc, flight) => {
          const date = new Date(flight.date);
          const year = date.getFullYear();
          if (year !== selectedYear) return acc;

          const month = date.getMonth();
          const key = `${year}-${month}`;

          if (!acc[key]) {
            acc[key] = {
              year,
              month,
              monthName: format(date, 'MMMM'),
              totalFlights: 0,
              totalMinutes: 0,
              totalDistance: 0,
              vehicles: new Set(),
            };
          }

          acc[key].totalFlights++;
          
          // Add duration in minutes
          if (flight.duration) {
            acc[key].totalMinutes += flight.duration / 60; // Convert seconds to minutes
          }

          // Add distance
          if (flight.distance) {
            acc[key].totalDistance += flight.distance;
          }

          // Track unique vehicles
          if (flight.vehicle?.id) {
            acc[key].vehicles.add(flight.vehicle.id);
          }

          return acc;
        }, {});

        // Ensure all months are represented
        for (let month = 0; month < 12; month++) {
          const key = `${selectedYear}-${month}`;
          if (!monthlyData[key]) {
            monthlyData[key] = {
              year: selectedYear,
              month,
              monthName: format(new Date(selectedYear, month), 'MMMM'),
              totalFlights: 0,
              totalMinutes: 0,
              totalDistance: 0,
              vehicles: new Set(),
            };
          }
        }

        // Convert to array and calculate additional metrics
        const processedData = Object.values(monthlyData)
          .map(stat => ({
            ...stat,
            uniqueVehicles: stat.vehicles.size,
            flightsPerVehicle: stat.vehicles.size ? (stat.totalFlights / stat.vehicles.size).toFixed(1) : '0',
            hoursPerVehicle: stat.vehicles.size ? (stat.totalMinutes / 60 / stat.vehicles.size).toFixed(1) : '0',
            averageFlightDuration: stat.totalFlights ? (stat.totalMinutes / stat.totalFlights).toFixed(1) : '0',
            averageDistance: stat.totalFlights ? (stat.totalDistance / stat.totalFlights).toFixed(1) : '0'
          }))
          .sort((a, b) => a.month - b.month);

        setMonthlyStats(processedData);
      } catch (err) {
        console.error('Error processing flight data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchMonthlyStats();
  }, [selectedYear]);

  if (loading) return <div className="loading">Loading monthly statistics...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  const getTotalStats = () => {
    return monthlyStats.reduce((acc, stat) => ({
      totalFlights: acc.totalFlights + stat.totalFlights,
      totalMinutes: acc.totalMinutes + stat.totalMinutes,
      totalDistance: acc.totalDistance + stat.totalDistance,
      uniqueVehicles: Math.max(acc.uniqueVehicles, stat.uniqueVehicles)
    }), { totalFlights: 0, totalMinutes: 0, totalDistance: 0, uniqueVehicles: 0 });
  };

  const totals = getTotalStats();

  return (
    <div className="monthly-stats-container">
      <div className="stats-header">
        <h2>Monthly Statistics {selectedYear}</h2>
        <div className="stats-controls">
          <select 
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="year-select"
          >
            {availableYears.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          <select 
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value)}
            className="metric-select"
          >
            <option value="totalFlights">Total Flights</option>
            <option value="totalMinutes">Flight Hours</option>
            <option value="uniqueVehicles">Active Vehicles</option>
            <option value="totalDistance">Total Distance (m)</option>
            <option value="flightsPerVehicle">Flights per Vehicle</option>
          </select>
        </div>
      </div>

      <div className="total-stats-summary">
        <div className="total-stat-card">
          <h3>{selectedYear} Summary</h3>
          <div className="total-stats-grid">
            <div className="total-stat-item">
              <span>Total Flights</span>
              <strong>{totals.totalFlights}</strong>
            </div>
            <div className="total-stat-item">
              <span>Flight Hours</span>
              <strong>{formatHours(totals.totalMinutes)}h</strong>
            </div>
            <div className="total-stat-item">
              <span>Total Distance</span>
              <strong>{(totals.totalDistance / 1000).toFixed(1)}km</strong>
            </div>
            <div className="total-stat-item">
              <span>Max Active Vehicles</span>
              <strong>{totals.uniqueVehicles}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="chart-container">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={monthlyStats}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="monthName" />
            <YAxis />
            <Tooltip 
              formatter={(value, name) => {
                if (name === 'Flight Hours') return `${formatHours(value)}h`;
                if (name === 'Total Distance') return `${(value / 1000).toFixed(1)}km`;
                return value;
              }}
            />
            <Legend />
            <Line 
              type="monotone"
              dataKey={selectedMetric === 'totalMinutes' ? 'totalMinutes' : selectedMetric}
              name={selectedMetric === 'totalMinutes' ? 'Flight Hours' : 
                    selectedMetric === 'totalDistance' ? 'Total Distance' :
                    selectedMetric}
              stroke="#8884d8"
              strokeWidth={2}
              dot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="stats-grid">
        {monthlyStats.map(stat => (
          <div key={`${stat.year}-${stat.month}`} className="stat-card">
            <h3>{stat.monthName}</h3>
            <div className="stat-details">
              <div className="stat-item">
                <span className="stat-label">Total Flights:</span>
                <span className="stat-value">{stat.totalFlights}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Flight Hours:</span>
                <span className="stat-value">{formatHours(stat.totalMinutes)}h</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Total Distance:</span>
                <span className="stat-value">{(stat.totalDistance / 1000).toFixed(1)}km</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Active Vehicles:</span>
                <span className="stat-value">{stat.uniqueVehicles}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Flights per Vehicle:</span>
                <span className="stat-value">{stat.flightsPerVehicle}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Hours per Vehicle:</span>
                <span className="stat-value">{stat.hoursPerVehicle}h</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Avg Flight Duration:</span>
                <span className="stat-value">{formatDurationDisplay(stat.averageFlightDuration)}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Avg Distance/Flight:</span>
                <span className="stat-value">{(parseFloat(stat.averageDistance) / 1000).toFixed(1)}km</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const Analytics = () => {
  const [view, setView] = useState('yearly');

  return (
    <div className="analytics-container">
      <div className="analytics-toggle">
        <button 
          onClick={() => setView('yearly')} 
          className={`toggle-button ${view === 'yearly' ? 'active' : ''}`}
        >
          Yearly View
        </button>
        <button 
          onClick={() => setView('monthly')} 
          className={`toggle-button ${view === 'monthly' ? 'active' : ''}`}
        >
          Monthly View
        </button>
      </div>
      {view === 'yearly' ? <YearlyStats /> : <MonthlyStats />}
    </div>
  );
};

function App() {
  const [flights, setFlights] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingVehicleFlights, setLoadingVehicleFlights] = useState({});
  const [error, setError] = useState(null);
  const [view, setView] = useState('flightsByVehicle'); // Set flightsByVehicle as the default view
  const [expandedVehicles, setExpandedVehicles] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(100);
  const [totalFlights, setTotalFlights] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [vehicleFlightsMap, setVehicleFlightsMap] = useState({});
  const [loadedAllVehicleFlights, setLoadedAllVehicleFlights] = useState({});
  const [allFlightsLoaded, setAllFlightsLoaded] = useState(false);
  const [vehicleFilter, setVehicleFilter] = useState('');
  const [compactFlightView, setCompactFlightView] = useState({});
  const [sortField, setSortField] = useState('date');
  const [sortDirection, setSortDirection] = useState('desc');
  const [sortVehiclesBy, setSortVehiclesBy] = useState('flightCount');
  const [isCachedData, setIsCachedData] = useState(false);
  const [lastCacheTime, setLastCacheTime] = useState(null);
  
  // Load initial data based on view
  useEffect(() => {
    const loadData = async () => {
      if (view === 'flights') {
        await fetchAllFlights();
      } else if (view === 'vehicles') {
        await fetchVehicles();
      } else if (view === 'flightsByVehicle') {
        setLoading(true);
        
        try {
          // First load all flights
          const allFlightsData = await fetchAllFlights(false); // false = don't set loading to false
          console.log(`Loaded ${allFlightsData?.length || 0} flights`);
          
          // Then load all vehicles
          const vehiclesData = await fetchVehicles(false); // false = don't set loading to false
          console.log(`Loaded ${vehiclesData?.length || 0} vehicles`);
          
          if (allFlightsData && vehiclesData) {
            processFlightsForVehicles(allFlightsData, vehiclesData);
          }
        } catch (err) {
          console.error("Error loading data:", err);
          setError("Failed to load flight and vehicle data. Please try again.");
        } finally {
          setLoading(false);
        }
      }
    };
    
    loadData();
  }, [view]);

  // Initialize vehicleFlightsMap when vehicles change
  useEffect(() => {
    if (vehicles.length > 0) {
      console.log(`Initializing vehicle flights map with ${vehicles.length} vehicles`);
      const initialMap = {};
      vehicles.forEach(vehicle => {
        // Preserve existing flight data if available
        initialMap[vehicle.id] = vehicleFlightsMap[vehicle.id] || {
          vehicleInfo: vehicle,
          flights: []
        };
      });
      setVehicleFlightsMap(initialMap);
    }
  }, [vehicles]);

  // Recalculate pagination when flights or itemsPerPage changes
  useEffect(() => {
    setTotalFlights(flights.length);
    setTotalPages(Math.ceil(flights.length / itemsPerPage));
  }, [flights, itemsPerPage]);

  // Process flights for all vehicles with strict ID matching
  const processFlightsForVehicles = (flightsData, vehiclesData) => {
    console.log(`Processing ${flightsData.length} flights for ${vehiclesData.length} vehicles`);
    
    // Ensure all IDs are strings for consistent comparison
    const normalizedFlights = flightsData.map(flight => {
      if (flight.vehicle && flight.vehicle.id) {
        flight.vehicle.id = flight.vehicle.id.toString();
      }
      return flight;
    });
    
    const normalizedVehicles = vehiclesData.map(vehicle => {
      if (vehicle.id) {
        vehicle.id = vehicle.id.toString();
      }
      return vehicle;
    });
    
    // Group flights by vehicle ID
    const flightsByVehicle = {};
    let assignedFlightsCount = 0;
    
    normalizedFlights.forEach(flight => {
      if (flight.vehicle && flight.vehicle.id) {
        const vehicleId = flight.vehicle.id;
        if (!flightsByVehicle[vehicleId]) {
          flightsByVehicle[vehicleId] = [];
        }
        flightsByVehicle[vehicleId].push(flight);
        assignedFlightsCount++;
      }
    });
    
    console.log(`Assigned ${assignedFlightsCount} flights to ${Object.keys(flightsByVehicle).length} unique vehicles`);
    
    // Check for vehicle IDs in flights that don't match any vehicles
    const vehicleIdsInFlights = new Set(Object.keys(flightsByVehicle));
    const vehicleIdsFromVehicles = new Set(normalizedVehicles.map(v => v.id));
    
    // Find vehicle IDs in flights that don't exist in vehicles data
    const missingVehicleIds = [...vehicleIdsInFlights].filter(id => !vehicleIdsFromVehicles.has(id));
    if (missingVehicleIds.length > 0) {
      console.warn(`Found ${missingVehicleIds.length} vehicle IDs in flights that don't match any known vehicles`);
      console.warn(`Examples: ${missingVehicleIds.slice(0, 5).join(', ')}`);
    }
    
    // Update vehicle flights map
    const newVehicleFlightsMap = {};
    normalizedVehicles.forEach(vehicle => {
      const vehicleId = vehicle.id;
      newVehicleFlightsMap[vehicleId] = {
        vehicleInfo: vehicle,
        flights: flightsByVehicle[vehicleId] || []
      };
    });
    
    // Count vehicles with flights
    const vehiclesWithFlights = normalizedVehicles.filter(v => 
      flightsByVehicle[v.id] && flightsByVehicle[v.id].length > 0
    ).length;
    
    console.log(`${vehiclesWithFlights} vehicles have at least one flight`);
    
    setVehicleFlightsMap(newVehicleFlightsMap);
    
    // Mark all vehicles as having their flights loaded
    const allLoaded = {};
    normalizedVehicles.forEach(vehicle => {
      allLoaded[vehicle.id] = true;
    });
    setLoadedAllVehicleFlights(allLoaded);
  };

  // Fetch all flights function
  const fetchAllFlights = useCallback(async (setLoadingState = true) => {
    try {
      if (setLoadingState) {
        setLoading(true);
      }
      setError(null);
      
      console.log('Fetching ALL flights from Auterion API...');
      const response = await axios.get(API_CONFIG.FLIGHTS_ENDPOINT, {
        headers: API_CONFIG.headers,
        params: {
          sort: 'desc',
          order_by: 'date',
          include_files: false,
          page_size: 100000
        }
      });
      
      const flightsData = Array.isArray(response.data) ? response.data : response.data.items || [];
      console.log(`Received flight data: ${flightsData.length} flights`);
      
      setFlights(flightsData);
      setAllFlightsLoaded(true);
      setCurrentPage(1);
      
      return flightsData;
    } catch (err) {
      console.error('Error fetching flights:', err);
      const errorMessage = err.response?.data?.message || 
        'Failed to fetch flights data. Please check your API token and try again.';
      setError(errorMessage);
      return null;
    } finally {
      if (setLoadingState) {
        setLoading(false);
      }
    }
  }, []);

  // Fetch vehicles function
  const fetchVehicles = async (setLoadingState = true) => {
    try {
      if (setLoadingState) {
        setLoading(true);
      }
      setError(null);
      
      console.log('Fetching vehicles from Auterion API...');
      const response = await axios.get(API_CONFIG.VEHICLES_ENDPOINT, {
        headers: API_CONFIG.headers
      });
      
      const vehiclesList = Array.isArray(response.data) ? response.data : response.data.items || [];
      console.log(`Received vehicles data: ${vehiclesList.length} vehicles`);
      
      setVehicles(vehiclesList);
      return vehiclesList;
    } catch (err) {
      console.error('Error fetching vehicles:', err);
      const errorMessage = err.response?.data?.message || 
        'Failed to fetch vehicles data. Please check your API token and try again.';
      setError(errorMessage);
      return null;
    } finally {
      if (setLoadingState) {
        setLoading(false);
      }
    }
  };

  // Fetch flights for a specific vehicle
  const fetchFlightsForVehicle = async (vehicleId) => {
    // Skip if already loaded all flights for this vehicle
    if (loadedAllVehicleFlights[vehicleId]) {
      console.log(`Already loaded flights for vehicle ${vehicleId}, skipping fetch`);
      return;
    }
    
    try {
      console.log(`Loading flights for vehicle ${vehicleId}...`);
      setLoadingVehicleFlights(prev => ({ ...prev, [vehicleId]: true }));
      
      // If we already have all flights loaded, use those instead of making a new API call
      if (allFlightsLoaded && flights.length > 0) {
        console.log(`Using cached flights for vehicle ${vehicleId}`);
        
        // Filter flights for this vehicle from our cached data
        const vehicleFlights = flights.filter(flight => 
          flight.vehicle && flight.vehicle.id === vehicleId
        );
        
        console.log(`Found ${vehicleFlights.length} flights for vehicle ${vehicleId} from cached data`);
        
        // Update the vehicle flights map
        setVehicleFlightsMap(prev => {
          const updatedMap = { ...prev };
          if (!updatedMap[vehicleId]) {
            const vehicleInfo = vehicles.find(v => v.id === vehicleId) || { id: vehicleId };
            updatedMap[vehicleId] = { vehicleInfo, flights: [] };
          }
          
          updatedMap[vehicleId] = {
            ...updatedMap[vehicleId],
            flights: vehicleFlights
          };
          
          return updatedMap;
        });
        
        setLoadedAllVehicleFlights(prev => ({ ...prev, [vehicleId]: true }));
      } else {
        // Make an API call to get vehicle-specific flights
        const response = await axios.get(`${API_CONFIG.VEHICLES_ENDPOINT}/${vehicleId}/flights`, {
          headers: API_CONFIG.headers
        });
        
        console.log(`Received ${response.data.items.length} flights for vehicle ${vehicleId}`);
        
        setVehicleFlightsMap(prev => {
          // Make sure we have the vehicle in our map
          const updatedMap = { ...prev };
          if (!updatedMap[vehicleId]) {
            const vehicleInfo = vehicles.find(v => v.id === vehicleId) || { id: vehicleId };
            updatedMap[vehicleId] = { vehicleInfo, flights: [] };
          }
          
          // Update with new flights data
          updatedMap[vehicleId] = {
            ...updatedMap[vehicleId],
            flights: response.data.items
          };
          
          return updatedMap;
        });
        
        setLoadedAllVehicleFlights(prev => ({ ...prev, [vehicleId]: true }));
      }
    } catch (err) {
      console.error(`Error fetching flights for vehicle ${vehicleId}:`, err);
    } finally {
      setLoadingVehicleFlights(prev => ({ ...prev, [vehicleId]: false }));
    }
  };

  const toggleVehicleExpansion = (vehicleId) => {
    // If expanding and we haven't loaded flights yet, fetch them
    if (!expandedVehicles[vehicleId] && !loadedAllVehicleFlights[vehicleId]) {
      fetchFlightsForVehicle(vehicleId);
    }
    
    setExpandedVehicles(prev => ({
      ...prev,
      [vehicleId]: !prev[vehicleId]
    }));
  };

  const expandAllVehicles = () => {
    // Fetch flights for all vehicles that don't have flights loaded yet
    vehicles.forEach(vehicle => {
      if (!loadedAllVehicleFlights[vehicle.id]) {
        fetchFlightsForVehicle(vehicle.id);
      }
    });
    
    const allExpanded = {};
    vehicles.forEach(vehicle => {
      allExpanded[vehicle.id] = true;
    });
    setExpandedVehicles(allExpanded);
  };

  const collapseAllVehicles = () => {
    setExpandedVehicles({});
  };

  // Add a function to expand only vehicles with flights
  const expandVehiclesWithFlights = () => {
    const newExpandedState = {};
    
    Object.entries(vehicleFlightsMap).forEach(([vehicleId, data]) => {
      if (data.flights && data.flights.length > 0) {
        newExpandedState[vehicleId] = true;
      } else {
        newExpandedState[vehicleId] = false;
      }
    });
    
    setExpandedVehicles(newExpandedState);
  };

  const formatDuration = (seconds) => {
    if (!seconds && seconds !== 0) return 'N/A';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    
    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (remainingSeconds > 0 || parts.length === 0) parts.push(`${remainingSeconds}s`);
    
    return parts.join(' ');
  };

  const handlePageChange = (newPage) => {
    if (newPage <= totalPages && newPage > 0) {
      setCurrentPage(newPage);
      window.scrollTo(0, 0);
    }
  };

  // Get the flights for the current page from the full dataset
  const getCurrentPageFlights = () => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return flights.slice(startIndex, endIndex);
  };

  // Filter vehicles based on search input
  const getFilteredVehicles = () => {
    if (!vehicleFilter) return vehicles;
    
    return vehicles.filter(vehicle => 
      (vehicle.name && vehicle.name.toLowerCase().includes(vehicleFilter.toLowerCase())) ||
      (vehicle.id && vehicle.id.toLowerCase().includes(vehicleFilter.toLowerCase())) ||
      (vehicle.model && vehicle.model.toLowerCase().includes(vehicleFilter.toLowerCase())) ||
      (vehicle.serial_number && vehicle.serial_number.toLowerCase().includes(vehicleFilter.toLowerCase()))
    );
  };

  // Add a function to sort vehicles
  const getSortedVehicles = () => {
    const filteredVehicles = getFilteredVehicles();
    
    return [...filteredVehicles].sort((a, b) => {
      if (sortVehiclesBy === 'flightCount') {
        const aFlights = vehicleFlightsMap[a.id]?.flights?.length || 0;
        const bFlights = vehicleFlightsMap[b.id]?.flights?.length || 0;
        return bFlights - aFlights; // Sort by most flights first
      }
      return 0;
    });
  };

  // Component for pagination controls
  const Pagination = () => (
    <div className="pagination">
      <button 
        onClick={() => handlePageChange(1)} 
        disabled={currentPage === 1}
        className="pagination-button"
      >
        First
      </button>
      <button 
        onClick={() => handlePageChange(currentPage - 1)} 
        disabled={currentPage === 1}
        className="pagination-button"
      >
        Previous
      </button>
      <span className="page-info">
        Page {currentPage} of {totalPages} ({flights.length} total flights)
      </span>
      <button 
        onClick={() => handlePageChange(currentPage + 1)} 
        disabled={currentPage >= totalPages}
        className="pagination-button"
      >
        Next
      </button>
      <button 
        onClick={() => handlePageChange(totalPages)} 
        disabled={currentPage >= totalPages}
        className="pagination-button"
      >
        Last
      </button>
    </div>
  );

  const toggleFlightView = (vehicleId) => {
    setCompactFlightView(prev => ({
      ...prev,
      [vehicleId]: !prev[vehicleId]
    }));
  };

  const sortFlights = (flights, field, direction) => {
    return [...flights].sort((a, b) => {
      let valueA = a[field];
      let valueB = b[field];
      
      // Handle date sorting
      if (field === 'date') {
        valueA = new Date(valueA).getTime();
        valueB = new Date(valueB).getTime();
      }
      
      // Compare values
      if (valueA < valueB) {
        return direction === 'asc' ? -1 : 1;
      }
      if (valueA > valueB) {
        return direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  };

  const handleSort = (field) => {
    setSortDirection(prevDirection => 
      sortField === field 
        ? (prevDirection === 'asc' ? 'desc' : 'asc') 
        : 'desc'
    );
    setSortField(field);
  };

  // Add cache clear function
  const clearCache = async () => {
    try {
      await axios.post(`${API_CONFIG.VEHICLES_ENDPOINT}/cache/clear`);
      // Refresh data after clearing cache
      if (view === 'flightsByVehicle') {
        const allFlightsData = await fetchAllFlights(false);
        const vehiclesData = await fetchVehicles(false);
        if (allFlightsData && vehiclesData) {
          processFlightsForVehicles(allFlightsData, vehiclesData);
        }
      } else {
        view === 'flights' ? fetchAllFlights() : fetchVehicles();
      }
    } catch (err) {
      console.error('Error clearing cache:', err);
      setError('Failed to clear cache');
    }
  };

  if (loading) {
    return (
      <div className="App">
        <div className="App-header">
          <div className="company-logo">
            <img src="/logo.png" alt="Company Logo" />
          </div>
          <h1>Loading {view} data...</h1>
          <div className="loading-spinner"></div>
          {view === 'flights' && (
            <div className="loading-message">
              <p>Fetching all available flights from the Auterion API</p>
              <p className="loading-explanation">The API may have internal limits on how many flights can be returned at once</p>
              <p className="loading-explanation">We'll load as many as the API provides</p>
            </div>
          )}
          {view === 'flightsByVehicle' && (
            <div className="loading-message">
              <p>Loading vehicle data...</p>
              <p className="loading-explanation">Flight data will be loaded on demand when you expand a vehicle</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="App">
        <div className="App-header">
          <div className="company-logo">
            <img src="/logo.png" alt="Company Logo" />
          </div>
          <h1>Error</h1>
          <p className="error-message">{error}</p>
          <button 
            onClick={() => {
              if (view === 'flightsByVehicle') {
                fetchVehicles();
              } else {
                view === 'flights' ? fetchAllFlights() : fetchVehicles();
              }
            }} 
            className="retry-button"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      <style>{styles}</style>
      <div className="App-header">
        <div className="company-logo">
          <img src="/logo.png" alt="Company Logo" />
        </div>
        
        <div className="view-toggle">
          <button 
            onClick={() => setView('analytics')} 
            className={`toggle-button ${view === 'analytics' ? 'active' : ''}`}
          >
            Analytics
          </button>
          <button 
            onClick={() => setView('flightsByVehicle')} 
            className={`toggle-button ${view === 'flightsByVehicle' ? 'active' : ''}`}
          >
            Flights by Vehicle
          </button>
          <button 
            onClick={() => setView('vehicles')} 
            className={`toggle-button ${view === 'vehicles' ? 'active' : ''}`}
          >
            All Vehicles
          </button>
          <button 
            onClick={() => setView('flights')} 
            className={`toggle-button ${view === 'flights' ? 'active' : ''}`}
          >
            All Flights
          </button>
        </div>

        <h1>
          {view === 'analytics' ? 'Flight Analytics' :
           view === 'flights' ? 'Flight Data' : 
           view === 'vehicles' ? 'Vehicle Data' : 
           'Flights by Vehicle'}
        </h1>
        
        <div className="actions-container">
          <div className="cache-info">
            {isCachedData && (
              <span className="cache-status">
                Using cached data from {new Date(lastCacheTime).toLocaleTimeString()}
              </span>
            )}
            <button 
              onClick={clearCache}
              className="clear-cache-button"
            >
              Clear Cache
            </button>
          </div>
          <button 
            onClick={async () => {
              if (view === 'flightsByVehicle') {
                setLoading(true);
                try {
                  setLoadedAllVehicleFlights({});
                  setVehicleFlightsMap({});
                  const allFlightsData = await fetchAllFlights(false);
                  const vehiclesData = await fetchVehicles(false);
                  if (allFlightsData && vehiclesData) {
                    processFlightsForVehicles(allFlightsData, vehiclesData);
                  }
                } catch (err) {
                  console.error("Error refreshing data:", err);
                  setError("Failed to refresh data. Please try again.");
                } finally {
                  setLoading(false);
                }
              } else {
                view === 'flights' ? fetchAllFlights() : fetchVehicles();
              }
            }}
            className="refresh-button"
          >
            Refresh Data
          </button>

          {view === 'flightsByVehicle' && (
            <div className="expand-buttons">
              <button onClick={expandAllVehicles} className="expand-all-button">
                Expand All
              </button>
              <button onClick={expandVehiclesWithFlights} className="expand-flights-button">
                Expand With Flights
              </button>
              <button onClick={collapseAllVehicles} className="collapse-all-button">
                Collapse All
              </button>
            </div>
          )}
        </div>

        {view === 'flights' && flights.length > 0 && (
          <div className="flight-stats">
            <p>Total Flights: <strong>{flights.length}</strong></p>
            <div className="page-size-selector">
              <label htmlFor="pageSize">Flights per page:</label>
              <select 
                id="pageSize" 
                value={itemsPerPage}
                onChange={(e) => {
                  const newItemsPerPage = parseInt(e.target.value);
                  setItemsPerPage(newItemsPerPage);
                  setCurrentPage(1); // Reset to first page when changing page size
                }}
              >
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="200">200</option>
                <option value="500">500</option>
              </select>
            </div>
          </div>
        )}

        {(view === 'vehicles' || view === 'flightsByVehicle') && (
          <div className="vehicle-filter">
            <input
              type="text"
              placeholder="Search vehicles by name, ID, model..."
              value={vehicleFilter}
              onChange={(e) => setVehicleFilter(e.target.value)}
              className="vehicle-search-input"
            />
            {vehicleFilter && (
              <button 
                onClick={() => setVehicleFilter('')}
                className="clear-filter-button"
              >
                Clear
              </button>
            )}
          </div>
        )}

        <div className={`data-container ${view === 'flightsByVehicle' ? 'full-width' : ''}`}>
          {view === 'analytics' ? (
            <Analytics />
          ) : view === 'flights' ? (
            <>
              {flights.length === 0 ? (
                <p className="no-data">No flights found</p>
              ) : (
                <>
                  <Pagination />
                  <div className="flights-grid">
                    {sortFlights(getCurrentPageFlights(), sortField, sortDirection).map((flight) => (
                      <div key={flight.id} className="card flight-card">
                        <h3>
                          <span>Flight {flight.id}</span>
                          <span className="status-badge active">Active</span>
                        </h3>
                        <div className="flight-meta">
                          <span>Vehicle ID: {flight.vehicle?.id || 'N/A'}</span>
                          <span>{new Date(flight.date).toLocaleDateString()}</span>
                        </div>
                        <div className="card-details">
                          <p>
                            <strong>Start Time</strong>
                            <span className="metric-value">{new Date(flight.date).toLocaleTimeString()}</span>
                          </p>
                          <p>
                            <strong>Duration</strong>
                            <span className="metric-value">{formatDuration(flight.duration)}</span>
                          </p>
                          <p>
                            <strong>Distance</strong>
                            <span className="metric-value">{Math.round(flight.distance)} meters</span>
                          </p>
                          <div className="flight-actions">
                            <a href={flight.flight_url} target="_blank" rel="noopener noreferrer" className="view-flight-btn">
                              View Flight Details
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Pagination />
                </>
              )}
            </>
          ) : view === 'vehicles' ? (
            vehicles.length === 0 ? (
              <p className="no-data">No vehicles found</p>
            ) : (
              <div className="vehicles-grid">
                {getFilteredVehicles().map((vehicle) => (
                  <div key={vehicle.id} className="card vehicle-card">
                    <h3>
                      <span>Vehicle {vehicle.id}</span>
                      <span className={`status-badge ${vehicle.state?.toLowerCase() || 'unknown'}`}>
                        {vehicle.state || 'Unknown'}
                      </span>
                    </h3>
                    <div className="card-details">
                      <p>
                        <strong>Name</strong>
                        <span>{vehicle.name || 'N/A'}</span>
                      </p>
                      <p>
                        <strong>Model</strong>
                        <span>{vehicle.model || 'N/A'}</span>
                      </p>
                      <p>
                        <strong>Serial Number</strong>
                        <span className="metric-value">{vehicle.serial_number || 'N/A'}</span>
                      </p>
                      <p>
                        <strong>Cloud Services</strong>
                        <span className={`status-badge ${vehicle.enable_cloud_services ? 'active' : 'inactive'}`}>
                          {vehicle.enable_cloud_services ? 'Enabled' : 'Disabled'}
                        </span>
                      </p>
                      {vehicleFlightsMap[vehicle.id] && loadedAllVehicleFlights[vehicle.id] && (
                        <div className="vehicle-stats">
                          <div className="stat-item">
                            <strong>Total Flights</strong>
                            <div className="metric-value">{vehicleFlightsMap[vehicle.id].flights.length}</div>
                          </div>
                        </div>
                      )}
                      <button 
                        className="view-flight-btn"
                        onClick={() => {
                          setView('flightsByVehicle');
                          toggleVehicleExpansion(vehicle.id);
                        }}
                      >
                        View Flight History
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            // Flights by Vehicle view
            <>
              {vehicles.length === 0 ? (
                <p className="no-data">No vehicles found</p>
              ) : (
                <>
                  <div className="vehicle-flights-summary">
                    <div className="summary-card">
                      <h3>Flight Summary</h3>
                      <div className="summary-stats">
                        <div className="stat-item">
                          <span className="stat-label">Total Vehicles</span>
                          <span className="stat-value">{vehicles.length}</span>
                        </div>
                        <div className="stat-item">
                          <span className="stat-label">Total Flights</span>
                          <span className="stat-value">{flights.length}</span>
                        </div>
                        <div className="stat-item">
                          <span className="stat-label">Vehicles with Flights</span>
                          <span className="stat-value">
                            {Object.values(vehicleFlightsMap).filter(v => v.flights && v.flights.length > 0).length}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="vehicle-flights-container">
                    {getSortedVehicles().map((vehicle) => {
                      const vehicleId = vehicle.id.toString();
                      const vehicleFlights = vehicleFlightsMap[vehicleId]?.flights || [];
                      const hasFlights = vehicleFlights.length > 0;
                      
                      const sortedFlights = sortFlights(vehicleFlights, sortField, sortDirection);
                      
                      return (
                        <div key={vehicleId} className={`card vehicle-flights-card ${hasFlights ? 'has-flights' : 'no-flights'}`}>
                          <div 
                            className="vehicle-header"
                            onClick={() => toggleVehicleExpansion(vehicleId)}
                          >
                            <div className="vehicle-title">
                              <h3>
                                <span className="vehicle-id">Vehicle {vehicleId}</span>
                                {vehicle.name && <span className="vehicle-name">{vehicle.name}</span>}
                              </h3>
                              {loadingVehicleFlights[vehicleId] ? (
                                <span className="flight-count loading">Loading...</span>
                              ) : loadedAllVehicleFlights[vehicleId] ? (
                                <span className="flight-count">
                                  {vehicleFlights.length > 0 ? 
                                    `${vehicleFlights.length} flights` : 
                                    'No flights'}
                                </span>
                              ) : (
                                <span className="flight-count">Click to load flights</span>
                              )}
                            </div>
                            <div className="vehicle-summary">
                              {vehicle.model && <span className="vehicle-model">{vehicle.model}</span>}
                              <span className={`vehicle-state status-${vehicle.state?.toLowerCase() || 'unknown'}`}>
                                {vehicle.state || 'Unknown Status'}
                              </span>
                              <span className={`expand-icon ${expandedVehicles[vehicleId] ? 'expanded' : ''}`}>
                                ▼
                              </span>
                            </div>
                          </div>
                          
                          {expandedVehicles[vehicleId] && (
                            <>
                              <div className="vehicle-details">
                                <div className="detail-row">
                                  <div className="detail-column">
                                    <p><strong>Serial Number:</strong> {vehicle.serial_number || 'N/A'}</p>
                                    <p><strong>State:</strong> <span className={`status-${vehicle.state?.toLowerCase() || 'unknown'}`}>{vehicle.state || 'N/A'}</span></p>
                                  </div>
                                  <div className="detail-column">
                                    <p><strong>Cloud Services:</strong> {vehicle.enable_cloud_services ? 'Enabled' : 'Disabled'}</p>
                                    <p><strong>Total Flights:</strong> {vehicleFlights.length}</p>
                                  </div>
                                </div>
                              </div>
                              <div className="flights-list">
                                {loadingVehicleFlights[vehicleId] ? (
                                  <div className="loading-vehicle-flights">
                                    <div className="loading-spinner"></div>
                                    <p>Loading flights for this vehicle...</p>
                                  </div>
                                ) : !vehicleFlights.length ? (
                                  <p className="no-flights">No flights recorded for this vehicle</p>
                                ) : (
                                  <>
                                    <div className="flights-header">
                                      <h4>{vehicleFlights.length} flights found for this vehicle</h4>
                                      {vehicleFlights.length > 10 && (
                                        <button className="compact-view-toggle" onClick={() => toggleFlightView(vehicleId)}>
                                          {compactFlightView[vehicleId] ? 'Show Details' : 'Compact View'}
                                        </button>
                                      )}
                                    </div>
                                    <table className="flights-table">
                                      <thead>
                                        <tr>
                                          <th>Flight ID</th>
                                          <th className="sortable-header" onClick={() => handleSort('date')}>
                                            Date {sortField === 'date' && <span className={`sort-arrow sort-${sortDirection}`}>▼</span>}
                                          </th>
                                          <th className="sortable-header" onClick={() => handleSort('duration')}>
                                            Duration {sortField === 'duration' && <span className={`sort-arrow sort-${sortDirection}`}>▼</span>}
                                          </th>
                                          <th className="sortable-header" onClick={() => handleSort('distance')}>
                                            Distance {sortField === 'distance' && <span className={`sort-arrow sort-${sortDirection}`}>▼</span>}
                                          </th>
                                          <th>Actions</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {(compactFlightView[vehicleId] 
                                          ? sortedFlights.slice(0, 10) 
                                          : sortedFlights
                                        ).map(flight => (
                                          <tr key={flight.id} className="flight-row">
                                            <td>Flight {flight.id}</td>
                                            <td>{new Date(flight.date).toLocaleString()}</td>
                                            <td>{formatDuration(flight.duration)}</td>
                                            <td>{Math.round(flight.distance)} meters</td>
                                            <td>
                                              <a href={flight.flight_url} target="_blank" rel="noopener noreferrer">
                                                View Flight
                                              </a>
                                            </td>
                                          </tr>
                                        ))}
                                        {compactFlightView[vehicleId] && sortedFlights.length > 10 && (
                                          <tr className="more-flights-row">
                                            <td colSpan="5" className="more-flights-cell">
                                              <button 
                                                onClick={() => setCompactFlightView(prev => ({ ...prev, [vehicleId]: false }))}
                                                className="view-more-button"
                                              >
                                                Show {sortedFlights.length - 10} more flights...
                                              </button>
                                            </td>
                                          </tr>
                                        )}
                                      </tbody>
                                    </table>
                                  </>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
