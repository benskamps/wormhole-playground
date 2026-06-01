"""
Wormhole Traversal - Let's Actually Cross
==========================================

The first attempt deflected the particle. Let's understand why and fix it.

For a radially infalling particle in a wormhole:
- The geodesic should be simple: straight through
- If Phi = 0 (no redshift), there's no gravitational "pull"
- The particle should just coast through

Issue: My Christoffel symbols might be wrong. Let's simplify.
"""

import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt


class SimpleWormhole:
    """
    Ellis wormhole - the simplest traversable wormhole.

    Metric: ds^2 = -dt^2 + dl^2 + (l^2 + r0^2)(dtheta^2 + sin^2(theta)*dphi^2)

    In proper distance coordinates, this is FLAT in the t-l plane!
    A radially moving particle just goes straight through.

    The only curvature is in the angular part.
    """

    def __init__(self, throat_radius: float = 1.0):
        self.r0 = throat_radius

    def r(self, l: np.ndarray) -> np.ndarray:
        """Radial coordinate from proper distance."""
        return np.sqrt(l**2 + self.r0**2)

    def energy_density(self, l: np.ndarray) -> np.ndarray:
        """
        Required energy density (Einstein equations).

        For Ellis: rho = -r0^2 / (8*pi*(l^2+r0^2)^2)

        Maximum negative at throat (l=0): rho = -r0^2 / (8*pi*r0^4) = -1/(8*pi*r0^2)
        """
        r = self.r(l)
        return -self.r0**2 / (8 * np.pi * r**4)

    def radial_pressure(self, l: np.ndarray) -> np.ndarray:
        """
        Radial pressure (tension).

        For Ellis: p_r = rho (equation of state)
        """
        return self.energy_density(l)

    def tangential_pressure(self, l: np.ndarray) -> np.ndarray:
        """
        Tangential pressure.

        For Ellis: p_t = -rho/2
        """
        return -self.energy_density(l) / 2


def radial_geodesic(wormhole: SimpleWormhole, l0: float, v0: float,
                    tau_max: float = 20, n_steps: int = 1000):
    """
    Integrate radial geodesic (motion purely in l direction).

    For Ellis wormhole with Phi=0, the radial geodesic is trivial:
        l(tau) = l0 + v0 * tau

    The particle just moves at constant velocity through the throat!
    This is because there's no gravitational force in the l direction.
    """
    tau = np.linspace(0, tau_max, n_steps)
    l = l0 + v0 * tau
    r = wormhole.r(l)

    return {
        'tau': tau,
        'l': l,
        'r': r,
        'crossed_throat': np.any(l * l0 < 0)  # Sign change means crossed
    }


def visualize_traversal(wormhole: SimpleWormhole, trajectories: list):
    """Visualize wormhole and particle trajectories."""

    fig, axes = plt.subplots(2, 2, figsize=(12, 10))

    # 1. Embedding diagram with trajectory
    ax1 = axes[0, 0]
    l = np.linspace(-10, 10, 500)
    r = wormhole.r(l)

    ax1.plot(l, r, 'b-', linewidth=2, label='Wormhole surface r(l)')
    ax1.axvline(x=0, color='r', linestyle='--', alpha=0.5, label='Throat')

    for i, traj in enumerate(trajectories):
        ax1.plot(traj['l'], traj['r'], 'g-', linewidth=1.5, alpha=0.7)
        ax1.scatter(traj['l'][0], traj['r'][0], c='green', s=50, zorder=5)
        ax1.scatter(traj['l'][-1], traj['r'][-1], c='red', s=50, zorder=5)

    ax1.set_xlabel('Proper distance l')
    ax1.set_ylabel('Radial coordinate r')
    ax1.set_title('Wormhole Cross-Section with Trajectories')
    ax1.legend()
    ax1.grid(True, alpha=0.3)

    # 2. l vs tau (position vs time)
    ax2 = axes[0, 1]
    for traj in trajectories:
        ax2.plot(traj['tau'], traj['l'], linewidth=1.5)
    ax2.axhline(y=0, color='r', linestyle='--', alpha=0.5, label='Throat')
    ax2.set_xlabel('Proper time tau')
    ax2.set_ylabel('Position l')
    ax2.set_title('Traversal: Position vs Time')
    ax2.legend()
    ax2.grid(True, alpha=0.3)

    # 3. Energy density
    ax3 = axes[1, 0]
    rho = wormhole.energy_density(l)
    ax3.plot(l, rho, 'purple', linewidth=2)
    ax3.axhline(y=0, color='k', linestyle='-', alpha=0.3)
    ax3.fill_between(l, rho, 0, where=(rho < 0), alpha=0.3, color='red',
                     label='Exotic matter (negative energy)')
    ax3.set_xlabel('Proper distance l')
    ax3.set_ylabel('Energy density rho')
    ax3.set_title('Energy Density Distribution')
    ax3.legend()
    ax3.grid(True, alpha=0.3)

    # 4. 3D embedding
    ax4 = axes[1, 1]
    ax4.remove()
    ax4 = fig.add_subplot(2, 2, 4, projection='3d')

    phi = np.linspace(0, 2*np.pi, 100)
    L, PHI = np.meshgrid(np.linspace(-5, 5, 100), phi)
    R = wormhole.r(L)

    X = R * np.cos(PHI)
    Y = R * np.sin(PHI)
    Z = L

    ax4.plot_surface(X, Y, Z, cmap='viridis', alpha=0.6, linewidth=0)
    ax4.set_xlabel('X')
    ax4.set_ylabel('Y')
    ax4.set_zlabel('l')
    ax4.set_title('3D Wormhole Embedding')

    plt.tight_layout()
    plt.savefig('wormhole_traversal.png', dpi=150)
    print("Saved to wormhole_traversal.png")
    plt.close()


