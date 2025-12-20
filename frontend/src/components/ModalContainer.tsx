import { useEffect, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';
import { PlayerModal } from './PlayerModal';
import { TeamModal } from './TeamModal';

interface ModalContainerProps {
  allowStacking?: boolean;
}

export const ModalContainer = ({ allowStacking = false }: ModalContainerProps) => {
  const { modalStack, closeModal } = useGameStore();

  // Handle ESC key to close top modal
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalStack.length > 0) {
        closeModal();
      }
    },
    [modalStack.length, closeModal]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (modalStack.length > 0) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [modalStack.length]);

  if (modalStack.length === 0) {
    return null;
  }

  return (
    <>
      {modalStack.map((modal, index) => {
        const isTopModal = index === modalStack.length - 1;
        const zIndex = 60 + index;

        return (
          <div
            key={`${modal.type}-${modal.id}-${index}`}
            className="fixed inset-0 flex items-center justify-center p-4"
            style={{ zIndex }}
          >
            {/* Backdrop - only clickable on top modal */}
            <div
              className={`absolute inset-0 bg-black/80 ${
                isTopModal ? 'cursor-pointer' : ''
              }`}
              onClick={isTopModal ? closeModal : undefined}
            />

            {/* Modal content with slight offset for stacking effect */}
            <div
              className="relative"
              style={{
                transform: `translate(${index * 8}px, ${index * 8}px)`,
              }}
            >
              {modal.type === 'player' ? (
                <PlayerModal
                  playerId={modal.id}
                  onClose={closeModal}
                  allowStacking={allowStacking}
                />
              ) : (
                <TeamModal
                  teamId={modal.id}
                  onClose={closeModal}
                  allowStacking={allowStacking}
                />
              )}
            </div>
          </div>
        );
      })}
    </>
  );
};
