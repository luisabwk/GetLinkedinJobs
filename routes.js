import { Dataset, createPuppeteerRouter } from 'crawlee';
import { getJobDetails } from './job-details.js';
import { extractJobListings } from './scrape-jobs.js';

export const router = createPuppeteerRouter();

router.addHandler('LIST', async ({ request, page, log, crawler }) => {
    log.info('Processing job listings page');
    const input = await crawler.getInput();
    const jobs = await extractJobListings(page, input.maxJobs);
    
    for (const job of jobs.vagas) {
        await crawler.addRequests([{
            url: job.link,
            userData: { 
                label: 'DETAIL',
                baseJob: job
            }
        }]);
    }
});

router.addHandler('DETAIL', async ({ request, page, log }) => {
    log.info('Processing job detail');
    const jobDetails = await getJobDetails(page);
    await Dataset.pushData({
        ...request.userData.baseJob,
        ...jobDetails
    });
});
