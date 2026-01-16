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

let latestData = null;
let currentView = 'recent';
let currentMembersOnly = true;

// Clan policy thresholds
const WAR_REQUIREMENT = 1600;
const WARNING_THRESHOLD = 800;
const RECENT_JOIN_DAYS = 7;
const MAX_WEEKS_DISPLAY = 260; // 5 years
const RECENT_WEEKS_DISPLAY = 8; // ~2 months

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

    // Tab switching
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            button.classList.add('active');
            currentView = button.dataset.view;
            renderView();
        });
    });

    // Member filter toggle (local only)
    const memberToggle = document.getElementById('currentMembersOnly');
    if (memberToggle) {
        const savedPreference = localStorage.getItem('currentMembersOnly');
        if (savedPreference !== null) {
            currentMembersOnly = savedPreference === 'true';
            memberToggle.checked = currentMembersOnly;
        }
        memberToggle.addEventListener('change', (e) => {
            currentMembersOnly = e.target.checked;
            localStorage.setItem('currentMembersOnly', currentMembersOnly);
            loadData();
        });
    }
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
        const members = await fetchClanMembers(currentMembersOnly);
        
        // Fetch war log
        const warLog = await fetchWarLog();
        
        // Process data
        const processedData = processWarData(members, warLog);
        
        // Store and render view
        latestData = processedData;
        renderView();
        
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

async function fetchClanMembers(currentOnly) {
    const url = new URL(`${API_BASE_URL}/api/clan/members`);
    if (!currentOnly) {
        url.searchParams.set('includeFormer', '1');
    }
    const response = await fetch(url.toString());
    
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
    const now = new Date();

    // Create a map of all players
    const playersMap = new Map();

    // Initialize all players with empty scores
    members.forEach(member => {
        playersMap.set(member.tag, {
            name: member.name,
            tag: member.tag,
            role: member.role || 'member',
            firstSeen: member.firstSeen || null,
            isCurrent: member.isCurrent !== false,
            scores: {}
        });
    });

    // Process war log - each item represents a war
    // Sort by date (most recent first) and limit to MAX_WEEKS_DISPLAY
    const sortedWars = [...warLog]
        .map(war => ({
            ...war,
            endDateObj: getWarEndDate(war)
        }))
        .sort((a, b) => b.endDateObj - a.endDateObj)
        .slice(0, MAX_WEEKS_DISPLAY);

    // Show a notice if we only have current week data (war log endpoint disabled)
    if (sortedWars.length === 1) {
        const existingNotice = document.querySelector('.info-notice');
        if (existingNotice) {
            existingNotice.remove();
        }

        const notice = document.createElement('div');
        notice.className = 'info-notice';
        notice.style.cssText = 'background: #e3f2fd; color: #1976d2; padding: 12px; border-radius: 6px; margin-bottom: 20px; border-left: 4px solid #1976d2;';
        notice.innerHTML = '<strong>Note:</strong> The Clash Royale API has temporarily disabled the war log endpoint. Only current week data is available. Historical data will appear as we store it locally.';
        const container = document.querySelector('.container');
        const tableContainer = document.querySelector('.table-container');
        if (container && tableContainer) {
            container.insertBefore(notice, tableContainer);
        }
    } else {
        const existingNotice = document.querySelector('.info-notice');
        if (existingNotice) {
            existingNotice.remove();
        }
    }

    const columns = sortedWars.map(war => ({
        label: formatWarDate(war.endDateObj.toISOString()),
        endDate: war.endDateObj
    }));

    // Initialize all players with 0 for each date column
    columns.forEach(column => {
        playersMap.forEach(player => {
            player.scores[column.label] = 0;
        });
    });

    // Update scores for participants
    sortedWars.forEach((war) => {
        const dateLabel = formatWarDate(war.endDateObj.toISOString());
        const participants = war.participants || war.standings || [];
        participants.forEach(participant => {
            if (playersMap.has(participant.tag)) {
                const player = playersMap.get(participant.tag);
                const warPoints = participant.warPoints || 
                                 participant.fame || 
                                 participant.battlesPlayed || 
                                 participant.wins ||
                                 0;
                player.scores[dateLabel] = warPoints;
            }
        });
    });

    // Apply N/A for weeks before a player's first seen date
    playersMap.forEach(player => {
        const joinDate = player.firstSeen ? new Date(player.firstSeen) : null;
        const recentCutoff = new Date(now.getTime() - RECENT_JOIN_DAYS * 24 * 60 * 60 * 1000);
        player.joinedRecently = joinDate ? joinDate >= recentCutoff : false;

        columns.forEach(column => {
            if (joinDate && joinDate > column.endDate) {
                player.scores[column.label] = null;
            }
        });
    });

    // Identify promotion-ready members/elders (1600+ for 12 consecutive weeks, not co-leader/leader)
    const streakColumns = columns.slice(0, 12);
    playersMap.forEach(player => {
        if (!streakColumns.length) {
            player.promotionReady = false;
            return;
        }
        const role = (player.role || '').toLowerCase();
        if (role === 'leader' || role === 'coleader') {
            player.promotionReady = false;
            return;
        }
        let streak = 0;
        for (const column of streakColumns) {
            const value = player.scores[column.label];
            if (value === null || value === undefined) {
                streak = 0;
                break;
            }
            if (value >= WAR_REQUIREMENT) {
                streak += 1;
            } else {
                break;
            }
        }
        player.promotionReady = streak >= 12;
    });

    const players = Array.from(playersMap.values());

    return {
        players,
        columns
    };
}

