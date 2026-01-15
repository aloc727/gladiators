// Configuration
const CLAN_TAG = '2CPPJLJ';
const API_BASE_URL = window.location.origin; // Use same origin as the page

// Auto-refresh configuration
// Clash Royale API rate limits: ~100 requests per 10 seconds per IP
// We'll refresh every 5 minutes to be safe and respectful
const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds
let autoRefreshTimer = null;
let countdownTimer = null;
let nextRefreshTime = null; // Track when the next refresh is scheduled

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    // Try to load data on page load
    loadData();
    
    // Start auto-refresh (always enabled for public site)
    scheduleNextRefresh();
    
    // Clean up timers when page is unloaded
    window.addEventListener('beforeunload', () => {
        clearAutoRefresh();
    });
});

// Schedule the next automatic refresh
function scheduleNextRefresh() {
    clearAutoRefresh();
    
    // Calculate when the next refresh should happen
    nextRefreshTime = Date.now() + AUTO_REFRESH_INTERVAL;
    
    // Update countdown display immediately
    updateCountdown();
    countdownTimer = setInterval(updateCountdown, 1000);
    
    // Schedule the actual refresh
    autoRefreshTimer = setTimeout(() => {
        loadData();
        scheduleNextRefresh(); // Schedule the next one
    }, AUTO_REFRESH_INTERVAL);
}

// Clear auto-refresh timers
function clearAutoRefresh() {
    if (autoRefreshTimer) {
        clearTimeout(autoRefreshTimer);
        autoRefreshTimer = null;
    }
    if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
    }
}

// Update countdown display
function updateCountdown() {
    if (!autoRefreshTimer || !nextRefreshTime) {
        updateNextRefreshDisplay('Auto-refresh disabled');
        return;
    }
    
    // Calculate time until next refresh
    const now = Date.now();
    const timeRemaining = Math.max(0, nextRefreshTime - now);
    
    if (timeRemaining <= 0) {
        updateNextRefreshDisplay('Refreshing...');
        return;
    }
    
    const minutes = Math.floor(timeRemaining / 60000);
    const seconds = Math.floor((timeRemaining % 60000) / 1000);
    
    updateNextRefreshDisplay(`Next refresh in: ${minutes}:${String(seconds).padStart(2, '0')}`);
}

// Update the next refresh display
function updateNextRefreshDisplay(text) {
    const nextRefreshElement = document.getElementById('nextRefresh');
    if (nextRefreshElement) {
        nextRefreshElement.textContent = text;
    }
}

async function loadData() {
    const loading = document.getElementById('loading');
    const errorMessage = document.getElementById('errorMessage');
    const tableBody = document.getElementById('tableBody');
    const tableHead = document.getElementById('tableHead');
    
    loading.style.display = 'block';
    errorMessage.style.display = 'none';
    tableBody.innerHTML = '';
    
    try {
        // Fetch clan members
        const members = await fetchClanMembers();
        
        // Fetch war log
        const warLog = await fetchWarLog();
        
        // Process data
        const processedData = processWarData(members, warLog);
        
        // Render table
        renderTable(processedData);
        
        // Update timestamp
        updateTimestamp();
        
        // Reset countdown after successful load
        updateCountdown();
        
    } catch (error) {
        console.error('Error loading data:', error);
        errorMessage.textContent = `Error: ${error.message}`;
        errorMessage.style.display = 'block';
        
        // On error, still schedule next refresh (but maybe with a longer delay)
        // Wait a bit longer on error to avoid hammering the API
        setTimeout(() => {
            scheduleNextRefresh();
        }, AUTO_REFRESH_INTERVAL);
    } finally {
        loading.style.display = 'none';
    }
}

async function fetchClanMembers() {
    const url = `${API_BASE_URL}/api/clan/members`;
    const response = await fetch(url);
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch clan members: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.members || [];
}

async function fetchWarLog() {
    const url = `${API_BASE_URL}/api/clan/warlog`;
    const response = await fetch(url);
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch war log: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.warLog || [];
}

