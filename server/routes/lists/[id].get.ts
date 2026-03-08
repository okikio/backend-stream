import { db, lists, list_items, eq } from '~/utils/db';

export default defineEventHandler(async event => {
  const id = event.context.params?.id;

  const [listInfo] = await db.select().from(lists).where(eq(lists.id, id!)).limit(1);
  if (!listInfo) {
    throw createError({ statusCode: 404, message: 'List not found' });
  }
  if (!listInfo.public) {
    throw createError({ statusCode: 403, message: 'List is not public' });
  }

  const items = await db.select().from(list_items).where(eq(list_items.list_id, id!));
  return { ...listInfo, list_items: items };
});
