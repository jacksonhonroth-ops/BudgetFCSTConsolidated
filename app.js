// ==============================================
// Budget & Forecast Consolidated P&L — DOMO Pro Code Edition
// Uses direct fetch() with Ryuu auth token
// (domo.js SDK is blocked by Pro Code CSP)
// ==============================================

var monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
var allData = [];
var currentYear = 2025;
var currentSource = 'OPS_FIN_BUDGET';
var currentRegions = [];
var currentOpsLeads = [];
var currentParentAccounts = [];
var currentJobs = [];
var expandedRows = {};
var uniqueValuesCache = {};

// --- DOMO data helper (replaces domo.get) ---
var _ryuuToken = window.__RYUU_AUTHENTICATION_TOKEN__ || '';

function domoFetch(url) {
  var headers = {};
  if (_ryuuToken) headers['x-domo-authentication'] = _ryuuToken;
  return fetch(url, { headers: headers }).then(function(r) {
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + r.statusText);
    return r.json();
  });
}

// --- Ops lead filtering ---
var excludeOpsLeads = [
  'Lost', 'LOST', 'lost',
  'Tag', 'TAG', 'tag',
  'New Sales', 'NEW SALES', 'new sales', 'New sales',
  'Vacant', 'VACANT', 'vacant',
  'TBD', 'tbd', 'Tbd',
  'N/A', 'n/a', 'NA', 'na',
  'None', 'NONE', 'none',
  'Open', 'OPEN', 'open',
  'Unknown', 'UNKNOWN', 'unknown',
  '', null, undefined
];

function isValidOpsLead(name) {
  if (!name) return false;
  if (excludeOpsLeads.indexOf(name) > -1) return false;
  var upperName = name.toUpperCase();
  if (upperName.indexOf('LOST SALES') > -1) return false;
  if (upperName.indexOf('NEW SALES') > -1) return false;
  if (upperName.indexOf('TAG SALES') > -1) return false;
  if (upperName.indexOf('UNKNOWN') > -1) return false;
  if (upperName.indexOf('VACANT') > -1) return false;
  if (upperName.indexOf('TBD') > -1) return false;
  if (/^\d{4}/.test(name)) return false;
  return true;
}

function getYearFromDate(dateStr) {
  if (!dateStr) return null;
  // Parse "YYYY-MM-DD" directly to avoid timezone shift bug
  var s = String(dateStr);
  var dash = s.indexOf('-');
  if (dash === 4) return parseInt(s.substring(0, 4));
  // Fallback for other formats
  var date = new Date(dateStr + 'T00:00:00');
  if (!isNaN(date.getTime())) return date.getFullYear();
  return null;
}

function getMonthIndex(dateStr) {
  if (!dateStr) return null;
  // Parse "YYYY-MM-DD" directly to avoid timezone shift bug
  var s = String(dateStr);
  var parts = s.split('-');
  if (parts.length >= 2 && parts[0].length === 4) return parseInt(parts[1]) - 1;
  // Fallback for other formats
  var date = new Date(dateStr + 'T00:00:00');
  if (!isNaN(date.getTime())) return date.getMonth();
  return null;
}

// --- Status display ---
function showStatus(msg, isError) {
  var color = isError ? '#e53e3e' : '#4a5568';
  var el = document.getElementById('myTable');
  if (el) el.innerHTML = '<tbody><tr><td style="padding:20px;font-size:14px;color:' + color + ';">' + msg + '</td></tr></tbody>';
  console.log('[PL] ' + msg.replace(/<[^>]+>/g, ' '));
}

// ==============================================
// INIT
// ==============================================
(function init() {
  if (!_ryuuToken) {
    showStatus('No DOMO auth token found. This app must run inside DOMO Pro Code.', true);
    return;
  }

  showStatus('Loading data…');
  loadAllData();
})();

