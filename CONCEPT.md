# Wormhole via Code

## The Challenge

Simulate conditions that would, in principle, create a traversable wormhole.

Not "draw a picture of a wormhole." Actually model the physics.

## What We Know

### Requirements for a Traversable Wormhole (Morris-Thorne, 1988)

1. **Exotic matter** - Negative energy density required to hold throat open
2. **Specific metric** - The spacetime geometry must connect two regions
3. **Stability** - It can't collapse faster than you can traverse it

### The Metric

Morris-Thorne wormhole metric:

```
ds^2 = -e^(2*Phi(r)) * dt^2 + dr^2/(1 - b(r)/r) + r^2 * (dtheta^2 + sin^2(theta)*dphi^2)
```

Where:
- `Phi(r)` is the redshift function (determines time dilation)
- `b(r)` is the shape function (determines throat geometry)
- At the throat: `b(r_0) = r_0` (the throat radius)

### The Problem: Exotic Matter

The Einstein field equations demand:

```
rho = b'(r) / (8*pi*r^2)
```

For the throat to stay open, we need `rho < 0` somewhere.

Negative energy density. That's the exotic matter.

## What Exists That Has Negative Energy?

1. **Casimir effect** - Vacuum between plates has negative energy density
2. **Squeezed vacuum states** - Quantum optics can create negative energy pulses
3. **Cosmological constant** (if negative) - Dark energy might count
4. **Quantum fields in curved spacetime** - Hawking radiation involves negative energy flux

## The Simulation Approach

We can't create a real wormhole. But we can:

1. **Model the metric** - Implement Morris-Thorne geometry
2. **Simulate field propagation** - See how fields behave in this spacetime
3. **Test stability** - Does the configuration persist or collapse?
4. **Explore exotic matter** - What distributions of negative energy are needed?

## The Wild Card: Alcubierre Connection

The Alcubierre warp drive also requires exotic matter.

Recent work (Lentz 2021, Bobrick & Martire 2021) explored "soliton" solutions that might reduce exotic matter requirements.

Could a wormhole throat be stabilized by a soliton-like field configuration?

## What We'll Build

1. **Curved spacetime simulator** - Implement non-flat metric
2. **Geodesic solver** - Track particle/light paths through wormhole
3. **Field equations in curved space** - Wave equation with metric
4. **Exotic matter distributions** - Model Casimir-like configurations
5. **Stability analysis** - Does it hold together?

## The Goal

Not to "open" a real wormhole. To understand:
- What field configurations approximate the required exotic matter?
- How would information propagate through such a geometry?
- Are there classical analogs (acoustic/optical) we could actually build?

## Let's Go
