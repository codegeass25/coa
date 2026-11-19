import { backendOrigin } from '../config.js';

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
export const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export const icon = name => '<i data-lucide="' + esc(name) + '" aria-hidden="true"></i>';
export const icons = () => window.lucide?.createIcons({ attrs: { 'stroke-width': 1.8, 'aria-hidden': 'true' } });
export const app = { me: null, render: null, refresh: null, dirty: false, online: true };
export const token = () => sessionStorage.getItem('coa-session');
export const clearSession = () => sessionStorage.removeItem('coa-session');
export const can = perm => app.me?.permissions.includes(perm);
export const date = value => value ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' }).format(new Date(value.length === 10 ? value + 'T00:00:00+08:00' : value)) : '—';
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const qty = value => new Intl.NumberFormat('en-PH').format(value ?? 0);
export const pesos = value => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format((value || 0) / 100);
export const classifications = { SUPPLIES: 'Consumable', LOW: 'Low-value semi-expendable', HIGH: 'High-value semi-expendable', PPE: 'PPE' };
export const modes = { ISSUE: 'Issue Supplies', BORROW: 'Borrow Equipment', RETURN: 'Return Equipment', RECEIVE: 'Receive Stock', ASSIGN: 'Assign Property', TRANSFER: 'Transfer', PROPERTY_RETURN: 'Return Assigned Property', REPAIR: 'Send for Repair', REPAIR_CLOSE: 'Complete Repair', INCIDENT: 'Record Incident', DISPOSE: 'Dispose Property', EXTEND: 'Extend Borrowing', ADJUST: 'Count Adjustment', IMPORT: 'Opening Balances', REVERSE: 'Reverse Issuance' };
export const conditions = ['Serviceable', 'Damaged', 'Needs Repair', 'Unserviceable', 'Incomplete Accessories', 'Missing'];
export const button = (text, action, symbol = '', variant = '', attrs = '') => '<button type="button" class="btn ' + variant + '" data-action="' + esc(action) + '" ' + attrs + '>' + (symbol ? icon(symbol) : '') + '<span>' + esc(text) + '</span></button>';
export const link = (text, url, symbol = '', variant = '') => '<a class="btn ' + variant + '" href="' + esc(url) + '">' + (symbol ? icon(symbol) : '') + esc(text) + '</a>';
export const title = (name, details = '', actions = '', symbol = '') => '<div class="page-head"><div><h1 class="page-title">' + (symbol ? icon(symbol) : '') + esc(name) + '</h1>' + (details ? '<p class="muted">' + esc(details) + '</p>' : '') + '</div><div class="page-actions">' + actions + '</div></div>';
export const panel = (name, body, actions = '', extra = '') => '<section class="panel ' + extra + '">' + (name ? '<div class="panel-head"><h2>' + esc(name) + '</h2>' + actions + '</div>' : '') + '<div class="panel-body">' + body + '</div></section>';
export const badge = (value, variant) => {
  const v = String(value || '—');
  const tone = variant || (/REJECT|CANCEL|HOLD|DAMAGE|OVERDUE|MISSING|OUT OF STOCK|INACTIVE|UNSERVICEABLE/i.test(v) ? 'red' : /PENDING|VERIFY|LOW STOCK|PARTIAL|REVIEW|REPAIR|DISCREPANCY/i.test(v) ? 'amber' : /ACTIVE|SERVICEABLE|APPROVED|POSTED|ISSUED|AVAILABLE|NORMAL|VERIFIED|CLOSED|READY/i.test(v) ? 'green' : 'blue');
  return '<span class="badge ' + tone + ' ' + (tone === 'green' ? 'success' : tone === 'red' ? 'danger' : tone === 'amber' ? 'warning' : 'info') + '">' + esc(v) + '</span>';
};
export const empty = (heading, details = '') => '<div class="empty">' + icon('inbox') + '<strong>' + esc(heading) + '</strong>' + (details ? '<p>' + esc(details) + '</p>' : '') + '</div>';
export const cell = esc;
export const options = (list, current = '', blank) => (blank === undefined ? '' : '<option value="">' + esc(blank) + '</option>') + list.map(item => {
  const [value, label] = Array.isArray(item) ? item : [item, item];
  return '<option value="' + esc(value) + '"' + (String(value) === String(current) ? ' selected' : '') + '>' + esc(label) + '</option>';
}).join('');
export const field = (label, control, details = '') => '<label class="field"><span>' + esc(label) + '</span>' + control + (details ? '<small class="muted">' + esc(details) + '</small>' : '') + '</label>';
export const input = (name, value = '', type = 'text', attrs = '') => '<input type="' + type + '" name="' + esc(name) + '" value="' + esc(value) + '" ' + attrs + '>';
export const select = (name, list, current, blank, attrs = '') => '<select name="' + esc(name) + '" ' + attrs + '>' + options(list, current, blank) + '</select>';
export const area = (name, value = '', attrs = '') => '<textarea name="' + esc(name) + '" rows="3" ' + attrs + '>' + esc(value) + '</textarea>';
export const formGrid = (...fields) => '<div class="form-grid">' + fields.join('') + '</div>';
export const employees = rows => rows.map(row => [row.id, row.name + ' · ' + row.number]);
export const tabbar = (tabs, current) => '<div class="tabs" aria-label="Sections">' + tabs.map(([key, label, symbol]) => '<button class="tab ' + (key === current ? 'active' : '') + '" type="button" data-tab="' + esc(key) + '" aria-pressed="' + (key === current) + '">' + (symbol ? icon(symbol) : '') + esc(label) + '</button>').join('') + '</div>';
export function bindTabs(container, fn) { $$('[data-tab]', container).forEach(b => b.addEventListener('click', () => fn(b.dataset.tab))); }
export function on(container, selector, fn) {
  container.addEventListener('click', event => {
    const el = event.target.closest(selector);
    if (el && container.contains(el)) fn(el, event);
  });
}
export function notify(message, error = false) {
  const el = $('#toast');
  el.textContent = message;
  el.className = 'toast ' + (error ? 'error danger' : 'success');
  el.hidden = false;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => { el.hidden = true; }, error ? 6500 : 4000);
}
const pending = new Map();
export async function api(route, { method = 'GET', body, mutate = false, raw = false, auth = true } = {}) {
  const headers = {};
  if (auth && token()) headers.Authorization = 'Bearer ' + token();
  const serialized = body === undefined ? undefined : JSON.stringify(body);
  if (serialized !== undefined) headers['Content-Type'] = 'application/json';
  let key;
  if (mutate) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(route + '|' + serialized));
    key = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
    if (pending.size >= 120 && !pending.has(key)) pending.delete(pending.keys().next().value);
    if (!pending.has(key)) pending.set(key, crypto.randomUUID());
    headers['Idempotency-Key'] = pending.get(key);
  }
  let response;
  try { response = await fetch(backendOrigin + '/api' + route, { method, headers, body: serialized, cache: 'no-store', signal: AbortSignal.timeout(45000) }); }
  catch { throw Error('The backend could not be reached. Reconnect and retry this operation.'); }
  if (!response.ok) {
    const message = (await response.json().catch(() => null))?.error || 'The backend returned ' + response.status + '.';
    if (response.status === 401 && auth && token()) { clearSession(); location.replace('index.html'); }
    const error = Error(message);
    if (mutate && response.status >= 400 && response.status < 500) pending.delete(key);
    error.status = response.status;
    throw error;
  }
  if (mutate) pending.delete(key);
  return raw ? response : response.json();
}
export const post = (route, body) => api(route, { method: 'POST', body, mutate: true });
export async function run(fn) { try { return await fn(); } catch (error) { notify(error.message, true); } }
export async function download(route, fallback) {
  const response = await api(route, { raw: true });
  const blob = URL.createObjectURL(await response.blob());
  const a = document.createElement('a');
  a.href = blob;
  a.download = /filename="([^"]+)"/.exec(response.headers.get('content-disposition'))?.[1] || fallback;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(blob), 10000);
}
export function dialog(name, body, action, fn) {
  const d = $('#dialog');
  if (d.open) d.close();
  d.innerHTML = '<form class="dialog-layout"><div class="dialog-head"><h2 id="dialog-title">' + esc(name) + '</h2>' + button('Close', 'close', 'x', 'ghost icon-btn', 'aria-label="Close dialog"') + '</div><div class="dialog-body">' + body + '<p class="form-alert" role="alert" hidden></p></div><footer class="dialog-foot">' + button(fn ? 'Cancel' : 'Close', 'close') + (fn ? '<button class="btn primary" type="submit">' + esc(action) + '</button>' : '') + '</footer></form>';
  $$('[data-action=close]', d).forEach(el => el.addEventListener('click', () => d.close()));
  d.addEventListener('close', () => { d.classList.remove('wide'); }, { once: true });
  const form = $('form', d);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!fn) return;
    const submit = $('[type=submit]', form);
    const alert = $('.form-alert', form);
    submit.disabled = true;
    alert.hidden = true;
    try {
      const close = await fn(new FormData(form), form);
      if (close !== false) d.close();
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
      alert.scrollIntoView({ block: 'nearest' });
    } finally { submit.disabled = false; }
  });
  d.showModal();
  icons();
  return form;
}
export async function preview(route, name) {
  const response = await api(route, { raw: true });
  const blob = URL.createObjectURL(await response.blob());
  const form = dialog(name, '<iframe title="' + esc(name) + '" class="report-preview" sandbox="allow-same-origin allow-modals" src="' + blob + '"></iframe>', 'Print', () => {
    $('iframe', form).contentWindow.print();
    return false;
  });
  $('#dialog').classList.add('wide');
  $('#dialog').addEventListener('close', () => URL.revokeObjectURL(blob), { once: true });
}
export function table(container, heads, rows, draw, opts = {}) {
  const size = opts.pageSize || 12;
  let page = 0;
  const search = opts.search !== false;
  container.innerHTML = (search || opts.filters ? '<div class="toolbar">' + (search ? '<label class="search-box">' + icon('search') + '<input type="search" aria-label="Search table" placeholder="' + esc(opts.placeholder || 'Search records…') + '"></label>' : '') + (opts.filters || '') + '</div>' : '') + '<div class="rows"></div>';
  const out = $('.rows', container);
  function render() {
    const query = $('input[type=search]', container)?.value.trim().toLowerCase() || '';
    const subset = rows.filter(row => (!opts.filter || opts.filter(row, container)) && (!query || (opts.searchText ? opts.searchText(row) : Object.values(row).filter(v => typeof v === 'string' || typeof v === 'number').join(' ')).toLowerCase().includes(query)));
    const total = subset.length;
    page = Math.max(0, Math.min(page, Math.ceil(total / size) - 1));
    if (!total) {
      out.innerHTML = '<div class="table-wrap"><table><thead><tr>' + heads.map(h => '<th scope="col">' + esc(h) + '</th>').join('') + '</tr></thead></table></div>' + empty(query ? 'No matching records' : (opts.empty || 'No records yet'), query ? 'Try a different search or filter.' : opts.details);
      icons();
      return;
    }
    const start = page * size;
    out.innerHTML = '<div class="table-wrap"><table><thead><tr>' + heads.map(h => '<th scope="col">' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' + subset.slice(start, start + size).map(row => '<tr>' + draw(row).map(value => '<td>' + (value ?? '—') + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>' +
      '<div class="pagination"><span class="muted">Showing ' + (start + 1) + '–' + Math.min(total, start + size) + ' of ' + total + '</span><div class="actions">' + button('Previous', 'prev', 'chevron-left', 'ghost', page === 0 ? 'disabled' : '') + '<span class="page-number">' + (page + 1) + '</span>' + button('Next', 'next', 'chevron-right', 'ghost', (page + 1) * size >= total ? 'disabled' : '') + '</div></div>';
    $('[data-action=prev]', out).addEventListener('click', () => { page--; render(); });
    $('[data-action=next]', out).addEventListener('click', () => { page++; render(); });
    icons();
  }
  $('input[type=search]', container)?.addEventListener('input', () => { page = 0; render(); });
  $$('.toolbar select', container).forEach(el => el.addEventListener('change', () => { page = 0; render(); }));
  render();
}
export function tabFrom(tabs, fallback) {
  const param = new URLSearchParams(location.search).get('tab');
  return tabs.some(([id]) => id === param) ? param : fallback;
}
export function setTab(tab) {
  const url = new URL(location.href);
  url.searchParams.set('tab', tab);
  history.replaceState(null, '', url);
}
