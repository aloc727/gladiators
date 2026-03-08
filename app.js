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
// Initialize currentRange from localStorage or default to 'all'
let currentRange = localStorage.getItem('currentRange') || 'all';
let currentMembersOnly = true;
let userSort = null;

// Clan policy thresholds
const WAR_REQUIREMENT = 1600;
const WARNING_THRESHOLD = 800;
const RECENT_JOIN_DAYS = 7;
const MAX_WEEKS_DISPLAY = 1000; // Temporarily increased for debugging

// Optional override for the current war label (leave empty to use data labels)
const CURRENT_WAR_LABEL = '';
const UI_VERSION = 'v1.23.0';

/** Escape string for safe insertion into HTML / attributes (XSS prevention) */
function escapeHtml(str) {
    if (str == null) return '';
    const s = String(str);
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    // Restore saved range preference BEFORE loading data
    const savedRange = localStorage.getItem('currentRange');
    if (savedRange) {
        currentRange = savedRange;
    }
    
    // Update the active button immediately (before loadData)
    document.querySelectorAll('.range-tab').forEach(button => {
        if (button.dataset.range === currentRange) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });
    
    // Try to load data on page load (after range is set)
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
            // Save to localStorage
            localStorage.setItem('currentRange', currentRange);
            renderView();
        });
    });

    // Member filter toggle: default "current members only" checked; remember user choice
    const memberToggle = document.getElementById('currentMembersOnly');
    if (memberToggle) {
        const savedPreference = localStorage.getItem('currentMembersOnly');
        if (savedPreference !== null) {
            currentMembersOnly = savedPreference === 'true';
            memberToggle.checked = currentMembersOnly;
        } else {
            memberToggle.checked = true;
            currentMembersOnly = true;
        }
        memberToggle.addEventListener('change', (e) => {
            currentMembersOnly = e.target.checked;
            localStorage.setItem('currentMembersOnly', String(currentMembersOnly));
            renderView();
        });
    }

    // Summary (and War Table) player links: click → switch to War Table and focus row
    document.body.addEventListener('click', (e) => {
        const a = e.target.closest('a.player-link-summary');
        if (!a) return;
        e.preventDefault();
        focusPlayerRow(a.getAttribute('data-tag') || '', a.getAttribute('data-name') || '');
    });
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
        
        // Fetch war log (historical) and current war separately
        const [historicalWars, currentWar] = await Promise.all([
            fetchWarLog(),
            fetch(`${API_BASE_URL}/api/clan/current-war`).then(r => r.json()).then(d => d.currentWar).catch(() => null)
        ]);
        
        console.log(`📥 Frontend: ${historicalWars.length} historical wars, ${currentWar ? '1' : '0'} current war`);
        
        // Combine: current war first (if available), then historical
        const warLog = currentWar ? [currentWar, ...historicalWars] : historicalWars;
        console.log(`📥 Frontend: Combined ${warLog.length} total wars to process`);
        
        // Fetch promotion history (for summary and promotion-ready box)
        const promotions = await fetch(`${API_BASE_URL}/api/clan/promotions`)
            .then(r => r.json())
            .then(d => ({
                lastPromoted: d.lastPromoted || null,
                recent: d.recent || [],
                lastDemoted: d.lastDemoted || null,
                recentDemotions: d.recentDemotions || []
            }))
            .catch(() => ({ lastPromoted: null, recent: [], lastDemoted: null, recentDemotions: [] }));

        // Process data
        const processedData = processWarData(members, warLog);
        processedData.promotions = promotions;

        // Debug: Log data summary
        console.log('=== DATA LOADED ===');
        console.log('Members:', members.length);
        console.log('War Log Entries:', warLog.length);
        console.log('Processed Players:', processedData.players.length);
        console.log('Processed Columns:', processedData.columns.length);
        console.log('Current Range:', currentRange);
        console.log('All Columns:', processedData.columns.map(c => ({
            label: c.label,
            endDate: c.endDate instanceof Date ? c.endDate.toISOString() : (c.endDate || 'NO DATE'),
            hasEndDate: !!c.endDate
        })));
        console.log('Sample Player Scores:', processedData.players[0] ? {
            name: processedData.players[0].name,
            scoresCount: Object.keys(processedData.players[0].scores).length,
            scoreKeys: Object.keys(processedData.players[0].scores).slice(0, 5)
        } : null);
        
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
    const warLog = data.warLog || [];
    console.log(`📥 Frontend received ${warLog.length} wars from /api/clan/warlog`);
    if (warLog.length > 0 && warLog.length <= 5) {
        console.log('📥 Sample of received wars:', warLog.slice(0, 3).map(w => ({
            id: w.id,
            endDate: w.endDate,
            seasonId: w.seasonId,
            participants: w.participants?.length || 0
        })));
    }
    return warLog;
}