function loadAllData() {
  showStatus('Loading data…');

  var PAGE = 50000;
  var allRows = [];
  var page = 0;

  function loadPage() {
    var offset = page * PAGE;
    var url = '/data/v1/dataset0?limit=' + PAGE + '&offset=' + offset;
    console.log('[PL] Fetching page ' + (page + 1) + ' (offset=' + offset + ')');
    showStatus('Loading data… ' + allRows.length.toLocaleString() + ' rows so far');

    domoFetch(url)
      .then(function(data) {
        if (!data || !Array.isArray(data)) {
          if (allRows.length === 0) {
            showStatus('Unexpected response format.', true);
          } else {
            finishLoad();
          }
          return;
        }

        // Keep only the columns we need and only 2025+ data
        for (var i = 0; i < data.length; i++) {
          var r = data[i];
          var dt = r['GLPostingDate'];
          // Skip rows before 2025
          if (dt && String(dt).substring(0, 4) < '2025') continue;
          allRows.push({
            'GLPostingDate': dt,
            'Amount': r['Amount'],
            'SOURCE': r['SOURCE'],
            'Region': r['Region'],
            'Operations Lead': r['Operations Lead'],
            'Parent Account': r['Parent Account'],
            'JobNumber': r['JobNumber'],
            'JobDescription': r['JobDescription'] || r['Job Description'] || '',
            'P&L Category Name': r['P&L Category Name'],
            'P&L Subcategory': r['P&L Subcategory'],
            'Metrics': r['Metrics']
          });
        }

        console.log('[PL] Page ' + (page + 1) + ': got ' + data.length + ' rows (total: ' + allRows.length + ')');

        if (data.length < PAGE) {
          finishLoad();
        } else {
          page++;
          data = null;
          loadPage();
        }
      })
      .catch(function(err) {
        console.error('[PL] Page load error:', err);
        if (allRows.length > 0) {
          console.warn('[PL] Using partial data: ' + allRows.length + ' rows');
          finishLoad();
        } else {
          showStatus('Error loading data: ' + err.message, true);
        }
      });
  }

  function finishLoad() {
    console.log('[PL] Load complete: ' + allRows.length + ' rows');
    showStatus('Processing ' + allRows.length.toLocaleString() + ' rows…');
    handleDataLoaded(allRows);
  }

  loadPage();
}

function handleDataLoaded(data) {
  try {
    if (!data) { showStatus('Dataset returned null.', true); return; }
    if (!Array.isArray(data)) {
      if (data.rows && Array.isArray(data.rows)) { data = data.rows; }
      else { showStatus('Unexpected response format.', true); return; }
    }
    if (data.length === 0) { showStatus('Dataset has 0 rows.', true); return; }

    console.log('[PL] Rows: ' + data.length + ', Columns: ' + Object.keys(data[0]).length);
    console.log('[PL] Column names:', Object.keys(data[0]));
    console.log('[PL] First row sample:', JSON.stringify(data[0], null, 2));

    // Debug: find all unique SOURCE values
    var sourcesFound = {};
    var categoriesFound = {};
    for (var i = 0; i < Math.min(data.length, 10000); i++) {
      if (data[i]['SOURCE']) sourcesFound[data[i]['SOURCE']] = true;
      if (data[i]['P&L Category Name']) categoriesFound[data[i]['P&L Category Name']] = true;
    }
    console.log('[PL] SOURCE values found:', Object.keys(sourcesFound));
    console.log('[PL] P&L Categories found:', Object.keys(categoriesFound));

    allData = data;
    cacheUniqueValues();

    console.log('[PL] Cached SOURCE values:', Object.keys(uniqueValuesCache['SOURCE']));
    console.log('[PL] Cached YEARS:', Object.keys(uniqueValuesCache['YEAR']));

    var yearsFound = Object.keys(uniqueValuesCache['YEAR']);
    if (yearsFound.length === 0) {
      showStatus('No valid years found in GLPostingDate.', true);
      return;
    }
    if (yearsFound.indexOf(String(currentYear)) === -1) {
      currentYear = Math.max.apply(null, yearsFound.map(Number));
    }
    buildPLTable();
  } catch (e) {
    console.error('[PL] Processing error:', e);
    showStatus('Error processing data: ' + e.message, true);
  }
}

