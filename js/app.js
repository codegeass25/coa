import { $, $$, esc, icon, icons, app, token, clearSession, can, button, title, panel, empty, field, input, api, run, dialog, notify, preview } from './ui.js';
import { backendOrigin } from '../config.js';
import { dashboard, inventory, personnel, property, transactions } from './records.js';
import { scanner } from './scanner.js';
import { physicalCount, reports, settings, teacher } from './workspaces.js';

const page = document.body.dataset.page;
const root = $('#app');
const mainNav = [
  ['dashboard', 'Dashboard', 'layout-dashboard', ['dashboard']],
  ['scanner', 'Quick Scanner', 'scan-line', ['post']],
  ['inventory', 'Inventory', 'boxes', ['inventory']],
  ['transactions', 'Transactions', 'workflow', ['inventory', 'approve', 'post']],
  ['personnel', 'Personnel', 'users-round', ['personnel']],
  ['property', 'Property Management', 'clipboard-list', ['inventory']],
  ['physical-count', 'Physical Count', 'clipboard-check', ['count']],
  ['reports', 'Reports', 'files', ['reports']],
  ['settings', 'Settings', 'settings', ['configure']]
];
const teacherNav = [
  ['home', 'My Dashboard', 'layout-dashboard'], ['requests', 'My Requests', 'clipboard-list'], ['issuances', 'My Issuances', 'package-check'],
  ['borrowings', 'My Borrowings', 'briefcase-business'], ['properties', 'My Properties', 'monitor'], ['qr', 'My QR Code', 'qr-code'], ['documents', 'My Documents', 'files']
];
const renderers = { dashboard, scanner, inventory, transactions, personnel, property, 'physical-count': physicalCount, reports, settings, teacher };
const gateway = () => mainNav.find(row => row[3].some(can))?.[0] || 'teacher';
const theme = localStorage.getItem('coa-theme') || 'light';
document.documentElement.dataset.theme = theme;
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(() => {});
function themeToggle() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('coa-theme', next);
}
function login() {
  root.innerHTML = '<main class="login-page"><section class="login-card"><div class="login-brand"><span class="brand-mark"><img src="icons/icon-192.png" alt=""></span><span>COA Inventory</span></div><h1>School Inventory<br>Management System</h1><p class="muted">DepEd / COA-based</p>' +
    '<form class="login-form" id="login">' + field('Username', '<div class="input-icon">' + icon('user-round') + input('username', '', 'text', 'autocomplete="username" autocapitalize="none" required maxlength="75" placeholder="Enter username"') + '</div>') +
    field('Password', '<div class="input-icon">' + icon('lock-keyhole') + input('password', '', 'password', 'autocomplete="current-password" required maxlength="128" placeholder="Enter password"') + button('Show password', 'password', 'eye', 'ghost icon-btn', 'aria-label="Show password"') + '</div>') +
    '<p class="form-alert" role="alert" hidden></p><button class="btn primary login-submit" type="submit">Sign In</button></form>' +
    '<button class="text-button" type="button" data-action="forgot">Forgot your password?</button><div class="login-footer"><strong>Magallanes National High School</strong><small>School Supply and Property Management</small></div></section></main>';
  const form = $('#login');
  $('[data-action=password]', form).onclick = event => {
    const suffix = form.elements.password.type === 'password' ? 'text' : 'password';
    form.elements.password.type = suffix;
    event.currentTarget.setAttribute('aria-label', suffix === 'text' ? 'Hide password' : 'Show password');
  };
  $('[data-action=forgot]', root).onclick = () => dialog('Account recovery', '<p>Contact your school system administrator. They can verify your identity and assign a temporary password that must be replaced at first sign-in.</p>');
  form.onsubmit = async event => {
    event.preventDefault();
    const alert = $('.form-alert', form);
    const submit = $('[type=submit]', form);
    submit.disabled = true;
    alert.hidden = true;
    try {
      const result = await api('/login', { method: 'POST', body: Object.fromEntries(new FormData(form)), auth: false });
      sessionStorage.setItem('coa-session', result.token);
      app.me = result.actor;
      location.replace(gateway() + '.html');
    } catch (error) { alert.textContent = error.message; alert.hidden = false; }
    finally { submit.disabled = false; }
  };
  icons();
}
function password(mandatory = false) {
  dialog('Change password', formPassword(), 'Save password', async data => {
    if (data.get('password') !== data.get('confirm')) throw Error('The passwords do not match.');
    await api('/password', { method: 'POST', body: { current: data.get('current'), password: data.get('password') } });
    clearSession();
    location.replace('index.html');
  });
  if (mandatory) {
    $('#dialog').addEventListener('close', () => {
      if (token() && app.me.mustChange) password(true);
    }, { once: true });
  }
}
function formPassword() {
  return '<div class="stack">' + field('Current password', input('current', '', 'password', 'required autocomplete="current-password"')) + field('New password', input('password', '', 'password', 'required minlength="12" maxlength="128" autocomplete="new-password"')) + field('Confirm new password', input('confirm', '', 'password', 'required minlength="12" maxlength="128" autocomplete="new-password"')) + '</div>';
}
function navLink(label, symbol, url, current) {
  return '<a class="nav-link' + (current ? ' active' : '') + '" href="' + esc(url) + '"' + (current ? ' aria-current="page"' : '') + '>' + icon(symbol) + '<span>' + esc(label) + '</span></a>';
}
function shell() {
  const isTeacher = page === 'teacher';
  const activeTeacher = new URLSearchParams(location.search).get('tab') || 'home';
  const tabs = isTeacher ? teacherNav.map(([key, label, symbol]) => navLink(label, symbol, 'teacher.html?tab=' + key, activeTeacher === key)).join('') :
    mainNav.filter(row => row[3].some(can)).map(([key, label, symbol]) => navLink(label, symbol, key + '.html', key === page)).join('');
  const initial = app.me.name.split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase()).join('');
  root.innerHTML = '<div class="app-shell"><aside class="sidebar" id="sidebar"><a class="brand" href="' + gateway() + '.html"><span class="brand-mark"><img src="icons/icon-192.png" alt=""></span><span>COA Inventory<small>School Management</small></span></a><nav class="nav" aria-label="Main navigation">' +
    '<span class="nav-label">' + (isTeacher ? 'Personal Workspace' : 'Workspace') + '</span>' + tabs + '</nav><div class="sidebar-bottom">' +
    (app.me.employeeId && can('portal') && !isTeacher ? navLink('Teacher Portal', 'contact-round', 'teacher.html', false) : '') +
    (isTeacher && gateway() !== 'teacher' ? navLink('Staff Workspace', 'layout-dashboard', gateway() + '.html', false) : '') +
    '<span class="sidebar-version">School Inventory System</span></div></aside><button type="button" class="sidebar-backdrop" aria-label="Close menu"></button>' +
    '<div class="app-main"><header class="topbar"><div class="row">' + button('Menu', 'menu', 'panel-left', 'ghost icon-btn menu-toggle', 'aria-label="Toggle navigation" aria-expanded="false" aria-controls="sidebar"') +
    '<div class="school"><strong>' + esc(app.me.school) + '</strong><small>School Inventory Management System</small></div></div>' +
    '<div class="topbar-actions">' + button('Theme', 'theme', 'sun-moon', 'ghost icon-btn', 'aria-label="Toggle light or dark mode"') +
    button('Notifications', 'notifications', 'bell', 'ghost icon-btn', 'aria-label="Notifications"') +
    '<details class="account-menu"><summary aria-label="Account menu"><span class="avatar">' + esc(initial) + '</span><span class="account-name"><strong>' + esc(app.me.name) + '</strong><small>' + esc(app.me.roleName) + '</small></span>' + icon('chevron-down') + '</summary><div class="account-popover">' +
    button('Change password', 'change-password', 'key-round', 'ghost') + button('Sign out', 'signout', 'log-out', 'ghost') + '</div></details></div></header>' +
    '<div id="connection" class="connection-banner" role="status" hidden></div><main class="page" id="workspace"></main></div></div>';
  const shell = $('.app-shell');
  const menu = $('[data-action=menu]');
  function toggle() {
    if (window.innerWidth >= 900) {
      shell.classList.toggle('nav-collapsed');
      localStorage.setItem('coa-collapsed', String(shell.classList.contains('nav-collapsed')));
      menu.setAttribute('aria-expanded', String(!shell.classList.contains('nav-collapsed')));
    } else {
      shell.classList.toggle('nav-open');
      menu.setAttribute('aria-expanded', String(shell.classList.contains('nav-open')));
    }
  }
  if (localStorage.getItem('coa-collapsed') === 'true') shell.classList.add('nav-collapsed');
  menu.onclick = toggle;
  $('.sidebar-backdrop').onclick = toggle;
  $('[data-action=theme]').onclick = themeToggle;
  $('[data-action=change-password]').onclick = () => password();
  $('[data-action=signout]').onclick = () => run(async () => {
    try { await api('/logout', { method: 'POST' }); } finally { clearSession(); location.replace('index.html'); }
  });
  $('[data-action=notifications]').onclick = () => run(async () => {
    const list = await api('/notifications');
    dialog('Notifications', list.length ? '<div class="notice-list">' + list.map(row => '<a href="' + esc(row.page) + '">' + icon('bell') + '<span>' + esc(row.text) + '</span></a>').join('') + '</div>' : empty('You’re up to date', 'Inventory and request alerts will appear here.'));
  });
  icons();
}
function connection(ok) {
  app.online = ok;
  const banner = $('#connection');
  if (banner) {
    banner.hidden = ok;
    if (!ok) banner.textContent = 'Backend connection unavailable. Transactions cannot be committed until the connection is restored.';
  }
}
async function boot() {
  if (page === 'index') {
    if (token()) {
      const me = await api('/me').catch(() => null);
      if (me) { app.me = me; location.replace(gateway() + '.html'); return; }
      clearSession();
    }
    login();
    return;
  }
  if (!token()) { location.replace('index.html'); return; }
  app.me = await api('/me');
  shell();
  const main = $('#workspace');
  if (app.me.mustChange) {
    main.innerHTML = title('Change your temporary password');
    password(true);
    return;
  }
  const pagePermissions = mainNav.find(row => row[0] === page)?.[3] || ['portal'];
  if (!pagePermissions.some(can)) {
    main.innerHTML = title('Access restricted') + panel('', empty('This workspace is unavailable for your role') + '<a href="' + gateway() + '.html">Return to your dashboard</a>');
    return;
  }
  let running = false;
  app.refresh = async (quiet = false) => {
    if (running || (quiet && (app.dirty || $('#dialog').open))) return;
    running = true;
    try {
      const params = page === 'physical-count' && new URLSearchParams(location.search).has('session') ? '?session=' + encodeURIComponent(new URLSearchParams(location.search).get('session')) : '';
      const data = await api(page === 'reports' ? '/reports' : '/view/' + page + params);
      connection(true);
      await renderers[page](main, data);
      icons();
    } catch (error) {
      if (!error.status) connection(false);
      if (!quiet || !main.children.length) {
        main.innerHTML = title('Workspace unavailable') + panel('', empty(error.message) + button('Retry', 'retry', 'refresh-cw', 'primary'));
        $('[data-action=retry]', main).onclick = () => app.refresh();
        icons();
      }
    } finally { running = false; }
  };
  await app.refresh();
  const socket = window.io?.(backendOrigin, { auth: { token: token() }, timeout: 6000 });
  socket?.on('connect', () => { connection(true); app.refresh(true); });
  socket?.on('committed', () => app.refresh(true));
  socket?.on('disconnect', () => connection(false));
  socket?.on('connect_error', () => connection(false));
  window.addEventListener('offline', () => connection(false));
  window.addEventListener('online', () => app.refresh(true));
}
boot().catch(error => {
  root.innerHTML = '<main class="page">' + title('Connection unavailable') + panel('', empty(error.message) + '<a class="btn primary" href="index.html">Return to sign in</a>') + '</main>';
}).finally(() => root.setAttribute('aria-busy', 'false'));
