// --- MOCK DATA ---
let STATIONS_JSON = [];

const CLASSES_JSON = [
  { id: 'ac_b', name: 'AC Berth' },
  { id: 'ac_s', name: 'AC Seat' },
  { id: 'snigdha', name: 'Snigdha' },
  { id: 's_chair', name: 'S_Chair' },
  { id: 'shovan', name: 'Shovan' }
];

let TRAIN_SCHEDULES_JSON = [];

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();

  const classSelect = document.getElementById('class-select');
  CLASSES_JSON.forEach(cls => {
    const option = document.createElement('option');
    option.value = cls.id;
    option.textContent = cls.name;
    classSelect.appendChild(option);
  });
  classSelect.value = 's_chair';

  const trainSelect = document.getElementById('train-select');
  setupTrainAutocomplete('train-input', 'train-dropdown', 'train-wrapper', 'train-select');
  loadTrainSchedules(trainSelect);

  setupAutocomplete('from-input', 'from-dropdown', 'from-wrapper', 'to-input');
  setupAutocomplete('to-input', 'to-dropdown', 'to-wrapper', 'from-input');
  loadStations();

  document.getElementById('search-form').addEventListener('submit', handleSearch);

  trainSelect.addEventListener('change', (e) => {
    renderTrainSchedule(e.target.value);
  });
});

// --- FUNCTIONALITY ---

function setupTrainAutocomplete(inputId, dropdownId, wrapperId, selectId) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  const wrapper = document.getElementById(wrapperId);
  const select = selectId ? document.getElementById(selectId) : null;

  function normalizeValue(value) {
    return (value || '').trim().toLowerCase();
  }

  function renderList(options) {
    dropdown.innerHTML = '';
    if (options.length === 0) {
      dropdown.classList.add('hidden');
      return;
    }

    options.forEach(train => {
      const li = document.createElement('li');
      li.className = 'cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-emerald-50 text-slate-900';
      li.innerHTML = `
        <div class="flex items-center justify-between">
          <span class="font-medium">${train.name}</span>
          <span class="text-xs text-slate-500">${train.id}</span>
        </div>
      `;

      li.addEventListener('mousedown', () => {
        input.value = train.name;
        dropdown.classList.add('hidden');
        if (select) {
          select.value = train.id;
          select.dispatchEvent(new Event('change'));
        } else {
          renderTrainSchedule(train.id);
        }
      });

      dropdown.appendChild(li);
    });
    dropdown.classList.remove('hidden');
  }

  function getFilteredTrains(queryValue) {
    const val = normalizeValue(queryValue);
    return TRAIN_SCHEDULES_JSON.filter(train => {
      const name = normalizeValue(train?.name);
      const route = normalizeValue(train?.route);
      if (!val) return true;
      return name.includes(val) || route.includes(val);
    });
  }

  input.addEventListener('input', (e) => {
    renderList(getFilteredTrains(e.target.value));
  });

  input.addEventListener('focus', () => {
    renderList(getFilteredTrains(input.value));
  });

  document.addEventListener('mousedown', (event) => {
    if (!wrapper.contains(event.target)) {
      dropdown.classList.add('hidden');
    }
  });
}

