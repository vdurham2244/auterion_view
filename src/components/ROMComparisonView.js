import React, { useState, useEffect } from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import './ROMComparisonView.css';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

// For year-to-date and monthly comparisons, we want only 2024 and 2025.
const DEFAULT_COMPARISON_YEARS = ['2024', '2025'];

// Helper for weekly and daily comparisons: include 2023 if available.
const getComparisonYearsForWeekAndDay = (romData) => {
  if (!romData) return DEFAULT_COMPARISON_YEARS;
  const yearsSet = new Set(romData.daily.map(item => item.year.toString()));
  const candidateYears = ['2023', '2024', '2025'];
  return candidateYears.filter(year => yearsSet.has(year));
};

const getColorForYear = (year) => {
  switch(year) {
    case '2023': return 'rgba(54, 162, 235, 0.5)';
    case '2024': return 'rgba(75, 192, 192, 0.5)';
    case '2025': return 'rgba(255, 99, 132, 0.5)';
    default: return 'rgba(153, 102, 255, 0.5)';
  }
};

const getBorderColorForYear = (year) => {
  switch(year) {
    case '2023': return 'rgb(54, 162, 235)';
    case '2024': return 'rgb(75, 192, 192)';
    case '2025': return 'rgb(255, 99, 132)';
    default: return 'rgb(153, 102, 255)';
  }
};

