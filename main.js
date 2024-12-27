// main.js
import { Actor } from 'apify';
import puppeteer from 'puppeteer';
import { getJobListings } from './routes.js';

await Actor.init();

const {
    searchTerm,
    location,
    li_at,
    maxJobs = 50,
} = await Actor.getInput();

const browser = await puppeteer.launch({
    headless: true,
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--disable-notifications'
    ]
});

try {
    await getJobListings({ 
        browser,
        searchTerm,
        location,
        li_at,
        maxJobs
    });
} catch (error) {
    console.error('Error:', error);
} finally {
    await browser.close();
    await Actor.exit();
}
