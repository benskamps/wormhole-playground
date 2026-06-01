"""
Wormhole Stability Analysis
============================

The big question: Can a wormhole stay open?

There are several instabilities:
1. Classical collapse - throat pinches off without exotic matter
2. Quantum backreaction - vacuum fluctuations destabilize
3. Perturbative instability - small deviations grow

Let's model the simplest: what happens if the exotic matter fluctuates?
"""

import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt


class DynamicWormhole:
    """
    Model a wormhole with time-varying throat radius.

    The Einstein equations relate:
    - Throat radius r0(t)
    - Exotic matter density rho(t)
    - Rate of change dr0/dt

    Simplified dynamics (toy model):
        d^2 r0 / dt^2 = -k * (r0 - r0_eq) + F_exotic

    where:
    - k is the "collapse tendency" (spacetime wants to pinch off)
    - r0_eq is the equilibrium radius (zero without exotic matter)
    - F_exotic is the force from exotic matter holding it open
    """

    def __init__(self, initial_radius: float = 1.0,
                 collapse_rate: float = 1.0,
                 exotic_strength: float = 1.0):
        self.r0_init = initial_radius
        self.k = collapse_rate
        self.F0 = exotic_strength

        # State: [r0, dr0/dt]
        self.state = np.array([initial_radius, 0.0])

    def exotic_force(self, r0: float, t: float, fluctuation_fn=None) -> float:
        """
        Force from exotic matter.

        Base force: F0 / r0^2 (stronger when throat smaller)

        Can add fluctuations to model quantum effects or perturbations.
        """
        base = self.F0 / (r0**2 + 0.01)  # Avoid singularity

        if fluctuation_fn is not None:
            return base * fluctuation_fn(t)
        return base

    def collapse_force(self, r0: float) -> float:
        """
        Force from gravitational collapse.

        Spacetime "wants" to close the throat (r0 -> 0).
        """
        return -self.k * r0

    def evolve(self, t_max: float = 50.0, dt: float = 0.01,
               fluctuation_fn=None) -> dict:
        """
        Evolve the wormhole throat dynamics.

        Returns history of radius over time.
        """
        n_steps = int(t_max / dt)
        times = np.zeros(n_steps)
        radii = np.zeros(n_steps)
        velocities = np.zeros(n_steps)
        exotic_forces = np.zeros(n_steps)
        collapse_forces = np.zeros(n_steps)

        state = self.state.copy()

        for i in range(n_steps):
            t = i * dt
            r0, v = state

            # Record
            times[i] = t
            radii[i] = max(r0, 0)  # Can't go negative
            velocities[i] = v

            # Forces
            F_e = self.exotic_force(r0, t, fluctuation_fn)
            F_c = self.collapse_force(r0)
            exotic_forces[i] = F_e
            collapse_forces[i] = F_c

            # Total acceleration
            a = F_e + F_c

            # Simple Euler (could use RK4 for better accuracy)
            state[1] += a * dt  # velocity
            state[0] += state[1] * dt  # position

            # Enforce r0 >= 0 (collapsed)
            if state[0] < 0:
                state[0] = 0
                state[1] = 0

        return {
            'times': times,
            'radii': radii,
            'velocities': velocities,
            'exotic_forces': exotic_forces,
            'collapse_forces': collapse_forces,
            'collapsed': radii[-1] < 0.01 * self.r0_init
        }


