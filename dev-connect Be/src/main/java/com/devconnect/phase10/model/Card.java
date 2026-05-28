package com.devconnect.phase10.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * A single Phase 10 card.
 *
 * Deck composition (108 cards):
 *   - Number cards 1-12 in 4 colors, TWO of each = 96
 *   - 8 Wild cards
 *   - 4 Skip cards
 *
 * Each card carries a stable, unique {@code id} so the frontend can track and
 * animate the exact same card object as it moves between hand / piles / melds.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Card {

    public enum Color { RED, BLUE, GREEN, YELLOW, NONE }

    public enum Type { NUMBER, WILD, SKIP }

    private String id;     // e.g. "R-7-1", "WILD-3", "SKIP-2"
    private Type type;
    private Color color;   // NONE for WILD / SKIP
    private int value;     // 1-12 for NUMBER, 0 otherwise

    public boolean isWild() {
        return type == Type.WILD;
    }

    public boolean isSkip() {
        return type == Type.SKIP;
    }

    public boolean isNumber() {
        return type == Type.NUMBER;
    }

    /** Penalty points this card adds to a player's score if still in hand at round end. */
    public int penaltyPoints() {
        return switch (type) {
            case WILD -> 25;
            case SKIP -> 15;
            case NUMBER -> value <= 9 ? 5 : 10;
        };
    }

    public static Card number(Color color, int value, int copy) {
        return new Card(color.name().charAt(0) + "-" + value + "-" + copy, Type.NUMBER, color, value);
    }

    public static Card wild(int index) {
        return new Card("WILD-" + index, Type.WILD, Color.NONE, 0);
    }

    public static Card skip(int index) {
        return new Card("SKIP-" + index, Type.SKIP, Color.NONE, 0);
    }
}
