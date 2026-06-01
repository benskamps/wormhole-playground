"""
Wormhole Formation - Opening a Hole in Spacetime
=================================================

The ultimate question: How do you CREATE a wormhole?

Current physics gives us few options:
1. Quantum fluctuations at Planck scale (Wheeler's "spacetime foam")
2. Gravitational collapse that somehow avoids singularity
3. Exotic matter configurations that "stretch" spacetime
4. Topology change from extreme field configurations

Let's model #3: Can concentrating negative energy open a throat?

The idea:
- Start with flat spacetime (no wormhole)
- Introduce a "seed" of exotic matter
- See if it can nucleate into a stable wormhole
"""

import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation, PillowWriter


class SpacetimeGrid:
    """
    A 1D slice of spacetime with local curvature.

    We model the "shape" as a function w(x) representing
    how spacetime is bent. Think of it like pushing your finger
    into a rubber sheet.

    w = 0 everywhere: flat spacetime
    w forms a neck: wormhole-like topology

    The dynamics come from:
    1. Elastic resistance (spacetime resists bending)
    2. Exotic matter "push" (negative energy stretches space)
    3. Damping (energy dissipation)
    """

    def __init__(self, x_min: float = -20, x_max: float = 20, n_points: int = 500):
        self.x = np.linspace(x_min, x_max, n_points)
        self.dx = self.x[1] - self.x[0]
        self.n = n_points

        # Shape function (displacement into embedding dimension)
        self.w = np.zeros(n_points)
        self.w_dot = np.zeros(n_points)

        # Parameters - tuned for stability
        self.tension = 0.1  # Resistance to bending (lower = more stable)
        self.mass_density = 1.0  # Inertia
        self.damping = 0.5  # Energy dissipation (higher = more stable)

    def curvature(self) -> np.ndarray:
        """
        Local curvature k = d^2w/dx^2.

        High curvature = tightly bent space.
        """
        k = np.zeros_like(self.w)
        k[1:-1] = (self.w[2:] - 2*self.w[1:-1] + self.w[:-2]) / self.dx**2
        return k

    def exotic_matter_force(self, source_fn) -> np.ndarray:
        """
        Force from exotic matter distribution.

        source_fn(x, t) gives the exotic matter density at each point.
        Negative density = negative energy = expansive force.
        """
        # Exotic matter wants to "push out" - create positive curvature
        return source_fn(self.x)

    def elastic_force(self) -> np.ndarray:
        """
        Restoring force from spacetime "elasticity".

        Spacetime resists being bent - proportional to 4th derivative
        (like a beam bending).
        """
        # Biharmonic operator: d^4w/dx^4
        force = np.zeros_like(self.w)
        force[2:-2] = (self.w[4:] - 4*self.w[3:-1] + 6*self.w[2:-2]
                       - 4*self.w[1:-3] + self.w[:-4]) / self.dx**4
        return -self.tension * force

    def evolve(self, source_fn, t_max: float = 50, dt: float = 0.01) -> dict:
        """
        Evolve spacetime shape under exotic matter influence.
        """
        n_steps = int(t_max / dt)
        history = [self.w.copy()]
        times = [0]

        for step in range(n_steps):
            t = step * dt

            # Forces
            F_exotic = self.exotic_matter_force(lambda x: source_fn(x, t))
            F_elastic = self.elastic_force()
            F_damping = -self.damping * self.w_dot

            # Total force
            F_total = F_exotic + F_elastic + F_damping

            # Update (simple Euler)
            self.w_dot += (F_total / self.mass_density) * dt
            self.w += self.w_dot * dt

            # Fixed boundary conditions
            self.w[0] = 0
            self.w[-1] = 0
            self.w[1] = 0
            self.w[-2] = 0

            # Record periodically
            if step % 100 == 0:
                history.append(self.w.copy())
                times.append(t)

        return {
            'x': self.x.copy(),
            'history': history,
            'times': times,
            'final_shape': self.w.copy(),
            'curvature': self.curvature()
        }

    def throat_radius(self) -> float:
        """
        If the shape forms a wormhole-like geometry,
        return the minimum "radius" (how narrow the throat is).

        We define radius as: r = sqrt(1 + (dw/dx)^2)
        at the throat location.
        """
        # Find the point of maximum |w| (deepest point)
        throat_idx = np.argmax(np.abs(self.w))

        # Local slope
        if throat_idx > 0 and throat_idx < len(self.w) - 1:
            dwdx = (self.w[throat_idx+1] - self.w[throat_idx-1]) / (2*self.dx)
        else:
            dwdx = 0

        # "Effective radius" based on embedding
        r_eff = np.sqrt(1 + dwdx**2)

        return r_eff, self.w[throat_idx]


