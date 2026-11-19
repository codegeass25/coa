import { $, $$, app, esc, icon, icons, can, date, today, qty, pesos, classifications, modes, conditions, button, link, title, panel, badge, empty, field, input, select, area, formGrid, employees, tabbar, bindTabs, table, tabFrom, setTab, dialog, post, api, download, preview, notify, run } from './ui.js';
import { attr, formatActions, format, txDetail } from './records.js';
import { startCamera, stopCamera } from './camera.js';

const info = (label, value) => '<div class="info-line"><span class="muted">' + esc(label) + '</span><strong>' + esc(value || '—') + '</strong></div>';
const dispatch = (main, handler) => { main.onclick = event => { const el = event.target.closest('[data-action]'); if (el && !el.disabled) run(() => handler(el.dataset.action, el)); }; };

export function physicalCount(main, data) {
  const { session, lines } = data;
  const step = !session ? 0 : session.status === 'OPEN' ? 1 : session.status === 'REVIEW' ? 2 : 3;
  const steps = '<ol class="steps">' + ['Setup', 'Count (Scan)', 'Reconcile', 'Report'].map((name, i) => '<li class="' + (i === step ? 'active' : i < step ? 'done' : '') + '"><span>' + (i + 1) + '</span>' + name + '</li>').join('') + '</ol>';
  const sessionChoices = select('session', data.sessions.map(r => [r.id, r.number + ' · ' + r.scope]), session?.id, undefined, 'aria-label="Count session"');
  const counted = lines.filter(row => row.actual !== null).length;
  const missing = lines.filter(row => row.actual === null || (row.assetId && row.actual === 0)).length;
  const verified = lines.filter(row => !row.discrepancy).length;
  const scanPanel = session?.status === 'OPEN' ? panel('Scan Property or Stock QR',
    '<div id="count-camera" class="camera-view"><video id="count-video" muted playsinline hidden></video><div class="scan-frame"></div>' +
    '<div class="scan-placeholder">' + icon('scan-line') + '<small>Point the camera at a QR code</small></div></div><div class="row">' + button('Use Camera', 'camera', 'camera', 'primary') +
    button('Manual Entry', 'manual', 'keyboard', 'secondary') + '</div><p class="muted">USB scanner and manual identifiers are supported.</p>') : panel('Reconciliation', session ?
    '<div class="stack">' + badge(session.status) + (session.status === 'REVIEW' ? '<p class="muted">Reconciliation is recorded as a request. An authorized officer reviews it before supply staff post any adjustment.</p>' + link('Open Requests', 'transactions.html?tab=requests', 'clipboard-list', 'secondary') + button('Resubmit Reconciliation', 'review', 'rotate-ccw', 'ghost small') :
      '<p>Use the scoped count reports to review the verified quantities and discrepancies.</p>' + (can('reports') ? link('Open Reports', 'reports.html?countSession=' + session.id, 'files', 'primary') : '')) + '</div>' : empty('No count session open', 'Create a session to snapshot current inventory.'));
  main.innerHTML = title('Physical Inventory Count', 'Scan, verify and reconcile book balances', button('New Count Session', 'new', 'plus', 'primary'), 'clipboard-check') +
    panel('', steps) + (!session ? scanPanel : '<div class="three-col">' +
      panel('Session Info', '<div class="stack">' + info('Session No.', session.number) + info('Scope', session.scope) + info('Book cutoff', date(session.cutoff)) + info('Committee', session.committee) + badge(session.status) + '</div>') +
      scanPanel + panel('Count Summary', '<div class="stack">' + info('Counted', qty(counted)) + info('Verified', qty(verified)) + info('Discrepancies', qty(lines.filter(r => r.discrepancy && r.actual !== null).length)) + info('Missing / uncounted', qty(missing)) + '</div>') + '</div>') +
    (session ? panel('Count Records', '<div id="count-grid"></div>', '<div class="actions">' + sessionChoices + (session.status === 'OPEN' ? button('Unrecorded Property', 'unrecorded', 'plus', 'secondary') + button('Submit Reconciliation', 'review', 'clipboard-check', 'primary') : '') + '</div>') : '');
  if (session) {
    table($('#count-grid', main), ['Identifier', 'Description', 'Class', 'Book', 'Actual', 'Location', 'Status', 'Action'], lines, r => [
      esc(r.propertyNo || r.stockNo), esc(r.description), esc(classifications[r.classification] || 'Unrecorded'), qty(r.expected), r.actual === null ? '—' : qty(r.actual), esc(r.location || r.bookLocation || '—'), badge(r.actual === null ? 'Uncounted' : r.discrepancy ? 'Discrepancy' : 'Verified'),
      session.status === 'OPEN' ? button(r.actual === null ? 'Count' : 'Correct', 'line', 'clipboard-pen-line', 'secondary small', attr(r.id)) : '—'
    ], { empty: 'No count lines', placeholder: 'Search identifier, description or location…' });
    $('[name=session]', main).onchange = event => { const url = new URL(location.href); url.searchParams.set('session', event.target.value); history.replaceState(null, '', url); app.refresh(); };
  }
  function submitLine(row, code, unrecorded = false) {
    const heading = unrecorded ? 'Record unlisted property' : 'Count ' + (row?.description || 'stock or property');
    dialog(heading, formGrid(
      ...(unrecorded ? [field('Identifier', input('identifier', '', 'text', 'required maxlength="80"')), field('Description', input('description', '', 'text', 'required maxlength="180"'))] : []),
      field('Counted quantity', input('actual', row?.actual ?? (row?.assetId || unrecorded ? 1 : row?.expected ?? 0), 'number', 'required min="0" max="' + (row?.assetId ? 1 : 1000000) + '"')),
      field('Actual location', input('location', row?.location ?? row?.bookLocation, 'text')),
      field('Condition', select('condition', conditions, row?.condition || row?.bookCondition || (row?.assetId || unrecorded ? 'Serviceable' : ''), 'Choose condition')),
      field('Actual custodian', select('employeeId', employees(data.employees), row?.employeeId ?? row?.bookEmployeeId, 'Property office / none')),
      ...(!row || unrecorded ? [field('Fund cluster', input('fund', '', 'text', 'list="count-funds"') + '<datalist id="count-funds">' + data.funds.map(r => '<option value="' + esc(r.code) + '"></option>').join('') + '</datalist>')] : []),
      field(row?.actual != null || unrecorded ? 'Remarks (required)' : 'Remarks', area('remarks', row?.remarks, (row?.actual != null || unrecorded ? 'required ' : '') + 'maxlength="400"'))
    ), 'Record count', async fd => {
      await post('/counts/' + session.id + '/lines', { ...Object.fromEntries(fd), code, lineId: row?.id, unrecorded, correction: row?.actual != null, actual: Number(fd.get('actual')), fund: row?.fund || fd.get('fund') });
      notify('Count recorded.');
      await app.refresh();
    });
  }
  async function decode(code) {
    const result = await api('/lookup', { method: 'POST', body: { code, kind: 'ITEMS' } });
    if (result.type === 'EMPLOYEES') throw Error('Scan a stock or property QR for this count.');
    const matches = lines.filter(r => result.type === 'ASSETS' ? r.assetId === result.record.id : !r.assetId && r.itemId === result.record.id);
    if (!matches.length) throw Error('This inventory record is outside the selected count scope.');
    if (matches.length > 1) {
      dialog('Choose fund cluster', field('Fund cluster', select('line', matches.map(r => [r.id, r.fund]), '', 'Select fund cluster', 'required')), 'Continue', async d => { setTimeout(() => submitLine(matches.find(r => r.id === d.get('line')), code), 0); });
    } else {
      if (matches[0].actual !== null) throw Error('This item is already counted. Open Correct to change the observation.');
      submitLine(matches[0], code);
    }
  }
  dispatch(main, async (action, el) => {
    if (action === 'new') dialog('Start a physical inventory count', formGrid(
      field('Session scope', input('scope', '', 'text', 'required maxlength="120" placeholder="School, building, room, office or department"')),
      field('Committee members', input('committee', '', 'text', 'required maxlength="250"')),
      field('Filter by location', input('location')), field('Filter by fund cluster', select('fund', data.funds.map(r => [r.code, r.code + ' · ' + r.name]), '', 'All funds')),
      field('Filter by classification', select('classification', Object.entries(classifications), '', 'All classifications'))
    ), 'Start count', async fd => {
      const row = await post('/counts', Object.fromEntries(fd));
      const url = new URL(location.href); url.searchParams.set('session', row.id); history.replaceState(null, '', url);
      await app.refresh(); notify(row.number + ' opened.');
    });
    if (action === 'line') submitLine(lines.find(r => r.id === el.dataset.id));
    if (action === 'unrecorded') submitLine(null, undefined, true);
    if (action === 'review') dialog('Submit reconciliation', '<p>The system preserves the original book snapshot and all discrepancies. Adjustments require a separate approval.</p>' +
      field('Reconciliation recommendation', area('reason', '', 'required maxlength="500"')), 'Submit for approval', async fd => {
      await post('/counts/' + session.id + '/review', { reason: fd.get('reason') });
      notify('Reconciliation submitted for approval.'); await app.refresh();
    });
    if (action === 'manual') dialog('Scan or enter inventory identifier', field('QR or identifier', input('code', '', 'text', 'required autocomplete="off" maxlength="200"')), 'Find item', async fd => {
      const code = fd.get('code');
      setTimeout(() => run(() => decode(code)), 0);
    });
    if (action === 'camera') {
      const video = $('#count-video', main);
      const placeholder = $('.scan-placeholder', main);
      const reset = () => { stopCamera(video); video.hidden = true; placeholder.hidden = false; app.dirty = false; };
      if (video.srcObject) { reset(); return; }
      video.hidden = false;
      placeholder.hidden = true;
      app.dirty = true;
      try { await startCamera(video, code => { reset(); run(() => decode(code)); }, { onError: error => { reset(); notify(error.message, true); } }); }
      catch (error) { reset(); throw error; }
    }
  });
}

