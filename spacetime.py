"""
Wormhole Spacetime
==================

Implement the Morris-Thorne traversable wormhole metric and tools
for working with curved spacetime.

The metric:
    ds^2 = -e^(2*Phi) * dt^2 + dr^2/(1 - b/r) + r^2 * dOmega^2

Where:
    Phi(r) = redshift function
    b(r) = shape function
    r_0 = throat radius (where b(r_0) = r_0)
"""

import numpy as np
from dataclasses import dataclass
from typing import Callable, Tuple, Optional
from enum import Enum


class Side(Enum):
    """Which side of the wormhole we're on."""
    UNIVERSE_A = 1
    UNIVERSE_B = -1


@dataclass
class WormholeParams:
    """Parameters defining a Morris-Thorne wormhole."""
    throat_radius: float = 1.0      # r_0: minimum radius at throat
    redshift_param: float = 0.0     # Controls time dilation (Phi)
    shape_param: float = 1.0        # Controls how throat flares out


class MorrisThorneMetric:
    """
    The Morris-Thorne traversable wormhole metric.

    Uses the "proper radial distance" coordinate l, where:
        l = 0 at the throat
        l > 0 in Universe A
        l < 0 in Universe B

    The radial coordinate r(l) is related by:
        dr/dl = +/- sqrt(1 - b(r)/r)

    For a simple wormhole: b(r) = r_0^2 / r (Ellis wormhole)
    """

    def __init__(self, params: WormholeParams):
        self.params = params
        self.r0 = params.throat_radius

    def shape_function(self, r: np.ndarray) -> np.ndarray:
        """
        Shape function b(r).

        Ellis wormhole: b(r) = r_0^2 / r
        This gives a simple, everywhere-smooth geometry.
        """
        return self.r0**2 / np.maximum(r, self.r0 * 0.1)

    def redshift_function(self, r: np.ndarray) -> np.ndarray:
        """
        Redshift function Phi(r).

        For zero-tidal-force wormhole: Phi = 0
        For more general case: Phi = -r_0 / r (gives some tidal forces)
        """
        if self.params.redshift_param == 0:
            return np.zeros_like(r)
        else:
            return -self.params.redshift_param * self.r0 / np.maximum(r, self.r0 * 0.1)

    def r_from_l(self, l: np.ndarray) -> np.ndarray:
        """
        Convert proper distance l to radial coordinate r.

        For Ellis wormhole: r^2 = l^2 + r_0^2
        """
        return np.sqrt(l**2 + self.r0**2)

    def l_from_r(self, r: np.ndarray, side: Side = Side.UNIVERSE_A) -> np.ndarray:
        """
        Convert radial coordinate r to proper distance l.

        l = +/- sqrt(r^2 - r_0^2)
        """
        sign = side.value
        return sign * np.sqrt(np.maximum(r**2 - self.r0**2, 0))

    def metric_components(self, l: np.ndarray, theta: np.ndarray = None) -> dict:
        """
        Compute metric tensor components at given positions.

        Returns g_tt, g_ll, g_theta_theta, g_phi_phi
        """
        r = self.r_from_l(l)
        Phi = self.redshift_function(r)
        b = self.shape_function(r)

        # Metric components
        g_tt = -np.exp(2 * Phi)
        g_ll = np.ones_like(l)  # In proper distance coords, g_ll = 1
        g_theta_theta = r**2
        g_phi_phi = r**2  # * sin^2(theta), but we'll handle that separately

        return {
            'g_tt': g_tt,
            'g_ll': g_ll,
            'g_theta_theta': g_theta_theta,
            'g_phi_phi': g_phi_phi,
            'r': r,
            'Phi': Phi,
            'b': b
        }

    def christoffel_symbols(self, l: float) -> dict:
        """
        Compute Christoffel symbols (connection coefficients).

        These determine geodesic motion: d^2x^mu/dtau^2 + Gamma^mu_nu_rho * dx^nu/dtau * dx^rho/dtau = 0
        """
        eps = 1e-6
        r = self.r_from_l(l)

        # Numerical derivatives
        r_plus = self.r_from_l(l + eps)
        r_minus = self.r_from_l(l - eps)
        dr_dl = (r_plus - r_minus) / (2 * eps)

        Phi = self.redshift_function(r)
        Phi_plus = self.redshift_function(r_plus)
        Phi_minus = self.redshift_function(r_minus)
        dPhi_dl = (Phi_plus - Phi_minus) / (2 * eps)

        # Key Christoffel symbols for radial motion
        # Gamma^t_tl = dPhi/dl
        # Gamma^l_tt = e^(2Phi) * dPhi/dl
        # Gamma^l_theta_theta = -r * dr/dl
        # Gamma^theta_l_theta = (1/r) * dr/dl

        return {
            'Gamma_t_tl': dPhi_dl,
            'Gamma_l_tt': np.exp(2 * Phi) * dPhi_dl,
            'Gamma_l_theta_theta': -r * dr_dl,
            'Gamma_theta_l_theta': dr_dl / r if r > 0 else 0
        }

    def energy_density(self, l: np.ndarray) -> np.ndarray:
        """
        Compute the energy density required by Einstein's equations.

        For the wormhole to exist, we need:
            rho = (1/8*pi) * (b'/r^2 - 2*(r-b)*Phi'/r^2)

        For Ellis wormhole with Phi=0:
            rho = -r_0^2 / (8*pi*r^4)

        This is NEGATIVE - exotic matter!
        """
        r = self.r_from_l(l)

        # For Ellis wormhole
        rho = -self.r0**2 / (8 * np.pi * r**4)

        return rho

    def embedding_diagram(self, l_max: float = 5.0, n_points: int = 200) -> Tuple[np.ndarray, np.ndarray]:
        """
        Compute the embedding diagram (z vs r) for visualization.

        The wormhole geometry can be embedded in 3D Euclidean space.
        z(r) = integral of sqrt(b/(r-b)) dr

        For Ellis wormhole: z = r_0 * arccosh(r/r_0)
        """
        l = np.linspace(-l_max, l_max, n_points)
        r = self.r_from_l(l)

        # Ellis embedding: z = r_0 * arccosh(r/r_0), but we want it symmetric
        # Actually just use l itself as the vertical coordinate
        z = l

        return r, z