// ==============================================
// CACHING + FILTERING
// ==============================================
function cacheUniqueValues() {
  uniqueValuesCache = {
    'YEAR': {}, 'Region': {}, 'Operations Lead': {},
    'Parent Account': {}, 'JobNumber': {}, 'JobLabels': {}, 'SOURCE': {}
  };
  for (var i = 0; i < allData.length; i++) {
    var row = allData[i];
    var year = getYearFromDate(row['GLPostingDate']);
    if (year) uniqueValuesCache['YEAR'][year] = true;
    if (row['Region']) uniqueValuesCache['Region'][row['Region']] = true;
    if (row['Operations Lead'] && isValidOpsLead(row['Operations Lead'])) {
      uniqueValuesCache['Operations Lead'][row['Operations Lead']] = true;
    }
    if (row['Parent Account']) uniqueValuesCache['Parent Account'][row['Parent Account']] = true;
    if (row['SOURCE']) uniqueValuesCache['SOURCE'][row['SOURCE']] = true;
    if (row['JobNumber']) {
      uniqueValuesCache['JobNumber'][row['JobNumber']] = true;
      if (!uniqueValuesCache['JobLabels'][row['JobNumber']]) {
        uniqueValuesCache['JobLabels'][row['JobNumber']] = row['JobNumber'] + ' - ' + (row['JobDescription'] || '');
      }
    }
  }
}

function applyExternalFilters(filters) {
  if (filters && filters.length > 0) {
    filters.forEach(function(f) {
      if (f.column === 'Region' && f.values.length > 0) currentRegions = f.values;
      if (f.column === 'Operations Lead' && f.values.length > 0) currentOpsLeads = f.values;
      if (f.column === 'Parent Account' && f.values.length > 0) currentParentAccounts = f.values;
      if (f.column === 'JobNumber' && f.values.length > 0) currentJobs = f.values;
    });
  }
  buildPLTable();
}

// ==============================================
// DATA PROCESSING
// ==============================================
function processDataFast() {
  var totals = {
    'Service Revenue': new Array(12).fill(0),
    'Total Labor': new Array(12).fill(0),
    'Benefits & Taxes': new Array(12).fill(0),
    'Supplies & Materials': new Array(12).fill(0),
    'Contract Expenses': new Array(12).fill(0)
  };
  var subTotals = { 'Service Revenue': {}, 'Total Labor': {} };

  var hasRegionFilter = currentRegions.length > 0;
  var hasOpsFilter = currentOpsLeads.length > 0;
  var hasParentAccountFilter = currentParentAccounts.length > 0;
  var hasJobFilter = currentJobs.length > 0;

  for (var i = 0; i < allData.length; i++) {
    var row = allData[i];
    var rowYear = getYearFromDate(row['GLPostingDate']);
    if (rowYear !== currentYear) continue;
    if (row['SOURCE'] !== currentSource) continue;
    if (hasRegionFilter && currentRegions.indexOf(row['Region']) === -1) continue;
    if (hasOpsFilter && currentOpsLeads.indexOf(row['Operations Lead']) === -1) continue;
    if (hasParentAccountFilter && currentParentAccounts.indexOf(row['Parent Account']) === -1) continue;
    if (hasJobFilter && currentJobs.indexOf(row['JobNumber']) === -1) continue;

    var category = row['P&L Category Name'];
    if (!totals[category]) continue;

    var monthIndex = getMonthIndex(row['GLPostingDate']);
    if (monthIndex === null || monthIndex < 0 || monthIndex > 11) continue;

    var val = row['Amount'] || 0;
    totals[category][monthIndex] += val;

    if (category === 'Service Revenue' || category === 'Total Labor') {
      var subCat = row['P&L Subcategory'] || row['Metrics'] || 'Other';
      if (!subTotals[category][subCat]) {
        subTotals[category][subCat] = new Array(12).fill(0);
      }
      subTotals[category][subCat][monthIndex] += val;
    }
  }

  var derived = {
    'Gross Contribution Margin': new Array(12).fill(0),
    'GCM %': new Array(12).fill(0)
  };
  for (var m = 0; m < 12; m++) {
    var rev = totals['Service Revenue'][m];
    var labor = totals['Total Labor'][m];
    var benefits = totals['Benefits & Taxes'][m];
    var supplies = totals['Supplies & Materials'][m];
    var contract = totals['Contract Expenses'][m];
    var grossMargin = rev - labor - benefits - supplies;
    var gcm = grossMargin - contract;
    derived['Gross Contribution Margin'][m] = gcm;
    derived['GCM %'][m] = rev !== 0 ? (gcm / rev) * 100 : 0;
  }

  return { totals: totals, subTotals: subTotals, derived: derived };
}

