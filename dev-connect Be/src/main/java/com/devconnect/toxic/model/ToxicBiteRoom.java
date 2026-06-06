package com.devconnect.toxic.model;

import lombok.Data;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Data
public class ToxicBiteRoom {

    public enum Status { WAITING, IN_PROGRESS, FINISHED }

    /** Game-flow phase within a round. POISONING -> EATING -> ROUND_OVER -> (next round | FINISHED). */
    public enum Phase { POISONING, EATING, ROUND_OVER }

    private String roomId;
    private String hostUsername;
    private Map<String, ToxicBitePlayer> players = new LinkedHashMap<>();
    private List<String> turnOrder = new ArrayList<>();
    private int currentTurnIndex = 0;

    private Status status = Status.WAITING;
    private Phase phase = Phase.POISONING;

    private int totalRounds = 3;
    private int currentRound = 0;          // 0 before start; 1..totalRounds during play
    private int maxPlayers = 2;
    private int minPlayers = 2;
    private String winner;                 // overall winner (null on tie)

    /** Shared 9-emoji board for the current round (same indices, 0..8 → positions 1..9). */
    private List<String> board = new ArrayList<>();

    /** Snapshots of completed rounds for the round-over reveal screens. */
    private List<Map<String, Object>> roundHistory = new ArrayList<>();

    /** Recent events (small ring buffer) for the game log. */
    private List<String> eventLog = new ArrayList<>();

    public ToxicBiteRoom(String roomId, String hostUsername) {
        this.roomId = roomId;
        this.hostUsername = hostUsername;
    }

    public String getCurrentUsername() {
        if (turnOrder.isEmpty()) return null;
        return turnOrder.get(currentTurnIndex);
    }

    /** Advance to the next still-alive player; returns false if none are alive. */
    public boolean advanceTurn() {
        if (turnOrder.isEmpty()) return false;
        int n = turnOrder.size();
        for (int i = 0; i < n; i++) {
            currentTurnIndex = (currentTurnIndex + 1) % n;
            ToxicBitePlayer p = players.get(turnOrder.get(currentTurnIndex));
            if (p != null && p.isAlive()) return true;
        }
        return false;
    }

    public void logEvent(String msg) {
        eventLog.add(msg);
        if (eventLog.size() > 30) eventLog.remove(0);
    }

    /** Opponent in 2-player mode (returns null if no other player). */
    public ToxicBitePlayer opponentOf(String username) {
        for (ToxicBitePlayer p : players.values()) {
            if (!p.getUsername().equals(username)) return p;
        }
        return null;
    }

    /** Build a fresh empty turn-order from current players' insertion order. */
    public void resetTurnOrder() {
        turnOrder = new ArrayList<>(players.keySet());
        currentTurnIndex = 0;
    }
}
