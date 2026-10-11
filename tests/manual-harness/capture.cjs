// Capture read-only journey pages in the existing isolated instance.
const {chromium} = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../');
const privateDir = path.join(root, '.tmp/ux-review');
const state = JSON.parse(fs.readFileSync(path.join(privateDir, 'state.json')));
const accounts = JSON.parse(fs.readFileSync(path.join(privateDir, 'accounts.json')));
const persona = process.argv[2] || 'pm';
const account = accounts.find(entry => entry.persona === persona);
if (!account) throw new Error('Unknown review persona');
const output = path.join(privateDir, 'recaptures', persona);
fs.mkdirSync(output, {recursive: true});
const routes = [
  ['home', '/'], ['overview', '/overview'],
  ['space', '/spaces/' + state.space.slug],
  ['task', '/spaces/' + state.space.slug + '/tasks/' + state.mainTask.key],
  ['notifications', '/settings/notifications'],
];
(async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
    const page = await context.newPage();
    await page.goto('http://localhost:3200/login');
    await page.getByLabel('Email', {exact: true}).fill(account.email);
    await page.getByLabel('Password', {exact: true}).fill(account.password);
    await page.getByRole('button', {name: 'Login', exact: true}).click();
    await page.waitForURL(url => url.pathname !== '/login');
    for (const [name, route] of routes) {
      await page.goto('http://localhost:3200' + route);
      await page.getByRole('button', {name: 'Account', exact: true}).waitFor();
      await page.waitForTimeout(1000);
      await page.screenshot({path: path.join(output, name + '.png'), fullPage: true});
      console.log('Captured ' + persona + '/' + name);
    }
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error.message); process.exitCode = 1;});
