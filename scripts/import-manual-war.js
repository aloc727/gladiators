const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join(__dirname, '..', 'manual-war.csv');
const DATA_DIR = path.join(__dirname, '..', 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'war-history.json');

function parseValue(value) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'n/a') return null;
  const num = Number(trimmed);
  return Number.isNaN(num) ? trimmed : num;
}

function parseDateRange(label, year = 2026) {
  // Expects format like "1/8 through 1/11"
  const match = label.match(/(\d{1,2}\/\d{1,2})\s+through\s+(\d{1,2}\/\d{1,2})/i);
  if (!match) return null;
  const start = `${match[1]}/${year}`;
  const end = `${match[2]}/${year}`;
  return { start, end };
}

function toIsoDate(dateStr) {
  const [month, day, year] = dateStr.split('/');
  const date = new Date(Number(year), Number(month) - 1, Number(day), 4, 30, 0, 0);
  return date.toISOString();
}

function loadHistory() {
  if (!fs.existsSync(HISTORY_FILE)) {
    return { items: [] };
  }
  const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  return data && Array.isArray(data.items) ? data : { items: [] };
}

function saveHistory(items) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(HISTORY_FILE, JSON.stringify({ items }, null, 2), 'utf8');
}

function parseManualCsv(lines) {
  const dateLine = lines[0].split(',');
  const headerLine = lines[1].split(',');

  const currentDateRange = parseDateRange(dateLine[1]);
  const priorDateRange = parseDateRange(dateLine[4]);

  const currentLabel = headerLine[1].replace('Rank (', '').replace(')', '').trim();
  const priorLabel = headerLine[4].replace('Rank (', '').replace(')', '').trim();

  const current = {
    label: `${currentLabel} (${currentDateRange.start}-${currentDateRange.end})`,
    start: currentDateRange.start,
    end: currentDateRange.end,
    participants: []
  };

  const prior = {
    label: `${priorLabel} (${priorDateRange.start}-${priorDateRange.end})`,
    start: priorDateRange.start,
    end: priorDateRange.end,
    participants: []
  };

  lines.slice(2).forEach(line => {
    if (!line.trim()) return;
    const parts = line.split(',');
    const name = parts[0]?.trim();
    if (!name) return;

    const currentRank = parseValue(parts[1] || '');
    const currentPoints = parseValue(parts[2] || '');
    const currentDecks = parseValue(parts[3] || '');

    const priorRank = parseValue(parts[4] || '');
    const priorPoints = parseValue(parts[5] || '');
    const priorDecks = parseValue(parts[6] || '');

    if (currentRank !== null || currentPoints !== null || currentDecks !== null) {
      current.participants.push({
        name,
        rank: currentRank,
        warPoints: currentPoints,
        decksUsed: currentDecks
      });
    }

    if (priorRank !== null || priorPoints !== null || priorDecks !== null) {
      prior.participants.push({
        name,
        rank: priorRank,
        warPoints: priorPoints,
        decksUsed: priorDecks
      });
    }
  });

  return { current, prior };
}

function upsert(entries, historyItems) {
  entries.forEach(entry => {
    const endDate = toIsoDate(entry.end);
    const createdDate = toIsoDate(entry.start);
    const existingIndex = historyItems.findIndex(item => item.endDate === endDate);
    const record = {
      label: entry.label,
      createdDate,
      endDate,
      participants: entry.participants
    };
    if (existingIndex >= 0) {
      historyItems[existingIndex] = record;
    } else {
      historyItems.push(record);
    }
  });
}

function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`Missing ${INPUT_FILE}. Please create manual-war.csv first.`);
    process.exit(1);
  }
  const lines = fs.readFileSync(INPUT_FILE, 'utf8')
    .split(/\r?\n/)
    .filter(line => line.trim() !== '');
  if (lines.length < 3) {
    console.error('Not enough data rows.');
    process.exit(1);
  }

  const { current, prior } = parseManualCsv(lines);
  const history = loadHistory();
  const items = history.items;
  upsert([current, prior], items);
  saveHistory(items);

  console.log('✅ Manual war history imported.');
}

main();