// Format date for war table column headers: M/D/YY (e.g. 3/5/26)
function formatWarDate(dateString) {
    if (!dateString) return 'Unknown Date';
    const date = new Date(dateString);
    const m = date.getMonth() + 1;
    const day = date.getDate();
    const y = String(date.getFullYear()).slice(-2);
    return `${m}/${day}/${y}`;
}

function formatWarRange(endDate, startDate = null) {
    // Wars start Thursday 4:30am CT and end Monday 4:30am CT
    let startDateObj;
    if (startDate) {
        startDateObj = new Date(startDate);
    } else {
        // Calculate Thursday from Monday (go back 4 days: Mon->Sun->Sat->Fri->Thu)
        startDateObj = new Date(endDate);
        startDateObj.setDate(startDateObj.getDate() - 4);
        startDateObj.setHours(4, 30, 0, 0);
    }
    
    // Ensure endDate is also at 4:30am
    const endDateObj = new Date(endDate);
    endDateObj.setHours(4, 30, 0, 0);
    
    return `${formatWarDate(startDateObj.toISOString())}-${formatWarDate(endDateObj.toISOString())}`;
}

function getSeasonWeekLabel(war) {
    const seasonId = war.seasonId ?? war.season?.id ?? null;
    // periodIndex is the week number (1-5), sectionIndex is usually 0
    const weekIndex = Number.isInteger(war.periodIndex) ? war.periodIndex
        : Number.isInteger(war.sectionIndex) ? war.sectionIndex + 1
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
    // Use the endDate from the database if available (it's already the correct Monday)
    if (war.endDate) {
        // Parse the date - PostgreSQL returns it as a string in UTC or local format
        let date = new Date(war.endDate);
        
        // If the date is invalid, log it
        if (isNaN(date.getTime())) {
            console.warn('⚠️  Invalid date for war:', war.id, war.endDate);
            // Fallback to createdDate
            if (war.createdDate) {
                date = new Date(war.createdDate);
            }
        }
        
        // CRITICAL: Don't normalize the date - use it exactly as stored in database
        // The database has the correct end date, and we need to preserve uniqueness
        // If we normalize all dates to the same Monday, all wars collapse into one column
        return date;
    }
    
    // Fallback to createdDate if endDate not available
    if (war.createdDate) {
        const date = new Date(war.createdDate);
        // If it's not already a Monday, find the Monday for that week
        const dayOfWeek = date.getDay();
        if (dayOfWeek !== 1) {
            const daysUntilMonday = (1 - dayOfWeek + 7) % 7;
            date.setDate(date.getDate() + daysUntilMonday);
        }
        // Set to 4:30am CT (UTC-6) - convert to UTC first
        // 4:30 AM CT = 10:30 AM UTC
        date.setUTCHours(10, 30, 0, 0);
        return date;
    }
    
    // Last resort: calculate based on current date
    const now = new Date();
    const currentDay = now.getDay();
    const daysUntilMonday = (1 - currentDay + 7) % 7;
    const endMonday = new Date(now);
    endMonday.setDate(now.getDate() + daysUntilMonday);
    // Set to 4:30am CT (UTC-6) - convert to UTC first
    // 4:30 AM CT = 10:30 AM UTC
    endMonday.setUTCHours(10, 30, 0, 0);
    return endMonday;
}