def gaussian_source(x0: float, width: float, strength: float):
    """Create a Gaussian exotic matter source."""
    def source(x, t):
        return strength * np.exp(-(x - x0)**2 / (2*width**2))
    return source


def pulsed_source(x0: float, width: float, strength: float,
                  turn_on: float, duration: float):
    """Exotic matter that turns on and then off."""
    def source(x, t):
        if t < turn_on or t > turn_on + duration:
            return np.zeros_like(x)
        envelope = np.sin(np.pi * (t - turn_on) / duration)**2
        return envelope * strength * np.exp(-(x - x0)**2 / (2*width**2))
    return source


def dual_source(x1: float, x2: float, width: float, strength: float):
    """Two sources that might create a bridge."""
    def source(x, t):
        s1 = strength * np.exp(-(x - x1)**2 / (2*width**2))
        s2 = strength * np.exp(-(x - x2)**2 / (2*width**2))
        return s1 + s2
    return source


def visualize_formation(result, source_fn, filename: str):
    """Visualize wormhole formation process."""

    fig, axes = plt.subplots(2, 2, figsize=(14, 10))

    x = result['x']
    history = result['history']
    times = result['times']

    # 1. Shape evolution over time
    ax1 = axes[0, 0]
    n_snapshots = min(8, len(history))
    indices = np.linspace(0, len(history)-1, n_snapshots, dtype=int)
    colors = plt.cm.plasma(np.linspace(0, 1, n_snapshots))

    for i, idx in enumerate(indices):
        ax1.plot(x, history[idx], color=colors[i], label=f't={times[idx]:.1f}', linewidth=1.5)

    ax1.set_xlabel('Position x')
    ax1.set_ylabel('Shape w(x)')
    ax1.set_title('Spacetime Shape Evolution')
    ax1.legend(fontsize=8)
    ax1.grid(True, alpha=0.3)

    # 2. Spacetime diagram
    ax2 = axes[0, 1]
    shape_history = np.array(history)
    extent = [x[0], x[-1], times[0], times[-1]]
    im = ax2.imshow(shape_history, aspect='auto', extent=extent,
                    origin='lower', cmap='RdBu_r', interpolation='bilinear')
    ax2.set_xlabel('Position x')
    ax2.set_ylabel('Time t')
    ax2.set_title('Spacetime Diagram (color = shape w)')
    plt.colorbar(im, ax=ax2, label='w')

    # 3. Final shape as embedding diagram
    ax3 = axes[1, 0]
    final = result['final_shape']

    # Plot as if embedded in higher dimension
    ax3.fill_between(x, 0, -final, alpha=0.3, color='blue', label='Upper sheet')
    ax3.fill_between(x, 0, final, alpha=0.3, color='red', label='Lower sheet')
    ax3.plot(x, -final, 'b-', linewidth=2)
    ax3.plot(x, final, 'r-', linewidth=2)
    ax3.axhline(y=0, color='gray', linestyle='--', alpha=0.5)

    ax3.set_xlabel('Position x')
    ax3.set_ylabel('Embedding coordinate w')
    ax3.set_title('Final Shape (Embedding Diagram)')
    ax3.legend()
    ax3.grid(True, alpha=0.3)

    # 4. Curvature and source
    ax4 = axes[1, 1]
    curvature = result['curvature']

    ax4.plot(x, curvature, 'purple', linewidth=2, label='Curvature')
    ax4.plot(x, source_fn(x, times[-1]), 'green', linewidth=2, linestyle='--',
             label='Exotic matter (final)')
    ax4.axhline(y=0, color='gray', linestyle='-', alpha=0.3)
    ax4.set_xlabel('Position x')
    ax4.set_ylabel('Curvature / Source strength')
    ax4.set_title('Curvature vs Exotic Matter Distribution')
    ax4.legend()
    ax4.grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig(filename, dpi=150)
    print(f"Saved to {filename}")
    plt.close()


def create_formation_animation(result, filename: str):
    """Animate the formation process."""

    fig, ax = plt.subplots(figsize=(10, 6))

    x = result['x']
    history = result['history']
    times = result['times']

    # Find range for consistent axis
    all_w = np.array(history)
    w_max = max(np.abs(all_w.max()), np.abs(all_w.min()), 0.1) * 1.2

    upper_line, = ax.plot([], [], 'b-', linewidth=2, label='Upper sheet')
    lower_line, = ax.plot([], [], 'r-', linewidth=2, label='Lower sheet')

    ax.set_xlim(x[0], x[-1])
    ax.set_ylim(-w_max, w_max)
    ax.set_xlabel('Position x')
    ax.set_ylabel('Embedding w')
    ax.axhline(y=0, color='gray', linestyle='--', alpha=0.5)
    ax.legend()
    ax.grid(True, alpha=0.3)

    time_text = ax.text(0.02, 0.95, '', transform=ax.transAxes)

    def init():
        upper_line.set_data([], [])
        lower_line.set_data([], [])
        time_text.set_text('')
        return upper_line, lower_line, time_text

    def animate(frame):
        w = history[frame]
        upper_line.set_data(x, -w)
        lower_line.set_data(x, w)
        time_text.set_text(f't = {times[frame]:.1f}')
        ax.set_title('Wormhole Formation')
        return upper_line, lower_line, time_text

    anim = FuncAnimation(fig, animate, init_func=init,
                         frames=len(history), interval=100, blit=True)

    anim.save(filename, writer=PillowWriter(fps=10))
    print(f"Saved animation to {filename}")
    plt.close()


