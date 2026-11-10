import { useState } from 'react';
import { ChessPieceIcon } from './chessPieceIcons';
import { BOARD_PALETTES } from './chessPalette';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

export default function ChessBoardFlat({ board, turn, assignedColor, paletteKey, onMove }) {
  const [selected, setSelected] = useState(null);

  if (!board) return null;

  const isMyTurn = turn === assignedColor;
  const isFlipped = assignedColor === 'black';
  const palette = BOARD_PALETTES[paletteKey] || BOARD_PALETTES.classicGreen;

  const rowOrder = isFlipped ? [...board.keys()].reverse() : [...board.keys()];
  const colOrder = isFlipped ? [...board[0].keys()].reverse() : [...board[0].keys()];

  const handleSquareClick = (row, col) => {
    if (!isMyTurn) return;

    if (selected) {
      if (selected.row === row && selected.col === col) {
        setSelected(null);
        return;
      }
      onMove(selected, { row, col });
      setSelected(null);
      return;
    }

    const piece = board[row][col];
    if (piece && piece.color === assignedColor) {
      setSelected({ row, col });
    }
  };

  return (
    <div className="w-full max-w-[476px] rounded-2xl border border-slate-300 bg-white p-3 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.4)] sm:max-w-[540px]">
      <div className="overflow-hidden rounded-xl border border-slate-300">
        {rowOrder.map((row) => (
          <div key={row} className="flex">
            {colOrder.map((col) => {
              const piece = board[row][col];
              const isDark = (row + col) % 2 === 1;
              const isSelected = selected && selected.row === row && selected.col === col;
              const rankLabel = isFlipped ? row + 1 : 8 - row;
              const fileLabel = FILES[isFlipped ? 7 - col : col];
              const showRank = col === colOrder[0];
              const showFile = row === rowOrder[rowOrder.length - 1];

              return (
                <div
                  key={col}
                  onClick={() => handleSquareClick(row, col)}
                  className={[
                    'relative flex aspect-square min-w-0 flex-1 items-center justify-center select-none cursor-pointer transition',
                    isSelected ? 'ring-4 ring-inset ring-amber-400' : ''
                  ].join(' ')}
                  style={{ backgroundColor: isDark ? palette.dark : palette.light }}
                >
                  {showRank && (
                    <span className="absolute left-1 top-1 text-[10px] font-semibold opacity-60" style={{ color: isDark ? palette.light : palette.dark }}>
                      {rankLabel}
                    </span>
                  )}
                  {showFile && (
                    <span className="absolute bottom-1 right-1 text-[10px] font-semibold opacity-60" style={{ color: isDark ? palette.light : palette.dark }}>
                      {fileLabel}
                    </span>
                  )}
                  {piece && (
                    <div className="h-10 w-10 max-h-[70%] max-w-[70%] drop-shadow-sm sm:h-12 sm:w-12 sm:max-h-none sm:max-w-none">
                      <ChessPieceIcon piece={piece} paletteKey={paletteKey} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
