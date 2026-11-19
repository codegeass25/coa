import { $, $$, app, esc, icon, icons, can, date, today, qty, pesos, classifications, modes, button, link, title, panel, badge, empty, options, field, input, select, area, formGrid, employees, tabbar, bindTabs, table, tabFrom, setTab, dialog, post, download, preview, notify, run, api } from './ui.js';

const info = (label, value) => '<div class="info-line"><span class="muted">' + esc(label) + '</span><strong>' + esc(value || '—') + '</strong></div>';
const openStatus = new Set(['APPROVED', 'READY FOR CLAIMING', 'PARTIALLY ISSUED']);
const onAction = (main, handle) => {
  main.onclick = event => {
    const el = event.target.closest('[data-action]');
    if (el && !el.disabled) run(() => handle(el.dataset.action, el.dataset.id, el));
  };
};
export const attr = id => 'data-id="' + esc(id) + '"';
const noStock = row => !row.available ? 'Out of Stock' : row.available <= row.reorder ? 'Low Stock' : 'Normal';

export function dashboard(main, data) {
  const m = data.metrics;
  const cards = [
    ['Consumable Stock', qty(m.stockItems), qty(m.stockUnits) + ' units on hand', 'boxes', 'green'],
    ['Semi-Expendable', qty(m.semi), 'Property items', 'package', 'amber'],
    ['PPE', qty(m.ppe), 'Tracked assets', 'monitor', 'blue'],
    ['Total Inventory Value', pesos(m.value), 'Committed carrying value', 'wallet', 'purple']
  ];
  const metrics = cards.map(([label, value, unit, symbol, color]) => '<article class="metric"><div class="metric-icon ' + color + '">' + icon(symbol) + '</div><div><div class="metric-label">' + label + '</div><div class="metric-value">' + value + '</div><small class="muted">' + unit + '</small></div></article>').join('');
  const summary = [
    ['Pending Requests', m.pending, 'clipboard-list', 'blue'], ['Approved / Ready', m.approved, 'clipboard-check', 'green'], ['Borrowed Equipment', m.borrowed, 'briefcase-business', 'blue'], ['Overdue Returns', m.overdue, 'circle-alert', 'red'], ['Low Stock', m.low, 'triangle-alert', 'amber'], ['Out of Stock', m.out, 'package-x', 'red'], ['Under Repair', m.repair, 'wrench', 'amber'], ['Property Incidents', m.incidents, 'shield-alert', 'red'], ['Open Counts', m.counts, 'scan-line', 'blue'], ['Report Reminders', m.reportReminders, 'calendar-clock', 'blue']
  ].map(([label, val, symbol, tone]) => '<div class="summary-row"><span>' + icon(symbol) + esc(label) + '</span><strong class="' + tone + '">' + qty(val) + '</strong></div>').join('');
  const shortcuts = [
    ['Issue Supplies', 'scanner.html', 'scan-line', 'post', 'blue'], ['Receive Stock', 'scanner.html?mode=RECEIVE', 'package-plus', 'post', 'green'],
    ['Borrow Equipment', 'scanner.html?mode=BORROW', 'briefcase-business', 'post', 'blue'], ['Return Equipment', 'scanner.html?mode=RETURN', 'undo-2', 'post', 'green'],
    ['Generate Reports', 'reports.html', 'files', 'reports', 'purple'], ['Print QR Labels', 'inventory.html?tab=labels', 'qr-code', 'inventory', 'green']
  ].filter(row => can(row[3])).map(([label, href, symbol, , tone], i) => '<a class="quick-action ' + tone + (i === 0 && label === 'Issue Supplies' ? ' quick-primary' : '') + '" href="' + href + '">' + icon(symbol) + '<strong>' + label + '</strong></a>').join('');
  main.innerHTML = title('Dashboard', 'Inventory overview', '<span class="date-chip">' + icon('calendar-days') + date(today()) + '</span>') +
    '<div class="metrics">' + metrics + '</div><div class="dashboard-grid">' +
    panel('Issuances (Last 30 Days)', '<div id="chart"></div>', select('chart-range', [['30', 'Last 30 days'], ['14', 'Last 14 days'], ['7', 'Last 7 days']], '30', undefined, 'aria-label="Chart period"')) +
    panel('Transaction Summary', '<div class="summary-list">' + summary + '</div>') + '</div>' +
    (shortcuts ? '<section class="stack"><h2>Quick Actions</h2><div class="quick-actions">' + shortcuts + '</div></section>' : '') +
    '<div class="dashboard-grid">' + panel('Recent Transactions', '<div id="recent"></div>', can('inventory') || can('approve') ? link('View all', 'transactions.html', 'arrow-right', 'ghost') : '') +
    panel('Backup Status', '<div class="stack">' + info('Last verified backup', date(data.backupDate)) + (app.me.staging ? badge('Local staging', 'amber') : badge('Activated')) + (can('backup') ? link('Manage backups', 'settings.html?tab=backup', 'database-backup', 'secondary') : '') + '</div>') + '</div>';
  const chart = $('#chart', main);
  const drawChart = n => {
    const trend = data.trend.slice(-n);
    const max = Math.max(...trend.map(r => r.count), 4);
    chart.innerHTML = '<div class="chart-area" role="img" aria-label="' + esc(trend.map(r => r.day + ': ' + r.count + ' issuances').join(', ')) + '"><div class="chart-axis"><span>' + max + '</span><span>' + Math.round(max / 2) + '</span><span>0</span></div><div class="chart-bars">' + trend.map((r, i) => '<div class="chart-column" title="' + esc(date(r.day) + ' · ' + r.count + ' issuances') + '"><div class="chart-bar" style="--bar-height:' + (r.count ? r.count / max * 100 : 1) + '%"></div><small>' + ((i % (n > 14 ? 5 : n > 7 ? 2 : 1) === 0 || i === n - 1) ? esc(r.day.slice(5)) : '') + '</small></div>').join('') + '</div></div>';
  };
  const range = $('[name=chart-range]', main);
  range.onchange = () => drawChart(Number(range.value));
  drawChart(30);
  table($('#recent', main), ['Control No.', 'Date', 'Workflow'], data.recent, r => [esc(r.number), date(r.date), esc(modes[r.type] || r.type)], { search: false, empty: 'No posted transactions', details: 'Confirmed postings will appear here.' });
}

