# Chromatography Focus, A280 Correction, and ÅKTA Import Design

## Purpose

Keep scientific-assurance material available without making it a primary navigation
destination, focus the chromatography route on chromatography, and make the
workbench useful with real ÅKTA/UNICORN exports.

## Navigation

- Remove the `Methods & Assurance` link from the global header and the home-page
  research-preview banner.
- Keep the assurance inventory route intact and expose it only through a footer
  link. Existing deep links remain valid.

## Workflow boundaries

`Chromatography Workbench` contains SEC calibration, chromatogram run/fraction
review, and method planning. It no longer contains UV-Vis spectrum or
dye-labelling controls.

The existing `Protein Concentration` tool gains a spectrum-import and scattering
correction section alongside its A280 concentration calculator. The migrated
dye-labelling inputs and result stay with that spectrum workflow because they
depend on the corrected A280 measurement rather than chromatography.

## Scattering-adjusted A280

For positive spectrum points in the inclusive 300–340 nm window, fit:

`log10(A) = m * log10(lambda) + b`

Extrapolate the fitted value to `log10(280)`. For a positive observed A280,
report the requested log-space adjustment:

`A280_adjusted = 10^(log10(A280_observed) - (m * log10(280) + b))`

The UI retains the unmodified observed A280 and shows the point count, slope,
R-squared, extrapolated log contribution, and warnings. It labels this result
as a *log-space scattering adjustment* so it is not confused with the prior
linear absorbance-subtraction calculation. Nonpositive values, insufficient
points, an undefined fit, and a poor fit remain blocked or visibly warned.

## Chromatogram import

The Run & Fractions panel accepts pasted text and an accessible drop zone/file
picker for `.asc`, `.csv`, `.tsv`, and `.txt` files. The imported filename is
retained in exported provenance.

The existing delimited table parser remains the fallback for conventional
exports. A dedicated ÅKTA/UNICORN ASCII reader recognizes the common
paired-channel form:

1. optional run/group row, such as `Chrom.1`;
2. channel-name row, such as `Cond`, `% Cond`, and `UV`;
3. alternating axis/unit row, such as `mL`, `mS/cm`, `mL`, `%`, `mL`, `mAU`;
4. data rows with an independent axis/value pair for each channel.

It reads every supported pair, uses the UV pair as the primary trace, and
matches recognized auxiliary pairs (conductivity, percent B, etc.) onto their
own normalized records. A bare `UV` channel is mapped for trace review with a
notice requiring the user to verify that it is 280 nm before interpreting it as
A280. Unknown channels are preserved as source headers but are not fabricated
into scientific values.

## Testing and verification

- Core tests pin legacy delimited parsing, paired-channel ÅKTA ASCII parsing,
  malformed imports, and the exact requested log-space adjustment.
- UI tests cover file selection/drop loading, provenance filename, migration of
  the spectrum workflow, and the reduced SEC tabs/navigation.
- Typecheck, lint, unit tests, build, and focused browser coverage verify the
  shipped paths.
