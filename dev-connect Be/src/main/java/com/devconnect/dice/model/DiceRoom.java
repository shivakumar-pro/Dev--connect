package com.devconnect.dice.model;

import lombok.Data;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Data
public class DiceRoom {

    public enum Status { WAITING, IN_PROGRESS, FINISHED }

    private String roomId;
    private DiceGameType gameType;
    private String hostUsername;
    private Map<String, DicePlayer> players = new LinkedHashMap<>();
    private List<String> turnOrder = new ArrayList<>();
    private int currentTurnIndex = 0;
    private Status status = Status.WAITING;
    private int targetScore;
    private int maxPlayers = 6;
    private int minPlayers = 2;
    private String winner;

    private Map<String, Object> gameState = new ConcurrentHashMap<>();
    private List<Map<String, Object>> events = new ArrayList<>();

    public DiceRoom(String roomId, DiceGameType gameType, String hostUsername) {
        this.roomId = roomId;
        this.gameType = gameType;
        this.hostUsername = hostUsername;
    }

    public String getCurrentUsername() {
        if (turnOrder.isEmpty()) return null;
        return turnOrder.get(currentTurnIndex);
    }

    public DicePlayer getCurrentPlayer() {
        String u = getCurrentUsername();
        return u == null ? null : players.get(u);
    }

    public void advanceTurn() {
        if (turnOrder.isEmpty()) return;
        int n = turnOrder.size();
        for (int i = 0; i < n; i++) {
            currentTurnIndex = (currentTurnIndex + 1) % n;
            DicePlayer p = players.get(turnOrder.get(currentTurnIndex));
            if (p != null && !p.isEliminated()) return;
        }
    }

    public void logEvent(Map<String, Object> e) {
        events.add(e);
        if (events.size() > 50) events.remove(0);
    }
}
