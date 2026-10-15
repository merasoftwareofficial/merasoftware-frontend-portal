import { useContext } from 'react';
import Context from '../context';

export default function SessionPending() {
  const { sessionError, sessionChecking, fetchUserDetails } = useContext(Context);
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4" role="status">
      <p>{sessionError || 'Checking your session…'}</p>
      {sessionError && (
        <button className="rounded bg-blue-600 px-4 py-2 text-white" disabled={sessionChecking}
          onClick={() => { void fetchUserDetails(); }}>
          {sessionChecking ? 'Checking…' : 'Try again'}
        </button>
      )}
    </div>
  );
}
