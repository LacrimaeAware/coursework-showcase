import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { loadOverviews } from './build_overviews.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const base = (process.env.SHOWCASE_BASE || 'http://127.0.0.1:4192').replace(/\/$/, '');
const origin = new URL(base).origin;
const output = path.join(root, 'tmp/browser-expanded');
const catalog = JSON.parse(await readFile(path.join(root, 'content/catalog.json'), 'utf8'));
const history = JSON.parse(await readFile(path.join(root, 'content/history.json'), 'utf8'));
const overviewMap = await loadOverviews(root);
const captureList = (value, fallback) => new Set((value === undefined ? fallback : value).split(',').map(value => value.trim()).filter(Boolean));
const captureCourses = captureList(process.env.SHOWCASE_CAPTURE_COURSES, 'deep-learning');
const captureItems = captureList(process.env.SHOWCASE_CAPTURE_ITEMS, 'holism-speech');
const captures = (selection, id) => selection.has('*') || selection.has(id);
const slash = String.fromCharCode(92);
const viewports = [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 720 }];

function sourceCounts(html) {
  const source = html.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|textarea|pre|code)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  const prose = source.replace(/<[^>]+>/g, ' ');
  return {
    mathExpressions: prose.split(slash + '(').length - 1 + prose.split(slash + '[').length - 1,
    headings: (source.match(/<h[2-6]\b/gi) || []).length,
    figures: (source.match(/<figure\b/gi) || []).length,
    images: (source.match(/<img\b/gi) || []).length,
    disclosures: (source.match(/<details\b/gi) || []).length,
    sourceLinks: 0,
    viewports: []
  };
}

const courses = [];
for (const id of catalog.courses) {
  const course = JSON.parse(await readFile(path.join(root, 'content', id, 'course.json'), 'utf8'));
  const chapters = [];
  for (const chapter of course.chapters) {
    const source = await readFile(path.join(root, 'content', id, chapter.slug + '.html'), 'utf8');
    chapters.push({ ...chapter, ...sourceCounts(source) });
  }
  assert.ok(chapters.length > 0, 'Course has no chapters: ' + id);
  courses.push({ ...course, id, chapters });
}
const overviews = history.courses.map(course => ({ ...course, ...overviewMap.get(course.id), viewports: [] }));
const items = [];
for (const item of catalog.items) {
  const source = await readFile(path.join(root, 'content', item.section, item.slug + '.html'), 'utf8');
  items.push({ ...item, ...sourceCounts(source) });
}
const courseURL = course => base + '/courses/' + course.id + '/index.html';
const chapterURL = (course, index) => base + '/courses/' + course.id + '/' + course.chapters[index].slug + '.html';
const itemURL = item => base + '/' + item.section + '/' + item.slug + '/index.html';
const historyURL = base + '/history/index.html';
const shouldCapture = width => width === 1440 || width === 390;
const screenName = width => width === 1440 ? 'desktop' : 'phone';

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
for (const id of captureCourses) assert.ok(id === '*' || courses.some(course => course.id === id), 'Unknown screenshot course: ' + id);
for (const id of captureItems) assert.ok(id === '*' || items.some(item => item.slug === id), 'Unknown screenshot work: ' + id);
const errors = [], externalRequests = [], checkedAssets = new Set(), checkedHistoryLinks = new Set();
const report = {
  courses, items, overviews,
  history: { rows: history.courses.length, years: [...new Set(history.courses.map(course => course.year))].sort((a, b) => a - b), viewports: [], checkedWorkLinks: [] },
  capture: { courses: [...captureCourses], items: [...captureItems] },
  viewports: viewports.map(viewport => viewport.width), checks: [], screenshots: [], checkedAssets: []
};
const page = await browser.newPage({ viewport: viewports[0] });
page.setDefaultTimeout(15000);
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => {
  const url = request.url();
  if (!url.startsWith('data:') && !url.startsWith('blob:') && new URL(url).origin !== origin) externalRequests.push(url);
});

async function finishRendering(math) {
  if (math > 0) {
    await page.waitForFunction(() => window.MathJax?.startup?.promise);
    await page.evaluate(async () => { await window.MathJax.startup.promise; });
  }
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
  });
  assert.equal(await page.locator('mjx-container').count(), math, 'Rendered math count must match content source: ' + page.url());
  assert.equal(await page.locator('mjx-merror,[data-mjx-error]').count(), 0, 'MathJax errors: ' + page.url());
  assert.ok(await page.locator('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)), 'Broken or unloaded image: ' + page.url());
  assert.equal(await page.locator('.overview-source,.history-source,.course-archive-link,.history-archive').count(), 0, 'Retired public source/archive UI: ' + page.url());
}

async function noOverflow(label) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal page overflow: ' + label);
}

