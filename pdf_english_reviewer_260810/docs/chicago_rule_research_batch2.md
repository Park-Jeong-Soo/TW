# Chicago Pilot Batch 2 Rule Research

Date: 2026-07-21

Scope: Select 20 new Team Manual Standard rules, five each for punctuation, numbers/abbreviations, hyphenation/terminology, and grammar. Batch 1 keys and the original three Team Manual Standard rules were treated as blocked duplicates.

## Official Sources Checked

- CMOS Online, 18th edition table of contents: chapters 5, 6, 7, 9, and 10.
- CMOS Online, What's New in the 18th Edition: https://www.chicagomanualofstyle.org/help-tools/what-s-new.html
- CMOS Style Q&A, punctuation topic page: https://www.chicagomanualofstyle.org/qanda/data/faq/topics/Punctuation.html
- CMOS Style Q&A, Which vs. That: https://www.chicagomanualofstyle.org/qanda/data/faq/topics/Whichvs.That/faq0001.html
- CMOS Style Q&A, Abbreviations: https://www.chicagomanualofstyle.org/qanda/data/faq/topics/Abbreviations.html
- CMOS Style Q&A, Plurals: https://www.chicagomanualofstyle.org/qanda/data/faq/topics/Plurals/faq0008.html
- CMOS Style Q&A, Numbers: https://www.chicagomanualofstyle.org/qanda/data/faq/topics/Numbers.html
- CMOS Style Q&A, Hyphens, En Dashes, Em Dashes: https://www.chicagomanualofstyle.org/qanda/data/faq/topics/HyphensEnDashesEmDashes/faq0180.html
- CMOS Style Q&A, Usage: https://www.chicagomanualofstyle.org/qanda/data/faq/topics/Usage.html

## CMOS 18 Sections Checked

- Chapter 5: 5.78, 5.95, 5.112, 5.143-5.147, 5.172, 5.177, 5.187, 5.243, 5.249-5.252.
- Chapter 6: 6.8, 6.22, 6.24, 6.29, 6.39, 6.66, 6.71-6.74, 6.83, 6.86, 6.91, 6.101, 6.112-6.113, 6.120, 6.127, 6.129, 6.141-6.142.
- Chapter 7: 7.15-7.17, 7.30, 7.32-7.33, 7.47, 7.54, 7.57, 7.81-7.84, 7.87-7.96.
- Chapter 9: 9.6, 9.14, 9.18-9.21, 9.31-9.42, 9.55-9.58, 9.60, 9.62-9.63.
- Chapter 10: 10.2-10.6, 10.10-10.11, 10.41, 10.64.

## Duplicate Inventory

Existing original rules in `data/reviewer.db`:

- `UNIT_SPACE_001`: Space between number and unit
- `STYLE_EG_IE_COMMA_001`: Comma after e.g. and i.e.
- `TM_CAUTION_LABEL_001`: Use uppercase caution labels

Blocked Batch 1 keys:

- `use_single_space_after_sentence_punctuation`
- `use_serial_comma_in_simple_series`
- `comma_after_introductory_dependent_clause`
- `avoid_comma_splice`
- `capitalize_complete_sentence_after_colon`
- `spell_out_number_at_sentence_start`
- `use_leading_zero_before_decimal`
- `define_abbreviation_at_first_use`
- `place_periods_and_commas_inside_closing_quotes`
- `use_consistent_vertical_list_punctuation`
- `hyphenate_compound_modifier_before_noun`
- `do_not_hyphenate_ly_adverb_compound`
- `use_suspended_hyphen_in_shared_compounds`
- `use_consistent_compound_form`
- `use_approved_ui_term_capitalization`
- `ensure_subject_verb_agreement`
- `ensure_pronoun_antecedent_agreement`
- `avoid_dangling_participial_phrase`
- `maintain_consistent_verb_tense`
- `use_parallel_verb_forms_in_procedural_lists`

Result: The 20 Batch 2 keys are new, do not reuse display names from the original three rules, and do not restate Batch 1 rule purposes such as serial comma, leading zero, abbreviation definition, or pre-noun compound modifier hyphenation.

## Scoring Method

Each candidate was scored 0-2 for technical manual relevance, source confidence, detection feasibility, correction clarity, exception manageability, and non-duplication. Deductions were applied for false-positive risk, product-specific dependency, parser dependency, and conflicts with existing Team Manual Standard behavior. Maximum practical score is 12 before deductions.

## Selected Rules

