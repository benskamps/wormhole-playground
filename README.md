# Wormhole Physics Playground

An interactive computational exploration of traversable-wormhole physics — the
Morris–Thorne / Ellis metric, geodesics through the throat, wave propagation in
curved space, and the exotic-matter problem that makes the whole thing impossible
to actually build.

> 🌲 Part of the [Brokenbranch Lab](https://www.brokenbranch.dev/lab/) — one human and a
> cluster of AI agents shipping strange software in public. This is one experiment among
> many; the front door lists them all.

> **This is NOT peer-reviewed research.** It is an exploratory tool for understanding
> the mathematics of wormhole spacetimes and for sharpening questions. The geometry it
> models is mathematically consistent; the engineering it implies is impossible with
> known physics. Where that matters, this README says so explicitly.

## Quick Start

1. Open `index.html` for the landing page and results, or double-click
   `playground.html` for the interactive simulator. It runs straight off disk
   (`file://`) — no build step, no dependencies, no server, no network fetches.
2. In the playground: **drag** the hero view to look around, **scroll** to dolly
   the camera along the throat axis, and **click any pixel** to re-integrate that
   exact ray on the CPU and read off its impact parameter, deflection, and winding.
   Use the header buttons to **Send Doughnut 🍩** (watch the mascot cross the
   throat), **Traverse** (fly through), or take the **Tour**. A startup self-test
   chip reports whether the physics passes its assertions.
3. For the deeper numerical experiments, run the Python scripts (see [Scripts](#scripts)).

## What it models

| Concept | Implementation |
|---|---|
| Traversable geometry | Φ=0 Ellis drainhole metric `ds² = −dt² + dl² + (l²+r0²)dΩ²` with an open throat |
| Gravitational lensing | **Per-pixel geodesic raytracer** — every pixel RK4-integrates a real null geodesic in a WebGL2 shader, so the Einstein ring, ghost-image winding, and the window into a second universe *emerge* from the integration; nothing is painted on |
| The two universes | Procedurally distinct skies (cool/blue side A, amber/alien side B) sampled in-shader at ray exit — zero texture fetches |
| Particle traversal | Doughnut mascot crossing the throat on a real timelike geodesic, gravitationally lensed and **tidally deformed** (radial stretch / lateral squeeze) by the Ellis tidal tensor — small throat ⇒ spaghettification, with an honest survival verdict for the doughnut (ξ=0.1 m) and a human (ξ=2 m) |
| Camera traversal | **Traverse flythrough** — fly the static-metric camera through the throat; drag to look back mid-flight |
| Ray inspector | Click any pixel to re-integrate that ray on the CPU and read its impact parameter, deflection, winding count, and destination universe |
| Wave mechanics | Curved-space wave equation with the **corrected** potential `V = ℓ(ℓ+1)/r² + r0²/r⁴`; the m-mode shell renders both as a glowing volume in the raytraced scene and as a 1D plot |
| Stability | Dynamic throat evolution — cutting exotic matter visibly pinches the throat shut (pedagogical toy; the static Ellis throat is genuinely unstable) |
| Exotic-matter ledger | Live "Jupiter counter" computing the negative-energy requirement from the closed form and scrolling past the orders-of-magnitude Casimir gap (both kg/m³ and J/m³) |
| Formation | Attempt to create a throat from flat spacetime (Python scripts) |

## The Playground

`playground.html` is no longer a slider dashboard — it's a single hero view of a
real spacetime. A WebGL2 fragment shader RK4-integrates an actual null geodesic of
the Ellis metric *for every pixel*, so what you see — the Einstein ring, the
multiple ghost images winding the unstable photon orbit at the throat, the amber
sky of a second procedurally distinct universe glimpsed through the opening — is the
solution, not a painting of it. Drag to look, scroll to dolly along the throat axis,
and **click any pixel** to fire the same ray on the CPU and read back its impact
parameter, deflection, and winding count: awe on the left, the equation on the right.

The house mascot does the science. Press **Send Doughnut 🍩** and a glazed torus
falls through the throat on a real timelike geodesic — lensed as it rounds the
Einstein ring and tidally deformed (stretched along its path, squeezed across it) by
the exact Ellis tidal tensor. The HUD reports, honestly, whether the doughnut *and*
a human survive the tides at the current throat radius; shrink the throat and watch
"SPAGHETTIFIED" appear. **Traverse** flies the camera all the way through;
the m-mode wave packet renders as a luminous shell that sails through for m=0 and
piles up against the centrifugal barrier for m=5; cutting exotic matter pinches the
ring visibly shut; and the live exotic-matter ledger scrolls you past the Casimir
gap one Jupiter at a time. A **Guided Tour** walks all five verdicts in order, an
optional sonification lets you *hear* a wave packet cross to the far side, and a
startup self-test chip proves the physics matches its reference values before you
touch a thing. Everything renders the exact Φ=0 solution — spectacle that visualizes
real geodesics and never fakes them. Falls back to the Canvas-2D panels if WebGL2 is
unavailable, and stays ≥30 fps on a 4K window via a dynamic-resolution governor.

## Key Results

| Result | Verdict | Notes |
|---|---|---|
| Geodesic traversal | ✅ Works | Particles cross cleanly for zero angular momentum |
| **Angular-momentum filtering** | ✅ Robust | m=0 passes freely; higher-m modes reflect off the centrifugal barrier at the throat. Pure geometry. |
| Stability | ⚠️ Conditional | Stable configs exist **only** with continuously sustained exotic matter. Remove it → collapse. |
| **Formation from flat space** | ❌ Impossible (classically) | Exotic matter can *deform* spacetime but cannot change its *topology*. Creating a wormhole needs new physics. |
| Exotic-matter budget | ❌ 60-order gap | A 1 m throat needs ~10⁴³ kg/m³ of negative energy density; the Casimir effect gives ~10⁻⁴ J/m³. |

**The honest bottom line:** the mathematics is beautiful and internally consistent, the
physics is self-consistent, but the engineering is impossible with anything we know how to
build. The exotic-matter requirement is the fundamental barrier — not an engineering detail.

## A nice connection

From the sibling [Kozyrev Mirror](../kozyrev-mirror/) experiment: a chiral spiral boundary
*generates* angular momentum from zero. Here, a wormhole throat *filters* angular momentum,
blocking high-m modes. One creates, one selects — and both effects are **purely geometric**,
needing no material properties. That symmetry is the prettiest thing in this little suite.

## Scripts

| File | Purpose |
|---|---|
| `playground.html` | Interactive simulator (zero dependencies) |
| `traverse.py` | Particle traversal through the Ellis throat |
| `field_propagation.py` | Wave-packet propagation + angular-momentum filtering |
| `stability.py` | Dynamic stability analysis and phase space |
| `formation.py` | Formation-from-flat-space attempts (single / dual / pulsed) |
| `spacetime.py` | Shared metric / geometry helpers |
| `CONCEPT.md` | Original design document and the physics background |

```bash
python traverse.py           # see particles cross
python field_propagation.py  # see waves propagate and filter by m
python stability.py          # see the stability map
python formation.py          # watch formation fail to change topology
```

## References

1. Morris, M.S. & Thorne, K.S. "Wormholes in spacetime and their use for interstellar
   travel." *American Journal of Physics*, 1988.
2. Ellis, H.G. "Ether flow through a drainhole." *Journal of Mathematical Physics*, 1973.
3. Maldacena, J. & Susskind, L. "Cool horizons for entangled black holes" (ER=EPR).
   *Fortschritte der Physik*, 2013.
4. Lentz, E.W. "Breaking the warp barrier." *Classical and Quantum Gravity*, 2021.
5. Bobrick, A. & Martire, G. "Introducing physical warp drives." *Classical and Quantum
   Gravity*, 2021.

## Built With

A collaboration between human scientific curiosity and Claude (Anthropic). Part of the
[Coherence Lab](https://www.brokenbranch.dev/coherence-lab/) physics playground.

## License

MIT License. See [LICENSE](LICENSE).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Negative results are welcome and valued.

---

*"The universe is not only queerer than we suppose, but queerer than we CAN suppose."*
— J.B.S. Haldane