export function reports(main, entries) {
  const categories = [...new Set(entries.map(r => r.category))];
  const countSession = new URLSearchParams(location.search).get('countSession') || '';
  const filters = formGrid(field('Report Category', select('category', categories, '', 'All Reports')),
    field('From', input('from', '', 'date')), field('To', input('to', '', 'date')),
    field('Report / Form', select('selected', entries.map(r => [r.code, r.name]), '', 'Choose report…')));
  const extra = '<details class="filter-details"><summary>More filters</summary>' + formGrid(
    field('Month', input('month', '', 'month')), field('Quarter', select('quarter', ['1', '2', '3', '4'], '', 'Any quarter')),
    field('Calendar year', input('year', '', 'number', 'min="1900" max="2099"')), field('Document number', input('number')),
    field('Employee name or number', input('employee')), field('Department', input('department')), field('Office / grade level', input('office')),
    field('Item / stock number', input('item')), field('Location', input('location')), field('Classification', select('classification', Object.entries(classifications), '', 'All classifications')),
    field('Fund cluster', input('fund')), field('Status', input('status')), field('Count session ID', input('countSession', countSession))
  ) + '</details>';
  main.innerHTML = title('Reports (COA and DepEd Forms)', 'Generate documents from committed inventory records', (can('audit') ? button('Audit History', 'audit', 'shield-check', 'secondary') : ''), 'files') +
    panel('', '<form id="report-filters" class="stack">' + filters + extra + '<div class="actions"><button type="submit" class="btn primary">' + icon('file-check-2') + 'Generate Preview</button>' + button('Batch Print', 'batch', 'printer', 'secondary') + '</div></form>') +
    panel('', '<div id="report-list"></div>');
  const filterForm = $('#report-filters', main);
  const detail = $('#report-list', main);
  function filtersQuery() {
    const data = Object.fromEntries(new FormData(filterForm));
    if (data.from && data.to && data.from > data.to) throw Error('The start date must be on or before the end date.');
    if (data.month && !data.from && !data.to) data.period = data.month;
    if (!data.month && data.year && data.quarter) data.period = data.year + '-Q' + data.quarter;
    if (!data.month && data.year && !data.quarter) data.period = data.year;
    const omitted = new Set(['selected', 'category', 'month', 'year', 'quarter']);
    return new URLSearchParams(Object.entries(data).filter(([key, value]) => value && !omitted.has(key))).toString();
  }
  function draw() {
    const category = filterForm.elements.category.value;
    const list = entries.filter(r => !category || r.category === category);
    const value = filterForm.elements.selected.value;
    filterForm.elements.selected.innerHTML = '<option value="">Choose report…</option>' + list.map(r => '<option value="' + esc(r.code) + '">' + esc(r.name) + '</option>').join('');
    if (list.some(r => r.code === value)) filterForm.elements.selected.value = value;
    table(detail, ['Report / Form', 'Description', 'Actions'], list, row => [
      '<strong>' + esc(row.name) + '</strong><small class="muted table-sub">' + esc(row.category) + (row.reviewRequired ? ' · Approval required for official use' : '') + '</small>', esc(row.description), formatActions(row.code, '')
    ], { placeholder: 'Find a report or form…', pageSize: 14, empty: 'No reports match' });
  }
  draw();
  filterForm.elements.category.onchange = draw;
  filterForm.onsubmit = event => {
    event.preventDefault();
    run(async () => {
      const code = filterForm.elements.selected.value;
      if (!code) throw Error('Choose a report to generate.');
      await preview('/reports/' + code + '/print?' + filtersQuery(), 'Report preview');
    });
  };
  dispatch(main, async (action, el) => {
    if (action === 'format') return format(el, filtersQuery());
    if (action === 'batch') dialog('Batch print reports', field('Forms (up to 8)', '<select name="reports" multiple size="9" required>' + entries.map(r => '<option value="' + esc(r.code) + '">' + esc(r.name) + '</option>').join('') + '</select>') + '<p class="muted">Hold Ctrl or Command to select multiple reports.</p>', 'Prepare print view', async fd => {
      const list = fd.getAll('reports');
      if (list.length > 8) throw Error('Select no more than 8 reports.');
      const query = filtersQuery();
      const fetched = await Promise.all(list.map(async code => {
        const response = await api('/reports/' + code + '/print?' + query, { raw: true });
        return new DOMParser().parseFromString(await response.text(), 'text/html');
      }));
      const printable = fetched.map(doc => (doc.head.querySelector('style')?.outerHTML || '') + '<section class="print-document">' + doc.body.innerHTML + '</section>').join('');
      const blob = URL.createObjectURL(new Blob(['<!doctype html><meta charset="utf-8"><title>COA Batch Print</title><style>.print-document:not(:last-child){break-after:page}</style>' + printable], { type: 'text/html' }));
      setTimeout(() => {
        const form = dialog('Batch print preview', '<iframe class="report-preview" title="Batch print preview" sandbox="allow-same-origin allow-modals" src="' + blob + '"></iframe>', 'Print reports', () => { $('iframe', form).contentWindow.print(); return false; });
        $('#dialog').classList.add('wide');
        $('#dialog').addEventListener('close', () => URL.revokeObjectURL(blob), { once: true });
      }, 0);
    });
    if (action === 'audit') {
      const audit = await api('/audit');
      const form = dialog('Audit history', '<div id="audit-grid"></div>');
      $('#dialog').classList.add('wide');
      table($('#audit-grid', form), ['Date', 'Actor', 'Action', 'Record', 'Reason'], [...audit.workbook, ...audit.accounts.map(r => ({ ...r, date: r.time, userId: r.actor, record: JSON.parse(r.detail).username || '' }))], r => [date(r.date), esc(r.userId), esc(r.action), esc(r.record), esc(r.reason)], { empty: 'No audit records' });
    }
  });
}

