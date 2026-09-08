export function formatSessionTime(isoString?: string): string {
  if (!isoString) return "Time not recorded";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "Time not recorded";

  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${minutes} ${ampm} UTC`;
}

export function formatSessionDate(dateValue?: string): string {
  if (!dateValue || !/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    return "Date not recorded";
  }
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateValue) {
    return "Date not recorded";
  }
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(date);
}

export function localConsultationDate(now = new Date()): string {
  const year = now.getFullYear().toString().padStart(4, "0");
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const day = now.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}
