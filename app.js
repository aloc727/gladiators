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
let currentTab = 'table';
let currentRange = 'recent';
let currentMembersOnly = true;
let userSort = null;

// Clan policy thresholds
const WAR_REQUIREMENT = 1600;
const WARNING_THRESHOLD = 800;
const RECENT_JOIN_DAYS = 7;
const MAX_WEEKS_DISPLAY = 260; // 5 years
const RECENT_WEEKS_DISPLAY = 8; // ~2 months

// Optional override for the current war label (leave empty to use data labels)
const CURRENT_WAR_LABEL = '';
const UI_VERSION = 'v1.10.0';

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    // Try to load data on page load
    loadData();

    const versionEl = document.getElementById('uiVersion');
    if (versionEl) {
        versionEl.textContent = `UI ${UI_VERSION}`;
    }
    
    // Start auto-refresh (always enabled for public site)
    scheduleNextRefresh();
    
    // Clean up timers when page is unloaded
    window.addEventListener('beforeunload', () => {
        clearAutoRefresh();
    });

    // Primary tab switching
    const menuTabs = document.getElementById('menuTabs');
    document.querySelectorAll('.menu-tab').forEach(button => {
        button.addEventListener('click', () => {
            setActiveTab(button.dataset.tab, true);
            if (menuTabs) {
                menuTabs.classList.remove('open');
            }
        });
    });

    const menuToggle = document.getElementById('menuToggle');
    if (menuToggle && menuTabs) {
        menuToggle.addEventListener('click', () => {
            menuTabs.classList.toggle('open');
        });
    }

    applyRoute(window.location.pathname);
    window.addEventListener('popstate', () => {
        applyRoute(window.location.pathname);
    });

    // Range switching
    document.querySelectorAll('.range-tab').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.range-tab').forEach(b => b.classList.remove('active'));
            button.classList.add('active');
            currentRange = button.dataset.range;
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
            renderView();
        });
    }
});

