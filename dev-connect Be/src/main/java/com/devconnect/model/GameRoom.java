package com.devconnect.model;

import lombok.Data;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledFuture;

@Data
public class GameRoom {

    public enum Status {
        WAITING,
        NUMBER_SELECTION,
        PLAYING,
        FINISHED
    }

    public enum Difficulty {
        EASY(1, 50),
        MEDIUM(1, 100),
        HARD(1, 1000);

        private final int min;
        private final int max;

        Difficulty(int min, int max) {
            this.min = min;
            this.max = max;
        }

        public int getMin() { return min; }
        public int getMax() { return max; }
    }

    private String roomId;
    private List<String> players = new ArrayList<>(2);
    private Map<String, Integer> secretNumbers = new ConcurrentHashMap<>();
    private Map<String, Integer> attempts = new ConcurrentHashMap<>();
    private Map<String, List<Integer>> guessHistory = new ConcurrentHashMap<>();
    private String currentTurnPlayer;
    private Status status = Status.WAITING;
    private String winner;
    private Difficulty difficulty = Difficulty.MEDIUM;
    private int minRange;
    private int maxRange;

    // Timer
    private transient ScheduledFuture<?> turnTimer;
    private int turnTimeoutSeconds = 30;

    // Rematch
    private Set<String> rematchRequests = new HashSet<>();

    public GameRoom(String roomId) {
        this.roomId = roomId;
        this.minRange = difficulty.getMin();
        this.maxRange = difficulty.getMax();
    }

    public GameRoom(String roomId, Difficulty difficulty) {
        this.roomId = roomId;
        this.difficulty = difficulty;
        this.minRange = difficulty.getMin();
        this.maxRange = difficulty.getMax();
    }

    public boolean isFull() {
        return players.size() >= 2;
    }

    public boolean bothNumbersSelected() {
        return secretNumbers.size() == 2;
    }

    public String getOpponent(String player) {
        return players.stream()
                .filter(p -> !p.equals(player))
                .findFirst()
                .orElse(null);
    }

    public int getAttemptCount(String player) {
        return attempts.getOrDefault(player, 0);
    }

    public void incrementAttempts(String player) {
        attempts.merge(player, 1, Integer::sum);
    }

    public void addGuess(String player, int guess) {
        guessHistory.computeIfAbsent(player, k -> new ArrayList<>()).add(guess);
    }

    public boolean hasAlreadyGuessed(String player, int guess) {
        List<Integer> history = guessHistory.get(player);
        return history != null && history.contains(guess);
    }

    public void resetForRematch() {
        secretNumbers.clear();
        attempts.clear();
        guessHistory.clear();
        currentTurnPlayer = null;
        status = Status.NUMBER_SELECTION;
        winner = null;
        rematchRequests.clear();
        cancelTimer();
        for (String player : players) {
            attempts.put(player, 0);
        }
    }

    public void cancelTimer() {
        if (turnTimer != null && !turnTimer.isDone()) {
            turnTimer.cancel(false);
            turnTimer = null;
        }
    }
}
