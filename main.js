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
} = await Actor.getInput();

const browser = await puppeteer.launch({
    headless: true,
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
    ]
});

const page = await browser.newPage();
await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
await page.setViewport({ width: 1280, height: 800 });

try {
    await Router({ 
        url: `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(searchTerm)}&location=${encodeURIComponent(location)}`,
        page,
        maxJobs,
        li_at
    });
} catch (error) {
    console.error('Error:', error);
} finally {
    await browser.close();
    await Actor.exit();
}
