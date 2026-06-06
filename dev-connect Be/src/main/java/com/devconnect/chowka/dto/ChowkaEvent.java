package com.devconnect.chowka.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

/**
 * Every server -> client message for Chowka Bara.
 *
 * Public events go to {@code /topic/chowka/{roomId}}; errors go privately to
 * {@code /user/queue/chowka}. Most events carry a full public {@code state}
 * snapshot, plus discrete fields (roll, movedPiece, capture...) that drive the
 * dice + token animations.
 */
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class ChowkaEvent {

    public enum Type {
        PLAYER_JOINED,
        PLAYER_LEFT,
        BOT_ADDED,
        GAME_STARTED,
        STATE,            // full public snapshot
        TURN_START,
        DICE_ROLLED,
        PIECE_MOVED,
        PIECE_CAPTURED,
        PIECE_HOME,       // a piece reached the centre
        NO_MOVE,          // rolled but no legal move — turn passes
        GAME_OVER,
        CHAT_MESSAGE,
        REMATCH,
        ERROR
    }

    private Type type;
    private String roomId;
    private String player;        // actor / subject of the event
    private String message;
    private String status;
    private String hostUsername;

    // Full public snapshot (see ChowkaGameService#publicState)
    private Map<String, Object> state;

    // Action specifics (for animation)
    private Integer roll;             // DICE_ROLLED
    private Integer pieceId;          // PIECE_MOVED / PIECE_HOME
    private Integer fromIndex;        // PIECE_MOVED
    private Integer toIndex;          // PIECE_MOVED
    private Boolean extraTurn;        // DICE_ROLLED / PIECE_MOVED
    private List<Map<String, Object>> captures; // PIECE_CAPTURED: [{owner, row, col}]
    private String currentTurn;

    // Results
    private List<Map<String, Object>> standings;
    private String winner;

    // Chat
    private String sender;
}
