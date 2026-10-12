// Jira issue keys, used by the main process and the panel alike.

/** Jira issue keys in text: a project key, a dash and a number ("ISD-1234"). */
const ISSUE_KEY = /\b[A-Z][A-Z0-9_]{1,9}-\d{1,7}\b/g

/** The issue keys in the text, first to last, each once. */
export function findIssueKeys(value: string, limit = 3): string[] {
  return [...new Set(value.match(ISSUE_KEY) ?? [])].slice(0, limit)
}

export const isIssueKey = (value: string): boolean =>
  /^[A-Z][A-Z0-9_]{1,9}-\d{1,7}$/.test(value.trim())

/** The issue's page in Jira. */
export function browseUrl(site: string, key: string): string {
  return `${new URL(site).origin}/browse/${encodeURIComponent(key)}`
}
