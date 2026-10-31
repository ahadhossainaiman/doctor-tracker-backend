const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseRangeBound(value: string, bound: 'start' | 'end'): Date {
  const match = DAY.exec(value);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (bound === 'start') {
      return new Date(Date.UTC(year, month - 1, day));
    }
    return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  }

  return new Date(value);
}

export function createdAtRange(
  from: string | undefined,
  to: string | undefined,
): { $gte?: Date; $lte?: Date } | undefined {
  if (!from && !to) {
    return undefined;
  }

  const range: { $gte?: Date; $lte?: Date } = {};
  if (from) {
    range.$gte = parseRangeBound(from, 'start');
  }
  if (to) {
    range.$lte = parseRangeBound(to, 'end');
  }
  return range;
}
