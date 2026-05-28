package com.devconnect.phase10.model;

import lombok.Data;

import java.util.*;
import java.util.concurrent.ScheduledFuture;

@Data
public class Phase10Room {

    public enum Status { WAITING, PLAYING, ROUND_RESULT, FINISHED }

    /** Within a turn: the player must DRAW first, then enters ACTION (lay/hit/discard). */
    public enum TurnPhase { DRAW, ACTION }

    private String roomId;
    private String hostUsername;
    private Status status = Status.WAITING;

    /** Seating order preserved by LinkedHashMap. */
    private Map<String, Phase10Player> players = new LinkedHashMap<>();

    private List<String> turnOrder = new ArrayList<>();
    private int currentTurnIndex = 0;
    private TurnPhase turnPhase = TurnPhase.DRAW;

    /** Bumped every time a new turn begins; scheduled timers/bot moves verify it before acting. */
    private long turnToken = 0;

    private List<Card> drawPile = new ArrayList<>();
    private List<Card> discardPile = new ArrayList<>(); // top = last element
    private List<Meld> table = new ArrayList<>();        // all laid melds

    private int roundNumber = 0;
    private int maxPlayers = 6;
    private int minPlayers = 2;
    private int turnTimerSeconds = 45;
    private boolean botsEnabled = false;

    private String winner;

    private transient ScheduledFuture<?> turnTimer;
    private Set<String> rematchVotes = new HashSet<>();

    public Phase10Room(String roomId, String hostUsername) {
        this.roomId = roomId;
        this.hostUsername = hostUsername;
    }

    public boolean isFull() {
        return players.size() >= maxPlayers;
    }

    public boolean hasEnoughPlayers() {
        return players.size() >= minPlayers;
    }

    public List<String> getPlayerUsernames() {
        return new ArrayList<>(players.keySet());
    }

    public Phase10Player getPlayer(String username) {
        return players.get(username);
    }

    public String getCurrentPlayerName() {
        if (turnOrder.isEmpty()) return null;
        return turnOrder.get(currentTurnIndex % turnOrder.size());
    }

    public Phase10Player getCurrentPlayer() {
        String name = getCurrentPlayerName();
        return name == null ? null : players.get(name);
    }

    public Card discardTop() {
        return discardPile.isEmpty() ? null : discardPile.get(discardPile.size() - 1);
    }

    public Meld findMeld(String meldId) {
        for (Meld m : table) if (m.getId().equals(meldId)) return m;
        return null;
    }

    public void cancelTimer() {
        if (turnTimer != null && !turnTimer.isDone()) {
            turnTimer.cancel(false);
            turnTimer = null;
        }
    }

    public void resetForRematch() {
        status = Status.WAITING;
        roundNumber = 0;
        drawPile.clear();
        discardPile.clear();
        table.clear();
        rematchVotes.clear();
        winner = null;
        currentTurnIndex = 0;
        turnPhase = TurnPhase.DRAW;
        cancelTimer();
        for (Phase10Player p : players.values()) {
            p.setCurrentPhase(1);
            p.setTotalScore(0);
            p.setAdvancedLastRound(false);
            p.resetForRound();
        }
    }
}
