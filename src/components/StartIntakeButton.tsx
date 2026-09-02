'use client';

import { useFormStatus } from 'react-dom';
import { startIntake } from '@/lib/actions/intake';

function Button() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-secondary" disabled={pending}>
      {pending ? 'Opening…' : 'Start intake'}
    </button>
  );
}

export function StartIntakeButton({ patientId }: { patientId: string }) {
  return (
    <form action={startIntake.bind(null, patientId)}>
      <Button />
    </form>
  );
}
