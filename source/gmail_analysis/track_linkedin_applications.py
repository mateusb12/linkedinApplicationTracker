import json
from collections import Counter
from datetime import datetime
import matplotlib.dates as mdates
import matplotlib.pyplot as plt

# Load the JSON file
with open('email_results.json', 'r', encoding='utf-8') as file:
    data = json.load(file)

# Count the occurrences of application-related emails per day
application_counts = Counter()

for date, emails in data.items():
    for email in emails:
        if 'your application was sent' in email['Subject'].lower():
            application_counts[date] += 1

# Convert date strings to datetime objects for better date handling
dates = [datetime.strptime(date, "%A, %d %B %Y") for date in application_counts.keys()]
counts = list(application_counts.values())

# Create the plot
plt.figure(figsize=(10, 6))
ax = plt.gca()  # Get the current axes

# Ensure grid is below the bars
ax.set_axisbelow(True)

# Add a thin grid
ax.grid(True, which='both', linestyle='--', linewidth=0.5, zorder=0)

# Plot the bars with a higher zorder to ensure they appear above the grid
ax.bar(dates, counts, edgecolor='black', zorder=1)  # Add a black outline to the bars

# Set integer values for Y-axis
ax.yaxis.get_major_locator().set_params(integer=True)

# Format the X-axis to show dates as "day/month" and only display dates with data
ax.xaxis.set_major_formatter(mdates.DateFormatter('%d/%b'))
ax.xaxis.set_major_locator(mdates.DayLocator(interval=1))
plt.xticks(dates, rotation=0)

# Set labels and title
plt.xlabel('Data')
plt.ylabel('Número de vagas aplicadas')
plt.title('Vagas aplicadas por dia')
plt.tight_layout()
plt.show()
