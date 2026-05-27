package com.devconnect.party.dto;

import lombok.Data;

@Data
public class CreatePartyRoomRequest {
    private String gameType;    // GUESS_THE_NUMBER, THIS_OR_THAT, etc.
    private Integer maxRounds;  // default 5
    private Integer timerSeconds; // default 10
    private Integer maxPlayers;   // default 10
}
