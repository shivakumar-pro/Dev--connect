package com.devconnect.dice.model;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class DicePlayer {
    private String username;
    private int score;
    private int diceCount;
    private List<Integer> hand = new ArrayList<>();
    private boolean eliminated;
    private boolean hasPlayedFinalTurn;

    public DicePlayer(String username) {
        this.username = username;
    }
}