const ROMComparisonView = () => {
  const [romData, setRomData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [comparisonType, setComparisonType] = useState('year'); // 'year', 'month', 'week', 'day'
  
  useEffect(() => {
    fetchROMData();
  }, []);

  useEffect(() => {
    if (romData) {
      // Set initial selected week to the most recent week
      const weeks = getAvailableWeeks();
      if (weeks.length > 0) {
        setSelectedWeek(weeks[0].value);
      }
      // Set initial selected date to the most recent date
      const dates = getAvailableDates();
      if (dates.length > 0) {
        setSelectedDate(dates[0].value);
      }
    }
  }, [romData]);

  const fetchROMData = async () => {
    try {
      const response = await fetch('/api/rom-comparison');
      const data = await response.json();
      setRomData(data);
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch ROM data');
      setLoading(false);
    }
  };

  const calculateGrowth = (current, previous) => {
    if (!previous || previous === 0) return 'N/A';
    const growth = ((current - previous) / previous) * 100;
    return `${growth.toFixed(1)}%`;
  };

  const calculateYearToDateTotals = () => {
    if (!romData) return {};
    
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const currentDay = currentDate.getDate();
    
    const totals = {};
    romData.daily.forEach(item => {
      const itemDate = new Date(item.date);
      const itemMonth = itemDate.getMonth();
      const itemDay = itemDate.getDate();
      
      if (itemMonth < currentMonth || (itemMonth === currentMonth && itemDay <= currentDay)) {
        const year = item.year.toString();
        if (!totals[year]) {
          totals[year] = { totalMinutes: 0, flightCount: 0 };
        }
        totals[year].totalMinutes += item.totalMinutes;
        totals[year].flightCount += item.flightCount;
      }
    });
    
    return totals;
  };

  const calculateMonthTotals = (targetMonth) => {
    if (!romData) return {};
    
    const currentDate = new Date();
    const isCurrentMonth = targetMonth === currentDate.getMonth();
    const currentDay = currentDate.getDate();
    
    const totals = {};
    romData.daily.forEach(item => {
      const itemDate = new Date(item.date);
      const itemMonth = itemDate.getMonth();
      const itemDay = itemDate.getDate();
      
      if (itemMonth === targetMonth && (!isCurrentMonth || itemDay <= currentDay)) {
        const year = item.year.toString();
        if (!totals[year]) {
          totals[year] = { totalMinutes: 0, flightCount: 0 };
        }
        totals[year].totalMinutes += item.totalMinutes;
        totals[year].flightCount += item.flightCount;
      }
    });
    
    return totals;
  };

  const calculateWeekTotals = (weekStart) => {
    if (!romData || !weekStart) return {};
    
    const baseDate = new Date(weekStart);
    const totals = {};
    const years = getComparisonYearsForWeekAndDay(romData);
    years.forEach(year => {
      const yearStartDate = new Date(baseDate);
      yearStartDate.setFullYear(parseInt(year));
      const yearEndDate = new Date(yearStartDate);
      yearEndDate.setDate(yearStartDate.getDate() + 6);
      
      totals[year] = { totalMinutes: 0, flightCount: 0 };

      romData.daily.forEach(item => {
        const itemDate = new Date(item.date);
        if (item.year.toString() === year &&
            itemDate >= yearStartDate &&
            itemDate <= yearEndDate) {
          totals[year].totalMinutes += item.totalMinutes;
          totals[year].flightCount += item.flightCount;
        }
      });
    });
    
    return totals;
  };

  const calculateDailyTotals = (selectedDate) => {
    if (!romData || !selectedDate) return {};
    
    const date = new Date(selectedDate);
    const month = date.getMonth();
    const day = date.getDate();
    
    const totals = {};
    const years = getComparisonYearsForWeekAndDay(romData);
    years.forEach(year => {
      totals[year] = { totalMinutes: 0, flightCount: 0 };

      romData.daily.forEach(item => {
        const itemDate = new Date(item.date);
        if (item.year.toString() === year &&
            itemDate.getMonth() === month &&
            itemDate.getDate() === day) {
          totals[year].totalMinutes += item.totalMinutes;
          totals[year].flightCount += item.flightCount;
        }
      });
    });
    
    return totals;
  };

  const getAvailableWeeks = () => {
    if (!romData) return [];
    
    const weeks = new Set();
    // Only use 2025 data to get available weeks (as a baseline)
    romData.daily.filter(item => item.year.toString() === '2025').forEach(item => {
      const date = new Date(item.date);
      // Get Monday of the week
      const monday = new Date(date);
      monday.setDate(date.getDate() - date.getDay() + 1);
      weeks.add(monday.toISOString().split('T')[0]);
    });
    
    return Array.from(weeks)
      .sort((a, b) => new Date(b) - new Date(a))
      .map(date => {
        const start = new Date(date);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        return {
          value: date,
          label: `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
        };
      });
  };

  const getAvailableDates = () => {
    if (!romData) return [];
    
    const dates = new Set();
    // Only use 2025 data to get available dates (as a baseline)
    romData.daily.filter(item => item.year.toString() === '2025').forEach(item => {
      const date = new Date(item.date);
      dates.add(date.toISOString().split('T')[0]);
    });
    
    return Array.from(dates)
      .sort((a, b) => new Date(b) - new Date(a))
      .map(date => ({
        value: date,
        label: new Date(date).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric'
        })
      }));
  };

  if (loading) return <div className="rom-loading">Loading ROM data...</div>;
  if (error) return <div className="rom-error">{error}</div>;
  if (!romData) return null;

  const yearToDateTotals = calculateYearToDateTotals();
  const monthTotals = calculateMonthTotals(selectedMonth);
  const weekTotals = calculateWeekTotals(selectedWeek);
  const dailyTotals = calculateDailyTotals(selectedDate);
  const currentDate = new Date();
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // For weekly and daily charts, use dynamic years (which might include 2023)
  const weekComparisonYears = getComparisonYearsForWeekAndDay(romData);
  const dailyComparisonYears = getComparisonYearsForWeekAndDay(romData);

  return (
    <div className="rom-comparison-container">
      <div className="comparison-type-selector">
        <button 
          className={comparisonType === 'year' ? 'active' : ''} 
          onClick={() => setComparisonType('year')}
        >
          Year to Date
        </button>
        <button 
          className={comparisonType === 'month' ? 'active' : ''} 
          onClick={() => setComparisonType('month')}
        >
          Monthly
        </button>
        <button 
          className={comparisonType === 'week' ? 'active' : ''} 
          onClick={() => setComparisonType('week')}
        >
          Weekly
        </button>
        <button 
          className={comparisonType === 'day' ? 'active' : ''} 
          onClick={() => setComparisonType('day')}
        >
          Daily
        </button>
      </div>

      {/* Year-to-date view: comparing 2024 vs 2025 */}
      {comparisonType === 'year' && (
        <>
          <div className="rom-summary">
            <h3>Year-to-Date Comparison (Through {currentDate.toLocaleDateString()})</h3>
            <div className="summary-cards">
              {Object.entries(yearToDateTotals).map(([year, data]) => (
                <div key={year} className="summary-card">
                  <h4>{year}</h4>
                  <p>Total ROM: {Math.round(data.totalMinutes)} minutes</p>
                  <p>Total Flights: {data.flightCount}</p>
                  {year === '2025' && (
                    <div className="growth-stats">
                      <p>ROM Growth: {calculateGrowth(
                        data.totalMinutes,
                        yearToDateTotals['2024']?.totalMinutes
                      )}</p>
                      <p>Flight Growth: {calculateGrowth(
                        data.flightCount,
                        yearToDateTotals['2024']?.flightCount
                      )}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="chart-container">
            <h3>Year-to-Date ROM Comparison</h3>
            <Bar
              data={{
                labels: ['ROM (minutes)', 'Flight Count'],
                datasets: Object.entries(yearToDateTotals).map(([year, data]) => ({
                  label: year,
                  data: [data.totalMinutes, data.flightCount],
                  backgroundColor: year === '2024' ? 
                    'rgba(75, 192, 192, 0.5)' : 
                    'rgba(255, 99, 132, 0.5)',
                  borderColor: year === '2024' ? 
                    'rgb(75, 192, 192)' : 
                    'rgb(255, 99, 132)',
                  borderWidth: 1,
                }))
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true } },
                plugins: { title: { display: true, text: 'Year-to-Date Comparison' } }
              }}
            />
          </div>
        </>
      )}

      {/* Monthly view: comparing 2024 vs 2025 */}
      {comparisonType === 'month' && (
        <>
          <div className="period-selector">
            <select 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
            >
              {months.map((month, index) => (
                <option key={month} value={index}>{month}</option>
              ))}
            </select>
          </div>
          <div className="rom-summary">
            <h3>{months[selectedMonth]} Comparison</h3>
            <div className="summary-cards">
              {Object.entries(monthTotals).map(([year, data]) => (
                <div key={year} className="summary-card">
                  <h4>{year} {months[selectedMonth]}</h4>
                  <p>Total ROM: {Math.round(data.totalMinutes)} minutes</p>
                  <p>Total Flights: {data.flightCount}</p>
                  {year === '2025' && (
                    <div className="growth-stats">
                      <p>ROM Growth: {calculateGrowth(
                        data.totalMinutes,
                        monthTotals['2024']?.totalMinutes
                      )}</p>
                      <p>Flight Growth: {calculateGrowth(
                        data.flightCount,
                        monthTotals['2024']?.flightCount
                      )}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="chart-container">
            <h3>{months[selectedMonth]} ROM Comparison</h3>
            <Bar
              data={{
                labels: ['ROM (minutes)', 'Flight Count'],
                datasets: Object.entries(monthTotals).map(([year, data]) => ({
                  label: year,
                  data: [data.totalMinutes, data.flightCount],
                  backgroundColor: year === '2024' ? 
                    'rgba(75, 192, 192, 0.5)' : 
                    'rgba(255, 99, 132, 0.5)',
                  borderColor: year === '2024' ? 
                    'rgb(75, 192, 192)' : 
                    'rgb(255, 99, 132)',
                  borderWidth: 1,
                }))
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true } },
                plugins: { title: { display: true, text: `${months[selectedMonth]} Comparison` } }
              }}
            />
          </div>
        </>
      )}

      {/* Weekly view: now including 2023 if available */}
      {comparisonType === 'week' && (
        <>
          <div className="period-selector">
            <select 
              value={selectedWeek || ''} 
              onChange={(e) => setSelectedWeek(e.target.value)}
            >
              {getAvailableWeeks().map(week => (
                <option key={week.value} value={week.value}>
                  {week.label}
                </option>
              ))}
            </select>
          </div>
          <div className="rom-summary">
            <h3>Week Comparison</h3>
            <p className="date-range">
              {selectedWeek ? getAvailableWeeks().find(w => w.value === selectedWeek)?.label : ''}
            </p>
            <div className="summary-cards">
              {Object.entries(weekTotals).map(([year, data]) => (
                <div key={year} className="summary-card">
                  <h4>{year}</h4>
                  <p>Total ROM: {Math.round(data.totalMinutes)} minutes</p>
                  <p>Total Flights: {data.flightCount}</p>
                  {year === '2025' && (
                    <div className="growth-stats">
                      <p>ROM Growth vs 2024: {calculateGrowth(
                        data.totalMinutes,
                        weekTotals['2024']?.totalMinutes
                      )}</p>
                      <p>Flight Growth vs 2024: {calculateGrowth(
                        data.flightCount,
                        weekTotals['2024']?.flightCount
                      )}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="chart-container">
            <h3>Weekly ROM Comparison</h3>
            <Bar
              data={{
                labels: ['ROM (minutes)', 'Flight Count'],
                datasets: weekComparisonYears.map(year => ({
                  label: year,
                  data: [
                    weekTotals[year]?.totalMinutes || 0,
                    weekTotals[year]?.flightCount || 0
                  ],
                  backgroundColor: getColorForYear(year),
                  borderColor: getBorderColorForYear(year),
                  borderWidth: 1
                }))
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true } },
                plugins: { 
                  title: { 
                    display: true, 
                    text: getAvailableWeeks().find(w => w.value === selectedWeek)?.label || '' 
                  } 
                }
              }}
            />
          </div>
        </>
      )}

      {/* Daily view: now including 2023 if available */}
      {comparisonType === 'day' && (
        <>
          <div className="period-selector">
            <select 
              value={selectedDate} 
              onChange={(e) => setSelectedDate(e.target.value)}
            >
              {getAvailableDates().map(date => (
                <option key={date.value} value={date.value}>
                  {date.label}
                </option>
              ))}
            </select>
          </div>
          <div className="rom-summary">
            <h3>Daily Comparison</h3>
            <p className="date-range">
              {new Date(selectedDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </p>
            <div className="summary-cards">
              {Object.entries(dailyTotals).map(([year, data]) => (
                <div key={year} className="summary-card">
                  <h4>{year}</h4>
                  <p>Total ROM: {Math.round(data.totalMinutes)} minutes</p>
                  <p>Total Flights: {data.flightCount}</p>
                  {year === '2025' && (
                    <div className="growth-stats">
                      <p>ROM Growth vs 2024: {calculateGrowth(
                        data.totalMinutes,
                        dailyTotals['2024']?.totalMinutes
                      )}</p>
                      <p>Flight Growth vs 2024: {calculateGrowth(
                        data.flightCount,
                        dailyTotals['2024']?.flightCount
                      )}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="chart-container">
            <h3>Daily ROM Comparison</h3>
            <Bar
              data={{
                labels: ['ROM (minutes)', 'Flight Count'],
                datasets: dailyComparisonYears.map(year => ({
                  label: year,
                  data: [
                    dailyTotals[year]?.totalMinutes || 0,
                    dailyTotals[year]?.flightCount || 0
                  ],
                  backgroundColor: getColorForYear(year),
                  borderColor: getBorderColorForYear(year),
                  borderWidth: 1
                }))
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true } },
                plugins: { 
                  title: { 
                    display: true, 
                    text: new Date(selectedDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) 
                  } 
                }
              }}
            />
          </div>
        </>
      )}
    </div>
  );
};

export default ROMComparisonView;