class Geodesic:
    """
    Solve geodesic equations in wormhole spacetime.

    A geodesic is the path of a freely falling particle (or light ray).
    """

    def __init__(self, metric: MorrisThorneMetric):
        self.metric = metric

    def integrate(self, initial_state: dict, proper_time_span: Tuple[float, float],
                  n_steps: int = 1000, is_null: bool = False) -> dict:
        """
        Integrate geodesic equation.

        initial_state: {t, l, theta, phi, dt_dtau, dl_dtau, dtheta_dtau, dphi_dtau}
        is_null: True for light rays (null geodesics)

        Uses simple RK4 integration.
        """
        tau_span = proper_time_span
        dtau = (tau_span[1] - tau_span[0]) / n_steps

        # State vector: [t, l, theta, phi, p_t, p_l, p_theta, p_phi]
        # where p_mu = g_mu_nu * dx^nu/dtau (covariant momenta)

        state = np.array([
            initial_state['t'],
            initial_state['l'],
            initial_state.get('theta', np.pi/2),
            initial_state.get('phi', 0),
            initial_state['dt_dtau'],
            initial_state['dl_dtau'],
            initial_state.get('dtheta_dtau', 0),
            initial_state.get('dphi_dtau', 0)
        ])

        trajectory = [state.copy()]

        for _ in range(n_steps):
            # RK4 step
            k1 = self._geodesic_rhs(state)
            k2 = self._geodesic_rhs(state + 0.5 * dtau * k1)
            k3 = self._geodesic_rhs(state + 0.5 * dtau * k2)
            k4 = self._geodesic_rhs(state + dtau * k3)

            state = state + (dtau / 6) * (k1 + 2*k2 + 2*k3 + k4)
            trajectory.append(state.copy())

        trajectory = np.array(trajectory)

        return {
            'tau': np.linspace(tau_span[0], tau_span[1], n_steps + 1),
            't': trajectory[:, 0],
            'l': trajectory[:, 1],
            'theta': trajectory[:, 2],
            'phi': trajectory[:, 3],
            'dt_dtau': trajectory[:, 4],
            'dl_dtau': trajectory[:, 5],
            'dtheta_dtau': trajectory[:, 6],
            'dphi_dtau': trajectory[:, 7],
            'r': self.metric.r_from_l(trajectory[:, 1])
        }

    def _geodesic_rhs(self, state: np.ndarray) -> np.ndarray:
        """
        Right-hand side of geodesic equation.

        dx^mu/dtau = u^mu
        du^mu/dtau = -Gamma^mu_nu_rho * u^nu * u^rho
        """
        t, l, theta, phi, u_t, u_l, u_theta, u_phi = state

        # Get Christoffel symbols
        Gamma = self.metric.christoffel_symbols(l)

        # Geodesic acceleration
        # For equatorial plane (theta = pi/2), simplified:
        du_t = -2 * Gamma['Gamma_t_tl'] * u_t * u_l
        du_l = -Gamma['Gamma_l_tt'] * u_t**2 - Gamma['Gamma_l_theta_theta'] * (u_theta**2 + u_phi**2)
        du_theta = -2 * Gamma['Gamma_theta_l_theta'] * u_l * u_theta
        du_phi = -2 * Gamma['Gamma_theta_l_theta'] * u_l * u_phi  # Same coefficient for phi

        return np.array([u_t, u_l, u_theta, u_phi, du_t, du_l, du_theta, du_phi])


