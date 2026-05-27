package com.devconnect.party.model;

import lombok.Data;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledFuture;

@Data
public class PartyRoom {

    public enum Status {
        WAITING,
        STARTED,
        IN_ROUND,
        ROUND_RESULT,
        FINISHED
    }

    private String roomId;
    private PartyGameType gameType;
    private Map<String, PlayerInfo> players = new LinkedHashMap<>();
    private String hostUsername;
    private Status status = Status.WAITING;

    private int currentRound = 0;
    private int maxRounds = 5;
    private int timerSeconds = 10;
    private int maxPlayers = 10;
    private int minPlayers = 2;

    // Per-round data: actions submitted by players this round
    private Map<String, Object> playerActions = new ConcurrentHashMap<>();

    // Game-specific data (questions, secrets, etc.)
    private Map<String, Object> gameData = new ConcurrentHashMap<>();

    // Timer
    private transient ScheduledFuture<?> roundTimer;

    // Rematch
    private Set<String> rematchVotes = new HashSet<>();

    public PartyRoom(String roomId, PartyGameType gameType, String hostUsername) {
        this.roomId = roomId;
        this.gameType = gameType;
        this.hostUsername = hostUsername;
    }

    public boolean isFull() {
        return players.size() >= maxPlayers;
    }

    public boolean hasEnoughPlayers() {
        return players.size() >= minPlayers;
    }

    public boolean allPlayersActed() {
        return playerActions.size() >= players.size();
    }

    public List<String> getPlayerUsernames() {
        return new ArrayList<>(players.keySet());
    }

    public PlayerInfo getPlayer(String username) {
        return players.get(username);
    }

    public void addPlayer(String username) {
        players.put(username, new PlayerInfo(username));
    }

    public void removePlayer(String username) {
        players.remove(username);
    }

    public void clearRoundData() {
        playerActions.clear();
    }

    public void cancelTimer() {
        if (roundTimer != null && !roundTimer.isDone()) {
            roundTimer.cancel(false);
            roundTimer = null;
        }
    }

    public void resetForRematch() {
        currentRound = 0;
        status = Status.WAITING;
        playerActions.clear();
        gameData.clear();
        rematchVotes.clear();
        cancelTimer();
        players.values().forEach(p -> p.setScore(0));
    }

    public List<PlayerInfo> getScoreboard() {
        List<PlayerInfo> sorted = new ArrayList<>(players.values());
        sorted.sort((a, b) -> Integer.compare(b.getScore(), a.getScore()));
        return sorted;
    }
}