async function screenshot(filename) {
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: path.join(output, filename), fullPage: true });
  report.screenshots.push(filename);
}

async function checkHome(width) {
  await finishRendering(0);
  assert.equal(await page.getByRole('heading', { name: 'Coursework', exact: true }).count(), 1);
  assert.equal(await page.getByRole('heading', { name: 'Selected coursework', exact: true }).count(), 1);
  assert.equal(await page.locator('.course-entry').count(), courses.length);
  for (const [index, course] of courses.entries()) {
    const entry = page.locator('.course-entry').nth(index);
    assert.equal(await entry.locator('h3').innerText(), course.title);
    assert.ok((await entry.locator('.entry-context').innerText()).includes(course.chapters.length + ' selected topics'));
    if (course.coverage) assert.equal(await entry.locator('.course-coverage').innerText(), course.coverage);
    assert.equal(new URL(await entry.locator('h3 a').getAttribute('href'), page.url()).href, courseURL(course));
    const chapters = entry.locator('.course-entry-chapters a');
    assert.equal(await chapters.count(), course.chapters.length);
    for (let chapter = 0; chapter < course.chapters.length; chapter++) {
      assert.equal(new URL(await chapters.nth(chapter).getAttribute('href'), page.url()).href, chapterURL(course, chapter));
    }
  }
  const workLinks = page.locator('.work-list-link');
  assert.equal(await workLinks.count(), items.length);
  for (const item of items) {
    const link = workLinks.filter({ has: page.getByRole('heading', { name: item.title, exact: true }) });
    assert.equal(await link.count(), 1);
    assert.equal(new URL(await link.getAttribute('href'), page.url()).href, itemURL(item));
  }
  const historyLink = page.locator('.collection-nav').getByRole('link', { name: 'Coursework', exact: true });
  assert.equal(await historyLink.count(), 1, 'Coursework navigation must open all courses');
  assert.equal(new URL(await historyLink.getAttribute('href'), page.url()).href, historyURL);
  await noOverflow('home at ' + width + 'px');
}

async function checkHistory(width) {
  await finishRendering(0);
  assert.equal(await page.locator('h1').innerText(), 'All courses');
  const rows = page.locator('[data-history-course]');
  const expected = [...history.courses].sort((a, b) => a.year - b.year);
  assert.equal(await rows.count(), expected.length, 'History course count must match source catalog');
  assert.deepEqual(await rows.evaluateAll(elements => elements.map(element => element.dataset.historyCourse)), expected.map(course => course.id));
  for (const [index, course] of expected.entries()) {
    const row = rows.nth(index);
    assert.equal(await row.locator('.history-course-title').innerText(), course.title);
    const overviewLink = row.locator('.history-course-title a');
    assert.equal(await overviewLink.count(), 1, 'Every course title must open its overview: ' + course.id);
    assert.equal(new URL(await overviewLink.getAttribute('href'), page.url()).href, courseURL(course));
    assert.equal(await row.locator('th').innerText(), course.term);
    assert.equal(await row.locator('small').innerText(), course.code + ' · ' + course.school);
    if (catalog.courses.includes(course.id)) {
      const link = row.locator('.history-work');
      assert.equal(await link.count(), 1, 'Featured course missing from history: ' + course.id);
      assert.equal(new URL(await link.getAttribute('href'), page.url()).href, courseURL(course) + '#selected-work');
    }
  }
  const workLinks = await page.locator('.history-work').evaluateAll(links => links.map(link => link.href));
  for (const url of workLinks) {
    assert.equal(new URL(url).origin, origin, 'History work must remain inside the collection');
    if (checkedHistoryLinks.has(url)) continue;
    const response = await page.request.get(url);
    assert.equal(response.status(), 200, 'History work response: ' + url);
    assert.ok((await response.body()).length > 0, 'Empty history work: ' + url);
    checkedHistoryLinks.add(url);
    report.history.checkedWorkLinks.push(new URL(url).pathname);
  }
  const years = report.history.years;
  const jumps = page.locator('.history-years a');
  assert.equal(await jumps.count(), years.length);
  for (const [index, year] of years.entries()) {
    const target = '#year-' + year;
    assert.equal(await jumps.nth(index).getAttribute('href'), target);
    assert.equal(await jumps.nth(index).innerText(), String(year));
    assert.equal(await page.locator(target).count(), 1);
    assert.equal(await page.locator(target + ' [data-history-course]').count(), history.courses.filter(course => course.year === year).length);
    await jumps.nth(index).click();
    await page.waitForURL(historyURL + target);
    await noOverflow('history year navigation at ' + width + 'px');
  }
  report.history.viewports.push(width);
  await noOverflow('course history at ' + width + 'px');
}