function modalSave(titleText, markup, route, onSave, message) {
  dialog(titleText, markup, 'Save', async (data, form) => {
    await post(route, onSave(Object.fromEntries(data), form));
    notify(message);
    await app.refresh();
  });
}
function itemForm(row = {}) {
  return formGrid(
    field('Stock number', input('stockNo', row.stockNo, 'text', 'required maxlength="60"')),
    field('Unit', input('unit', row.unit, 'text', 'required maxlength="30"')),
    field('Description', input('description', row.description, 'text', 'required maxlength="220"')),
    field('Category', input('category', row.category, 'text', 'maxlength="120"')),
    field('Tracking method', select('nature', [['SUPPLY', 'Consumable quantity'], ['PROPERTY', 'Individual property']], row.nature || 'SUPPLY')),
    field('Reorder level', input('reorder', row.reorder || 0, 'number', 'min="0" max="1000000" required')),
    field('Account code', input('accountCode', row.accountCode, 'text', 'maxlength="30"')),
    field('Status', select('active', [['true', 'Active'], ['false', 'Inactive']], String(row.active !== false)))
  );
}
function employeeForm(row = {}, centers = []) {
  return formGrid(
    field('Employee number', input('number', row.number, 'text', 'required maxlength="60"')),
    field('Full name', input('name', row.name, 'text', 'required maxlength="160"')),
    field('Designation', input('designation', row.designation)), field('Department', input('department', row.department)),
    field('Grade level or office', input('office', row.office)),
    field('Responsibility center', input('center', row.center, 'text', 'list="centers"') + '<datalist id="centers">' + centers.map(r => '<option value="' + esc(r.code) + '">' + esc(r.name) + '</option>').join('') + '</datalist>'),
    field('Employment status', select('active', [['true', 'Active'], ['false', 'Inactive']], String(row.active !== false)))
  );
}
async function qrDialog(kind, row) {
  const route = '/qr/' + kind + '/' + row.id;
  const bytes = await api(route, { raw: true });
  const url = URL.createObjectURL(await bytes.blob());
  const form = dialog(row.name || row.description || row.propertyNo, '<div class="qr-card"><img width="160" height="160" src="' + url + '" alt="QR code"><strong>' + esc(row.number || row.stockNo || row.propertyNo) + '</strong><div class="actions">' +
    button('PNG', 'qr-png', 'download', 'secondary') + button('PDF', 'qr-pdf', 'file-text', 'secondary') + button('Print label', 'qr-print', 'printer', 'primary') + '</div></div>');
  $('#dialog').addEventListener('close', () => URL.revokeObjectURL(url), { once: true });
  $('[data-action=qr-png]', form).onclick = () => run(() => download(route, 'QR.png'));
  $('[data-action=qr-pdf]', form).onclick = () => run(() => download('/labels/' + kind + '?format=pdf&ids=' + row.id, 'QR-label.pdf'));
  $('[data-action=qr-print]', form).onclick = () => run(() => preview('/labels/' + kind + '?ids=' + row.id, 'Print QR label'));
}
function bulkLabel(kind, rows) {
  const list = rows.filter(row => row.active !== false && row.status !== 'DISPOSED');
  if (!list.length) { notify('Register an active record before printing labels.', true); return; }
  const form = dialog('Print QR labels', field('Select records (up to 100)', '<select size="8" multiple required name="ids">' + options(list.map(r => [r.id, (r.number || r.stockNo || r.propertyNo) + ' · ' + (r.name || r.description)])) + '</select>') +
    '<p class="muted">Use Ctrl or Command to select multiple rows.</p>', 'Preview labels', async data => {
      const ids = data.getAll('ids');
      if (ids.length > 100) throw Error('Choose up to 100 records.');
      setTimeout(() => run(() => preview('/labels/' + kind + '?ids=' + ids.join(','), 'Print QR labels')), 0);
    });
  form.querySelector('select').focus();
}
export function fileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1]);
    reader.onerror = () => reject(Error('Could not read the selected workbook.'));
    reader.readAsDataURL(file);
  });
}
function importDialog(kind) {
  const form = dialog(kind === 'personnel' ? 'Import personnel' : 'Stage opening balances',
    button('Download import template', 'layout', 'download', 'secondary') +
    '<div class="stack">' + field('Source reference', input('reference', '', 'text', 'required maxlength="130"')) + field('Excel workbook', input('file', '', 'file', 'required accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"'), 'XLSX under 2 MB. Preserve identifier columns as text.') + '</div>',
    'Validate workbook', async data => {
      const file = data.get('file');
      if (!file?.size || file.size > 2 * 1024 * 1024 || !file.name.toLowerCase().endsWith('.xlsx')) throw Error('Choose an XLSX file under 2 MB.');
      const staged = await post('/imports', { kind, file: await fileText(file), reference: data.get('reference') });
      await app.refresh();
      setTimeout(() => submitImport(staged, true), 0);
    });
  $('[data-action=layout]', form).onclick = () => run(() => download('/imports/layout/' + kind, kind + '-import.xlsx'));
}
function submitImport(record, showEntries = false) {
  const entries = record.entries || [];
  const sample = showEntries ? '<ul class="compact">' + entries.slice(0, 12).map(row => '<li>' + esc(row.number || row.stockNo || '') + ' · ' + esc(row.name || row.description || '') + (row.quantity ? ' · ' + qty(row.quantity) : '') + '</li>').join('') + '</ul>' : '';
  dialog('Review validated import', '<p>' + qty(entries.length || record.rows) + ' validated rows.' + (record.kind === 'inventory' ? ' Opening balances require separate approval before posting.' : '') + '</p>' + sample +
    field('Verification reference', input('reference', '', 'text', 'required maxlength="150"')), record.kind === 'inventory' ? 'Submit for approval' : 'Import personnel', async data => {
    await post('/imports/' + record.id + '/submit', { reference: data.get('reference') });
    notify('Import submitted.');
    await app.refresh();
  });
}
function importTable(el, rows) {
  table(el, ['Date', 'Source reference', 'Rows', 'Status', 'Action'], rows, row => [date(row.date), esc(row.reference), qty(row.rows), badge(row.status), row.status === 'VALIDATED' ? button('Review', 'stage', 'clipboard-check', 'secondary small', attr(row.id)) : '—'], { empty: 'No staged imports' });
}
function stockExport(rows) {
  const safe = value => '"' + String(value ?? '').replace(/^[=+@\-\r\n\t]/, "'$&").replaceAll('"', '""') + '"';
  const fields = ['stockNo', 'description', 'category', 'unit', 'available', 'reorder', 'value'];
  const lines = [['Stock Number', 'Description', 'Category', 'Unit', 'On Hand', 'Reorder Level', 'Value (centavos)'], ...rows.map(row => fields.map(field => row[field]))];
  const url = URL.createObjectURL(new Blob(['\ufeff' + lines.map(row => row.map(safe).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = 'inventory.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function inventory(main, data) {
  const canImport = can('import') && can('post');
  const tabs = [['all', 'All Items'], ['supplies', 'Consumables'], ['semi', 'Semi-Expendable'], ['ppe', 'PPE'], ['labels', 'QR Labels'], ...(canImport ? [['imports', 'Imports']] : [])];
  const current = tabFrom(tabs, 'all');
  const items = data.items;
  const rows = current === 'supplies' ? items.filter(row => row.nature === 'SUPPLY') : items;
  const actions = (can('post') ? button('Add Item', 'add', 'plus', 'primary') + link('Receive Stock', 'scanner.html?mode=RECEIVE', 'package-plus', 'secondary') : '') +
    (canImport ? button('Import Excel', 'import', 'upload', 'secondary') : '') + button('Export CSV', 'export', 'download', 'secondary');
  main.innerHTML = title('Inventory Management', 'Item master, stock balances and acquisitions', actions, 'boxes') + panel('', tabbar(tabs, current) + '<div id="record-grid"></div>');
  const grid = $('#record-grid', main);
  if (current === 'imports') importTable(grid, data.imports);
  else if (current === 'labels') {
    grid.innerHTML = '<div class="toolbar">' + button('Print stock QR labels', 'label-stock', 'printer', 'primary') + button('Print property QR labels', 'label-property', 'printer', 'secondary') + '</div><div id="labels-grid"></div>';
    table($('#labels-grid', grid), ['No.', 'Description', 'Tracking', 'QR'], [...items.filter(r => r.nature === 'SUPPLY'), ...data.assets.filter(row => row.status !== 'DISPOSED')], row => [esc(row.stockNo || row.propertyNo), esc(row.description), esc(classifications[row.classification] || 'Consumable'), button('QR', row.propertyNo ? 'asset-qr' : 'item-qr', 'qr-code', 'secondary small', attr(row.id))]);
  } else if (['semi', 'ppe'].includes(current)) {
    table(grid, ['Property No.', 'Description', 'Classification', 'Fund Cluster', 'Location', 'Cost', 'Status', 'Actions'], data.assets.filter(row => (row.classification === 'PPE') === (current === 'ppe')), row => [esc(row.propertyNo), esc(row.description), esc(classifications[row.classification]), esc(row.fund), esc(row.location), pesos(row.cost), badge(row.status), button('QR', 'asset-qr', 'qr-code', 'secondary small', attr(row.id))], { empty: 'No accepted property', details: 'Use Receive Stock to submit an acquisition for inspection and approval.' });
  } else {
    const categories = [...new Set(items.map(row => row.category).filter(Boolean))].sort();
    table(grid, ['Stock No.', 'Item Description', 'Category', 'Unit', 'On Hand', 'Reorder', 'Status', 'Actions'], rows, row => [
      '<strong>' + esc(row.stockNo) + '</strong>', esc(row.description), esc(row.category || (row.nature === 'SUPPLY' ? 'Consumable' : 'Property')), esc(row.unit), row.nature === 'SUPPLY' ? qty(row.available) : qty(row.propertyCount), qty(row.reorder),
      badge(!row.active ? 'Inactive' : row.nature === 'SUPPLY' ? noStock(row) : 'Active'), '<div class="row">' + (row.nature === 'SUPPLY' && row.active ? button('QR', 'item-qr', 'qr-code', 'ghost small', attr(row.id)) : '') + (can('post') ? button('Edit', 'edit', 'pencil', 'ghost small', attr(row.id)) : '') + '</div>'
    ], { placeholder: 'Search item, stock no., or description…', filters: select('category', categories, '', 'All categories', 'aria-label="Category"') + select('stock-status', ['Normal', 'Low Stock', 'Out of Stock', 'Inactive'], '', 'All statuses', 'aria-label="Status"') + select('filter-fund', [...new Set([...data.funds.map(r => r.code), ...items.flatMap(r => r.lots.map(l => l.fund))])], '', 'All fund clusters', 'aria-label="Fund cluster"'),
      filter: (row, c) => (!$('[name=category]', c).value || row.category === $('[name=category]', c).value) && (!$('[name=stock-status]', c).value || $('[name=stock-status]', c).value === (!row.active ? 'Inactive' : row.nature === 'SUPPLY' ? noStock(row) : 'Normal')) && (!$('[name=filter-fund]', c).value || row.lots.some(r => r.fund === $('[name=filter-fund]', c).value) || data.assets.some(r => r.itemId === row.id && r.fund === $('[name=filter-fund]', c).value)),
      empty: 'No inventory items', details: 'Register an item, then record an approved acquisition to establish its balance.' });
  }
  bindTabs(main, key => { setTab(key); inventory(main, data); icons(); });
  onAction(main, async (action, key) => {
    const row = items.find(r => r.id === key);
    if (action === 'add' || action === 'edit') modalSave(row ? 'Edit item' : 'Register inventory item', itemForm(row), '/items', body => ({ ...body, id: row?.id, reorder: Number(body.reorder), active: body.active === 'true' }), 'Item saved.');
    if (action === 'import') importDialog('inventory');
    if (action === 'export') stockExport(rows);
    if (action === 'item-qr') return qrDialog('item', row);
    if (action === 'asset-qr') return qrDialog('asset', data.assets.find(r => r.id === key));
    if (action === 'stage') submitImport(await api('/imports/' + key), true);
    if (action === 'label-stock') bulkLabel('item', items.filter(r => r.nature === 'SUPPLY'));
    if (action === 'label-property') bulkLabel('asset', data.assets);
  });
}
export function personnel(main, data) {
  const tabs = [['employees', 'Employees'], ...(can('import') ? [['imports', 'Imports']] : [])];
  const current = tabFrom(tabs, 'employees');
  main.innerHTML = title('Personnel / Employees', 'Employee records and QR identification', button('Add Employee', 'add', 'plus', 'primary') + (can('import') ? button('Import', 'import', 'upload', 'secondary') : '') + button('Print QR Cards', 'cards', 'printer', 'secondary'), 'users-round') +
    panel('', tabbar(tabs, current) + '<div id="employee-list"></div>');
  const el = $('#employee-list', main);
  if (current === 'imports') importTable(el, data.imports);
  else table(el, ['Emp. No.', 'Full Name', 'Designation', 'Department', 'Status', 'QR', 'Actions'], data.employees, row => [
    '<strong>' + esc(row.number) + '</strong>', '<div class="row"><span class="avatar small">' + esc(row.name.split(/\s+/).slice(0, 2).map(v => v[0]).join('')) + '</span><strong>' + esc(row.name) + '</strong></div>',
    esc(row.designation), esc(row.department), badge(row.active ? 'Active' : 'Inactive'), row.active ? button('QR', 'qr', 'qr-code', 'ghost small', attr(row.id)) : '—',
    '<div class="row">' + button('Edit', 'edit', 'pencil', 'ghost small', attr(row.id)) + (row.active ? button('Rotate QR', 'rotate', 'rotate-ccw', 'ghost small', attr(row.id)) : '') + '</div>'
  ], { placeholder: 'Search employee name or number…', filters: select('dept', [...new Set(data.employees.map(r => r.department).filter(Boolean))], '', 'All departments', 'aria-label="Department"') + select('active', [['true', 'Active'], ['false', 'Inactive']], '', 'All statuses', 'aria-label="Employment status"'),
    filter: (r, c) => (!$('[name=dept]', c).value || $('[name=dept]', c).value === r.department) && (!$('[name=active]', c).value || $('[name=active]', c).value === String(r.active)),
    empty: 'No employees registered', details: 'Add an employee or import an Excel list to assign QR IDs.' });
  bindTabs(main, key => { setTab(key); personnel(main, data); icons(); });
  onAction(main, async (action, key) => {
    const row = data.employees.find(e => e.id === key);
    if (action === 'add' || action === 'edit') modalSave(row ? 'Edit employee' : 'Register employee', employeeForm(row, data.centers), '/employees', body => ({ ...body, id: row?.id, active: body.active === 'true' }), 'Employee saved.');
    if (action === 'import') importDialog('personnel');
    if (action === 'cards') bulkLabel('employee', data.employees);
    if (action === 'qr') return qrDialog('employee', row);
    if (action === 'stage') submitImport(await api('/imports/' + key), true);
    if (action === 'rotate') dialog('Replace employee QR', '<p>The current QR for ' + esc(row.name) + ' will stop identifying this employee. Print a replacement card after rotation.</p>', 'Replace QR', async () => {
      await post('/employees/' + key + '/rotate', {});
      notify('New employee QR generated.');
      await app.refresh();
    });
  });
}

export const txCode = tx => ({ ISSUE: 'RIS', ASSIGN: tx.lines?.some(r => r.classification === 'PPE') ? 'PAR' : 'ICS', BORROW: 'BORROW', RECEIVE: 'IAR', IMPORT: 'IAR', TRANSFER: tx.lines?.some(r => r.classification === 'PPE') ? 'PTR' : 'ITR', PROPERTY_RETURN: tx.lines?.some(r => r.classification === 'PPE') ? 'PRS' : 'RRSP', REPAIR: 'PRE_REPAIR', INCIDENT: 'RLSDDSP', DISPOSE: tx.lines?.some(r => r.classification === 'PPE') ? 'IIRUP' : 'IIRUSP' }[tx.type]);
export function formatActions(code, number, small = true) {
  const labels = [['xlsx', 'XLSX', 'green'], ['pdf', 'PDF', 'red'], ['docx', 'DOCX', 'blue'], ['print', 'Print', 'muted']];
  return '<div class="row report-actions">' + labels.map(([key, label, tone]) => button(label, 'format', key === 'print' ? 'printer' : '', 'secondary ' + tone + (small ? ' small' : ''), 'data-code="' + esc(code) + '" data-number="' + esc(number || '') + '" data-format="' + key + '"')).join('') + '</div>';
}
export async function format(el, filter = '') {
  const params = new URLSearchParams(filter);
  if (el.dataset.number) params.set('number', el.dataset.number);
  const route = '/reports/' + encodeURIComponent(el.dataset.code) + '/' + el.dataset.format + (params.size ? '?' + params : '');
  return el.dataset.format === 'print' ? preview(route, 'Print preview') : download(route, el.dataset.code + '.' + el.dataset.format);
}
export function txDetail(row) {
  const body = '<div class="detail-grid">' + info('Date', date(row.date)) + info('Workflow', modes[row.type]) + info('Employee', row.employee) + info('Fund cluster', row.fund) + info('Purpose', row.purpose) + info('Reference', row.reference) + info('Acknowledgment', row.acknowledgement) + '</div>' +
    '<div class="table-wrap"><table><thead><tr><th>Description</th><th>Quantity</th><th>Total Value</th></tr></thead><tbody>' + row.lines.map(line => '<tr><td>' + esc(line.description || 'Reconciliation') + '</td><td>' + qty(line.quantity) + '</td><td>' + pesos(line.cost) + '</td></tr>').join('') + '</tbody></table></div>' +
    (txCode(row) ? formatActions(txCode(row), row.number, false) : '');
  const form = dialog(row.number, body);
  form.onclick = event => { const el = event.target.closest('[data-action=format]'); if (el) run(() => format(el)); };
}
function reviewRequest(row) {
  const values = row.lines.map((r, i) => '<tr><td>' + esc(r.description || 'Count reconciliation') + '</td><td>' + qty(r.quantity) + '</td>' +
    (row.type === 'ISSUE' ? '<td>' + input('qty-' + i, r.quantity, 'number', 'min="0" max="' + r.quantity + '" required aria-label="Approved quantity"') + '</td>' : '') + '</tr>').join('');
  const form = dialog('Review ' + row.number, '<div class="detail-grid">' + info('Workflow', modes[row.type]) + info('Employee', row.employee) + info('Purpose', row.purpose) + info('Source reference', row.reference) + info('Remarks', row.remarks) + '</div>' + evidenceActions(row) +
    '<div class="table-wrap"><table><thead><tr><th>Item</th><th>Requested</th>' + (row.type === 'ISSUE' ? '<th>Approved</th>' : '') + '</tr></thead><tbody>' + values + '</tbody></table></div>' +
    formGrid(field('Decision', select('decision', [['APPROVE', 'Approve'], ['REJECT', 'Reject']])), field('Approval reference or reason', area('note', '', 'required maxlength="400"'))), 'Record decision', async data => {
    const body = { decision: data.get('decision'), note: data.get('note'), quantities: row.lines.map((r, i) => row.type === 'ISSUE' ? Number(data.get('qty-' + i)) : r.quantity) };
    await post('/requests/' + row.id + '/review', body);
    notify('Decision recorded.');
    await app.refresh();
  });
  bindEvidence(form, row);
}
function evidenceActions(row) {
  if (!row.evidence?.length || !(can('post') || can('approve'))) return '';
  return '<div class="stack"><strong>Supporting documents</strong>' + row.evidence.map(file => button(file.name, 'evidence', 'download', 'secondary small', attr(file.hash))).join('') + '</div>';
}
function bindEvidence(form, row) {
  $$('[data-action=evidence]', form).forEach(el => {
    el.onclick = () => run(() => download('/requests/' + row.id + '/evidence/' + el.dataset.id, 'supporting-document.pdf'));
  });
}
export function postRequest(row, refreshed = app.refresh, employeeCode = '') {
  const requiredId = ['ISSUE', 'BORROW', 'RETURN', 'ASSIGN', 'PROPERTY_RETURN'].includes(row.type);
  const ack = ['ISSUE', 'BORROW', 'RETURN', 'ASSIGN', 'TRANSFER', 'PROPERTY_RETURN'].includes(row.type);
  const grid = row.type === 'ISSUE' ? '<div class="table-wrap"><table><thead><tr><th>Item</th><th>Approved Remaining</th><th>Issue Now</th></tr></thead><tbody>' +
    row.lines.map((r, i) => { const max = r.approved - (r.fulfilled || 0); return '<tr><td>' + esc(r.description) + '</td><td>' + qty(max) + '</td><td>' + input('qty-' + i, max, 'number', 'required min="0" max="' + max + '" aria-label="Issue now"') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '';
  dialog('Post ' + row.number, '<p>Confirm the details against the approved request and the signed receiving or supporting documents.</p>' + grid + '<div class="stack">' +
    (requiredId ? field('Scan employee QR or enter employee number', input('employeeCode', employeeCode, 'text', 'required maxlength="200" autocomplete="off"')) : '') +
    (ack ? field('Signed acknowledgment reference', input('acknowledgement', '', 'text', 'required maxlength="250"')) : '') +
    (row.type === 'ISSUE' ? field('Reason for partial issuance', area('reason', '', 'maxlength="400"')) : '') + '</div>', row.type === 'ISSUE' ? 'Confirm issuance' : 'Confirm posting', async data => {
    const body = { employeeCode: data.get('employeeCode'), acknowledgement: data.get('acknowledgement'), reason: data.get('reason'), quantities: row.type === 'ISSUE' ? row.lines.map((_, index) => Number(data.get('qty-' + index))) : undefined };
    const result = await post('/requests/' + row.id + '/post', body);
    notify('Posted to COA-MASTER.xlsx.');
    if (refreshed) await refreshed();
    setTimeout(() => {
      const details = result.transactions.length ? '<p>The master workbook confirmed the following document numbers.</p><div class="stack">' + result.transactions.map(tx => '<div class="info-line"><strong>' + esc(tx.number) + '</strong>' + (txCode(tx) && can('reports') ? formatActions(txCode(tx), tx.number) : '') + '</div>').join('') + '</div>' : '<p>The master workbook closed this count without an inventory adjustment.</p>';
      const form = dialog('Transaction posted', details +
        (can('post') ? link('New Transaction', 'scanner.html', 'scan-line', 'primary') : ''));
      form.onclick = event => { const el = event.target.closest('[data-action=format]'); if (el) run(() => format(el)); };
    }, 0);
  });
}
export function transactions(main, data) {
  const tabs = [['issuances', 'Issuances (RIS)'], ['requests', 'Requests'], ['borrowing', 'Borrowing'], ['returns', 'Returns'], ['assignments', 'Assignments'], ['transfers', 'Transfers'], ['all', 'All Postings']];
  const current = tabFrom(tabs, 'issuances');
  main.innerHTML = title('Transactions', 'Requests, approvals and inventory postings', can('post') ? link('New Transaction', 'scanner.html', 'plus', 'primary') : '', 'workflow') + panel('', tabbar(tabs, current) + '<div id="transactions-grid"></div>');
  const target = $('#transactions-grid', main);
  if (current === 'requests') {
    table(target, ['Request No.', 'Date', 'Employee', 'Workflow', 'Purpose', 'Status', 'Actions'], data.requests, r => [
      '<strong>' + esc(r.number) + '</strong>', date(r.date), esc(r.employee), esc(modes[r.type]), esc(r.purpose), badge(r.status),
      '<div class="row">' + (r.status === 'PENDING APPROVAL' && can('approve') ? button('Review', 'review', 'clipboard-check', 'primary small', attr(r.id)) : '') +
      (openStatus.has(r.status) && can('post') ? button('Post', 'post', 'check', 'primary small', attr(r.id)) : '') +
      (r.status === 'APPROVED' && ['ISSUE', 'BORROW'].includes(r.type) && can('post') ? button('Mark ready', 'ready', 'package-check', 'ghost small', attr(r.id)) : '') +
      (can('post') && (openStatus.has(r.status) || r.status === 'PENDING APPROVAL') ? button('Cancel', 'cancel', 'x', 'ghost small', attr(r.id)) : '') +
      button('Details', 'request-detail', 'eye', 'ghost small', attr(r.id)) + '</div>'
    ], { filters: select('status', ['PENDING APPROVAL', 'APPROVED', 'READY FOR CLAIMING', 'PARTIALLY ISSUED', 'ISSUED', 'POSTED', 'REJECTED', 'CANCELLED'], '', 'All statuses', 'aria-label="Request status"'), filter: (r, c) => !$('[name=status]', c).value || r.status === $('[name=status]', c).value, empty: 'No requests', details: 'Scanner submissions and teacher requests will appear here.' });
  } else if (current === 'borrowing') {
    table(target, ['Borrowing No.', 'Date', 'Employee', 'Property', 'Due Date', 'Status', 'Actions'], data.borrowings, r => [
      esc(r.number), date(r.date), esc(r.employee), esc(r.property), date(r.due), badge(r.status === 'ACTIVE' && r.due < today() ? 'Overdue' : r.status),
      can('post') && r.status === 'ACTIVE' ? link('Return', 'scanner.html?mode=RETURN', 'undo-2', 'secondary small') + link('Extend', 'scanner.html?mode=EXTEND', 'calendar-plus', 'ghost small') : '—'
    ], { empty: 'No equipment borrowings' });
  } else {
    const types = { issuances: ['ISSUE'], returns: ['RETURN', 'PROPERTY_RETURN'], assignments: ['ASSIGN'], transfers: ['TRANSFER'] }[current];
    const records = data.transactions.filter(r => !types || types.includes(r.type));
    table(target, [current === 'issuances' ? 'RIS No.' : 'Control No.', 'Date', 'Employee', 'Purpose', 'Items', 'Status', 'Actions'], records, row => [
      button(row.number, 'details', '', 'ghost small', attr(row.id)), date(row.date), esc(row.employee), esc(row.purpose), qty(row.lines.length), badge(row.type === 'ISSUE' ? 'Issued' : row.status), '<div class="row">' + button('View', 'details', 'eye', 'ghost small', attr(row.id)) + (can('post') && row.type === 'ISSUE' ? button('Reverse', 'reverse', 'rotate-ccw', 'ghost small', attr(row.id)) : '') + '</div>'
    ], { empty: 'No posted records', details: 'Approved requests appear here after confirmed posting.' });
  }
  bindTabs(main, key => { setTab(key); transactions(main, data); icons(); });
  onAction(main, async (action, key) => {
    const row = data.requests.find(r => r.id === key);
    if (action === 'review') reviewRequest(row);
    if (action === 'post') postRequest(row);
    if (action === 'ready') {
      await post('/requests/' + key + '/status', { status: 'READY FOR CLAIMING' });
      notify('Request is ready for claiming.');
      await app.refresh();
    }
    if (action === 'cancel') dialog('Cancel ' + row.number, field('Reason', area('reason', '', 'required maxlength="400"')), 'Cancel request', async data => {
      await post('/requests/' + key + '/status', { status: 'CANCELLED', reason: data.get('reason') });
      notify('Request cancelled.');
      await app.refresh();
    });
    if (action === 'request-detail') bindEvidence(dialog(row.number, '<div class="detail-grid">' + info('Workflow', modes[row.type]) + info('Employee', row.employee) + info('Purpose', row.purpose) + info('Reference', row.reference) + info('Status', row.status) + info('Remarks', row.remarks) + '</div>' + evidenceActions(row) + '<ul>' + row.lines.map(line => '<li>' + esc(line.description || 'Count reconciliation') + ' · ' + qty(line.quantity) + ' requested' + (line.approved === undefined ? '' : ' · ' + qty(line.approved) + ' approved · ' + qty(line.fulfilled) + ' fulfilled') + '</li>').join('') + '</ul>'), row);
    if (action === 'details') txDetail(data.transactions.find(r => r.id === key));
    if (action === 'reverse') dialog('Request an issuance reversal', field('Correction reason', area('reason', '', 'required maxlength="400"')), 'Submit for approval', async data => {
      await post('/transactions/' + key + '/reverse', { reason: data.get('reason') });
      setTab('requests'); await app.refresh(); notify('Reversal submitted for separate approval.');
    });
  });
}

export function property(main, data) {
  const tabs = [['property', 'Property List'], ['ics', 'ICS Records'], ['par', 'PAR Records'], ['transfers', 'Transfers'], ['repairs', 'Repairs'], ['incidents', 'Incidents'], ['disposals', 'Disposals']];
  const current = tabFrom(tabs, 'property');
  main.innerHTML = title('Property Management', 'Accountability and property lifecycle', (can('post') ? link('Add Property', 'scanner.html?mode=RECEIVE', 'plus', 'primary') + link('Assign Property', 'scanner.html?mode=ASSIGN', 'clipboard-check', 'secondary') : '') + button('QR Labels', 'labels', 'qr-code', 'secondary'), 'clipboard-list') + panel('', tabbar(tabs, current) + '<div id="properties-grid"></div>');
  const target = $('#properties-grid', main);
  if (current === 'property') {
    table(target, ['Property No.', 'Description', 'Classification', 'Cost', 'Custodian', 'Location', 'Status', 'Actions'], data.assets, r => [
      '<strong>' + esc(r.propertyNo) + '</strong>', esc(r.description), esc(classifications[r.classification]), pesos(r.cost), esc(r.custodian || 'Property office'), esc(r.location), badge(r.status === 'AVAILABLE' ? r.condition : r.status),
      '<div class="row">' + (r.status !== 'DISPOSED' ? button('QR', 'qr', 'qr-code', 'ghost small', attr(r.id)) : '') + button('Details', 'asset', 'eye', 'ghost small', attr(r.id)) + '</div>'
    ], { placeholder: 'Search property, description, or custodian…', filters: select('classification', Object.entries(classifications).slice(1), '', 'All classifications', 'aria-label="Classification"') + select('location', [...new Set(data.assets.map(r => r.location))], '', 'All locations', 'aria-label="Location"'),
      filter: (r, c) => (!$('[name=classification]', c).value || r.classification === $('[name=classification]', c).value) && (!$('[name=location]', c).value || r.location === $('[name=location]', c).value),
      empty: 'No property records', details: 'Approved and accepted acquisitions create individually tracked property records.' });
  } else if (['ics', 'par'].includes(current)) {
    table(target, ['Document No.', 'Property No.', 'Employee', 'Date Assigned', 'Location', 'Status', 'Actions'], data.accountability.filter(r => (r.classification === 'PPE') === (current === 'par')), r => [esc(r.number), esc(r.property), esc(r.employee), date(r.date), esc(r.location), badge(r.status), can('reports') ? formatActions(current.toUpperCase(), r.number) : '—'], { empty: 'No accountability records' });
  } else {
    const type = { transfers: ['TRANSFER', 'PROPERTY_RETURN'], repairs: ['REPAIR', 'REPAIR_CLOSE'], incidents: ['INCIDENT'], disposals: ['DISPOSE'] }[current];
    const action = { transfers: ['TRANSFER', 'New transfer'], repairs: ['REPAIR', 'Send for repair'], incidents: ['INCIDENT', 'Record incident'], disposals: ['DISPOSE', 'Request disposal'] }[current];
    target.innerHTML = (can('post') ? '<div class="toolbar">' + link(action[1], 'scanner.html?mode=' + action[0], 'plus', 'primary') + (current === 'repairs' ? link('Complete repair', 'scanner.html?mode=REPAIR_CLOSE', 'wrench', 'secondary') : current === 'transfers' ? link('Return assigned property', 'scanner.html?mode=PROPERTY_RETURN', 'undo-2', 'secondary') : '') + '</div>' : '') + '<div id="movement-grid"></div>';
    table($('#movement-grid', target), ['Control No.', 'Date', 'Workflow', 'Purpose', 'Status', 'Actions'], data.transactions.filter(r => type.includes(r.type)), r => [esc(r.number), date(r.date), esc(modes[r.type]), esc(r.purpose), badge(r.status), button('View', 'movement', 'eye', 'ghost small', attr(r.id))], { empty: 'No posted property movements' });
  }
  bindTabs(main, key => { setTab(key); property(main, data); icons(); });
  onAction(main, async (action, key, el) => {
    if (action === 'labels') bulkLabel('asset', data.assets);
    if (action === 'qr') return qrDialog('asset', data.assets.find(r => r.id === key));
    if (action === 'format') return format(el);
    if (action === 'movement') txDetail(data.transactions.find(r => r.id === key));
    if (action === 'asset') {
      const row = data.assets.find(r => r.id === key);
      dialog(row.propertyNo, '<div class="detail-grid">' + info('Description', row.description) + info('Classification', classifications[row.classification]) + info('Acquired', date(row.acquiredOn)) + info('Value', pesos(row.cost)) + info('Serial number', row.serial) + info('Location', row.location) + info('Custodian', row.custodian) + info('Condition', row.condition) + '</div>');
    }
  });
}
