import React from 'react';
import { TriangleAlert } from 'lucide-react';
import Modal from './Modal';

const SpinningLoader = ({ totalFiles }) => {
  return (
    // Was a white card with a blue spinner and a yellow warning block, none of
    // which exist in the portal palette. On the dark page it opened as a lit
    // slab. Modal supplies the scrim and the panel; the warning is a pending
    // badge because "do not close this page" is exactly that.
    <Modal open title="Uploading files" closeOnBackdrop={false}>
      <div className="flex items-center justify-center">
        <div className="h-16 w-16 animate-spin rounded-full border-4 border-[var(--glass-border)] border-t-[var(--eyebrow-fg)]" />
      </div>

      <div className="mt-4 text-center">
        <p className="text-base text-[var(--text-primary)]">
          {totalFiles} file{totalFiles !== 1 ? 's' : ''} being uploaded
        </p>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Please wait while your files are being uploaded to our secure server.
        </p>
      </div>

      <div className="badge badge-pending mt-4 flex items-start gap-3 rounded-2xl p-4">
        <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
        <p className="text-sm">
          <strong>Do not refresh or close this page</strong> until the upload is complete.
        </p>
      </div>
    </Modal>
  );
};

export default SpinningLoader;
