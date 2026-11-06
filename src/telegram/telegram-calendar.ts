export type InlineButton = { text: string; callback_data: string };

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export function monthKeyboard(year: number, month: number) {
  const prev =
    month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 };
  const next =
    month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 };

  const rows: InlineButton[][] = [
    [
      btn('«', `cal:y:${year - 1}-${month}`),
      btn(String(year), `cal:ys:${year - 5}`),
      btn('»', `cal:y:${year + 1}-${month}`),
    ],
    [
      btn('<', `cal:m:${prev.year}-${prev.month}`),
      btn(`${MONTHS[month]} ${year}`, 'cal:noop'),
      btn('>', `cal:m:${next.year}-${next.month}`),
    ],
    WEEKDAYS.map((d) => btn(d, 'cal:noop')),
  ];

  const first = new Date(Date.UTC(year, month, 1));
  const startPad = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  let row: InlineButton[] = [];
  for (let i = 0; i < startPad; i += 1) row.push(btn(' ', 'cal:noop'));
  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = `${year}-${pad(month + 1)}-${pad(day)}`;
    row.push(btn(String(day), `cal:d:${iso}`));
    if (row.length === 7) {
      rows.push(row);
      row = [];
    }
  }
  if (row.length) {
    while (row.length < 7) row.push(btn(' ', 'cal:noop'));
    rows.push(row);
  }

  rows.push([
    btn('Skip', 'wiz:skip'),
    btn('Cancel', 'wiz:cancel'),
  ]);

  return { inline_keyboard: rows };
}

export function yearKeyboard(fromYear: number, month: number, currentYear: number) {
  const rows: InlineButton[][] = [
    [
      btn('«', `cal:ys:${fromYear - 12}`),
      btn('Year', 'cal:noop'),
      btn('»', `cal:ys:${fromYear + 12}`),
    ],
  ];
  let row: InlineButton[] = [];
  for (let i = 0; i < 12; i += 1) {
    const y = fromYear + i;
    row.push(btn(String(y), `cal:y:${y}-${month}`));
    if (row.length === 3) {
      rows.push(row);
      row = [];
    }
  }
  rows.push([btn('Back to calendar', `cal:m:${currentYear}-${month}`)]);
  return { inline_keyboard: rows };
}

export function parseCalCallback(data: string): {
  kind: 'month' | 'year' | 'years' | 'day' | 'noop';
  year?: number;
  month?: number;
  iso?: string;
  fromYear?: number;
} | null {
  if (data === 'cal:noop') return { kind: 'noop' };
  const day = data.match(/^cal:d:(\d{4}-\d{2}-\d{2})$/);
  if (day) return { kind: 'day', iso: day[1] };
  const month = data.match(/^cal:m:(-?\d+)-(\d+)$/);
  if (month) return { kind: 'month', year: Number(month[1]), month: Number(month[2]) };
  const year = data.match(/^cal:y:(-?\d+)-(\d+)$/);
  if (year) return { kind: 'year', year: Number(year[1]), month: Number(year[2]) };
  const years = data.match(/^cal:ys:(-?\d+)$/);
  if (years) return { kind: 'years', fromYear: Number(years[1]) };
  return null;
}

function btn(text: string, callback_data: string): InlineButton {
  return { text, callback_data };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
