import { useContext } from 'react';
import Context from '../context';
import Spinner from './Spinner';

// Shown while the server confirms who is signed in, before any page opens. It continues the boot
// loader of public/index.html in the same place and look (.portal-boot), so a cold load reads as
// one wait: spinner, then the page.
export default function SessionPending() {
  const { sessionError, sessionChecking, fetchUserDetails } = useContext(Context);
  return (
    <div className="portal-surface portal-boot flex-col gap-4 text-[var(--text-primary)]" role="status">
      {!sessionError && <Spinner size="page" />}
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