async function checkOverview(course, width) {
  await finishRendering(0);
  const featured = courses.find(selected => selected.id === course.id);
  assert.equal(await page.locator('h1').innerText(), featured?.title || course.title);
  const overview = page.locator('.course-overview');
  assert.equal(await overview.count(), 1, 'One course overview: ' + course.id);
  assert.ok(await overview.isVisible(), 'Course overview must be visible: ' + course.id);
  const heading = overview.getByRole('heading', { name: 'Course overview', exact: true });
  assert.equal(await heading.count(), 1);
  assert.ok(await heading.isVisible(), 'Course overview heading must be visible: ' + course.id);
  const topics = overview.locator('h3');
  assert.deepEqual(await topics.allTextContents(), course.topics.map(topic => topic.title));
  for (let index = 0; index < course.topics.length; index++) {
    assert.ok(await topics.nth(index).isVisible(), 'Hidden topic heading: ' + course.id + ' / ' + course.topics[index].title);
  }
  const normalize = text => text.replace(/\s+/g, ' ').trim();
  const content = normalize(await overview.innerText());
  for (const topic of course.topics) assert.ok(content.includes(normalize(topic.description)), 'Missing topic description: ' + course.id + ' / ' + topic.title);
  const pageText = normalize(await page.locator('main').innerText());
  assert.ok(pageText.includes(normalize(course.summary)), 'Missing course summary: ' + course.id);
  if (featured) {
    assert.equal(await page.locator('#selected-work').count(), 1, 'Deeper work needs its own section: ' + course.id);
    assert.equal(await page.locator('#selected-work .contents-list a.contents-row').count(), featured.chapters.length);
  }
  if (!course.viewports.includes(width)) course.viewports.push(width);
  await noOverflow(course.id + ' overview at ' + width + 'px');
}

async function checkContents(course, width) {
  await finishRendering(0);
  assert.equal(await page.locator('h1').innerText(), course.title);
  assert.equal(await page.locator('.study-context').innerText(), course.term);
  assert.ok((await page.locator('.course-jump a[href="#selected-work"]').innerText()).includes(course.chapters.length + ' selected topic groups'));
  if (course.coverage) assert.equal(await page.locator('.course-coverage').innerText(), course.coverage);
  assert.equal(await page.getByRole('heading', {name:'Course overview',exact:true}).count(), 1);
  assert.equal(await page.locator('#selected-work').count(), 1);
  const links = page.locator('#selected-work .contents-list a.contents-row');
  assert.equal(await links.count(), course.chapters.length);
  assert.deepEqual(await links.locator('h3').allTextContents(), course.chapters.map(chapter => chapter.title));
  for (let index = 0; index < course.chapters.length; index++) {
    assert.equal(new URL(await links.nth(index).getAttribute('href'), page.url()).href, chapterURL(course, index));
  }
  assert.equal(await page.locator('details[open]').count(), 0);
  await noOverflow(course.id + ' contents at ' + width + 'px');
}