function configSave(fields, toBody) {
  dialog('Save configuration', fields + field('Reason for change', area('reason', '', 'required maxlength="400"')), 'Save changes', async data => {
    await post('/settings', { ...toBody(data), reason: data.get('reason') });
    notify('Configuration saved.'); await app.refresh();
  });
}
export function settings(main, data) {
  const tabs = [['general', 'General'], ['roles', 'Users & Roles'], ['numbering', 'Document Numbering'], ['funds', 'Fund Clusters'], ['centers', 'Departments'], ['suppliers', 'Suppliers'], ['packages', 'Supply Packages'], ['backup', 'Backup']];
  const current = tabFrom(tabs, 'numbering');
  const general = data.general;
  main.innerHTML = title('System Settings', 'Manage access, numbering, school directories and backups', data.staging ? badge('Local staging', 'amber') : badge('Activated', 'green'), 'settings') +
    panel('', tabbar(tabs, current) + '<div id="setting-panel"></div>');
  const target = $('#setting-panel', main);
  if (current === 'general') target.innerHTML = '<div class="setting-header"><h2>School Configuration</h2>' + button('Edit', 'general', 'pencil', 'primary') + button('Report Reminders', 'report-reminders', 'calendar-clock', 'secondary') + '</div><div class="detail-grid">' +
    info('School name', general.school) + info('Local time zone', 'Asia/Manila') + info('Purpose presets', general.purposes.join(', ')) + info('Distribution headings', general.distribution.join(', ')) + info('Posting period closed through', date(general.closedThrough)) + '</div>';
  if (current === 'numbering') {
    target.innerHTML = '<div class="setting-header"><h2>Document Numbering Configuration</h2>' + button('Edit prefixes', 'prefixes', 'pencil', 'primary') + '</div><div id="number-grid"></div>';
    const year = today().slice(0, 4);
    const labels = { RIS: 'Requisition and Issue Slip', 'ICS-LV': 'ICS (Low-Value)', 'ICS-HV': 'ICS (High-Value)', PAR: 'Property Acknowledgement Receipt', ITR: 'Inventory Transfer Report', PTR: 'Property Transfer Report', BOR: 'Equipment Borrowing', RET: 'Equipment Return', ACQ: 'Acquisition', IAR: 'Inspection and Acceptance', DIS: 'Disposal', RRSP: 'Receipt of Returned Semi-Expendable Property', PRS: 'Property Return Slip' };
    table($('#number-grid', target), ['Document Type', 'Prefix', 'Series (Year)', 'Next No.'], data.documents.map(code => ({ code, name: labels[code] || code, prefix: general.prefixes[code] || code, year, next: data.numbers.find(r => r.type === code && r.year === year)?.next || 1 })), r => [esc(r.name), esc(r.prefix), esc(r.year), String(r.next).padStart(4, '0')], { pageSize: 12, placeholder: 'Search numbering sequences…' });
  }
  if (current === 'roles') {
    target.innerHTML = '<div class="setting-header"><h2>User Accounts</h2>' + button('Add Account', 'account', 'user-plus', 'primary') + button('Role Permissions', 'permissions', 'shield-check', 'secondary') + '</div><div id="accounts-grid"></div>';
    table($('#accounts-grid', target), ['Username', 'Role Assignments', 'Employee Record', 'Status', 'Actions'], data.accounts, r => [esc(r.username), esc(r.roles.map(role => data.roleNames[role]).join(', ')), esc(data.employees.find(e => e.id === r.employeeId)?.name || '—'), badge(r.active ? 'Active' : 'Inactive'), button('Edit / Reset', 'account', 'pencil', 'secondary small', attr(r.id))]);
  }
  const directories = { funds: ['FUND_CLUSTERS', 'Fund cluster'], centers: ['RESPONSIBILITY_CENTERS', 'Responsibility center'], suppliers: ['SUPPLIERS', 'Supplier'] };
  if (directories[current]) {
    target.innerHTML = '<div class="setting-header"><h2>' + esc(directories[current][1]) + ' Directory</h2>' + button('Add Record', 'directory', 'plus', 'primary') + '</div><div id="dir-grid"></div>';
    table($('#dir-grid', target), ['Code', 'Name', 'Status', 'Actions'], data[current], r => [esc(r.code), esc(r.name), badge(r.active ? 'Active' : 'Inactive'), button('Edit', 'directory', 'pencil', 'secondary small', attr(r.id))]);
  }
  if (current === 'packages') {
    target.innerHTML = '<div class="setting-header"><h2>Supply Packages</h2>' + button('Add Package', 'package', 'package-plus', 'primary') + '</div><div id="package-grid"></div>';
    table($('#package-grid', target), ['Name', 'Items', 'Status', 'Actions'], data.packages, r => [esc(r.name), qty(r.lines.length), badge(r.active ? 'Active' : 'Inactive'), button('Edit', 'package', 'pencil', 'secondary small', attr(r.id))], { empty: 'No supply packages defined' });
  }
  if (current === 'backup') {
    target.innerHTML = '<div class="setting-header"><h2>Backups and Recovery</h2>' + button('Create Backup', 'backup', 'database-backup', 'primary') + button('Download Master Copy', 'master', 'download', 'secondary') + button('Schedule', 'schedule', 'calendar-clock', 'secondary') + '</div><div class="detail-grid">' +
      info('Automatic frequency', 'Every ' + general.backupIntervalHours + ' hours') + info('Retention', general.retentionDays + ' days') + '</div><div id="backup-grid"></div>';
    table($('#backup-grid', target), ['Backup file', 'Created', 'Size', 'Action'], data.backups, r => [esc(r.name), date(r.date), qty(Math.round(r.bytes / 1024)) + ' KB', button('Verify & Download', 'backup-download', 'download', 'secondary small', attr(r.name))], { empty: 'No backups yet' });
  }
  bindTabs(main, key => { setTab(key); settings(main, data); icons(); });
  dispatch(main, async (action, el) => {
    const key = el.dataset.id;
    if (action === 'report-reminders') configSave(field('One report per line', area('reminders', (general.reportReminders || []).map(r => r.title + ' | ' + r.due).join('\n')), 'Enter the report name and due date in the format Report name | YYYY-MM-DD. Remove completed reminders.'), f => ({
      reportReminders: String(f.get('reminders')).split(/\n/).map(s => s.trim()).filter(Boolean).map(s => { const [name, due] = s.split('|'); return { title: name.trim(), due: due?.trim() || '' }; })
    }));
    if (action === 'general') configSave(formGrid(field('School name', input('school', general.school, 'text', 'required maxlength="150"')), field('Close posting through', input('closedThrough', general.closedThrough, 'date', 'max="' + today() + '"'), 'Closing is permanent and can only move forward.'),
      field('Purpose presets (one per line)', area('purposes', general.purposes.join('\n'), 'required')), field('Distribution headings (one per line)', area('distribution', general.distribution.join('\n')))), f => ({
      school: f.get('school'), closedThrough: f.get('closedThrough') || undefined, purposes: String(f.get('purposes')).split(/\n/).map(s => s.trim()).filter(Boolean), distribution: String(f.get('distribution')).split(/\n/).map(s => s.trim()).filter(Boolean)
    }));
    if (action === 'prefixes') configSave(formGrid(...data.documents.map(code => field(code, input('prefix-' + code, general.prefixes[code] || code, 'text', 'required maxlength="15" pattern="[A-Z][A-Z0-9-]{0,14}"')))), f => ({ prefixes: Object.fromEntries(data.documents.map(code => [code, f.get('prefix-' + code)])) }));
    if (action === 'account') {
      const row = data.accounts.find(r => r.id === key);
      dialog(row ? 'Edit or recover user account' : 'Create user account', formGrid(
        field('Username', input('username', row?.username, 'text', 'required minlength="3" maxlength="75" autocomplete="off"' + (row ? ' readonly' : ''))),
        field('Temporary password', input('password', '', 'password', 'minlength="12" maxlength="128" autocomplete="new-password"' + (row ? '' : ' required')), row ? 'Leave blank to preserve the existing password.' : 'The user must replace this password at first sign-in.'),
        field('Employee record', select('employeeId', employees(data.employees), row?.employeeId, 'No linked employee')),
        field('Status', select('active', [['true', 'Active'], ['false', 'Inactive']], String(row ? Boolean(row.active) : true))),
        field('Assigned roles', '<select multiple name="roles" size="7" required>' + Object.entries(data.roleNames).map(([id, label]) => '<option value="' + id + '"' + (row?.roles.includes(id) ? ' selected' : '') + '>' + esc(label) + '</option>').join('') + '</select>', 'Hold Ctrl or Command for multiple roles.')
      ), 'Save account', async fd => {
        await api('/accounts', { method: 'POST', body: { username: fd.get('username'), password: fd.get('password'), active: fd.get('active') === 'true', employeeId: fd.get('employeeId'), roles: fd.getAll('roles') } });
        notify('Account saved.'); await app.refresh();
      });
    }
    if (action === 'permissions') configSave('<p>Superadmin, Teacher and Auditor retain their required baseline permissions.</p>' + formGrid(
      ...['SUPPLY', 'APPROVER', 'ACCOUNTING', 'COMMITTEE'].map(role => field(data.roleNames[role], '<select name="' + role + '" multiple size="8">' + data.capabilities.filter(x => !['account', 'configure', 'backup'].includes(x)).map(cap => '<option value="' + esc(cap) + '"' + ((general.permissions[role] || data.roles[role]).includes(cap) ? ' selected' : '') + '>' + esc(cap) + '</option>').join('') + '</select>'))
    ), f => ({ permissions: Object.fromEntries(['SUPPLY', 'APPROVER', 'ACCOUNTING', 'COMMITTEE'].map(role => [role, f.getAll(role)])) }));
    if (action === 'directory') {
      const [kind, label] = directories[current];
      const row = data[current].find(r => r.id === key);
      dialog((row ? 'Edit ' : 'Add ') + label.toLowerCase(), formGrid(field('Code', input('code', row?.code, 'text', 'required maxlength="45"' + (row ? ' readonly' : ''))), field('Name', input('name', row?.name, 'text', 'required maxlength="140"')),
        field('Status', select('active', [['true', 'Active'], ['false', 'Inactive']], String(row?.active !== false)))), 'Save record', async fd => {
        const values = Object.fromEntries(fd);
        await post('/directories/' + kind, { ...values, active: values.active === 'true' });
        await app.refresh(); notify('Directory record saved.');
      });
    }
    if (action === 'package') {
      if (!data.itemOptions.length) throw Error('Register a consumable item before defining a supply package.');
      const row = data.packages.find(r => r.id === key);
      const form = dialog(row ? 'Edit supply package' : 'New supply package', formGrid(field('Package name', input('name', row?.name, 'text', 'required maxlength="120"')),
        field('Status', select('active', [['true', 'Active'], ['false', 'Inactive']], String(row?.active !== false)))) + '<div id="package-lines" class="stack"></div>' + button('Add line', 'new-line', 'plus', 'secondary'), 'Save package', async fd => {
        const rows = fd.getAll('item').map((itemId, i) => ({ itemId, quantity: Number(fd.getAll('quantity')[i]) }));
        await post('/packages', { id: row?.id, name: fd.get('name'), active: fd.get('active') === 'true', lines: rows });
        notify('Package saved.'); await app.refresh();
      });
      const list = $('#package-lines', form);
      const add = (line = {}) => {
        if (list.children.length >= 40) { notify('A package can include up to 40 lines.', true); return; }
        const el = document.createElement('div');
        el.className = 'row';
        el.innerHTML = select('item', data.itemOptions.map(i => [i.id, i.description]), line.itemId, 'Select item', 'required aria-label="Package item"') + input('quantity', line.quantity || 1, 'number', 'required min="1" max="100000" aria-label="Package quantity"') + button('Remove', 'remove-line', 'x', 'ghost icon-btn', 'aria-label="Remove line"');
        $('[data-action=remove-line]', el).onclick = () => { if (list.children.length > 1) el.remove(); };
        list.append(el); icons();
      };
      (row ? row.lines : [{}]).forEach(add);
      $('[data-action=new-line]', form).onclick = () => add();
    }
    if (action === 'backup') {
      el.disabled = true;
      try { await api('/backups', { method: 'POST' }); notify('Verified backup created.'); await app.refresh(); } finally { el.disabled = false; }
    }
    if (action === 'master') return download('/master-copy', 'COA-MASTER-copy.xlsx');
    if (action === 'backup-download') return download('/backups/' + key, key);
    if (action === 'schedule') configSave(formGrid(field('Frequency in hours', input('hours', general.backupIntervalHours, 'number', 'required min="1" max="168"')), field('Retention in days', input('days', general.retentionDays, 'number', 'required min="2" max="365"'))), f => ({ backupIntervalHours: Number(f.get('hours')), retentionDays: Number(f.get('days')) }));
  });
}

