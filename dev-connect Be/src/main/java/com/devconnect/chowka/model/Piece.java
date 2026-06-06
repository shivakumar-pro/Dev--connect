package com.devconnect.chowka.model;

import lombok.Data;

/**
 * A single playing piece for Chowka Bara.
 *
 * Position is tracked as an index into the owning player's path:
 *   -1            -> still in base (not yet on the board)
 *    0..center-1  -> travelling along the path
 *    center index -> reached the centre home (finished)
 */
@Data
public class Piece {
    private int id;          // 0..3 within a player
    private int pathIndex;   // -1 = base, otherwise index into the owner's path

    public Piece(int id) {
        this.id = id;
        this.pathIndex = -1;
    }

    public boolean inBase() { return pathIndex < 0; }
}
