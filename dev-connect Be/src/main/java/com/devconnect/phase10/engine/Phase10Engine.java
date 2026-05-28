package com.devconnect.phase10.engine;

import com.devconnect.phase10.model.Card;
import com.devconnect.phase10.model.Meld;
import com.devconnect.phase10.model.PhaseDefinition;
import com.devconnect.phase10.model.PhaseDefinition.GroupType;
import com.devconnect.phase10.model.PhaseDefinition.Requirement;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * Pure Phase 10 rules engine — no state, no messaging. Builds decks and validates
 * sets / runs / colors (with wild substitution), full phase lay-downs, and hits.
 *
 * Returned {@link Meld}s carry resolved metadata (set value, run start, color) so the
 * service and frontend can render and extend them later.
 */
@Component
public class Phase10Engine {

    // ==================== DECK ====================

    /** Standard 108-card Phase 10 deck. */
    public List<Card> buildDeck() {
        List<Card> deck = new ArrayList<>(108);
        for (Card.Color color : new Card.Color[]{Card.Color.RED, Card.Color.BLUE, Card.Color.GREEN, Card.Color.YELLOW}) {
            for (int value = 1; value <= 12; value++) {
                deck.add(Card.number(color, value, 1));
                deck.add(Card.number(color, value, 2));
            }
        }
        for (int i = 1; i <= 8; i++) deck.add(Card.wild(i));
        for (int i = 1; i <= 4; i++) deck.add(Card.skip(i));
        return deck;
    }

    public void shuffle(List<Card> deck) {
        Collections.shuffle(deck);
    }

    // ==================== GROUP VALIDATION ====================

    /**
     * Validate a single group of cards against one requirement. Returns a resolved
     * {@link Meld} (with ordering/metadata) or {@code null} if the group is invalid.
     */
    public Meld validateGroup(List<Card> cards, Requirement req, String owner) {
        if (cards == null || cards.size() != req.getCount()) return null;
        for (Card c : cards) if (c.isSkip()) return null; // skips can never be melded
        return switch (req.getType()) {
            case SET -> validateSet(cards, req.getCount(), owner);
            case RUN -> validateRun(cards, req.getCount(), owner);
            case COLOR -> validateColor(cards, req.getCount(), owner);
        };
    }

    private Meld validateSet(List<Card> cards, int count, String owner) {
        Integer value = null;
        int naturals = 0;
        for (Card c : cards) {
            if (c.isNumber()) {
                naturals++;
                if (value == null) value = c.getValue();
                else if (value != c.getValue()) return null;
            }
        }
        if (naturals == 0) return null; // cannot be all wild
        Meld meld = new Meld();
        meld.setId(UUID.randomUUID().toString().substring(0, 8));
        meld.setOwner(owner);
        meld.setType(GroupType.SET);
        meld.setCards(new ArrayList<>(cards));
        meld.setSetValue(value);
        return meld;
    }

    private Meld validateColor(List<Card> cards, int count, String owner) {
        Card.Color color = null;
        int naturals = 0;
        for (Card c : cards) {
            if (c.isNumber()) {
                naturals++;
                if (color == null) color = c.getColor();
                else if (color != c.getColor()) return null;
            }
        }
        if (naturals == 0) return null;
        Meld meld = new Meld();
        meld.setId(UUID.randomUUID().toString().substring(0, 8));
        meld.setOwner(owner);
        meld.setType(GroupType.COLOR);
        meld.setCards(new ArrayList<>(cards));
        meld.setColor(color);
        return meld;
    }

    private Meld validateRun(List<Card> cards, int count, String owner) {
        List<Card> naturals = new ArrayList<>();
        int wilds = 0;
        for (Card c : cards) {
            if (c.isNumber()) naturals.add(c);
            else if (c.isWild()) wilds++;
        }
        if (naturals.isEmpty()) return null; // cannot be all wild

        // Distinct natural values
        Set<Integer> seen = new HashSet<>();
        int min = 13, max = 0;
        for (Card c : naturals) {
            if (!seen.add(c.getValue())) return null; // duplicate value -> not a run
            min = Math.min(min, c.getValue());
            max = Math.max(max, c.getValue());
        }
        if ((max - min) > count - 1) return null; // naturals too spread out

        int start = Math.max(1, max - count + 1); // lowest feasible window start
        if (start + count - 1 > 12) return null;

        // Build ordered slots: place naturals at their offset, wilds fill the gaps
        Card[] slots = new Card[count];
        for (Card c : naturals) slots[c.getValue() - start] = c;
        Deque<Card> wildPool = new ArrayDeque<>();
        for (Card c : cards) if (c.isWild()) wildPool.add(c);
        List<Card> ordered = new ArrayList<>(count);
        for (int i = 0; i < count; i++) {
            if (slots[i] != null) ordered.add(slots[i]);
            else if (!wildPool.isEmpty()) ordered.add(wildPool.poll());
            else return null;
        }

        Meld meld = new Meld();
        meld.setId(UUID.randomUUID().toString().substring(0, 8));
        meld.setOwner(owner);
        meld.setType(GroupType.RUN);
        meld.setCards(ordered);
        meld.setRunStart(start);
        return meld;
    }

