package com.rotasync.api.service;

import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Deterministic roster generator (pure function — no persistence, unit-testable
 * in isolation).
 *
 * Strategy, mirroring the SPA's current generator semantics:
 *  - staff are processed in a stable order; each person cycles through the
 *    facility's worked shift codes, offset by their index so coverage spreads
 *    across shifts instead of everyone landing on the same one;
 *  - a person works at most `maxConsecutiveDays` in a row, then gets rest
 *    days ("OFF");
 *  - rest length alternates 1–2 days so patterns don't sync up across staff.
 *
 * Rules come from tenant_settings.roster_rules; defaults are applied when a
 * workspace hasn't configured them yet.
 */
@Service
public class RosterGenerationService {

    public static final List<String> DEFAULT_SHIFT_CODES = List.of("A", "B", "C", "D", "N");
    public static final int DEFAULT_MAX_CONSECUTIVE_DAYS = 6;

    public record GenerationRules(List<String> shiftCodes, int maxConsecutiveDays) {

        public static GenerationRules fromSettings(Map<String, Object> rosterRules,
                                                   Map<String, Object> shiftDefs) {
            int maxConsecutive = DEFAULT_MAX_CONSECUTIVE_DAYS;
            if (rosterRules != null && rosterRules.get("maxConsecutiveDays") instanceof Number n) {
                maxConsecutive = Math.max(1, Math.min(n.intValue(), 14));
            }
            List<String> codes = new ArrayList<>();
            if (shiftDefs != null) {
                // shiftDefs is {code: {name, start, end, isRest?...}} — take
                // non-rest codes in insertion order
                shiftDefs.forEach((code, def) -> {
                    boolean rest = def instanceof Map<?, ?> m && Boolean.TRUE.equals(m.get("isRest"));
                    if (!rest && !"OFF".equalsIgnoreCase(code)) {
                        codes.add(code);
                    }
                });
            }
            return new GenerationRules(codes.isEmpty() ? DEFAULT_SHIFT_CODES : codes, maxConsecutive);
        }
    }

    /**
     * @param staffIds stable-ordered ids of schedulable (non-manager) staff
     * @return staffId -> shift code per day, indexed by day offset from startDate
     */
    public Map<UUID, List<String>> generate(List<UUID> staffIds,
                                            LocalDate startDate,
                                            LocalDate endDate,
                                            GenerationRules rules) {
        if (endDate.isBefore(startDate)) {
            throw new IllegalArgumentException("endDate must be on or after startDate");
        }
        int days = (int) (endDate.toEpochDay() - startDate.toEpochDay()) + 1;
        List<String> codes = rules.shiftCodes();
        int maxRun = rules.maxConsecutiveDays();

        Map<UUID, List<String>> result = new LinkedHashMap<>();
        for (int s = 0; s < staffIds.size(); s++) {
            List<String> row = new ArrayList<>(days);
            int shiftIdx = s % codes.size();       // spread staff across shifts
            int runLength = 0;
            int restRemaining = 0;
            // stagger the first rest so the whole team is never off together
            int firstRestAt = maxRun - (s % Math.max(1, Math.min(3, maxRun)));

            for (int d = 0; d < days; d++) {
                if (restRemaining > 0) {
                    row.add("OFF");
                    restRemaining--;
                    if (restRemaining == 0) {
                        runLength = 0;
                        shiftIdx = (shiftIdx + 1) % codes.size(); // rotate after rest
                    }
                    continue;
                }
                int limit = (row.stream().noneMatch(c -> c.equals("OFF"))) ? firstRestAt : maxRun;
                if (runLength >= limit) {
                    row.add("OFF");
                    // alternate 1- and 2-day rests, staggered per staff index
                    restRemaining = ((d + s) % 2 == 0) ? 0 : 1;
                    if (restRemaining == 0) {
                        runLength = 0;
                        shiftIdx = (shiftIdx + 1) % codes.size();
                    }
                    continue;
                }
                row.add(codes.get(shiftIdx));
                runLength++;
            }
            result.put(staffIds.get(s), row);
        }
        return result;
    }
}