def visualize_stability(results: list, labels: list, filename: str):
    """Visualize multiple stability scenarios."""

    fig, axes = plt.subplots(2, 2, figsize=(12, 10))

    # 1. Radius evolution
    ax1 = axes[0, 0]
    for result, label in zip(results, labels):
        ax1.plot(result['times'], result['radii'], label=label, linewidth=2)
    ax1.axhline(y=0, color='red', linestyle='--', alpha=0.5, label='Collapse')
    ax1.set_xlabel('Time')
    ax1.set_ylabel('Throat Radius r0')
    ax1.set_title('Wormhole Throat Evolution')
    ax1.legend()
    ax1.grid(True, alpha=0.3)

    # 2. Phase space (r0 vs dr0/dt)
    ax2 = axes[0, 1]
    for result, label in zip(results, labels):
        ax2.plot(result['radii'], result['velocities'], label=label, linewidth=1.5)
        ax2.scatter(result['radii'][0], result['velocities'][0], s=50, zorder=5)
    ax2.axhline(y=0, color='gray', linestyle='-', alpha=0.3)
    ax2.axvline(x=0, color='red', linestyle='--', alpha=0.5)
    ax2.set_xlabel('Radius r0')
    ax2.set_ylabel('Velocity dr0/dt')
    ax2.set_title('Phase Space Trajectory')
    ax2.legend()
    ax2.grid(True, alpha=0.3)

    # 3. Force balance
    ax3 = axes[1, 0]
    result = results[0]  # Show first case
    ax3.plot(result['times'], result['exotic_forces'], 'g-', label='Exotic (holding open)')
    ax3.plot(result['times'], result['collapse_forces'], 'r-', label='Collapse (closing)')
    ax3.plot(result['times'], result['exotic_forces'] + result['collapse_forces'],
             'b--', label='Net force')
    ax3.axhline(y=0, color='gray', linestyle='-', alpha=0.3)
    ax3.set_xlabel('Time')
    ax3.set_ylabel('Force')
    ax3.set_title(f'Force Balance ({labels[0]})')
    ax3.legend()
    ax3.grid(True, alpha=0.3)

    # 4. Stability diagram
    ax4 = axes[1, 1]

    # Map stability as function of exotic strength and collapse rate
    k_values = np.linspace(0.1, 2.0, 30)
    F_values = np.linspace(0.1, 2.0, 30)

    stability_map = np.zeros((len(F_values), len(k_values)))

    for i, F in enumerate(F_values):
        for j, k in enumerate(k_values):
            wh = DynamicWormhole(initial_radius=1.0, collapse_rate=k, exotic_strength=F)
            result = wh.evolve(t_max=30.0)
            # Stability = final radius / initial radius
            stability_map[i, j] = result['radii'][-1] / 1.0

    im = ax4.imshow(stability_map, extent=[k_values[0], k_values[-1],
                                           F_values[0], F_values[-1]],
                    origin='lower', aspect='auto', cmap='RdYlGn')
    ax4.set_xlabel('Collapse rate k')
    ax4.set_ylabel('Exotic strength F')
    ax4.set_title('Stability Map (green=stable, red=collapsed)')
    plt.colorbar(im, ax=ax4, label='Final radius')

    # Add stability boundary
    ax4.contour(k_values, F_values, stability_map, levels=[0.5], colors='black')

    plt.tight_layout()
    plt.savefig(filename, dpi=150)
    print(f"Saved to {filename}")
    plt.close()


