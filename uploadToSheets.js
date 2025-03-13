const { google } = require("googleapis");
const fs = require("fs");
const axios = require("axios");
require("dotenv").config();

// Replace with your actual Google Sheet ID
const SHEET_ID = "1JJfwsdmzYHRbo7TesMStC15BHtOTye3MYzoILzGu784";

// Define read ranges for existing data and append ranges for new rows
const FLIGHTS_READ_RANGE = "Flights!A:Z";   // Reads all rows/columns in the Flights sheet
const VEHICLES_READ_RANGE = "Vehicles!A:I"; // Reads all rows/columns in the Vehicles sheet
const FLIGHTS_APPEND_RANGE = "Flights";      // Append to Flights sheet
const VEHICLES_APPEND_RANGE = "Vehicles";    // Append to Vehicles sheet
const VEHICLE_DETAILS_RANGE = "VehicleDetails!A1"; // Full update for detailed info

// Load service account credentials
const serviceAccountKey = JSON.parse(fs.readFileSync("google-service-account.json"));
const auth = new google.auth.GoogleAuth({
  credentials: serviceAccountKey,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});
const sheets = google.sheets({ version: "v4", auth });

// Auterion API details
const AUTERION_API_TOKEN = process.env.AUTERION_API_TOKEN;
const FLIGHTS_API = "https://api.auterion.com/flights";
const VEHICLES_API = "https://api.auterion.com/vehicles";

/**
 * Reads data from a given Google Sheets range.
 */
async function getSheetData(range) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: range
    });
    return res.data.values || [];
  } catch (error) {
    console.error(`Error reading data from ${range}:`, error);
    return [];
  }
}

/**
 * Appends rows to a given Google Sheets range.
 */
async function appendRowsToSheet(range, rows) {
  if (rows.length === 0) {
    console.log(`No new rows to append for ${range}`);
    return;
  }
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: range,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: rows }
    });
    console.log(`Appended ${rows.length} new rows to ${range}`);
  } catch (error) {
    console.error(`Error appending rows to ${range}:`, error);
  }
}

/**
 * Fetch all flights from the Auterion API.
 */
async function fetchAllFlights() {
  const response = await axios.get(FLIGHTS_API, {
    headers: {
      "x-api-key": AUTERION_API_TOKEN,
      "Accept": "application/json"
    },
    params: {
      sort: "desc",
      order_by: "date",
      include_files: false,
      page_size: 100000 // High value to fetch all flights
    }
  });
  return Array.isArray(response.data)
    ? response.data
    : response.data.items || [];
}

/**
 * Fetch all vehicles from the Auterion API.
 */
async function fetchAllVehicles() {
  const response = await axios.get(VEHICLES_API, {
    headers: {
      "x-api-key": AUTERION_API_TOKEN,
      "Accept": "application/json"
    }
  });
  return Array.isArray(response.data)
    ? response.data
    : response.data.items || [];
}

/**
 * Updates the Flights sheet by appending only new flights.
 */
async function updateFlightsSheet() {
  console.log("Fetching flights from Auterion API...");
  const flights = await fetchAllFlights();
  console.log(`Fetched ${flights.length} flights from API.`);

  // Read existing flights from the sheet (assumes header in row 1; flight ID in column A)
  const sheetData = await getSheetData(FLIGHTS_READ_RANGE);
  const existingFlightIds = new Set();
  if (sheetData.length > 1) {
    sheetData.slice(1).forEach(row => {
      if (row[0]) existingFlightIds.add(row[0].toString());
    });
  }
  console.log(`Found ${existingFlightIds.size} flight IDs already in the sheet.`);

  // Filter new flights based on unique ID
  const newFlights = flights.filter(flight => !existingFlightIds.has(flight.id.toString()));
  console.log(`Identified ${newFlights.length} new flights to add.`);

  // Format rows as [ID, Date, Distance, Duration, Vehicle ID, URL]
  const newRows = newFlights.map(flight => [
    flight.id,
    flight.date,
    flight.distance,
    flight.duration,
    flight.vehicle ? flight.vehicle.id : "N/A",
    flight.flight_url
  ]);

  await appendRowsToSheet(FLIGHTS_APPEND_RANGE, newRows);
}

/**
 * Updates the Vehicles sheet by appending only new vehicles.
 */
