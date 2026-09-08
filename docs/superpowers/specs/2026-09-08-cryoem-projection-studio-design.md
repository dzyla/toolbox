# Cryo-EM Projection Studio Design

## Goal

Let a scientist rotate an MRC density map, produce a physically meaningful 2D density projection, and generate a CryoSPARC-style bank of evenly distributed template projections without crowding the existing viewer.

## Interaction model

The 3D viewer has a task switcher: **Project map**, **Template series**, and **Inspect map**. Project map exposes three Euler angles and a live canvas. Template series accepts angular spacing in degrees, reports the resulting count, generates equal-area viewing directions on the sphere, and displays a selectable gallery. Inspect map retains orthoslices and MIP for diagnostic work.

## Projection model

For one projection, the implementation applies the inverse Euler transform from each destination voxel into the source density map with trilinear interpolation, then sums samples along the destination Z axis. A zero-degree projection is consequently the normal XY density sum. A template series maps its requested angular spacing to an approximate count and samples that count with a Fibonacci sphere; each direction becomes an X/Y rotation. In-plane rotation is intentionally not enumerated: it is redundant for the map template bank and is handled by downstream alignment/picking.

## Visual direction

Use a near-black canvas as the singular visual anchor, cyan for interactive geometry, amber for generated output, and quiet slate controls. The task switcher is the primary navigation; contrast controls remain compact and shared. Do not duplicate the current card treatment inside the projection surface.

## Constraints

- Do not add runtime dependencies.
- Preserve 2D-class, orthoslice, MIP, contrast, and export behavior.
- Cap generated template count to keep browser computation responsive.
- Exercise core math with real synthetic volumes and UI with the real MRC viewer.
