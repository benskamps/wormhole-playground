# Wormhole Physics Playground

An interactive computational exploration of traversable-wormhole physics — the
Morris–Thorne / Ellis metric, geodesics through the throat, wave propagation in
curved space, and the exotic-matter problem that makes the whole thing impossible
to actually build.

> **This is NOT peer-reviewed research.** It is an exploratory tool for understanding
> the mathematics of wormhole spacetimes and for sharpening questions. The geometry it
> models is mathematically consistent; the engineering it implies is impossible with
> known physics. Where that matters, this README says so explicitly.

## Quick Start

1. Open `index.html` for the landing page and results, or jump straight to
   `playground.html` for the interactive simulator.
2. No build step, no dependencies, no server required.
3. For the deeper numerical experiments, run the Python scripts (see [Scripts](#scripts)).

## What it models

| Concept | Implementation |
|---|---|
| Traversable geometry | Morris–Thorne / Ellis metric with an open throat |
| Rotation | Kerr-like angular structure |
| Particle traversal | Geodesic solver through the throat |
| Wave mechanics | Curved-space wave equation, angular-momentum modes m=0,2,5 |
| Stability | Dynamic throat evolution under perturbation |
| Formation | Attempt to create a throat from flat spacetime |
| ER=EPR | Toy controls exploring the entanglement–geometry conjecture |

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
