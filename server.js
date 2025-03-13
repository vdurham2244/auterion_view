require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const NodeCache = require('node-cache');
const NodeGeocoder = require('node-geocoder');

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize geocoder
const geocoder = NodeGeocoder({
  provider: 'google',
  apiKey: process.env.GOOGLE_MAPS_API_KEY,
  formatter: null
});

// Cache for geocoded locations
const locationCache = {};

// Helper function to delay execution
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to geocode a city with retry logic
async function geocodeCity(city, country, retries = 2) {
  const cacheKey = `${city},${country}`;
  
  // Return from cache if available
  if (locationCache[cacheKey]) {
    return locationCache[cacheKey];
  }

  try {
    const results = await geocoder.geocode(`${city}, ${country}`);
    if (results && results[0]) {
      const { latitude, longitude } = results[0];
      locationCache[cacheKey] = { lat: latitude, lng: longitude };
      console.log(`Successfully geocoded ${city}`);
      return locationCache[cacheKey];
    }
  } catch (error) {
    console.error(`Error geocoding ${city}, ${country}:`, error.message);
  }
  return null;
}

// Helper function to process cities in chunks
async function processCityChunk(cities, chunkSize = 10) {
  const chunks = [];
  for (let i = 0; i < cities.length; i += chunkSize) {
    chunks.push(cities.slice(i, i + chunkSize));
  }
  
  const results = {};
  for (let i = 0; i < chunks.length; i++) {
    console.log(`Processing chunk ${i + 1}/${chunks.length} (${chunks[i].length} cities)`);
    
    // Process cities in parallel (Google has good rate limits)
    const chunkResults = await Promise.all(
      chunks[i].map(async city => {
        const coords = await geocodeCity(city, 'USA');
        if (coords) {
          results[city] = coords;
          console.log(`Geocoded ${city}: ${JSON.stringify(coords)}`);
        }
        return null;
      })
    );
    
    // Small delay between chunks to be safe
    if (i < chunks.length - 1) {
      await delay(1000);
    }
  }
  return results;
}

// Helper function to batch geocode cities
async function batchGeocodeLocations(cities) {
  const uniqueCities = [...new Set(cities)];
  console.log(`Starting geocoding for ${uniqueCities.length} unique cities...`);
  
  try {
    const geocodedCities = await processCityChunk(uniqueCities);
    console.log(`Successfully geocoded ${Object.keys(geocodedCities).length}/${uniqueCities.length} cities`);
    return geocodedCities;
  } catch (error) {
    console.error('Error in batch geocoding:', error);
    return {};
  }
}

// Endpoints from environment or defaults
const FLIGHTS_ENDPOINT = process.env.FLIGHTS_ENDPOINT || 'https://api.auterion.com/flights';
const VEHICLES_ENDPOINT = process.env.VEHICLES_ENDPOINT || 'https://api.auterion.com/vehicles';

// Initialize cache with 5 minute TTL (time to live)
const cache = new NodeCache({ 
  stdTTL: 300, // 5 minutes in seconds
  checkperiod: 60 // Check for expired entries every minute
});

// Cache keys
const CACHE_KEYS = {
  FLIGHTS: 'all_flights',
  VEHICLES: 'all_vehicles'
};

// Configure CORS
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5000'],
  credentials: true
}));

app.use(express.json());

// Only serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'build')));
}

