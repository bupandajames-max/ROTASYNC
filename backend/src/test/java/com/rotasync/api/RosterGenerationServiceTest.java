package com.rotasync.api;

import com.rotasync.api.service.RosterGenerationService;
import com.rotasync.api.service.RosterGenerationService.GenerationRules;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Pure unit tests — no Spring context, no database. */
class RosterGenerationServiceTest {

    private final RosterGenerationService generator = new RosterGenerationService();

    private static final LocalDate START = LocalDate.of(2026, 8, 1);
    private static final LocalDate END = LocalDate.of(2026, 8, 28); // 28 days

    private List<UUID> staff(int n) {
        return java.util.stream.IntStream.range(0, n)
                .mapToObj(i -> new UUID(0, i + 1)) // stable ids -> deterministic plans
                .toList();
    }

    @Test
    void everyStaffMemberGetsExactlyOneCodePerDay() {
        Map<UUID, List<String>> plan = generator.generate(staff(4), START, END,
                new GenerationRules(List.of("A", "B", "N"), 6));
        assertThat(plan).hasSize(4);
        plan.values().forEach(row -> {
            assertThat(row).hasSize(28);
            assertThat(row).allSatisfy(code -> assertThat(code).isNotBlank());
        });
    }

    @Test
    void neverExceedsMaxConsecutiveWorkingDays() {
        int maxRun = 5;
        Map<UUID, List<String>> plan = generator.generate(staff(6), START, END,
                new GenerationRules(List.of("A", "B", "C", "N"), maxRun));
        plan.forEach((id, row) -> {
            int run = 0;
            for (String code : row) {
                run = "OFF".equals(code) ? 0 : run + 1;
                assertThat(run)
                        .as("staff %s exceeded %d consecutive working days", id, maxRun)
                        .isLessThanOrEqualTo(maxRun);
            }
        });
    }

    @Test
    void everyStaffMemberActuallyWorksAndActuallyRests() {
        Map<UUID, List<String>> plan = generator.generate(staff(3), START, END,
                new GenerationRules(List.of("A", "N"), 6));
        plan.values().forEach(row -> {
            assertThat(row).anyMatch(c -> !"OFF".equals(c));
            assertThat(row).contains("OFF");
        });
    }

    @Test
    void staffAreSpreadAcrossShiftCodesNotAllOnTheSameOne() {
        Map<UUID, List<String>> plan = generator.generate(staff(4), START, END,
                new GenerationRules(List.of("A", "B", "C", "D"), 6));
        List<String> firstDayCodes = plan.values().stream().map(row -> row.get(0)).toList();
        assertThat(firstDayCodes.stream().distinct().count())
                .as("first-day coverage should span multiple shifts")
                .isGreaterThan(1);
    }

    @Test
    void isDeterministicForTheSameInputs() {
        GenerationRules rules = new GenerationRules(List.of("A", "B", "N"), 6);
        assertThat(generator.generate(staff(5), START, END, rules))
                .isEqualTo(generator.generate(staff(5), START, END, rules));
    }

    @Test
    void rulesFallBackToDefaultsWhenSettingsAreEmptyOrRestOnly() {
        GenerationRules fromEmpty = GenerationRules.fromSettings(Map.of(), Map.of());
        assertThat(fromEmpty.shiftCodes()).isEqualTo(RosterGenerationService.DEFAULT_SHIFT_CODES);
        assertThat(fromEmpty.maxConsecutiveDays())
                .isEqualTo(RosterGenerationService.DEFAULT_MAX_CONSECUTIVE_DAYS);

        GenerationRules fromSettings = GenerationRules.fromSettings(
                Map.of("maxConsecutiveDays", 4),
                Map.of("A", Map.of("name", "Morning"),
                       "OFF", Map.of("name", "Rest", "isRest", true)));
        assertThat(fromSettings.shiftCodes()).containsExactly("A");
        assertThat(fromSettings.maxConsecutiveDays()).isEqualTo(4);
    }

    @Test
    void rejectsAnEndDateBeforeTheStartDate() {
        assertThatThrownBy(() -> generator.generate(staff(2), END, START,
                new GenerationRules(List.of("A"), 6)))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
