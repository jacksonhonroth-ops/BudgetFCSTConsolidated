var monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
var allData = [];
var currentYear = 2026;
var currentSource = 'ACTUAL';
var currentRegions = [];
var currentOpsLeads = [];
var currentParentAccounts = [];
var currentJobs = [];
var expandedRows = {};
var uniqueValuesCache = {};

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
  var date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date.getFullYear();
  }
  return null;
}

function getMonthIndex(dateStr) {
  if (!dateStr) return null;
  var date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date.getMonth();
  }
  return null;
}

$('#myTable').html('<tbody><tr><td>Loading data... please wait</td></tr></tbody>');

loadAllData();

domo.onFiltersUpdate(function(filters) {
  applyExternalFilters(filters);
});

function loadAllData() {
  console.log('Starting data load...');
  
  domo.get('/data/v1/dataset0?limit=2500000')
    .then(function(data) {
      console.log('Data loaded! Rows:', data.length);
      if (data.length > 0) {
        console.log('Columns:', Object.keys(data[0]));
        console.log('First row:', data[0]);
      }
      allData = data;
      cacheUniqueValues();
      console.log('Years found:', Object.keys(uniqueValuesCache['YEAR']));
      console.log('Sources found:', Object.keys(uniqueValuesCache['SOURCE']));
      buildPLTable();
    })
    .catch(function(error) {
      console.log('ERROR:', error);
      $('#myTable').html('<tbody><tr><td style="color:red;">Error: ' + JSON.stringify(error) + '</td></tr></tbody>');
    });
}