function renderTable(data) {
    const { players, columns } = data;
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

    // Role column
    const roleHeader = document.createElement('th');
    roleHeader.className = 'sortable';
    roleHeader.textContent = 'Role';
    roleHeader.setAttribute('data-column', 'role');
    roleHeader.addEventListener('click', () => sortTable('role', roleHeader));
    headerRow.appendChild(roleHeader);

    // Clan tenure column
    const tenureHeader = document.createElement('th');
    tenureHeader.className = 'sortable';
    tenureHeader.innerHTML = 'Clan Tenure <span class="info-icon" title="Estimated from when a player first appeared in our clan list.">i</span>';
    tenureHeader.setAttribute('data-column', 'tenure');
    tenureHeader.addEventListener('click', () => sortTable('tenure', tenureHeader));
    headerRow.appendChild(tenureHeader);

    // Date columns
    columns.forEach(column => {
        const weekHeader = document.createElement('th');
        weekHeader.className = 'sortable';
        weekHeader.textContent = column.label;
        weekHeader.setAttribute('data-column', column.label);
        weekHeader.addEventListener('click', () => sortTable(column.label, weekHeader));
        headerRow.appendChild(weekHeader);
    });

    tableHead.appendChild(headerRow);

    // Create data rows
    players.forEach(player => {
        const row = document.createElement('tr');

        // Player name
        const nameCell = document.createElement('td');
        nameCell.className = `name-cell ${player.joinedRecently ? 'name-recent' : ''} ${player.promotionReady ? 'promotion-ready' : ''}`.trim();
        nameCell.textContent = player.name;
        nameCell.title = player.tag || '';

        if (player.joinedRecently) {
            const badge = document.createElement('span');
            badge.className = 'name-new-tag';
            badge.textContent = 'NEW';
            nameCell.appendChild(badge);
        }

        if (player.promotionReady) {
            const badge = document.createElement('span');
            badge.className = 'promotion-badge';
            badge.textContent = 'PROMOTE';
            nameCell.appendChild(badge);
        }

        if (player.tag) {
            const tagEl = document.createElement('span');
            tagEl.className = 'player-tag';
            tagEl.textContent = player.tag;
            nameCell.appendChild(tagEl);
        }

        row.appendChild(nameCell);

        // Role
        const roleCell = document.createElement('td');
        roleCell.innerHTML = `<span class="role-pill">${formatRole(player.role)}</span>`;
        row.appendChild(roleCell);

        // Clan tenure (based on firstSeen tracking)
        const tenureCell = document.createElement('td');
        tenureCell.textContent = player.firstSeen ? formatDuration(player.firstSeen) : 'N/A';
        row.appendChild(tenureCell);

        // Date scores (war points for each date)
        columns.forEach(column => {
            const scoreCell = document.createElement('td');
            scoreCell.className = 'score-cell';
            const value = player.scores[column.label];
            if (value === null || value === undefined) {
                scoreCell.textContent = 'N/A';
                scoreCell.classList.add('score-na');
            } else {
                scoreCell.textContent = value;
                scoreCell.classList.add(getScoreClass(value));
            }
            row.appendChild(scoreCell);
        });

        if (!player.isCurrent) {
            row.classList.add('former-member');
        }
        tableBody.appendChild(row);
    });

    // Store data for sorting
    tableBody.dataset.players = JSON.stringify(players);
    tableBody.dataset.columns = JSON.stringify(columns);
}