def main():
    print("="*70)
    print("  WORMHOLE FORMATION SIMULATION")
    print("="*70)

    # Scenario 1: Single point source
    print("\nScenario 1: Single exotic matter source")
    print("  Concentrated negative energy at x=0")

    grid1 = SpacetimeGrid()
    source1 = gaussian_source(x0=0, width=2.0, strength=0.05)
    result1 = grid1.evolve(source1, t_max=50, dt=0.005)

    r_eff, depth = grid1.throat_radius()
    print(f"  Max deformation: {depth:.3f}")
    print(f"  Effective throat radius: {r_eff:.3f}")

    visualize_formation(result1, source1, 'formation_single.png')

    # Scenario 2: Two sources creating a bridge
    print("\nScenario 2: Two sources (attempting to create bridge)")
    print("  Exotic matter at x=-5 and x=+5")

    grid2 = SpacetimeGrid()
    source2 = dual_source(x1=-5, x2=5, width=2.0, strength=0.03)
    result2 = grid2.evolve(source2, t_max=50, dt=0.005)

    visualize_formation(result2, source2, 'formation_dual.png')

    # Scenario 3: Pulsed source
    print("\nScenario 3: Pulsed exotic matter (temporary burst)")
    print("  Exotic matter turns on at t=10, off at t=30")

    grid3 = SpacetimeGrid()
    source3 = pulsed_source(x0=0, width=2.0, strength=0.1, turn_on=5, duration=10)
    result3 = grid3.evolve(source3, t_max=50, dt=0.005)

    visualize_formation(result3, lambda x, t=100: source3(x, 25), 'formation_pulsed.png')

    # Create animation for the single source case
    print("\nCreating formation animation...")
    create_formation_animation(result1, 'formation.gif')

    # Analysis
    print("\n" + "="*70)
    print("  FORMATION REQUIREMENTS")
    print("="*70)
    print("""
    What we learned from these simulations:

    1. EXOTIC MATTER CAN DEFORM SPACETIME
       But the deformation is LOCAL - it creates a depression,
       not a through-hole connecting two regions.

    2. TOPOLOGY CHANGE IS HARD
       To create a TRUE wormhole, we need to change topology:
       from one sheet to two connected sheets.
       Our elastic model shows DEFORMATION but not TOPOLOGY CHANGE.

    3. TWO SOURCES DON'T NATURALLY CONNECT
       The dual-source scenario creates two separate depressions,
       not a connected throat. The "bridge" doesn't form automatically.

    4. PULSED EXCITATION RELAXES BACK
       When exotic matter is removed, spacetime rebounds.
       No permanent change without sustained exotic matter.

    What would be needed for actual wormhole formation:
    - Topology-changing process (quantum gravity domain)
    - Sustained exotic matter with specific distribution
    - Some mechanism to "punch through" and connect regions

    This is why wormhole formation is considered impossible
    in classical general relativity - you can MAINTAIN a wormhole
    with exotic matter, but CREATING one requires new physics.
    """)

    # The speculative part
    print("\n" + "="*70)
    print("  SPECULATIVE: WHAT MIGHT WORK?")
    print("="*70)
    print("""
    Physics that MIGHT allow wormhole formation:

    1. QUANTUM FOAM at Planck scale
       If spacetime is foamy at 10^-35 m, tiny wormholes might
       constantly form and collapse. Could one be "grown"?

    2. CASIMIR-LIKE EFFECTS IN EXTREME GEOMETRY
       Certain geometric configurations might generate exotic matter
       from the vacuum itself. Self-sustaining?

    3. COSMIC STRING COLLISIONS
       Topological defects from the early universe could create
       wormhole-like structures when they collide.

    4. ENTANGLEMENT AND ER=EPR
       If wormholes ARE entanglement (Maldacena-Susskind conjecture),
       then creating highly entangled states creates wormholes!
       (But non-traversable without additional exotic matter.)

    The honest truth:
    We can simulate wormholes that EXIST.
    We cannot simulate wormholes FORMING - that requires
    physics we don't have yet.
    """)


if __name__ == "__main__":
    main()
