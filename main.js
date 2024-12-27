// main.js
import { Actor } from 'apify';
import { getJobListings } from './routes.js';
import puppeteer from 'puppeteer';

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
        '--disable-gpu'
    ]
});

try {
    const page = await browser.newPage();
    await getJobListings(page, 
        `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(searchTerm)}&location=${encodeURIComponent(location)}`,
        maxJobs,
        li_at
    );
} catch (error) {
    console.error('Error:', error);
} finally {
    await browser.close();
    await Actor.exit();
}
