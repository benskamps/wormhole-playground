"""
Field Propagation Through Wormhole Throat
==========================================

Now let's do something more interesting than just particle geodesics.

Can a WAVE propagate through the wormhole?
What happens to a signal sent from Universe A to Universe B?

The wave equation in curved spacetime:
    (1/sqrt(-g)) * d_mu(sqrt(-g) * g^{mu nu} * d_nu Phi) = 0

For Ellis wormhole in (t, l) coordinates with angular parts suppressed:
    -d_t^2 Phi + d_l^2 Phi = 0

This is just the flat wave equation! Signals propagate unchanged.

But if we include angular dependence, things get interesting.
"""

import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation, PillowWriter


class WormholeWaveSimulator:
    """
    Simulate wave propagation through Ellis wormhole.

    Using (t, l, theta) coordinates where:
    - l is proper distance through throat
    - Throat is at l = 0
    - r(l) = sqrt(l^2 + r0^2)
    """

    def __init__(self, throat_radius: float = 1.0,
                 l_min: float = -15.0, l_max: float = 15.0,
                 n_points: int = 500):
        self.r0 = throat_radius
        self.l = np.linspace(l_min, l_max, n_points)
        self.dl = self.l[1] - self.l[0]
        self.n = n_points

        # Radial coordinate
        self.r = np.sqrt(self.l**2 + self.r0**2)

        # For the wave equation, we need the effective potential
        # In the angular sector, there's a centrifugal barrier

    def r_of_l(self, l):
        """Radial coordinate from proper distance."""
        return np.sqrt(l**2 + self.r0**2)

    def effective_potential(self, angular_momentum: int = 0):
        """
        Effective potential for radial wave propagation.

        For l-modes (angular momentum = m), there's a centrifugal term:
        V_eff = m^2 / r^2
        """
        if angular_momentum == 0:
            return np.zeros_like(self.l)
        return angular_momentum**2 / self.r**2

    def propagate_wave_packet(self, initial_position: float = 5.0,
                               initial_width: float = 1.0,
                               initial_velocity: float = -1.0,
                               angular_momentum: int = 0,
                               t_max: float = 30.0, dt: float = 0.01):
        """
        Propagate a Gaussian wave packet through the wormhole.

        Uses finite differences for the wave equation:
            d_t^2 phi - d_l^2 phi + V_eff * phi = 0
        """
        n_steps = int(t_max / dt)

        # Initial Gaussian packet
        phi = np.exp(-(self.l - initial_position)**2 / (2 * initial_width**2))

        # Give it initial momentum (velocity)
        k = initial_velocity  # wave number ~ velocity for c=1
        phi = phi * np.exp(1j * k * self.l)
        phi = phi.astype(complex)

        # Store for visualization
        history = [phi.copy()]
        times = [0.0]

        # Effective potential
        V = self.effective_potential(angular_momentum)

        # Time evolution using leapfrog
        # phi_new = 2*phi - phi_old + dt^2 * (d_l^2 phi - V*phi)

        # First step: use velocity to get phi_old
        phi_old = phi - 1j * k * dt * phi  # Approximate first step

        for step in range(n_steps):
            # Laplacian with reflecting boundaries
            laplacian = np.zeros_like(phi)
            laplacian[1:-1] = (phi[2:] - 2*phi[1:-1] + phi[:-2]) / self.dl**2

            # Absorbing boundaries (simple damping)
            damping = np.ones_like(self.l)
            edge_width = 20
            damping[:edge_width] = np.linspace(0.9, 1.0, edge_width)
            damping[-edge_width:] = np.linspace(1.0, 0.9, edge_width)

            # Evolution
            phi_new = 2*phi - phi_old + dt**2 * (laplacian - V * phi)
            phi_new *= damping

            # Shift
            phi_old = phi
            phi = phi_new

            # Store periodically
            if step % 50 == 0:
                history.append(phi.copy())
                times.append((step + 1) * dt)

        return {
            'history': history,
            'times': times,
            'l': self.l,
            'r': self.r,
            'V_eff': V
        }

    def analyze_transmission(self, result):
        """
        Analyze how much of the wave packet transmitted vs reflected.
        """
        initial = np.abs(result['history'][0])**2
        final = np.abs(result['history'][-1])**2

        l = result['l']

        # Initial was in Universe A (l > 0)
        initial_in_A = np.trapz(initial[l > 0], l[l > 0])
        initial_in_B = np.trapz(initial[l < 0], l[l < 0])

        # Final distribution
        final_in_A = np.trapz(final[l > 0], l[l > 0])
        final_in_B = np.trapz(final[l < 0], l[l < 0])

        total_initial = initial_in_A + initial_in_B
        total_final = final_in_A + final_in_B

        return {
            'transmission': final_in_B / total_initial if total_initial > 0 else 0,
            'reflection': final_in_A / total_initial if total_initial > 0 else 0,
            'conservation': total_final / total_initial if total_initial > 0 else 0
        }


