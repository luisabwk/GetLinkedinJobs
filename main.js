// main.js
import { Actor } from 'apify';
import puppeteer from 'puppeteer';
import { Router } from './routes.js';

await Actor.init();

const {
    searchTerm,
    location,
    li_at,
    maxJobs = 25,
    timeout = 60000,
} = await Actor.getInput();

const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox']
});

const page = await browser.newPage();

await page.setExtraHTTPHeaders({
    'Cookie': `li_at=${li_at}`
});

try {
    await Router({ 
        url: `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(searchTerm)}&location=${encodeURIComponent(location)}`,
        page,
        maxJobs
    });
} catch (error) {
    console.error('Error:', error);
} finally {
    await browser.close();
    await Actor.exit();
}
