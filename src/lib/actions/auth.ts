'use server';

import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';
import { recordAudit } from '@/lib/audit';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});

export type FormState = { error?: string };

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  const passwordOk = user ? await bcrypt.compare(parsed.data.password, user.passwordHash) : false;
  if (!user || !user.active || !passwordOk) {
    return { error: 'Email or password is incorrect' };
  }

  const session = await getSession();
  session.user = { id: user.id, email: user.email, name: user.name, role: user.role };
  await session.save();

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await recordAudit({ userId: user.id, action: 'login', entity: 'User', entityId: user.id });

  redirect('/');
}

export async function logout(): Promise<void> {
  const session = await getSession();
  const userId = session.user?.id;
  session.destroy();
  await recordAudit({ userId, action: 'logout', entity: 'User', entityId: userId });
  redirect('/login');
}
