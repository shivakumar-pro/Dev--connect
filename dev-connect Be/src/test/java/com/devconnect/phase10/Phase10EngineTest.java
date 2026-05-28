package com.devconnect.phase10;

import com.devconnect.phase10.engine.Phase10Bot;
import com.devconnect.phase10.engine.Phase10Engine;
import com.devconnect.phase10.engine.Phase10Engine.RunEnd;
import com.devconnect.phase10.model.Card;
import com.devconnect.phase10.model.Card.Color;
import com.devconnect.phase10.model.Meld;
import com.devconnect.phase10.model.PhaseDefinition.GroupType;
import com.devconnect.phase10.model.PhaseDefinition.Requirement;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** Pure unit tests for the Phase 10 rules engine and bot (no Spring context). */
class Phase10EngineTest {

    private final Phase10Engine engine = new Phase10Engine();
    private final Phase10Bot bot = new Phase10Bot(engine);

    private Card n(Color c, int v) { return Card.number(c, v, 1); }
    private Card n2(Color c, int v) { return Card.number(c, v, 2); }

    @Test
    void deckHas108Cards() {
        List<Card> deck = engine.buildDeck();
        assertEquals(108, deck.size());
        assertEquals(8, deck.stream().filter(Card::isWild).count());
        assertEquals(4, deck.stream().filter(Card::isSkip).count());
        assertEquals(96, deck.stream().filter(Card::isNumber).count());
    }

    @Test
    void validSetWithWild() {
        Meld m = engine.validateGroup(List.of(n(Color.RED, 7), n2(Color.BLUE, 7), Card.wild(1)),
                new Requirement(GroupType.SET, 3), "me");
        assertNotNull(m);
        assertEquals(7, m.getSetValue());
    }

    @Test
    void setRejectsMixedValues() {
        assertNull(engine.validateGroup(List.of(n(Color.RED, 7), n(Color.BLUE, 8), n(Color.GREEN, 7)),
                new Requirement(GroupType.SET, 3), "me"));
    }

    @Test
    void setCannotBeAllWild() {
        assertNull(engine.validateGroup(List.of(Card.wild(1), Card.wild(2), Card.wild(3)),
                new Requirement(GroupType.SET, 3), "me"));
    }

    @Test
    void validRunWithWildFillingGap() {
        // 3,4,_,6 with a wild filling the 5
        Meld m = engine.validateGroup(List.of(n(Color.RED, 3), n(Color.BLUE, 4), Card.wild(1), n(Color.GREEN, 6)),
                new Requirement(GroupType.RUN, 4), "me");
        assertNotNull(m);
        assertEquals(3, m.getRunStart());
        assertEquals(6, m.runEnd());
        assertEquals(4, m.getCards().size());
    }

    @Test
    void runRejectsDuplicateValues() {
        assertNull(engine.validateGroup(List.of(n(Color.RED, 4), n2(Color.BLUE, 4), n(Color.GREEN, 5), n(Color.RED, 6)),
                new Requirement(GroupType.RUN, 4), "me"));
    }

    @Test
    void validColorWithWild() {
        Meld m = engine.validateGroup(List.of(n(Color.RED, 1), n(Color.RED, 5), n(Color.RED, 9),
                        n2(Color.RED, 2), n(Color.RED, 11), n(Color.RED, 7), Card.wild(1)),
                new Requirement(GroupType.COLOR, 7), "me");
        assertNotNull(m);
        assertEquals(Color.RED, m.getColor());
    }

    @Test
    void phase2ValidatesSetAndRunInAnyOrder() {
        // Phase 2 = set of 3 + run of 4. Send run first, set second — engine should still match.
        List<List<Card>> groups = List.of(
                List.of(n(Color.RED, 5), n(Color.BLUE, 6), n(Color.GREEN, 7), n(Color.YELLOW, 8)), // run of 4
                List.of(n(Color.RED, 9), n2(Color.BLUE, 9), n(Color.GREEN, 9))                      // set of 3
        );
        Phase10Engine.LayResult r = engine.validatePhase(groups, 2, "me");
        assertTrue(r.ok, r.error);
        assertEquals(2, r.melds.size());
    }

    @Test
    void phaseFailsWithWrongCards() {
        List<List<Card>> groups = List.of(
                List.of(n(Color.RED, 5), n(Color.BLUE, 6), n(Color.GREEN, 9), n(Color.YELLOW, 8)), // not consecutive
                List.of(n(Color.RED, 9), n2(Color.BLUE, 9), n(Color.GREEN, 9))
        );
        assertFalse(engine.validatePhase(groups, 2, "me").ok);
    }

    @Test
    void hitOntoSetAndRunAndColor() {
        Meld set = engine.validateGroup(List.of(n(Color.RED, 7), n2(Color.BLUE, 7), n(Color.GREEN, 7)),
                new Requirement(GroupType.SET, 3), "me");
        assertTrue(engine.applyHit(set, n(Color.YELLOW, 7), null));
        assertFalse(engine.applyHit(set, n(Color.YELLOW, 5), null));
        assertTrue(engine.applyHit(set, Card.wild(1), null)); // wild always fits a set

        Meld run = engine.validateGroup(List.of(n(Color.RED, 4), n(Color.BLUE, 5), n(Color.GREEN, 6), n(Color.YELLOW, 7)),
                new Requirement(GroupType.RUN, 4), "me");
        assertTrue(engine.applyHit(run, n(Color.RED, 8), null));   // high end
        assertTrue(engine.applyHit(run, n(Color.RED, 3), null));   // low end
        assertEquals(3, run.getRunStart());
        assertEquals(8, run.runEnd());
        assertFalse(engine.applyHit(run, n(Color.RED, 1), null));  // not adjacent
    }

    @Test
    void scoringMatchesRules() {
        int score = engine.handScore(List.of(
                n(Color.RED, 5),     // 5
                n(Color.BLUE, 12),   // 10
                Card.skip(1),        // 15
                Card.wild(1)         // 25
        ));
        assertEquals(55, score);
    }

    @Test
    void botFindsValidPhase1LayDown() {
        // Two sets of 3 present in hand (three 4s, three 9s) plus filler.
        List<Card> hand = List.of(
                n(Color.RED, 4), n2(Color.BLUE, 4), n(Color.GREEN, 4),
                n(Color.RED, 9), n2(Color.BLUE, 9), n(Color.GREEN, 9),
                n(Color.RED, 1), n(Color.YELLOW, 12)
        );
        List<List<Card>> lay = bot.findLayDown(hand, 1);
        assertNotNull(lay);
        assertEquals(2, lay.size());
        assertEquals(3, lay.get(0).size());
        assertEquals(3, lay.get(1).size());
    }

    @Test
    void botUsesWildToCompleteSet() {
        List<Card> hand = List.of(
                n(Color.RED, 4), n2(Color.BLUE, 4), Card.wild(1),
                n(Color.RED, 9), n2(Color.BLUE, 9), n(Color.GREEN, 9),
                n(Color.YELLOW, 1)
        );
        List<List<Card>> lay = bot.findLayDown(hand, 1);
        assertNotNull(lay);
    }
}