// Schedule the next automatic refresh
function scheduleNextRefresh() {
    clearAutoRefresh();
    const now = Date.now();
    const delay = AUTO_REFRESH_INTERVAL - (now % AUTO_REFRESH_INTERVAL);
    // Calculate when the next refresh should happen (5-minute boundary)
    nextRefreshTime = now + delay;
    
    // Update countdown display immediately
    updateCountdown();
    countdownTimer = setInterval(updateCountdown, 1000);
    
    // Schedule the actual refresh
    autoRefreshTimer = setTimeout(() => {
        loadData();
        scheduleNextRefresh(); // Schedule the next one
    }, delay);
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

// Format date for war end (Monday at 4:30am CT)
function formatWarDate(dateString) {
    if (!dateString) return 'Unknown Date';
    
    const date = new Date(dateString);
    
    // Format as "MM/DD/YYYY" (e.g., "01/14/2024")
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    
    return `${month}/${day}/${year}`;
}

function formatWarRange(endDate) {
    const startDate = new Date(endDate);
    // Wars start on Thursday and end Monday (5-day span).
    startDate.setDate(startDate.getDate() - 5);
    return `${formatWarDate(startDate.toISOString())}-${formatWarDate(endDate.toISOString())}`;
}

function getSeasonWeekLabel(war) {
    const seasonId = war.seasonId ?? war.season?.id ?? null;
    const weekIndex = Number.isInteger(war.sectionIndex) ? war.sectionIndex + 1
        : Number.isInteger(war.periodIndex) ? war.periodIndex + 1
        : null;
    if (seasonId && weekIndex) {
        return `Season ${seasonId} Week ${weekIndex}`;
    }
    if (war.label && war.label.includes('Season')) {
        return war.label.replace(/\s*\(.*\)$/, '');
    }
    return '';
}

// Get the Monday date for a war (wars end Monday at 4:30am CT)
function getWarEndDate(war) {
    // Try different possible date fields from the API
    const dateString = war.endDate || war.createdDate || war.seasonId || null;
    
    if (!dateString) {
        // Fallback: calculate based on current date
        const now = new Date();
        const currentDay = now.getDay();
        const daysUntilMonday = (1 - currentDay + 7) % 7;
        const endMonday = new Date(now);
        endMonday.setDate(now.getDate() + daysUntilMonday);
        endMonday.setHours(4, 30, 0, 0);
        return endMonday;
    }
    
    const date = new Date(dateString);
    
    // Find the next Monday for the war end
    const dayOfWeek = date.getDay();
    const daysUntilMonday = (1 - dayOfWeek + 7) % 7;
    date.setDate(date.getDate() + daysUntilMonday);

    // Set to 4:30am CT for display
    date.setHours(4, 30, 0, 0);
    
    return date;
}

function processWarData(members, warLog) {
    const now = new Date();

    // Create a map of all players
    const playersMap = new Map();
    const playersByName = new Map();

    // Initialize all players with empty scores
    members.forEach(member => {
        const player = {
            name: member.name,
            tag: member.tag,
            role: member.role || 'member',
            firstSeen: member.firstSeen || null,
            isCurrent: member.isCurrent !== false,
            scores: {},
            decksUsed: {}
        };
        playersMap.set(member.tag, player);
        playersByName.set(member.name.toLowerCase(), player);
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

    const mergedWarsMap = new Map();
    sortedWars.forEach(war => {
        const key = war.endDateObj.toISOString().split('T')[0];
        const participants = war.participants || war.standings || [];
        if (!mergedWarsMap.has(key)) {
            mergedWarsMap.set(key, { ...war, participants: [...participants] });
            return;
        }

        const existing = mergedWarsMap.get(key);
        existing.label = existing.label || war.label;
        const combined = [...(existing.participants || []), ...participants];
        const byKey = new Map();
        combined.forEach(participant => {
            const participantKey = participant.tag || participant.name;
            if (!participantKey) return;
            const prev = byKey.get(participantKey);
            if (!prev) {
                byKey.set(participantKey, { ...participant });
                return;
            }
            const prevPoints = prev.warPoints ?? prev.fame ?? 0;
            const nextPoints = participant.warPoints ?? participant.fame ?? 0;
            const merged = nextPoints > prevPoints ? { ...prev, ...participant } : { ...participant, ...prev };
            const prevDecks = prev.decksUsed ?? prev.battlesPlayed ?? 0;
            const nextDecks = participant.decksUsed ?? participant.battlesPlayed ?? 0;
            if (nextDecks > prevDecks) {
                merged.decksUsed = participant.decksUsed ?? participant.battlesPlayed ?? merged.decksUsed;
            }
            byKey.set(participantKey, merged);
        });
        existing.participants = Array.from(byKey.values());
    });

    const mergedWars = Array.from(mergedWarsMap.values()).sort((a, b) => b.endDateObj - a.endDateObj);

    const dateMergedMap = new Map();
    mergedWars.forEach(war => {
        const dateKey = formatWarDate(war.endDateObj.toISOString());
        if (!dateMergedMap.has(dateKey)) {
            dateMergedMap.set(dateKey, { ...war, dateKey });
            return;
        }
        const existing = dateMergedMap.get(dateKey);
        const existingLabel = existing.label || '';
        const nextLabel = war.label || '';
        const preferredLabel = nextLabel.includes('Season') || nextLabel.length > existingLabel.length ? nextLabel : existingLabel;
        const combined = [...(existing.participants || []), ...(war.participants || [])];
        const byKey = new Map();
        combined.forEach(participant => {
            const participantKey = participant.tag || participant.name;
            if (!participantKey) return;
            const prev = byKey.get(participantKey);
            if (!prev) {
                byKey.set(participantKey, { ...participant });
                return;
            }
            const prevPoints = prev.warPoints ?? prev.fame ?? 0;
            const nextPoints = participant.warPoints ?? participant.fame ?? 0;
            const merged = nextPoints > prevPoints ? { ...prev, ...participant } : { ...participant, ...prev };
            const prevDecks = prev.decksUsed ?? prev.battlesPlayed ?? 0;
            const nextDecks = participant.decksUsed ?? participant.battlesPlayed ?? 0;
            if (nextDecks > prevDecks) {
                merged.decksUsed = participant.decksUsed ?? participant.battlesPlayed ?? merged.decksUsed;
            }
            byKey.set(participantKey, merged);
        });
        existing.participants = Array.from(byKey.values());
        existing.label = preferredLabel || existing.label;
    });

    const dateMergedWars = Array.from(dateMergedMap.values()).sort((a, b) => b.endDateObj - a.endDateObj);

    const columns = dateMergedWars.map((war, index) => {
        const baseLabel = war.label || formatWarDate(war.endDateObj.toISOString());
        if (index === 0) {
            const seasonWeek = getSeasonWeekLabel(war);
            const range = formatWarRange(war.endDateObj);
            const currentLabel = seasonWeek ? `Current Week - ${seasonWeek} (${range})` : `Current Week (${range})`;
            return { label: currentLabel, endDate: war.endDateObj, baseLabel };
        }
        return { label: baseLabel, endDate: war.endDateObj };
    });

    const labelRangeRegex = /(\d{1,2}\/\d{1,2}\/\d{4})/g;
    const dateOnlyRegex = /^\d{2}\/\d{2}\/\d{4}$/;
    const seasonEndMap = new Set();
    columns.forEach(column => {
        if (!column.label || !column.label.includes('Season')) return;
        const matches = column.label.match(labelRangeRegex);
        if (!matches || !matches.length) return;
        const endDate = new Date(matches[matches.length - 1]);
        endDate.setDate(endDate.getDate() + 1);
        const key = `${String(endDate.getMonth() + 1).padStart(2, '0')}/${String(endDate.getDate()).padStart(2, '0')}`;
        seasonEndMap.add(key);
    });

    const filteredColumns = columns.filter(column => {
        if (!dateOnlyRegex.test(column.label || '')) return true;
        const [month, day] = column.label.split('/');
        const key = `${month}/${day}`;
        return !seasonEndMap.has(key);
    });

    if (columns.length && CURRENT_WAR_LABEL) {
        columns[0].label = CURRENT_WAR_LABEL;
    }

    // Initialize all players with 0 for each date column
    filteredColumns.forEach(column => {
        playersMap.forEach(player => {
            player.scores[column.label] = 0;
            player.decksUsed[column.label] = 0;
        });
    });

    // Update scores for participants
    dateMergedWars.forEach((war, index) => {
        const baseLabel = war.label || formatWarDate(war.endDateObj.toISOString());
        let dateLabel = index === 0 && CURRENT_WAR_LABEL ? CURRENT_WAR_LABEL : baseLabel;
        if (index === 0) {
            const column = filteredColumns[0];
            if (column?.label) {
                dateLabel = column.label;
            }
        }
        const participants = war.participants || war.standings || [];
        if (!filteredColumns.find(column => column.label === dateLabel)) {
            return;
        }
        participants.forEach(participant => {
            const tag = participant.tag;
            let player = tag ? playersMap.get(tag) : null;
            if (!player && participant.name) {
                player = playersByName.get(participant.name.toLowerCase()) || null;
            }
            if (!player) return;

            if (participant.warPoints === null) {
                player.scores[dateLabel] = null;
                player.decksUsed[dateLabel] = null;
                return;
            }

            const warPoints = participant.warPoints ??
                             participant.fame ??
                             participant.battlesPlayed ??
                             participant.wins ??
                             0;
            const decksUsed = participant.decksUsed ??
                             participant.battlesPlayed ??
                             0;
            player.scores[dateLabel] = warPoints;
            player.decksUsed[dateLabel] = decksUsed;
        });
    });

    // Apply N/A for weeks before a player's first seen date
    playersMap.forEach(player => {
        const joinDate = player.firstSeen ? new Date(player.firstSeen) : null;
        const recentCutoff = new Date(now.getTime() - RECENT_JOIN_DAYS * 24 * 60 * 60 * 1000);
        player.joinedRecently = joinDate ? joinDate >= recentCutoff : false;

    filteredColumns.forEach(column => {
            if (joinDate && joinDate > column.endDate) {
                player.scores[column.label] = null;
            }
        });
    });

    // Identify promotion-ready members/elders (1600+ for 12 consecutive weeks, not co-leader/leader)
    const streakColumns = filteredColumns.slice(0, 12);
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

    // Compute current week rank (based on most recent column)
    const currentColumn = columns[0];
    if (currentColumn) {
        const ranked = Array.from(playersMap.values())
            .map(player => ({
                tag: player.tag,
                score: player.scores[currentColumn.label]
            }))
            .filter(item => item.score !== null && item.score !== undefined)
            .sort((a, b) => b.score - a.score);

        let lastScore = null;
        let rank = 0;
        ranked.forEach((item, index) => {
            if (item.score !== lastScore) {
                rank = index + 1;
                lastScore = item.score;
            }
            const player = playersMap.get(item.tag);
            if (player) {
                player.currentRank = rank;
            }
        });
    }

    const players = Array.from(playersMap.values());

    return {
        players,
        columns: filteredColumns
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

    // Current week rank column
    const rankHeader = document.createElement('th');
    rankHeader.className = 'sortable';
    rankHeader.textContent = 'Rank (Current)';
    rankHeader.setAttribute('data-column', 'rank');
    rankHeader.addEventListener('click', () => sortTable('rank', rankHeader));
    headerRow.appendChild(rankHeader);

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
        row.dataset.playerTag = player.tag || '';
        row.dataset.playerName = player.name || '';

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
        const roleClass = `role-pill role-${(player.role || 'member').toLowerCase()}`;
        roleCell.innerHTML = `<span class="${roleClass}">${formatRole(player.role)}</span>`;
        row.appendChild(roleCell);

        // Current rank
        const rankCell = document.createElement('td');
        rankCell.textContent = player.currentRank ? `#${player.currentRank}` : '—';
        row.appendChild(rankCell);

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

function sortTable(column, headerElement, forceDirection = null) {
    const tableBody = document.getElementById('tableBody');
    const players = JSON.parse(tableBody.dataset.players || '[]');
    const columns = JSON.parse(tableBody.dataset.columns || '[]');
    
    // Remove sorted class from all headers
    document.querySelectorAll('th.sortable').forEach(th => {
        th.classList.remove('sorted-asc', 'sorted-desc');
    });
    
    // Determine sort direction
    if (forceDirection) {
        currentSort.column = column;
        currentSort.direction = forceDirection;
    } else if (currentSort.column === column) {
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
        } else if (column === 'rank') {
            aValue = getRankSortValue(a.currentRank, currentSort.direction);
            bValue = getRankSortValue(b.currentRank, currentSort.direction);
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
    
    // Restore sort state + keep user preference
    if (!forceDirection) {
        userSort = { column, direction: currentSort.direction };
    }
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

function getRankSortValue(value, direction) {
    if (!value) {
        return direction === 'asc' ? Number.POSITIVE_INFINITY : -1;
    }
    return value;
}

function formatNumber(value) {
    return Number(value || 0).toLocaleString('en-US');
}

function formatChartValue(value) {
    if (value === null || value === undefined || value === 0) {
        return 'N/A';
    }
    return formatNumber(value);
}

function getScoreClass(value) {
    if (value >= WAR_REQUIREMENT) return 'score-green';
    if (value >= WARNING_THRESHOLD) return 'score-yellow';
    return 'score-red';
}

function formatRole(role) {
    if (!role) return 'Member';
    if (role.toLowerCase() === 'coleader') return 'Co-Leader';
    return role.charAt(0).toUpperCase() + role.slice(1);
}


function getVisibleColumns(columns) {
    if (currentRange === 'all') {
        return columns;
    }
    return columns.slice(0, RECENT_WEEKS_DISPLAY);
}

function renderView() {
    if (!latestData) return;
    const columns = getVisibleColumns(latestData.columns);
    const viewData = {
        players: latestData.players.filter(player => (currentMembersOnly ? player.isCurrent : true)),
        columns
    };
    renderTable(viewData);
    applySavedSortOrDefault(viewData.columns);
    renderHighlights(viewData);
    renderDashboard();
    renderPlayersPage(viewData);
    renderTabVisibility();
}

function applySavedSortOrDefault(columns) {
    if (!columns.length) return;
    const currentColumnLabel = columns[0].label;
    if (userSort?.column) {
        const header = document.querySelector(`th.sortable[data-column="${userSort.column}"]`);
        if (header) {
            sortTable(userSort.column, header, userSort.direction);
            return;
        }
    }

    const header = document.querySelector(`th.sortable[data-column="${currentColumnLabel}"]`);
    if (header) {
        sortTable(currentColumnLabel, header, 'desc');
    }
}

function renderTabVisibility() {
    const tablePanel = document.getElementById('tab-table');
    const summaryPanel = document.getElementById('tab-summary');
    const playersPanel = document.getElementById('tab-players');
    if (!tablePanel || !summaryPanel || !playersPanel) return;

    if (currentTab === 'summary') {
        summaryPanel.classList.add('active');
        tablePanel.classList.remove('active');
        playersPanel.classList.remove('active');
        return;
    }

    if (currentTab === 'players') {
        playersPanel.classList.add('active');
        tablePanel.classList.remove('active');
        summaryPanel.classList.remove('active');
        return;
    }

    summaryPanel.classList.remove('active');
    tablePanel.classList.add('active');
    playersPanel.classList.remove('active');
}

function setActiveTab(tab, updateUrl = false) {
    currentTab = tab;
    document.querySelectorAll('.menu-tab').forEach(button => {
        button.classList.toggle('active', button.dataset.tab === tab);
    });
    renderTabVisibility();

    if (updateUrl) {
        const button = document.querySelector(`.menu-tab[data-tab="${tab}"]`);
        const route = button?.dataset.route || '/';
        if (window.location.pathname !== route) {
            window.history.pushState({}, '', route);
        }
    }
}

function applyRoute(pathname) {
    if (pathname === '/summary') {
        setActiveTab('summary');
        return;
    }
    if (pathname === '/players') {
        setActiveTab('players');
        return;
    }
    setActiveTab('table', true);
}

function focusPlayerRow(playerTag, playerName) {
    const tableBody = document.getElementById('tableBody');
    if (!tableBody) return;

    setActiveTab('table');

    const rows = Array.from(tableBody.querySelectorAll('tr'));
    const match = rows.find(row => {
        if (playerTag && row.dataset.playerTag === playerTag) return true;
        if (playerName && row.dataset.playerName === playerName) return true;
        return false;
    });

    if (!match) return;
    match.classList.add('row-highlight');
    match.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => match.classList.remove('row-highlight'), 1800);
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
    highlightsEl.innerHTML = `
        <div class="highlight-card">
            <h4>Current Week Total</h4>
            <p>${clanTotal} points</p>
        </div>
        <div class="highlight-card">
            <h4>Current Week Average</h4>
            <p>${avgScore} points</p>
        </div>
    `;
}

function renderPlayersPage(data) {
    const { players } = data;
    const topEl = document.getElementById('topPerformersTable');
    const improvementEl = document.getElementById('improvementTable');
    const leaderboardEl = document.getElementById('leaderboardTable');
    if (!topEl || !improvementEl || !leaderboardEl) return;
    const fullColumns = latestData?.columns || [];
    if (!fullColumns.length) return;

    const currentColumn = fullColumns[0];
    const topPerformers = [...players]
        .map(player => ({
            name: player.name,
            tag: player.tag || '',
            score: player.scores[currentColumn.label]
        }))
        .filter(item => item.score !== null && item.score !== undefined)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

    const previousColumn = fullColumns[1];
    const improvements = previousColumn ? players
        .map(player => ({
            name: player.name,
            tag: player.tag || '',
            delta: (player.scores[currentColumn.label] ?? 0) - (player.scores[previousColumn.label] ?? 0)
        }))
        .filter(item => !Number.isNaN(item.delta))
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 10) : [];

    const leaderboardColumns = fullColumns.slice(0, 12);
    const leaderboard = leaderboardColumns.length ? players
        .map(player => {
            const scores = leaderboardColumns
                .map(col => player.scores[col.label])
                .filter(score => score !== null && score !== undefined);
            const total = scores.reduce((sum, score) => sum + score, 0);
            const weeks = scores.length;
            return {
                name: player.name,
                tag: player.tag || '',
                total,
                average: weeks ? Math.round(total / weeks) : 0,
                weeks
            };
        })
        .filter(entry => entry.weeks > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 10) : [];

    topEl.innerHTML = topPerformers.length ? `
        <table>
            <thead>
                <tr>
                    <th>Player</th>
                    <th>Score</th>
                </tr>
            </thead>
            <tbody>
                ${topPerformers.map(player => `
                    <tr data-tag="${player.tag}" data-name="${player.name}">
                        <td class="summary-player">
                            ${player.name}
                            ${player.tag ? `<span class="summary-tag">${player.tag}</span>` : ''}
                        </td>
                        <td>${formatChartValue(player.score)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    ` : '<p>No current week data yet.</p>';

    improvementEl.innerHTML = improvements.length ? `
        <table>
            <thead>
                <tr>
                    <th>Player</th>
                    <th>Change</th>
                </tr>
            </thead>
            <tbody>
                ${improvements.map(player => `
                    <tr data-tag="${player.tag}" data-name="${player.name}">
                        <td class="summary-player">
                            ${player.name}
                            ${player.tag ? `<span class="summary-tag">${player.tag}</span>` : ''}
                        </td>
                        <td>${player.delta >= 0 ? `+${player.delta}` : player.delta}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    ` : '<p>No week-over-week data yet.</p>';

    leaderboardEl.innerHTML = leaderboard.length ? `
        <table>
            <thead>
                <tr>
                    <th>Player</th>
                    <th>Total</th>
                    <th>Avg</th>
                </tr>
            </thead>
            <tbody>
                ${leaderboard.map(player => `
                    <tr data-tag="${player.tag}" data-name="${player.name}">
                        <td class="summary-player">
                            ${player.name}
                            ${player.tag ? `<span class="summary-tag">${player.tag}</span>` : ''}
                        </td>
                        <td>${formatChartValue(player.total)}</td>
                        <td>${formatChartValue(player.average)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    ` : '<p>No recent history yet.</p>';

    [topEl, improvementEl, leaderboardEl].forEach(container => {
        container.querySelectorAll('tbody tr').forEach(row => {
            row.addEventListener('click', () => {
                focusPlayerRow(row.dataset.tag, row.dataset.name);
            });
        });
    });
}

function getCentralTimeInfo() {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago',
        weekday: 'short',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false
    }).formatToParts(new Date());

    const weekday = parts.find(part => part.type === 'weekday')?.value || 'Sun';
    const hour = parseInt(parts.find(part => part.type === 'hour')?.value || '0', 10);
    const minute = parseInt(parts.find(part => part.type === 'minute')?.value || '0', 10);
    const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return { day: weekdayMap[weekday] ?? 0, hour, minute };
}

function getDemotionThreshold() {
    const { day, hour, minute } = getCentralTimeInfo();
    const minutes = hour * 60 + minute;
    const cutoff = 4 * 60 + 30;

    // Sunday 4:30am CT through Monday 4:29am CT -> 700 point threshold
    if ((day === 0 && minutes >= cutoff) || (day === 1 && minutes < cutoff)) {
        return 700;
    }

    // Monday 4:30am CT and later -> 1600 threshold
    if (day === 1 && minutes >= cutoff) {
        return 1600;
    }

    return null;
}

function renderDashboard() {
    if (!latestData?.columns?.length) return;
    const clanStatsEl = document.getElementById('clanStats');
    const promotionEl = document.getElementById('promotionBoard');
    const demotionEl = document.getElementById('demotionBoard');
    const strategyEl = document.getElementById('strategyBoard');

    const allColumns = latestData.columns;
    const currentColumn = allColumns[0];
    const players = latestData.players.filter(player => currentMembersOnly ? player.isCurrent : true);

    const currentScores = players.map(player => ({
        name: player.name,
        role: player.role,
        score: player.scores[currentColumn.label],
        decks: player.decksUsed[currentColumn.label]
    }));

    const participants = currentScores.filter(item => item.score !== null && item.score !== undefined);
    const totalPoints = participants.reduce((sum, item) => sum + item.score, 0);
    const avgPoints = participants.length ? Math.round(totalPoints / participants.length) : 0;
    const totalDecks = participants.reduce((sum, item) => sum + (item.decks || 0), 0);
    const onTrack = participants.filter(item => item.score >= WAR_REQUIREMENT).length;
    const needsNudge = participants.filter(item => item.score >= WARNING_THRESHOLD && item.score < WAR_REQUIREMENT).length;
    const atRisk = participants.filter(item => item.score < WARNING_THRESHOLD).length;
    const participationRate = players.length ? Math.round((participants.length / players.length) * 100) : 0;
    const pointsNeeded = participants.reduce((sum, item) => sum + Math.max(0, WAR_REQUIREMENT - item.score), 0);

    if (clanStatsEl) {
        clanStatsEl.innerHTML = `
            <h3>Clan War Snapshot</h3>
            <div class="stat-grid">
                <div class="stat-item">Participation: <strong>${participants.length}/${players.length}</strong> (${participationRate}%)</div>
                <div class="stat-item">Total Points: <strong>${totalPoints}</strong></div>
                <div class="stat-item">Average Points: <strong>${avgPoints}</strong></div>
                <div class="stat-item">Decks Used: <strong>${totalDecks}</strong></div>
                <div class="stat-item">On Track (1600+): <strong>${onTrack}</strong></div>
                <div class="stat-item">Needs Nudge (800 - 1599): <strong>${needsNudge}</strong></div>
                <div class="stat-item">At Risk (0 - 799): <strong>${atRisk}</strong></div>
                <div class="stat-item">Points Needed to Reach 1600: <strong>${pointsNeeded}</strong></div>
            </div>
        `;
    }

    const promotionList = players
        .filter(player => player.promotionReady)
        .slice(0, 8);

    if (promotionEl) {
        promotionEl.innerHTML = `
            <h3>Promotion Ready</h3>
            <ul class="list">
                ${promotionList.length ? promotionList.map(player => `
                    <li class="list-item"><span>${player.name}</span><span class="badge badge-promote">1600+ x12</span></li>
                `).join('') : '<li class="list-item">No one yet — keep pushing!</li>'}
            </ul>
        `;
    }

    const demotionThreshold = getDemotionThreshold();
    const demotionList = demotionThreshold ? players
        .filter(player => {
            const role = (player.role || '').toLowerCase();
            if (role !== 'member' && role !== 'elder') return false;
            const score = player.scores[currentColumn.label];
            if (score === null || score === undefined) return false;
            return score < demotionThreshold;
        })
        .map(player => ({
            name: player.name,
            role: player.role,
            score: player.scores[currentColumn.label]
        }))
        .slice(0, 8) : [];

    if (demotionEl) {
        demotionEl.innerHTML = `
            <h3>Demotion Watch</h3>
            <ul class="list">
                ${demotionThreshold ? (demotionList.length ? demotionList.map(player => `
                    <li class="list-item"><span>${player.name} (${formatRole(player.role)})</span><span class="badge badge-demote">${player.score} pts</span></li>
                `).join('') : '<li class="list-item">No one flagged for this checkpoint.</li>') : '<li class="list-item">Demotion watch begins Sunday 4:30am CT.</li>'}
            </ul>
        `;
    }

    if (strategyEl) {
        const requiredMinimum = 80000;
        const momentumTarget = 900 * 50 * 4;
        const momentumPercent = Math.min(totalPoints / momentumTarget, 1);
        const minimumPercent = Math.min(totalPoints / requiredMinimum, 1);
        const fillPercent = Math.min(momentumPercent * 100, 100);
        strategyEl.innerHTML = `
            <h3>Momentum & Strategy</h3>
            <div class="thermo-widget">
                <div class="thermo-scale">
                    <span>180k</span>
                    <span>80k</span>
                    <span>0</span>
                </div>
                <div class="thermo-meter">
                    <div class="thermo-fill" style="height: ${fillPercent}%;"></div>
                </div>
                <div class="thermo-metrics">
                    <div class="momentum-value">${formatNumber(totalPoints)} total points</div>
                    <div class="momentum-sub">${Math.round(momentumPercent * 100)}% of 180,000 (total possible).</div>
                    <div class="momentum-sub">${Math.round(minimumPercent * 100)}% of 80,000 (required minimum).</div>
                </div>
            </div>
            <p class="strategy-text">
                Keep the momentum: <strong>${formatNumber(pointsNeeded)}</strong> total points are needed to bring every participant up to the 1600 goal.
            </p>
        `;
    }
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