async function checkAssets(record) {
  const links = await page.locator('.chapter-body a[href]').evaluateAll(anchors => anchors
    .filter(anchor => anchor.hasAttribute('download') || /\.(py|m|r|java|zip|json|csv|txt|ipynb|pdf|rtf|html?)([?#]|$)/i.test(anchor.getAttribute('href')))
    .map(anchor => anchor.href));
  const local = [...new Set(links.filter(href => new URL(href).origin === origin && new URL(href).pathname.includes('/assets/')))];
  record.sourceLinks = local.length;
  if (record.section !== 'essays' && (!record.format || record.format === 'default')) {
    assert.ok(local.length > 0, 'Missing source/result asset: ' + record.slug);
  }
  for (const url of local) {
    if (checkedAssets.has(url)) continue;
    const response = await page.request.get(url);
    assert.equal(response.status(), 200, 'Source/download response: ' + url);
    assert.ok((await response.body()).length > 0, 'Empty source/download: ' + url);
    checkedAssets.add(url);
    report.checkedAssets.push(new URL(url).pathname);
  }
}

async function checkBody(record, width) {
  await finishRendering(record.mathExpressions);
  assert.equal(await page.locator('.chapter-body').count(), 1);
  assert.equal(await page.locator('.chapter-body :is(h2,h3,h4,h5,h6)').count(), record.headings, 'Heading count: ' + record.slug);
  assert.ok(await page.locator('.chapter-body :is(h2,h3,h4,h5,h6)').evaluateAll(headings => headings.every(heading => heading.textContent.trim().length > 0)), 'Empty heading: ' + record.slug);
  assert.equal(await page.locator('.chapter-body figure').count(), record.figures, 'Figure count: ' + record.slug);
  assert.equal(await page.locator('.chapter-body img').count(), record.images, 'Image count: ' + record.slug);
  assert.equal(await page.locator('.chapter-body details').count(), record.disclosures, 'Disclosure count: ' + record.slug);
  assert.equal(await page.locator('details[open]').count(), 0, 'Disclosures must start closed: ' + record.slug);
  if (width === 1440) await checkAssets(record);
  await noOverflow(width + 'px ' + record.slug);
  if (!record.viewports.includes(width)) record.viewports.push(width);
}

async function checkChapter(course, index, width) {
  const chapter = course.chapters[index];
  await checkBody(chapter, width);
  assert.equal((await page.locator('.book-title h1').innerText()).replace(/^\d+\.\s*/, '').trim(), chapter.title);
  if (!chapter.format || chapter.format === 'default') assert.ok(chapter.figures > 0, 'Missing figure: ' + course.id + '/' + chapter.slug);
  const sidebar = page.locator('.book-sidebar .book-chapters a');
  assert.equal(await sidebar.count(), course.chapters.length);
  for (let navIndex = 0; navIndex < course.chapters.length; navIndex++) {
    assert.equal(new URL(await sidebar.nth(navIndex).getAttribute('href'), page.url()).href, chapterURL(course, navIndex));
    assert.equal((await sidebar.nth(navIndex).innerText()).replace(/^\d+\s*/, '').trim(), course.chapters[navIndex].shortTitle);
  }
  for (const navigation of ['.book-sidebar', '.book-mobile-bar']) {
    const current = page.locator(navigation + ' a[aria-current="page"]');
    assert.equal(await current.count(), 1);
    assert.equal(new URL(await current.getAttribute('href'), page.url()).href, chapterURL(course, index));
  }
  assert.equal(await page.locator('[data-reader-prev]').count(), index > 0 ? 1 : 0);
  assert.equal(await page.locator('[data-reader-next]').count(), index < course.chapters.length - 1 ? 1 : 0);
  if (index > 0) assert.equal(new URL(await page.locator('[data-reader-prev]').getAttribute('href'), page.url()).href, chapterURL(course, index - 1));
  if (index < course.chapters.length - 1) assert.equal(new URL(await page.locator('[data-reader-next]').getAttribute('href'), page.url()).href, chapterURL(course, index + 1));
  assert.equal(await page.locator('.book-sidebar').isVisible(), width > 720);
  assert.equal(await page.locator('.book-mobile-bar').isVisible(), width <= 720);
}

async function checkSpeech() {
  const script = page.locator('#speech-script');
  assert.equal(await script.count(), 1, 'Full speech must be present on the page');
  assert.ok(await script.isVisible(), 'Full speech must be readable without opening a disclosure');
  const paragraphs = script.locator('p[data-source-paragraph]');
  assert.deepEqual(await paragraphs.evaluateAll(elements => elements.map(element => Number(element.dataset.sourceParagraph))), [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12]);
  assert.equal(await script.locator('p[data-source-paragraph]:not(.essay-references)').count(), 6, 'Six delivered speech paragraphs');
  assert.equal(await script.locator('p.essay-references').count(), 5, 'Five complete references');
  assert.equal(await page.locator('a[href*="selected-passages-and-outline"]').count(), 0, 'Retired selected-passages download');
  const read = page.getByRole('link', { name: 'Read the full speech', exact: true });
  assert.equal(await read.count(), 1);
  assert.equal(await read.getAttribute('href'), '#speech-script');
  await read.click();
  await page.waitForURL(itemURL({ section: 'essays', slug: 'holism-speech' }) + '#speech-script');
}

async function checkDisclosures(record, width) {
  const details = page.locator('.chapter-body details');
  if (await details.count()) {
    const first = details.first();
    await first.locator(':scope > summary').focus();
    await page.keyboard.press('Enter');
    assert.equal(await first.getAttribute('open'), '');
    await page.keyboard.press('Enter');
    assert.equal(await first.getAttribute('open'), null);
  }
  await details.evaluateAll(elements => elements.forEach(detail => { detail.open = true; }));
  await noOverflow('expanded disclosures, ' + width + 'px ' + record.slug);
  assert.equal(await page.locator('mjx-merror,[data-mjx-error]').count(), 0);
  await details.evaluateAll(elements => elements.forEach(detail => { detail.open = false; }));
}

async function checkKeyboard(course) {
  if (course.chapters.length > 1) {
    const index = Math.min(2, course.chapters.length - 2);
    await page.locator('.book-sidebar .book-chapters a').nth(index).click();
    await page.waitForURL(chapterURL(course, index));
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('ArrowRight');
    await page.waitForURL(chapterURL(course, index + 1));
    await page.keyboard.press('ArrowLeft');
    await page.waitForURL(chapterURL(course, index));
    await page.locator('[data-reader-next]').click();
    await page.waitForURL(chapterURL(course, index + 1));
    await page.locator('[data-reader-prev]').click();
    await page.waitForURL(chapterURL(course, index));
  }
  await page.goto(chapterURL(course, 0), { waitUntil: 'networkidle' });
  await page.keyboard.press('ArrowLeft');
  assert.equal(page.url(), chapterURL(course, 0));
  await page.goto(chapterURL(course, course.chapters.length - 1), { waitUntil: 'networkidle' });
  await page.keyboard.press('ArrowRight');
  assert.equal(page.url(), chapterURL(course, course.chapters.length - 1));
}

async function checkMobileMenu(course, width) {
  const menu = page.locator('.book-mobile-bar details');
  assert.equal(await menu.getAttribute('open'), null);
  await menu.locator(':scope > summary').focus();
  await page.keyboard.press('Enter');
  assert.equal(await menu.getAttribute('open'), '');
  const links = menu.locator('.book-chapters a');
  assert.equal(await links.count(), course.chapters.length);
  for (let index = 0; index < course.chapters.length; index++) {
    assert.equal(new URL(await links.nth(index).getAttribute('href'), page.url()).href, chapterURL(course, index));
  }
  await noOverflow(course.id + ' open chapter menu at ' + width + 'px');
  await links.first().click();
  await page.waitForURL(chapterURL(course, 0));
  assert.equal(await page.locator('.book-mobile-bar details').getAttribute('open'), null);
}

try {
  for (const viewport of viewports) {
    const width = viewport.width;
    await page.setViewportSize(viewport);
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    await checkHome(width);
    if (shouldCapture(width)) await screenshot('home-' + screenName(width) + '.png');
    if (width === 1440) {
      await page.locator('.collection-nav').getByRole('link', { name: 'Coursework', exact: true }).click();
      await page.waitForURL(historyURL);
    } else await page.goto(historyURL, { waitUntil: 'networkidle' });
    await checkHistory(width);
    if (shouldCapture(width)) await screenshot('history-' + screenName(width) + '.png');
    await page.getByRole('link', { name: 'All coursework', exact: true }).click();
    await checkHome(width);
    if (width === 1440 || width === 390) {
      for (const course of overviews) {
        const response = await page.goto(courseURL(course), { waitUntil: 'networkidle' });
        assert.equal(response.status(), 200, 'Course overview response: ' + course.id);
        await checkOverview(course, width);
        if (course.id === 'anatomy') await screenshot('anatomy-overview-' + screenName(width) + '.png');
      }
    }
    for (const course of courses) {
      if (width === 1440) {
        await page.goto(base + '/', { waitUntil: 'networkidle' });
        await page.locator('.course-entry h3 a').filter({ hasText: course.title }).click();
        await page.waitForURL(courseURL(course));
      } else await page.goto(courseURL(course), { waitUntil: 'networkidle' });
      await checkContents(course, width);
      if (captures(captureCourses, course.id) && shouldCapture(width)) await screenshot(course.id + '-contents-' + screenName(width) + '.png');
      await page.locator('.contents-list a.contents-row').first().click();
      for (let index = 0; index < course.chapters.length; index++) {
        await page.waitForURL(chapterURL(course, index));
        await checkChapter(course, index, width);
        if (captures(captureCourses, course.id) && shouldCapture(width)) await screenshot(course.id + '-' + course.chapters[index].slug + '-' + screenName(width) + '.png');
        await checkDisclosures(course.chapters[index], width);
        if (index < course.chapters.length - 1) await page.locator('[data-reader-next]').click();
      }
      if (width === 1440) await checkKeyboard(course);
      if (width <= 720) await checkMobileMenu(course, width);
      if (width === 320) {
        const index = Math.min(3, course.chapters.length - 1);
        await page.goto(chapterURL(course, index), { waitUntil: 'networkidle' });
        await checkChapter(course, index, width);
        await page.reload({ waitUntil: 'networkidle' });
        await checkChapter(course, index, width);
        await page.getByRole('link', { name: 'All coursework', exact: true }).click();
        await checkHome(width);
      }
    }
    for (const item of items) {
      await page.goto(itemURL(item), { waitUntil: 'networkidle' });
      await checkBody(item, width);
      assert.equal(await page.locator('.work-title h1').innerText(), item.title);
      assert.equal(await page.locator('.work-title .study-context').innerText(), item.context);
      if (item.slug === 'holism-speech') await checkSpeech();
      if (captures(captureItems, item.slug) && shouldCapture(width)) await screenshot(item.slug + '-' + screenName(width) + '.png');
      await checkDisclosures(item, width);
      if (width === 1440) {
        await page.getByRole('link', { name: 'All coursework', exact: true }).click();
        await checkHome(width);
      }
    }
  }
  report.checks.push('Catalog home, ordered contents and every chapter through Next links at all four widths; source-derived math, heading, figure, image and disclosure counts');
  report.checks.push('Every course sidebar, mobile current markers and menus, Previous/Next links, ArrowLeft/ArrowRight and chapter boundaries, direct URLs and reloads');
  report.checks.push('All selected works: exact title/context, local source/download responses, return to coursework, default and expanded-disclosure overflow');
  report.checks.push('Every course has a source-matched overview, visible topic headings and descriptions, and summary at 1440px and 390px, without horizontal overflow or retired source/archive UI');
  report.checks.push('Complete All courses index: source-matched rows, terms and course codes, every title linking its own overview, selected-work anchors and HTTP responses, every year anchor and return navigation at all four widths');
  report.checks.push('Full Speech: six delivered paragraphs, five references, readable on-page script and working Read the full speech anchor; no selected-passages download');

  const biology = courses.find(course => course.id === 'systems-biology');
  assert.ok(biology, 'Legacy biology redirect requires its catalog course');
  for (const [fragment, slug] of [['trajectories', '05-stochastic-reactions'], ['model', '05-stochastic-reactions'], ['variability', '06-product-variability']]) {
    const index = biology.chapters.findIndex(chapter => chapter.slug === slug);
    assert.ok(index >= 0, 'Missing legacy redirect chapter: ' + slug);
    await page.goto(base + '/exercises/enzyme-simulations/index.html#' + fragment, { waitUntil: 'networkidle' });
    await page.waitForURL(chapterURL(biology, index) + (fragment === 'model' ? '#model' : ''));
    await checkChapter(biology, index, 320);
  }
  report.checks.push('Legacy enzyme trajectories, model and variability fragments resolve to the appropriate biology chapters');

  assert.deepEqual(errors, [], 'Browser errors');
  assert.deepEqual(externalRequests, [], 'External runtime requests');
  report.browserErrors = errors;
  report.externalRequests = externalRequests;
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  const chapters = courses.flatMap(course => course.chapters);
  const mathTotal = [...chapters, ...items].reduce((sum, record) => sum + record.mathExpressions, 0);
  console.log('PASS: ' + overviews.length + ' course overviews at 1440/390px, ' + courses.length + ' deeper course readers, ' + chapters.length + ' chapters, ' + items.length + ' selected works, ' + history.courses.length + ' history rows, ' + mathTotal + ' source-derived math expressions; ' + report.viewports.join('/') + 'px; navigation, applicable figures/downloads, full speech, all-course links, expanded disclosures and legacy redirects; ' + report.screenshots.length + ' screenshots; zero browser errors or external requests.');
} finally { await browser.close(); }
