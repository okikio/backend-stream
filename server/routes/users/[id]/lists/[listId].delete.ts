import { useAuth } from '#imports';
import { db, lists, list_items, eq, and } from '~/utils/db';

export default defineEventHandler(async event => {
  const userId = event.context.params?.id;
  const listId = event.context.params?.listId;
  const session = await useAuth().getCurrentSession();

  if (session.user !== userId) {
    throw createError({ statusCode: 403, message: 'Cannot delete lists for other users' });
  }

  const [list] = await db.select().from(lists).where(eq(lists.id, listId!)).limit(1);
  if (!list) throw createError({ statusCode: 404, message: 'List not found' });
  if (list.user_id !== userId) throw createError({ statusCode: 403, message: "Cannot delete lists you don't own" });

  await db.transaction(async tx => {
    await tx.delete(list_items).where(eq(list_items.list_id, listId!));
    await tx.delete(lists).where(eq(lists.id, listId!));
  });

  return { id: listId, message: 'List deleted successfully' };
});