    // ==================== PHASE LAY-DOWN ====================

    public static class LayResult {
        public final boolean ok;
        public final String error;
        public final List<Meld> melds;

        private LayResult(boolean ok, String error, List<Meld> melds) {
            this.ok = ok;
            this.error = error;
            this.melds = melds;
        }

        static LayResult ok(List<Meld> melds) { return new LayResult(true, null, melds); }
        static LayResult fail(String error) { return new LayResult(false, error, null); }
    }

    /**
     * Validate a full phase lay-down. {@code groups} is the list of card-groups the
     * player wants to lay; they are matched against the phase requirements in any order
     * (so the frontend doesn't have to guess which group is which requirement).
     */
    public LayResult validatePhase(List<List<Card>> groups, int phase, String owner) {
        List<Requirement> reqs = PhaseDefinition.requirements(phase);
        if (groups == null || groups.size() != reqs.size()) {
            return LayResult.fail("Phase " + phase + " needs exactly " + reqs.size()
                    + " group(s): " + PhaseDefinition.description(phase));
        }
        Meld[] assigned = new Meld[reqs.size()];
        boolean[] used = new boolean[groups.size()];
        if (match(groups, reqs, 0, used, assigned, owner)) {
            return LayResult.ok(new ArrayList<>(Arrays.asList(assigned)));
        }
        return LayResult.fail("Those cards don't make a valid " + PhaseDefinition.description(phase) + ".");
    }

    private boolean match(List<List<Card>> groups, List<Requirement> reqs, int reqIndex,
                          boolean[] used, Meld[] assigned, String owner) {
        if (reqIndex == reqs.size()) return true;
        Requirement req = reqs.get(reqIndex);
        for (int g = 0; g < groups.size(); g++) {
            if (used[g]) continue;
            Meld meld = validateGroup(groups.get(g), req, owner);
            if (meld != null) {
                used[g] = true;
                assigned[reqIndex] = meld;
                if (match(groups, reqs, reqIndex + 1, used, assigned, owner)) return true;
                used[g] = false;
                assigned[reqIndex] = null;
            }
        }
        return false;
    }

    // ==================== HITTING ====================

    public enum RunEnd { LOW, HIGH }

    /**
     * Try to add {@code card} onto an existing {@code meld}. On success the meld is
     * mutated in place and {@code true} is returned. {@code end} only matters for
     * wild cards on RUN melds (which end to extend).
     */
    public boolean applyHit(Meld meld, Card card, RunEnd end) {
        if (card.isSkip()) return false;
        return switch (meld.getType()) {
            case SET -> hitSet(meld, card);
            case COLOR -> hitColor(meld, card);
            case RUN -> hitRun(meld, card, end);
        };
    }

    private boolean hitSet(Meld meld, Card card) {
        if (card.isWild() || (card.isNumber() && card.getValue() == meld.getSetValue())) {
            meld.getCards().add(card);
            return true;
        }
        return false;
    }

    private boolean hitColor(Meld meld, Card card) {
        if (card.isWild() || (card.isNumber() && card.getColor() == meld.getColor())) {
            meld.getCards().add(card);
            return true;
        }
        return false;
    }

    private boolean hitRun(Meld meld, Card card, RunEnd end) {
        int low = meld.getRunStart();
        int high = meld.runEnd();
        boolean canLow = low - 1 >= 1;
        boolean canHigh = high + 1 <= 12;

        if (card.isWild()) {
            RunEnd target = end != null ? end : (canHigh ? RunEnd.HIGH : RunEnd.LOW);
            if (target == RunEnd.LOW && canLow) {
                meld.getCards().add(0, card);
                meld.setRunStart(low - 1);
                return true;
            }
            if (target == RunEnd.HIGH && canHigh) {
                meld.getCards().add(card);
                return true;
            }
            // requested end blocked — try the other end
            if (canHigh) { meld.getCards().add(card); return true; }
            if (canLow) { meld.getCards().add(0, card); meld.setRunStart(low - 1); return true; }
            return false;
        }

        if (card.isNumber()) {
            if (canLow && card.getValue() == low - 1) {
                meld.getCards().add(0, card);
                meld.setRunStart(low - 1);
                return true;
            }
            if (canHigh && card.getValue() == high + 1) {
                meld.getCards().add(card);
                return true;
            }
        }
        return false;
    }

    // ==================== SCORING ====================

    public int handScore(Collection<Card> hand) {
        int total = 0;
        for (Card c : hand) total += c.penaltyPoints();
        return total;
    }
}
