'use client';

import { useFormStatus } from 'react-dom';
import { amendNote } from '@/lib/actions/notes';

function Button() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-secondary" disabled={pending}>
      {pending ? 'Creating…' : 'Create amendment'}
    </button>
  );
}

export function AmendButton({ noteId }: { noteId: string }) {
  return (
    <form action={amendNote.bind(null, noteId)}>
      <Button />
    </form>
  );
}
