// Real portal + website plan editors, real controllers, disposable Mongo. No production services.
const assert = require('node:assert/strict');
const path = require('node:path');
const backend = path.resolve(__dirname, '../../backend');
const website = path.resolve(__dirname, '../../merasoftware');
const portal = path.resolve(__dirname, '..');
const dep = name => require(path.join(backend, 'node_modules', name));
const { build } = require(path.join(website, 'node_modules/esbuild'));
const { chromium } = require(path.join(website, 'node_modules/playwright'));
const mongoose = dep('mongoose');
const { MongoMemoryReplSet } = dep('mongodb-memory-server');
const express = dep('express');
(async () => {
  let db, server, browser;
  try {
    db = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(db.getUri());
    const User = require(path.join(backend, 'models/userModel'));
    const Product = require(path.join(backend, 'models/productModel'));
    const Category = require(path.join(backend, 'models/categoryBasePriceModel'));
    const Legacy = require(path.join(backend, 'models/servicePlanCategoryModel'));
    await Promise.all([Product.init(), Category.init(), Legacy.init()]);
    const admin = await User.create({ name: 'Admin', email: 'category-admin@example.test', roles: ['admin'] });
    const catalogue = require(path.join(backend, 'controller/admin/planCatalogue'));
    const categories = require(path.join(backend, 'controller/admin/planCategories'));
    const app = express(); app.use(express.json()); app.use((req, res, next) => { req.userId = admin._id; req.userRole = 'admin'; next(); });
    app.get('/api/admin/plan-catalogue', catalogue.listPlanCatalogueController);
    app.patch('/api/admin/plan-catalogue', catalogue.savePlanController);
    app.patch('/api/admin/plan-catalogue/quote', catalogue.quotePlanController);
    app.patch('/api/admin/plan-categories', categories.savePlanCategoryController);
    app.post('/api/admin/category-base-prices', require(path.join(backend, 'controller/admin/updateCategoryBasePrice')));
    // Website proxy fixture mirrors only transport; the real backend controllers own all writes.
    app.get('/api/plans', async (req, res) => res.json(await require(path.join(backend, 'helpers/servicePlanCatalogue')).listPlanCatalogue()));
    app.patch('/api/plans', (req, res) => {
      const { target, ...body } = req.body; req.body = body;
      const original = res.json.bind(res); res.json = result => original(result.success ? result.data : { error: result.message });
      return (target === 'category' ? categories.savePlanCategoryController : target === 'quote' ? catalogue.quotePlanController : catalogue.savePlanController)(req, res);
    });
    const bundles = {};
    for (const kind of ['portal', 'website']) {
      const component = kind === 'portal' ? path.join(portal, 'src/components/admin/AdminPlansManager.js') : path.join(website, 'src/app/admin/plans/plans-manager.tsx');
      const source = `import React,{useState,useEffect} from 'react'; import {createRoot} from 'react-dom/client';
        import {createMemoryRouter,RouterProvider} from '${path.join(portal, 'node_modules/react-router-dom').replaceAll('\\', '/')}';
        import {PlansManager} from '${component.replaceAll('\\', '/')}';
        function App(){const [initial,setInitial]=useState(null);useEffect(()=>{fetch('/api/plans').then(r=>r.json()).then(setInitial)},[]);return initial?<PlansManager initial={initial}/>:<p>Loading</p>}
        createRoot(document.getElementById('root')).render(<RouterProvider router={createMemoryRouter([{path:'/',element:<App/>}])}/>);`;
      const result = await build({ bundle: true, write: false, platform: 'browser', jsx: 'automatic',
        loader: { '.js': 'jsx' }, plugins: [{ name: 'fixture-css', setup(builder) { builder.onLoad({ filter: /\.css$/ }, () => ({ contents: 'export default {}', loader: 'js' })); } }], alias: { '@': path.join(website, 'src'), react: path.join(website, 'node_modules/react'), 'react-dom': path.join(website, 'node_modules/react-dom') },
        define: { 'process.env.NODE_ENV': '"production"', 'process.env.REACT_APP_BACKEND_URL': '""' },
        stdin: { contents: source, resolveDir: portal, loader: 'jsx' } });
      bundles[kind] = result.outputFiles[0].text;
    }
    app.get('/bundle/:kind', (req, res) => res.type('js').send(bundles[req.params.kind]));
    app.get('/:kind', (req, res) => res.type('html').send(`<div id="root"></div><script src="/bundle/${req.params.kind}"></script>`));
    await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true });
    for (const kind of ['portal', 'website']) {
      const page = await browser.newPage(); const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${origin}/${kind}`);
      await page.getByRole('button', { name: 'New plan +' }).click();
      const name = page.getByLabel('Plan name', { exact: true });
      await name.fill(`Preserved ${kind} plan`);
      await page.getByLabel('Plan category', { exact: true }).selectOption('app_development');
      await page.getByRole('button', { name: '+ New category', exact: true }).click();
      let dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      assert.equal(await name.inputValue(), `Preserved ${kind} plan`);
      assert.equal(await Category.countDocuments(), kind === 'portal' ? 0 : 1);
      await page.getByRole('button', { name: '+ New category', exact: true }).click();
      dialog = page.getByRole('dialog');
      await dialog.getByLabel('Category name', { exact: true }).fill(`${kind} Marketing`);
      await dialog.getByRole('button', { name: 'Create category', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'detached' });
      assert.equal(await name.inputValue(), `Preserved ${kind} plan`);
      assert.equal(await page.getByLabel('Plan category', { exact: true }).inputValue(), `${kind}_marketing`);
      assert.equal(await Product.countDocuments(), kind === 'portal' ? 0 : 1, 'Nested category form must not submit the plan');
      await page.getByRole('button', { name: 'Create plan', exact: true }).click();
      await page.getByRole('heading', { name: 'Edit plan', exact: true }).waitFor();
      const saved = await Product.findOne({ serviceName: `Preserved ${kind} plan` }).lean();
      assert.equal(saved.servicePlan.projectCategoryKey, `${kind}_marketing`);
      const main = await Category.findOne({ category: `${kind}_marketing` }).lean();
      assert.equal(main.customerSelectable, false); assert.equal(main.basePrice, null);
      assert.equal(await Legacy.countDocuments(), 0);
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`${kind}: main category selection, cancel, shared creation, auto-selection, preserved draft and real plan save passed`);
    }
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect(); if (db) await db.stop();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
