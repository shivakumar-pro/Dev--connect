package com.devconnect.dice.dto;

import com.devconnect.dice.model.DiceGameType;
import lombok.Data;

@Data
public class CreateDiceRoomRequest {
    private DiceGameType gameType;
    private String hostUsername;
    private Integer targetScore;
    private Integer maxPlayers;
}
