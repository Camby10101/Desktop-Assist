const SCREENSHOT_NAME =
  /^Screenshot (\d{4})-(\d{2})-(\d{2}) (\d{2})(\d{2})(\d{2})(?: \(\d+\))?\.png$/
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Short chip label for a screenshot file: "Screenshot 14:03" if it was taken today, otherwise
 * "Screenshot 2 Oct 14:03". Unrecognised names are shown as-is.
 */
export function screenshotLabel(fileName: string, now: Date = new Date()): string {
  const match = SCREENSHOT_NAME.exec(fileName)
  if (!match) return fileName
  const [, year, month, day, hour, minute] = match.map(Number) as number[]
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  const today = year === now.getFullYear() && month === now.getMonth() + 1 && day === now.getDate()
  return today ? `Screenshot ${time}` : `Screenshot ${day} ${MONTHS[(month ?? 1) - 1]} ${time}`
}

/** How long ago something happened, briefly: "just now", "5m ago", "3h ago", "2d ago", "12 Sep". */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso)
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000)
  if (Number.isNaN(minutes)) return ''
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h ago`
  if (minutes < 7 * 24 * 60) return `${Math.floor(minutes / (24 * 60))}d ago`
  const date = `${then.getDate()} ${MONTHS[then.getMonth()]}`
  return then.getFullYear() === now.getFullYear() ? date : `${date} ${then.getFullYear()}`
}