export async function teacher(main, data) {
  const emp = data.employee;
  const tabs = [['home', 'My Dashboard'], ['requests', 'My Requests'], ['issuances', 'My Issuances'], ['borrowings', 'My Borrowings'], ['properties', 'My Properties'], ['qr', 'My QR Code'], ['documents', 'My Documents']];
  const current = tabFrom(tabs, 'home');
  const quick = [
    ['Request Supplies', 'supply', 'package-plus', 'blue'], ['Borrow Equipment', 'borrow', 'briefcase-business', 'green'],
    ['My Issuances', 'issuances', 'package-check', 'blue'], ['My Borrowings', 'borrowings', 'calendar-clock', 'blue'],
    ['My Properties', 'properties', 'monitor', 'purple'], ['My Documents', 'documents', 'files', 'purple']
  ];
  const controls = button('Request Supplies', 'supply', 'plus', 'primary') + button('Borrow Equipment', 'borrow', 'briefcase-business', 'secondary');
  main.innerHTML = title(current === 'home' ? 'My Dashboard' : tabs.find(r => r[0] === current)[1], 'Teacher Portal', ['requests', 'borrowings'].includes(current) ? controls : '', 'contact-round') +
    (current === 'home' ? '<div class="portal-grid">' +
      panel('', '<div class="teacher-identity"><span class="avatar large">' + esc(emp.name.split(/\s+/).slice(0, 2).map(s => s[0]).join('')) + '</span><div><h2>Good day, ' + esc(emp.name.split(/\s+/)[0]) + '!</h2><p>Employee No. ' + esc(emp.number) + '</p><p class="muted">' + esc([emp.office, emp.department].filter(Boolean).join(' · ')) + '</p></div></div>') +
      panel('My Employee QR', '<div class="qr-card"><img id="employee-qr" width="145" height="145" alt="Your employee QR code"><div class="row">' + button('Download', 'qr-file', 'download', 'primary small') + '</div></div>') + '</div><div class="quick-actions">' +
      quick.map(([label, id, symbol, tone]) => ['supply', 'borrow'].includes(id) ? '<button class="quick-action ' + tone + '" data-action="' + id + '" type="button">' + icon(symbol) + '<strong>' + label + '</strong></button>' : '<a class="quick-action ' + tone + '" href="teacher.html?tab=' + id + '">' + icon(symbol) + '<strong>' + label + '</strong></a>').join('') +
      '</div>' + panel('Recent Activity', '<div id="teacher-grid"></div>') : current === 'qr' ? panel('Employee Identification', '<div class="qr-card"><img id="employee-qr" width="210" height="210" alt="Your employee QR code"><strong>' + esc(emp.name) + '</strong><span>' + esc(emp.number) + '</span><div class="actions">' + button('Download PNG', 'qr-file', 'download', 'primary') + button('Download PDF', 'qr-pdf', 'file-text', 'secondary') + button('Print', 'qr-print', 'printer', 'secondary') + '</div></div>') :
      panel('', '<div id="teacher-grid"></div>'));
  const out = $('#teacher-grid', main);
  const myAssets = data.accountability.filter(r => r.status === 'ACTIVE');
  const myBorrows = data.borrowings.filter(r => r.status === 'ACTIVE');
  if (current === 'home') {
    const activity = [...data.requests.map(r => ({ ...r, name: r.type === 'ISSUE' ? 'Supply Request' : 'Borrowing Request' })), ...data.transactions.map(r => ({ ...r, name: modes[r.type] }))].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
    table(out, ['Activity', 'Date', 'Status'], activity, r => [esc(r.name) + ' <span class="muted">(' + esc(r.number) + ')</span>', date(r.date), badge(r.status)], { search: false, pageSize: 6, empty: 'No recent activity', details: 'Your requests, issuances and borrowing will appear here.' });
  }
  if (current === 'requests') table(out, ['Request No.', 'Date', 'Workflow', 'Purpose', 'Status', 'Action'], data.requests, r => [
    esc(r.number), date(r.date), esc(modes[r.type]), esc(r.purpose), badge(r.status), button('View', 'request-detail', 'eye', 'secondary small', attr(r.id)) + (['PENDING APPROVAL', 'APPROVED', 'READY FOR CLAIMING', 'PARTIALLY ISSUED'].includes(r.status) ? button('Cancel', 'cancel', 'x', 'ghost small', attr(r.id)) : '')
  ], { empty: 'No requests yet' });
  if (current === 'issuances') table(out, ['RIS No.', 'Issued', 'Purpose', 'Items', 'Actions'], data.transactions.filter(r => r.type === 'ISSUE'), r => [esc(r.number), date(r.date), esc(r.purpose), qty(r.lines.length), button('View', 'tx-detail', 'eye', 'secondary small', attr(r.id))], { empty: 'No supply issuances yet' });
  if (current === 'borrowings') table(out, ['Borrowing No.', 'Property', 'Borrowed', 'Expected Return', 'Returned', 'Status'], data.borrowings, r => [esc(r.number), esc(r.propertyNo + ' · ' + r.asset), date(r.date), date(r.due), date(r.closedOn), badge(r.status === 'ACTIVE' && r.due < today() ? 'Overdue' : r.status)], { empty: 'No equipment borrowed' });
  if (current === 'properties') {
    out.innerHTML = '<div class="detail-grid">' + info('Active property accountability', qty(myAssets.length)) + info('Active equipment borrowing', qty(myBorrows.length)) + info('Clearance status', myAssets.length || myBorrows.length ? 'Outstanding accountability' : 'No open accountability on record') + '</div><div id="teacher-assets"></div>';
    table($('#teacher-assets', out), ['Document No.', 'Property', 'Assigned', 'Location', 'Status'], data.accountability, r => [esc(r.number), esc(r.propertyNo + ' · ' + r.asset), date(r.date), esc(r.location), badge(r.status)], { empty: 'No property accountability records' });
  }
  if (current === 'documents') {
    const docs = [
      ...data.transactions.filter(r => ['ISSUE', 'BORROW'].includes(r.type)).map(r => ({ ...r, code: r.type === 'ISSUE' ? 'RIS' : 'BORROW' })),
      ...data.accountability.map(r => ({ ...r, code: r.classification === 'PPE' ? 'PAR' : 'ICS' }))
    ];
    table(out, ['Document No.', 'Type', 'Date', 'Downloads'], docs, r => [esc(r.number), esc(r.code), date(r.date), formatActions(r.code, r.number)], { empty: 'No personal documents' });
  }
  const qrRoute = '/qr/employee/' + emp.id;
  const img = $('#employee-qr', main);
  if (img) {
    api(qrRoute, { raw: true }).then(async response => {
      if (!img.isConnected) return;
      const url = URL.createObjectURL(await response.blob());
      img.onload = () => URL.revokeObjectURL(url);
      img.src = url;
    }).catch(error => { if (img.isConnected) { img.hidden = true; notify(error.message, true); } });
  }
  function requestModal(type) {
    const supply = type === 'ISSUE';
    const available = supply ? data.catalog.filter(i => i.available > 0).map(i => [i.id, i.description + ' · ' + qty(i.available) + ' in stock']) : data.equipment.map(i => [i.id, i.propertyNo + ' · ' + i.description]);
    if (!available.length) { notify(supply ? 'There are no available consumables at this time.' : 'There is no available equipment to request.', true); return; }
    const form = dialog(supply ? 'Request supplies' : 'Request equipment', '<div id="request-lines" class="stack"></div>' + button('Add line', 'add-line', 'plus', 'secondary') +
      formGrid(field('Purpose', select('purpose', data.purposes)), ...(!supply ? [field('Expected return date', input('due', '', 'date', 'required min="' + today() + '"'))] : []),
        field('Remarks', area('remarks', '', 'maxlength="600"'))), 'Submit request', async fd => {
      const lines = fd.getAll('item').map((id, i) => supply ? { itemId: id, quantity: Number(fd.getAll('quantity')[i]) } : { assetId: id });
      await post('/portal/requests', { ...Object.fromEntries(fd), type, lines, condition: supply ? '' : 'Serviceable' });
      notify('Request submitted for approval.');
      if (current !== 'requests') location.href = 'teacher.html?tab=requests';
      else await app.refresh();
    });
    const list = $('#request-lines', form);
    const add = () => {
      if (list.children.length >= 60) { notify('A request can include up to 60 lines.', true); return; }
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = select('item', available, '', 'Choose ' + (supply ? 'supply' : 'equipment'), 'required aria-label="Requested inventory item"') + (supply ? input('quantity', 1, 'number', 'required min="1" max="100000" aria-label="Requested quantity"') : '') + button('Remove', 'remove', 'x', 'ghost icon-btn', 'aria-label="Remove requested line"');
      $('[data-action=remove]', row).onclick = () => { if (list.children.length > 1) row.remove(); };
      list.append(row); icons();
    };
    add();
    $('[data-action=add-line]', form).onclick = add;
  }
  dispatch(main, async (action, el) => {
    if (action === 'supply' || action === 'borrow') requestModal(action === 'supply' ? 'ISSUE' : 'BORROW');
    if (action === 'qr-file') return download(qrRoute, emp.number + '-QR.png');
    if (action === 'qr-pdf') return download('/labels/employee?format=pdf&ids=' + emp.id, 'Employee-QR.pdf');
    if (action === 'qr-print') return preview('/labels/employee?ids=' + emp.id, 'Employee QR preview');
    if (action === 'format') return format(el);
    if (action === 'tx-detail') txDetail(data.transactions.find(r => r.id === el.dataset.id));
    if (action === 'request-detail') {
      const row = data.requests.find(r => r.id === el.dataset.id);
      dialog(row.number, '<div class="detail-grid">' + info('Status', row.status) + info('Purpose', row.purpose) + info('Submitted', date(row.date)) + '</div><ul>' +
        row.lines.map(line => '<li>' + esc(line.description) + ' · ' + qty(line.quantity) + ' requested' + (line.approved === undefined ? '' : ' · ' + qty(line.approved) + ' approved · ' + qty(line.fulfilled) + ' fulfilled') + '</li>').join('') + '</ul>');
    }
    if (action === 'cancel') dialog('Cancel request', field('Reason', area('reason', '', 'required maxlength="400"')), 'Cancel request', async fd => {
      await post('/requests/' + el.dataset.id + '/status', { status: 'CANCELLED', reason: fd.get('reason') });
      notify('Request cancelled.'); await app.refresh();
    });
  });
}
