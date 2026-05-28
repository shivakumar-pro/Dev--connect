package com.devconnect.phase10.dto;

import com.devconnect.phase10.model.Card;
import com.devconnect.phase10.model.Meld;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

/**
 * Every server -> client message for Phase 10.
 *
 * Public events go to {@code /topic/phase10/{roomId}}; private events (your hand,
 * errors) go to {@code /user/queue/phase10}.
 *
 * Most events carry a full public {@code state} snapshot so the client can simply
 * render it, while the discrete action fields (card, source, meld...) drive the
 * card-movement animations.
 */
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class Phase10Event {

    public enum Type {
        PLAYER_JOINED,
        PLAYER_LEFT,
        BOT_ADDED,
        GAME_STARTED,
        ROUND_STARTED,
        HAND,            // private: your cards
        STATE,           // full public snapshot
        TURN_START,
        CARD_DRAWN,
        PHASE_LAID,
        HIT,
        CARD_DISCARDED,
        SKIP_APPLIED,
        ROUND_RESULT,
        GAME_OVER,
        CHAT_MESSAGE,
        REMATCH_REQUEST,
        REMATCH_ACCEPTED,
        ERROR
    }

    private Type type;
    private String roomId;
    private String player;        // actor / subject of the event
    private String message;
    private String status;
    private String hostUsername;
    private List<String> players;

    // Full public state snapshot (see Phase10Service#publicState)
    private Map<String, Object> state;

    // Private hand (HAND events only)
    private List<Card> hand;

    // Action specifics (for animation)
    private Card card;            // drawn / discarded card
    private String source;        // DRAW | DISCARD
    private List<Meld> melds;     // PHASE_LAID
    private String meldId;        // HIT target meld
    private String target;        // SKIP_APPLIED target
    private Integer drawPileCount;
    private Card discardTop;
    private String currentTurn;
    private String turnPhase;
    private Integer turnTimerSeconds;

    // Results
    private List<Map<String, Object>> standings;
    private Map<String, Object> roundResult;
    private String winner;

    // Chat
    private String sender;
}