def main():
    print("="*70)
    print("  ELLIS WORMHOLE TRAVERSAL")
    print("="*70)

    wormhole = SimpleWormhole(throat_radius=1.0)

    print(f"\nWormhole throat radius: {wormhole.r0}")
    print(f"Energy density at throat: {wormhole.energy_density(np.array([0]))[0]:.4e}")
    print("(Negative = exotic matter required)\n")

    # Send particles through
    trajectories = []

    # Particle 1: From Universe A, moving toward Universe B
    print("Particle 1: Starting at l=5 (Universe A), velocity v=-1 (toward B)")
    traj1 = radial_geodesic(wormhole, l0=5.0, v0=-1.0, tau_max=12)
    trajectories.append(traj1)
    print(f"  Final position: l = {traj1['l'][-1]:.2f}")
    print(f"  Crossed throat: {traj1['crossed_throat']}")
    if traj1['crossed_throat']:
        crossing_idx = np.where(traj1['l'] < 0)[0][0]
        print(f"  Entered Universe B at tau = {traj1['tau'][crossing_idx]:.2f}")

    # Particle 2: From Universe B, moving toward Universe A
    print("\nParticle 2: Starting at l=-5 (Universe B), velocity v=+1 (toward A)")
    traj2 = radial_geodesic(wormhole, l0=-5.0, v0=1.0, tau_max=12)
    trajectories.append(traj2)
    print(f"  Final position: l = {traj2['l'][-1]:.2f}")
    print(f"  Crossed throat: {traj2['crossed_throat']}")
    if traj2['crossed_throat']:
        crossing_idx = np.where(traj2['l'] > 0)[0][0]
        print(f"  Entered Universe A at tau = {traj2['tau'][crossing_idx]:.2f}")

    # Particle 3: Light ray (null geodesic, same math for radial motion)
    print("\nPhoton: Starting at l=10, velocity v=-1 (toward B)")
    traj3 = radial_geodesic(wormhole, l0=10.0, v0=-1.0, tau_max=25)
    trajectories.append(traj3)
    print(f"  Final position: l = {traj3['l'][-1]:.2f}")
    print(f"  Crossed to Universe B: {traj3['crossed_throat']}")

    # Visualize
    visualize_traversal(wormhole, trajectories)

    # Calculate traversal time for an astronaut
    print("\n" + "="*70)
    print("  ASTRONAUT TRAVERSAL CALCULATION")
    print("="*70)

    # If throat radius = 1 meter, what's the traversal experience?
    r0_meters = 1.0  # 1 meter throat
    c = 3e8  # speed of light

    print(f"\nIf throat radius = {r0_meters} m:")

    # Energy density at throat
    rho_throat = -1 / (8 * np.pi * r0_meters**2)  # in geometric units
    # Convert to SI: multiply by c^4 / (G) ~ 1.2e44 kg/m^3
    G = 6.67e-11
    rho_SI = rho_throat * c**4 / G
    print(f"  Energy density at throat: {rho_SI:.2e} kg/m^3")
    print(f"  (Compare: nuclear density ~ 2e17 kg/m^3)")

    # Traversal time at 0.1c
    v = 0.1 * c
    distance = 2  # ~2 meters to fully cross
    time = distance / v
    print(f"\n  At 0.1c ({v:.2e} m/s):")
    print(f"  Traversal time: {time:.2e} seconds = {time*1e9:.1f} nanoseconds")

    # The catch
    print("\n" + "="*70)
    print("  THE CATCH: EXOTIC MATTER")
    print("="*70)
    print("""
    The wormhole requires NEGATIVE energy density throughout the throat region.

    Known sources of negative energy:
    1. Casimir effect: ~10^-4 J/m^3 (way too weak)
    2. Squeezed vacuum: transient only, averages to zero
    3. Quantum inequalities: limit how negative and how long

    For our 1m throat wormhole:
    - Need: ~10^43 kg/m^3 of exotic matter
    - Have: ~10^-4 J/m^3 from Casimir

    Gap: ~10^60 orders of magnitude

    This is why we can't build real wormholes... yet.
    """)


if __name__ == "__main__":
    main()
