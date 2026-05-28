package com.devconnect.phase10.model;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class Phase10Player {

    private String username;
    private boolean bot;
    private boolean connected = true;

    private List<Card> hand = new ArrayList<>();

    /** 1-based phase this player is currently trying to complete (persists across rounds). */
    private int currentPhase = 1;

    /** True once the player has laid down their phase this round. */
    private boolean phaseCompletedThisRound = false;

    /** True if the player advanced a phase at the end of the previous round (for UI flair). */
    private boolean advancedLastRound = false;

    /** Cumulative penalty score across all rounds (lower is better). */
    private int totalScore = 0;

    /** Points the player picked up at the last round end (for the result screen). */
    private int lastRoundScore = 0;

    /** Set when another player discards a Skip targeting this player. */
    private boolean skipNext = false;

    public Phase10Player(String username, boolean bot) {
        this.username = username;
        this.bot = bot;
    }

    public Card findCard(String cardId) {
        for (Card c : hand) if (c.getId().equals(cardId)) return c;
        return null;
    }

    public void resetForRound() {
        hand.clear();
        phaseCompletedThisRound = false;
        skipNext = false;
        lastRoundScore = 0;
    }
}
