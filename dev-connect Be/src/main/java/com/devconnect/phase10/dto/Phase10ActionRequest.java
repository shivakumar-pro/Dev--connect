package com.devconnect.phase10.dto;

import lombok.Data;

import java.util.List;

/**
 * Single payload type for all in-game WebSocket actions. Only the fields relevant to
 * the action being performed are populated.
 */
@Data
public class Phase10ActionRequest {
    private String roomId;

    // DRAW
    private Boolean fromDiscard;

    // LAY PHASE — list of card-id groups (each group = one phase requirement)
    private List<List<String>> groups;

    // HIT
    private String meldId;
    private String cardId;
    private String runEnd;       // LOW | HIGH (wild placement on a run)

    // DISCARD
    private String discardCardId;
    private String skipTarget;   // required when discarding a Skip

    // CHAT
    private String message;

    // ADD/REMOVE BOT
    private String botName;
}
