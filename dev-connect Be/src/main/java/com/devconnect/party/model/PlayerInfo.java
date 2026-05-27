package com.devconnect.party.model;

import lombok.Data;

@Data
public class PlayerInfo {
    private String username;
    private int score;
    private boolean connected;

    public PlayerInfo(String username) {
        this.username = username;
        this.score = 0;
        this.connected = true;
    }

    public void addScore(int points) {
        this.score += points;
    }
}