def main():
    print("="*70)
    print("  WORMHOLE STABILITY ANALYSIS")
    print("="*70)

    # Scenario 1: Balanced (stable wormhole)
    print("\nScenario 1: Balanced exotic matter (should be stable)")
    wh1 = DynamicWormhole(initial_radius=1.0, collapse_rate=1.0, exotic_strength=1.0)
    result1 = wh1.evolve(t_max=50.0)
    print(f"  Final radius: {result1['radii'][-1]:.3f}")
    print(f"  Collapsed: {result1['collapsed']}")

    # Scenario 2: Insufficient exotic matter
    print("\nScenario 2: Weak exotic matter (should collapse)")
    wh2 = DynamicWormhole(initial_radius=1.0, collapse_rate=1.0, exotic_strength=0.3)
    result2 = wh2.evolve(t_max=50.0)
    print(f"  Final radius: {result2['radii'][-1]:.3f}")
    print(f"  Collapsed: {result2['collapsed']}")

    # Scenario 3: Strong exotic matter (expands)
    print("\nScenario 3: Strong exotic matter (might expand)")
    wh3 = DynamicWormhole(initial_radius=1.0, collapse_rate=1.0, exotic_strength=2.0)
    result3 = wh3.evolve(t_max=50.0)
    print(f"  Final radius: {result3['radii'][-1]:.3f}")
    print(f"  Collapsed: {result3['collapsed']}")

    # Scenario 4: Fluctuating exotic matter
    print("\nScenario 4: Fluctuating exotic matter (quantum-like)")

    def fluctuation(t):
        return 1.0 + 0.3 * np.sin(2 * np.pi * t / 5) + 0.1 * np.sin(2 * np.pi * t / 1.3)

    wh4 = DynamicWormhole(initial_radius=1.0, collapse_rate=1.0, exotic_strength=1.0)
    result4 = wh4.evolve(t_max=50.0, fluctuation_fn=fluctuation)
    print(f"  Final radius: {result4['radii'][-1]:.3f}")
    print(f"  Collapsed: {result4['collapsed']}")

    # Scenario 5: Random fluctuations (stochastic)
    print("\nScenario 5: Random noise (stochastic fluctuations)")

    np.random.seed(42)
    noise = np.random.randn(5001) * 0.2
    def random_fluctuation(t):
        idx = int(t / 0.01)
        idx = min(idx, len(noise) - 1)
        return 1.0 + noise[idx]

    wh5 = DynamicWormhole(initial_radius=1.0, collapse_rate=1.0, exotic_strength=1.0)
    result5 = wh5.evolve(t_max=50.0, fluctuation_fn=random_fluctuation)
    print(f"  Final radius: {result5['radii'][-1]:.3f}")
    print(f"  Collapsed: {result5['collapsed']}")

    # Visualize
    visualize_stability(
        [result1, result2, result3, result4, result5],
        ['Balanced', 'Weak exotic', 'Strong exotic', 'Periodic', 'Stochastic'],
        'wormhole_stability.png'
    )

    # The critical question: what keeps it stable?
    print("\n" + "="*70)
    print("  STABILITY REQUIREMENTS")
    print("="*70)
    print("""
    For a wormhole to remain traversable:

    1. EXOTIC MATTER MUST EXCEED COLLAPSE TENDENCY
       F_exotic > F_collapse

       Our toy model shows: F0/r0^2 > k*r0
       At equilibrium: F0 = k * r0^3
       For r0=1: Need F0 > k

    2. FLUCTUATIONS MUST BE BOUNDED
       If exotic matter varies, amplitude must be limited.
       Stochastic noise tends to destabilize unless damped.

    3. NO RUNAWAY GROWTH
       Too much exotic matter causes expansion, not stability.
       Need feedback mechanism to regulate.

    Physical implications:
    - Need continuous supply of exotic matter
    - Active stabilization required (like balancing on a knife edge)
    - Small perturbations can cause collapse or runaway

    This is why natural wormholes probably don't exist!
    They require:
    1. Initial formation (how?)
    2. Exotic matter generation (quantum?)
    3. Active stabilization (by what mechanism?)
    """)

    # Can we find stable configurations?
    print("\n" + "="*70)
    print("  SEARCHING FOR STABLE CONFIGURATIONS")
    print("="*70)

    # Look at equilibrium condition
    # F0/r0^2 = k*r0
    # r0 = (F0/k)^(1/3)

    print("\nEquilibrium radius: r0_eq = (F0/k)^(1/3)")

    for k in [0.5, 1.0, 2.0]:
        for F0 in [0.5, 1.0, 2.0]:
            r0_eq = (F0 / k)**(1/3)
            print(f"  k={k}, F0={F0}: r0_eq = {r0_eq:.3f}")


if __name__ == "__main__":
    main()