async function updateVehiclesSheet() {
  console.log("Fetching vehicles from Auterion API...");
  const vehicles = await fetchAllVehicles();
  console.log(`Fetched ${vehicles.length} vehicles from API.`);

  // Read existing vehicles from the sheet (assumes header in row 1; vehicle ID in column A)
  const sheetData = await getSheetData(VEHICLES_READ_RANGE);
  const existingVehicleIds = new Set();
  if (sheetData.length > 1) {
    sheetData.slice(1).forEach(row => {
      if (row[0]) existingVehicleIds.add(row[0].toString());
    });
  }
  console.log(`Found ${existingVehicleIds.size} vehicle IDs already in the sheet.`);

  // Filter new vehicles based on unique ID
  const newVehicles = vehicles.filter(vehicle => !existingVehicleIds.has(vehicle.id.toString()));
  console.log(`Identified ${newVehicles.length} new vehicles to add.`);

  // Format rows as [ID, Name, Model, Serial Number, Skynode Serial Number, Flight Controller ID, Transfer Lock, Archived, Enable Cloud Services]
  const newRows = newVehicles.map(vehicle => [
    vehicle.id,
    vehicle.name,
    vehicle.model,
    vehicle.serial_number,
    vehicle.skynode_serial_number,
    vehicle.flight_controller_id,
    vehicle.transfer_lock,
    vehicle.archived,
    vehicle.enable_cloud_services
  ]);

  await appendRowsToSheet(VEHICLES_APPEND_RANGE, newRows);
}

/**
 * Fetch detailed information for a single vehicle using GET /vehicles/{id}.
 */
async function fetchVehicleDetail(vehicleId) {
  try {
    const response = await axios.get(`${VEHICLES_API}/${vehicleId}`, {
      headers: {
        "x-api-key": AUTERION_API_TOKEN,
        "Accept": "application/json"
      }
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching details for vehicle ID ${vehicleId}:`, error.message);
    return null;
  }
}

/**
 * Updates the VehicleDetails sheet with detailed vehicle information.
 * This is a full update (overwrite) for detailed vehicle info.
 */
async function updateVehicleDetailsSheet() {
  console.log("Fetching vehicles for detailed info...");
  const vehicles = await fetchAllVehicles();
  console.log(`Fetched ${vehicles.length} vehicles.`);

  // Define header row for detailed info (units removed)
  const header = [
    "ID",
    "Name",
    "Model",
    "Serial Number",
    "Skynode Serial Number",
    "Flight Controller ID",
    "Transfer Lock",
    "Archived",
    "State",
    "Enable Cloud Services",
    "Groups",
    "Flights Count",
    "Total Flight Distance",
    "Total Flight Duration",
    "Avg Flight Distance",
    "Avg Flight Duration"
  ];
  const rows = [header];

  // Fetch detailed info for each vehicle concurrently
  const detailedVehicles = await Promise.all(
    vehicles.map(async (vehicle) => await fetchVehicleDetail(vehicle.id))
  );
  const validDetails = detailedVehicles.filter(detail => detail !== null);

  validDetails.forEach(vehicle => {
    const groupsStr = Array.isArray(vehicle.groups) ? vehicle.groups.join(", ") : "";
    const flightsInfo = vehicle.flights || {};
    rows.push([
      vehicle.id,
      vehicle.name,
      vehicle.model,
      vehicle.serial_number,
      vehicle.skynode_serial_number,
      vehicle.flight_controller_id,
      vehicle.transfer_lock,
      vehicle.archived,
      vehicle.state,
      vehicle.enable_cloud_services,
      groupsStr,
      flightsInfo.count,
      flightsInfo.total_flight_distance,
      flightsInfo.total_flight_duration,
      flightsInfo.avg_flight_distance,
      flightsInfo.avg_flight_duration
    ]);
  });

  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: VEHICLE_DETAILS_RANGE,
      valueInputOption: "RAW",
      requestBody: { values: rows }
    });
    console.log("Successfully updated VehicleDetails sheet with detailed info!");
  } catch (error) {
    console.error("Error updating VehicleDetails sheet:", error);
  }
}

/**
 * Main function to update everything:
 * - It checks the Flights and Vehicles sheets, appends new unique records,
 *   and then fully updates the VehicleDetails sheet.
 */
async function updateSheets() {
  await updateFlightsSheet();
  await updateVehiclesSheet();
  await updateVehicleDetailsSheet();
}

updateSheets();