def visualize_propagation(result, filename='wormhole_wave.png'):
    """Create visualization of wave propagation."""

    fig, axes = plt.subplots(2, 2, figsize=(12, 10))

    l = result['l']
    history = result['history']
    times = result['times']

    # 1. Spacetime diagram (l vs t, color = amplitude)
    ax1 = axes[0, 0]

    # Create 2D array of amplitudes
    amp_history = np.array([np.abs(h)**2 for h in history])

    # Plot as heatmap
    extent = [l[0], l[-1], times[0], times[-1]]
    im = ax1.imshow(amp_history, aspect='auto', extent=extent,
                    origin='lower', cmap='hot', interpolation='bilinear')
    ax1.axvline(x=0, color='cyan', linestyle='--', alpha=0.7, label='Throat')
    ax1.set_xlabel('Proper distance l')
    ax1.set_ylabel('Time t')
    ax1.set_title('Wave Amplitude |phi|^2 (spacetime diagram)')
    plt.colorbar(im, ax=ax1)

    # 2. Snapshots at different times
    ax2 = axes[0, 1]
    n_snapshots = min(6, len(history))
    indices = np.linspace(0, len(history)-1, n_snapshots, dtype=int)
    colors = plt.cm.viridis(np.linspace(0, 1, n_snapshots))

    for i, idx in enumerate(indices):
        ax2.plot(l, np.abs(history[idx])**2, color=colors[i],
                label=f't={times[idx]:.1f}', alpha=0.8)

    ax2.axvline(x=0, color='red', linestyle='--', alpha=0.5, label='Throat')
    ax2.set_xlabel('Proper distance l')
    ax2.set_ylabel('|phi|^2')
    ax2.set_title('Wave Packet at Different Times')
    ax2.legend(fontsize=8)
    ax2.grid(True, alpha=0.3)

    # 3. Effective potential
    ax3 = axes[1, 0]
    ax3.plot(l, result['V_eff'], 'purple', linewidth=2)
    ax3.axvline(x=0, color='red', linestyle='--', alpha=0.5)
    ax3.set_xlabel('Proper distance l')
    ax3.set_ylabel('V_eff')
    ax3.set_title('Effective Potential (centrifugal barrier)')
    ax3.grid(True, alpha=0.3)

    # 4. Phase evolution
    ax4 = axes[1, 1]

    # Track phase at a fixed point near throat
    throat_idx = len(l) // 2
    phases = [np.angle(h[throat_idx]) if np.abs(h[throat_idx]) > 1e-10 else 0
              for h in history]

    ax4.plot(times, np.unwrap(phases), 'green', linewidth=2)
    ax4.set_xlabel('Time t')
    ax4.set_ylabel('Phase at throat (unwrapped)')
    ax4.set_title('Phase Evolution at Wormhole Throat')
    ax4.grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig(filename, dpi=150)
    print(f"Saved to {filename}")
    plt.close()


def create_animation(result, filename='wormhole_wave.gif'):
    """Create animated GIF of wave propagation."""

    fig, ax = plt.subplots(figsize=(10, 6))

    l = result['l']
    r = result['r']
    history = result['history']
    times = result['times']

    # Find max amplitude for consistent scaling
    max_amp = max(np.max(np.abs(h)**2) for h in history)

    line, = ax.plot([], [], 'b-', linewidth=2)
    throat_line = ax.axvline(x=0, color='red', linestyle='--', alpha=0.7, label='Throat')

    ax.set_xlim(l[0], l[-1])
    ax.set_ylim(0, max_amp * 1.1)
    ax.set_xlabel('Proper distance l')
    ax.set_ylabel('|phi|^2')
    ax.grid(True, alpha=0.3)

    time_text = ax.text(0.02, 0.95, '', transform=ax.transAxes)

    # Show wormhole shape in background
    ax2 = ax.twinx()
    ax2.plot(l, r, 'g-', alpha=0.3, linewidth=1)
    ax2.set_ylabel('Radial coordinate r (wormhole shape)', color='green', alpha=0.5)
    ax2.set_ylim(0, max(r) * 1.1)

    def init():
        line.set_data([], [])
        time_text.set_text('')
        return line, time_text

    def animate(frame):
        line.set_data(l, np.abs(history[frame])**2)
        time_text.set_text(f't = {times[frame]:.1f}')
        ax.set_title(f'Wave Packet Traversing Wormhole')
        return line, time_text

    anim = FuncAnimation(fig, animate, init_func=init,
                         frames=len(history), interval=100, blit=True)

    anim.save(filename, writer=PillowWriter(fps=10))
    print(f"Saved animation to {filename}")
    plt.close()


