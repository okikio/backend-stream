import { useAuth } from '#imports';
import { db, lists, list_items, eq, inArray } from '~/utils/db';

export default defineEventHandler(async event => {
  const userId = event.context.params?.id;
  const session = await useAuth().getCurrentSession();

  if (session.user !== userId) {
    throw createError({ statusCode: 403, message: 'Cannot access other user information' });
  }

  const userLists = await db.select().from(lists).where(eq(lists.user_id, userId!));

  if (userLists.length === 0) return { lists: [] };

  const listIds = userLists.map(l => l.id);
  const allItems = await db.select().from(list_items).where(inArray(list_items.list_id, listIds));

  const itemsByList = new Map<string, typeof allItems>(listIds.map(id => [id, []]));
  for (const item of allItems) {
    itemsByList.get(item.list_id)!.push(item);
  }

  const result = userLists.map(list => ({ ...list, list_items: itemsByList.get(list.id) ?? [] }));

  return { lists: result };
});
