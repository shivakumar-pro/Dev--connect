package com.devconnect.bottle.model;

import lombok.Data;

@Data
public class BottlePlayer {
    private String username;
    private int attempts;          // how many submissions made
    private int lastMatches;       // result of the most recent submission (0..5)
    private boolean solved;        // reached 5/5
    private int solvedAtAttempt;   // attempt number on which they solved (0 if not solved)
    private int finishRank;        // order in which players solved (1 = first); 0 if not solved

    // ── Bot fields (ignored for human players) ──
    private boolean bot;
    private int botTargetAttempts; // how many attempts this bot "needs" to solve
    private long botIntervalMs;    // simulated time spent per attempt

    public BottlePlayer(String username) {
        this.username = username;
    }
}
