export type CalendarDisplay = 'day' | 'week' | 'month' | 'list';

export function initialCalendarDisplay(
  query: string | null,
  saved: string,
  mobile: boolean
): CalendarDisplay {
  const valid = (value: string | null): value is CalendarDisplay =>
    ['day', 'week', 'month', 'list'].includes(value || '');
  return valid(query) ? query : valid(saved) ? saved : mobile ? 'day' : 'week';
}