let currentSort = {
    column: null,
    direction: 'desc'
};

function sortTable(column, headerElement) {
    const tableBody = document.getElementById('tableBody');
    const players = JSON.parse(tableBody.dataset.players || '[]');
    const columns = JSON.parse(tableBody.dataset.columns || '[]');
    
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
        let aValue;
        let bValue;

        if (column === 'player') {
            aValue = a.name.toLowerCase();
            bValue = b.name.toLowerCase();
        } else if (column === 'role') {
            aValue = getRoleRank(a.role);
            bValue = getRoleRank(b.role);
        } else if (column === 'tenure') {
            aValue = getTenureSortValue(a.firstSeen);
            bValue = getTenureSortValue(b.firstSeen);
        } else {
            aValue = getScoreSortValue(a.scores[column], currentSort.direction);
            bValue = getScoreSortValue(b.scores[column], currentSort.direction);
        }

        if (currentSort.direction === 'desc') {
            if (column === 'player') {
                return bValue.localeCompare(aValue);
            }
            return bValue - aValue;
        }

        if (column === 'player') {
            return aValue.localeCompare(bValue);
        }
        return aValue - bValue;
    });
    
    // Re-render table with sorted data
    renderTable({ players: sortedPlayers, columns });
    
    // Restore sort state
    currentSort.column = column;
}

function getRoleRank(role) {
    switch ((role || '').toLowerCase()) {
        case 'leader':
            return 4;
        case 'coleader':
            return 3;
        case 'elder':
            return 2;
        default:
            return 1;
    }
}

function getScoreSortValue(value, direction) {
    if (value === null || value === undefined) {
        return direction === 'asc' ? Number.POSITIVE_INFINITY : -1;
    }
    return Number(value) || 0;
}

function getScoreClass(value) {
    if (value >= WAR_REQUIREMENT) return 'score-green';
    if (value >= WARNING_THRESHOLD) return 'score-yellow';
    return 'score-red';
}

function getTenureSortValue(firstSeen) {
    if (!firstSeen) return -1;
    return new Date(firstSeen).getTime();
}

function formatRole(role) {
    if (!role) return 'Member';
    if (role.toLowerCase() === 'coleader') return 'Co-Leader';
    return role.charAt(0).toUpperCase() + role.slice(1);
}

function formatDuration(firstSeen) {
    const start = new Date(firstSeen);
    const now = new Date();
    const diffMs = now - start;
    if (Number.isNaN(diffMs) || diffMs < 0) return 'N/A';

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (days < 30) return `${days}d`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo`;
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    return remainingMonths ? `${years}y ${remainingMonths}mo` : `${years}y`;
}

function getVisibleColumns(columns) {
    if (currentView === 'all') {
        return columns;
    }
    return columns.slice(0, RECENT_WEEKS_DISPLAY);
}

function renderView() {
    if (!latestData) return;
    const columns = getVisibleColumns(latestData.columns);
    const viewData = {
        players: latestData.players,
        columns
    };
    renderTable(viewData);
    renderHighlights(viewData);
}

function renderHighlights(data) {
    const { players, columns } = data;
    const highlightsEl = document.getElementById('highlights');
    if (!highlightsEl) return;

    highlightsEl.innerHTML = '';
    if (!columns.length) return;

    const currentColumn = columns[0];
    const scores = players
        .map(player => ({
            name: player.name,
            role: player.role,
            score: player.scores[currentColumn.label]
        }))
        .filter(item => item.score !== null && item.score !== undefined);

    const clanTotal = scores.reduce((sum, item) => sum + item.score, 0);
    const avgScore = scores.length ? Math.round(clanTotal / scores.length) : 0;
    const topPerformers = [...scores].sort((a, b) => b.score - a.score).slice(0, 3);

    highlightsEl.innerHTML = `
        <div class="highlight-card">
            <h4>Current Week Total</h4>
            <p>${clanTotal} points</p>
        </div>
        <div class="highlight-card">
            <h4>Current Week Average</h4>
            <p>${avgScore} points</p>
        </div>
        <div class="highlight-card">
            <h4>Top Performers</h4>
            <p>${topPerformers.map(p => `${p.name} (${p.score})`).join('<br>') || 'No data yet'}</p>
        </div>
    `;
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