function cacheUniqueValues() {
  uniqueValuesCache = {
    'YEAR': {},
    'Region': {},
    'Operations Lead': {},
    'Parent Account': {},
    'JobNumber': {},
    'JobLabels': {},
    'SOURCE': {}
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
        uniqueValuesCache['JobLabels'][row['JobNumber']] = row['JobNumber'] + ' - ' + (row['Job Description'] || row['JobDescription'] || '');
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

function processDataFast() {
  var totals = {
    'Service Revenue': new Array(12).fill(0),
    'Total Labor': new Array(12).fill(0),
    'Benefits & Taxes': new Array(12).fill(0),
    'Supplies & Material': new Array(12).fill(0),
    'Contract Expenses': new Array(12).fill(0)
  };
  
  var subTotals = {
    'Service Revenue': {},
    'Total Labor': {}
  };
  
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
      var subCat = row['P&L Subcategory'] || 'Other';
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
    var supplies = totals['Supplies & Material'][m];
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
  if (field === 'YEAR') {
    return Object.keys(uniqueValuesCache['YEAR']).sort();
  }
  
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

function initializeSelect2() {
  var parentAccounts = getFilteredUniqueValues('Parent Account');
  var parentAccountSelectHtml = '<select id="parentAccountSelect" multiple style="width:100%;">';
  for (var i = 0; i < parentAccounts.length; i++) {
    var selected = currentParentAccounts.indexOf(parentAccounts[i]) > -1 ? ' selected' : '';
    var label = parentAccounts[i] || '';
    label = String(label).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    parentAccountSelectHtml += '<option value="' + parentAccounts[i] + '"' + selected + '>' + label + '</option>';
  }
  parentAccountSelectHtml += '</select>';
  $('#parentAccountSelectWrapper').html(parentAccountSelectHtml);
  
  if ($('#parentAccountSelect').length) {
    $('#parentAccountSelect').select2({
      placeholder: 'Search Parent Account...',
      allowClear: true,
      width: '200px',
      dropdownAutoWidth: true
    });
  }
  
  var jobs = getFilteredUniqueValues('JobNumber');
  var jobSelectHtml = '<select id="jobSelect" multiple style="width:100%;">';
  for (var i = 0; i < jobs.length; i++) {
    var selected = currentJobs.indexOf(jobs[i]) > -1 ? ' selected' : '';
    var label = uniqueValuesCache['JobLabels'][jobs[i]] || jobs[i];
    label = String(label).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    jobSelectHtml += '<option value="' + jobs[i] + '"' + selected + '>' + label + '</option>';
  }
  jobSelectHtml += '</select>';
  $('#jobSelectWrapper').html(jobSelectHtml);
  
  if ($('#jobSelect').length) {
    $('#jobSelect').select2({
      placeholder: 'Search Job Number...',
      allowClear: true,
      width: '250px',
      dropdownAutoWidth: true
    });
  }
  
  $('#parentAccountSelect').off('change').on('change', function() {
    var selected = $(this).val() || [];
    currentParentAccounts = selected;
    currentJobs = [];
    buildPLTable();
  });
  
  $('#jobSelect').off('change').on('change', function() {
    var selected = $(this).val() || [];
    currentJobs = selected;
    buildPLTable();
  });
}

function buildPLTable() {
  var data = processDataFast();
  var totals = data.totals;
  var subTotals = data.subTotals;
  var derived = data.derived;
  
  var years = Object.keys(uniqueValuesCache['YEAR']).sort();
  var regions = getFilteredUniqueValues('Region');
  var opsLeads = getFilteredUniqueValues('Operations Lead');
  
  opsLeads = opsLeads.filter(function(o) { return isValidOpsLead(o); });
  
  var htmlParts = [];
  
  htmlParts.push('<thead>');
  htmlParts.push('<tr class="title-row">');
  htmlParts.push('<th colspan="15" style="background:#0f2a4a; color:white; padding:12px 15px; border:1px solid #0a1f38;">');
  htmlParts.push('<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">');
  htmlParts.push('<div>');
  htmlParts.push('<span style="font-size:16px; font-weight:bold;">Job Financials P&L</span>');
  htmlParts.push('<span style="font-size:11px; margin-left:10px; color:#a0aec0;">Gross Contribution Margin Analysis</span>');
  htmlParts.push('</div>');
  htmlParts.push('<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">');
  
  // Source toggle (Budget / Forecast / Actuals)
  htmlParts.push('<div id="sourceToggle" style="display:inline-flex; border-radius:4px; overflow:hidden; border:1px solid #1a365d;">');
  htmlParts.push('<button class="source-toggle-btn' + (currentSource === 'OPS_FIN_BUDGET' ? ' active' : '') + '" data-value="OPS_FIN_BUDGET" style="padding:6px 10px; font-size:11px; border:none; cursor:pointer; background:' + (currentSource === 'OPS_FIN_BUDGET' ? '#f97316' : '#1a365d') + '; color:white;">Budget</button>');
  htmlParts.push('<button class="source-toggle-btn' + (currentSource === 'JOB_FORECAST' ? ' active' : '') + '" data-value="JOB_FORECAST" style="padding:6px 10px; font-size:11px; border:none; border-left:1px solid #0f2a4a; cursor:pointer; background:' + (currentSource === 'JOB_FORECAST' ? '#f97316' : '#1a365d') + '; color:white;">Forecast</button>');
  htmlParts.push('<button class="source-toggle-btn' + (currentSource === 'ACTUAL' ? ' active' : '') + '" data-value="ACTUAL" style="padding:6px 10px; font-size:11px; border:none; border-left:1px solid #0f2a4a; cursor:pointer; background:' + (currentSource === 'ACTUAL' ? '#f97316' : '#1a365d') + '; color:white;">Actuals</button>');
  htmlParts.push('</div>');
  
  // Year dropdown
  htmlParts.push('<select id="yearSelect" style="padding:6px 10px; font-size:12px; border:none; border-radius:4px; background:#1a365d; color:white; cursor:pointer;">');
  for (var i = 0; i < years.length; i++) {
    var selected = (years[i] == currentYear) ? ' selected' : '';
    htmlParts.push('<option value="' + years[i] + '"' + selected + '>' + years[i] + '</option>');
  }
  htmlParts.push('</select>');
  
  // Region dropdown
  htmlParts.push('<select id="regionSelect" style="padding:6px 10px; font-size:12px; border:none; border-radius:4px; background:#1a365d; color:white; cursor:pointer; min-width:100px;">');
  htmlParts.push('<option value="">All Regions</option>');
  for (var i = 0; i < regions.length; i++) {
    var selected = currentRegions.indexOf(regions[i]) > -1 ? ' selected' : '';
    htmlParts.push('<option value="' + regions[i] + '"' + selected + '>' + regions[i] + '</option>');
  }
  htmlParts.push('</select>');
  
  // Ops Lead dropdown
  htmlParts.push('<select id="opsSelect" style="padding:6px 10px; font-size:12px; border:none; border-radius:4px; background:#1a365d; color:white; cursor:pointer; min-width:110px;">');
  htmlParts.push('<option value="">All Ops Leads</option>');
  for (var i = 0; i < opsLeads.length; i++) {
    var selected = currentOpsLeads.indexOf(opsLeads[i]) > -1 ? ' selected' : '';
    htmlParts.push('<option value="' + opsLeads[i] + '"' + selected + '>' + opsLeads[i] + '</option>');
  }
  htmlParts.push('</select>');
  
  // Parent Account wrapper
  htmlParts.push('<div id="parentAccountSelectWrapper" style="min-width:200px; display:inline-block;"></div>');
  
  // Job wrapper
  htmlParts.push('<div id="jobSelectWrapper" style="min-width:250px; display:inline-block;"></div>');
  
  // Clear button
  htmlParts.push('<button id="clearFilters" style="padding:6px 12px; font-size:11px; background:#e53e3e; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">Clear</button>');
  htmlParts.push('</div></div></th></tr>');
  
  // Column headers
  htmlParts.push('<tr>');
  htmlParts.push('<th style="background:#4a5568; color:white; border:1px solid #333; padding:10px 15px; text-align:left; min-width:180px;">Metrics</th>');
  htmlParts.push('<th style="background:#4a5568; color:white; border:1px solid #333; padding:10px 15px; text-align:left; min-width:150px;">Sub Category</th>');
  for (var m = 0; m < 12; m++) {
    htmlParts.push('<th style="background:#4a5568; color:white; border:1px solid #333; padding:10px 15px; text-align:right;">' + monthNames[m] + '</th>');
  }
  htmlParts.push('<th style="background:#2d3748; color:white; border:1px solid #1a202c; padding:10px 15px; text-align:right;">TOTAL</th>');
  htmlParts.push('</tr></thead><tbody>');
  
  // Data rows
  var rowOrder = [
    { name: 'Service Revenue', display: 'Service Revenue', type: 'expandable' },
    { name: 'Total Labor', display: 'Total Labor', type: 'expandable' },
    { name: 'Benefits & Taxes', display: 'Benefits & Taxes', type: 'data' },
    { name: 'Supplies & Material', display: 'Supplies & Materials', type: 'data' },
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
      bgColor = '#d4edda';
      metricBg = '#c3e6cb';
      totalBg = '#b1dfbb';
      textColor = '#155724';
      fontWeight = 'bold';
      borderStyle = '2px solid #28a745';
    }
    
    htmlParts.push('<tr class="main-row" data-category="' + metric.name + '">');
    htmlParts.push('<td style="background:' + metricBg + '; color:#0f2a4a; font-weight:bold; border:' + borderStyle + '; padding:10px 15px; text-align:left;">');
    
    if (isExpandable) {
      var icon = isExpanded ? '−' : '+';
      htmlParts.push('<span class="expand-toggle" data-category="' + metric.name + '" style="display:inline-block; width:18px; height:18px; background:#4a5568; color:white; text-align:center; line-height:18px; border-radius:3px; margin-right:8px; cursor:pointer; font-weight:bold; font-size:14px;">' + icon + '</span>');
    }
    
    htmlParts.push(metric.display + '</td>');
    htmlParts.push('<td style="background:' + bgColor + '; color:' + textColor + '; border:' + borderStyle + '; padding:10px 15px;"></td>');
    
    var values = totals[metric.name] || derived[metric.name];
    var rowTotal = 0;
    
    for (var m = 0; m < 12; m++) {
      var value = values[m];
      if (metric.name !== 'GCM %') rowTotal += value;
      var cellValue = metric.name === 'GCM %' ? value.toFixed(1) + '%' : formatNum(value);
      htmlParts.push('<td style="background:' + bgColor + '; color:' + textColor + '; font-weight:' + fontWeight + '; border:' + borderStyle + '; padding:10px 15px; text-align:right;">' + cellValue + '</td>');
    }
    
    var totalValue;
    if (metric.name === 'GCM %') {
      var totalRev = 0, totalGCM = 0;
      for (var m = 0; m < 12; m++) {
        totalRev += totals['Service Revenue'][m];
        totalGCM += derived['Gross Contribution Margin'][m];
      }
      totalValue = (totalRev !== 0 ? (totalGCM / totalRev) * 100 : 0).toFixed(1) + '%';
    } else {
      totalValue = formatNum(rowTotal);
    }
    
    htmlParts.push('<td style="background:' + totalBg + '; color:' + textColor + '; font-weight:bold; border:' + borderStyle + '; padding:10px 15px; text-align:right;">' + totalValue + '</td>');
    htmlParts.push('</tr>');
    
    // Subcategory rows
    if (isExpandable && isExpanded && subTotals[metric.name]) {
      var subCats = Object.keys(subTotals[metric.name]).sort();
      for (var s = 0; s < subCats.length; s++) {
        var subCat = subCats[s];
        var subValues = subTotals[metric.name][subCat];
        
        htmlParts.push('<tr class="sub-row" data-parent="' + metric.name + '">');
        htmlParts.push('<td style="background:#f0f4f8; color:#4a5568; border:1px solid #cbd5e0; padding:8px 15px 8px 40px;"></td>');
        htmlParts.push('<td style="background:#f0f4f8; color:#4a5568; border:1px solid #cbd5e0; padding:8px 15px;">' + subCat + '</td>');
        
        var subRowTotal = 0;
        for (var m = 0; m < 12; m++) {
          var subVal = subValues[m];
          subRowTotal += subVal;
          htmlParts.push('<td style="background:#f0f4f8; color:#4a5568; border:1px solid #cbd5e0; padding:8px 15px; text-align:right;">' + formatNum(subVal) + '</td>');
        }
        htmlParts.push('<td style="background:#e2e8f0; color:#4a5568; font-weight:600; border:1px solid #cbd5e0; padding:8px 15px; text-align:right;">' + formatNum(subRowTotal) + '</td>');
        htmlParts.push('</tr>');
      }
    }
    
    rowIndex++;
  }
  
  htmlParts.push('</tbody>');
  
  $('#myTable').html(htmlParts.join(''));
  
  setTimeout(function() {
    initializeSelect2();
  }, 50);
  
  // Event handlers
  $('#myTable').off('click', '.expand-toggle').on('click', '.expand-toggle', function(e) {
    e.stopPropagation();
    var category = $(this).data('category');
    expandedRows[category] = !expandedRows[category];
    buildPLTable();
  });
  
  $('#myTable').off('click', '.source-toggle-btn').on('click', '.source-toggle-btn', function(e) {
    e.stopPropagation();
    currentSource = $(this).data('value');
    buildPLTable();
  });
  
  $('#yearSelect').off('change').on('change', function() {
    currentYear = parseInt($(this).val());
    currentRegions = [];
    currentOpsLeads = [];
    currentParentAccounts = [];
    currentJobs = [];
    buildPLTable();
  });
  
  $('#regionSelect').off('change').on('change', function() {
    var val = $(this).val();
    currentRegions = val ? [val] : [];
    currentOpsLeads = [];
    currentParentAccounts = [];
    currentJobs = [];
    buildPLTable();
  });
  
  $('#opsSelect').off('change').on('change', function() {
    var val = $(this).val();
    currentOpsLeads = val ? [val] : [];
    currentParentAccounts = [];
    currentJobs = [];
    buildPLTable();
  });
  
  $('#clearFilters').off('click').on('click', function() {
    currentRegions = [];
    currentOpsLeads = [];
    currentParentAccounts = [];
    currentJobs = [];
    buildPLTable();
  });
}
