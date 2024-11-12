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

# Build counts per month, quarter, and year
month_counts = Counter()
quarter_counts = Counter()
year_counts = Counter()
month_dates = {}
quarter_dates = {}
year_dates = {}

for date_str, count in application_counts.items():
    date = datetime.strptime(date_str, "%A, %d %B %Y")

    # Month aggregation
    month_str = date.strftime('%B %Y')
    month_date = datetime(date.year, date.month, 1)
    month_counts[month_str] += count
    month_dates[month_str] = month_date

    # Quarter aggregation
    q_num = (date.month - 1) // 3 + 1
    quarter_str = f'Q{q_num} {date.year}'
    q_month = 3 * (q_num - 1) + 1
    quarter_date = datetime(date.year, q_month, 1)
    quarter_counts[quarter_str] += count
    quarter_dates[quarter_str] = quarter_date

    # Year aggregation
    year_str = str(date.year)
    year_date = datetime(date.year, 1, 1)
    year_counts[year_str] += count
    year_dates[year_str] = year_date

# Determine the appropriate bin size
max_points = 15  # Maximum number of data points on the x-axis
num_days = len(application_counts)
num_months = len(month_counts)
num_quarters = len(quarter_counts)
num_years = len(year_counts)

if num_days <= max_points:
    # Plot per day
    date_counts = [(datetime.strptime(date_str, "%A, %d %B %Y"), count) for date_str, count in application_counts.items()]
    date_counts.sort()
    x_labels = [dc[0] for dc in date_counts]
    y_values = [dc[1] for dc in date_counts]
    x_formatter = mdates.DateFormatter('%d/%b')
    x_locator = mdates.DayLocator()
    x_rotation = 45
    is_date = True
elif num_months <= max_points:
    # Plot per month
    date_counts = [(month_dates[month_str], month_counts[month_str]) for month_str in month_counts]
    date_counts.sort()
    x_labels = [dc[0] for dc in date_counts]
    y_values = [dc[1] for dc in date_counts]
    x_formatter = mdates.DateFormatter('%b %Y')
    x_locator = mdates.MonthLocator()
    x_rotation = 45
    is_date = True
elif num_quarters <= max_points:
    # Plot per quarter
    sorted_quarters = sorted(quarter_counts.keys(), key=lambda x: quarter_dates[x])
    x_labels = sorted_quarters
    y_values = [quarter_counts[q] for q in sorted_quarters]
    x_positions = range(len(x_labels))
    x_formatter = None
    x_locator = None
    x_rotation = 0
    is_date = False
elif num_years <= max_points:
    # Plot per year
    sorted_years = sorted(year_counts.keys(), key=lambda x: year_dates[x])
    x_labels = sorted_years
    y_values = [year_counts[y] for y in sorted_years]
    x_positions = range(len(x_labels))
    x_formatter = None
    x_locator = None
    x_rotation = 0
    is_date = False
else:
    print("Data is too large to plot.")
    exit()

# Create the plot
plt.figure(figsize=(10, 6))
ax = plt.gca()
ax.set_axisbelow(True)
ax.grid(True, which='both', linestyle='--', linewidth=0.5, zorder=0)

if is_date:
    ax.bar(x_labels, y_values, edgecolor='black', zorder=1)
    ax.xaxis.set_major_formatter(x_formatter)
    if x_locator is not None:
        ax.xaxis.set_major_locator(x_locator)
    plt.xticks(rotation=x_rotation)
else:
    ax.bar(x_positions, y_values, edgecolor='black', zorder=1)
    ax.set_xticks(x_positions)
    ax.set_xticklabels(x_labels, rotation=x_rotation)

ax.yaxis.get_major_locator().set_params(integer=True)

# Set labels and title
plt.xlabel('Date')
plt.ylabel('Number of Applications')
plt.title('Applications Over Time')
plt.tight_layout()
plt.show()
