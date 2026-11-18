import type { FeedList, JiraFeed } from '@shared/types'

/**
 * Whether the feed has something new since `before`: a notification that wasn't unread before,
 * or a reply (or change) on a request that wasn't there before. Only between two feeds that had
 * both loaded, so what's already there when the app starts (or signs in) doesn't count as news.
 */
export function hasNews(before: JiraFeed | null, after: JiraFeed): boolean {
  if (!before) return false
  const loaded = <T>(a: FeedList<T>, b: FeedList<T>) => a.status === 'ready' && b.status === 'ready'
  const notification =
    loaded(before.notifications, after.notifications) &&
    after.notifications.items.some(
      (n) => n.unread && !before.notifications.items.some((m) => m.id === n.id && m.unread),
    )
  const reply =
    loaded(before.requests, after.requests) &&
    after.requests.items.some(
      (r) => r.news && !before.requests.items.some((q) => q.key === r.key && q.news === r.news),
    )
  return notification || reply
}