// Format date for war end (Sunday at 4:30am CT)
function formatWarDate(dateString) {
    if (!dateString) return 'Unknown Date';
    
    const date = new Date(dateString);
    
    // Format as "MM/DD/YYYY" (e.g., "01/14/2024")
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    
    return `${month}/${day}/${year}`;
}

// Get the Sunday date for a war (wars end Sunday at 4:30am CT)
function getWarEndDate(war) {
    // Try different possible date fields from the API
    const dateString = war.endDate || war.createdDate || war.seasonId || null;
    
    if (!dateString) {
        // Fallback: calculate based on current date
        const now = new Date();
        const currentDay = now.getDay();
        const daysSinceSunday = currentDay === 0 ? 0 : currentDay;
        const mostRecentSunday = new Date(now);
        mostRecentSunday.setDate(now.getDate() - daysSinceSunday);
        // Set to 4:30am CT (CT is UTC-6 or UTC-5, but we'll use local time for display)
        mostRecentSunday.setHours(4, 30, 0, 0);
        return mostRecentSunday;
    }
    
    const date = new Date(dateString);
    
    // If the date is not a Sunday, find the previous Sunday
    const dayOfWeek = date.getDay();
    if (dayOfWeek !== 0) {
        const daysToSubtract = dayOfWeek;
        date.setDate(date.getDate() - daysToSubtract);
    }
    
    // Set to 4:30am (the API date should already account for timezone)
    // We're just using it for the date display, so the time doesn't matter much
    date.setHours(4, 30, 0, 0);
    
    return date;
}

function processWarData(members, warLog) {
    // Create a map of all players
    const playersMap = new Map();
    
    // Initialize all players with empty scores
    members.forEach(member => {
        playersMap.set(member.tag, {
            name: member.name,
            tag: member.tag,
            scores: {}
        });
    });
    
    // Process war log - each item represents a war
    // Sort by date (most recent first) and limit to 10 weeks
    const sortedWars = [...warLog]
        .map(war => ({
            ...war,
            endDateObj: getWarEndDate(war)
        }))
        .sort((a, b) => b.endDateObj - a.endDateObj) // Most recent first
        .slice(0, 10); // Limit to 10 weeks
    
    // Show a notice if we only have current week data (war log endpoint disabled)
    if (sortedWars.length === 1) {
        // Remove any existing notice first
        const existingNotice = document.querySelector('.info-notice');
        if (existingNotice) {
            existingNotice.remove();
        }
        
        const notice = document.createElement('div');
        notice.className = 'info-notice';
        notice.style.cssText = 'background: #e3f2fd; color: #1976d2; padding: 12px; border-radius: 6px; margin-bottom: 20px; border-left: 4px solid #1976d2;';
        notice.innerHTML = '<strong>Note:</strong> The Clash Royale API has temporarily disabled the war log endpoint. Only current week data is available. Historical data will appear once the endpoint is restored.';
        const container = document.querySelector('.container');
        const tableContainer = document.querySelector('.table-container');
        if (container && tableContainer) {
            container.insertBefore(notice, tableContainer);
        }
    } else {
        // Remove notice if we have multiple weeks
        const existingNotice = document.querySelector('.info-notice');
        if (existingNotice) {
            existingNotice.remove();
        }
    }
    
    sortedWars.forEach((war) => {
        const dateLabel = formatWarDate(war.endDateObj.toISOString());
        
        // Initialize all players with 0 for this date
        playersMap.forEach(player => {
            player.scores[dateLabel] = 0;
        });
        
        // Update scores for participants
        // Clash Royale API structure may vary - check for different possible field names
        const participants = war.participants || war.standings || [];
        participants.forEach(participant => {
            if (playersMap.has(participant.tag)) {
                const player = playersMap.get(participant.tag);
                // Try different possible field names for war points
                const warPoints = participant.warPoints || 
                                 participant.fame || 
                                 participant.battlesPlayed || 
                                 participant.wins ||
                                 0;
                player.scores[dateLabel] = warPoints;
            }
        });
    });
    
    // Convert to array and get all date labels (sorted, most recent first)
    const players = Array.from(playersMap.values());
    const dateLabels = sortedWars.map(war => formatWarDate(war.endDateObj.toISOString()));
    
    return {
        players,
        weekLabels: dateLabels // Keep the variable name for compatibility, but it's now dates
    };
}