| Rule key | Area | CMOS section | Source status | Matcher | Risk | Score |
|---|---|---:|---|---|---|---:|
| remove_space_before_question_or_exclamation_mark | punctuation | 6.127, 6.129 | official_qanda_verified | regex | low | 12 |
| use_comma_before_coordinating_conjunction_between_independent_clauses | punctuation | 6.22 | official_cmos_verified | contextual | medium | 9 |
| avoid_comma_between_compound_predicate_verbs | punctuation | 6.24 | official_cmos_verified | token | low | 11 |
| use_comma_between_coordinate_adjectives | punctuation | 5.95, 6.39 | official_cmos_verified | token | medium | 9 |
| use_period_for_indirect_questions | punctuation | 6.72-6.74 | official_cmos_verified | regex | low | 11 |
| use_percent_symbol_in_technical_measurements | numbers_abbreviations | 9.20 | official_qanda_verified | regex | low | 11 |
| use_lowercase_periods_for_am_pm | numbers_abbreviations | 10.41 | official_qanda_verified | regex | low | 12 |
| avoid_ambiguous_noon_midnight_time | numbers_abbreviations | 9.40-9.41 | official_qanda_verified | regex | low | 11 |
| repeat_ordinal_ending_in_ranges | numbers_abbreviations | 9.6, 9.33, 6.83 | official_qanda_verified | regex | low | 10 |
| avoid_apostrophe_for_plural_numbers_and_abbreviations | numbers_abbreviations | 7.15 | official_qanda_verified | regex | low | 12 |
| avoid_hyphen_in_or_so_approximation | hyphenation_terminology | 6.86 | official_qanda_verified | regex | low | 11 |
| avoid_hyphen_in_and_a_half_measurement | hyphenation_terminology | 6.86 | official_qanda_verified | regex | low | 10 |
| avoid_casual_slash_abbreviations | hyphenation_terminology | 10.3 | official_qanda_verified | regex | low | 11 |
| avoid_all_caps_for_emphasis | hyphenation_terminology | 7.54 | official_cmos_verified | controlled_vocabulary | low | 10 |
| use_chicago_singular_possessive_s | hyphenation_terminology | 7.16-7.17 | official_qanda_verified | token | medium | 8 |
| use_that_for_restrictive_relative_clauses | grammar | 5.250, 6.29 | official_qanda_verified | contextual | medium | 8 |
| avoid_double_negative | grammar | 5.243 | official_cmos_verified | regex | low | 11 |
| keep_neither_nor_parallel | grammar | 5.249-5.252 | official_qanda_verified | contextual | medium | 8 |
| keep_auxiliary_verb_forms_parallel | grammar | 5.249-5.252 | official_qanda_verified | contextual | medium | 8 |
| use_singular_verb_after_one_in_ratio | grammar | 5.145-5.147 | official_qanda_verified | token | low | 10 |

Low-risk rules selected: 14. Medium-risk rules selected: 6. High-risk rules selected: 0. Deterministic regex/token/block/controlled-vocabulary rules selected: 15.

## Technical Manual Rationale and False-Positive Controls

- Punctuation rules target common procedural prose defects: question-mark spacing, independent-clause punctuation, compound predicate punctuation, coordinate adjective commas, and indirect-question terminal punctuation. Exceptions exclude direct questions, compound predicates, fragments, UI strings, and noncoordinate adjective pairs.
- Numbers and abbreviation rules target measurements, time expressions, ordinal ranges, and plural abbreviations. Exceptions exclude literal UI values, non-time acronyms, cardinal ranges, pin ranges, and lowercase-letter plurals.
- Hyphenation and terminology rules target common authoring shorthand and emphasis patterns. Exceptions exclude code samples, official names, pre-noun measurement compounds, caution labels, UI labels, acronyms, and plural possessives.
- Grammar rules target deterministic or narrowly contextual patterns common in technical manuals. Medium-risk rules remain disabled by default when contextual judgment is required.

## Excluded Candidates

| Candidate | Reason excluded |
|---|---|
| Add an Oxford comma | Duplicate of Batch 1 `use_serial_comma_in_simple_series`. |
| Use a leading zero before decimal values | Duplicate of Batch 1 `use_leading_zero_before_decimal`. |
| Define abbreviations at first use | Duplicate of Batch 1 `define_abbreviation_at_first_use`. |
| Space between number and unit | Duplicate of original `UNIT_SPACE_001`. |
| Comma after e.g. and i.e. | Duplicate of original `STYLE_EG_IE_COMMA_001`. |
| Uppercase caution labels | Duplicate of original `TM_CAUTION_LABEL_001`. |
| Hyphenate pre-noun compound modifiers | Duplicate of Batch 1 `hyphenate_compound_modifier_before_noun`. |
| Use punctuation inside closing quotation marks | Duplicate of Batch 1 `place_periods_and_commas_inside_closing_quotes`. |
| Use consistent list punctuation | Duplicate of Batch 1 `use_consistent_vertical_list_punctuation`. |
| Avoid overusing em dashes | Too stylistic for deterministic enforcement and high false-positive risk. |
| Keyboard shortcut formatting | CMOS section identified, but project-specific UI conventions need team confirmation before enforcement. |
| Italicize Latin terms | Plain text/PDF extraction cannot reliably inspect italics in current matcher path. |
| Date format normalization | Stronger as Team Manual Standard or ISO/NIST rule; CMOS support alone is not direct enough. |
| Spell out all numbers below one hundred | Conflicts with technical-manual numeral-heavy conventions. |

## Source Verification Method

The source section numbers came from CMOS Online 18th edition chapter tables of contents and were checked against official CMOS Q&A or What's New pages where public article text was available. For subscription-only section bodies, the section title was used only with an official CMOS Online source marker and paired with a rule pattern that is independently verifiable from public Chicago Q&A or the 18th-edition change notes. No CMOS prose was copied into the seed data.

## Initial Activation Recommendation

Enable only verified, implemented, low-risk rules. For Batch 2 this activates 14 rules and leaves 6 medium-risk contextual rules disabled:

- Disabled: `use_comma_before_coordinating_conjunction_between_independent_clauses`, `use_comma_between_coordinate_adjectives`, `use_chicago_singular_possessive_s`, `use_that_for_restrictive_relative_clauses`, `keep_neither_nor_parallel`, `keep_auxiliary_verb_forms_parallel`.
- Enabled: all other Batch 2 rules.

## Implementation Difficulty

- Low difficulty: 14 regex/token rules with clear matched text and deterministic suggestions.
- Medium difficulty: 6 contextual/token rules that need narrower phrase inventories and should be expanded only after pilot review.
- High difficulty: none selected for initial Batch 2.
