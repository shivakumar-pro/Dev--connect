package com.devconnect.toxic.model;

import lombok.Data;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Data
public class ToxicBitePlayer {
    private String username;

    /** Aggregate score across all completed rounds. */
    private int totalScore;

    /** Per-round score history (length == rounds completed). */
    private List<Integer> roundScores = new ArrayList<>();

    /** Current round's running score (becomes the next roundScores entry on round end). */
    private int currentRoundScore;

    /** Whether this player is still eating in the current round. */
    private boolean alive = true;

    /** True when this player auto-finished the round safely (ate 8/9 → +5 bonus). */
    private boolean survived;

    /** Position (1..9) this player chose to poison on the OPPONENT's board. Null until picked. */
    private Integer poisonForOpponent;

    /** Positions (1..9) this player has eaten this round. */
    private Set<Integer> eatenPositions = new LinkedHashSet<>();

    public ToxicBitePlayer(String username) {
        this.username = username;
    }
}