async function loadTrainSchedules(trainSelect) {
  try {
    const res = await fetch('./train_routes.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to load train_routes.json (${res.status})`);
    const payload = await res.json();
    const rawDataList = Array.isArray(payload?.trains) ? payload.trains : [];
    const trains = rawDataList
      .map((data, idx) => convertTrainDataToSchedule(data, idx))
      .filter(Boolean);

    TRAIN_SCHEDULES_JSON = trains;

    if (trainSelect) {
      trainSelect.innerHTML = '';
      TRAIN_SCHEDULES_JSON.forEach(train => {
        const option = document.createElement('option');
        option.value = train.id;
        option.textContent = train.name;
        trainSelect.appendChild(option);
      });
    }

    const trainInput = document.getElementById('train-input');
    const currentValue = String(trainInput?.value || '').trim().toLowerCase();
    const matched = currentValue
      ? TRAIN_SCHEDULES_JSON.find(t => String(t?.name || '').trim().toLowerCase() === currentValue)
      : null;
    const selected = matched || TRAIN_SCHEDULES_JSON[0] || null;
    if (selected) {
      if (trainSelect) trainSelect.value = selected.id;
      if (trainInput && !trainInput.value.trim()) trainInput.value = selected.name;
      renderTrainSchedule(selected.id);
    } else {
      renderTrainSchedule('');
    }
  } catch (err) {
    TRAIN_SCHEDULES_JSON = [];
    if (trainSelect) trainSelect.innerHTML = '';
    renderTrainSchedule('');
  }
}

function convertTrainDataToSchedule(data, idx) {
  if (!data || typeof data !== 'object') return null;
  const trainName = (data.train_name || '').trim();
  const routes = Array.isArray(data.routes) ? data.routes : [];
  if (!trainName || routes.length === 0) return null;

  const idMatch = trainName.match(/\((\d+)\)/);
  const id = idMatch ? idMatch[1] : String(idx + 1);

  const startCity = normalizeDisplayCity(routes[0]?.city);
  const endCity = normalizeDisplayCity(routes[routes.length - 1]?.city);
  const route = startCity && endCity ? `${startCity} - ${endCity}` : '';

  const days = Array.isArray(data.days) ? data.days : [];
  const offDay = computeOffDay(days);

  const stations = routes.map((r) => {
    const name = normalizeDisplayCity(r?.city);
    const arrival = r?.arrival_time ? cleanupTime(r.arrival_time) : 'Starting';
    const departure = r?.departure_time ? cleanupTime(r.departure_time) : 'Destination';
    return { name, arrival, departure };
  });

  return { id, name: trainName, route, offDay, stations };
}

function normalizeDisplayCity(value) {
  return String(value || '').replace(/_/g, ' ').trim();
}

function cleanupTime(value) {
  return String(value || '').replace(/\s*BST\s*$/i, '').trim();
}

function computeOffDay(days) {
  const dayMap = {
    Sat: 'শনিবার',
    Sun: 'রবিবার',
    Mon: 'সোমবার',
    Tue: 'মঙ্গলবার',
    Wed: 'বুধবার',
    Thu: 'বৃহস্পতিবার',
    Fri: 'শুক্রবার'
  };

  const all = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

  function normalizeDayToken(value) {
    const t = String(value || '').trim().toLowerCase();
    if (!t) return '';
    const abbr = t.slice(0, 3);
    const norm = abbr.charAt(0).toUpperCase() + abbr.slice(1);
    return dayMap[norm] ? norm : '';
  }

  const set = new Set((days || []).map(normalizeDayToken).filter(Boolean));
  const missing = all.filter(d => !set.has(d));
  if (missing.length === 0) return 'প্রতিদিন চলে';
  return missing.map(d => dayMap[d]).join(', ');
}

async function loadStations() {
  try {
    const res = await fetch('./station_name.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to load station_name.json (${res.status})`);
    const rawStations = await res.json();

    const seen = new Set();
    const stations = [];

    rawStations.forEach((s) => {
      if (!s || s.is_enable_for_web !== 1) return;
      const name = (s.city_name || '').trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      stations.push({
        id: String(s.city_id ?? name),
        name,
        code: ''
      });
    });

    stations.sort((a, b) => a.name.localeCompare(b.name));
    STATIONS_JSON = stations;

    const fromInput = document.getElementById('from-input');
    const toInput = document.getElementById('to-input');
    if (document.activeElement === fromInput) fromInput.dispatchEvent(new Event('input'));
    if (document.activeElement === toInput) toInput.dispatchEvent(new Event('input'));
  } catch (err) {
    STATIONS_JSON = [];
  }
}

function setupAutocomplete(inputId, dropdownId, wrapperId, otherInputId) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  const wrapper = document.getElementById(wrapperId);
  const otherInput = otherInputId ? document.getElementById(otherInputId) : null;

  function normalizeStationName(value) {
    return (value || '').trim().toLowerCase();
  }

  function renderList(options) {
    dropdown.innerHTML = '';
    if (options.length === 0) {
      dropdown.classList.add('hidden');
      return;
    }

    options.forEach(station => {
      const li = document.createElement('li');
      li.className = 'cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-emerald-50 text-slate-900';
      li.innerHTML = `
        <div class="flex items-center justify-between">
          <span class="font-medium">${station.name}</span>
          <span class="text-xs text-slate-500">${station.code || ''}</span>
        </div>
      `;
      
      li.addEventListener('mousedown', () => {
        input.value = station.name;
        dropdown.classList.add('hidden');
        if (otherInput && normalizeStationName(otherInput.value) === normalizeStationName(station.name)) {
          otherInput.value = '';
        }
      });

      dropdown.appendChild(li);
    });
    dropdown.classList.remove('hidden');
  }

  function getFilteredStations(queryValue) {
    const val = normalizeStationName(queryValue);
    const excluded = otherInput ? normalizeStationName(otherInput.value) : '';
    return STATIONS_JSON.filter(station => {
      const stationName = normalizeStationName(station?.name);
      if (excluded && stationName === excluded) return false;
      return stationName.includes(val);
    });
  }

  input.addEventListener('input', (e) => {
    renderList(getFilteredStations(e.target.value));
  });

  input.addEventListener('focus', () => {
    renderList(getFilteredStations(input.value));
  });

  document.addEventListener('mousedown', (event) => {
    if (!wrapper.contains(event.target)) {
      dropdown.classList.add('hidden');
    }
  });
}

function handleSwap() {
  const fromInput = document.getElementById('from-input');
  const toInput = document.getElementById('to-input');
  const temp = fromInput.value;
  fromInput.value = toInput.value;
  toInput.value = temp;
  if (
    fromInput.value.trim() &&
    fromInput.value.trim().toLowerCase() === toInput.value.trim().toLowerCase()
  ) {
    toInput.value = '';
  }
}

function handleSearch(e) {
  e.preventDefault();
  const from = document.getElementById('from-input').value;
  const to = document.getElementById('to-input').value;
  const date = document.getElementById('date-input').value;
  const seatClass = document.getElementById('class-select').value;

  if (from.trim() && to.trim() && from.trim().toLowerCase() === to.trim().toLowerCase()) {
    alert('From and To station cannot be the same.');
    return;
  }
  
  alert(`Searching trains from ${from || 'Any'} to ${to || 'Any'} on ${date} for class ${seatClass}`);
}

function renderTrainSchedule(trainId) {
  const train = TRAIN_SCHEDULES_JSON.find(t => t.id === trainId);
  const infoBox = document.getElementById('train-info-box');
  const tbody = document.getElementById('schedule-tbody');

  if (!train) {
    infoBox.classList.add('hidden');
    tbody.innerHTML = '';
    return;
  }

  document.getElementById('train-route-display').textContent = train.route;
  document.getElementById('train-offday-display').textContent = train.offDay;
  infoBox.classList.remove('hidden');

  tbody.innerHTML = '';
  train.stations.forEach((station, idx) => {
    const isFirst = idx === 0;
    const isLast = idx === train.stations.length - 1;
    
    let dotColorClass = 'bg-blue-400';
    if (isFirst) dotColorClass = 'bg-emerald-500';
    else if (isLast) dotColorClass = 'bg-red-500';

    const arrivalHtml = (station.arrival === 'Starting' || station.arrival === 'Destination') 
      ? `<span class="text-slate-400 italic text-sm">${station.arrival}</span>` 
      : station.arrival;

    const departureHtml = (station.departure === 'Starting' || station.departure === 'Destination') 
      ? `<span class="text-slate-400 italic text-sm">${station.departure}</span>` 
      : station.departure;

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 transition-colors';
    tr.innerHTML = `
      <td class="px-6 py-4 font-medium text-slate-900 flex items-center space-x-2">
        <div class="w-2 h-2 rounded-full ${dotColorClass}"></div>
        <span>${station.name}</span>
      </td>
      <td class="px-6 py-4 text-slate-600 font-mono">${arrivalHtml}</td>
      <td class="px-6 py-4 text-slate-600 font-mono">${departureHtml}</td>
    `;
    tbody.appendChild(tr);
  });
}
