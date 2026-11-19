import { $, $$, app, esc, icon, icons, date, today, qty, pesos, modes, conditions, button, link, title, panel, badge, empty, field, input, select, area, formGrid, employees, tabbar, dialog, post, api, notify, run } from './ui.js';
import { attr, postRequest, fileText } from './records.js';
import { startCamera, stopCamera } from './camera.js';

const primary = [['ISSUE', 'Issue Supplies', 'package-check'], ['BORROW', 'Borrow Equipment', 'briefcase-business'], ['RETURN', 'Return Equipment', 'undo-2'], ['RECEIVE', 'Receive Stock', 'package-plus'], ['ASSIGN', 'Assign Property', 'clipboard-check'], ['TRANSFER', 'Transfer', 'repeat-2']];
const more = ['PROPERTY_RETURN', 'REPAIR', 'REPAIR_CLOSE', 'INCIDENT', 'DISPOSE', 'EXTEND'];
const approvalRequired = ['ISSUE', 'BORROW', 'RETURN', 'ASSIGN', 'PROPERTY_RETURN', 'EXTEND'];
const state = { mode: 'ISSUE', cart: [], employee: null, code: '', values: {}, attachments: [], camera: false, scanMessage: '' };
const initialMode = new URLSearchParams(location.search).get('mode');
if ([...primary.map(r => r[0]), ...more].includes(initialMode)) state.mode = initialMode;