function processWarData(members, warLog) {
    const now = new Date();

    // Create a map of all players
    const playersMap = new Map();
    const playersByName = new Map();
    const allPlayers = []; // Track all players including dynamically added ones

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
        allPlayers.push(player);
    });

    // Process war log - each item represents a war
    // Sort by date (most recent first) and limit to MAX_WEEKS_DISPLAY
    console.log('Processing war log:', warLog.length, 'entries');
    const sortedWars = [...warLog]
        .map(war => {
            const endDateObj = getWarEndDate(war);
            // Debug: Log if we're normalizing dates incorrectly
            if (war.endDate && endDateObj) {
                const originalDate = new Date(war.endDate);
                const normalizedDate = endDateObj;
                if (Math.abs(originalDate.getTime() - normalizedDate.getTime()) > 24 * 60 * 60 * 1000) {
                    console.warn('⚠️  Date normalization detected:', {
                        warId: war.id,
                        originalEndDate: war.endDate,
                        normalizedEndDate: normalizedDate.toISOString(),
                        diffHours: (normalizedDate.getTime() - originalDate.getTime()) / (1000 * 60 * 60)
                    });
                }
            }
            return {
                ...war,
                endDateObj: endDateObj
            };
        })
        .sort((a, b) => b.endDateObj - a.endDateObj)
        .slice(0, MAX_WEEKS_DISPLAY);
    
    // Debug: Show sample of wars to see if they have different dates
    console.log('Sample of first 10 wars:', sortedWars.slice(0, 10).map(w => {
        const endDateStr = w.endDate ? (typeof w.endDate === 'string' ? w.endDate : w.endDate.toISOString()) : 'NO END DATE';
        const endDateObjStr = w.endDateObj ? w.endDateObj.toISOString() : 'NO END DATE OBJ';
        const dateKey = w.endDateObj ? formatWarDate(w.endDateObj.toISOString()) : 'NO DATE KEY';
        return {
            id: w.id,
            endDate: endDateStr,
            endDateObj: endDateObjStr,
            dateKey: dateKey,
            participants: w.participants?.length || 0,
            seasonId: w.seasonId,
            sectionIndex: w.sectionIndex,
            periodIndex: w.periodIndex,
            dataSource: w.dataSource
        };
    }));
    
    // Debug: Check if all wars have the same endDateObj (this would cause collapsing)
    const uniqueEndDates = new Set(sortedWars.map(w => w.endDateObj ? w.endDateObj.toISOString() : 'NO DATE'));
    console.log(`📊 Unique endDateObj values: ${uniqueEndDates.size} out of ${sortedWars.length} wars`);
    if (uniqueEndDates.size < 10) {
        console.log('⚠️  Only a few unique end dates! First 10 unique dates:', Array.from(uniqueEndDates).slice(0, 10));
    }
    
    // Check for test wars specifically
    const testWars = sortedWars.filter(w => w.dataSource === 'test_fake_data');
    if (testWars.length > 0) {
        console.log(`🧪 Found ${testWars.length} test wars in sorted list:`, testWars.map(w => ({
            id: w.id,
            endDate: w.endDate,
            endDateObj: w.endDateObj ? w.endDateObj.toISOString() : 'NO OBJ',
            seasonId: w.seasonId,
            periodIndex: w.periodIndex
        })));
    } else {
        console.log('⚠️  No test wars found in sorted list!');
    }
    
    // Check for duplicate dateKeys
    const dateKeyCounts = new Map();
    sortedWars.forEach(w => {
        if (w.endDateObj) {
            const key = formatWarDate(w.endDateObj.toISOString());
            dateKeyCounts.set(key, (dateKeyCounts.get(key) || 0) + 1);
        }
    });
    console.log('📊 Unique dateKeys:', dateKeyCounts.size, 'out of', sortedWars.length, 'wars');
    if (dateKeyCounts.size < sortedWars.length) {
        console.log('⚠️  Duplicate dateKeys found:', Array.from(dateKeyCounts.entries()).filter(([k, v]) => v > 1).slice(0, 5));
    }
    
    console.log('Sorted wars:', sortedWars.length, 'after processing');

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
    console.log(`📊 Starting dateMergedMap with ${mergedWars.length} merged wars`);
    mergedWars.forEach((war, index) => {
        if (!war.endDateObj) {
            console.warn('War missing endDateObj:', war.id, war.endDate, war.createdDate);
            return;
        }
        // Use a unique key that includes ID to prevent different wars from collapsing
        // Only merge wars that are truly duplicates (same id or same date+season+period)
        const dateKey = formatWarDate(war.endDateObj.toISOString());
        const uniqueKey = war.id 
            ? `${dateKey}-id${war.id}` 
            : (war.seasonId && war.periodIndex 
                ? `${dateKey}-s${war.seasonId}-p${war.periodIndex}` 
                : `${dateKey}-${Math.random().toString(36).substring(7)}`); // Fallback to random if no ID/season info
        
        // Debug: Log all unique keys to see what we're creating
        console.log(`🔑 [${index + 1}/${mergedWars.length}] Creating uniqueKey: ${uniqueKey} for war ID: ${war.id || 'NO ID'}, endDate: ${war.endDateObj.toISOString()}, dateKey: ${dateKey}, seasonId: ${war.seasonId || 'null'}, periodIndex: ${war.periodIndex ?? 'null'}`);
        
        if (dateMergedMap.has(uniqueKey)) {
            console.warn(`⚠️  Duplicate uniqueKey detected: ${uniqueKey}. This should NOT happen if IDs are unique! Merging participants.`);
        }
        
        if (!dateMergedMap.has(uniqueKey)) {
            dateMergedMap.set(uniqueKey, { ...war, dateKey, uniqueKey });
            return;
        }
        const existing = dateMergedMap.get(uniqueKey);
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
    
    console.log('Date merged wars:', dateMergedWars.length, 'unique wars after date merging (expected:', mergedWars.length, 'if no duplicates)');
    console.log('All merged wars with details:', dateMergedWars.map(w => ({
        id: w.id,
        uniqueKey: w.uniqueKey,
        endDateObj: w.endDateObj.toISOString(),
        endDate: w.endDate,
        startDate: w.startDate,
        participants: w.participants?.length || 0,
        seasonId: w.seasonId,
        periodIndex: w.periodIndex,
        label: w.label
    })));
    
    // Debug: Check if we lost wars during merging
    if (dateMergedWars.length < mergedWars.length) {
        console.warn(`⚠️  WARNING: Lost ${mergedWars.length - dateMergedWars.length} wars during date merging!`);
        const mergedIds = new Set(dateMergedWars.map(w => w.id));
        const lostWars = mergedWars.filter(w => w.id && !mergedIds.has(w.id));
        if (lostWars.length > 0) {
            console.warn('Lost wars:', lostWars.map(w => ({
                id: w.id,
                endDate: w.endDate,
                endDateObj: w.endDateObj?.toISOString(),
                seasonId: w.seasonId,
                periodIndex: w.periodIndex
            })));
        }
    }

    const columns = dateMergedWars.map((war, index) => {
        const seasonWeek = getSeasonWeekLabel(war);
        const range = formatWarRange(war.endDateObj, war.startDate);
        const seasonInfo = war.seasonId ? ` S${war.seasonId}` : '';
        const periodInfo = war.periodIndex !== null && war.periodIndex !== undefined ? `W${war.periodIndex}` : '';
        const seasonPeriodLabel = seasonInfo && periodInfo ? `${seasonInfo}${periodInfo}` : seasonInfo || '';
        const debugTooltip = war.id ? `ID:${war.id}${seasonPeriodLabel ? `, ${seasonPeriodLabel}` : ''}` : (seasonPeriodLabel || '');

        let displayLabel;
        if (index === 0) {
            displayLabel = seasonWeek ? `Current Week - ${seasonWeek} (${range})` : `Current Week (${range})`;
        } else {
            displayLabel = seasonWeek ? `${seasonWeek} (${range})` : range;
        }
        const label = displayLabel + (debugTooltip ? ` [${debugTooltip}]` : '');

        return {
            label,
            displayLabel,
            tooltip: debugTooltip || null,
            endDate: war.endDateObj,
            baseLabel: displayLabel,
            war
        };
    });

    const labelRangeRegex = /(\d{1,2}\/\d{1,2}\/\d{2,4})/g;
    const dateOnlyRegex = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
    const seasonEndMap = new Set();
    columns.forEach(column => {
        if (!column.label || !column.label.includes('Season')) return;
        const matches = column.label.match(labelRangeRegex);
        if (!matches || !matches.length) return;
        const lastMatch = matches[matches.length - 1];
        const parts = lastMatch.split('/');
        const y = (parts[2].length === 2 ? 2000 + parseInt(parts[2], 10) : parseInt(parts[2], 10));
        const endDate = parts.length >= 3 ? new Date(y, parseInt(parts[0], 10) - 1, parseInt(parts[1], 10)) : new Date(lastMatch);
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
        columns[0].displayLabel = CURRENT_WAR_LABEL;
    }

    // Initialize all players with 0 for each date column
    filteredColumns.forEach(column => {
        playersMap.forEach(player => {
            // Default to N/A when no data exists for a week.
            player.scores[column.label] = null;
            player.decksUsed[column.label] = null;
        });
    });

    // Update scores for participants
    // Since columns are created from dateMergedWars in the same order, match by index
    let matchedWars = 0;
    let unmatchedWars = 0;
    let totalParticipants = 0;
    let matchedParticipants = 0;
    
    dateMergedWars.forEach((war, warIndex) => {
        // Get the column at the same index (columns are created from dateMergedWars in same order)
        const column = columns[warIndex];
        
        if (!column) {
            unmatchedWars++;
            console.warn('No column at index', warIndex, 'for war:', {
                endDateObj: war.endDateObj,
                seasonId: war.seasonId,
                periodIndex: war.periodIndex,
                totalColumns: columns.length
            });
            return; // Skip if no matching column
        }
        
        matchedWars++;
        const dateLabel = column.label;
        const participants = war.participants || war.standings || [];
        
        if (!participants || participants.length === 0) {
            console.warn('No participants for war:', dateLabel, war);
            return;
        }
        
        totalParticipants += participants.length;
        
        // Make sure this column is in filteredColumns
        if (!filteredColumns.find(col => col.label === dateLabel)) {
            return;
        }
        participants.forEach(participant => {
            const tag = participant.tag;
            let player = tag ? playersMap.get(tag) : null;
            if (!player && participant.name) {
                player = playersByName.get(participant.name.toLowerCase()) || null;
            }
            if (!player) {
                // If showing all members, create a placeholder entry for this participant
                // so their historical data can still be displayed
                if (!currentMembersOnly && (tag || participant.name)) {
                    player = {
                        name: participant.name || tag || 'Unknown',
                        tag: tag || '',
                        role: participant.role || 'member',
                        firstSeen: null,
                        isCurrent: false, // Mark as former member
                        scores: {},
                        decksUsed: {}
                    };
                    // Add to maps so we can find it later
                    if (tag) playersMap.set(tag, player);
                    if (participant.name) playersByName.set(participant.name.toLowerCase(), player);
                    // Add to allPlayers array so it gets included in the final players list
                    allPlayers.push(player);
                } else {
                    // When showing current members only, skip unmatched participants
                    return;
                }
            }

            // Get war points - handle null, undefined, and 0 differently
            const warPoints = participant.warPoints !== null && participant.warPoints !== undefined 
                ? participant.warPoints 
                : (participant.fame !== null && participant.fame !== undefined 
                    ? participant.fame 
                    : (participant.battlesPlayed !== null && participant.battlesPlayed !== undefined
                        ? participant.battlesPlayed
                        : (participant.wins !== null && participant.wins !== undefined
                            ? participant.wins
                            : null)));
            
            // If explicitly null, set to null (N/A)
            if (warPoints === null) {
                player.scores[dateLabel] = null;
                player.decksUsed[dateLabel] = participant.decksUsed !== null && participant.decksUsed !== undefined ? participant.decksUsed : null;
                return;
            }
            
            // Otherwise use the value (even if 0)
            const finalWarPoints = warPoints || 0;
            const decksUsed = participant.decksUsed !== null && participant.decksUsed !== undefined
                ? participant.decksUsed
                : (participant.battlesPlayed !== null && participant.battlesPlayed !== undefined
                    ? participant.battlesPlayed
                    : null);
            
            player.scores[dateLabel] = finalWarPoints;
            player.decksUsed[dateLabel] = decksUsed;
            matchedParticipants++;
        });
    });
    
    // Debug summary - always log to help diagnose
    console.log('Participant matching summary:', {
        totalWars: dateMergedWars.length,
        totalColumns: columns.length,
        matchedWars,
        unmatchedWars,
        totalParticipants,
        matchedParticipants,
        unmatchedParticipants: totalParticipants - matchedParticipants,
        sampleWar: dateMergedWars[0] ? {
            endDateObj: dateMergedWars[0].endDateObj,
            participantsCount: (dateMergedWars[0].participants || []).length,
            firstParticipant: dateMergedWars[0].participants?.[0]
        } : null
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

    // Return all players (including dynamically added former members from allPlayers)
    // Use allPlayers if it has more entries (includes dynamically added ones)
    const finalPlayers = allPlayers.length > players.length ? allPlayers : players;
    
    return {
        players: finalPlayers,
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

    // Average column (ignore N/A weeks; count 0 as 0)
    const avgHeader = document.createElement('th');
    avgHeader.className = 'sortable';
    avgHeader.textContent = 'Average';
    avgHeader.setAttribute('data-column', 'Average');
    avgHeader.addEventListener('click', () => sortTable('Average', avgHeader));
    headerRow.appendChild(avgHeader);

    // Current week rank column
    const rankHeader = document.createElement('th');
    rankHeader.className = 'sortable';
    rankHeader.textContent = 'Rank (Current)';
    rankHeader.setAttribute('data-column', 'rank');
    rankHeader.addEventListener('click', () => sortTable('rank', rankHeader));
    headerRow.appendChild(rankHeader);

    // Date columns (show displayLabel; ID on mouseover; line break before date range to avoid overlap)
    columns.forEach(column => {
        const weekHeader = document.createElement('th');
        weekHeader.className = 'sortable week-header';
        const label = column.displayLabel ?? column.label;
        weekHeader.textContent = label.includes(' (') ? label.replace(' (', '\n(') : label;
        if (column.tooltip) weekHeader.title = column.tooltip;
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

        // Player name: link to RoyaleAPI (tag without #)
        const nameCell = document.createElement('td');
        nameCell.className = `name-cell ${player.joinedRecently ? 'name-recent' : ''} ${player.promotionReady ? 'promotion-ready' : ''}`.trim();
        const tagForUrl = (player.tag || '').replace(/^#/, '');
        if (tagForUrl) {
            const nameLink = document.createElement('a');
            nameLink.href = `https://royaleapi.com/player/${tagForUrl}/`;
            nameLink.target = '_blank';
            nameLink.rel = 'noopener noreferrer';
            nameLink.textContent = player.name || player.tag;
            nameLink.title = player.tag || 'View on RoyaleAPI';
            nameCell.appendChild(nameLink);
        } else {
            nameCell.textContent = player.name || '';
        }
        nameCell.title = nameCell.title || player.tag || '';

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
        const roleClass = `role-pill role-${escapeHtml((player.role || 'member').toLowerCase())}`;
        roleCell.innerHTML = `<span class="${roleClass}">${escapeHtml(formatRole(player.role))}</span>`;
        row.appendChild(roleCell);

        // Average: ignore N/A weeks, count 0 as 0
        const avgCell = document.createElement('td');
        avgCell.className = 'score-cell';
        const avg = getPlayerAverage(player.scores, columns);
        if (avg === null) {
            avgCell.textContent = 'N/A';
            avgCell.classList.add('score-na');
        } else {
            avgCell.textContent = Math.round(avg);
            avgCell.classList.add(getScoreClass(avg));
        }
        row.appendChild(avgCell);

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
        } else if (column === 'Average') {
            aValue = getPlayerAverage(a.scores, columns) ?? (currentSort.direction === 'asc' ? Number.POSITIVE_INFINITY : -1);
            bValue = getPlayerAverage(b.scores, columns) ?? (currentSort.direction === 'asc' ? Number.POSITIVE_INFINITY : -1);
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

/** Average points per week. Ignores N/A (null/undefined); 0 counts as 0. Returns null if no valid weeks. */
function getPlayerAverage(scores, columns) {
    if (!scores || !columns || !columns.length) return null;
    let sum = 0;
    let count = 0;
    columns.forEach(col => {
        const v = scores[col.label];
        if (v !== null && v !== undefined) {
            sum += Number(v) || 0;
            count += 1;
        }
    });
    return count ? sum / count : null;
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


const RANGE_MS = {
    last4weeks: 4 * 7 * 24 * 60 * 60 * 1000,
    last8weeks: 8 * 7 * 24 * 60 * 60 * 1000,
    last12weeks: 12 * 7 * 24 * 60 * 60 * 1000,
    lastyear: 365 * 24 * 60 * 60 * 1000
};

function getVisibleColumns(columns) {
    if (currentRange === 'all') return columns ?? [];
    if (!columns?.length) return [];

    const now = new Date();
    const visible = columns[0]?.endDate ? [columns[0]] : [];
    const cutoffMs = RANGE_MS[currentRange] ?? RANGE_MS.last4weeks;
    const cutoffDate = new Date(now.getTime() - cutoffMs);

    for (let i = 1; i < columns.length; i++) {
        const col = columns[i];
        const columnDate = col.endDate instanceof Date ? col.endDate : new Date(col.endDate);
        if (!col.endDate || isNaN(columnDate.getTime())) continue;
        if (columnDate >= cutoffDate) {
            visible.push(col);
        } else {
            break;
        }
    }
    return visible;
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

function formatPromotionRole(role) {
    if (!role) return '';
    const r = (role || '').toLowerCase();
    if (r === 'coleader') return 'Co-Leader';
    return (role || '').charAt(0).toUpperCase() + (role || '').slice(1).toLowerCase();
}

/** Format date as M/D/YY (e.g. 3/5/26) for home/summary dates */
function formatShortDate(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const y = String(d.getFullYear()).slice(-2);
    return `${m}/${day}/${y}`;
}

function formatPromotionDate(isoString) {
    return formatShortDate(isoString);
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
                    <tr data-tag="${escapeHtml(player.tag || '')}" data-name="${escapeHtml(player.name || '')}">
                        <td class="summary-player">
                            ${escapeHtml(player.name || '')}
                            ${player.tag ? `<span class="summary-tag">${escapeHtml(player.tag)}</span>` : ''}
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
                    <tr data-tag="${escapeHtml(player.tag || '')}" data-name="${escapeHtml(player.name || '')}">
                        <td class="summary-player">
                            ${escapeHtml(player.name || '')}
                            ${player.tag ? `<span class="summary-tag">${escapeHtml(player.tag)}</span>` : ''}
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
                    <tr data-tag="${escapeHtml(player.tag || '')}" data-name="${escapeHtml(player.name || '')}">
                        <td class="summary-player">
                            ${escapeHtml(player.name || '')}
                            ${player.tag ? `<span class="summary-tag">${escapeHtml(player.tag)}</span>` : ''}
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
    const cutoff = 4 * 60 + 30; // 4:30 AM CT

    // Thursday 4:30am CT through Sunday 4:29am CT -> No demotion watch (new week started)
    if (day >= 4 || (day === 0 && minutes < cutoff)) {
        return null;
    }

    // Sunday 4:30am CT through Monday 4:29am CT -> 700 point threshold
    if ((day === 0 && minutes >= cutoff) || (day === 1 && minutes < cutoff)) {
        return 700;
    }

    // Monday 4:30am CT through Thursday 4:29am CT -> 1600 threshold
    if (day === 1 && minutes >= cutoff) {
        return 1600; // Monday 4:30am or later
    }
    if (day >= 2 && day <= 3) {
        return 1600; // Tuesday or Wednesday (any time)
    }
    if (day === 4 && minutes < cutoff) {
        return 1600; // Thursday before 4:30am
    }
    
    return null; // Default to no demotion watch
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

    const promotionsData = latestData.promotions || {};
    const recentPromotionsMap = new Map();
    const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const twelveWeeksAgo = Date.now() - 12 * 7 * 24 * 60 * 60 * 1000;
    (promotionsData.recent || []).forEach(p => {
        const at = new Date(p.promotedAt).getTime();
        if (at >= ninetyDaysAgo) recentPromotionsMap.set(p.tag, p);
    });
    const promotedInLast12Weeks = new Set((promotionsData.recent || []).filter(p => new Date(p.promotedAt).getTime() >= twelveWeeksAgo).map(p => p.tag));

    const promotionReadyPlayers = players.filter(player => player.promotionReady && !promotedInLast12Weeks.has(player.tag));
    const promotionList = [...promotionReadyPlayers]
        .sort((a, b) => {
            const aRecent = recentPromotionsMap.get(a.tag);
            const bRecent = recentPromotionsMap.get(b.tag);
            if (aRecent && !bRecent) return 1;
            if (!aRecent && bRecent) return -1;
            return 0;
        })
        .slice(0, 10);

    if (promotionEl) {
        promotionEl.innerHTML = `
            <h3>Promotion Ready <span class="info-icon" data-tooltip="Members and elders with 12 straight weeks at 1600+ (no N/A weeks). Anyone promoted in the last 12 weeks needs another 12 weeks at 1600+ before being eligible again.">?</span></h3>
            <ul class="list">
                ${promotionList.length ? promotionList.map(player => {
                    const recent = recentPromotionsMap.get(player.tag);
                    const daysAgo = recent ? Math.floor((Date.now() - new Date(recent.promotedAt).getTime()) / (24 * 60 * 60 * 1000)) : null;
                    const sub = daysAgo != null ? ` <span class="promotion-meta">(Promoted ${daysAgo}d ago)</span>` : '';
                    const safeName = escapeHtml(player.name || '');
                    const link = player.tag ? `<a href="#" class="player-link-summary" data-tag="${escapeHtml(player.tag)}" data-name="${safeName}">${safeName}</a>` : safeName;
                    return `<li class="list-item">${link}<span class="badge badge-promote">1600+ x12</span>${sub}</li>`;
                }).join('') : '<li class="list-item">No one yet — keep pushing!</li>'}
            </ul>
        `;
    }

    const recentPromotionsEl = document.getElementById('recentPromotionsCard');
    if (recentPromotionsEl) {
        const recent = (promotionsData.recent || []).slice(0, 8);
        recentPromotionsEl.innerHTML = `
            <h3>Recent Promotions</h3>
            <ul class="list">
                ${recent.length ? recent.map(p => {
                    const safeName = escapeHtml(p.name || p.tag || '');
                    const link = p.tag ? `<a href="#" class="player-link-summary" data-tag="${escapeHtml(p.tag)}" data-name="${safeName}">${safeName}</a>` : safeName;
                    return `<li class="list-item">${link} <span class="badge badge-role">${escapeHtml(formatPromotionRole(p.fromRole))} → ${escapeHtml(formatPromotionRole(p.toRole))}</span> <span class="promotion-date">${escapeHtml(formatPromotionDate(p.promotedAt))}</span></li>`;
                }).join('') : '<li class="list-item muted">No promotions yet.</li>'}
            </ul>
        `;
    }

    const recentDemotionsEl = document.getElementById('recentDemotionsCard');
    if (recentDemotionsEl) {
        const recentD = (promotionsData.recentDemotions || []).slice(0, 8);
        recentDemotionsEl.innerHTML = `
            <h3>Recent Demotions</h3>
            <ul class="list">
                ${recentD.length ? recentD.map(d => {
                    const safeName = escapeHtml(d.name || d.tag || '');
                    const link = d.tag ? `<a href="#" class="player-link-summary" data-tag="${escapeHtml(d.tag)}" data-name="${safeName}">${safeName}</a>` : safeName;
                    return `<li class="list-item">${link} <span class="badge badge-demotion">${escapeHtml(formatPromotionRole(d.fromRole))} → ${escapeHtml(formatPromotionRole(d.toRole))}</span> <span class="promotion-date">${escapeHtml(formatPromotionDate(d.demotedAt))}</span></li>`;
                }).join('') : '<li class="list-item muted">No demotions yet.</li>'}
            </ul>
        `;
    }

    const demotionThreshold = getDemotionThreshold();
    // Use current week (first column) for demotion watch (active week)
    const demotionColumn = currentColumn;
    
    // Build demotion list based on threshold and role
    const demotionList = [];
    
    if (demotionThreshold && demotionColumn) {
        // Members and elders: check against threshold
        const membersElders = players
            .filter(player => {
                // Only include current members
                if (!player.isCurrent) return false;
                const role = (player.role || '').toLowerCase();
                if (role !== 'member' && role !== 'elder') return false;
                const score = player.scores[demotionColumn.label];
                if (score === null || score === undefined) return false;
                return score < demotionThreshold;
            })
            .map(player => ({
                name: player.name,
                role: player.role,
                tag: player.tag,
                score: player.scores[demotionColumn.label]
            }));
        
        demotionList.push(...membersElders);
        
        // Co-leaders: (1) 0 points for 12 consecutive weeks, or (2) 12-week rolling average below 1600
        const coLeaderCandidates = players.filter(p => p.isCurrent && (p.role || '').toLowerCase() === 'coleader');
        const streakColumns = allColumns.slice(0, 12);
        for (const player of coLeaderCandidates) {
            if (streakColumns.length < 12) continue;
            let consecutiveZeros = 0;
            const scoresForAvg = [];
            for (const column of streakColumns) {
                const score = player.scores[column.label];
                if (score === null || score === undefined) {
                    consecutiveZeros = 0;
                    break;
                }
                if (score === 0) {
                    consecutiveZeros++;
                } else {
                    consecutiveZeros = 0;
                    break;
                }
            }
            if (consecutiveZeros >= 12) {
                demotionList.push({ name: player.name, role: player.role, tag: player.tag, score: 0, weeks: 12, reason: '0 pts x12' });
                continue;
            }
            for (const column of streakColumns) {
                const score = player.scores[column.label];
                if (score !== null && score !== undefined) scoresForAvg.push(score);
            }
            const avg = scoresForAvg.length ? scoresForAvg.reduce((a, b) => a + b, 0) / scoresForAvg.length : 0;
            if (scoresForAvg.length >= 1 && avg < WAR_REQUIREMENT) {
                demotionList.push({ name: player.name, role: player.role, tag: player.tag, score: Math.round(avg), weeks: scoresForAvg.length, reason: '12-wk avg < 1600' });
            }
        }
    }
    
    // Limit to 8 for display
    const limitedDemotionList = demotionList.slice(0, 8);

    if (demotionEl) {
        let demotionMessage = '';
        if (!demotionThreshold) {
            // No demotion watch active (Thursday 4:30am CT through Sunday 4:29am CT)
            // Calculate next demotion watch start (Sunday 4:30am CT)
            const now = new Date();
            const ctDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
            const currentDay = ctDate.getDay();
            const currentHour = ctDate.getHours();
            const currentMinute = ctDate.getMinutes();
            
            let daysUntilSunday = (0 - currentDay + 7) % 7;
            if (currentDay === 0 && (currentHour < 4 || (currentHour === 4 && currentMinute < 30))) {
                daysUntilSunday = 0; // Today is Sunday but before 4:30am
            }
            if (currentDay === 0 && currentHour >= 4 && currentMinute >= 30) {
                daysUntilSunday = 7; // Today is Sunday after 4:30am, so next Sunday is 7 days away
            }
            if (currentDay >= 1 && currentDay <= 3) {
                // Monday-Thursday: next Sunday is 7 - currentDay days away
                daysUntilSunday = 7 - currentDay;
            }
            if (currentDay === 4) {
                // Thursday: next Sunday is 3 days away
                daysUntilSunday = 3;
            }
            if (currentDay === 5) {
                // Friday: next Sunday is 2 days away
                daysUntilSunday = 2;
            }
            if (currentDay === 6) {
                // Saturday: next Sunday is 1 day away
                daysUntilSunday = 1;
            }
            
            const nextSunday = new Date(ctDate);
            nextSunday.setDate(ctDate.getDate() + daysUntilSunday);
            nextSunday.setHours(4, 30, 0, 0);
            
            const nextDateStr = nextSunday.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
                timeZone: 'America/Chicago'
            });
            demotionMessage = `<li class="list-item">Demotion watch will update Sunday 4:30am CT (${nextDateStr}).</li>`;
        } else if (limitedDemotionList.length === 0) {
            demotionMessage = '<li class="list-item">No one flagged for demotion watch.</li>';
        } else {
            demotionMessage = limitedDemotionList.map(player => {
                const badgeText = player.reason === '12-wk avg < 1600' ? `12-wk avg ${player.score}` : (player.weeks ? `0 pts x${player.weeks}` : `${player.score} pts`);
                const safeName = escapeHtml(player.name || '');
                const link = player.tag ? `<a href="#" class="player-link-summary" data-tag="${escapeHtml(player.tag)}" data-name="${safeName}">${safeName}</a>` : safeName;
                return `<li class="list-item">${link}<span class="badge badge-demote">${escapeHtml(badgeText)}</span></li>`;
            }).join('');
        }
        
        demotionEl.innerHTML = `
            <h3>Demotion Watch <span class="info-icon" data-tooltip="Members/elders below threshold (700 Sun-Mon, 1600 Mon-Thu) in current week. Co-leaders: 0 for 12 straight weeks, or 12-week rolling average below 1600.">?</span></h3>
            <ul class="list">
                ${demotionMessage}
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
            <h3>Momentum</h3>
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

// Update the "Updated as of" timestamp (date as M/D/YY, e.g. 3/5/26, in CT)
function updateTimestamp() {
    const lastUpdatedElement = document.getElementById('lastUpdated');
    if (lastUpdatedElement) {
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'numeric', day: 'numeric', year: '2-digit' });
        const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'America/Chicago' });
        lastUpdatedElement.innerHTML = `Updated as of: <span class="text-date">${escapeHtml(dateStr)}, ${escapeHtml(timeStr)} CT</span>`;
    }
}
