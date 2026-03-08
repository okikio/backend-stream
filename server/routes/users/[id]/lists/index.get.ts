import { useAuth } from '#imports';
import { db, lists, list_items, eq } from '~/utils/db';

export default defineEventHandler(async event => {
  const userId = event.context.params?.id;
  const session = await useAuth().getCurrentSession();

  if (session.user !== userId) {
    throw createError({ statusCode: 403, message: 'Cannot access other user information' });
  }

  const userLists = await db.select().from(lists).where(eq(lists.user_id, userId!));

  const result = await Promise.all(
    userLists.map(async list => {
      const items = await db.select().from(list_items).where(eq(list_items.list_id, list.id));
      return { ...list, list_items: items };
    }),
  );

  return { lists: result };
});