def main():
    print("="*70)
    print("  WAVE PROPAGATION THROUGH WORMHOLE")
    print("="*70)

    sim = WormholeWaveSimulator(throat_radius=1.0)

    # Test 1: Zero angular momentum (should transmit perfectly)
    print("\nTest 1: Zero angular momentum wave packet")
    print("  Starting in Universe A (l=8), moving toward B (v=-1)")

    result1 = sim.propagate_wave_packet(
        initial_position=8.0,
        initial_width=1.5,
        initial_velocity=-1.0,
        angular_momentum=0,
        t_max=25.0
    )

    analysis1 = sim.analyze_transmission(result1)
    print(f"  Transmission to Universe B: {analysis1['transmission']*100:.1f}%")
    print(f"  Reflection to Universe A: {analysis1['reflection']*100:.1f}%")
    print(f"  Total probability conserved: {analysis1['conservation']*100:.1f}%")

    visualize_propagation(result1, 'wormhole_wave_m0.png')

    # Test 2: Non-zero angular momentum (centrifugal barrier)
    print("\nTest 2: Angular momentum m=2 wave packet")
    print("  Same starting conditions, but with angular momentum")

    result2 = sim.propagate_wave_packet(
        initial_position=8.0,
        initial_width=1.5,
        initial_velocity=-1.0,
        angular_momentum=2,
        t_max=25.0
    )

    analysis2 = sim.analyze_transmission(result2)
    print(f"  Transmission to Universe B: {analysis2['transmission']*100:.1f}%")
    print(f"  Reflection to Universe A: {analysis2['reflection']*100:.1f}%")
    print(f"  Total probability conserved: {analysis2['conservation']*100:.1f}%")

    visualize_propagation(result2, 'wormhole_wave_m2.png')

    # Test 3: Higher angular momentum
    print("\nTest 3: Angular momentum m=5 wave packet")

    result3 = sim.propagate_wave_packet(
        initial_position=8.0,
        initial_width=1.5,
        initial_velocity=-1.0,
        angular_momentum=5,
        t_max=25.0
    )

    analysis3 = sim.analyze_transmission(result3)
    print(f"  Transmission to Universe B: {analysis3['transmission']*100:.1f}%")
    print(f"  Reflection to Universe A: {analysis3['reflection']*100:.1f}%")
    print(f"  Total probability conserved: {analysis3['conservation']*100:.1f}%")

    visualize_propagation(result3, 'wormhole_wave_m5.png')

    # Create animation for m=0 case
    print("\nCreating animation...")
    create_animation(result1, 'wormhole_wave.gif')

    # Summary
    print("\n" + "="*70)
    print("  ANGULAR MOMENTUM FILTERING BY WORMHOLE")
    print("="*70)
    print("""
    Key finding: The wormhole acts as an ANGULAR MOMENTUM FILTER!

    - m=0 (no spin): Passes through freely
    - Higher m: Centrifugal barrier at throat blocks transmission

    This is because r(l) has a minimum at the throat.
    Angular momentum creates V_eff = m^2/r^2, which peaks at throat.

    A wormhole naturally selects for LOW angular momentum states!

    Physical interpretation:
    - Orbiting particles can't fit through the narrow throat
    - Only radially-moving (m=0) particles traverse easily
    - This is a GEOMETRIC effect, not material

    Connection to our earlier work:
    - The Kozyrev spiral CREATED angular momentum
    - The wormhole FILTERS angular momentum
    - Geometry determines what can propagate!
    """)


if __name__ == "__main__":
    main()
