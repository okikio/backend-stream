import { randomUUID } from 'node:crypto';
import { useAuth } from '~/utils/auth';
import { z } from 'zod';
import { db, user_group_order, eq } from '~/utils/db';

const groupOrderSchema = z.array(z.string());

export default defineEventHandler(async event => {
  const userId = event.context.params?.id;
  const method = event.method;
  const session = await useAuth().getCurrentSession();

  if (session.user !== userId) {
    throw createError({ statusCode: 403, message: 'Cannot access other user information' });
  }

  if (method === 'GET') {
    const [row] = await db
      .select()
      .from(user_group_order)
      .where(eq(user_group_order.user_id, userId!))
      .limit(1);
    return { groupOrder: row?.group_order ?? [] };
  }

  if (method === 'PUT') {
    const body = await readBody(event);
    const validatedGroupOrder = groupOrderSchema.parse(body);
    const now = new Date();

    const [row] = await db
      .insert(user_group_order)
      .values({ id: randomUUID(), user_id: userId!, group_order: validatedGroupOrder, created_at: now, updated_at: now })
      .onConflictDoUpdate({
        target: user_group_order.user_id,
        set: { group_order: validatedGroupOrder, updated_at: now },
      })
      .returning();
    return { groupOrder: row.group_order };
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' });
});
