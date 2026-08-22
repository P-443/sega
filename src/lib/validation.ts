import { z } from 'zod';
import { AVATAR_ICON_IDS } from '@/lib/avatars';

// Arabic + Latin letters, digits, underscore — 3..20 chars
export const usernameSchema = z
  .string()
  .min(3, 'اسم المستخدم لازم يكون 3 حروف على الأقل')
  .max(20, 'اسم المستخدم طويل جدًا')
  .regex(/^[\p{L}\p{N}_]+$/u, 'اسم المستخدم: حروف وأرقام و _ فقط');

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'الاسم المعروض مطلوب')
  .max(40, 'الاسم المعروض طويل جدًا');

export const passwordSchema = z
  .string()
  .min(6, 'كلمة السر لازم تكون 6 أحرف على الأقل')
  .max(72, 'كلمة السر طويلة جدًا');

export const registerSchema = z.object({
  username: usernameSchema,
  displayName: displayNameSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  username: z.string().min(1, 'اسم المستخدم مطلوب').max(20),
  password: z.string().min(1, 'كلمة السر مطلوبة').max(72),
});

export const updateProfileSchema = z.object({
  displayName: displayNameSchema.optional(),
  avatarIcon: z
    .string()
    .max(30)
    .nullable()
    .optional()
    .refine((v) => v === undefined || v === null || (AVATAR_ICON_IDS as readonly string[]).includes(v), {
      message: 'أيقونة غير معروفة',
    }),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(72),
  newPassword: passwordSchema,
});

export const AVATAR_MAX_BYTES = 512 * 1024; // 512 KB
export const AVATAR_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
