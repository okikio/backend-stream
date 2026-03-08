import { useAuth } from '#imports';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db, lists, list_items, eq, and, inArray } from '~/utils/db';

const listItemSchema = z.object({
  tmdb_id: z.string(),
  type: z.enum(['movie', 'tv']),
});

const updateListSchema = z.object({
  list_id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(255).optional().nullable(),
  public: z.boolean().optional(),
  addItems: z.array(listItemSchema).optional(),
  removeItems: z.array(listItemSchema).optional(),
});

export default defineEventHandler(async event => {
  const userId = event.context.params?.id;
  const session = await useAuth().getCurrentSession();

  if (session.user !== userId) {
    throw createError({ statusCode: 403, message: 'Cannot modify lists for other users' });
  }

  const body = await readBody(event);
  const validatedBody = updateListSchema.parse(body);

  const [list] = await db.select().from(lists).where(eq(lists.id, validatedBody.list_id)).limit(1);
  if (!list) throw createError({ statusCode: 404, message: 'List not found' });
  if (list.user_id !== userId) throw createError({ statusCode: 403, message: "Cannot modify lists you don't own" });

  const result = await db.transaction(async tx => {
    if (validatedBody.name || validatedBody.description !== undefined || validatedBody.public !== undefined) {
      await tx.update(lists).set({
        name: validatedBody.name ?? list.name,
        description: validatedBody.description !== undefined ? validatedBody.description : list.description,
        public: validatedBody.public ?? list.public,
        updated_at: new Date(),
      }).where(eq(lists.id, list.id));
    }

    if (validatedBody.addItems?.length) {
      const existingItems = await tx.select().from(list_items).where(eq(list_items.list_id, list.id));
      const existingIds = new Set(existingItems.map(i => i.tmdb_id));
      const toAdd = validatedBody.addItems.filter(i => !existingIds.has(i.tmdb_id));
      if (toAdd.length) {
        await tx.insert(list_items).values(
          toAdd.map(item => ({ id: randomUUID(), list_id: list.id, tmdb_id: item.tmdb_id, type: item.type }))
        ).onConflictDoNothing();
      }
    }

    if (validatedBody.removeItems?.length) {
      const idsToRemove = validatedBody.removeItems.map(i => i.tmdb_id);
      await tx.delete(list_items).where(
        and(eq(list_items.list_id, list.id), inArray(list_items.tmdb_id, idsToRemove))
      );
    }

    const updatedList = await tx.select().from(lists).where(eq(lists.id, list.id)).limit(1);
    const items = await tx.select().from(list_items).where(eq(list_items.list_id, list.id));
    return { ...updatedList[0], list_items: items };
  });

  return { list: result, message: 'List updated successfully' };
});
