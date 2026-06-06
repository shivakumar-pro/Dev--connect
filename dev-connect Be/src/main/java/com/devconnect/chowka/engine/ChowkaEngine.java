package com.devconnect.chowka.engine;

import com.devconnect.chowka.model.ChowkaPlayer;
import com.devconnect.chowka.model.ChowkaRoom;
import com.devconnect.chowka.model.Piece;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Pure board logic for Chowka Bara on a 5×5 grid.
 *
 * Board layout (row, col both 0..4):
 *   - Every piece travels its own path: once around the outer ring, once
 *     around the inner ring, then into the centre.
 *   - Each seat's path is the "south" path rotated 90° so the four players
 *     enter from the four arms of the cross.
 *   - The five crossed cells (the four edge-midpoints + centre) are SAFE:
 *     pieces there can never be captured.
 *
 * Positions are stored on each {@link Piece} as an index into its owner's path;
 * physical (row,col) is derived for capture/rendering.
 */
@Component
public class ChowkaEngine {

    public static final int SIZE = 5;
    /** Cowrie rolls that let a piece leave base in "traditional" start mode. */
    public static final Set<Integer> ENTRY_ROLLS = Set.of(1, 4, 8);

    /** Base ("south", seat 0) path: 16 outer ring + 8 inner ring + centre = 25. */
    private static final int[][] BASE_PATH = buildBasePath();
    public static final int PATH_LENGTH = BASE_PATH.length;
    public static final int CENTER_INDEX = PATH_LENGTH - 1;

    /** The four seat colours, in seat order. */
    public static final String[] COLORS = {"RED", "GREEN", "BLUE", "YELLOW"};

    private static int[][] buildBasePath() {
        // The two rings spiral in OPPOSITE directions, like a real Chowka Bara board.
        // Outer ring: from the bottom-middle start, travel left-to-right and up the
        // right side — i.e. ANTI-clockwise around the outside.
        int[][] outer = {
                {4, 2}, {4, 3}, {4, 4}, {3, 4}, {2, 4}, {1, 4}, {0, 4}, {0, 3},
                {0, 2}, {0, 1}, {0, 0}, {1, 0}, {2, 0}, {3, 0}, {4, 0}, {4, 1},
        };
        // Inner ring: enter at the bottom-left inner cell and spiral the other way
        // (CLOCKWISE), ending one step from the centre.
        int[][] inner = {
                {3, 1}, {2, 1}, {1, 1}, {1, 2}, {1, 3}, {2, 3}, {3, 3}, {3, 2},
        };
        List<int[]> path = new ArrayList<>();
        for (int[] c : outer) path.add(c);
        for (int[] c : inner) path.add(c);
        path.add(new int[]{2, 2}); // centre home
        return path.toArray(new int[0][]);
    }

    /** Rotate a cell 90° about the centre: (r,c) -> (c, 4-r). Cycles S→W→N→E. */
    private static int[] rotate(int[] cell, int times) {
        int r = cell[0], c = cell[1];
        for (int i = 0; i < (times % 4 + 4) % 4; i++) {
            int nr = c, nc = SIZE - 1 - r;
            r = nr; c = nc;
        }
        return new int[]{r, c};
    }

    /** The (row,col) of a given path index for a seat. */
    public int[] cell(int seat, int pathIndex) {
        if (pathIndex < 0 || pathIndex >= PATH_LENGTH) return null;
        return rotate(BASE_PATH[pathIndex], seat);
    }

    /** Full ordered path of (row,col) cells for a seat (used by the client for animation). */
    public int[][] path(int seat) {
        int[][] out = new int[PATH_LENGTH][];
        for (int i = 0; i < PATH_LENGTH; i++) out[i] = rotate(BASE_PATH[i], seat);
        return out;
    }

    /** Current physical cell of a piece, or null if it is in base. */
    public int[] pieceCell(ChowkaPlayer player, Piece piece) {
        if (piece.inBase()) return null;
        return cell(player.getSeat(), piece.getPathIndex());
    }

    /** The five crossed safe cells (rotation-invariant set). */
    public boolean isSafe(int r, int c) {
        return (r == 2 && c == 2)                       // centre
                || (r == 4 && c == 2) || (r == 0 && c == 2)
                || (r == 2 && c == 0) || (r == 2 && c == 4);
    }

    public boolean isCenter(int pathIndex) { return pathIndex == CENTER_INDEX; }