function renderTable(data) {
    const { players, weekLabels } = data;
    const tableHead = document.getElementById('tableHead');
    const tableBody = document.getElementById('tableBody');
    
    // Clear existing content
    tableHead.innerHTML = '';
    tableBody.innerHTML = '';
    
    // Create header row
    const headerRow = document.createElement('tr');
    
    // Player name column
    const playerHeader = document.createElement('th');
    playerHeader.className = 'sortable';
    playerHeader.textContent = 'Player Name';
    playerHeader.setAttribute('data-column', 'player');
    playerHeader.addEventListener('click', () => sortTable('player', playerHeader));
    headerRow.appendChild(playerHeader);
    
    // Date columns (each represents a war end date - Sunday at 4:30am CT)
    weekLabels.forEach(weekLabel => {
        const weekHeader = document.createElement('th');
        weekHeader.className = 'sortable';
        weekHeader.textContent = weekLabel;
        weekHeader.setAttribute('data-column', weekLabel);
        weekHeader.addEventListener('click', () => sortTable(weekLabel, weekHeader));
        headerRow.appendChild(weekHeader);
    });
    
    tableHead.appendChild(headerRow);
    
    // Create data rows
    players.forEach(player => {
        const row = document.createElement('tr');
        
        // Player name
        const nameCell = document.createElement('td');
        nameCell.textContent = player.name;
        row.appendChild(nameCell);
        
        // Date scores (war points for each date)
        weekLabels.forEach(weekLabel => {
            const scoreCell = document.createElement('td');
            scoreCell.textContent = player.scores[weekLabel] || 0;
            row.appendChild(scoreCell);
        });
        
        tableBody.appendChild(row);
    });
    
    // Store data for sorting
    tableBody.dataset.players = JSON.stringify(players);
    tableBody.dataset.weekLabels = JSON.stringify(weekLabels);
}

let currentSort = {
    column: null,
    direction: 'desc'
};

function sortTable(column, headerElement) {
    const tableBody = document.getElementById('tableBody');
    const players = JSON.parse(tableBody.dataset.players || '[]');
    const weekLabels = JSON.parse(tableBody.dataset.weekLabels || '[]');
    
    // Remove sorted class from all headers
    document.querySelectorAll('th.sortable').forEach(th => {
        th.classList.remove('sorted-asc', 'sorted-desc');
    });
    
    // Determine sort direction
    if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'desc' ? 'asc' : 'desc';
    } else {
        currentSort.column = column;
        currentSort.direction = 'desc';
    }
    
    // Add sorted class to current header
    headerElement.classList.add(`sorted-${currentSort.direction}`);
    
    // Sort players
    const sortedPlayers = [...players].sort((a, b) => {
        let aValue, bValue;
        
        if (column === 'player') {
            aValue = a.name.toLowerCase();
            bValue = b.name.toLowerCase();
        } else {
            aValue = a.scores[column] || 0;
            bValue = b.scores[column] || 0;
        }
        
        if (currentSort.direction === 'desc') {
            if (column === 'player') {
                return bValue.localeCompare(aValue);
            } else {
                return bValue - aValue;
            }
        } else {
            if (column === 'player') {
                return aValue.localeCompare(bValue);
            } else {
                return aValue - bValue;
            }
        }
    });
    
    // Re-render table with sorted data
    renderTable({ players: sortedPlayers, weekLabels });
    
    // Restore sort state
    currentSort.column = column;
}

// Update the "Updated as of" timestamp
function updateTimestamp() {
    const lastUpdatedElement = document.getElementById('lastUpdated');
    if (lastUpdatedElement) {
        const now = new Date();
        
        // Format: "Updated as of: MM/DD/YYYY, HH:MM:SS AM/PM"
        const options = {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
            timeZone: 'America/Chicago' // Central Time
        };
        
        const formattedDate = now.toLocaleString('en-US', options);
        lastUpdatedElement.textContent = `Updated as of: ${formattedDate} CT`;
    }
}
