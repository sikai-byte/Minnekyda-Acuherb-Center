import { headers } from 'next/headers';
import type { Prisma } from '@prisma/client';
import { prisma } from './db';

type AuditInput = {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  patientId?: string | null;
  detail?: Prisma.InputJsonValue;
};

/// Writes an audit row for every access to patient data. Failures are swallowed so a
/// logging problem can never block clinical work, but they are surfaced in the server log.
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    const headerList = headers();
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        patientId: input.patientId ?? null,
        detail: input.detail ?? undefined,
        ip: headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
        userAgent: headerList.get('user-agent'),
      },
    });
  } catch (error) {
    /// Only the action and the error text: a raw error object can echo the row that failed
    /// to write, which would put PHI in the server log.
    console.error('audit log write failed', {
      action: input.action,
      entity: input.entity,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}
