package com.devconnect.phase10.engine;

import com.devconnect.phase10.model.*;
import com.devconnect.phase10.model.PhaseDefinition.GroupType;
import com.devconnect.phase10.model.PhaseDefinition.Requirement;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * Simple but competent Phase 10 bot. Decisions are split so the service can animate
 * each step: first {@link #wantsDiscardCard} (before drawing), then {@link #planTurn}
 * (after the draw, with the full hand) which returns lay-down / hits / discard.
 */
@Component
@RequiredArgsConstructor
public class Phase10Bot {

    private final Phase10Engine engine;

    /** Decide whether to take the top discard instead of drawing blind. */
    public boolean wantsDiscardCard(Phase10Player player, Card discardTop) {
        if (discardTop == null || discardTop.isSkip()) return false; // skips can't be drawn
        if (discardTop.isWild()) return true;                        // wilds are always good
        for (Card c : player.getHand()) {
            if (c.isNumber() && c.getValue() == discardTop.getValue()) return true; // toward a set
            if (c.isNumber() && c.getColor() == discardTop.getColor()) return true; // toward a color/run
        }
        return false;
    }

    public static class HitPlan {
        public final String meldId;
        public final String cardId;
        public final Phase10Engine.RunEnd end;
        public HitPlan(String meldId, String cardId, Phase10Engine.RunEnd end) {
            this.meldId = meldId; this.cardId = cardId; this.end = end;
        }
    }

    public static class BotMove {
        public List<List<String>> layGroups;   // card-id groups, null if not laying this turn
        public List<HitPlan> hits = new ArrayList<>();
        public String discardCardId;
        public String skipTarget;               // only when discarding a Skip
    }

    /**
     * Plan everything after the bot has already drawn. Operates on a working copy of the
     * hand so lay/hit removals are reflected in the discard choice.
     */
    public BotMove planTurn(Phase10Room room, Phase10Player player) {
        BotMove move = new BotMove();
        List<Card> working = new ArrayList<>(player.getHand());
        boolean willHaveLaid = player.isPhaseCompletedThisRound();

        // 1) Try to complete the phase if not done yet.
        if (!player.isPhaseCompletedThisRound()) {
            List<List<Card>> groups = findLayDown(working, player.getCurrentPhase());
            if (groups != null) {
                move.layGroups = new ArrayList<>();
                for (List<Card> g : groups) {
                    List<String> ids = new ArrayList<>();
                    for (Card c : g) ids.add(c.getId());
                    move.layGroups.add(ids);
                    working.removeAll(g);
                }
                willHaveLaid = true;
            }
        }

        // 2) If laid down (this turn or earlier), dump cards onto melds — but keep one to discard.
        if (willHaveLaid && !room.getTable().isEmpty()) {
            boolean progress = true;
            while (progress && working.size() > 1) {
                progress = false;
                Iterator<Card> it = working.iterator();
                while (it.hasNext()) {
                    if (working.size() <= 1) break;
                    Card c = it.next();
                    for (Meld m : room.getTable()) {
                        Meld clone = cloneMeld(m);
                        if (engine.applyHit(clone, c, Phase10Engine.RunEnd.HIGH)) {
                            move.hits.add(new HitPlan(m.getId(), c.getId(), Phase10Engine.RunEnd.HIGH));
                            it.remove();
                            progress = true;
                            break;
                        }
                    }
                }
            }
        }

        // 3) Choose a discard from what's left.
        move.discardCardId = chooseDiscard(working, room, player, move);
        return move;
    }

    private String chooseDiscard(List<Card> working, Phase10Room room, Phase10Player player, BotMove move) {
        if (working.isEmpty()) return null; // bot is going out

        // Prefer offloading a Skip onto the strongest opponent.
        Card skip = working.stream().filter(Card::isSkip).findFirst().orElse(null);
        if (skip != null && working.size() > 0) {
            String target = pickSkipTarget(room, player);
            if (target != null) {
                move.skipTarget = target;
                return skip.getId();
            }
        }

        // Otherwise discard the highest-penalty non-wild card (hold wilds for the phase).
        Card best = null;
        for (Card c : working) {
            if (c.isWild()) continue;
            if (best == null || c.penaltyPoints() > best.penaltyPoints()) best = c;
        }
        if (best == null) best = working.get(0); // only wilds left
        return best.getId();
    }

    private String pickSkipTarget(Phase10Room room, Phase10Player self) {
        String target = null;
        int bestRank = Integer.MIN_VALUE;
        for (Phase10Player p : room.getPlayers().values()) {
            if (p.getUsername().equals(self.getUsername())) continue;
            if (p.isSkipNext()) continue;
            // Threat = higher phase, then fewer cards left.
            int rank = p.getCurrentPhase() * 100 - p.getHand().size();
            if (rank > bestRank) { bestRank = rank; target = p.getUsername(); }
        }
        return target;
    }

    // ==================== PHASE FINDER ====================

    /** Find a set of disjoint card-groups from {@code hand} that satisfy the given phase, or null. */
    public List<List<Card>> findLayDown(List<Card> hand, int phase) {
        List<Requirement> reqs = PhaseDefinition.requirements(phase);
        return search(new ArrayList<>(hand), reqs, 0);
    }

    private List<List<Card>> search(List<Card> remaining, List<Requirement> reqs, int idx) {
        if (idx == reqs.size()) return new ArrayList<>();
        for (List<Card> candidate : candidates(remaining, reqs.get(idx))) {
            List<Card> rest = new ArrayList<>(remaining);
            rest.removeAll(candidate);
            List<List<Card>> sub = search(rest, reqs, idx + 1);
            if (sub != null) {
                List<List<Card>> result = new ArrayList<>();
                result.add(candidate);
                result.addAll(sub);
                return result;
            }
        }
        return null;
    }

    private List<List<Card>> candidates(List<Card> hand, Requirement req) {
        List<Card> wilds = new ArrayList<>();
        for (Card c : hand) if (c.isWild()) wilds.add(c);
        int count = req.getCount();
        List<List<Card>> out = new ArrayList<>();

        if (req.getType() == GroupType.SET) {
            Map<Integer, List<Card>> byValue = new HashMap<>();
            for (Card c : hand) if (c.isNumber()) byValue.computeIfAbsent(c.getValue(), k -> new ArrayList<>()).add(c);
            for (List<Card> group : byValue.values()) {
                List<Card> g = buildWithWilds(group, wilds, count);
                if (g != null) out.add(g);
            }
        } else if (req.getType() == GroupType.COLOR) {
            Map<Card.Color, List<Card>> byColor = new HashMap<>();
            for (Card c : hand) if (c.isNumber()) byColor.computeIfAbsent(c.getColor(), k -> new ArrayList<>()).add(c);
            for (List<Card> group : byColor.values()) {
                List<Card> g = buildWithWilds(group, wilds, count);
                if (g != null) out.add(g);
            }
        } else { // RUN
            Map<Integer, Card> byValue = new HashMap<>();
            for (Card c : hand) if (c.isNumber()) byValue.putIfAbsent(c.getValue(), c); // one per value
            for (int start = 1; start + count - 1 <= 12; start++) {
                List<Card> naturals = new ArrayList<>();
                for (int v = start; v <= start + count - 1; v++) if (byValue.containsKey(v)) naturals.add(byValue.get(v));
                List<Card> g = buildWithWilds(naturals, wilds, count);
                if (g != null) out.add(g);
            }
        }

        // Defensive: only keep candidates the engine accepts.
        out.removeIf(g -> engine.validateGroup(g, req, "bot") == null);
        return out;
    }

    /** Take up to {@code count} of {@code naturals}, fill the rest from {@code wilds}. */
    private List<Card> buildWithWilds(List<Card> naturals, List<Card> wilds, int count) {
        if (naturals.isEmpty()) return null;
        int useNat = Math.min(naturals.size(), count);
        int needWild = count - useNat;
        if (needWild > wilds.size()) return null;
        List<Card> g = new ArrayList<>(naturals.subList(0, useNat));
        for (int i = 0; i < needWild; i++) g.add(wilds.get(i));
        return g;
    }

    private Meld cloneMeld(Meld m) {
        Meld c = new Meld();
        c.setId(m.getId());
        c.setOwner(m.getOwner());
        c.setType(m.getType());
        c.setCards(new ArrayList<>(m.getCards()));
        c.setSetValue(m.getSetValue());
        c.setColor(m.getColor());
        c.setRunStart(m.getRunStart());
        return c;
    }
}
