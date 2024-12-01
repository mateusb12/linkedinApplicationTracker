const ApplicationTrackingService = require('../services/applicationTrackingService');

async function main() {
    const tracker = new ApplicationTrackingService();
    const filename = 'email_results.json';

    try {
        const data = await tracker.loadData(filename);
        const applicationCounts = tracker.countApplications(data);

        if (applicationCounts.size === 0) {
            console.log("No application emails found.");
            process.exit(0);
        }

        const countsDict = tracker.aggregateCounts(applicationCounts);
        const maxPoints = 10;
        const { labels, values, level } = tracker.determinePlotData(countsDict, maxPoints);

        await tracker.generateChart(labels, values, level);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
} 