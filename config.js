const local = ['localhost', '127.0.0.1'].includes(window.location.hostname);
export const backendOrigin = local ? window.location.origin : 'https://coa.mdmsportal.uk';
