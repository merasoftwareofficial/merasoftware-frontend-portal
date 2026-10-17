import { useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import useChessSocket from './useChessSocket';
import ChessLobby from './ChessLobby';
import ChessBoardFlat from './ChessBoardFlat';
import DashboardLayout from '../components/DashboardLayout';

export default function ChessPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const autoJoinAttempted = useRef(false);
  const currentUser = useSelector((state) => state?.user?.user);

  // TEMP DEBUG ONLY — remove after iPhone console check is done
  useEffect(() => {
    if (window.__erudaLoaded) return;
    window.__erudaLoaded = true;
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/eruda';
    script.onload = () => window.eruda && window.eruda.init();
    document.body.appendChild(script);
  }, []);

  const {
    connected,
    roomCode,
    assignedColor,
    board,
    players,
    turn,
    status,
    paletteKey,
    gameStatus,
    resetRequestedBy,
    endRequestedBy,
    gameEnded,
    myGames,
    errorMessage,
    createRoom,
    joinRoomByCode,
    findRandomMatch,
    movePiece,
    undoMove,
    requestReset,
    respondReset,
    requestEnd,
    respondEnd,
    fetchMyGames,
    leaveRoomView
  } = useChessSocket();

  useEffect(() => {
    if (gameEnded) {
      toast.success('Game ended and removed for both players.');
      navigate('/games');
    }
  }, [gameEnded, navigate]);

  useEffect(() => {
    const roomFromLink = searchParams.get('room');
    if (roomFromLink && connected && !autoJoinAttempted.current) {
      autoJoinAttempted.current = true;
      joinRoomByCode(roomFromLink.toUpperCase());
    }
  }, [connected, searchParams, joinRoomByCode]);

  useEffect(() => {
    if (connected && !searchParams.get('room') && !roomCode) {
      fetchMyGames();
    }
  }, [connected, searchParams, roomCode, fetchMyGames]);

  const shareLink = roomCode
    ? `${window.location.origin}/games/chess?room=${roomCode}`
    : null;

  const copyToClipboard = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error('Could not copy. Please copy it manually.');
    }
  };

  const inLobby = !roomCode && !searchParams.get('room');

  if (inLobby) {
    return (
      <DashboardLayout user={currentUser}>
        <div
          className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-4 py-10 sm:px-6 lg:px-8 lg:py-14"
        >
          <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />
          <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-6">
            {/* No Back button here — ChessLobby renders the single one for this
                screen. Two of them used to show at once on the step screens,
                one leaving the page and one stepping back, with nothing to tell
                them apart. */}
            {myGames.length > 0 && (
              <div className="w-full max-w-xl space-y-3 rounded-[1.5rem] border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] p-4 backdrop-blur-2xl backdrop-saturate-150">
                <p className="font-semibold text-[var(--text-primary)]">Resume a game</p>
                {myGames.map((game) => (
                  <button
                    key={game.roomCode}
                    onClick={() => joinRoomByCode(game.roomCode)}
                    className="w-full flex items-center justify-between rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-3 py-2 text-left hover:border-[var(--glass-border-strong)] hover:bg-[var(--glass-bg-subtle)]"
                  >
                    <span className="text-[var(--text-primary)]">
                      vs {game.opponentName || 'Unknown player'} <span className="text-[var(--text-muted)]">— playing {game.color}</span>
                    </span>
                    <span className="text-sm text-[var(--accent-soft-fg)] underline">Resume</span>
                  </button>
                ))}
              </div>
            )}

            <ChessLobby
              onCreateRoom={createRoom}
              onJoinByCode={joinRoomByCode}
              onFindRandomMatch={findRandomMatch}
              onExit={() => navigate('/games', { replace: true })}
              status={status}
            />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const opponent = players
    ? (assignedColor === 'white' ? players.black : players.white)
    : null;

  const isResetRequestedByMe = resetRequestedBy && currentUser?._id && String(resetRequestedBy) === String(currentUser._id);
  const isResetRequestedByOpponent = gameStatus === 'reset-pending' && !isResetRequestedByMe;

  const isEndRequestedByMe = endRequestedBy && currentUser?._id && String(endRequestedBy) === String(currentUser._id);
  const isEndRequestedByOpponent = gameStatus === 'end-pending' && !isEndRequestedByMe;

  return (
    <DashboardLayout user={currentUser}>
      <div
        className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-4 py-10 sm:px-6 lg:px-8 lg:py-14"
      >
        <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />
        <div className="relative mx-auto flex w-full max-w-7xl flex-col items-center gap-4">
          <div className="relative flex w-full items-center justify-center">
            <button
              type="button"
              onClick={() => {
                leaveRoomView();
                navigate('/games/chess', { replace: true });
              }}
              className="absolute left-0 inline-flex w-fit shrink-0 items-center gap-2 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-5 py-3 text-lg font-semibold text-[var(--text-primary)] backdrop-blur-md transition hover:bg-[var(--glass-bg-strong)]"
            >
              <ArrowLeft className="h-5 w-5" />
              Back
            </button>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] text-center sm:text-3xl">Chess</h1>
          </div>

          <div className="w-full max-w-2xl space-y-4">
            {errorMessage && (
              <p className="text-red-400 text-center">{errorMessage}</p>
            )}

            {roomCode && (
              <div className="text-center space-y-2 rounded-[1.5rem] border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] p-4 backdrop-blur-2xl backdrop-saturate-150">
                <div className="flex items-center justify-center gap-2">
                  <p className="text-[var(--text-primary)]">Room Code: <span className="font-bold">{roomCode}</span></p>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(roomCode, 'Room code')}
                    className="text-sm underline text-accent-text"
                  >
                    Copy
                  </button>
                </div>
                {shareLink && (
                  <div className="flex items-center justify-center gap-2">
                    <p className="text-sm text-[var(--text-secondary)] break-all">{shareLink}</p>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(shareLink, 'Link')}
                      className="text-sm underline text-accent-text shrink-0"
                    >
                      Copy
                    </button>
                  </div>
                )}
                <p className="text-[var(--text-primary)]">You are playing: <span className="font-bold capitalize">{assignedColor}</span></p>
                {opponent && (
                  <p className="text-[var(--text-primary)]">
                    Playing against: <span className="font-bold">{opponent.name || 'Unknown player'}</span>
                    {opponent.email && <span className="text-[var(--text-secondary)]"> ({opponent.email})</span>}
                  </p>
                )}
              </div>
            )}

            {status === 'waiting-for-opponent' && (
              <p className="text-center text-[var(--text-secondary)]">Waiting for opponent to join...</p>
            )}

            {status === 'opponent-left' && (
              <p className="text-center text-red-400">Opponent disconnected. Your game is saved — you can resume it later.</p>
            )}

            {isResetRequestedByMe && (
              <p className="text-center text-[var(--text-secondary)]">Reset request sent. Waiting for the other player to respond...</p>
            )}

            {isResetRequestedByOpponent && (
              <div className="text-center space-y-2 rounded-[1.5rem] border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] p-4 backdrop-blur-2xl backdrop-saturate-150">
                <p className="text-[var(--text-primary)]">The other player wants to reset this game.</p>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => respondReset(true)}
                    className="px-4 py-2 rounded-xl bg-accent-solid text-accent-on-solid hover:bg-accent-solid-hover"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => respondReset(false)}
                    className="px-4 py-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] text-[var(--text-primary)] hover:bg-[var(--glass-bg-subtle)]"
                  >
                    Reject
                  </button>
                </div>
              </div>
            )}

            {isEndRequestedByMe && (
              <p className="text-center text-[var(--text-secondary)]">End request sent. If the other player doesn't respond within 12 hours, this game will be removed automatically.</p>
            )}

            {isEndRequestedByOpponent && (
              <div className="text-center space-y-2 rounded-[1.5rem] border border-red-400/40 bg-red-500/10 p-4 backdrop-blur-2xl backdrop-saturate-150">
                <p className="text-[var(--text-primary)]">The other player wants to end and delete this game.</p>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => respondEnd(true)}
                    className="px-4 py-2 rounded-xl bg-red-600 text-[var(--text-primary)] hover:bg-red-700"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => respondEnd(false)}
                    className="px-4 py-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] text-[var(--text-primary)] hover:bg-[var(--glass-bg-subtle)]"
                  >
                    Reject
                  </button>
                </div>
              </div>
            )}

            {board && (
              <div className="flex flex-col items-center gap-4">
                <p className="text-[var(--text-primary)]">Turn: <span className="font-bold capitalize">{turn}</span></p>
                <ChessBoardFlat
                  board={board}
                  turn={turn}
                  assignedColor={assignedColor}
                  paletteKey={paletteKey}
                  onMove={movePiece}
                />
                <div className="flex gap-3">
                  <button
                    onClick={undoMove}
                    className="px-4 py-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] text-[var(--text-primary)] hover:bg-[var(--glass-bg-subtle)]"
                  >
                    Undo Last Move
                  </button>
                  <button
                    onClick={requestReset}
                    disabled={gameStatus !== 'active'}
                    className="px-4 py-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] text-[var(--text-primary)] hover:bg-[var(--glass-bg-subtle)] disabled:opacity-50"
                  >
                    Reset Game
                  </button>
                  <button
                    onClick={requestEnd}
                    disabled={gameStatus !== 'active'}
                    className="px-4 py-2 rounded-xl border border-red-400/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                  >
                    End Game
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