def visualize_wormhole(metric: MorrisThorneMetric, save_path: str = None):
    """Create embedding diagram visualization."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d import Axes3D

    # Get embedding
    l = np.linspace(-5, 5, 200)
    r = metric.r_from_l(l)

    # Create surface of revolution
    phi = np.linspace(0, 2*np.pi, 100)
    L, PHI = np.meshgrid(l, phi)
    R = metric.r_from_l(L)

    X = R * np.cos(PHI)
    Y = R * np.sin(PHI)
    Z = L  # proper distance as vertical coordinate

    fig = plt.figure(figsize=(12, 5))

    # 3D embedding
    ax1 = fig.add_subplot(121, projection='3d')
    ax1.plot_surface(X, Y, Z, cmap='viridis', alpha=0.8)
    ax1.set_xlabel('X')
    ax1.set_ylabel('Y')
    ax1.set_zlabel('Proper distance l')
    ax1.set_title('Wormhole Embedding Diagram')

    # 2D cross-section
    ax2 = fig.add_subplot(122)
    ax2.plot(r, l, 'b-', linewidth=2, label='r(l)')
    ax2.axhline(y=0, color='r', linestyle='--', label='Throat')
    ax2.axvline(x=metric.r0, color='r', linestyle='--', alpha=0.5)
    ax2.set_xlabel('Radial coordinate r')
    ax2.set_ylabel('Proper distance l')
    ax2.set_title('Wormhole Cross-Section')
    ax2.legend()
    ax2.grid(True, alpha=0.3)

    plt.tight_layout()

    if save_path:
        plt.savefig(save_path, dpi=150)
        print(f"Saved to {save_path}")
    else:
        plt.savefig('wormhole_embedding.png', dpi=150)
        print("Saved to wormhole_embedding.png")

    plt.close()


def demo_traversal():
    """Demonstrate a particle traversing the wormhole."""
    print("="*60)
    print("  WORMHOLE TRAVERSAL SIMULATION")
    print("="*60)

    # Create wormhole
    params = WormholeParams(throat_radius=1.0, redshift_param=0.0)
    metric = MorrisThorneMetric(params)
    geodesic = Geodesic(metric)

    print(f"\nWormhole throat radius: {params.throat_radius}")

    # Initial conditions: particle starting in Universe A, moving toward throat
    initial = {
        't': 0,
        'l': 5.0,           # Start at l = 5 (in Universe A)
        'theta': np.pi/2,   # Equatorial plane
        'phi': 0,
        'dt_dtau': 1.2,     # Time component of 4-velocity
        'dl_dtau': -0.6,    # Moving toward throat (negative l direction)
        'dtheta_dtau': 0,
        'dphi_dtau': 0.1    # Small angular momentum
    }

    print(f"Initial position: l = {initial['l']:.2f} (Universe A)")
    print(f"Initial velocity: dl/dtau = {initial['dl_dtau']:.2f} (toward throat)")

    # Integrate
    result = geodesic.integrate(initial, (0, 20), n_steps=2000)

    # Check if traversal occurred
    l_values = result['l']
    crossed_throat = np.any(l_values < 0)

    print(f"\nFinal position: l = {l_values[-1]:.2f}")
    print(f"Throat crossed: {crossed_throat}")

    if crossed_throat:
        # Find when
        crossing_idx = np.where(l_values < 0)[0][0]
        crossing_tau = result['tau'][crossing_idx]
        print(f"Crossed throat at proper time tau = {crossing_tau:.2f}")
        print("TRAVERSAL SUCCESSFUL - particle entered Universe B")

    # Energy density at throat
    rho_throat = metric.energy_density(np.array([0.0]))[0]
    print(f"\nEnergy density at throat: {rho_throat:.4e}")
    print("(Negative = exotic matter required)")

    # Visualize
    visualize_wormhole(metric)

    return result


if __name__ == "__main__":
    demo_traversal()
