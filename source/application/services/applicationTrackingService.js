const fs = require('fs').promises;
const { DateTime } = require('luxon');
const Chart = require('chart.js/auto');
const { createCanvas } = require('@napi-rs/canvas');
const path = require('path');

class ApplicationTrackingService {
    async loadData(filename) {
        try {
            const filePath = path.join(__dirname, '..', 'data', filename);
            const data = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            console.error(`Error loading data: ${error}`);
            process.exit(1);
        }
    }

    countApplications(data) {
        const applicationCounts = new Map();
        
        if (Array.isArray(data)) {
            for (const email of data) {
                try {
                    if (!email.internalDate) continue;
                    
                    const date = DateTime.fromMillis(parseInt(email.internalDate));
                    if (!date.isValid) continue;
                    
                    const subject = email.snippet?.toLowerCase() || '';
                    if (subject.includes('your application was sent')) {
                        const dateKey = date.startOf('day').toISO();
                        applicationCounts.set(dateKey, (applicationCounts.get(dateKey) || 0) + 1);
                    }
                } catch (error) {
                    console.error(`Error processing email: ${error}`);
                    continue;
                }
            }
        } else {
            console.error('Expected data to be an array, got:', typeof data);
        }

        return applicationCounts;
    }

    aggregateCounts(applicationCounts) {
        const weekCounts = new Map();
        const monthCounts = new Map();
        const quarterCounts = new Map();
        const yearCounts = new Map();

        for (const [dateStr, count] of applicationCounts) {
            const date = DateTime.fromISO(dateStr);

            // Week aggregation
            const weekStart = date.startOf('week');
            weekCounts.set(weekStart.toISO(), (weekCounts.get(weekStart.toISO()) || 0) + count);

            // Month aggregation
            const monthStart = date.startOf('month');
            monthCounts.set(monthStart.toISO(), (monthCounts.get(monthStart.toISO()) || 0) + count);

            // Quarter aggregation
            const quarterStart = date.startOf('quarter');
            quarterCounts.set(quarterStart.toISO(), (quarterCounts.get(quarterStart.toISO()) || 0) + count);

            // Year aggregation
            const yearStart = date.startOf('year');
            yearCounts.set(yearStart.toISO(), (yearCounts.get(yearStart.toISO()) || 0) + count);
        }

        return {
            day: applicationCounts,
            week: weekCounts,
            month: monthCounts,
            quarter: quarterCounts,
            year: yearCounts
        };
    }

    determinePlotData(countsDict, viewType) {
        const counts = countsDict[viewType];
        if (!counts) {
            console.error(`Invalid view type: ${viewType}`);
            process.exit(1);
        }

        const sortedCounts = Array.from(counts.entries()).sort();
        const labels = sortedCounts.map(([date]) => DateTime.fromISO(date));
        const values = sortedCounts.map(([, count]) => count);
        return { labels, values, level: viewType };
    }

    async generateChart(labels, values, level) {
        const width = 1200;
        const height = 600;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        const formatLabel = (dateTime) => {
            switch (level) {
                case 'day':
                    return dateTime.toFormat('dd/MMM');
                case 'week':
                    return `Week ${dateTime.weekNumber} ${dateTime.toFormat('MMM yyyy')}`;
                case 'month':
                    return dateTime.toFormat('MMM yyyy');
                case 'quarter':
                    return `Q${Math.ceil(dateTime.month / 3)} ${dateTime.year}`;
                case 'year':
                    return dateTime.year.toString();
            }
        };

        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels.map(dt => formatLabel(dt)),
                datasets: [{
                    label: 'Applications',
                    data: values,
                    backgroundColor: 'rgba(54, 162, 235, 0.5)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 2,
                    borderRadius: 4,
                    hoverBackgroundColor: 'rgba(54, 162, 235, 0.7)',
                    hoverBorderColor: 'rgba(54, 162, 235, 1)',
                    hoverBorderWidth: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1,
                            padding: 10,
                            font: {
                                weight: 'bold'
                            }
                        },
                        grid: {
                            drawBorder: true,
                            color: 'rgba(200, 200, 200, 0.3)',
                            borderWidth: 2
                        }
                    },
                    x: {
                        ticks: {
                            maxRotation: 0,
                            minRotation: 0,
                            padding: 10,
                            autoSkip: false,
                            font: {
                                weight: 'bold'
                            }
                        },
                        grid: {
                            display: false
                        }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Applications Over Time',
                        font: {
                            size: 16,
                            weight: 'bold'
                        },
                        padding: 20
                    },
                    legend: {
                        position: 'top',
                        padding: 20,
                        labels: {
                            font: {
                                weight: 'bold'
                            }
                        }
                    }
                },
                layout: {
                    padding: {
                        left: 20,
                        right: 20,
                        top: 20,
                        bottom: 60
                    }
                }
            }
        });

        const buffer = canvas.toBuffer('image/png');
        await fs.writeFile(path.join(__dirname, '..', 'data', 'applications_chart.png'), buffer);
        console.log("success!")
    }
}

module.exports = ApplicationTrackingService; 