import dayjs from 'dayjs';

export function birthdayInfo(birthDate: string) {
  const birth = dayjs(birthDate);
  const today = dayjs().startOf('day');
  let next = today.month(birth.month()).date(birth.date());
  if (next.isBefore(today)) next = next.add(1, 'year');
  return {
    date: next.format('YYYY-MM-DD'),
    daysLeft: next.diff(today, 'day'),
  };
}