function formatNum(value) {
  return '$' + Math.round(value).toLocaleString('en-US');
}

function getFilteredUniqueValues(field) {
  if (field === 'YEAR') return Object.keys(uniqueValuesCache['YEAR']).sort();

  var hasRegionFilter = currentRegions.length > 0;
  var hasOpsFilter = currentOpsLeads.length > 0;
  var hasParentAccountFilter = currentParentAccounts.length > 0;
  var unique = {};

  for (var i = 0; i < allData.length; i++) {
    var row = allData[i];
    var rowYear = getYearFromDate(row['GLPostingDate']);
    if (rowYear !== currentYear) continue;
    if (row['SOURCE'] !== currentSource) continue;
    if (field !== 'Region' && hasRegionFilter && currentRegions.indexOf(row['Region']) === -1) continue;
    if (field !== 'Operations Lead' && field !== 'Region' && hasOpsFilter && currentOpsLeads.indexOf(row['Operations Lead']) === -1) continue;
    if (field !== 'Parent Account' && field !== 'Operations Lead' && field !== 'Region' && hasParentAccountFilter && currentParentAccounts.indexOf(row['Parent Account']) === -1) continue;
    if (row[field]) unique[row[field]] = true;
  }
  return Object.keys(unique).sort();
}

// ==============================================
// SEARCHABLE MULTI-SELECT (pure DOM, no jQuery/Select2)
// ==============================================
function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildSearchSelect(wrapperId, allItems, selectedValues, labelMap, onChangeCb) {
  var wrapper = document.getElementById(wrapperId);
  if (!wrapper) return;

  var h = '<div class="ss-container" style="position:relative;display:inline-block;min-width:200px;vertical-align:top;">';

  // Tags for selected items
  h += '<div class="ss-tags" style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:' + (selectedValues.length > 0 ? '4px' : '0') + ';">';
  for (var t = 0; t < selectedValues.length; t++) {
    var tagLabel = labelMap ? (labelMap[selectedValues[t]] || selectedValues[t]) : selectedValues[t];
    h += '<span class="ss-tag" style="display:inline-flex;align-items:center;gap:3px;background:#f97316;color:white;font-size:10px;padding:2px 6px;border-radius:3px;max-width:180px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">';
    h += escHtml(tagLabel);
    h += '<span class="ss-tag-remove" data-wrapper="' + wrapperId + '" data-value="' + escHtml(selectedValues[t]) + '" style="cursor:pointer;font-weight:bold;font-size:12px;line-height:1;margin-left:2px;">&times;</span>';
    h += '</span>';
  }
  h += '</div>';

  // Search input
  var placeholder = selectedValues.length > 0 ? '' : (wrapperId === 'jobSelectWrapper' ? 'Search Jobs…' : 'Search Accounts…');
  h += '<input type="text" class="ss-input" data-wrapper="' + wrapperId + '" placeholder="' + placeholder + '" autocomplete="off" ';
  h += 'style="width:100%;padding:4px 8px;font-size:11px;background:#1a365d;color:white;border:1px solid #2d4a7c;border-radius:4px;outline:none;box-sizing:border-box;" />';

  // Dropdown (hidden by default)
  h += '<div class="ss-dropdown" data-wrapper="' + wrapperId + '" style="display:none;position:absolute;top:100%;left:0;right:0;max-height:200px;overflow-y:auto;background:#1a365d;border:1px solid #2d4a7c;border-top:none;border-radius:0 0 4px 4px;z-index:9999;">';
  for (var i = 0; i < allItems.length; i++) {
    var val = allItems[i];
    var lbl = labelMap ? (labelMap[val] || val) : val;
    var isSelected = selectedValues.indexOf(val) > -1;
    h += '<div class="ss-option" data-wrapper="' + wrapperId + '" data-value="' + escHtml(val) + '" ';
    h += 'style="padding:5px 8px;font-size:11px;color:' + (isSelected ? '#f97316' : 'white') + ';cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' + (isSelected ? 'font-weight:bold;' : '') + '">';
    h += (isSelected ? '&#10003; ' : '') + escHtml(lbl);
    h += '</div>';
  }
  if (allItems.length === 0) {
    h += '<div style="padding:5px 8px;font-size:11px;color:#a0aec0;">No options</div>';
  }
  h += '</div></div>';

  wrapper.innerHTML = h;

  // Wire up events
  var input = wrapper.querySelector('.ss-input');
  var dropdown = wrapper.querySelector('.ss-dropdown');

  input.addEventListener('focus', function() {
    dropdown.style.display = 'block';
  });

  input.addEventListener('input', function() {
    var query = input.value.toLowerCase();
    var opts = dropdown.querySelectorAll('.ss-option');
    for (var i = 0; i < opts.length; i++) {
      var text = (opts[i].textContent || '').toLowerCase();
      opts[i].style.display = text.indexOf(query) > -1 ? '' : 'none';
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', function closeHandler(e) {
    if (!wrapper.contains(e.target)) {
      dropdown.style.display = 'none';
      document.removeEventListener('click', closeHandler);
    }
  });

  // Hover highlight for options
  dropdown.addEventListener('mouseover', function(e) {
    var opt = e.target.closest('.ss-option');
    if (opt) opt.style.background = '#2d4a7c';
  });
  dropdown.addEventListener('mouseout', function(e) {
    var opt = e.target.closest('.ss-option');
    if (opt) opt.style.background = '';
  });

  // Option click
  dropdown.addEventListener('click', function(e) {
    var opt = e.target.closest('.ss-option');
    if (!opt) return;
    var val = opt.getAttribute('data-value');
    onChangeCb(val);
  });

  // Tag remove click
  var tags = wrapper.querySelectorAll('.ss-tag-remove');
  for (var i = 0; i < tags.length; i++) {
    tags[i].addEventListener('click', function(e) {
      e.stopPropagation();
      var val = e.target.getAttribute('data-value');
      onChangeCb(val);
    });
  }
}

function initializeMultiSelects() {
  // Parent Account — searchable
  var parentAccounts = getFilteredUniqueValues('Parent Account');
  buildSearchSelect('parentAccountSelectWrapper', parentAccounts, currentParentAccounts, null, function(val) {
    var idx = currentParentAccounts.indexOf(val);
    if (idx > -1) { currentParentAccounts.splice(idx, 1); }
    else { currentParentAccounts.push(val); }
    currentJobs = [];
    buildPLTable();
  });

  // Job Number — searchable with labels
  var jobs = getFilteredUniqueValues('JobNumber');
  buildSearchSelect('jobSelectWrapper', jobs, currentJobs, uniqueValuesCache['JobLabels'], function(val) {
    var idx = currentJobs.indexOf(val);
    if (idx > -1) { currentJobs.splice(idx, 1); }
    else { currentJobs.push(val); }
    buildPLTable();
  });
}

// ==============================================
// TABLE RENDERING
// ==============================================
function buildPLTable() {
  var data = processDataFast();
  var totals = data.totals;
  var subTotals = data.subTotals;
  var derived = data.derived;

  var years = Object.keys(uniqueValuesCache['YEAR']).sort();
  var regions = getFilteredUniqueValues('Region');
  var opsLeads = getFilteredUniqueValues('Operations Lead').filter(function(o) { return isValidOpsLead(o); });

  var h = [];

  h.push('<thead>');
  h.push('<tr class="title-row">');
  h.push('<th colspan="15" style="background:#0f2a4a; color:white; padding:12px 15px; border:1px solid #0a1f38;">');
  h.push('<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">');
  h.push('<div>');
  h.push('<span style="font-size:16px; font-weight:bold;">Budget & Forecast Consolidated P&L</span>');
  h.push('<span style="font-size:11px; margin-left:10px; color:#a0aec0;">Gross Contribution Margin Analysis</span>');
  h.push('</div>');
  h.push('<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">');

  // Source toggle (Budget / Forecast only - no Actuals)
  h.push('<div id="sourceToggle" style="display:inline-flex; border-radius:4px; overflow:hidden; border:1px solid #1a365d;">');
  var sources = [['OPS_FIN_BUDGET','Budget'],['JOB_FORECAST','Forecast']];
  for (var si = 0; si < sources.length; si++) {
    var sv = sources[si][0], sl = sources[si][1];
    var bg = currentSource === sv ? '#f97316' : '#1a365d';
    var bl = si > 0 ? 'border-left:1px solid #0f2a4a;' : '';
    h.push('<button class="source-toggle-btn" data-value="' + sv + '" style="padding:6px 10px;font-size:11px;border:none;cursor:pointer;background:' + bg + ';color:white;' + bl + '">' + sl + '</button>');
  }
  h.push('</div>');

  // Year
  h.push('<select id="yearSelect" style="padding:6px 10px;font-size:12px;border:none;border-radius:4px;background:#1a365d;color:white;cursor:pointer;">');
  for (var i = 0; i < years.length; i++) {
    h.push('<option value="' + years[i] + '"' + (years[i] == currentYear ? ' selected' : '') + '>' + years[i] + '</option>');
  }
  h.push('</select>');

  // Region
  h.push('<select id="regionSelect" style="padding:6px 10px;font-size:12px;border:none;border-radius:4px;background:#1a365d;color:white;cursor:pointer;min-width:100px;">');
  h.push('<option value="">All Regions</option>');
  for (var i = 0; i < regions.length; i++) {
    h.push('<option value="' + regions[i] + '"' + (currentRegions.indexOf(regions[i]) > -1 ? ' selected' : '') + '>' + regions[i] + '</option>');
  }
  h.push('</select>');

  // Ops Lead
  h.push('<select id="opsSelect" style="padding:6px 10px;font-size:12px;border:none;border-radius:4px;background:#1a365d;color:white;cursor:pointer;min-width:110px;">');
  h.push('<option value="">All Ops Leads</option>');
  for (var i = 0; i < opsLeads.length; i++) {
    h.push('<option value="' + opsLeads[i] + '"' + (currentOpsLeads.indexOf(opsLeads[i]) > -1 ? ' selected' : '') + '>' + opsLeads[i] + '</option>');
  }
  h.push('</select>');

  // Parent Account + Job wrappers
  h.push('<div id="parentAccountSelectWrapper" style="min-width:200px;display:inline-block;"></div>');
  h.push('<div id="jobSelectWrapper" style="min-width:250px;display:inline-block;"></div>');

  // Clear
  h.push('<button id="clearFilters" style="padding:6px 12px;font-size:11px;background:#e53e3e;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">Clear</button>');
  h.push('</div></div></th></tr>');

  // Column headers
  h.push('<tr>');
  h.push('<th style="background:#4a5568;color:white;border:1px solid #333;padding:10px 15px;text-align:left;min-width:180px;">Metrics</th>');
  h.push('<th style="background:#4a5568;color:white;border:1px solid #333;padding:10px 15px;text-align:left;min-width:150px;">Sub Category</th>');
  for (var m = 0; m < 12; m++) {
    h.push('<th style="background:#4a5568;color:white;border:1px solid #333;padding:10px 15px;text-align:right;">' + monthNames[m] + '</th>');
  }
  h.push('<th style="background:#2d3748;color:white;border:1px solid #1a202c;padding:10px 15px;text-align:right;">TOTAL</th>');
  h.push('</tr></thead><tbody>');

  // Data rows
  var rowOrder = [
    { name: 'Service Revenue', display: 'Service Revenue', type: 'expandable' },
    { name: 'Total Labor', display: 'Total Labor', type: 'expandable' },
    { name: 'Benefits & Taxes', display: 'Benefits & Taxes', type: 'data' },
    { name: 'Supplies & Materials', display: 'Supplies & Materials', type: 'data' },
    { name: 'Contract Expenses', display: 'Contract Expenses', type: 'data' },
    { name: 'Gross Contribution Margin', display: 'Gross Contribution Margin', type: 'subtotal' },
    { name: 'GCM %', display: 'GCM %', type: 'subtotal' }
  ];

  var rowIndex = 0;
  for (var r = 0; r < rowOrder.length; r++) {
    var metric = rowOrder[r];
    var isSubtotal = metric.type === 'subtotal';
    var isExpandable = metric.type === 'expandable';
    var isExpanded = expandedRows[metric.name] === true;

    var bgColor = rowIndex % 2 === 0 ? '#ffffff' : '#f7fafc';
    var metricBg = rowIndex % 2 === 0 ? '#f7fafc' : '#edf2f7';
    var totalBg = rowIndex % 2 === 0 ? '#f7fafc' : '#edf2f7';
    var textColor = '#1a202c';
    var fontWeight = 'normal';
    var borderStyle = '1px solid #cbd5e0';

    if (isSubtotal) {
      bgColor = '#d4edda'; metricBg = '#c3e6cb'; totalBg = '#b1dfbb';
      textColor = '#155724'; fontWeight = 'bold'; borderStyle = '2px solid #28a745';
    }

    h.push('<tr class="main-row" data-category="' + metric.name + '">');
    h.push('<td style="background:' + metricBg + ';color:#0f2a4a;font-weight:bold;border:' + borderStyle + ';padding:10px 15px;text-align:left;">');
    if (isExpandable) {
      var icon = isExpanded ? '−' : '+';
      h.push('<span class="expand-toggle" data-category="' + metric.name + '" style="display:inline-block;width:18px;height:18px;background:#4a5568;color:white;text-align:center;line-height:18px;border-radius:3px;margin-right:8px;cursor:pointer;font-weight:bold;font-size:14px;">' + icon + '</span>');
    }
    h.push(metric.display + '</td>');
    h.push('<td style="background:' + bgColor + ';color:' + textColor + ';border:' + borderStyle + ';padding:10px 15px;"></td>');

    var values = totals[metric.name] || derived[metric.name];
    var rowTotal = 0;
    for (var m = 0; m < 12; m++) {
      var value = values[m];
      if (metric.name !== 'GCM %') rowTotal += value;
      var cellValue = metric.name === 'GCM %' ? value.toFixed(1) + '%' : formatNum(value);
      h.push('<td style="background:' + bgColor + ';color:' + textColor + ';font-weight:' + fontWeight + ';border:' + borderStyle + ';padding:10px 15px;text-align:right;">' + cellValue + '</td>');
    }

    var totalValue;
    if (metric.name === 'GCM %') {
      var totalRev = 0, totalGCM = 0;
      for (var m = 0; m < 12; m++) { totalRev += totals['Service Revenue'][m]; totalGCM += derived['Gross Contribution Margin'][m]; }
      totalValue = (totalRev !== 0 ? (totalGCM / totalRev) * 100 : 0).toFixed(1) + '%';
    } else {
      totalValue = formatNum(rowTotal);
    }
    h.push('<td style="background:' + totalBg + ';color:' + textColor + ';font-weight:bold;border:' + borderStyle + ';padding:10px 15px;text-align:right;">' + totalValue + '</td>');
    h.push('</tr>');

    // Subcategory rows
    if (isExpandable && isExpanded && subTotals[metric.name]) {
      var subCats = Object.keys(subTotals[metric.name]).sort();
      for (var s = 0; s < subCats.length; s++) {
        var subCat = subCats[s];
        var subValues = subTotals[metric.name][subCat];
        h.push('<tr class="sub-row" data-parent="' + metric.name + '">');
        h.push('<td style="background:#f0f4f8;color:#4a5568;border:1px solid #cbd5e0;padding:8px 15px 8px 40px;"></td>');
        h.push('<td style="background:#f0f4f8;color:#4a5568;border:1px solid #cbd5e0;padding:8px 15px;">' + subCat + '</td>');
        var subRowTotal = 0;
        for (var m = 0; m < 12; m++) {
          var subVal = subValues[m];
          subRowTotal += subVal;
          h.push('<td style="background:#f0f4f8;color:#4a5568;border:1px solid #cbd5e0;padding:8px 15px;text-align:right;">' + formatNum(subVal) + '</td>');
        }
        h.push('<td style="background:#e2e8f0;color:#4a5568;font-weight:600;border:1px solid #cbd5e0;padding:8px 15px;text-align:right;">' + formatNum(subRowTotal) + '</td>');
        h.push('</tr>');
      }
    }
    rowIndex++;
  }

  h.push('</tbody>');
  document.getElementById('myTable').innerHTML = h.join('');

  // Initialize multi-select dropdowns
  setTimeout(function() { initializeMultiSelects(); }, 50);

  // --- Event handlers (use raw DOM since jQuery may not be loaded) ---
  var table = document.getElementById('myTable');

  table.onclick = function(e) {
    var target = e.target;

    // Expand toggle
    if (target.classList.contains('expand-toggle')) {
      e.stopPropagation();
      var category = target.getAttribute('data-category');
      expandedRows[category] = !expandedRows[category];
      buildPLTable();
      return;
    }

    // Source toggle
    if (target.classList.contains('source-toggle-btn')) {
      e.stopPropagation();
      currentSource = target.getAttribute('data-value');
      buildPLTable();
      return;
    }

    // Clear filters
    if (target.id === 'clearFilters') {
      currentRegions = [];
      currentOpsLeads = [];
      currentParentAccounts = [];
      currentJobs = [];
      buildPLTable();
      return;
    }
  };

  table.onchange = function(e) {
    var target = e.target;

    if (target.id === 'yearSelect') {
      currentYear = parseInt(target.value);
      currentRegions = []; currentOpsLeads = []; currentParentAccounts = []; currentJobs = [];
      buildPLTable();
    }
    if (target.id === 'regionSelect') {
      currentRegions = target.value ? [target.value] : [];
      currentOpsLeads = []; currentParentAccounts = []; currentJobs = [];
      buildPLTable();
    }
    if (target.id === 'opsSelect') {
      currentOpsLeads = target.value ? [target.value] : [];
      currentParentAccounts = []; currentJobs = [];
      buildPLTable();
    }
  };
}
