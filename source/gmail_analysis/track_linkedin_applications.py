import json
from collections import Counter
from datetime import datetime, timedelta
import matplotlib.dates as mdates
import matplotlib.pyplot as plt
from matplotlib import ticker
import sys


def load_data(filename):
    """Load the JSON file containing email data."""
    try:
        with open(filename, 'r', encoding='utf-8') as file:
            return json.load(file)
    except Exception as e:
        print(f"Error loading data: {e}")
        sys.exit(1)


def count_applications(data):
    """Count the number of application-related emails per day."""
    application_counts = Counter()
    date_format = "%A, %d %B %Y"

    for date_str, emails in data.items():
        try:
            date = datetime.strptime(date_str, date_format)
        except ValueError as e:
            print(f"Error parsing date '{date_str}': {e}")
            continue  # Skip this entry and continue with the next

        for email in emails:
            subject = email.get('Subject', '').lower()
            if 'your application was sent' in subject:
                application_counts[date] += 1

    return application_counts


def aggregate_counts(application_counts):
    """Aggregate counts per week, month, quarter, and year."""
    week_counts = Counter()
    month_counts = Counter()
    quarter_counts = Counter()
    year_counts = Counter()

    for date, count in application_counts.items():
        # Week aggregation: find the Monday of the week
        week_start = date - timedelta(days=date.weekday())  # Monday
        week_start = datetime(week_start.year, week_start.month, week_start.day)
        week_counts[week_start] += count

        # Month aggregation
        month_date = datetime(date.year, date.month, 1)
        month_counts[month_date] += count

        # Quarter aggregation
        q_num = (date.month - 1) // 3 + 1
        q_month = 3 * (q_num - 1) + 1
        quarter_date = datetime(date.year, q_month, 1)
        quarter_counts[quarter_date] += count

        # Year aggregation
        year_date = datetime(date.year, 1, 1)
        year_counts[year_date] += count

    return {
        'day': application_counts,
        'week': week_counts,
        'month': month_counts,
        'quarter': quarter_counts,
        'year': year_counts
    }


def week_of_month(date):
    """Return the week number within the month for the specified date."""
    first_day = date.replace(day=1)
    dom = date.day
    adjusted_dom = dom + first_day.weekday()
    week_number = int((adjusted_dom - 1) / 7)
    return week_number



def custom_week_formatter(x, pos=None):
    """
    Custom formatter for week labels.
    Formats as 'Week X\nMonth\nYear', e.g., 'Week 3\nAugust\n2024'.
    """
    if isinstance(x, datetime):
        week_num = week_of_month(x)
        month_name = x.strftime('%B')
        year = x.strftime('%Y')
        return f'Semana {week_num}\n{month_name}\n{year}'
    else:
        # If x is a float (matplotlib internal), convert it to datetime
        try:
            date = mdates.num2date(x)
            week_num = week_of_month(date)
            month_name = date.strftime('%B')
            year = date.strftime('%Y')
            return f'Semana {week_num}\n{month_name}\n{year}'
        except Exception:
            return ''


def determine_plot_data(counts_dicts, max_points):
    """Determine the appropriate aggregation level for plotting."""
    aggregation_levels = [
        ('day', counts_dicts['day'], mdates.DateFormatter('%d/%b'), mdates.DayLocator(), 45),
        ('week', counts_dicts['week'], custom_week_formatter, mdates.WeekdayLocator(byweekday=mdates.MO), 0),
        ('month', counts_dicts['month'], mdates.DateFormatter('%b %Y'), mdates.MonthLocator(), 0),
        ('quarter', counts_dicts['quarter'], None, None, 0),
        ('year', counts_dicts['year'], None, None, 0),
    ]

    for level_name, counts, formatter, locator, rotation in aggregation_levels:
        if len(counts) <= max_points:
            sorted_counts = sorted(counts.items())
            labels = [item[0] for item in sorted_counts]
            values = [item[1] for item in sorted_counts]
            is_date = isinstance(labels[0], datetime)
            print(f"The script has chosen {level_name}.")  # Added print statement
            return labels, values, is_date, formatter, locator, rotation

    print("Data is too large to plot.")
    sys.exit(1)


def plot_data(x_labels, y_values, is_date, x_formatter, x_locator, x_rotation, bar_width=0.8):
    """
    Plot the application counts over time.

    Parameters:
    - x_labels: List of dates or categorical labels.
    - y_values: Corresponding counts.
    - is_date: Boolean indicating if x_labels are datetime objects.
    - x_formatter: DateFormatter or custom formatter for the x-axis.
    - x_locator: Locator for the x-axis.
    - x_rotation: Rotation angle for x-axis labels.
    - bar_width: Width of the bars (default is 0.8).
    """
    plt.figure(figsize=(12, 6))  # Increased figure size for better readability
    ax = plt.gca()
    ax.set_axisbelow(True)
    ax.grid(True, which='both', linestyle='--', linewidth=0.5, zorder=0)

    if is_date:
        # Calculate appropriate bar width based on the data frequency
        if isinstance(x_locator, mdates.DayLocator):
            # For daily data, set width as 0.8 days
            width = 0.6  # in days
        elif isinstance(x_locator, mdates.WeekdayLocator):
            # For weekly data, set width as 5 days (Monday to Friday)
            width = 4  # in days
        elif isinstance(x_locator, mdates.MonthLocator):
            # For monthly data, set width as ~15 days
            width = 14  # in days
        else:
            # Default width for other cases
            width = 10  # in days

        ax.bar(x_labels, y_values, width=width, edgecolor='black', zorder=1, align='center')

        if callable(x_formatter):
            # Use a custom formatter function
            ax.xaxis.set_major_formatter(ticker.FuncFormatter(x_formatter))
        elif x_formatter:
            ax.xaxis.set_major_formatter(x_formatter)
        if x_locator:
            ax.xaxis.set_major_locator(x_locator)
        plt.xticks(rotation=x_rotation)
    else:
        x_positions = range(len(x_labels))
        ax.bar(x_positions, y_values, width=bar_width, edgecolor='black', zorder=1)
        ax.set_xticks(x_positions)
        # Format labels for quarters and years
        formatted_labels = []
        for date in x_labels:
            if isinstance(date, datetime):
                if date.month == 1:
                    # Year label
                    formatted_labels.append(str(date.year))
                else:
                    # Quarter label
                    q = ((date.month - 1) // 3) + 1
                    formatted_labels.append(f'Q{q} {date.year}')
            else:
                # If not datetime, just convert to string
                formatted_labels.append(str(date))
        ax.set_xticklabels(formatted_labels, rotation=x_rotation)

    ax.yaxis.get_major_locator().set_params(integer=True)

    # Set labels and title
    plt.xlabel('Data')
    plt.ylabel('Número de vagas aplicadas')
    plt.title('Vagas aplicadas ao longo do tempo')
    plt.tight_layout()
    plt.show()


def main():
    filename = 'email_results.json'
    data = load_data(filename)


    application_counts = count_applications(data)

    if not application_counts:
        print("No application emails found.")
        sys.exit(0)

    counts_dicts = aggregate_counts(application_counts)
    max_points = 10  # Maximum number of data points on the x-axis

    x_labels, y_values, is_date, x_formatter, x_locator, x_rotation = determine_plot_data(counts_dicts, max_points)

    # Set the desired bar width here
    desired_bar_width = 0.8  # You can adjust this value as needed

    plot_data(x_labels, y_values, is_date, x_formatter, x_locator, x_rotation, bar_width=desired_bar_width)


if __name__ == '__main__':
    main()
