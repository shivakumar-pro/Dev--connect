package com.devconnect.phase10.model;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * A group of cards laid on the table once a player completes (part of) their phase.
 * Other players (and the owner) can later "hit" extra cards onto a meld.
 *
 * For RUN melds, {@code cards} is kept in ascending resolved order and {@code runStart}
 * is the value represented by the first card; each subsequent slot represents the next
 * consecutive value (wilds included). This lets us validate/extend the run at either end.
 *
 * For SET melds, {@code setValue} is the shared value. For COLOR melds, {@code color}
 * is the shared color.
 */
@Data
public class Meld {

    private String id;
    private String owner;                 // username who originally laid the meld
    private PhaseDefinition.GroupType type;
    private List<Card> cards = new ArrayList<>();

    private Integer setValue;             // for SET
    private Card.Color color;             // for COLOR
    private Integer runStart;             // for RUN (resolved value of cards.get(0))

    public int size() {
        return cards.size();
    }

    /** For a RUN, the resolved value at the high end (runStart + size - 1). */
    public int runEnd() {
        return runStart + cards.size() - 1;
    }
}
