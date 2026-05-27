package com.devconnect.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class GameEvent {

    public enum Type {
        JOIN_ROOM,
        NUMBER_SELECTED,
        START_GAME,
        GUESS_RESULT,
        TURN_SWITCH,
        TURN_TIMEOUT,
        GAME_RESULT,
        CHAT_MESSAGE,
        REMATCH_REQUEST,
        REMATCH_ACCEPTED,
        ERROR
    }

    private Type type;
    private String roomId;
    private String player;
    private String message;
    private String hint;
    private String currentTurnPlayer;
    private String winner;
    private Integer guess;
    private Integer player1Attempts;
    private Integer player2Attempts;
    private String player1;
    private String player2;
    private String status;
    private String difficulty;
    private Integer minRange;
    private Integer maxRange;
    private Integer turnTimeoutSeconds;
    private String sender;
}