function requisitionFields(mode, data, values) {
  const receive = mode === 'RECEIVE';
  return formGrid(
    field('Purpose *', select('purpose', data.purposes, values.purpose || data.purposes[0], undefined, 'required')),
    field('Remarks', area('remarks', values.remarks, 'maxlength="600" placeholder="Optional"')),
    ...(['BORROW', 'EXTEND'].includes(mode) ? [field('Expected return date *', input('due', values.due, 'date', 'required min="' + today() + '"'))] : []),
    ...(['BORROW', 'RETURN', 'PROPERTY_RETURN', 'REPAIR', 'REPAIR_CLOSE', 'INCIDENT'].includes(mode) ? [field(mode === 'BORROW' ? 'Release condition' : 'Recorded condition', select('condition', conditions, values.condition || 'Serviceable')), field('Accessories', input('accessories', values.accessories))] : []),
    ...(mode === 'TRANSFER' ? [field('Destination location *', input('location', values.location, 'text', 'required'))] : []),
    ...(['ASSIGN', 'TRANSFER'].includes(mode) ? [field('ICS review date', input('renewOn', values.renewOn, 'date', 'min="' + today() + '"'), 'Use the date agreed by the property office.')] : []),
    ...(['RECEIVE', 'REPAIR', 'REPAIR_CLOSE', 'INCIDENT', 'DISPOSE'].includes(mode) ? [field(receive ? 'Inspection and acceptance reference *' : 'Supporting document reference *', input('reference', values.reference, 'text', 'required maxlength="150"'))] : []),
    ...(['RECEIVE', 'REPAIR', 'REPAIR_CLOSE', 'INCIDENT', 'DISPOSE'].includes(mode) ? [field('Supporting PDFs', input('attachments', '', 'file', 'multiple accept=".pdf,application/pdf"'), state.attachments.length ? state.attachments.map(f => f.name).join(', ') : 'Up to two files, 1 MB each.')] : []),
    ...(receive ? [field('Acquisition source', select('source', ['Purchased', 'Donated', 'Transferred in', 'Beginning balance', 'Other'], values.source || 'Purchased')),
      field('Supplier', input('supplier', values.supplier, 'text', 'list="suppliers"') + '<datalist id="suppliers">' + data.suppliers.map(r => '<option value="' + esc(r.name) + '"></option>').join('') + '</datalist>'),
      field('Purchase order', input('purchaseOrder', values.purchaseOrder)), field('Invoice', input('invoice', values.invoice)), field('Delivery receipt', input('deliveryReceipt', values.deliveryReceipt))] : [])
  );
}
function addAcquisition(item, data, onAdd) {
  const property = item.nature === 'PROPERTY';
  dialog('Receive ' + item.description, formGrid(
    field('Quantity', input('quantity', 1, 'number', 'required min="1" max="' + (property ? '1' : '100000') + '"' + (property ? ' readonly' : ''))),
    field('Unit cost (PHP)', input('unitCost', '', 'number', 'required min="0" max="100000000" step="0.01"')),
    field('Fund cluster', input('fund', '', 'text', 'list="fund-options" required maxlength="40"') + '<datalist id="fund-options">' + data.funds.map(r => '<option value="' + esc(r.code) + '">' + esc(r.name) + '</option>').join('') + '</datalist>'),
    field('Acquisition date', input('acquiredOn', today(), 'date', 'required max="' + today() + '"')),
    field('Location', input('location', '', 'text', property ? 'required' : '')),
    ...(property ? [
      field('Property number', input('propertyNo', '', 'text', 'placeholder="Auto-assigned if empty"')),
      field('Serial number', input('serial')), field('Brand', input('brand')), field('Model', input('model')),
      field('Useful life in months', input('usefulLife', '', 'number', 'required min="13" max="2400"')),
      field('Property recognition verified', select('recognized', [['', 'Select confirmation'], ['true', 'Recognition criteria verified']], '', undefined, 'required')),
      field('Reviewed classification override', select('classificationOverride', [['LOW', 'Low-value semi-expendable'], ['HIGH', 'High-value semi-expendable'], ['PPE', 'Property, Plant and Equipment']], '', 'Apply current cost threshold')),
      field('Classification review reason', area('classificationReason', '', 'maxlength="400"'))
    ] : [])
  ), 'Add to cart', async data => {
    const values = Object.fromEntries(data);
    onAdd({ ...values, itemId: item.id, item, quantity: Number(values.quantity), cost: Math.round(Number(values.unitCost) * 100), recognized: values.recognized === 'true', usefulLife: Number(values.usefulLife || 0), key: crypto.randomUUID() });
  });
}
function currentTotal(cart) {
  return cart.reduce((sum, line) => sum + (line.cost ?? (line.item?.available ? Math.round(line.item.value / line.item.available) : 0)) * line.quantity, 0);
}
export function scanner(main, data) {
  const mode = state.mode;
  const extras = mode === 'RECEIVE';
  const supplies = mode === 'ISSUE';
  const mainForm = () => $('#scanner-form', main);
  const cart = state.cart;
  app.dirty = Boolean(cart.length || state.employee || state.camera);
  const person = state.employee;
  const personBody = person ? '<div class="scanner-person"><span class="avatar big">' + esc(person.name.split(/\s+/).slice(0, 2).map(s => s[0]).join('')) + '</span><div><strong>' + esc(person.name) + '</strong><small>Employee No. ' + esc(person.number) + '</small><small>' + esc([person.office, person.department].filter(Boolean).join(' · ')) + '</small></div></div>' + badge('Verified', 'green') :
    '<div class="scanner-person"><span class="avatar big">' + icon('user-round') + '</span><div><strong>Identify an employee</strong><small>Scan their QR or enter their employee number.</small></div></div>';
  const available = extras || supplies ? data.items.filter(i => i.active && (extras || i.nature === 'SUPPLY')).map(i => [i.id, i.stockNo + ' · ' + i.description]) :
    data.assets.filter(a => a.status !== 'DISPOSED').map(a => [a.id, a.propertyNo + ' · ' + a.description]);
  const requestList = data.requests.filter(r => person ? r.employeeId === person.id && r.type === mode : !r.employeeId && r.type === mode);
  main.innerHTML = title(mode === 'ISSUE' ? 'Quick Supply Issuance' : modes[mode], 'Quick Scanner', '<span class="status-dot">' + (app.online ? 'Connected' : 'Connection unavailable') + '</span>', 'scan-line') +
    '<section class="panel scanner-modes"><div class="panel-body">' + tabbar(primary, mode) + select('more-workflows', more.map(code => [code, modes[code]]), more.includes(mode) ? mode : '', 'Other workflows', 'aria-label="Other workflows"') + '</div></section>' +
    '<div class="scanner-grid"><div class="stack">' +
    panel('Teacher / Employee', personBody + '<form id="employee-scan" class="row scan-entry">' + input('code', '', 'text', 'autocomplete="off" maxlength="200" required placeholder="Scan or enter employee number" aria-label="Employee identifier"') + button('Find', 'employee-find', 'search', 'secondary small') + '</form>' +
      '<div class="row">' + button('Scan Teacher QR', 'camera', 'scan-line', 'primary') + button('Manual Entry', 'employee', 'user-round-search', 'secondary') + '</div>') +
    panel('Approved Requests', requestList.length ? '<div class="stack">' + requestList.map(r => '<div class="info-line"><span><strong>' + esc(r.number) + '</strong><small class="muted">' + esc(r.purpose) + '</small></span>' + button('Open', 'approved', 'arrow-right', 'secondary small', attr(r.id)) + '</div>').join('') + '</div>' : '<p class="muted">' + (person ? 'No approved requests for this employee in this workflow.' : 'Identify the employee to see approved requests.') + '</p>') + '</div>' +
    '<div class="stack">' + panel(extras ? 'Scan Stock or Property Type' : supplies ? 'Scan Items (Consumables)' : 'Scan Property', '<form id="item-scan" class="row scan-entry">' + input('code', '', 'text', 'autocomplete="off" maxlength="200" required placeholder="Scan item QR or enter stock/property number…" aria-label="Stock or property identifier"') +
      button('Find', 'item-find', 'scan-line', 'secondary small') + '</form><div class="row scanner-tools">' +
      button('Use Camera', 'camera', 'camera', 'secondary') + button('Select Item', 'item', 'list-filter', 'secondary') +
      (supplies && data.packages.length ? button('Supply Package', 'package', 'package-open', 'secondary') : '') + '</div>' +
      '<div id="camera-panel" class="camera-view" hidden><video id="video-scanner" playsinline muted></video><div class="scan-frame"></div><button type="button" class="btn secondary small camera-stop" data-action="stop-camera">Stop camera</button></div>' +
      '<p id="scan-status" class="muted scan-status" role="status">' + esc(state.scanMessage) + '</p><div id="cart-table"></div>') + '</div></div>' +
    '<form id="scanner-form" class="panel"><div class="panel-body"><div class="scanner-footer"><div>' + requisitionFields(mode, data, state.values) + '</div>' +
    '<div class="scanner-totals">' +
        '<div class="info-line"><strong>Total Items</strong><strong id="total-items">' + qty(cart.length) + '</strong></div>' +
        '<div class="info-line"><span>Total Quantity</span><strong id="total-qty">' + qty(cart.reduce((n, row) => n + row.quantity, 0)) + '</strong></div>' +
        '<div class="info-line"><span>Estimated Value</span><strong id="total-value">' + pesos(currentTotal(cart)) + '</strong></div></div></div>' +
    '<div class="actions scanner-actions">' + button('Clear', 'clear', 'trash-2', 'secondary') + '<button class="btn primary" type="submit">' + icon('eye') + (supplies ? 'Preview RIS' : 'Preview Request') + '</button></div></div></form>';
  const cameraPanel = $('#camera-panel', main);
  const video = $('#video-scanner', main);
  function remember() {
    const values = new FormData(mainForm());
    const files = values.getAll('attachments').filter(file => file.size);
    if (files.length) state.attachments = files;
    values.delete('attachments');
    state.values = Object.fromEntries(values);
  }
  function drawCart() {
    const table = $('#cart-table', main);
    const headings = ['#', 'Item Description', 'Unit', extras ? 'Fund Cluster' : 'Available', 'Qty', 'Action'];
    table.innerHTML = '<div class="table-wrap"><table><thead><tr>' + headings.map(h => '<th>' + h + '</th>').join('') + '</tr></thead>' +
      (cart.length ? '<tbody>' + cart.map((row, idx) => '<tr><td>' + (idx + 1) + '</td><td><strong>' + esc(row.item.description) + '</strong><small class="muted table-sub">' + esc(row.item.stockNo || row.item.propertyNo) +
        '</small></td><td>' + esc(row.item.unit || 'unit') + '</td><td>' + esc(extras ? row.fund : row.item.available ?? (row.item.status || '—')) + '</td><td>' +
        (supplies ? '<div class="qty-control">' + button('Decrease', 'minus', 'minus', 'ghost icon-btn', attr(row.key) + ' aria-label="Decrease quantity"') + input('cart-qty', row.quantity, 'number', 'min="1" max="' + Math.max(row.item.available, 1) + '" aria-label="Quantity" ' + attr(row.key)) +
          button('Increase', 'plus', 'plus', 'ghost icon-btn', attr(row.key) + ' aria-label="Increase quantity"') + '</div>' : qty(row.quantity)) +
        '</td><td>' + button('Remove', 'remove', 'trash-2', 'danger ghost icon-btn', attr(row.key) + ' aria-label="Remove item"') + '</td></tr>').join('') + '</tbody>' : '') +
      '</table></div>' + (!cart.length ? empty('No items in the cart', 'Scan an item or use Select Item.') : '');
    $('#total-items', main).textContent = qty(cart.length);
    $('#total-qty', main).textContent = qty(cart.reduce((n, row) => n + row.quantity, 0));
    $('#total-value', main).textContent = pesos(currentTotal(cart));
    $$('[name=cart-qty]', table).forEach(el => {
      el.onchange = () => run(() => {
        const line = cart.find(r => r.key === el.dataset.id);
        const amount = Number(el.value);
        if (!Number.isInteger(amount) || amount < 1 || amount > line.item.available) { el.value = line.quantity; throw Error('Quantity must be within available stock.'); }
        line.quantity = amount;
        drawCart();
      });
    });
    app.dirty = Boolean(cart.length || state.employee || state.camera || Object.values(state.values).some(Boolean));
    icons();
  }
  drawCart();
  function setMessage(message) {
    state.scanMessage = message;
    $('#scan-status', main).textContent = message;
  }
  function cameraOff() {
    stopCamera(video);
    cameraPanel.hidden = true;
    state.camera = false;
  }
  async function cameraOn() {
    if (state.camera) { cameraOff(); return; }
    cameraPanel.hidden = false;
    state.camera = true;
    app.dirty = true;
    try { await startCamera(video, code => run(() => lookupCode(code)), { onError: error => { cameraOff(); notify(error.message, true); } }); }
    catch (error) { cameraOff(); throw error; }
  }
  function chooseEmployee(employee, code) {
    if (state.employee?.id === employee.id) {
      state.code = code || employee.number;
      setMessage('Employee verified: ' + employee.name);
      return;
    }
    remember();
    state.employee = employee;
    state.code = code || employee.number;
    state.scanMessage = 'Employee verified: ' + employee.name;
    const oldVideo = video;
    const wasCamera = state.camera;
    cameraOff();
    scanner(main, data);
    if (wasCamera) main.querySelector('[data-action=camera]')?.click();
    else main.querySelector('#item-scan input')?.focus();
    if (oldVideo.srcObject) stopCamera(oldVideo);
  }
  function add(item, amount = 1) {
      if (extras) {
      remember();
      if (state.camera) cameraOff();
      addAcquisition(item, data, entry => { cart.push(entry); drawCart(); setMessage('Added ' + item.description); });
      return;
    }
    if (supplies && item.nature !== 'SUPPLY') throw Error('Select a consumable stock item.');
    const known = cart.find(row => row.item.id === item.id);
    if (known && !supplies) throw Error('This property is already in the cart.');
    const newQuantity = (known?.quantity || 0) + amount;
    if (supplies && newQuantity > item.available) throw Error('Available stock is insufficient for ' + item.description + '.');
    if (known) known.quantity = newQuantity;
    else cart.push({ key: item.id, item, quantity: amount, ...(supplies ? { itemId: item.id } : { assetId: item.id }) });
    setMessage('Added ' + item.description);
    drawCart();
  }
  async function lookupCode(code, kind) {
    const value = String(code || '').trim();
    if (!value) throw Error('Enter an employee, stock, or property identifier.');
    const result = await api('/lookup', { method: 'POST', body: { code: value, kind } });
    if (result.type === 'EMPLOYEES') chooseEmployee(result.record, value);
    else if (result.type === (extras || supplies ? 'ITEMS' : 'ASSETS')) add(result.record);
    else throw Error(extras ? 'Receive stock by scanning the stock item code or choosing its item type.' : supplies ? 'Scan a consumable stock code in this mode.' : 'Scan an individual property code in this mode.');
  }
  const eform = $('#employee-scan', main);
  const iform = $('#item-scan', main);
  for (const [form, kind] of [[eform, 'EMPLOYEES'], [iform, 'ITEMS']]) form.onsubmit = event => {
    event.preventDefault();
    return run(async () => { await lookupCode(form.elements.code.value, kind); form.reset(); if (form.isConnected) form.elements.code.focus(); });
  };
  const switches = key => {
    if (cart.length) {
      dialog('Change scanner workflow', '<p>Changing workflows clears the current cart.</p>', 'Change workflow', () => { reset(key); });
    } else reset(key);
  };
  function reset(key = mode) {
    cameraOff();
    state.mode = key;
    state.cart = [];
    state.values = {};
    state.attachments = [];
    state.scanMessage = '';
    if (key === mode) { state.code = ''; state.employee = null; }
    const url = new URL(location.href);
    url.searchParams.set('mode', key);
    history.replaceState(null, '', url);
    scanner(main, data);
    $('#employee-scan input', main).focus();
  }
  $$('[data-tab]', main).forEach(el => { el.onclick = () => { if (el.dataset.tab !== mode) switches(el.dataset.tab); }; });
  $('[name=more-workflows]', main).onchange = event => {
    const newMode = event.target.value;
    if (newMode && newMode !== mode) switches(newMode);
  };
  mainForm().oninput = () => { remember(); app.dirty = true; };
  mainForm().onsubmit = event => {
    event.preventDefault();
    run(async () => {
      if (!cart.length) throw Error('Add at least one item before proceeding.');
      if (approvalRequired.includes(mode) && !state.employee) throw Error('Scan or select an employee.');
      remember();
      cameraOff();
      if (state.attachments.length > 2 || state.attachments.some(file => file.size > 1024 * 1024 || !file.name.toLowerCase().endsWith('.pdf'))) throw Error('Select up to two PDF files, each under 1 MB.');
      const requested = { ...state.values, type: mode, employeeId: state.employee?.id || '', lines: cart.map(({ item, key, unitCost, ...line }) => line) };
      if (state.attachments.length) requested.attachments = await Promise.all(state.attachments.map(async file => ({ name: file.name, file: await fileText(file) })));
      const body = '<p>' + esc(state.employee?.name || 'Property / supply office') + ' · ' + esc(state.values.purpose) + '</p><div class="table-wrap"><table><thead><tr><th>Description</th><th>Quantity</th></tr></thead><tbody>' +
        cart.map(row => '<tr><td>' + esc(row.item.description) + '</td><td>' + qty(row.quantity) + '</td></tr>').join('') + '</tbody></table></div><p class="muted">An authorized officer must approve this request before posting.</p>';
      dialog(supplies ? 'Preview supply requisition' : 'Preview transaction request', body, 'Submit for approval', async () => {
        const result = await post('/requests', requested);
        notify(result.number + ' submitted for approval.');
        reset();
        await app.refresh();
        setTimeout(() => dialog('Request submitted', '<p><strong>' + esc(result.number) + '</strong> is awaiting approval.</p>' + link('View Requests', 'transactions.html?tab=requests', 'clipboard-list', 'primary') + ' ' + link('New Transaction', 'scanner.html', 'plus', 'secondary')), 0);
      });
    });
  };
  main.onclick = event => {
    const el = event.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const action = el.dataset.action;
    const row = cart.find(item => item.key === el.dataset.id);
    run(async () => {
      if (action === 'employee-find') eform.requestSubmit();
      if (action === 'item-find') iform.requestSubmit();
      if (action === 'camera') return cameraOn();
      if (action === 'stop-camera') cameraOff();
      if (action === 'clear') reset();
      if (action === 'remove') { cart.splice(cart.indexOf(row), 1); drawCart(); }
      if (action === 'plus') add(row.item);
      if (action === 'minus') { row.quantity = Math.max(1, row.quantity - 1); drawCart(); }
      if (action === 'employee') {
        dialog('Find employee', field('Employee', select('employee', employees(data.employees), '', 'Select employee', 'required')) +
          field('Or enter employee number', input('number', '', 'text', 'placeholder="Optional"')), 'Select employee', async d => {
          const typed = String(d.get('number') || '').trim();
          if (typed) await lookupCode(typed, 'EMPLOYEES');
          else chooseEmployee(data.employees.find(emp => emp.id === d.get('employee')));
        }).elements.number.oninput = event => { event.target.form.elements.employee.required = !event.target.value; };
      }
      if (action === 'item') {
        const form = dialog('Select item', field('Search', input('search', '', 'search', 'placeholder="Enter an item or code"')) +
          field('Inventory item', select('item', available, '', 'Select item', 'required size="7"')), 'Add item', async d => {
          const record = (extras || supplies ? data.items : data.assets).find(r => r.id === d.get('item'));
          if (!record) throw Error('Select an item.');
          if (extras) setTimeout(() => add(record), 0); else add(record);
        });
        form.elements.search.oninput = () => {
          const query = form.elements.search.value.toLowerCase();
          const target = form.elements.namedItem('item');
          target.innerHTML = available.filter(([, label]) => label.toLowerCase().includes(query)).map(([id, label]) => '<option value="' + esc(id) + '">' + esc(label) + '</option>').join('');
        };
      }
      if (action === 'package') dialog('Add supply package', field('Package', select('package', data.packages.map(r => [r.id, r.name]), '', 'Select package', 'required')), 'Add package', async d => {
        const pack = data.packages.find(r => r.id === d.get('package'));
        const lines = pack.lines.map(row => ({ ...row, item: data.items.find(i => i.id === row.itemId) }));
        for (const line of lines) {
          if (!line.item?.active || (cart.find(r => r.itemId === line.itemId)?.quantity || 0) + line.quantity > line.item.available) throw Error('Package unavailable: ' + line.description + '.');
        }
        for (const line of lines) add(line.item, line.quantity);
      });
      if (action === 'approved') postRequest(data.requests.find(r => r.id === el.dataset.id), app.refresh, state.code);
    });
  };
  icons();
}
