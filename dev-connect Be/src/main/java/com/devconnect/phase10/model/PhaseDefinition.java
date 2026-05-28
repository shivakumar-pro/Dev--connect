package com.devconnect.phase10.model;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.List;

/**
 * The 10 phases of Phase 10. Each phase is one or more {@link Requirement}s that
 * the player must lay down together in a single turn to "complete" the phase.
 *
 *  1: 2 sets of 3
 *  2: 1 set of 3 + 1 run of 4
 *  3: 1 set of 4 + 1 run of 4
 *  4: 1 run of 7
 *  5: 1 run of 8
 *  6: 1 run of 9
 *  7: 2 sets of 4
 *  8: 7 cards of one color
 *  9: 1 set of 5 + 1 set of 2
 * 10: 1 set of 5 + 1 set of 3
 */
public final class PhaseDefinition {

    public enum GroupType { SET, RUN, COLOR }

    @Data
    @AllArgsConstructor
    public static class Requirement {
        private GroupType type;
        private int count;
    }

    private PhaseDefinition() {}

    private static final List<List<Requirement>> PHASES = List.of(
            List.of(new Requirement(GroupType.SET, 3), new Requirement(GroupType.SET, 3)),       // 1
            List.of(new Requirement(GroupType.SET, 3), new Requirement(GroupType.RUN, 4)),       // 2
            List.of(new Requirement(GroupType.SET, 4), new Requirement(GroupType.RUN, 4)),       // 3
            List.of(new Requirement(GroupType.RUN, 7)),                                          // 4
            List.of(new Requirement(GroupType.RUN, 8)),                                          // 5
            List.of(new Requirement(GroupType.RUN, 9)),                                          // 6
            List.of(new Requirement(GroupType.SET, 4), new Requirement(GroupType.SET, 4)),       // 7
            List.of(new Requirement(GroupType.COLOR, 7)),                                         // 8
            List.of(new Requirement(GroupType.SET, 5), new Requirement(GroupType.SET, 2)),       // 9
            List.of(new Requirement(GroupType.SET, 5), new Requirement(GroupType.SET, 3))        // 10
    );

    private static final List<String> DESCRIPTIONS = List.of(
            "2 sets of 3",
            "1 set of 3 + 1 run of 4",
            "1 set of 4 + 1 run of 4",
            "1 run of 7",
            "1 run of 8",
            "1 run of 9",
            "2 sets of 4",
            "7 cards of one color",
            "1 set of 5 + 1 set of 2",
            "1 set of 5 + 1 set of 3"
    );

    public static final int MAX_PHASE = 10;

    /** @param phase 1-based phase number (1..10) */
    public static List<Requirement> requirements(int phase) {
        return PHASES.get(phase - 1);
    }

    /** @param phase 1-based phase number (1..10) */
    public static String description(int phase) {
        return DESCRIPTIONS.get(phase - 1);
    }
}