// API proxy endpoint to fetch flights
app.get('/api/flights', async (req, res) => {
  const apiToken = process.env.AUTERION_API_TOKEN;
  
  console.log('Received request for flights');
  console.log('API Token present:', !!apiToken);
  
  if (!apiToken) {
    return res.status(500).json({ 
      error: 'API token not configured. Please set AUTERION_API_TOKEN environment variable.' 
    });
  }

  try {
    // Check cache first
    const cachedFlights = cache.get(CACHE_KEYS.FLIGHTS);
    if (cachedFlights) {
      console.log('Returning cached flights data');
      return res.json(cachedFlights);
    }

    console.log('Cache miss - fetching fresh flights data');
    console.log('Making request to Auterion API endpoint:', FLIGHTS_ENDPOINT);
    console.log('*** ATTEMPTING TO FETCH ALL FLIGHTS WITH NO PAGINATION PARAMETERS ***');
    
    // Make the most basic request possible to the API - no pagination parameters
    const response = await axios.get(FLIGHTS_ENDPOINT, {
      headers: {
        'Accept': 'application/json',
        'x-api-key': apiToken.trim()
      },
      // Keep only the absolutely necessary parameters
      params: {
        sort: 'desc',
        order_by: 'date',
        include_files: false,
        page_size: 100000,
      }
    });
    
    console.log('Received response from Auterion API (flights)');
    
    let allFlights = Array.isArray(response.data)
      ? response.data
      : response.data.items || [];
    
    // Process flights to ensure vehicle data is correctly structured
    const processedFlights = allFlights.map(flight => {
      // Make sure vehicle data is properly formatted
      if (flight.vehicle) {
        // Ensure vehicle ID is a string to avoid type comparison issues
        if (flight.vehicle.id) {
          flight.vehicle.id = flight.vehicle.id.toString();
        }
      }
      return flight;
    });
    
    // Get unique vehicle IDs from flights for debugging
    const vehicleIdsInFlights = new Set();
    processedFlights.forEach(flight => {
      if (flight.vehicle && flight.vehicle.id) {
        vehicleIdsInFlights.add(flight.vehicle.id);
      }
    });
    
    console.log(`Found ${vehicleIdsInFlights.size} unique vehicle IDs in flights`);
    console.log(`Some example vehicle IDs: ${Array.from(vehicleIdsInFlights).slice(0, 5).join(', ')}`);
    
    // Before sending response, store in cache
    cache.set(CACHE_KEYS.FLIGHTS, { 
      items: processedFlights,
      total: processedFlights.length,
      uniqueVehicleIds: vehicleIdsInFlights.size,
      cached: true,
      cacheTime: new Date().toISOString()
    });

    // Send ALL flights to the client with vehicle metadata
    res.json({ 
      items: processedFlights,
      total: processedFlights.length,
      uniqueVehicleIds: vehicleIdsInFlights.size,
      cached: false
    });
  } catch (error) {
    console.error('Error fetching flights:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    
    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.message || 'Unknown error occurred';
      return res.status(status).json({ error: message });
    } else if (error.request) {
      return res.status(503).json({ error: 'Unable to reach Auterion API. Please try again later' });
    } else {
      return res.status(500).json({ error: 'Internal server error occurred' });
    }
  }
});

// API proxy endpoint to fetch vehicles
app.get('/api/vehicles', async (req, res) => {
  const apiToken = process.env.AUTERION_API_TOKEN;
  
  console.log('Received request for vehicles');
  console.log('API Token present:', !!apiToken);
  
  if (!apiToken) {
    return res.status(500).json({ 
      error: 'API token not configured. Please set AUTERION_API_TOKEN environment variable.' 
    });
  }

  try {
    // Check cache first
    const cachedVehicles = cache.get(CACHE_KEYS.VEHICLES);
    if (cachedVehicles) {
      console.log('Returning cached vehicles data');
      return res.json(cachedVehicles);
    }

    console.log('Cache miss - fetching fresh vehicles data');
    console.log('Making request to Auterion API endpoint:', VEHICLES_ENDPOINT);
    const response = await axios.get(VEHICLES_ENDPOINT, {
      headers: {
        'Accept': 'application/json',
        'x-api-key': apiToken.trim()
      }
    });
    
    console.log('Received response from Auterion API (vehicles)');
    
    let vehicles = Array.isArray(response.data)
      ? response.data
      : response.data.items || [];
    
    console.log(`*** TOTAL VEHICLES FETCHED FROM API: ${vehicles.length} ***`);
    
    // Process vehicles to ensure IDs are consistently formatted
    const processedVehicles = vehicles.map(vehicle => {
      // Ensure vehicle ID is a string to avoid type comparison issues
      if (vehicle.id) {
        vehicle.id = vehicle.id.toString();
      }
      return vehicle;
    });
    
    // Log some vehicle IDs for debugging
    if (processedVehicles.length > 0) {
      console.log(`First 5 vehicle IDs: ${processedVehicles.slice(0, 5).map(v => v.id).join(', ')}`);
    }
    
    // Before sending response, store in cache
    cache.set(CACHE_KEYS.VEHICLES, { 
      items: processedVehicles,
      total: processedVehicles.length,
      cached: true,
      cacheTime: new Date().toISOString()
    });

    res.json({ 
      items: processedVehicles,
      total: processedVehicles.length,
      cached: false
    });
  } catch (error) {
    console.error('Error fetching vehicles:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    
    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.message || 'Unknown error occurred';
      return res.status(status).json({ error: message });
    } else if (error.request) {
      return res.status(503).json({ error: 'Unable to reach Auterion API. Please try again later' });
    } else {
      return res.status(500).json({ error: 'Internal server error occurred' });
    }
  }
});