    /**
     * The pieces (ids) the player may legally move with the given roll.
     */
    public List<Integer> legalMoves(ChowkaRoom room, ChowkaPlayer player, int roll) {
        List<Integer> legal = new ArrayList<>();
        if (roll <= 0) return legal;
        for (Piece p : player.getPieces()) {
            if (p.getPathIndex() == CENTER_INDEX) continue;     // already home
            if (p.inBase()) {
                // Open start: a captured piece re-enters on any roll. Traditional:
                // a piece leaves base only on an entry roll (1, 4 or 8).
                if (room.isOpenStart() || ENTRY_ROLLS.contains(roll)) legal.add(p.getId());
            } else if (p.getPathIndex() + roll <= CENTER_INDEX) {  // no overshoot past centre
                legal.add(p.getId());
            }
        }
        return legal;
    }

    public boolean hasLegalMove(ChowkaRoom room, ChowkaPlayer player, int roll) {
        return !legalMoves(room, player, roll).isEmpty();
    }

    /** Result of applying a move. */
    public static class MoveResult {
        public boolean captured;
        public boolean finished;      // the moved piece reached the centre
        public List<int[]> capturedAt = new ArrayList<>(); // cells where a capture happened
        public List<String> capturedOwners = new ArrayList<>();
    }

    /**
     * Move the given piece by {@code roll}. Assumes the move is legal
     * (validated via {@link #legalMoves}). Applies captures and finishing.
     */
    public MoveResult applyMove(ChowkaRoom room, ChowkaPlayer player, int pieceId, int roll) {
        MoveResult res = new MoveResult();
        Piece piece = player.piece(pieceId);
        if (piece == null) return res;

        if (piece.inBase()) {
            // Entering from base lands on the start square (path index 0).
            piece.setPathIndex(0);
        } else {
            piece.setPathIndex(piece.getPathIndex() + roll);
        }

        if (piece.getPathIndex() == CENTER_INDEX) {
            res.finished = true;
            return res; // centre is always safe — no capture
        }

        int[] here = cell(player.getSeat(), piece.getPathIndex());
        if (here == null || isSafe(here[0], here[1])) return res;

        // Capture any opposing pieces sharing this (non-safe) cell.
        for (ChowkaPlayer other : room.getPlayers().values()) {
            if (other == player) continue;
            for (Piece op : other.getPieces()) {
                if (op.inBase() || op.getPathIndex() == CENTER_INDEX) continue;
                int[] oc = cell(other.getSeat(), op.getPathIndex());
                if (oc != null && oc[0] == here[0] && oc[1] == here[1]) {
                    op.setPathIndex(-1); // sent home to base
                    res.captured = true;
                    res.capturedAt.add(new int[]{here[0], here[1]});
                    res.capturedOwners.add(other.getUsername());
                }
            }
        }
        return res;
    }

    /** A player wins once all their pieces are at the centre. */
    public boolean hasWon(ChowkaPlayer player) {
        return player.finishedCount(CENTER_INDEX) == ChowkaPlayer.PIECES;
    }

    /**
     * Bot heuristic: pick the best piece to move from the legal set.
     * Priority: capture > finish a piece > leave base > advance the furthest piece.
     */
    public int chooseBotMove(ChowkaRoom room, ChowkaPlayer bot, int roll, List<Integer> legal) {
        int best = legal.get(0);
        int bestScore = Integer.MIN_VALUE;
        for (int id : legal) {
            Piece p = bot.piece(id);
            int score;
            int target = p.inBase() ? 0 : p.getPathIndex() + roll;
            if (target == CENTER_INDEX) {
                score = 1000;                                  // finishing is great
            } else if (!p.inBase() && wouldCapture(room, bot, target)) {
                score = 800;                                   // capture is strong
            } else if (p.inBase()) {
                score = 200;                                   // get a piece out
            } else {
                score = 100 + p.getPathIndex();               // advance leader
            }
            if (score > bestScore) { bestScore = score; best = id; }
        }
        return best;
    }

    private boolean wouldCapture(ChowkaRoom room, ChowkaPlayer mover, int targetIndex) {
        int[] here = cell(mover.getSeat(), targetIndex);
        if (here == null || isSafe(here[0], here[1])) return false;
        for (ChowkaPlayer other : room.getPlayers().values()) {
            if (other == mover) continue;
            for (Piece op : other.getPieces()) {
                if (op.inBase() || op.getPathIndex() == CENTER_INDEX) continue;
                int[] oc = cell(other.getSeat(), op.getPathIndex());
                if (oc != null && oc[0] == here[0] && oc[1] == here[1]) return true;
            }
        }
        return false;
    }

    /** Distinct safe cells, as a list of [row,col], for client rendering. */
    public List<int[]> safeCells() {
        Set<String> seen = new LinkedHashSet<>();
        List<int[]> out = new ArrayList<>();
        int[][] cells = {{2, 2}, {4, 2}, {0, 2}, {2, 0}, {2, 4}};
        for (int[] c : cells) {
            if (seen.add(c[0] + "," + c[1])) out.add(c);
        }
        return out;
    }
}
