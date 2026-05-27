package com.devconnect.party.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class PartyEvent {

    public enum Type {
        ROOM_CREATED,
        PLAYER_JOINED,
        PLAYER_LEFT,
        GAME_STARTED,
        ROUND_START,
        ACTION_ACK,
        ROUND_RESULT,
        GAME_OVER,
        SCOREBOARD,
        CHAT_MESSAGE,
        TIMER_TICK,
        TIMER_EXPIRED,
        REMATCH_REQUEST,
        REMATCH_ACCEPTED,
        ERROR
    }

    private Type type;
    private String roomId;
    private String player;
    private String message;
    private String gameType;
    private String status;

    // Round info
    private Integer currentRound;
    private Integer maxRounds;
    private Integer timerSeconds;

    // Game-specific data sent to players (question, options, etc.)
    private Map<String, Object> roundData;

    // Round results
    private Map<String, Object> results;

    // Scoreboard
    private List<Map<String, Object>> scoreboard;

    // Players list
    private List<String> players;
    private String hostUsername;

    // Chat
    private String sender;

    // Winner
    private String winner;
}