// API endpoint to fetch flights for a specific vehicle
app.get('/api/vehicles/:vehicleId/flights', async (req, res) => {
  const apiToken = process.env.AUTERION_API_TOKEN;
  const { vehicleId } = req.params;
  
  console.log(`Received request for flights of vehicle ID: ${vehicleId}`);
  console.log('API Token present:', !!apiToken);
  
  if (!apiToken) {
    return res.status(500).json({ 
      error: 'API token not configured. Please set AUTERION_API_TOKEN environment variable.' 
    });
  }

  try {
    console.log(`Making API request for all flights to find vehicle: ${vehicleId}`);
    
    // Request all flights, then filter by vehicle ID client-side
    const response = await axios.get(FLIGHTS_ENDPOINT, {
      headers: {
        'Accept': 'application/json',
        'x-api-key': apiToken.trim()
      },
      params: {
        sort: 'desc',
        order_by: 'date',
        include_files: false
      }
    });
    
    console.log(`Received response from Auterion API with all flights`);
    
    let allFlights = Array.isArray(response.data)
      ? response.data
      : response.data.items || [];
    
    console.log(`Total flights received from API: ${allFlights.length}`);
    
    // Normalize vehicleId to string format for comparison
    const normalizedVehicleId = vehicleId.toString();
    
    // Filter to find flights for this vehicle with explicit debugging
    const vehicleFlights = allFlights.filter(flight => {
      const hasVehicle = !!flight.vehicle;
      const hasVehicleId = hasVehicle && !!flight.vehicle.id;
      const flightVehicleId = hasVehicleId ? flight.vehicle.id.toString() : null;
      const isMatch = flightVehicleId === normalizedVehicleId;
      
      if (hasVehicleId) {
        return isMatch;
      }
      return false;
    });
    
    console.log(`*** FOUND ${vehicleFlights.length} FLIGHTS FOR VEHICLE ${vehicleId} ***`);
    
    if (vehicleFlights.length === 0) {
      console.log(`No flights found for vehicle ${vehicleId} - checking vehicle ID format and comparison`);
      
      // Log some debug info about the flight vehicle IDs we're seeing
      const vehicleIds = new Set();
      allFlights.forEach(flight => {
        if (flight.vehicle && flight.vehicle.id) {
          vehicleIds.add(flight.vehicle.id.toString());
        }
      });
      
      console.log(`Found these vehicle IDs in flights: ${Array.from(vehicleIds).slice(0, 10).join(', ')}${vehicleIds.size > 10 ? '...' : ''}`);
      console.log(`Looking for vehicle ID: ${vehicleId} (${typeof vehicleId})`);
      
      // Check if there's any similar vehicle ID (in case of formatting issues)
      const similarIds = Array.from(vehicleIds).filter(id => 
        id.includes(vehicleId) || vehicleId.includes(id)
      );
      if (similarIds.length > 0) {
        console.log(`Found similar vehicle IDs: ${similarIds.join(', ')}`);
      }
    }
    
    res.json({ 
      items: vehicleFlights,
      total: vehicleFlights.length,
      vehicleId,
      allFlightsCount: allFlights.length
    });
  } catch (error) {
    console.error(`Error fetching flights for vehicle ${vehicleId}:`, {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    
    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.message || 'Unknown error occurred';
      return res.status(status).json({ error: message });
    } else if (error.request) {
      return res.status(503).json({ error: 'Unable to reach Auterion API. Please try again later' });
    } else {
      return res.status(500).json({ error: 'Internal server error occurred' });
    }
  }
});

// API endpoint to get yearly statistics
app.get('/api/yearly-stats', async (req, res) => {
  const apiToken = process.env.AUTERION_API_TOKEN;
  
  if (!apiToken) {
    return res.status(500).json({ 
      error: 'API token not configured. Please set AUTERION_API_TOKEN environment variable.' 
    });
  }

  try {
    // Try to get flights from cache first
    let flights = cache.get(CACHE_KEYS.FLIGHTS)?.items;

    // If not in cache, fetch from API
    if (!flights) {
      const response = await axios.get(FLIGHTS_ENDPOINT, {
        headers: {
          'Accept': 'application/json',
          'x-api-key': apiToken.trim()
        },
        params: {
          sort: 'desc',
          order_by: 'date',
          include_files: false,
          page_size: 100000,
        }
      });
      
      flights = Array.isArray(response.data) ? response.data : response.data.items || [];
    }

    // Process flights to get yearly statistics
    const yearlyStats = flights.reduce((acc, flight) => {
      const year = new Date(flight.date).getFullYear();
      
      if (!acc[year]) {
        acc[year] = {
          year,
          totalFlights: 0,
          totalMinutes: 0,
          totalDistance: 0,
          vehicles: new Set(),
          totalDuration: 0
        };
      }
      
      acc[year].totalFlights++;
      
      // Add duration (convert from seconds to minutes)
      if (flight.duration) {
        acc[year].totalMinutes += flight.duration / 60;
      }

      // Add distance
      if (flight.distance) {
        acc[year].totalDistance += flight.distance;
      }
      
      // Track unique vehicles
      if (flight.vehicle && flight.vehicle.id) {
        acc[year].vehicles.add(flight.vehicle.id);
      }
      
      return acc;
    }, {});

    // Convert to array and format the response
    const formattedStats = Object.values(yearlyStats)
      .map(stat => ({
        year: stat.year,
        totalFlights: stat.totalFlights,
        totalMinutes: Math.round(stat.totalMinutes),
        totalDistance: Math.round(stat.totalDistance),
        uniqueVehicles: stat.vehicles.size,
        flightsPerVehicle: (stat.totalFlights / stat.vehicles.size).toFixed(1),
        hoursPerVehicle: (stat.totalMinutes / 60 / stat.vehicles.size).toFixed(1),
        averageFlightDuration: (stat.totalMinutes / stat.totalFlights).toFixed(1),
        averageDistance: (stat.totalDistance / stat.totalFlights).toFixed(1)
      }))
      .sort((a, b) => b.year - a.year); // Sort by year descending

    res.json(formattedStats);
  } catch (error) {
    console.error('Error getting yearly statistics:', error);
    res.status(500).json({ error: 'Failed to fetch yearly statistics' });
  }
});

// API endpoint to get location data for heat maps
app.get('/api/location-stats', async (req, res) => {
  try {
    console.log('Received request for location statistics');
    const apiToken = process.env.AUTERION_API_TOKEN;
    
    if (!apiToken) {
      console.error('API token not found');
      return res.status(500).json({ 
        error: 'API token not configured. Please set AUTERION_API_TOKEN environment variable.' 
      });
    }

    // Try to get data from cache first
    console.log('Checking cache for flight data...');
    let flightData = cache.get(CACHE_KEYS.FLIGHTS)?.items;
    if (!flightData) {
      console.log('Cache miss - fetching fresh flight data');
      const response = await axios.get(FLIGHTS_ENDPOINT, {
        headers: {
          'Accept': 'application/json',
          'x-api-key': apiToken.trim()
        },
        params: {
          sort: 'desc',
          order_by: 'date',
          include_files: false,
          page_size: 100000,
        }
      });
      flightData = Array.isArray(response.data) ? response.data : response.data.items || [];
      console.log(`Fetched ${flightData.length} flights from API`);
    } else {
      console.log(`Using ${flightData.length} flights from cache`);
    }

    // Process flights by year and month
    console.log('Processing flight data for location statistics...');
    const locationStats = {};
    const allCities = new Set();
    
    for (const flight of flightData) {
      if (!flight.date || !flight.location?.city) continue;
      
      const date = new Date(flight.date);
      const year = date.getFullYear();
      const month = date.getMonth();
      const city = flight.location.city;
      
      allCities.add(city);
      
      if (!locationStats[year]) {
        locationStats[year] = {
          year,
          months: Array(12).fill(null).map((_, i) => ({
            month: i,
            locations: {}
          })),
          locations: {}
        };
      }

      // Update yearly stats
      if (!locationStats[year].locations[city]) {
        locationStats[year].locations[city] = {
          city,
          count: 0,
          totalDuration: 0,
          totalDistance: 0
        };
      }
      locationStats[year].locations[city].count++;
      locationStats[year].locations[city].totalDuration += flight.duration || 0;
      locationStats[year].locations[city].totalDistance += flight.distance || 0;

      // Update monthly stats
      if (!locationStats[year].months[month].locations[city]) {
        locationStats[year].months[month].locations[city] = {
          city,
          count: 0,
          totalDuration: 0,
          totalDistance: 0
        };
      }
      locationStats[year].months[month].locations[city].count++;
      locationStats[year].months[month].locations[city].totalDuration += flight.duration || 0;
      locationStats[year].months[month].locations[city].totalDistance += flight.distance || 0;
    }

    // Geocode all unique cities first
    console.log(`Found ${allCities.size} unique cities`);
    const geocodedCities = await batchGeocodeLocations(Array.from(allCities));

    // Convert to array format and add geocoding
    const result = Object.values(locationStats).map(yearData => {
      // Process yearly locations
      const yearLocations = Object.values(yearData.locations)
        .map(loc => {
          const coords = geocodedCities[loc.city] || {};
          // Adjust intensity calculation for smaller datasets
          // Scale from 0 to 1 based on flight count thresholds
          const intensity = Math.min(loc.count / 50, 1); // Max intensity at 50 flights
          return {
            ...loc,
            ...coords,
            intensity,
            // Add raw count for UI display
            flightCount: loc.count
          };
        })
        .sort((a, b) => b.count - a.count);

      // Process monthly locations
      const months = yearData.months.map(monthData => {
        const monthLocations = Object.values(monthData.locations)
          .map(loc => {
            const coords = geocodedCities[loc.city] || {};
            // Use same intensity calculation for monthly view
            const intensity = Math.min(loc.count / 25, 1); // Lower threshold for monthly view
            return {
              ...loc,
              ...coords,
              intensity,
              flightCount: loc.count
            };
          })
          .sort((a, b) => b.count - a.count);
        return {
          month: monthData.month,
          locations: monthLocations
        };
      });

      return {
        year: yearData.year,
        locations: yearLocations,
        months
      };
    });

    console.log('Successfully processed all location data');
    res.json(result);
  } catch (error) {
    console.error('Error in location-stats endpoint:', error);
    res.status(500).json({ 
      error: 'Failed to fetch location statistics',
      details: error.message 
    });
  }
});

// API endpoint to get ROM comparison data
app.get('/api/rom-comparison', async (req, res) => {
  const apiToken = process.env.AUTERION_API_TOKEN;
  
  if (!apiToken) {
    return res.status(500).json({ 
      error: 'API token not configured. Please set AUTERION_API_TOKEN environment variable.' 
    });
  }

  try {
    // Try to get flights from cache first
    let flights = cache.get(CACHE_KEYS.FLIGHTS)?.items;

    // If not in cache, fetch from API
    if (!flights) {
      const response = await axios.get(FLIGHTS_ENDPOINT, {
        headers: {
          'Accept': 'application/json',
          'x-api-key': apiToken.trim()
        },
        params: {
          sort: 'desc',
          order_by: 'date',
          include_files: false,
          page_size: 100000,
        }
      });
      
      flights = Array.isArray(response.data) ? response.data : response.data.items || [];
    }

    // Process flights to get daily ROM data
    const dailyROM = flights.reduce((acc, flight) => {
      if (!flight.date || !flight.duration) return acc;
      
      const date = new Date(flight.date);
      const year = date.getFullYear();
      const month = date.getMonth();
      const day = date.getDate();
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      
      if (!acc[dateKey]) {
        acc[dateKey] = {
          date: dateKey,
          year,
          month,
          day,
          totalMinutes: 0,
          flightCount: 0
        };
      }
      
      // Convert duration from seconds to minutes
      acc[dateKey].totalMinutes += flight.duration / 60;
      acc[dateKey].flightCount++;
      
      return acc;
    }, {});

    // Convert to array and sort by date
    const sortedDailyData = Object.values(dailyROM).sort((a, b) => a.date.localeCompare(b.date));

    // Calculate weekly data
    const weeklyROM = sortedDailyData.reduce((acc, day) => {
      const date = new Date(day.date);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
      const weekKey = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;

      if (!acc[weekKey]) {
        acc[weekKey] = {
          weekStart: weekKey,
          year: weekStart.getFullYear(),
          totalMinutes: 0,
          flightCount: 0
        };
      }

      acc[weekKey].totalMinutes += day.totalMinutes;
      acc[weekKey].flightCount += day.flightCount;

      return acc;
    }, {});

    // Calculate monthly data
    const monthlyROM = sortedDailyData.reduce((acc, day) => {
      const monthKey = `${day.year}-${String(day.month + 1).padStart(2, '0')}`;

      if (!acc[monthKey]) {
        acc[monthKey] = {
          month: monthKey,
          year: day.year,
          totalMinutes: 0,
          flightCount: 0
        };
      }

      acc[monthKey].totalMinutes += day.totalMinutes;
      acc[monthKey].flightCount += day.flightCount;

      return acc;
    }, {});

    res.json({
      daily: sortedDailyData,
      weekly: Object.values(weeklyROM).sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
      monthly: Object.values(monthlyROM).sort((a, b) => a.month.localeCompare(b.month))
    });
  } catch (error) {
    console.error('Error getting ROM comparison data:', error);
    res.status(500).json({ error: 'Failed to fetch ROM comparison data' });
  }
});

// Catch-all route to serve React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Add cache clear endpoint
app.post('/api/cache/clear', (req, res) => {
  cache.flushAll();
  console.log('Cache cleared');
  res.json({ message: 'Cache cleared successfully' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});


