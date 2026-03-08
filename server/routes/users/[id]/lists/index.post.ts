import { useAuth } from '#imports';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db, lists, list_items, eq } from '~/utils/db';

const listItemSchema = z.object({
  tmdb_id: z.string(),
  type: z.enum(['movie', 'tv']),
});

const createListSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(255).optional().nullable(),
  items: z.array(listItemSchema).optional(),
  public: z.boolean().optional(),
});

export default defineEventHandler(async event => {
  const userId = event.context.params?.id;
  const session = await useAuth().getCurrentSession();

  if (session.user !== userId) {
    throw createError({ statusCode: 403, message: 'Cannot modify user other than yourself' });
  }

  const body = await readBody(event);
  let parsedBody: unknown;
  try {
    parsedBody = typeof body === 'string' ? JSON.parse(body) : body;
  } catch {
    throw createError({ statusCode: 400, message: 'Invalid request body format' });
  }

  const validatedBody = createListSchema.parse(parsedBody);
  const now = new Date();

  const result = await db.transaction(async tx => {
    const listId = randomUUID();
    const [newList] = await tx
      .insert(lists)
      .values({
        id: listId,
        user_id: userId!,
        name: validatedBody.name,
        description: validatedBody.description ?? null,
        public: validatedBody.public ?? false,
        created_at: now,
        updated_at: now,
      })
      .returning();

    if (validatedBody.items?.length) {
      await tx.insert(list_items).values(
        validatedBody.items.map(item => ({
          id: randomUUID(),
          list_id: listId,
          tmdb_id: item.tmdb_id,
          type: item.type,
        })),
      ).onConflictDoNothing();
    }

    const items = await tx.select().from(list_items).where(eq(list_items.list_id, listId));
    return { ...newList, list_items: items };
  });

  return { list: result, message: 'List created successfully' };
});
