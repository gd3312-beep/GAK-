export function attendanceRiskLabel(percentage: number): "safe" | "warning" | "critical" {
  if (percentage >= 0.8) {
    return "safe";
  }

  if (percentage >= 0.7) {
    return "warning";
  }

  return "critical";
}
