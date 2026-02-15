export function isExamWeek(referenceDate: Date): boolean {
  const month = referenceDate.getMonth() + 1;
  return month === 4 || month === 11;
}

export function getDayAndHour(referenceDate: Date): { dayOfWeek: number; hourOfDay: number } {
  return {
    dayOfWeek: referenceDate.getDay(),
    hourOfDay: referenceDate.getHours()
  };
}
