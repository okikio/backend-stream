import { useAuth } from '~/utils/auth';
import { z } from 'zod';
import { scopedLogger } from '~/utils/logger';
import { db, users, bookmarks, progress_items, user_settings, sessions, eq } from '~/utils/db';

const log = scopedLogger('user-profile');

const userProfileSchema = z.object({
  profile: z
    .object({ icon: z.string(), colorA: z.string(), colorB: z.string() })
    .optional(),
  nickname: z.string().min(1).max(255).optional(),
});

export default defineEventHandler(async event => {
  const userId = event.context.params?.id;
  const session = await useAuth().getCurrentSession();

  if (session.user !== userId) {
    throw createError({ statusCode: 403, message: 'Cannot modify other users' });
  }

  if (event.method === 'PATCH') {
    try {
      const body = await readBody(event);
      log.info('Updating user profile', { userId, body });

      const validatedBody = userProfileSchema.parse(body);
      const updateData: Record<string, unknown> = {};
      if (validatedBody.profile) updateData.profile = validatedBody.profile;
      if (validatedBody.nickname !== undefined) updateData.nickname = validatedBody.nickname;

      const [user] = await db
        .update(users)
        .set(updateData)
        .where(eq(users.id, userId!))
        .returning();

      log.info('User profile updated successfully', { userId });
      return {
        id: user.id,
        publicKey: user.public_key,
        namespace: user.namespace,
        nickname: user.nickname,
        profile: user.profile,
        permissions: user.permissions,
        createdAt: user.created_at,
        lastLoggedIn: user.last_logged_in,
      };
    } catch (error) {
      log.error('Failed to update user profile', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof z.ZodError) {
        throw createError({ statusCode: 400, message: 'Invalid profile data', cause: error.errors });
      }
      throw createError({ statusCode: 500, message: 'Failed to update user profile' });
    }
  }

  if (event.method === 'DELETE') {
    try {
      log.info('Deleting user account', { userId });

      await db.transaction(async tx => {
        await tx.delete(bookmarks).where(eq(bookmarks.user_id, userId!));
        await tx.delete(progress_items).where(eq(progress_items.user_id, userId!));
        await tx.delete(user_settings).where(eq(user_settings.id, userId!));
        await tx.delete(sessions).where(eq(sessions.user, userId!));
        await tx.delete(users).where(eq(users.id, userId!));
      });

      log.info('User account deleted successfully', { userId });
      return { success: true, message: 'User account deleted successfully' };
    } catch (error) {
      log.error('Failed to delete user account', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw createError({ statusCode: 500, message: 'Failed to delete user account' });
    }
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' });
});
