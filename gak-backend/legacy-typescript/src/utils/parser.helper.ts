const datePattern = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/;

export function extractDeadline(input: string): Date | null {
  const match = input.match(datePattern);
  if (!match) {
    return null;
  }

  const parsed = new Date(match[1]);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function matchesAcademicKeywords(subject: string): boolean {
  return ["assignment", "deadline", "nptel", "hackathon", "submission"].some((keyword) =>
    subject.toLowerCase().includes(keyword)
  );
}
